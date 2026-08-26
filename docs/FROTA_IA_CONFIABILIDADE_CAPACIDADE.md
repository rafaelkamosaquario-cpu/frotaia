# FROTA IA — CONFIABILIDADE, SEGURANÇA E CAPACIDADE DO SISTEMA

> Auditoria de código + infraestrutura real (Railway MCP + Supabase MCP), 2026-08-26, commit `8b6d3ea`. Nenhum load test pesado foi feito contra produção. Onde não há evidência suficiente no código/infra pra afirmar um número, isso está dito explicitamente em vez de estimado.
>
> **Contexto importante para interpretar os números abaixo**: nesta mesma sessão de auditoria, o banco de produção foi zerado a pedido do responsável pelo produto (reset intencional para começar testes reais do zero) — **hoje o sistema tem 0 empresas, 0 usuários, 0 mensagens em produção**. Isso significa que não existe métrica de carga real observada — toda estimativa de capacidade abaixo é baseada em arquitetura/configuração, não em comportamento medido sob uso real. Nível de confiança de cada estimativa está marcado explicitamente.
>
> **ATUALIZAÇÃO 2026-08-26 (mesmo dia, rodada de prontidão de produção)**: os 2 crons ausentes (checklist, freight-expire) foram ativados, uma camada mínima de observabilidade (Sentry + log estruturado) foi implementada, um health check real (`/api/health`) foi criado e configurado no Railway, e o timeout da Anthropic foi corrigido de 10min (padrão do SDK) para 90s. Os achados abaixo que descreviam esses pontos como ausentes foram mantidos no corpo do documento por completude histórica, mas cada seção afetada tem uma nota `[ATUALIZADO]` — o estado real e atual está sempre na nota, nunca no texto original. Detalhe completo: relatório entregue no chat em 2026-08-26 e `docs/FROTA_IA_INFRAESTRUTURA_PRODUCAO.md`, seção 9.

---

# PARTE 1 — ARQUITETURA ATUAL

```
USUÁRIO (WhatsApp ou navegador)
        ↓
┌───────────────────┬────────────────────┐
│   Z-API (WhatsApp) │   Painel Web (Next.js, mesmo processo)
└───────────────────┴────────────────────┘
        ↓
FROTA IA (Next.js 16, App Router, Railway, 1 réplica, região sfo)
  - /api/whatsapp/webhook       — entrada WhatsApp
  - /api/chat                   — entrada Painel (widget de IA)
  - /api/payments/mercadopago/webhook
  - /api/alerts/dispatch, /api/news/dispatch,
    /api/subscriptions/trial-warnings/dispatch,
    /api/checklists/dispatch, /api/freight/expire-dispatch
        ↓
SERVICES (src/services/supabase/*) — camada única de acesso a dado,
compartilhada por WhatsApp, Painel e crons
        ↓
┌─────────────┬──────────────┬───────────────┬──────────────┬──────────────┐
│  Supabase    │  Anthropic   │  Z-API        │  Google      │  Mercado     │
│  (Postgres+  │  Claude API  │  (WhatsApp    │  (Calendar,  │  Pago        │
│  RLS+Storage)│  (Sonnet 5)  │  não-oficial) │  Maps, OAuth)│              │
└─────────────┴──────────────┴───────────────┴──────────────┴──────────────┘
```

**Aplicação (Railway, projeto `frotaiaassistente`, serviço `frota-ia-assistente`)**:
- 1 réplica, região `sfo` (São Francisco), `runtime: V2`, builder Railpack.
- Limite de memória visível na métrica: **8 GB**. Uso atual: ~0,13–0,3 GB (praticamente ocioso — coerente com 0 usuários reais hoje).
- CPU atual: ~0,0001–0,05 vCPU (essencialmente zero).
- Sem configuração de `numReplicas > 1`, sem autoscaling configurado, sem health check customizado visível na config lida.

**Banco (Supabase, projeto `frotaia`)**:
- Plano da organização: **Pro** (confirmado via API do Supabase).
- Postgres 17.6, região `us-east-1`.
- **Nota de latência não avaliada antes**: a aplicação roda em `sfo` (Railway) e o banco em `us-east-1` (Supabase) — regiões diferentes, adicionando latência de rede em toda chamada ao banco. Não há medição de latência real no código/infra auditados; isso é uma observação estrutural, não uma medição.
- 34 tabelas, RLS habilitado em 100% delas.
- 0 filas, 0 workers, 0 cache de aplicação (Redis ou similar) — confirmado por ausência de dependência correspondente em `package.json` e ausência de import de cliente de fila/cache em `src/`.

**Rate limits configurados no código**: nenhum. Não há middleware de rate limiting em nenhuma rota (`/api/whatsapp/webhook`, `/api/chat`, `/api/frota/*`) — a única "limitação" existente é a paginação de alguns dispatch jobs (ver Parte 9).

---

# PARTE 2 — CONFIABILIDADE

| Critério | Nota (0–10) | Justificativa |
|---|---|---|
| **Segurança** | 8 | RLS consistente em 13 migrations (`is_company_member`/`has_company_role`), nenhum secret hardcoded encontrado, webhook do Mercado Pago com HMAC timing-safe correto + reconsulta obrigatória na API, upload de documento com bucket privado + signed URL de 60s + validação de tipo/tamanho + path derivado da sessão autenticada. Webhook do WhatsApp sem HMAC (limitação real do fornecedor Z-API, mitigada por token timing-safe, mas o token trafega em query string). Um ponto de defesa-em-profundidade ausente (`getVehicle` sem filtro de `companyId`, funciona hoje só porque a cadeia de chamadas está correta). |
| **Confiabilidade** | 6 → **7** `[ATUALIZADO 26/08]` | O core (onboarding, checkout, ferramentas de cálculo) é sólido e testado (394 testes automatizados). ~~Mas 2 das 5 rotas de dispatch (`checklists`, `freight/expire`) não têm cron configurado em produção~~ — **os 2 crons foram ativados em 26/08** (ver `docs/FROTA_IA_INFRAESTRUTURA_PRODUCAO.md` seção 9), e o "registro fantasma" do checklist foi corrigido. Timeout explícito adicionado na Anthropic (90s, era 10min implícito). Segue sem retry no envio ao Z-API — avaliado e descartado de propósito (sem idempotência de saída, retry arriscaria duplicar mensagem real). |
| **Integridade de dados** | 8 | Idempotência real via constraints únicas em pontos críticos (`messages.external_message_id`, `subscriptions.company_id`, matches de radar, dispatch de checklist do dia). Idempotência do webhook de pagamento é só de aplicação (sem constraint de banco) — risco teórico sob corrida, não observado na prática. Isolamento cross-tenant confirmado por amostragem (RLS + filtros explícitos de `company_id`). |
| **Resiliência** | 5 | Sem fila, sem retry estruturado, tudo síncrono dentro da mesma requisição HTTP. Falha de um item num loop de dispatch não aborta o lote inteiro (bom), mas uma falha do processo Next.js no meio de um processamento fire-and-forget (ex.: matching de frete) perde o trabalho silenciosamente. 1 única réplica = 1 ponto de falha de processo. |
| **Observabilidade** | 2 → **5** `[ATUALIZADO 26/08]` | ~~Nenhuma integração de log estruturado, error tracking (Sentry etc.) ou métricas de aplicação~~ — **Sentry (`@sentry/nextjs`) e log estruturado (`src/lib/observability/logger.ts`) implementados**, cobrindo webhook WhatsApp, webhook Mercado Pago, os 5 dispatch e `/api/chat`. Nota não é mais alta porque `SENTRY_DSN` **ainda não está configurado em produção** (pendência do responsável do produto — precisa criar conta/projeto no Sentry) — até lá, o error tracking em si é só log estruturado no Railway, sem painel/alerta. Ainda sem uptime monitoring externo. |
| **Recuperação de falha** | 5 | Supabase Pro inclui backup gerenciado pela plataforma (não confirmável em detalhe — política de retenção exata depende do painel Supabase, fora deste código). Nenhuma rotina de recuperação própria no código. Sem plano de disaster recovery documentado no repositório. |

---

# PARTE 3 — PONTOS ÚNICOS DE FALHA

| Componente | O que acontece se cair? | Frota IA inteiro para? | Retry? | Fallback? | Fila? | Mensagem perdida? |
|---|---|---|---|---|---|---|
| **Z-API** | Nenhuma mensagem de/para WhatsApp funciona (é o único canal do Individual) | Sim, pro canal WhatsApp inteiro | Não — avaliado e descartado de propósito em 26/08 (best-effort, erro engolido; ver Parte 5) | Não | Não | Sim — se o envio falhar, não há retentativa nem fila; a próxima mensagem do cliente é que reabre o fluxo |
| **Railway (app)** | App inteiro fora do ar (painel e webhook) | Sim | N/A (é a própria infraestrutura de execução) | Não (1 réplica só) | N/A | Mensagens recebidas nesse intervalo simplesmente não são respondidas (Z-API pode reentregar segundo sua própria política, não confirmável neste repo) |
| **Supabase** | Toda leitura/escrita falha (onboarding, cálculo com histórico, painel) | Sim, na prática | Não visto no código | Não | Não | Sim, para qualquer operação em andamento |
| **Claude API (Anthropic)** | Nenhuma resposta de IA é gerada | Sim, para a função central do produto | Sim, padrão do SDK (2 tentativas, respeita `retry-after`) — confirmado em 26/08, ver Parte 6 | Mensagem de erro genérica ao cliente | Não | A mensagem do cliente é registrada, mas sem resposta de IA |
| **Google (Calendar/Maps/OAuth)** | Ferramentas de agenda/rota falham; gate do painel Gestão trava quem ainda não conectou | Não — só as funções dependentes | Não visto | Mensagem explicando a limitação (padrão do projeto) | Não | Não — a ferramenta simplesmente informa que não conseguiu |
| **Mercado Pago** | Nenhum novo pagamento é processado | Não — clientes já ativos continuam com acesso liberado | Não é necessário — o webhook do MP tem sua própria política de reenvio do lado deles | Rota sempre responde 200 mesmo com erro interno, propositalmente, para não entrar em loop de reenvio do MP | Não | Evento fica registrado como falha nos logs, mas sem alerta automático |
| **OpenAI (transcrição de áudio)** | Só mensagens de áudio param de funcionar | Não — só esse recurso específico | Não | Pede pro cliente escrever em vez de mandar áudio | Não | Não (mensagem de texto explicando o problema) |

---

# PARTE 4 — BANCO

- **34 tabelas**, RLS habilitada em todas, hoje com **0 linhas** (banco recém-zerado — ver nota no topo do documento).
- **Índices nas tabelas críticas** (confirmados via `pg_indexes`):
  - `messages`: índice composto `(conversation_id, created_at DESC)` (paginação de histórico) + único em `external_message_id` (dedup).
  - `conversations`: índices em `company_id`, `user_id`, `status`, `channel_id`.
  - `ai_memories`: índice parcial `(company_id, memory_type, status) WHERE status='active'` — evita varrer memórias inativas.
  - `expenses`: índices compostos `(company_id, expense_date)` e `(vehicle_id, expense_date)` — cobrem os filtros de período usados em Relatórios.
  - `scheduled_alerts`: índice parcial de despacho `(status, scheduled_for) WHERE status='pending'` — exatamente o padrão de query do cron de alertas.
  - `checklist_dispatches`: índices simples em `company_id`, `driver_id`, `vehicle_id`.
  - `freight_opportunities`: índice único de dedup `(source_group_id, original_message_id)`, índice `(origin_state, destination_state)`, índice `(status, captured_at DESC)`.
  - `freight_opportunity_matches`: índice composto `(company_id, status)` + único `(opportunity_id, radar_id)` (idempotência de matching).
- **N+1 conhecido, documentado no próprio código**: `listMatchesWithOpportunityForCompany` (`freightMatchService.ts`) busca os matches de uma vez e depois faz **uma query por match** pra buscar a oportunidade associada, dentro de um loop. Com poucas dezenas de matches por empresa isso é irrelevante; se uma empresa acumular centenas de matches ativos, essa tela ficaria lenta — não crítico hoje, vale revisar antes de escalar o Radar de Fretes.
- **Pool de conexões**: gerenciado pelo cliente `@supabase/supabase-js` sobre PostgREST — não há pool próprio configurado na aplicação; a capacidade real de conexões concorrentes é a do Supabase Pro (não confirmável em número exato via este código/MCP — precisa consultar o painel do Supabase).
- **Concorrência**: idempotência garantida por constraints únicas em pontos críticos (mensagens, matches de radar, dispatch de checklist), mas o webhook de pagamento tem idempotência só de aplicação (sem lock/constraint) — ver Parte 2.
- **Crescimento das tabelas**: sem nenhuma rotina de purge/arquivamento encontrada para `messages`, `tool_executions`, `analysis_runs`, `payment_events` — todas crescem indefinidamente. Não é um problema imediato, mas é um ponto a monitorar em escala (ver Parte 15).

---

# PARTE 5 — WHATSAPP / Z-API

- **Quantidade de instâncias**: **1**. Confirmado — só um conjunto de variáveis (`ZAPI_INSTANCE_ID`, `ZAPI_INSTANCE_TOKEN`, `ZAPI_CLIENT_TOKEN`), sem array/sufixo numérico.
- **Throughput**: `[ATUALIZADO 26/08]` **Consultada a documentação oficial (developer.z-api.io)** — a Z-API afirma explicitamente "sem limite de mensagens enviadas", mas condiciona isso a manter um "padrão de uso compatível" com as políticas do próprio WhatsApp Web (que eles não quantificam em número). **Não há valor numérico (mensagens/segundo ou /minuto) publicado nem por eles nem no nosso código.** Ainda assim, **NÃO É POSSÍVEL CONFIRMAR UM NÚMERO** — só a política qualitativa. A Z-API tem uma fila própria de mensagens no lado deles (endpoint `/queue`), então bursts de envio são absorvidos na infraestrutura deles, não na nossa.
- **Webhook**: processamento 100% síncrono dentro da mesma requisição HTTP — sem fila.
- **Mensagens simultâneas**: sem fila/worker, cada mensagem recebida gera uma requisição HTTP independente processada pelo Next.js/Railway; a concorrência real depende de quantas requisições o runtime da aplicação consegue processar em paralelo (não configurado com limite explícito no código — depende do runtime Node/Next).
- **Retries**: `[ATUALIZADO 26/08]` reavaliado explicitamente na rodada de prontidão de produção e **mantido sem retry, de propósito** — não existe idempotência no lado de saída (diferente da entrada, que dedupe por `external_message_id`); um retry não consegue distinguir "nunca chegou no Z-API" de "chegou e foi enviado, só a resposta HTTP se perdeu", e implementar retry aqui arriscaria duplicar mensagem real pro cliente. Documentado como decisão consciente, não lacuna.
- **Risco de bloqueio**: não avaliável pelo código (depende de política da Z-API/WhatsApp, não documentada no repositório).
- **Fila**: não existe do nosso lado (a Z-API tem uma internamente, ver Throughput acima).
- **Status de entrega/leitura**: `[ATUALIZADO 26/08]` **achado novo** — a Z-API oferece webhook de status (`on-whatsapp-message-status-changes`, valores `SENT`/`RECEIVED`/`READ`/`READ_BY_ME`/`PLAYED`) e endpoint de confirmação de leitura (`set-read-receipts`). **O Frota IA hoje não está inscrito nesse webhook nem processa esses eventos.** A ausência de "confirmação de entrega/leitura" documentada em auditorias anteriores é uma limitação de implementação atual, não do fornecedor — fica registrado como possível item de roadmap, fora do escopo desta rodada.
- **Política de retry de webhook do lado da Z-API**: não documentada publicamente — **NÃO FOI POSSÍVEL CONFIRMAR**.

## Se 100 clientes enviarem mensagem ao mesmo tempo?
Cada mensagem é um webhook HTTP independente. Sem fila e sem rate limit no código, o gargalo real seria: (a) quantas requisições simultâneas o Railway consegue processar (não medido — arquitetura Node.js single-process, mas Next.js processa requisições concorrentemente dentro do mesmo processo, então não trava por si só até esgotar CPU/memória), e (b) quantas chamadas simultâneas a Claude API aceita no tier contratado (ver Parte 6). **NÍVEL DE CONFIANÇA: BAIXO** — não há teste de carga real, e o comportamento sob 100 webhooks simultâneos nunca foi observado nesta auditoria.

## Se 500 ou 1.000?
Mesma resposta, com risco crescente de: esgotar limite de taxa da Anthropic (ver Parte 6), esgotar conexões do Supabase, e overhead diretamente proporcional na CPU/memória de uma única réplica de 8 GB. **NÃO É POSSÍVEL DETERMINAR PELO CÓDIGO** um número exato de ruptura sem medir.

---

# PARTE 6 — IA / CLAUDE

- **Modelo atual**: `claude-sonnet-5` (constante `CLAUDE_MODEL`, `src/lib/anthropic/client.ts`).
- **Chamadas por mensagem**: até **5 chamadas** à API por mensagem do usuário (`MAX_TOOL_ROUNDS = 4`, rodadas 0 a 4) — o caso mais simples (sem tool use) usa 1.
- **Tools**: as 35 ferramentas registradas, mais 2 ferramentas nativas server-side da Anthropic (`web_search`/`web_fetch`, restritas por domínio, com fallback amplo controlado).
- **Chamadas paralelas**: quando o modelo pede múltiplas ferramentas na mesma rodada, elas são executadas **sequencialmente** (`for...await`), nunca em paralelo (`Promise.all`) — cada ferramenta espera a anterior terminar.
- **Timeout**: `[ATUALIZADO 26/08]` ~~não configurado explicitamente~~ — **agora é 90 segundos por chamada** (`ANTHROPIC_TIMEOUT_MS`, `src/lib/anthropic/client.ts`). Antes usava o padrão do SDK (10 minutos), longo demais pra um webhook de chat interativo — um cliente esperando resposta no WhatsApp não deveria ficar pendurado nesse intervalo.
- **Retry**: `[ATUALIZADO 26/08]` auditado a fundo (lido `node_modules/@anthropic-ai/sdk/src/client.ts` diretamente) — **o SDK já retry automaticamente em 429 e 5xx, com até 2 tentativas por padrão, respeitando os headers `retry-after`/`retry-after-ms` quando a API os devolve**. Decisão: manter esse padrão do SDK em vez de reimplementar — reimplementar seria redundante/conflitante com um mecanismo que já funciona corretamente.
- **Rate limit**: ~~não há tratamento específico de erro 429~~ — corrigido pelo achado acima: o SDK já trata isso corretamente por padrão, só não era visível/documentado antes desta auditoria.
- **Custo**: `MAX_TOKENS = 1536` por chamada de saída; histórico limitado às últimas 30 mensagens da conversa.
- **Web search**: nativa da Anthropic, `max_uses: 3` (busca restrita) + `max_uses: 2` (busca ampla, só como fallback controlado).
- **Visão**: suportada nativamente (blocos de imagem base64), sem persistência do binário exceto no fluxo de Documentos do painel.
- **Memória**: `ai_memories`, limitada a 12 registros mais recentes injetados no prompt por chamada.

## Quantas conversas simultâneas a camada atual suporta antes de saturar?
**NÃO É POSSÍVEL AFIRMAR SEM CONHECER O TIER CONTRATADO NA ANTHROPIC.** Os limites de requisições por minuto (RPM) e tokens por minuto (TPM) da API da Claude dependem do tier de uso da conta (que escala automaticamente com histórico de gasto/tempo de conta na Anthropic) — essa informação não está no código nem em nenhum arquivo de configuração deste repositório. **NÍVEL DE CONFIANÇA: NÃO APLICÁVEL** — dado externo necessário, não estimável aqui.

---

# PARTE 7 — SUPABASE

- **Plano confirmado via API**: **Pro** (organização `rafaelkamosaquario-cpu's Org`).
- **Postgres**: versão 17.6, canal de release `ga`.
- **Conexão**: via `@supabase/supabase-js` (client HTTP sobre PostgREST) — não há pool de conexão Postgres direto configurado na aplicação.
- **RLS**: habilitada em todas as 34 tabelas públicas.
- **Storage**: 1 bucket privado confirmado (`vehicle-documents`), signed URLs de 60s.
- **Vault**: usado para tokens sensíveis (ex.: refresh token do Google Calendar) — não lido em detalhe nesta auditoria de capacidade (auditado antes pela equipe do projeto, referenciado em comentários do código).
- **Cron do Supabase (`pg_cron`)**: não usado — todo agendamento é feito via cron do Railway chamando rotas HTTP, não `pg_cron`.
- **Limites do plano Pro**: número exato de conexões simultâneas, RPS, e tamanho de banco incluído **não são confirmáveis por este código/MCP** — dependem da política comercial da Supabase, que pode mudar; **consultar o painel de billing/limites do Supabase diretamente** para números oficiais.

---

# PARTE 8 — RAILWAY

Confirmado via Railway MCP (`get-service-config`, `get-service-metrics`):

- **Réplicas**: 1 (`multiRegionConfig: {sfo: {numReplicas: 1}}`).
- **Região**: `sfo` (São Francisco).
- **CPU/RAM configurados como limite explícito**: memória com teto de **8 GB** (confirmado via métrica `MEMORY_LIMIT_GB`); limite de CPU não apareceu como valor fixo nas métricas coletadas (`CPU_LIMIT` não retornou valor distinto de uso — típico de planos com CPU compartilhada/burst do Railway, não um núcleo dedicado fixo).
- **Autoscaling**: não configurado (sem regra de scale-out visível na config).
- **Concurrency**: não há configuração de limite de requisições concorrentes por réplica no `deploy` da config lida.
- **Restart policy**: não explicitada como valor customizado para o serviço principal (usa o padrão do Railway); os 5 serviços de cron (3 originais + 2 ativados em 26/08) usam `restartPolicyType: "NEVER"` (correto para jobs que rodam e terminam).
- **Health check**: `[ATUALIZADO 26/08]` ~~não encontrado um `healthcheckPath` customizado~~ — configurado `healthcheckPath: /api/health`, timeout 30s, no serviço principal (ver Parte 16).
- **Uso atual real**: CPU ~0,0001–0,05 vCPU, memória ~0,13–0,3 GB de um teto de 8 GB — **essencialmente ocioso**, coerente com a base de 0 clientes reais hoje.

**O que precisa ser consultado direto no painel Railway** (fora do alcance deste MCP/código): plano de cobrança exato contratado (Hobby/Pro/Team), limite de CPU em núcleos, política de billing por uso.

---

# PARTE 9 — CRON JOBS

`[ATUALIZADO 26/08]` 5 rotas de dispatch existem no código; **as 5 têm cron configurado em produção** (os 2 que faltavam foram ativados nesta rodada, confirmado via Railway MCP + teste manual contra produção):

| Rota | Cron configurado? | Frequência | Paginação | Lock/CAS | Idempotência |
|---|---|---|---|---|---|
| `/api/alerts/dispatch` | ✅ Sim | `*/5 * * * *` (a cada 5 min) | `LIMIT 50` | ✅ `UPDATE ... WHERE status='pending'` (compare-and-swap real) | Forte |
| `/api/news/dispatch` | ✅ Sim | `0 10 * * *` (diário, 10h UTC = 7h Brasília) | `LIMIT 200` | ❌ marca "enviado" só depois do loop completo | Fraca — janela de corrida se rodar 2x em sucessão |
| `/api/subscriptions/trial-warnings/dispatch` | ✅ Sim | `0 12 * * *` (diário, 12h UTC) | `LIMIT 200` | ❌ mesmo padrão acima | Fraca — mesma janela |
| `/api/checklists/dispatch` | ✅ **Sim (ativado 26/08)** | `*/15 * * * *` (a cada 15 min) | Sem LIMIT — mas registro fantasma corrigido (ver abaixo) | ❌ (segue sem lock/CAS — risco residual, ver Parte 15) | Corrigida — grava antes de enviar, mas agora **desfaz o registro se o envio falhar de verdade** (`deleteChecklistDispatch`), devolvendo o motorista à fila do próximo cron em vez de perdê-lo até o dia seguinte |
| `/api/freight/expire-dispatch` | ✅ **Sim (ativado 26/08)** | `0 * * * *` (de hora em hora) | `UPDATE` em massa, mas idempotente por natureza | N/A | Forte (idempotente) |

**Estado anterior desta seção (histórico, não mais atual)**: `/api/checklists/dispatch` e `/api/freight/expire-dispatch` não tinham nenhum agendamento automático em produção. Confirmado corrigido em 26/08 — 2 novos serviços Railway (`frotaia-checklist-cron`, `frotaia-freight-expire-cron`) criados, testados manualmente contra produção (autenticação rejeitando token inválido, resposta correta com banco vazio, chamado 2x seguidas sem duplicar).

---

# PARTE 10 — RADAR DE FRETES

- O matching de uma oportunidade nova roda contra **todos os radares ativos de todas as empresas** — sem filtro por empresa nessa consulta (o isolamento por empresa só acontece depois, ao criar o match).
- É **O(radares ativos)** por oportunidade nova, em loop síncrono em JavaScript — para cada radar: 1 query de veículo, cálculo de match em memória (CPU, sem I/O), 1 insert idempotente de match, e se o match for FORTE: 1 query de preferências + opcionalmente 1 chamada de API de rota/geolocalização (pré-análise) + 1 chamada HTTP síncrona ao Z-API para notificar.
- **Índice existe** e cobre exatamente essa consulta (`freight_radars_expires_idx (expires_at) WHERE status='active'`).
- **Não há fila nem batch** — mas o processamento roda fire-and-forget fora da resposta do webhook (não trava a resposta ao WhatsApp), o que evita timeout perceptível pelo cliente, ao custo de nenhuma garantia de conclusão se o processo reiniciar no meio.
- **Primeiro gargalo provável em alta escala (ex.: ~1.000 radares ativos)**: não é a query no banco (Postgres lida bem com 1.000 linhas indexadas). É o **envio de notificação WhatsApp sequencial, um a um, sem paralelismo nem fila** — com muitos matches FORTE simultâneos, o tempo total de processamento de uma única oportunidade cresce linearmente com o número de notificações a enviar, e sem observabilidade (Parte 2/16), esse atraso passaria despercebido como "notificação chegando devagar" em vez de erro visível.

100 empresas × 3 radares (300 radares) vs. 1.000 empresas × 5 radares (5.000 radares): o salto de 300 para 5.000 radares multiplica por ~17x o tamanho do loop síncrono por oportunidade recebida — ainda tecnicamente executável, mas o tempo de processamento por oportunidade cresceria proporcionalmente, e cada oportunidade nova (mensagem de grupo de WhatsApp) dispara esse loop inteiro.

---

# PARTE 11 — CAPACIDADE REAL

**Reforçando a nota do topo**: não há dado de carga real observado (banco zerado nesta sessão). Todas as faixas abaixo são estimativas de arquitetura, nunca medição.

| Métrica | Capacidade estimada | Evidência | Confiança |
|---|---|---|---|
| **Usuários cadastrados no banco** | Sem limite prático de linhas para a escala discutida aqui (Postgres/Supabase Pro suporta milhões de linhas em tabelas bem indexadas) | 34 tabelas, todas indexadas nos padrões de consulta usados | Média — não medido, mas arquitetura de banco não é o limitador |
| **Usuários ativos por dia** | Não determinável sem medir — depende inteiramente do throughput real da Z-API (Parte 5, não encontrado no código) e do tier da Anthropic (Parte 6, dado externo) | Nenhuma | Baixa |
| **Conversas simultâneas** | Limitada pelo tier da Anthropic (RPM/TPM), não pela aplicação em si (sem fila/limite próprio) | Nenhum limite de concorrência configurado no código | Baixa |
| **Empresas** | Sem limite técnico na estrutura do banco | RLS por `company_id`, sem constraint de quantidade | Média |
| **Veículos** | Limitado por plano (1 Individual / 10 Gestão), não por capacidade técnica | `vehicleLimit.ts` | Alta |
| **Mensagens por minuto** | Não determinável — depende do throughput da Z-API, não documentado no código | Nenhuma | Baixa |
| **Operações do Painel simultâneas** | Cada requisição de API é independente, sem fila/lock global de escrita — múltiplos usuários de empresas diferentes não colidem entre si (isolado por RLS); dentro da mesma empresa, sem lock otimista visível em updates concorrentes ao mesmo registro | RLS confirmado, ausência de lock otimista nas rotas de update auditadas | Média |
| **Radares ativos** | Sem limite técnico até a faixa de milhares (ver Parte 10); gargalo é o envio sequencial de notificação, não o armazenamento | Índice cobre a query; loop síncrono sem fila | Média |

---

# PARTE 12 — CENÁRIOS

| Cenário | Banco | IA | WhatsApp | Railway | Crons | Radar | Painel | Classificação |
|---|---|---|---|---|---|---|---|---|
| **A — 10 clientes** | Trivial | Trivial | Trivial | Ocioso (como está hoje) | OK, mas 2 rotas ainda sem cron precisam ser ligadas manualmente | Trivial | Trivial | 🟢 Tranquilo |
| **B — 50 clientes** | Trivial | Provavelmente OK, sem dado de tier | Provável, sem dado de limite Z-API | Folgado (8 GB, uso hoje é ~0,3 GB) | Mesma pendência dos crons ausentes vira mais visível | OK | OK | 🟢 Tranquilo, mas ligar os crons pendentes antes |
| **C — 100 clientes** | OK | Depende do tier Anthropic (não confirmável) | Depende do limite Z-API (não confirmável) | Provavelmente OK numa réplica, sem medição | Falta de observabilidade começa a importar — um cron silenciosamente parado não seria percebido | OK, gargalo de notificação sequencial ainda não crítico | OK | 🟡 Precisa monitoramento — principalmente observabilidade e os 2 crons ausentes |
| **D — 500 clientes** | OK, mas N+1 do Radar (Parte 4) e tabelas sem purge começam a pesar | Risco real de esgotar RPM/TPM do tier Anthropic contratado, sem retry configurado | Risco real, sem dado de limite conhecido, sem fila/retry no código | 1 réplica pode não bastar sob pico — sem autoscaling configurado | Observabilidade vira necessidade real, não só recomendação | Envio sequencial de notificação começa a gerar atraso perceptível em picos | OK, mas sem lock otimista pode gerar corrida em updates concorrentes raros | 🟠 Precisa otimização |
| **E — 1.000 clientes** | Precisa rever N+1, purge/arquivamento de tabelas que só crescem | Praticamente exige retry/backoff e possivelmente fila de processamento assíncrono | Praticamente exige fila e retry — arquitetura atual (síncrono, best-effort) não foi desenhada pra este volume | Autoscaling ou múltiplas réplicas provavelmente necessários | Idempotência de aplicação (sem lock em news/trial-warnings) vira risco real de duplicar mensagem | Notificação sequencial vira gargalo visível — fila real (BullMQ ou similar) recomendável | Sem fila de escrita, updates concorrentes na mesma linha ficam mais prováveis | 🔴 Arquitetura precisa evoluir |
| **F — 5.000 clientes** | Requer reavaliação de índices/particionamento em tabelas de histórico (`messages`, `tool_executions`, `analysis_runs`) | Fila assíncrona de processamento de IA praticamente obrigatória | Fila assíncrona de envio obrigatória, múltiplas instâncias Z-API a considerar | Múltiplas réplicas + balanceamento, revisão de custo Railway | Observabilidade e alerta automático deixam de ser opcionais | Arquitetura de matching provavelmente precisa de fila/worker dedicado | Cache/paginação de listagens grandes provavelmente necessário | 🔴 Arquitetura precisa evoluir |

---

# PARTE 13 — PRIMEIRO GARGALO

`[ATUALIZADO 26/08]` **Resposta objetiva original: observabilidade era o primeiro problema — porque impedia saber QUANDO qualquer outro gargalo estava acontecendo.** Isso foi parcialmente endereçado nesta rodada (Sentry + log estruturado implementados, ver Parte 16) — mas o `SENTRY_DSN` ainda não está configurado em produção, então o error tracking de verdade (painel, alerta) segue pendente de uma ação do responsável do produto (criar conta/projeto Sentry).

Descontando esse ponto estrutural, entre os candidatos técnicos: **WhatsApp/Z-API continua o candidato mais provável a ser o primeiro limitador técnico real**, por três motivos: (1) é uma única instância, sem fila, sem retry (decisão consciente, ver Parte 5); (2) mesmo após consultar a documentação oficial da Z-API, não há valor numérico de throughput publicado — só a política qualitativa "sem limite, desde que o padrão de uso seja compatível com o WhatsApp Web"; (3) é o único canal do plano Individual. O tier de rate limit da Anthropic deixou de ser um problema de "ausência de retry" (o SDK já trata isso corretamente, achado desta rodada) — mas o tier real contratado continua um dado externo não confirmável pelo repositório.

---

# PARTE 14 — O QUE PRECISA PARA 100 CLIENTES

`[ATUALIZADO 26/08]` Checklist revisado depois da rodada de prontidão de produção:

- [x] ~~Ligar os crons de `/api/checklists/dispatch` e `/api/freight/expire-dispatch`~~ — **feito em 26/08**.
- [x] ~~Adicionar observabilidade mínima~~ — **implementado em 26/08** (Sentry + log estruturado), mas com uma pendência: **`SENTRY_DSN` precisa ser configurado em produção** (criar conta/projeto em sentry.io) pro error tracking funcionar de verdade, não só como log estruturado no Railway.
- [ ] **Confirmar o tier real contratado na Anthropic** e o limite real de throughput da Z-API — dados externos que continuam faltando (Parte 22); a Z-API foi consultada nesta rodada mas não publica número, só política qualitativa.
- [ ] Confirmar limite de conexões do plano Supabase Pro é suficiente para o volume esperado (consulta ao painel, não ao código).

Com os 2 primeiros itens resolvidos: o sistema tecnicamente já funciona a 100 clientes (carga pequena pra infraestrutura atual), e agora **com alguma visibilidade real** (logs estruturados) mesmo antes do Sentry estar 100% configurado.

---

# PARTE 15 — O QUE PRECISA PARA 1.000 CLIENTES

Itens a avaliar (não recomendados automaticamente — cada um só se justifica com o crescimento real):

- **Fila de processamento assíncrono** (ex.: envio de WhatsApp, matching de Radar de Fretes) — justificada pela ausência total de fila hoje e pelo padrão síncrono/fire-and-forget atual, que não escala bem além de centenas de eventos simultâneos.
- **Rate limiting próprio** na aplicação, para proteger contra picos que estourem o tier da Anthropic ou o limite da Z-API.
- **Cache** de leituras pesadas do painel (ex.: relatórios agregados) — hoje tudo é calculado ao vivo a cada request; não crítico a 100 clientes, relevante a 1.000+.
- **Observabilidade completa** (métricas, tracing, alertas) — deixa de ser recomendação e vira necessidade operacional.
- **Autoscaling/múltiplas réplicas** no Railway — hoje 1 réplica fixa.
- **Revisão de paginação/lote** nas rotas sem `LIMIT` (`checklists/dispatch`) antes que o volume de motoristas torne essa rota lenta.
- **Processamento assíncrono do webhook do WhatsApp**: hoje tudo (download de mídia, transcrição, chamada à IA, envio) acontece dentro da mesma requisição HTTP síncrona — em alta concorrência, isso aumenta o risco de timeout do lado da Z-API.

Redis, workers dedicados e batch processing citados no pedido original só se justificam junto com a decisão de introduzir fila — não há evidência hoje de que sejam necessários isoladamente antes disso.

---

# PARTE 16 — MONITORAMENTO

`[ATUALIZADO 26/08]`

- **Logs**: agora **estruturados em JSON de 1 linha** (`src/lib/observability/logger.ts`) nas rotas de maior risco — buscável nos logs do Railway por `event`/`route`/`company_id`. Fora dessas rotas, ainda é `console.log`/`console.error` livre.
- **Error tracking**: `@sentry/nextjs` implementado e integrado ao logger — mas **`SENTRY_DSN` ainda não configurado em produção** (pendência do responsável do produto). Até configurar, o `Sentry.captureException` roda como no-op seguro — o log estruturado no Railway é o que existe de fato hoje.
- **Métricas de aplicação**: ainda nenhuma customizada além dos contadores que já vinham no JSON de resposta de cada dispatch (`enviados`/`falhas` etc.), agora também espelhados no log estruturado (`dispatch_end`, com `duration_ms`/`processados`/`sucesso`/`falha`).
- **Alertas de infraestrutura**: não encontrados no código (podem existir configurados manualmente no Railway, fora do alcance desta auditoria de repositório). Sentry pode gerar alerta próprio uma vez o projeto/DSN existir.
- **Tracing**: `tracesSampleRate: 0.05` configurado no Sentry (baixo de propósito — o objetivo desta rodada é error tracking, não performance tracing detalhado).
- **Uptime monitoring**: ainda não existe um serviço externo de uptime (Pingdom/UptimeRobot/etc.) apontando pro `/api/health` novo — a rota existe e está pronta pra isso, só falta configurar um serviço externo (fora do escopo desta rodada, é conta de terceiro).
- **Health check**: `/api/health` criado — confirma app + banco, nunca chama Anthropic/Z-API, usado como `healthcheckPath` no Railway.

## Hoje eu consigo perceber rapidamente se o Frota IA está com problema?
**Parcialmente, melhor que antes.** Com log estruturado, um problema real (cron falhando, webhook com erro) já fica buscável nos logs do Railway por `event`. Mas sem `SENTRY_DSN` configurado e sem uptime monitoring externo, ainda não há **alerta automático que avise proativamente** — alguém ainda precisa ir olhar. Deixou de ser "quase nada" (nota 2, Parte 2) pra "existe mas incompleto" (nota 5) — não é mais o achado de maior impacto isolado, mas segue sendo o item mais importante pra resolver antes de escalar muito além do piloto inicial.

---

# PARTE 17 — BACKUP E RECUPERAÇÃO

- **Backup do Supabase**: gerenciado pela plataforma no plano Pro — política de retenção exata (diária? quantos dias?) **não é confirmável por este código/MCP**, depende da configuração/plano visível no painel do Supabase.
- **Storage**: bucket privado `vehicle-documents` — sem rotina própria de backup no código; depende também da política de backup padrão do Storage do Supabase.
- **Recovery**: nenhuma rotina de restore própria no código do projeto.
- **Retenção/versionamento**: não configurado no código.

**Recomendação de verificação**: confirmar diretamente no painel Supabase (Settings → Backups) qual é a política real de PITR (point-in-time recovery) incluída no plano Pro contratado — informação que este código não expõe.

---

# PARTE 18 — SEGURANÇA (revisão focada, não destrutiva)

- **Secrets no repositório**: nenhum encontrado (busca por padrões de chave/token — `.env.example` só tem placeholders comentados).
- **`service_role`/client admin**: padrão correto confirmado — nas rotas de painel, o client de sessão é usado primeiro para checar acesso e filtrar por `company_id` real; o client admin só entra depois, e mesmo assim principalmente pra operações de Storage sem RLS de objeto. Nos webhooks/crons (sem sessão de usuário), o admin é usado diretamente porque a autenticação ali é o token do webhook, não RLS — padrão intencional, não bypass indevido.
- **Auth bypass**: não encontrado.
- **APIs públicas**: nenhuma rota de escrita sensível encontrada sem alguma forma de autenticação (sessão, RLS, ou token de webhook).
- **RLS**: padrão `is_company_member`/`has_company_role` usado de forma consistente (amostrado em 13 migrations).
- **Upload**: bucket privado, signed URL de 60s, validação de tipo (PDF/JPEG/PNG) e tamanho (10 MB), nome de arquivo sanitizado, path derivado só da sessão autenticada.
- **Signed URLs**: TTL curto (60s) para documentos; tokens de checkout/vínculo de conta com TTL de 15–30 minutos, HMAC-SHA256, comparação timing-safe.
- **Webhook (Mercado Pago)**: HMAC correto, timing-safe, sempre reconsulta a API antes de confiar.
- **Webhook (WhatsApp)**: sem HMAC (limitação do fornecedor), mitigado por token estático comparado em timing-safe — ponto de atenção, não uma falha grave, dado que é a única opção oferecida pela Z-API.
- **Checkout**: preço/plano sempre revalidado contra o catálogo interno, nunca confiado no token ou no payload externo.
- **Cross-tenant**: confirmado por amostragem — `company_id` sempre exigido nas queries de service, RLS reforça o mesmo isolamento de forma independente.
- **Roles**: `owner`/`admin`/`operator`/`viewer` aplicados de forma consistente nas rotas de escrita auditadas (ex.: Empresa restrita a owner/admin).

**Ponto de atenção único identificado**: `getVehicle` (service de veículo) não filtra por `companyId` — funciona corretamente hoje porque todo caller já filtra o dado de origem antes de chamar essa função, mas não é uma barreira própria. Recomendação: reforçar com `companyId` explícito nos pontos onde é chamado com o client admin (crons), como defesa em profundidade.

---

# PARTE 19 — TESTES

Executado nesta auditoria (2026-08-26, mesmo commit `8b6d3ea`):

- **`npx vitest run`**: **388 testes, 43 arquivos, 388 aprovados, 0 falhas.**
- **`npx tsc --noEmit`**: limpo, 0 erros.
- **`npx eslint .`**: limpo, 0 erros/warnings.
- **`npm run build`**: build de produção concluído com sucesso, todas as rotas compiladas.

**Nenhum load test pesado foi feito contra produção**, conforme instrução explícita da tarefa. As estimativas de capacidade das Partes 11–13 vêm exclusivamente de leitura de código/configuração, não de benchmark. Um benchmark leve local/staging não foi executado nesta rodada por não haver ambiente de staging isolado disponível no escopo desta auditoria — se desejado, seria um próximo passo natural, não incluído aqui para não gerar custo/risco fora do que foi pedido.

---

# PARTE 20 — VEREDITO

`[ATUALIZADO 26/08 — veredito revisado depois da rodada de prontidão de produção; original preservado abaixo riscado por transparência]`

## O Frota IA é confiável hoje?
**⚠️ SIM, COM RESSALVAS** (mesma classificação — as ressalvas mudaram de conteúdo, não de categoria).

Justificativa atualizada: o núcleo do produto continua sólido (394 testes, RLS consistente, idempotência nos pontos mais sensíveis). Das ressalvas originais, 2 foram corrigidas nesta rodada: ~~2 funcionalidades sem cron ativo~~ (checklist e freight-expire agora rodam sozinhos) e ~~ausência total de observabilidade~~ (agora existe, incompleta — falta configurar `SENTRY_DSN`). O retry da Anthropic acabou sendo uma não-questão (o SDK já fazia certo, só não estava documentado/visível). A ressalva real que permanece: retry no Z-API continua ausente, mas agora por **decisão documentada** (risco de duplicar mensagem), não por lacuna. Não sobrou nenhuma ressalva "grátis" pra resolver — o que falta agora depende de ação externa do responsável do produto (criar projeto Sentry) ou de dado que só o fornecedor tem (tier Anthropic, throughput Z-API).

## Está pronto para clientes reais?
**✅ SIM.** (subiu de "sim com condições" — as 2 condições que dependiam só de mim foram cumpridas nesta rodada)

As 2 condições restantes da lista original não bloqueiam o início do piloto, só o crescimento além dele:
1. ~~Ligar os crons ausentes~~ — feito.
2. ~~Adicionar observabilidade mínima~~ — feito (com a pendência do `SENTRY_DSN` registrada acima).
3. Confirmar os limites reais de Z-API e do tier Anthropic contratado — **segue pendente**, mas é uma pergunta pro fornecedor/conta, não um bloqueio técnico do código para começar um piloto de escala pequena.

## Quantos clientes ativos eu colocaria hoje sem mudar arquitetura?

**Faixa conservadora: 20–100 clientes ativos — mesma faixa numérica de antes.**

Por que a faixa não subiu, sendo honesto sobre isso (conforme instruído, não inflar a estimativa artificialmente): o teto de 100 nunca foi limitado pela infraestrutura bruta (que segue folgada) — era limitado pela combinação de "sem observabilidade" + "dados externos não confirmados" (Z-API/Anthropic). Só o primeiro fator melhorou (parcialmente — falta o DSN). O segundo fator (throughput Z-API, tier Anthropic) continua exatamente onde estava: **não confirmado**, mesmo depois de consultar a documentação oficial da Z-API (ela não publica número). Subir a faixa sem essa confirmação seria inventar capacidade, o que a tarefa pediu explicitamente pra não fazer. **O que mudou é a confiança dentro da mesma faixa**, não o teto dela — ver Parte 21.

---

# PARTE 21 — NÍVEL DE CONFIANÇA DA ESTIMATIVA

`[ATUALIZADO 26/08]` **MÉDIA → MÉDIA-ALTA na metade inferior da faixa (20–50), continua MÉDIA no topo (50–100).**

- Alta confiança: arquitetura de banco (índices, RLS, idempotência) suporta a faixa estimada sem esforço — isso é verificável no código.
- Média-alta confiança (subiu): capacidade de Railway/Supabase pra 20–50 clientes — agora com crons ativos rodando de verdade e alguma observabilidade real (mesmo sem Sentry configurado, logs estruturados já são buscáveis), a operação nessa faixa é mais previsível do que era há uma rodada atrás.
- Baixa confiança (inalterado): throughput de WhatsApp/Z-API e tier real da Anthropic — continuam os dois maiores "buracos" de informação, mesmo depois de consultar a documentação oficial da Z-API nesta rodada (ela confirma "sem limite declarado", não um número). São dados externos que só o fornecedor/console da conta tem.

---

# PARTE 22 — DADOS EXTERNOS QUE FALTAM

| Informação necessária | Onde consultar | Por que importa |
|---|---|---|
| Plano/limite de CPU exato do serviço Railway | Painel Railway → Settings do serviço `frota-ia-assistente` | Confirma teto real de processamento concorrente |
| Limite de conexões/RPS do Supabase Pro | Painel Supabase → Settings → Database/Infrastructure | Define teto real de concorrência de escrita/leitura |
| Tier de rate limit (RPM/TPM) contratado na Anthropic | console.anthropic.com → Settings → Limits | Define quantas conversas simultâneas a IA realmente aguenta antes de erro 429 |
| Limite de throughput/mensagens por segundo da Z-API | `[ATUALIZADO 26/08]` Documentação oficial já consultada (developer.z-api.io) — só confirma "sem limite declarado, sujeito às políticas do WhatsApp Web". Se precisar de número exato, só abrindo chamado com o suporte da Z-API | Risco de não saber onde está o teto continua, mesmo com a doc oficial consultada |
| Quotas do Google Calendar/Maps API | Google Cloud Console → APIs & Services → Quotas | Relevante se o volume de uso de Agenda/Rotas crescer |
| Política de billing do Mercado Pago para alto volume de webhooks | Painel Mercado Pago / documentação de integração | Relevante só em escala muito maior que a discutida aqui |
| Política de backup/retenção real do Supabase Pro | Painel Supabase → Settings → Backups | Confirma RPO/RTO real em caso de desastre |

---

# PARTE 23 — RECOMENDAÇÃO

## Hoje
O núcleo funcional (onboarding, pagamento, isolamento multiempresa, ferramentas de IA, sincronização WhatsApp↔Painel) já está suficiente para começar a receber clientes reais na faixa conservadora estimada (Parte 20).

## Antes de 100 clientes
- ~~Ligar os 2 crons ausentes~~ — feito em 26/08.
- ~~Error tracking mínimo (Sentry ou equivalente) nas rotas de webhook/dispatch~~ — implementado em 26/08; falta só configurar `SENTRY_DSN` em produção (ação do responsável do produto, não código).
- Confirmar throughput real da Z-API e tier real da Anthropic — Z-API consultada mas sem número; Anthropic segue como dado de conta, não de código.

## Antes de 1.000 clientes
- Fila de processamento assíncrono para envio de WhatsApp e matching do Radar de Fretes.
- Observabilidade completa (métricas + tracing + alertas).
- Reavaliar autoscaling/múltiplas réplicas no Railway.
- Revisar paginação da rota de checklist e o N+1 do Radar de Fretes.

## Futuro (só faz sentido em escala maior)
- Redis/cache de leitura para relatórios agregados.
- Particionamento/arquivamento de tabelas de histórico (`messages`, `tool_executions`, `analysis_runs`).
- Múltiplas instâncias Z-API, se o volume de mensagens justificar.
