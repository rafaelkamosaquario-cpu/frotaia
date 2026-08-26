# Frota IA — Checkout Mercado Pago (estado atual)

Branch `claude/frota-ia-assistente-setup-qlrbac`, implementado em 2026-08-23. Nova estrutura comercial "Individual vs. Gestão" — reaproveita 100% a infraestrutura de pagamento que já existia (webhook, validação HMAC, `subscriptions`); o que mudou foi o catálogo de ofertas e a ligação entre pagamento e entitlement do Painel de Gestão.

## 1. Catálogo de ofertas

Fonte única: `src/lib/mercadopago/catalog.ts` (`CATALOGO_OFERTAS`) — nunca preço/entitlement hardcoded em outro lugar.

| Oferta | Preço | Cobrança | Painel | Veículos | Validade |
|---|---|---|---|---|---|
| **Individual** (`MENSAL`) | R$ 79,90/mês | Recorrente | Não | 1 | Enquanto ativa |
| **Gestão Mensal** (`GESTAO_MENSAL`) | R$ 99,90/mês | Recorrente | Sim | 10 | Enquanto ativa |
| **Gestão Anual — cartão** (`ANUAL_PARCELADO`) | R$ 838,80 (até 12x R$ 69,90) | Única | Sim | 10 | 12 meses |
| **Gestão Anual — Pix** (`ANUAL_PIX`) | R$ 799,00 à vista | Única | Sim | 10 | 12 meses |

**"12x sem juros" não é algo que o código controla nem confirma** — parcelamento é configurado via `installments: 12` no Checkout Pro, mas se as parcelas saem com ou sem juros depende da configuração de taxas da própria conta Mercado Pago, invisível pra este repositório. Conferir visualmente na página de checkout gerada antes de divulgar como "sem juros".

Plano Empresa (mais de 10 veículos) continua **fora do catálogo de autoatendimento** — só contratação comercial direta, sem automação (ver `systemPrompt.ts`).

## 2. O upsell (Individual → Gestão Mensal)

Nunca gera duas assinaturas. O cliente escolhe entre dois botões na página `/assinar` — "Continuar com Individual" ou "Quero Frota IA Gestão" — e o que sai do outro lado é **uma única chamada** de `criarAssinaturaMensal` com `plano: "MENSAL"` ou `plano: "GESTAO_MENSAL"`. Não existe conceito de "R$79,90 + R$20" em nenhum lugar do código — é sempre um valor fechado (R$99,90) desde a criação do link no Mercado Pago.

## 3. O "gate de contratação" (`/assinar`)

Página pública nova, fora de `/frota` — **não exige login, Google nem Calendar**, é só uma etapa de resumo/confirmação antes do Mercado Pago, mobile-first.

```
WhatsApp (gerenciar_assinatura)
   ↓
link assinado (HMAC, 30 min) → /assinar?token=...
   ↓
resumo do plano + upsell (Individual) OU escolha Cartão/Pix (Gestão Anual)
   ↓
confirmar → server action cria o checkout REAL no Mercado Pago
   ↓
redireciona pro Mercado Pago
```

**Segurança**: o token carrega só `companyId` + o plano que o cliente pediu na conversa (só um valor inicial de UI, não uma autorização). Preço e entitlement nunca vêm de parâmetro de URL — a action que cria o checkout (`src/app/assinar/actions.ts`) sempre resolve tudo de novo a partir de `CATALOGO_OFERTAS`, usando só a chave do plano (`MENSAL`/`GESTAO_MENSAL`/`ANUAL_PARCELADO`/`ANUAL_PIX`) escolhida na própria página. Não existe um jeito de o cliente alterar a URL e pagar R$79,90 recebendo Gestão — o valor cobrado e o entitlement liberado vêm sempre do mesmo lugar (o catálogo), nunca de dois lugares que possam divergir.

E-mail só é pedido quando o plano é recorrente (Individual/Gestão Mensal) — Gestão Anual (cobrança única) não pede.

## 4. Mercado Pago — como é chamado

- **Recorrente** (Individual/Gestão Mensal): `POST /preapproval` — `external_reference` codifica `companyId|PLANO`.
- **Única** (Gestão Anual cartão/Pix): `POST /checkout/preferences` — mesmo formato de `external_reference`. Pix restringe `excluded_payment_types` pra outras formas; cartão pede `installments: 12`.
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
| Individual pago | `MENSAL` | `false` | `ATIVA` |
| Gestão Mensal pago | `GESTAO_MENSAL` | `true` | `ATIVA` |
| Gestão Anual cartão pago | `ANUAL_PARCELADO` | `true` | `ATIVA`, `valido_ate` = +365 dias |
| Gestão Anual Pix pago | `ANUAL_PIX` | `true` | `ATIVA`, `valido_ate` = +365 dias |
| Assinatura recorrente cancelada/pausada | (mantém) | `false` | `CANCELADA`/`INADIMPLENTE` |

O **limite de veículos (1×10)** continua vindo, sem nenhuma mudança, de `getVehicleLimitForCompany` (`src/lib/frota/vehicleLimit.ts`, implementado antes desta tarefa) — que já lê `fleet_panel_included`. Como o webhook agora grava esse campo corretamente, o limite passa a ser automático depois do pagamento, sem eu precisar tocar nessa função.

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

Nenhuma linha existente de `subscriptions` foi alterada — a migration só adicionou o valor `GESTAO_MENSAL` ao enum (aditivo). Quem já tem `plan=MENSAL` (R$79,90, preço antigo idêntico ao novo Individual) ou `plan=ANUAL_PARCELADO`/`ANUAL_PIX` com o preço/validade antigos gravados em `valor_centavos` continua exatamente como está — preço de assinatura já paga nunca é reescrito retroativamente. Só compras **novas** usam os valores do catálogo atualizado.

## 10. Banco de dados

1 migration aditiva: `20260823162740_add_gestao_mensal_plan.sql` — novo valor `GESTAO_MENSAL` no enum `subscription_plan`. Nenhuma coluna nova, nenhuma tabela nova.

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

**Mensagens oficiais dos CTAs** (ver seção "Relatório final" da resposta, mesmo texto):
- Individual: `"Quero assinar o Frota IA Individual de R$79,90 por mês."`
- Gestão: `"Quero contratar o Frota IA Gestão anual."`
- Empresas: `"Quero conhecer o Frota IA Empresas para uma frota com mais de 10 veículos."`

O reconhecimento é por palavra-chave (`"individual"`, `"gestão"`/`"gestao"`, `"empresas"`) — **nunca pelo valor em R$ mencionado no texto**. Preço e entitlement continuam vindo só de `CATALOGO_OFERTAS`, exatamente como antes.

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
