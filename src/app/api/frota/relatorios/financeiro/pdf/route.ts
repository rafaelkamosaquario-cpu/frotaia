import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { resolvePeriodo } from "@/lib/frota/relatoriosAggregation";
import { modulePathAllowed } from "@/lib/frota/companyModules";
import { loadFinancialReport } from "@/services/supabase/financialReportService";
import { generateFinancialReport } from "@/services/documents/financialReport";

export async function GET(request: Request) {
  const client=await createClient();
  const access=await loadFleetPanelAccess(client);
  if(!access.ok)return Response.json({error:"Sem acesso ao painel."},{status:access.reason==="unauthenticated"?401:403});
  if(!["owner","admin","operator"].includes(access.role) || (!access.moduleBypass && !modulePathAllowed(access.moduleConfig?.enabled??null,"/frota/relatorios")))return Response.json({error:"Sem permissão para o relatório financeiro."},{status:403});
  const params=new URL(request.url).searchParams;
  if(params.get("driverId"))return Response.json({error:"Selecione Todos os motoristas. Despesas não possuem vínculo individual completo com motoristas."},{status:400});
  const parsed=z.object({from:z.iso.date(),to:z.iso.date(),vehicleId:z.uuid().optional()}).safeParse({
    ...resolvePeriodo({period:params.get("period")??undefined,from:params.get("from")??undefined,to:params.get("to")??undefined}),
    vehicleId:params.get("vehicleId")||undefined,
  });
  if(!parsed.success || parsed.data.from>parsed.data.to || (params.get("period")==="custom" && (!params.get("from")||!params.get("to"))))return Response.json({error:"Informe um período válido, com início e fim."},{status:400});
  try {
    const report=await loadFinancialReport(client,createAdminClient(),access.company,parsed.data);
    const bytes=await generateFinancialReport(report);
    return new Response(Buffer.from(bytes),{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="relatorio-financeiro-${report.from}-${report.to}.pdf"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  } catch {
    return Response.json({error:"Não foi possível emitir o relatório financeiro completo. Nenhum relatório parcial foi gerado. Confira os filtros e tente novamente."},{status:500});
  }
}
