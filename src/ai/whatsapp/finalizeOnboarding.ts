import "server-only";
import { createCompanyWithOwner } from "@/services/supabase/companyService";
import { createVehicle } from "@/services/supabase/vehicleService";
import { saveMemory } from "@/services/supabase/memoryService";
import type { SupabaseDbClient } from "@/services/supabase/types";
import type { OnboardingCollectedData } from "./onboardingConversation";
import type { CompanyRow } from "@/lib/supabase/tables";
import { truncate } from "@/lib/utils";

/**
 * Transforma o rascunho do onboarding conversacional em dados reais —
 * reaproveita os mesmos services já usados pelo onboarding web (Fase 2),
 * nenhuma lógica de criação de empresa/veículo foi duplicada.
 *
 * Camada 7: `vehicleType`/`axleCount` (resolvidos por
 * vehicleConfigClassifier.ts, sempre presentes quando finalize=true — é
 * pergunta obrigatória) vão direto pras colunas reais de `vehicles`, em
 * vez de ficarem só como texto solto. `primaryVehicleRaw` (marca/modelo,
 * opcional) continua indo pra `name`/`notes` em texto livre — sem parsing
 * arriscado em campos separados.
 */
export async function finalizeOnboarding(
  admin: SupabaseDbClient,
  userId: string,
  collectedData: OnboardingCollectedData
): Promise<CompanyRow> {
  const company = await createCompanyWithOwner(admin, userId, {
    name: collectedData.name ?? "Minha operação",
    companyType: collectedData.companyType ?? "autonomo",
    city: collectedData.baseCity,
    state: collectedData.baseState,
  });

  if (collectedData.region) {
    await saveMemory(admin, company.id, userId, {
      memoryType: "operational",
      key: "operating_region",
      valueJson: { region: collectedData.region },
      summary: `Região de atuação informada no onboarding: ${collectedData.region}.`,
      sourceType: "user_explicit",
      confirmedByUser: true,
    });
  }

  if (collectedData.hasFixedRoute !== undefined) {
    await saveMemory(admin, company.id, userId, {
      memoryType: "operational",
      key: "has_fixed_route",
      valueJson: { hasFixedRoute: collectedData.hasFixedRoute },
      summary: `Rota fixa informada no onboarding: ${collectedData.hasFixedRoute ? "sim" : "não"}.`,
      sourceType: "user_explicit",
      confirmedByUser: true,
    });
  }

  if (collectedData.vehicleType) {
    const temMarcaModelo = collectedData.primaryVehicleRaw && !collectedData.primaryVehicleSkipped;
    await createVehicle(admin, company.id, userId, {
      name: temMarcaModelo ? truncate(collectedData.primaryVehicleRaw!, 120) : undefined,
      notes: temMarcaModelo ? collectedData.primaryVehicleRaw : undefined,
      vehicleType: collectedData.vehicleType,
      axleCount: collectedData.axleCount ?? undefined,
    }).catch(() => {
      // Onboarding já concluiu do ponto de vista do usuário — se a
      // gravação do veículo falhar (ex.: texto livre não passa no schema
      // estrito), não trava a conclusão. O cliente pode cadastrar o
      // veículo depois via gerenciar_veiculo.
    });
  }

  return company;
}
