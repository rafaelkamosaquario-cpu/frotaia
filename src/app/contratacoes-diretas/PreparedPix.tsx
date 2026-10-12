"use client";
import { useState } from "react";
import { CATALOGO_OFERTAS, formatarReais } from "@/lib/mercadopago/catalog";
import { DIRECT_PLANS, type DirectPlan } from "@/lib/mercadopago/directSales";
import { MANUAL_PIX_KEY, manualPixCode, manualPixMessage } from "@/lib/mercadopago/manualPix";

export function PreparedPix({ plan, onPlanChange }: { plan: DirectPlan; onPlanChange: (plan: DirectPlan) => void }) {
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);
  const offer = CATALOGO_OFERTAS[plan];
  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); setFailed(false); setNotice(`${label} copiado. Cole na conversa do cliente.`); }
    catch { setFailed(true); setNotice("Não foi possível copiar automaticamente. Selecione o texto no campo e copie manualmente."); }
  }
  return <section className="rounded-xl border border-primary/40 p-5 space-y-4" aria-labelledby="prepared-pix-title">
    <h2 id="prepared-pix-title" className="text-xl font-semibold">1. Copiar cobrança Pix para o cliente</h2>
    <p>Escolha o plano e copie a mensagem pronta. Não precisa gerar um novo código no Mercado Pago.</p>
    <label className="block">Plano da mensagem<select className="mt-1 block w-full rounded-lg border border-border bg-background p-3" value={plan} onChange={e => { onPlanChange(e.target.value as DirectPlan); setNotice(""); }}>{DIRECT_PLANS.map(p => <option key={p} value={p}>{CATALOGO_OFERTAS[p].label} · {formatarReais(CATALOGO_OFERTAS[p].precoCentavos)}</option>)}</select></label>
    <p className="font-semibold">{formatarReais(offer.precoCentavos)} · Chave celular: {MANUAL_PIX_KEY}</p>
    <label className="block">Mensagem pronta<textarea readOnly className="mt-1 block min-h-80 w-full rounded-lg border border-border bg-background p-3 text-sm" value={manualPixMessage(plan)} /></label>
    <div className="flex flex-wrap gap-3">
      <button type="button" className="rounded-lg bg-primary p-3 text-primary-foreground" onClick={() => copy(manualPixMessage(plan), "Mensagem")}>Copiar mensagem de pagamento</button>
      <button type="button" className="rounded-lg border p-3" onClick={() => copy(manualPixCode(plan), "Pix Copia e Cola")}>Copiar somente Pix</button>
    </div>
    {notice && <p role={failed ? "alert" : "status"}>{notice}</p>}
    <p className="text-sm text-muted-foreground">Pix estático: o código é reutilizável para este plano e não identifica sozinho o cliente. Não cria cobrança na API do Mercado Pago, não confirma recebimento e não libera acesso. Confira o titular da chave e faça um teste no banco antes do primeiro envio. Depois de receber, use a etapa abaixo com o ID real da transação.</p>
  </section>;
}
