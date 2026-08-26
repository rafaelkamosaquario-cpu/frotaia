"use client";

import { useMemo, useState } from "react";
import { WalletCards, SquarePen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/hooks/useToast";
import type { ExpenseRow, ExpenseTypeEnum, VehicleRow } from "@/lib/supabase/tables";
import { ExpenseFormModal } from "./ExpenseFormModal";
import { ContextualHelp } from "@/components/frota/ContextualHelp";

interface DespesasClientProps {
  despesasIniciais: ExpenseRow[];
  veiculos: VehicleRow[];
}

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

function formatBRL(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export const EXPENSE_TYPE_LABEL: Record<ExpenseTypeEnum, string> = {
  combustivel: "Combustível",
  manutencao: "Manutenção",
  pedagio: "Pedágio",
  alimentacao: "Alimentação",
  hospedagem: "Hospedagem",
  documentacao: "Documentação",
  pneu: "Pneu",
  seguro: "Seguro",
  multa: "Multa",
  outro: "Outro",
};

export function DespesasClient({ despesasIniciais, veiculos }: DespesasClientProps) {
  const { showToast } = useToast();
  const [despesas, setDespesas] = useState(despesasIniciais);
  const [formTarget, setFormTarget] = useState<ExpenseRow | null | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [filtroVeiculo, setFiltroVeiculo] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");

  const veiculosPorId = useMemo(() => new Map(veiculos.map((v) => [v.id, v])), [veiculos]);

  const despesasFiltradas = useMemo(() => {
    return despesas.filter((d) => {
      if (filtroVeiculo && d.vehicle_id !== filtroVeiculo) return false;
      if (filtroTipo && d.expense_type !== filtroTipo) return false;
      return true;
    });
  }, [despesas, filtroVeiculo, filtroTipo]);

  const totalFiltrado = useMemo(() => despesasFiltradas.reduce((soma, d) => soma + d.amount, 0), [despesasFiltradas]);

  function handleSaved(despesa: ExpenseRow) {
    setDespesas((prev) => {
      const existe = prev.some((d) => d.id === despesa.id);
      const proxima = existe ? prev.map((d) => (d.id === despesa.id ? despesa : d)) : [despesa, ...prev];
      return [...proxima].sort((a, b) => b.expense_date.localeCompare(a.expense_date));
    });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/frota/despesas/${deleteTarget.id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        showToast({ title: "Não foi possível excluir", description: data.error ?? "Tente novamente.", variant: "error" });
        return;
      }
      setDespesas((prev) => prev.filter((d) => d.id !== deleteTarget.id));
      showToast({ title: "Despesa excluída", variant: "success" });
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
          <h1 className="text-lg font-semibold text-foreground">Despesas</h1>
          <p className="text-sm text-muted-foreground">
            {despesasFiltradas.length} despesa(s) · total {formatBRL(totalFiltrado)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ContextualHelp topic="despesas" />
          <Button onClick={() => setFormTarget(null)} className="gap-1.5">
            <SquarePen className="size-4" aria-hidden />
            Nova despesa
          </Button>
        </div>
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
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
        >
          <option value="">Todos os tipos</option>
          {Object.entries(EXPENSE_TYPE_LABEL).map(([valor, label]) => (
            <option key={valor} value={valor}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {despesasFiltradas.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={WalletCards}
            title={despesas.length === 0 ? "Nenhuma despesa registrada" : "Nenhuma despesa com esse filtro"}
            description={despesas.length === 0 ? "Registre a primeira despesa da frota pra começar." : "Ajuste o filtro ou registre uma nova despesa."}
          >
            <Button className="mt-4" onClick={() => setFormTarget(null)}>
              Registrar despesa
            </Button>
          </EmptyState>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="frota-table w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Veículo</th>
                <th className="px-4 py-3 font-medium">Fornecedor</th>
                <th className="px-4 py-3 font-medium text-right">Valor</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {despesasFiltradas.map((despesa) => {
                const veiculo = despesa.vehicle_id ? veiculosPorId.get(despesa.vehicle_id) : null;
                return (
                  <tr key={despesa.id} className="border-b border-border last:border-0 hover:bg-surface-muted/50">
                    <td data-label="Data" className="px-4 py-3 text-muted-foreground">{formatDate(despesa.expense_date)}</td>
                    <td data-label="Tipo" className="px-4 py-3 text-foreground">{EXPENSE_TYPE_LABEL[despesa.expense_type]}</td>
                    <td data-label="Veículo" className="px-4 py-3 text-muted-foreground">{veiculo ? veiculo.name || veiculo.plate : "—"}</td>
                    <td data-label="Fornecedor" className="px-4 py-3 text-muted-foreground">{despesa.vendor ?? "—"}</td>
                    <td data-label="Valor" className="px-4 py-3 text-right font-medium text-foreground">{formatBRL(despesa.amount)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setFormTarget(despesa)}>
                          <SquarePen className="size-3.5" aria-hidden />
                          Editar
                        </Button>
                        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setDeleteTarget(despesa)}>
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

      <ExpenseFormModal
        open={formTarget !== undefined}
        onClose={() => setFormTarget(undefined)}
        despesa={formTarget ?? null}
        veiculos={veiculos}
        onSaved={handleSaved}
      />

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Excluir despesa"
        description={`Tem certeza que deseja excluir esta despesa${deleteTarget ? ` de ${formatBRL(deleteTarget.amount)}` : ""}? Essa ação não pode ser desfeita.`}
        confirmLabel={isDeleting ? "Excluindo..." : "Excluir"}
        variant="danger"
      />
    </div>
  );
}
