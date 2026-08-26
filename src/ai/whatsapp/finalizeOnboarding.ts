import "server-only";
import { createCompanyWithOwner } from "@/services/supabase/companyService";
import { updateProfile } from "@/services/supabase/profileService";
import { createVehicle, setDefaultVehicle } from "@/services/supabase/vehicleService";
import { createRoute } from "@/services/supabase/savedRouteService";
import { saveMemory } from "@/services/supabase/memoryService";
import { setOperatingRegion } from "@/services/supabase/companyPreferencesService";
import { criarAssinaturaTeste } from "@/services/supabase/subscriptionService";
import { setCompanyForUserChannels } from "@/services/supabase/channelIdentityService";
import type { SupabaseDbClient } from "@/services/supabase/types";
import type { OnboardingCollectedData } from "./onboardingConversation";
import type { CompanyRow } from "@/lib/supabase/tables";
import { truncate } from "@/lib/utils";
import { parseVehicleDescription } from "./vehicleDescriptionParser";

/**
 * Transforma o rascunho do onboarding conversacional em dados reais —
 * reaproveita os mesmos services já usados pelo onboarding web (Fase 2),
 * nenhuma lógica de criação de empresa/veículo foi duplicada.
 *
 * Camada 7: `vehicleType`/`axleCount` (resolvidos por
 * vehicleConfigClassifier.ts, sempre presentes quando finalize=true — é
 * pergunta obrigatória) vão direto pras colunas reais de `vehicles`, em
 * vez de ficarem só como texto solto. `primaryVehicleRaw` (marca/modelo,
 * agora obrigatório na V1 "1 usuário + 1 veículo") sempre continua indo
 * pra `name`/`notes` em texto livre (nunca perdido) — e, quando
 * `parseVehicleDescription` reconhece uma marca de fabricante conhecida
 * com confiança (fechamento de coerência 08/2026), TAMBÉM preenche
 * `brand`/`model`/`model_year` (colunas que já existiam desde a criação da
 * tabela, mas que o onboarding nunca usava) — sem nunca inventar quando o
 * texto não é reconhecível.
 *
 * V1 "1 usuário + 1 veículo" (08/2026): placa, carroceria e consumo médio
 * (novas etapas do onboarding) vão direto pras colunas já existentes de
 * `vehicles` (plate/body_type/average_consumption_km_l — nenhuma coluna
 * nova precisou ser criada). Quando o cliente informa uma rota principal,
 * o texto completo sempre vira uma memória (nunca perdido, mesmo com mais
 * de uma rota mencionada) e, se o parser conseguiu separar origem/destino,
 * também vira uma `saved_routes` estruturada vinculada ao veículo.
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

  // Fechamento de coerência (08/2026): "Como posso chamar você?" grava em
  // companies.name (nome operacional/empresa), mas profiles.full_name
  // (nome pessoal, já existente no schema — só nunca preenchido pra conta
  // criada via WhatsApp) ficava sempre vazio. Mesma resposta serve pros
  // dois papéis sem precisar de uma segunda pergunta — funciona tanto pro
  // autônomo (nome da pessoa = identidade da operação) quanto pra
  // transportadora (nome de quem está respondendo, distinto da empresa).
  if (collectedData.name) {
    try {
      await updateProfile(admin, userId, { fullName: truncate(collectedData.name, 200) });
    } catch {
      // Nunca trava o onboarding — profiles.full_name é conveniência, não requisito.
    }
  }

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

  // Região de atuação — dado ESTRUTURAL (fechamento de coerência 08/2026),
  // não memória volátil: antes ficava só em ai_memories, sujeita a sair do
  // top-12 do prompt da IA assim que a empresa acumulasse memórias mais
  // recentes (mesmo risco que cidade-base nunca teve, por já ir pra
  // companies.city/state). Best-effort — falha aqui nunca trava o onboarding.
  if (collectedData.region) {
    try {
      await setOperatingRegion(admin, company.id, collectedData.region);
    } catch {
      // Não trava a conclusão — região é contexto, não requisito.
    }
  }

  // Intenção inicial ("o que você quer resolver primeiro") — antes era usada
  // só pra personalizar a mensagem de conclusão do onboarding e depois
  // descartada; agora vira contexto disponível pra IA depois, como
  // preferência/contexto (nunca um filtro rígido do que o assistente pode
  // fazer). "ver_tudo" não carrega intenção real, não é salvo.
  if (collectedData.intentId && collectedData.intentId !== "ver_tudo") {
    await saveMemory(admin, company.id, userId, {
      memoryType: "profile",
      key: "initial_intent",
      valueJson: { intentId: collectedData.intentId, intentLabel: collectedData.intentLabel },
      summary: `No cadastro, o cliente disse que queria resolver primeiro: ${collectedData.intentLabel ?? collectedData.intentId}.`,
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

  // Preserva o texto completo mesmo quando o cliente menciona mais de uma
  // rota ("Curitiba → São Paulo e Curitiba → Campinas") — só a primeira
  // vira saved_routes estruturada (abaixo, junto com o veículo), então
  // sem esta memória o restante do texto se perderia.
  if (collectedData.primaryRouteRaw) {
    await saveMemory(admin, company.id, userId, {
      memoryType: "operational",
      key: "recurring_route_text",
      valueJson: { text: collectedData.primaryRouteRaw },
      summary: `Rota principal informada no onboarding: ${collectedData.primaryRouteRaw}.`,
      sourceType: "user_explicit",
      confirmedByUser: true,
    });
  }

  if (collectedData.vehicleType) {
    try {
      const { brand, model, modelYear } = parseVehicleDescription(collectedData.primaryVehicleRaw);
      const veiculo = await createVehicle(admin, company.id, userId, {
        name: collectedData.primaryVehicleRaw ? truncate(collectedData.primaryVehicleRaw, 120) : undefined,
        notes: collectedData.primaryVehicleRaw,
        vehicleType: collectedData.vehicleType,
        axleCount: collectedData.axleCount ?? undefined,
        plate: collectedData.plate,
        bodyType: collectedData.bodyType,
        averageConsumptionKmL: collectedData.averageConsumptionKmL,
        brand,
        model,
        modelYear,
      });
      // Nesta V1 é sempre o único veículo da conta — marcar como padrão
      // agora é o que faz a IA reaproveitar tipo/eixos/marca depois, sem
      // perguntar de novo (ver regra no system prompt). Sem isso, o
      // veículo existe no banco mas fica invisível pra IA.
      await setDefaultVehicle(admin, veiculo.id, company.id, userId);

      // Dado estruturado (saved_routes) só quando o parser conseguiu
      // separar origem/destino — a memória acima já garante que o texto
      // bruto nunca se perde, mesmo quando isso não acontece.
      if (collectedData.primaryRouteOrigin && collectedData.primaryRouteDestination) {
        try {
          await createRoute(admin, company.id, userId, {
            vehicleId: veiculo.id,
            name: truncate(`${collectedData.primaryRouteOrigin} → ${collectedData.primaryRouteDestination}`, 120),
            originName: truncate(collectedData.primaryRouteOrigin, 120),
            destinationName: truncate(collectedData.primaryRouteDestination, 120),
            isFavorite: true,
          });
        } catch {
          // Rota estruturada é um bônus sobre a memória já salva acima —
          // falha aqui não pode travar a conclusão do onboarding.
        }
      }
    } catch {
      // Onboarding já concluiu do ponto de vista do usuário — se a
      // gravação do veículo falhar (ex.: texto livre não passa no schema
      // estrito), não trava a conclusão. O cliente pode cadastrar o
      // veículo depois via gerenciar_veiculo.
    }
  }

  return company;
}
