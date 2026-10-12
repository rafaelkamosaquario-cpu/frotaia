import { z } from "zod";
import type { GroupObservation } from "./groupObservation";

export const groupReviewCommand = z.object({
  observationId: z.string().uuid(),
  recordType: z.enum(["fuel", "revenue"]),
  recordId: z.string().uuid(),
  confirmed: z.literal(true),
  note: z.string().trim().min(5).max(500),
}).strict();
export type ReviewRecord = { id: string; type: "fuel" | "revenue"; label: string; vehicleId: string | null };
export function observationStage(event: GroupObservation) {
  if (event.fuel_fillup_id || event.revenue_id) return { index: 3, label: "Registrado · lançamento vinculado", tone: "success" };
  if (event.status === "processing") return { index: 0, label: "Recebido · aguardando interpretação", tone: "neutral" };
  if (event.status === "unreadable") return { index: 1, label: "Revisar original · leitura incompleta", tone: "warning" };
  return { index: 2, label: "Interpretado · aguardando conferência", tone: "warning" };
}
