import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { readCostEntry } from "@/services/supabase/costAdvanceService";
import { generateSalaryReceipt } from "@/services/documents/salaryReceipt";

export async function GET(request: Request) {
  const auth = await loadFleetPanelAccess(await createClient());
  if (!auth.ok) return Response.json({ error: "Sem acesso ao painel." }, { status: auth.reason === "unauthenticated" ? 401 : 403 });
  if (!["owner", "admin", "operator"].includes(auth.role)) return Response.json({ error: "Sem permissão." }, { status: 403 });
  const parsed = z.uuid().safeParse(new URL(request.url).searchParams.get("id"));
  if (!parsed.success) return Response.json({ error: "Identificação inválida." }, { status: 400 });
  try {
    const db = createAdminClient();
    const entry = await readCostEntry(db, auth.company.id, parsed.data);
    if (!entry.expense_id || !entry.paid_on || entry.snapshot.category !== "salario") return Response.json({ error: "Registre o pagamento do salário antes de emitir o recibo." }, { status: 409 });
    let employee = { name: entry.snapshot.person, phone: null as string | null };
    if (entry.snapshot.driverId) {
      const { data, error } = await db.from("drivers").select("name,phone_e164").eq("company_id", auth.company.id).eq("id", entry.snapshot.driverId).maybeSingle();
      if (error) throw error;
      if (data) employee = { name: data.name, phone: data.phone_e164 };
    }
    const bytes = await generateSalaryReceipt({ company: auth.company, employee, entry });
    return new Response(Buffer.from(bytes), { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="recibo-salario-${entry.month}-${entry.id}.pdf"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    const code = (error as { code?: string }).code;
    return Response.json({ error: "Recibo indisponível. Confira o lançamento na empresa selecionada." }, { status: code === "PGRST116" ? 404 : 500 });
  }
}
