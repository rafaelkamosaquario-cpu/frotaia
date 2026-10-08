begin;
create table if not exists public.company_panel_modules (
  company_id uuid primary key references public.companies(id),
  enabled text[] not null,
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id)
);
alter table public.company_panel_modules enable row level security;
-- No authenticated/anonymous writes: only the server endpoint after consultant + active membership checks.
revoke all on public.company_panel_modules from anon, authenticated;
grant all on public.company_panel_modules to service_role;
notify pgrst, 'reload schema';
commit;
