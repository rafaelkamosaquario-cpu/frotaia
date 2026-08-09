import { describe, it, expect } from "vitest";
import { vehicleCreateSchema, vehicleUpdateSchema } from "./schemas";

describe("vehicleCreateSchema / vehicleUpdateSchema — campo active (painel V2)", () => {
  it("aceita active nos dois schemas, como opcional", () => {
    expect(vehicleCreateSchema.safeParse({ active: true }).success).toBe(true);
    expect(vehicleUpdateSchema.safeParse({ active: false }).success).toBe(true);
  });

  it("continua aceitando payload sem active (compatibilidade com onboarding/IA, que nunca envia esse campo)", () => {
    const resultado = vehicleCreateSchema.safeParse({ name: "FH 540", plate: "ABC1D23" });
    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.active).toBeUndefined();
    }
  });

  it("rejeita active não-booleano", () => {
    expect(vehicleUpdateSchema.safeParse({ active: "sim" }).success).toBe(false);
  });
});
