# Frota IA — Raio-X do Estado Atual (documento mestre)

**Este é o documento mestre.** Documentos complementares: `docs/FROTA_IA_STACK_VERSOES_ATUAL.md` (stack/versões/env vars), `docs/FROTA_IA_ONBOARDING_JORNADA_ATUAL.md` (onboarding mensagem-a-mensagem), `docs/FROTA_IA_FLUXOS_V1_V2_ATUAL.md` (fluxogramas Mermaid).

**Regra de método**: fonte de verdade é o código na branch/commit abaixo, lido diretamente por 7 auditorias paralelas (não por documentação anterior). Toda afirmação relevante tem `arquivo:linha` como evidência. Onde o código não permitiu confirmar algo, está escrito explicitamente "NÃO FOI POSSÍVEL CONFIRMAR PELO REPOSITÓRIO ATUAL" — não foi deduzido.

---

## 0. Estado exato do projeto auditado

| Item | Valor |
|---|---|
| Repositório | `github.com/rafaelkamosaquario-cpu/frotaia` |
| Branch | `claude/frota-ia-assistente-setup-qlrbac` |
| Commit | `a4205419165f15a62a5dd815541fef2ce3153e84` |
| Data/hora da auditoria | 2026-08-22, ~23:08 UTC (≈ 20:08 Brasília) |
| Aplicação principal | Next.js 16 App Router + TypeScript, um único serviço atendendo WhatsApp (Z-API) e painel web, banco Supabase (`frotaia`, ref `kqquswdrtcqicyfcvvuv`) |
| Status do `git` | Working tree limpa para arquivos rastreados. 4 arquivos **não rastreados** pré-existentes, sem relação com este trabalho: `docs/FROTA_IA_FLUXOGRAMA_COMPLETO_V1_V2.docx/.pdf`, `docs/FROTA_IA_RAIO_X_V1_V2.docx/.pdf` |
| Estrutura principal | `src/app/` (rotas), `src/app/api/` (24 grupos de rota), `src/app/frota/` (16 telas do painel), `src/ai/` (tools, chat, whatsapp, context, conhecimentos), `src/services/` (34 arquivos de service + subpastas `google/`, `news/`, `freight/`, `whatsapp/`, `dashboard/`, `documents/`), `src/lib/`, `supabase/migrations/` (65 arquivos) |

---

## 1. V1 vs. V2 — como o código organiza isso hoje

O código **não usa mais a nomenclatura "Camada 3/4/5/6"** dos docs antigos como estrutura ativa de decisão — essas denominações só aparecem em comentários históricos. A separação real e ativa hoje é por **feature flag + gate de acesso**, não por "fase":

### V1 — Frota IA via WhatsApp
- **Finalidade**: canal principal e default. Cliente novo cria conta e faz onboarding **inteiramente pela conversa**, sem precisar de painel.
- **Interface**: WhatsApp (Z-API).
- **Gate de acesso**: nenhum — qualquer número novo que manda mensagem já é atendido (cria `auth.users` via Admin API na hora, `src/services/supabase/userIdentityService.ts:41-69`).
- **Status**: ✅ **IMPLEMENTADO E UTILIZADO** — onboarding de 8 etapas (ver documento de onboarding), 35 ferramentas de IA disponíveis, multimodal (texto/áudio/foto/PDF/planilha/localização/contato), checklist de motorista, Radar de Fretes via grupos.

### V2 — Frota IA + Painel Web
- **Finalidade**: painel de gestão visual para quem já tem conta (criada via WhatsApp ou não) e tem direito de acesso.
- **Interface**: navegador, login Google via Supabase Auth.
- **Gate de acesso** (cadeia confirmada em `src/app/frota/layout.tsx:19-39`, evidência completa no doc de fluxos): sessão Supabase → empresa vinculada (`company_members`) → **entitlement** (`companies.fleet_panel_enabled` OU `subscriptions.fleet_panel_included`) → **Google Calendar conectado pela empresa** → libera.
- **Status**: ✅ **IMPLEMENTADO E UTILIZADO**, mas com uma particularidade importante: **não existe onboarding self-service funcional para quem chega direto pelo painel** (ver seção 9). Na prática, hoje só entra no painel quem já tem empresa criada por outro caminho (tipicamente WhatsApp) e recebeu o entitlement manualmente.

### Terceiro "canal" encontrado, não previsto na pergunta: rota raiz `/`
- `src/app/page.tsx` é uma **terceira superfície**, atrás da flag `CUSTOMER_PANEL_ENABLED` (default `false`) — só usuários com `profiles.is_admin=true` acessam. É o chat de teste/administração, distinto do painel `/frota` (que tem seu próprio gate, independente dessa flag). 🟠 **ESTRUTURA PREPARADA MAS NÃO ATIVA PARA CLIENTE COMUM.**

### V3 / futuro
NÃO FOI POSSÍVEL CONFIRMAR PELO REPOSITÓRIO ATUAL nenhuma menção ativa a "V3" no código (só em `docs/v2-gestao-de-frota-roadmap.md`, que é planejamento, não implementação).

---

## 2. Ferramentas de IA (tools) — hoje

**Total exato: 35 ferramentas**, registradas em `src/ai/tools/index.ts:105-141` (array `FERRAMENTAS_FROTA_IA`), 1:1 sincronizadas com o enum `frotaIaToolNameSchema` em `src/lib/validation/schemas.ts:342-393` (nenhuma divergência).

Isso é **+7 em relação ao último documento de auditoria** (`docs/FROTA_IA_AUDITORIA_28_TOOLS.md`, 2026-08-19, que contava 28): `vincular_painel`, `consultar_checklist`, `gerenciar_memoria`, `gerenciar_radar_frete`, `consultar_oportunidades_frete`, `gerenciar_empresa`, `gerenciar_checklist_config` são **NOVAS DESDE A DOCUMENTAÇÃO ANTERIOR**.

### 2.1 Cálculos puros (12, sem I/O — ou com I/O externo orquestrado pelo prompt, não pela tool)

| Tool | Finalidade |
|---|---|
| `calcular_combustivel` | Litros, custo, autonomia, comparação de consumo |
| `calcular_cpk` | Custo por km (categoria/total/comparação) |
| `comparar_pneus` | Ranking de pneus pelo custo de ciclo (reusa `calcular_cpk`) |
| `calcular_custo_viagem` | Custo operacional completo (reusa combustível+CPK) |
| `calcular_margem` | Margem, markup, ponto de equilíbrio |
| `calcular_valor_minimo_frete` | Piso econômico de negociação |
| `calcular_receita_km` | R$/km |
| `calcular_custo_dia` | Custo diário fixo/variável/parado |
| `calcular_custo_veiculo_parado` | Impacto financeiro de veículo parado |
| `calcular_jornada` | Duração/conformidade/custo-lucro por hora (reusa 4-5 outras tools internamente) |
| `verificar_piso_minimo_antt` | Piso legal (Lei 13.703/2018) — CCD/CC sempre vêm de `web_search` prévio, nunca inventados |
| `analisar_frete` | Classificação de viabilidade (viável/atrativo/inviável/arriscado), 10 modos |

### 2.2 Integração (23, com Supabase/API externa/arquivo local)

| Categoria | Tools |
|---|---|
| Rotas | `consultar_rota` (Google Maps), `gerenciar_rota_salva` |
| Documentos | `gerar_documento` (PDF + WhatsApp), `gerenciar_documento_frota` |
| Motoristas | `gerenciar_motorista` |
| Manutenção | `gerenciar_manutencao` |
| Despesas | `registrar_despesa` |
| Checklist | `consultar_checklist`, `gerenciar_checklist_config` |
| Calendar | `gerenciar_google_calendar`, `gerenciar_alerta` |
| Notícias | `gerenciar_noticias_setor` |
| Memória | `gerenciar_memoria`, `definir_estilo_resposta`, `consultar_historico` |
| Painel/Empresa | `gerenciar_empresa`, `gerenciar_veiculo`, `vincular_painel`, `gerenciar_assinatura` |
| Frete/Radar | `gerenciar_radar_frete`, `consultar_oportunidades_frete` |
| Outras | `consultar_conhecimento_operacional` (lê `.md` local, sem banco) |

Evidência completa por tool (entrada/saída/tabela): ver relatório bruto da auditoria de tools (arquivo:linha por ferramenta), condensado aqui por espaço.

### 2.3 Motor de resposta (`src/ai/chat/gerarRespostaAssistente.ts`)

| Item | Valor | Evidência |
|---|---|---|
| Provedor / SDK | Anthropic, `@anthropic-ai/sdk` | `src/lib/anthropic/client.ts:2` |
| Modelo | `"claude-sonnet-5"` — **hardcoded**, sem variável de ambiente, sem fallback | `src/lib/anthropic/client.ts:4` |
| Limite de tool rounds | `MAX_TOOL_ROUNDS = 4` (até 5 chamadas ao modelo por turno) | `gerarRespostaAssistente.ts:56,128` |
| `max_tokens` | `1536` | `gerarRespostaAssistente.ts:57,131` |
| Streaming | Não | `gerarRespostaAssistente.ts:129-135` |
| Histórico carregado | 30 mensagens | `gerarRespostaAssistente.ts:96` |
| System prompt | `src/lib/anthropic/systemPrompt.ts:24-174`, inclui veículo padrão, perfil de custo, **memórias** (linha 138-148), radares ativos, preferência de estilo | — |
| Web search / web fetch | Sim, 3 camadas (oficial restrito → ampla fallback → notícias), `allowed_domains` | `src/lib/anthropic/tools.ts:225-302` |
| Vision (imagem) | Sim, nativo, canal WhatsApp | `src/app/api/whatsapp/webhook/route.ts:420-446` |
| PDF | Sim, nativo (documento base64 direto ao Claude) | `route.ts:479-505` |
| Planilha (.xlsx/.csv) | Sim, convertida em texto antes (ExcelJS) — Claude não lê nativamente | `src/lib/spreadsheet/spreadsheetParser.ts:25-40` |
| Áudio | Sim, transcrito via OpenAI `gpt-4o-mini-transcribe` | `src/lib/openai/whisperClient.ts:17` |

O painel web usa **exatamente o mesmo motor** (`FrotaAiWidget.tsx` → `/api/chat` → `gerarRespostaAssistente`) — confirmado por comentário explícito no código e por ambos os call-sites (`api/chat/route.ts`, `api/whatsapp/webhook/route.ts`) chamarem a mesma função.

---

## 3. Banco de dados

**33 tabelas** no schema `public` (confirmado via `database.types.ts`), **36 enums**, **RLS habilitado em todas as 33 tabelas**, sem exceção.

Grupos funcionais: Identidade (`profiles`, `companies`, `company_members`, `user_channels`), Frota (`vehicles`, `vehicle_cost_profiles`, `vehicle_tire_profiles`, `vehicle_documents`, `drivers`, `maintenance_schedules`), Operação (`saved_routes`, `saved_journeys`, `expenses`, `checklist_dispatches`), IA/Memória (`conversations`, `messages`, `ai_memories`, `analysis_runs`, `tool_executions`), Google (`google_integrations`, `calendar_action_logs`), Alertas/Documentos (`scheduled_alerts`, `generated_documents`), Assinatura (`subscriptions`, `payment_events`, `trial_usage`), Onboarding (`onboarding_sessions`), Setor (`news_digests`), Radar de Fretes (`freight_sources`, `freight_radars`, `freight_opportunities`, `freight_opportunity_matches`).

**Tabelas com RLS habilitado mas sem policy para `authenticated`** (intencional, acesso só via `service_role`/admin client): `payment_events`, `trial_usage`, `freight_opportunities` (dado global, não por empresa). `news_digests` é a única com `select` liberado sem filtro de empresa (conteúdo do setor, não confidencial).

3 funções `SECURITY DEFINER` restritas a `service_role` só para o refresh token do Google (`store_google_refresh_token`, `read_google_refresh_token`, `delete_google_refresh_token`, no Supabase Vault) + 3 funções auxiliares de RLS (`is_company_member`, `has_company_role`, `default_company_id`) chamáveis por `authenticated` — intencional, é como as próprias policies as usam. `handle_new_user` (cria profile) não é chamável por RPC nenhum, só via trigger.

**Storage**: não usado (PDFs são gerados e enviados por base64 direto, sem bucket). **Vault**: usado só para o refresh token do Google Calendar.

Diagrama ER completo: ver `docs/FROTA_IA_FLUXOS_V1_V2_ATUAL.md`.

---

## 4. Integrações externas — tabela resumo

| Integração | Status | Observação |
|---|---|---|
| Google Calendar | ✅ funcionando integralmente | Conexão por `company_id` (não `user_id`) — WhatsApp e painel compartilham a mesma agenda desde que vinculados à mesma empresa. Token só no Supabase Vault. |
| Google Maps (Geocoding+Routes+Static) | ✅ efetivamente utilizada | Fallback correto se `GOOGLE_MAPS_API_KEY` ausente (nunca inventa distância) |
| Z-API (WhatsApp) | ✅ efetivamente utilizada | Botões nativos (`sendWhatsappButtons`) têm falha de entrega documentada em produção (05/08/2026); listas nativas funcionam |
| Anthropic Claude | ✅ efetivamente utilizada | Motor central, ver seção 2.3 |
| OpenAI (Whisper) | ✅ efetivamente utilizada | Uso único: transcrição de áudio do WhatsApp |
| Mercado Pago | 🟡 parcial | Criar assinatura/pagamento + webhook: ✅. Cancelamento programático: não encontrado no código |
| Notícias do setor | ✅ efetivamente utilizada | Fonte é `web_search` do Claude restrito a domínios de imprensa/entidades do setor — não é API/RSS dedicada |
| Radar de Fretes | ✅ implementado (não simulado) | Fonte real = grupos de WhatsApp cadastrados pelo cliente no painel; extração via Claude; matching real por empresa/veículo; envio proativo automático em match "FORTE" |

---

## 5. Onboarding — resumo (detalhe completo no doc de onboarding)

**V1 (WhatsApp)**: 8 etapas de pergunta (nome, perfil, intenção, localização base, região, rota fixa, veículo primário, configuração do veículo), com desambiguação extra para veículos articulados. Cria `auth.users` real (Admin API) já na primeira mensagem, `onboarding_sessions` guarda o estado, finalização cria `companies` + assinatura trial + veículo (se informado) + memórias iniciais (região, rota fixa).

**V2 (painel)**: **não existe onboarding self-service funcional** para quem chega direto pelo painel sem conta prévia — `src/app/onboarding/` existe mas é gate atrás de `CUSTOMER_PANEL_ENABLED` (default `false`) + `profiles.is_admin`, então só administradores passam por ele hoje. Cliente comum entra no painel só depois de ter conta pelo WhatsApp e receber o entitlement.

---

## 6. Painel web — 16 telas

Dashboard, Veículos, Motoristas, Manutenção, Documentos, Despesas, Empresa, Fretes, Jornadas, Rotas, Notícias, Relatórios, Checklists, Configurações, Oportunidades (Radar), Alertas.

Só **Despesas** tem exclusão real (hard delete). Veículos/Motoristas só desativam (soft). Manutenção/Documentos não têm exclusão nenhuma. Fretes/Jornadas/Rotas/Checklists/Relatórios/Alertas são **somente leitura** no painel — a escrita real acontece pelo WhatsApp.

Widget de IA (`FrotaAiWidget`) presente em todas as 16 telas, mesmo motor do WhatsApp, aceita imagem, envia contexto da página atual.

---

## 7. Identidade WhatsApp ↔ Painel e Google Calendar

**Ponto crítico investigado a fundo**: a busca de integração do Calendar é feita por `company_id` (`src/services/supabase/googleIntegrationService.ts:15-22`), com comentário explícito no código confirmando que essa é a solução da "unificação de identidade WhatsApp+Painel" — os dois canais podem ter `user_id`s diferentes para a mesma pessoa, mas resolvem para a mesma `company_id` uma vez vinculados. **✅ Corrigido/funcionando** — diverge de qualquer diagnóstico antigo que apontasse isso como pendência.

O vínculo entre um número de WhatsApp e uma conta logada no painel é feito pela tool `vincular_painel` (ativa, gera link assinado de 15 min, nunca funde empresas automaticamente — exige confirmação explícita se o Google logado já tiver empresa própria diferente). Existe um segundo mecanismo mais antigo, `whatsappConnectLink`/`src/app/auth/whatsapp/connect/`, **confirmado como código órfão** pelo próprio comentário no código-fonte — nada mais o chama.

---

## 8. Memória da IA

**Confirmado (não repetindo diagnóstico antigo): memória é escrita E lida de volta.** Cadeia completa: `saveMemory` (dedup por empresa+tipo+chave, supersede sem sobrescrever) → `listMemoriesForPrompt` (até 12 memórias) → `loadCustomerContext` → `construirSystemPrompt` → prompt enviado à Anthropic (`src/lib/anthropic/systemPrompt.ts:138-148`). Compartilhada entre WhatsApp e painel por `company_id` (memórias pessoais, por `user_id`, só aparecem pro mesmo usuário nos dois canais).

---

## 9. Checklist

Configurável por empresa (`checklist_enabled`, `checklist_send_hour`, `checklist_item_keys` — 4 itens possíveis: óleo/água/pneus/luzes). Resposta "atenção" (qualquer coisa que não seja reconhecida como "ok") gera automaticamente um `scheduled_alerts` para os gestores, reaproveitando o cron de alertas já existente. Aderência calculada por motorista (`respondidos/enviados × 100`), com "não respondido" computado como estado derivado (pendente + 6h sem resposta), não um valor novo no enum. Painel é 100% leitura.

---

## 10. Crons (5, não 4)

| Rota | Autenticação | Frequência configurada no repo |
|---|---|---|
| `/api/alerts/dispatch` | `ALERTS_DISPATCH_SECRET` | ❓ não verificável pelo código (Railway) |
| `/api/news/dispatch` | `NEWS_DISPATCH_SECRET` | ❓ não verificável pelo código |
| `/api/subscriptions/trial-warnings/dispatch` | `TRIAL_WARNINGS_DISPATCH_SECRET` | ❓ não verificável pelo código |
| `/api/checklists/dispatch` | `CHECKLIST_DISPATCH_SECRET` | ❓ não verificável pelo código |
| `/api/freight/expire-dispatch` | `FREIGHT_EXPIRE_DISPATCH_SECRET` | ❓ não verificável pelo código |

Nenhum arquivo no repositório define frequência real — depende 100% do dashboard do Railway (consistente com `docs/FROTA_IA_INFRAESTRUTURA_PRODUCAO.md`, que documenta os 3 primeiros como serviços "Cron Job" configurados manualmente).

---

## 11. Limitações atuais

### 🔴 Bloqueador
- Nenhum encontrado nesta auditoria (nenhum caminho ativo quebrado identificado no código-fonte em si — falhas de infraestrutura, como as corrigidas anteriormente nesta sessão, são operacionais, não de código).

### 🟡 Parcial
- Cancelamento de assinatura Mercado Pago não tem função programática — só reflete o que o próprio Mercado Pago manda via webhook.
- Onboarding pelo painel (`src/app/onboarding/`) só funciona para administradores; não é um caminho self-service real para cliente novo via painel.
- Mapa visual da rota (Static Maps + envio por Z-API) é sinalizado no próprio código como "ainda não validado com tráfego real".

### 🔵 Melhoria
- Botões nativos do WhatsApp (`sendWhatsappButtons`) têm histórico de falha silenciosa de entrega — onboarding já contorna isso usando texto/listas, mas a função continua em uso em outro ponto do webhook.
- `ADMIN_PANEL_ENABLED` é uma flag morta (definida, nunca lida em nenhum outro lugar).
- Nenhuma checagem de idempotência durante o onboarding em si (fora do chat pós-onboarding) — reentrega de webhook nessa fase poderia, em teoria, reprocessar uma resposta.

### 📌 Futuro
- V3 — nenhuma menção ativa encontrada no código.

---

## 12. Dívida técnica encontrada

- `whatsappConnectLink.ts`/`/auth/whatsapp/connect` — código órfão, confirmado pelo próprio comentário no arquivo.
- `ADMIN_PANEL_ENABLED` — flag sem nenhum ponto de leitura no código.
- `.env.example` não documenta `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` nem `CHECKLIST_DISPATCH_SECRET`, apesar de todas serem lidas de fato pelo código.
- Estado `awaiting_vehicle_count` continua no enum `onboarding_state` do banco só por compatibilidade histórica — o código nunca mais atribui esse estado.
- `docs/FROTA_IA_AUDITORIA_28_TOOLS.md` está defasado (28 vs. 35 tools reais).

---

## 13. Segurança (arquitetura, sem pentest)

RLS habilitado em 100% das tabelas. Multiempresa via `company_members` + `is_company_member`/`has_company_role`. Isolamento de dado sensível: refresh token do Google só no Vault, acessível só por `service_role` via 3 funções `SECURITY DEFINER` com `search_path` fixo. Webhooks (WhatsApp, cron dispatch, Mercado Pago) todos autenticados por segredo próprio comparado com `timingSafeEqual`. OAuth state assinado (HMAC) tanto para Google Calendar quanto para os links de vínculo de conta/checklist.

---

## 14. O que um cliente consegue fazer hoje

### Pelo WhatsApp
Cadastrar-se sozinho (8 perguntas), calcular frete/combustível/CPK/margem/jornada, comparar pneus, consultar piso mínimo ANTT, consultar rota (com mapa), registrar/consultar despesas, gerenciar veículos/motoristas/manutenção/documentos, receber checklist diário (se motorista), receber alertas de vencimento, buscar frete em grupos de WhatsApp cadastrados (Radar), receber notícias do setor, conectar Google Calendar, pedir acesso ao painel (`vincular_painel`), gerar PDF de análise, mandar foto/PDF/áudio/planilha.

### Pelo painel
Visualizar dashboard consolidado, cadastrar/editar veículos e motoristas, editar dados da empresa, ver histórico de fretes/jornadas/rotas (lidos, não criados ali), configurar checklist e estilo de resposta, gerenciar fontes do Radar de Fretes, gerar relatório em PDF, conversar com a mesma IA via widget flutuante.

### Pelos dois
Mesma memória, mesmo histórico de conversa relevante, mesma agenda Google (por empresa), mesmas 35 ferramentas de IA.
