import { z } from "zod";
export const observationCommand = z.object({ registryId: z.uuid(), action: z.enum(['activate','pause']) }).strict();
export type GroupBinding = {company_id:string;registry_id:string;external_id:string;enabled:boolean;activated_at:string;updated_at:string;updated_by:string};
export type GroupObservation = {id:string;company_id:string;registry_id:string;message_id:string;received_at:string;sender_name:string;kind:string;original_text:string;status:'processing'|'review'|'unreadable';summary:string;evidence:unknown};
export const observationEvidence = z.object({
 summary: z.string().max(1000),
 category: z.enum(['abastecimento','pesagem','frete','manutencao','outro']),
 plate: z.string().max(20).nullable(), driver: z.string().max(100).nullable(),
 date: z.string().max(30).nullable(), liters: z.number().nonnegative().nullable(),
 tonnes: z.number().nonnegative().nullable(), amountReais: z.number().nonnegative().nullable(),
 uncertainties: z.array(z.string().max(200)).max(10),
});
export const normalizedGroupName = (name:string) => name.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleUpperCase('pt-BR');
