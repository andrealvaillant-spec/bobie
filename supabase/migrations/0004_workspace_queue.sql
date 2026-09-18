-- Premier passage dans le studio : crée l'espace de travail de l'utilisateur
-- s'il n'en a pas. Renvoie l'id de son espace (le premier, s'il en a plusieurs).
create or replace function ensure_workspace()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ws  uuid;
  nom text;
begin
  if uid is null then
    raise exception 'non connecté';
  end if;

  select workspace_id into ws
  from workspace_members
  where user_id = uid
  order by created_at
  limit 1;

  if ws is not null then
    return ws;
  end if;

  select coalesce(nullif(full_name, ''), split_part(email, '@', 1)) into nom
  from profiles where id = uid;

  insert into workspaces (name, slug, owner_id)
  values (coalesce(nom, 'Mon espace'), 'ws-' || substr(replace(uid::text, '-', ''), 1, 12), uid)
  returning id into ws;

  insert into workspace_members (workspace_id, user_id, role)
  values (ws, uid, 'owner');

  return ws;
end;
$$;

-- Met un projet dans la file : vérifie l'appartenance, pose le premier job
-- (la sonde des rushs) et passe le projet en 'queued'. Les utilisateurs
-- n'écrivent jamais directement dans `jobs`.
create or replace function queue_project(target uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  ws  uuid;
  job uuid;
begin
  select workspace_id into ws from projects where id = target;
  if ws is null or not is_member(ws) then
    raise exception 'projet introuvable';
  end if;
  if not exists (select 1 from media where project_id = target) then
    raise exception 'aucun rush dans ce projet';
  end if;

  insert into jobs (project_id, kind) values (target, 'probe') returning id into job;
  update projects set status = 'queued', updated_at = now() where id = target;
  return job;
end;
$$;

grant execute on function ensure_workspace() to authenticated;
grant execute on function queue_project(uuid) to authenticated;
