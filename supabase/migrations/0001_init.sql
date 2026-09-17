-- Bobie — schéma initial
-- Principe : un espace de travail par client, des projets dedans, et pour
-- chaque projet une file de jobs qui produit des timelines, puis des livrables.
-- Chaque timeline peut être notée : c'est la boucle d'apprentissage.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- comptes ---
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'user' check (role in ('user', 'admin')),
  created_at  timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ------------------------------------------------------------ workspaces ---
create table if not exists workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  owner_id    uuid not null references profiles(id) on delete restrict,
  -- Quota : sans ça, la machine sature au premier utilisateur curieux.
  credits     integer not null default 10,
  created_at  timestamptz not null default now()
);

create table if not exists workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'member')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- Appartenance, en SECURITY DEFINER pour ne pas boucler dans les policies.
create or replace function is_member(target_workspace uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = target_workspace and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------- styles ---
-- Seulement la fiche d'identité d'un style. La recette (règles chiffrées,
-- prompts) vit dans le dépôt privé, jamais ici.
create table if not exists styles (
  id          text primary key,
  name        text not null,
  format      text not null check (format in ('short', 'long', 'podcast', 'vsl')),
  summary     text,
  available   boolean not null default false,
  created_at  timestamptz not null default now()
);

insert into styles (id, name, format, summary, available) values
  ('lucidus',       'Lucidus',            'short',   'Le style principal — mesuré sur 516 shorts.', true),
  ('togy',          'Togy',               'short',   'Variante rythme rapide.', false),
  ('storytelling',  'Storytelling',       'short',   'À venir.', false),
  ('broll-plus',    'B-roll poussé',      'short',   'À venir.', false),
  ('broll-simple',  'B-roll simple',      'short',   'À venir.', false),
  ('podcast',       'Podcast',            'podcast', 'Changement de caméra selon qui parle.', false),
  ('vsl',           'VSL',                'vsl',     'Structure calée sur le script.', false),
  ('facecam',       'Facecam Storytelling','long',   'À venir.', false)
on conflict (id) do nothing;

-- -------------------------------------------------------------- projets ---
create table if not exists projects (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  name          text not null,
  brief         text,
  format        text not null default 'short' check (format in ('short', 'long', 'podcast', 'vsl')),
  style_id      text references styles(id),
  status        text not null default 'draft'
                check (status in ('draft', 'queued', 'running', 'review', 'done', 'error')),
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists projects_workspace_idx on projects(workspace_id);

-- Les rushs déposés.
create table if not exists media (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  storage_path  text not null,
  filename      text not null,
  kind          text not null default 'a-roll' check (kind in ('a-roll', 'b-roll', 'music', 'sfx')),
  duration_sec  numeric,
  bytes         bigint,
  -- Sonde ffprobe, transcription, tout ce que le worker ramène.
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists media_project_idx on media(project_id);

-- ------------------------------------------------------------------ jobs ---
-- La file d'attente. Le worker (la machine d'Andrea, puis un GPU loué) prend
-- le job le plus ancien en 'queued' et le fait avancer.
create table if not exists jobs (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  kind          text not null check (kind in ('probe', 'transcribe', 'edit', 'render', 'export_xml')),
  status        text not null default 'queued'
                check (status in ('queued', 'running', 'done', 'error', 'cancelled')),
  progress      integer not null default 0 check (progress between 0 and 100),
  payload       jsonb not null default '{}'::jsonb,
  result        jsonb,
  error         text,
  attempts      integer not null default 0,
  worker_id     text,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists jobs_queue_idx on jobs(status, created_at);
create index if not exists jobs_project_idx on jobs(project_id);

-- ------------------------------------------------------------- timelines ---
-- Le montage lui-même, au format décrit dans src/lib/timeline.ts.
create table if not exists timelines (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  revision      integer not null default 1,
  data          jsonb not null,
  -- 'agent' quand c'est Bobie, l'id du profil quand c'est une correction humaine.
  author        text not null default 'agent',
  created_at    timestamptz not null default now(),
  unique (project_id, revision)
);
create index if not exists timelines_project_idx on timelines(project_id);

-- Les fichiers sortis d'une timeline : MP4, XML Premiere, vignette.
create table if not exists deliverables (
  id            uuid primary key default gen_random_uuid(),
  timeline_id   uuid not null references timelines(id) on delete cascade,
  kind          text not null check (kind in ('mp4', 'xml', 'thumbnail', 'srt')),
  storage_path  text not null,
  bytes         bigint,
  created_at    timestamptz not null default now()
);
create index if not exists deliverables_timeline_idx on deliverables(timeline_id);

-- La note humaine. C'est la donnée la plus précieuse du projet : sans elle,
-- l'agent ne progresse pas.
create table if not exists reviews (
  id            uuid primary key default gen_random_uuid(),
  timeline_id   uuid not null references timelines(id) on delete cascade,
  author_id     uuid references profiles(id),
  score         integer check (score between 0 and 10),
  comment       text,
  -- Ce qui a été gardé, jeté, recadré : [{clipId, verdict, note}]
  decisions     jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists reviews_timeline_idx on reviews(timeline_id);

-- -------------------------------------------------------------------- RLS ---
alter table profiles          enable row level security;
alter table workspaces        enable row level security;
alter table workspace_members enable row level security;
alter table styles            enable row level security;
alter table projects          enable row level security;
alter table media             enable row level security;
alter table jobs              enable row level security;
alter table timelines         enable row level security;
alter table deliverables      enable row level security;
alter table reviews           enable row level security;

create policy profiles_self_read  on profiles for select using (id = auth.uid());
create policy profiles_self_write on profiles for update using (id = auth.uid());

create policy workspaces_read   on workspaces for select using (is_member(id));
create policy workspaces_insert on workspaces for insert with check (owner_id = auth.uid());
create policy workspaces_update on workspaces for update using (owner_id = auth.uid());

create policy members_read   on workspace_members for select using (is_member(workspace_id));
create policy members_insert on workspace_members for insert
  with check (exists (select 1 from workspaces w where w.id = workspace_id and w.owner_id = auth.uid())
              or user_id = auth.uid());

create policy styles_read on styles for select using (auth.uid() is not null);

create policy projects_read  on projects for select using (is_member(workspace_id));
create policy projects_write on projects for all    using (is_member(workspace_id))
                                                    with check (is_member(workspace_id));

create policy media_read  on media for select
  using (exists (select 1 from projects p where p.id = project_id and is_member(p.workspace_id)));
create policy media_write on media for all
  using (exists (select 1 from projects p where p.id = project_id and is_member(p.workspace_id)))
  with check (exists (select 1 from projects p where p.id = project_id and is_member(p.workspace_id)));

-- Les jobs se lisent depuis l'app, mais ne s'écrivent que par le worker
-- (clé service role, qui contourne la RLS).
create policy jobs_read on jobs for select
  using (exists (select 1 from projects p where p.id = project_id and is_member(p.workspace_id)));

create policy timelines_read on timelines for select
  using (exists (select 1 from projects p where p.id = project_id and is_member(p.workspace_id)));

create policy deliverables_read on deliverables for select
  using (exists (select 1 from timelines t join projects p on p.id = t.project_id
                 where t.id = timeline_id and is_member(p.workspace_id)));

create policy reviews_read   on reviews for select
  using (exists (select 1 from timelines t join projects p on p.id = t.project_id
                 where t.id = timeline_id and is_member(p.workspace_id)));
create policy reviews_insert on reviews for insert
  with check (author_id = auth.uid()
              and exists (select 1 from timelines t join projects p on p.id = t.project_id
                          where t.id = timeline_id and is_member(p.workspace_id)));
