"use client";

import { useMemo } from "react";
import { Download } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { computeRelatoriosBlocos, type RelatoriosInput } from "@/lib/frota/relatoriosAggregation";

type RelatoriosClientProps = RelatoriosInput;

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

export function RelatoriosClient(props: RelatoriosClientProps) {
  const blocos = useMemo(() => computeRelatoriosBlocos(props), [props]);

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Resumo operacional da frota</p>
        </div>
        <a
          href="/api/frota/relatorios/pdf"
          download
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-transparent px-3 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-surface-muted"
        >
          <Download className="size-4" aria-hidden />
          Baixar PDF
        </a>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {blocos.map((bloco) => (
          <ResumoBloco key={bloco.titulo} titulo={bloco.titulo} linhas={bloco.linhas} formatarValor={bloco.formatarValor} />
        ))}
      </div>
    </div>
  );
}
