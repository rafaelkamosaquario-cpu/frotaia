import { describe, it, expect, vi } from "vitest";
import { getLatestKnownOdometer } from "./vehicleOdometerService";

/**
 * Última leitura de km conhecida (item 4/5 da rodada de evolução funcional
 * 09/2026) — nunca telemetria, sempre a leitura mais recente entre as 4
 * fontes que capturam km manualmente informado. Regressão principal:
 * escolher corretamente a mais recente por DATA, não pela ordem das
 * queries, e nunca quebrar quando alguma fonte não tem dado nenhum.
 */

function maybeSingleResult(data: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const metodo of ["select", "eq", "not", "order", "limit"]) {
    chain[metodo] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(async () => ({ data, error: null }));
  return chain;
}

function clientComFontes(abastecimento: unknown, pneu: unknown, manutencao: unknown, veiculo: unknown = null) {
  const from = vi.fn((tabela: string) => {
    if (tabela === "fuel_fillups") return maybeSingleResult(abastecimento);
    if (tabela === "vehicle_tires") return maybeSingleResult(pneu);
    if (tabela === "maintenance_schedules") return maybeSingleResult(manutencao);
    if (tabela === "vehicles") return maybeSingleResult(veiculo);
    throw new Error(`tabela inesperada: ${tabela}`);
  });
  return { from } as never;
}

describe("getLatestKnownOdometer", () => {
  it("devolve null quando nenhuma das 4 fontes tem leitura", async () => {
    const client = clientComFontes(null, null, null, null);
    expect(await getLatestKnownOdometer(client, "veiculo-1")).toBeNull();
  });

  it("escolhe a leitura mais recente por data, não pela ordem das fontes", async () => {
    const client = clientComFontes(
      { odometer_km: 100000, fillup_date: "2026-08-01" },
      { last_checked_km: 105000, updated_at: "2026-08-20T10:00:00Z" },
      { executed_km: 102000, executed_date: "2026-08-10" }
    );

    const resultado = await getLatestKnownOdometer(client, "veiculo-1");
    expect(resultado).toEqual({ km: 105000, fonte: "pneu", data: "2026-08-20T10:00:00Z" });
  });

  it("funciona normalmente quando só 1 das 4 fontes tem leitura", async () => {
    const client = clientComFontes(null, null, { executed_km: 90000, executed_date: "2026-07-15" });
    const resultado = await getLatestKnownOdometer(client, "veiculo-1");
    expect(resultado).toEqual({ km: 90000, fonte: "manutencao", data: "2026-07-15" });
  });

  it("considera vehicles.current_odometer_km como 4ª fonte, usando updated_at como data aproximada", async () => {
    const client = clientComFontes(null, null, null, { current_odometer_km: 87000, updated_at: "2026-08-05T09:00:00Z" });
    const resultado = await getLatestKnownOdometer(client, "veiculo-1");
    expect(resultado).toEqual({ km: 87000, fonte: "veiculo", data: "2026-08-05T09:00:00Z" });
  });

  it("vehicles.current_odometer_km vence quando é a leitura mais recente entre as 4 fontes", async () => {
    const client = clientComFontes(
      { odometer_km: 100000, fillup_date: "2026-08-01" },
      { last_checked_km: 105000, updated_at: "2026-08-20T10:00:00Z" },
      { executed_km: 102000, executed_date: "2026-08-10" },
      { current_odometer_km: 110000, updated_at: "2026-08-25T12:00:00Z" }
    );

    const resultado = await getLatestKnownOdometer(client, "veiculo-1");
    expect(resultado).toEqual({ km: 110000, fonte: "veiculo", data: "2026-08-25T12:00:00Z" });
  });

  it("propaga erro se alguma das 4 consultas falhar", async () => {
    const chainComErro = maybeSingleResult(null);
    chainComErro.maybeSingle = vi.fn(async () => ({ data: null, error: { message: "falha" } }));
    const from = vi.fn((tabela: string) => (tabela === "fuel_fillups" ? chainComErro : maybeSingleResult(null)));
    const client = { from } as never;

    await expect(getLatestKnownOdometer(client, "veiculo-1")).rejects.toEqual({ message: "falha" });
  });
});
