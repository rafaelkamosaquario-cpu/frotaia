import { getCompany } from "@/services/supabase/companyService";
import { getSubscription, isFleetPanelAccessAllowed } from "@/services/supabase/subscriptionService";
import type { SupabaseDbClient } from "@/services/supabase/types";
import { CATALOGO_OFERTAS, isOfertaPlano } from "@/lib/mercadopago/catalog";

/**
 * Fonte única do limite de veículos ativos por empresa (Onboarding 2 —
 * Frota IA Gestão/Painel, 08/2026). Antes disso o limite era decidido por
 * `companies.company_type` (rótulo que o próprio cliente escolhe no
 * onboarding) — trocado para vir do ENTITLEMENT real (mesma fonte do gate
 * do painel, `fleetPanelAccess.ts`), pra não deixar a permissão depender de
 * um campo informado manualmente. Sem coluna numérica nova: o limite é
 * sempre derivado na hora.
 *
 * A mesma regra é imposta de forma redundante em 3 lugares — nenhum deles
 * pode confiar só nos outros dois:
 * 1. trigger `enforce_vehicle_limit_by_entitlement` (banco, última linha de
 *    defesa, vale mesmo se algum caminho de escrita esquecer de checar);
 * 2. `src/ai/tools/gerenciar-veiculo.ts` (chamada pela IA, tanto WhatsApp
 *    quanto widget do painel);
 * 3. formulário do painel (`/frota/veiculos`) — recebe o 409 do backend via
 *    `vehicleApiErrors.ts` quando o limite é atingido.
 *
 * Estrutura Individual/Essencial/Pro (09/2026): o limite deixou de ser
 * binário (1 ou 10) — Essencial tem até 3. Quando `subscription.plan` é uma
 * das 9 chaves do catálogo de autoatendimento, o limite vem direto de
 * `CATALOGO_OFERTAS[plan].limiteVeiculos` (fonte única de verdade, nunca
 * duplicado aqui). `company.fleet_panel_enabled` continua sendo um
 * override manual/administrativo — quando ligado, sempre libera o teto
 * mais alto, independente do plano.
 */

export const VEHICLE_LIMIT_SEM_PAINEL = 1;
export const VEHICLE_LIMIT_COM_PAINEL = 10;

export async function getVehicleLimitForCompany(client: SupabaseDbClient, companyId: string): Promise<number> {
  const [company, subscription] = await Promise.all([
    getCompany(client, companyId),
    getSubscription(client, companyId),
  ]);

  if (company?.fleet_panel_enabled) return VEHICLE_LIMIT_COM_PAINEL;

  if (subscription && isOfertaPlano(subscription.plan)) {
    return CATALOGO_OFERTAS[subscription.plan].limiteVeiculos;
  }

  return isFleetPanelAccessAllowed(subscription) ? VEHICLE_LIMIT_COM_PAINEL : VEHICLE_LIMIT_SEM_PAINEL;
}
