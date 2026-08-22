# Frota IA — Infraestrutura de Produção

**Atualizado em:** 2026-08-22
**Objetivo:** documentar tudo que o Frota IA Assistente usa por fora do código (contas, serviços, domínios, segredos) para funcionar em produção — e o que quebra se algum desses pontos mudar. Criado depois de um incidente real: renomear o serviço no Railway mudou o domínio público e derrubou o login (ver seção 6).

## 1. Visão geral

```
Cliente (WhatsApp)  ──▶  Z-API  ──▶  Railway (app Next.js)  ──▶  Supabase (banco + auth)
Cliente (painel web) ──▶  Railway (app Next.js, login Google) ──▶  Supabase
                                        │
                                        ├─▶ Anthropic Claude API (cérebro da IA)
                                        ├─▶ Google Maps Platform (rotas/geocoding)
                                        ├─▶ Google Calendar API (agenda, por usuário)
                                        ├─▶ OpenAI (transcrição de áudio do WhatsApp)
                                        └─▶ Mercado Pago (assinatura)
```

Um único serviço Next.js atende os dois canais (WhatsApp e painel web) e é a única coisa exposta publicamente. Tudo mais (Supabase, Z-API, Claude, Google, Mercado Pago) são serviços externos falados só pelo backend.

## 2. Railway

- **Projeto**: `frotaiaassistente` (id `dcec4fb7-ff7c-41af-a469-700d1bcd8b7b`)
- **Serviço principal**: `frota-ia-assistente` (id `30e995fb-ccc6-4156-99cd-ef99736f354a`) — o app Next.js completo (WhatsApp webhook + painel + API). Source: `github.com/rafaelkamosaquario-cpu/frotaia`, branch `claude/frota-ia-assistente-setup-qlrbac`.
- **Serviços de cron** (cada um é um "Cron Job" do Railway, configurado manualmente no dashboard — não existe no código/repositório):

| Serviço | Agenda | Chama | Autenticado por |
|---|---|---|---|
| `frotaia-alertas-cron` | a cada 5 min | `/api/alerts/dispatch` | `ALERTS_DISPATCH_SECRET` |
| `frotaia-noticias-cron` | 1x/dia, 10:00 UTC (07:00 Brasília) | `/api/news/dispatch` | `NEWS_DISPATCH_SECRET` |
| `frotaia-trial-avisos-cron` | 1x/dia, 12:00 UTC (09:00 Brasília) | `/api/subscriptions/trial-warnings/dispatch` | `TRIAL_WARNINGS_DISPATCH_SECRET` |

  Cada cron é um serviço Railway **separado** do principal — logo tem sua **própria cópia** das variáveis de ambiente. O mesmo segredo (ex.: `NEWS_DISPATCH_SECRET`) precisa ter o **valor idêntico** no serviço principal (que valida) e no serviço de cron (que envia) — já causou 401 por dessincronia mais de uma vez (ver histórico em `docs/FROTA_IA_CRONS_AUTOMACOES.md`).

  **Atenção**: o comando de cada cron (`curl ... https://<domínio>/api/...`) tem o domínio **fixo dentro do comando** (`startCommand` do serviço, configurado manualmente no Railway) — não é lido de `APP_URL`. Em 2026-08-22, renomear o serviço principal quebrou os 3 crons ao mesmo tempo, porque todos apontavam pro domínio antigo (`frota-ia-assistente-production.up.railway.app`), já desativado. Corrigido apontando os 3 para `frotaia.up.railway.app`. **Sempre que o domínio público mudar, os 3 `startCommand` de cron precisam ser atualizados manualmente também** — não é automático.

  Existe um 4º endpoint de dispatch, `/api/freight/expire-dispatch` (Radar de Fretes), documentado em `.env.example` mas **sem cron configurado no Railway ainda** — pendência aberta.

### Domínios do serviço principal (checado em 2026-08-22)

- **Domínio Railway**: `frotaia.up.railway.app` (renomeado; o domínio antigo `frota-ia-assistente-production.up.railway.app` **não existe mais** — dá 404. Renomear o serviço no Railway muda o domínio gerado automaticamente, não é só cosmético.)
- **Domínio próprio**: `frotaia.app.br` (custom domain cadastrado no Railway; DNS aponta via CNAME no registro.br). O subdomínio `www.frotaia.app.br` **não está** cadastrado no momento — Rafael havia tentado configurá-lo separadamente, ficou pendente/removido.
- Link do painel de gestão: **`https://frotaia.up.railway.app/frota/dashboard`** (a raiz `/` é uma tela de chat simples, não é o painel).

## 3. Supabase

- **Projeto**: `frotaia` (ref `kqquswdrtcqicyfcvvuv`, região `us-east-1`, plano Pro)
- Guarda: identidade (`auth.users`, `profiles`, `companies`, `company_members`), dados operacionais (veículos, motoristas, despesas, checklists, alertas...), memória da IA, e metadados de conexão do Google (nunca o token — isso vai pro Supabase Vault).
- **Auth → Providers → Google**: Client ID/Secret do Google cadastrados só no painel do Supabase (nunca no código/env do Next.js).
- **Auth → URL Configuration → Redirect URLs**: lista de permissão de para onde o Supabase pode devolver o usuário depois do login. **Precisa conter o domínio público atual do app** (`https://frotaia.up.railway.app/**`, e `https://frotaia.app.br/**` se o domínio próprio for usado para login). Se o domínio do app mudar (rename de serviço, troca de domínio próprio) e essa lista não for atualizada, o login com Google quebra com erro depois de voltar do Google — foi exatamente o que aconteceu em 2026-08-22.

## 4. Google Cloud (1 projeto, 1 OAuth Client, dois usos)

Mesmo Client ID/Secret serve para dois fluxos diferentes — os dois precisam estar cadastrados como redirect URI autorizado no mesmo OAuth Client:

1. **Login do painel** (via Supabase Auth): redirect URI = `https://kqquswdrtcqicyfcvvuv.supabase.co/auth/v1/callback` (fixo, não muda com o domínio do app).
2. **Google Calendar** (OAuth direto, por fora do Supabase Auth, para ter refresh token de longa duração): redirect URI = `${APP_URL}/auth/calendar/callback`. **Esse aqui muda se `APP_URL` mudar** — precisa ser atualizado no Google Cloud Console toda vez que o domínio público mudar.
3. **Google Maps Platform**: chave de API separada (não é OAuth), só para Geocoding API + Routes API (`GOOGLE_MAPS_API_KEY`).

## 5. Z-API (WhatsApp)

- Instância própria do Frota IA (`frotaia-production`), número dedicado `41997454382` — isolada da instância do ZapFlow (outro produto).
- Webhook configurado no painel do Z-API apontando para `${APP_URL}/api/whatsapp/webhook?token=<WHATSAPP_WEBHOOK_SECRET>`. **Também depende de `APP_URL`/domínio público** — se o domínio mudar sem atualizar o webhook no Z-API, mensagens do WhatsApp param de chegar.

## 6. O que quebra quando o domínio público muda (lição de 2026-08-22)

Rafael renomeou o serviço Railway de `frota-ia-assistente` para `frotaia`, o que trocou o domínio gerado automaticamente. Pontos que dependem desse domínio e precisam ser conferidos/atualizados manualmente sempre que isso acontecer de novo:

| O que depende do domínio | Onde mora | O que quebra se não atualizar |
|---|---|---|
| `APP_URL` (env var, serviço principal) | Painel Railway → Variables | Links assinados enviados por WhatsApp (conectar Agenda, vincular painel) continuam apontando pro domínio antigo |
| Redirect URLs | Painel Supabase → Auth → URL Configuration | Login com Google quebra depois de voltar do Google (foi o que aconteceu hoje) |
| `GOOGLE_CALENDAR_REDIRECT_URI` (env var) + redirect URI no Google Cloud Console | Painel Railway + Google Cloud Console | Conectar Google Calendar quebra |
| Webhook do Z-API | Painel Z-API (app.z-api.io) | WhatsApp para de receber mensagens |
| `NEXT_PUBLIC_...`/manifest (`start_url`) | já é relativo, não usa domínio fixo | Não quebra — não depende do domínio |

**Recomendação prática**: evitar renomear o serviço Railway depois que o domínio próprio (`frotaia.app.br`) estiver 100% funcionando — usar sempre o domínio próprio como referência fixa (`APP_URL`, redirect URLs, webhook) em vez do subdomínio `*.up.railway.app`, que muda se o serviço for renomeado.

## 7. Variáveis de ambiente — resumo por categoria

Nomes conferidos no serviço principal em 2026-08-22 (valores não são lidos por segurança, só nomes):

- **IA**: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (transcrição de áudio)
- **Supabase**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
- **Google**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`, `GOOGLE_CALENDAR_ENCRYPTION_KEY`, `GOOGLE_MAPS_API_KEY`
- **WhatsApp**: `ZAPI_INSTANCE_ID`, `ZAPI_INSTANCE_TOKEN`, `ZAPI_CLIENT_TOKEN`, `WHATSAPP_WEBHOOK_SECRET`
- **Crons/dispatch**: `ALERTS_DISPATCH_SECRET`, `NEWS_DISPATCH_SECRET`, `TRIAL_WARNINGS_DISPATCH_SECRET` (+ `CHECKLIST_DISPATCH_SECRET`, `FREIGHT_EXPIRE_DISPATCH_SECRET` — dispatch de checklist e radar de fretes, ver `docs/FROTA_IA_CRONS_AUTOMACOES.md`)
- **Pagamento**: `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`
- **App**: `APP_URL`, `CUSTOMER_PANEL_ENABLED`, `ADMIN_PANEL_ENABLED`
- **Auto-geradas pelo Railway** (não mexer): `RAILWAY_PUBLIC_DOMAIN`, `RAILWAY_PRIVATE_DOMAIN`, `RAILWAY_STATIC_URL`, `RAILWAY_PROJECT_ID`, `RAILWAY_SERVICE_ID`, etc.

Descrição completa de cada uma (o que é, onde pegar, como gerar) está em `.env.example`, na raiz do projeto.

## 8. Referência cruzada

- Modelo de dados/RLS do Supabase: `docs/camada-3-supabase.md`
- Google Calendar (OAuth, Vault): `docs/camada-4-google-calendar.md`
- WhatsApp/Z-API: `docs/camada-5-whatsapp-zapi.md`
- V1 centrada no WhatsApp, feature flags do painel: `docs/camada-6-whatsapp-v1.md`
- Auditoria detalhada dos 4 crons (autenticação, idempotência, riscos): `docs/FROTA_IA_CRONS_AUTOMACOES.md`
