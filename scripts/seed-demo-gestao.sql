-- Frota IA — Seed de demo comercial (Gestão), 08/2026.
-- Cria "Transportes Rocha Sul", uma transportadora fictícia completa, pra
-- tirar prints reais do painel web. Reutilizável: basta trocar
-- v_owner_user_id por outro auth.users.id real (o login é sempre Google —
-- não dá pra criar uma conta nova por SQL, precisa de um usuário já
-- autenticado de verdade) e rodar de novo. Ver scripts/cleanup-demo-gestao.sql
-- pra reverter.
--
-- Todos os UUIDs abaixo são fixos (gerados uma vez, hardcoded) — não usa
-- gen_random_uuid() nos que precisam ser referenciados por outra tabela,
-- só nos que são folha (não referenciados por mais ninguém). Isso torna o
-- script determinístico e fácil de auditar/limpar depois.
--
-- NÃO mexe em: planos, checkout, cobrança, onboarding, regras comerciais,
-- estrutura de tabelas. Só dados.

-- ── 0. Identidade ────────────────────────────────────────────────────────
-- v_owner_user_id precisa ser um auth.users.id JÁ existente (login Google
-- real) — troque aqui se for rodar para outra conta.
do $$
declare
  v_owner_user_id uuid := '00000000-0000-0000-0000-000000000000'; -- SUBSTITUA pelo auth.users.id real (conta Google já logada) antes de rodar
  v_company_id uuid := '848b0ecc-7e55-4101-9549-15cc019406ad';
begin
  if not exists (select 1 from auth.users where id = v_owner_user_id) then
    raise exception 'auth.users.id % não existe — faça login com a conta Google desejada antes de rodar este seed.', v_owner_user_id;
  end if;
end $$;

-- ── 1. Empresa + membro + perfil ────────────────────────────────────────
insert into public.companies (
  id, name, trade_name, document_type, document_number, company_type,
  city, state, country_code, timezone, active, fleet_onboarding_completed_at,
  created_by, updated_by
) values (
  '848b0ecc-7e55-4101-9549-15cc019406ad', 'Transportes Rocha Sul', 'Rocha Sul Transportes',
  'cnpj', '12.345.678/0001-90', 'transportadora',
  'Curitiba', 'PR', 'BR', 'America/Sao_Paulo', true, now(),
  '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000'
);

insert into public.company_members (company_id, user_id, role, is_default)
values ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', 'owner', true);

update public.profiles
  set full_name = 'Roberto Rocha', phone_e164 = '+5541999112233'
  where id = '00000000-0000-0000-0000-000000000000';

-- ── 2. Assinatura (Gestão, ativa, painel liberado) ──────────────────────
insert into public.subscriptions (company_id, plan, status, fleet_panel_included, valor_centavos, iniciado_em, valido_ate)
values ('848b0ecc-7e55-4101-9549-15cc019406ad', 'GESTAO_MENSAL', 'ATIVA', true, 9990, now() - interval '90 days', null);

-- ── 3. Preferências (região + insight do dashboard + checklist/notícias) ─
insert into public.company_preferences (
  company_id, operating_region, dashboard_insight_text, dashboard_insight_generated_at,
  checklist_enabled, checklist_send_hour, daily_news_enabled
) values (
  '848b0ecc-7e55-4101-9549-15cc019406ad', 'Sul e Sudeste',
  '2 veículos estão com manutenção agendada para os próximos dias e 1 documento vence em breve. Encontrei uma oportunidade de frete compatível com a rota Curitiba → Campinas no Radar.',
  now(), true, 6, true
);

-- ── 4. Veículos (10) ─────────────────────────────────────────────────────
insert into public.vehicles (
  id, company_id, name, plate, vehicle_type, body_type, brand, model, model_year,
  fuel_type, average_consumption_km_l, average_speed_kmh, load_capacity_kg, current_odometer_km,
  axle_count, is_default, active, created_by, updated_by
) values
  ('b58ce095-8d28-4eb3-a12e-704e13e4f2dc', '848b0ecc-7e55-4101-9549-15cc019406ad', 'Scania R450 2022', 'RSU1A23', 'cavalo_mecanico', 'sider', 'Scania', 'R 450', 2022, 'diesel_s10', 2.6, 80, 27000, 185000, 6, true, true, '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000'),
  ('e88f110a-bf45-4ec5-b4e8-063735073e03', '848b0ecc-7e55-4101-9549-15cc019406ad', 'Volvo FH 540 2021', 'RSU2B45', 'cavalo_mecanico', 'graneleiro', 'Volvo', 'FH 540', 2021, 'diesel_s10', 2.4, 78, 28000, 210500, 6, false, true, '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000'),
  ('c5937ab5-5b50-4228-afc8-22b15b085793', '848b0ecc-7e55-4101-9549-15cc019406ad', 'Mercedes-Benz Actros 2651 2023', 'RSU3C67', 'cavalo_mecanico', 'sider', 'Mercedes-Benz', 'Actros 2651', 2023, 'diesel_s10', 2.5, 80, 27500, 98000, 6, false, true, '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000'),
  ('92196f13-2586-46c8-ab39-76de5c39f0c4', '848b0ecc-7e55-4101-9549-15cc019406ad', 'DAF XF 480 2020', 'RSU4D89', 'cavalo_mecanico', 'bau', 'DAF', 'XF 480', 2020, 'diesel_s10', 2.3, 78, 26800, 245000, 6, false, true, '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000'),
  ('08ee5e61-c3a4-4d1d-88e0-8b5e4dc1a6ed', '848b0ecc-7e55-4101-9549-15cc019406ad', 'MAN TGX 29.480 2022', 'RSU5E12', 'cavalo_mecanico', 'graneleiro', 'MAN', 'TGX 29.480', 2022, 'diesel_s10', 2.5, 79, 27200, 132000, 6, false, true, '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000'),
  ('32bc4eae-abcf-4049-b77f-016dfc745466', '848b0ecc-7e55-4101-9549-15cc019406ad', 'Volvo VM 270 2021', 'RSU6F34', 'truck', 'sider', 'Volvo', 'VM 270', 2021, 'diesel_s10', 3.1, 72, 14500, 178000, 2, false, true, '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000'),
  ('5e76ffa1-58c4-4a0b-b025-f19bfbf541e7', '848b0ecc-7e55-4101-9549-15cc019406ad', 'Mercedes-Benz Atego 2426 2019', 'RSU7G56', 'truck', 'bau', 'Mercedes-Benz', 'Atego 2426', 2019, 'diesel_s10', 3.4, 70, 13800, 265000, 2, false, true, '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000'),
  ('9e4f6b91-d227-40b9-b41b-694da3e8f518', '848b0ecc-7e55-4101-9549-15cc019406ad', 'Iveco Tector 240E28 2020', 'RSU8H78', 'truck', 'graneleiro', 'Iveco', 'Tector 240E28', 2020, 'diesel_s10', 3.0, 72, 16500, 189000, 3, false, true, '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000'),
  ('11bfd950-eeb6-4002-a1e9-5d74177c069e', '848b0ecc-7e55-4101-9549-15cc019406ad', 'VW Constellation 24.280 2018', 'RSU9I90', 'truck', 'sider', 'Volkswagen', 'Constellation 24.280', 2018, 'diesel_s10', 2.9, 71, 17000, 298000, 3, false, true, '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000'),
  ('07c85ee4-fb53-428c-861e-254bbbb150c8', '848b0ecc-7e55-4101-9549-15cc019406ad', 'Scania P310 2021', 'RSU0J11', 'toco', 'bau', 'Scania', 'P 310', 2021, 'diesel_s10', 3.8, 68, 8500, 145000, 2, false, true, '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000');

-- ── 5. Motoristas (9 — v10 fica sem motorista fixo, veículo reserva) ────
insert into public.drivers (id, company_id, vehicle_id, name, phone_e164, cnh_expiry_date, toxicologico_expiry_date, active) values
  ('6a7cb346-027a-4aba-bdd4-20383be502e3', '848b0ecc-7e55-4101-9549-15cc019406ad', 'b58ce095-8d28-4eb3-a12e-704e13e4f2dc', 'Carlos Eduardo Silva', '+5541988112201', current_date + 365, current_date + 180, true),
  ('5018ef47-ffbe-4316-add9-6fd19db05a36', '848b0ecc-7e55-4101-9549-15cc019406ad', 'e88f110a-bf45-4ec5-b4e8-063735073e03', 'Marcos Antônio Souza', '+5541988112202', current_date + 400, current_date + 90, true),
  ('e870d75e-05cb-44eb-9d42-27e8ce6964f1', '848b0ecc-7e55-4101-9549-15cc019406ad', 'c5937ab5-5b50-4228-afc8-22b15b085793', 'José Ricardo Lima', '+5541988112203', current_date + 200, current_date + 45, true),
  ('410e22ca-20cb-46d5-84bc-1730251dd940', '848b0ecc-7e55-4101-9549-15cc019406ad', '92196f13-2586-46c8-ab39-76de5c39f0c4', 'Paulo Henrique Costa', '+5541988112204', current_date + 15, current_date + 300, true),
  ('710db8a0-cfe2-474f-8754-bd9f0b2b2b31', '848b0ecc-7e55-4101-9549-15cc019406ad', '08ee5e61-c3a4-4d1d-88e0-8b5e4dc1a6ed', 'Fernando Alves Pereira', '+5541988112205', current_date + 250, current_date + 120, true),
  ('98448f66-5432-41d3-9687-76f02cdaf47c', '848b0ecc-7e55-4101-9549-15cc019406ad', '32bc4eae-abcf-4049-b77f-016dfc745466', 'Antônio Carlos Rocha', '+5541988112206', current_date + 180, current_date + 60, true),
  ('f1275b3c-15fd-4ef2-8304-12df07a352e8', '848b0ecc-7e55-4101-9549-15cc019406ad', '5e76ffa1-58c4-4a0b-b025-f19bfbf541e7', 'Rafael Nunes Barbosa', '+5541988112207', current_date + 90, current_date + 200, true),
  ('fb49772a-1486-4d66-9fa7-142bf90f29cd', '848b0ecc-7e55-4101-9549-15cc019406ad', '9e4f6b91-d227-40b9-b41b-694da3e8f518', 'Sérgio Luiz Martins', '+5541988112208', current_date + 300, current_date + 150, true),
  ('3c73d57b-7ed0-478c-97c3-1d5393833cf2', '848b0ecc-7e55-4101-9549-15cc019406ad', '11bfd950-eeb6-4002-a1e9-5d74177c069e', 'Edson Ferreira Dias', '+5541988112209', current_date + 500, current_date + 250, true);

-- ── 6. Manutenções (10) ──────────────────────────────────────────────────
insert into public.maintenance_schedules (id, company_id, vehicle_id, type, due_date, status, executed_date, executed_km, notes) values
  ('a4991857-3c4f-4ef9-ba2e-4a74fdf36412', '848b0ecc-7e55-4101-9549-15cc019406ad', 'c5937ab5-5b50-4228-afc8-22b15b085793', 'Revisão geral', current_date + 5, 'agendado', null, null, 'Revisão dos 100.000 km'),
  ('15fe71cc-23c8-40ca-98b9-8315a6c65bfd', '848b0ecc-7e55-4101-9549-15cc019406ad', '32bc4eae-abcf-4049-b77f-016dfc745466', 'Freios', current_date + 2, 'pendente', null, null, 'Troca de pastilhas dianteiras'),
  ('4b619e56-a77a-4b71-9f22-cc241938abfb', '848b0ecc-7e55-4101-9549-15cc019406ad', '9e4f6b91-d227-40b9-b41b-694da3e8f518', 'Troca de óleo', current_date - 3, 'concluido', current_date - 3, 189000, 'Óleo + filtro'),
  (gen_random_uuid(), '848b0ecc-7e55-4101-9549-15cc019406ad', 'b58ce095-8d28-4eb3-a12e-704e13e4f2dc', 'Troca de óleo', current_date - 20, 'concluido', current_date - 20, 184200, null),
  (gen_random_uuid(), '848b0ecc-7e55-4101-9549-15cc019406ad', 'e88f110a-bf45-4ec5-b4e8-063735073e03', 'Suspensão', current_date + 10, 'pendente', null, null, 'Barulho no eixo traseiro'),
  (gen_random_uuid(), '848b0ecc-7e55-4101-9549-15cc019406ad', '92196f13-2586-46c8-ab39-76de5c39f0c4', 'Troca de pneus', current_date + 7, 'agendado', null, null, 'Dianteiros'),
  (gen_random_uuid(), '848b0ecc-7e55-4101-9549-15cc019406ad', '08ee5e61-c3a4-4d1d-88e0-8b5e4dc1a6ed', 'Alinhamento e balanceamento', current_date - 10, 'concluido', current_date - 10, 131500, null),
  (gen_random_uuid(), '848b0ecc-7e55-4101-9549-15cc019406ad', '5e76ffa1-58c4-4a0b-b025-f19bfbf541e7', 'Correia dentada', current_date + 20, 'pendente', null, null, null),
  (gen_random_uuid(), '848b0ecc-7e55-4101-9549-15cc019406ad', '11bfd950-eeb6-4002-a1e9-5d74177c069e', 'Embreagem', current_date + 15, 'agendado', null, null, 'Kit de embreagem completo'),
  (gen_random_uuid(), '848b0ecc-7e55-4101-9549-15cc019406ad', '07c85ee4-fb53-428c-861e-254bbbb150c8', 'Revisão geral', current_date - 30, 'concluido', current_date - 30, 144000, null);

-- ── 7. Documentos (24 — seguro+licenciamento por veículo, + CNH/tox de 1 motorista) ─
insert into public.vehicle_documents (id, company_id, vehicle_id, driver_id, document_type, expiry_date, notes) values
  (gen_random_uuid(), '848b0ecc-7e55-4101-9549-15cc019406ad', 'b58ce095-8d28-4eb3-a12e-704e13e4f2dc', null, 'seguro', current_date + 200, null),
  (gen_random_uuid(), '848b0ecc-7e55-4101-9549-15cc019406ad', 'b58ce095-8d28-4eb3-a12e-704e13e4f2dc', null, 'licenciamento', current_date + 250, null),
  (gen_random_uuid(), '848b0ecc-7e55-4101-9549-15cc019406ad', 'e88f110a-bf45-4ec5-b4e8-063735073e03', null, 'seguro', current_date + 180, null),
  (gen_random_uuid(), '848b0ecc-7e55-4101-9549-15cc019406ad', 'e88f110a-bf45-4ec5-b4e8-063735073e03', null, 'licenciamento', current_date + 20, null),
  (gen_random_uuid(), '848b0ecc-7e55-4101-9549-15cc019406ad', 'c5937ab5-5b50-4228-afc8-22b15b085793', null, 'seguro', current_date + 90, null),
  (gen_random_uuid(), '848b0ecc-7e55-4101-9549-15cc019406ad', 'c5937ab5-5b50-4228-afc8-22b15b085793', null, 'licenciamento', current_date + 300, null),
  ('4eb53b56-16ba-4f11-9c07-b8379432a1c0', '848b0ecc-7e55-4101-9549-15cc019406ad', '92196f13-2586-46c8-ab39-76de5c39f0c4', null, 'licenciamento', current_date + 5, null),
  (gen_random_uuid(), '848b0ecc-7e55-4101-9549-15cc019406ad', '92196f13-2586-46c8-ab39-76de5c39f0c4', null, 'seguro', current_date + 150, null),
  (gen_random_uuid(), '848b0ecc-7e55-4101-9549-15cc019406ad', '08ee5e61-c3a4-4d1d-88e0-8b5e4dc1a6ed', null, 'seguro', current_date + 220, null),
  (gen_random_uuid(), '848b0ecc-7e55-4101-9549-15cc019406ad', '08ee5e61-c3a4-4d1d-88e0-8b5e4dc1a6ed', null, 'licenciamento', current_date + 180, null),
  ('1166587a-f04d-427d-8f29-bcaedf2b0da1', '848b0ecc-7e55-4101-9549-15cc019406ad', '32bc4eae-abcf-4049-b77f-016dfc745466', null, 'seguro', current_date - 5, null),
  (gen_random_uuid(), '848b0ecc-7e55-4101-9549-15cc019406ad', '32bc4eae-abcf-4049-b77f-016dfc745466', null, 'licenciamento', current_date + 100, null),
  (gen_random_uuid(), '848b0ecc-7e55-4101-9549-15cc019406ad', '5e76ffa1-58c4-4a0b-b025-f19bfbf541e7', null, 'seguro', current_date + 140, null),
  (gen_random_uuid(), '848b0ecc-7e55-4101-9549-15cc019406ad', '5e76ffa1-58c4-4a0b-b025-f19bfbf541e7', null, 'licenciamento', current_date + 90, null),
  (gen_random_uuid(), '848b0ecc-7e55-4101-9549-15cc019406ad', '9e4f6b91-d227-40b9-b41b-694da3e8f518', null, 'seguro', current_date + 160, null),
  (gen_random_uuid(), '848b0ecc-7e55-4101-9549-15cc019406ad', '9e4f6b91-d227-40b9-b41b-694da3e8f518', null, 'licenciamento', current_date + 200, null),
  ('de7ad857-6f1d-431e-94b4-f76d16bee990', '848b0ecc-7e55-4101-9549-15cc019406ad', '11bfd950-eeb6-4002-a1e9-5d74177c069e', null, 'seguro', current_date - 10, null),
  (gen_random_uuid(), '848b0ecc-7e55-4101-9549-15cc019406ad', '11bfd950-eeb6-4002-a1e9-5d74177c069e', null, 'licenciamento', current_date + 120, null),
  (gen_random_uuid(), '848b0ecc-7e55-4101-9549-15cc019406ad', '07c85ee4-fb53-428c-861e-254bbbb150c8', null, 'seguro', current_date + 100, null),
  (gen_random_uuid(), '848b0ecc-7e55-4101-9549-15cc019406ad', '07c85ee4-fb53-428c-861e-254bbbb150c8', null, 'licenciamento', current_date + 25, null),
  ('0ffa7cc3-c018-46eb-80be-49729d38dfc7', '848b0ecc-7e55-4101-9549-15cc019406ad', null, '410e22ca-20cb-46d5-84bc-1730251dd940', 'cnh', current_date + 15, null),
  (gen_random_uuid(), '848b0ecc-7e55-4101-9549-15cc019406ad', null, '410e22ca-20cb-46d5-84bc-1730251dd940', 'toxicologico', current_date + 200, null),
  (gen_random_uuid(), '848b0ecc-7e55-4101-9549-15cc019406ad', 'b58ce095-8d28-4eb3-a12e-704e13e4f2dc', null, 'rntrc', current_date + 400, null),
  (gen_random_uuid(), '848b0ecc-7e55-4101-9549-15cc019406ad', 'e88f110a-bf45-4ec5-b4e8-063735073e03', null, 'tacografo', current_date + 500, null);

-- ── 8. Alertas (6 — sempre com origem real: manutenção ou documento) ────
insert into public.scheduled_alerts (company_id, user_id, vehicle_id, maintenance_schedule_id, vehicle_document_id, title, category, scheduled_for, status, sent_at) values
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '32bc4eae-abcf-4049-b77f-016dfc745466', '15fe71cc-23c8-40ca-98b9-8315a6c65bfd', null, 'Manutenção: Freios', 'manutencao', current_date + 2 + interval '11 hours', 'pending', null),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', 'c5937ab5-5b50-4228-afc8-22b15b085793', 'a4991857-3c4f-4ef9-ba2e-4a74fdf36412', null, 'Manutenção: Revisão geral', 'manutencao', current_date + 5 + interval '11 hours', 'pending', null),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '92196f13-2586-46c8-ab39-76de5c39f0c4', null, '4eb53b56-16ba-4f11-9c07-b8379432a1c0', 'Licenciamento vencendo', 'documento', current_date + 5 + interval '11 hours', 'pending', null),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', null, null, '0ffa7cc3-c018-46eb-80be-49729d38dfc7', 'CNH de Paulo Henrique Costa vencendo', 'documento', current_date + 15 + interval '11 hours', 'pending', null),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '32bc4eae-abcf-4049-b77f-016dfc745466', null, '1166587a-f04d-427d-8f29-bcaedf2b0da1', 'Seguro vencido', 'documento', current_date - 5 + interval '11 hours', 'sent', current_date - 5 + interval '11 hours'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '11bfd950-eeb6-4002-a1e9-5d74177c069e', null, 'de7ad857-6f1d-431e-94b4-f76d16bee990', 'Seguro vencido', 'documento', current_date - 10 + interval '11 hours', 'sent', current_date - 10 + interval '11 hours');

-- ── 9. Despesas (30) ──────────────────────────────────────────────────────
insert into public.expenses (company_id, user_id, vehicle_id, maintenance_schedule_id, expense_type, amount, expense_date, vendor, description) values
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', 'b58ce095-8d28-4eb3-a12e-704e13e4f2dc', null, 'combustivel', 1850.00, current_date - 2, 'Posto Ipiranga BR-277', 'Abastecimento Curitiba → Campinas'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', 'e88f110a-bf45-4ec5-b4e8-063735073e03', null, 'combustivel', 2100.00, current_date - 3, 'Posto Graal Registro', 'Abastecimento Curitiba → São Paulo'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '32bc4eae-abcf-4049-b77f-016dfc745466', null, 'combustivel', 980.00, current_date - 4, 'Auto Posto Rocha', null),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', 'c5937ab5-5b50-4228-afc8-22b15b085793', null, 'combustivel', 1920.00, current_date - 5, 'Posto Ipiranga BR-277', null),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '9e4f6b91-d227-40b9-b41b-694da3e8f518', null, 'combustivel', 1450.00, current_date - 6, 'Posto Graal Registro', null),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '11bfd950-eeb6-4002-a1e9-5d74177c069e', null, 'combustivel', 1680.00, current_date - 7, 'Auto Posto Rocha', null),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '92196f13-2586-46c8-ab39-76de5c39f0c4', null, 'combustivel', 2050.00, current_date - 8, 'Posto Ipiranga BR-277', null),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '08ee5e61-c3a4-4d1d-88e0-8b5e4dc1a6ed', null, 'combustivel', 1780.00, current_date - 9, 'Posto Graal Registro', null),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '5e76ffa1-58c4-4a0b-b025-f19bfbf541e7', null, 'combustivel', 890.00, current_date - 11, 'Auto Posto Rocha', null),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '07c85ee4-fb53-428c-861e-254bbbb150c8', null, 'combustivel', 720.00, current_date - 12, 'Posto Ipiranga BR-277', null),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', 'b58ce095-8d28-4eb3-a12e-704e13e4f2dc', null, 'combustivel', 1990.00, current_date - 14, 'Posto Graal Registro', null),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', 'e88f110a-bf45-4ec5-b4e8-063735073e03', null, 'combustivel', 2200.00, current_date - 16, 'Posto Ipiranga BR-277', null),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '9e4f6b91-d227-40b9-b41b-694da3e8f518', '4b619e56-a77a-4b71-9f22-cc241938abfb', 'manutencao', 480.00, current_date - 3, 'Truck Center Curitiba', 'Troca de óleo + filtro'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', 'b58ce095-8d28-4eb3-a12e-704e13e4f2dc', null, 'manutencao', 320.00, current_date - 20, 'Oficina Diesel Sul', 'Troca de óleo'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '08ee5e61-c3a4-4d1d-88e0-8b5e4dc1a6ed', null, 'manutencao', 590.00, current_date - 10, 'Oficina Diesel Sul', 'Alinhamento e balanceamento'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '07c85ee4-fb53-428c-861e-254bbbb150c8', null, 'manutencao', 1750.00, current_date - 30, 'Truck Center Curitiba', 'Revisão geral 144.000 km'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '32bc4eae-abcf-4049-b77f-016dfc745466', null, 'manutencao', 210.00, current_date - 18, 'Oficina Diesel Sul', 'Peças - pastilha e disco'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '5e76ffa1-58c4-4a0b-b025-f19bfbf541e7', null, 'manutencao', 145.00, current_date - 22, 'Oficina Diesel Sul', 'Peças - correia'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', 'c5937ab5-5b50-4228-afc8-22b15b085793', null, 'pneu', 2380.00, current_date - 15, 'Pneus Rocha Sul', 'Par de pneus dianteiros'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '92196f13-2586-46c8-ab39-76de5c39f0c4', null, 'pneu', 2150.00, current_date - 25, 'Pneus Rocha Sul', null),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '11bfd950-eeb6-4002-a1e9-5d74177c069e', null, 'pneu', 940.00, current_date - 28, 'Pneus Rocha Sul', 'Pneu traseiro avulso'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', 'b58ce095-8d28-4eb3-a12e-704e13e4f2dc', null, 'pedagio', 168.00, current_date - 2, 'Arteris Litoral Sul', null),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', 'e88f110a-bf45-4ec5-b4e8-063735073e03', null, 'pedagio', 142.00, current_date - 3, 'CCR RodoNorte', null),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '32bc4eae-abcf-4049-b77f-016dfc745466', null, 'pedagio', 67.00, current_date - 4, 'Arteris Litoral Sul', null),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', 'c5937ab5-5b50-4228-afc8-22b15b085793', null, 'pedagio', 89.00, current_date - 6, 'CCR RodoNorte', null),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '9e4f6b91-d227-40b9-b41b-694da3e8f518', null, 'pedagio', 54.00, current_date - 9, 'Arteris Litoral Sul', null),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', 'b58ce095-8d28-4eb3-a12e-704e13e4f2dc', null, 'outro', 45.00, current_date - 2, 'Lava Rápido Curitiba', 'Lavagem completa'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '08ee5e61-c3a4-4d1d-88e0-8b5e4dc1a6ed', null, 'outro', 38.00, current_date - 12, 'Lava Rápido Curitiba', 'Lavagem completa'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '92196f13-2586-46c8-ab39-76de5c39f0c4', null, 'documentacao', 220.00, current_date - 8, 'Despachante Sul', 'Taxa de licenciamento'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '5e76ffa1-58c4-4a0b-b025-f19bfbf541e7', null, 'multa', 195.00, current_date - 17, 'DETRAN-PR', 'Excesso de velocidade');

-- ── 10. Análises de frete salvas (analysis_runs, 8) ──────────────────────
insert into public.analysis_runs (company_id, user_id, vehicle_id, analysis_type, user_request, result_summary, result_data, status, started_at, completed_at) values
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', 'b58ce095-8d28-4eb3-a12e-704e13e4f2dc', 'analisar_frete', 'Curitiba → Campinas por R$ 5.200, compensa?', 'Compensa: margem estimada de 18% sobre o custo total da viagem.', '{"origem":"Curitiba/PR","destino":"Campinas/SP","receita_centavos":520000,"custo_centavos":426000,"margem_percent":18,"compensa":true}', 'completed', now() - interval '2 days', now() - interval '2 days'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', 'e88f110a-bf45-4ec5-b4e8-063735073e03', 'analisar_frete', 'Curitiba → São Paulo por R$ 6.800, vale a pena?', 'Compensa: margem estimada de 22%, uma das melhores rotas do mês.', '{"origem":"Curitiba/PR","destino":"São Paulo/SP","receita_centavos":680000,"custo_centavos":530400,"margem_percent":22,"compensa":true}', 'completed', now() - interval '3 days', now() - interval '3 days'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '32bc4eae-abcf-4049-b77f-016dfc745466', 'analisar_frete', 'Joinville → Guarulhos por R$ 4.900, compensa?', 'Não compensa: margem negativa de 3% considerando pedágio e combustível da rota.', '{"origem":"Joinville/SC","destino":"Guarulhos/SP","receita_centavos":490000,"custo_centavos":504700,"margem_percent":-3,"compensa":false}', 'completed', now() - interval '5 days', now() - interval '5 days'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', 'c5937ab5-5b50-4228-afc8-22b15b085793', 'analisar_frete', 'Araucária → Goiânia por R$ 8.100, compensa?', 'Compensa: margem estimada de 15%, rota longa mas rentável.', '{"origem":"Araucária/PR","destino":"Goiânia/GO","receita_centavos":810000,"custo_centavos":688500,"margem_percent":15,"compensa":true}', 'completed', now() - interval '6 days', now() - interval '6 days'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '11bfd950-eeb6-4002-a1e9-5d74177c069e', 'analisar_frete', 'Itajaí → São Paulo por R$ 5.500, compensa?', 'No limite: margem de 9%, abaixo do ideal mas ainda positiva.', '{"origem":"Itajaí/SC","destino":"São Paulo/SP","receita_centavos":550000,"custo_centavos":500500,"margem_percent":9,"compensa":true}', 'completed', now() - interval '8 days', now() - interval '8 days'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '5e76ffa1-58c4-4a0b-b025-f19bfbf541e7', 'analisar_frete', 'Curitiba → Londrina por R$ 2.300, compensa?', 'Não compensa: margem negativa de 8%, valor abaixo do piso mínimo pra distância.', '{"origem":"Curitiba/PR","destino":"Londrina/PR","receita_centavos":230000,"custo_centavos":248400,"margem_percent":-8,"compensa":false}', 'completed', now() - interval '10 days', now() - interval '10 days'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '08ee5e61-c3a4-4d1d-88e0-8b5e4dc1a6ed', 'analisar_frete', 'Florianópolis → Campinas por R$ 6.100, vale a pena?', 'Compensa: margem estimada de 20%, boa rentabilidade pra distância.', '{"origem":"Florianópolis/SC","destino":"Campinas/SP","receita_centavos":610000,"custo_centavos":488000,"margem_percent":20,"compensa":true}', 'completed', now() - interval '12 days', now() - interval '12 days'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '9e4f6b91-d227-40b9-b41b-694da3e8f518', 'analisar_frete', 'Curitiba → Guarulhos por R$ 5.900, compensa?', 'Compensa: margem estimada de 12%.', '{"origem":"Curitiba/PR","destino":"Guarulhos/SP","receita_centavos":590000,"custo_centavos":519200,"margem_percent":12,"compensa":true}', 'completed', now() - interval '14 days', now() - interval '14 days');

-- ── 11. Radar de Fretes: radar + oportunidades (globais) + matches ──────
insert into public.freight_radars (id, company_id, user_id, vehicle_id, origin_city, origin_state, destination_region_label, status, expires_at)
values ('a61e39b2-24ab-45bf-8861-a7b123e691ed', '848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', null, 'Curitiba', 'PR', 'Sul e Sudeste', 'active', now() + interval '14 days');

insert into public.freight_opportunities (id, source, source_group_name, original_text, origin_city, origin_state, destination_city, destination_state, pickup_date, body_type, weight_kg, freight_value_cents, contact_text, status, expires_at) values
  ('a502e111-8f31-4bdd-82a0-7484b1571323', 'whatsapp_group', 'Cargas Sul Brasil', 'Carga sider Curitiba x Campinas, 12t, sai amanhã', 'Curitiba', 'PR', 'Campinas', 'SP', current_date + 1, 'sider', 12000, 540000, 'Falar com Vagner (41) 90000-1111', 'new', now() + interval '5 days'),
  ('ee1478d6-949f-4ff4-ad21-ef8ab2bfb156', 'whatsapp_group', 'Fretes Joinville', 'Graneleiro Joinville x SP, 22t, retirada essa semana', 'Joinville', 'SC', 'São Paulo', 'SP', current_date + 2, 'graneleiro', 22000, 720000, 'Falar com Marli (47) 90000-2222', 'new', now() + interval '4 days'),
  ('b178fcaa-0682-4cb0-8d1e-ad07b2f44013', 'whatsapp_group', 'Cargas Sul Brasil', 'Sider Araucária x Goiânia, 15t', 'Araucária', 'PR', 'Goiânia', 'GO', current_date + 3, 'sider', 15000, 850000, 'Falar com Deivid (41) 90000-3333', 'incomplete', now() + interval '6 days'),
  ('4d6c9796-2aa4-4b25-ab48-0c2d553a4dc2', 'whatsapp_group', 'Fretes Litoral', 'Baú Itajaí x Guarulhos, 9t', 'Itajaí', 'SC', 'Guarulhos', 'SP', current_date + 2, 'bau', 9000, 470000, 'Falar com Josi (47) 90000-4444', 'new', now() + interval '5 days'),
  ('a04084e0-5279-4188-844c-862594c16d63', 'whatsapp_group', 'Cargas Sul Brasil', 'Sider Curitiba x Londrina, 8t, valor baixo', 'Curitiba', 'PR', 'Londrina', 'PR', current_date + 1, 'sider', 8000, 210000, 'Falar com Ronaldo (41) 90000-5555', 'discarded', now() + interval '3 days'),
  ('8a9322be-4c6a-409a-b1ab-0ed0c094aa4e', 'whatsapp_group', 'Fretes Sul', 'Graneleiro Florianópolis x Campinas, 18t', 'Florianópolis', 'SC', 'Campinas', 'SP', current_date + 4, 'graneleiro', 18000, 630000, 'Falar com Suellen (48) 90000-6666', 'new', now() + interval '7 days');

insert into public.freight_opportunity_matches (opportunity_id, radar_id, company_id, vehicle_id, compatibility_score, status, decision) values
  ('a502e111-8f31-4bdd-82a0-7484b1571323', 'a61e39b2-24ab-45bf-8861-a7b123e691ed', '848b0ecc-7e55-4101-9549-15cc019406ad', 'b58ce095-8d28-4eb3-a12e-704e13e4f2dc', 92, 'new', null),
  ('ee1478d6-949f-4ff4-ad21-ef8ab2bfb156', 'a61e39b2-24ab-45bf-8861-a7b123e691ed', '848b0ecc-7e55-4101-9549-15cc019406ad', 'e88f110a-bf45-4ec5-b4e8-063735073e03', 85, 'notified', null),
  ('b178fcaa-0682-4cb0-8d1e-ad07b2f44013', 'a61e39b2-24ab-45bf-8861-a7b123e691ed', '848b0ecc-7e55-4101-9549-15cc019406ad', 'c5937ab5-5b50-4228-afc8-22b15b085793', 78, 'viewed', null),
  ('4d6c9796-2aa4-4b25-ab48-0c2d553a4dc2', 'a61e39b2-24ab-45bf-8861-a7b123e691ed', '848b0ecc-7e55-4101-9549-15cc019406ad', '11bfd950-eeb6-4002-a1e9-5d74177c069e', 65, 'analyzed', 'Compatível, aguardando confirmação do embarcador'),
  ('a04084e0-5279-4188-844c-862594c16d63', 'a61e39b2-24ab-45bf-8861-a7b123e691ed', '848b0ecc-7e55-4101-9549-15cc019406ad', null, 40, 'ignored', 'Frete abaixo do piso mínimo pra rota'),
  ('8a9322be-4c6a-409a-b1ab-0ed0c094aa4e', 'a61e39b2-24ab-45bf-8861-a7b123e691ed', '848b0ecc-7e55-4101-9549-15cc019406ad', '08ee5e61-c3a4-4d1d-88e0-8b5e4dc1a6ed', 88, 'favorited', null);

-- ── 12. Checklists (12, últimos 5 dias, mix pendente/ok/atenção) ────────
insert into public.checklist_dispatches (company_id, driver_id, vehicle_id, sent_at, responded_at, response_status, response_text) values
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '6a7cb346-027a-4aba-bdd4-20383be502e3', 'b58ce095-8d28-4eb3-a12e-704e13e4f2dc', current_date + interval '6 hours', current_date + interval '6 hours 12 minutes', 'ok', 'Tudo certo'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '5018ef47-ffbe-4316-add9-6fd19db05a36', 'e88f110a-bf45-4ec5-b4e8-063735073e03', current_date + interval '6 hours', null, 'pendente', null),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', 'e870d75e-05cb-44eb-9d42-27e8ce6964f1', 'c5937ab5-5b50-4228-afc8-22b15b085793', current_date + interval '6 hours', current_date + interval '6 hours 20 minutes', 'ok', 'Ok, tudo certo'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '410e22ca-20cb-46d5-84bc-1730251dd940', '92196f13-2586-46c8-ab39-76de5c39f0c4', current_date + interval '6 hours', current_date + interval '6 hours 25 minutes', 'atencao', 'Freio meio mole, precisa olhar antes de sair'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '710db8a0-cfe2-474f-8754-bd9f0b2b2b31', '08ee5e61-c3a4-4d1d-88e0-8b5e4dc1a6ed', current_date + interval '6 hours', null, 'pendente', null),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '98448f66-5432-41d3-9687-76f02cdaf47c', '32bc4eae-abcf-4049-b77f-016dfc745466', current_date - interval '1 day' + interval '6 hours', current_date - interval '1 day' + interval '6 hours 15 minutes', 'ok', 'Tudo certo'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', 'f1275b3c-15fd-4ef2-8304-12df07a352e8', '5e76ffa1-58c4-4a0b-b025-f19bfbf541e7', current_date - interval '1 day' + interval '6 hours', current_date - interval '1 day' + interval '6 hours 18 minutes', 'ok', 'Ok'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', 'fb49772a-1486-4d66-9fa7-142bf90f29cd', '9e4f6b91-d227-40b9-b41b-694da3e8f518', current_date - interval '1 day' + interval '6 hours', current_date - interval '1 day' + interval '6 hours 30 minutes', 'atencao', 'Farol direito queimado'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '6a7cb346-027a-4aba-bdd4-20383be502e3', 'b58ce095-8d28-4eb3-a12e-704e13e4f2dc', current_date - interval '2 days' + interval '6 hours', current_date - interval '2 days' + interval '6 hours 10 minutes', 'ok', 'Tudo certo'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '3c73d57b-7ed0-478c-97c3-1d5393833cf2', '11bfd950-eeb6-4002-a1e9-5d74177c069e', current_date - interval '2 days' + interval '6 hours', current_date - interval '2 days' + interval '6 hours 22 minutes', 'ok', 'Ok, sem problema'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '5018ef47-ffbe-4316-add9-6fd19db05a36', 'e88f110a-bf45-4ec5-b4e8-063735073e03', current_date - interval '3 days' + interval '6 hours', current_date - interval '3 days' + interval '6 hours 14 minutes', 'ok', 'Tudo certo'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '710db8a0-cfe2-474f-8754-bd9f0b2b2b31', '08ee5e61-c3a4-4d1d-88e0-8b5e4dc1a6ed', current_date - interval '3 days' + interval '6 hours', current_date - interval '3 days' + interval '6 hours 19 minutes', 'ok', 'Ok');

-- ── 13. Jornadas salvas (5) ───────────────────────────────────────────────
insert into public.saved_journeys (company_id, created_by_user_id, driver_id, vehicle_id, origin, destination, scheduled_departure, scheduled_arrival, actual_departure, actual_arrival, duration_minutes, status) values
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '6a7cb346-027a-4aba-bdd4-20383be502e3', 'b58ce095-8d28-4eb3-a12e-704e13e4f2dc', 'Curitiba/PR', 'Campinas/SP', now() - interval '2 days', now() - interval '2 days' + interval '9 hours', now() - interval '2 days', now() - interval '2 days' + interval '9 hours 20 minutes', 560, 'concluida'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '5018ef47-ffbe-4316-add9-6fd19db05a36', 'e88f110a-bf45-4ec5-b4e8-063735073e03', 'Curitiba/PR', 'São Paulo/SP', now() - interval '3 days', now() - interval '3 days' + interval '8 hours', now() - interval '3 days', now() - interval '3 days' + interval '8 hours 10 minutes', 490, 'concluida'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '98448f66-5432-41d3-9687-76f02cdaf47c', '32bc4eae-abcf-4049-b77f-016dfc745466', 'Joinville/SC', 'Guarulhos/SP', now(), now() + interval '10 hours', now(), null, null, 'em_andamento'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', 'e870d75e-05cb-44eb-9d42-27e8ce6964f1', 'c5937ab5-5b50-4228-afc8-22b15b085793', 'Araucária/PR', 'Goiânia/GO', now() + interval '2 days', now() + interval '2 days' + interval '14 hours', null, null, null, 'planejada'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', '3c73d57b-7ed0-478c-97c3-1d5393833cf2', '11bfd950-eeb6-4002-a1e9-5d74177c069e', 'Itajaí/SC', 'São Paulo/SP', now() - interval '8 days', now() - interval '8 days' + interval '9 hours', now() - interval '8 days', now() - interval '8 days' + interval '9 hours 15 minutes', 555, 'concluida');

-- ── 14. Rotas salvas (6) ──────────────────────────────────────────────────
insert into public.saved_routes (company_id, user_id, origin_name, origin_city, origin_state, destination_name, destination_city, destination_state, distance_km, estimated_duration_minutes, estimated_toll_cost, is_favorite, data_source) values
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', 'Curitiba/PR', 'Curitiba', 'PR', 'Campinas/SP', 'Campinas', 'SP', 550, 540, 168.00, true, 'manual'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', 'Curitiba/PR', 'Curitiba', 'PR', 'São Paulo/SP', 'São Paulo', 'SP', 408, 480, 142.00, true, 'manual'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', 'Joinville/SC', 'Joinville', 'SC', 'Guarulhos/SP', 'Guarulhos', 'SP', 605, 600, 195.00, true, 'manual'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', 'Araucária/PR', 'Araucária', 'PR', 'Goiânia/GO', 'Goiânia', 'GO', 1180, 840, 210.00, true, 'manual'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', 'Itajaí/SC', 'Itajaí', 'SC', 'São Paulo/SP', 'São Paulo', 'SP', 545, 555, 175.00, true, 'manual'),
  ('848b0ecc-7e55-4101-9549-15cc019406ad', '00000000-0000-0000-0000-000000000000', 'Curitiba/PR', 'Curitiba', 'PR', 'Londrina/PR', 'Londrina', 'PR', 380, 300, 45.00, false, 'manual');

-- ── 15. Memória de IA (contexto/narrativa) ───────────────────────────────
insert into public.ai_memories (company_id, user_id, memory_type, key, value_json, summary, source_type, confirmed_by_user) values
  ('848b0ecc-7e55-4101-9549-15cc019406ad', null, 'profile', 'initial_intent', '{"intentId":"fretes","intentLabel":"Fretes e oportunidades"}', 'No cadastro, o cliente disse que queria resolver primeiro: fretes e oportunidades.', 'user_explicit', true);

-- ── 16. Notícias do setor (global — 1 entrada realista) ──────────────────
insert into public.news_digests (content, generated_at)
values (
  'Resumo do setor de transporte rodoviário: o preço médio do diesel S10 segue estável na região Sul, com leve alta de 1,2% na última semana segundo a ANP. A ANTT reforçou a fiscalização do piso mínimo de frete em rodovias federais. Fretebras aponta aumento de 8% na demanda por cargas Sul-Sudeste no período.',
  now()
) on conflict do nothing;

-- Confira o resultado:
-- select 'veiculos' t, count(*) from public.vehicles where company_id = '848b0ecc-7e55-4101-9549-15cc019406ad'
-- union all select 'motoristas', count(*) from public.drivers where company_id = '848b0ecc-7e55-4101-9549-15cc019406ad';
