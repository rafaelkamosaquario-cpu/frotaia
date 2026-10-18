-- Private consultant workspace. No access granted to tenant members or browser clients.
begin;
create table public.consultant_tire_cases (
 id uuid primary key, company_id uuid not null references public.companies(id),
 actor_id uuid not null references auth.users(id), version integer not null default 1 check(version>0),
 data jsonb not null check(jsonb_typeof(data)='object'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.consultant_tire_cases enable row level security;
revoke all on public.consultant_tire_cases from anon, authenticated;
grant select,insert,update on public.consultant_tire_cases to service_role;
create index on public.consultant_tire_cases(company_id,actor_id);
create table public.consultant_tire_case_revisions (
 id bigint generated always as identity primary key, case_id uuid not null references public.consultant_tire_cases(id),
 version integer not null, data jsonb not null, recorded_at timestamptz not null default now(), unique(case_id,version)
);
alter table public.consultant_tire_case_revisions enable row level security;
revoke all on public.consultant_tire_case_revisions from anon,authenticated;
create function public.audit_tire_case() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.consultant_tire_case_revisions(case_id,version,data) values(new.id,new.version,new.data);
 return new;
end $$;
revoke all on function public.audit_tire_case() from public,anon,authenticated;
create trigger tire_case_revision after insert or update on public.consultant_tire_cases for each row execute function public.audit_tire_case();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('consultant-tire-evidence','consultant-tire-evidence',false,5242880,array['image/jpeg','image/png']) on conflict(id) do nothing;
commit;
