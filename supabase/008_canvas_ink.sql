-- Freehand ink on roadmap + separate whiteboard strokes
alter table projects add column if not exists canvas_ink jsonb not null default '[]'::jsonb;
alter table projects add column if not exists whiteboard_strokes jsonb not null default '[]'::jsonb;
