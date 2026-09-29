import { describe, it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ expenses: vi.fn(), revenues: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/services/supabase/expenseService", () => ({
  listExpenses: mocks.expenses, recordExpense: vi.fn(), updateExpense: vi.fn(), deleteExpense: vi.fn(),
}));
vi.mock("@/services/supabase/revenueService", () => ({
  listRevenues: mocks.revenues, recordRevenue: vi.fn(), updateRevenue: vi.fn(), deleteRevenue: vi.fn(),
}));
import { ferramentaRegistrarDespesa } from "./registrar-despesa";
import { ferramentaRegistrarReceita } from "./registrar-receita";
describe("Totais completos, detalhamento limitado", () => {
  beforeEach(() => vi.clearAllMocks());
  for (const [name, tool, mock] of [
    ["despesas", ferramentaRegistrarDespesa, mocks.expenses],
    ["receitas", ferramentaRegistrarReceita, mocks.revenues],
  ] as const) {
    for (const count of [0, 51, 201, 1001]) {
      it(`${name}: totaliza ${count} registros além do limite de detalhes`, async () => {
        mock.mockResolvedValue(Array.from({ length: count }, (_, i) => ({
          id: String(i), amount: 10.01, expense_type: "combustivel",
          expense_date: "2026-09-01", revenue_date: "2026-09-01",
        })));
        const result = await tool.executar({
          modo: "CONSULTAR", companyId: "empresa", userId: "usuario",
          vehicleId: "caminhao", dataInicio: "2026-09-01", dataFim: "2026-09-30", limite: 20,
        });
        expect(mock).toHaveBeenCalledWith({}, expect.objectContaining({
          all: true, companyId: "empresa", vehicleId: "caminhao",
          dateFrom: "2026-09-01", dateTo: "2026-09-30",
        }));
        expect(result.sucesso).toBe(true);
        expect(result.totalGeral).toBe(count * 1001 / 100);
        expect(result.quantidadeEncontrada).toBe(count);
        expect(result.itens).toHaveLength(Math.min(count, 20));
        expect(result.alertas.length).toBe(count > 20 ? 1 : 0);
      });
    }
    it(`${name}: falha de leitura não vira total parcial`, async () => {
      mock.mockRejectedValue(new Error("pagina indisponivel"));
      const result = await tool.executar({ modo: "CONSULTAR", companyId: "empresa", userId: "usuario" });
      expect(result.sucesso).toBe(false);
      expect(result.totalGeral).toBeUndefined();
    });
  }
});
