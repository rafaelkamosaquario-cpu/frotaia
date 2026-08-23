# Frota IA — Fluxogramas do Estado Atual (V1 + V2)

Branch `claude/frota-ia-assistente-setup-qlrbac`, commit `a4205419165f15a62a5dd815541fef2ce3153e84`, auditado em 2026-08-22. Todos os fluxos abaixo refletem código lido diretamente (ver os outros 3 documentos para evidência arquivo:linha detalhada).

## 1. Ecossistema geral

```mermaid
flowchart TB
    Cliente((Cliente))
    WA[WhatsApp / Z-API]
    Painel[Painel Web /frota]
    App[Next.js — 1 serviço só]
    Claude[Anthropic Claude<br/>claude-sonnet-5]
    Supabase[(Supabase<br/>33 tabelas, RLS)]
    Maps[Google Maps]
    Cal[Google Calendar]
    OpenAI[OpenAI Whisper]
    MP[Mercado Pago]

    Cliente -->|mensagem| WA --> App
    Cliente -->|login Google| Painel --> App
    App --> Claude
    App --> Supabase
    App --> Maps
    App --> Cal
    App --> OpenAI
    App --> MP
    Claude -.->|web_search/web_fetch| Internet[(Web)]
```

## 2. WhatsApp — webhook completo

```mermaid
flowchart TD
    A[Mensagem recebida] --> B{Token válido?}
    B -->|não| Z[503/401]
    B -->|sim| C{isGroup?}
    C -->|sim| D[processarMensagemDeGrupo<br/>Radar de Fretes]
    C -->|não| E[Normaliza telefone E.164]
    E --> F{Checklist pendente<br/>para este telefone?}
    F -->|sim| G[recordChecklistResponse<br/>responde e RETORNA]
    F -->|não| H[resolveOrCreateUserByPhone]
    H --> I{Usuário novo?}
    I -->|sim| J[cria auth.users + user_channels<br/>+ onboarding_session]
    I -->|não| K{Onboarding<br/>completed?}
    J --> L[Envia 1ª pergunta do onboarding]
    K -->|não| M[processOnboardingMessage]
    K -->|sim| N[appendMessage + dedup por<br/>external_message_id]
    N --> O[gerarRespostaAssistente]
    O --> P[Responde por WhatsApp]
```

## 3. Onboarding (V1)

```mermaid
flowchart TD
    S0[Boas-vindas: pergunta o nome] --> S1[awaiting_name]
    S1 -->|nome válido| S2[awaiting_profile<br/>lista: 5 perfis]
    S2 -->|válido| S3[awaiting_intent<br/>lista: 9 categorias + ver tudo]
    S3 -->|válido| S4[awaiting_base_location<br/>texto livre]
    S4 -->|válido| S5[awaiting_region<br/>lista: 6 regiões]
    S5 -->|válido| S6[awaiting_fixed_route<br/>texto sim/não]
    S6 -->|não| S7[awaiting_primary_vehicle<br/>texto, obrigatório]
    S6 -->|sim| S6R[awaiting_primary_route<br/>texto livre, condicional]
    S6R --> S7
    S7 --> S8P[awaiting_plate<br/>texto, opcional]
    S8P --> S8[awaiting_vehicle_configuration<br/>lista: 9 tipos]
    S8 -->|resolvido| S9[awaiting_body_type<br/>lista: 9 carrocerias]
    S8 -->|precisa desambiguar| S8b[pergunta composição<br/>5/6/7/9 eixos]
    S8b --> S9
    S8 -->|não reconhecido| S8[repete pergunta]
    S9 -->|sempre resolve, cai em "outro"| S10[awaiting_consumption<br/>texto, opcional]
    S10 --> FIN[finalizeOnboarding]
    FIN --> F1[cria companies + owner]
    F1 --> F2[cria assinatura trial]
    F2 --> F3[vincula user_channels.company_id]
    F3 --> F4[grava memórias: região, rota fixa, rota principal]
    F4 --> F5[cria vehicles completo:<br/>marca/modelo/ano, placa, tipo,<br/>eixos, carroceria, consumo]
    F5 --> F6[cria saved_routes,<br/>se rota principal foi estruturada]
    F6 --> MSG[Mensagem de conclusão + novo menu de 10 sugestões]

    S1 -.cancelar/pausar.-> PAUSED[paused]
    S2 -.-> PAUSED
    S3 -.-> PAUSED
    S4 -.-> PAUSED
    S5 -.-> PAUSED
    S6 -.-> PAUSED
    S6R -.-> PAUSED
    S7 -.-> PAUSED
    S8P -.-> PAUSED
    S8 -.-> PAUSED
    S9 -.-> PAUSED
    S10 -.-> PAUSED
    PAUSED -->|retoma pela pergunta<br/>mais básica pendente| S1
```

Google Calendar **não aparece neste fluxograma de propósito** — nunca faz parte do onboarding; só é conectado sob demanda depois, quando alguma ferramenta (`gerenciar_alerta`/`gerenciar_google_calendar`) precisar (ver item 9).

## 4. Processamento da IA (motor de resposta)

```mermaid
flowchart TD
    IN[Mensagem do cliente<br/>+ até 30 msgs de histórico] --> CTX[loadCustomerContext<br/>empresa, veículo padrão, memórias]
    CTX --> SP[construirSystemPrompt]
    SP --> M1[anthropic.messages.create<br/>claude-sonnet-5, max_tokens 1536]
    M1 --> TU{tool_use?}
    TU -->|sim, rodada ≤ 4| EXEC[Executa ferramenta<br/>35 disponíveis]
    EXEC --> M1
    TU -->|não| OUT[Resposta final de texto]
    OUT --> SAVE[appendMessage + toolExecutionService]
```

## 5. Ferramentas → banco

```mermaid
flowchart LR
    Tool[Ferramenta de IA] --> Admin[createAdminClient<br/>ignora RLS, filtra por companyId]
    Admin --> DB[(Supabase — 33 tabelas)]
    Tool -.calc puro, sem I/O.-> Result[Retorna resultado direto]
```

## 6. Painel web

```mermaid
flowchart TD
    U[Usuário abre /frota] --> L1{Sessão Supabase?}
    L1 -->|não| LOGIN[/login → Google OAuth/]
    L1 -->|sim| L2{Empresa vinculada?}
    L2 -->|não| ONB[/onboarding<br/>só admin passa/]
    L2 -->|sim| L3{Entitlement?<br/>fleet_panel_enabled OU<br/>subscriptions.fleet_panel_included}
    L3 -->|não| IND[/frota-indisponivel/]
    L3 -->|sim| L4{Google Calendar<br/>da empresa conectado?}
    L4 -->|não| CONN[/frota-conectar-agenda/]
    L4 -->|sim| PAINEL[16 telas + FrotaAiWidget]
```

## 7. IA do painel

```mermaid
flowchart LR
    Widget[FrotaAiWidget<br/>presente nas 16 telas] -->|pageContext + anexo opcional| API[/api/chat]
    API --> Motor[gerarRespostaAssistente<br/>MESMO motor do WhatsApp]
    Motor --> Widget
```

## 8. WhatsApp ↔ Painel (identidade compartilhada)

```mermaid
flowchart TD
    WAUser[user_id via WhatsApp] --> Company[(company_id)]
    PainelUser[user_id via Google/painel] --> Company
    Company --> Cal[google_integrations<br/>escopado por company_id]
    Company --> Mem[ai_memories<br/>escopo empresa]
    Company --> Data[(vehicles, drivers,<br/>expenses, etc.)]
    WAUser -.vincular_painel<br/>link assinado 15min.-> PainelUser
```

## 9. Google Calendar

```mermaid
flowchart TD
    Start[Início: link WhatsApp OU sessão painel] --> Auth[buildAuthorizationUrl<br/>scopes: calendar.readonly, calendar.events, userinfo.email]
    Auth --> Google[Google OAuth]
    Google --> CB[/auth/calendar/callback/]
    CB --> Conn[connectGoogleCalendar]
    Conn --> Vault[(Supabase Vault<br/>refresh token, SECURITY DEFINER)]
    Conn --> Meta[(google_integrations<br/>metadado, por company_id)]
    Tool[gerenciar_google_calendar] --> Refresh[getValidAccessToken]
    Refresh --> Vault
    Refresh --> API[Google Calendar API]
```

## 10. Checklist

```mermaid
flowchart TD
    Cron[/api/checklists/dispatch] --> Elig[listDriversDueForChecklist<br/>checklist_enabled + horário + não enviado hoje]
    Elig --> Send[Envia texto com itens configurados]
    Send --> Disp[(checklist_dispatches<br/>status: pendente)]
    Resp[Motorista responde] --> Interp[interpretarRespostaChecklist]
    Interp -->|ok| OK[status: ok]
    Interp -->|qualquer outra coisa| ATT[status: atencao]
    ATT --> Alert[scheduled_alerts para owners/admins]
    Alert --> AlertCron[/api/alerts/dispatch]
    Disp -.6h sem resposta.-> NR[não respondido — computado]
```

## 11. Alertas

```mermaid
flowchart LR
    Fontes[Manutenção vencendo /<br/>Documento vencendo /<br/>Lembrete livre /<br/>Checklist com atenção] --> SA[(scheduled_alerts)]
    Cron2[/api/alerts/dispatch] -->|periódico, externo| SA
    SA --> WA2[Envio WhatsApp]
```

## 12. Memória

```mermaid
flowchart TD
    Tool2[gerenciar_memoria /<br/>onboarding] --> Save[saveMemory<br/>dedup por company+tipo+chave]
    Save --> Old[memória antiga → superseded]
    Save --> New[(ai_memories)]
    New --> List[listMemoriesForPrompt<br/>até 12 memórias]
    List --> CTX2[loadCustomerContext]
    CTX2 --> SP2[construirSystemPrompt]
    SP2 --> Model[Claude — prompt final]
```

## 13. Análises de frete

```mermaid
flowchart TD
    In2[Dados do frete] --> Tool3[analisar_frete]
    Tool3 --> Calc[calcular-margem.ts]
    Tool3 --> Run[(analysis_runs)]
    Run --> Hist[consultar_historico]
    Run --> Painel2[/frota/fretes — leitura/]
```

## 14. Radar de Fretes

```mermaid
flowchart TD
    Grupo[Grupo WhatsApp<br/>cadastrado em freight_sources] --> Filter[avaliarPossivelFrete<br/>filtro barato local]
    Filter -->|possível frete| Extract[Extração via Claude<br/>sem tools]
    Extract --> Dedup[dedup por similaridade]
    Dedup --> Opp[(freight_opportunities<br/>global, sem company_id)]
    Radar[(freight_radars<br/>por empresa)] --> Match[radarMatchingEngine]
    Opp --> Match
    Match --> MatchTable[(freight_opportunity_matches<br/>por company_id)]
    MatchTable -->|score FORTE| Auto[Notificação automática WhatsApp]
    MatchTable -->|score PARCIAL| Tool4[consultar_oportunidades_frete<br/>sob consulta]
```

## 15. Assinatura / Mercado Pago

```mermaid
flowchart TD
    Tool5[gerenciar_assinatura] --> MP2[criarAssinaturaMensal /<br/>criarPagamentoAnual]
    MP2 --> Checkout[Checkout Mercado Pago]
    Checkout --> WH[/api/payments/mercadopago/webhook]
    WH --> Valid[validarAssinaturaWebhook<br/>HMAC-SHA256]
    Valid --> Sub[(subscriptions)]
    Sub --> Gate[Gate do painel:<br/>fleet_panel_included]
```

## 16. Jornada completa do cliente (V1 → V2)

```mermaid
flowchart TD
    Lead((Lead)) --> WA3[Manda mensagem no WhatsApp]
    WA3 --> Cadastro[Onboarding 8 etapas]
    Cadastro --> Empresa[(companies + trial)]
    Empresa --> Veiculo[(vehicles, se informado)]
    Veiculo --> Uso1[Usa a IA normalmente<br/>35 ferramentas, multimodal]
    Uso1 -->|opcional| Vincular[Pede acesso ao painel<br/>vincular_painel]
    Vincular --> Login[Login Google]
    Login --> Gate2{Entitlement +<br/>Calendar conectado?}
    Gate2 -->|sim| Painel3[Painel: 16 telas]
    Gate2 -->|não| Bloqueio[/frota-indisponivel ou<br/>/frota-conectar-agenda/]
    Painel3 --> MesmoBanco[(Mesmo banco,<br/>mesmas tools, mesma memória)]
    Uso1 --> MesmoBanco
```
