"use client";

import { useMemo } from "react";
import { Clock3 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { DriverRow, SavedJourneyRow, VehicleRow } from "@/lib/supabase/tables";

interface JornadasClientProps {
  jornadas: SavedJourneyRow[];
  motoristas: DriverRow[];
  veiculos: VehicleRow[];
}

const STATUS_LABEL: Record<string, string> = {
  planejada: "Planejada",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

const STATUS_CLASS: Record<string, string> = {
  planejada: "bg-surface-muted text-muted-foreground",
  em_andamento: "bg-accent/10 text-accent",
  concluida: "bg-success/10 text-success",
  cancelada: "bg-danger/10 text-danger",
};

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function JornadasClient({ jornadas, motoristas, veiculos }: JornadasClientProps) {
  const motoristasPorId = useMemo(() => new Map(motoristas.map((m) => [m.id, m])), [motoristas]);
  const veiculosPorId = useMemo(() => new Map(veiculos.map((v) => [v.id, v])), [veiculos]);

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-foreground">Jornadas</h1>
        <p className="text-sm text-muted-foreground">{jornadas.length} jornada(s) salva(s) pelo WhatsApp</p>
      </div>

      {jornadas.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={Clock3}
            title="Nenhuma jornada salva ainda"
            description='Jornadas salvas pelo WhatsApp (peça "organize minha jornada" e depois "salva essa jornada") aparecem aqui.'
          />
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="frota-table w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Origem → Destino</th>
                <th className="px-4 py-3 font-medium">Motorista</th>
                <th className="px-4 py-3 font-medium">Veículo</th>
                <th className="px-4 py-3 font-medium">Saída prevista</th>
                <th className="px-4 py-3 font-medium">Chegada prevista</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {jornadas.map((jornada) => {
                const motorista = jornada.driver_id ? motoristasPorId.get(jornada.driver_id) : null;
                const veiculo = jornada.vehicle_id ? veiculosPorId.get(jornada.vehicle_id) : null;
                return (
                  <tr key={jornada.id} className="border-b border-border last:border-0 hover:bg-surface-muted/50">
                    <td data-label="Origem → Destino" className="px-4 py-3 text-foreground">
                      {jornada.origin ?? "—"} → {jornada.destination ?? "—"}
                    </td>
                    <td data-label="Motorista" className="px-4 py-3 text-muted-foreground">{motorista?.name ?? "—"}</td>
                    <td data-label="Veículo" className="px-4 py-3 text-muted-foreground">{veiculo ? veiculo.name || veiculo.plate : "—"}</td>
                    <td data-label="Saída prevista" className="px-4 py-3 text-muted-foreground">{formatDateTime(jornada.scheduled_departure)}</td>
                    <td data-label="Chegada prevista" className="px-4 py-3 text-muted-foreground">{formatDateTime(jornada.scheduled_arrival)}</td>
                    <td data-label="Status" className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[jornada.status]}`}>{STATUS_LABEL[jornada.status]}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
