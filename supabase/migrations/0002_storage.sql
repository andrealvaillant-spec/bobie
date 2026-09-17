-- Deux seaux privés : les rushs déposés, et ce que Bobie rend.
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('rushes',      'rushes',      false, 5368709120),   -- 5 Go par fichier
  ('deliverables','deliverables', false, 1073741824)   -- 1 Go par fichier
on conflict (id) do nothing;

-- Un fichier est rangé sous <project_id>/…, donc l'accès suit l'appartenance
-- à l'espace de travail du projet.
create or replace function can_touch_project_path(name text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from projects p
    where p.id::text = split_part(name, '/', 1)
      and is_member(p.workspace_id)
  );
$$;

create policy rushes_read on storage.objects for select
  using (bucket_id = 'rushes' and can_touch_project_path(name));
create policy rushes_insert on storage.objects for insert
  with check (bucket_id = 'rushes' and can_touch_project_path(name));
create policy rushes_delete on storage.objects for delete
  using (bucket_id = 'rushes' and can_touch_project_path(name));

create policy deliverables_read on storage.objects for select
  using (bucket_id = 'deliverables' and can_touch_project_path(name));
