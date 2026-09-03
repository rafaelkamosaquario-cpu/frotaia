import { describe, it, expect } from "vitest";
import { resolvePeriodo, filterRelatoriosInput, computeRelatoriosBlocos, type RelatoriosInput } from "./relatoriosAggregation";

/** Regressão dos filtros reais de Relatórios (evolução funcional 08/2026) — período, veículo e motorista. */

describe("resolvePeriodo", () => {
  const hoje = new Date("2026-08-24T12:00:00-03:00");

  it("30d é o padrão quando nenhum period é informado (preserva comportamento anterior)", () => {
    const resultado = resolvePeriodo({}, hoje);
    expect(resultado.preset).toBe("30d");
    expect(resultado.to).toBe("2026-08-24");
    expect(resultado.from).toBe("2026-07-25");
  });

  it("7d / 90d calculam o intervalo certo", () => {
    expect(resolvePeriodo({ period: "7d" }, hoje).from).toBe("2026-08-17");
    expect(resolvePeriodo({ period: "90d" }, hoje).from).toBe("2026-05-26");
  });

  it("mes_atual começa no dia 1 do mês corrente", () => {
    const resultado = resolvePeriodo({ period: "mes_atual" }, hoje);
    expect(resultado.from).toBe("2026-08-01");
    expect(resultado.to).toBe("2026-08-24");
  });

  it("mes_anterior cobre o mês inteiro anterior (1º ao último dia)", () => {
    const resultado = resolvePeriodo({ period: "mes_anterior" }, hoje);
    expect(resultado.from).toBe("2026-07-01");
    expect(resultado.to).toBe("2026-07-31");
  });

  it("custom usa exatamente o from/to informado", () => {
    const resultado = resolvePeriodo({ period: "custom", from: "2026-01-01", to: "2026-01-15" }, hoje);
    expect(resultado.from).toBe("2026-01-01");
    expect(resultado.to).toBe("2026-01-15");
    expect(resultado.preset).toBe("custom");
  });

  it("period inválido/desconhecido cai no padrão 30d (nunca quebra)", () => {
    expect(resolvePeriodo({ period: "qualquer-coisa" }, hoje).preset).toBe("30d");
  });
});

function baseInput(): RelatoriosInput {
  return {
    veiculos: [
      { id: "v1", vehicle_type: "toco" } as never,
      { id: "v2", vehicle_type: "carreta" } as never,
    ],
    motoristas: [
      { id: "m1", vehicle_id: "v1", active: true } as never,
      { id: "m2", vehicle_id: "v2", active: true } as never,
    ],
    manutencoes: [{ id: "man1", vehicle_id: "v1", due_date: "2026-08-10", status: "concluido" } as never],
    documentos: [{ id: "doc1", vehicle_id: "v1", driver_id: null, expiry_date: "2026-08-15", document_type: "seguro" } as never],
    despesas: [{ id: "d1", vehicle_id: "v1", expense_date: "2026-08-05", expense_type: "combustivel", amount: 100 } as never],
    receitas: [{ id: "r1", vehicle_id: "v1", revenue_date: "2026-08-06", amount: 500 } as never],
    jornadas: [{ id: "j1", vehicle_id: "v2", driver_id: "m2", scheduled_departure: "2026-08-12T08:00:00Z", status: "concluida" } as never],
    checklistDispatches: [{ id: "c1", vehicle_id: "v1", driver_id: "m1", sent_at: "2026-08-20T11:00:00Z", response_status: "ok" } as never],
    analisesFrete: [{ id: "a1", vehicle_id: "v1", created_at: "2026-08-18T00:00:00Z" } as never],
  };
}

describe("filterRelatoriosInput", () => {
  it("sem filtro nenhum, devolve tudo intacto", () => {
    const input = baseInput();
    const resultado = filterRelatoriosInput(input, {});
    expect(resultado).toEqual(input);
  });

  it("filtra por veículo em todas as tabelas que têm vehicle_id", () => {
    const resultado = filterRelatoriosInput(baseInput(), { vehicleId: "v1" });
    expect(resultado.veiculos.map((v) => v.id)).toEqual(["v1"]);
    expect(resultado.manutencoes).toHaveLength(1);
    expect(resultado.documentos).toHaveLength(1);
    expect(resultado.despesas).toHaveLength(1);
    expect(resultado.receitas).toHaveLength(1);
    expect(resultado.jornadas).toHaveLength(0); // jornada é do v2
    expect(resultado.checklistDispatches).toHaveLength(1);
    expect(resultado.analisesFrete).toHaveLength(1);
  });

  it("filtra por motorista só onde a relação existe (nunca em despesas, que não tem driver_id)", () => {
    const resultado = filterRelatoriosInput(baseInput(), { driverId: "m1" });
    expect(resultado.motoristas.map((m) => m.id)).toEqual(["m1"]);
    expect(resultado.checklistDispatches).toHaveLength(1);
    expect(resultado.jornadas).toHaveLength(0); // jornada é da m2
    // despesas não tem driver_id — filtro de motorista nunca reduz esse bloco (evita resultado falso).
    expect(resultado.despesas).toHaveLength(1);
  });

  it("filtra por período (from/to) só onde há campo de data — nunca exclui registro sem data", () => {
    const semData = { ...baseInput(), documentos: [{ id: "doc2", vehicle_id: "v1", driver_id: null, expiry_date: null, document_type: "seguro" } as never] };
    const resultado = filterRelatoriosInput(semData, { from: "2026-09-01", to: "2026-09-30" });
    expect(resultado.documentos).toHaveLength(1); // sem vencimento nunca é escondido por período
    expect(resultado.despesas).toHaveLength(0); // despesa de 2026-08-05 fica fora do período de setembro
    expect(resultado.receitas).toHaveLength(0); // receita de 2026-08-06 fica fora do período de setembro
  });

  it("combina veículo + período (ambos precisam bater)", () => {
    const resultado = filterRelatoriosInput(baseInput(), { vehicleId: "v1", from: "2026-08-01", to: "2026-08-09" });
    // despesa do v1 é 2026-08-05 (dentro) — manutenção do v1 é 2026-08-10 (fora)
    expect(resultado.despesas).toHaveLength(1);
    expect(resultado.receitas).toHaveLength(1);
    expect(resultado.manutencoes).toHaveLength(0);
  });

  it("dados vazios não quebram (todos os blocos ficam vazios, sem erro)", () => {
    const vazio: RelatoriosInput = {
      veiculos: [],
      motoristas: [],
      manutencoes: [],
      documentos: [],
      despesas: [],
      receitas: [],
      jornadas: [],
      checklistDispatches: [],
      analisesFrete: [],
    };
    expect(() => filterRelatoriosInput(vazio, { vehicleId: "qualquer" })).not.toThrow();
    expect(filterRelatoriosInput(vazio, { vehicleId: "qualquer" }).veiculos).toEqual([]);
  });
});

describe("computeRelatoriosBlocos — Resultado (receita − custo)", () => {
  it("soma receitas e despesas independente do veículo/tipo e calcula o resultado líquido", () => {
    const blocos = computeRelatoriosBlocos(baseInput(), "período de teste");
    const resultado = blocos.find((b) => b.titulo === "Resultado (período de teste)");
    expect(resultado).toBeDefined();
    expect(resultado!.linhas).toEqual([
      { label: "Receita", valor: 500 },
      { label: "Custo", valor: 100 },
      { label: "Resultado (receita − custo)", valor: 400 },
    ]);
  });

  it("não aparece quando não há nem receita nem despesa no período — evita mostrar R$ 0,00 sem sentido", () => {
    const semDinheiro = { ...baseInput(), despesas: [], receitas: [] };
    const blocos = computeRelatoriosBlocos(semDinheiro);
    expect(blocos.some((b) => b.titulo.startsWith("Resultado"))).toBe(false);
  });

  it("aparece mesmo só com despesa (sem receita ainda) ou só com receita (sem despesa ainda)", () => {
    const soDespesa = computeRelatoriosBlocos({ ...baseInput(), receitas: [] });
    expect(soDespesa.some((b) => b.titulo.startsWith("Resultado"))).toBe(true);

    const soReceita = computeRelatoriosBlocos({ ...baseInput(), despesas: [] });
    expect(soReceita.some((b) => b.titulo.startsWith("Resultado"))).toBe(true);
  });
});
