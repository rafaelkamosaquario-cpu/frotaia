"use client";

import { Fragment, useMemo, useState } from "react";
import { ClipboardList, CheckCircle2, Send, Clock, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ChecklistDispatchRow, DriverRow, VehicleRow } from "@/lib/supabase/tables";
import { dispatchesFromToday } from "@/services/supabase/checklistDispatchService";
import {
  computeChecklistAdherence,
  computeChecklistDailySummary,
  CHECKLIST_ADERENCIA_BAIXA_LIMIAR,
} from "@/lib/frota/checklistAdherence";

interface ChecklistsClientProps {
  dispatches: ChecklistDispatchRow[];
  motoristas: DriverRow[];
  veiculos: VehicleRow[];
}

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  ok: "OK",
  atencao: "Atenção",
};

const STATUS_CLASS: Record<string, string> = {
  pendente: "bg-surface-muted text-muted-foreground",
  ok: "bg-success/10 text-success",
  atencao: "bg-danger/10 text-danger",
};

type Periodo = "hoje" | "7d" | "30d";

const PERIODOS: { id: Periodo; label: string; dias: number | null }[] = [
  { id: "hoje", label: "Hoje", dias: 0 },
  { id: "7d", label: "7 dias", dias: 7 },
  { id: "30d", label: "30 dias", dias: 30 },
];

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Fora do componente (mesmo padrão de dispatchesFromToday) — evita a regra de pureza do React reclamar de Date.now() direto dentro de useMemo. */
function dispatchesDesde(dispatches: ChecklistDispatchRow[], dias: number): ChecklistDispatchRow[] {
  const limite = Date.now() - dias * 24 * 60 * 60 * 1000;
  return dispatches.filter((d) => new Date(d.sent_at).getTime() >= limite);
}

interface KpiCardProps {
  label: string;
  value: number;
  icon: typeof Send;
  color: "primary" | "success" | "warning" | "danger";
}

function KpiCard({ label, value, icon: Icon, color }: KpiCardProps) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div
        className={
          "flex size-11 items-center justify-center rounded-xl " +
          {
            primary: "bg-primary/10 text-primary",
            success: "bg-success/10 text-success",
            warning: "bg-warning/10 text-warning",
            danger: "bg-danger/10 text-danger",
          }[color]
        }
      >
        <Icon className="size-5" aria-hidden />
      </div>
      <div>
        <p className="text-2xl font-semibold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </Card>
  );
}

export function ChecklistsClient({ dispatches, motoristas, veiculos }: ChecklistsClientProps) {
  const [periodo, setPeriodo] = useState<Periodo>("7d");
  const [motoristaAberto, setMotoristaAberto] = useState<string | null>(null);

  const veiculosPorId = useMemo(() => new Map(veiculos.map((v) => [v.id, v])), [veiculos]);

  const dispatchesHoje = useMemo(() => dispatchesFromToday(dispatches), [dispatches]);
  const resumoHoje = useMemo(() => computeChecklistDailySummary(dispatchesHoje), [dispatchesHoje]);

  const dispatchesDoPeriodo = useMemo(() => {
    const dias = PERIODOS.find((p) => p.id === periodo)?.dias ?? 7;
    if (dias === 0) return dispatchesHoje;
    return dispatchesDesde(dispatches, dias);
  }, [dispatches, dispatchesHoje, periodo]);

  const aderencia = useMemo(
    () => computeChecklistAdherence(dispatchesDoPeriodo, motoristas).sort((a, b) => a.aderenciaPercent - b.aderenciaPercent),
    [dispatchesDoPeriodo, motoristas]
  );

  const historicoMotoristaAberto = useMemo(() => {
    if (!motoristaAberto) return [];
    return dispatchesDoPeriodo
      .filter((d) => d.driver_id === motoristaAberto)
      .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());
  }, [dispatchesDoPeriodo, motoristaAberto]);

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-foreground">Checklists</h1>
        <p className="text-sm text-muted-foreground">Aderência ao checklist diário e histórico por motorista</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Enviados hoje" value={resumoHoje.enviados} icon={Send} color="primary" />
        <KpiCard label="Respondidos hoje" value={resumoHoje.respondidos} icon={CheckCircle2} color="success" />
        <KpiCard label="Não respondidos" value={resumoHoje.naoRespondidos} icon={Clock} color="warning" />
        <KpiCard label="Com atenção" value={resumoHoje.atencao} icon={AlertTriangle} color="danger" />
      </div>

      <div className="mt-6 mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Aderência por motorista</h2>
        <div className="flex gap-1 rounded-full border border-border p-0.5">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriodo(p.id)}
              className={
                "rounded-full px-3 py-1 text-xs font-medium transition-colors " +
                (periodo === p.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {aderencia.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={ClipboardList}
            title="Nenhum checklist enviado nesse período"
            description="O envio automático depende de ativar a config em Configurações → Checklist diário."
          />
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Motorista</th>
                <th className="px-4 py-3 font-medium text-right">Enviados</th>
                <th className="px-4 py-3 font-medium text-right">Respondidos</th>
                <th className="px-4 py-3 font-medium text-right">Não respondidos</th>
                <th className="px-4 py-3 font-medium text-right">Atenção</th>
                <th className="px-4 py-3 font-medium text-right">Aderência</th>
              </tr>
            </thead>
            <tbody>
              {aderencia.map((item) => (
                <Fragment key={item.driverId}>
                  <tr
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-muted/50"
                    onClick={() => setMotoristaAberto((atual) => (atual === item.driverId ? null : item.driverId))}
                  >
                    <td className="px-4 py-3 font-medium text-foreground">{item.driverName}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{item.enviados}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{item.respondidos}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{item.naoRespondidos}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{item.atencao}</td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-xs font-medium " +
                          (item.aderenciaPercent < CHECKLIST_ADERENCIA_BAIXA_LIMIAR
                            ? "bg-danger/10 text-danger"
                            : "bg-success/10 text-success")
                        }
                      >
                        {item.aderenciaPercent}%
                      </span>
                    </td>
                  </tr>
                  {motoristaAberto === item.driverId && (
                    <tr className="border-b border-border bg-surface-muted/30 last:border-0">
                      <td colSpan={6} className="px-4 py-3">
                        <ul className="flex flex-col gap-1.5">
                          {historicoMotoristaAberto.map((d) => (
                            <li key={d.id} className="flex items-center gap-2.5 text-sm">
                              <span className={"shrink-0 rounded-full px-2 py-0.5 text-xs font-medium " + STATUS_CLASS[d.response_status]}>
                                {STATUS_LABEL[d.response_status]}
                              </span>
                              <span className="text-muted-foreground">{formatDateTime(d.sent_at)}</span>
                              <span className="text-muted-foreground">
                                {d.vehicle_id ? veiculosPorId.get(d.vehicle_id)?.name || veiculosPorId.get(d.vehicle_id)?.plate : "—"}
                              </span>
                              {d.response_text && <span className="truncate text-foreground">&ldquo;{d.response_text}&rdquo;</span>}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
