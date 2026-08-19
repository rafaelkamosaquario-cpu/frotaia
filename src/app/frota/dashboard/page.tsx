import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { listDriversForPanel } from "@/services/supabase/driverService";
import { listMaintenanceSchedulesForPanel } from "@/services/supabase/maintenanceScheduleService";
import { listVehicleDocumentsForPanel } from "@/services/supabase/vehicleDocumentService";
import { listExpenses } from "@/services/supabase/expenseService";
import { listChecklistDispatchesForPanel, dispatchesFromToday } from "@/services/supabase/checklistDispatchService";
import { computeFleetAlerts } from "@/services/supabase/fleetAlertsService";
import { getOrCreatePreferences, saveDashboardInsight } from "@/services/supabase/companyPreferencesService";
import { gerarInsightDashboard } from "@/services/dashboard/dashboardInsightService";
import { DashboardClient } from "./DashboardClient";

/** Insight regenerado no máximo 1x a cada 20h por empresa — mesmo espírito do daily_news_last_sent_at, evita custo de IA a cada carregamento de página. */
const INSIGHT_CACHE_HORAS = 20;

function diasAte(iso: string): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(`${iso}T00:00:00`);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
}

function precisaGerarInsight(geradoEm: string | null): boolean {
  if (!geradoEm) return true;
  const horasDesdeGeracao = (Date.now() - new Date(geradoEm).getTime()) / 3_600_000;
  return horasDesdeGeracao >= INSIGHT_CACHE_HORAS;
}

function montarResumoParaInsight(input: {
  veiculosAtivos: number;
  motoristasAtivos: number;
  manutencoesPendentes: number;
  documentosVencidos: number;
  documentosVencendo: number;
  custo30Dias: number | null;
  alertas: string[];
  checklistsHoje: { total: number; respondidos: number };
}): string {
  const linhas = [
    `Veículos ativos: ${input.veiculosAtivos}`,
    `Motoristas ativos: ${input.motoristasAtivos}`,
    `Manutenções pendentes: ${input.manutencoesPendentes}`,
    `Documentos vencidos: ${input.documentosVencidos}`,
    `Documentos vencendo em 30 dias: ${input.documentosVencendo}`,
    `Custo em despesas nos últimos 30 dias: ${input.custo30Dias === null ? "sem registro" : input.custo30Dias.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
    `Alertas urgentes: ${input.alertas.length === 0 ? "nenhum" : input.alertas.join("; ")}`,
    `Checklists hoje: ${input.checklistsHoje.total === 0 ? "nenhum enviado hoje" : `${input.checklistsHoje.respondidos}/${input.checklistsHoje.total} respondidos`}`,
  ];
  return linhas.join("\n");
}

/** O layout de src/app/frota já garante o acesso. Só leitura — os KPIs agregam dados que as telas de Veículos/Motoristas/Manutenção/Documentos/Despesas já buscam. */
export default async function DashboardPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const trintaDiasAtras = new Date();
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

  const [veiculos, motoristas, manutencoes, documentos, despesasRecentes, checklistDispatches, preferences] = await Promise.all([
    listVehiclesForPanel(supabase, access.company.id),
    listDriversForPanel(supabase, access.company.id),
    listMaintenanceSchedulesForPanel(supabase, access.company.id),
    listVehicleDocumentsForPanel(supabase, access.company.id),
    listExpenses(supabase, { companyId: access.company.id, dateFrom: trintaDiasAtras.toISOString().slice(0, 10), limit: 500 }),
    listChecklistDispatchesForPanel(supabase, access.company.id),
    getOrCreatePreferences(supabase, access.company.id),
  ]);

  let insight = preferences.dashboard_insight_text;

  if (precisaGerarInsight(preferences.dashboard_insight_generated_at)) {
    const hojeIso = new Date().toISOString().slice(0, 10);
    const alertas = computeFleetAlerts({ veiculos, manutencoes, documentos }).slice(0, 5);
    const checklistsHoje = dispatchesFromToday(checklistDispatches);
    const custo30Dias = despesasRecentes.length > 0 ? despesasRecentes.reduce((soma, d) => soma + d.amount, 0) : null;

    const resumo = montarResumoParaInsight({
      veiculosAtivos: veiculos.filter((v) => v.active).length,
      motoristasAtivos: motoristas.filter((m) => m.active).length,
      manutencoesPendentes: manutencoes.filter((m) => m.status !== "concluido").length,
      documentosVencidos: documentos.filter((d) => d.expiry_date && d.expiry_date < hojeIso).length,
      documentosVencendo: documentos.filter((d) => d.expiry_date && d.expiry_date >= hojeIso && diasAte(d.expiry_date) <= 30).length,
      custo30Dias,
      alertas: alertas.map((a) => a.descricao),
      checklistsHoje: { total: checklistsHoje.length, respondidos: checklistsHoje.filter((c) => c.response_status !== "pendente").length },
    });

    try {
      const gerado = await gerarInsightDashboard(resumo);
      if (gerado) {
        await saveDashboardInsight(supabase, access.company.id, gerado);
        insight = gerado;
      }
    } catch {
      // Sem ANTHROPIC_API_KEY configurada ou falha da API — Dashboard segue funcionando sem o bloco de insight (ou com o último cacheado, se houver).
    }
  }

  return (
    <DashboardClient
      veiculos={veiculos}
      motoristas={motoristas}
      manutencoes={manutencoes}
      documentos={documentos}
      despesasRecentes={despesasRecentes}
      checklistDispatches={checklistDispatches}
      insight={insight}
    />
  );
}
