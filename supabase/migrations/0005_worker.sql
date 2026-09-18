-- Le worker prend un job à la fois, sans jamais en prendre un déjà pris par
-- un autre worker (FOR UPDATE SKIP LOCKED). Appelé avec la clé service role.
create or replace function claim_job(worker text)
returns setof jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update jobs j
     set status = 'running',
         worker_id = worker,
         attempts = j.attempts + 1,
         started_at = now(),
         progress = 0
   where j.id = (
     select id from jobs
      where status = 'queued'
      order by created_at
      for update skip locked
      limit 1
   )
  returning j.*;
end;
$$;

revoke execute on function claim_job(text) from public, anon, authenticated;

-- Un projet peut rendre plusieurs montages (ex. 5 shorts tirés d'un podcast) :
-- chaque montage a sa position, et ses propres révisions.
alter table timelines add column if not exists position integer not null default 1;
alter table timelines add column if not exists label text;
alter table timelines drop constraint if exists timelines_project_id_revision_key;
alter table timelines add constraint timelines_project_position_revision_key
  unique (project_id, position, revision);

-- Le détail de ce que fait le worker, lisible depuis l'app.
alter table jobs add column if not exists message text;
