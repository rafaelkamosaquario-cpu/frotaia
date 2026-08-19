import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsappText } from "@/lib/whatsapp/zapiClient";
import { isWhatsappConfigured } from "@/lib/whatsapp/config";
import {
  listDriversDueForChecklist,
  createChecklistDispatch,
  listChecklistItemKeysByCompany,
  CHECKLIST_ITEM_LABELS,
} from "@/services/supabase/checklistDispatchService";
import { getVehicle } from "@/services/supabase/vehicleService";

/**
 * Job de disparo do checklist diário (Fase 6 do plano de unificação V1+V2,
 * ampliado no Checklist V2 — B.2) — mesmo padrão de /api/alerts/dispatch e
 * /api/news/dispatch: rota protegida por token, chamada por um cron externo
 * ao processo do Next.js. Diferente das outras 3 rotas de dispatch, esta
 * precisa rodar em intervalos curtos (ex.: a cada 15-30min, mesmo horário
 * do cron de alertas) em vez de 1x/dia fixo — `listDriversDueForChecklist`
 * já filtra por empresa+horário configurado, então rodar de novo antes da
 * hora simplesmente não acha ninguém elegível ainda (idempotente).
 * `curl -fsS "$APP_URL/api/checklists/dispatch?token=$CHECKLIST_DISPATCH_SECRET"`.
 *
 * Itens do checklist vêm de `company_preferences.checklist_item_keys`
 * (B.1) — sem editor de formulário livre, só as 4 chaves fixas
 * (`CHECKLIST_ITEM_LABELS`) que a empresa liga/desliga em Configurações.
 */

function montarTextoChecklist(nomeVeiculo: string, itemKeys: string[]): string {
  const itens = itemKeys.map((chave) => CHECKLIST_ITEM_LABELS[chave] ?? chave).join(", ");
  return `🔧 Checklist diário — ${nomeVeiculo}\n\nAntes de sair, confira: ${itens}.\n\nEstá tudo OK? Responda "OK" ou descreva o problema encontrado.`;
}

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
  const itemKeysPorEmpresa = await listChecklistItemKeysByCompany(admin, [...new Set(motoristas.map((m) => m.company_id))]);

  let enviados = 0;
  let falhas = 0;

  for (const motorista of motoristas) {
    if (!motorista.vehicle_id || !motorista.phone_e164) continue;

    try {
      const veiculo = await getVehicle(admin, motorista.vehicle_id);
      const nomeVeiculo = veiculo ? veiculo.name || veiculo.plate || "veículo" : "veículo";
      const itemKeys = itemKeysPorEmpresa.get(motorista.company_id) ?? ["oleo", "agua", "pneus", "luzes"];

      await createChecklistDispatch(admin, {
        companyId: motorista.company_id,
        driverId: motorista.id,
        vehicleId: motorista.vehicle_id,
      });

      await sendWhatsappText(motorista.phone_e164, montarTextoChecklist(nomeVeiculo, itemKeys));
      enviados += 1;
    } catch (erro) {
      console.error(`[checklist-dispatch] falha ao enviar para motorista ${motorista.id}:`, erro);
      falhas += 1;
    }
  }

  return NextResponse.json({ ok: true, elegiveis: motoristas.length, enviados, falhas });
}
