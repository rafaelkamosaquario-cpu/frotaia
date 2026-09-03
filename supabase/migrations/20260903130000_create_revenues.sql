-- Rodada de evolução funcional 09/2026 (item 5/5, comparação com sistema
-- de planilha "Frota 7.15") — receita de frete estruturada, espelhando
-- expenses linha por linha. Hoje NÃO existe nenhuma coluna estruturada de
-- receita: o valor de um frete fica preso dentro de JSON variável em
-- analysis_runs.result_data, não é agregável com confiança. analysis_run_id
-- aqui é só rastreabilidade (qual análise originou a receita, quando houver)
-- — nunca populado automaticamente a partir de analisar_frete/simulação.

create table public.revenues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  driver_id uuid references public.drivers (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  analysis_run_id uuid references public.analysis_runs (id) on delete set null,
  amount numeric not null,
  revenue_date date not null,
  description text,
  created_at timestamptz not null default now(),
  constraint revenues_amount_positive check (amount > 0)
);

comment on table public.revenues is
  'Receita de frete registrada pelo cliente — só depois que ele confirmar que o frete foi fechado/aceito de verdade, nunca a partir de uma simulação/comparação de propostas do analisar_frete (ver regra no system prompt). analysis_run_id é rastreabilidade opcional até a análise que originou a receita, quando houver. Junto com expenses, alimenta o bloco "Resultado (período)" de Relatórios (relatoriosAggregation.ts).';

create index revenues_company_period_idx on public.revenues (company_id, revenue_date);
create index revenues_vehicle_period_idx on public.revenues (vehicle_id, revenue_date) where vehicle_id is not null;

alter table public.revenues enable row level security;

create policy revenues_select_member on public.revenues
  for select using (public.is_company_member(company_id));

-- Sem policy de insert/update/delete: mesmo padrão de segurança de expenses —
-- só o backend (client admin, via registrar_receita e as rotas do painel)
-- grava aqui, nunca há sessão de navegador tocando nesta tabela diretamente.
