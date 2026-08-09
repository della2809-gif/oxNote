-- Per-user AI analysis cache. Common/public cache can be added later after
-- common and personalized model outputs are split into separate contracts.

begin;

create table if not exists public.ai_analysis_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cache_key text not null check (char_length(cache_key) = 64),
  kind text not null check (kind in ('text_analysis', 'file_analysis')),
  model text not null,
  analysis_version text not null,
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, cache_key)
);

create index if not exists ai_analysis_cache_lookup_idx
  on public.ai_analysis_cache (user_id, cache_key, expires_at desc);
create index if not exists ai_analysis_cache_expiry_idx
  on public.ai_analysis_cache (expires_at);

-- User-facing note list and monthly storage checks filter by owner and sort/range
-- by time. Compound indexes avoid a growing per-user sort/scan.
create index if not exists notes_user_created_at_idx
  on public.notes (user_id, created_at desc);
create index if not exists notes_user_subject_created_at_idx
  on public.notes (user_id, subject_id, created_at desc);

alter table public.ai_analysis_cache enable row level security;

drop policy if exists "ai_analysis_cache: owner read" on public.ai_analysis_cache;
create policy "ai_analysis_cache: owner read" on public.ai_analysis_cache
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "ai_analysis_cache: owner insert" on public.ai_analysis_cache;
create policy "ai_analysis_cache: owner insert" on public.ai_analysis_cache
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "ai_analysis_cache: owner update" on public.ai_analysis_cache;
create policy "ai_analysis_cache: owner update" on public.ai_analysis_cache
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "ai_analysis_cache: owner delete" on public.ai_analysis_cache;
create policy "ai_analysis_cache: owner delete" on public.ai_analysis_cache
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.ai_analysis_cache to authenticated;
grant all on public.ai_analysis_cache to service_role;

drop trigger if exists ai_analysis_cache_set_updated_at on public.ai_analysis_cache;
create trigger ai_analysis_cache_set_updated_at
  before update on public.ai_analysis_cache
  for each row execute function public.set_updated_at();

commit;
