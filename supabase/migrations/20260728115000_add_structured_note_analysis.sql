-- Store structured AI tutoring output and an optional student-solution file.

alter table public.notes
  add column if not exists ai_details jsonb not null default '{}'::jsonb,
  add column if not exists student_solution_file_url text,
  add column if not exists student_solution_file_size_bytes bigint;

alter table public.notes
  drop constraint if exists notes_ai_details_object_check,
  add constraint notes_ai_details_object_check
    check (jsonb_typeof(ai_details) = 'object'),
  drop constraint if exists notes_student_solution_file_size_nonnegative,
  add constraint notes_student_solution_file_size_nonnegative
    check (
      student_solution_file_size_bytes is null
      or student_solution_file_size_bytes >= 0
    );
