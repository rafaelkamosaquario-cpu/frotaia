import { describe, it, expect, vi } from "vitest";
import { isAccessAllowed, isFleetPanelAccessAllowed, getSubscription } from "./subscriptionService";
import type { SubscriptionRow } from "@/lib/supabase/tables";
import type { SupabaseDbClient } from "./types";

/**
 * Regressão do bug de valido_ate residual (08/2026): ao converter TRIAL →
 * plano recorrente (Individual/Gestão Mensal), o webhook grava
 * valido_ate=null explicitamente (ver route.ts) — sem isso, a data de
 * expiração do trial (+7 dias, criarAssinaturaTeste) ficava intocada no
 * banco e derrubava o acesso do cliente pago ~7 dias após o cadastro,
 * mesmo com status ATIVA e a assinatura em dia. Este teste cobre a
 * consequência dessa correção nas funções puras de acesso, simulando
 * exatamente o estado antes/depois da correção.
 */

const BASE: SubscriptionRow = {
  id: "sub-1",
  company_id: "empresa-1",
  plan: "MENSAL",
  status: "ATIVA",
  fleet_panel_included: false,
  valido_ate: null,
  valor_centavos: 7990,
  iniciado_em: new Date().toISOString(),
  trial_iniciado_em: null,
  trial_avisado_dia5: false,
  trial_avisado_ultimo_dia: false,
  mercadopago_subscription_id: "sub-mp-1",
  mercadopago_payment_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// 1. Empresa nasce em TRIAL com valido_ate = +7 dias (criarAssinaturaTeste).
const dataAntigaDoTrial = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // já expirada há 1 dia

describe("isAccessAllowed / isFleetPanelAccessAllowed — conversão TRIAL → recorrente", () => {
  it("2-4. após pagamento recorrente aprovado, status=ATIVA e valido_ate=NULL (correção aplicada pelo webhook)", () => {
    const assinaturaCorrigida: SubscriptionRow = { ...BASE, status: "ATIVA", valido_ate: null };
    expect(assinaturaCorrigida.status).toBe("ATIVA");
    expect(assinaturaCorrigida.valido_ate).toBeNull();
  });

  it("5. isAccessAllowed continua true mesmo muito depois da antiga data do trial, porque valido_ate foi limpo (null)", () => {
    const assinaturaIndividualAtiva: SubscriptionRow = { ...BASE, plan: "MENSAL", status: "ATIVA", fleet_panel_included: false, valido_ate: null };
    expect(isAccessAllowed(assinaturaIndividualAtiva)).toBe(true);
  });

  it("6. para Gestão Mensal, isFleetPanelAccessAllowed também continua true com valido_ate=null", () => {
    const assinaturaGestaoAtiva: SubscriptionRow = { ...BASE, plan: "GESTAO_MENSAL", status: "ATIVA", fleet_panel_included: true, valido_ate: null };
    expect(isAccessAllowed(assinaturaGestaoAtiva)).toBe(true);
    expect(isFleetPanelAccessAllowed(assinaturaGestaoAtiva)).toBe(true);
  });

  it("comportamento do bug (documentação): se valido_ate NÃO fosse limpo, a data residual do trial bloquearia o acesso mesmo com status ATIVA", () => {
    const assinaturaComBugSimulado: SubscriptionRow = { ...BASE, status: "ATIVA", valido_ate: dataAntigaDoTrial };
    expect(isAccessAllowed(assinaturaComBugSimulado)).toBe(false);
  });

  it("planos anuais continuam usando valido_ate normalmente (não afetados pela correção)", () => {
    const emDentroDoPrazo = new Date(Date.now() + 300 * 24 * 60 * 60 * 1000).toISOString();
    const foraDoPrazo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    expect(isAccessAllowed({ ...BASE, plan: "ANUAL_PIX", status: "ATIVA", valido_ate: emDentroDoPrazo })).toBe(true);
    expect(isAccessAllowed({ ...BASE, plan: "ANUAL_PIX", status: "ATIVA", valido_ate: foraDoPrazo })).toBe(false);
  });
});

/**
 * Fechamento de coerência (08/2026): plano ANUAL vencido ficava com
 * status="ATIVA" pra sempre (isAccessAllowed já bloqueava certo pela data,
 * mas o status em si nunca refletia isso). getSubscription agora corrige
 * isso de forma reativa (nunca um cron novo) na primeira leitura depois do
 * vencimento — este bloco mocka o client Supabase pra cobrir esse caminho.
 */
function clienteMock(selecionado: SubscriptionRow | null, atualizado?: SubscriptionRow | null) {
  const maybeSingleSelect = vi.fn().mockResolvedValue({ data: selecionado, error: null });
  const maybeSingleUpdate = vi.fn().mockResolvedValue({ data: atualizado ?? null, error: null });

  const selectChain = { eq: vi.fn(() => ({ maybeSingle: maybeSingleSelect })) };
  const updateChain = { eq: vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle: maybeSingleUpdate })) })) })) };

  const from = vi.fn(() => ({
    select: vi.fn(() => selectChain),
    update: vi.fn(() => updateChain),
  }));

  return { client: { from } as unknown as SupabaseDbClient, maybeSingleUpdate };
}

describe("getSubscription — corrige status ATIVA→EXPIRADA de plano anual vencido (08/2026)", () => {
  it("plano anual vencido (status ATIVA, valido_ate no passado) é corrigido pra EXPIRADA na leitura", async () => {
    const vencido: SubscriptionRow = { ...BASE, plan: "ANUAL_PIX", status: "ATIVA", valido_ate: new Date(Date.now() - 86400000).toISOString() };
    const corrigido: SubscriptionRow = { ...vencido, status: "EXPIRADA" };
    const { client, maybeSingleUpdate } = clienteMock(vencido, corrigido);

    const resultado = await getSubscription(client, "empresa-1");

    expect(resultado?.status).toBe("EXPIRADA");
    expect(maybeSingleUpdate).toHaveBeenCalled();
  });

  it("plano anual dentro do prazo (ATIVA, valido_ate no futuro) NUNCA é corrigido", async () => {
    const emDia: SubscriptionRow = { ...BASE, plan: "ANUAL_PIX", status: "ATIVA", valido_ate: new Date(Date.now() + 86400000).toISOString() };
    const { client, maybeSingleUpdate } = clienteMock(emDia);

    const resultado = await getSubscription(client, "empresa-1");

    expect(resultado?.status).toBe("ATIVA");
    expect(maybeSingleUpdate).not.toHaveBeenCalled();
  });

  it("plano recorrente ATIVA com valido_ate=null NUNCA é tratado como vencido (regra explícita: nunca quebrar recorrente)", async () => {
    const recorrente: SubscriptionRow = { ...BASE, plan: "GESTAO_MENSAL", status: "ATIVA", valido_ate: null };
    const { client, maybeSingleUpdate } = clienteMock(recorrente);

    const resultado = await getSubscription(client, "empresa-1");

    expect(resultado?.status).toBe("ATIVA");
    expect(maybeSingleUpdate).not.toHaveBeenCalled();
  });

  it("status já EXPIRADA/CANCELADA/INADIMPLENTE nunca dispara nova correção", async () => {
    const jaExpirada: SubscriptionRow = { ...BASE, plan: "ANUAL_PIX", status: "EXPIRADA", valido_ate: new Date(Date.now() - 86400000).toISOString() };
    const { client, maybeSingleUpdate } = clienteMock(jaExpirada);

    const resultado = await getSubscription(client, "empresa-1");

    expect(resultado?.status).toBe("EXPIRADA");
    expect(maybeSingleUpdate).not.toHaveBeenCalled();
  });

  it("falha ao corrigir o status nunca quebra a leitura — devolve o dado original (isAccessAllowed já bloqueia certo pela data de qualquer forma)", async () => {
    const vencido: SubscriptionRow = { ...BASE, plan: "ANUAL_PIX", status: "ATIVA", valido_ate: new Date(Date.now() - 86400000).toISOString() };
    const { client } = clienteMock(vencido, null); // update não encontra linha (ex.: corrida concorrente) — devolve null

    const resultado = await getSubscription(client, "empresa-1");

    expect(resultado?.status).toBe("ATIVA"); // fallback pro dado original, nunca lança
  });

  it("empresa sem assinatura nenhuma devolve null sem tentar corrigir nada", async () => {
    const { client, maybeSingleUpdate } = clienteMock(null);
    const resultado = await getSubscription(client, "empresa-sem-assinatura");
    expect(resultado).toBeNull();
    expect(maybeSingleUpdate).not.toHaveBeenCalled();
  });
});
