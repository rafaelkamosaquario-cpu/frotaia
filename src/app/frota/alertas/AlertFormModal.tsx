"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";
import { alertCreateSchema, alertUpdateSchema } from "@/lib/validation/schemas";
import type { ScheduledAlertRow, VehicleRow } from "@/lib/supabase/tables";

const selectClass = cn(
  "flex h-10 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent"
);
const labelClass = "mb-1.5 block text-sm font-medium text-foreground";

interface AlertFormModalProps {
  open: boolean;
  onClose: () => void;
  alerta: ScheduledAlertRow | null;
  veiculos: VehicleRow[];
  onSaved: (alerta: ScheduledAlertRow) => void;
}

interface FormState {
  title: string;
  notes: string;
  date: string;
  time: string;
  vehicleId: string;
}

function toDateTimeLocal(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "08:00" };
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

function toFormState(alerta: ScheduledAlertRow | null): FormState {
  const { date, time } = toDateTimeLocal(alerta?.scheduled_for ?? null);
  return { title: alerta?.title ?? "", notes: alerta?.notes ?? "", date, time, vehicleId: alerta?.vehicle_id ?? "" };
}

function toIsoComOffset(date: string, time: string): string {
  // new Date(...).toISOString() sempre devolve "Z" no fim — já é um offset válido pro schema (datetime({offset:true})).
  return new Date(`${date}T${time}:00`).toISOString();
}

export function AlertFormModal({ open, onClose, alerta, veiculos, onSaved }: AlertFormModalProps) {
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(() => toFormState(alerta));
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isEditing = alerta !== null;

  const [syncedWith, setSyncedWith] = useState<ScheduledAlertRow | null>(null);
  if (open && alerta !== syncedWith) {
    setSyncedWith(alerta);
    setForm(toFormState(alerta));
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

    if (!form.title.trim() || !form.date || !form.time) {
      setFormError("Título, data e horário são obrigatórios.");
      return;
    }

    const payload = {
      title: form.title,
      notes: form.notes || undefined,
      vehicleId: form.vehicleId || null,
      scheduledFor: toIsoComOffset(form.date, form.time),
    };
    const schema = isEditing ? alertUpdateSchema : alertCreateSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(isEditing ? `/api/frota/alertas/${alerta.id}` : "/api/frota/alertas", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        showToast({ title: "Não foi possível salvar", description: data.error ?? "Tente novamente.", variant: "error" });
        return;
      }

      showToast({ title: isEditing ? "Alerta atualizado" : "Alerta criado", variant: "success" });
      onSaved(data.alerta);
      resetAndClose();
    } catch {
      showToast({ title: "Não foi possível salvar", description: "Verifique sua conexão e tente novamente.", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={resetAndClose} title={isEditing ? "Editar alerta" : "Novo alerta"} className="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="title" className={labelClass}>
            Título
          </label>
          <Input id="title" value={form.title} onChange={(e) => updateField("title", e.target.value)} placeholder="Ex.: Ligar para o mecânico" required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="date" className={labelClass}>
              Data
            </label>
            <Input id="date" type="date" value={form.date} onChange={(e) => updateField("date", e.target.value)} required />
          </div>
          <div>
            <label htmlFor="time" className={labelClass}>
              Horário
            </label>
            <Input id="time" type="time" value={form.time} onChange={(e) => updateField("time", e.target.value)} required />
          </div>
        </div>

        <div>
          <label htmlFor="vehicleId" className={labelClass}>
            Veículo <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <select id="vehicleId" value={form.vehicleId} onChange={(e) => updateField("vehicleId", e.target.value)} className={selectClass}>
            <option value="">Nenhum específico</option>
            {veiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name || v.plate || v.id}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="notes" className={labelClass}>
            Descrição <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <Textarea id="notes" rows={3} value={form.notes} onChange={(e) => updateField("notes", e.target.value)} />
        </div>

        {formError && <p className="text-sm text-danger">{formError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={resetAndClose}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={isSaving}>
            {isEditing ? "Salvar alterações" : "Criar alerta"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
