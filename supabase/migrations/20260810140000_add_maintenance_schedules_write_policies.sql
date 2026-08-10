-- Fase 4 (painel V2) — manutenção ganha UI de verdade; adiciona as
-- policies de escrita que a Fase 1 deixou de fora de propósito, mesmo
-- padrão de drivers_insert_operator/update/delete
-- (20260810130000_add_drivers_write_policies.sql), que por sua vez
-- espelhou vehicles (20260726235723_create_rls_policies.sql:152-160).

create policy maintenance_schedules_insert_operator on public.maintenance_schedules
  for insert with check (public.has_company_role(company_id, array['owner', 'admin', 'operator']::public.company_member_role[]));

create policy maintenance_schedules_update_operator on public.maintenance_schedules
  for update using (public.has_company_role(company_id, array['owner', 'admin', 'operator']::public.company_member_role[]))
  with check (public.has_company_role(company_id, array['owner', 'admin', 'operator']::public.company_member_role[]));

create policy maintenance_schedules_delete_admin on public.maintenance_schedules
  for delete using (public.has_company_role(company_id, array['owner', 'admin']::public.company_member_role[]));
