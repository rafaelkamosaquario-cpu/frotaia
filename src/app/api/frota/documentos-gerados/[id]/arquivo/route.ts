import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { getGeneratedDocument } from "@/services/supabase/generatedDocumentService";
import { createSignedGeneratedDocumentUrl } from "@/lib/storage/generatedDocumentsStorage";

/**
 * Signed URL de download de um documento gerado (fechamento de coerência,
 * 08/2026) — mesmo padrão de segurança de /api/frota/documentos/[id]/arquivo:
 * client de sessão pra confirmar acesso + filtrar por company_id (nunca
 * confia só no id da URL), client admin só pra gerar a URL assinada (bucket
 * privado, sem policy de storage.objects).
 */

function statusForAccessReason(reason: "unauthenticated" | "no_company" | "not_entitled") {
  return reason === "unauthenticated" ? 401 : 403;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const documento = await getGeneratedDocument(supabase, id, access.company.id);
  if (!documento || !documento.storage_path) {
    return NextResponse.json({ error: "Este documento não tem arquivo disponível pra baixar (gerado antes desta funcionalidade, ou o upload falhou na hora)." }, { status: 404 });
  }

  const admin = createAdminClient();
  const url = await createSignedGeneratedDocumentUrl(admin, documento.storage_path, documento.file_name);

  return NextResponse.json({ url });
}
