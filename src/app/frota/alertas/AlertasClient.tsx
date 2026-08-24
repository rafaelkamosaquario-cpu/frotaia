"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Bell, Plus, SquarePen, Ban, Clock, Wrench, FileText, ClipboardCheck, User } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";
import { resolveAlertOrigin, isEditableAlert, type AlertOrigin } from "@/services/supabase/alertService";
import type { ScheduledAlertRow, VehicleRow, ScheduledAlertStatus } from "@/lib/supabase/tables";
import { AlertFormModal } from "./AlertFormModal";

interface AlertasClientProps {
  alertasIniciais: ScheduledAlertRow[];
  veiculos: VehicleRow[];
}

const ORIGEM_LABEL: Record<AlertOrigin, string> = { manual: "Manual", manutencao: "Manutenção", documento: "Documento", checklist: "Checklist" };
const ORIGEM_ICON: Record<AlertOrigin, typeof Wrench> = { manual: Bell, manutencao: Wrench, documento: FileText, checklist: ClipboardCheck };

const STATUS_LABEL: Record<ScheduledAlertStatus, string> = {
  pending: "Pendente",
  sent: "Enviado",
  cancelled: "Cancelado",
  failed: "Falhou",
  resolved: "Resolvido",
};
const STATUS_CLASS: Record<ScheduledAlertStatus, string> = {
  pending: "bg-accent/10 text-accent",
  sent: "bg-success/10 text-success",
  cancelled: "bg-surface-muted text-muted-foreground",
  failed: "bg-danger/10 text-danger",
  resolved: "bg-surface-muted text-muted-foreground",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

type Secao = "atrasados" | "hoje" | "proximos" | "historico";

function secaoDoAlerta(alerta: ScheduledAlertRow, agora: Date, fimDeHoje: Date): Secao {
  if (alerta.status !== "pending") return "historico";
  const data = new Date(alerta.scheduled_for);
  if (data < agora) return "atrasados";
  if (data <= fimDeHoje) return "hoje";
  return "proximos";
}

const SECAO_TITULO: Record<Secao, string> = { atrasados: "Atrasados", hoje: "Hoje", proximos: "Próximos", historico: "Histórico" };
const SECAO_ICONE: Record<Secao, typeof AlertTriangle> = { atrasados: AlertTriangle, hoje: Clock, proximos: Bell, historico: Clock };

export function AlertasClient({ alertasIniciais, veiculos }: AlertasClientProps) {
  const { showToast } = useToast();
  const [alertas, setAlertas] = useState(alertasIniciais);
  const [formTarget, setFormTarget] = useState<ScheduledAlertRow | null | undefined>(undefined);
  const [cancelTarget, setCancelTarget] = useState<ScheduledAlertRow | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const [statusFiltro, setStatusFiltro] = useState<"todos" | ScheduledAlertStatus>("todos");
  const [origemFiltro, setOrigemFiltro] = useState<"todas" | AlertOrigin>("todas");
  const [vehicleIdFiltro, setVehicleIdFiltro] = useState("");

  const veiculosPorId = useMemo(() => new Map(veiculos.map((v) => [v.id, v])), [veiculos]);

  function handleSaved(alerta: ScheduledAlertRow) {
    setAlertas((prev) => {
      const existe = prev.some((a) => a.id === alerta.id);
      return existe ? prev.map((a) => (a.id === alerta.id ? alerta : a)) : [alerta, ...prev];
    });
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    setIsCancelling(true);
    try {
      const response = await fetch(`/api/frota/alertas/${cancelTarget.id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        showToast({ title: "Não foi possível cancelar", description: data.error ?? "Tente novamente.", variant: "error" });
        return;
      }
      setAlertas((prev) => prev.map((a) => (a.id === cancelTarget.id ? { ...a, status: "cancelled" } : a)));
      showToast({ title: "Alerta cancelado", variant: "success" });
    } catch {
      showToast({ title: "Não foi possível cancelar", description: "Verifique sua conexão e tente novamente.", variant: "error" });
    } finally {
      setIsCancelling(false);
      setCancelTarget(null);
    }
  }

  const filtrados = useMemo(() => {
    return alertas.filter((a) => {
      if (statusFiltro !== "todos" && a.status !== statusFiltro) return false;
      if (origemFiltro !== "todas" && resolveAlertOrigin(a) !== origemFiltro) return false;
      if (vehicleIdFiltro && a.vehicle_id !== vehicleIdFiltro) return false;
      return true;
    });
  }, [alertas, statusFiltro, origemFiltro, vehicleIdFiltro]);

  const secoes = useMemo(() => {
    const agora = new Date();
    const fimDeHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59);
    const grupos: Record<Secao, ScheduledAlertRow[]> = { atrasados: [], hoje: [], proximos: [], historico: [] };
    for (const alerta of filtrados) grupos[secaoDoAlerta(alerta, agora, fimDeHoje)].push(alerta);
    grupos.atrasados.sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));
    grupos.hoje.sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));
    grupos.proximos.sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));
    grupos.historico.sort((a, b) => b.scheduled_for.localeCompare(a.scheduled_for));
    return grupos;
  }, [filtrados]);

  const ordemSecoes: Secao[] = ["atrasados", "hoje", "proximos", "historico"];
  const totalVisivel = filtrados.length;

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Alertas</h1>
          <p className="text-sm text-muted-foreground">{totalVisivel} alerta(s) — manuais, manutenção, documento e checklist, tudo num só lugar</p>
        </div>
        <Button onClick={() => setFormTarget(null)} className="gap-1.5">
          <Plus className="size-4" aria-hidden />
          Novo alerta
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value as typeof statusFiltro)} className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-foreground" aria-label="Status">
          <option value="todos">Todos os status</option>
          {(Object.keys(STATUS_LABEL) as ScheduledAlertStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select value={origemFiltro} onChange={(e) => setOrigemFiltro(e.target.value as typeof origemFiltro)} className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-foreground" aria-label="Origem">
          <option value="todas">Todas as origens</option>
          {(Object.keys(ORIGEM_LABEL) as AlertOrigin[]).map((o) => (
            <option key={o} value={o}>
              {ORIGEM_LABEL[o]}
            </option>
          ))}
        </select>
        <select value={vehicleIdFiltro} onChange={(e) => setVehicleIdFiltro(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-foreground" aria-label="Veículo">
          <option value="">Todos os veículos</option>
          {veiculos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name || v.plate || v.id}
            </option>
          ))}
        </select>
      </div>

      {totalVisivel === 0 ? (
        <Card className="p-2">
          <EmptyState icon={Bell} title="Nenhum alerta com esse filtro" description="Ajuste o filtro ou crie um novo alerta." />
        </Card>
      ) : (
        ordemSecoes.map((secao) => {
          const itens = secoes[secao];
          if (itens.length === 0) return null;
          const IconeSecao = SECAO_ICONE[secao];
          return (
            <div key={secao}>
              <h2 className={cn("mb-2 flex items-center gap-2 text-sm font-semibold", secao === "atrasados" ? "text-danger" : "text-foreground")}>
                <IconeSecao className="size-4" aria-hidden />
                {SECAO_TITULO[secao]}
                <span className="font-normal text-muted-foreground">({itens.length})</span>
              </h2>
              <div className="flex flex-col gap-2">
                {itens.map((alerta) => {
                  const origem = resolveAlertOrigin(alerta);
                  const IconeOrigem = ORIGEM_ICON[origem];
                  const editavel = isEditableAlert(alerta) && alerta.status === "pending";
                  const veiculo = alerta.vehicle_id ? veiculosPorId.get(alerta.vehicle_id) : null;
                  return (
                    <Card key={alerta.id} className="flex flex-col gap-2 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium text-foreground">{alerta.title}</p>
                          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", STATUS_CLASS[alerta.status])}>{STATUS_LABEL[alerta.status]}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="size-3" aria-hidden />
                            {formatDateTime(alerta.scheduled_for)}
                          </span>
                          <span className="flex items-center gap-1">
                            <IconeOrigem className="size-3" aria-hidden />
                            {ORIGEM_LABEL[origem]}
                          </span>
                          {veiculo && (
                            <span className="flex items-center gap-1">
                              <User className="size-3" aria-hidden />
                              {veiculo.name || veiculo.plate}
                            </span>
                          )}
                        </div>
                        {!editavel && alerta.status === "pending" && (
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            Controlado pela {origem === "manutencao" ? "manutenção" : "documento"} de origem —{" "}
                            <a href={origem === "manutencao" ? "/frota/manutencao" : "/frota/documentos"} className="text-accent hover:underline">
                              editar lá
                            </a>
                            .
                          </p>
                        )}
                        {alerta.status === "failed" && alerta.error_message_safe && <p className="mt-1.5 text-xs text-danger">{alerta.error_message_safe}</p>}
                      </div>
                      {editavel && (
                        <div className="flex shrink-0 gap-1.5">
                          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setFormTarget(alerta)}>
                            <SquarePen className="size-3.5" aria-hidden />
                            Editar
                          </Button>
                          <Button variant="ghost" size="sm" className="gap-1.5 text-danger" onClick={() => setCancelTarget(alerta)}>
                            <Ban className="size-3.5" aria-hidden />
                            Cancelar
                          </Button>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      <AlertFormModal open={formTarget !== undefined} onClose={() => setFormTarget(undefined)} alerta={formTarget ?? null} veiculos={veiculos} onSaved={handleSaved} />

      <Dialog
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancel}
        title="Cancelar alerta"
        description={`Tem certeza que deseja cancelar "${cancelTarget?.title ?? ""}"? Isso não apaga o histórico, só marca como cancelado.`}
        confirmLabel={isCancelling ? "Cancelando..." : "Cancelar alerta"}
        variant="danger"
      />
    </div>
  );
}
