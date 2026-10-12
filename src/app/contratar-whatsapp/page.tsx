import { CATALOGO_OFERTAS, formatarReais } from "@/lib/mercadopago/catalog";
import { DIRECT_PLANS, directSalesUrl } from "@/lib/mercadopago/directSales";

export default function Page() {
  return <main className="min-h-dvh bg-background p-5 text-foreground sm:p-10"><div className="mx-auto max-w-4xl space-y-6">
    <a className="underline" href="https://landepage.frotaia.app.br/">Voltar à página do Frota IA</a>
    <h1 className="text-3xl font-semibold">Seu Frota IA, preparado para trabalhar</h1>
    <p>Individual: seu assistente pelo WhatsApp. Para usar o painel, Rafael configura sua empresa, os veículos e os módulos antes da entrega. Atendimento RodaCore: (41) 99729-5836.</p>
    <ol className="grid gap-3 sm:grid-cols-3">{["1. Conte como sua frota trabalha", "2. Combine configuração e pagamento", "3. Receba seu painel preparado"].map(step => <li key={step} className="rounded-lg border border-border p-4">{step}</li>)}</ol>
    <div className="grid gap-4 sm:grid-cols-2">{DIRECT_PLANS.map(plan => { const o = CATALOGO_OFERTAS[plan]; return <article key={plan} className="space-y-3 rounded-xl border border-border p-5">
      <h2 className="text-xl font-semibold">{o.label}</h2><p>{formatarReais(o.precoCentavos)} · {plan.includes("ANUAL") ? "anual (365 dias)" : "mensal"}</p>
      <p>Até {o.limiteVeiculos} veículo(s) · {o.painel ? "WhatsApp + painel configurado" : "Direto no WhatsApp"}</p>
      <p className="text-sm text-muted-foreground">{o.painel ? "Módulos conforme sua operação. Pagamento e entrega do painel são combinados no atendimento." : "Pix com conferência manual do recebimento. Sem renovação automática neste atendimento."}</p>
      <a className="inline-block rounded-lg bg-primary p-3 text-primary-foreground" href={directSalesUrl(plan)} target="_blank" rel="noopener noreferrer">{o.painel ? "Solicitar configuração com Rafael" : "Contratar Individual com Rafael"}</a>
    </article>; })}</div>
    <p>Prefere contratar o Individual pelo atendimento automático? <a className="underline" href="https://wa.me/5541997454382?text=Quero%20assinar%20o%20Frota%20IA%20Individual">Continue pelo Frota IA no WhatsApp</a>. Abrir um link não ativa nenhum plano.</p>
  </div></main>;
}
