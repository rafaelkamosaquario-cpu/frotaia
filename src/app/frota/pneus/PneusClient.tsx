"use client";

import { useMemo, useState } from "react";
import { Disc, SquarePen, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { VehicleTireRow, VehicleRow, VehicleTireStatusEnum } from "@/lib/supabase/tables";
import { computeTireKm } from "@/services/supabase/vehicleTireService";
import { VehicleTireFormModal } from "./VehicleTireFormModal";

interface PneusClientProps {
  pneusIniciais: VehicleTireRow[];
  veiculos: VehicleRow[];
}

const STATUS_LABEL: Record<VehicleTireStatusEnum, string> = {
  montado: "Montado",
  estoque: "Estoque",
  manutencao: "Manutenção",
  sucateado: "Sucateado",
};

const STATUS_CLASS: Record<VehicleTireStatusEnum, string> = {
  montado: "bg-success/15 text-success",
  estoque: "bg-surface-muted text-muted-foreground",
  manutencao: "bg-warning/15 text-warning",
  sucateado: "bg-danger/15 text-danger",
};

export function PneusClient({ pneusIniciais, veiculos }: PneusClientProps) {
  const [pneus, setPneus] = useState(pneusIniciais);
  const [formTarget, setFormTarget] = useState<VehicleTireRow | null | undefined>(undefined);
  const [filtroVeiculo, setFiltroVeiculo] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");

  const veiculosPorId = useMemo(() => new Map(veiculos.map((v) => [v.id, v])), [veiculos]);

  const pneusFiltrados = useMemo(() => {
    return pneus.filter((p) => {
      if (filtroVeiculo && p.vehicle_id !== filtroVeiculo) return false;
      if (filtroStatus && p.status !== filtroStatus) return false;
      return true;
    });
  }, [pneus, filtroVeiculo, filtroStatus]);

  function handleSaved(pneu: VehicleTireRow) {
    setPneus((prev) => {
      const existe = prev.some((p) => p.id === pneu.id);
      return existe ? prev.map((p) => (p.id === pneu.id ? pneu : p)) : [pneu, ...prev];
    });
  }

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Pneus</h1>
          <p className="text-sm text-muted-foreground">{pneusFiltrados.length} pneu(s)</p>
        </div>
        <Button onClick={() => setFormTarget(null)} className="gap-1.5">
          <Plus className="size-4" aria-hidden />
          Novo pneu
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={filtroVeiculo}
          onChange={(e) => setFiltroVeiculo(e.target.value)}
          className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
        >
          <option value="">Todos os veículos</option>
          {veiculos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name || v.plate || v.id}
            </option>
          ))}
        </select>
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABEL).map(([valor, label]) => (
            <option key={valor} value={valor}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {pneusFiltrados.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={Disc}
            title={pneus.length === 0 ? "Nenhum pneu cadastrado" : "Nenhum pneu com esse filtro"}
            description={
              pneus.length === 0
                ? 'Cadastre aqui ou peça pelo WhatsApp "montei um pneu novo no dianteiro esquerdo" — o consumo de vida útil fica disponível a partir da 1ª leitura de km.'
                : "Ajuste o filtro ou cadastre um novo pneu."
            }
          >
            <Button className="mt-4" onClick={() => setFormTarget(null)}>
              Cadastrar pneu
            </Button>
          </EmptyState>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="frota-table w-full min-w-[880px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Veículo</th>
                <th className="px-4 py-3 font-medium">Posição</th>
                <th className="px-4 py-3 font-medium">Marca/Modelo</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Km rodado</th>
                <th className="px-4 py-3 font-medium text-right">Km restante</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {pneusFiltrados.map((pneu) => {
                const veiculo = pneu.vehicle_id ? veiculosPorId.get(pneu.vehicle_id) : null;
                const { kmRodado, kmRestante } = computeTireKm(pneu);
                return (
                  <tr key={pneu.id} className="border-b border-border last:border-0 hover:bg-surface-muted/50">
                    <td data-label="Veículo" className="px-4 py-3 text-foreground">{veiculo ? veiculo.name || veiculo.plate : "—"}</td>
                    <td data-label="Posição" className="px-4 py-3 text-muted-foreground">{pneu.position ?? "—"}</td>
                    <td data-label="Marca/Modelo" className="px-4 py-3 text-muted-foreground">{[pneu.brand, pneu.model].filter(Boolean).join(" ") || "—"}</td>
                    <td data-label="Status" className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[pneu.status]}`}>{STATUS_LABEL[pneu.status]}</span>
                    </td>
                    <td data-label="Km rodado" className="px-4 py-3 text-right text-muted-foreground">{kmRodado !== null ? `${kmRodado} km` : "—"}</td>
                    <td data-label="Km restante" className="px-4 py-3 text-right text-muted-foreground">
                      {kmRestante !== null ? (
                        <span className={kmRestante <= 1000 ? "font-medium text-danger" : undefined}>{kmRestante} km</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setFormTarget(pneu)}>
                          <SquarePen className="size-3.5" aria-hidden />
                          Editar
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

      <VehicleTireFormModal open={formTarget !== undefined} onClose={() => setFormTarget(undefined)} tire={formTarget ?? null} veiculos={veiculos} onSaved={handleSaved} />
    </div>
  );
}
