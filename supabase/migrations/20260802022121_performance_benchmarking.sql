-- Paid performance benchmarking foundation: score intake, OCR imports,
-- anonymous cohort aggregates, public/partner calibration, and predictions.

begin;

alter table public.plans
  add column if not exists performance_benchmarking_enabled boolean not null default false;

update public.plans
set performance_benchmarking_enabled = (id <> 'free'), updated_at = now();

create table if not exists public.product_feature_flags (
  key text primary key,
  name text not null,
  description text not null default '',
  member_enabled boolean not null default false,
  admin_preview_enabled boolean not null default true,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.product_feature_flags (
  key, name, description, member_enabled, admin_preview_enabled
)
values (
  'performance_benchmarking',
  '성적·오답 비교 분석',
  '유사 성적군과 지역·전국 오답 영역을 비교하고 예상 점수를 제공합니다.',
  false,
  true
)
on conflict (key) do nothing;

create table if not exists public.performance_consents (
  user_id uuid primary key references auth.users (id) on delete cascade,
  benchmark_enabled boolean not null default false,
  regional_comparison_enabled boolean not null default false,
  score_report_ocr_enabled boolean not null default false,
  consent_version text,
  consented_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exam_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  subject_name text not null check (char_length(subject_name) between 1 and 80),
  school_level text not null,
  grade_level text not null check (char_length(grade_level) between 1 and 40),
  region_code text not null default 'KR' check (char_length(region_code) between 2 and 20),
  exam_type text not null check (char_length(exam_type) between 1 and 60),
  exam_name text not null check (char_length(exam_name) between 1 and 120),
  exam_date date not null,
  raw_score numeric(7,2) not null,
  max_score numeric(7,2) not null default 100,
  question_count integer,
  wrong_answer_count integer,
  score_percent numeric(5,2) generated always as (
    round((raw_score / nullif(max_score, 0)) * 100, 2)
  ) stored,
  wrong_rate numeric(5,2) generated always as (
    case
      when question_count is null or wrong_answer_count is null then null
      else round((wrong_answer_count::numeric / nullif(question_count, 0)) * 100, 2)
    end
  ) stored,
  exam_average_score numeric(7,2),
  percentile_rank numeric(5,2),
  rank_position integer,
  examinee_count integer,
  source_type text not null default 'manual',
  verification_status text not null default 'self_reported',
  report_file_path text,
  extracted_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (school_level in ('elementary', 'middle', 'high', 'university', 'adult')),
  check (raw_score >= 0 and max_score > 0 and raw_score <= max_score),
  check (question_count is null or question_count > 0),
  check (wrong_answer_count is null or wrong_answer_count >= 0),
  check (wrong_answer_count is null or question_count is null or wrong_answer_count <= question_count),
  check (exam_average_score is null or (exam_average_score >= 0 and exam_average_score <= max_score)),
  check (percentile_rank is null or (percentile_rank >= 0 and percentile_rank <= 100)),
  check (rank_position is null or rank_position > 0),
  check (examinee_count is null or examinee_count > 0),
  check (rank_position is null or examinee_count is null or rank_position <= examinee_count),
  check (source_type in ('manual', 'ocr', 'integration')),
  check (verification_status in ('self_reported', 'ai_extracted', 'verified')),
  check (jsonb_typeof(extracted_payload) = 'object')
);

create index if not exists exam_results_user_date_idx
  on public.exam_results (user_id, exam_date desc);
create index if not exists exam_results_cohort_idx
  on public.exam_results (
    school_level, grade_level, subject_name, exam_type, region_code, exam_date
  );
create index if not exists exam_results_subject_idx
  on public.exam_results (subject_id)
  where subject_id is not null;

create table if not exists public.exam_result_notes (
  exam_result_id uuid not null references public.exam_results (id) on delete cascade,
  note_id uuid not null references public.notes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (exam_result_id, note_id)
);

create index if not exists exam_result_notes_user_idx
  on public.exam_result_notes (user_id, exam_result_id);
create index if not exists exam_result_notes_note_idx
  on public.exam_result_notes (note_id);

create table if not exists public.score_report_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  status text not null default 'queued',
  extracted_payload jsonb not null default '{}'::jsonb,
  failure_reason text,
  exam_result_id uuid references public.exam_results (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (status in ('queued', 'processing', 'completed', 'failed')),
  check (jsonb_typeof(extracted_payload) = 'object')
);

create index if not exists score_report_imports_user_created_idx
  on public.score_report_imports (user_id, created_at desc);
create index if not exists score_report_imports_status_idx
  on public.score_report_imports (status, created_at)
  where status in ('queued', 'processing');

create table if not exists public.benchmark_sources (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  provider_type text not null,
  source_url text,
  license_note text,
  data_period_start date,
  data_period_end date,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provider_type in ('internal', 'public', 'partner')),
  check (jsonb_typeof(metadata) = 'object'),
  check (data_period_end is null or data_period_start is null or data_period_end >= data_period_start)
);

insert into public.benchmark_sources (code, name, provider_type, is_active)
values ('xonote_internal', 'xonote 익명 이용 통계', 'internal', true)
on conflict (code) do nothing;

create table if not exists public.benchmark_cohorts (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.benchmark_sources (id) on delete restrict,
  school_level text not null,
  grade_level text not null,
  subject_name text not null,
  exam_type text not null,
  region_scope text not null,
  region_code text not null default 'KR',
  score_band_low numeric(5,2) not null,
  score_band_high numeric(5,2) not null,
  period_start date not null,
  period_end date not null,
  sample_size integer not null default 0,
  average_score numeric(5,2),
  average_wrong_rate numeric(5,2),
  percentile_stats jsonb not null default '{}'::jsonb,
  error_breakdown jsonb not null default '{}'::jsonb,
  concept_breakdown jsonb not null default '{}'::jsonb,
  confidence_level text not null default 'insufficient',
  refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (school_level in ('elementary', 'middle', 'high', 'university', 'adult')),
  check (region_scope in ('national', 'region')),
  check (score_band_low >= 0 and score_band_high <= 100 and score_band_high > score_band_low),
  check (period_end >= period_start),
  check (sample_size >= 0),
  check (average_score is null or (average_score >= 0 and average_score <= 100)),
  check (average_wrong_rate is null or (average_wrong_rate >= 0 and average_wrong_rate <= 100)),
  check (confidence_level in ('insufficient', 'low', 'medium', 'high')),
  check (jsonb_typeof(percentile_stats) = 'object'),
  check (jsonb_typeof(error_breakdown) = 'object'),
  check (jsonb_typeof(concept_breakdown) = 'object'),
  unique (
    source_id, school_level, grade_level, subject_name, exam_type,
    region_scope, region_code, score_band_low, score_band_high, period_start, period_end
  )
);

create index if not exists benchmark_cohorts_lookup_idx
  on public.benchmark_cohorts (
    school_level, grade_level, subject_name, exam_type,
    region_scope, region_code, score_band_low, score_band_high, period_end desc
  );
create index if not exists benchmark_cohorts_source_idx
  on public.benchmark_cohorts (source_id, refreshed_at desc);

create table if not exists public.performance_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exam_result_id uuid not null references public.exam_results (id) on delete cascade,
  national_cohort_id uuid references public.benchmark_cohorts (id) on delete set null,
  regional_cohort_id uuid references public.benchmark_cohorts (id) on delete set null,
  national_percentile numeric(5,2),
  regional_percentile numeric(5,2),
  personal_wrong_rate numeric(5,2),
  comparison_payload jsonb not null default '{}'::jsonb,
  predicted_score_low numeric(5,2),
  predicted_score_high numeric(5,2),
  prediction_confidence text not null default 'insufficient',
  model_version text not null default 'benchmark-v1',
  generated_at timestamptz not null default now(),
  check (national_percentile is null or (national_percentile >= 0 and national_percentile <= 100)),
  check (regional_percentile is null or (regional_percentile >= 0 and regional_percentile <= 100)),
  check (personal_wrong_rate is null or (personal_wrong_rate >= 0 and personal_wrong_rate <= 100)),
  check (predicted_score_low is null or (predicted_score_low >= 0 and predicted_score_low <= 100)),
  check (predicted_score_high is null or (predicted_score_high >= 0 and predicted_score_high <= 100)),
  check (predicted_score_high is null or predicted_score_low is null or predicted_score_high >= predicted_score_low),
  check (prediction_confidence in ('insufficient', 'low', 'medium', 'high')),
  check (jsonb_typeof(comparison_payload) = 'object'),
  unique (exam_result_id)
);

create index if not exists performance_reports_user_generated_idx
  on public.performance_reports (user_id, generated_at desc);

drop trigger if exists product_feature_flags_set_updated_at on public.product_feature_flags;
create trigger product_feature_flags_set_updated_at
  before update on public.product_feature_flags
  for each row execute function public.set_updated_at();
drop trigger if exists performance_consents_set_updated_at on public.performance_consents;
create trigger performance_consents_set_updated_at
  before update on public.performance_consents
  for each row execute function public.set_updated_at();
drop trigger if exists exam_results_set_updated_at on public.exam_results;
create trigger exam_results_set_updated_at
  before update on public.exam_results
  for each row execute function public.set_updated_at();
drop trigger if exists benchmark_sources_set_updated_at on public.benchmark_sources;
create trigger benchmark_sources_set_updated_at
  before update on public.benchmark_sources
  for each row execute function public.set_updated_at();

alter table public.product_feature_flags enable row level security;
alter table public.performance_consents enable row level security;
alter table public.exam_results enable row level security;
alter table public.exam_result_notes enable row level security;
alter table public.score_report_imports enable row level security;
alter table public.benchmark_sources enable row level security;
alter table public.benchmark_cohorts enable row level security;
alter table public.performance_reports enable row level security;

create policy "feature_flags: authenticated read" on public.product_feature_flags
  for select to authenticated using (true);
create policy "feature_flags: admin insert" on public.product_feature_flags
  for insert to authenticated
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
create policy "feature_flags: admin update" on public.product_feature_flags
  for update to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create policy "performance_consents: authorized read" on public.performance_consents
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  );
create policy "performance_consents: owner insert" on public.performance_consents
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "performance_consents: owner update" on public.performance_consents
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "exam_results: authorized read" on public.exam_results
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.guardian_has_permission(user_id, 'learning'))
    or (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  );
create policy "exam_results: owner insert" on public.exam_results
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "exam_results: owner update" on public.exam_results
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "exam_results: owner delete" on public.exam_results
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "exam_result_notes: authorized read" on public.exam_result_notes
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.guardian_has_permission(user_id, 'learning'))
    or (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  );
create policy "exam_result_notes: owner insert" on public.exam_result_notes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "exam_result_notes: owner delete" on public.exam_result_notes
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "score_report_imports: authorized read" on public.score_report_imports
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  );
create policy "score_report_imports: owner insert" on public.score_report_imports
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "score_report_imports: owner update" on public.score_report_imports
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "benchmark_sources: paid aggregate read" on public.benchmark_sources
  for select to authenticated
  using (
    (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
    or exists (
      select 1 from public.subscriptions subscription
      join public.plans plan on plan.id = subscription.plan_id
      where subscription.user_id = (select auth.uid())
        and subscription.status in ('trialing', 'active')
        and plan.performance_benchmarking_enabled = true
    )
  );
create policy "benchmark_sources: admin insert" on public.benchmark_sources
  for insert to authenticated
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
create policy "benchmark_sources: admin update" on public.benchmark_sources
  for update to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create policy "benchmark_cohorts: paid aggregate read" on public.benchmark_cohorts
  for select to authenticated
  using (
    (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
    or (
      sample_size >= 30
      and exists (
        select 1 from public.subscriptions subscription
        join public.plans plan on plan.id = subscription.plan_id
        where subscription.user_id = (select auth.uid())
          and subscription.status in ('trialing', 'active')
          and plan.performance_benchmarking_enabled = true
      )
    )
  );
create policy "benchmark_cohorts: admin insert" on public.benchmark_cohorts
  for insert to authenticated
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
create policy "benchmark_cohorts: admin update" on public.benchmark_cohorts
  for update to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
create policy "benchmark_cohorts: admin delete" on public.benchmark_cohorts
  for delete to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

create policy "performance_reports: authorized read" on public.performance_reports
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.guardian_has_permission(user_id, 'learning'))
    or (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  );
create policy "performance_reports: admin insert" on public.performance_reports
  for insert to authenticated
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
create policy "performance_reports: admin update" on public.performance_reports
  for update to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

grant select on public.product_feature_flags to authenticated;
grant insert, update on public.product_feature_flags to authenticated;
grant select, insert, update on public.performance_consents to authenticated;
grant select, insert, update, delete on public.exam_results to authenticated;
grant select, insert, delete on public.exam_result_notes to authenticated;
grant select, insert, update on public.score_report_imports to authenticated;
grant select, insert, update on public.benchmark_sources to authenticated;
grant select, insert, update, delete on public.benchmark_cohorts to authenticated;
grant select, insert, update on public.performance_reports to authenticated;

grant all on public.product_feature_flags to service_role;
grant all on public.performance_consents to service_role;
grant all on public.exam_results to service_role;
grant all on public.exam_result_notes to service_role;
grant all on public.score_report_imports to service_role;
grant all on public.benchmark_sources to service_role;
grant all on public.benchmark_cohorts to service_role;
grant all on public.performance_reports to service_role;

commit;
