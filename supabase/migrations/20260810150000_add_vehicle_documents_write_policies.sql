-- Fase 5 (painel V2) — documentos ganha UI de verdade; adiciona as
-- policies de escrita que a Fase 1 deixou de fora de propósito, mesmo
-- padrão de maintenance_schedules_insert_operator/update/delete
-- (20260810140000_add_maintenance_schedules_write_policies.sql), que por
-- sua vez espelhou drivers (20260810130000) e vehicles
-- (20260726235723_create_rls_policies.sql:152-160).

create policy vehicle_documents_insert_operator on public.vehicle_documents
  for insert with check (public.has_company_role(company_id, array['owner', 'admin', 'operator']::public.company_member_role[]));

create policy vehicle_documents_update_operator on public.vehicle_documents
  for update using (public.has_company_role(company_id, array['owner', 'admin', 'operator']::public.company_member_role[]))
  with check (public.has_company_role(company_id, array['owner', 'admin', 'operator']::public.company_member_role[]));

create policy vehicle_documents_delete_admin on public.vehicle_documents
  for delete using (public.has_company_role(company_id, array['owner', 'admin']::public.company_member_role[]));
