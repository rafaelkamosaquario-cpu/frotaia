-- Índices cobrindo as FKs das 4 tabelas criadas na Fase 1 (drivers,
-- vehicle_documents, maintenance_schedules, checklist_dispatches) —
-- achado real do advisor de performance do Supabase (get_advisors) ao
-- revisar a Fase 2: toda leitura escopada por empresa (is_company_member)
-- e todo join por veículo/motorista batia em full scan sem essas.

create index if not exists drivers_company_id_idx on public.drivers (company_id);
create index if not exists drivers_vehicle_id_idx on public.drivers (vehicle_id);

create index if not exists vehicle_documents_company_id_idx on public.vehicle_documents (company_id);
create index if not exists vehicle_documents_vehicle_id_idx on public.vehicle_documents (vehicle_id);
create index if not exists vehicle_documents_driver_id_idx on public.vehicle_documents (driver_id);

create index if not exists maintenance_schedules_company_id_idx on public.maintenance_schedules (company_id);
create index if not exists maintenance_schedules_vehicle_id_idx on public.maintenance_schedules (vehicle_id);

create index if not exists checklist_dispatches_company_id_idx on public.checklist_dispatches (company_id);
create index if not exists checklist_dispatches_driver_id_idx on public.checklist_dispatches (driver_id);
create index if not exists checklist_dispatches_vehicle_id_idx on public.checklist_dispatches (vehicle_id);
