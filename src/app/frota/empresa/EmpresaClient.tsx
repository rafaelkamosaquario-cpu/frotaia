"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";
import { companyUpdateSchema } from "@/lib/validation/schemas";
import type { CompanyMemberRole, CompanyRow } from "@/lib/supabase/tables";

const selectClass = cn(
  "flex h-10 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent",
  "disabled:cursor-not-allowed disabled:opacity-50"
);

const labelClass = "mb-1.5 block text-sm font-medium text-foreground";

interface EmpresaClientProps {
  empresaInicial: CompanyRow;
  role: CompanyMemberRole;
}

interface FormState {
  name: string;
  tradeName: string;
  documentType: string;
  documentNumber: string;
  companyType: string;
  city: string;
  state: string;
}

function toFormState(empresa: CompanyRow): FormState {
  return {
    name: empresa.name ?? "",
    tradeName: empresa.trade_name ?? "",
    documentType: empresa.document_type ?? "",
    documentNumber: empresa.document_number ?? "",
    companyType: empresa.company_type,
    city: empresa.city ?? "",
    state: empresa.state ?? "",
  };
}

function toPayload(form: FormState): Record<string, unknown> {
  const payload: Record<string, unknown> = { name: form.name };
  if (form.tradeName) payload.tradeName = form.tradeName;
  if (form.documentType) payload.documentType = form.documentType;
  if (form.documentNumber) payload.documentNumber = form.documentNumber;
  if (form.companyType) payload.companyType = form.companyType;
  if (form.city) payload.city = form.city;
  if (form.state) payload.state = form.state;
  return payload;
}

export function EmpresaClient({ empresaInicial, role }: EmpresaClientProps) {
  const { showToast } = useToast();
  const [empresa, setEmpresa] = useState(empresaInicial);
  const [form, setForm] = useState<FormState>(() => toFormState(empresaInicial));
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const podeEditar = role === "owner" || role === "admin";

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!form.name.trim()) {
      setFormError("Nome é obrigatório.");
      return;
    }

    const payload = toPayload(form);
    const parsed = companyUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/frota/empresa", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        showToast({ title: "Não foi possível salvar", description: data.error ?? "Tente novamente.", variant: "error" });
        return;
      }

      setEmpresa(data.empresa);
      setForm(toFormState(data.empresa));
      showToast({ title: "Dados da empresa atualizados", variant: "success" });
    } catch {
      showToast({ title: "Não foi possível salvar", description: "Verifique sua conexão e tente novamente.", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-foreground">Empresa</h1>
        <p className="text-sm text-muted-foreground">Dados cadastrais de {empresa.name}</p>
      </div>

      <Card className="max-w-2xl p-6">
        {!podeEditar && (
          <p className="mb-4 rounded-lg bg-surface-muted px-3.5 py-2.5 text-sm text-muted-foreground">
            Só o proprietário ou administrador da empresa pode editar esses dados.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className={labelClass}>
              Nome
            </label>
            <Input id="name" value={form.name} onChange={(e) => updateField("name", e.target.value)} disabled={!podeEditar} required />
          </div>

          <div>
            <label htmlFor="tradeName" className={labelClass}>
              Nome fantasia
            </label>
            <Input
              id="tradeName"
              value={form.tradeName}
              onChange={(e) => updateField("tradeName", e.target.value)}
              disabled={!podeEditar}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="documentType" className={labelClass}>
                Tipo de documento
              </label>
              <select
                id="documentType"
                value={form.documentType}
                onChange={(e) => updateField("documentType", e.target.value)}
                className={selectClass}
                disabled={!podeEditar}
              >
                <option value="">Não informar</option>
                <option value="cpf">CPF</option>
                <option value="cnpj">CNPJ</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <div>
              <label htmlFor="documentNumber" className={labelClass}>
                Número do documento
              </label>
              <Input
                id="documentNumber"
                value={form.documentNumber}
                onChange={(e) => updateField("documentNumber", e.target.value)}
                disabled={!podeEditar}
              />
            </div>
          </div>

          <div>
            <label htmlFor="companyType" className={labelClass}>
              Tipo de operação
            </label>
            <select
              id="companyType"
              value={form.companyType}
              onChange={(e) => updateField("companyType", e.target.value)}
              className={selectClass}
              disabled={!podeEditar}
            >
              <option value="autonomo">Autônomo</option>
              <option value="transportadora">Transportadora</option>
              <option value="embarcador">Embarcador</option>
              <option value="outro">Outro</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="city" className={labelClass}>
                Cidade
              </label>
              <Input id="city" value={form.city} onChange={(e) => updateField("city", e.target.value)} disabled={!podeEditar} />
            </div>
            <div>
              <label htmlFor="state" className={labelClass}>
                UF
              </label>
              <Input
                id="state"
                value={form.state}
                onChange={(e) => updateField("state", e.target.value.toUpperCase())}
                maxLength={2}
                disabled={!podeEditar}
              />
            </div>
          </div>

          {formError && <p className="text-sm text-danger">{formError}</p>}

          {podeEditar && (
            <div className="flex justify-end pt-2">
              <Button type="submit" isLoading={isSaving}>
                Salvar
              </Button>
            </div>
          )}
        </form>
      </Card>
    </div>
  );
}
