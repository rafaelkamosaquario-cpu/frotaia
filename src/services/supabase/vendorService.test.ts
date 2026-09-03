import { describe, it, expect, vi } from "vitest";
import { listVendors, getVendor, createVendor, updateVendor, deactivateVendor } from "./vendorService";

/**
 * Fornecedores (vendors) — rodada de evolução funcional 09/2026 (item
 * 1/5). Regressão principal: `updateVendor`/`deactivateVendor` sempre
 * filtram por `company_id` além de `id` — nunca confiam só num id vindo do
 * modelo (mesmo princípio de savedRouteService), e `createVendor`
 * valida via Zod antes de tentar inserir.
 */

function makeChainable(finalResult: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const metodo of ["select", "eq", "insert", "update"]) {
    chain[metodo] = vi.fn(() => chain);
  }
  chain.order = vi.fn(async () => finalResult);
  chain.single = vi.fn(async () => finalResult);
  chain.maybeSingle = vi.fn(async () => finalResult);
  return chain;
}

describe("listVendors", () => {
  it("filtra por empresa e só traz ativos, ordenado por nome", async () => {
    const fornecedores = [{ id: "v1", name: "Posto A" }];
    const consulta = makeChainable({ data: fornecedores, error: null });
    const from = vi.fn(() => consulta);
    const client = { from } as never;

    const resultado = await listVendors(client, "empresa-1");

    expect(from).toHaveBeenCalledWith("vendors");
    expect(consulta.eq).toHaveBeenCalledWith("company_id", "empresa-1");
    expect(consulta.eq).toHaveBeenCalledWith("active", true);
    expect(consulta.order).toHaveBeenCalledWith("name");
    expect(resultado).toEqual(fornecedores);
  });

  it("propaga erro da consulta", async () => {
    const erro = { message: "falha de conexão" };
    const consulta = makeChainable({ data: null, error: erro });
    const client = { from: vi.fn(() => consulta) } as never;

    await expect(listVendors(client, "empresa-1")).rejects.toEqual(erro);
  });
});

describe("getVendor", () => {
  it("devolve null quando não encontra (maybeSingle)", async () => {
    const consulta = makeChainable({ data: null, error: null });
    const client = { from: vi.fn(() => consulta) } as never;

    const resultado = await getVendor(client, "v-inexistente");
    expect(resultado).toBeNull();
  });
});

describe("createVendor", () => {
  it("valida entrada via Zod e nunca chama insert quando falta o nome", async () => {
    const client = { from: vi.fn() } as never;

    await expect(createVendor(client, "empresa-1", "usuario-1", { category: "outro" })).rejects.toThrow();
    expect((client as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });

  it("insere com company_id/created_by/updated_by e categoria padrão 'outro'", async () => {
    const criado = { id: "v1", name: "Posto A", category: "outro" };
    const insercao = makeChainable({ data: criado, error: null });
    const client = { from: vi.fn(() => insercao) } as never;

    const resultado = await createVendor(client, "empresa-1", "usuario-1", { name: "Posto A" });

    expect(insercao.insert).toHaveBeenCalledWith(
      expect.objectContaining({ company_id: "empresa-1", name: "Posto A", category: "outro", created_by: "usuario-1", updated_by: "usuario-1" })
    );
    expect(resultado).toEqual(criado);
  });
});

describe("updateVendor", () => {
  it("filtra por id E company_id — nunca confia só no id", async () => {
    const atualizado = { id: "v1", name: "Posto B" };
    const atualizacao = makeChainable({ data: atualizado, error: null });
    const client = { from: vi.fn(() => atualizacao) } as never;

    await updateVendor(client, "v1", "empresa-1", "usuario-1", { name: "Posto B" });

    expect(atualizacao.eq).toHaveBeenCalledWith("id", "v1");
    expect(atualizacao.eq).toHaveBeenCalledWith("company_id", "empresa-1");
  });
});

describe("deactivateVendor", () => {
  it("faz soft delete (active: false) em vez de apagar a linha", async () => {
    const desativado = { id: "v1", active: false };
    const atualizacao = makeChainable({ data: desativado, error: null });
    const client = { from: vi.fn(() => atualizacao) } as never;

    const resultado = await deactivateVendor(client, "v1", "empresa-1", "usuario-1");

    expect(atualizacao.update).toHaveBeenCalledWith(expect.objectContaining({ active: false, updated_by: "usuario-1" }));
    expect(atualizacao.eq).toHaveBeenCalledWith("id", "v1");
    expect(atualizacao.eq).toHaveBeenCalledWith("company_id", "empresa-1");
    expect(resultado).toEqual(desativado);
  });
});
