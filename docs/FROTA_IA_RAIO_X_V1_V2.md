# FROTA IA — RAIO-X TÉCNICO E FUNCIONAL

> ⚠️ **HISTÓRICO/DEPRECATED (23/08/2026)** — este documento é anterior ao redesenho do Onboarding V1 (marca/modelo/ano obrigatório etc.), ao Onboarding 2/Gestão e à reestruturação comercial Individual/Gestão (preços aqui, ex. R$59,90/R$647, estão desatualizados). Fonte de verdade atual: `docs/FROTA_IA_ESTADO_ATUAL.md`. Mantido só como registro histórico da arquitetura em 19/08/2026.

## Arquitetura Atual V1 WhatsApp + V2 Painel Web

**Gerado em:** 19/08/2026
**Repositório:** `github.com/rafaelkamosaquario-cpu/frotaia`, branch `claude/frota-ia-assistente-setup-qlrbac`, commit `7324e88`
**Método:** auditoria de código real (4 investigações independentes cobrindo arquitetura/banco, fluxo V1, painel V2 e ferramentas de IA), com confronto cruzado entre os achados antes da redação final. Nenhuma afirmação neste documento vem de comentário, README, roadmap ou documentação antiga sem confirmação direta no código-fonte.

**Legenda de status:**

| Selo | Significado |
|---|---|
| 🟢 **IMPLEMENTADO** | Existe, está conectado, funciona de ponta a ponta no código |
| 🟡 **IMPLEMENTADO PARCIALMENTE** | Existe código real, mas o fluxo não está 100% disponível ou é limitado por desenho |
| 🔵 **ESTRUTURA PREPARADA** | Existe schema/serviço pronto, mas não é efetivamente usado pelo produto hoje |
| ⚪ **PLANEJADO** | Mencionado/preparado, sem implementação funcional |
| 🔴 **LEGADO** | Código antigo que não representa mais o comportamento atual |
| ⚫ **NÃO VERIFICÁVEL** | Depende de infraestrutura fora do repositório (ex.: agendamento de cron no Railway) — não é possível confirmar só lendo o código |

---

## Índice

1. Visão executiva
2. Arquitetura geral do sistema
3. Stack tecnológica
4. Frota IA V1 — WhatsApp
5. Ferramentas da IA
6. Inteligência artificial
7. Memória do Frota IA
8. Banco de dados
9. Frota IA V2 — Painel Web
10. Relação V1 × V2
11. Banco único
12. Integrações externas
13. Experiência completa do cliente
14. Funcionalidades implementadas
15. Funcionalidades parciais
16. Estruturas preparadas
17. Funcionalidades planejadas
18. Legado
19. Riscos e inconsistências
20. Mapa final do Frota IA

---

## 1. Visão executiva

O **Frota IA** é um assistente de inteligência artificial vertical para o setor de transporte rodoviário de cargas no Brasil — motorista autônomo e pequenas/médias transportadoras. Resolve um problema concreto: decisões de frete, custo e manutenção hoje são tomadas "no olho", sem ferramenta acessível de cálculo real. O produto entrega isso via **conversa em linguagem natural**, sem exigir que o cliente aprenda uma interface nova.

Existem **duas superfícies** do mesmo produto, e é essencial não confundi-las:

- **V1 — WhatsApp**: a experiência principal e a única onde o cliente pagante de fato opera hoje. Onboarding conversacional, 28 ferramentas de IA sob demanda, mídia (foto/PDF/planilha/áudio), pagamento via Mercado Pago, tudo dentro do WhatsApp.
- **V2 — Painel Web** (`/frota/*`): uma camada de gestão visual sobre os mesmos dados, hoje de uso **restrito** (o acesso é um flag manual por empresa, não um produto vendido — ver seção 19). Não substitui o WhatsApp, complementa: visualização em tabela, exportação de relatório em PDF, e o mesmo assistente de IA disponível como widget de chat.

As duas superfícies **compartilham 100% do banco de dados e do motor de IA** (`gerarRespostaAssistente.ts` é chamado tanto pelo webhook do WhatsApp quanto pela rota `/api/chat` do painel) — não existem dois "cérebros" nem dois bancos separados.

```
                         CLIENTE
                            │
                     ┌──────┴──────┐
                     │  FROTA IA   │
                     └──────┬──────┘
        ┌────────────────────────────────────────┐
        │                                          │
   V1 — WHATSAPP  ◄────── BANCO ÚNICO ──────►  V2 — PAINEL WEB
   (produto real)         (Supabase)          (gestão, acesso restrito)
        │                                          │
        └──────────────────┬───────────────────────┘
                            │
              IA (Claude) + 28 FERRAMENTAS + INTEGRAÇÕES
        (Google Calendar, Google Maps, Mercado Pago, Z-API, OpenAI)
```

---

## 2. Arquitetura geral do sistema

- **Frontend**: Next.js 16 (App Router) + React + Tailwind. Dois "apps" dentro do mesmo projeto: a raiz (`/`, `/login`, `/onboarding`) é o chat web espelho do WhatsApp; `/frota/*` é o painel de gestão (V2), com layout próprio (`FrotaShell`).
- **Backend**: Route Handlers do próprio Next.js (`src/app/api/**/route.ts`) — não há servidor separado. Toda lógica de negócio roda no mesmo processo Node hospedado no Railway.
- **Banco**: Supabase (Postgres gerenciado) — 29 tabelas, RLS habilitado em todas, funções `SECURITY DEFINER` (`is_company_member`, `has_company_role`) para isolamento multiempresa sem recursão de policy.
- **WhatsApp**: entrada via webhook (`/api/whatsapp/webhook`) recebendo eventos da **Z-API** (integração não-oficial), saída via cliente REST próprio (`zapiClient.ts`).
- **Painel**: Server Components buscam dados direto do Supabase (client de sessão); mutações passam por rotas `/api/frota/*`.
- **IA**: Anthropic Claude (`claude-sonnet-5`) via SDK oficial, com tool use — o mesmo motor (`gerarRespostaAssistente.ts`) atende `/api/chat` (painel) e o webhook (WhatsApp).
- **Ferramentas**: 28 "tools" registradas (`src/ai/tools/*.ts`), 12 de cálculo puro e 16 de integração/escrita.
- **Serviços/integrações externas**: Google Calendar (OAuth), Google Maps/Routes/Geocoding, Mercado Pago (assinatura), OpenAI (transcrição de áudio), busca web nativa da própria Claude restrita a domínios oficiais.
- **Autenticação**: Supabase Auth — só Google OAuth para login web; identidade por telefone (`user_channels`) para WhatsApp, sem senha.
- **Pagamentos**: Mercado Pago (preapproval recorrente para Mensal; Checkout Pro/preference para Anual parcelado/Pix).
- **Infraestrutura**: Railway (hospedagem do serviço principal + 4 rotas de cron externas — ver seção 19 sobre o que não é verificável a partir do código).

Como os componentes conversam: **cliente → WhatsApp (Z-API) → webhook → identifica usuário/empresa → carrega contexto → chama `gerarRespostaAssistente` → Claude decide ferramenta → ferramenta lê/escreve no Supabase (e, quando aplicável, chama uma API externa) → resultado volta pra Claude → resposta final salva e enviada de volta pelo canal de origem (WhatsApp ou painel)**.

---

## 3. Stack tecnológica

| Tecnologia | Função | Onde é usada | V1/V2 | Status |
|---|---|---|---|---|
| Next.js 16 (App Router) | Framework fullstack (frontend + API routes) | `src/app/**` | Ambos | 🟢 |
| TypeScript | Linguagem | Todo o projeto | Ambos | 🟢 |
| React | UI | `src/app`, `src/components` | Ambos | 🟢 |
| Tailwind CSS | Estilo | Todos os componentes | Ambos | 🟢 |
| Anthropic Claude (`claude-sonnet-5`) | IA — orquestração, tool use, geração de resposta | `src/lib/anthropic/*`, `src/ai/chat/gerarRespostaAssistente.ts` | Ambos | 🟢 |
| Anthropic web search/fetch nativos | Busca restrita a domínios oficiais/fabricante/entidade/imprensa | `src/lib/anthropic/tools.ts` | Ambos | 🟢 |
| Supabase (Postgres) | Banco de dados, RLS, Auth, Vault | `src/lib/supabase/*`, `supabase/migrations/*` | Ambos | 🟢 |
| Supabase Auth | Login (Google OAuth) + identidade WhatsApp | `src/services/supabase/authService.ts`, `userIdentityService.ts` | Ambos | 🟢 |
| Supabase Vault | Guarda o refresh token do Google Calendar fora de coluna normal | `store/read/delete_google_refresh_token` (RPCs) | Ambos | 🟢 |
| Z-API | Mensageria WhatsApp (não-oficial) | `src/lib/whatsapp/zapiClient.ts`, `/api/whatsapp/webhook` | V1 | 🟢 |
| OpenAI (`gpt-4o-mini-transcribe`) | Transcrição de áudio do WhatsApp | `src/lib/openai/whisperClient.ts` | V1 | 🟢 |
| Google Calendar API (OAuth) | Agenda do cliente | `src/services/google/googleCalendarService.ts`, `src/lib/google/calendarClient.ts` | Ambos (tecnicamente); só validado em uso real via WhatsApp | 🟢 |
| Google Maps Platform (Geocoding + Routes + Static Maps) | Distância/duração/mapa de rota | `src/lib/google/mapsClient.ts` | Ambos | 🟢 |
| Mercado Pago API | Assinatura/pagamento | `src/lib/mercadopago/client.ts` | Ambos | 🟢 |
| `pdf-lib` | Geração de PDF (relatórios) | `src/services/documents/pdfGenerator.ts` | Ambos | 🟢 |
| Railway | Hospedagem + crons externos | infraestrutura (fora do repo) | Ambos | ⚫ execução dos crons não verificável no código |

---

## 4. Frota IA V1 — WhatsApp

### 4.1 Entrada do cliente

Mensagem chega via webhook Z-API (`POST /api/whatsapp/webhook`), autenticado por token na query string comparado em tempo constante (`webhook/route.ts:192-196`). Eco da própria conta (`fromMe`) e eventos sem telefone/tipo reconhecido são ignorados (`:206-217`).

### 4.2 Identificação

`resolveOrCreateUserByPhone` (`userIdentityService.ts:28-72`): busca em `user_channels` por `(provider="z_api", external_user_id=telefone)`. Se não existe, cria de verdade um usuário em `auth.users` via Admin API (`phone_confirm: true` — o número é considerado verificado só por ter mandado a mensagem por aquele canal) e insere o vínculo em `user_channels`.

**Antes** de resolver o usuário, o webhook intercepta resposta de checklist pendente por telefone (`findPendingChecklistDispatchByPhone`) — motorista que só responde checklist nunca vira "usuário" formal do sistema.

### 4.3 Onboarding

Onboarding conversacional, uma pergunta por vez, estado explícito em `onboarding_sessions.state` (não depende de reler o histórico de texto). Ordem real (`src/ai/whatsapp/onboardingConversation.ts`):

| # | Estado | Pergunta | Obrigatório | Campo salvo |
|---|---|---|---|---|
| 1 | `awaiting_name` | "Como posso chamar você?" (precedida de mensagem explicando o produto) | Sim | `name` |
| 2 | `awaiting_profile` | "Como você atua hoje?" — Motorista autônomo / Apenas motorista / Dono de empresa / Gestor de frota / Transportador (lista nativa) | Sim | `companyType`, `profileLabel` |
| 3 | `awaiting_intent` | "O que você quer resolver primeiro com o Frota IA?" — categorias reais do produto + "ver tudo" | Sim | `intentId`, `intentLabel` |
| 4 | `awaiting_base_location` | "Qual cidade ou região você utiliza como base principal?" | Sim | `baseCity`, `baseState` |
| 5 | `awaiting_region` | "Em qual região você mais atua?" (lista de 6) | Sim | `region` |
| 6 | `awaiting_fixed_route` | "Você trabalha com rota fixa?" (texto sim/não — botões nativos foram removidos após falha em teste real) | Sim | `hasFixedRoute` |
| 7 | `awaiting_primary_vehicle` | "Qual a marca e modelo do seu veículo?" | **Opcional** (aceita "pular"/"depois") | `primaryVehicleRaw` |
| 8 | `awaiting_vehicle_configuration` | "Qual a configuração do seu veículo?" (toco/truck/cavalo mecânico/carreta/bitrem/rodotrem etc., com desambiguação de eixos) | Sim — único passo que nunca pode ser pulado | `vehicleType`, `axleCount` |

**Cancelar/pausar**: palavras-chave (`cancelar`, `pausar`, `continuar depois`) levam a `state="paused"`; retomada reconstrói a pergunta pelo primeiro campo ainda ausente em `collectedData` — não guarda "onde parou" além disso.

**Nota de legado**: o estado `awaiting_vehicle_count` existe no enum do banco mas **nunca é atribuído pelo código atual** — confirmado por busca completa no repositório. Ver seção 18.

### 4.4 Criação/identificação da empresa

`finalizeOnboarding.ts`, ao concluir o passo 8, cria `companies` + `company_members` (papel `owner`, `is_default: true`) via `createCompanyWithOwner`.

### 4.5 Cadastro do usuário

O próprio `auth.users` criado na identificação (4.2) já é o usuário; o onboarding só completa `profiles`/`companies`. Não há um passo de "cadastro de usuário" separado do onboarding.

### 4.6 Cadastro do veículo

Se `vehicleType` foi resolvido (sempre, quando o onboarding chega ao fim), `finalizeOnboarding` cria o veículo e o marca como padrão (`setDefaultVehicle`). Falha nessa gravação **não bloqueia** a conclusão do onboarding (catch silencioso deliberado) — o veículo pode ser cadastrado depois via `gerenciar_veiculo`.

### 4.7 Memória do cliente

Ver seção 7 (seção dedicada) — achado importante: o sistema de memória grava mas **não é lido de volta** pela IA em nenhum ponto do fluxo real.

### 4.8 Processamento das mensagens

`gerarRespostaAssistente.ts` (motor único, compartilhado com o painel): carrega até 30 mensagens de histórico, salva a mensagem recebida, monta o system prompt (estilo de resposta, ~30 regras de formatação/fonte/ferramenta, contexto da empresa/veículo), chama a Claude com as 28 ferramentas + busca web restrita, roda até 4 rodadas de tool use, salva a resposta final.

### 4.9 IA

Ver seção 6 (seção dedicada).

### 4.10 Escolha de ferramentas

A Claude decide sozinha qual ferramenta chamar (tool use nativo da API) — não existe um roteador de intenção separado escrito à mão. Campos de contexto (`userId`, `companyId`, `conversationId`, `sourceMessageId`) são **removidos** do que o modelo vê e **reinjetados pelo backend** depois da decisão — o modelo nunca controla esses valores.

### 4.11 Cálculos

12 ferramentas de cálculo puro, síncronas, sem I/O externo: `calcular_cpk`, `calcular_combustivel`, `analisar_frete`, `calcular_margem`, `calcular_valor_minimo_frete`, `calcular_receita_km`, `calcular_custo_dia`, `calcular_custo_veiculo_parado`, `calcular_jornada`, `calcular_custo_viagem`, `comparar_pneus`, `verificar_piso_minimo_antt`. Ver tabela completa na seção 5.

### 4.12 Consultas

`consultar_historico` (análises/documentos já gerados), `consultar_rota` (distância/geocodificação), `consultar_conhecimento_operacional` (base de conhecimento estática local, 6 tópicos, não é RAG/embedding).

### 4.13 Fotos

Imagem (JPEG/PNG/GIF/WebP) vira bloco `image` em base64 lido nativamente pela Claude (visão) — usada para ler CRLV, nota fiscal, tacógrafo etc. Sem OCR separado: é a própria Claude que interpreta a imagem.

### 4.14 Documentos

PDF vira bloco `document` em base64, lido nativamente. Planilha (.xlsx/.csv) é convertida para texto (`spreadsheetParser.ts`) e concatenada como mensagem — não é multimodal. Outros tipos de documento recebem mensagem fixa de limitação (🟡 parcial, não é um "não funciona" silencioso).

### 4.15 Relatórios

`gerar_documento`: gera PDF (via `analysisRunId` de uma análise já feita, ou `titulo`+`conteudo` livre) e **envia sempre via WhatsApp** (Z-API, base64 direto — sem Storage/URL pública). Falha se o usuário não tiver canal WhatsApp vinculado — na prática, **exclusiva do WhatsApp** mesmo sendo tecnicamente chamável do painel.

### 4.16 Alertas

`gerenciar_alerta` (CRIAR/LISTAR/CANCELAR, tabela `scheduled_alerts`) + sincronização automática de alerta ao criar/editar manutenção ou documento (`syncMaintenanceAlert`/`syncDocumentAlert`). O **disparo** em si é uma rota externa (`/api/alerts/dispatch`) que depende de cron do Railway — ver seção 19.

### 4.17 Pagamentos

Ver seção 4.19 (Assinatura) — cobre o fluxo completo.

### 4.18 Teste grátis

7 dias (`DIAS_TESTE_GRATIS`), criado automaticamente ao final do onboarding via `criarAssinaturaTeste`. Controle de reuso por telefone: `trial_usage` (chave persistente mesmo se a empresa for excluída) — telefone que já usou trial recebe assinatura já `EXPIRADA`.

### 4.19 Assinatura

Ferramenta `gerenciar_assinatura` gera link personalizado via Mercado Pago (`criarAssinaturaMensal` — preapproval recorrente, exige e-mail; ou `criarPagamentoAnual` — checkout/preference, parcelado 12x ou Pix à vista), com `external_reference` codificando `companyId|PLANO`. Preços fixos: Mensal R$79,90, Anual parcelado R$718,80 (12×R$59,90), Anual Pix R$647,00. Webhook (`/api/payments/mercadopago/webhook`) valida assinatura HMAC-SHA256, **sempre reconsulta a API** antes de confiar em qualquer notificação, nunca libera acesso só pelo corpo recebido, loga tudo em `payment_events`, responde sempre 200 (evita retry-loop do provedor).

**Bloqueio de acesso está ativo**: `isAccessAllowed` é checado no webhook principal do WhatsApp (`webhook/route.ts:550-560`) — mensagem é bloqueada se o acesso não é permitido, **exceto** se parecer um pedido de assinatura (regex `assin|contrat|pagar|pagamento|plano|mensalidade|renovar`), pra não travar o cliente sem saída.

### 4.20 Renovação/cancelamento

Status mapeados do Mercado Pago: `authorized→ATIVA`, `cancelled→CANCELADA`, `paused→INADIMPLENTE`. Não há renovação automática nos planos anuais (só o Mensal é recorrente de verdade via preapproval) — renovação anual depende de o cliente gerar um novo link.

### 4.21 Demais funcionalidades encontradas

- **Checklist diário**: rota `/api/checklists/dispatch` cria um envio por motorista elegível (ativo, com veículo e telefone, ainda não avisado hoje); resposta interceptada no webhook principal, classificada como `ok` só com frase exata numa lista fixa, qualquer outra coisa vira `atencao` (defensivo, nunca falso-positivo).
- **Notícias do setor**: opt-in explícito (`gerenciar_noticias_setor`), busca restrita a imprensa/entidades do setor, gera **um resumo por execução** (não por empresa, controle de custo), distribui a todas as empresas elegíveis.
- **Avisos de trial**: rota `/api/subscriptions/trial-warnings/dispatch`, avisa no dia 5 e no último dia.

---

## 5. Ferramentas da IA

**28 ferramentas registradas** em `src/ai/tools/index.ts` (`FERRAMENTAS_FROTA_IA`) — confirmado 1:1 contra o enum Postgres `frota_ia_tool_name` (mesma quantidade, mesma ordem, mesmos nomes). Nenhum arquivo órfão, nenhuma ferramenta faltando no registro.

| # | Ferramenta | Objetivo | Nº parâmetros visíveis à IA¹ | V1 | V2² | Status |
|---|---|---|---|---|---|---|
| 1 | `analisar_frete` | Viabilidade de frete (receita/custo/margem/risco) | 64 | Sim | Sim | 🟢 |
| 2 | `calcular_combustivel` | Litros/custo/consumo/autonomia | 23 | Sim | Sim | 🟢 |
| 3 | `calcular_cpk` | Custo por km, por categoria ou total | 32 | Sim | Sim | 🟢 |
| 4 | `comparar_pneus` | Pneu novo × recapado, custo total do ciclo | 9 | Sim | Sim | 🟢 |
| 5 | `calcular_custo_viagem` | Custo operacional consolidado de uma viagem | 33 | Sim | Sim | 🟢 |
| 6 | `calcular_margem` | Lucro/margem/markup/ponto de equilíbrio | 36 | Sim | Sim | 🟢 |
| 7 | `calcular_valor_minimo_frete` | Piso econômico de negociação | 61 | Sim | Sim | 🟢 |
| 8 | `calcular_receita_km` | Receita/custo/lucro por km | 54 | Sim | Sim | 🟢 |
| 9 | `calcular_custo_dia` | Custo diário de veículo/frota | 47 | Sim | Sim | 🟢 |
| 10 | `calcular_custo_veiculo_parado` | Impacto financeiro de veículo parado | 62 | Sim | Sim | 🟢 |
| 11 | `calcular_jornada` | Planejamento/análise de jornada operacional | 61 | Sim | Sim | 🟢 |
| 12 | `verificar_piso_minimo_antt` | Piso mínimo LEGAL (Lei 13.703/2018) | 11 | Sim | Sim | 🟢 |
| 13 | `gerenciar_google_calendar` | CRUD de compromissos na Agenda Google | 16 | Sim | Sim (tecnicamente) | 🟢 |
| 14 | `consultar_historico` | Busca análises/documentos já gerados | 5 | Sim | Sim | 🟢 |
| 15 | `gerenciar_alerta` | Cria/lista/cancela alerta agendado | 7 | Sim | Sim | 🟢 |
| 16 | `gerar_documento` | Gera PDF e envia por WhatsApp | 4 | Sim | Tecnicamente sim, falha sem canal WhatsApp | 🟢 (exclusiva de fato do WhatsApp) |
| 17 | `consultar_rota` | Geocodifica/calcula distância-duração de rota | 5 | Sim | Sim (mapa visual é exclusivo WhatsApp) | 🟢 |
| 18 | `registrar_despesa` | Registra/consulta despesa | 10 | Sim | Sim | 🟢 |
| 19 | `gerenciar_veiculo` | CRUD de veículo + perfil de custo/pneu | 35 | Sim | Sim | 🟢 |
| 20 | `definir_estilo_resposta` | Preferência de tom de resposta | 1 | Sim | Sim | 🟢 |
| 21 | `consultar_conhecimento_operacional` | Base de boas práticas (6 tópicos) | 1 | Sim | Sim | 🟢 |
| 22 | `gerenciar_rota_salva` | CRUD de rotas frequentes | 16 | Sim | Sim | 🟢 |
| 23 | `gerenciar_noticias_setor` | Ativa/desativa notícias diárias | 1 | Sim | Sim | 🟢 |
| 24 | `gerenciar_assinatura` | Gera link de pagamento | 2 | Sim | Sim | 🟢 |
| 25 | `gerenciar_motorista` | CRUD de motorista | 7 | Sim | Sim | 🟢 |
| 26 | `gerenciar_manutencao` | CRUD de manutenção | 7 | Sim | Sim | 🟢 |
| 27 | `gerenciar_documento_frota` | CRUD de documento de frota | 7 | Sim | Sim | 🟢 |
| 28 | `gerenciar_jornada_salva` | CRUD de jornada operacional | 14 | Sim | Sim | 🟢 |

¹ `userId`/`companyId`/`conversationId`/`sourceMessageId` são sempre filtrados do schema visível à IA e reinjetados pelo backend — não contam neste número.
² "V2" aqui significa "chamável pelo widget de IA do painel", já que o motor é o mesmo — não significa que a tela dedicada daquele domínio tenha formulário próprio (ver seção 9).

**12 de cálculo puro** (`FERRAMENTAS_DE_ANALISE` em `gerarRespostaAssistente.ts:29-42`, geram registro em `analysis_runs`): as 11 calculadoras + `verificar_piso_minimo_antt`. **16 de integração/escrita**: as demais, tocando Supabase e/ou uma API externa.

### Detalhamento das ferramentas com dependência externa (as demais são cálculo puro ou só Supabase — ver tabela acima para objetivo/parâmetros)

**`gerenciar_google_calendar`** — `src/ai/tools/gerenciar-google-calendar.ts`. Modos: VERIFICAR_CONEXAO, LISTAR_CALENDARIOS, DEFINIR_CALENDARIO_PADRAO, CONSULTAR, CRIAR, CRIAR_JORNADA (evento múltiplo de uma vez), ALTERAR, EXCLUIR. Datas devem chegar em ISO 8601 absoluto — a ferramenta não interpreta linguagem natural de data. Dependência: Google Calendar API (OAuth por usuário). Usada na V1 e V2.

**`gerar_documento`** — `src/ai/tools/gerar-documento.ts`. Exige `analysisRunId` OU `titulo`+`conteudo`. Busca canal WhatsApp do usuário; sem ele, falha. Sempre envia via `sendWhatsappPdf` (Z-API, base64), nunca gera link de download. Dependência: Z-API.

**`consultar_rota`** — `src/ai/tools/consultar-rota.ts`. Geocodifica endereço → calcula distância/duração via Routes API. Se `enviarMapaVisual=true`, gera imagem estática e envia por WhatsApp (best-effort — falha no envio não derruba o resultado numérico). Dependência: Google Maps Platform; Z-API só para o mapa.

**`gerenciar_assinatura`** — `src/ai/tools/gerenciar-assinatura.ts`. Gera link de pagamento Mercado Pago; não bloqueia/libera acesso sozinha (isso é responsabilidade do webhook). Dependência: Mercado Pago API.

**Inconsistências de documentação encontradas** (não afetam o comportamento, só o comentário no código):
- `gerarRespostaAssistente.ts:23` diz "11 ferramentas de cálculo puro", mas o `Set` real logo abaixo tem 12 (inclui `verificar_piso_minimo_antt`).
- `tools.ts:45` diz "converte as 12 ferramentas", mas hoje itera sobre as 28 reais — o `.map()` usa o array real, então não afeta o comportamento.
- `verificar-piso-minimo-antt.ts:25` referencia uma ferramenta chamada `gerenciar_pesquisa_oficial`, que **não existe** — é uma referência solta ao conceito de busca web nativa da Claude (`web_search`), não uma das 28 ferramentas.

---

## 6. Inteligência artificial

**Modelo/provider**: Anthropic Claude, modelo `claude-sonnet-5` (`src/lib/anthropic/client.ts:4`). Chave via `ANTHROPIC_API_KEY`.

**Onde a chamada é feita**: `src/ai/chat/gerarRespostaAssistente.ts:129-135`, único ponto de chamada a `anthropic.messages.create` para conversas (existe uma segunda chamada isolada em `newsDigestService.ts` para o resumo diário de notícias, sem tool use de negócio).

**System prompt**: `src/lib/anthropic/systemPrompt.ts` (`construirSystemPrompt`) — monta dinamicamente: estilo de resposta preferido, ~30 regras de formatação/fonte/uso de ferramenta, data/hora atual no timezone da empresa, texto "o que o Frota IA faz", dados da empresa e do veículo padrão.

**Contexto**: histórico de até 30 mensagens (`listMessages`), contexto de cliente (`loadCustomerContext`) e de veículo (`loadVehicleContext`) carregados a cada turno.

**Ferramentas**: as 28 próprias + `web_search`/`web_fetch` nativos restritos a domínios oficiais/fabricante/entidade/imprensa (ver seção 12).

**Tool calling / roteamento**: nativo da Anthropic API — a própria Claude decide se e qual ferramenta chamar, sem um roteador de intenção escrito à mão. Loop de até `MAX_TOOL_ROUNDS=4` rodadas.

**Busca**: dois níveis reais — (1) restrita à lista de domínios permitidos (única chamada, uma lista concatenada de oficiais+fabricantes+entidades/imprensa); (2) fallback aberto (sem `allowed_domains`), acionado só se a busca restrita voltar zero resultado na mesma rodada, por 1 rodada extra, com aviso obrigatório de "fonte não oficial" na resposta.

**Tratamento de resposta**: texto final extraído dos blocos `text` da última rodada; se vazio, mensagem de fallback fixa ("Não consegui concluir essa resposta agora...").

**Fallback/erros**: `pause_turn` (limite interno de iteração da busca web da própria Anthropic) é tratado reenviando o turno sem mensagem extra. Falha de execução de ferramenta vira `tool_result` com `is_error: true` e mensagem genérica — nunca derruba a conversa inteira.

**Limites**: `max_tokens: 1536` por resposta; 4 rodadas de tool use no máximo.

**Segurança**: campos de contexto (`userId`, `companyId` etc.) nunca são controlados pelo modelo — são removidos do schema visível e reinjetados pelo backend depois da decisão de qual ferramenta chamar.

```
MENSAGEM
   ↓
CONTEXTO (histórico + empresa + veículo + preferências)
   ↓
IA (Claude, system prompt + 28 ferramentas + busca restrita)
   ↓
DECISÃO (responder direto OU tool_use)
   ↓
FERRAMENTA, SE NECESSÁRIO (reinjeta userId/companyId reais)
   ↓
RESULTADO (grava tool_executions, e analysis_runs se for cálculo)
   ↓
IA (interpreta resultado, monta resposta final)
   ↓
RESPOSTA AO CLIENTE (salva em messages, enviada pelo canal de origem)
```

---

## 7. Memória do Frota IA

**Achado central desta auditoria**: o sistema de memória (`ai_memories`) é **write-only** — grava, mas nunca é lido de volta pela IA.

- `saveMemory` (`memoryService.ts`) é chamado só em `finalizeOnboarding.ts`, salvando 2 chaves fixas: `operating_region` e `has_fixed_route`.
- `saveConfirmedMemory` (wrapper em `customerContext.ts:192-203`) **nunca é chamado** em nenhum outro lugar do projeto (confirmado por busca).
- `listActiveMemories` (`memoryService.ts`) está definida mas **nunca é chamada** em lugar nenhum.
- `loadCustomerContext` — a função que monta o que vai pro system prompt — **não consulta `ai_memories`**. O que é salvo lá nunca volta pra nenhuma conversa.
- As flags `company_preferences.ask_before_saving_memory`/`allow_automatic_memory` são graváveis (via tela de Configurações) mas **nunca são lidas/checadas** em nenhum lugar do código — vestigiais.

**O que de fato "é lembrado" e usado na prática, hoje**:
- Perfil e empresa (`profiles`, `companies`) — via `loadCustomerContext`, sempre.
- Preferências (`company_preferences`: estilo de resposta, combustível padrão, veículo padrão) — sempre carregadas e usadas no system prompt.
- Veículo padrão (`loadVehicleContext`).
- Histórico de mensagens (30 últimas) — memória de curto prazo da própria conversa.
- Histórico consultável sob demanda (`consultar_historico`, `analysis_runs`/`generated_documents`) — não é injetado automaticamente, só quando a IA decide buscar.

**Classificação**: 🔵 ESTRUTURA PREPARADA para o sistema `ai_memories` propriamente dito — schema e escrita funcionam, mas não há efeito prático na experiência da IA hoje.

---

## 8. Banco de dados

**29 tabelas** em `public` (Supabase/Postgres), RLS habilitado em todas (68 policies), 53 migrations (26/07 a 18/08/2026). Dois clients: sessão (`server.ts`, respeita RLS) e admin/service role (`admin.ts`, ignora RLS — restrito a webhooks, crons e ferramentas de IA que já autenticaram o usuário fora da sessão web).

| Tabela | Função | V1 | V2 | Quem escreve | Quem consulta |
|---|---|---|---|---|---|
| `companies` | Empresa/tenant raiz | Sim | Sim | onboarding, painel Empresa | quase tudo |
| `profiles` | Perfil do usuário (espelha `auth.users`) | Sim | Sim | trigger de signup | `loadCustomerContext` |
| `company_members` | Vínculo usuário↔empresa + papel | Sim | Sim | onboarding, gestão manual | gate de acesso ao painel |
| `company_preferences` | Preferências por empresa | Sim | Sim | `definir_estilo_resposta`, painel Configurações | system prompt |
| `drivers` | Motoristas | Sim | Sim | `gerenciar_motorista`, painel Motoristas | checklist, alertas |
| `vehicles` | Veículos | Sim | Sim | `gerenciar_veiculo`, painel Veículos | quase tudo operacional |
| `vehicle_documents` | Documentos com validade | Sim | Sim | `gerenciar_documento_frota`, painel Documentos | Alertas |
| `vehicle_cost_profiles` | Estrutura de custo do veículo | Sim | Sim | `gerenciar_veiculo` (`DEFINIR_CUSTO`) | cálculos |
| `vehicle_tire_profiles` | Perfil de pneu do veículo | Sim | Sim | `gerenciar_veiculo` (`DEFINIR_PNEU`) | `comparar_pneus` |
| `maintenance_schedules` | Agenda de manutenção | Sim | Sim | `gerenciar_manutencao`, painel Manutenção | Alertas, Relatórios |
| `expenses` | Despesas | Sim | Sim | `registrar_despesa`, painel Despesas | Relatórios, Dashboard |
| `saved_journeys` | Jornadas salvas | Sim | Só leitura | `gerenciar_jornada_salva` | painel Jornadas (leitura) |
| `saved_routes` | Rotas favoritas | Sim | Só leitura | `gerenciar_rota_salva` | painel Rotas (leitura) |
| `checklist_dispatches` | Envio/resposta de checklist | Sim (cron+resposta) | Só leitura | `/api/checklists/dispatch`, webhook | painel Checklists (leitura) |
| `scheduled_alerts` | Central de alertas agendados | Sim | — | `gerenciar_alerta`, sync automático | `/api/alerts/dispatch` |
| `conversations`/`messages` | Sessão e histórico de chat | Sim | Sim | todo turno de conversa | `gerarRespostaAssistente` |
| `analysis_runs` | Execução de cálculo (auditoria) | Sim | — | as 12 ferramentas de cálculo | `consultar_historico`, Relatórios/Dashboard |
| `tool_executions` | Log de toda chamada de ferramenta | Sim | Sim | `saveToolExecution` | observabilidade |
| `ai_memories` | Memória de longo prazo (ver seção 7) | Sim (escrita) | — | `finalizeOnboarding` | **ninguém** (achado) |
| `generated_documents` | PDFs gerados | Sim | — | `gerar_documento` | `consultar_historico` |
| `google_integrations`/`calendar_action_logs` | Conexão + log do Google Calendar | Sim | Sim | `gerenciar_google_calendar` | mesma ferramenta |
| `onboarding_sessions` | Estado da máquina de onboarding | Sim | — | webhook/onboarding web | onboarding |
| `subscriptions` | Assinatura/plano | Sim | Sim (gate do painel) | webhook Mercado Pago, onboarding | gate de acesso (ambos) |
| `payment_events` | Log bruto de webhook de pagamento | Sim | — | webhook Mercado Pago | auditoria |
| `trial_usage` | Controle de trial por telefone | Sim | — | `criarAssinaturaTeste` | mesma função |
| `user_channels` | Identidade por canal (telefone/web) | Sim | Sim | onboarding, login | identificação |
| `news_digests` | Histórico do resumo diário (global, sem `company_id`) | Sim | Sim (leitura) | `/api/news/dispatch` | painel Notícias |

Relacionamento simplificado: `companies` é a raiz; `vehicles`/`drivers` são o hub que conecta quase toda tabela operacional (documentos, manutenção, custo, pneu, checklist, rota/jornada, alerta); `conversations`/`messages` conectam ao histórico de IA (`analysis_runs`, `tool_executions`, `ai_memories`, `expenses` via `source_message_id`).

---

## 9. Frota IA V2 — Painel Web

**Acesso**: login só Google OAuth (Supabase Auth). Gate em `src/app/frota/layout.tsx`: sem sessão → `/login`; sem empresa → `/onboarding`; empresa sem entitlement → `/frota-indisponivel`. Entitlement = `companies.fleet_panel_enabled OR subscriptions.fleet_panel_included` (produto/UI, **não é RLS** — cada rota `/api/frota/*` checa de novo por conta própria).

**Shell**: `FrotaShell` monta `FrotaHeader` + `FrotaSidebar`/`FrotaMobileSidebar` (15 itens, ícones emoji coloridos, marca "FROTA IA / PAINEL") + `FrotaAiWidget` fixo em toda página.

**Widget "Pergunte ao Frota IA"**: reaproveita `/api/chat` → mesmo `gerarRespostaAssistente`. Recursos confirmados: contexto de página (rótulo da tela atual, não persistido como mensagem), upload de imagem (mesmo pipeline de visão do WhatsApp), `router.refresh()` automático após resposta da IA (sincroniza dados da tela sem reload manual).

### As 15 seções

| Seção | Finalidade | Tabelas | Ações reais | API | Status |
|---|---|---|---|---|---|
| **Dashboard** | Visão geral consolidada + insight de IA | 6+ tabelas | Só leitura | — (Server Component) | 🟢 |
| **Empresa** | Dados cadastrais | `companies` | Update (singleton) | `PATCH /api/frota/empresa` | 🟢 |
| **Veículos** | Cadastro de frota | `vehicles`(+docs) | Create, Update, toggle ativo/inativo — **sem delete real** | `GET/POST/PATCH` | 🟢 |
| **Motoristas** | Cadastro de motoristas | `drivers` | Create, Update, toggle — sem delete | `GET/POST/PATCH` | 🟢 |
| **Fretes/Análises** | Histórico de análises de frete | `analysis_runs` | Só leitura (por desenho) | — | 🟡 (leitura intencional) |
| **Manutenção** | Agenda de manutenção | `maintenance_schedules` | Create, Update — sem delete | `GET/POST/PATCH` | 🟢 |
| **Documentos** | Documentos com vencimento | `vehicle_documents` | Create, Update — sem delete | `GET/POST/PATCH` | 🟢 |
| **Despesas** | Despesas operacionais | `expenses` | **Create+Read+Update+Delete completo** — única seção assim | `GET/POST/PATCH/DELETE` | 🟢 |
| **Jornadas** | Histórico de jornadas | `saved_journeys` | Só leitura (só WhatsApp escreve) | — | 🟡 (leitura intencional) |
| **Rotas salvas** | Rotas frequentes | `saved_routes` | Só leitura (só WhatsApp escreve) | — | 🟡 (leitura intencional) |
| **Checklists** | Histórico de checklist | `checklist_dispatches` | Só leitura, sem disparo manual | — | 🟡 (leitura intencional) |
| **Alertas** | View consolidada de vencimento | (derivada, sem tabela própria) | Só leitura, link pra origem | — | 🟢 |
| **Relatórios** | Resumo operacional + **exportação PDF** | 8 tabelas | Exportar PDF | `GET /api/frota/relatorios/pdf` | 🟢 |
| **Notícias** | Ativa/desativa resumo diário | `company_preferences`, `news_digests` | Toggle | `PATCH /api/frota/noticias` | 🟢 |
| **Configurações** | Preferências da IA | `company_preferences` | 1 seletor (estilo de resposta) + atalho pra Notícias | `PATCH /api/frota/configuracoes` | 🟡 (bem mais limitado que o nome sugere — ver seção 19) |

**Só no painel**: exportação de PDF, formulário estruturado de empresa, toggles de UI para preferências. **Só no WhatsApp** (painel é vitrine somente-leitura): Jornadas, Rotas salvas, Checklists (disparo/resposta), Análises de frete.

---

## 10. Relação V1 × V2

| Função | V1 WhatsApp | V2 Painel | Banco/Tabela | Compartilhada? | Status |
|---|---|---|---|---|---|
| Onboarding | Sim (nativo) | Sim (espelho web em `/onboarding`, mesmo motor) | `onboarding_sessions`, `companies` | Sim | 🟢 |
| Cálculos (12 ferramentas) | Sim | Sim (via widget) | `analysis_runs` | Sim | 🟢 |
| Cadastro veículo/motorista/manutenção/documento | Sim (via IA) | Sim (formulário dedicado + via IA) | tabelas próprias | Sim | 🟢 |
| Despesas | Sim (via IA) | Sim (formulário + IA), **única com delete** | `expenses` | Sim | 🟢 |
| Jornadas/Rotas salvas | Sim (leitura+escrita) | Só leitura | `saved_journeys`/`saved_routes` | Sim (dado), não (escrita) | 🟡 |
| Checklist diário | Sim (disparo+resposta) | Só leitura | `checklist_dispatches` | Sim (dado) | 🟡 |
| Alertas | Sim (disparo via cron externo) | Sim (view consolidada, leitura) | `scheduled_alerts` (origem) | Sim | 🟢 |
| Documento/relatório PDF | Sim (envio por WhatsApp) | Sim (download direto) | `generated_documents` (só WhatsApp grava aqui) | Parcial — mecanismos diferentes | 🟢 (ambos, caminhos distintos) |
| Notícias do setor | Sim (recebe) | Sim (liga/desliga, lê último resumo) | `company_preferences`, `news_digests` | Sim | 🟢 |
| Assinatura/pagamento | Sim (gera link, é bloqueado se vencido) | Não bloqueia acesso a nada específico do painel além do próprio painel | `subscriptions` | Sim | 🟢 |
| Agenda (Google Calendar) | Sim | Tecnicamente sim (mesmo motor) — nunca testado via painel | `google_integrations` | Sim (schema), identidade não | 🟡 (ver seção 19) |
| Widget de IA no painel | — | Sim, com contexto de página/upload/refresh | `messages`/`conversations` | Sim | 🟢 |

---

## 11. Banco único

O compartilhamento é real, não apenas teórico — confirmado lendo o código dos dois lados, não presumido:

**Sentido WhatsApp → Painel**: cliente cadastra veículo via `gerenciar_veiculo` (WhatsApp) → grava em `vehicles` → tela Veículos do painel lê a mesma tabela (`listVehiclesForPanel`) → veículo aparece. Mesma lógica para motorista, despesa, manutenção, documento.

**Sentido Painel → WhatsApp/IA**: gestor edita despesa no painel (`PATCH /api/frota/despesas/[id]`) → grava em `expenses` → próxima vez que a IA (WhatsApp ou widget) consultar despesas (`registrar_despesa` modo `CONSULTAR`) → lê o dado já atualizado, sem cache intermediário.

**Ressalva real encontrada**: Jornadas, Rotas salvas e Checklists só recebem escrita do lado WhatsApp — o painel nesses casos é somente vitrine, não um caminho de escrita alternativo (ver seção 9/10). Não é falha, é desenho deliberado documentado em comentário no próprio código.

---

## 12. Integrações externas

| Integração | Função | Arquivo/service | Dados enviados | Dados recebidos | V1/V2 | Status |
|---|---|---|---|---|---|---|
| Anthropic Claude | Orquestração de IA, tool use | `src/lib/anthropic/client.ts`, `tools.ts`, `systemPrompt.ts` | histórico, system prompt, ferramentas | texto/tool_use | Ambos | 🟢 |
| Busca web nativa Claude | Fatos externos (ANTT/ANP/legislação/fabricante/imprensa) | `tools.ts:100-302` (3 listas de domínio + fallback aberto) | query de busca | resultados restritos a domínio | Ambos | 🟢 |
| OpenAI | Transcrição de áudio | `src/lib/openai/whisperClient.ts` (modelo `gpt-4o-mini-transcribe`) | áudio `.ogg` base64 | texto transcrito (pt) | V1 | 🟢 |
| Z-API | Envio/recebimento WhatsApp | `src/lib/whatsapp/zapiClient.ts`, `/api/whatsapp/webhook` | texto/lista/botão/PDF/imagem | mensagem inbound (texto/mídia) | V1 | 🟢 |
| Google Calendar | Agenda do cliente | `src/services/google/googleCalendarService.ts`, `src/lib/google/calendarClient.ts` | evento (criar/editar/excluir) | lista de eventos/calendários | Ambos (schema) | 🟢 |
| Google Maps Platform | Geocoding + Routes + Static Maps | `src/lib/google/mapsClient.ts` | endereço/coordenadas | distância/duração/polyline/imagem | Ambos | 🟢 |
| Mercado Pago | Assinatura/pagamento | `src/lib/mercadopago/client.ts`, webhook | plano/valor/e-mail | link de pagamento, confirmação de status | Ambos | 🟢 |
| Railway | Hospedagem + 4 crons (`/api/*/dispatch`) | infraestrutura, fora do repo | — | — | Ambos | ⚫ agendamento não verificável no código |

---

## 13. Experiência completa do cliente

```
NOVO CLIENTE
   ↓
manda mensagem no WhatsApp → identificado por telefone (novo auth.users)
   ↓
ONBOARDING (8 perguntas, uma por vez) → empresa criada, veículo cadastrado,
                                          teste grátis de 7 dias iniciado
   ↓
CLIENTE ATIVO — usa qualquer uma das 28 ferramentas sob demanda:
   calcula frete, registra despesa (foto de nota), agenda manutenção,
   recebe checklist diário, recebe alerta de vencimento, consulta legislação
   ↓
TRIAL ACABA (dia 5 e último dia: aviso automático)
   ↓
ASSINA (link Mercado Pago gerado pela própria IA) → webhook confirma →
   acesso mantido sem interrupção perceptível
   ↓
[opcional, hoje raro] GESTOR acessa o PAINEL WEB (login Google) —
   vê os mesmos dados em tabela, exporta relatório em PDF,
   usa o mesmo assistente de IA via widget flutuante
```

---

## 14. Funcionalidades implementadas

Onboarding completo (WhatsApp + espelho web) · 28 ferramentas de IA (12 cálculo + 16 integração) registradas e funcionais · Visão/foto (CRLV, nota, tacógrafo) · PDF nativo (leitura) · Planilha (.xlsx/.csv) · Transcrição de áudio · Google Calendar (CRUD completo) · Google Maps (rota + mapa visual) · Assinatura Mercado Pago (trial, mensal recorrente, anual parcelado/Pix, webhook validado) · Bloqueio de acesso por assinatura vencida (ativo no webhook principal) · Checklist diário (código completo; cron externo não verificável) · Alertas de vencimento (cálculo + sincronização + disparo; cron externo não verificável) · Notícias do setor opt-in · Painel V2 com 15 seções todas com implementação real (nenhuma vazia) · Despesas com CRUD completo no painel · Exportação de relatório em PDF no painel · Widget de IA no painel com contexto de página, upload de imagem e auto-refresh · Insight de IA no Dashboard (cacheado) · RLS em 100% das tabelas de dados de usuário.

## 15. Funcionalidades parciais

Documentos genéricos (não-PDF, não-planilha) no WhatsApp — recebem mensagem de limitação, não são interpretados · Configurações do painel — só 1 controle real (estilo de resposta) + atalho, apesar do nome sugerir um hub completo · Seções somente-leitura do painel (Fretes/Análises, Jornadas, Rotas salvas, Checklists) — dado real, mas sem caminho de escrita alternativo ali · Veículos/Motoristas/Manutenção/Documentos no painel — Create+Update funcionam, mas sem delete real (só toggle onde existe) · Vínculo entre a Agenda Google conectada via WhatsApp e uma eventual sessão do painel — tecnicamente a mesma ferramenta, mas as duas identidades (telefone vs. e-mail) não são automaticamente unificadas.

## 16. Estruturas preparadas

Sistema de memória `ai_memories` — schema e escrita funcionam, mas não é lido de volta pela IA em nenhum fluxo real · Flags `ask_before_saving_memory`/`allow_automatic_memory` — graváveis, nunca lidas · `listActiveMemories`/`saveConfirmedMemory` — funções prontas, nunca chamadas.

## 17. Funcionalidades planejadas

Nenhuma encontrada com evidência clara de "planejado mas não implementado" que já não caia em uma das categorias acima — as pendências reais deste projeto (ex.: pedágio via Maplink, automação plena de gestão de usuários no painel) não têm código nenhum no repositório, então não há "estrutura preparada" pra citar aqui além do que já está nas seções 15/16.

## 18. Legado

Estado `awaiting_vehicle_count` no enum `onboarding_state` do banco — nunca mais atribuído pelo código, mantido só por compatibilidade histórica · Comentário em `gerarRespostaAssistente.ts:23` ("11 ferramentas de cálculo puro") desatualizado frente às 12 reais · Comentário em `tools.ts:45` ("converte as 12 ferramentas") desatualizado frente às 28 reais · Referência a `gerenciar_pesquisa_oficial` em `verificar-piso-minimo-antt.ts:25` — nome de ferramenta que nunca existiu · Comentário em `gerenciar-assinatura.ts:14-16` afirmando que o gating de acesso "ainda não está ligado no loop principal" — está, de fato, ativo (`webhook/route.ts:550-560`) · Nome do módulo `whisperClient.ts` sugere o modelo Whisper da OpenAI, mas na prática chama `gpt-4o-mini-transcribe`.

## 19. Riscos e inconsistências

*(Apenas documentado — nada foi corrigido nesta auditoria.)*

1. **Automação de cron não verificável no código**: checklist, alertas, notícias e avisos de trial dependem de um agendador externo (Railway) chamando as rotas `/api/*/dispatch` — o repositório só prova que as rotas funcionam quando chamadas, não que algo as chama automaticamente todo dia. Recomenda-se confirmar a configuração real desses crons fora do código antes de garantir isso comercialmente.
2. **Memória de IA sem efeito prático**: `ai_memories` existe, grava, mas não influencia nenhuma resposta da IA — expectativa de "a IA lembra de mim" pode estar desalinhada com o comportamento real (ver seção 7).
3. **Identidade dividida entre canais**: um mesmo cliente tem um `auth.users` diferente no WhatsApp (por telefone) e no login web (por Google/e-mail), sem vínculo automático entre os dois — uma conexão de Google Calendar feita via WhatsApp não "aparece" pro mesmo usuário logado no painel, a menos que alguém vincule manualmente as duas identidades.
4. **Configurações do painel é mais estreita do que o nome sugere** — hoje só controla estilo de resposta; gestão de usuários, integração Google Calendar e assinatura não são configuráveis por ali, apesar de existirem como conceito no produto.
5. **`gerar_documento` é tecnicamente multi-canal mas funcionalmente exclusiva do WhatsApp** — falha silenciosamente pro caso de uso "quero baixar meu relatório pelo painel via chat", ainda que exista o botão dedicado de PDF em Relatórios como alternativa real.
6. **Painel V2 não tem modelo de negócio próprio** — acesso é um flag manual por empresa (`fleet_panel_enabled`), não um produto vendido com checkout; hoje, na prática, só uma empresa tem acesso.
7. **Sem duplicação real de dados entre V1/V2** — não foi encontrada nenhuma tabela paralela guardando a "mesma informação" de formas diferentes; o risco arquitetural aqui é baixo. O ponto de atenção real é o item 3 (identidade), não duplicação de dado.
8. **Comentários desatualizados no código** (seção 18) — pequeno risco de um desenvolvedor futuro (humano ou IA) confiar no comentário em vez de reler o código.

## 20. Mapa final do Frota IA

```
                              CLIENTE
                                 │
                  ┌──────────────┴──────────────┐
             WHATSAPP (Z-API)              PAINEL WEB (Google OAuth)
                  │                              │
                  └──────────────┬───────────────┘
                                  │
                         BACKEND (Next.js, Railway)
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
              gerarResposta   Rotas /api/    Rotas /api/frota/*
              Assistente()    *dispatch      (CRUD do painel)
                    │             │             │
                    └─────────────┼─────────────┘
                                  │
                    IA (Claude) + 28 FERRAMENTAS
                                  │
                    ┌─────────────┼─────────────────────┐
                    │             │                      │
              BANCO (Supabase,   INTEGRAÇÕES         BUSCA WEB
              29 tabelas, RLS)   externas             restrita
                                  │
              Google Calendar · Google Maps · Mercado Pago ·
              Z-API · OpenAI (transcrição)
```

---

*Documento gerado por auditoria de código automatizada (4 investigações independentes + confronto cruzado). Toda afirmação classificada como 🟢/🟡/🔵/⚪/🔴/⚫ tem evidência de arquivo:linha rastreável no código-fonte na branch `claude/frota-ia-assistente-setup-qlrbac`, commit `7324e88`.*
