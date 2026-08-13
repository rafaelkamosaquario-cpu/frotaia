-- Plano de unificação V1+V2, Fase 4 (continuação): índice único pra
-- suportar upsert por (vehicle_id, document_type) — só entre documentos de
-- veículo (driver_id nulo), e backfill dos dados que hoje só existem em
-- vehicles.insurance_expiry_date/licensing_expiry_date.

create unique index if not exists vehicle_documents_vehicle_type_unique_idx
  on public.vehicle_documents (vehicle_id, document_type)
  where driver_id is null and vehicle_id is not null;

insert into public.vehicle_documents (company_id, vehicle_id, document_type, expiry_date)
select company_id, id, 'seguro', insurance_expiry_date
from public.vehicles
where insurance_expiry_date is not null
on conflict do nothing;

insert into public.vehicle_documents (company_id, vehicle_id, document_type, expiry_date)
select company_id, id, 'licenciamento', licensing_expiry_date
from public.vehicles
where licensing_expiry_date is not null
on conflict do nothing;
