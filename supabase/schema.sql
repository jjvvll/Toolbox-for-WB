-- Tables for the Toolbox app: notes (with their folders and templates) and the error log.
-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- Safe to run again: it only creates what's missing.
--
-- Only the app's server talks to these tables, with the secret (service role) key, behind
-- the app's own login. Row Level Security is on with no policies, so the public
-- (publishable/anon) key can't read or change anything.

-- Notes, folders and templates are stored as the app keeps them (`data`), with a few
-- columns copied out so they're easy to browse in the Table Editor.
create table if not exists public.notes (
  id text primary key,
  title text not null default '',
  data jsonb not null,
  updated_at bigint not null,            -- the app's edit time (ms since 1970)
  deleted boolean not null default false, -- deleted in the app; kept so other browsers learn about it
  synced_at timestamptz not null default now()
);

create table if not exists public.folders (
  id text primary key,
  name text not null default '',
  data jsonb not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  synced_at timestamptz not null default now()
);

create table if not exists public.templates (
  id text primary key,
  name text not null default '',
  data jsonb not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  synced_at timestamptz not null default now()
);

-- The error log: one row per distinct error (repeats are counted, like in the app).
create table if not exists public.error_log (
  key text primary key,                 -- tool + kind + message
  tool text not null,
  kind text not null,
  message text not null,
  detail text not null default '',
  count integer not null default 1,
  first_at timestamptz not null,
  last_at timestamptz not null,
  synced_at timestamptz not null default now()
);

create index if not exists notes_updated_at_idx on public.notes (updated_at desc);
create index if not exists error_log_last_at_idx on public.error_log (last_at desc);

alter table public.notes enable row level security;
alter table public.folders enable row level security;
alter table public.templates enable row level security;
alter table public.error_log enable row level security;

-- Added 2026-11-20: the note's compliance page (State, MLS and Brokerage compliance, each a
-- link and the pasted guidelines). The app keeps it inside `data` like the rest of the note;
-- this column is a copy, so it's easy to browse in the Table Editor.
-- Shape: {"state": {"link": "...", "notes": "<p>…</p>"}, "mls": {…}, "brokerage": {…}}
alter table public.notes add column if not exists compliance jsonb;

-- Fill it in for notes saved before the column existed.
update public.notes
set compliance = case
  when jsonb_typeof(data->'compliance') = 'object' then data->'compliance'
  -- The first version was one text area; the app shows that text under State compliance.
  when jsonb_typeof(data->'compliance') = 'string' and data->>'compliance' <> ''
    then jsonb_build_object('state', jsonb_build_object('link', '', 'notes', data->>'compliance'))
end
where compliance is null and data ? 'compliance';
