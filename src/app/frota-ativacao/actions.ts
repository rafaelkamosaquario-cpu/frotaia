"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { updateCompany } from "@/services/supabase/companyService";

export interface AtivacaoActionState {
  error?: string;
}

/**
 * Etapa "empresa" do onboarding de ativação do painel (Onboarding 2,
 * 08/2026) — reaproveita `updateCompany` (mesmo service usado por
 * /frota/empresa), nunca cria empresa nova. Client admin pelo mesmo motivo
 * já documentado em src/app/onboarding/actions.ts: insert/update de
 * `companies` pela sessão do navegador foi rejeitado por RLS mesmo com
 * usuário autenticado confirmado — causa raiz não identificada com
 * certeza (propagação de auth.uid() via PostgREST); `getUser()` abaixo
 * continua sendo o controle de acesso real.
 */
export async function updateCompanyNameAction(formData: FormData): Promise<AtivacaoActionState> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const context = await loadFleetPanelAccess(supabase);
  if (!context.ok || !["owner", "admin"].includes(context.role)) return { error: "Somente proprietário ou administrador com acesso ao painel pode configurar a empresa." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: "Informe um nome para a empresa/operação." };
  }

  try {
    const admin = createAdminClient();
    await updateCompany(admin, context.company.id, data.user.id, { name });
  } catch {
    return { error: "Não foi possível salvar o nome agora. Tente novamente." };
  }

  return {};
}

/**
 * Marca o onboarding de ativação como concluído — única escrita própria
 * desta etapa (`companies.fleet_onboarding_completed_at`). Veículos e
 * motoristas cadastrados durante o wizard já foram salvos diretamente
 * pelos formulários reaproveitados do painel (VehicleFormModal/
 * DriverFormModal, via /api/frota/veiculos e /api/frota/motoristas) — não
 * há rascunho intermediário a "confirmar" aqui.
 */
export async function finalizarAtivacaoAction(): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const context = await loadFleetPanelAccess(supabase);
  if (!context.ok || !["owner", "admin"].includes(context.role)) redirect("/empresas");

  const admin = createAdminClient();
  const { error } = await admin
    .from("companies")
    .update({ fleet_onboarding_completed_at: new Date().toISOString(), updated_by: data.user.id })
    .eq("id", context.company.id);

  if (error) throw error;

  redirect("/frota/dashboard");
}
