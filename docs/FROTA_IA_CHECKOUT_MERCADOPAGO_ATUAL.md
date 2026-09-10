# Frota IA — Checkout Mercado Pago (estado atual)

Branch `claude/frota-ia-assistente-setup-qlrbac`. Estrutura comercial atual (desde 2026-09-10): **Individual/Essencial/Pro**, substituindo a estrutura anterior "Individual vs. Gestão" (2026-08-23) — reaproveita 100% a infraestrutura de pagamento que já existia (webhook, validação HMAC, `subscriptions`); o que mudou foi o catálogo de ofertas.

## 1. Catálogo de ofertas

Fonte única: `src/lib/mercadopago/catalog.ts` (`CATALOGO_OFERTAS`) — nunca preço/entitlement hardcoded em outro lugar. 9 chaves de autoatendimento: 3 planos × 3 formas de cobrança cada.

| Plano | Veículos | Painel | Mensal | Anual à vista (Pix) | Anual 12x (cartão) |
|---|---|---|---|---|---|
| **Individual** | 1 | Não | R$ 89,90/mês (`INDIVIDUAL_MENSAL`) | R$ 899,00 (`INDIVIDUAL_ANUAL_PIX`) | 12x R$ 74,92 = R$ 899,00 (`INDIVIDUAL_ANUAL_PARCELADO`) |
| **Essencial** | Até 3 | Sim | R$ 149,90/mês (`ESSENCIAL_MENSAL`) | R$ 1.499,00 (`ESSENCIAL_ANUAL_PIX`) | 12x R$ 124,92 = R$ 1.499,00 (`ESSENCIAL_ANUAL_PARCELADO`) |
| **Pro** | Até 10 | Sim | R$ 249,90/mês (`PRO_MENSAL`) | R$ 2.499,00 (`PRO_ANUAL_PIX`) | 12x R$ 208,25 = R$ 2.499,00 (`PRO_ANUAL_PARCELADO`) |

**"12x sem juros" não é algo que o código controla nem confirma** — parcelamento é configurado via `installments` no Checkout Pro, mas se as parcelas saem com ou sem juros depende da configuração de taxas da própria conta Mercado Pago, invisível pra este repositório. Conferir visualmente na página de checkout gerada antes de divulgar como "sem juros".

Plano Empresa (mais de 10 veículos) continua **fora do catálogo de autoatendimento** — só contratação comercial direta, sem automação (ver `systemPrompt.ts`).

## 2. Seleção de plano (tier × frequência)

Não existe mais upsell inline (não há dois tiers só) — o gate (`/assinar`) mostra os 3 planos lado a lado, com um toggle Mensal/Anual e, quando Anual, a escolha entre cartão/Pix. O que sai do outro lado é sempre **uma única chamada** — `criarAssinaturaMensal` (mensal) ou `criarPagamentoAnual` (anual) — com a chave exata do catálogo (`plano: OfertaPlano`). O preço nunca é composto em runtime (ex.: "base + upsell") — cada uma das 9 combinações já tem seu `precoCentavos` fechado no catálogo.

## 3. O "gate de contratação" (`/assinar`)

Página pública nova, fora de `/frota` — **não exige login, Google nem Calendar**, é só uma etapa de resumo/confirmação antes do Mercado Pago, mobile-first.

```
WhatsApp (gerenciar_assinatura)
   ↓
link assinado (HMAC, 30 min) → /assinar?token=...
   ↓
resumo: escolhe o tier (Individual/Essencial/Pro) + Mensal/Anual + (se Anual) cartão/Pix
   ↓
confirmar → server action cria o checkout REAL no Mercado Pago
   ↓
redireciona pro Mercado Pago
```

**Segurança**: o token carrega só `companyId` + o plano que o cliente pediu na conversa (só um valor inicial de UI, não uma autorização). Preço e entitlement nunca vêm de parâmetro de URL — a action que cria o checkout (`src/app/assinar/actions.ts`) sempre resolve tudo de novo a partir de `CATALOGO_OFERTAS`, usando só a chave do plano (uma das 9 chaves) escolhida na própria página. Não existe um jeito de o cliente alterar a URL e pagar o preço do Individual recebendo o Pro — o valor cobrado e o entitlement liberado vêm sempre do mesmo lugar (o catálogo), nunca de dois lugares que possam divergir.

E-mail só é pedido quando o plano é recorrente (qualquer um dos 3 `*_MENSAL`) — os planos anuais (cobrança única) não pedem.

## 4. Mercado Pago — como é chamado

- **Recorrente** (`*_MENSAL`, qualquer tier): `POST /preapproval` — `external_reference` codifica `companyId|PLANO`.
- **Única** (`*_ANUAL_PIX`/`*_ANUAL_PARCELADO`, qualquer tier): `POST /checkout/preferences` — mesmo formato de `external_reference`. O método (Pix ou cartão) vem de `oferta.metodoUnico`, nunca de um parâmetro solto: Pix restringe `excluded_payment_types` pra outras formas; cartão pede `installments` (12, vindo do catálogo).
- **`back_urls`/`back_url`** agora apontam pra `/assinar/confirmacao?resultado=...&plano=...` (antes apontavam genericamente pra raiz do app) — página só de exibição, nunca decide nada (ver seção 7).

## 5. Webhook — 2 bugs corrigidos + idempotência

`src/app/api/payments/mercadopago/webhook/route.ts`. Preservado integralmente: validação HMAC (`x-signature`), sempre reconsulta a API do Mercado Pago antes de aplicar qualquer coisa (nunca confia só na notificação), log bruto em `payment_events`.

**Corrigido**:
1. `atualizarAssinaturaPorPagamento` **nunca gravava `fleet_panel_included`** — por isso pagar não liberava o painel antes desta mudança. Agora grava sempre, resolvido a partir de `CATALOGO_OFERTAS[plano].painel`.
2. O evento de assinatura (`preapproval`/`subscription_preapproval`) gravava `plan: "MENSAL"` **fixo**, ignorando o plano real do `external_reference` — corrigido pra usar o plano decodificado (`MENSAL` ou `GESTAO_MENSAL`).

**Idempotência reforçada**: antes de reaplicar uma atualização de assinatura, o webhook checa se já existe um evento igual (mesmo `mercadopago_payment_id` + mesmo status) em `payment_events` (`eventoPagamentoJaProcessado`, novo em `subscriptionService.ts`) — reentrega da mesma notificação continua sendo logada (auditoria), mas não reaplica `valido_ate`/status de novo.

## 6. Entitlement — como fica depois do webhook

| Evento | `plan` gravado | `fleet_panel_included` | `status` |
|---|---|---|---|
| Individual pago (mensal) | `INDIVIDUAL_MENSAL` | `false` | `ATIVA` |
| Essencial/Pro pago (mensal) | `ESSENCIAL_MENSAL`/`PRO_MENSAL` | `true` | `ATIVA` |
| Qualquer tier, anual cartão pago | `*_ANUAL_PARCELADO` | conforme o tier | `ATIVA`, `valido_ate` = +365 dias |
| Qualquer tier, anual Pix pago | `*_ANUAL_PIX` | conforme o tier | `ATIVA`, `valido_ate` = +365 dias |
| Assinatura recorrente cancelada/pausada | (mantém) | `false` | `CANCELADA`/`INADIMPLENTE` |

O **limite de veículos (1/3/10 conforme o tier)** vem de `getVehicleLimitForCompany` (`src/lib/frota/vehicleLimit.ts`) — desde 09/2026 deriva diretamente de `CATALOGO_OFERTAS[subscription.plan].limiteVeiculos` quando `plan` é uma das 9 chaves novas (cobre o caso Essencial=3, que o antigo booleano `fleet_panel_included` não distinguia de Pro=10), com fallback pro binário 1×10 pras chaves antigas/TRIAL/EMPRESA. O trigger de banco `enforce_vehicle_limit_by_entitlement` (última linha de defesa) foi generalizado do mesmo jeito na mesma sessão (migration `20260910100100`).

`companies.fleet_panel_enabled` (flag legada, manual) continua existindo só como **override administrativo** — nunca é escrita pelo fluxo de pagamento, só por SQL direto quando necessário excepcionalmente.

## 7. Onboarding 2 — como o pagamento libera o direito

Pagar a Gestão **não conclui** o Onboarding 2 sozinho — só libera o **direito** de acessá-lo. O caminho depois do pagamento continua exatamente o mesmo de antes desta tarefa (não alterado):

```
entitlement (fleet_panel_included=true)
   ↓
login Google
   ↓
Google Calendar obrigatório
   ↓
/frota-ativacao (Onboarding 2)
   ↓
Dashboard
```

A tela de confirmação (`/assinar/confirmacao`) nunca gera um link de `vincular_painel` diretamente — isso exigiria reproduzir lógica sensível de identidade fora do contexto autenticado do WhatsApp, o que o pedido original explicitamente vetou ("não improvisar segurança"). Em vez disso, mostra um botão que abre o WhatsApp com a mensagem "ativar painel" pré-preenchida — o fluxo seguro de sempre assume dali.

## 8. Cancelamento / expiração / dados

Nenhuma rotina no código apaga veículo, motorista, despesa, documento, checklist ou memória em nenhuma circunstância de pagamento — cancelamento/expiração são só **checagem ao vivo** de `status`/`valido_ate` (mesmo mecanismo de antes, `isAccessAllowed`/`isFleetPanelAccessAllowed`), nunca exclusão. Se a empresa contratar de novo depois, os dados continuam todos lá.

**Lacuna real, não corrigida nesta tarefa**: não existe hoje nenhum aviso automático antes do vencimento do Gestão Anual (só o TRIAL tem esse job, `trial-warnings-cron`). Depois de 12 meses, o acesso simplesmente expira sem aviso prévio — documentando isso como pendência real, não fingindo que existe.

## 9. Compatibilidade com assinaturas antigas

Nenhuma linha existente de `subscriptions` foi alterada em nenhuma das reestruturações — todas as migrations desse enum são aditivas (`ADD VALUE`, nunca remove/renomeia). A reestruturação de 09/2026 (Individual/Essencial/Pro) foi feita com a tabela `subscriptions` **vazia** (zerada em 26/08 pra teste real, sem clientes pagantes) — as chaves antigas (`MENSAL`, `GESTAO_MENSAL`, `ANUAL_PARCELADO`, `ANUAL_PIX`) ficaram órfãs no enum do banco (Postgres não permite remover valor de enum), mas não são mais usadas por nenhuma chamada de código nem aparecem no catálogo TS (`OfertaPlano`).

## 10. Banco de dados

- `20260823162740_add_gestao_mensal_plan.sql` — valor `GESTAO_MENSAL` (histórico, chave hoje órfã).
- `20260910100000_add_planos_individual_essencial_pro.sql` — 9 valores novos no enum `subscription_plan` (Individual/Essencial/Pro × Mensal/Anual Pix/Anual cartão).
- `20260910100100_generalize_vehicle_limit_individual_essencial_pro.sql` — generaliza o trigger `enforce_vehicle_limit_by_entitlement` de binário (1×10) pra 3 níveis (1/3/10), derivado de `subscriptions.plan`.

Nenhuma coluna nova, nenhuma tabela nova.

## 11. Correção pós-lançamento: `valido_ate` residual do trial (23/08/2026, commit `d836c93`)

Achado numa auditoria comercial feita horas depois do lançamento desta refatoração: `criarAssinaturaTeste` grava `valido_ate` = +7 dias já no TRIAL; ao converter pra um plano **recorrente** (Individual/Gestão Mensal), o webhook nunca limpava esse campo — `atualizarAssinaturaPorPagamento` sempre recebia `validoAte: undefined`, e como o Supabase-js omite chaves `undefined` do PATCH, a coluna ficava intocada. Resultado: `isAccessAllowed`/`isFleetPanelAccessAllowed` caíam no ramo de comparação de data (em vez do ramo `status === "ATIVA"`), bloqueando o cliente pago ~7 dias após o cadastro original, apesar da assinatura estar `ATIVA` de verdade.

**Corrigido**: no branch de assinatura recorrente do webhook, quando `statusMapeado === "ATIVA"`, agora passa `validoAte: null` explicitamente — limpa o resíduo do trial. Planos anuais (cobrança única) não são afetados: continuam recebendo `validoAte` = +365 dias normalmente, vindo do branch `payment`. Testes de regressão em `subscriptionService.test.ts` e `webhook/route.test.ts`.

## 12. Landing → WhatsApp → `/assinar` (resolvido em 2026-08-23)

A landing **nunca linka direto pra `/assinar`** — sempre abre o WhatsApp (`wa.me`) com uma mensagem pré-preenchida fixa. O Frota IA reconhece essa mensagem de forma determinística (`src/lib/mercadopago/landingIntent.ts`, mesmo princípio de `ehPedidoDeAjuda`/`ehPedidoDeFuncionalidades` — interceptado antes da IA) e só então gera o link assinado de `/assinar`, já com o plano certo pré-selecionado — sem perguntar de novo o que a landing já decidiu.

```
Landing → wa.me com mensagem fixa → Frota IA reconhece a intenção
   → (cliente novo) completa o onboarding V1 normalmente, intenção
     preservada no rascunho → ao concluir, recebe o link
   → (cliente existente) recebe o link na hora
```

**Mensagens oficiais dos CTAs** (landing atual, 09/2026):
- Individual: `"Quero assinar o Frota IA Individual por R$89,90/mês."`
- Essencial: `"Quero contratar o Frota IA Essencial."`
- Pro: `"Quero contratar o Frota IA Pro."`
- Empresas: `"Quero conhecer o Frota IA Empresas para uma frota com mais de 10 veículos."`

O reconhecimento é por palavra-chave (`"individual"`/`"essencial"`/`"pro"` + `"anual"` opcional + `"empresas"`) — **nunca pelo valor em R$ mencionado no texto**. Sem "anual" no texto, o padrão é sempre o plano mensal daquele tier. Preço e entitlement continuam vindo só de `CATALOGO_OFERTAS`, exatamente como antes.

**Empresas nunca gera link** — recebe uma resposta fixa de interesse comercial (`MENSAGEM_INTERESSE_EMPRESAS`), sem automação, como já era esperado.

## 13. Troca de plano — fechamento final do risco de cobrança dupla (26/08/2026)

Duas rodadas sucessivas no mesmo tema, cada uma fechando o que a anterior deixou em aberto:

**Rodada 1** (fechamento de onboarding/planos/coerência): até então, nenhum código cancelava a assinatura recorrente **anterior** no Mercado Pago quando o cliente trocava de plano (ex.: Individual → Gestão Mensal) — o próprio `mercadopago_subscription_id` antigo era sobrescrito pelo novo antes de qualquer cancelamento ser possível, tornando o ID antigo irrecuperável. Corrigido: o webhook passou a capturar o `preapproval` anterior antes de sobrescrever, confirmar a assinatura nova ativa primeiro (nunca deixa o cliente sem acesso entre as duas etapas) e só então tentar cancelar a anterior via `PUT /v1/preapproval/{id}` `{status:"cancelled"}`. **Mas o cancelamento em si era best-effort sem persistência** — se a chamada ao Mercado Pago falhasse depois da nova assinatura já ativa, o ID antigo se perdia de novo (ficava só num log passageiro, sem `SENTRY_DSN` configurado nem isso).

**Rodada 2, esta** — elimina esse risco residual:

- **Persistência**: `subscriptions.pending_preapproval_cancellations` (jsonb, migration `20260826140000`) — array (não um campo único) porque uma empresa pode trocar de plano de novo antes da reconciliação anterior resolver, e um único campo perderia a pendência mais antiga. Cada item: `{preapprovalId, status: "pending"|"failed", attempts, lastAttemptAt, lastError}`. Nunca editado direto — sempre via as RPCs `upsert_pending_preapproval_cancellation`/`resolve_pending_preapproval_cancellation` (restritas a `service_role`), que travam a linha (`for update`) pra nunca perder uma entrada em caso de execução concorrente (webhook + reconciliação ao mesmo tempo).
- **Classificação de erro** (`classificarErroCancelamento`, `src/lib/mercadopago/client.ts`): timeout/rede/429/5xx → transitório (retry faz sentido); 400/401/403/404 → permanente (o Mercado Pago já disse que o pedido está errado, retry nunca resolveria sozinho — marca `failed` já na 1ª tentativa).
- **Limite de tentativas**: `MAX_TENTATIVAS_CANCELAMENTO = 5` (`src/services/mercadopago/cancelamentoAssinaturaAnterior.ts`). Esgotado (ou erro permanente) → `status: "failed"`, sinalizado como "ação manual necessária" nos logs, mas **o plano novo continua ativo** — nunca desfaz a ativação por causa de uma falha de cancelamento.
- **Reconciliação**: `GET /api/payments/mercadopago/reconcile-cancellations` (mesmo padrão de token dos outros `*_DISPATCH_SECRET`, cron novo `frotaia-mp-reconcile-cron` no Railway, 1x/hora). Nunca confia só no estado local — sempre reconsulta o recurso real no Mercado Pago (`buscarAssinatura`) antes de decidir; se já estiver `cancelled` (inclusive por ação manual direta no painel do Mercado Pago), resolve sem reenviar outro cancelamento. Entradas `failed` não são reenviadas automaticamente (evita martelar um erro permanente) — só a checagem de estado real roda de novo, continuando a detectar se alguém resolveu manualmente. Idempotente: rodar 2x seguidas (ou 2 instâncias ao mesmo tempo) é seguro.
- **Proteções mantidas**: nunca cancela `old===new` (mesma assinatura reportando mudança de status); nunca cancela antes da nova já estar confirmada ativa no banco; webhook duplicado nunca reprocessa nem cancela de novo (idempotência por `payment_events`).

Arquivos: `src/services/mercadopago/cancelamentoAssinaturaAnterior.ts` (orquestração — usada tanto pelo webhook quanto pela reconciliação), `src/services/supabase/subscriptionService.ts` (wrappers das RPCs), `src/app/api/payments/mercadopago/reconcile-cancellations/route.ts` (job novo), `supabase/migrations/20260826140000_subscription_pending_preapproval_cancellations.sql`.

**Estado final**: preapproval antigo nunca fica ativo indefinidamente sem o sistema saber — ou é cancelado, ou fica registrado como pendente/com falha, recuperável a qualquer momento (consultável em `subscriptions.pending_preapproval_cancellations`) e resolvido automaticamente assim que possível (retry) ou manualmente (`failed`).

## 14. Pendência investigada: Pix nos planos recorrentes (Individual/Gestão Mensal) — 29/08/2026

Rafael perguntou se dava pra aceitar Pix nos dois planos mensais (hoje só cartão, via `POST /preapproval`) — motivado por ter acabado de cadastrar uma chave Pix na própria conta Mercado Pago. Pesquisei a documentação técnica oficial (referência de API, não só páginas de marketing) antes de responder, seguindo o princípio já usado em todo o projeto de nunca implementar contra API não verificada.

**Achado confirmado**: os endpoints `POST /preapproval` e `POST /preapproval_plan` (a família de API que o código usa) **não têm nenhum campo relacionado a Pix** na referência oficial — só `card_token_id` (cartão) e o objeto `auto_recurring` (frequência/valor). Cadastrar uma chave Pix na conta não muda isso — chave Pix habilita *receber* Pix em geral (é o que já sustenta o `ANUAL_PIX`, via `checkout/preferences`), mas não é a mesma coisa que o `/preapproval` aceitar Pix como forma de cobrança recorrente.

**O que existe, mas não é a mesma coisa**: o Mercado Pago tem um produto separado, "Planos de assinatura" (`/developers/pt/docs/subscription-plans`), anunciado como "sem programação necessária", que aceita Pix/cartão/boleto/saldo — mas é gerenciado direto no painel/app do Mercado Pago, sem documentação de referência de API encontrada (schema de campos, como amarrar a um `external_reference` por empresa, como o webhook avisaria este sistema). Sem isso confirmado, não dá pra integrar com segurança ao fluxo automático atual (checkout dinâmico por empresa + webhook + entitlement).

**Pix Automático** (padrão novo do Banco Central, adequação obrigatória das instituições em 01/01/2026) também foi pesquisado — nenhuma documentação de desenvolvedor do Mercado Pago encontrada expondo isso como campo/endpoint pra contas comuns integrarem hoje.

**Conclusão**: mantém como está (cartão nos dois planos mensais, Pix só no `ANUAL_PIX`). Pra reabrir isso: (1) Rafael testar diretamente no painel do Mercado Pago se "Planos de assinatura" com Pix gera algo integrável, ou (2) aguardar/pesquisar de novo se a Mercado Pago documentar oficialmente uma API de Pix recorrente equivalente ao `/preapproval`. Não é bug, não é limitação do código — é limitação confirmada da API do provedor de pagamento.

## 15. Reestruturação Individual/Essencial/Pro (10/09/2026)

Rafael definiu uma tabela de preços nova, saindo de 2 planos (Individual + Gestão) pra 3 (Individual/Essencial/Pro), cada um com as 3 formas de cobrança (antes só a "Gestão" tinha opção anual). Motivado por uma investigação prévia sobre Pix recorrente (Mercado Pago não confirmado via API pública; Efí Bank confirmado via API própria, `dev.efipay.com.br/docs/api-pix/pix-automatico`, mas exige conta empresarial — não mudou a decisão da seção 14, só ficou registrado como alternativa pesquisada).

**O que mudou de arquitetura** (não foi só trocar números — ver catálogo na seção 1):
- `CATALOGO_OFERTAS` foi de 4 pra 9 chaves; `limiteVeiculos` deixou de ser binário (`1 | 10`) e passou a `1 | 3 | 10`.
- Novo campo `metodoUnico: "pix" | "cartao"` no catálogo — `criarPagamentoAnual` (`client.ts`) parou de receber um parâmetro `modo` solto e passou a derivar Pix-vs-cartão do próprio catálogo, pela chave do plano.
- `CheckoutGate.tsx` foi redesenhado — de um wizard de 2 variantes (upsell inline / anual isolado) pra uma tela única com 3 cards de tier + toggle Mensal/Anual + (se Anual) Cartão/Pix.
- `enforce_vehicle_limit_by_entitlement` (trigger de banco) generalizado de 1×10 pra 1/3/10 (migration `20260910100100`) — sem isso, o limite de 3 do Essencial não seria realmente aplicado se algum caminho de escrita pulasse a checagem da aplicação.
- Migration `20260910100000` adiciona as 9 chaves ao enum `subscription_plan` (aditiva, tabela `subscriptions` vazia no momento — sem risco de assinante existente).

Confirmado: 618 testes + lint + build passando depois da mudança.
