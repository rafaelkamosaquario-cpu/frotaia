-- Alertas: permite criar/editar/cancelar alertas MANUAIS pelo painel (Rodada 2, evolução funcional 08/2026)
-- Só cobre alertas SEM origem automática (maintenance_schedule_id/vehicle_document_id nulos) —
-- alertas de manutenção/documento continuam só graváveis pelo client admin (syncMaintenanceAlert/
-- syncDocumentAlert), preservando a regra "manutenção/documento continuam controlando o próprio alerta".
-- 100% aditivo: nenhuma policy existente é alterada ou removida.

create policy scheduled_alerts_insert_operator on public.scheduled_alerts
  for insert
  with check (
    public.has_company_role(company_id, array['owner', 'admin', 'operator']::public.company_member_role[])
    and maintenance_schedule_id is null
    and vehicle_document_id is null
  );

create policy scheduled_alerts_update_operator on public.scheduled_alerts
  for update
  using (
    public.has_company_role(company_id, array['owner', 'admin', 'operator']::public.company_member_role[])
    and maintenance_schedule_id is null
    and vehicle_document_id is null
  )
  with check (
    public.has_company_role(company_id, array['owner', 'admin', 'operator']::public.company_member_role[])
    and maintenance_schedule_id is null
    and vehicle_document_id is null
  );
