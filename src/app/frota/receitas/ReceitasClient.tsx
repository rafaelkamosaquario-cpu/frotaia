"use client";

import { useMemo, useState } from "react";
import { TrendingUp, SquarePen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/hooks/useToast";
import type { RevenueRow, VehicleRow, DriverRow } from "@/lib/supabase/tables";
import { RevenueFormModal } from "./RevenueFormModal";

interface ReceitasClientProps {
  receitasIniciais: RevenueRow[];
  veiculos: VehicleRow[];
  motoristas: DriverRow[];
}

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

function formatBRL(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ReceitasClient({ receitasIniciais, veiculos, motoristas }: ReceitasClientProps) {
  const { showToast } = useToast();
  const [receitas, setReceitas] = useState(receitasIniciais);
  const [formTarget, setFormTarget] = useState<RevenueRow | null | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<RevenueRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [filtroVeiculo, setFiltroVeiculo] = useState("");

  const veiculosPorId = useMemo(() => new Map(veiculos.map((v) => [v.id, v])), [veiculos]);
  const motoristasPorId = useMemo(() => new Map(motoristas.map((m) => [m.id, m])), [motoristas]);

  const receitasFiltradas = useMemo(() => {
    if (!filtroVeiculo) return receitas;
    return receitas.filter((r) => r.vehicle_id === filtroVeiculo);
  }, [receitas, filtroVeiculo]);

  const totalFiltrado = useMemo(() => receitasFiltradas.reduce((soma, r) => soma + r.amount, 0), [receitasFiltradas]);

  function handleSaved(receita: RevenueRow) {
    setReceitas((prev) => {
      const existe = prev.some((r) => r.id === receita.id);
      const proxima = existe ? prev.map((r) => (r.id === receita.id ? receita : r)) : [receita, ...prev];
      return [...proxima].sort((a, b) => b.revenue_date.localeCompare(a.revenue_date));
    });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/frota/receitas/${deleteTarget.id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        showToast({ title: "Não foi possível excluir", description: data.error ?? "Tente novamente.", variant: "error" });
        return;
      }
      setReceitas((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      showToast({ title: "Receita excluída", variant: "success" });
    } catch {
      showToast({ title: "Não foi possível excluir", description: "Verifique sua conexão e tente novamente.", variant: "error" });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Receitas</h1>
          <p className="text-sm text-muted-foreground">
            {receitasFiltradas.length} receita(s) · total {formatBRL(totalFiltrado)}
          </p>
        </div>
        <Button onClick={() => setFormTarget(null)} className="gap-1.5">
          <SquarePen className="size-4" aria-hidden />
          Nova receita
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
      </div>

      {receitasFiltradas.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={TrendingUp}
            title={receitas.length === 0 ? "Nenhuma receita registrada" : "Nenhuma receita com esse filtro"}
            description={
              receitas.length === 0
                ? 'Registre aqui um frete já fechado, ou peça pelo WhatsApp "fechei um frete de R$5.000" depois de confirmar — nunca a partir de uma simulação.'
                : "Ajuste o filtro ou registre uma nova receita."
            }
          >
            <Button className="mt-4" onClick={() => setFormTarget(null)}>
              Registrar receita
            </Button>
          </EmptyState>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="frota-table w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Veículo</th>
                <th className="px-4 py-3 font-medium">Motorista</th>
                <th className="px-4 py-3 font-medium">Descrição</th>
                <th className="px-4 py-3 font-medium text-right">Valor</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {receitasFiltradas.map((receita) => {
                const veiculo = receita.vehicle_id ? veiculosPorId.get(receita.vehicle_id) : null;
                const motorista = receita.driver_id ? motoristasPorId.get(receita.driver_id) : null;
                return (
                  <tr key={receita.id} className="border-b border-border last:border-0 hover:bg-surface-muted/50">
                    <td data-label="Data" className="px-4 py-3 text-muted-foreground">{formatDate(receita.revenue_date)}</td>
                    <td data-label="Veículo" className="px-4 py-3 text-muted-foreground">{veiculo ? veiculo.name || veiculo.plate : "—"}</td>
                    <td data-label="Motorista" className="px-4 py-3 text-muted-foreground">{motorista?.name ?? "—"}</td>
                    <td data-label="Descrição" className="px-4 py-3 text-muted-foreground">{receita.description ?? "—"}</td>
                    <td data-label="Valor" className="px-4 py-3 text-right font-medium text-success">{formatBRL(receita.amount)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setFormTarget(receita)}>
                          <SquarePen className="size-3.5" aria-hidden />
                          Editar
                        </Button>
                        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setDeleteTarget(receita)}>
                          <Trash2 className="size-3.5" aria-hidden />
                          Excluir
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

      <RevenueFormModal
        open={formTarget !== undefined}
        onClose={() => setFormTarget(undefined)}
        receita={formTarget ?? null}
        veiculos={veiculos}
        motoristas={motoristas}
        onSaved={handleSaved}
      />

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Excluir receita"
        description={`Tem certeza que deseja excluir esta receita${deleteTarget ? ` de ${formatBRL(deleteTarget.amount)}` : ""}? Essa ação não pode ser desfeita.`}
        confirmLabel={isDeleting ? "Excluindo..." : "Excluir"}
        variant="danger"
      />
    </div>
  );
}
