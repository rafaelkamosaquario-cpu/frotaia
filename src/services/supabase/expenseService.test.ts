import { describe, it, expect, vi } from "vitest";
import { syncMaintenanceExpense } from "./expenseService";

/**
 * Regressão do requisito "não duplicar despesa" (evolução funcional do
 * módulo Manutenção, 08/2026): concluir uma manutenção com custo cria UMA
 * despesa vinculada (maintenance_schedule_id); concluir de novo (ex.: editar
 * o valor) tem que ATUALIZAR essa mesma despesa, nunca criar uma segunda —
 * é exatamente o que o índice único parcial `expenses_maintenance_schedule_unique_idx`
 * garante no banco, e o que `syncMaintenanceExpense` garante na aplicação
 * checando antes de escrever.
 */

function makeChainable(finalResult: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const metodo of ["select", "eq", "update", "insert"]) {
    chain[metodo] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(async () => finalResult);
  chain.single = vi.fn(async () => finalResult);
  return chain;
}

const INPUT_BASE = {
  companyId: "empresa-1",
  userId: "usuario-1",
  maintenanceScheduleId: "manutencao-1",
  vehicleId: "veiculo-1",
  amount: 1200,
  expenseDate: "2026-08-24",
  description: "Manutenção: Troca de óleo",
};

describe("syncMaintenanceExpense", () => {
  it("cria uma despesa nova quando a manutenção ainda não tem nenhuma vinculada", async () => {
    const consultaSemResultado = makeChainable({ data: null, error: null });
    const despesaCriada = { id: "despesa-1", maintenance_schedule_id: "manutencao-1", amount: 1200 };
    const insercao = makeChainable({ data: despesaCriada, error: null });

    const from = vi.fn().mockReturnValueOnce(consultaSemResultado).mockReturnValueOnce(insercao);
    const client = { from } as never;

    const resultado = await syncMaintenanceExpense(client, INPUT_BASE);

    expect(consultaSemResultado.eq).toHaveBeenCalledWith("maintenance_schedule_id", "manutencao-1");
    expect(insercao.insert).toHaveBeenCalledWith(
      expect.objectContaining({ maintenance_schedule_id: "manutencao-1", expense_type: "manutencao", amount: 1200 })
    );
    expect(resultado).toEqual(despesaCriada);
  });

  it("atualiza a despesa já vinculada em vez de criar outra (idempotência — não duplica)", async () => {
    const despesaExistente = { id: "despesa-1", maintenance_schedule_id: "manutencao-1", amount: 1000 };
    const consultaComResultado = makeChainable({ data: despesaExistente, error: null });
    const despesaAtualizada = { ...despesaExistente, amount: 1500 };
    const atualizacao = makeChainable({ data: despesaAtualizada, error: null });

    const from = vi.fn().mockReturnValueOnce(consultaComResultado).mockReturnValueOnce(atualizacao);
    const client = { from } as never;

    const resultado = await syncMaintenanceExpense(client, { ...INPUT_BASE, amount: 1500 });

    // Só 2 chamadas a .from("expenses") no total (1 consulta + 1 update) — nunca um 3º .insert().
    expect(from).toHaveBeenCalledTimes(2);
    expect(atualizacao.update).toHaveBeenCalledWith(expect.objectContaining({ amount: 1500 }));
    expect(atualizacao.insert).not.toHaveBeenCalled();
    expect(resultado).toEqual(despesaAtualizada);
  });

  it("propaga erro da consulta inicial sem tentar escrever nada", async () => {
    const erro = { message: "falha de conexão" };
    const consultaComErro = makeChainable({ data: null, error: erro });
    const from = vi.fn().mockReturnValueOnce(consultaComErro);
    const client = { from } as never;

    await expect(syncMaintenanceExpense(client, INPUT_BASE)).rejects.toEqual(erro);
    expect(from).toHaveBeenCalledTimes(1);
  });
});
