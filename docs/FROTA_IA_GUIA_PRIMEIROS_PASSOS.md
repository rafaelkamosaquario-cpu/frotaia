# Frota IA — Guia de Primeiros Passos (V1 WhatsApp + V2 Painel)

Implementado em 2026-08-26. **Guia ≠ onboarding.** O onboarding (WhatsApp, `onboarding_sessions`/`onboardingConversation.ts`) continua sendo o cadastro obrigatório antes de usar o produto — não foi tocado. O Guia é **opcional**, começa **depois** que o cliente já está liberado, nunca bloqueia nada, e pode ser pulado/reaberto a qualquer momento.

## 1. V1 — WhatsApp

### Gatilho

Oferecido **uma única vez**, automaticamente, logo após o cadastro concluir (mesma mensagem que já mostra as sugestões iniciais) — nunca antes de `finalizeOnboarding` ter criado a empresa. Unicidade garantida por `company_preferences.guide_v1_offered_at` (nunca reenviado automaticamente depois da 1ª vez, mesmo que o webhook seja reentregue).

Comando permanente pra reabrir manualmente, a qualquer momento (mesmo depois de "não preciso"): `ehPedidoDeGuia` em `src/lib/helpMenu.ts` — frases como "primeiros passos", "tutorial", "guia rápido", "como usar o Frota IA". Deliberadamente sem "o que você faz" (esse gatilho já pertence ao catálogo completo de funcionalidades, `ehPedidoDeFuncionalidades`).

### Passos

Máquina de estados **determinística** (`src/ai/whatsapp/guideConversationV1.ts`) — a IA nunca decide passo/transição/conclusão, só responde dúvidas quando o cliente interrompe com uma pergunta real. 6 passos:

1. **Veículo** — mostra o veículo já cadastrado (marca/modelo/ano/consumo, se disponível — nunca despeja a ficha completa).
2. **Analisar um frete** — ensina o formato ("Curitiba → São Paulo por R$ 5.200. Compensa?"). Se o cliente digitar um exemplo de verdade em vez de tocar "Próximo", a mensagem **não é interceptada** — cai no motor real da IA (`gerarRespostaAssistente`, ferramenta `analisar_frete`), análise de verdade, não um exemplo fake.
3. **Custos** — combustível, CPK, margem, receita por km, custo de veículo parado.
4. **Registrar a operação** — despesa, manutenção, documento, alerta, pelo WhatsApp ou painel.
5. **Radar de Fretes** — explicado corretamente como acompanhamento, nunca como marketplace ou contratação automática.
6. **Final** — encerra citando o comando permanente e "o que você consegue fazer?".

### Controles

Lista nativa do WhatsApp (nunca botões — instabilidade real e documentada de `sendWhatsappButtons`, achado de 05/08/2026), com fallback tolerante a sinônimo digitado (`interpretarControleGuiaV1`): Fazer agora / Depois / Não preciso / Próximo / Sair / Recomeçar / Retomar.

**Sair** ≠ **Não preciso**: sair preserva o passo salvo (permite retomar exatamente de onde parou); não preciso limpa o passo (só reiniciar do zero depois).

### Pergunta paralela à IA

Se o cliente, com o guia em andamento, mandar algo que não é um controle reconhecido, a mensagem cai no fluxo normal — a IA responde de verdade (inclusive rodando ferramentas reais: análise de frete, registro de despesa/manutenção) — e só depois um lembrete curto pergunta se ele quer continuar o guia, **sem nunca alterar o passo salvo**.

### Persistência

`company_preferences.guide_v1_status` (`not_started`/`in_progress`/`completed`/`dismissed`), `guide_v1_step`, `guide_v1_offered_at` — sobrevive a fechar o WhatsApp, reiniciar a conversa, qualquer coisa (é dado de empresa, não de sessão/memória volátil).

## 2. V2 — Painel (Gestão)

### Gatilho

Primeira vez que o cliente entra em `/frota/dashboard` depois de `fleet_onboarding_completed_at` já estar setado (Onboarding 2 concluído) — convite mostrado uma única vez (`company_preferences.guide_v2_offered_at`).

### Tour

8 passos com **spotlight** (anel + escurecimento ao redor do elemento real) sobre elementos reais do painel — nunca telas fake: Dashboard → Indicadores (KPIs) → Frota IA sugere → Frota (Veículos/Motoristas) → Operação (Manutenção/Documentos/Despesas/Checklists) → Radar de Fretes → Pergunte ao Frota IA (widget) → Conclusão.

**Decisão de design**: o cartão explicativo fica numa posição **fixa** (rodapé no mobile, canto inferior direito no desktop — mesma linguagem visual de `Modal.tsx`), nunca ancorado no elemento-alvo. Só o spotlight segue o alvo. Isso elimina qualquer cálculo de posicionamento por passo — o cartão nunca fica fora da viewport, atrás da navegação inferior ou sobreposto ao teclado, porque a posição é sempre a mesma.

**Mobile**: só 4 destinos (Início/Frota/Radar/Alertas) + "Mais" existem na navegação inferior (`FrotaBottomNav`) — quando o alvo real de um passo (ex.: Manutenção) está escondido atrás do drawer "Mais", o spotlight aponta pro próprio botão "Mais", com o texto avisando.

**Elemento ausente nunca quebra**: se o alvo de um passo não existir na tela atual (ex.: card "Frota IA sugere" quando o insight ainda não foi gerado, ou o cliente navegou pra outro módulo no meio do tour), o passo é **pulado automaticamente** pro próximo alvo que existir.

Sem biblioteca nova (nenhum Radix/floating-ui/tour library no projeto) — overlay/spotlight hand-rolled, mesmo padrão de portal + `useHasMounted` já usado em `Modal.tsx`/`FrotaMobileSidebar.tsx`.

### Ajuda contextual

Botão "?" discreto num subconjunto representativo de telas (Dashboard, Manutenção, Despesas, Radar de Fretes — priorização explícita, as demais telas ficam como extensão trivial: só uma entrada nova em `src/lib/frota/contextualHelpContent.ts` + `<ContextualHelp topic="..." />` na página). Abre um texto curto + exemplo + botão "Perguntar ao Frota IA".

### IA

"Perguntar ao Frota IA" (tanto do passo 7 do tour quanto da ajuda contextual) **reutiliza o widget já existente** (`FrotaAiWidget.tsx`) — nunca cria um segundo chat. Ponte via `CustomEvent` no `window` (`src/components/frota/frotaAiWidgetBus.ts`): abre o widget com a pergunta pré-preenchida (nunca envia sozinho — o cliente revisa e manda).

### Persistência

`company_preferences.guide_v2_status`/`guide_v2_step`/`guide_v2_offered_at` — mesmas 4 colunas-espelho do V1, mesma tabela (nenhuma tabela nova). Sobrevive a refresh, logout/login, fechar o navegador.

### Reabertura manual

`/frota/configuracoes` → card "Guia de primeiros passos" → "Abrir" — vai direto pro tour (não pro convite, já que é um pedido explícito), começando do passo 1.

## 3. Google Calendar

Nem o tour nem a ajuda contextual dependem de Google Calendar — Calendar continua sendo requisito só da Agenda (fechamento de coerência anterior, 08/2026). O passo "Operação" do tour nunca menciona Agenda/Calendar.

## 4. Banco de dados

1 migration aditiva: `supabase/migrations/20260826150000_add_getting_started_guide_state.sql` — 6 colunas novas em `company_preferences` (`guide_v1_status`/`guide_v1_step`/`guide_v1_offered_at`/`guide_v2_status`/`guide_v2_step`/`guide_v2_offered_at`), texto + check constraint (mesmo padrão local da tabela, sem enum novo do Postgres). Nenhuma tabela nova, nenhuma coluna em `onboarding_sessions` tocada.

## 5. Analytics de adoção

Sem plataforma externa — reaproveita o logger estruturado já existente (`src/lib/observability/logger.ts`, mesmo padrão dos crons/webhooks). Eventos do V1: `guide_v1_offered`, `guide_v1_in_progress`, `guide_v1_completed`, `guide_v1_dismissed`, `guide_v1_not_started` — buscáveis nos logs do Railway por `event`. O estado atual (quantas empresas em cada status) é consultável direto em `company_preferences.guide_v1_status`/`guide_v2_status`.

## 6. Arquivos principais

**V1**: `src/ai/whatsapp/guideConversationV1.ts` (máquina de estados), `src/lib/helpMenu.ts` (`ehPedidoDeGuia`), `src/app/api/whatsapp/webhook/route.ts` (dispatch).

**V2**: `src/lib/frota/panelTourSteps.ts` (config dos 8 passos), `src/components/frota/PanelTour.tsx` (componente), `src/app/api/frota/guide-v2/route.ts` (estado), `src/components/frota/ContextualHelp.tsx` + `src/lib/frota/contextualHelpContent.ts` (ajuda contextual), `src/components/frota/frotaAiWidgetBus.ts` (ponte pro widget de IA).

**Compartilhado**: `src/services/supabase/companyPreferencesService.ts` (`getGuideState`/`saveGuideState`/`markGuideOffered`, parametrizado por `"v1"|"v2"`).

## 7. Limitação conhecida desta rodada

O tour V2 (spotlight, cartão, medição de posição, comportamento mobile) não tem teste automatizado de componente React — este projeto nunca usou React Testing Library/jsdom (vitest roda em `environment: "node"`, só arquivos `*.test.ts`), e a introdução dessa infraestrutura só para este recurso não foi feita. A cobertura automatizada ficou na lógica pura (`panelTourSteps.ts`) e na API de estado (`/api/frota/guide-v2`). A verificação visual real em mobile/desktop depende de um login de teste no painel (banco de produção zerado nesta sessão) — combinado com o Rafael: ele loga depois do deploy pra validação ao vivo.
