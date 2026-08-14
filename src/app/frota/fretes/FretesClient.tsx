"use client";

import { useMemo } from "react";
import { Truck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { AnalysisRunRow, VehicleRow } from "@/lib/supabase/tables";

interface FretesClientProps {
  analises: AnalysisRunRow[];
  veiculos: VehicleRow[];
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function FretesClient({ analises, veiculos }: FretesClientProps) {
  const veiculosPorId = useMemo(() => new Map(veiculos.map((v) => [v.id, v])), [veiculos]);

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-foreground">Fretes / Análises</h1>
        <p className="text-sm text-muted-foreground">{analises.length} análise(s) de frete feita(s) pelo WhatsApp</p>
      </div>

      {analises.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={Truck}
            title="Nenhuma análise de frete ainda"
            description='Peça pelo WhatsApp "esse frete compensa?" ou "compare essas propostas de frete" — as análises aparecem aqui.'
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {analises.map((analise) => {
            const veiculo = analise.vehicle_id ? veiculosPorId.get(analise.vehicle_id) : null;
            return (
              <Card key={analise.id} className="p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">{formatDateTime(analise.created_at)}</span>
                  {veiculo && <span className="text-xs font-medium text-muted-foreground">{veiculo.name || veiculo.plate}</span>}
                </div>
                {analise.user_request && <p className="mb-1 text-sm text-muted-foreground italic">&ldquo;{analise.user_request}&rdquo;</p>}
                <p className="text-sm text-foreground">{analise.result_summary ?? "Sem resumo disponível."}</p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
