import { describe, it, expect } from "vitest";
import { computeFleetAlerts } from "./fleetAlertsService";
import type { LatestOdometerReading } from "./vehicleOdometerService";
import type { MaintenanceScheduleRow, VehicleRow } from "@/lib/supabase/tables";

/**
 * Manutenção por km ativa (item 4/5 da rodada de evolução funcional
 * 09/2026) — regressão principal: data e km são avaliados EM PARALELO
 * (nunca "ou exclusivo"), então qualquer um dos dois gatilhos já inclui a
 * manutenção na lista, e nunca duplica em 2 itens pra mesma manutenção.
 */

function dataEmDias(dias: number): string {
  const data = new Date();
  data.setDate(data.getDate() + dias);
  return data.toISOString().slice(0, 10);
}

const VEICULO: VehicleRow = { id: "v1", name: "Truck 1", plate: null } as VehicleRow;

function manutencao(overrides: Partial<MaintenanceScheduleRow>): MaintenanceScheduleRow {
  return {
    id: "m1",
    company_id: "empresa-1",
    vehicle_id: "v1",
    type: "Troca de óleo",
    due_date: dataEmDias(90),
    status: "pendente",
    alert_sent: false,
    notes: null,
    executed_date: null,
    executed_km: null,
    next_due_km: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as MaintenanceScheduleRow;
}

describe("computeFleetAlerts — manutenção por km", () => {
  it("inclui a manutenção quando só o km está baixo, mesmo com a data ainda longe", () => {
    const m = manutencao({ due_date: dataEmDias(90), next_due_km: 100000 });
    const odometros = new Map<string, LatestOdometerReading>([["v1", { km: 99500, fonte: "abastecimento", data: "2026-08-20" }]]);

    const alertas = computeFleetAlerts({ veiculos: [VEICULO], manutencoes: [m], documentos: [], odometros });

    expect(alertas).toHaveLength(1);
    expect(alertas[0].descricao).toContain("faltam ~500km");
    expect(alertas[0].descricao).toContain("20/08");
  });

  it("inclui a manutenção quando só a data está próxima, mesmo sem leitura de km", () => {
    const m = manutencao({ due_date: dataEmDias(5), next_due_km: 100000 });

    const alertas = computeFleetAlerts({ veiculos: [VEICULO], manutencoes: [m], documentos: [] });

    expect(alertas).toHaveLength(1);
    expect(alertas[0].descricao).not.toContain("faltam");
  });

  it("nunca duplica em 2 itens quando data E km disparam ao mesmo tempo — 1 item só, com as duas informações", () => {
    const m = manutencao({ due_date: dataEmDias(5), next_due_km: 100000 });
    const odometros = new Map<string, LatestOdometerReading>([["v1", { km: 99800, fonte: "pneu", data: "2026-08-25T00:00:00Z" }]]);

    const alertas = computeFleetAlerts({ veiculos: [VEICULO], manutencoes: [m], documentos: [], odometros });

    expect(alertas).toHaveLength(1);
    expect(alertas[0].descricao).toContain("faltam ~200km");
  });

  it("exclui a manutenção quando nem data nem km disparam", () => {
    const m = manutencao({ due_date: dataEmDias(90), next_due_km: 100000 });
    const odometros = new Map<string, LatestOdometerReading>([["v1", { km: 50000, fonte: "abastecimento", data: "2026-08-01" }]]);

    const alertas = computeFleetAlerts({ veiculos: [VEICULO], manutencoes: [m], documentos: [], odometros });

    expect(alertas).toHaveLength(0);
  });

  it("nunca inventa km restante quando next_due_km não está preenchido, mesmo havendo leitura de odômetro", () => {
    const m = manutencao({ due_date: dataEmDias(90), next_due_km: null });
    const odometros = new Map<string, LatestOdometerReading>([["v1", { km: 99500, fonte: "abastecimento", data: "2026-08-20" }]]);

    const alertas = computeFleetAlerts({ veiculos: [VEICULO], manutencoes: [m], documentos: [], odometros });

    expect(alertas).toHaveLength(0);
  });

  it("marca como vencido quando o km restante já é zero ou negativo, mesmo com a data ainda no futuro", () => {
    const m = manutencao({ due_date: dataEmDias(90), next_due_km: 100000 });
    const odometros = new Map<string, LatestOdometerReading>([["v1", { km: 100500, fonte: "abastecimento", data: "2026-08-20" }]]);

    const alertas = computeFleetAlerts({ veiculos: [VEICULO], manutencoes: [m], documentos: [], odometros });

    expect(alertas).toHaveLength(1);
    expect(alertas[0].vencido).toBe(true);
  });

  it("ignora manutenção concluída/cancelada mesmo com km baixo", () => {
    const concluida = manutencao({ id: "m2", due_date: dataEmDias(90), next_due_km: 100000, status: "concluido" });
    const odometros = new Map<string, LatestOdometerReading>([["v1", { km: 99900, fonte: "abastecimento", data: "2026-08-20" }]]);

    const alertas = computeFleetAlerts({ veiculos: [VEICULO], manutencoes: [concluida], documentos: [], odometros });

    expect(alertas).toHaveLength(0);
  });
});
