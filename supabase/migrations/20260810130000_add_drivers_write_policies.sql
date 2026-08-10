-- Fase 3 (painel V2) — motoristas ganham UI de verdade; adiciona as
-- policies de escrita que a Fase 1 deixou de fora de propósito
-- ("só client admin grava" era o texto da época, até existir UI real).
-- Mesmo padrão de vehicles_insert_operator/update/delete
-- (20260726235723_create_rls_policies.sql:152-160).

create policy drivers_insert_operator on public.drivers
  for insert with check (public.has_company_role(company_id, array['owner', 'admin', 'operator']::public.company_member_role[]));

create policy drivers_update_operator on public.drivers
  for update using (public.has_company_role(company_id, array['owner', 'admin', 'operator']::public.company_member_role[]))
  with check (public.has_company_role(company_id, array['owner', 'admin', 'operator']::public.company_member_role[]));

create policy drivers_delete_admin on public.drivers
  for delete using (public.has_company_role(company_id, array['owner', 'admin']::public.company_member_role[]));
