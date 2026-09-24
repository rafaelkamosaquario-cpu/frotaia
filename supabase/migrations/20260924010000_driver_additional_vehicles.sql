begin;
-- Preserve vehicle_id and every existing assignment. Two optional extra slots.
alter table public.vehicles add constraint vehicles_id_company_links_unique unique(id,company_id);
alter table public.drivers
  add column additional_vehicle_id_1 uuid,
  add column additional_vehicle_id_2 uuid,
  add constraint drivers_extra_vehicle_1_company_fk foreign key(additional_vehicle_id_1,company_id) references public.vehicles(id,company_id),
  add constraint drivers_extra_vehicle_2_company_fk foreign key(additional_vehicle_id_2,company_id) references public.vehicles(id,company_id),
  add constraint drivers_unique_vehicle_slots check (
    (vehicle_id is null or additional_vehicle_id_1 is null or vehicle_id <> additional_vehicle_id_1)
    and (vehicle_id is null or additional_vehicle_id_2 is null or vehicle_id <> additional_vehicle_id_2)
    and (additional_vehicle_id_1 is null or additional_vehicle_id_2 is null or additional_vehicle_id_1 <> additional_vehicle_id_2)
  );
comment on column public.drivers.vehicle_id is 'Veículo/equipamento principal; vínculo original preservado.';
comment on column public.drivers.additional_vehicle_id_1 is 'Segundo vínculo habitual; custo pertence ao equipamento abastecido, não à pessoa.';
comment on column public.drivers.additional_vehicle_id_2 is 'Terceiro e último vínculo habitual.';
commit;

