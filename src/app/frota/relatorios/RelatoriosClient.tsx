"use client";

import { useMemo, useState } from "react";
import { SettlementSummary } from "@/components/frota/SettlementControl";
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
  const [financialBusy, setFinancialBusy] = useState(false);
  const [financialError, setFinancialError] = useState("");

  const blocos = useMemo(() => computeRelatoriosBlocos(dados, periodo.label), [dados, periodo.label]);

  const custoTotalDespesas = useMemo(() => dados.despesas.reduce((soma, d) => soma + d.amount, 0), [dados.despesas]);
  const totalReceitas = useMemo(() => dados.receitas.reduce((soma, r) => soma + r.amount, 0), [dados.receitas]);

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
          <p className="text-xs text-muted-foreground">O PDF financeiro detalha receitas, despesas, folha, veículos, baixas e participação dos custos no faturamento. Selecione um mês completo para incluir as metas cadastradas e o gráfico de produção. O resumo operacional continua disponível.</p>
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              const response = await fetch(hrefPdf);
              if (!response.ok) throw new Error();
              const url = URL.createObjectURL(await response.blob());
              const link = document.createElement("a");
              link.href = url; link.download = "relatorio-frota.pdf"; link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch { window.alert("Não foi possível baixar o relatório da empresa ativa. Tente novamente."); }
          }}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-transparent px-3 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-surface-muted"
        >
          <Download className="size-4" aria-hidden />
          Baixar PDF
        </button>
      </div>

      <Card className="mb-5 p-4">
        <h2 className="font-semibold">Relatório financeiro completo</h2>
        <p className="mb-3 text-sm text-muted-foreground">Competência de {periodo.from.split("-").reverse().join("/")} a {periodo.to.split("-").reverse().join("/")}. Inclui faturamento e custos por veículo, folha por funcionário e situação de cada lançamento, inclusive baixas feitas fora do mês. Não é extrato bancário nem lucro líquido.</p>
        <button type="button" disabled={financialBusy || !!filtroAtual.driverId}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          onClick={async()=>{
            setFinancialBusy(true);setFinancialError("");
            try {
              // Pin absolute dates at click time; do not let a relative month roll over during download.
              const p=new URLSearchParams({period:"custom",from:periodo.from,to:periodo.to});
              if(filtroAtual.vehicleId)p.set("vehicleId",filtroAtual.vehicleId);
              const response=await fetch(`/api/frota/relatorios/financeiro/pdf?${p}`,{cache:"no-store"});
              if(!response.ok)throw new Error("Falha ao gerar o relatório. Confira o período e sua permissão de acesso.");
              const url=URL.createObjectURL(await response.blob());
              const link=document.createElement("a");link.href=url;link.download=`relatorio-financeiro-${periodo.from}-${periodo.to}.pdf`;link.click();
              setTimeout(()=>URL.revokeObjectURL(url),1000);
            } catch {setFinancialError("Não foi possível emitir o relatório financeiro. Nenhum dado foi alterado. Tente novamente.");}
            finally{setFinancialBusy(false);}
          }}>{financialBusy?"Gerando relatório...":"Baixar PDF financeiro completo"}</button>
        {filtroAtual.driverId && <p className="mt-2 text-sm">Selecione Todos os motoristas para emitir o financeiro. Para um recorte específico, use o filtro de veículo.</p>}
        {financialError && <p role="alert" className="mt-2 text-sm text-red-500">{financialError}</p>}
      </Card>

      <h2 className="text-sm font-semibold">Baixas dos lançamentos do período selecionado</h2>
      <SettlementSummary rows={dados.despesas} />
      <SettlementSummary rows={dados.receitas} revenue />
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
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Receitas no período</p>
          <p className="text-sm font-medium text-foreground">{formatBRL(totalReceitas)}</p>
        </div>
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
