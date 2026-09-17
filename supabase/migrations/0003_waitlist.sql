-- Liste d'attente de l'early access. Ouverte en écriture (n'importe qui peut
-- s'inscrire), fermée en lecture (seul le service role la lit).
create table if not exists waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  role        text,
  volume      text,
  note        text,
  source      text,
  created_at  timestamptz not null default now()
);

alter table waitlist enable row level security;

create policy waitlist_insert on waitlist for insert to anon, authenticated
  with check (true);
