import { z } from "zod";
const id = z.string().uuid();
export const accessCommand = z.discriminatedUnion("action", [
 z.object({action:z.literal("select"),company_id:id}).strict(),
 z.object({action:z.literal("accept"),invite_id:id}).strict(),
 z.object({action:z.literal("invite"),company_id:id,email:z.string().trim().toLowerCase().email().max(254),role:z.enum(["admin","operator","viewer"])}).strict(),
 z.object({action:z.enum(["revoke_invite","revoke_member"]),company_id:id,id}).strict(),
]);
export type AccessibleCompany={id:string;name:string;role:string};
export type PendingAccess={id:string;company_id:string;company_name:string;role:string;expires_at:string};
export type AccessOverview={companies:AccessibleCompany[];invites:PendingAccess[]};
export type AccessTeam={members:{id:string;user_id:string;email:string;role:string;status:string}[];invites:{id:string;email:string;role:string;expires_at:string}[]};
