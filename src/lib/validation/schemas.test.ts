import { describe, it, expect } from "vitest";
import {
  vehicleCreateSchema,
  vehicleUpdateSchema,
  driverCreateSchema,
  driverUpdateSchema,
  maintenanceScheduleCreateSchema,
  maintenanceScheduleUpdateSchema,
  maintenanceCostSchema,
} from "./schemas";

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

describe("driverCreateSchema / driverUpdateSchema (painel V2 — Motoristas)", () => {
  it("name é obrigatório na criação (drivers.name é not null no banco), mas opcional na atualização", () => {
    expect(driverCreateSchema.safeParse({}).success).toBe(false);
    expect(driverCreateSchema.safeParse({ name: "João Silva" }).success).toBe(true);
    expect(driverUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("rejeita telefone fora do formato E.164", () => {
    expect(driverUpdateSchema.safeParse({ phoneE164: "41999998888" }).success).toBe(false);
  });

  it("aceita telefone em E.164", () => {
    expect(driverUpdateSchema.safeParse({ phoneE164: "+5541999998888" }).success).toBe(true);
  });

  it("vehicleId aceita um uuid válido, null (desvincular) ou ausente (não altera)", () => {
    expect(driverUpdateSchema.safeParse({ vehicleId: "11111111-1111-4111-8111-111111111111" }).success).toBe(true);
    expect(driverUpdateSchema.safeParse({ vehicleId: null }).success).toBe(true);
    expect(driverUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("rejeita vehicleId que não é um uuid", () => {
    expect(driverUpdateSchema.safeParse({ vehicleId: "nao-e-um-uuid" }).success).toBe(false);
  });

  it("rejeita active não-booleano", () => {
    expect(driverUpdateSchema.safeParse({ active: "sim" }).success).toBe(false);
  });
});

describe("maintenanceScheduleCreateSchema — controle por data e/ou km (evolução funcional 08/2026)", () => {
  const base = { vehicleId: "11111111-1111-4111-8111-111111111111", type: "Troca de óleo", dueDate: "2026-09-01" };

  it("aceita manutenção só com data (compatibilidade — nenhum campo novo é obrigatório)", () => {
    expect(maintenanceScheduleCreateSchema.safeParse(base).success).toBe(true);
  });

  it("aceita manutenção com km de execução (executedKm) além da data", () => {
    const resultado = maintenanceScheduleCreateSchema.safeParse({ ...base, executedKm: 250000, executedDate: "2026-08-24" });
    expect(resultado.success).toBe(true);
  });

  it("aceita data + km simultaneamente (próxima manutenção por data E por km)", () => {
    const resultado = maintenanceScheduleCreateSchema.safeParse({ ...base, executedKm: 250000, nextDueKm: 260000 });
    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.nextDueKm).toBe(260000);
    }
  });

  it("rejeita km negativo", () => {
    expect(maintenanceScheduleCreateSchema.safeParse({ ...base, executedKm: -10 }).success).toBe(false);
  });

  it("rejeita km fracionado (não inteiro)", () => {
    expect(maintenanceScheduleCreateSchema.safeParse({ ...base, executedKm: 250000.5 }).success).toBe(false);
  });

  it("maintenanceScheduleUpdateSchema aceita payload parcial (só editar o km, sem reenviar o resto)", () => {
    expect(maintenanceScheduleUpdateSchema.safeParse({ executedKm: 250000 }).success).toBe(true);
    expect(maintenanceScheduleUpdateSchema.safeParse({}).success).toBe(true);
  });
});

describe("maintenanceCostSchema — custo vinculado a despesa (nunca gravado em maintenance_schedules)", () => {
  it("aceita valor positivo", () => {
    expect(maintenanceCostSchema.safeParse(1200).success).toBe(true);
  });

  it("rejeita zero e negativo (mesma regra de expenses_amount_positive no banco)", () => {
    expect(maintenanceCostSchema.safeParse(0).success).toBe(false);
    expect(maintenanceCostSchema.safeParse(-50).success).toBe(false);
  });
});
