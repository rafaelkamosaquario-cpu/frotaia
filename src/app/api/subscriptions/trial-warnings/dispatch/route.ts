import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsappText } from "@/lib/whatsapp/zapiClient";
import { isWhatsappConfigured } from "@/lib/whatsapp/config";
import { listarTestesParaAvisar, marcarAvisoTrialEnviado } from "@/services/supabase/subscriptionService";
import { listChannelsForCompany } from "@/services/supabase/channelIdentityService";

/**
 * Job de disparo dos avisos de teste grátis (Fase 5 do fluxo de pagamento)
 * — mesmo padrão de /api/alerts/dispatch e /api/news/dispatch: rota
 * protegida por token, chamada por um cron externo (Railway "Cron Job",
 * 1x/dia). Manda aviso no 5º dia do teste e no último dia (24h antes de
 * vencer), sem repetir — cada tipo de aviso só é marcado como enviado
 * depois de pelo menos 1 envio bem-sucedido pra aquela empresa.
 */

const MENSAGEM_DIA5 =
  "Já se passaram 5 dias do seu teste grátis do Frota IA — faltam 2 dias. Se estiver gostando, é só responder \"quero assinar\" quando quiser continuar sem interrupção.";
const MENSAGEM_ULTIMO_DIA =
  "Hoje é o último dia do seu teste grátis do Frota IA. Pra continuar usando amanhã, responda \"quero assinar\" que eu te mostro os planos.";

function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export async function GET(request: Request) {
  const secret = process.env.TRIAL_WARNINGS_DISPATCH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "TRIAL_WARNINGS_DISPATCH_SECRET não configurado." }, { status: 503 });
  }

  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!tokensMatch(token, secret)) {
    return NextResponse.json({ error: "Token inválido." }, { status: 401 });
  }

  if (!isWhatsappConfigured()) {
    return NextResponse.json({ error: "WhatsApp não configurado." }, { status: 503 });
  }

  const admin = createAdminClient();
  const testes = await listarTestesParaAvisar(admin);

  let enviados = 0;
  let falhas = 0;

  for (const teste of testes) {
    const canais = await listChannelsForCompany(admin, teste.company_id);
    const numeros = [...new Set(canais.filter((c) => c.channel_type === "whatsapp" && c.phone_e164).map((c) => c.phone_e164 as string))];
    if (numeros.length === 0) continue;

    const precisaDia5 = !teste.trial_avisado_dia5 && !!teste.trial_iniciado_em && new Date(teste.trial_iniciado_em).getTime() <= Date.now() - 5 * 24 * 60 * 60 * 1000;
    const precisaUltimoDia = !teste.trial_avisado_ultimo_dia && !!teste.valido_ate && new Date(teste.valido_ate).getTime() <= Date.now() + 24 * 60 * 60 * 1000;

    let dia5Enviado = false;
    let ultimoDiaEnviado = false;

    for (const numero of numeros) {
      try {
        if (precisaDia5) {
          await sendWhatsappText(numero, MENSAGEM_DIA5);
          dia5Enviado = true;
        }
        if (precisaUltimoDia) {
          await sendWhatsappText(numero, MENSAGEM_ULTIMO_DIA);
          ultimoDiaEnviado = true;
        }
        enviados += 1;
      } catch (erro) {
        console.error(`[trial-warnings-dispatch] falha ao enviar para ${numero}:`, erro);
        falhas += 1;
      }
    }

    if (dia5Enviado) await marcarAvisoTrialEnviado(admin, teste.company_id, "dia5");
    if (ultimoDiaEnviado) await marcarAvisoTrialEnviado(admin, teste.company_id, "ultimoDia");
  }

  return NextResponse.json({ ok: true, verificados: testes.length, enviados, falhas });
}
