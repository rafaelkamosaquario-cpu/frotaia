"use client";

import { useRef, useState } from "react";
import { FileText, Upload, Eye, Download, RefreshCw, Trash2 } from "lucide-react";
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

const ACCEPT_ARQUIVO = "application/pdf,image/jpeg,image/jpg,image/png";

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

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
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
  const [documentoAtual, setDocumentoAtual] = useState<VehicleDocumentRow | null>(document);
  const [isUploading, setIsUploading] = useState(false);
  const [isRemovingArquivo, setIsRemovingArquivo] = useState(false);
  const inputArquivoRef = useRef<HTMLInputElement>(null);
  const isEditing = document !== null;
  const ownerKind = OWNER_KIND_BY_TYPE[form.documentType];

  // A instância deste modal é reaproveitada entre aberturas (não desmonta) — resincroniza no
  // corpo do render (padrão "ajustar estado quando uma prop muda" do próprio React, evita o
  // round-trip extra de um useEffect) sempre que abre pra um documento diferente do último sincronizado.
  const [syncedWith, setSyncedWith] = useState<VehicleDocumentRow | null>(null);
  if (open && document !== syncedWith) {
    setSyncedWith(document);
    setForm(toFormState(document));
    setDocumentoAtual(document);
    setFormError(null);
  } else if (!open && syncedWith !== null) {
    setSyncedWith(null);
  }

  function resetAndClose() {
    setForm(toFormState(null));
    setDocumentoAtual(null);
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

      onSaved(data.documento);

      if (isEditing) {
        showToast({ title: "Documento atualizado", variant: "success" });
        resetAndClose();
      } else {
        // Fica aberto (agora "editando" o registro recém-criado) pra permitir anexar o arquivo na mesma ação, sem reabrir o modal.
        setDocumentoAtual(data.documento);
        showToast({ title: "Documento cadastrado — anexe um arquivo abaixo, se quiser.", variant: "success" });
      }
    } catch {
      showToast({ title: "Não foi possível salvar", description: "Verifique sua conexão e tente novamente.", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSelecionarArquivo(event: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    event.target.value = "";
    if (!arquivo || !documentoAtual) return;

    setIsUploading(true);
    try {
      const body = new FormData();
      body.append("file", arquivo);
      const response = await fetch(`/api/frota/documentos/${documentoAtual.id}/arquivo`, { method: "POST", body });
      const data = await response.json();

      if (!response.ok) {
        showToast({ title: "Não foi possível anexar o arquivo", description: data.error ?? "Tente novamente.", variant: "error" });
        return;
      }

      setDocumentoAtual(data.documento);
      onSaved(data.documento);
      showToast({ title: "Arquivo anexado", variant: "success" });
    } catch {
      showToast({ title: "Não foi possível anexar o arquivo", description: "Verifique sua conexão e tente novamente.", variant: "error" });
    } finally {
      setIsUploading(false);
    }
  }

  async function handleAbrirArquivo(download: boolean) {
    if (!documentoAtual) return;
    try {
      const response = await fetch(`/api/frota/documentos/${documentoAtual.id}/arquivo${download ? "?download=1" : ""}`);
      const data = await response.json();
      if (!response.ok) {
        showToast({ title: "Não foi possível abrir o arquivo", description: data.error ?? "Tente novamente.", variant: "error" });
        return;
      }
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch {
      showToast({ title: "Não foi possível abrir o arquivo", description: "Verifique sua conexão e tente novamente.", variant: "error" });
    }
  }

  async function handleRemoverArquivo() {
    if (!documentoAtual) return;
    setIsRemovingArquivo(true);
    try {
      const response = await fetch(`/api/frota/documentos/${documentoAtual.id}/arquivo`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        showToast({ title: "Não foi possível remover o arquivo", description: data.error ?? "Tente novamente.", variant: "error" });
        return;
      }
      setDocumentoAtual(data.documento);
      onSaved(data.documento);
      showToast({ title: "Arquivo removido", description: "O registro do documento continua salvo.", variant: "success" });
    } catch {
      showToast({ title: "Não foi possível remover o arquivo", description: "Verifique sua conexão e tente novamente.", variant: "error" });
    } finally {
      setIsRemovingArquivo(false);
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
            disabled={documentoAtual?.storage_path != null}
            title={documentoAtual?.storage_path != null ? "Remova o arquivo anexado antes de trocar o tipo (o caminho do arquivo depende do dono/tipo)." : undefined}
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
            {documentoAtual ? "Concluir" : "Cancelar"}
          </Button>
          {!isEditing && documentoAtual === null && (
            <Button type="submit" isLoading={isSaving}>
              Cadastrar documento
            </Button>
          )}
          {isEditing && (
            <Button type="submit" isLoading={isSaving}>
              Salvar alterações
            </Button>
          )}
        </div>
      </form>

      {documentoAtual && (
        <div className="mt-5 border-t border-border pt-4">
          <p className={labelClass}>Arquivo</p>
          <input ref={inputArquivoRef} type="file" accept={ACCEPT_ARQUIVO} onChange={handleSelecionarArquivo} className="hidden" />

          {documentoAtual.storage_path ? (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted/40 p-3">
              <FileText className="size-8 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{documentoAtual.original_filename}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(documentoAtual.file_size)}</p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => handleAbrirArquivo(false)}>
                  <Eye className="size-3.5" aria-hidden />
                  Ver
                </Button>
                <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => handleAbrirArquivo(true)}>
                  <Download className="size-3.5" aria-hidden />
                  Baixar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  isLoading={isUploading}
                  onClick={() => inputArquivoRef.current?.click()}
                >
                  <RefreshCw className="size-3.5" aria-hidden />
                  Substituir
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-danger hover:bg-danger/10"
                  isLoading={isRemovingArquivo}
                  onClick={handleRemoverArquivo}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Remover
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              isLoading={isUploading}
              onClick={() => inputArquivoRef.current?.click()}
            >
              <Upload className="size-4" aria-hidden />
              Anexar PDF, JPG ou PNG
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}
