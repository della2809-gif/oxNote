-- Paid-service foundation: plans, subscriptions, metered AI usage, admin access,
-- legal consent tracking, and account deletion requests.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.profiles
  add column if not exists email text,
  add column if not exists account_status text not null default 'active',
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists terms_version text,
  add column if not exists privacy_version text;

alter table public.notes
  add column if not exists source_file_size_bytes bigint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notes_source_file_size_bytes_check'
      and conrelid = 'public.notes'::regclass
  ) then
    alter table public.notes
      add constraint notes_source_file_size_bytes_check
      check (source_file_size_bytes is null or source_file_size_bytes >= 0);
  end if;
end
$$;

update storage.buckets
set
  file_size_limit = 15728640,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]
where id = 'note-files';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_account_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_account_status_check
      check (account_status in ('active', 'suspended'));
  end if;
end
$$;

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

create table if not exists public.plans (
  id text primary key,
  name text not null,
  description text not null default '',
  monthly_price_krw integer not null default 0 check (monthly_price_krw >= 0),
  monthly_ai_credits integer not null check (monthly_ai_credits >= 0),
  max_file_bytes bigint not null check (max_file_bytes > 0),
  monthly_storage_bytes bigint not null check (monthly_storage_bytes >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.plans (
  id,
  name,
  description,
  monthly_price_krw,
  monthly_ai_credits,
  max_file_bytes,
  monthly_storage_bytes,
  sort_order
)
values
  ('free', 'Free', '가볍게 시작하는 무료 플랜', 0, 10, 5242880, 52428800, 10),
  ('pro', 'Pro', '꾸준한 학습을 위한 개인 플랜', 9900, 120, 15728640, 1073741824, 20)
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  monthly_price_krw = excluded.monthly_price_krw,
  monthly_ai_credits = excluded.monthly_ai_credits,
  max_file_bytes = excluded.max_file_bytes,
  monthly_storage_bytes = excluded.monthly_storage_bytes,
  sort_order = excluded.sort_order,
  updated_at = now();

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  plan_id text not null references public.plans (id),
  status text not null default 'active',
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('trialing', 'active', 'past_due', 'canceled', 'paused'))
);

create index if not exists subscriptions_plan_id_idx
  on public.subscriptions (plan_id);
create index if not exists subscriptions_status_idx
  on public.subscriptions (status)
  where status in ('trialing', 'active', 'past_due');

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  request_key text not null,
  status text not null default 'reserved',
  units integer not null default 1 check (units > 0),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  estimated_cost_usd numeric(12, 6) check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  unique (user_id, request_key),
  check (kind in ('text_analysis', 'file_analysis')),
  check (status in ('reserved', 'succeeded', 'failed'))
);

create index if not exists usage_events_user_created_idx
  on public.usage_events (user_id, created_at desc);
create index if not exists usage_events_active_month_idx
  on public.usage_events (user_id, created_at)
  where status in ('reserved', 'succeeded');

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'requested',
  reason text,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  check (status in ('requested', 'processing', 'completed', 'canceled'))
);

create unique index if not exists account_deletion_requests_open_user_idx
  on public.account_deletion_requests (user_id)
  where status in ('requested', 'processing');
create index if not exists account_deletion_requests_resolved_by_idx
  on public.account_deletion_requests (resolved_by)
  where resolved_by is not null;

alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage_events enable row level security;
alter table public.account_deletion_requests enable row level security;

drop policy if exists "profiles: owner read" on public.profiles;
create policy "profiles: owner read" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles: owner update" on public.profiles;
create policy "profiles: owner update" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "subjects: owner all" on public.subjects;
create policy "subjects: owner all" on public.subjects
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "notes: owner all" on public.notes;
create policy "notes: owner all" on public.notes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "review_logs: owner all" on public.review_logs;
create policy "review_logs: owner all" on public.review_logs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "note-files: owner insert" on storage.objects;
create policy "note-files: owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'note-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "note-files: owner select" on storage.objects;
create policy "note-files: owner select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'note-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "note-files: owner delete" on storage.objects;
create policy "note-files: owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'note-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "plans: authenticated read" on public.plans;
create policy "plans: authenticated read" on public.plans
  for select to authenticated
  using (is_active = true);

drop policy if exists "subscriptions: owner read" on public.subscriptions;
create policy "subscriptions: owner read" on public.subscriptions
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "usage_events: owner read" on public.usage_events;
create policy "usage_events: owner read" on public.usage_events
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "deletion_requests: owner read" on public.account_deletion_requests;
create policy "deletion_requests: owner read" on public.account_deletion_requests
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "deletion_requests: owner insert" on public.account_deletion_requests;
create policy "deletion_requests: owner insert" on public.account_deletion_requests
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "profiles: admin read" on public.profiles;
create policy "profiles: admin read" on public.profiles
  for select to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "profiles: admin update" on public.profiles;
create policy "profiles: admin update" on public.profiles
  for update to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "subscriptions: admin all" on public.subscriptions;
create policy "subscriptions: admin all" on public.subscriptions
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "usage_events: admin read" on public.usage_events;
create policy "usage_events: admin read" on public.usage_events
  for select to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "deletion_requests: admin all" on public.account_deletion_requests;
create policy "deletion_requests: admin all" on public.account_deletion_requests
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

grant usage on schema public to authenticated;
grant select on public.plans to authenticated;
grant select, insert, update on public.subscriptions to authenticated;
grant select on public.usage_events to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.account_deletion_requests to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    email,
    display_name,
    date_of_birth,
    country_code,
    guardian_required,
    guardian_consent_status,
    terms_accepted_at,
    privacy_accepted_at,
    terms_version,
    privacy_version
  )
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'display_name',
    nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date,
    coalesce(nullif(upper(new.raw_user_meta_data ->> 'country_code'), ''), 'KR'),
    case
      when nullif(new.raw_user_meta_data ->> 'date_of_birth', '') is null then false
      when coalesce(nullif(upper(new.raw_user_meta_data ->> 'country_code'), ''), 'KR') = 'KR'
        then nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date
          > current_date - interval '19 years'
      else nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date
        > current_date - interval '18 years'
    end,
    case
      when nullif(new.raw_user_meta_data ->> 'date_of_birth', '') is null then 'not_required'
      when coalesce(nullif(upper(new.raw_user_meta_data ->> 'country_code'), ''), 'KR') = 'KR'
        and nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date
          > current_date - interval '19 years'
        then 'pending'
      when coalesce(nullif(upper(new.raw_user_meta_data ->> 'country_code'), ''), 'KR') <> 'KR'
        and nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date
          > current_date - interval '18 years'
        then 'pending'
      else 'not_required'
    end,
    nullif(new.raw_user_meta_data ->> 'terms_accepted_at', '')::timestamptz,
    nullif(new.raw_user_meta_data ->> 'privacy_accepted_at', '')::timestamptz,
    new.raw_user_meta_data ->> 'terms_version',
    new.raw_user_meta_data ->> 'privacy_version'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    date_of_birth = coalesce(public.profiles.date_of_birth, excluded.date_of_birth),
    country_code = coalesce(public.profiles.country_code, excluded.country_code),
    guardian_required = case
      when public.profiles.date_of_birth is null then excluded.guardian_required
      else public.profiles.guardian_required
    end,
    guardian_consent_status = case
      when public.profiles.date_of_birth is null then excluded.guardian_consent_status
      else public.profiles.guardian_consent_status
    end;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

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
  selected_limit integer;
  current_used integer;
  recent_requests integer;
  selected_status text;
begin
  jwt_role := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
  if jwt_role <> 'service_role' then
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

revoke all on function public.reserve_ai_usage(uuid, text, text) from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid, text, text) to service_role;

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
begin
  jwt_role := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
  if jwt_role <> 'service_role' then
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
    failure_reason = case when target_status = 'failed' then left(target_failure_reason, 500) else null end,
    finalized_at = now()
  where user_id = target_user_id
    and request_key = target_request_key
    and status = 'reserved';
end;
$$;

revoke all on function public.finalize_ai_usage(uuid, text, text, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.finalize_ai_usage(uuid, text, text, integer, integer, text)
  to service_role;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

drop trigger if exists plans_set_updated_at on public.plans;
create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Guardian accounts for minor learners. A guardian relationship is explicit,
-- revocable, permission-scoped, and auditable. Payment credentials remain with
-- the payment provider; the database stores only account relationships.

alter table public.profiles
  add column if not exists date_of_birth date,
  add column if not exists country_code text,
  add column if not exists guardian_required boolean not null default false,
  add column if not exists guardian_consent_status text not null default 'not_required',
  add column if not exists guardian_consent_granted_at timestamptz,
  add column if not exists guardian_consent_granted_by uuid references auth.users (id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_country_code_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_country_code_check
      check (country_code is null or country_code ~ '^[A-Z]{2}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_date_of_birth_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_date_of_birth_check
      check (date_of_birth is null or date_of_birth <= current_date);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_guardian_consent_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_guardian_consent_status_check
      check (
        guardian_consent_status in (
          'not_required',
          'pending',
          'granted',
          'withdrawn'
        )
      );
  end if;
end
$$;

create index if not exists profiles_guardian_consent_granted_by_idx
  on public.profiles (guardian_consent_granted_by)
  where guardian_consent_granted_by is not null;

create index if not exists profiles_guardian_required_idx
  on public.profiles (created_at)
  where guardian_required = true
    and guardian_consent_status <> 'granted';

create table if not exists public.guardian_links (
  id uuid primary key default gen_random_uuid(),
  child_user_id uuid not null references auth.users (id) on delete cascade,
  guardian_user_id uuid not null references auth.users (id) on delete cascade,
  relationship text not null default 'parent',
  status text not null default 'pending',
  can_view_learning boolean not null default true,
  can_manage_account boolean not null default true,
  can_manage_billing boolean not null default true,
  invited_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (child_user_id, guardian_user_id),
  check (child_user_id <> guardian_user_id),
  check (relationship in ('parent', 'legal_guardian', 'other')),
  check (status in ('pending', 'active', 'rejected', 'revoked'))
);

create index if not exists guardian_links_guardian_status_idx
  on public.guardian_links (guardian_user_id, status, child_user_id);
create index if not exists guardian_links_child_status_idx
  on public.guardian_links (child_user_id, status, guardian_user_id);
create index if not exists guardian_links_invited_by_idx
  on public.guardian_links (invited_by)
  where invited_by is not null;

create table if not exists public.guardian_invitations (
  id uuid primary key default gen_random_uuid(),
  child_user_id uuid not null references auth.users (id) on delete cascade,
  guardian_email text not null,
  relationship text not null default 'parent',
  token_hash text not null unique,
  status text not null default 'pending',
  invited_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (guardian_email = lower(guardian_email)),
  check (relationship in ('parent', 'legal_guardian', 'other')),
  check (status in ('pending', 'accepted', 'expired', 'revoked'))
);

create unique index if not exists guardian_invitations_pending_child_email_idx
  on public.guardian_invitations (child_user_id, guardian_email)
  where status = 'pending';
create index if not exists guardian_invitations_expiry_idx
  on public.guardian_invitations (expires_at)
  where status = 'pending';
create index if not exists guardian_invitations_invited_by_idx
  on public.guardian_invitations (invited_by);
create index if not exists guardian_invitations_accepted_by_idx
  on public.guardian_invitations (accepted_by)
  where accepted_by is not null;

create table if not exists public.guardian_activity_logs (
  id uuid primary key default gen_random_uuid(),
  guardian_link_id uuid references public.guardian_links (id) on delete set null,
  actor_user_id uuid references auth.users (id) on delete set null,
  child_user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists guardian_activity_logs_link_idx
  on public.guardian_activity_logs (guardian_link_id, created_at desc)
  where guardian_link_id is not null;
create index if not exists guardian_activity_logs_actor_idx
  on public.guardian_activity_logs (actor_user_id, created_at desc)
  where actor_user_id is not null;
create index if not exists guardian_activity_logs_child_idx
  on public.guardian_activity_logs (child_user_id, created_at desc);

alter table public.subscriptions
  add column if not exists payer_user_id uuid references auth.users (id) on delete restrict,
  add column if not exists guardian_link_id uuid references public.guardian_links (id) on delete set null;

update public.subscriptions
set payer_user_id = user_id
where payer_user_id is null;

alter table public.subscriptions
  alter column payer_user_id set not null;

create index if not exists subscriptions_payer_user_id_idx
  on public.subscriptions (payer_user_id);
create index if not exists subscriptions_guardian_link_id_idx
  on public.subscriptions (guardian_link_id)
  where guardian_link_id is not null;

alter table public.guardian_links enable row level security;
alter table public.guardian_invitations enable row level security;
alter table public.guardian_activity_logs enable row level security;

create or replace function private.guardian_has_permission(
  target_child_user_id uuid,
  target_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.guardian_links link
      where link.child_user_id = target_child_user_id
        and link.guardian_user_id = (select auth.uid())
        and link.status = 'active'
        and case target_permission
          when 'learning' then link.can_view_learning
          when 'account' then link.can_manage_account
          when 'billing' then link.can_manage_billing
          else false
        end
    );
$$;

revoke all on function private.guardian_has_permission(uuid, text)
  from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;
grant execute on function private.guardian_has_permission(uuid, text)
  to authenticated;

drop policy if exists "guardian_links: participants read" on public.guardian_links;
create policy "guardian_links: participants read" on public.guardian_links
  for select to authenticated
  using (
    child_user_id = (select auth.uid())
    or guardian_user_id = (select auth.uid())
  );

drop policy if exists "guardian_links: admin all" on public.guardian_links;
create policy "guardian_links: admin all" on public.guardian_links
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "guardian_invitations: admin all" on public.guardian_invitations;
create policy "guardian_invitations: admin all" on public.guardian_invitations
  for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "guardian_activity_logs: participants read" on public.guardian_activity_logs;
create policy "guardian_activity_logs: participants read" on public.guardian_activity_logs
  for select to authenticated
  using (
    child_user_id = (select auth.uid())
    or (select private.guardian_has_permission(child_user_id, 'account'))
  );

drop policy if exists "guardian_activity_logs: admin read" on public.guardian_activity_logs;
create policy "guardian_activity_logs: admin read" on public.guardian_activity_logs
  for select to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "profiles: guardian read" on public.profiles;
create policy "profiles: guardian read" on public.profiles
  for select to authenticated
  using (
    (select private.guardian_has_permission(id, 'learning'))
    or (select private.guardian_has_permission(id, 'account'))
  );

drop policy if exists "subjects: guardian read" on public.subjects;
create policy "subjects: guardian read" on public.subjects
  for select to authenticated
  using ((select private.guardian_has_permission(user_id, 'learning')));

drop policy if exists "notes: guardian read" on public.notes;
create policy "notes: guardian read" on public.notes
  for select to authenticated
  using ((select private.guardian_has_permission(user_id, 'learning')));

drop policy if exists "review_logs: guardian read" on public.review_logs;
create policy "review_logs: guardian read" on public.review_logs
  for select to authenticated
  using ((select private.guardian_has_permission(user_id, 'learning')));

drop policy if exists "usage_events: guardian read" on public.usage_events;
create policy "usage_events: guardian read" on public.usage_events
  for select to authenticated
  using ((select private.guardian_has_permission(user_id, 'learning')));

drop policy if exists "subscriptions: payer read" on public.subscriptions;
create policy "subscriptions: payer read" on public.subscriptions
  for select to authenticated
  using (
    payer_user_id = (select auth.uid())
    or (select private.guardian_has_permission(user_id, 'billing'))
  );

drop policy if exists "deletion_requests: guardian read" on public.account_deletion_requests;
create policy "deletion_requests: guardian read" on public.account_deletion_requests
  for select to authenticated
  using ((select private.guardian_has_permission(user_id, 'account')));

drop policy if exists "note-files: guardian select" on storage.objects;
create policy "note-files: guardian select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'note-files'
    and exists (
      select 1
      from public.guardian_links link
      where link.child_user_id::text = (storage.foldername(name))[1]
        and link.guardian_user_id = (select auth.uid())
        and link.status = 'active'
        and link.can_view_learning = true
    )
  );

drop trigger if exists guardian_links_set_updated_at on public.guardian_links;
create trigger guardian_links_set_updated_at
  before update on public.guardian_links
  for each row execute function public.set_updated_at();

-- Consolidate permissive policies by action so PostgreSQL evaluates one policy
-- per table/action while preserving owner, guardian, and admin access.

drop policy if exists "profiles: owner read" on public.profiles;
drop policy if exists "profiles: owner update" on public.profiles;
drop policy if exists "profiles: admin read" on public.profiles;
drop policy if exists "profiles: admin update" on public.profiles;
drop policy if exists "profiles: guardian read" on public.profiles;
drop policy if exists "profiles: authorized read" on public.profiles;
drop policy if exists "profiles: authorized update" on public.profiles;
create policy "profiles: authorized read" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.guardian_has_permission(id, 'learning'))
    or (select private.guardian_has_permission(id, 'account'))
    or (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  );
create policy "profiles: authorized update" on public.profiles
  for update to authenticated
  using (
    id = (select auth.uid())
    or (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  )
  with check (
    id = (select auth.uid())
    or (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  );

drop policy if exists "subjects: owner all" on public.subjects;
drop policy if exists "subjects: guardian read" on public.subjects;
drop policy if exists "subjects: authorized read" on public.subjects;
drop policy if exists "subjects: owner insert" on public.subjects;
drop policy if exists "subjects: owner update" on public.subjects;
drop policy if exists "subjects: owner delete" on public.subjects;
create policy "subjects: authorized read" on public.subjects
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.guardian_has_permission(user_id, 'learning'))
  );
create policy "subjects: owner insert" on public.subjects
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "subjects: owner update" on public.subjects
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "subjects: owner delete" on public.subjects
  for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "notes: owner all" on public.notes;
drop policy if exists "notes: guardian read" on public.notes;
drop policy if exists "notes: authorized read" on public.notes;
drop policy if exists "notes: owner insert" on public.notes;
drop policy if exists "notes: owner update" on public.notes;
drop policy if exists "notes: owner delete" on public.notes;
create policy "notes: authorized read" on public.notes
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.guardian_has_permission(user_id, 'learning'))
  );
create policy "notes: owner insert" on public.notes
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "notes: owner update" on public.notes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "notes: owner delete" on public.notes
  for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "review_logs: owner all" on public.review_logs;
drop policy if exists "review_logs: guardian read" on public.review_logs;
drop policy if exists "review_logs: authorized read" on public.review_logs;
drop policy if exists "review_logs: owner insert" on public.review_logs;
drop policy if exists "review_logs: owner update" on public.review_logs;
drop policy if exists "review_logs: owner delete" on public.review_logs;
create policy "review_logs: authorized read" on public.review_logs
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.guardian_has_permission(user_id, 'learning'))
  );
create policy "review_logs: owner insert" on public.review_logs
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "review_logs: owner update" on public.review_logs
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "review_logs: owner delete" on public.review_logs
  for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "usage_events: owner read" on public.usage_events;
drop policy if exists "usage_events: admin read" on public.usage_events;
drop policy if exists "usage_events: guardian read" on public.usage_events;
drop policy if exists "usage_events: authorized read" on public.usage_events;
create policy "usage_events: authorized read" on public.usage_events
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.guardian_has_permission(user_id, 'learning'))
    or (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  );

drop policy if exists "subscriptions: owner read" on public.subscriptions;
drop policy if exists "subscriptions: admin all" on public.subscriptions;
drop policy if exists "subscriptions: payer read" on public.subscriptions;
drop policy if exists "subscriptions: authorized read" on public.subscriptions;
drop policy if exists "subscriptions: admin insert" on public.subscriptions;
drop policy if exists "subscriptions: admin update" on public.subscriptions;
drop policy if exists "subscriptions: admin delete" on public.subscriptions;
create policy "subscriptions: authorized read" on public.subscriptions
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or payer_user_id = (select auth.uid())
    or (select private.guardian_has_permission(user_id, 'billing'))
    or (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  );
create policy "subscriptions: admin insert" on public.subscriptions
  for insert to authenticated
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
create policy "subscriptions: admin update" on public.subscriptions
  for update to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
create policy "subscriptions: admin delete" on public.subscriptions
  for delete to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "deletion_requests: owner read" on public.account_deletion_requests;
drop policy if exists "deletion_requests: owner insert" on public.account_deletion_requests;
drop policy if exists "deletion_requests: admin all" on public.account_deletion_requests;
drop policy if exists "deletion_requests: guardian read" on public.account_deletion_requests;
drop policy if exists "deletion_requests: authorized read" on public.account_deletion_requests;
drop policy if exists "deletion_requests: authorized insert" on public.account_deletion_requests;
drop policy if exists "deletion_requests: admin update" on public.account_deletion_requests;
drop policy if exists "deletion_requests: admin delete" on public.account_deletion_requests;
create policy "deletion_requests: authorized read" on public.account_deletion_requests
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.guardian_has_permission(user_id, 'account'))
    or (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  );
create policy "deletion_requests: authorized insert" on public.account_deletion_requests
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    or (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  );
create policy "deletion_requests: admin update" on public.account_deletion_requests
  for update to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
create policy "deletion_requests: admin delete" on public.account_deletion_requests
  for delete to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "guardian_links: participants read" on public.guardian_links;
drop policy if exists "guardian_links: admin all" on public.guardian_links;
drop policy if exists "guardian_links: authorized read" on public.guardian_links;
drop policy if exists "guardian_links: admin insert" on public.guardian_links;
drop policy if exists "guardian_links: admin update" on public.guardian_links;
drop policy if exists "guardian_links: admin delete" on public.guardian_links;
create policy "guardian_links: authorized read" on public.guardian_links
  for select to authenticated
  using (
    child_user_id = (select auth.uid())
    or guardian_user_id = (select auth.uid())
    or (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  );
create policy "guardian_links: admin insert" on public.guardian_links
  for insert to authenticated
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
create policy "guardian_links: admin update" on public.guardian_links
  for update to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
create policy "guardian_links: admin delete" on public.guardian_links
  for delete to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "guardian_activity_logs: participants read" on public.guardian_activity_logs;
drop policy if exists "guardian_activity_logs: admin read" on public.guardian_activity_logs;
drop policy if exists "guardian_activity_logs: authorized read" on public.guardian_activity_logs;
create policy "guardian_activity_logs: authorized read" on public.guardian_activity_logs
  for select to authenticated
  using (
    child_user_id = (select auth.uid())
    or (select private.guardian_has_permission(child_user_id, 'account'))
    or (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  );

grant select on public.profiles to authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.subjects to authenticated;
grant select, insert, update, delete on public.notes to authenticated;
grant select, insert, update, delete on public.review_logs to authenticated;
grant select on public.usage_events to authenticated;
grant select, insert, update, delete on public.subscriptions to authenticated;
grant select, insert, update, delete on public.account_deletion_requests to authenticated;
grant select, insert, update, delete on public.guardian_links to authenticated;
grant select on public.guardian_activity_logs to authenticated;

grant all on public.plans to service_role;
grant all on public.subscriptions to service_role;
grant all on public.usage_events to service_role;
grant all on public.account_deletion_requests to service_role;
grant all on public.guardian_links to service_role;
grant all on public.guardian_invitations to service_role;
grant all on public.guardian_activity_logs to service_role;

commit;
