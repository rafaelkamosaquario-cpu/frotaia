import { z } from "zod";

export type NfcTag = {
  id: string; company_id: string; vehicle_id: string | null;
  kind: "vehicle" | "pump"; label: string; physical_code: string;
  token: string; status: "pending" | "tested" | "revoked";
  version: number; created_by: string; created_at: string; updated_at: string;
};
export const nfcCommand = z.discriminatedUnion("action", [
  z.object({companyId: z.string().uuid(), action: z.literal("create"), kind: z.enum(["vehicle", "pump"]),
    vehicleId: z.string().uuid().nullable(), label: z.string().trim().min(2).max(100),
    physicalCode: z.string().trim().max(100)}).strict().refine(
      b => (b.kind === "vehicle") === (b.vehicleId !== null), "Vínculo de veículo inválido."),
  z.object({companyId: z.string().uuid(), action: z.enum(["tested", "revoke"]), id: z.string().uuid(), version: z.number().int().positive()}).strict(),
]);
export function nfcPath(token: string) { return `/nfc/${encodeURIComponent(token)}`; }
export function tagCanTransition(status: NfcTag["status"], action: "tested" | "revoke") {
  return status !== "revoked" && (action === "revoke" || status === "pending");
}
