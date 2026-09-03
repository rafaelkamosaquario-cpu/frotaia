import { describe, it, expect, vi } from "vitest";
import { listVehicleTires, createVehicleTire, updateVehicleTire, computeTireKm } from "./vehicleTireService";

/**
 * Pneu físico individual (vehicle_tires) — rodada de evolução funcional
 * 09/2026 (item 3/5). Regressão principal: `computeTireKm` nunca é
 * guardado no banco, sempre recalculado na leitura, e nunca inventa um
 * valor quando falta dado (mounted_km/last_checked_km ausente, ou leitura
 * incoerente com a montagem).
 */

function makeChainable(finalResult: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const metodo of ["select", "eq", "insert", "update", "order"]) {
    chain[metodo] = vi.fn(() => chain);
  }
  // listVehicleTires chama .order() ANTES dos .eq() condicionais e depois é
  // await direto (sem .single()) — o objeto inteiro precisa ser thenable,
  // não só o último método da cadeia real.
  (chain as unknown as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve(finalResult);
  chain.single = vi.fn(async () => finalResult);
  chain.maybeSingle = vi.fn(async () => finalResult);
  return chain;
}

const VEICULO_ID = "11111111-1111-4111-8111-111111111111";

describe("listVehicleTires", () => {
  it("filtra por empresa, veículo e status quando informados", async () => {
    const linhas = [{ id: "t1" }];
    const consulta = makeChainable({ data: linhas, error: null });
    const client = { from: vi.fn(() => consulta) } as never;

    const resultado = await listVehicleTires(client, { companyId: "empresa-1", vehicleId: VEICULO_ID, status: "montado" });

    expect(consulta.eq).toHaveBeenCalledWith("company_id", "empresa-1");
    expect(consulta.eq).toHaveBeenCalledWith("vehicle_id", VEICULO_ID);
    expect(consulta.eq).toHaveBeenCalledWith("status", "montado");
    expect(resultado).toEqual(linhas);
  });
});

describe("createVehicleTire", () => {
  it("insere com company_id/created_by/updated_by", async () => {
    const criado = { id: "t1", vehicle_id: VEICULO_ID, status: "montado" };
    const insercao = makeChainable({ data: criado, error: null });
    const client = { from: vi.fn(() => insercao) } as never;

    const resultado = await createVehicleTire(client, "empresa-1", "usuario-1", {
      vehicleId: VEICULO_ID,
      status: "montado",
      mountedKm: 100000,
    });

    expect(insercao.insert).toHaveBeenCalledWith(
      expect.objectContaining({ company_id: "empresa-1", vehicle_id: VEICULO_ID, status: "montado", mounted_km: 100000, created_by: "usuario-1", updated_by: "usuario-1" })
    );
    expect(resultado).toEqual(criado);
  });
});

describe("updateVehicleTire", () => {
  it("filtra por id E company_id — nunca confia só no id", async () => {
    const atualizado = { id: "t1" };
    const atualizacao = makeChainable({ data: atualizado, error: null });
    const client = { from: vi.fn(() => atualizacao) } as never;

    await updateVehicleTire(client, "t1", "empresa-1", "usuario-1", { lastCheckedKm: 105000 });

    expect(atualizacao.eq).toHaveBeenCalledWith("id", "t1");
    expect(atualizacao.eq).toHaveBeenCalledWith("company_id", "empresa-1");
  });
});

describe("computeTireKm", () => {
  it("calcula km rodado e km restante quando há montagem, leitura e vida útil", () => {
    const resultado = computeTireKm({ mounted_km: 100000, last_checked_km: 105000, expected_life_km: 80000 });
    expect(resultado.kmRodado).toBe(5000);
    expect(resultado.kmRestante).toBe(75000);
  });

  it("devolve kmRodado null quando falta mounted_km ou last_checked_km — nunca estima", () => {
    expect(computeTireKm({ mounted_km: null, last_checked_km: 105000, expected_life_km: 80000 })).toEqual({ kmRodado: null, kmRestante: null });
    expect(computeTireKm({ mounted_km: 100000, last_checked_km: null, expected_life_km: 80000 })).toEqual({ kmRodado: null, kmRestante: null });
  });

  it("devolve kmRestante null quando não há vida útil esperada, mas ainda calcula kmRodado", () => {
    const resultado = computeTireKm({ mounted_km: 100000, last_checked_km: 105000, expected_life_km: null });
    expect(resultado.kmRodado).toBe(5000);
    expect(resultado.kmRestante).toBeNull();
  });

  it("trata leitura incoerente (last_checked_km menor que mounted_km) como dado inválido, não como km negativo", () => {
    const resultado = computeTireKm({ mounted_km: 100000, last_checked_km: 99000, expected_life_km: 80000 });
    expect(resultado.kmRodado).toBeNull();
    expect(resultado.kmRestante).toBeNull();
  });

  it("kmRestante pode ficar negativo (vida útil já esgotada) sem virar null — só o kmRodado negativo é que é tratado como erro", () => {
    const resultado = computeTireKm({ mounted_km: 100000, last_checked_km: 200000, expected_life_km: 80000 });
    expect(resultado.kmRodado).toBe(100000);
    expect(resultado.kmRestante).toBe(-20000);
  });
});
