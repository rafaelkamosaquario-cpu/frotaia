import { describe, it, expect, vi } from "vitest";
import { createDriver, updateDriver } from "./driverService";
import type { SupabaseDbClient } from "./types";
const id = "11111111-1111-4111-8111-111111111111";
function database() {
  const q = { insert: vi.fn(), update: vi.fn(), select: vi.fn(), eq: vi.fn(), single: vi.fn(async () => ({ data: { id }, error: null })) };
  for (const method of [q.insert, q.update, q.select, q.eq]) method.mockReturnValue(q);
  return { q, client: { from: vi.fn(() => q) } as unknown as SupabaseDbClient };
}
describe("driver additional equipment links", () => {
  it("creates and updates both additional slots without replacing the principal", async () => {
    const { q, client } = database();
    const payload = { name: "Rafael", vehicleId: id, additionalVehicleId1: id, additionalVehicleId2: null };
    await createDriver(client, id, payload);
    expect(q.insert).toHaveBeenCalledWith(expect.objectContaining({ vehicle_id: id, additional_vehicle_id_1: id, additional_vehicle_id_2: null }));
    await updateDriver(client,id,id,{ additionalVehicleId1:null });
    expect(q.update).toHaveBeenCalledWith(expect.objectContaining({ vehicle_id: undefined, additional_vehicle_id_1:null, additional_vehicle_id_2:undefined }));
    expect(q.eq).toHaveBeenCalledWith("company_id",id);
  });
});

