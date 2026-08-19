import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { listDriversForPanel } from "@/services/supabase/driverService";
import { listMaintenanceSchedulesForPanel } from "@/services/supabase/maintenanceScheduleService";
import { listVehicleDocumentsForPanel } from "@/services/supabase/vehicleDocumentService";
import { listExpenses } from "@/services/supabase/expenseService";
import { listSavedJourneysForPanel } from "@/services/supabase/savedJourneyService";
import { listChecklistDispatchesForPanel } from "@/services/supabase/checklistDispatchService";
import { listAnalysisRuns } from "@/services/supabase/analysisHistoryService";
import { computeRelatoriosBlocos } from "@/lib/frota/relatoriosAggregation";
import { gerarPdfRelatorio, type LinhaChaveValor } from "@/services/documents/pdfGenerator";

function statusForAccessReason(reason: "unauthenticated" | "no_company" | "not_entitled") {
  return reason === "unauthenticated" ? 401 : 403;
}

/** Mesma agregação da tela Relatórios (computeRelatoriosBlocos), só que entregue como PDF pra download direto no navegador — não passa pela IA/gerar_documento, que hoje só entrega por WhatsApp. */
export async function GET() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const trintaDiasAtras = new Date();
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
  const dataInicio = trintaDiasAtras.toISOString().slice(0, 10);

  const [veiculos, motoristas, manutencoes, documentos, despesas, jornadas, checklistDispatches, analisesFrete] = await Promise.all([
    listVehiclesForPanel(supabase, access.company.id),
    listDriversForPanel(supabase, access.company.id),
    listMaintenanceSchedulesForPanel(supabase, access.company.id),
    listVehicleDocumentsForPanel(supabase, access.company.id),
    listExpenses(supabase, { companyId: access.company.id, dateFrom: dataInicio, limit: 500 }),
    listSavedJourneysForPanel(supabase, access.company.id),
    listChecklistDispatchesForPanel(supabase, access.company.id),
    listAnalysisRuns(supabase, { companyId: access.company.id, analysisTypes: ["analisar_frete"], dateFrom: dataInicio, limit: 500 }),
  ]);

  const blocos = computeRelatoriosBlocos({ veiculos, motoristas, manutencoes, documentos, despesas, jornadas, checklistDispatches, analisesFrete });

  const linhas: LinhaChaveValor[] = blocos.flatMap((bloco) =>
    bloco.linhas.map((linha) => ({
      chave: `${bloco.titulo} — ${linha.label}`,
      valor: bloco.formatarValor ? bloco.formatarValor(linha.valor) : String(linha.valor),
    }))
  );

  const pdfBytes = await gerarPdfRelatorio({
    titulo: "Relatório Frota IA",
    geradoEm: new Date(),
    nomeEmpresa: access.company.name,
    periodo: `Últimos 30 dias até ${new Date().toLocaleDateString("pt-BR")}`,
    linhas,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="relatorio-frota-ia-${new Date().toISOString().slice(0, 10)}.pdf"`,
    },
  });
}
