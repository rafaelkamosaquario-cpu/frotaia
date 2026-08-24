"use client";

import { useMemo, useState } from "react";
import { Wrench, SquarePen } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { MaintenanceScheduleRow, VehicleRow, ExpenseRow } from "@/lib/supabase/tables";
import { MaintenanceFormModal } from "./MaintenanceFormModal";

interface ManutencaoClientProps {
  manutencoesIniciais: MaintenanceScheduleRow[];
  veiculos: VehicleRow[];
  despesasVinculadas: ExpenseRow[];
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

function formatKm(km: number | null) {
  if (km == null) return "—";
  return `${km.toLocaleString("pt-BR")} km`;
}

function formatBRL(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  agendado: "Agendado",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

const STATUS_CLASS: Record<string, string> = {
  pendente: "bg-surface-muted text-muted-foreground",
  agendado: "bg-accent/10 text-accent",
  concluido: "bg-success/10 text-success",
  cancelado: "bg-danger/10 text-danger",
};

export function ManutencaoClient({ manutencoesIniciais, veiculos, despesasVinculadas }: ManutencaoClientProps) {
  const [manutencoes, setManutencoes] = useState(manutencoesIniciais);
  const [despesas, setDespesas] = useState(despesasVinculadas);
  const [formTarget, setFormTarget] = useState<MaintenanceScheduleRow | null | undefined>(undefined);

  const veiculosPorId = useMemo(() => new Map(veiculos.map((v) => [v.id, v])), [veiculos]);
  const veiculosAtivos = useMemo(() => veiculos.filter((v) => v.active), [veiculos]);
  const custoPorManutencaoId = useMemo(() => new Map(despesas.map((d) => [d.maintenance_schedule_id, d])), [despesas]);

  function handleSaved(manutencao: MaintenanceScheduleRow, despesaVinculada?: ExpenseRow | null) {
    setManutencoes((prev) => {
      const existe = prev.some((m) => m.id === manutencao.id);
      const proxima = existe ? prev.map((m) => (m.id === manutencao.id ? manutencao : m)) : [manutencao, ...prev];
      return [...proxima].sort((a, b) => a.due_date.localeCompare(b.due_date));
    });

    if (despesaVinculada) {
      setDespesas((prev) => {
        const existe = prev.some((d) => d.id === despesaVinculada.id);
        return existe ? prev.map((d) => (d.id === despesaVinculada.id ? despesaVinculada : d)) : [despesaVinculada, ...prev];
      });
    }
  }

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Manutenção</h1>
          <p className="text-sm text-muted-foreground">{manutencoes.length} registro(s) de manutenção</p>
        </div>
        <Button onClick={() => setFormTarget(null)} className="gap-1.5">
          <SquarePen className="size-4" aria-hidden />
          Nova manutenção
        </Button>
      </div>

      {manutencoes.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={Wrench}
            title="Nenhuma manutenção agendada"
            description="Agende a primeira manutenção da frota pra começar."
          >
            <Button className="mt-4" onClick={() => setFormTarget(null)}>
              Agendar manutenção
            </Button>
          </EmptyState>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="frota-table w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Veículo</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Km execução</th>
                <th className="px-4 py-3 font-medium">Próxima km</th>
                <th className="px-4 py-3 font-medium">Vencimento</th>
                <th className="px-4 py-3 font-medium">Custo</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {manutencoes.map((manutencao) => {
                const veiculo = veiculosPorId.get(manutencao.vehicle_id);
                const despesa = custoPorManutencaoId.get(manutencao.id);
                return (
                  <tr key={manutencao.id} className="border-b border-border last:border-0 hover:bg-surface-muted/50">
                    <td data-label="Veículo" className="px-4 py-3 font-medium text-foreground">
                      {veiculo ? veiculo.name || veiculo.plate : "—"}
                    </td>
                    <td data-label="Tipo" className="px-4 py-3 text-foreground">{manutencao.type}</td>
                    <td data-label="Km execução" className="px-4 py-3 text-muted-foreground">{formatKm(manutencao.executed_km)}</td>
                    <td data-label="Próxima km" className="px-4 py-3 text-muted-foreground">{formatKm(manutencao.next_due_km)}</td>
                    <td data-label="Vencimento" className="px-4 py-3 text-muted-foreground">{formatDate(manutencao.due_date)}</td>
                    <td data-label="Custo" className="px-4 py-3 text-muted-foreground">{despesa ? formatBRL(despesa.amount) : "—"}</td>
                    <td data-label="Status" className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[manutencao.status]}`}>
                        {STATUS_LABEL[manutencao.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setFormTarget(manutencao)}>
                        <SquarePen className="size-3.5" aria-hidden />
                        Editar
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <MaintenanceFormModal
        open={formTarget !== undefined}
        onClose={() => setFormTarget(undefined)}
        schedule={formTarget ?? null}
        veiculosAtivos={veiculosAtivos}
        onSaved={handleSaved}
      />
    </div>
  );
}
