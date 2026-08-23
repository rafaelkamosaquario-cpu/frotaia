# Frota IA — Onboarding 2: Ativação do Painel de Gestão (estado atual)

Branch `claude/frota-ia-assistente-setup-qlrbac`, implementado em 2026-08-23. Este é o **segundo** onboarding oficial do produto — o Onboarding 1 (V1, WhatsApp, "1 usuário + 1 veículo") **não foi alterado** e continua descrito em `docs/FROTA_IA_ONBOARDING_V1_ATUALIZADO_2026-08-23.md`.

## 1. Quem entra

Só chega no Onboarding 2 quem **já tem** (via WhatsApp, Onboarding 1):
- uma conta/empresa criada;
- entitlement de Painel de Gestão (`companies.fleet_panel_enabled` OU `subscriptions.fleet_panel_included` — as duas fontes já existiam, nenhuma nova foi criada);
- login com Google feito e vinculado à mesma empresa (`vincular_painel`, já existente);
- Google Calendar da empresa conectado.

Os 4 primeiros pontos já eram checados pelo gate de `/frota` (`layout.tsx`) — **não foram alterados**. O que mudou foi só a adição de mais uma condição, no fim da cadeia: se `companies.fleet_onboarding_completed_at` for nulo, o cliente é mandado pra `/frota-ativacao` antes de ver qualquer tela do painel.

```
sessão → empresa → entitlement → Google Calendar conectado → onboarding de ativação concluído? → painel
```

**Mensal e anual usam exatamente o mesmo fluxo.** A função que decide entitlement (`isFleetPanelAccessAllowed`) nunca leu `subscriptions.plan` — só `fleet_panel_included` + `status`/`valido_ate` — então a distinção comercial (MENSAL / ANUAL_PARCELADO / ANUAL_PIX) nunca chega a influenciar o onboarding. Nenhuma mudança foi necessária pra isso continuar assim.

## 2. Google — pré-requisito, não etapa do wizard

Diferente da V1 (WhatsApp), onde o Google Calendar só é pedido sob demanda, no Painel de Gestão ele é **obrigatório antes mesmo de chegar no onboarding** — o gate de `/frota` já barra quem não tem Calendar conectado, mandando pra `/frota-conectar-agenda` (rota já existente, sem alteração). Por isso o wizard de ativação (`/frota-ativacao`) **nunca pede login Google nem verifica Calendar** — quando o cliente chega lá, os dois já estão garantidos.

## 3. Reaproveitamento da V1 — nunca duplica

O wizard **não cria empresa nova em nenhum momento**. A primeira tela carrega a empresa e o(s) veículo(s) já existentes via `loadFleetPanelAccess`/`listVehiclesForPanel` (os mesmos services que o painel normal já usa) e simplesmente **mostra** o que já existe. O "Veículo 1" exibido é o veículo padrão (`is_default`) já criado pelo onboarding do WhatsApp — nenhum insert é feito nessa etapa, só leitura.

## 4. Fluxo do wizard (`/frota-ativacao`)

```mermaid
flowchart TD
    A[Passo 1 — Encontramos sua conta] --> A1[Confirma/edita nome da empresa]
    A1 --> A2[Mostra Veículo 1 já existente]
    A2 --> B[Passo 2 — Veículos]
    B --> B1{Adicionar mais?}
    B1 -->|sim, até 10| B2[VehicleFormModal — mesmo formulário do painel]
    B2 --> B
    B1 -->|fazer depois| C[Passo 3 — Motoristas]
    C --> C1{Cadastrar agora?}
    C1 -->|sim| C2[DriverFormModal — mesmo formulário do painel]
    C2 --> C
    C1 -->|fazer depois| D[Passo 4 — Checklist]
    D --> D1{Ativar agora?}
    D1 -->|sim| D2[liga + horário + itens]
    D1 -->|configurar depois| E[Passo 5 — Resumo]
    D2 --> E
    E --> F[companies.fleet_onboarding_completed_at = agora]
    F --> G[/frota/dashboard]
```

**Nenhuma etapa além da configuração do veículo já herdada da V1 é obrigatória.** Veículos extras, motoristas e checklist têm sempre um "fazer depois" que avança sem exigir nada — mas o wizard sempre passa pela tela de resumo final antes de liberar o painel, que é o único momento em que `fleet_onboarding_completed_at` é gravado.

### Telas e textos

**Passo 1 — Encontramos sua conta**
> Encontramos sua conta Frota IA. Vamos preparar seu Painel de Gestão com os dados que você já cadastrou pelo WhatsApp.

Campo: "Como você quer identificar sua empresa ou operação?" (editável, pré-preenchido com o nome já existente). Card com o resumo do Veículo 1 (nome/placa, tipo, eixos, carroceria — os mesmos dados coletados no onboarding V1).

**Passo 2 — Veículos**
> Seu plano permite gerenciar até 10 veículos. Você já tem N cadastrado(s).

Lista dos veículos já cadastrados + botão "Adicionar veículo" (abre o mesmo formulário completo já usado em `/frota/veiculos` — placa, marca, modelo, ano, tipo, eixos, carroceria, consumo, seguro/licenciamento). Botão fica desabilitado ao atingir 10.

**Passo 3 — Motoristas**
> Quer cadastrar seus motoristas agora? Isso não é obrigatório para concluir.

Mesmo formulário já usado em `/frota/motoristas` (nome, telefone, veículo vinculado, CNH, toxicológico).

**Passo 4 — Checklist**
> Quer ativar o checklist diário dos motoristas? Envio automático, todo dia, no horário escolhido.

Liga/desliga + horário (0-23h, Brasília) + os mesmos 4 itens fixos já existentes (óleo, água, pneus, luzes) — nenhum item novo foi inventado.

**Passo 5 — Tudo pronto**
> Seu Painel Frota IA está pronto. Seu WhatsApp e seu painel trabalham juntos sobre a mesma operação. Você pode adicionar ou editar veículos, motoristas, checklists e outras configurações quando quiser.

Resumo (empresa, nº de veículos, nº de motoristas, checklist ativo/inativo, Agenda conectada) + botão "Ir para o Dashboard".

## 5. Limite de veículos — 1 (V1) vs. 10 (Gestão)

Redesenhado nesta mesma implementação. Antes, o limite vinha de `companies.company_type === 'transportadora'` (rótulo escolhido livremente pelo cliente no onboarding V1) — um binário 1×ilimitado, sem relação real com o plano contratado. Agora vem do **entitlement de painel** (mesma fonte do gate, `fleet_panel_enabled` OU `fleet_panel_included`):

| | Sem Painel de Gestão | Com Painel de Gestão |
|---|---|---|
| Veículos ativos | 1 | até 10 |

Fonte central única: `getVehicleLimitForCompany()` (`src/lib/frota/vehicleLimit.ts`), usada por:
1. **Trigger de banco** `enforce_vehicle_limit_by_entitlement` (última linha de defesa — vale mesmo se algum caminho de escrita esquecer de checar);
2. **Tool de IA** `gerenciar_veiculo` (WhatsApp e widget do painel) — se o cliente pedir pra IA cadastrar um 11º veículo, ela recusa;
3. **API do painel** (`/api/frota/veiculos`) — erro 409 com mensagem explicando o limite do plano.

Nenhuma coluna numérica nova — o limite é sempre derivado na hora a partir do entitlement já existente.

## 6. Compatibilidade com quem já usa o painel

Migration com backfill: toda empresa que já tinha `fleet_panel_enabled=true` OU `subscriptions.fleet_panel_included=true` **antes** desta implementação foi marcada com `fleet_onboarding_completed_at = agora` no momento da migration — nunca vê o wizard novo. Confirmado no banco: 1 empresa já enquadrada nesse backfill no momento da aplicação da migration.

## 7. O que NÃO foi implementado nesta tarefa

Preços, checkout, upsell, plano Empresas, cobrança por veículo, mais de 10 veículos, PWA/app — nada disso foi tocado. O onboarding depende só de entitlement (booleano), nunca de valor comercial.

## 8. Banco de dados

Duas migrations, ambas aditivas:
1. `20260823062153_add_fleet_onboarding_completed_at.sql` — nova coluna `companies.fleet_onboarding_completed_at` + backfill.
2. `20260823062200_generalize_vehicle_limit_by_entitlement.sql` — reescreve o trigger de limite de veículos pra usar entitlement em vez de `company_type`.

## 9. Arquivos novos/alterados

**Novos**: `src/app/frota-ativacao/page.tsx`, `AtivacaoFlow.tsx`, `actions.ts`; `src/lib/frota/vehicleLimit.ts` (+ teste).
**Alterados**: `src/app/frota/layout.tsx` (1 linha, novo redirect); `src/ai/tools/gerenciar-veiculo.ts`, `gerenciar-empresa.ts`; `src/lib/frota/vehicleApiErrors.ts`; `src/app/api/frota/veiculos/route.ts` e `[id]/route.ts` (só nomes importados); `src/app/frota/veiculos/VeiculosClient.tsx`; `src/lib/anthropic/systemPrompt.ts`; `src/lib/supabase/database.types.ts` (regerado).
**Não tocados**: todo o Onboarding 1 (WhatsApp), Google Calendar, `vincular_painel`, Radar de Fretes, motor de checklist (cron/resposta/aderência), IA do painel, qualquer tela do painel além dos pontos acima.
