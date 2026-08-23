"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { LogoMark } from "@/components/icons/Logo";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { CATALOGO_OFERTAS, formatarReais, PRECO_UPSELL_GESTAO_CENTAVOS, type OfertaPlano } from "@/lib/mercadopago/catalog";
import { criarCheckoutAction } from "./actions";

/** Repassado a cada variante — companyId não é secreto (é só um id interno), mas todo o resto (preço/entitlement) é sempre resolvido de novo no servidor a partir do plano escolhido, nunca confiado do cliente. */
interface EtapaProps {
  companyId: string;
}

/**
 * Gate de contratação — 2 variantes, decididas pelo plano que o cliente
 * pediu no WhatsApp (`planoPreSelecionado`). Mobile-first, sem exigir
 * login/Google/Calendar — é só um resumo de contratação, não é o painel
 * nem o onboarding.
 */

const BENEFICIOS_GESTAO = ["Painel Web", "Até 10 veículos", "Motoristas", "Checklists", "Dashboard", "Gestão da frota"];

interface CheckoutGateProps {
  companyId: string;
  companyName: string;
  planoPreSelecionado: OfertaPlano;
}

export function CheckoutGate({ companyId, companyName, planoPreSelecionado }: CheckoutGateProps) {
  const ehAnual = planoPreSelecionado === "ANUAL_PARCELADO" || planoPreSelecionado === "ANUAL_PIX";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-3">
          <LogoMark className="size-8" />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contratação</p>
            <h1 className="text-sm font-semibold text-foreground">{companyName}</h1>
          </div>
        </div>

        {ehAnual ? (
          <GestaoAnualStep companyId={companyId} />
        ) : (
          <IndividualUpsellStep companyId={companyId} planoInicial={planoPreSelecionado === "GESTAO_MENSAL" ? "GESTAO_MENSAL" : "MENSAL"} />
        )}
      </Card>
    </div>
  );
}

function ListaBeneficios() {
  return (
    <ul className="space-y-1.5">
      {BENEFICIOS_GESTAO.map((item) => (
        <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="size-3.5 text-primary" aria-hidden />
          {item}
        </li>
      ))}
    </ul>
  );
}

function IndividualUpsellStep({ companyId, planoInicial }: EtapaProps & { planoInicial: "MENSAL" | "GESTAO_MENSAL" }) {
  const [escolha, setEscolha] = useState<"MENSAL" | "GESTAO_MENSAL">(planoInicial);
  const [mostrarEmail, setMostrarEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const ofertaIndividual = CATALOGO_OFERTAS.MENSAL;
  const ofertaGestao = CATALOGO_OFERTAS.GESTAO_MENSAL;
  const ofertaEscolhida = CATALOGO_OFERTAS[escolha];

  async function confirmar() {
    setErro(null);
    setEnviando(true);
    const resultado = await criarCheckoutAction(companyId, escolha, email);
    if (resultado.error) {
      setErro(resultado.error);
      setEnviando(false);
      return;
    }
    if (resultado.initPoint) {
      window.location.href = resultado.initPoint;
    }
  }

  if (!mostrarEmail) {
    return (
      <div className="space-y-4">
        <Card className={cn("p-4", escolha === "MENSAL" && "border-primary")}>
          <p className="text-sm font-semibold text-foreground">Frota IA Individual</p>
          <p className="text-2xl font-semibold text-foreground">{formatarReais(ofertaIndividual.precoCentavos)}<span className="text-sm font-normal text-muted-foreground">/mês</span></p>
          <p className="mt-1 text-sm text-muted-foreground">1 veículo · WhatsApp</p>
        </Card>

        <div className="rounded-lg border border-dashed border-border p-4">
          <p className="mb-2 text-sm font-medium text-foreground">
            Quer gerenciar sua frota pelo Painel? <span className="text-primary">+{formatarReais(PRECO_UPSELL_GESTAO_CENTAVOS)}/mês</span>
          </p>
          <ListaBeneficios />
        </div>

        <div className="space-y-2">
          <Button
            size="lg"
            variant="outline"
            className="w-full"
            onClick={() => {
              setEscolha("MENSAL");
              setMostrarEmail(true);
            }}
          >
            Continuar com Individual — {formatarReais(ofertaIndividual.precoCentavos)}/mês
          </Button>
          <Button
            size="lg"
            className="w-full"
            onClick={() => {
              setEscolha("GESTAO_MENSAL");
              setMostrarEmail(true);
            }}
          >
            Quero Frota IA Gestão — {formatarReais(ofertaGestao.precoCentavos)}/mês
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-sm font-semibold text-foreground">{ofertaEscolhida.label}</p>
        <p className="text-2xl font-semibold text-foreground">
          {formatarReais(ofertaEscolhida.precoCentavos)}
          <span className="text-sm font-normal text-muted-foreground">/mês</span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {ofertaEscolhida.limiteVeiculos} veículo{ofertaEscolhida.limiteVeiculos > 1 ? "s" : ""} · WhatsApp{ofertaEscolhida.painel ? " + Painel" : ""}
        </p>
      </Card>

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground">
          Seu e-mail (necessário pra assinatura recorrente)
        </label>
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" autoFocus />
      </div>

      {erro && <p className="text-sm text-danger">{erro}</p>}

      <Button size="lg" className="w-full" onClick={confirmar} isLoading={enviando}>
        Ir para pagamento
      </Button>
      <button type="button" onClick={() => setMostrarEmail(false)} className="w-full text-center text-sm text-muted-foreground hover:underline">
        Trocar plano
      </button>
    </div>
  );
}

function GestaoAnualStep({ companyId }: EtapaProps) {
  const [metodo, setMetodo] = useState<"ANUAL_PARCELADO" | "ANUAL_PIX" | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const ofertaCartao = CATALOGO_OFERTAS.ANUAL_PARCELADO;
  const ofertaPix = CATALOGO_OFERTAS.ANUAL_PIX;

  async function confirmar() {
    if (!metodo) return;
    setErro(null);
    setEnviando(true);
    const resultado = await criarCheckoutAction(companyId, metodo, undefined);
    if (resultado.error) {
      setErro(resultado.error);
      setEnviando(false);
      return;
    }
    if (resultado.initPoint) {
      window.location.href = resultado.initPoint;
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Frota IA Gestão</p>
        <p className="text-sm text-muted-foreground">12 meses · Até 10 veículos · WhatsApp + Painel</p>
      </div>

      <ListaBeneficios />

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setMetodo("ANUAL_PARCELADO")}
          className={cn(
            "w-full rounded-lg border p-4 text-left transition-colors",
            metodo === "ANUAL_PARCELADO" ? "border-primary bg-primary/5" : "border-border"
          )}
        >
          <p className="text-sm font-semibold text-foreground">Cartão</p>
          <p className="text-sm text-muted-foreground">
            {ofertaCartao.parcelas}x {formatarReais(ofertaCartao.precoCentavos / (ofertaCartao.parcelas ?? 1))} · Total {formatarReais(ofertaCartao.precoCentavos)}
          </p>
        </button>
        <button
          type="button"
          onClick={() => setMetodo("ANUAL_PIX")}
          className={cn(
            "w-full rounded-lg border p-4 text-left transition-colors",
            metodo === "ANUAL_PIX" ? "border-primary bg-primary/5" : "border-border"
          )}
        >
          <p className="text-sm font-semibold text-foreground">Pix</p>
          <p className="text-sm text-muted-foreground">{formatarReais(ofertaPix.precoCentavos)} à vista</p>
        </button>
      </div>

      {erro && <p className="text-sm text-danger">{erro}</p>}

      <Button size="lg" className="w-full" onClick={confirmar} disabled={!metodo} isLoading={enviando}>
        Continuar para pagamento
      </Button>
    </div>
  );
}
