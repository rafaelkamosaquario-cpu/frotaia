"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";
import { vehicleTireCreateSchema, vehicleTireUpdateSchema } from "@/lib/validation/schemas";
import type { VehicleTireRow, VehicleRow, VehicleTireStatusEnum } from "@/lib/supabase/tables";

const selectClass = cn(
  "flex h-10 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent"
);

const labelClass = "mb-1.5 block text-sm font-medium text-foreground";

const STATUS_LABEL: Record<VehicleTireStatusEnum, string> = {
  montado: "Montado",
  estoque: "Estoque",
  manutencao: "Manutenção",
  sucateado: "Sucateado",
};

interface VehicleTireFormModalProps {
  open: boolean;
  onClose: () => void;
  tire: VehicleTireRow | null;
  veiculos: VehicleRow[];
  onSaved: (tire: VehicleTireRow) => void;
}

interface FormState {
  vehicleId: string;
  position: string;
  brand: string;
  model: string;
  status: VehicleTireStatusEnum;
  mountedAt: string;
  mountedKm: string;
  lastCheckedKm: string;
  expectedLifeKm: string;
  removalReason: string;
  notes: string;
}

function toFormState(tire: VehicleTireRow | null): FormState {
  return {
    vehicleId: tire?.vehicle_id ?? "",
    position: tire?.position ?? "",
    brand: tire?.brand ?? "",
    model: tire?.model ?? "",
    status: tire?.status ?? "estoque",
    mountedAt: tire?.mounted_at ?? "",
    mountedKm: tire?.mounted_km != null ? String(tire.mounted_km) : "",
    lastCheckedKm: tire?.last_checked_km != null ? String(tire.last_checked_km) : "",
    expectedLifeKm: tire?.expected_life_km != null ? String(tire.expected_life_km) : "",
    removalReason: tire?.removal_reason ?? "",
    notes: tire?.notes ?? "",
  };
}

function toPayload(form: FormState): Record<string, unknown> {
  const payload: Record<string, unknown> = { status: form.status };
  if (form.vehicleId) payload.vehicleId = form.vehicleId;
  if (form.position) payload.position = form.position;
  if (form.brand) payload.brand = form.brand;
  if (form.model) payload.model = form.model;
  if (form.mountedAt) payload.mountedAt = form.mountedAt;
  if (form.mountedKm) payload.mountedKm = Number(form.mountedKm);
  if (form.lastCheckedKm) payload.lastCheckedKm = Number(form.lastCheckedKm);
  if (form.expectedLifeKm) payload.expectedLifeKm = Number(form.expectedLifeKm);
  if (form.removalReason) payload.removalReason = form.removalReason;
  if (form.notes) payload.notes = form.notes;
  return payload;
}

export function VehicleTireFormModal({ open, onClose, tire, veiculos, onSaved }: VehicleTireFormModalProps) {
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(() => toFormState(tire));
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isEditing = tire !== null;

  const [syncedWith, setSyncedWith] = useState<VehicleTireRow | null>(null);
  if (open && tire !== syncedWith) {
    setSyncedWith(tire);
    setForm(toFormState(tire));
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

    if (form.status === "montado" && !form.vehicleId) {
      setFormError("Um pneu 'montado' precisa de um veículo vinculado.");
      return;
    }

    const payload = toPayload(form);
    const schema = isEditing ? vehicleTireUpdateSchema : vehicleTireCreateSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(isEditing ? `/api/frota/pneus/${tire.id}` : "/api/frota/pneus", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        showToast({ title: "Não foi possível salvar", description: data.error ?? "Tente novamente.", variant: "error" });
        return;
      }

      showToast({ title: isEditing ? "Pneu atualizado" : "Pneu cadastrado", variant: "success" });
      onSaved(data.pneu);
      resetAndClose();
    } catch {
      showToast({ title: "Não foi possível salvar", description: "Verifique sua conexão e tente novamente.", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={resetAndClose} title={isEditing ? "Editar pneu" : "Novo pneu"} className="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="vehicleId" className={labelClass}>
              Veículo <span className="font-normal text-muted-foreground">(opcional se em estoque)</span>
            </label>
            <select id="vehicleId" value={form.vehicleId} onChange={(e) => updateField("vehicleId", e.target.value)} className={selectClass}>
              <option value="">Sem veículo</option>
              {veiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name || v.plate || v.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="status" className={labelClass}>
              Status
            </label>
            <select id="status" value={form.status} onChange={(e) => updateField("status", e.target.value as VehicleTireStatusEnum)} className={selectClass}>
              {Object.entries(STATUS_LABEL).map(([valor, label]) => (
                <option key={valor} value={valor}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="position" className={labelClass}>
              Posição <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <Input id="position" value={form.position} onChange={(e) => updateField("position", e.target.value)} placeholder="Ex.: Dianteiro esquerdo" />
          </div>
          <div>
            <label htmlFor="mountedAt" className={labelClass}>
              Data de montagem <span className="font-normal text-muted-foreground">(opc.)</span>
            </label>
            <Input id="mountedAt" type="date" value={form.mountedAt} onChange={(e) => updateField("mountedAt", e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="brand" className={labelClass}>
              Marca <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <Input id="brand" value={form.brand} onChange={(e) => updateField("brand", e.target.value)} />
          </div>
          <div>
            <label htmlFor="model" className={labelClass}>
              Modelo <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <Input id="model" value={form.model} onChange={(e) => updateField("model", e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="mountedKm" className={labelClass}>
              Km na montagem
            </label>
            <Input id="mountedKm" type="number" min="0" step="1" value={form.mountedKm} onChange={(e) => updateField("mountedKm", e.target.value)} />
          </div>
          <div>
            <label htmlFor="lastCheckedKm" className={labelClass}>
              Última leitura de km
            </label>
            <Input id="lastCheckedKm" type="number" min="0" step="1" value={form.lastCheckedKm} onChange={(e) => updateField("lastCheckedKm", e.target.value)} />
          </div>
          <div>
            <label htmlFor="expectedLifeKm" className={labelClass}>
              Vida útil (km)
            </label>
            <Input id="expectedLifeKm" type="number" min="0" step="1" value={form.expectedLifeKm} onChange={(e) => updateField("expectedLifeKm", e.target.value)} />
          </div>
        </div>

        {(form.status === "estoque" || form.status === "sucateado") && isEditing && (
          <div>
            <label htmlFor="removalReason" className={labelClass}>
              Motivo da desmontagem <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <Input id="removalReason" value={form.removalReason} onChange={(e) => updateField("removalReason", e.target.value)} placeholder="Ex.: desgaste, furo, rodízio" />
          </div>
        )}

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
            {isEditing ? "Salvar alterações" : "Cadastrar pneu"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
