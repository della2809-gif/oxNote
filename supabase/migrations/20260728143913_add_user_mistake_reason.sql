alter table public.notes
  add column if not exists user_mistake_reason text;

comment on column public.notes.user_mistake_reason is
  'The learner''s own explanation of why they got the problem wrong.';
