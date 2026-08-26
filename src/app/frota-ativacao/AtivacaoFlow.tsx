"use client";

import { useState } from "react";
import { CheckCircle2, Truck, Users } from "lucide-react";
import { LogoMark } from "@/components/icons/Logo";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";
import { VehicleFormModal } from "@/app/frota/veiculos/VehicleFormModal";
import { DriverFormModal } from "@/app/frota/motoristas/DriverFormModal";
import type { CompanyRow, VehicleRow, DriverRow, VehicleDocumentRow, CompanyPreferencesRow } from "@/lib/supabase/tables";
import { updateCompanyNameAction, finalizarAtivacaoAction } from "./actions";

/**
 * Wizard do Onboarding 2 (Frota IA Gestão/Painel, 08/2026). Cada etapa
 * grava direto nos dados reais (companies/vehicles/drivers/
 * company_preferences) assim que preenchida — reaproveitando os MESMOS
 * services, schemas e formulários já usados pelo painel normal
 * (VehicleFormModal, DriverFormModal, PATCH /api/frota/configuracoes) —
 * não existe rascunho intermediário nem tabela de sessão própria. Isso
 * significa que os dados nunca se perdem num refresh/relogin, mesmo que a
 * posição exata no wizard reinicie no passo 1 — o passo 1 já reconhece o
 * que existir (empresa, veículo) e os passos seguintes só mostram "já
 * cadastrado" pro que já foi feito.
 *
 * Google Calendar e o entitlement do Painel de Gestão já são pré-requisito
 * pra chegar nesta página (checados em page.tsx) — este componente nunca
 * pede login Google nem verifica Calendar.
 */

const VEHICLE_LIMIT = 10;

const ITENS_CHECKLIST: { chave: string; label: string }[] = [
  { chave: "oleo", label: "Óleo" },
  { chave: "agua", label: "Água" },
  { chave: "pneus", label: "Pneus" },
  { chave: "luzes", label: "Luzes" },
];

const HORAS = Array.from({ length: 24 }, (_, h) => h);

const labelClass = "mb-1.5 block text-sm font-medium text-foreground";
const selectClass = cn(
  "flex h-10 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent"
);

interface AtivacaoFlowProps {
  company: CompanyRow;
  veiculosIniciais: VehicleRow[];
  motoristasIniciais: DriverRow[];
  documentos: VehicleDocumentRow[];
  preferenciasIniciais: CompanyPreferencesRow;
  /** Google Calendar deixou de ser pré-requisito pra chegar aqui (fechamento de coerência 08/2026) — mostrado só como status no resumo, com link pra conectar se ainda não tiver. */
  calendarConectado: boolean;
}

const TITULOS: Record<number, string> = {
  1: "Encontramos sua conta",
  2: "Veículos da frota",
  3: "Motoristas",
  4: "Checklist diário",
  5: "Tudo pronto",
};

export function AtivacaoFlow({ company, veiculosIniciais, motoristasIniciais, documentos, preferenciasIniciais, calendarConectado }: AtivacaoFlowProps) {
  const { showToast } = useToast();
  const [step, setStep] = useState(1);

  const [companyName, setCompanyName] = useState(company.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [veiculos, setVeiculos] = useState(veiculosIniciais);
  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);

  const [motoristas, setMotoristas] = useState(motoristasIniciais);
  const [driverModalOpen, setDriverModalOpen] = useState(false);

  const [checklistEnabled, setChecklistEnabled] = useState(preferenciasIniciais.checklist_enabled);
  const [checklistSendHour, setChecklistSendHour] = useState(preferenciasIniciais.checklist_send_hour);
  const [checklistItemKeys, setChecklistItemKeys] = useState<string[]>(preferenciasIniciais.checklist_item_keys);
  const [isSavingChecklist, setIsSavingChecklist] = useState(false);

  const [isFinalizing, setIsFinalizing] = useState(false);

  const veiculo1 = veiculos.find((v) => v.is_default) ?? veiculos[0] ?? null;

  async function handleSaveName() {
    setSavingName(true);
    setNameError(null);
    const formData = new FormData();
    formData.set("name", companyName);
    const result = await updateCompanyNameAction(formData);
    if (result.error) setNameError(result.error);
    setSavingName(false);
  }

  async function salvarChecklist(body: Record<string, unknown>) {
    setIsSavingChecklist(true);
    try {
      const response = await fetch("/api/frota/configuracoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        showToast({ title: "Não foi possível salvar", description: "Tente novamente.", variant: "error" });
      }
    } catch {
      showToast({ title: "Não foi possível salvar", description: "Verifique sua conexão e tente novamente.", variant: "error" });
    } finally {
      setIsSavingChecklist(false);
    }
  }

  async function handleFinalizar() {
    setIsFinalizing(true);
    await finalizarAtivacaoAction();
  }

  return (
    <div className="frota-panel flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-lg p-8">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark className="size-9" />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Ativação do Painel de Gestão · Passo {step} de 5
            </p>
            <h1 className="text-base font-semibold text-foreground">{TITULOS[step]}</h1>
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <CheckCircle2 className="mr-1 inline size-4 text-success" aria-hidden />
              Encontramos sua conta Frota IA. Vamos preparar seu Painel de Gestão com os dados que
              você já cadastrou pelo WhatsApp.
            </p>

            <div>
              <label htmlFor="companyName" className={labelClass}>
                Como você quer identificar sua empresa ou operação?
              </label>
              <div className="flex gap-2">
                <Input
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ex.: Transportadora Rocha"
                />
                <Button type="button" variant="outline" onClick={handleSaveName} isLoading={savingName}>
                  Salvar
                </Button>
              </div>
              {nameError && <p className="mt-1 text-sm text-danger">{nameError}</p>}
            </div>

            {veiculo1 ? (
              <Card className="p-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Este será o primeiro veículo da sua frota
                </p>
                <p className="text-sm font-semibold text-foreground">{veiculo1.name || veiculo1.plate || "Veículo"}</p>
                <p className="text-sm text-muted-foreground">
                  {[veiculo1.plate, veiculo1.vehicle_type, veiculo1.axle_count ? `${veiculo1.axle_count} eixos` : null, veiculo1.body_type]
                    .filter(Boolean)
                    .join(" · ") || "Sem detalhes adicionais ainda"}
                </p>
              </Card>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhum veículo encontrado ainda — você poderá cadastrar na próxima etapa.
              </p>
            )}

            <Button size="lg" className="w-full" onClick={() => setStep(2)}>
              Continuar
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Seu plano permite gerenciar até {VEHICLE_LIMIT} veículos. Você já tem {veiculos.length}{" "}
              cadastrado{veiculos.length === 1 ? "" : "s"}. Adicionar mais veículos agora é opcional
              — você pode terminar só com o primeiro.
            </p>

            {veiculos.length > 0 && (
              <ul className="space-y-2">
                {veiculos.map((v, i) => (
                  <li key={v.id} className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
                    <Truck className="size-4 text-muted-foreground" aria-hidden />
                    <span className="font-medium text-foreground">Veículo {i + 1}</span>
                    <span className="text-muted-foreground">{v.name || v.plate || "sem nome"}</span>
                  </li>
                ))}
              </ul>
            )}

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setVehicleModalOpen(true)}
              disabled={veiculos.length >= VEHICLE_LIMIT}
            >
              {veiculos.length >= VEHICLE_LIMIT ? "Seu plano atual permite até 10 veículos" : "Adicionar veículo"}
            </Button>

            <Button size="lg" className="w-full" onClick={() => setStep(3)}>
              {veiculos.length > 1 ? "Continuar" : "Fazer depois"}
            </Button>

            <VehicleFormModal
              open={vehicleModalOpen}
              onClose={() => setVehicleModalOpen(false)}
              vehicle={null}
              documentos={documentos}
              onSaved={(v) => {
                setVeiculos((prev) => [...prev, v]);
                setVehicleModalOpen(false);
              }}
            />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Quer cadastrar seus motoristas agora? Isso não é obrigatório para concluir.
            </p>

            {motoristas.length > 0 && (
              <ul className="space-y-2">
                {motoristas.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
                    <Users className="size-4 text-muted-foreground" aria-hidden />
                    <span className="font-medium text-foreground">{m.name}</span>
                  </li>
                ))}
              </ul>
            )}

            <Button type="button" variant="outline" className="w-full" onClick={() => setDriverModalOpen(true)}>
              Cadastrar motorista
            </Button>

            <Button size="lg" className="w-full" onClick={() => setStep(4)}>
              {motoristas.length > 0 ? "Continuar" : "Fazer depois"}
            </Button>

            <DriverFormModal
              open={driverModalOpen}
              onClose={() => setDriverModalOpen(false)}
              driver={null}
              veiculosAtivos={veiculos.filter((v) => v.active)}
              onSaved={(d) => {
                setMotoristas((prev) => [...prev, d]);
                setDriverModalOpen(false);
              }}
            />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Quer ativar o checklist diário dos motoristas? Envio automático, todo dia, no horário
              escolhido — pode configurar depois em Configurações se preferir.
            </p>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-sm font-medium text-foreground">Checklist diário</span>
              <button
                type="button"
                role="switch"
                aria-checked={checklistEnabled}
                disabled={isSavingChecklist}
                onClick={async () => {
                  const novo = !checklistEnabled;
                  setChecklistEnabled(novo);
                  await salvarChecklist({ checklistEnabled: novo });
                }}
                className={cn(
                  "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
                  checklistEnabled ? "bg-primary" : "bg-surface-muted"
                )}
              >
                <span
                  className={cn(
                    "block size-5 translate-y-0.5 rounded-full bg-white transition-transform",
                    checklistEnabled ? "translate-x-5" : "translate-x-1"
                  )}
                />
              </button>
            </div>

            {checklistEnabled && (
              <>
                <div>
                  <label htmlFor="checklistHour" className={labelClass}>
                    Horário de envio (Brasília)
                  </label>
                  <select
                    id="checklistHour"
                    value={checklistSendHour}
                    disabled={isSavingChecklist}
                    onChange={async (e) => {
                      const novaHora = Number(e.target.value);
                      setChecklistSendHour(novaHora);
                      await salvarChecklist({ checklistSendHour: novaHora });
                    }}
                    className={selectClass}
                  >
                    {HORAS.map((h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap gap-2">
                  {ITENS_CHECKLIST.map((item) => {
                    const ativo = checklistItemKeys.includes(item.chave);
                    return (
                      <button
                        key={item.chave}
                        type="button"
                        disabled={isSavingChecklist}
                        onClick={async () => {
                          const novos = ativo
                            ? checklistItemKeys.filter((i) => i !== item.chave)
                            : [...checklistItemKeys, item.chave];
                          if (novos.length === 0) {
                            showToast({ title: "Deixe pelo menos 1 item ativo", variant: "error" });
                            return;
                          }
                          setChecklistItemKeys(novos);
                          await salvarChecklist({ checklistItemKeys: novos });
                        }}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                          ativo ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                        )}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <Button size="lg" className="w-full" onClick={() => setStep(5)}>
              Continuar
            </Button>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <CheckCircle2 className="mr-1 inline size-4 text-success" aria-hidden />
              Seu Painel Frota IA está pronto. Seu WhatsApp e seu painel trabalham juntos sobre a
              mesma operação. Você pode adicionar ou editar veículos, motoristas, checklists e
              outras configurações quando quiser.
            </p>

            <Card className="space-y-1.5 p-4 text-sm">
              <p>
                <span className="text-muted-foreground">Empresa: </span>
                <span className="font-medium text-foreground">{companyName}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Veículos cadastrados: </span>
                <span className="font-medium text-foreground">{veiculos.length}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Motoristas cadastrados: </span>
                <span className="font-medium text-foreground">{motoristas.length}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Checklist: </span>
                <span className="font-medium text-foreground">{checklistEnabled ? "Ativo" : "Inativo"}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Agenda Google: </span>
                {calendarConectado ? (
                  <span className="font-medium text-foreground">Conectada ✅</span>
                ) : (
                  <span className="font-medium text-foreground">
                    Não conectada —{" "}
                    <a href="/auth/calendar/connect" className="text-primary underline">
                      conectar agora
                    </a>{" "}
                    (opcional, só precisa quando for usar a Agenda)
                  </span>
                )}
              </p>
            </Card>

            <Button size="lg" className="w-full" onClick={handleFinalizar} isLoading={isFinalizing}>
              Ir para o Dashboard
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
