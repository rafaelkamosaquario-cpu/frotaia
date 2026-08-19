import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { getOrCreatePreferences } from "@/services/supabase/companyPreferencesService";
import { ConfiguracoesClient } from "./ConfiguracoesClient";

/**
 * O layout de src/app/frota já garante o acesso. Fase 14 do plano de
 * unificação V1+V2: sai de placeholder, mas só com o que já tem
 * funcionalidade real por trás — estilo de resposta da IA (Notícias já
 * ganhou tela própria na Fase 11, não duplicada aqui) + checklist diário
 * (Checklist V2, B.8: ativar/desativar, horário, itens). Preferências de
 * alerta/usuários/assinatura ainda não têm mecanismo real configurável.
 */
export default async function ConfiguracoesPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const preferencias = await getOrCreatePreferences(supabase, access.company.id);

  return <ConfiguracoesClient preferenciasIniciais={preferencias} podeEditar={access.role === "owner" || access.role === "admin"} />;
}
