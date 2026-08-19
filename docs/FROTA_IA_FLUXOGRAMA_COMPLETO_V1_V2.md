# FROTA IA — FLUXOGRAMA COMPLETO V1 + V2

## Jornada do Cliente, Arquitetura, Ferramentas e Integração WhatsApp ↔ Painel

**Gerado em:** 19/08/2026 · **Repositório:** `github.com/rafaelkamosaquario-cpu/frotaia`, branch `claude/frota-ia-assistente-setup-qlrbac`, commit `7324e88`
**Companheiro de:** `FROTA_IA_RAIO_X_V1_V2.md` (documento técnico/funcional completo, com o detalhamento textual de cada item aqui representado visualmente).

Este documento não altera nada — é representação visual de comportamento já auditado. Nenhuma seta aparece aqui sem evidência de código citada logo abaixo do diagrama correspondente.

## Legenda obrigatória

🟢 Implementado — 🟡 Parcialmente implementado — 🔵 Estrutura preparada — ⚪ Planejado — 🔴 Legado/problema — ⚫ Não verificável no código (depende de infraestrutura externa, ex. cron do Railway)

---

## Fluxograma 1 — Visão geral do ecossistema

```mermaid
flowchart TD
    A[Cliente] --> B{Canal}
    B -->|WhatsApp| C["V1 — WhatsApp<br/>(produto real)"]
    B -->|Painel web| D["V2 — Painel<br/>(acesso restrito hoje)"]
    C --> E[(Banco único<br/>Supabase, 29 tabelas)]
    D --> E
    C --> F["gerarRespostaAssistente()<br/>motor único de IA"]
    D --> F
    F --> G[28 Ferramentas]
    G --> H[(Banco)]
    G --> I[Integrações externas]
    I --> I1[Google Calendar]
    I --> I2[Google Maps]
    I --> I3[Mercado Pago]
    I --> I4[Z-API WhatsApp]
    I --> I5[OpenAI - áudio]
    G --> J["Documentos<br/>(PDF via WhatsApp)"]
    G --> K["Pagamentos<br/>(assinatura)"]
```

**Evidências no código**: `src/ai/chat/gerarRespostaAssistente.ts` (motor único, chamado por `src/app/api/chat/route.ts` e `src/app/api/whatsapp/webhook/route.ts`); `src/ai/tools/index.ts` (28 ferramentas); `src/lib/supabase/database.types.ts` (29 tabelas).

---

## Fluxograma 2 — Jornada completa V1

```mermaid
flowchart TD
    A[Novo cliente manda mensagem] --> B[WhatsApp / Z-API]
    B --> C["/api/whatsapp/webhook<br/>valida token"]
    C --> D["resolveOrCreateUserByPhone()"]
    D --> E{Usuário existe<br/>em user_channels?}
    E -->|Não| F["Cria auth.users<br/>phone_confirm=true"]
    F --> G[ONBOARDING]
    E -->|Sim| H{Tem empresa?}
    H -->|Não| G
    H -->|Sim| I["Carrega contexto<br/>loadCustomerContext"]
    G --> G1[8 perguntas, uma por vez]
    G1 --> G2["finalizeOnboarding()"]
    G2 --> G2a[companies + company_members]
    G2 --> G2b["subscriptions<br/>trial 7 dias"]
    G2 --> G2c[vehicles, se resolvido]
    G2 --> I
    I --> J["gerarRespostaAssistente()"]
    J --> K{IA decide}
    K -->|Responder direto| Z[Resposta ao cliente]
    K -->|tool_use| L[28 ferramentas — ver Fluxograma 5]
    L --> M[(Banco / API externa)]
    M --> J
    J --> Z
```

**Evidências**: `src/app/api/whatsapp/webhook/route.ts:192-260`; `src/services/supabase/userIdentityService.ts:28-72`; `src/ai/whatsapp/finalizeOnboarding.ts` (inteiro); `src/ai/chat/gerarRespostaAssistente.ts:89-135`.

---

## Fluxograma 3 — Onboarding V1

```mermaid
flowchart TD
    S0["Mensagem de valor<br/>+ 'Como posso chamar você?'"] -->|nome| S1
    S1["'Como você atua hoje?'<br/>(lista: autônomo/motorista/<br/>dono/gestor/transportador)"] -->|companyType| S2
    S2["'O que você quer<br/>resolver primeiro?'<br/>(categorias + ver tudo)"] -->|intentId| S3
    S3["'Qual cidade/região<br/>é sua base?'"] -->|baseCity/baseState| S4
    S4["'Em qual região<br/>você mais atua?'<br/>(lista de 6)"] -->|region| S5
    S5["'Você trabalha com<br/>rota fixa?' (sim/não)"] -->|hasFixedRoute| S6
    S6{"'Marca/modelo<br/>do veículo?'<br/>(OPCIONAL)"}
    S6 -->|informou| S7
    S6 -->|'pular'/'depois'| S7
    S7["'Configuração do<br/>veículo?' (obrigatório,<br/>nunca pula)"] -->|vehicleType+axleCount| S8
    S8["finalizeOnboarding()<br/>✓ CONCLUÍDO"]
    S8 --> DB1[(companies)]
    S8 --> DB2[(company_members)]
    S8 --> DB3[(subscriptions — trial 7d)]
    S8 --> DB4[(vehicles)]
    S8 --> DB5["(ai_memories —<br/>region + hasFixedRoute)"]

    C["'cancelar'"] -.-> X[Onboarding cancelado]
    P["'pausar' / 'continuar depois'"] -.-> W["state=paused —<br/>retoma pelo 1º campo<br/>ainda ausente"]
```

**Evidências**: `src/ai/whatsapp/onboardingConversation.ts` (471 linhas, arquivo inteiro — cada estado citado é um valor real do enum `OnboardingState`); `src/ai/whatsapp/finalizeOnboarding.ts:30-99`.
**Nota**: o estado `awaiting_vehicle_count` existe no enum do banco mas nunca é atribuído pelo código atual 🔴 (legado).

---

## Fluxograma 4 — Processamento de uma mensagem

```mermaid
flowchart TD
    A[Cliente] --> B[WhatsApp]
    B --> C[Z-API]
    C --> D["/api/whatsapp/webhook"]
    D --> E{Resposta de<br/>checklist pendente?}
    E -->|Sim| E1["recordChecklistResponse()<br/>não vira 'usuário'"]
    E -->|Não| F["resolveOrCreateUserByPhone()"]
    F --> G["loadCustomerContext()<br/>+ loadVehicleContext()"]
    G --> H["appendMessage() — salva inbound"]
    H --> I["gerarRespostaAssistente()"]
    I --> J["Claude analisa<br/>(system prompt + histórico)"]
    J --> K{Precisa de<br/>ferramenta?}
    K -->|Não| L[Monta resposta final]
    K -->|Sim| M[Seleciona ferramenta]
    M --> N["Remove userId/companyId do<br/>que o modelo viu;<br/>reinjeta valores reais"]
    N --> O["Executa via saveToolExecution()<br/>grava tool_executions"]
    O --> P{É ferramenta<br/>de cálculo?}
    P -->|Sim| P1[grava analysis_runs]
    P -->|Não| Q[tool_result volta pra IA]
    P1 --> Q
    Q --> J
    J -->|até 4 rodadas| L
    L --> R["appendMessage() — salva outbound"]
    R --> S[Z-API envia resposta]
    S --> A
```

**Evidências**: `src/app/api/whatsapp/webhook/route.ts:225-260`; `src/ai/chat/gerarRespostaAssistente.ts:96-273` (loop completo, `MAX_TOOL_ROUNDS=4`, linhas 198-207 para reinjeção de contexto).

---

## Fluxograma 5 — Ferramentas da IA (28, agrupadas)

```mermaid
flowchart TD
    IA[IA — Claude] --> G1[CUSTOS E VIABILIDADE<br/>12 ferramentas — cálculo puro]
    G1 --> G1a[calcular_cpk]
    G1 --> G1b[calcular_combustivel]
    G1 --> G1c[calcular_margem]
    G1 --> G1d[calcular_custo_viagem]
    G1 --> G1e[calcular_custo_dia]
    G1 --> G1f[calcular_custo_veiculo_parado]
    G1 --> G1g[calcular_receita_km]
    G1 --> G1h[calcular_valor_minimo_frete]
    G1 --> G1i[analisar_frete]
    G1 --> G1j[comparar_pneus]
    G1 --> G1k[calcular_jornada]
    G1 --> G1l[verificar_piso_minimo_antt]

    IA --> G2[CADASTROS — CRUD via IA]
    G2 --> G2a[gerenciar_veiculo]
    G2 --> G2b[gerenciar_motorista]
    G2 --> G2c[gerenciar_manutencao]
    G2 --> G2d[gerenciar_documento_frota]
    G2 --> G2e[registrar_despesa]

    IA --> G3[ROTAS E JORNADA]
    G3 --> G3a["consultar_rota<br/>(Google Maps)"]
    G3 --> G3b[gerenciar_rota_salva]
    G3 --> G3c[gerenciar_jornada_salva]

    IA --> G4[INTEGRAÇÕES EXTERNAS]
    G4 --> G4a["gerenciar_google_calendar<br/>(Google Calendar)"]
    G4 --> G4b["gerenciar_assinatura<br/>(Mercado Pago)"]
    G4 --> G4c["gerar_documento<br/>(PDF via Z-API — só WhatsApp)"]

    IA --> G5[SISTEMA E PREFERÊNCIAS]
    G5 --> G5a[gerenciar_alerta]
    G5 --> G5b[consultar_historico]
    G5 --> G5c[consultar_conhecimento_operacional]
    G5 --> G5d[definir_estilo_resposta]
    G5 --> G5e[gerenciar_noticias_setor]
```

**Evidências**: `src/ai/tools/index.ts` (`FERRAMENTAS_FROTA_IA`, 28 entradas, confirmado 1:1 contra o enum `frota_ia_tool_name`); `src/ai/chat/gerarRespostaAssistente.ts:29-42` (`FERRAMENTAS_DE_ANALISE`, define o grupo de cálculo puro). Detalhe completo de cada ferramenta: ver seção 5 do Raio-X técnico.

---

## Fluxograma 6 — Dados do cliente

```mermaid
flowchart TD
    COMPANY[companies] --> MEMBERS[company_members]
    COMPANY --> PREFS[company_preferences]
    COMPANY --> SUB[subscriptions]
    COMPANY --> VEHICLES[vehicles]
    COMPANY --> DRIVERS[drivers]
    VEHICLES --> DOCS[vehicle_documents]
    VEHICLES --> COST[vehicle_cost_profiles]
    VEHICLES --> TIRE[vehicle_tire_profiles]
    VEHICLES --> MAINT[maintenance_schedules]
    DRIVERS --> DOCS
    DRIVERS --> CHECKLIST[checklist_dispatches]
    VEHICLES --> CHECKLIST
    MAINT --> ALERTS[scheduled_alerts]
    DOCS --> ALERTS
    COMPANY --> EXPENSES[expenses]
    COMPANY --> JOURNEYS[saved_journeys]
    COMPANY --> ROUTES[saved_routes]
    COMPANY --> CONV[conversations]
    CONV --> MSG[messages]
    CONV --> RUNS[analysis_runs]
    RUNS --> DOCS_GEN[generated_documents]
    CONV --> MEMORIES["ai_memories<br/>(gravado, nunca lido de volta)"]
```

**Evidências**: `src/lib/supabase/database.types.ts` (foreign keys de todas as 29 tabelas); auditoria de banco desta investigação, seção "Relacionamentos".

---

## Fluxograma 7 — Frota IA V2 Painel

```mermaid
flowchart TD
    L[LOGIN — Google OAuth] --> A["/auth/callback"]
    A --> G{"fleetPanelAccess()"}
    G -->|sem sessão| L2[/login]
    G -->|sem empresa| ONB[/onboarding]
    G -->|sem entitlement| IND[/frota-indisponivel]
    G -->|OK| P[PAINEL]

    P --> P1[Dashboard]
    P --> P2[Empresa]
    P --> P3[Veículos]
    P --> P4[Motoristas]
    P --> P5["Fretes/Análises 🟡 leitura"]
    P --> P6[Manutenção]
    P --> P7[Documentos]
    P --> P8["Despesas 🟢 CRUD completo"]
    P --> P9["Jornadas 🟡 leitura"]
    P --> P10["Rotas salvas 🟡 leitura"]
    P --> P11["Checklists 🟡 leitura"]
    P --> P12[Alertas — view derivada]
    P --> P13["Relatórios + PDF"]
    P --> P14[Notícias]
    P --> P15["Configurações 🟡 limitado"]
    P --> WIDGET["Widget Pergunte ao Frota IA<br/>(fixo em toda tela)"]

    P1 -.dados.-> API1["Server Component<br/>fetch direto"]
    P8 -.CRUD.-> API2["/api/frota/despesas<br/>GET/POST/PATCH/DELETE"]
    P13 -.export.-> API3["/api/frota/relatorios/pdf"]
    WIDGET -.chat.-> API4["/api/chat →<br/>gerarRespostaAssistente()"]
    API1 --> DB[(Banco)]
    API2 --> DB
    API3 --> DB
    API4 --> DB
```

**Evidências**: `src/app/frota/layout.tsx:12-27`; `src/services/supabase/fleetPanelAccess.ts:25-37`; `src/components/frota/frotaNavItems.ts` (15 itens); auditoria do painel V2 desta investigação (seção 3, tabela completa por seção).

---

## Fluxograma 8 — V1 ↔ V2 (o mais importante)

```mermaid
flowchart TD
    subgraph BANCO["BANCO ÚNICO — Supabase"]
        DB[(29 tabelas, RLS habilitado)]
    end
    V1["V1 — WhatsApp<br/>IA + 28 ferramentas"] <--> DB
    V2["V2 — Painel<br/>CRUD + widget de IA"] <--> DB

    V1 -.mesmo motor.-> ENGINE["gerarRespostaAssistente()"]
    V2 -.mesmo motor.-> ENGINE
```

```mermaid
flowchart LR
    A["Cliente cadastra veículo<br/>pelo WhatsApp<br/>(gerenciar_veiculo)"] --> B[(vehicles)]
    B --> C["Veículo aparece<br/>na tela Veículos do painel<br/>(listVehiclesForPanel)"]
```

```mermaid
flowchart LR
    D["Gestor edita despesa<br/>no painel<br/>(PATCH /api/frota/despesas)"] --> E[(expenses)]
    E --> F["IA usa o dado atualizado<br/>na próxima consulta<br/>(registrar_despesa CONSULTAR)"]
```

```mermaid
flowchart LR
    G["Motorista responde<br/>checklist pelo WhatsApp"] --> H[(checklist_dispatches)]
    H --> I["Painel mostra a resposta<br/>(SÓ LEITURA — não editável ali)"]
    style I fill:#fff3cd,stroke:#f2b33d
```

**Status por fluxo**:
- Veículo/Motorista/Manutenção/Documento/Despesa: WhatsApp↔Painel nos dois sentidos — 🟢 confirmado.
- Jornada/Rota salva/Checklist: escrita só pelo WhatsApp, painel é vitrine — 🟡 parcial (por desenho, documentado no código).
- Agenda Google conectada via WhatsApp não "atravessa" automaticamente pra uma sessão do painel (identidades diferentes) — 🟡 parcial (ver Raio-X, seção 19, item 3).

**Evidências**: `src/ai/tools/gerenciar-veiculo.ts`; `src/app/api/frota/despesas/route.ts`, `[id]/route.ts`; `src/app/frota/checklists/page.tsx:8` (comentário explícito "read-only").

---

## Fluxograma 9 — Banco de dados (visão simplificada)

```mermaid
erDiagram
    COMPANIES ||--o{ VEHICLES : possui
    COMPANIES ||--o{ DRIVERS : possui
    COMPANIES ||--|| COMPANY_PREFERENCES : tem
    COMPANIES ||--|| SUBSCRIPTIONS : tem
    COMPANIES ||--o{ COMPANY_MEMBERS : tem
    VEHICLES ||--o{ VEHICLE_DOCUMENTS : tem
    VEHICLES ||--o{ MAINTENANCE_SCHEDULES : tem
    VEHICLES ||--o| VEHICLE_COST_PROFILES : tem
    VEHICLES ||--o| VEHICLE_TIRE_PROFILES : tem
    DRIVERS ||--o{ VEHICLE_DOCUMENTS : tem
    DRIVERS ||--o{ CHECKLIST_DISPATCHES : recebe
    COMPANIES ||--o{ EXPENSES : registra
    COMPANIES ||--o{ CONVERSATIONS : tem
    CONVERSATIONS ||--o{ MESSAGES : contem
    CONVERSATIONS ||--o{ ANALYSIS_RUNS : gera
    ANALYSIS_RUNS ||--o{ GENERATED_DOCUMENTS : origina
    COMPANIES ||--o{ SAVED_JOURNEYS : salva
    COMPANIES ||--o{ SAVED_ROUTES : salva
    MAINTENANCE_SCHEDULES ||--o| SCHEDULED_ALERTS : agenda
    VEHICLE_DOCUMENTS ||--o| SCHEDULED_ALERTS : agenda
```

**Evidências**: `src/lib/supabase/database.types.ts` (29 tabelas, foreign keys reais).

---

## Fluxograma 10 — Pagamento

```mermaid
flowchart TD
    A[Cliente conclui onboarding] --> B["criarAssinaturaTeste()<br/>TRIAL — 7 dias"]
    B --> C{trial_usage já<br/>usado nesse telefone?}
    C -->|Sim| D[status=EXPIRADA já de início]
    C -->|Não| E[status=TRIAL, valido_ate=+7d]
    E --> F{Dia 5 ou<br/>último dia?}
    F -->|Sim| F1["/api/subscriptions/trial-warnings/dispatch ⚫<br/>avisa via WhatsApp"]
    E --> G["Cliente pede assinar<br/>(gerenciar_assinatura)"]
    G --> H{Plano}
    H -->|Mensal| H1["criarAssinaturaMensal()<br/>preapproval recorrente"]
    H -->|Anual parcelado/Pix| H2["criarPagamentoAnual()<br/>checkout/preference"]
    H1 --> I[Link Mercado Pago]
    H2 --> I
    I --> J[Cliente paga]
    J --> K["/api/payments/mercadopago/webhook"]
    K --> L{HMAC válido?}
    L -->|Não| M[401 — rejeita]
    L -->|Sim| N["Reconsulta API do MP<br/>(nunca confia só no payload)"]
    N --> O{Status}
    O -->|approved/authorized| P[subscriptions.status=ATIVA]
    O -->|cancelled| Q[status=CANCELADA]
    O -->|paused| R[status=INADIMPLENTE]
    P --> S["payment_events — log bruto"]
    Q --> S
    R --> S
    S --> T[Responde 200 sempre]
    P --> U["isAccessAllowed() = true"]
    D --> V["isAccessAllowed() = false"]
    Q --> V
    R --> V
    U --> W[Mensagens liberadas normalmente]
    V --> X["Webhook principal bloqueia mensagem<br/>(exceto se parecer pedido de assinatura)"]
```

**Evidências**: `src/services/supabase/subscriptionService.ts` (trial, `isAccessAllowed`); `src/lib/mercadopago/client.ts:82-220`; `src/app/api/payments/mercadopago/webhook/route.ts` (inteiro); `src/app/api/whatsapp/webhook/route.ts:544-560` (gating real, confirmado ativo apesar de comentário desatualizado em outro arquivo).

---

## Fluxograma 11 — Integrações

```mermaid
flowchart LR
    FROTAIA[Frota IA] -->|prompt + tools| CLAUDE[Anthropic Claude]
    CLAUDE -->|texto/tool_use| FROTAIA
    FROTAIA -->|query restrita a domínio| WEBSEARCH["web_search/web_fetch<br/>nativos da Claude"]
    WEBSEARCH -->|resultado| FROTAIA
    FROTAIA -->|áudio .ogg base64| OPENAI[OpenAI]
    OPENAI -->|texto transcrito pt| FROTAIA
    FROTAIA -->|texto/lista/botão/PDF/imagem| ZAPI[Z-API]
    ZAPI -->|mensagem inbound| FROTAIA
    FROTAIA -->|OAuth + evento| GCAL[Google Calendar]
    GCAL -->|lista de eventos| FROTAIA
    FROTAIA -->|endereço/coordenadas| GMAPS["Google Maps<br/>Geocoding+Routes+Static"]
    GMAPS -->|distância/duração/imagem| FROTAIA
    FROTAIA -->|plano/valor/e-mail| MP[Mercado Pago]
    MP -->|link + webhook de status| FROTAIA
```

**Evidências**: ver Raio-X técnico, seção 12 (tabela completa com arquivo:linha de cada integração).

---

## Fluxograma 12 — Arquitetura técnica

```mermaid
flowchart TD
    CANAIS["CANAIS<br/>WhatsApp (Z-API) / Painel (browser)"] --> ENTRADA["CAMADA DE ENTRADA<br/>/api/whatsapp/webhook · /api/chat · /api/frota/*"]
    ENTRADA --> APP["APLICAÇÃO<br/>Next.js 16 App Router (src/app)"]
    APP --> SERVICOS["SERVIÇOS<br/>src/services/supabase/*, src/services/google/*,<br/>src/services/documents/*, src/services/news/*"]
    SERVICOS --> IA["IA<br/>src/ai/chat/gerarRespostaAssistente.ts"]
    IA --> TOOLS["TOOLS<br/>src/ai/tools/*.ts (28 ferramentas)"]
    TOOLS --> BANCO["BANCO<br/>Supabase Postgres, 29 tabelas, RLS"]
    TOOLS --> INTEGRACOES["INTEGRAÇÕES<br/>Google Calendar/Maps, Mercado Pago,<br/>Z-API, OpenAI"]
    BANCO --> INFRA["INFRAESTRUTURA<br/>Railway (deploy + 4 crons externos)"]
    INTEGRACOES --> INFRA
```

**Evidências**: estrutura de diretórios real do repositório (`src/app`, `src/ai`, `src/services`, `src/lib`); Raio-X técnico, seção 2.

---

## Fluxograma 13 — Experiência do cliente final (visão comercial, sem jargão técnico)

```mermaid
flowchart TD
    A[Cliente manda "oi" no WhatsApp] --> B[Frota IA se apresenta<br/>e explica o que faz]
    B --> C[Cliente informa nome,<br/>perfil e veículo]
    C --> D[Frota IA conhece<br/>a operação do cliente]
    D --> E[Cliente faz uma pergunta<br/>real do dia a dia]
    E --> F[Frota IA analisa a pergunta]
    F --> G[Usa dados do cliente<br/>+ IA + a ferramenta certa]
    G --> H[Entrega a resposta —<br/>número, recomendação,<br/>ou documento]
    H --> I[O dado fica salvo<br/>automaticamente]
    I --> J[Se o gestor quiser,<br/>o Painel Web mostra tudo<br/>organizado e exporta relatório]
```

**Evidência de honestidade**: este fluxograma reflete o comportamento real confirmado no código (não é aspiracional) — a única ressalva é que o Painel Web (última caixa) tem acesso restrito hoje, ver Raio-X seção 19.

---

## Fluxograma 14 — Mapa completo final

```mermaid
flowchart TD
    CLIENTE[CLIENTE] --> CANAL["V1 WHATSAPP + V2 PAINEL<br/>(mesma conta de fundo, identidades separadas)"]
    CANAL --> AUTH["ONBOARDING / AUTENTICAÇÃO<br/>WhatsApp: telefone · Painel: Google OAuth"]
    AUTH --> EMPRESA[(EMPRESA — companies)]
    EMPRESA --> BANCO[(BANCO — 29 tabelas, RLS)]
    BANCO --> IA["IA — Claude<br/>gerarRespostaAssistente()"]
    IA --> FERRAMENTAS["28 FERRAMENTAS<br/>12 cálculo + 16 integração"]
    FERRAMENTAS --> MODULOS["MÓDULOS<br/>Veículos·Motoristas·Manutenção·Documentos·<br/>Despesas·Jornadas·Rotas·Checklists·Alertas"]
    MODULOS --> APIS["APIs EXTERNAS<br/>Google Calendar·Google Maps·<br/>Mercado Pago·Z-API·OpenAI"]
    MODULOS --> RELATORIOS["RELATÓRIOS<br/>PDF (painel) · PDF via WhatsApp"]
    APIS --> PAGAMENTOS["PAGAMENTOS<br/>Trial 7d → Mercado Pago → Webhook → Acesso"]
    RELATORIOS --> RESULTADO[RESULTADO PARA O CLIENTE]
    PAGAMENTOS --> RESULTADO
```

---

## Resumo final

- **14 fluxogramas** produzidos (Mermaid), todos confrontados com o código real na branch `claude/frota-ia-assistente-setup-qlrbac`.
- **28 ferramentas de IA** mapeadas (Fluxograma 5) — 12 de cálculo puro, 16 de integração/escrita.
- **8 módulos V1** cobertos em detalhe: onboarding, processamento de mensagem, mídia, memória, checklist, alertas, notícias, pagamento/trial.
- **15 módulos V2** cobertos (Fluxograma 7): todas as seções da sidebar do painel.
- **7 integrações externas** confirmadas com evidência de código (Fluxograma 11).
- **29 tabelas principais** no banco (Fluxograma 9).
- **Inconsistências encontradas** (detalhadas com evidência no Raio-X técnico, seções 18-19): sistema de memória `ai_memories` write-only · identidade dividida entre canal WhatsApp e login do painel · automação de cron não verificável a partir do repositório · comentários desatualizados em 4 arquivos de código · Configurações do painel mais limitada do que o nome sugere.
- **Caminhos dos arquivos gerados**: `docs/FROTA_IA_FLUXOGRAMA_COMPLETO_V1_V2.md` (este arquivo) e `docs/FROTA_IA_RAIO_X_V1_V2.md` (documento técnico companheiro, com o detalhamento textual completo de cada fluxo aqui representado).

*Nenhum código, banco, configuração ou produção foi alterado na produção deste documento — trabalho exclusivamente de auditoria e representação visual.*
