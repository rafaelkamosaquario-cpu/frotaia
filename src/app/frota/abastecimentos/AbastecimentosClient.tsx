"use client";

import { useEffect, useMemo, useState } from "react";
import { Fuel, SquarePen, Trash2, Plus, Gauge } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/hooks/useToast";
import type { FuelFillupRow, VehicleRow, DriverRow, VendorRow } from "@/lib/supabase/tables";
import { FuelFillupFormModal } from "./FuelFillupFormModal";

interface AbastecimentosClientProps {
  abastecimentosIniciais: FuelFillupRow[];
  veiculos: VehicleRow[];
  motoristas: DriverRow[];
  fornecedores: VendorRow[];
}

interface ConsumoMedio {
  litrosConsiderados: number;
  kmRodado: number;
  consumoMedioKmL: number | null;
  abastecimentosNoPeriodo: number;
  abastecimentosComKm: number;
  gastoTotal: number;
}

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

function formatBRL(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function AbastecimentosClient({ abastecimentosIniciais, veiculos, motoristas, fornecedores }: AbastecimentosClientProps) {
  const { showToast } = useToast();
  const [abastecimentos, setAbastecimentos] = useState(abastecimentosIniciais);
  const [formTarget, setFormTarget] = useState<FuelFillupRow | null | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<FuelFillupRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [filtroVeiculo, setFiltroVeiculo] = useState("");
  const [consumoMedio, setConsumoMedio] = useState<ConsumoMedio | null>(null);

  const veiculosPorId = useMemo(() => new Map(veiculos.map((v) => [v.id, v])), [veiculos]);
  const fornecedoresPorId = useMemo(() => new Map(fornecedores.map((f) => [f.id, f])), [fornecedores]);

  const abastecimentosFiltrados = useMemo(() => {
    if (!filtroVeiculo) return abastecimentos;
    return abastecimentos.filter((a) => a.vehicle_id === filtroVeiculo);
  }, [abastecimentos, filtroVeiculo]);

  const gastoFiltrado = useMemo(() => abastecimentosFiltrados.reduce((soma, a) => soma + Number(a.total_amount), 0), [abastecimentosFiltrados]);

  useEffect(() => {
    if (!filtroVeiculo) return;
    let cancelado = false;
    fetch(`/api/frota/abastecimentos?vehicleId=${filtroVeiculo}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelado) setConsumoMedio(data.consumoMedio ?? null);
      })
      .catch(() => {
        if (!cancelado) setConsumoMedio(null);
      });
    return () => {
      cancelado = true;
    };
  }, [filtroVeiculo]);

  function handleSaved(abastecimento: FuelFillupRow) {
    setAbastecimentos((prev) => {
      const existe = prev.some((a) => a.id === abastecimento.id);
      const proxima = existe ? prev.map((a) => (a.id === abastecimento.id ? abastecimento : a)) : [abastecimento, ...prev];
      return [...proxima].sort((a, b) => b.fillup_date.localeCompare(a.fillup_date));
    });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/frota/abastecimentos/${deleteTarget.id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        showToast({ title: "Não foi possível excluir", description: data.error ?? "Tente novamente.", variant: "error" });
        return;
      }
      setAbastecimentos((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      showToast({ title: "Abastecimento excluído", variant: "success" });
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
          <h1 className="text-lg font-semibold text-foreground">Abastecimentos</h1>
          <p className="text-sm text-muted-foreground">
            {abastecimentosFiltrados.length} abastecimento(s) · total {formatBRL(gastoFiltrado)}
          </p>
        </div>
        <Button onClick={() => setFormTarget(null)} className="gap-1.5">
          <Plus className="size-4" aria-hidden />
          Novo abastecimento
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
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

        {filtroVeiculo && consumoMedio && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-muted px-3 py-1.5 text-sm text-foreground">
            <Gauge className="size-3.5 text-muted-foreground" aria-hidden />
            {consumoMedio.consumoMedioKmL !== null
              ? `Consumo médio real: ${consumoMedio.consumoMedioKmL} km/l (${consumoMedio.kmRodado} km, ${consumoMedio.abastecimentosComKm} leituras)`
              : "Consumo médio real: informe o km do odômetro em pelo menos 2 abastecimentos pra calcular"}
          </span>
        )}
      </div>

      {abastecimentosFiltrados.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={Fuel}
            title={abastecimentos.length === 0 ? "Nenhum abastecimento registrado" : "Nenhum abastecimento com esse filtro"}
            description={
              abastecimentos.length === 0
                ? 'Registre aqui ou peça pelo WhatsApp "abasteci 300 litros hoje" — o consumo médio real fica disponível a partir do 2º abastecimento com km informado.'
                : "Ajuste o filtro ou registre um novo abastecimento."
            }
          >
            <Button className="mt-4" onClick={() => setFormTarget(null)}>
              Registrar abastecimento
            </Button>
          </EmptyState>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="frota-table w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Veículo</th>
                <th className="px-4 py-3 font-medium">Fornecedor</th>
                <th className="px-4 py-3 font-medium text-right">Litros</th>
                <th className="px-4 py-3 font-medium text-right">Km odômetro</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {abastecimentosFiltrados.map((abastecimento) => {
                const veiculo = veiculosPorId.get(abastecimento.vehicle_id);
                const fornecedor = abastecimento.vendor_id ? fornecedoresPorId.get(abastecimento.vendor_id) : null;
                return (
                  <tr key={abastecimento.id} className="border-b border-border last:border-0 hover:bg-surface-muted/50">
                    <td data-label="Data" className="px-4 py-3 text-muted-foreground">{formatDate(abastecimento.fillup_date)}</td>
                    <td data-label="Veículo" className="px-4 py-3 text-foreground">{veiculo ? veiculo.name || veiculo.plate : "—"}</td>
                    <td data-label="Fornecedor" className="px-4 py-3 text-muted-foreground">{fornecedor?.name ?? "—"}</td>
                    <td data-label="Litros" className="px-4 py-3 text-right text-muted-foreground">{Number(abastecimento.liters)}L</td>
                    <td data-label="Km odômetro" className="px-4 py-3 text-right text-muted-foreground">{abastecimento.odometer_km !== null ? Number(abastecimento.odometer_km) : "—"}</td>
                    <td data-label="Total" className="px-4 py-3 text-right font-medium text-foreground">{formatBRL(Number(abastecimento.total_amount))}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setFormTarget(abastecimento)}>
                          <SquarePen className="size-3.5" aria-hidden />
                          Editar
                        </Button>
                        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setDeleteTarget(abastecimento)}>
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

      <FuelFillupFormModal
        open={formTarget !== undefined}
        onClose={() => setFormTarget(undefined)}
        fillup={formTarget ?? null}
        veiculos={veiculos}
        motoristas={motoristas}
        fornecedores={fornecedores}
        onSaved={handleSaved}
      />

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Excluir abastecimento"
        description="Tem certeza que deseja excluir este abastecimento? A despesa vinculada, se houver, não é apagada — só perde o vínculo."
        confirmLabel={isDeleting ? "Excluindo..." : "Excluir"}
        variant="danger"
      />
    </div>
  );
}
