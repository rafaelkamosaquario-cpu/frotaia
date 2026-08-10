"use client";

import { useState } from "react";
import { Truck, SquarePen, Ban, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/hooks/useToast";
import type { VehicleRow } from "@/lib/supabase/tables";
import { VehicleFormModal } from "./VehicleFormModal";

interface VeiculosClientProps {
  veiculosIniciais: VehicleRow[];
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

const VEHICLE_TYPE_LABEL: Record<string, string> = {
  utilitario: "Utilitário",
  tres_quartos: "3/4",
  toco: "Toco",
  truck: "Truck",
  cavalo_mecanico: "Cavalo mecânico",
  carreta: "Carreta",
  bitrem: "Bitrem",
  rodotrem: "Rodotrem",
  onibus: "Ônibus",
  outro: "Outro",
};

export function VeiculosClient({ veiculosIniciais }: VeiculosClientProps) {
  const { showToast } = useToast();
  const [veiculos, setVeiculos] = useState(veiculosIniciais);
  const [formTarget, setFormTarget] = useState<VehicleRow | null | undefined>(undefined);
  const [toggleTarget, setToggleTarget] = useState<VehicleRow | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  function handleSaved(veiculo: VehicleRow) {
    setVeiculos((prev) => {
      const existe = prev.some((v) => v.id === veiculo.id);
      const proxima = existe ? prev.map((v) => (v.id === veiculo.id ? veiculo : v)) : [veiculo, ...prev];
      return [...proxima].sort((a, b) => Number(b.active) - Number(a.active) || (a.name ?? "").localeCompare(b.name ?? ""));
    });
  }

  async function handleToggleActive() {
    if (!toggleTarget) return;
    setIsToggling(true);
    try {
      const response = await fetch(`/api/frota/veiculos/${toggleTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !toggleTarget.active }),
      });
      const data = await response.json();

      if (!response.ok) {
        showToast({ title: "Não foi possível alterar o status", description: data.error ?? "Tente novamente.", variant: "error" });
        return;
      }

      handleSaved(data.veiculo);
      showToast({ title: toggleTarget.active ? "Veículo desativado" : "Veículo ativado", variant: "success" });
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
          <h1 className="text-lg font-semibold text-foreground">Veículos</h1>
          <p className="text-sm text-muted-foreground">{veiculos.length} veículo(s) cadastrado(s)</p>
        </div>
        <Button onClick={() => setFormTarget(null)} className="gap-1.5">
          <SquarePen className="size-4" aria-hidden />
          Novo veículo
        </Button>
      </div>

      {veiculos.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={Truck}
            title="Nenhum veículo cadastrado"
            description="Cadastre o primeiro veículo da frota pra começar."
          >
            <Button className="mt-4" onClick={() => setFormTarget(null)}>
              Cadastrar veículo
            </Button>
          </EmptyState>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Placa</th>
                <th className="px-4 py-3 font-medium">Apelido</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Seguro vence</th>
                <th className="px-4 py-3 font-medium">Licenciamento vence</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {veiculos.map((veiculo) => (
                <tr key={veiculo.id} className="border-b border-border last:border-0 hover:bg-surface-muted/50">
                  <td className="px-4 py-3 font-medium text-foreground">{veiculo.plate ?? "—"}</td>
                  <td className="px-4 py-3 text-foreground">{veiculo.name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {veiculo.vehicle_type ? VEHICLE_TYPE_LABEL[veiculo.vehicle_type] : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(veiculo.insurance_expiry_date)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(veiculo.licensing_expiry_date)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        veiculo.active
                          ? "rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                          : "rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                      }
                    >
                      {veiculo.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setFormTarget(veiculo)}>
                        <SquarePen className="size-3.5" aria-hidden />
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        disabled={isToggling && toggleTarget?.id === veiculo.id}
                        onClick={() => setToggleTarget(veiculo)}
                      >
                        {veiculo.active ? (
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
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <VehicleFormModal
        open={formTarget !== undefined}
        onClose={() => setFormTarget(undefined)}
        vehicle={formTarget ?? null}
        onSaved={handleSaved}
      />

      <Dialog
        open={toggleTarget !== null}
        onClose={() => setToggleTarget(null)}
        onConfirm={handleToggleActive}
        title={toggleTarget?.active ? "Desativar veículo" : "Ativar veículo"}
        description={
          toggleTarget?.active
            ? `Tem certeza que deseja desativar "${toggleTarget?.name ?? toggleTarget?.plate}"?`
            : `Tem certeza que deseja ativar "${toggleTarget?.name ?? toggleTarget?.plate}"? Empresas do tipo autônomo só podem ter 1 veículo ativo por vez.`
        }
        confirmLabel={toggleTarget?.active ? "Desativar" : "Ativar"}
        variant={toggleTarget?.active ? "danger" : "default"}
      />
    </div>
  );
}
