import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { settlementSchema } from "@/lib/frota/settlement";
import { sameOrigin } from "@/lib/frota/consultancy";

export async function POST(request: Request) {
  if(!sameOrigin(request)) return NextResponse.json({error:"Origem inválida."},{status:403});
  const access = await loadFleetPanelAccess(await createClient());
  if (!access.ok) return NextResponse.json({error:"Sem acesso."},{status:access.reason==="unauthenticated"?401:403});
  if (!["owner","admin","operator"].includes(access.role)) return NextResponse.json({error:"Sem permissão para baixa."},{status:403});
  const parsed = settlementSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({error:"Confira situação, data e justificativa.",details:parsed.error.issues},{status:400});
  const v=parsed.data;
  const db=createAdminClient();
  if (v.kind==="expenses") {
    const linked = await db.from("cost_entries").select("id").eq("company_id",access.company.id).eq("expense_id",v.id).limit(1);
    if (linked.error) return NextResponse.json({error:"Não foi possível conferir o vínculo."},{status:500});
    if (linked.data?.length) return NextResponse.json({error:"Faça esta baixa em Custos e remunerações para preservar adiantamentos e recibos."},{status:409});
  }
  const result = await db.from(v.kind).update({
    settlement_status:v.status,settled_on:v.date,settlement_note:v.note,settlement_updated_by:access.userId,
  }).eq("company_id",access.company.id).eq("id",v.id).eq("settlement_version",v.version).select("*").maybeSingle();
  if (result.error) return NextResponse.json({error:"Não foi possível salvar a baixa."},{status:500});
  if (!result.data) return NextResponse.json({error:"Registro indisponível ou atualizado por outra pessoa. Atualize a página."},{status:409});
  return NextResponse.json({record:result.data},{headers:{"Cache-Control":"private, no-store"}});
}
