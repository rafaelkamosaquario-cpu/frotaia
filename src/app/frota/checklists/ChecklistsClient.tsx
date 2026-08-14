"use client";

import { useMemo } from "react";
import { ClipboardList } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ChecklistDispatchRow, DriverRow, VehicleRow } from "@/lib/supabase/tables";

interface ChecklistsClientProps {
  dispatches: ChecklistDispatchRow[];
  motoristas: DriverRow[];
  veiculos: VehicleRow[];
}

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  ok: "OK",
  atencao: "Atenção",
};

const STATUS_CLASS: Record<string, string> = {
  pendente: "bg-surface-muted text-muted-foreground",
  ok: "bg-success/10 text-success",
  atencao: "bg-danger/10 text-danger",
};

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function ChecklistsClient({ dispatches, motoristas, veiculos }: ChecklistsClientProps) {
  const motoristasPorId = useMemo(() => new Map(motoristas.map((m) => [m.id, m])), [motoristas]);
  const veiculosPorId = useMemo(() => new Map(veiculos.map((v) => [v.id, v])), [veiculos]);

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-foreground">Checklists</h1>
        <p className="text-sm text-muted-foreground">{dispatches.length} checklist(s) enviado(s)</p>
      </div>

      {dispatches.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={ClipboardList}
            title="Nenhum checklist enviado ainda"
            description="O envio automático roda 1x por dia para motoristas com veículo e telefone cadastrados. Assim que o primeiro checklist for enviado e respondido, o histórico aparece aqui."
          />
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Motorista</th>
                <th className="px-4 py-3 font-medium">Veículo</th>
                <th className="px-4 py-3 font-medium">Enviado em</th>
                <th className="px-4 py-3 font-medium">Respondido em</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Tentativas</th>
              </tr>
            </thead>
            <tbody>
              {dispatches.map((dispatch) => {
                const motorista = motoristasPorId.get(dispatch.driver_id);
                const veiculo = dispatch.vehicle_id ? veiculosPorId.get(dispatch.vehicle_id) : null;
                return (
                  <tr key={dispatch.id} className="border-b border-border last:border-0 hover:bg-surface-muted/50">
                    <td className="px-4 py-3 font-medium text-foreground">{motorista?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{veiculo ? veiculo.name || veiculo.plate : "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDateTime(dispatch.sent_at)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDateTime(dispatch.responded_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[dispatch.response_status]}`}>
                        {STATUS_LABEL[dispatch.response_status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{dispatch.attempt_count}</td>
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
