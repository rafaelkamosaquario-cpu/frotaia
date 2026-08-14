import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsappText } from "@/lib/whatsapp/zapiClient";
import { isWhatsappConfigured } from "@/lib/whatsapp/config";
import { listDriversDueForChecklist, createChecklistDispatch } from "@/services/supabase/checklistDispatchService";
import { getVehicle } from "@/services/supabase/vehicleService";

/**
 * Job de disparo do checklist diário (Fase 6 do plano de unificação V1+V2)
 * — mesmo padrão de /api/alerts/dispatch e /api/news/dispatch: rota
 * protegida por token, chamada por um cron externo ao processo do
 * Next.js (segundo "Cron Job" no Railway, 1x/dia, ex.: 06:00 America/Sao_Paulo).
 * `curl -fsS "$APP_URL/api/checklists/dispatch?token=$CHECKLIST_DISPATCH_SECRET"`.
 *
 * Perguntas fixas em código por enquanto (pneu/freio/luz/combustível) —
 * mesma decisão já documentada na migration que criou `checklist_dispatches`
 * (Fase 1 da V2), sem tabela de template ainda.
 */

const TEXTO_CHECKLIST =
  "🔧 Checklist diário — {veiculo}\n\nAntes de sair, confira: pneus, freios, luzes e combustível.\n\nEstá tudo OK? Responda \"OK\" ou descreva o problema encontrado.";

function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export async function GET(request: Request) {
  const secret = process.env.CHECKLIST_DISPATCH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CHECKLIST_DISPATCH_SECRET não configurado." }, { status: 503 });
  }

  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!tokensMatch(token, secret)) {
    return NextResponse.json({ error: "Token inválido." }, { status: 401 });
  }

  if (!isWhatsappConfigured()) {
    return NextResponse.json({ error: "WhatsApp não configurado." }, { status: 503 });
  }

  const admin = createAdminClient();
  const motoristas = await listDriversDueForChecklist(admin);

  let enviados = 0;
  let falhas = 0;

  for (const motorista of motoristas) {
    if (!motorista.vehicle_id || !motorista.phone_e164) continue;

    try {
      const veiculo = await getVehicle(admin, motorista.vehicle_id);
      const nomeVeiculo = veiculo ? veiculo.name || veiculo.plate || "veículo" : "veículo";

      await createChecklistDispatch(admin, {
        companyId: motorista.company_id,
        driverId: motorista.id,
        vehicleId: motorista.vehicle_id,
      });

      await sendWhatsappText(motorista.phone_e164, TEXTO_CHECKLIST.replace("{veiculo}", nomeVeiculo));
      enviados += 1;
    } catch (erro) {
      console.error(`[checklist-dispatch] falha ao enviar para motorista ${motorista.id}:`, erro);
      falhas += 1;
    }
  }

  return NextResponse.json({ ok: true, elegiveis: motoristas.length, enviados, falhas });
}
