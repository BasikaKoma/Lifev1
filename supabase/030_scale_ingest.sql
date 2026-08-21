-- Optional index for scale ingest token lookups.
create index if not exists profiles_scale_ingest_hash_idx
  on public.profiles ((scale_device->>'ingest_token_hash'));
