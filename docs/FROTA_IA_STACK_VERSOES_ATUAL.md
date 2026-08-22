# Frota IA — Stack, Versões e Variáveis de Ambiente (estado atual)

Branch `claude/frota-ia-assistente-setup-qlrbac`, commit `a4205419165f15a62a5dd815541fef2ce3153e84`, auditado em 2026-08-22. Fonte: `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`, `.env.example`, grep de `process.env.` em `src/`.

## 1. Dependências principais

| Tecnologia | Pacote | Versão declarada | Versão resolvida |
|---|---|---|---|
| Framework | `next` | `16.2.10` | `16.2.10` |
| UI | `react` | `19.2.4` | `19.2.4` |
| UI | `react-dom` | `19.2.4` | `19.2.4` |
| Linguagem | `typescript` (dev) | `^5` | `5.9.3` |
| Backend/DB | `@supabase/supabase-js` | `^2.110.8` | `2.110.8` |
| Backend/DB | `@supabase/ssr` | `^0.12.3` | `0.12.3` |
| IA (Claude) | `@anthropic-ai/sdk` | `^0.115.0` | `0.115.0` |
| CSS | `tailwindcss` (dev) | `^4` | `4.3.3` |
| CSS | `@tailwindcss/postcss` (dev) | `^4` | `4.3.3` |
| Validação | `zod` | `^4.4.3` | `4.4.3` |
| PDF | `pdf-lib` | `^1.17.1` | `1.17.1` |
| Planilha | `exceljs` | `^4.4.0` | `4.4.0` |
| Ícones | `lucide-react` | `^1.25.0` | `1.25.0` |
| Tema | `next-themes` | `^0.4.6` | `0.4.6` |
| Utilitário CSS | `clsx` | `^2.1.1` | `2.1.1` |
| Utilitário CSS | `tailwind-merge` | `^3.6.0` | `3.6.0` |
| RSC marker | `server-only` | `^0.0.1` | `0.0.1` |
| Testes | `vitest` (dev) | `^4.1.10` | `4.1.10` |
| Lint | `eslint` (dev) | `^9` | `9.39.5` |
| Lint Next | `eslint-config-next` (dev) | `16.2.10` | `16.2.10` |

**OpenAI e Google**: não há pacote `openai` nem `googleapis` em `package.json`/lockfile. As integrações (transcrição de áudio via `src/lib/openai/whisperClient.ts`, Google Calendar/Maps via `src/lib/google/*`) são feitas por `fetch` HTTP direto, sem SDK dedicado — não é uma dependência ausente por engano, é uma escolha de implementação.

**Versão do Node**: NÃO FOI POSSÍVEL CONFIRMAR PELO REPOSITÓRIO ATUAL — sem `engines` em `package.json`, sem `.nvmrc`, sem `nixpacks.toml`/`Dockerfile`/`railway.json` na raiz.

## 2. Modelos de IA exatos

| Uso | Identificador exato | Onde | Origem |
|---|---|---|---|
| Chat/tools (motor principal) | `"claude-sonnet-5"` | `src/lib/anthropic/client.ts:4` (`export const CLAUDE_MODEL = "claude-sonnet-5";`) | **Hardcoded**, não vem de env var, sem fallback |
| Transcrição de áudio (WhatsApp) | `"gpt-4o-mini-transcribe"` | `src/lib/openai/whisperClient.ts:17` | Hardcoded |

## 3. `next.config.ts` / `tsconfig.json`

`next.config.ts` (arquivo inteiro, 11 linhas): só fixa `turbopack.root`, sem `redirects`/`headers`/`rewrites`.

`tsconfig.json`: `target: ES2017`, `strict: true`, `moduleResolution: bundler`, `jsx: react-jsx`, alias `"@/*": ["./src/*"]`.

## 4. Variáveis de ambiente (sem valores)

### IA
| Variável | Finalidade | Obrigatória |
|---|---|---|
| `ANTHROPIC_API_KEY` | Motor de chat (Claude, tool-use) | Sim — sem ela, `/api/chat` responde 503 |
| `OPENAI_API_KEY` | Transcrição de áudio do WhatsApp | Não — sem ela, o webhook explica a limitação |

### Supabase
| Variável | Finalidade | Obrigatória |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto (segura p/ navegador) | Sim |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave pública (segura p/ navegador) | Sim |
| `SUPABASE_SECRET_KEY` | Secret key — só backend | Sim (produção) |
| `SUPABASE_PROJECT_REF` | Referência p/ scripts/CLI | Só tooling |

### Google
| Variável | Finalidade | Obrigatória |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth (login via Supabase Auth + Calendar) | Para login Google e Calendar funcionarem |
| `GOOGLE_REDIRECT_URI` | Redirect do login via Supabase Auth | Idem |
| `GOOGLE_CALENDAR_REDIRECT_URI` | Redirect do OAuth próprio do Calendar | Para Calendar funcionar |
| `GOOGLE_CALENDAR_ENCRYPTION_KEY` | Assina `state` do OAuth + links seguros do WhatsApp | Para Calendar/vínculo funcionarem |
| `GOOGLE_MAPS_API_KEY` | Geocoding + Routes + Static Maps | Não — sem ela, `consultar_rota` explica a limitação |

### WhatsApp (Z-API)
| Variável | Finalidade | Obrigatória |
|---|---|---|
| `ZAPI_INSTANCE_ID` / `ZAPI_INSTANCE_TOKEN` | Instância própria do Frota IA | Sim, para o canal WhatsApp existir |
| `ZAPI_CLIENT_TOKEN` | Header de toda chamada de envio | Sim |
| `WHATSAPP_WEBHOOK_SECRET` | Autentica `/api/whatsapp/webhook` + assina link de vínculo de número | Sim |

### Crons/Dispatch
| Variável | Finalidade |
|---|---|
| `ALERTS_DISPATCH_SECRET` | Autentica `/api/alerts/dispatch` |
| `NEWS_DISPATCH_SECRET` | Autentica `/api/news/dispatch` |
| `TRIAL_WARNINGS_DISPATCH_SECRET` | Autentica `/api/subscriptions/trial-warnings/dispatch` |
| `FREIGHT_EXPIRE_DISPATCH_SECRET` | Autentica `/api/freight/expire-dispatch` |
| `CHECKLIST_DISPATCH_SECRET` | Autentica `/api/checklists/dispatch` — **usada no código mas ausente de `.env.example`** (divergência) |

### Pagamento
| Variável | Finalidade |
|---|---|
| `MERCADOPAGO_ACCESS_TOKEN` | Criar assinatura/pagamento — **usada no código mas ausente de `.env.example`** |
| `MERCADOPAGO_WEBHOOK_SECRET` | Validar webhook do Mercado Pago — **usada no código mas ausente de `.env.example`** |

### App geral / feature flags
| Variável | Finalidade | Default |
|---|---|---|
| `APP_URL` | URL pública, monta links seguros do WhatsApp | `http://localhost:3000` |
| `CUSTOMER_PANEL_ENABLED` | Libera rota `/` (chat de teste) e onboarding web para não-admin | `false` |
| `ADMIN_PANEL_ENABLED` | Definida em `src/lib/featureFlags.ts`, mas **não lida em nenhum outro lugar do código** — flag morta | `true` |

### Auto-geradas pelo Railway (não mexer)
`RAILWAY_PUBLIC_DOMAIN`, `RAILWAY_PRIVATE_DOMAIN`, `RAILWAY_STATIC_URL`, `RAILWAY_PROJECT_ID`, `RAILWAY_SERVICE_ID`, `RAILWAY_ENVIRONMENT*`, etc.

## 5. Divergências entre `.env.example` e código

1. `MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_WEBHOOK_SECRET` são lidas de fato (`src/lib/mercadopago/config.ts`) mas **não aparecem em nenhuma linha de `.env.example`**.
2. `CHECKLIST_DISPATCH_SECRET` é lida de fato (`src/app/api/checklists/dispatch/route.ts:42`) mas está ausente de `.env.example`, enquanto os outros 4 `*_DISPATCH_SECRET` estão documentados.

## 6. Testes

`vitest.config.mts` configurado (`environment: "node"`, `include: ["src/**/*.test.ts"]`). **26 arquivos de teste** encontrados (`*.test.ts`, nenhum `*.spec.ts`), cobrindo: 10 ferramentas de cálculo, onboarding (classificador de veículo + máquina de conversa), 4 rotas de dispatch/webhook, Google Calendar client, Mercado Pago client, matching de frete, validação de schemas, acesso ao painel. Scripts: `npm run test` (`vitest run`), `npm run test:watch`.
