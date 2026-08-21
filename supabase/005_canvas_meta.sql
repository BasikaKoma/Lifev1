-- Optional migration: canvas connections and sticky notes
alter table projects add column if not exists canvas_connections jsonb not null default '[]'::jsonb;
alter table projects add column if not exists canvas_stickies jsonb not null default '[]'::jsonb;
