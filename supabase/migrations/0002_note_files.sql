-- Support uploading a photo or PDF of the original problem alongside a note.

alter table public.notes add column if not exists source_file_url text;

insert into storage.buckets (id, name, public, file_size_limit)
values ('note-files', 'note-files', false, 15728640)
on conflict (id) do nothing;

drop policy if exists "note-files: owner insert" on storage.objects;
create policy "note-files: owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'note-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "note-files: owner select" on storage.objects;
create policy "note-files: owner select" on storage.objects
  for select to authenticated
  using (bucket_id = 'note-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "note-files: owner delete" on storage.objects;
create policy "note-files: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'note-files' and (storage.foldername(name))[1] = auth.uid()::text);
