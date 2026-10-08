import type { AssistantNotice } from "@/components/frota/AssistantNotices";
import { monthlyMonitoringBrief, type MonthlySnapshot } from "./monthlyMonitoring";
import type { FleetAlertItem } from "@/services/supabase/fleetAlertsService";

export function buildAssistantNotices(month: MonthlySnapshot | null, alerts: FleetAlertItem[]): AssistantNotice[] {
  const monthly = month ? monthlyMonitoringBrief(month).map(text => ({
    id: JSON.stringify(["month", month.month, text]), text,
    href: "/frota/dashboard#metas-producao",
    question: `Explique este aviso do fechamento de ${month.month}: ${text} Consulte os registros da empresa e informe se faltarem dados.`,
  })) : [];
  const operational = alerts.map(alert => ({
    id: JSON.stringify([alert.id, alert.data, alert.descricao]), text: alert.descricao, href: alert.href,
    question: `Explique esta pendência da minha empresa: ${alert.descricao}. Consulte os registros atuais antes de responder.`,
  }));
  return [...monthly, ...operational];
}
