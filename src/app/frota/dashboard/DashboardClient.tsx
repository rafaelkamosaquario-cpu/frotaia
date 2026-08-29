"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTheme } from "next-themes";
import { CheckCircle2, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { useHasMounted } from "@/hooks/useHasMounted";
import type { ChecklistDispatchRow, DriverRow, ExpenseRow, MaintenanceScheduleRow, VehicleDocumentRow, VehicleRow } from "@/lib/supabase/tables";
import { computeFleetAlerts, type FleetAlertItem } from "@/services/supabase/fleetAlertsService";
import { dispatchesFromToday } from "@/services/supabase/checklistDispatchService";
import { ContextualHelp } from "@/components/frota/ContextualHelp";

/** "a" (sóbria/executiva) ou "b" (premium/destacada) — ver rodada "REFINAMENTO VISUAL DOS CARDS". Comparar ao vivo com ?cardStyle=a / ?cardStyle=b. Default de produção: "b". */
export type CardStyleVariant = "a" | "b";

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
  cardStyle: CardStyleVariant;
}

/** Tons semânticos reaproveitando só os tokens já existentes em globals.css (--primary/--accent/--warning/--danger/--success) — nenhuma cor nova adicionada em nenhuma das duas variantes. */
type Tom = "primary" | "accent" | "warning" | "danger" | "success";

const TOM_VAR: Record<Tom, string> = {
  primary: "--primary",
  accent: "--accent",
  warning: "--warning",
  danger: "--danger",
  success: "--success",
};

/** Glow colorido — só no tema escuro da Variante B, inspirado no box-shadow do card de plano em destaque da landing page (`.plano-destaque`). Inline style (não classe Tailwind) pra evitar qualquer risco de parsing de vírgula/parênteses em valor arbitrário. */
function glowB(tom: Tom, forte = false): CSSProperties {
  return {
    boxShadow: `0 ${forte ? 14 : 9}px ${forte ? 34 : 24}px ${forte ? -12 : -14}px color-mix(in srgb, var(${TOM_VAR[tom]}) ${forte ? 60 : 38}%, transparent)`,
  };
}

/** Sombra neutra do tema claro (ajuste visual 08/2026) — mesma pra todos os tons, sem glow colorido, pra não voltar ao efeito de "card pastel". */
const SOMBRA_CLARA: CSSProperties = { boxShadow: "0 4px 14px -2px rgba(16, 24, 40, 0.05)" };

/**
 * Ícones customizados (public/icons/dashboard/*.png) — cards neon "com
 * card" fornecidos prontos já na cor semântica certa (verde/azul/âmbar/
 * vermelho), gerados via scripts/process-dashboard-icons.mjs (remove só o
 * fundo preto sólido dos PNGs originais, preserva cor/traço/glow do card).
 * Pasta de origem própria do Dashboard — não tem relação com os ícones da
 * sidebar (public/icons/sidebar/), que são um pacote visual independente.
 */
const KPI_ICON: Record<string, string> = {
  veiculos: "/icons/dashboard/veiculos-primary.png",
  motoristas: "/icons/dashboard/motoristas-accent.png",
  manutencao: "/icons/dashboard/manutencao-warning.png",
  documentos: "/icons/dashboard/documentos-danger.png",
  agenda: "/icons/dashboard/agenda-warning.png",
  despesas: "/icons/dashboard/despesas-success.png",
  alertas: "/icons/dashboard/alertas-danger.png",
  checklists: "/icons/dashboard/checklists-success.png",
};

const B_BORDA: Record<Tom, string> = {
  primary: "border-primary/25",
  accent: "border-accent/25",
  warning: "border-warning/25",
  danger: "border-danger/35",
  success: "border-success/25",
};

const B_FUNDO: Record<Tom, string> = {
  primary: "bg-primary/[0.05]",
  accent: "bg-accent/[0.05]",
  warning: "bg-warning/[0.05]",
  danger: "bg-danger/[0.06]",
  success: "bg-success/[0.05]",
};

/** Barra de acento à esquerda (Variante A) — mesma assinatura estrutural de `.problema-card`/`.depo` da landing page (border-left tonal), recriada com um span absoluto pra não brigar com o border-color base do Card. */
const A_BARRA: Record<Tom, string> = {
  primary: "bg-primary",
  accent: "bg-accent",
  warning: "bg-warning",
  danger: "bg-danger",
  success: "bg-success",
};

const A_PILL: Record<Tom, string> = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent/10 text-accent",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
  success: "bg-success/10 text-success",
};

const B_PILL: Record<Tom, string> = {
  primary: "bg-primary/20 text-primary",
  accent: "bg-accent/20 text-accent",
  warning: "bg-warning/20 text-warning",
  danger: "bg-danger/20 text-danger",
  success: "bg-success/20 text-success",
};

function Pill({ label, tom, variante }: { label: string; tom: Tom; variante: CardStyleVariant }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full font-semibold",
        variante === "a" ? "px-2 py-0.5 text-[10px] uppercase tracking-wide" : "px-2.5 py-1 text-[11px] font-bold",
        variante === "a" ? A_PILL[tom] : B_PILL[tom]
      )}
    >
      {label}
    </span>
  );
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

/** `toLocaleString` devolve "R$" e o número separados por espaço não-quebrável (U+00A0) — troca por espaço normal pra o valor poder quebrar linha em vez de estourar/cortar o card em telas estreitas. */
function formatBRL(valor: number) {
  return valor
    .toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
    .replace(/ /g, " ");
}

function diasAte(iso: string): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(`${iso}T00:00:00`);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
}

export function DashboardClient({
  veiculos,
  motoristas,
  manutencoes,
  documentos,
  despesasRecentes,
  checklistDispatches,
  insight,
  cardStyle,
}: DashboardClientProps) {
  const hojeIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const variante = cardStyle;

  // Ajuste visual 08/2026: no tema claro, a Variante B deixa de preencher o
  // card com a cor semântica (lia "pastel"/"card lavado" em fundo branco) —
  // vira card branco + linha superior fina + sombra neutra. Tema escuro
  // continua idêntico (glow colorido), por isso o default antes de montar
  // (`!hasMounted`) é sempre o comportamento escuro/atual, nunca o novo
  // visual — evita qualquer flash incorreto na primeira pintura.
  const hasMounted = useHasMounted();
  const { resolvedTheme } = useTheme();
  const useDarkGlow = !hasMounted || resolvedTheme !== "light";

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
      { label: "Veículos ativos", value: veiculosAtivos, icon: KPI_ICON.veiculos, tom: "primary" as Tom },
      { label: "Motoristas ativos", value: motoristasAtivos, icon: KPI_ICON.motoristas, tom: "accent" as Tom },
      {
        label: "Manutenções pendentes",
        value: manutencoesPendentes,
        icon: KPI_ICON.manutencao,
        tom: "warning" as Tom,
        status: manutencoesPendentes > 0 ? { label: "Atenção", tom: "warning" as Tom } : undefined,
      },
      {
        label: "Documentos vencidos",
        value: documentosVencidos,
        icon: KPI_ICON.documentos,
        tom: "danger" as Tom,
        status: documentosVencidos > 0 ? { label: "Urgente", tom: "danger" as Tom } : undefined,
        destaque: documentosVencidos > 0,
      },
      {
        label: "Vencendo em 30 dias",
        value: documentosVencendo,
        icon: KPI_ICON.agenda,
        tom: "warning" as Tom,
        status: documentosVencendo > 0 ? { label: "Próximos", tom: "warning" as Tom } : undefined,
      },
      {
        label: "Custo nos últimos 30 dias",
        value: custo30Dias === null ? "—" : formatBRL(custo30Dias),
        icon: KPI_ICON.despesas,
        tom: "success" as Tom,
        // Valor é string monetária (bem mais larga que os contadores numéricos dos outros cards) — fonte menor evita estourar o card.
        monetario: true,
      },
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
          <p className="text-sm text-muted-foreground">
            Visão geral da frota
            {process.env.NODE_ENV !== "production" && <span className="ml-2 text-xs text-muted-foreground/60">[cards: {variante}]</span>}
          </p>
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

      <div data-tour="kpis" className="grid grid-cols-2 gap-4 sm:grid-cols-3 2xl:grid-cols-6">
        {kpis.map(({ label, value, icon, tom, status, destaque, monetario }) => (
          <Card
            key={label}
            className={cn(
              "relative flex flex-col gap-3 overflow-hidden p-5",
              variante === "a" && "border-border",
              variante === "a" && destaque && "ring-1 ring-danger/20",
              variante === "b" && useDarkGlow && [B_BORDA[tom], B_FUNDO[tom]]
            )}
            style={variante === "b" ? (useDarkGlow ? glowB(tom, destaque) : SOMBRA_CLARA) : undefined}
          >
            {variante === "a" && (
              <span
                aria-hidden
                className={cn("absolute inset-y-0 left-0 rounded-l-xl", destaque ? "w-1" : "w-[3px]", A_BARRA[tom])}
              />
            )}
            {variante === "b" && !useDarkGlow && (
              <span
                aria-hidden
                className={cn("absolute inset-x-0 top-0 rounded-t-xl", destaque ? "h-1" : "h-[3px]", A_BARRA[tom])}
              />
            )}
            <Image src={icon} alt="" width={52} height={52} className="size-10 shrink-0 object-contain sm:size-12" aria-hidden />
            <div className="min-w-0">
              <p
                className={cn(
                  "break-words tracking-tight tabular-nums text-foreground",
                  monetario
                    ? "text-xl leading-tight sm:text-2xl xl:text-3xl"
                    : cn("leading-tight", variante === "a" ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl"),
                  destaque ? "font-extrabold" : "font-bold"
                )}
              >
                {value}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <p className="text-sm text-muted-foreground">{label}</p>
                {status && <Pill label={status.label} tom={status.tom} variante={variante} />}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          className={cn("p-5", variante === "b" && useDarkGlow && ["border-danger/15", "bg-danger/[0.025]"])}
          style={variante === "b" && !useDarkGlow ? SOMBRA_CLARA : undefined}
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Image src={KPI_ICON.alertas} alt="" width={40} height={40} className="size-8 shrink-0 object-contain sm:size-9" aria-hidden />
              <h2 className="text-sm font-semibold text-foreground">Alertas urgentes</h2>
            </div>
            {alertas.length > 0 && <Pill label={`${alertas.length} pendente${alertas.length === 1 ? "" : "s"}`} tom="danger" variante={variante} />}
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
                      <Pill label={SEVERIDADE_PILL_LABEL[severidade]} tom={SEVERIDADE_PILL_TOM[severidade]} variante={variante} />
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

        <Card
          className={cn("p-5", variante === "b" && useDarkGlow && ["border-success/15", "bg-success/[0.025]"])}
          style={variante === "b" && !useDarkGlow ? SOMBRA_CLARA : undefined}
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Image src={KPI_ICON.checklists} alt="" width={40} height={40} className="size-8 shrink-0 object-contain sm:size-9" aria-hidden />
              <h2 className="text-sm font-semibold text-foreground">Checklists hoje</h2>
            </div>
            {checklistsHoje.length > 0 && (
              <Pill label={`${checklistsRespondidos}/${checklistsHoje.length} respondidos`} tom="success" variante={variante} />
            )}
          </div>

          {checklistsHoje.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum checklist enviado hoje ainda.</p>
          ) : (
            <>
              <div className="mb-4 h-2 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-success transition-all"
                  style={{ width: `${checklistPercent}%`, ...(variante === "b" && useDarkGlow ? { boxShadow: "0 0 8px color-mix(in srgb, var(--success) 55%, transparent)" } : {}) }}
                />
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
