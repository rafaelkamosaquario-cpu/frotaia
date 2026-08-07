import "server-only";
import { createCompanyWithOwner } from "@/services/supabase/companyService";
import { createVehicle, setDefaultVehicle } from "@/services/supabase/vehicleService";
import { saveMemory } from "@/services/supabase/memoryService";
import { criarAssinaturaTeste } from "@/services/supabase/subscriptionService";
import { setCompanyForUserChannels } from "@/services/supabase/channelIdentityService";
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
  collectedData: OnboardingCollectedData,
  phoneE164: string
): Promise<CompanyRow> {
  const company = await createCompanyWithOwner(admin, userId, {
    name: collectedData.name ?? "Minha operação",
    companyType: collectedData.companyType ?? "autonomo",
    city: collectedData.baseCity,
    state: collectedData.baseState,
  });

  try {
    await criarAssinaturaTeste(admin, company.id, phoneE164);
  } catch {
    // Onboarding já concluiu do ponto de vista do usuário — se a criação
    // do teste falhar, não trava a conclusão (mesmo princípio do veículo
    // abaixo). Sem assinatura nenhuma criada, o gating do webhook trata
    // isAccessAllowed(null) como acesso negado — pior caso é o cliente
    // precisar contatar o suporte, não um bug de segurança.
  }

  try {
    // Corrige o "galinha e ovo": o canal de WhatsApp é criado no primeiro
    // contato, antes de existir empresa (ver resolveOrCreateUserByPhone) —
    // sem isso, user_channels.company_id fica nulo pra sempre, quebrando
    // listChannelsForCompany (despacho de notícia diária e aviso de teste
    // grátis). Achado em produção em 07/08/2026.
    await setCompanyForUserChannels(admin, userId, company.id);
  } catch {
    // Mesmo princípio dos outros catches aqui: não trava o onboarding.
  }

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
    try {
      const veiculo = await createVehicle(admin, company.id, userId, {
        name: temMarcaModelo ? truncate(collectedData.primaryVehicleRaw!, 120) : undefined,
        notes: temMarcaModelo ? collectedData.primaryVehicleRaw : undefined,
        vehicleType: collectedData.vehicleType,
        axleCount: collectedData.axleCount ?? undefined,
      });
      // Nesta V1 é sempre o único veículo da conta — marcar como padrão
      // agora é o que faz a IA reaproveitar tipo/eixos/marca depois, sem
      // perguntar de novo (ver regra no system prompt). Sem isso, o
      // veículo existe no banco mas fica invisível pra IA.
      await setDefaultVehicle(admin, veiculo.id, company.id, userId);
    } catch {
      // Onboarding já concluiu do ponto de vista do usuário — se a
      // gravação do veículo falhar (ex.: texto livre não passa no schema
      // estrito), não trava a conclusão. O cliente pode cadastrar o
      // veículo depois via gerenciar_veiculo.
    }
  }

  return company;
}
