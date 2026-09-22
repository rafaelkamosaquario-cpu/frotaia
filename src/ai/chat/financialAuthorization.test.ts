import { describe, expect, it } from "vitest";
import { canExecuteFinancialTool } from "./financialAuthorization";
describe("financial tools use trusted role", () => {
  for (const name of ["registrar_receita", "registrar_despesa"]) {
    it(`${name}: blocks viewer mutations and operator deletion`, () => {
      for (const mode of ["REGISTRAR", "ATUALIZAR", "EXCLUIR", undefined]) {
        expect(canExecuteFinancialTool(name, mode, "viewer")).toBe(false);
        expect(canExecuteFinancialTool(name, mode, null)).toBe(false);
      }
      expect(canExecuteFinancialTool(name, "EXCLUIR", "operator")).toBe(false);
      expect(canExecuteFinancialTool(name, "REGISTRAR", "operator")).toBe(true);
      expect(canExecuteFinancialTool(name, "CONSULTAR", "viewer")).toBe(true);
      expect(canExecuteFinancialTool(name, "EXCLUIR", "owner")).toBe(true);
      expect(canExecuteFinancialTool(name, "EXCLUIR", "admin")).toBe(true);
    });
  }
});
