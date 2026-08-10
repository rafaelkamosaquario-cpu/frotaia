"use client";

import { useMemo, useState } from "react";
import { Users, SquarePen, Ban, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/hooks/useToast";
import type { DriverRow, VehicleRow } from "@/lib/supabase/tables";
import { DriverFormModal } from "./DriverFormModal";

interface MotoristasClientProps {
  motoristasIniciais: DriverRow[];
  veiculos: VehicleRow[];
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

export function MotoristasClient({ motoristasIniciais, veiculos }: MotoristasClientProps) {
  const { showToast } = useToast();
  const [motoristas, setMotoristas] = useState(motoristasIniciais);
  const [formTarget, setFormTarget] = useState<DriverRow | null | undefined>(undefined);
  const [toggleTarget, setToggleTarget] = useState<DriverRow | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  const veiculosPorId = useMemo(() => new Map(veiculos.map((v) => [v.id, v])), [veiculos]);
  const veiculosAtivos = useMemo(() => veiculos.filter((v) => v.active), [veiculos]);

  function handleSaved(motorista: DriverRow) {
    setMotoristas((prev) => {
      const existe = prev.some((m) => m.id === motorista.id);
      const proxima = existe ? prev.map((m) => (m.id === motorista.id ? motorista : m)) : [motorista, ...prev];
      return [...proxima].sort((a, b) => Number(b.active) - Number(a.active) || (a.name ?? "").localeCompare(b.name ?? ""));
    });
  }

  async function handleToggleActive() {
    if (!toggleTarget) return;
    setIsToggling(true);
    try {
      const response = await fetch(`/api/frota/motoristas/${toggleTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !toggleTarget.active }),
      });
      const data = await response.json();

      if (!response.ok) {
        showToast({ title: "Não foi possível alterar o status", description: data.error ?? "Tente novamente.", variant: "error" });
        return;
      }

      handleSaved(data.motorista);
      showToast({ title: toggleTarget.active ? "Motorista desativado" : "Motorista ativado", variant: "success" });
    } catch {
      showToast({ title: "Não foi possível alterar o status", description: "Verifique sua conexão e tente novamente.", variant: "error" });
    } finally {
      setIsToggling(false);
      setToggleTarget(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Motoristas</h1>
          <p className="text-sm text-muted-foreground">{motoristas.length} motorista(s) cadastrado(s)</p>
        </div>
        <Button onClick={() => setFormTarget(null)} className="gap-1.5">
          <SquarePen className="size-4" aria-hidden />
          Novo motorista
        </Button>
      </div>

      {motoristas.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={Users}
            title="Nenhum motorista cadastrado"
            description="Cadastre o primeiro motorista da frota pra começar."
          >
            <Button className="mt-4" onClick={() => setFormTarget(null)}>
              Cadastrar motorista
            </Button>
          </EmptyState>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Telefone</th>
                <th className="px-4 py-3 font-medium">Veículo</th>
                <th className="px-4 py-3 font-medium">CNH vence</th>
                <th className="px-4 py-3 font-medium">Toxicológico vence</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {motoristas.map((motorista) => {
                const veiculo = motorista.vehicle_id ? veiculosPorId.get(motorista.vehicle_id) : null;
                return (
                  <tr key={motorista.id} className="border-b border-border last:border-0 hover:bg-surface-muted/50">
                    <td className="px-4 py-3 font-medium text-foreground">{motorista.name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{motorista.phone_e164 ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{veiculo ? veiculo.name || veiculo.plate : "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(motorista.cnh_expiry_date)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(motorista.toxicologico_expiry_date)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          motorista.active
                            ? "rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                            : "rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                        }
                      >
                        {motorista.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setFormTarget(motorista)}>
                          <SquarePen className="size-3.5" aria-hidden />
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5"
                          disabled={isToggling && toggleTarget?.id === motorista.id}
                          onClick={() => setToggleTarget(motorista)}
                        >
                          {motorista.active ? (
                            <>
                              <Ban className="size-3.5" aria-hidden />
                              Desativar
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="size-3.5" aria-hidden />
                              Ativar
                            </>
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <DriverFormModal
        open={formTarget !== undefined}
        onClose={() => setFormTarget(undefined)}
        driver={formTarget ?? null}
        veiculosAtivos={veiculosAtivos}
        onSaved={handleSaved}
      />

      <Dialog
        open={toggleTarget !== null}
        onClose={() => setToggleTarget(null)}
        onConfirm={handleToggleActive}
        title={toggleTarget?.active ? "Desativar motorista" : "Ativar motorista"}
        description={`Tem certeza que deseja ${toggleTarget?.active ? "desativar" : "ativar"} "${toggleTarget?.name ?? ""}"?`}
        confirmLabel={toggleTarget?.active ? "Desativar" : "Ativar"}
        variant={toggleTarget?.active ? "danger" : "default"}
      />
    </div>
  );
}
