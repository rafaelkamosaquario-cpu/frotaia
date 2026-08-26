# FROTA IA — JORNADA DO CLIENTE, ONBOARDING E FUNCIONALIDADES
## VERSÃO INDIVIDUAL + VERSÃO GESTÃO

> **Auditoria de código, não plano de produto.** Todo fato abaixo foi verificado lendo o código do repositório `frotaia` no estado do commit `8b6d3ea` (branch `claude/frota-ia-assistente-setup-qlrbac`), em 2026-08-26. Onde `docs/*.md` antigos contradisseram o código, o código venceu — a divergência é sinalizada explicitamente. Nenhuma etapa foi inventada; onde uma etapa documentada em material antigo não existe mais, isso está dito às claras.
>
> **ATUALIZAÇÃO 2026-08-26 (mesmo dia, rodada de fechamento de onboarding/planos/coerência)**: várias inconsistências descritas abaixo como "estado real encontrado" foram corrigidas nesta mesma data — loop de configuração de veículo (Parte 3), nome pessoal nunca gravado em `profiles.full_name` (Parte 2), marca/modelo/ano nunca estruturados (Parte 3), intenção inicial descartada (Parte 4), região só em memória volátil (Parte 5), risco de cobrança dupla na troca de plano (Parte 6), plano anual vencido com status incoerente (Parte 8), Google Calendar como requisito global do painel (Parte 10), e ausência de histórico de documentos gerados (Parte 11). Cada seção abaixo tem uma nota `[CORRIGIDO 26/08]` no ponto exato — o texto original foi preservado (riscado) por completude histórica, o estado real e atual está sempre na nota. Detalhe completo: `docs/FROTA_IA_PAINEL_WEB_FUNCIONALIDADES.md`, seção 28, e relatório entregue no chat em 2026-08-26.
>
> **ATUALIZAÇÃO 2026-08-26 (rodada seguinte, ainda no mesmo dia — fechamento final Mercado Pago)**: o risco de cobrança dupla citado acima (Parte 6) tinha uma lacuna residual — o cancelamento do preapproval anterior era best-effort sem persistência; se falhasse depois do plano novo já ativo, o ID antigo se perdia. Corrigido: persistência (`subscriptions.pending_preapproval_cancellations`), retry classificado por tipo de erro e job de reconciliação horário (`frotaia-mp-reconcile-cron`). Também: a pergunta do nome no início do onboarding (Parte 2) ganhou copy revisada pra cobrir nome pessoal E nome de empresa/operação, já que a mesma resposta grava nos dois lugares e a pergunta acontece antes de saber qual dos dois é o caso. Detalhe completo: `docs/FROTA_IA_CHECKOUT_MERCADOPAGO_ATUAL.md`, seção 13, e relatório entregue no chat em 2026-08-26.

---

# PARTE 1 — VISÃO GERAL

O Frota IA tem hoje duas experiências reais, confirmadas no código (não é só texto de marketing):

## FROTA IA INDIVIDUAL
- **WhatsApp-first** — sem painel web.
- Plano `MENSAL`, R$ 79,90/mês, cobrança recorrente.
- Limite de **1 veículo** — reforçado por índice único parcial no banco (`vehicles_one_active_per_company_idx`, só 1 veículo `active=true` por empresa).
- `catalog.ts` confirma `painel: false` para este plano.

## FROTA IA GESTÃO
- **WhatsApp + Painel Web**.
- Três formas de contratar: `GESTAO_MENSAL` (R$ 99,90/mês), `ANUAL_PARCELADO` (R$ 838,80, até 12x R$ 69,90) e `ANUAL_PIX` (R$ 799,00 à vista).
- Limite de **até 10 veículos** — mas atenção: o limite real de aplicação vem de `getVehicleLimitForCompany` (baseado em entitlement), não do campo `limiteVeiculos` do catálogo (que é só informativo pra UI).
- `catalog.ts` confirma `painel: true` para os três planos Gestão.

**Empresas (>10 veículos)**: não existe checkout real. Confirmado no código — `EMPRESA` está fora do tipo `OfertaPlano`, e o único efeito de um cliente demonstrar esse interesse é uma **mensagem de texto fixa comercial** (`MENSAGEM_INTERESSE_EMPRESAS`), sem gerar link de pagamento nem tocar `subscriptions`.

---

# PARTE 2 — JORNADA COMPLETA DO INDIVIDUAL

```
LANDING
  ↓
CTA (opcional — só se veio de um botão da landing)
  ↓
WHATSAPP (primeira mensagem)
  ↓
cliente novo → cria auth.users + user_channels, abre onboarding_sessions
cliente existente → reconhece pelo telefone, segue pro chat normal
  ↓
ONBOARDING V1 (11 perguntas, uma por vez, sem IA — máquina de estados pura)
  ↓
conclusão do cadastro (empresa + veículo criados) + trial de 7 dias criado automaticamente
  ↓
[SE veio de CTA da landing] link assinado de checkout enviado nessa mesma mensagem
[SE não veio de CTA] só a mensagem de conclusão + menu de sugestões — link de checkout só é gerado depois, sob pedido, pela ferramenta gerenciar_assinatura
  ↓
/assinar (token HMAC de 30 min — companyId + plano pré-selecionado, revalidado contra o catálogo)
  ↓
MERCADO PAGO (preapproval, recorrente)
  ↓
pagamento aprovado
  ↓
webhook /api/payments/mercadopago/webhook (HMAC validado, reconsulta a assinatura na API do MP)
  ↓
subscriptions.status = ATIVA, valido_ate = null (limpa validade residual do trial)
  ↓
liberação — isAccessAllowed() passa a retornar true
  ↓
uso normal pelo WhatsApp (sem painel)
```

**Detalhe de cada etapa:**
1. **Landing**: fora do escopo desta auditoria (não é código deste repositório de app).
2. **CTA opcional**: se o cliente clica um botão de "assinar" na landing, a intenção (`ofertaPretendida`) é reconhecida na primeira mensagem do WhatsApp (`resolverIntencaoComercialLanding`) e guardada até a empresa existir de verdade.
3. **WhatsApp**: única porta de entrada real do V1 — não existe cadastro por formulário web pro plano Individual.
4. **Cliente novo/existente**: ver Parte 4.
5. **Onboarding V1**: ver Parte 3.
6. **Conclusão**: sempre cria uma assinatura TRIAL de 7 dias automaticamente (`criarAssinaturaTeste`), mesmo que o cliente nunca chegue a pagar.
7. **Link de contratação**: só é enviado automaticamente ao fim do onboarding se o cliente veio de um CTA da landing. Do contrário, é o cliente (ou a IA a pedido dele) quem aciona a ferramenta `gerenciar_assinatura` depois.
8. **`/assinar`**: página server-side que decodifica o token, sempre revalida o plano contra `CATALOGO_OFERTAS` (nunca confia em preço vindo do token).
9. **Mercado Pago**: para planos recorrentes, `POST /preapproval` — exige `payer_email` (por isso a página pede e-mail antes do checkout).
10. **Webhook**: valida assinatura HMAC-SHA256 (timing-safe), **sempre reconsulta o recurso na API do MP** antes de mudar qualquer coisa — nunca confia só no payload recebido.
11. **`subscriptions`**: sempre um `UPDATE` na mesma linha (`company_id` é `unique`), nunca um `INSERT` novo.
12. **Liberação**: checada em tempo real a cada mensagem recebida no WhatsApp, não por cron.

---

# PARTE 3 — ONBOARDING V1 (passo a passo real, confirmado no código)

Máquina de estados pura (sem chamar a Claude), em `src/ai/whatsapp/onboardingConversation.ts`, orquestrada pelo webhook e finalizada em `finalizeOnboarding.ts`.

| # | Etapa (pergunta) | Objetivo | Dado coletado | Tabela/coluna final | Obrigatória? | Uso posterior |
|---|---|---|---|---|---|---|
| 0 | Mensagem de abertura | Apresentar o produto | — | — | — | — |
| 1 | **Nome** — "Como posso chamar você?" | Personalizar a conversa | `name` | `companies.name` | Sim (repete se vazio) | Nome comercial da empresa |
| 2 | **Perfil** — lista (motorista autônomo / motorista / dono de transportadora / gestor de frota / transportador) | Entender o papel do cliente | `companyType` (+ `profileLabel`, só de uso interno) | `companies.company_type` | Sim (repete se não reconhecer) | Metadado da empresa; `profileLabel` **nunca é persistido**, some depois do onboarding |
| 3 | **Intenção** — "o que você quer resolver primeiro" (lista por categoria) | Personalizar a transição e a mensagem final | `intentId`/`intentLabel` | **Nenhuma** — não vai pra `companies`/`profiles`/`ai_memories` | Sim (repete se não reconhecer) | Só decide o texto de transição e a mensagem de conclusão; não é dado de negócio |
| 4 | **Cidade-base** — "Qual cidade você usa como base? Ex.: Curitiba - PR" | Localização da operação | `baseCity`/`baseState` | `companies.city`/`companies.state` | Sim (repete se vazio) | Contexto de empresa |
| 5 | **Região de atuação** — lista (Norte/Nordeste/Centro-Oeste/Sudeste/Sul/Todas) | Contexto operacional | `region` | `ai_memories` (`key="operating_region"`) | Sim (repete se vazio) | Entra no pool genérico de memórias injetadas no system prompt (top 12 mais recentes) — não é lido por nenhuma ferramenta por chave específica |
| 6 | **Rota fixa?** — sim/não (texto, não botão) | Saber se há rota recorrente | `hasFixedRoute` | `ai_memories` (`key="has_fixed_route"`) | Sim (repete se não reconhecer) | Idem acima — memória genérica |
| 6b | **Rota principal** (só se respondeu "sim") — "Ex.: Curitiba → São Paulo" | Registrar a rota | `primaryRouteRaw` + origem/destino se o parser conseguir separar | `ai_memories` (texto bruto) **e**, se separado com sucesso, `saved_routes` (linha estruturada, favorita, vinculada ao veículo) | Condicional (só perguntada se etapa 6 = sim) | `saved_routes` alimenta ferramentas de rota/CPK |
| 7 | **Veículo — marca/modelo/ano** — "Ex.: Scania R450 2022" | Identificar o veículo | `primaryVehicleRaw` (texto livre, **nunca quebrado em colunas**) | `vehicles.name` (truncado 120c) + `vehicles.notes` (texto completo) | Sim — deixou de ser pulável na V1 (1 usuário + 1 veículo) | Identificação do veículo |
| 8 | **Placa** — aceita "depois" | Identificar o veículo | `plate` | `vehicles.plate` | **Opcional** — sempre avança | Identificação do veículo |
| 9 | **Configuração do veículo** — lista (Toco, Truck, Três-quartos, Bitruck, Cavalo mecânico, Carreta, Bitrem, Rodotrem, Outro), com desambiguação de eixos (5/6/7/9) se cavalo/carreta | Base de cálculo de CPK/custo | `vehicleType`, `axleCount` | `vehicles.vehicle_type`, `vehicles.axle_count` | **Sim, trava de verdade** — única etapa sem fallback "outro", repete indefinidamente até classificar | Ferramentas de cálculo (CPK, piso ANTT etc.) |
| 10 | **Carroceria** — lista (Sider, Baú, Graneleiro, Basculante, Tanque, Grade baixa, Prancha, Frigorífico, Outro) | Compatibilidade de carga (inclusive Radar de Fretes) | `bodyType` | `vehicles.body_type` | Tecnicamente sempre preenchida, mas nunca trava (sempre cai em "outro") | Matching do Radar de Fretes |
| 11 | **Consumo médio** — "Ex.: 2,8 km/l, ou 'não sei'" | Base de cálculo de combustível | `averageConsumptionKmL` | `vehicles.average_consumption_km_l` | **Opcional** — sempre finaliza o onboarding | Ferramentas de combustível/CPK |

**Etapa que NÃO existe mais**: "quantos veículos você tem" — removida deliberadamente (comentário explícito no código). O produto permite só 1 veículo ativo por empresa na V1, reforçado por índice único no banco. Se algum material antigo menciona essa pergunta, está desatualizado.

**Google Calendar nunca fez parte do onboarding V1** — é oferecido sob demanda, só quando uma ferramenta (`gerenciar_alerta`/`gerenciar_google_calendar`) precisar dele durante uma conversa normal.

**Mensagem final**: `MENSAGEM_POS_CADASTRO` ("Cadastro concluído!... Escolha uma das opções abaixo..."), personalizada pela intenção (etapa 3) quando reconhecida. Em seguida, uma lista nativa de 10 sugestões é enviada (com fallback em texto numerado se a lista falhar).

---

# PARTE 4 — CLIENTE NOVO VS EXISTENTE

## Cliente novo
1. Telefone nunca visto em `user_channels` → `resolveOrCreateUserByPhone` cria um `auth.users` real (via Admin API, `phone_confirm: true` — o número é considerado verificado por ter mandado a mensagem pela própria instância Z-API, sem OTP).
2. Insere a linha em `user_channels` (`provider: "z_api"`).
3. Cria `onboarding_sessions` em `awaiting_name`.
4. Envia a mensagem de abertura. A mensagem original do cliente **não é processada nesta mesma requisição** — só na próxima.

## Cliente existente
1. Telefone já mapeado em `user_channels` → reaproveita o mesmo `user_id`/`company_id`/`channel_id`, sem criar nada novo.
2. Se `onboarding_sessions.state === "completed"` → segue direto pro fluxo normal de chat (`gerarRespostaAssistente`).
3. Se a sessão não existir mas já houver empresa vinculada (conta anterior à Camada 6) → cria a sessão já como `"completed"`, **nunca reabre o onboarding de quem já usa o produto**.

## Como o sistema evita duplicação

| O que evita duplicar | Mecanismo |
|---|---|
| Usuário duplicado por telefone | Checagem antes de criar + constraint única `(provider, external_user_id)` em `user_channels` |
| Sessão de onboarding duplicada | `onboarding_sessions.user_id` é chave primária (máx. 1 por usuário) |
| Empresa duplicada | Estrutural — `createCompanyWithOwner` só roda uma vez, dentro de `finalizeOnboarding`, guardado por `session.state !== "completed"` |
| Reprocessar a mesma resposta 2x (reentrega de webhook) | Compara `messageId` com o último processado, salvo na sessão |
| Vínculo dono duplicado na mesma empresa | Constraint única `(company_id, user_id)` em `company_members` |
| Mais de uma empresa "padrão" por usuário | Trigger de banco garante no máximo 1 `is_default=true` |
| Veículo ativo duplicado | Índice único parcial `(company_id) where active` em `vehicles` |
| Reprocessar a mesma mensagem de chat 2x | Constraint única em `messages.external_message_id`; erro `23505` tratado como "já respondemos, não repete" |
| Teste grátis duplicado no mesmo telefone | `trial_usage` (chave primária `phone_e164`) sobrevive à exclusão da empresa — se já usado, a nova assinatura já nasce `EXPIRADA` em vez de dar um trial novo |

## Mensagem de GRUPO de WhatsApp
Tratamento **totalmente separado**, interceptado antes de qualquer resolução de usuário/onboarding: desvia 100% para o pipeline do Radar de Fretes (whitelist de grupo → pré-filtro barato de texto → extração por IA → dedup por similaridade → dedup exato → criação de oportunidade). **Nunca responde no grupo**, e quem manda a mensagem dentro do grupo (`participantPhone`) **nunca vira conta de cliente** por essa via — é usado só como log/contexto do Radar.

---

# PARTE 5 — PAGAMENTO INDIVIDUAL

**Frota IA Individual — R$ 79,90/mês, cobrança recorrente.**

- **Checkout**: link gerado por `buildCheckoutLinkUrl` — token HMAC-SHA256 (reaproveita o segredo do webhook do WhatsApp), payload `{companyId, planoPreSelecionado}`, TTL de **30 minutos**. O token não autoriza a compra por si só — é só identificação; a página `/assinar` sempre revalida o preço contra o catálogo.
- **E-mail**: obrigatório só para os planos recorrentes (Individual e Gestão Mensal) — é campo exigido pela própria API do Mercado Pago para `preapproval`. Os planos anuais **não pedem e-mail**.
- **Mercado Pago**: `POST /preapproval` com `reason`, `external_reference` (codifica `companyId|plano`), `auto_recurring{frequency:1, frequency_type:"months", transaction_amount}`.
- **Webhook**: valida `x-signature` (HMAC-SHA256, manifest `id:...;request-id:...;ts:...;`, comparação em tempo constante); **sempre reconsulta** o recurso real na API do MP antes de decidir qualquer coisa (nunca confia no corpo da notificação).
- **HMAC**: correto e timing-safe, confirmado no código, com checagem de tamanho do buffer antes da comparação.
- **Reconsulta na API**: sim, sempre — `GET /v1/payments/{id}` ou `GET /preapproval/{id}` conforme o tipo de evento.
- **Idempotência**: checagem por `(mercadopago_payment_id, status_recebido)` já visto em `payment_events`, feita **na camada de aplicação** — não há constraint única no banco para isso (risco teórico de corrida sob duas notificações idênticas simultâneas, sem lock observado).
- **Atualização da subscription**: sempre um `UPDATE` (nunca `INSERT`) na única linha da empresa.
- **Trial → assinatura**: ao ativar um plano recorrente, o código **limpa `valido_ate` para `null`** de propósito.
- **`valido_ate`**: representa uma data-limite de acesso — setado no trial (+7 dias) e nos planos anuais (+365 dias a partir do pagamento); **limpo (`null`)** quando um plano recorrente fica `ATIVA`, porque planos recorrentes não usam data fixa como controle de expiração.
- **Bug histórico corrigido, confirmado**: o comentário no próprio webhook documenta o bug antigo (cliente pago bloqueado ~7 dias depois por causa do `valido_ate` do trial não limpo) e a correção — há teste de regressão dedicado simulando esse cenário.
- **Acesso liberado**: `isAccessAllowed()` — sem assinatura, `false`; status `CANCELADA`/`EXPIRADA`/`INADIMPLENTE`, `false`; sem `valido_ate`, libera se `status === "ATIVA"`; com `valido_ate`, compara contra a data atual.

---

# PARTE 6 — UPSELL PARA GESTÃO MENSAL

**Individual R$ 79,90 + upgrade de R$ 20,00 = Gestão Mensal R$ 99,90.**

Confirmado em três camadas do código:
1. **Constraint de banco**: `subscriptions_company_unique unique (company_id)` — fisicamente impossível existir 2 linhas pra mesma empresa.
2. **Código de escrita**: a atualização de assinatura é sempre `.update(...).eq("company_id", ...)`, nunca `.insert()` fora da criação inicial do trial.
3. **Tool de IA**: `gerenciar_assinatura` só gera o link de checkout — comentário explícito no código confirma que ela "não bloqueia nem libera acesso por si só".

Ou seja: **não são duas assinaturas, não são duas cobranças** — é a mesma linha em `subscriptions` sendo atualizada (novo valor, novo plano). `fleet_panel_included` passa a `true` automaticamente quando o pagamento do Gestão é confirmado, e o limite de veículos sobe de 1 para 10.

---

# PARTE 7 — JORNADA COMPLETA DO FROTA IA GESTÃO

```
CLIENTE ESCOLHE GESTÃO (Mensal ou Anual, cartão ou Pix)
  ↓
CHECKOUT (mesmo mecanismo da Parte 5 — /preapproval pro Mensal, /checkout/preferences pros Anuais)
  ↓
PAGAMENTO APROVADO
  ↓
WEBHOOK → subscriptions.status = ATIVA, fleet_panel_included = true
  ↓
ENTITLEMENT DO PAINEL LIBERADO (fleet_panel_enabled legado OU isFleetPanelAccessAllowed)
  ↓
GATE /frota/* — 1ª checagem: autenticado? tem empresa? entitled?
  ↓
LOGIN GOOGLE (único método de login do produto inteiro, não é regra específica do Gestão)
  ↓
GATE — Google Calendar conectado por empresa? Se não → /frota-conectar-agenda (obrigatório, sem "pular")
  ↓
GATE — fleet_onboarding_completed_at preenchido? Se não → /frota-ativacao
  ↓
ONBOARDING GESTÃO (/frota-ativacao) — 5 passos, reaproveita empresa/veículo do V1
  ↓
Dashboard
  ↓
USO WHATSAPP + PAINEL (mesmas tabelas/services nos dois canais, ver Parte 13)
```

---

# PARTE 8 — GESTÃO ANUAL

## Cartão — R$ 838,80 total, até 12x R$ 69,90
- Checkout: `POST /checkout/preferences` (pagamento único, não recorrente), `payment_methods.installments: 12`.
- **"Sem juros" não é uma configuração técnica confirmável no código.** O único parâmetro enviado ao Mercado Pago é `installments: 12` — o próprio comentário do código admite explicitamente que se isso sai "sem juros" ou não depende da configuração de taxas da conta Mercado Pago, algo que este código não controla nem confirma. **Não afirmar "sem juros" como garantia técnica** — é, no máximo, uma configuração da conta MP fora deste repositório.

## Pix — R$ 799,00 à vista
- Checkout: `POST /checkout/preferences`, com `excluded_payment_types` excluindo cartão de crédito/débito/boleto/pré-pago (só sobra Pix).

## Para os dois
- **Validade**: `valido_ate` = data do pagamento + 365 dias (hardcoded em `route.ts`, não lido dinamicamente de `validadeMeses` do catálogo — funciona na prática, mas é uma pequena duplicação de fonte de verdade).
- **Entitlement**: `fleet_panel_included = true` desde a aprovação.
- **12 meses de acesso**: liberado enquanto `valido_ate` estiver no futuro.
- **Expiração**: **nenhum cron desliga o acesso automaticamente.** O `status` da assinatura permanece `"ATIVA"` no banco para sempre — só `valido_ate` reflete a data de corte. O bloqueio é inteiramente **reativo**: calculado em tempo real a cada mensagem no WhatsApp e a cada carregamento de `/frota/*`, comparando `valido_ate` contra a data atual.
- **Dados preservados após expiração**: confirmado por ausência de qualquer rotina de exclusão condicionada a status/validade de `subscriptions` — veículos, motoristas, despesas, documentos, checklists e memórias continuam intactos; se o cliente renovar depois, retoma de onde parou (mesma linha `subscriptions`, `valido_ate` recalculado a partir do novo pagamento).

---

# PARTE 9 — ONBOARDING GESTÃO (`/frota-ativacao`)

## Quando é acionado
Só chega aqui quem já está: autenticado (Google) **e** tem empresa **e** é "entitled" (`fleet_panel_enabled` legado OU assinatura Gestão paga) **e** já conectou o Google Calendar da empresa **e** ainda não concluiu o wizard (`companies.fleet_onboarding_completed_at IS NULL`).

## Google — login obrigatório
Sim, mas não é regra específica do Gestão — é o **único** método de autenticação do produto inteiro (não existe login por e-mail/senha em lugar nenhum do app).

## Google Calendar — obrigatório
Sim, checado **por empresa**. Existe uma tela dedicada (`/frota-conectar-agenda`, fora da árvore `/frota` de propósito, pra evitar loop de redirect). **Não há como "pular"** — quem recusa fica preso nessa tela até conectar.

## Passo a passo real (`AtivacaoFlow.tsx`, sem rascunho em tabela própria — cada passo grava direto)

| Passo | Dado usado | Dado criado/atualizado | Tabela | Obrigatório? |
|---|---|---|---|---|
| 1 — "Encontramos sua conta" | Empresa e veículo já existentes | Nome da empresa (opcional editar) | `companies` | Clicar "Continuar" |
| 2 — Veículos | Veículos já cadastrados | Novo veículo (até limite de 10) via o mesmo formulário/API da tela Veículos | `vehicles` | Opcional |
| 3 — Motoristas | Motoristas já cadastrados | Novo motorista, mesmo formulário/API da tela Motoristas | `drivers` | Opcional |
| 4 — Checklist diário | Preferências atuais | Liga/desliga, horário, itens — grava na hora a cada mudança | `company_preferences` | Opcional |
| 5 — Resumo e conclusão | Estado local (nome, contagens, checklist, "Agenda: Conectada") | `companies.fleet_onboarding_completed_at = now()` | `companies` | Obrigatório clicar para sair do wizard |

## Veículo do V1 é reaproveitado — confirmado
A empresa **nunca é recriada** (sempre `UPDATE`, nunca `INSERT`). O veículo exibido no passo 1 é identificado como o `is_default=true` (ou o primeiro) já criado pelo onboarding V1 — comentário explícito no código confirma essa intenção de design: "nunca cria empresa nova, nunca duplica veículo".

---

# PARTE 10 — LIBERAÇÃO DO USUÁRIO

## Quando o cliente é considerado liberado?

### Individual (WhatsApp)
Checado a cada mensagem recebida (`isAccessAllowed`):
- assinatura existe;
- status não é `CANCELADA`/`EXPIRADA`/`INADIMPLENTE`;
- se `valido_ate` estiver preenchido, precisa estar no futuro; se não estiver preenchido, basta `status === "ATIVA"`.

Se negado, a mensagem só passa se "parecer" um pedido de assinatura (regex simples) — senão, resposta fixa de aviso, sem gastar chamada de IA.

### Gestão (Painel)
Checado a cada carregamento de `/frota/*`, em ordem:
1. Sessão autenticada (senão → `/login`).
2. Empresa vinculada (senão → `/onboarding`, fluxo V1).
3. **Entitlement**: `fleet_panel_enabled` (override manual legado) **OU** `isFleetPanelAccessAllowed` (exige `fleet_panel_included=true` **e** as mesmas condições de status/validade de `isAccessAllowed`) — senão → `/frota-indisponivel`.
4. Google Calendar conectado (senão → `/frota-conectar-agenda`).
5. `fleet_onboarding_completed_at` preenchido (senão → `/frota-ativacao`).

Só depois de todas as 5 condições é que `/frota/*` renderiza. **Nota do próprio código**: esse gate é controle de produto/UI — o isolamento real de dado entre empresas é feito por RLS, independentemente dele.

---

# PARTE 11 — FUNCIONALIDADES DO INDIVIDUAL (auditoria das 35 ferramentas de IA)

**Contagem exata confirmada no código hoje: 35 ferramentas** registradas em `FERRAMENTAS_FROTA_IA` (`src/ai/tools/index.ts`). Comentários antigos no próprio código ("11 ferramentas de cálculo... 12ª é gerenciar_google_calendar") estão desatualizados — o array já é iterado dinamicamente, sem trava de contagem fixa. **Não usar "33" ou "35 fixas" de nenhum documento anterior como definitivo — esta tabela é a contagem real.**

| Funcionalidade | Existe hoje? | Tipo | Também no Painel? |
|---|---|---|---|
| `analisar_frete` | ✅ | Cálculo puro | Resultado visível em Fretes/Relatórios |
| `calcular_combustivel` | ✅ | Cálculo puro | Não |
| `calcular_cpk` | ✅ | Cálculo puro | Não |
| `calcular_custo_dia` | ✅ | Cálculo puro | Não |
| `calcular_custo_veiculo_parado` | ✅ | Cálculo puro | Não |
| `calcular_custo_viagem` | ✅ | Cálculo puro | Não |
| `calcular_jornada` | ✅ | Cálculo puro | Não |
| `calcular_margem` | ✅ | Cálculo puro (núcleo reaproveitado por várias outras) | Não |
| `calcular_receita_km` | ✅ | Cálculo puro | Não |
| `calcular_valor_minimo_frete` | ✅ | Cálculo puro (nunca piso legal) | Não |
| `comparar_pneus` | ✅ | Cálculo puro | Não |
| `verificar_piso_minimo_antt` | ✅ | Cálculo puro (fórmula legal, exige busca da fonte oficial) | Não |
| `consultar_checklist` | ✅ | I/O (Supabase) | **Sim** — mesma função de aderência da tela `/frota/checklists` |
| `consultar_conhecimento_operacional` | ✅ | I/O (arquivo local `.md`) | Não |
| `consultar_historico` | ✅ | I/O (Supabase) | Parcial — análises aparecem em Fretes/Relatórios; documentos gerados não têm tela própria |
| `consultar_oportunidades_frete` | ✅ | I/O (Supabase + análise) | **Sim** — mesmas tabelas de `/frota/oportunidades` |
| `consultar_rota` | ✅ | I/O (Google Maps + Z-API) | Não |
| `definir_estilo_resposta` | ✅ | I/O (Supabase) | **Sim** — `/frota/configuracoes` |
| `gerar_documento` | ✅ | I/O (Supabase + PDF + Z-API) | Não |
| `gerenciar_alerta` | ✅ | I/O (Supabase) | **Sim** — `/frota/alertas` |
| `gerenciar_assinatura` | ✅ | I/O (link assinado) | Parcial — alimenta `/assinar` |
| `gerenciar_checklist_config` | ✅ | I/O (Supabase) | **Sim** — `/frota/configuracoes` |
| `gerenciar_documento_frota` | ✅ | I/O (Supabase) | **Sim** — `/frota/documentos` |
| `gerenciar_empresa` | ✅ | I/O (Supabase) | **Sim** — `/frota/empresa` |
| `gerenciar_google_calendar` | ✅ | I/O (Google Calendar API) | **Sim** — `/frota/agenda` |
| `gerenciar_jornada_salva` | ✅ | I/O (Supabase) | **Sim** — aparece em `/frota/relatorios` |
| `gerenciar_manutencao` | ✅ | I/O (Supabase) | **Sim** — `/frota/manutencao` |
| `gerenciar_memoria` | ✅ | I/O (Supabase, `ai_memories`) | Não |
| `gerenciar_motorista` | ✅ | I/O (Supabase) | **Sim** — `/frota/motoristas` |
| `gerenciar_noticias_setor` | ✅ | I/O (Supabase) | **Sim** — `/frota/configuracoes` |
| `gerenciar_radar_frete` | ✅ | I/O (Supabase) | **Sim** — `/frota/oportunidades` |
| `gerenciar_rota_salva` | ✅ | I/O (Supabase) | **Sim** — `/frota/rotas` |
| `gerenciar_veiculo` | ✅ | I/O (Supabase, várias tabelas) | **Sim** — `/frota/veiculos` |
| `registrar_despesa` | ✅ | I/O (Supabase) | **Sim** — `/frota/despesas` |
| `vincular_painel` | ✅ | I/O (link assinado) | Conector entre WhatsApp e login do Painel |

Todas as 35 são acionáveis tanto pelo WhatsApp quanto pelo widget de chat embutido no Painel (mesmo motor `gerarRespostaAssistente`) — a coluna "Também no Painel?" responde a uma pergunta mais estrita: existe uma tela/CRUD dedicada fora do chat?

**Recursos adicionais confirmados**: leitura de foto (visão nativa da Claude, nunca persiste o binário exceto Documentos), leitura de PDF, leitura de planilha `.xlsx/.csv` (convertida em texto), transcrição de áudio (via OpenAI, não Claude), busca web restrita a domínios oficiais/fabricantes/entidades/imprensa com fallback amplo controlado.

---

# PARTE 12 — FUNCIONALIDADES DO GESTÃO (auditoria módulo a módulo do Painel Web)

Legenda: **COMPLETO** = CRUD real persistido; **PARCIAL** = funciona, com limitação real confirmada; **INTERFACE** = tela lê dado real mas não escreve nada (read-only por design).

| Módulo | Status | WhatsApp | Painel |
|---|---|---|---|
| Dashboard | INTERFACE (por design) | Não aplicável | Agrega 6 fontes + insight de IA (cache 20h) |
| Veículos | COMPLETO (exclusão sempre soft, `active:false`) | ✅ mesma tabela | ✅ CRUD |
| Motoristas | COMPLETO (exclusão sempre soft) | ✅ mesma tabela | ✅ CRUD |
| Manutenção | COMPLETO | ✅ mesma tabela | ✅ CRUD, sincroniza alerta e despesa automaticamente |
| Documentos | COMPLETO (metadado); upload real de arquivo **só no painel** | ✅ metadado | ✅ CRUD + upload (Storage privado, signed URL) |
| Despesas | COMPLETO — **único módulo com exclusão física real** | ✅ mesma tabela | ✅ CRUD com `DELETE` |
| Checklist (tela) | INTERFACE (leitura de aderência); config compartilhada fica em Configurações | Disparo/resposta só WhatsApp | Só leitura |
| Alertas | COMPLETO — CRUD real de alertas manuais; origem automática (manutenção/documento) bloqueada de edição direta (409) | ✅ mesma tabela | ✅ CRUD |
| Notícias | PARCIAL — só toggle + leitura do último resumo; geração é de um processo externo | ✅ opt-in | Toggle + leitura |
| Radar de Fretes (Oportunidades/Fretes) | COMPLETO | ✅ mesmas tabelas | ✅ CRUD de radares/fontes, ações sobre oportunidades |
| Relatórios | PARCIAL — leitura agregada + filtros reais + PDF; sem escrita | Fonte dos dados | Filtros + exportação PDF |
| Jornadas | INTERFACE (read-only por design — jornada só é salva via WhatsApp) | ✅ única via `gerenciar_jornada_salva` | Só leitura |
| Rotas | COMPLETO (exclusão soft, `active:false`) | ✅ mesma tabela | ✅ CRUD |
| Agenda | COMPLETO, mas sem tabela própria — sempre ao vivo na API do Google | ✅ mesma API Google | ✅ CRUD ao vivo |
| Empresa | COMPLETO (restrito a owner/admin) | ✅ mesma tabela | ✅ Update |
| Configurações | PARCIAL — só os campos com efeito real confirmado têm UI (vários campos de `company_preferences` existem na tabela mas sem UI nem consumidor real encontrado) | ✅ parcial | ✅ parcial |
| Widget de IA embutido | COMPLETO | Mesmo motor | Mesmo `/api/chat`, com contexto de página e upload de imagem |

**Achado de inconsistência**: o documento antigo `docs/FROTA_IA_PAINEL_WEB_FUNCIONALIDADES.md` tem uma contradição **dentro dele mesmo** — o mapa/tabela-resumo do topo ainda descreve Alertas como "só leitura", enquanto a seção mais recente do mesmo arquivo (Rodada 2) já documenta corretamente o CRUD real implementado depois. O código confirma a versão mais nova (CRUD real).

---

# PARTE 13 — WHATSAPP ↔ PAINEL

Confirmado por leitura direta dos imports — não há duas cópias de lógica equivalente; é literalmente o mesmo arquivo de service importado nos dois lados.

| Módulo | Leitura | Escrita | Observação |
|---|---|---|---|
| Manutenção | Ambos | Ambos | Mesma tabela, sincroniza alerta/despesa automaticamente |
| Documentos | Ambos (metadado) | Ambos (metadado) | Arquivo binário: **upload só pelo Painel** — WhatsApp só extrai dado da foto por visão, nunca persiste o binário |
| Despesas | Ambos | Ambos | Mesma tabela |
| Alertas | Ambos | Ambos | Mesma tabela; origem automática só editável pela tela de origem |
| Checklist | Ambos (config); leitura de aderência idêntica | Config: ambos. Disparo/resposta: **só WhatsApp** | IA e Painel usam a mesma função de aderência — números batem por construção |
| Veículos | Ambos | Ambos | Mesma tabela |

---

# PARTE 14 — AS DUAS VERSÕES ESTÃO COERENTES?

### 1. Individual funciona sozinho corretamente?
Sim. O fluxo completo (onboarding → trial → checkout → liberação → 35 ferramentas via WhatsApp) não depende de nenhuma peça do Gestão.

### 2. Gestão realmente evolui o Individual?
Sim, de forma estrutural, não cosmética: reaproveita literalmente a mesma empresa e o mesmo veículo criados no onboarding V1 (nunca recria), e adiciona painel + limite maior de veículos sobre a mesma base de dados.

### 3. Existe alguma funcionalidade prometida no Individual que só funciona no Gestão?
Não encontrada — as 35 ferramentas de IA funcionam integralmente por WhatsApp independente do plano (o gate é por assinatura/acesso, não por presença de painel). O que só existe no Gestão é o **painel** em si, não uma capacidade da IA.

### 4. Existe alguma função duplicada desnecessariamente?
Não — nas áreas auditadas (Manutenção, Documentos, Despesas, Alertas, Checklist, Veículos, Radar de Fretes), painel e IA sempre importam o mesmo service. A única duplicação real encontrada foi de código auxiliar (a função `tokensMatch`/comparação de token reimplementada em cada uma das 6 rotas de webhook/dispatch) — não é duplicação de regra de negócio, é falta de um utilitário compartilhado.

### 5. Existem dados diferentes entre WhatsApp e Painel?
Não, nas áreas auditadas — mesma tabela, mesmo service. A única assimetria real é o **upload de arquivo binário de Documentos**, que só existe no Painel (limitação de pipeline, documentada, não um bug de sincronização).

### 6. Existe alguma função do painel que não conversa com a IA?
Sim, algumas telas são read-only por design e não têm ferramenta de IA equivalente de escrita: Dashboard (agregação), Jornadas (só leitura no painel, escrita só via WhatsApp — na verdade o inverso do que a pergunta sugere), e a parte de "documentos gerados" (`generated_documents`) não tem tela própria no painel apesar de existir via `gerar_documento`.

### 7. Existe alguma função da IA que deveria aparecer no painel mas não aparece?
Sim, duas identificadas: `gerenciar_memoria` (`ai_memories`) não tem nenhuma tela de consulta/edição no painel; `gerar_documento`/`consultar_historico` (modo DOCUMENTOS) também não têm tela própria — o cliente não consegue ver pelo painel quais PDFs já gerou.

### 8. A progressão está coerente?
Sim — Individual (1 veículo + WhatsApp) → Gestão (até 10 veículos + Painel), sem quebra de dado, sem recriação de cadastro, entitlement automático via a mesma linha de `subscriptions`.

---

# PARTE 15 — CLASSIFICAÇÃO GERAL

| Área | Classificação |
|---|---|
| Onboarding V1 | ✅ COMPLETA |
| Onboarding Gestão | ✅ COMPLETA |
| Checkout Individual (Mensal) | ✅ COMPLETA |
| Checkout Gestão Mensal | ✅ COMPLETA |
| Checkout Gestão Anual (cartão/Pix) | ✅ COMPLETA (ressalva: "sem juros" não é garantia técnica do código) |
| Checkout Empresas | 🔵 ROADMAP (hoje é só mensagem comercial) |
| Entitlement/gating | ✅ COMPLETA |
| 35 ferramentas de IA | ✅ COMPLETA (cada uma individualmente, ver Parte 11) |
| Painel — Veículos/Motoristas/Manutenção/Documentos/Despesas/Alertas/Radar/Rotas/Empresa/Agenda | ✅ COMPLETA |
| Painel — Notícias/Relatórios/Configurações | 🟡 PARCIAL |
| Painel — Dashboard/Checklist(tela)/Jornadas | 🟡 PARCIAL (interface read-only por design, não é falha) |
| Sincronização WhatsApp↔Painel | ✅ COMPLETA nas áreas auditadas |
| Upload de arquivo pelo WhatsApp (Documentos) | 🔵 ROADMAP (hoje só extrai dado, não persiste o arquivo) |
| Confirmação de leitura/entrega de alerta no WhatsApp | 🔴 NÃO EXISTE (documentado como ausência real, não implementado nada fake) |

Nenhum item acima foi classificado como completo só por ter interface visual — todos os "✅ COMPLETA" têm CRUD/persistência real confirmada em código.

---

# PARTE 16 — O QUE O FROTA IA AINDA NÃO FAZ

## Individual
- Upload/persistência do arquivo binário de documento pelo WhatsApp (só extrai dado da foto).
- Confirmação de leitura/entrega de mensagem (WhatsApp/Z-API não oferece, nada foi implementado pra fingir isso).

## Gestão
- Tela de consulta/edição de memórias de IA (`ai_memories`).
- Tela de histórico de documentos gerados (`generated_documents`).
- Vários campos de `company_preferences` sem UI nem consumidor real confirmado (veículo padrão, combustível/preço padrão, velocidade média padrão, margem alvo, moeda, unidade de distância).
- Checkout de verdade pro plano "Empresas" (>10 veículos) — hoje é só resposta de texto comercial.

## Futuro (roadmap explícito, não confundir com pendência atual)
- Integração real com Fretebras/Truckpad no Radar de Fretes (hoje só grupos de WhatsApp autorizados).
- Marketplace, negociação/aceite automático de frete, contratação, pagamento dentro do Radar.
- Telemetria, rastreador, TMS, ERP.

---

# PARTE 17 — FLUXOGRAMA

```
LANDING
  ↓
WHATSAPP
  ↓
cliente novo → cria auth.users + user_channels
cliente existente → reconhece pelo telefone
  ↓
ONBOARDING V1 (11 etapas, sem IA)
  ↓
CONTRATAÇÃO (trial de 7 dias automático; link de checkout se veio de CTA, ou sob pedido depois)
  ↓
MERCADO PAGO (preapproval ou checkout/preferences)
  ↓
WEBHOOK (HMAC + reconsulta na API) → SUBSCRIPTION (1 linha por empresa, sempre UPDATE)
  ↓
        ┌──────────────────────────┴──────────────────────────┐
        │                                                      │
   INDIVIDUAL (MENSAL)                              GESTÃO (GESTAO_MENSAL / ANUAL_*)
   fleet_panel_included = false                     fleet_panel_included = true
        ↓                                                      ↓
   WHATSAPP APENAS                                   GATE /frota/*:
   1 VEÍCULO                                         autenticado → empresa → entitled →
   35 ferramentas de IA                              Google Calendar conectado → onboarding
                                                      Gestão concluído
                                                                 ↓
                                                      ONBOARDING GESTÃO (/frota-ativacao)
                                                      reaproveita empresa/veículo do V1
                                                                 ↓
                                                      Dashboard
                                                                 ↓
                                                      WHATSAPP + PAINEL
                                                      ATÉ 10 VEÍCULOS
                                                      mesmas tabelas/services nos 2 canais
```
