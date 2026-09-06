import type { SupabaseDbClient } from "./types";

export type OdometerSource = "abastecimento" | "pneu" | "manutencao" | "veiculo";

export interface LatestOdometerReading {
  km: number;
  fonte: OdometerSource;
  /**
   * Data da leitura — YYYY-MM-DD para abastecimento/manutenção (data de
   * negócio própria), timestamp ISO completo pra pneu/veículo (fontes sem
   * data própria — usa a última atualização do registro como aproximação).
   * Sempre "última leitura informada manualmente", nunca telemetria/tempo real.
   */
  data: string;
}

interface Candidato extends LatestOdometerReading {
  instante: number;
}

/**
 * Última leitura de km CONHECIDA de um veículo, dentre as fontes que hoje
 * capturam km manualmente informado: abastecimentos (fuel_fillups, item
 * 2/5), pneus (vehicle_tires, item 3/5), manutenções concluídas
 * (maintenance_schedules.executed_km, já existente desde a Rodada 1) e o
 * campo manual do próprio veículo (vehicles.current_odometer_km, já
 * existia antes de tudo isso mas nunca era consumido por nenhuma lógica —
 * adicionado como 4ª fonte pra cobrir quem só atualiza o hodômetro direto
 * no cadastro, sem usar abastecimento/pneu ainda). Alimenta a manutenção
 * por km ativa (item 4/5) — nunca finge tempo real, é sempre "a leitura
 * mais recente que alguém informou manualmente".
 */
export async function getLatestKnownOdometer(client: SupabaseDbClient, vehicleId: string): Promise<LatestOdometerReading | null> {
  const [abastecimento, pneu, manutencao, veiculo] = await Promise.all([
    client
      .from("fuel_fillups")
      .select("odometer_km, fillup_date")
      .eq("vehicle_id", vehicleId)
      .not("odometer_km", "is", null)
      .order("fillup_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("vehicle_tires")
      .select("last_checked_km, updated_at")
      .eq("vehicle_id", vehicleId)
      .not("last_checked_km", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("maintenance_schedules")
      .select("executed_km, executed_date")
      .eq("vehicle_id", vehicleId)
      .not("executed_km", "is", null)
      .order("executed_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client.from("vehicles").select("current_odometer_km, updated_at").eq("id", vehicleId).not("current_odometer_km", "is", null).maybeSingle(),
  ]);

  if (abastecimento.error) throw abastecimento.error;
  if (pneu.error) throw pneu.error;
  if (manutencao.error) throw manutencao.error;
  if (veiculo.error) throw veiculo.error;

  const candidatos: Candidato[] = [];
  if (abastecimento.data?.odometer_km != null && abastecimento.data.fillup_date) {
    candidatos.push({
      km: Number(abastecimento.data.odometer_km),
      fonte: "abastecimento",
      data: abastecimento.data.fillup_date,
      instante: new Date(`${abastecimento.data.fillup_date}T00:00:00Z`).getTime(),
    });
  }
  if (pneu.data?.last_checked_km != null && pneu.data.updated_at) {
    candidatos.push({
      km: Number(pneu.data.last_checked_km),
      fonte: "pneu",
      data: pneu.data.updated_at,
      instante: new Date(pneu.data.updated_at).getTime(),
    });
  }
  if (manutencao.data?.executed_km != null && manutencao.data.executed_date) {
    candidatos.push({
      km: Number(manutencao.data.executed_km),
      fonte: "manutencao",
      data: manutencao.data.executed_date,
      instante: new Date(`${manutencao.data.executed_date}T00:00:00Z`).getTime(),
    });
  }
  if (veiculo.data?.current_odometer_km != null && veiculo.data.updated_at) {
    candidatos.push({
      km: Number(veiculo.data.current_odometer_km),
      fonte: "veiculo",
      data: veiculo.data.updated_at,
      instante: new Date(veiculo.data.updated_at).getTime(),
    });
  }

  if (candidatos.length === 0) return null;

  const maisRecente = candidatos.reduce((a, b) => (b.instante > a.instante ? b : a));
  return { km: maisRecente.km, fonte: maisRecente.fonte, data: maisRecente.data };
}
