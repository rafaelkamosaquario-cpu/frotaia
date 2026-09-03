"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";
import { revenueCreateSchema, revenueUpdateSchema } from "@/lib/validation/schemas";
import type { RevenueRow, VehicleRow, DriverRow } from "@/lib/supabase/tables";

const selectClass = cn(
  "flex h-10 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent"
);

const labelClass = "mb-1.5 block text-sm font-medium text-foreground";

interface RevenueFormModalProps {
  open: boolean;
  onClose: () => void;
  receita: RevenueRow | null;
  veiculos: VehicleRow[];
  motoristas: DriverRow[];
  onSaved: (receita: RevenueRow) => void;
}

interface FormState {
  vehicleId: string;
  driverId: string;
  amount: string;
  revenueDate: string;
  description: string;
}

function toFormState(receita: RevenueRow | null): FormState {
  return {
    vehicleId: receita?.vehicle_id ?? "",
    driverId: receita?.driver_id ?? "",
    amount: receita?.amount?.toString() ?? "",
    revenueDate: receita?.revenue_date ?? new Date().toISOString().slice(0, 10),
    description: receita?.description ?? "",
  };
}

function toPayload(form: FormState): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (form.vehicleId) payload.vehicleId = form.vehicleId;
  if (form.driverId) payload.driverId = form.driverId;
  if (form.amount) payload.amount = Number(form.amount);
  if (form.revenueDate) payload.revenueDate = form.revenueDate;
  if (form.description) payload.description = form.description;
  return payload;
}

export function RevenueFormModal({ open, onClose, receita, veiculos, motoristas, onSaved }: RevenueFormModalProps) {
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(() => toFormState(receita));
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isEditing = receita !== null;

  const [syncedWith, setSyncedWith] = useState<RevenueRow | null>(null);
  if (open && receita !== syncedWith) {
    setSyncedWith(receita);
    setForm(toFormState(receita));
    setFormError(null);
  } else if (!open && syncedWith !== null) {
    setSyncedWith(null);
  }

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
    const schema = isEditing ? revenueUpdateSchema : revenueCreateSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(isEditing ? `/api/frota/receitas/${receita.id}` : "/api/frota/receitas", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        showToast({ title: "Não foi possível salvar", description: data.error ?? "Tente novamente.", variant: "error" });
        return;
      }

      showToast({ title: isEditing ? "Receita atualizada" : "Receita registrada", variant: "success" });
      onSaved(data.receita);
      resetAndClose();
    } catch {
      showToast({ title: "Não foi possível salvar", description: "Verifique sua conexão e tente novamente.", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={resetAndClose} title={isEditing ? "Editar receita" : "Nova receita"} className="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="amount" className={labelClass}>
              Valor (R$)
            </label>
            <Input id="amount" type="number" step="0.01" min="0" value={form.amount} onChange={(e) => updateField("amount", e.target.value)} required />
          </div>
          <div>
            <label htmlFor="revenueDate" className={labelClass}>
              Data
            </label>
            <Input id="revenueDate" type="date" value={form.revenueDate} onChange={(e) => updateField("revenueDate", e.target.value)} required />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="vehicleId" className={labelClass}>
              Veículo <span className="font-normal text-muted-foreground">(opcional)</span>
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
          <div>
            <label htmlFor="driverId" className={labelClass}>
              Motorista <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <select id="driverId" value={form.driverId} onChange={(e) => updateField("driverId", e.target.value)} className={selectClass}>
              <option value="">Não informar</option>
              {motoristas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="description" className={labelClass}>
            Descrição <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <Textarea id="description" rows={3} value={form.description} onChange={(e) => updateField("description", e.target.value)} placeholder="Ex.: Frete Sorriso → Santos" />
        </div>

        {formError && <p className="text-sm text-danger">{formError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={resetAndClose}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={isSaving}>
            {isEditing ? "Salvar alterações" : "Registrar receita"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
