"use client";

import { useState } from "react";
import { Store, SquarePen, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/hooks/useToast";
import type { VendorRow, VendorCategoryEnum } from "@/lib/supabase/tables";
import { VendorFormModal } from "./VendorFormModal";

interface FornecedoresClientProps {
  fornecedores: VendorRow[];
}

const CATEGORIA_LABEL: Record<VendorCategoryEnum, string> = {
  posto_combustivel: "Posto de combustível",
  oficina_mecanica: "Oficina mecânica",
  fornecedor_pecas: "Fornecedor de peças",
  outro: "Outro",
};

export function FornecedoresClient({ fornecedores: fornecedoresIniciais }: FornecedoresClientProps) {
  const { showToast } = useToast();
  const [fornecedores, setFornecedores] = useState(fornecedoresIniciais);
  const [formTarget, setFormTarget] = useState<VendorRow | null | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<VendorRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  function handleSaved(fornecedor: VendorRow) {
    setFornecedores((prev) => {
      const existe = prev.some((f) => f.id === fornecedor.id);
      const proxima = existe ? prev.map((f) => (f.id === fornecedor.id ? fornecedor : f)) : [fornecedor, ...prev];
      return [...proxima].sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/frota/fornecedores/${deleteTarget.id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        showToast({ title: "Não foi possível remover", description: data.error ?? "Tente novamente.", variant: "error" });
        return;
      }
      setFornecedores((prev) => prev.filter((f) => f.id !== deleteTarget.id));
      showToast({ title: "Fornecedor removido", variant: "success" });
    } catch {
      showToast({ title: "Não foi possível remover", description: "Verifique sua conexão e tente novamente.", variant: "error" });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Postos e fornecedores</h1>
          <p className="text-sm text-muted-foreground">{fornecedores.length} fornecedor(es) cadastrado(s)</p>
        </div>
        <Button onClick={() => setFormTarget(null)} className="gap-1.5">
          <Plus className="size-4" aria-hidden />
          Novo fornecedor
        </Button>
      </div>

      {fornecedores.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={Store}
            title="Nenhum fornecedor cadastrado ainda"
            description='Cadastre aqui um posto de combustível ou oficina, ou peça pelo WhatsApp "cadastra esse posto" — o dado pode ser reaproveitado nas despesas.'
          >
            <Button className="mt-4" onClick={() => setFormTarget(null)}>
              Cadastrar fornecedor
            </Button>
          </EmptyState>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="frota-table w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium">Endereço</th>
                <th className="px-4 py-3 font-medium">Telefone</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {fornecedores.map((fornecedor) => (
                <tr key={fornecedor.id} className="border-b border-border last:border-0 hover:bg-surface-muted/50">
                  <td data-label="Nome" className="px-4 py-3 text-foreground">{fornecedor.name}</td>
                  <td data-label="Categoria" className="px-4 py-3 text-muted-foreground">{CATEGORIA_LABEL[fornecedor.category]}</td>
                  <td data-label="Endereço" className="px-4 py-3 text-muted-foreground">{fornecedor.address || "—"}</td>
                  <td data-label="Telefone" className="px-4 py-3 text-muted-foreground">{fornecedor.phone || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setFormTarget(fornecedor)}>
                        <SquarePen className="size-3.5" aria-hidden />
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setDeleteTarget(fornecedor)}>
                        <Trash2 className="size-3.5" aria-hidden />
                        Remover
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <VendorFormModal open={formTarget !== undefined} onClose={() => setFormTarget(undefined)} vendor={formTarget ?? null} onSaved={handleSaved} />

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remover fornecedor"
        description={`Tem certeza que deseja remover "${deleteTarget?.name ?? ""}"? Ele deixa de aparecer na lista, mas o histórico é preservado.`}
        confirmLabel={isDeleting ? "Removendo..." : "Remover"}
        variant="danger"
      />
    </div>
  );
}
