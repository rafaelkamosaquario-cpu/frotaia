"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";
import { vendorCreateSchema, vendorUpdateSchema } from "@/lib/validation/schemas";
import type { VendorRow, VendorCategoryEnum } from "@/lib/supabase/tables";

const selectClass = cn(
  "flex h-10 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent"
);

const labelClass = "mb-1.5 block text-sm font-medium text-foreground";

const CATEGORIA_LABEL: Record<VendorCategoryEnum, string> = {
  posto_combustivel: "Posto de combustível",
  oficina_mecanica: "Oficina mecânica",
  fornecedor_pecas: "Fornecedor de peças",
  outro: "Outro",
};

interface VendorFormModalProps {
  open: boolean;
  onClose: () => void;
  vendor: VendorRow | null;
  onSaved: (vendor: VendorRow) => void;
}

interface FormState {
  name: string;
  category: VendorCategoryEnum;
  address: string;
  phone: string;
  notes: string;
}

function toFormState(vendor: VendorRow | null): FormState {
  return {
    name: vendor?.name ?? "",
    category: vendor?.category ?? "outro",
    address: vendor?.address ?? "",
    phone: vendor?.phone ?? "",
    notes: vendor?.notes ?? "",
  };
}

function toPayload(form: FormState): Record<string, unknown> {
  const payload: Record<string, unknown> = { category: form.category };
  if (form.name) payload.name = form.name;
  if (form.address) payload.address = form.address;
  if (form.phone) payload.phone = form.phone;
  if (form.notes) payload.notes = form.notes;
  return payload;
}

export function VendorFormModal({ open, onClose, vendor, onSaved }: VendorFormModalProps) {
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(() => toFormState(vendor));
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isEditing = vendor !== null;

  const [syncedWith, setSyncedWith] = useState<VendorRow | null>(null);
  if (open && vendor !== syncedWith) {
    setSyncedWith(vendor);
    setForm(toFormState(vendor));
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

    if (!form.name) {
      setFormError("Nome é obrigatório.");
      return;
    }

    const payload = toPayload(form);
    const schema = isEditing ? vendorUpdateSchema : vendorCreateSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(isEditing ? `/api/frota/fornecedores/${vendor.id}` : "/api/frota/fornecedores", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        showToast({ title: "Não foi possível salvar", description: data.error ?? "Tente novamente.", variant: "error" });
        return;
      }

      showToast({ title: isEditing ? "Fornecedor atualizado" : "Fornecedor cadastrado", variant: "success" });
      onSaved(data.fornecedor);
      resetAndClose();
    } catch {
      showToast({ title: "Não foi possível salvar", description: "Verifique sua conexão e tente novamente.", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={resetAndClose} title={isEditing ? "Editar fornecedor" : "Novo fornecedor"} className="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className={labelClass}>
            Nome
          </label>
          <Input id="name" value={form.name} onChange={(e) => updateField("name", e.target.value)} placeholder="Ex.: Posto Ipiranga BR-163" required />
        </div>

        <div>
          <label htmlFor="category" className={labelClass}>
            Categoria
          </label>
          <select id="category" value={form.category} onChange={(e) => updateField("category", e.target.value as VendorCategoryEnum)} className={selectClass}>
            {Object.entries(CATEGORIA_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="address" className={labelClass}>
            Endereço <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <Input id="address" value={form.address} onChange={(e) => updateField("address", e.target.value)} />
        </div>

        <div>
          <label htmlFor="phone" className={labelClass}>
            Telefone <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <Input id="phone" value={form.phone} onChange={(e) => updateField("phone", e.target.value)} />
        </div>

        <div>
          <label htmlFor="notes" className={labelClass}>
            Observações <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <Input id="notes" value={form.notes} onChange={(e) => updateField("notes", e.target.value)} />
        </div>

        {formError && <p className="text-sm text-danger">{formError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={resetAndClose}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={isSaving}>
            {isEditing ? "Salvar alterações" : "Cadastrar fornecedor"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
