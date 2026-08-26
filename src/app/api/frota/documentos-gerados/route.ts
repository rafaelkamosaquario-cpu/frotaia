import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listGeneratedDocuments } from "@/services/supabase/generatedDocumentService";

/**
 * Histórico de documentos gerados pela IA (fechamento de coerência,
 * 08/2026) — leitura via client de sessão (RLS já isola por company_id,
 * generated_documents só tem policy de SELECT pra membro da empresa).
 * Metadados sempre existem; `storage_path` pode ser nulo (documento
 * gerado antes desta rodada, ou upload que falhou) — a tela mostra o
 * histórico de qualquer forma, só sem opção de baixar nesses casos.
 */

function statusForAccessReason(reason: "unauthenticated" | "no_company" | "not_entitled") {
  return reason === "unauthenticated" ? 401 : 403;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const url = new URL(request.url);
  const busca = url.searchParams.get("busca") ?? undefined;

  const resultado = await listGeneratedDocuments(supabase, { companyId: access.company.id, buscaTexto: busca, limite: 20 });
  return NextResponse.json({ documentos: resultado.itens, total: resultado.total });
}
