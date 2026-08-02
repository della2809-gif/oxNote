create table if not exists public.support_inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null default 'service',
  subject text not null,
  message text not null,
  status text not null default 'received',
  email_notification_status text not null default 'pending',
  email_notification_id text,
  email_notification_error text,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  check (category in ('service', 'account', 'billing', 'technical', 'other')),
  check (status in ('received', 'in_progress', 'answered', 'closed')),
  check (email_notification_status in ('pending', 'sent', 'failed', 'not_configured')),
  check (char_length(subject) between 2 and 120),
  check (char_length(message) between 10 and 5000)
);

create index if not exists support_inquiries_user_requested_idx
  on public.support_inquiries (user_id, requested_at desc);
create index if not exists support_inquiries_open_requested_idx
  on public.support_inquiries (status, requested_at)
  where status in ('received', 'in_progress');

alter table public.support_inquiries enable row level security;

drop policy if exists "support inquiries: owner read" on public.support_inquiries;
create policy "support inquiries: owner read" on public.support_inquiries
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "support inquiries: owner insert" on public.support_inquiries;
create policy "support inquiries: owner insert" on public.support_inquiries
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "support inquiries: admin read" on public.support_inquiries;
create policy "support inquiries: admin read" on public.support_inquiries
  for select to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "support inquiries: admin update" on public.support_inquiries;
create policy "support inquiries: admin update" on public.support_inquiries
  for update to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "support inquiries: admin delete" on public.support_inquiries;
create policy "support inquiries: admin delete" on public.support_inquiries
  for delete to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.support_inquiries to authenticated;
grant all on public.support_inquiries to service_role;
