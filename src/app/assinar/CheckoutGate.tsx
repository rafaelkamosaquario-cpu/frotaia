"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { LogoMark } from "@/components/icons/Logo";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { CATALOGO_OFERTAS, formatarReais, type OfertaCatalogo, type OfertaPlano } from "@/lib/mercadopago/catalog";
import { criarCheckoutAction } from "./actions";
import type { MetodoCheckout } from "@/lib/mercadopago/paymentOptions";

/**
 * Gate de contratação (09/2026, estrutura Individual/Essencial/Pro) —
 * seleção de plano (tier) × forma de cobrança (mensal recorrente / anual
 * Pix / anual cartão parcelado), com o e-mail só sendo pedido pro fluxo
 * recorrente (mensal). Mobile-first, sem exigir login/Google/Calendar — é
 * só um resumo de contratação, não é o painel nem o onboarding.
 */

type Tier = "INDIVIDUAL" | "ESSENCIAL" | "PRO";
type Frequencia = "MENSAL" | "ANUAL";
type MetodoAnual = "PIX" | "PARCELADO";

const TIERS: { tier: Tier; nome: string; beneficios: string[] }[] = [
  {
    tier: "INDIVIDUAL",
    nome: "Frota IA Individual",
    beneficios: ["Frota IA pelo WhatsApp", "1 veículo", "Fretes, custos, rotas e manutenção", "Radar de Fretes", "Alertas e lembretes"],
  },
  {
    tier: "ESSENCIAL",
    nome: "Frota IA Essencial",
    beneficios: ["Tudo do Individual", "WhatsApp + Painel Web", "Até 3 veículos", "Motoristas, despesas e manutenção", "Dashboard + Google Agenda"],
  },
  {
    tier: "PRO",
    nome: "Frota IA Pro",
    beneficios: ["Tudo do Essencial", "Até 10 veículos", "Checklists e relatórios", "Dashboard completo"],
  },
];

function resolverPlano(tier: Tier, frequencia: Frequencia, metodoAnual: MetodoAnual): OfertaPlano {
  if (frequencia === "MENSAL") return `${tier}_MENSAL` as OfertaPlano;
  return metodoAnual === "PIX" ? (`${tier}_ANUAL_PIX` as OfertaPlano) : (`${tier}_ANUAL_PARCELADO` as OfertaPlano);
}

function derivarEstadoInicial(planoPreSelecionado: OfertaPlano): { tier: Tier; frequencia: Frequencia; metodoAnual: MetodoAnual } {
  const tier = planoPreSelecionado.startsWith("ESSENCIAL") ? "ESSENCIAL" : planoPreSelecionado.startsWith("PRO") ? "PRO" : "INDIVIDUAL";
  const frequencia: Frequencia = planoPreSelecionado.includes("ANUAL") ? "ANUAL" : "MENSAL";
  const metodoAnual: MetodoAnual = planoPreSelecionado.endsWith("_PIX") ? "PIX" : "PARCELADO";
  return { tier, frequencia, metodoAnual };
}

interface CheckoutGateProps {
  checkoutToken: string;
  companyName: string;
  planoPreSelecionado: OfertaPlano;
}

export function CheckoutGate({ checkoutToken, companyName, planoPreSelecionado }: CheckoutGateProps) {
  const inicial = derivarEstadoInicial(planoPreSelecionado);
  const [tier, setTier] = useState<Tier>(inicial.tier);
  const [frequencia, setFrequencia] = useState<Frequencia>(inicial.frequencia);
  const [metodoAnual, setMetodoAnual] = useState<MetodoAnual>(inicial.metodoAnual);
  const [metodo, setMetodo] = useState<MetodoCheckout>(inicial.frequencia === "MENSAL" ? "recorrente" : inicial.metodoAnual === "PIX" ? "pix" : "credito");
  const [mostrarEmail, setMostrarEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const plano = resolverPlano(tier, frequencia, metodoAnual);
  const oferta = CATALOGO_OFERTAS[plano];
  const infoTier = TIERS.find((t) => t.tier === tier)!;

  async function confirmar(emailInformado?: string) {
    setErro(null);
    setEnviando(true);
    try {
      const resultado = await criarCheckoutAction(checkoutToken, plano, emailInformado, metodo);
      if (resultado.error || !resultado.initPoint) {
        setErro(resultado.error ?? "Não recebemos o link de pagamento. Tente novamente.");
        return;
      }
      window.location.href = resultado.initPoint;
    } catch {
      setErro("Não foi possível abrir o pagamento. Tente novamente em instantes.");
    } finally {
      setEnviando(false);
    }
  }

  function continuar() {
    if (metodo === "recorrente") {
      setMostrarEmail(true);
      return;
    }
    void confirmar();
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md p-6">
        <div className="mb-5 flex items-center gap-3">
          <LogoMark className="size-8" />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contratação</p>
            <h1 className="text-sm font-semibold text-foreground">{companyName}</h1>
          </div>
        </div>

        {!mostrarEmail ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {TIERS.map((t) => (
                <button
                  key={t.tier}
                  type="button"
                  onClick={() => setTier(t.tier)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    tier === t.tier ? "border-primary bg-primary/5" : "border-border"
                  )}
                >
                  <p className="text-xs font-semibold text-foreground">{t.nome.replace("Frota IA ", "")}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {formatarReais(CATALOGO_OFERTAS[`${t.tier}_MENSAL` as OfertaPlano].precoCentavos)}
                    <span className="text-[11px] font-normal text-muted-foreground">/mês</span>
                  </p>
                </button>
              ))}
            </div>

            <div className="flex rounded-lg border border-border p-1">
              <button
                type="button"
                onClick={() => setFrequencia("MENSAL")}
                className={cn("flex-1 rounded-md py-1.5 text-sm font-medium transition-colors", frequencia === "MENSAL" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
              >
                Mensal
              </button>
              <button
                type="button"
                onClick={() => { setFrequencia("ANUAL"); if (metodo === "recorrente") setMetodo("credito"); }}
                className={cn("flex-1 rounded-md py-1.5 text-sm font-medium transition-colors", frequencia === "ANUAL" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
              >
                Anual
              </button>
            </div>

            <fieldset className="space-y-2" disabled={enviando}>
              <legend className="mb-2 text-sm font-semibold">Forma de pagamento</legend>
              {([
                { id: "credito", label: "Cartão de crédito", detail: frequencia === "ANUAL" ? "Até 12 parcelas; condições e juros no Mercado Pago." : "Pagamento de um mês, sem renovação automática." },
                { id: "debito", label: "Cartão de débito", detail: "À vista. Somente cartões disponibilizados pelo Mercado Pago, como débito virtual Caixa. Se indisponível, escolha Pix ou crédito." },
                { id: "pix", label: "Pix", detail: "À vista, sem renovação automática." },
                ...(frequencia === "MENSAL" ? [{ id: "recorrente", label: "Crédito com renovação automática", detail: "Cobrança mensal recorrente no cartão de crédito." }] : []),
              ] as { id: MetodoCheckout; label: string; detail: string }[]).map((option) => (
                <label key={option.id} className={cn("block cursor-pointer rounded-lg border p-3", metodo === option.id ? "border-primary bg-primary/5" : "border-border")}>
                  <input type="radio" name="metodo" value={option.id} checked={metodo === option.id} onChange={() => { setMetodo(option.id); setMetodoAnual(option.id === "pix" ? "PIX" : "PARCELADO"); setErro(null); }} className="mr-2" />
                  <span className="text-sm font-semibold">{option.label}</span>
                  <p className="mt-1 text-xs text-muted-foreground">{option.detail}</p>
                </label>
              ))}
            </fieldset>

            <Card className="border-primary/40 bg-primary/5 p-4">
              <p className="text-sm font-semibold text-foreground">{infoTier.nome}</p>
              <p className="text-2xl font-semibold text-foreground">
                {frequencia === "ANUAL" && metodo === "credito" ? (
                  <>
                    {formatarReais(oferta.precoCentavos)} no total
                  </>
                ) : (
                  formatarReais(oferta.precoCentavos)
                )}
                {frequencia === "MENSAL" && <span className="text-sm font-normal text-muted-foreground">/mês</span>}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {metodo === "recorrente" ? "Renovação automática mensal." : `${frequencia === "MENSAL" ? "1 mês" : "12 meses"} de acesso após pagamento aprovado. Sem renovação automática; ao vencer, será necessário pagar novamente.`}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {oferta.limiteVeiculos} veículo{oferta.limiteVeiculos > 1 ? "s" : ""} · WhatsApp{oferta.painel ? " + Painel" : ""}
              </p>
              <ul className="mt-3 space-y-1.5">
                {infoTier.beneficios.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="size-3.5 text-primary" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>

            {erro && <p className="text-sm text-danger">{erro}</p>}

            <Button size="lg" className="w-full" onClick={continuar} isLoading={enviando}>
              {metodo === "recorrente" ? "Continuar" : "Ir para pagamento"}
            </Button>
          </div>
        ) : (
          <EtapaEmail oferta={oferta} nomeTier={infoTier.nome} email={email} setEmail={setEmail} erro={erro} enviando={enviando} onVoltar={() => setMostrarEmail(false)} onConfirmar={() => confirmar(email)} />
        )}
      </Card>
    </div>
  );
}

interface EtapaEmailProps {
  oferta: OfertaCatalogo;
  nomeTier: string;
  email: string;
  setEmail: (v: string) => void;
  erro: string | null;
  enviando: boolean;
  onVoltar: () => void;
  onConfirmar: () => void;
}

function EtapaEmail({ oferta, nomeTier, email, setEmail, erro, enviando, onVoltar, onConfirmar }: EtapaEmailProps) {
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-sm font-semibold text-foreground">{nomeTier}</p>
        <p className="text-2xl font-semibold text-foreground">
          {formatarReais(oferta.precoCentavos)}
          <span className="text-sm font-normal text-muted-foreground">/mês</span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {oferta.limiteVeiculos} veículo{oferta.limiteVeiculos > 1 ? "s" : ""} · WhatsApp{oferta.painel ? " + Painel" : ""}
        </p>
      </Card>

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground">
          Seu e-mail (necessário pra assinatura recorrente)
        </label>
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" autoFocus />
      </div>

      {erro && <p className="text-sm text-danger">{erro}</p>}

      <Button size="lg" className="w-full" onClick={onConfirmar} isLoading={enviando}>
        Ir para pagamento
      </Button>
      <button type="button" onClick={onVoltar} className="w-full text-center text-sm text-muted-foreground hover:underline">
        Trocar plano
      </button>
    </div>
  );
}
