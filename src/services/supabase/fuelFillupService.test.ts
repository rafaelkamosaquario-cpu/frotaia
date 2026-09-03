import { describe, it, expect, vi } from "vitest";
import { listFuelFillups, createFuelFillup, updateFuelFillup, deleteFuelFillup, computeAverageFuelConsumption } from "./fuelFillupService";

/**
 * Abastecimentos (fuel_fillups) — rodada de evolução funcional 09/2026
 * (item 2/5). Regressão principal: `computeAverageFuelConsumption` nunca
 * estima — só soma km/litros entre abastecimentos CONSECUTIVOS que têm
 * odometer_km informado, ignorando qualquer registro sem leitura de km.
 */

function makeChainable(finalResult: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const metodo of ["select", "eq", "gte", "lte", "insert", "update", "delete", "limit"]) {
    chain[metodo] = vi.fn(() => chain);
  }
  chain.order = vi.fn(() => chain);
  // Query builders do Supabase são "thenable" — o último método chamado na
  // cadeia real (order, no caso de listFuelFillups/computeAverageFuelConsumption)
  // precisa resolver a promise; aqui simplificamos fazendo o objeto inteiro
  // thenable, então funciona independente de qual método for o último.
  (chain as unknown as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve(finalResult);
  chain.single = vi.fn(async () => finalResult);
  chain.maybeSingle = vi.fn(async () => finalResult);
  return chain;
}

describe("listFuelFillups", () => {
  it("filtra por empresa, veículo e período", async () => {
    const linhas = [{ id: "f1" }];
    const consulta = makeChainable({ data: linhas, error: null });
    const client = { from: vi.fn(() => consulta) } as never;

    const resultado = await listFuelFillups(client, { companyId: "empresa-1", vehicleId: "veiculo-1", dateFrom: "2026-08-01", dateTo: "2026-08-31" });

    expect(consulta.eq).toHaveBeenCalledWith("company_id", "empresa-1");
    expect(consulta.eq).toHaveBeenCalledWith("vehicle_id", "veiculo-1");
    expect(consulta.gte).toHaveBeenCalledWith("fillup_date", "2026-08-01");
    expect(consulta.lte).toHaveBeenCalledWith("fillup_date", "2026-08-31");
    expect(resultado).toEqual(linhas);
  });
});

describe("createFuelFillup", () => {
  it("valida via Zod e nunca chama insert quando falta um campo obrigatório", async () => {
    const client = { from: vi.fn() } as never;

    await expect(createFuelFillup(client, "empresa-1", "usuario-1", { vehicleId: "veiculo-1" })).rejects.toThrow();
    expect((client as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });

  it("insere com company_id/created_by/updated_by", async () => {
    const criado = { id: "f1", vehicle_id: "veiculo-1", liters: 300, total_amount: 1500 };
    const insercao = makeChainable({ data: criado, error: null });
    const client = { from: vi.fn(() => insercao) } as never;

    const veiculoId = "11111111-1111-4111-8111-111111111111";
    const resultado = await createFuelFillup(client, "empresa-1", "usuario-1", {
      vehicleId: veiculoId,
      fillupDate: "2026-09-01",
      liters: 300,
      totalAmount: 1500,
    });

    expect(insercao.insert).toHaveBeenCalledWith(
      expect.objectContaining({ company_id: "empresa-1", vehicle_id: veiculoId, liters: 300, total_amount: 1500, created_by: "usuario-1", updated_by: "usuario-1" })
    );
    expect(resultado).toEqual(criado);
  });
});

describe("updateFuelFillup", () => {
  it("filtra por id E company_id — nunca confia só no id", async () => {
    const atualizado = { id: "f1" };
    const atualizacao = makeChainable({ data: atualizado, error: null });
    const client = { from: vi.fn(() => atualizacao) } as never;

    await updateFuelFillup(client, "f1", "empresa-1", "usuario-1", { liters: 250 });

    expect(atualizacao.eq).toHaveBeenCalledWith("id", "f1");
    expect(atualizacao.eq).toHaveBeenCalledWith("company_id", "empresa-1");
  });
});

describe("deleteFuelFillup", () => {
  it("faz hard delete filtrando por id e company_id", async () => {
    const remocao = makeChainable({ data: null, error: null });
    const client = { from: vi.fn(() => remocao) } as never;

    await deleteFuelFillup(client, "f1", "empresa-1");

    expect(remocao.delete).toHaveBeenCalled();
    expect(remocao.eq).toHaveBeenCalledWith("id", "f1");
    expect(remocao.eq).toHaveBeenCalledWith("company_id", "empresa-1");
  });
});

describe("computeAverageFuelConsumption", () => {
  it("calcula km/l real a partir de abastecimentos consecutivos com km informado", async () => {
    const linhas = [
      { fillup_date: "2026-08-01", liters: 200, total_amount: 1000, odometer_km: 100000 },
      { fillup_date: "2026-08-10", liters: 180, total_amount: 900, odometer_km: 100800 }, // 800km / 180L
      { fillup_date: "2026-08-20", liters: 190, total_amount: 950, odometer_km: 101750 }, // 950km / 190L
    ];
    const consulta = makeChainable({ data: linhas, error: null });
    const client = { from: vi.fn(() => consulta) } as never;

    const resultado = await computeAverageFuelConsumption(client, "empresa-1", "veiculo-1");

    // km total = 800 + 950 = 1750; litros considerados (a partir do 2º) = 180 + 190 = 370
    expect(resultado.kmRodado).toBeCloseTo(1750, 1);
    expect(resultado.litrosConsiderados).toBeCloseTo(370, 2);
    expect(resultado.consumoMedioKmL).toBeCloseTo(1750 / 370, 2);
    expect(resultado.abastecimentosComKm).toBe(3);
    expect(resultado.gastoTotal).toBeCloseTo(2850, 2);
  });

  it("ignora abastecimentos sem odometer_km no cálculo de consumo, mas soma no gasto total", async () => {
    const linhas = [
      { fillup_date: "2026-08-01", liters: 200, total_amount: 1000, odometer_km: 100000 },
      { fillup_date: "2026-08-05", liters: 50, total_amount: 260, odometer_km: null }, // sem km — ignorado no cálculo
      { fillup_date: "2026-08-10", liters: 180, total_amount: 900, odometer_km: 100800 },
    ];
    const consulta = makeChainable({ data: linhas, error: null });
    const client = { from: vi.fn(() => consulta) } as never;

    const resultado = await computeAverageFuelConsumption(client, "empresa-1", "veiculo-1");

    expect(resultado.abastecimentosNoPeriodo).toBe(3);
    expect(resultado.abastecimentosComKm).toBe(2);
    expect(resultado.kmRodado).toBeCloseTo(800, 1);
    expect(resultado.litrosConsiderados).toBeCloseTo(180, 2);
    expect(resultado.gastoTotal).toBeCloseTo(2160, 2);
  });

  it("devolve consumoMedioKmL null quando há menos de 2 leituras de km — nunca estima", async () => {
    const linhas = [{ fillup_date: "2026-08-01", liters: 200, total_amount: 1000, odometer_km: 100000 }];
    const consulta = makeChainable({ data: linhas, error: null });
    const client = { from: vi.fn(() => consulta) } as never;

    const resultado = await computeAverageFuelConsumption(client, "empresa-1", "veiculo-1");

    expect(resultado.consumoMedioKmL).toBeNull();
    expect(resultado.kmRodado).toBe(0);
  });

  it("ignora par com odômetro retrocedendo (delta negativo) em vez de subtrair km", async () => {
    const linhas = [
      { fillup_date: "2026-08-01", liters: 200, total_amount: 1000, odometer_km: 100000 },
      { fillup_date: "2026-08-05", liters: 150, total_amount: 750, odometer_km: 99500 }, // km incoerente (voltou) — ignorado
    ];
    const consulta = makeChainable({ data: linhas, error: null });
    const client = { from: vi.fn(() => consulta) } as never;

    const resultado = await computeAverageFuelConsumption(client, "empresa-1", "veiculo-1");

    expect(resultado.kmRodado).toBe(0);
    expect(resultado.litrosConsiderados).toBe(0);
    expect(resultado.consumoMedioKmL).toBeNull();
  });
});
