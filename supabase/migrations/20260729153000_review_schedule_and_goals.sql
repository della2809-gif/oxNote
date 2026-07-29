-- Default review cadence: first review after 3 days, then 7 and 30 day retries.

alter table public.notes
  alter column next_review_at set default (now() + interval '3 days');

update public.notes as note
set next_review_at = note.created_at + interval '3 days'
where note.mastered = false
  and note.next_review_at <= note.created_at + interval '5 minutes'
  and not exists (
    select 1
    from public.review_logs as log
    where log.note_id = note.id
  );

create table if not exists public.review_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  start_date date not null,
  end_date date not null,
  topics text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists review_goals_user_dates_idx
  on public.review_goals (user_id, start_date, end_date);

create index if not exists review_goals_subject_idx
  on public.review_goals (subject_id)
  where subject_id is not null;

drop trigger if exists review_goals_set_updated_at on public.review_goals;
create trigger review_goals_set_updated_at
  before update on public.review_goals
  for each row execute function public.set_updated_at();

alter table public.review_goals enable row level security;

drop policy if exists "review_goals: owner all" on public.review_goals;
create policy "review_goals: owner all" on public.review_goals
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.review_goals to authenticated;
grant all on public.review_goals to service_role;
