# Frota IA — Estado Atual

**Data da atualização:** 23/08/2026
**Branch:** `claude/frota-ia-assistente-setup-qlrbac`
**Commit:** `d836c93` — "fix: limpar valido_ate residual do trial ao ativar plano recorrente"

Este é o documento de referência rápida para futuras sessões (humanas ou Claude Code) sobre o estado comercial/técnico do Frota IA. Escrito a partir de auditoria direta do código atual, não de memória de conversas anteriores. Existem outros documentos em `/docs` com mais profundidade por tópico (ver seção 17) — este arquivo é o ponto de entrada que resume e aponta pra eles, evitando que alguém trabalhe com informação desatualizada.

---

## 1. Visão do produto

Frota IA é um assistente de IA (WhatsApp + painel web) para operadores de frete/frota no Brasil. Dois patamares comerciais hoje: **Individual** (autônomo, só WhatsApp) e **Gestão** (frota pequena/média, WhatsApp + Painel Web), mais um terceiro não-automatizado (**Empresas**, frota grande, venda direta).

## 2. Arquitetura

Next.js 16 (App Router) + TypeScript, Supabase (Postgres/Auth/RLS/Vault), Anthropic Claude, Z-API (WhatsApp), Railway (hosting), Mercado Pago (pagamentos). Deploy: `https://frotaia.up.railway.app`.

## 3. Onboarding V1 (WhatsApp, Individual)

Conversa determinística, uma pergunta por vez, sem formulário (`src/ai/whatsapp/onboardingConversation.ts`). Ordem confirmada no código:

```
nome → perfil → intenção → cidade → região → rota fixa (sim/não)
  → [rota principal, só se sim] → veículo (marca/modelo/ano, obrigatório)
  → placa (opcional) → configuração/eixos (obrigatória)
  → [composição, só cavalo/carreta] → carroceria/implemento
  → consumo médio (opcional) → conclusão + menu principal
```

Regras confirmadas:
- **1 usuário, 1 veículo** — banco tem constraint (`vehicles_one_active_per_company_idx`), não é só regra de conversa.
- **Google NUNCA faz parte do onboarding V1** — só é pedido sob demanda (`gerenciar_alerta`/`gerenciar_google_calendar`).
- Cliente existente não refaz onboarding (checagem de identidade antes de iniciar).
- O veículo criado aqui é reaproveitado como veículo 1 do Onboarding Gestão — sem duplicação.

## 4. Onboarding Gestão (Onboarding 2, Painel)

**Único** — mensal e anual usam exatamente o mesmo wizard (`isFleetPanelAccessAllowed` nunca leu `subscriptions.plan`, só `fleet_panel_included`+`status`/`valido_ate`).

Gate confirmado em `src/app/frota/layout.tsx`:
```
entitlement (loadFleetPanelAccess) → Google Calendar conectado (por EMPRESA, não por usuário)
  → fleet_onboarding_completed_at preenchido? → painel
```
Se faltar Calendar → `/frota-conectar-agenda`. Se faltar o wizard de ativação → `/frota-ativacao`. Wizard: confirma empresa/veículo existente → veículos adicionais → motoristas opcionais → checklist opcional → resumo → conclusão → dashboard.

**Limite de veículos** (`src/lib/frota/vehicleLimit.ts`, `getVehicleLimitForCompany`) — vem só do entitlement, nunca de campo informado manualmente:
- Sem painel: **1**
- Com painel: **10**

Imposto de forma redundante em 3 lugares: trigger `enforce_vehicle_limit_by_entitlement` (banco), `gerenciar-veiculo.ts` (IA), formulário do painel (`vehicleApiErrors.ts`).

## 5. Planos e preços (catálogo real, `src/lib/mercadopago/catalog.ts`)

Fonte única (`CATALOGO_OFERTAS`) — nomes de chave reais do enum `subscription_plan`:

| Chave | Nome comercial | Preço | Cobrança | Painel | Veículos |
|---|---|---|---|---|---|
| `MENSAL` | Frota IA Individual | R$79,90/mês | recorrente | não | 1 |
| `GESTAO_MENSAL` | Frota IA Gestão Mensal | R$99,90/mês | recorrente | sim | 10 |
| `ANUAL_PARCELADO` | Frota IA Gestão Anual (cartão) | R$838,80 (até 12x R$69,90) | única, 12 meses | sim | 10 |
| `ANUAL_PIX` | Frota IA Gestão Anual (Pix) | R$799,00 à vista | única, 12 meses | sim | 10 |

`TRIAL` e `EMPRESA` ficam fora do catálogo de autoatendimento (não são ofertas de checkout automático).

**Upsell**: Individual → Gestão Mensal é sempre **uma única assinatura** (`criarAssinaturaMensal({ plano: "GESTAO_MENSAL" })`) — nunca duas cobranças (79,90 + 20 não existe em lugar nenhum do código, é sempre um valor fechado de R$99,90).

**Ressalva confirmada**: "12x sem juros" não é controlado nem garantido pelo código — depende da configuração de taxas da própria conta Mercado Pago (`installments: 12` no Checkout Pro, sem controle sobre juros).

**Frota IA Empresas** — mais de 10 veículos, preço personalizado, venda comercial direta. `resolverIntencaoComercialLanding` confirmado nunca gera link de checkout pra Empresas. Sem checkout automático, sem cobrança por placa.

## 6. Checkout Mercado Pago

Refatorado (não reconstruído) em 23/08/2026. Preservado: `preapproval` (recorrente), `checkout/preferences` (única), validação HMAC (`x-signature`), reconsulta obrigatória na API Mercado Pago antes de aplicar qualquer coisa, tabelas `subscriptions`/`payment_events`/`trial_usage`, idempotência (`eventoPagamentoJaProcessado`).

Gate público `/assinar` (`src/app/assinar/`): exige token HMAC assinado (30 min, `checkoutLinkToken.ts`), não é checkout público solto, nunca aceita preço/plano confiável da URL — a action (`actions.ts`) sempre resolve tudo de novo via `CATALOGO_OFERTAS`, usando só a chave do plano escolhida na própria tela.

## 7. Landing → WhatsApp → Checkout

```
Landing → wa.me com mensagem fixa pré-preenchida → Frota IA reconhece
  (resolverIntencaoComercialLanding, interceptado ANTES da IA)
  → cliente novo: completa onboarding V1, intenção preservada no rascunho
  → cliente existente: recebe o link na hora, sem reabrir onboarding
  → link HMAC assinado → /assinar → Mercado Pago
```

A landing **nunca** aponta direto pra `/assinar`. Mensagens oficiais (reconhecidas por palavra-chave, nunca pelo preço mencionado no texto):
- Individual: *"Quero assinar o Frota IA Individual de R$79,90 por mês."*
- Gestão: *"Quero contratar o Frota IA Gestão anual."*
- Empresas: *"Quero conhecer o Frota IA Empresas para uma frota com mais de 10 veículos."*

Cliente existente nunca reabre onboarding, nunca duplica empresa/veículo (confirmado: intercept só roda depois que `customerContext.company` já existe).

## 8. Subscription e entitlement

```
pagamento aprovado (webhook) → subscriptions.status/fleet_panel_included
  → getVehicleLimitForCompany → acesso ao Painel quando Gestão
```

- Individual: `fleet_panel_included = false`, limite 1.
- Gestão (qualquer variante): `fleet_panel_included = true`, limite 10.
- Gate real: `isFleetPanelAccessAllowed` = `company.fleet_panel_enabled` (override manual legado, ainda existe, aditivo) **OU** `subscriptions.fleet_panel_included` (`src/services/supabase/fleetPanelAccess.ts`).
- Não é mais necessário liberar manualmente o painel pra assinatura Gestão paga corretamente — o webhook grava o entitlement sozinho (bug corrigido em 23/08, ver seção 6/9 do doc de checkout).

## 9. Correção `valido_ate` (RESOLVIDO, commit `d836c93`)

**Bug**: `criarAssinaturaTeste` grava `valido_ate` = TRIAL+7 dias. Ao converter pra plano recorrente (Individual/Gestão Mensal), o webhook nunca limpava esse campo (`validoAte: undefined` era omitido do PATCH pelo Supabase-js) — a data residual do trial ficava valendo mesmo com `status=ATIVA`, derrubando o acesso do cliente pago ~7 dias após o cadastro original.

**Correção**: no branch de assinatura recorrente do webhook, quando `statusMapeado === "ATIVA"`, agora grava `validoAte: null` explicitamente. Planos anuais não são afetados — continuam usando `valido_ate` normalmente (branch `payment`, +365 dias).

**Testes**: `src/services/supabase/subscriptionService.test.ts` (novo) + extensões em `src/app/api/payments/mercadopago/webhook/route.test.ts`.

## 10. Google / Calendar / Painel

- `google_integrations` indexado por **empresa** (`company_id`), não por usuário — confirmado em `googleIntegrationService.ts`. Uma conexão ativa por empresa (índice único parcial, migration `20260819130000_google_integrations_company_unique_active.sql`).
- Vínculo de identidade WhatsApp↔Google via ferramenta `vincular_painel` + rota `/auth/account/link` (token HMAC), reaproveitando `company_members` pra multiempresa — sem merge de `auth.users`.
- Calendar é **obrigatório** pra acessar o Painel (decisão confirmada do Rafael) — gate em `src/app/frota/layout.tsx`.

## 11. Segurança

Confirmado no código: HMAC do webhook Mercado Pago (`x-signature`), HMAC do token de `/assinar` (expira em 30 min, adulteração rejeitada — testado), reconsulta obrigatória na API do Mercado Pago antes de aplicar qualquer coisa, idempotência via `payment_events`, preço/entitlement sempre resolvidos do catálogo interno (nunca de payload/URL), cliente nunca informa dado de cartão pra IA (checkout sempre no domínio do Mercado Pago).

## 12. Testes (rodado em 23/08/2026, junto com este documento)

- **Testes**: 289 passando, 0 falhando (31 arquivos).
- **Typecheck** (`tsc --noEmit`): limpo.
- **Lint** (`eslint .`): limpo.
- **Build** (`next build`): sucesso, todas as rotas compiladas.

## 13. Fechado / Implementado

Verificado no código (não por suposição):

- Onboarding V1 (fluxo completo, 1 usuário + 1 veículo) — ✅
- Onboarding Gestão (único, mensal=anual) — ✅
- Veículo do V1 reaproveitado no Gestão, sem duplicação — ✅
- Limite 1 (sem painel) / 10 (com painel) — ✅, 3 camadas redundantes
- Checkout Individual (`MENSAL`) — ✅
- Checkout Gestão Mensal (upsell, uma única assinatura) — ✅
- Checkout Gestão Anual Cartão (`ANUAL_PARCELADO`) — ✅
- Checkout Gestão Anual Pix (`ANUAL_PIX`) — ✅
- Integração real com Mercado Pago (preapproval + checkout/preferences) — ✅
- Webhook com validação HMAC + reconsulta obrigatória — ✅
- Idempotência do webhook (payment e preapproval) — ✅
- Entitlement automático (pagamento → painel, sem liberação manual) — ✅
- Correção do bug `valido_ate` residual — ✅ (23/08, commit `d836c93`)
- Landing → WhatsApp (reconhecimento das 3 mensagens oficiais) — ✅
- Preservação de intenção comercial através do onboarding V1 — ✅
- Link seguro `/assinar` (HMAC, sem preço confiável da URL) — ✅
- Gate Google obrigatório antes do Painel — ✅
- Calendar por empresa (não por usuário) — ✅
- Painel V2 (dashboard, veículos, motoristas, despesas, manutenção, checklist, alertas, relatórios) — ✅
- Preservação de dados em cancelamento/expiração (confirmado: nenhum `.delete()` em `subscriptionService.ts`) — ✅

## 14. Aberto / Pendente

### Bloqueadores

Nenhum bloqueador conhecido no fluxo comercial atual.

### Importantes

1. **Chargeback/estorno de pagamento anual**: confirmado por grep (`refunded|chargeback|charged_back|reembols|estorn`) — **zero tratamento no código**. Se um pagamento único (Gestão Anual) for estornado depois de aprovado, o entitlement Gestão não é revogado automaticamente.
2. **Webhook do WhatsApp sem harness de teste de rota**: `src/app/api/whatsapp/webhook/route.ts` não tem teste de rota dedicado (só as peças puras que ele usa — `landingIntent.ts`, `catalog.ts` — têm). Risco médio de regressão silenciosa em mudanças futuras nesse arquivo.

### Melhorias

1. Sem aviso automático antes do vencimento do Gestão Anual (só TRIAL tem esse cron).
2. "12x sem juros" não é confirmável/garantido por código — depende da conta Mercado Pago, conferir manualmente antes de divulgar.

## 15. Roadmap futuro (V3, fora do escopo de venda atual)

Não são bloqueadores da versão atual — apenas itens de roadmap já conhecidos, se ainda constarem oficialmente em `docs/v2-gestao-de-frota-roadmap.md`: telemetria, rastreadores, TMS, ERP, pneus avançados, integrações maiores.

## 16. Decisões que NÃO devem ser revertidas

1. V1 continua WhatsApp-first.
2. Google não entra no onboarding V1.
3. Onboarding Gestão é único para mensal/anual.
4. Individual = 1 veículo.
5. Gestão = até 10 veículos.
6. Empresas = acima de 10 veículos, comercial, sem automação.
7. Individual = R$79,90/mês.
8. Gestão Mensal = R$99,90/mês.
9. Gestão Anual cartão = R$838,80 (até 12x R$69,90).
10. Gestão Anual Pix = R$799,00.
11. Upgrade Individual→Gestão vira uma única assinatura de R$99,90 (nunca duas cobranças).
12. Landing nunca acessa `/assinar` diretamente.
13. WhatsApp identifica o cliente antes do checkout.
14. Preço e entitlement vêm sempre do catálogo interno (`CATALOGO_OFERTAS`), nunca de payload/URL.
15. Pagamento Gestão libera entitlement automaticamente (sem liberação manual).
16. Dados não são apagados quando cliente perde entitlement (cancelamento/expiração é checagem ao vivo, não exclusão).
17. `valido_ate` deve ser `null` em assinatura recorrente `ATIVA` (Individual/Gestão Mensal) — planos anuais continuam usando `valido_ate` normalmente.
18. Plano Empresas não é automatizado.

---

## 17. Outros documentos em `/docs` (por tópico, mais detalhados)

- `FROTA_IA_CHECKOUT_MERCADOPAGO_ATUAL.md` — checkout/webhook em detalhe, inclui addendum do fix `valido_ate`.
- `FROTA_IA_ONBOARDING_V1_ATUALIZADO_2026-08-23.md` — Onboarding V1 em detalhe.
- `FROTA_IA_ONBOARDING_GESTAO_ATUAL.md` — Onboarding Gestão em detalhe (nota adicionada: enumeração de planos citada lá é anterior ao catálogo atual de 4 ofertas).
- `FROTA_IA_FLUXOS_V1_V2_ATUAL.md` — diagramas de fluxo.
- `FROTA_IA_RAIO_X_ATUAL_2026-08.md` — arquitetura/stack técnico.
- `FROTA_IA_STACK_VERSOES_ATUAL.md` — versões de dependências.
- `FROTA_IA_INFRAESTRUTURA_PRODUCAO.md` — Railway/Supabase/Google/Z-API.
- `FROTA_IA_AUDITORIA_28_TOOLS.md`, `FROTA_IA_AUDITORIA_RLS_MULTIEMPRESA.md`, `FROTA_IA_AUDITORIA_SYNC_V1_V2.md`, `FROTA_IA_CRONS_AUTOMACOES.md` — auditorias específicas mais antigas, ainda majoritariamente válidas (não tratam de comercial/checkout).
- `FROTA_IA_RAIO_X_V1_V2.md` e `FROTA_IA_FLUXOGRAMA_COMPLETO_V1_V2.md` — **marcados como histórico/deprecated** (19/08, anteriores ao redesenho de onboarding e à reestruturação comercial).
