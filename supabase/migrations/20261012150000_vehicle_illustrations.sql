begin;
alter table public.vehicles add column if not exists illustration_key text;
alter table public.vehicles add constraint vehicles_illustration_key_valid
 check (illustration_key is null or illustration_key in ('generic','truck','julieta3','julieta4','loader','winch'));
comment on column public.vehicles.illustration_key is 'Visual selection only; never a source for technical dimensions or axle count. Null preserves legacy presentation.';
notify pgrst, 'reload schema';
commit;
