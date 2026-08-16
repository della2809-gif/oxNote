begin;

create table if not exists public.ai_evaluation_results (
  id uuid primary key default gen_random_uuid(),
  evaluator_user_id uuid not null references auth.users (id) on delete cascade,
  note_id uuid references public.notes (id) on delete set null,
  test_batch text not null default 'math-46' check (char_length(test_batch) between 1 and 80),
  problem_number integer not null check (problem_number between 1 and 10000),
  analysis_mode text not null check (analysis_mode in ('a', 'b')),
  recognition_status text not null check (recognition_status in ('passed', 'failed', 'unscorable')),
  answer_status text not null check (answer_status in ('passed', 'failed', 'unscorable')),
  solution_status text not null check (solution_status in ('passed', 'partial', 'failed', 'unscorable')),
  notation_status text not null check (notation_status in ('passed', 'failed', 'unscorable')),
  severity text not null check (severity in ('normal', 'minor', 'major', 'critical', 'unscorable')),
  processing_ms integer check (processing_ms is null or processing_ms >= 0),
  estimated_cost_usd numeric(12,6) check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  retry_required boolean not null default false,
  save_blocked boolean not null default false,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (test_batch, problem_number, analysis_mode)
);

create index if not exists ai_evaluation_results_batch_mode_idx
  on public.ai_evaluation_results (test_batch, analysis_mode, problem_number);

alter table public.ai_evaluation_results enable row level security;

drop trigger if exists ai_evaluation_results_set_updated_at on public.ai_evaluation_results;
create trigger ai_evaluation_results_set_updated_at
  before update on public.ai_evaluation_results
  for each row execute function public.set_updated_at();

create policy "ai evaluation: admin read"
  on public.ai_evaluation_results for select to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
create policy "ai evaluation: admin insert"
  on public.ai_evaluation_results for insert to authenticated
  with check (
    evaluator_user_id = (select auth.uid())
    and (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  );
create policy "ai evaluation: admin update"
  on public.ai_evaluation_results for update to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
create policy "ai evaluation: admin delete"
  on public.ai_evaluation_results for delete to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

grant select, insert, update, delete on public.ai_evaluation_results to authenticated;
grant all on public.ai_evaluation_results to service_role;

commit;
