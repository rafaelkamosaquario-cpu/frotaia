# Frota IA — Fluxograma Atual (atualizado em 2026-09-11)

Documento criado em 10/09/2026 (substitui o antigo `FROTA_IA_FLUXOGRAMA_COMPLETO_V1_V2.md`, 19/08/2026, 28 ferramentas/estrutura de planos antiga), **atualizado em 11/09/2026** para refletir a inversão do funil ("mostrar valor antes de cadastrar" — ver seção 2). Não é uma reauditoria completa de todo o sistema — é focado nos fluxos centrais: ecossistema, jornada do cliente, pagamento e arquitetura.

## 1. Visão geral do ecossistema

```mermaid
flowchart TD
    A[Cliente] --> B{Canal}
    B -->|WhatsApp| C["Z-API<br/>produto principal"]
    B -->|Painel web| D["Next.js<br/>acesso via Google OAuth"]
    C --> E[(Supabase<br/>Postgres + RLS)]
    D --> E
    C --> F["gerarRespostaAssistente()<br/>motor único de IA - Claude"]
    D --> F
    F --> G[39 ferramentas de IA]
    G --> E
    G --> H[Integrações externas]
    H --> H1[Google Calendar]
    H --> H2[Google Maps]
    H --> H3[Mercado Pago]
    H --> H4[Z-API WhatsApp]
    H --> H5[OpenAI - transcrição de áudio]
    G --> I[Documentos PDF]
```

## 2. Jornada do cliente — inversão do funil (11/09/2026): demo real antes do cadastro

Substitui o modelo anterior ("11 perguntas antes de qualquer coisa"). Agora o cadastro completo só roda **depois** do pagamento confirmado — a primeira coisa que o cliente vê é uma demonstração de verdade. Detalhe passo a passo em `FROTA_IA_JORNADA_POR_PLANO_2026-09-10.md`.

```mermaid
flowchart TD
    Z[Primeira mensagem no WhatsApp] --> EMP{"Clicou Empresas?"}
    EMP -->|Sim| E["Contato comercial direto<br/>sem automação, sem demo"]
    E --> A2["Onboarding completo<br/>11 perguntas + 1 condicional"]
    EMP -->|Não| MIN["Empresa mínima criada em silêncio<br/>+ trial (nunca citado ao cliente)"]
    MIN --> MENU["Menu pequeno de demo<br/>Frete · Rota · Custo · Conhecer funções"]
    MENU --> DEMO["IA em modo restrito<br/>só as ferramentas do track escolhido"]
    DEMO --> RES[Resultado real entregue]
    RES --> CTA{"Quer continuar?"}
    CTA -->|Ver planos| PLANOS["3 botões: Individual/Essencial/Pro<br/>→ link de checkout"]
    CTA -->|Conhecer mais funções| MENU
    CTA -->|Agora não| DEMO
    PLANOS --> PAGO[Pagamento confirmado]
    PAGO --> A2
    A2 --> T["Cadastro completo salvo<br/>(atualiza a empresa mínima, nunca cria outra)"]
    T --> DIV{Plano}
    DIV -->|Individual| I["Fica só no WhatsApp<br/>1 veículo"]
    DIV -->|"Essencial ou Pro"| GC["Login Google + Calendar<br/>→ Onboarding 2 (/frota-ativacao, 5 passos)"]
    GC --> D[Dashboard]
```

## 3. Pagamento e checkout (reestruturado em 10/09/2026; disparo mudou em 11/09/2026)

Tecnicamente o checkout em si não mudou — o que mudou é **quando** ele pode ser acionado: antes só depois do onboarding completo, agora também direto do CTA pós-demo (`awaiting_demo_input`, ver fluxograma acima) ou por `gerenciar_assinatura` a qualquer momento.

```mermaid
flowchart TD
    A["Cliente pede pra assinar<br/>(CTA pós-demo ou gerenciar_assinatura)"] --> B["Link seguro /assinar<br/>expira em 30 min"]
    B --> C["Gate: escolhe plano<br/>Individual/Essencial/Pro"]
    C --> D{Frequência}
    D -->|Mensal| E["criarAssinaturaMensal()<br/>POST /preapproval — só cartão"]
    D -->|Anual| F{Método}
    F -->|Pix| G["criarPagamentoAnual()<br/>POST /checkout/preferences"]
    F -->|Cartão 12x| G
    E --> H[Mercado Pago]
    G --> H
    H --> I[Cliente paga]
    I --> J["/api/payments/mercadopago/webhook"]
    J --> K{Assinatura HMAC válida?}
    K -->|Não| L[401 — rejeita]
    K -->|Sim| M["Reconsulta API do MP<br/>nunca confia só no payload"]
    M --> N{Status}
    N -->|Aprovado| O["subscriptions.status = ATIVA<br/>fleet_panel_included conforme plano"]
    N -->|Cancelado| P[status = CANCELADA]
    O --> Q["Limite de veículos:<br/>1 Individual · 3 Essencial · 10 Pro"]
    O --> R{"Onboarding já<br/>completed?"}
    R -->|Não| S["Dispara o cadastro completo<br/>(dispararOnboardingPosPagamento, 11/09/2026)"]
    R -->|Sim, já era| FIM[Nada muda — cliente já cadastrado]
```

**9 combinações no catálogo** (3 planos × 3 formas de cobrança) — ver `FROTA_IA_COMERCIAL_ATUAL_2026-09-06.md` pros valores exatos e `FROTA_IA_CHECKOUT_MERCADOPAGO_ATUAL.md` pro detalhe técnico completo.

## 4. Arquitetura técnica (simplificada)

```mermaid
flowchart TD
    CANAIS["CANAIS<br/>WhatsApp (Z-API) / Painel (browser)"] --> ENTRADA["ENTRADA<br/>/api/whatsapp/webhook · /api/chat · /api/frota/*"]
    ENTRADA --> APP["Next.js 16 App Router"]
    APP --> SERVICOS["SERVIÇOS<br/>src/services/*"]
    SERVICOS --> IA["IA — gerarRespostaAssistente()"]
    IA --> TOOLS["39 FERRAMENTAS<br/>src/ai/tools/*.ts"]
    TOOLS --> BANCO["Supabase Postgres, RLS"]
    TOOLS --> INTEGRACOES["Google Calendar/Maps ·<br/>Mercado Pago · Z-API · OpenAI"]
    BANCO --> INFRA["Railway<br/>app + 6 crons"]
    INTEGRACOES --> INFRA
```

## Notas de precisão

- Contagem de ferramentas (39) e crons (6, incluindo o novo `frotaia-mp-reconcile-cron`) confirmadas contra `FROTA_IA_FERRAMENTAS_ATUAL_2026-09-06.md` e o inventário do Railway feito em 10/09/2026.
- O diagrama de pagamento reflete exatamente a implementação de hoje (catálogo `CATALOGO_OFERTAS`, `src/lib/mercadopago/client.ts`), não uma versão anterior.
- **Seção 2 reescrita em 11/09/2026** — inversão do funil implementada e commitada (`1955b12`, branch `claude/frota-ia-assistente-setup-qlrbac`), verificada com 656 testes automatizados. Deploy no Railway e teste manual ponta a ponta (número real batendo no webhook, seguindo a demo até o pagamento) ainda pendentes de confirmação — ver `FROTA_IA_PENDENCIAS_2026-09-06.md`.
- Durante a demo (`awaiting_demo_input`), a IA roda com um subconjunto restrito das 39 ferramentas (só as do track escolhido — frete/rota/custo), não o conjunto completo. As 39 completas só valem depois do cadastro concluído (`completed`).
- Para o detalhe completo por tela do Painel Web, ferramenta por ferramenta, ou banco de dados tabela por tabela, os documentos antigos (`FROTA_IA_RAIO_X_V1_V2.md`, `FROTA_IA_FLUXOGRAMA_COMPLETO_V1_V2.md`) ainda têm valor histórico, mas **precisam de reauditoria** antes de confiar nos números deles — não foi feita aqui.
