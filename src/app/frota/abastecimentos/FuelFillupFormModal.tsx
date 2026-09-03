"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";
import { fuelFillupCreateSchema, fuelFillupUpdateSchema } from "@/lib/validation/schemas";
import type { FuelFillupRow, VehicleRow, DriverRow, VendorRow } from "@/lib/supabase/tables";

const selectClass = cn(
  "flex h-10 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent"
);

const labelClass = "mb-1.5 block text-sm font-medium text-foreground";

interface FuelFillupFormModalProps {
  open: boolean;
  onClose: () => void;
  fillup: FuelFillupRow | null;
  veiculos: VehicleRow[];
  motoristas: DriverRow[];
  fornecedores: VendorRow[];
  onSaved: (fillup: FuelFillupRow) => void;
}

interface FormState {
  vehicleId: string;
  driverId: string;
  vendorId: string;
  fillupDate: string;
  liters: string;
  pricePerLiter: string;
  totalAmount: string;
  odometerKm: string;
  notes: string;
}

function toFormState(fillup: FuelFillupRow | null): FormState {
  return {
    vehicleId: fillup?.vehicle_id ?? "",
    driverId: fillup?.driver_id ?? "",
    vendorId: fillup?.vendor_id ?? "",
    fillupDate: fillup?.fillup_date ?? new Date().toISOString().slice(0, 10),
    liters: fillup?.liters != null ? String(fillup.liters) : "",
    pricePerLiter: fillup?.price_per_liter != null ? String(fillup.price_per_liter) : "",
    totalAmount: fillup?.total_amount != null ? String(fillup.total_amount) : "",
    odometerKm: fillup?.odometer_km != null ? String(fillup.odometer_km) : "",
    notes: fillup?.notes ?? "",
  };
}

function toPayload(form: FormState): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (form.vehicleId) payload.vehicleId = form.vehicleId;
  if (form.driverId) payload.driverId = form.driverId;
  if (form.vendorId) payload.vendorId = form.vendorId;
  if (form.fillupDate) payload.fillupDate = form.fillupDate;
  if (form.liters) payload.liters = Number(form.liters);
  if (form.pricePerLiter) payload.pricePerLiter = Number(form.pricePerLiter);
  if (form.totalAmount) payload.totalAmount = Number(form.totalAmount);
  if (form.odometerKm) payload.odometerKm = Number(form.odometerKm);
  if (form.notes) payload.notes = form.notes;
  return payload;
}

export function FuelFillupFormModal({ open, onClose, fillup, veiculos, motoristas, fornecedores, onSaved }: FuelFillupFormModalProps) {
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(() => toFormState(fillup));
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isEditing = fillup !== null;

  const [syncedWith, setSyncedWith] = useState<FuelFillupRow | null>(null);
  if (open && fillup !== syncedWith) {
    setSyncedWith(fillup);
    setForm(toFormState(fillup));
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

    if (!form.vehicleId) {
      setFormError("Veículo é obrigatório.");
      return;
    }

    const payload = toPayload(form);
    const schema = isEditing ? fuelFillupUpdateSchema : fuelFillupCreateSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(isEditing ? `/api/frota/abastecimentos/${fillup.id}` : "/api/frota/abastecimentos", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        showToast({ title: "Não foi possível salvar", description: data.error ?? "Tente novamente.", variant: "error" });
        return;
      }

      showToast({ title: isEditing ? "Abastecimento atualizado" : "Abastecimento registrado", variant: "success" });
      onSaved(data.abastecimento);
      resetAndClose();
    } catch {
      showToast({ title: "Não foi possível salvar", description: "Verifique sua conexão e tente novamente.", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={resetAndClose} title={isEditing ? "Editar abastecimento" : "Novo abastecimento"} className="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="vehicleId" className={labelClass}>
              Veículo
            </label>
            <select id="vehicleId" value={form.vehicleId} onChange={(e) => updateField("vehicleId", e.target.value)} className={selectClass} required>
              <option value="">Selecione</option>
              {veiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name || v.plate || v.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="fillupDate" className={labelClass}>
              Data
            </label>
            <Input id="fillupDate" type="date" value={form.fillupDate} onChange={(e) => updateField("fillupDate", e.target.value)} required />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="liters" className={labelClass}>
              Litros
            </label>
            <Input id="liters" type="number" min="0" step="0.01" value={form.liters} onChange={(e) => updateField("liters", e.target.value)} required />
          </div>
          <div>
            <label htmlFor="pricePerLiter" className={labelClass}>
              R$/litro <span className="font-normal text-muted-foreground">(opc.)</span>
            </label>
            <Input id="pricePerLiter" type="number" min="0" step="0.001" value={form.pricePerLiter} onChange={(e) => updateField("pricePerLiter", e.target.value)} />
          </div>
          <div>
            <label htmlFor="totalAmount" className={labelClass}>
              Total (R$)
            </label>
            <Input id="totalAmount" type="number" min="0" step="0.01" value={form.totalAmount} onChange={(e) => updateField("totalAmount", e.target.value)} required />
          </div>
        </div>

        <div>
          <label htmlFor="odometerKm" className={labelClass}>
            Km do odômetro <span className="font-normal text-muted-foreground">(opcional — necessário pro consumo médio real)</span>
          </label>
          <Input id="odometerKm" type="number" min="0" step="1" value={form.odometerKm} onChange={(e) => updateField("odometerKm", e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
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
          <div>
            <label htmlFor="vendorId" className={labelClass}>
              Posto <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <select id="vendorId" value={form.vendorId} onChange={(e) => updateField("vendorId", e.target.value)} className={selectClass}>
              <option value="">Não informar</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="notes" className={labelClass}>
            Observações <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <Textarea id="notes" rows={2} value={form.notes} onChange={(e) => updateField("notes", e.target.value)} />
        </div>

        {formError && <p className="text-sm text-danger">{formError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={resetAndClose}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={isSaving}>
            {isEditing ? "Salvar alterações" : "Registrar abastecimento"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
