-- Fechamento final Mercado Pago (08/2026): antes, se o cancelamento do
-- preapproval ANTERIOR falhasse depois da troca de plano (novo plano já
-- ativo), o ID antigo não ficava persistido em lugar nenhum — só num campo
-- local da função e num log passageiro (sem SENTRY_DSN configurado, nem
-- isso). Risco residual: preapproval antigo podia continuar cobrando
-- indefinidamente, sem qualquer forma de descobrir ou corrigir depois.
--
-- Reaproveita a linha 1:1 já existente em `subscriptions` (menor mudança
-- possível — sem tabela nova, sem fila). Array (não um único campo) porque
-- uma empresa pode, em tese, trocar de plano de novo antes da reconciliação
-- resolver a pendência anterior — sem array, o segundo cancelamento pendente
-- sobrescreveria e perderia o primeiro.
alter table public.subscriptions
  add column pending_preapproval_cancellations jsonb not null default '[]'::jsonb;

comment on column public.subscriptions.pending_preapproval_cancellations is
  'Array de cancelamentos de preapproval (Mercado Pago) ainda não confirmados como concluídos. Cada item: {preapprovalId, status: "pending"|"failed", attempts, lastAttemptAt, lastError}. Item removido do array assim que o cancelamento é confirmado (sucesso). "failed" = tentativas esgotadas ou erro permanente, requer ação manual. Nunca editar diretamente — usar upsert_pending_preapproval_cancellation/resolve_pending_preapproval_cancellation.';

-- ── upsert (registra tentativa, com ou sem sucesso) ─────────────────────
--
-- `for update` trava a linha da empresa durante a leitura-modificação-escrita
-- — evita perder uma entrada em caso de duas chamadas concorrentes pra
-- mesma empresa (ex.: webhook + reconciliação rodando ao mesmo tempo).
create or replace function public.upsert_pending_preapproval_cancellation(
  p_company_id uuid,
  p_preapproval_id text,
  p_status text,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current jsonb;
  v_found boolean := false;
  v_updated jsonb := '[]'::jsonb;
  v_item jsonb;
begin
  select pending_preapproval_cancellations into v_current
  from public.subscriptions
  where company_id = p_company_id
  for update;

  if v_current is null then
    v_current := '[]'::jsonb;
  end if;

  for v_item in select * from jsonb_array_elements(v_current)
  loop
    if v_item->>'preapprovalId' = p_preapproval_id then
      v_item := jsonb_build_object(
        'preapprovalId', p_preapproval_id,
        'status', p_status,
        'attempts', coalesce((v_item->>'attempts')::int, 0) + 1,
        'lastAttemptAt', to_jsonb(now())::text,
        'lastError', p_error
      );
      v_found := true;
    end if;
    v_updated := v_updated || jsonb_build_array(v_item);
  end loop;

  if not v_found then
    v_updated := v_updated || jsonb_build_array(jsonb_build_object(
      'preapprovalId', p_preapproval_id,
      'status', p_status,
      'attempts', 1,
      'lastAttemptAt', to_jsonb(now())::text,
      'lastError', p_error
    ));
  end if;

  update public.subscriptions
    set pending_preapproval_cancellations = v_updated
    where company_id = p_company_id;
end;
$$;

comment on function public.upsert_pending_preapproval_cancellation(uuid, text, text, text) is
  'Registra (cria ou atualiza) uma tentativa de cancelamento de preapproval anterior pendente/com falha, sem perder entradas concorrentes. Uso restrito a service_role.';

revoke execute on function public.upsert_pending_preapproval_cancellation(uuid, text, text, text) from public;
revoke execute on function public.upsert_pending_preapproval_cancellation(uuid, text, text, text) from anon;
revoke execute on function public.upsert_pending_preapproval_cancellation(uuid, text, text, text) from authenticated;
grant execute on function public.upsert_pending_preapproval_cancellation(uuid, text, text, text) to service_role;

-- ── resolve (remove do array quando o cancelamento é confirmado) ───────
create or replace function public.resolve_pending_preapproval_cancellation(
  p_company_id uuid,
  p_preapproval_id text
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.subscriptions
  set pending_preapproval_cancellations = (
    select coalesce(jsonb_agg(item), '[]'::jsonb)
    from jsonb_array_elements(pending_preapproval_cancellations) as item
    where item->>'preapprovalId' <> p_preapproval_id
  )
  where company_id = p_company_id;
$$;

comment on function public.resolve_pending_preapproval_cancellation(uuid, text) is
  'Remove um preapproval do array de cancelamentos pendentes depois de confirmado como cancelado (sucesso). Uso restrito a service_role.';

revoke execute on function public.resolve_pending_preapproval_cancellation(uuid, text) from public;
revoke execute on function public.resolve_pending_preapproval_cancellation(uuid, text) from anon;
revoke execute on function public.resolve_pending_preapproval_cancellation(uuid, text) from authenticated;
grant execute on function public.resolve_pending_preapproval_cancellation(uuid, text) to service_role;
