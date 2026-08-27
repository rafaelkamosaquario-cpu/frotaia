"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ClipboardList, Clock, Sparkles, Truck, Users, Wrench, WalletCards } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import type { ChecklistDispatchRow, DriverRow, ExpenseRow, MaintenanceScheduleRow, VehicleDocumentRow, VehicleRow } from "@/lib/supabase/tables";
import { computeFleetAlerts, type FleetAlertItem } from "@/services/supabase/fleetAlertsService";
import { dispatchesFromToday } from "@/services/supabase/checklistDispatchService";
import { ContextualHelp } from "@/components/frota/ContextualHelp";

interface DashboardClientProps {
  veiculos: VehicleRow[];
  motoristas: DriverRow[];
  manutencoes: MaintenanceScheduleRow[];
  documentos: VehicleDocumentRow[];
  /** Já vem filtrado aos últimos 30 dias — ver DashboardPage. */
  despesasRecentes: ExpenseRow[];
  checklistDispatches: ChecklistDispatchRow[];
  /** Gerado por IA a partir dos dados acima, cacheado em company_preferences — ver DashboardPage. null se nunca gerado ou se a chamada falhou. */
  insight: string | null;
}

/** Tons semânticos reaproveitando só os tokens já existentes em globals.css (--primary/--accent/--warning/--danger/--success) — nenhuma cor nova adicionada. */
type Tom = "primary" | "accent" | "warning" | "danger" | "success";

const TOM_BARRA: Record<Tom, string> = {
  primary: "bg-primary",
  accent: "bg-accent",
  warning: "bg-warning",
  danger: "bg-danger",
  success: "bg-success",
};

const TOM_ICONE: Record<Tom, string> = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent/10 text-accent",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  success: "bg-success/10 text-success",
};

const TOM_PILL: Record<Tom, string> = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent/10 text-accent",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
  success: "bg-success/10 text-success",
};

function Pill({ label, tom }: { label: string; tom: Tom }) {
  return <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", TOM_PILL[tom])}>{label}</span>;
}

const MAX_ALERTAS_PREVIEW = 5;

const CHECKLIST_STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  ok: "OK",
  atencao: "Atenção",
};

const CHECKLIST_STATUS_CLASS: Record<string, string> = {
  pendente: "bg-surface-muted text-muted-foreground",
  ok: "bg-success/10 text-success",
  atencao: "bg-danger/15 font-semibold text-danger",
};

/** Reaproveita FleetAlertItem.vencido/diasRestantes (já calculados em fleetAlertsService) só pra escolher como exibir — nenhum cálculo novo, nenhuma regra de negócio alterada. */
type SeveridadeAlerta = "critico" | "atencao" | "proximo";

function severidadeAlerta(item: FleetAlertItem): SeveridadeAlerta {
  if (item.vencido) return "critico";
  if (item.diasRestantes <= 7) return "atencao";
  return "proximo";
}

const SEVERIDADE_ORDEM: Record<SeveridadeAlerta, number> = { critico: 0, atencao: 1, proximo: 2 };
const SEVERIDADE_DOT: Record<SeveridadeAlerta, string> = { critico: "bg-danger", atencao: "bg-warning", proximo: "bg-accent" };
const SEVERIDADE_PILL_LABEL: Record<SeveridadeAlerta, string> = { critico: "Vencido", atencao: "Atenção", proximo: "Próximo" };
const SEVERIDADE_PILL_TOM: Record<SeveridadeAlerta, Tom> = { critico: "danger", atencao: "warning", proximo: "accent" };

/** Quebra o texto do insight (uma string só, vinda da IA) em frases pra facilitar leitura — puramente de exibição, não altera o texto gerado nem a lógica que o gera. */
function dividirFrasesInsight(texto: string): string[] {
  return texto
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ú])/)
    .map((frase) => frase.trim())
    .filter(Boolean);
}

/** Destaca "N palavra" (ex.: "2 veículos") e rotas "Cidade → Cidade" dentro do insight — só peso tipográfico discreto (font-medium), sem cor, pra não virar propaganda. */
const PADRAO_DESTAQUE_INSIGHT = /(\d+\s+[a-zà-üç]+)|([A-ZÀ-Ü][\wà-üç]*(?:\s[A-ZÀ-Ü][\wà-üç]*)*\s*→\s*[A-ZÀ-Ü][\wà-üç]*(?:\s[A-ZÀ-Ü][\wà-üç]*)*)/g;

function destacarTrechosInsight(texto: string): ReactNode[] {
  const partes: ReactNode[] = [];
  let ultimoIndice = 0;
  let chave = 0;
  const regex = new RegExp(PADRAO_DESTAQUE_INSIGHT);
  let resultado: RegExpExecArray | null;
  while ((resultado = regex.exec(texto))) {
    if (resultado.index > ultimoIndice) partes.push(texto.slice(ultimoIndice, resultado.index));
    partes.push(
      <span key={chave++} className="font-medium text-foreground">
        {resultado[0]}
      </span>
    );
    ultimoIndice = resultado.index + resultado[0].length;
  }
  if (ultimoIndice < texto.length) partes.push(texto.slice(ultimoIndice));
  return partes;
}

function formatBRL(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function diasAte(iso: string): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(`${iso}T00:00:00`);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
}

export function DashboardClient({ veiculos, motoristas, manutencoes, documentos, despesasRecentes, checklistDispatches, insight }: DashboardClientProps) {
  const hojeIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const kpis = useMemo(() => {
    const veiculosAtivos = veiculos.filter((v) => v.active).length;
    const motoristasAtivos = motoristas.filter((m) => m.active).length;
    const manutencoesPendentes = manutencoes.filter((m) => m.status !== "concluido").length;
    const documentosVencidos = documentos.filter((d) => d.expiry_date && d.expiry_date < hojeIso).length;
    const documentosVencendo = documentos.filter(
      (d) => d.expiry_date && d.expiry_date >= hojeIso && diasAte(d.expiry_date) <= 30
    ).length;
    // Só aparece quando há dado real registrado — nunca número artificial pra preencher layout (ver plano de unificação V1+V2, item Dashboard).
    const custo30Dias = despesasRecentes.length > 0 ? despesasRecentes.reduce((soma, d) => soma + d.amount, 0) : null;

    return [
      { label: "Veículos ativos", value: veiculosAtivos, icon: Truck, tom: "primary" as Tom },
      { label: "Motoristas ativos", value: motoristasAtivos, icon: Users, tom: "accent" as Tom },
      {
        label: "Manutenções pendentes",
        value: manutencoesPendentes,
        icon: Wrench,
        tom: "warning" as Tom,
        status: manutencoesPendentes > 0 ? { label: "Atenção", tom: "warning" as Tom } : undefined,
      },
      {
        label: "Documentos vencidos",
        value: documentosVencidos,
        icon: AlertTriangle,
        tom: "danger" as Tom,
        status: documentosVencidos > 0 ? { label: "Urgente", tom: "danger" as Tom } : undefined,
        destaque: documentosVencidos > 0,
      },
      {
        label: "Vencendo em 30 dias",
        value: documentosVencendo,
        icon: Clock,
        tom: "warning" as Tom,
        status: documentosVencendo > 0 ? { label: "Próximos", tom: "warning" as Tom } : undefined,
      },
      { label: "Custo nos últimos 30 dias", value: custo30Dias === null ? "—" : formatBRL(custo30Dias), icon: WalletCards, tom: "success" as Tom },
    ];
  }, [veiculos, motoristas, manutencoes, documentos, despesasRecentes, hojeIso]);

  const alertas = useMemo(() => computeFleetAlerts({ veiculos, manutencoes, documentos }), [veiculos, manutencoes, documentos]);
  const alertasOrdenados = useMemo(
    () =>
      [...alertas].sort(
        (a, b) => SEVERIDADE_ORDEM[severidadeAlerta(a)] - SEVERIDADE_ORDEM[severidadeAlerta(b)] || a.diasRestantes - b.diasRestantes
      ),
    [alertas]
  );

  const checklistsHoje = useMemo(() => dispatchesFromToday(checklistDispatches), [checklistDispatches]);
  const motoristasPorId = useMemo(() => new Map(motoristas.map((m) => [m.id, m])), [motoristas]);
  const checklistsRespondidos = checklistsHoje.filter((d) => d.response_status !== "pendente").length;
  const checklistPercent = checklistsHoje.length > 0 ? Math.round((checklistsRespondidos / checklistsHoje.length) * 100) : 0;

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral da frota</p>
        </div>
        <ContextualHelp topic="dashboard" />
      </div>

      {insight && (
        <Card data-tour="ia-sugere" className="mb-4 flex items-start gap-3 border-l-2 border-l-primary/40 p-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="size-4.5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight text-foreground">Frota IA sugere</p>
            <div className="mt-1 space-y-1">
              {dividirFrasesInsight(insight).map((frase, i) => (
                <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                  {destacarTrechosInsight(frase)}
                </p>
              ))}
            </div>
          </div>
        </Card>
      )}

      <div data-tour="kpis" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map(({ label, value, icon: Icon, tom, status, destaque }) => (
          <Card
            key={label}
            className={cn("relative flex flex-col gap-3 overflow-hidden p-5", destaque && "ring-1 ring-danger/25")}
          >
            <span aria-hidden className={cn("absolute inset-x-0 top-0 h-[3px] opacity-70", TOM_BARRA[tom])} />
            <div className={cn("flex size-11 items-center justify-center rounded-xl", TOM_ICONE[tom])}>
              <Icon className="size-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className={cn("text-2xl tracking-tight tabular-nums text-foreground sm:text-3xl", destaque ? "font-bold" : "font-semibold")}>
                {value}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <p className="text-sm text-muted-foreground">{label}</p>
                {status && <Pill label={status.label} tom={status.tom} />}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4.5 text-danger" aria-hidden />
              <h2 className="text-sm font-semibold text-foreground">Alertas urgentes</h2>
            </div>
            {alertas.length > 0 && (
              <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
                {alertas.length} pendente{alertas.length === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {alertas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum alerta no momento. Tudo em dia por aqui.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {alertasOrdenados.slice(0, MAX_ALERTAS_PREVIEW).map((item) => {
                const severidade = severidadeAlerta(item);
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-surface-muted"
                    >
                      <span className={cn("size-1.5 shrink-0 rounded-full", SEVERIDADE_DOT[severidade])} aria-hidden />
                      <span className="flex-1 truncate text-foreground">{item.descricao}</span>
                      <Pill label={SEVERIDADE_PILL_LABEL[severidade]} tom={SEVERIDADE_PILL_TOM[severidade]} />
                    </Link>
                  </li>
                );
              })}
              {alertas.length > MAX_ALERTAS_PREVIEW && (
                <li>
                  <Link href="/frota/alertas" className="block px-2 pt-1 text-sm font-medium text-primary hover:underline">
                    Ver todos os alertas
                  </Link>
                </li>
              )}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="size-4.5 text-success" aria-hidden />
              <h2 className="text-sm font-semibold text-foreground">Checklists hoje</h2>
            </div>
            {checklistsHoje.length > 0 && (
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                {checklistsRespondidos}/{checklistsHoje.length} respondidos
              </span>
            )}
          </div>

          {checklistsHoje.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum checklist enviado hoje ainda.</p>
          ) : (
            <>
              <div className="mb-4 h-2 overflow-hidden rounded-full bg-surface-muted">
                <div className="h-full rounded-full bg-success transition-all" style={{ width: `${checklistPercent}%` }} />
              </div>
              <ul className="flex flex-col gap-1">
                {checklistsHoje.map((dispatch) => (
                  <li key={dispatch.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm">
                    {dispatch.response_status === "ok" ? (
                      <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
                    ) : (
                      <span className={cn("size-1.5 shrink-0 rounded-full", dispatch.response_status === "atencao" ? "bg-danger" : "bg-muted-foreground")} aria-hidden />
                    )}
                    <span className="flex-1 truncate text-foreground">{motoristasPorId.get(dispatch.driver_id)?.name ?? "—"}</span>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", CHECKLIST_STATUS_CLASS[dispatch.response_status])}>
                      {CHECKLIST_STATUS_LABEL[dispatch.response_status]}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
