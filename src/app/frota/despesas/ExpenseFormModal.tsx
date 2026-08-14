"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";
import { expenseCreateSchema, expenseUpdateSchema } from "@/lib/validation/schemas";
import type { ExpenseRow, VehicleRow } from "@/lib/supabase/tables";
import { EXPENSE_TYPE_LABEL } from "./DespesasClient";

const selectClass = cn(
  "flex h-10 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent"
);

const labelClass = "mb-1.5 block text-sm font-medium text-foreground";

interface ExpenseFormModalProps {
  open: boolean;
  onClose: () => void;
  despesa: ExpenseRow | null;
  veiculos: VehicleRow[];
  onSaved: (despesa: ExpenseRow) => void;
}

interface FormState {
  vehicleId: string;
  expenseType: string;
  amount: string;
  expenseDate: string;
  vendor: string;
  description: string;
}

function toFormState(despesa: ExpenseRow | null): FormState {
  return {
    vehicleId: despesa?.vehicle_id ?? "",
    expenseType: despesa?.expense_type ?? "",
    amount: despesa?.amount?.toString() ?? "",
    expenseDate: despesa?.expense_date ?? new Date().toISOString().slice(0, 10),
    vendor: despesa?.vendor ?? "",
    description: despesa?.description ?? "",
  };
}

function toPayload(form: FormState): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (form.vehicleId) payload.vehicleId = form.vehicleId;
  if (form.expenseType) payload.expenseType = form.expenseType;
  if (form.amount) payload.amount = Number(form.amount);
  if (form.expenseDate) payload.expenseDate = form.expenseDate;
  if (form.vendor) payload.vendor = form.vendor;
  if (form.description) payload.description = form.description;
  return payload;
}

export function ExpenseFormModal({ open, onClose, despesa, veiculos, onSaved }: ExpenseFormModalProps) {
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(() => toFormState(despesa));
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isEditing = despesa !== null;

  function resetAndClose() {
    setForm(toFormState(null));
    setFormError(null);
    onClose();
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const payload = toPayload(form);
    const schema = isEditing ? expenseUpdateSchema : expenseCreateSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(isEditing ? `/api/frota/despesas/${despesa.id}` : "/api/frota/despesas", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        showToast({ title: "Não foi possível salvar", description: data.error ?? "Tente novamente.", variant: "error" });
        return;
      }

      showToast({ title: isEditing ? "Despesa atualizada" : "Despesa registrada", variant: "success" });
      onSaved(data.despesa);
      resetAndClose();
    } catch {
      showToast({ title: "Não foi possível salvar", description: "Verifique sua conexão e tente novamente.", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={resetAndClose} title={isEditing ? "Editar despesa" : "Nova despesa"} className="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="expenseType" className={labelClass}>
              Tipo
            </label>
            <select id="expenseType" value={form.expenseType} onChange={(e) => updateField("expenseType", e.target.value)} className={selectClass} required>
              <option value="">Selecione</option>
              {Object.entries(EXPENSE_TYPE_LABEL).map(([valor, label]) => (
                <option key={valor} value={valor}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="amount" className={labelClass}>
              Valor (R$)
            </label>
            <Input id="amount" type="number" step="0.01" min="0" value={form.amount} onChange={(e) => updateField("amount", e.target.value)} required />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="expenseDate" className={labelClass}>
              Data
            </label>
            <Input id="expenseDate" type="date" value={form.expenseDate} onChange={(e) => updateField("expenseDate", e.target.value)} required />
          </div>
          <div>
            <label htmlFor="vehicleId" className={labelClass}>
              Veículo
            </label>
            <select id="vehicleId" value={form.vehicleId} onChange={(e) => updateField("vehicleId", e.target.value)} className={selectClass}>
              <option value="">Não informar</option>
              {veiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name || v.plate || v.id}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="vendor" className={labelClass}>
            Fornecedor
          </label>
          <Input id="vendor" value={form.vendor} onChange={(e) => updateField("vendor", e.target.value)} placeholder="Ex.: Posto Ipiranga" />
        </div>

        <div>
          <label htmlFor="description" className={labelClass}>
            Descrição
          </label>
          <Textarea id="description" rows={3} value={form.description} onChange={(e) => updateField("description", e.target.value)} />
        </div>

        {formError && <p className="text-sm text-danger">{formError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={resetAndClose}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={isSaving}>
            {isEditing ? "Salvar alterações" : "Registrar despesa"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
