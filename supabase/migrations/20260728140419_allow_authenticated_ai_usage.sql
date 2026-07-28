-- Allow the signed-in application user to reserve and finalize only their own
-- AI usage. Service-role callers remain supported for administration jobs.

create or replace function public.reserve_ai_usage(
  target_user_id uuid,
  target_request_key text,
  target_kind text
)
returns table (
  allowed boolean,
  monthly_limit integer,
  used integer,
  reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  jwt_role text;
  request_user_id uuid;
  selected_limit integer;
  current_used integer;
  recent_requests integer;
  selected_status text;
begin
  jwt_role := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
  request_user_id := auth.uid();

  if jwt_role = 'service_role' then
    null;
  elsif jwt_role = 'authenticated' and request_user_id = target_user_id then
    null;
  else
    raise exception 'not authorized';
  end if;

  if target_user_id is null
    or length(target_request_key) < 8
    or target_kind not in ('text_analysis', 'file_analysis') then
    return query select false, 0, 0, 'invalid_request';
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));

  select p.account_status
  into selected_status
  from public.profiles p
  where p.id = target_user_id;

  if selected_status is distinct from 'active' then
    return query select false, 0, 0, 'account_suspended';
    return;
  end if;

  select coalesce(plan.monthly_ai_credits, free_plan.monthly_ai_credits)
  into selected_limit
  from public.plans free_plan
  left join public.subscriptions s
    on s.user_id = target_user_id
   and s.status in ('trialing', 'active')
  left join public.plans plan
    on plan.id = s.plan_id
   and plan.is_active = true
  where free_plan.id = 'free';

  select count(*)::integer
  into recent_requests
  from public.usage_events e
  where e.user_id = target_user_id
    and e.status in ('reserved', 'succeeded')
    and e.created_at >= now() - interval '10 minutes';

  if recent_requests >= 5 then
    return query select false, selected_limit, 0, 'rate_limited';
    return;
  end if;

  select coalesce(sum(e.units), 0)::integer
  into current_used
  from public.usage_events e
  where e.user_id = target_user_id
    and e.status in ('reserved', 'succeeded')
    and e.created_at >= date_trunc('month', now());

  if exists (
    select 1
    from public.usage_events e
    where e.user_id = target_user_id
      and e.request_key = target_request_key
  ) then
    return query select true, selected_limit, current_used, 'already_reserved';
    return;
  end if;

  if current_used >= selected_limit then
    return query select false, selected_limit, current_used, 'monthly_limit_reached';
    return;
  end if;

  insert into public.usage_events (user_id, kind, request_key)
  values (target_user_id, target_kind, target_request_key);

  return query select true, selected_limit, current_used + 1, 'reserved';
end;
$$;

revoke all on function public.reserve_ai_usage(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid, text, text)
  to authenticated, service_role;

create or replace function public.finalize_ai_usage(
  target_user_id uuid,
  target_request_key text,
  target_status text,
  target_input_tokens integer default null,
  target_output_tokens integer default null,
  target_failure_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  jwt_role text;
  request_user_id uuid;
begin
  jwt_role := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
  request_user_id := auth.uid();

  if jwt_role = 'service_role' then
    null;
  elsif jwt_role = 'authenticated' and request_user_id = target_user_id then
    null;
  else
    raise exception 'not authorized';
  end if;

  if target_status not in ('succeeded', 'failed') then
    raise exception 'invalid status';
  end if;

  update public.usage_events
  set
    status = target_status,
    input_tokens = greatest(target_input_tokens, 0),
    output_tokens = greatest(target_output_tokens, 0),
    failure_reason = case
      when target_status = 'failed' then left(target_failure_reason, 500)
      else null
    end,
    finalized_at = now()
  where user_id = target_user_id
    and request_key = target_request_key
    and status = 'reserved';
end;
$$;

revoke all on function public.finalize_ai_usage(uuid, text, text, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.finalize_ai_usage(uuid, text, text, integer, integer, text)
  to authenticated, service_role;
