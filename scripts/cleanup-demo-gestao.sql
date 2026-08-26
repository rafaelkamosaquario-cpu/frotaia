-- Frota IA — Limpeza do seed de demo "Transportes Rocha Sul" (08/2026).
-- Reverte exatamente o que scripts/seed-demo-gestao.sql criou — nunca toca
-- em dados de outra empresa. Ordem respeita as FKs (filhos antes dos pais).
-- Os registros GLOBAIS (freight_opportunities, news_digests) são apagados
-- pelos IDs fixos do seed, nunca por company_id (eles não têm company_id).

do $$
declare
  v_company_id uuid := '848b0ecc-7e55-4101-9549-15cc019406ad';
begin
  delete from public.scheduled_alerts where company_id = v_company_id;
  delete from public.checklist_dispatches where company_id = v_company_id;
  delete from public.freight_opportunity_matches where company_id = v_company_id;
  delete from public.freight_radars where company_id = v_company_id;
  delete from public.vehicle_documents where company_id = v_company_id;
  delete from public.expenses where company_id = v_company_id;
  delete from public.maintenance_schedules where company_id = v_company_id;
  delete from public.saved_journeys where company_id = v_company_id;
  delete from public.saved_routes where company_id = v_company_id;
  delete from public.analysis_runs where company_id = v_company_id;
  delete from public.ai_memories where company_id = v_company_id;
  delete from public.company_preferences where company_id = v_company_id;
  delete from public.subscriptions where company_id = v_company_id;
  delete from public.drivers where company_id = v_company_id;
  delete from public.vehicles where company_id = v_company_id;
  delete from public.company_members where company_id = v_company_id;
  delete from public.companies where id = v_company_id;
end $$;

-- Oportunidades globais criadas pelo seed (IDs fixos, nunca apaga outras).
delete from public.freight_opportunities where id in (
  'a502e111-8f31-4bdd-82a0-7484b1571323', 'ee1478d6-949f-4ff4-ad21-ef8ab2bfb156',
  'b178fcaa-0682-4cb0-8d1e-ad07b2f44013', '4d6c9796-2aa4-4b25-ab48-0c2d553a4dc2',
  'a04084e0-5279-4188-844c-862594c16d63', '8a9322be-4c6a-409a-b1ab-0ed0c094aa4e'
);

-- Notícia global do seed — comentada por padrão: apagar isso remove uma
-- notícia que TODAS as empresas veem, não só a demo. Descomente se quiser
-- mesmo assim.
-- delete from public.news_digests where content like 'Resumo do setor de transporte rodoviário: o preço médio do diesel S10%';

-- profiles.full_name/phone_e164 do dono NÃO são revertidos automaticamente
-- (o script não sabia o nome/telefone originais) — ajuste manualmente se
-- precisar voltar ao nome real da conta.
