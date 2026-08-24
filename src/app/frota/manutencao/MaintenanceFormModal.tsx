"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";
import { maintenanceScheduleCreateSchema, maintenanceScheduleUpdateSchema, maintenanceCostSchema } from "@/lib/validation/schemas";
import type { MaintenanceScheduleRow, VehicleRow, ExpenseRow } from "@/lib/supabase/tables";

const selectClass = cn(
  "flex h-10 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent"
);

const labelClass = "mb-1.5 block text-sm font-medium text-foreground";

interface MaintenanceFormModalProps {
  open: boolean;
  onClose: () => void;
  schedule: MaintenanceScheduleRow | null;
  veiculosAtivos: VehicleRow[];
  onSaved: (schedule: MaintenanceScheduleRow, despesaVinculada?: ExpenseRow | null) => void;
}

interface FormState {
  vehicleId: string;
  type: string;
  dueDate: string;
  status: string;
  notes: string;
  executedDate: string;
  executedKm: string;
  nextDueKm: string;
  /** Só usado ao concluir — nunca gravado em maintenance_schedules, vira/atualiza a despesa vinculada (ver syncMaintenanceExpense). */
  costAmount: string;
}

function toFormState(schedule: MaintenanceScheduleRow | null): FormState {
  return {
    vehicleId: schedule?.vehicle_id ?? "",
    type: schedule?.type ?? "",
    dueDate: schedule?.due_date ?? "",
    status: schedule?.status ?? "pendente",
    notes: schedule?.notes ?? "",
    executedDate: schedule?.executed_date ?? "",
    executedKm: schedule?.executed_km != null ? String(schedule.executed_km) : "",
    nextDueKm: schedule?.next_due_km != null ? String(schedule.next_due_km) : "",
    costAmount: "",
  };
}

function toPayload(form: FormState): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (form.vehicleId) payload.vehicleId = form.vehicleId;
  if (form.type) payload.type = form.type;
  if (form.dueDate) payload.dueDate = form.dueDate;
  if (form.status) payload.status = form.status;
  if (form.notes) payload.notes = form.notes;
  if (form.executedDate) payload.executedDate = form.executedDate;
  if (form.executedKm) payload.executedKm = Number(form.executedKm);
  if (form.nextDueKm) payload.nextDueKm = Number(form.nextDueKm);
  // costAmount NÃO entra no payload validado pelo schema de maintenance_schedules — vai solto, a API lê separadamente.
  if (form.status === "concluido" && form.costAmount) payload.costAmount = Number(form.costAmount);
  return payload;
}

export function MaintenanceFormModal({ open, onClose, schedule, veiculosAtivos, onSaved }: MaintenanceFormModalProps) {
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(() => toFormState(schedule));
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isEditing = schedule !== null;
  const semVeiculoAtivo = veiculosAtivos.length === 0;
  const concluindo = form.status === "concluido";

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

    if (!form.type.trim() || !form.vehicleId || !form.dueDate) {
      setFormError("Tipo, veículo e vencimento são obrigatórios.");
      return;
    }
    if (concluindo && form.costAmount) {
      const custoParsed = maintenanceCostSchema.safeParse(Number(form.costAmount));
      if (!custoParsed.success) {
        setFormError(custoParsed.error.issues[0]?.message ?? "Custo inválido.");
        return;
      }
    }

    const payload = toPayload(form);
    const { costAmount, ...camposManutencao } = payload;
    const schema = isEditing ? maintenanceScheduleUpdateSchema : maintenanceScheduleCreateSchema;
    const parsed = schema.safeParse(camposManutencao);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(isEditing ? `/api/frota/manutencao/${schedule.id}` : "/api/frota/manutencao", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...camposManutencao, ...(costAmount != null ? { costAmount } : {}) }),
      });
      const data = await response.json();

      if (!response.ok) {
        showToast({ title: "Não foi possível salvar", description: data.error ?? "Tente novamente.", variant: "error" });
        return;
      }

      showToast({
        title: isEditing ? "Manutenção atualizada" : "Manutenção agendada",
        description: data.despesa ? "Custo registrado em Despesas." : undefined,
        variant: "success",
      });
      onSaved(data.manutencao, data.despesa);
      resetAndClose();
    } catch {
      showToast({ title: "Não foi possível salvar", description: "Verifique sua conexão e tente novamente.", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={resetAndClose} title={isEditing ? "Editar manutenção" : "Nova manutenção"} className="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="type" className={labelClass}>
            Tipo
          </label>
          <Input id="type" value={form.type} onChange={(e) => updateField("type", e.target.value)} placeholder="Ex.: Troca de óleo" required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="vehicleId" className={labelClass}>
              Veículo
            </label>
            <select
              id="vehicleId"
              value={form.vehicleId}
              onChange={(e) => updateField("vehicleId", e.target.value)}
              className={selectClass}
              required
              disabled={semVeiculoAtivo}
            >
              <option value="" disabled>
                Selecione um veículo
              </option>
              {veiculosAtivos.map((veiculo) => (
                <option key={veiculo.id} value={veiculo.id}>
                  {veiculo.name || veiculo.plate || "Sem apelido"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="dueDate" className={labelClass}>
              Vencimento
            </label>
            <Input id="dueDate" type="date" value={form.dueDate} onChange={(e) => updateField("dueDate", e.target.value)} required />
          </div>
        </div>

        <div>
          <label htmlFor="status" className={labelClass}>
            Status
          </label>
          <select id="status" value={form.status} onChange={(e) => updateField("status", e.target.value)} className={selectClass}>
            <option value="pendente">Pendente</option>
            <option value="agendado">Agendado</option>
            <option value="concluido">Concluído</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="executedKm" className={labelClass}>
              Km da execução <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <Input id="executedKm" type="number" min={0} inputMode="numeric" value={form.executedKm} onChange={(e) => updateField("executedKm", e.target.value)} placeholder="Ex.: 250000" />
          </div>
          <div>
            <label htmlFor="nextDueKm" className={labelClass}>
              Próxima em km <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <Input id="nextDueKm" type="number" min={0} inputMode="numeric" value={form.nextDueKm} onChange={(e) => updateField("nextDueKm", e.target.value)} placeholder="Ex.: 260000" />
          </div>
        </div>

        {concluindo && (
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-surface-muted/40 p-3">
            <div>
              <label htmlFor="executedDate" className={labelClass}>
                Data da execução <span className="font-normal text-muted-foreground">(opcional)</span>
              </label>
              <Input id="executedDate" type="date" value={form.executedDate} onChange={(e) => updateField("executedDate", e.target.value)} />
            </div>
            <div>
              <label htmlFor="costAmount" className={labelClass}>
                Custo (R$) <span className="font-normal text-muted-foreground">(opcional)</span>
              </label>
              <Input
                id="costAmount"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={form.costAmount}
                onChange={(e) => updateField("costAmount", e.target.value)}
                placeholder="Ex.: 1200.00"
              />
            </div>
            <p className="col-span-2 text-xs text-muted-foreground">
              Informar o custo cria (ou atualiza, se já existir) uma despesa em Despesas vinculada a esta manutenção — nunca duplica.
            </p>
          </div>
        )}

        <div>
          <label htmlFor="notes" className={labelClass}>
            Observações
          </label>
          <Textarea id="notes" rows={3} value={form.notes} onChange={(e) => updateField("notes", e.target.value)} />
        </div>

        {semVeiculoAtivo && (
          <p className="text-sm text-danger">Cadastre um veículo ativo antes de agendar uma manutenção.</p>
        )}
        {formError && <p className="text-sm text-danger">{formError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={resetAndClose}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={isSaving} disabled={semVeiculoAtivo}>
            {isEditing ? "Salvar alterações" : "Agendar manutenção"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
