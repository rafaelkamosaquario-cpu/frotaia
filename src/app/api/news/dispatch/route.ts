import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsappText } from "@/lib/whatsapp/zapiClient";
import { isWhatsappConfigured } from "@/lib/whatsapp/config";
import { listCompaniesDueForNewsDigest, markNewsDigestSent } from "@/services/supabase/companyPreferencesService";
import { listChannelsForCompany } from "@/services/supabase/channelIdentityService";
import { gerarResumoNoticias } from "@/services/news/newsDigestService";
import { saveNewsDigest } from "@/services/supabase/newsDigestArchiveService";
import { logDispatchStart, logDispatchEnd, captureError } from "@/lib/observability/logger";

const ROTA = "/api/news/dispatch";

/**
 * Job de disparo do resumo diário de notícias do setor (opt-in — ver
 * `gerenciar-noticias-setor.ts`). Mesmo padrão de /api/alerts/dispatch:
 * rota protegida por token, chamada por um cron externo ao processo do
 * Next.js. Configuração recomendada no Railway: um segundo "Cron Job"
 * rodando 1x/dia (ex.: 07:00 America/Sao_Paulo), comando
 * `curl -fsS "$APP_URL/api/news/dispatch?token=$NEWS_DISPATCH_SECRET"`.
 *
 * O resumo é gerado UMA vez por execução (não por empresa) — o conteúdo é
 * notícia geral do setor, não específico da empresa, então gerar uma vez e
 * distribuir pra todo mundo elegível evita custo repetido de Claude/busca.
 */

function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export async function GET(request: Request) {
  const secret = process.env.NEWS_DISPATCH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "NEWS_DISPATCH_SECRET não configurado." }, { status: 503 });
  }

  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!tokensMatch(token, secret)) {
    return NextResponse.json({ error: "Token inválido." }, { status: 401 });
  }

  if (!isWhatsappConfigured()) {
    return NextResponse.json({ error: "WhatsApp não configurado." }, { status: 503 });
  }

  const startedAt = logDispatchStart(ROTA);
  const admin = createAdminClient();
  const empresasDevidas = await listCompaniesDueForNewsDigest(admin);

  if (empresasDevidas.length === 0) {
    logDispatchEnd(ROTA, startedAt, { processados: 0, sucesso: 0, falha: 0 });
    return NextResponse.json({ ok: true, empresas: 0, enviados: 0, falhas: 0 });
  }

  const resumo = await gerarResumoNoticias().catch((erro) => {
    captureError({ event: "news_dispatch_geracao_falhou", route: ROTA, error: erro });
    return null;
  });

  if (!resumo) {
    logDispatchEnd(ROTA, startedAt, { processados: empresasDevidas.length, sucesso: 0, falha: empresasDevidas.length });
    return NextResponse.json({ error: "Não foi possível gerar o resumo de notícias agora." }, { status: 502 });
  }

  // Fase 11 do plano de unificação V1+V2: persiste pro painel poder mostrar "notícias de hoje" sem precisar gerar de novo. Best-effort — falha aqui não deve impedir o envio real pelo WhatsApp.
  await saveNewsDigest(admin, resumo).catch((erro) => captureError({ event: "news_dispatch_persistencia_falhou", route: ROTA, error: erro }));

  let enviados = 0;
  let falhas = 0;

  for (const empresa of empresasDevidas) {
    const canais = await listChannelsForCompany(admin, empresa.company_id);
    const numeros = [...new Set(canais.filter((c) => c.channel_type === "whatsapp" && c.phone_e164).map((c) => c.phone_e164 as string))];

    if (numeros.length === 0) {
      continue;
    }

    let algumEnviado = false;
    for (const numero of numeros) {
      try {
        await sendWhatsappText(numero, resumo);
        enviados += 1;
        algumEnviado = true;
      } catch (erro) {
        captureError({ event: "news_dispatch_envio_falhou", route: ROTA, company_id: empresa.company_id, error: erro });
        falhas += 1;
      }
    }

    if (algumEnviado) {
      await markNewsDigestSent(admin, empresa.company_id);
    }
  }

  logDispatchEnd(ROTA, startedAt, { processados: empresasDevidas.length, sucesso: enviados, falha: falhas });
  return NextResponse.json({ ok: true, empresas: empresasDevidas.length, enviados, falhas });
}
