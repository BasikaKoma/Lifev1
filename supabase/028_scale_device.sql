-- Account-level scale pairing (syncs across mobile + browser)
alter table profiles add column if not exists scale_device jsonb;
