-- Le worker ne prend que les types de jobs qu'il sait traiter (ex. pas d'`edit`
-- tant que la clé API manque), sans qu'un job en attente bloque la file.
drop function if exists claim_job(text);

create or replace function claim_job(worker text, kinds text[] default null)
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
        and (kinds is null or kind = any(kinds))
      order by created_at
      for update skip locked
      limit 1
   )
  returning j.*;
end;
$$;

revoke execute on function claim_job(text, text[]) from public, anon, authenticated;
