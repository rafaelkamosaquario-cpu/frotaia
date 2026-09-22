import { expect, it, vi } from "vitest";
import { eventoPagamentoJaProcessado } from "./subscriptionService";
it("receipt audit logs are not completion markers", async () => {
  const q = { select: vi.fn(), eq: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn(async () => ({ data: null, error: null })) };
  q.select.mockReturnValue(q); q.eq.mockReturnValue(q); q.limit.mockReturnValue(q);
  expect(await eventoPagamentoJaProcessado({ from: () => q } as never, "pay", "approved")).toBe(false);
  expect(q.eq).toHaveBeenCalledWith("event_type", "processing_completed_v2");
});
