"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";
import { vehicleDocumentCreateSchema, vehicleDocumentUpdateSchema } from "@/lib/validation/schemas";
import type { DriverRow, VehicleDocumentRow, VehicleDocumentTypeEnum, VehicleRow } from "@/lib/supabase/tables";

const selectClass = cn(
  "flex h-10 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent"
);

const labelClass = "mb-1.5 block text-sm font-medium text-foreground";

/** tacografo/rntrc/seguro/licenciamento são documentos do veículo; cnh/toxicologico são do motorista (mesma intenção documentada na migration da Fase 1, seguro/licenciamento migrados na Fase 4 do plano de unificação). */
const OWNER_KIND_BY_TYPE: Record<VehicleDocumentTypeEnum, "vehicle" | "driver"> = {
  tacografo: "vehicle",
  rntrc: "vehicle",
  seguro: "vehicle",
  licenciamento: "vehicle",
  cnh: "driver",
  toxicologico: "driver",
};

const DOCUMENT_TYPE_LABEL: Record<VehicleDocumentTypeEnum, string> = {
  tacografo: "Tacógrafo",
  rntrc: "RNTRC",
  seguro: "Seguro",
  licenciamento: "Licenciamento",
  cnh: "CNH",
  toxicologico: "Toxicológico",
};

interface DocumentFormModalProps {
  open: boolean;
  onClose: () => void;
  document: VehicleDocumentRow | null;
  veiculosAtivos: VehicleRow[];
  motoristasAtivos: DriverRow[];
  onSaved: (document: VehicleDocumentRow) => void;
}

interface FormState {
  documentType: VehicleDocumentTypeEnum;
  vehicleId: string;
  driverId: string;
  expiryDate: string;
  notes: string;
}

function toFormState(document: VehicleDocumentRow | null): FormState {
  return {
    documentType: document?.document_type ?? "tacografo",
    vehicleId: document?.vehicle_id ?? "",
    driverId: document?.driver_id ?? "",
    expiryDate: document?.expiry_date ?? "",
    notes: document?.notes ?? "",
  };
}

/** Sempre envia vehicleId/driverId explicitamente — trocar o tipo entre grupos exige trocar o dono junto, "não mexer" quebraria o CHECK do banco. */
function toPayload(form: FormState, ownerKind: "vehicle" | "driver"): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    documentType: form.documentType,
    vehicleId: ownerKind === "vehicle" ? form.vehicleId || null : null,
    driverId: ownerKind === "driver" ? form.driverId || null : null,
  };
  if (form.expiryDate) payload.expiryDate = form.expiryDate;
  if (form.notes) payload.notes = form.notes;
  return payload;
}

export function DocumentFormModal({
  open,
  onClose,
  document,
  veiculosAtivos,
  motoristasAtivos,
  onSaved,
}: DocumentFormModalProps) {
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(() => toFormState(document));
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isEditing = document !== null;
  const ownerKind = OWNER_KIND_BY_TYPE[form.documentType];

  function resetAndClose() {
    setForm(toFormState(null));
    setFormError(null);
    onClose();
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleDocumentTypeChange(value: string) {
    const novoTipo = value as VehicleDocumentTypeEnum;
    const novoOwnerKind = OWNER_KIND_BY_TYPE[novoTipo];
    setForm((prev) => ({
      ...prev,
      documentType: novoTipo,
      vehicleId: novoOwnerKind === "vehicle" ? prev.vehicleId : "",
      driverId: novoOwnerKind === "driver" ? prev.driverId : "",
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (ownerKind === "vehicle" && !form.vehicleId) {
      setFormError("Selecione um veículo.");
      return;
    }
    if (ownerKind === "driver" && !form.driverId) {
      setFormError("Selecione um motorista.");
      return;
    }

    const payload = toPayload(form, ownerKind);
    const schema = isEditing ? vehicleDocumentUpdateSchema : vehicleDocumentCreateSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(isEditing ? `/api/frota/documentos/${document.id}` : "/api/frota/documentos", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        showToast({ title: "Não foi possível salvar", description: data.error ?? "Tente novamente.", variant: "error" });
        return;
      }

      showToast({ title: isEditing ? "Documento atualizado" : "Documento cadastrado", variant: "success" });
      onSaved(data.documento);
      resetAndClose();
    } catch {
      showToast({ title: "Não foi possível salvar", description: "Verifique sua conexão e tente novamente.", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={resetAndClose} title={isEditing ? "Editar documento" : "Novo documento"} className="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="documentType" className={labelClass}>
            Tipo de documento
          </label>
          <select
            id="documentType"
            value={form.documentType}
            onChange={(e) => handleDocumentTypeChange(e.target.value)}
            className={selectClass}
          >
            {Object.entries(DOCUMENT_TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {ownerKind === "vehicle" ? (
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
              disabled={veiculosAtivos.length === 0}
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
            {veiculosAtivos.length === 0 && (
              <p className="mt-1.5 text-sm text-danger">Cadastre um veículo ativo antes de vincular um documento.</p>
            )}
          </div>
        ) : (
          <div>
            <label htmlFor="driverId" className={labelClass}>
              Motorista
            </label>
            <select
              id="driverId"
              value={form.driverId}
              onChange={(e) => updateField("driverId", e.target.value)}
              className={selectClass}
              required
              disabled={motoristasAtivos.length === 0}
            >
              <option value="" disabled>
                Selecione um motorista
              </option>
              {motoristasAtivos.map((motorista) => (
                <option key={motorista.id} value={motorista.id}>
                  {motorista.name}
                </option>
              ))}
            </select>
            {motoristasAtivos.length === 0 && (
              <p className="mt-1.5 text-sm text-danger">Cadastre um motorista ativo antes de vincular um documento.</p>
            )}
          </div>
        )}

        <div>
          <label htmlFor="expiryDate" className={labelClass}>
            Vencimento
          </label>
          <Input id="expiryDate" type="date" value={form.expiryDate} onChange={(e) => updateField("expiryDate", e.target.value)} />
        </div>

        <div>
          <label htmlFor="notes" className={labelClass}>
            Observações
          </label>
          <Textarea id="notes" rows={3} value={form.notes} onChange={(e) => updateField("notes", e.target.value)} />
        </div>

        {formError && <p className="text-sm text-danger">{formError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={resetAndClose}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={isSaving}>
            {isEditing ? "Salvar alterações" : "Cadastrar documento"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
