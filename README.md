# Frota IA Assistente

Especialista virtual em transporte e gestão de frotas. O chat está conectado
à Claude API: cada mensagem do usuário é respondida pelo assistente com base
no [prompt mestre](src/ai/prompt-mestre.ts) que define sua identidade,
especialidades e regras.

Projeto construído do zero, em repositório próprio (não reaproveita código de
nenhum outro projeto, como ZapFlow, FrotaBot ou Jarvis).

## Stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack)
- [TypeScript](https://www.typescriptlang.org)
- [Tailwind CSS 4](https://tailwindcss.com)
- [lucide-react](https://lucide.dev) (ícones)
- [next-themes](https://github.com/pacocoursey/next-themes) (modo claro/escuro)
- [@anthropic-ai/sdk](https://github.com/anthropics/anthropic-sdk-typescript) (Claude API, usado só no servidor)

Sem banco de dados ou autenticação — o histórico de conversas continua em
`localStorage`.

## Como rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha ANTHROPIC_API_KEY
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

Sem `ANTHROPIC_API_KEY` configurada, o chat continua funcionando visualmente,
mas cada mensagem recebe uma resposta de erro amigável em vez de uma resposta
real do assistente.

Outros scripts:

```bash
npm run build   # build de produção
npm run start   # roda o build de produção
npm run lint    # eslint
```

## Estrutura de pastas

```
frota-ia-assistente/
├── src/
│   ├── app/                    # rotas (App Router)
│   │   ├── layout.tsx          # fontes, metadata, providers (tema/toast)
│   │   ├── page.tsx            # tela única do assistente
│   │   ├── icon.tsx            # favicon gerado (logo)
│   │   ├── globals.css         # tokens de design (cores, animações)
│   │   └── api/chat/route.ts   # rota de servidor que chama a Claude API
│   ├── ai/
│   │   └── prompt-mestre.ts    # prompt mestre (identidade e regras do assistente)
│   ├── components/
│   │   ├── ui/                 # Button, Input, Textarea, Card, Loading,
│   │   │                       # EmptyState, Toast, Modal, Dialog
│   │   ├── layout/              # Header, Sidebar (desktop), MobileSidebar
│   │   │                        # (menu retrátil), SidebarContent, ThemeToggle,
│   │   │                        # SplashScreen
│   │   ├── chat/                # ChatWindow, MessageList, MessageBubble,
│   │   │                        # ChatInput, SuggestionCards, TypingIndicator,
│   │   │                        # WelcomeScreen
│   │   ├── icons/                # Logo (marca Frota IA)
│   │   └── providers/            # ThemeProvider, ToastProvider
│   ├── hooks/                   # useChat, useConversations, useLocalStorage,
│   │                             # useMediaQuery, useToast, useHasMounted
│   ├── services/                 # aiService (chama /api/chat), chatService,
│   │                             # messageService
│   ├── types/                    # ChatMessage, Conversation, SuggestionPrompt
│   └── lib/                      # utils (cn, formatRelativeDate…), constants
│                                  # (sugestões, textos), mock-data (histórico
│                                  # simulado)
└── public/                       # assets estáticos
```

## Telas e componentes

A aplicação abre direto no assistente — uma única tela, sem login ou painel.

- **Splash screen**: tela de abertura rápida (~2s) ao carregar o app.
- **Header**: logo + nome, botão "Nova conversa", alternância de tema, botão
  de menu (mobile).
- **Tela de boas-vindas**: aparece antes da primeira mensagem, com saudação e
  6 cartões de sugestão ("Analisar um frete", "Consumo", "Comparar pneus",
  "Calcular CPK", "Reduzir custos", "Gestão da Frota"). Clicar num cartão
  apenas preenche o campo de texto — nenhuma ação é executada.
- **Conversa**: mensagens do usuário e do assistente, indicador de "digitando"
  animado enquanto a resposta da Claude API está a caminho.
- **Campo de mensagem**: textarea que cresce automaticamente, envia com
  Enter (Shift+Enter para nova linha).
- **Sidebar (desktop) / menu retrátil (mobile)**: histórico de conversas
  (persistido em `localStorage`), com opções de selecionar, criar nova
  conversa e excluir (com diálogo de confirmação). Os títulos ainda são
  gerados a partir da primeira mensagem — geração automática pelo assistente
  é um próximo passo.
- **Modo claro/escuro**: alternância manual no header, com preferência do
  sistema como padrão.

## Arquitetura

- **Estado local no cliente.** `useConversations` guarda o histórico em
  `localStorage`; `useChat` cuida do envio de mensagens e do estado de
  "digitando".
- **Camada de serviços**:
  - `aiService.requestAICompletion` — chama `POST /api/chat` (rota de
    servidor) e retorna a resposta do assistente.
  - `src/app/api/chat/route.ts` — único lugar com acesso à
    `ANTHROPIC_API_KEY`; monta a chamada à Claude API usando o
    [prompt mestre](src/ai/prompt-mestre.ts) como `system` prompt.
  - `chatService` — segue como interface preparada para persistência real
    (API + banco); ainda não implementada.
  - `messageService` — fábrica de mensagens, usada localmente.
- **Design tokens em `globals.css`** (`--primary`, `--surface`, `--border`,
  etc.) com variante `.dark` — qualquer componente novo herda o tema
  automaticamente.
- **Componentes de UI genéricos** (`src/components/ui`) não conhecem nada de
  "frota" ou "chat" — podem ser reaproveitados em telas futuras.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Sim | Chave da Claude API, usada apenas em `src/app/api/chat/route.ts` (servidor). Nunca é exposta ao cliente. |

## Próximos passos

1. Persistir conversas de verdade em `chatService` (API + banco), substituindo
   o `localStorage`.
2. Streaming de resposta (mensagem do assistente aparecendo token a token).
3. Geração automática de títulos do histórico a partir do conteúdo da
   conversa.
4. Fora de escopo por enquanto: RAG, memória, ferramentas de cálculo,
   cadastro de veículos/empresas/pneus, financeiro, painel administrativo.
