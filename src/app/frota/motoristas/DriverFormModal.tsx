"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";
import { driverCreateSchema, driverUpdateSchema } from "@/lib/validation/schemas";
import type { DriverRow, VehicleRow } from "@/lib/supabase/tables";

const selectClass = cn(
  "flex h-10 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent"
);

const labelClass = "mb-1.5 block text-sm font-medium text-foreground";

interface DriverFormModalProps {
  open: boolean;
  onClose: () => void;
  driver: DriverRow | null;
  veiculosAtivos: VehicleRow[];
  onSaved: (driver: DriverRow) => void;
}

interface FormState {
  name: string;
  phoneE164: string;
  vehicleId: string;
  cnhExpiryDate: string;
  toxicologicoExpiryDate: string;
}

function toFormState(driver: DriverRow | null): FormState {
  return {
    name: driver?.name ?? "",
    phoneE164: driver?.phone_e164 ?? "",
    vehicleId: driver?.vehicle_id ?? "",
    cnhExpiryDate: driver?.cnh_expiry_date ?? "",
    toxicologicoExpiryDate: driver?.toxicologico_expiry_date ?? "",
  };
}

/** vehicleId é tratado à parte: precisa distinguir "não mexer" (ausente) de "desvincular" (null explícito). */
function toPayload(form: FormState, isEditing: boolean): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (form.name) payload.name = form.name;
  if (form.phoneE164) payload.phoneE164 = form.phoneE164;
  if (form.cnhExpiryDate) payload.cnhExpiryDate = form.cnhExpiryDate;
  if (form.toxicologicoExpiryDate) payload.toxicologicoExpiryDate = form.toxicologicoExpiryDate;

  if (form.vehicleId) {
    payload.vehicleId = form.vehicleId;
  } else if (isEditing) {
    payload.vehicleId = null;
  }

  return payload;
}

export function DriverFormModal({ open, onClose, driver, veiculosAtivos, onSaved }: DriverFormModalProps) {
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(() => toFormState(driver));
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isEditing = driver !== null;

  function resetAndClose() {
    setForm(toFormState(null));
    setNameError(null);
    onClose();
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setNameError(null);

    if (!form.name.trim()) {
      setNameError("Nome é obrigatório.");
      return;
    }

    const payload = toPayload(form, isEditing);
    const schema = isEditing ? driverUpdateSchema : driverCreateSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(isEditing ? `/api/frota/motoristas/${driver.id}` : "/api/frota/motoristas", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        showToast({ title: "Não foi possível salvar", description: data.error ?? "Tente novamente.", variant: "error" });
        return;
      }

      showToast({ title: isEditing ? "Motorista atualizado" : "Motorista cadastrado", variant: "success" });
      onSaved(data.motorista);
      resetAndClose();
    } catch {
      showToast({ title: "Não foi possível salvar", description: "Verifique sua conexão e tente novamente.", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={resetAndClose} title={isEditing ? "Editar motorista" : "Novo motorista"} className="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className={labelClass}>
            Nome
          </label>
          <Input id="name" value={form.name} onChange={(e) => updateField("name", e.target.value)} placeholder="Ex.: João Silva" required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="phoneE164" className={labelClass}>
              Telefone
            </label>
            <Input
              id="phoneE164"
              value={form.phoneE164}
              onChange={(e) => updateField("phoneE164", e.target.value)}
              placeholder="+5511999998888"
            />
          </div>
          <div>
            <label htmlFor="vehicleId" className={labelClass}>
              Veículo vinculado
            </label>
            <select
              id="vehicleId"
              value={form.vehicleId}
              onChange={(e) => updateField("vehicleId", e.target.value)}
              className={selectClass}
            >
              <option value="">Nenhum</option>
              {veiculosAtivos.map((veiculo) => (
                <option key={veiculo.id} value={veiculo.id}>
                  {veiculo.name || veiculo.plate || "Sem apelido"}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="cnhExpiryDate" className={labelClass}>
              Vencimento da CNH
            </label>
            <Input
              id="cnhExpiryDate"
              type="date"
              value={form.cnhExpiryDate}
              onChange={(e) => updateField("cnhExpiryDate", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="toxicologicoExpiryDate" className={labelClass}>
              Vencimento do toxicológico
            </label>
            <Input
              id="toxicologicoExpiryDate"
              type="date"
              value={form.toxicologicoExpiryDate}
              onChange={(e) => updateField("toxicologicoExpiryDate", e.target.value)}
            />
          </div>
        </div>

        {nameError && <p className="text-sm text-danger">{nameError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={resetAndClose}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={isSaving}>
            {isEditing ? "Salvar alterações" : "Cadastrar motorista"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
