# Frota IA — Fluxograma Atual (2026-09-10)

Documento novo, substitui o antigo `FROTA_IA_FLUXOGRAMA_COMPLETO_V1_V2.md` (19/08/2026, já marcado como desatualizado — 28 ferramentas, estrutura de planos antiga). Este cobre o estado real de hoje, verificado contra o código e contra a implementação da reestruturação de planos feita em 10/09/2026. Não é uma reauditoria completa de todo o sistema (isso é o que o Fluxograma antigo tentava fazer, com 14 diagramas) — é focado nos fluxos centrais: ecossistema, jornada do cliente por plano, pagamento e arquitetura.

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

## 2. Jornada do cliente por plano

Cadastro inicial (Onboarding 1, WhatsApp) é **igual para todos** — 11 perguntas + 1 condicional, termina em trial de 7 dias grátis. A partir da contratação, o caminho diverge:

```mermaid
flowchart TD
    Z[Primeira mensagem no WhatsApp] --> A["Onboarding 1<br/>11 perguntas + 1 condicional"]
    A --> T["Trial: 7 dias grátis<br/>acesso completo"]
    T --> P{Cliente contrata}
    P -->|"Individual<br/>R$89,90/mês"| I["Fica só no WhatsApp<br/>1 veículo"]
    P -->|"Essencial R$149,90<br/>ou Pro R$249,90"| G["Checkout aprovado<br/>libera Painel"]
    G --> GC["Login Google<br/>+ Calendar conectado"]
    GC --> O2["Onboarding 2<br/>/frota-ativacao, 5 passos"]
    O2 --> D[Dashboard]
    P -->|"Empresa<br/>+10 veículos"| E["Contato comercial direto<br/>sem automação"]
```

## 3. Pagamento e checkout (reestruturado em 10/09/2026)

```mermaid
flowchart TD
    A["Cliente pede pra assinar<br/>(gerenciar_assinatura)"] --> B["Link seguro /assinar<br/>expira em 30 min"]
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
- Para o detalhe completo por tela do Painel Web, ferramenta por ferramenta, ou banco de dados tabela por tabela, os documentos antigos (`FROTA_IA_RAIO_X_V1_V2.md`, `FROTA_IA_FLUXOGRAMA_COMPLETO_V1_V2.md`) ainda têm valor histórico, mas **precisam de reauditoria** antes de confiar nos números deles — não foi feita aqui.
