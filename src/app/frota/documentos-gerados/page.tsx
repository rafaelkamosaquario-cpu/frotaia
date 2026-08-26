import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listGeneratedDocuments } from "@/services/supabase/generatedDocumentService";
import { DocumentosGeradosClient } from "./DocumentosGeradosClient";

/**
 * Histórico de documentos gerados pela IA (fechamento de coerência,
 * 08/2026) — achado real da auditoria: `generated_documents`/`gerar_documento`
 * já existiam, mas o cliente não tinha nenhuma tela no Painel pra consultar
 * o que já foi gerado. O layout de src/app/frota já garante o acesso.
 */
export default async function DocumentosGeradosPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const resultado = await listGeneratedDocuments(supabase, { companyId: access.company.id, limite: 20 });

  return <DocumentosGeradosClient documentosIniciais={resultado.itens} />;
}
