"use client";

import { useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import {
  computeRelatoriosBlocos,
  formatBRL,
  type RelatoriosInput,
  type PeriodoPreset,
  PERIODO_PRESET_LABEL,
} from "@/lib/frota/relatoriosAggregation";
import type { VehicleRow, DriverRow } from "@/lib/supabase/tables";

interface RelatoriosClientProps extends RelatoriosInput {
  /** Listas completas (não filtradas) — só pras opções dos selects. */
  todosVeiculos: VehicleRow[];
  todosMotoristas: DriverRow[];
  periodo: { from: string; to: string; label: string; preset: PeriodoPreset };
  filtroAtual: { vehicleId: string; driverId: string };
}

const selectClass = cn(
  "h-9 rounded-lg border border-border bg-surface px-3 text-sm text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
);

interface ResumoBlocoProps {
  titulo: string;
  linhas: { label: string; valor: number }[];
  formatarValor?: (valor: number) => string;
}

function ResumoBloco({ titulo, linhas, formatarValor }: ResumoBlocoProps) {
  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{titulo}</h2>
      <dl className="space-y-1.5">
        {linhas.map(({ label, valor }) => (
          <div key={label} className="flex items-center justify-between text-sm">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium text-foreground">{formatarValor ? formatarValor(valor) : valor}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function RelatoriosClient({ todosVeiculos, todosMotoristas, periodo, filtroAtual, ...dados }: RelatoriosClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const blocos = useMemo(() => computeRelatoriosBlocos(dados, periodo.label), [dados, periodo.label]);

  const custoTotalDespesas = useMemo(() => dados.despesas.reduce((soma, d) => soma + d.amount, 0), [dados.despesas]);

  function atualizarFiltro(patch: Record<string, string | undefined>) {
    const proximos = new URLSearchParams(searchParams.toString());
    for (const [chave, valor] of Object.entries(patch)) {
      if (valor) proximos.set(chave, valor);
      else proximos.delete(chave);
    }
    router.push(`${pathname}?${proximos.toString()}`);
  }

  const queryStringAtual = searchParams.toString();
  const hrefPdf = `/api/frota/relatorios/pdf${queryStringAtual ? `?${queryStringAtual}` : ""}`;

  const veiculoSelecionado = todosVeiculos.find((v) => v.id === filtroAtual.vehicleId);
  const motoristaSelecionado = todosMotoristas.find((m) => m.id === filtroAtual.driverId);

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Resumo operacional da frota</p>
        </div>
        <a
          href={hrefPdf}
          download
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-transparent px-3 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-surface-muted"
        >
          <Download className="size-4" aria-hidden />
          Baixar PDF
        </a>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <select
          value={periodo.preset}
          onChange={(e) => atualizarFiltro({ period: e.target.value, from: undefined, to: undefined })}
          className={selectClass}
          aria-label="Período"
        >
          {Object.entries(PERIODO_PRESET_LABEL).map(([valor, label]) => (
            <option key={valor} value={valor}>
              {label.charAt(0).toUpperCase() + label.slice(1)}
            </option>
          ))}
        </select>

        {periodo.preset === "custom" && (
          <>
            <input
              type="date"
              value={periodo.from}
              onChange={(e) => atualizarFiltro({ period: "custom", from: e.target.value })}
              className={selectClass}
              aria-label="De"
            />
            <input
              type="date"
              value={periodo.to}
              onChange={(e) => atualizarFiltro({ period: "custom", to: e.target.value })}
              className={selectClass}
              aria-label="Até"
            />
          </>
        )}

        <select
          value={filtroAtual.vehicleId}
          onChange={(e) => atualizarFiltro({ vehicleId: e.target.value || undefined })}
          className={selectClass}
          aria-label="Veículo"
        >
          <option value="">Todos os veículos</option>
          {todosVeiculos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name || v.plate || v.id}
            </option>
          ))}
        </select>

        <select
          value={filtroAtual.driverId}
          onChange={(e) => atualizarFiltro({ driverId: e.target.value || undefined })}
          className={selectClass}
          aria-label="Motorista"
        >
          <option value="">Todos os motoristas</option>
          {todosMotoristas.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <Card className="mb-5 flex flex-wrap gap-x-8 gap-y-3 p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Período</p>
          <p className="text-sm font-medium text-foreground">{periodo.label}</p>
        </div>
        {veiculoSelecionado && (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Veículo</p>
            <p className="text-sm font-medium text-foreground">{veiculoSelecionado.name || veiculoSelecionado.plate}</p>
          </div>
        )}
        {motoristaSelecionado && (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Motorista</p>
            <p className="text-sm font-medium text-foreground">{motoristaSelecionado.name}</p>
          </div>
        )}
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Despesas no período</p>
          <p className="text-sm font-medium text-foreground">{formatBRL(custoTotalDespesas)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Manutenções</p>
          <p className="text-sm font-medium text-foreground">{dados.manutencoes.length}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Documentos</p>
          <p className="text-sm font-medium text-foreground">{dados.documentos.length}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Checklists</p>
          <p className="text-sm font-medium text-foreground">{dados.checklistDispatches.length}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Fretes analisados</p>
          <p className="text-sm font-medium text-foreground">{dados.analisesFrete.length}</p>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {blocos.map((bloco) => (
          <ResumoBloco key={bloco.titulo} titulo={bloco.titulo} linhas={bloco.linhas} formatarValor={bloco.formatarValor} />
        ))}
      </div>
    </div>
  );
}
