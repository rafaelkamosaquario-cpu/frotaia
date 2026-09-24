import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).transform(v => v || null).nullable();
export const freightCustomerSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, "Informe o nome do cliente.").max(160),
  legal_name: optionalText(200),
  cnpj: optionalText(18).refine(v => !v || /^\d{14}$/.test(v.replace(/\D/g, "")), "Informe os 14 dígitos do CNPJ ou deixe em branco.").transform(v => v ? v.replace(/\D/g, "") : null),
  address: optionalText(300), city: optionalText(100),
  state: optionalText(2).refine(v => !v || /^[A-Za-z]{2}$/.test(v), "Informe a UF com duas letras.").transform(v => v?.toUpperCase() ?? null),
  closing_day: z.number().int().min(1).max(31).nullable(),
  notes: optionalText(2000),
}).strict();
export type FreightCustomerInput = z.infer<typeof freightCustomerSchema>;
export type FreightCustomerRow = Omit<FreightCustomerInput, "id"> & { id: string; company_id: string; created_at: string; updated_at: string };

