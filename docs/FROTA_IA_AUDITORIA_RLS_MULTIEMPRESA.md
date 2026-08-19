# Frota IA — Auditoria de RLS e Isolamento Multiempresa

**Data:** 2026-08-19
**Escopo:** auditoria de código (estática) das políticas de Row Level Security do Supabase, das funções `SECURITY DEFINER`, dos usos de `createAdminClient()` (service role, bypassa RLS) e dos pontos de entrada da API que resolvem `company_id`.
**Método:** leitura direta de todas as migrations SQL do schema (`supabase/migrations/*.sql`), leitura de todas as rotas `/api/frota/*/[id]/route.ts`, leitura de `/api/chat/route.ts`, `gerarRespostaAssistente.ts`, dos novos fluxos de vínculo de conta (Parte A da unificação de identidade), e consulta real ao banco de produção via `execute_sql` (só leitura, `count(*)`) para calibrar o volume de dados. Complementa — sem duplicar — a auditoria de código das 16 ferramentas de integração/escrita (`docs/FROTA_IA_AUDITORIA_28_TOOLS.md`), que já cobriu isolamento por `company_id` dentro de cada ferramenta de IA.

**Nota de transparência:** o agente inicialmente disparado para esta auditoria foi interrompido no meio (limite de gasto mensal da conta atingido) depois de confirmar só o item de Storage. Todo o restante deste documento foi produzido por mim diretamente, lendo os mesmos arquivos que o agente teria lido — não é uma reformulação do que ele já tinha dito, é investigação nova.

**Não foi feito:** ataque cross-tenant ao vivo (criar "Empresa A"/"Empresa B" fictícias e tentar acessar uma pela outra). Motivo: o banco de produção hoje tem só **3 empresas reais** (1 com painel habilitado — confirmado via `select count(*) from companies`), não há ambiente de staging separado, e criar empresas fictícias seria uma escrita em produção fora do que foi pedido como "só leitura/seguro". A auditoria abaixo é 100% baseada em leitura de política declarada + rastreamento de código, que é uma evidência mais forte de qualquer forma (a política vale para *todo* dado, não só para o par de empresas testado).

---

## 1. Inventário completo de tabelas e políticas RLS

Todas as 29 tabelas do schema têm RLS habilitado. Tabela = arquivo de migration de origem.

| Tabela | `company_id`? | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|
| `profiles` | não (é por usuário) | `id = auth.uid()` | — (só trigger) | `id = auth.uid()` | — |
| `companies` | é a própria PK | `is_company_member(id)` | `auth.uid() is not null` | `has_company_role(owner,admin)` | — |
| `company_members` | sim | dono OU `has_company_role(owner,admin)` | `has_company_role(owner,admin)` OU bootstrap (1º owner de empresa vazia) | `has_company_role(owner,admin)` | `has_company_role(owner,admin)` |
| `user_channels` | não (por usuário) | dono | dono | dono | dono |
| `vehicles` | sim | `is_company_member` | `has_company_role(owner,admin,operator)` | idem | `has_company_role(owner,admin)` |
| `vehicle_cost_profiles` | sim | `is_company_member` | `has_company_role(owner,admin,operator)` | idem | `has_company_role(owner,admin)` |
| `vehicle_tire_profiles` | sim | `is_company_member` | `has_company_role(owner,admin,operator)` | idem | `has_company_role(owner,admin)` |
| `saved_routes` | sim | `is_company_member` | `has_company_role(owner,admin,operator)` | idem | `has_company_role(owner,admin)` |
| `company_preferences` | sim | `is_company_member` | `has_company_role(owner,admin)` | `has_company_role(owner,admin)` | — |
| `conversations` | sim | `is_company_member` | `is_company_member` | `is_company_member` | — |
| `messages` | sim | `is_company_member` | `is_company_member` | — (log imutável) | — |
| `ai_memories` | sim | `is_company_member` | `has_company_role(owner,admin,operator)` | idem | — (soft delete só via admin) |
| `analysis_runs` | sim | `is_company_member` | — (só backend) | — | — |
| `tool_executions` | sim | `is_company_member` | — (só backend) | — | — |
| `google_integrations` | sim (col. `company_id`, ampliado 2026-08-19) | dono OU `is_company_member(company_id)` | dono | dono | dono |
| `calendar_action_logs` | não (por usuário) | dono | dono | — | — |
| `drivers` | sim | `is_company_member` | `has_company_role(owner,admin,operator)` | idem | `has_company_role(owner,admin)` |
| `vehicle_documents` | sim | `is_company_member` | `has_company_role(owner,admin,operator)` | idem | `has_company_role(owner,admin)` |
| `maintenance_schedules` | sim | `is_company_member` | `has_company_role(owner,admin,operator)` | idem | `has_company_role(owner,admin)` |
| `checklist_dispatches` | sim | `is_company_member` | — (só backend/cron) | — (resposta gravada via admin) | — |
| `subscriptions` | sim | `is_company_member` | — (só backend) | — | — |
| `payment_events` | sim (nullable) | — (nenhuma policy — só admin lê) | — | — | — |
| `trial_usage` | sim (nullable) | — (nenhuma policy — só admin) | — | — | — |
| `scheduled_alerts` | sim | `is_company_member` | — (só backend) | — | — |
| `generated_documents` | sim | `is_company_member` | — (só backend) | — | — |
| `expenses` | sim | `is_company_member` | — (só backend, ver §5) | — | — |
| `onboarding_sessions` | não (por usuário, pré-empresa) | dono (`user_id = auth.uid()`) | — | — | — |
| `saved_journeys` | sim | `is_company_member` | — (só backend) | — | — |
| `news_digests` | **não — deliberado** (ver §1.1) | qualquer `authenticated` | — (só backend) | — | — |

### 1.1 — Único caso "sem `company_id`" que merece nota

`news_digests` não tem `company_id` e a policy de SELECT é `for select to authenticated using (true)` — qualquer usuário autenticado do produto lê a tabela inteira. **Isso é intencional e documentado no próprio comentário da migration** (`20260813191200_create_news_digests.sql:12-16`): o conteúdo é um resumo do setor gerado 1x por execução do cron e reenviado pra todas as empresas elegíveis — não existe versão "por empresa" desse dado, então não há nada de sensível a vazar entre empresas. Não é um achado de segurança, é uma tabela cujo dado nunca foi por empresa.

### 1.2 — Tabelas sem nenhuma policy de escrita para `authenticated`

`analysis_runs`, `tool_executions`, `google_integrations` (parcial — dono ainda escreve), `checklist_dispatches`, `subscriptions`, `payment_events`, `trial_usage`, `scheduled_alerts`, `generated_documents`, `expenses`, `saved_journeys`, `news_digests` — todas escritas exclusivamente pelo `createAdminClient()` (service role) no backend. Cada uma tem um comentário SQL explícito confirmando a decisão ("Sem policy de insert: hoje só o backend..."). Isso é consistente e deliberado em todo o schema, não um esquecimento pontual — o padrão do projeto é: dado gerado por IA/webhook/cron nunca é gravável direto por sessão de navegador.

---

## 2. Funções `SECURITY DEFINER`

Três funções, todas em `supabase/migrations/20260726235723_create_rls_policies.sql`, todas com `set search_path = public` fixo (evita SQL injection via search_path malicioso) e `stable` (sem efeito colateral):

- **`is_company_member(target_company_id uuid) returns boolean`** — `exists (... where company_id = target_company_id and user_id = auth.uid() and status = 'active')`. Depende só de `auth.uid()` (não aceita `user_id` como parâmetro) — impossível de manipular pra checar a associação de outro usuário.
- **`has_company_role(target_company_id uuid, allowed_roles company_member_role[]) returns boolean`** — mesma base, mais `role = any(allowed_roles)`.
- **`default_company_id() returns uuid`** — retorna a empresa padrão do usuário logado, usada em queries do app, não em nenhuma policy crítica de escrita.

Nenhuma das três aceita `user_id` como parâmetro (só `auth.uid()`, resolvido pelo JWT da sessão) — isso fecha a classe de vulnerabilidade mais comum desse padrão (alguém forjar `is_company_member(minhaEmpresa, outroUserId)`). `SECURITY DEFINER` é necessário aqui especificamente para evitar recursão de RLS (a policy de `company_members` chamaria a si mesma sem isso) — comentado explicitamente na migration.

## 3. Matriz real de papéis (`has_company_role`)

Confirmada por leitura direta, não presumida:

| Operação | `owner`/`admin` apenas | `owner`/`admin`/`operator` | Qualquer membro |
|---|---|---|---|
| DELETE em qualquer tabela operacional (`vehicles`, `drivers`, `vehicle_documents`, `maintenance_schedules`, `saved_routes`) | ✅ | | |
| UPDATE/INSERT em `companies`, `company_preferences`, `company_members` | ✅ | | |
| INSERT/UPDATE em `vehicles`, `vehicle_cost_profiles`, `vehicle_tire_profiles`, `saved_routes`, `drivers`, `vehicle_documents`, `maintenance_schedules`, `ai_memories` | | ✅ | |
| SELECT em qualquer tabela com `company_id` | | | ✅ (`is_company_member`, sem exigência de papel) |
| INSERT/UPDATE em `conversations`/`messages` | | | ✅ (`is_company_member`, sem exigência de papel) |

Papel `viewer` (existe no enum `company_member_role`, confirmado no schema): tem SELECT em tudo, mas nenhuma policy de escrita o inclui — é estritamente somente-leitura em todas as 29 tabelas. Consistente com o comentário explícito em `ai_memories` ("viewer não altera dados... pode ler").

## 4. `createAdminClient()` — inventário completo (32 arquivos)

Grep de `createAdminClient()` em `src/` retorna exatamente 32 arquivos. Categorizados:

- **16 ferramentas de IA** (`src/ai/tools/*.ts`) — já auditadas em profundidade em `docs/FROTA_IA_AUDITORIA_28_TOOLS.md`; toda escrita filtra por `companyId` reinjetado pelo backend (ver §6), com 2 achados já reportados lá (P2/P3), nenhum de vazamento cross-tenant.
- **5 rotas `/api/frota/*/[id]/route.ts` e `/route.ts`** (despesas, documentos, manutenção) — auditadas diretamente nesta investigação (§5), todas passam `access.company.id` explicitamente para o serviço, que sempre encadeia `.eq("company_id", companyId)` na query real.
- **4 rotas de cron/dispatch** (`checklists`, `alerts`, `news`, `subscriptions/trial-warnings`) — já auditadas em `docs/FROTA_IA_CRONS_AUTOMACOES.md`; autenticadas por token estático (não por sessão/empresa), processam todas as empresas elegíveis por desenho (é o próprio propósito da rota), sem relação com isolamento multiempresa de usuário final.
- **1 webhook do WhatsApp** (`/api/whatsapp/webhook/route.ts`) — resolve `companyId` a partir do telefone remetente via `resolveOrCreateUserByPhone`/`loadCustomerContext`, nunca aceita `companyId` vindo do payload da mensagem.
- **1 webhook do Mercado Pago** (`/api/payments/mercadopago/webhook/route.ts`) — fora do escopo desta auditoria (módulo de pagamento, explicitamente não tocado por instrução do Rafael); não li o conteúdo.
- **3 rotas novas de vínculo de conta** (`/auth/account/link`, `/api/auth/account/confirm`, `/app/auth/account/confirm/page.tsx`) — auditadas diretamente nesta investigação (§7); `companyId` sempre vem do payload de um token HMAC assinado pelo backend, nunca do corpo da requisição do cliente.
- **`googleCalendarService.ts`** — já re-verificado durante a implementação da Parte A (lookup por `companyId`, não mais por `userId`).
- **`src/lib/supabase/admin.ts`** — a própria definição do client (import `server-only`, não instanciável no browser).
- **`src/app/onboarding/actions.ts`** — cria a empresa e o primeiro `company_members` (bootstrap, precisa de admin client porque a sessão ainda não tem nenhuma empresa associada até esse ponto).

**Conclusão do item mais crítico da auditoria:** não foi encontrado nenhum uso de `createAdminClient()` que faça uma query de leitura ou escrita sem filtro de `company_id` (explícito na query, ou implícito porque o registro só é alcançável a partir de um `companyId` já validado, como o vínculo de conta via token assinado). Onde o padrão é "buscar por `id` e checar `company_id` em código depois" (`getVehicle`, `getRoute`, `getSavedJourney` — já sinalizado em `FROTA_IA_AUDITORIA_28_TOOLS.md` como item P3 de dívida técnica), todo chamador confirmado hoje faz a checagem — mas o padrão em si é frágil a longo prazo (ver §9).

## 5. Rotas `/api/frota/*/[id]/route.ts` — verificação de posse (PATCH/DELETE)

Lidas as 5 rotas por inteiro (`despesas`, `documentos`, `manutencao`, `veiculos`, `motoristas`):

| Rota | Client usado | Ownership check |
|---|---|---|
| `despesas/[id]` PATCH/DELETE | admin | `updateExpense`/`deleteExpense` recebem `access.company.id` e encadeiam `.eq("id", x).eq("company_id", companyId)` — confirmado linha a linha em `expenseService.ts:77-100` |
| `documentos/[id]` PATCH | admin | `updateVehicleDocument` idem, `.eq("id", documentId).eq("company_id", companyId)` em `vehicleDocumentService.ts:72-90` |
| `manutencao/[id]` PATCH | admin | `updateMaintenanceSchedule` idem em `maintenanceScheduleService.ts:43-51` |
| `veiculos/[id]` PATCH | sessão (RLS) | `updateVehicle(supabase, id, access.company.id, ...)` — RLS já barra cross-company, e o serviço também recebe `companyId` explícito (dupla proteção) |
| `motoristas/[id]` PATCH | sessão (RLS) | `updateDriver(supabase, id, access.company.id, ...)` — mesma dupla proteção |

Todas as 5 tratam `PGRST116` (update/delete que não afeta nenhuma linha — id de outra empresa ou inexistente) como 404 "não encontrado", nunca vazando se o ID existe em outra empresa. **Nenhum achado.**

## 6. `/api/chat` — validação de `conversationId`

`src/app/api/chat/route.ts:51-57`: quando o cliente manda `conversationId`, a rota chama `getConversationById(supabase, ...)` — usando o client de **sessão** (respeita RLS, então uma conversa de outra empresa já não seria retornada por RLS sozinha) — e ainda soma uma checagem explícita em código: `if (!conversation || conversation.user_id !== userId) return 404`. Dupla proteção (RLS + checagem de aplicação), mesmo padrão usado nas rotas `[id]` acima. **Nenhum achado.**

## 7. Reinjeção de contexto em `gerarRespostaAssistente.ts`

Confirmado de novo (linha 199-205): antes de qualquer ferramenta executar, os 4 campos reservados (`userId`, `companyId`, `conversationId`, `sourceMessageId`, listados em `CAMPOS_DE_CONTEXTO_RESERVADOS`, `src/lib/anthropic/tools.ts:20`) são **deletados** do input vindo do modelo (`for (const campo of CAMPOS_DE_CONTEXTO_RESERVADOS) delete inputDoModelo[campo]`) e **depois** sempre reescritos com o valor resolvido pelo backend (`entradaFinal = { ...inputDoModelo, userId, companyId, conversationId, ... }`) — a ordem do spread garante que mesmo que a deleção falhasse por algum motivo, os valores finais ainda venceriam. Dupla trava. Os 4 nomes de campo são exatos e não têm variante parecida em nenhuma ferramenta (`FERRAMENTAS_FROTA_IA`) que pudesse escapar da lista — confirmado por não ter aparecido nenhum campo tipo `company_id`/`empresaId` em nenhuma definição de parâmetro visível ao modelo (`parametrosVisiveis` já filtra os 4 reservados antes de montar o schema JSON enviado à Anthropic). `saveToolExecution` recebe `companyId` como parâmetro top-level do chamador (`customerContext.ts:126-128`), nunca extraído do resultado da ferramenta. **Nenhum achado.**

## 8. Google Calendar — isolamento pós Parte A

A migration `20260819100000_google_integrations_company_scope.sql` **soma** (nunca substitui) uma policy de SELECT por `is_company_member(company_id)` — INSERT/UPDATE/DELETE continuam exclusivos do dono (`user_id = auth.uid()`) ou do backend admin. O refresh token do Google fica só no Supabase Vault, que não é exposto por nenhuma policy de RLS de tabela (é acessado só via função de banco separada, chamada pelo backend). Ou seja: membros da empresa passam a ver que existe uma conexão (metadado), mas nunca o segredo. **Nenhum achado.**

## 9. Vínculo de identidade WhatsApp↔Painel (Parte A, novo)

`buildAccountLinkUrl`/`verifyAccountLinkToken` (`src/services/whatsapp/accountLinkToken.ts`): token HMAC-SHA256 (`createSignedToken`, módulo genérico já usado por `googleCalendarConnectLink.ts`), TTL de 15 minutos, carrega `{companyId, whatsappUserId}` assinado com `WHATSAPP_WEBHOOK_SECRET`. As duas rotas que consomem esse token (`/auth/account/link` e `/api/auth/account/confirm`) **sempre** leem `companyId` do `payload` já verificado — nunca de `request.json()`/`formData()` diretamente — fechando o vetor clássico de mass-assignment ("mandar um `companyId` diferente no corpo da requisição"). Ambas exigem sessão ativa (`supabase.auth.getUser()`) antes de qualquer escrita. Nenhuma fusão automática de empresa acontece sem a tela de confirmação explícita quando o usuário Google já é dono de outra empresa (`route.ts:49-51`). **Nenhum achado.**

## 10. Supabase Storage

Confirmado (checado antes da falha do agente, e novamente por grep direto): não existe nenhum bucket de Storage em uso no projeto. Documentos/PDFs trafegam como base64 direto para o Z-API (WhatsApp), nunca persistidos em Storage. Não há superfície de RLS de Storage a auditar porque a funcionalidade não existe.

## 11. Volume real de dados (calibração)

`select count(*) from companies` → **3 empresas**, das quais **1 com `fleet_panel_enabled = true`** (a conta real do Rafael). Confirma que o produto ainda está em fase de operação muito pequena/pessoal — reforça a recomendação de tratar esta auditoria como preventiva (antes de crescer a base de clientes), não como resposta a um incidente observado.

---

## Itens sinalizados como "requer verificação manual" (não teve 100% de certeza cristalina)

Sendo conservador conforme pedido — nenhum destes é um vazamento confirmado, mas nenhum teve evidência forte o bastante para eu descartar por completo sem um teste ao vivo:

1. **Padrão "leitura por `id` sem `company_id` na query + checagem manual em código"** usado em `getVehicle`, `getRoute`, `getSavedJourney` (`vehicleService.ts:29`, `savedRouteService.ts:18`, `savedJourneyService.ts:57`) — já reportado como P3 em `FROTA_IA_AUDITORIA_28_TOOLS.md`. Hoje seguro (todo chamador confere `row.company_id !== companyId` antes de usar), mas é o único ponto do código onde um novo desenvolvedor (ou eu, numa mudança futura) poderia reintroduzir vazamento cross-tenant silenciosamente só esquecendo a checagem — o Postgres devolveria o registro de qualquer empresa dado o UUID certo, porque o client usado ali é sempre admin (bypassa RLS). Recomendo mover o filtro `company_id` pra dentro dessas 3 funções de serviço como hardening, mesmo sem vazamento ativo hoje.
2. **`gerenciar-documento-frota.ts` não confere se `motoristaId` pertence à empresa antes de vincular um documento a ele** (só confere quando é `veiculoId`) — já reportado como P2 em `FROTA_IA_AUDITORIA_28_TOOLS.md`. Não vaza leitura, mas permite uma referência cruzada indevida entre empresas se alguém souber/adivinhar um UUID de motorista alheio.
3. **`google_integrations` — o índice único parcial em `company_id` planejado (`where connection_status <> 'revoked'`) nunca foi criado.** Confirmado por grep em todas as migrations (`google_integrations` aparece em 5 arquivos — criação da tabela, RLS, índices, Vault, e a extensão de RLS por empresa — nenhum contém constraint de unicidade em `company_id`). A proteção de "1 conexão ativa por empresa" hoje é **só de aplicação**: `upsertGoogleIntegrationStatus` (`googleIntegrationService.ts:39-63`) faz `getGoogleIntegration` (busca existente) e só então decide update-por-id ou insert — sem lock nem constraint no banco. Isso não é um vazamento entre empresas (RLS continua protegendo quem vê o quê), mas é uma janela de corrida real: se duas requisições de conexão simultâneas para a mesma empresa chegarem próximas (ex.: alguém clica "conectar" duas vezes, ou WhatsApp e painel tentam conectar ao mesmo tempo), ambas podem passar pelo `getGoogleIntegration` sem achar nada e inserir 2 linhas "ativas" pra mesma empresa — a próxima leitura (`order by updated_at desc limit 1`) pega só uma, então o sintoma seria "reconectei e voltou a pedir de novo depois", não uma falha de segurança. Recomendo criar o índice único parcial que já estava no plano original, como hardening.
4. **Nenhum teste ao vivo de IDOR foi executado** (por decisão consciente, dado o volume real de dados — ver introdução). A confiança deste relatório vem inteiramente de leitura de política + rastreamento estático de código, que é forte para "a regra está certa", mas não substitui 100% um teste dinâmico caso o Rafael queira essa confirmação adicional antes de abrir o produto pra mais clientes.
5. **Rota do webhook do Mercado Pago não foi lida** — está fora do escopo por instrução explícita (não mexer em pagamento), mas isso também significa que esta auditoria não pode afirmar nada sobre o isolamento multiempresa daquele endpoint especificamente.

## Conclusão

Não foi encontrado nenhum P0/P1 de isolamento multiempresa (nenhum vazamento de leitura nem escrita cross-tenant confirmado). O padrão do projeto — `is_company_member`/`has_company_role` como policies, `companyId` sempre resolvido pelo backend e nunca aceito do cliente nos pontos que testei, dupla proteção (RLS + checagem de aplicação) nos pontos mais sensíveis — é consistente e bem aplicado. Os 2 itens P2/P3 já achados na auditoria das ferramentas (§9.1-2 acima) continuam válidos e são os únicos pontos concretos de melhoria recomendada; nenhuma correção foi aplicada — aguardando sua decisão sobre quais implementar.
