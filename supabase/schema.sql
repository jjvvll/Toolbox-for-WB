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

-- Added 2026-11-20: compliance entries. Each part (State, MLS, Brokerage) lists its states,
-- MLSs or brokerages: usually one, sometimes two or more, each with a name and its own link.
-- They're stored in the part, in `data` and in the `compliance` column alike, so no column
-- changes are needed:
-- Shape: {"state": {"entries": [{"title": "California", "link": "https://…"}, …], "notes": "<p>…</p>"}, "mls": {…}, "brokerage": {…}}
-- Parts saved earlier have one "link" for the whole part (and briefly "titles"); the app
-- converts them when the note is opened, and the view below reads them the same way.
-- This replaces the short-lived note_compliance_titles view. Safe to run again.
drop view if exists public.note_compliance_titles;

comment on column public.notes.compliance is
  'Copy of the note''s compliance page: {"state"|"mls"|"brokerage": {"entries": [{"title": text, "link": text}], "notes": html}}. Older parts have "link" (and maybe "titles") instead of "entries".';

-- Every state / MLS / brokerage as its own row (in order), with its link, for browsing and
-- searching in the Table Editor. Deleted notes and empty rows are left out.
-- security_invoker: the view follows the notes table's Row Level Security instead of
-- bypassing it, so the public key still can't read anything.
create or replace view public.note_compliance_entries
with (security_invoker = true) as
with parts as (
  select
    n.id as note_id,
    n.title as note_title,
    part.key as part,
    case
      when jsonb_typeof(part.value->'entries') = 'array' then part.value->'entries'
      -- Older shape: each title becomes an entry, the first one taking the part's link
      -- (no titles: falls through to the one-link case below via coalesce).
      when jsonb_typeof(part.value->'titles') = 'array' then coalesce(
        (
          select jsonb_agg(
            jsonb_build_object('title', t.title, 'link', case when t.i = 1 then coalesce(part.value->>'link', '') else '' end)
            order by t.i
          )
          from jsonb_array_elements_text(part.value->'titles') with ordinality as t(title, i)
        ),
        case
          when coalesce(btrim(part.value->>'link'), '') <> ''
            then jsonb_build_array(jsonb_build_object('title', '', 'link', part.value->>'link'))
          else '[]'::jsonb
        end
      )
      -- Oldest shape: one link and no name.
      when coalesce(btrim(part.value->>'link'), '') <> '' then
        jsonb_build_array(jsonb_build_object('title', '', 'link', part.value->>'link'))
      else '[]'::jsonb
    end as entries
  from public.notes n
  cross join lateral jsonb_each(
    case when jsonb_typeof(n.compliance) = 'object' then n.compliance else '{}'::jsonb end
  ) as part(key, value)
  where not n.deleted
    and jsonb_typeof(part.value) = 'object'
)
select
  p.note_id,
  p.note_title,
  p.part,                                          -- state, mls or brokerage
  e.position::int as position,                     -- 1 for the first one
  btrim(coalesce(e.entry->>'title', '')) as title, -- the state, MLS or brokerage name
  btrim(coalesce(e.entry->>'link', '')) as link
from parts p
cross join lateral jsonb_array_elements(p.entries) with ordinality as e(entry, position)
where btrim(coalesce(e.entry->>'title', '')) <> ''
   or btrim(coalesce(e.entry->>'link', '')) <> '';

-- Rollback (only if needed): run these lines to go back to the titles-only version.
--
-- drop view if exists public.note_compliance_entries;
-- comment on column public.notes.compliance is
--   'Copy of the note''s compliance page: {"state"|"mls"|"brokerage": {"titles": [text], "link": text, "notes": html}}. Parts saved before titles existed have no "titles".';
-- create or replace view public.note_compliance_titles
-- with (security_invoker = true) as
-- select
--   n.id as note_id,
--   n.title as note_title,
--   part.key as part,
--   t.position::int as position,
--   btrim(t.title) as title
-- from public.notes n
-- cross join lateral jsonb_each(
--   case when jsonb_typeof(n.compliance) = 'object' then n.compliance else '{}'::jsonb end
-- ) as part(key, value)
-- cross join lateral jsonb_array_elements_text(
--   case when jsonb_typeof(part.value->'titles') = 'array' then part.value->'titles' else '[]'::jsonb end
-- ) with ordinality as t(title, position)
-- where not n.deleted
--   and btrim(t.title) <> '';
