import { z } from "zod";

export const groupPurpose = { abastecimento: "Abastecimento", pesagem: "Pesagem", lancamentos: "Lançamentos diversos" } as const;
export const operationalGroupCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), id: z.uuid(), name: z.string().trim().min(2).max(100), purpose: z.enum(["abastecimento", "pesagem", "lancamentos"]), notes: z.string().trim().max(500) }).strict(),
  z.object({ action: z.literal("archive"), id: z.uuid(), archived: z.boolean() }).strict(),
]);
export type OperationalGroup = { id: string; name: string; purpose: keyof typeof groupPurpose; notes: string; archived: boolean; created_at: string; updated_at: string };
