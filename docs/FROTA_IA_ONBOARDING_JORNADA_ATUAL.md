# Frota IA — Onboarding e Jornada do Cliente (estado atual)

Branch `claude/frota-ia-assistente-setup-qlrbac`, commit `a4205419165f15a62a5dd815541fef2ce3153e84`, auditado em 2026-08-22. Extraído diretamente de `src/app/api/whatsapp/webhook/route.ts`, `src/ai/whatsapp/onboardingConversation.ts`, `src/ai/whatsapp/finalizeOnboarding.ts`, `src/ai/whatsapp/vehicleConfigClassifier.ts`.

## 1. Onboarding V1 (WhatsApp) — completo

### Antes da primeira pergunta

```
CLIENTE MANDA PRIMEIRA MENSAGEM (número desconhecido)
   ↓
route.ts:232 normaliza telefone (E.164, corrige DDI duplicado)
   ↓
route.ts:260 resolveOrCreateUserByPhone
   → cria auth.users de verdade via Admin API (nunca "usuário fantasma")
   → cria user_channels (provider z_api, verified=true — telefone "verificado"
     só por ter chegado daquele número na instância, sem OTP)
   → createOnboardingSession(state="awaiting_name")
   ↓
route.ts:264 envia mensagem de boas-vindas
```

**Etapas de pergunta ao cliente hoje: 8** (número exato confirmado no código).

---

**ETAPA 0 — boas-vindas (não valida nada)**
> "Olá! Eu sou o Frota IA... Antes de aceitar um frete... Você pode falar comigo por texto, áudio, foto, PDF ou planilha. Como posso chamar você?"

---

**ETAPA 1 — `awaiting_name`**
- Pergunta: a de boas-vindas acima já pergunta o nome.
- Validação: texto vazio → repete "Não entendi — como posso te chamar?".
- Salvo em: `onboarding_sessions.collected_data.name` (rascunho — nada em tabela definitiva ainda).
- Próxima pergunta (lista nativa): *"Prazer, {name}! Como você atua hoje?"* — 5 opções: motorista autônomo, apenas motorista, dono de empresa, gestor de frota, transportador.

**ETAPA 2 — `awaiting_profile`**
- Resposta esperada: toque na lista ou texto livre (heurísticas de autônomo/transportadora/gestor/dono/embarcador).
- Inválido → repete a mesma lista.
- Salvo em: `collected_data.companyType`/`profileLabel`.
- Próxima pergunta (lista nativa): *"O que você quer resolver primeiro com o Frota IA?"* — 9 categorias (fretes, combustível/custos, pneus/manutenção, documentos, alertas/agenda, jornada, rotas, histórico/legislação, notícias) + "ver tudo".

**ETAPA 3 — `awaiting_intent`**
- Resposta esperada: toque na lista, "ver tudo", ou substring do título.
- Inválido → repete a lista.
- Salvo em: `collected_data.intentId`/`intentLabel`.
- Próxima pergunta: texto de transição personalizado pela categoria + *"Qual cidade ou região você utiliza como base principal?"*

**ETAPA 4 — `awaiting_base_location`**
- Resposta esperada: texto livre (cidade/UF, separado por `-,/`).
- Vazio → repete a pergunta.
- Salvo em: `collected_data.baseCity`/`baseState`.
- Próxima pergunta (lista nativa): *"Em qual região você mais atua?"* — Norte/Nordeste/Centro-Oeste/Sudeste/Sul/Todas.

**ETAPA 5 — `awaiting_region`**
- Resposta esperada: toque na lista ou texto livre (múltiplas regiões).
- Vazio → repete.
- Salvo em: `collected_data.region`.
- Próxima pergunta (texto simples, não lista): *'Você trabalha com rota fixa? Responda "sim" ou "não".'*

**ETAPA 6 — `awaiting_fixed_route`**
- **Nota de código**: essa pergunta usa texto simples em vez de botão nativo porque botões (`kind:"buttons"`) falharam silenciosamente em teste real em 05/08/2026 (sem erro na Z-API, mensagem nunca chegava ao aparelho) — comentário explícito no código.
- Resposta esperada: variações de sim/não/s/n.
- Inválido → repete a pergunta.
- Salvo em: `collected_data.hasFixedRoute` (boolean).
- Próxima pergunta: *'Qual a marca e modelo do seu veículo? Pode incluir o ano. Caso não queira cadastrar agora, responda "depois".'*

**ETAPA 7 — `awaiting_primary_vehicle`**
- Resposta esperada: texto livre, ou "pular"/"depois" (não bloqueante — sempre avança).
- Salvo em: `collected_data.primaryVehicleRaw` / `primaryVehicleSkipped`.
- Próxima pergunta (lista nativa): *"Qual a configuração do seu veículo?"* — Toco, Truck/Trucado, Três-quartos, Bitruck, Cavalo mecânico, Carreta, Bitrem, Rodotrem, Outro/não sei.

**ETAPA 8 — `awaiting_vehicle_configuration`**
- Classificador determinístico (sem IA): 3 resultados possíveis —
  - **Resolvido** (tipo rígido ou articulado explícito, ex. "bitrem") → grava `vehicleType`+`axleCount`, **finaliza onboarding** (`nextState:"completed"`).
  - **Precisa desambiguar** (ex. "cavalo"/"carreta" solto) → pergunta extra de composição (5/6/7/9 eixos ou "só o cavalo"), não finaliza ainda.
  - **Não reconhecido** (ex. tipo de carroceria em vez de configuração) → reformula a pergunta, nunca pula (é obrigatória).
- Salvo em: `collected_data.vehicleType`/`axleCount`.

Estados que existem no enum do banco mas **não são mais usados** pelo código: `awaiting_vehicle_count` (morto, mantido só por compatibilidade histórica — comentário explícito no código).

Cancelamento ("cancelar") e pausa ("continuar depois"/"pausar") são reconhecidos em **qualquer** etapa e levam ao estado `paused`; retomada recomeça pela pergunta mais básica ainda não respondida (não guarda "onde parou" exatamente).

---

## 2. O que é criado durante o onboarding

| Etapa | Informação coletada | Onde salva (rascunho) | Tabela definitiva (na finalização) |
|---|---|---|---|
| 1 | Nome | `onboarding_sessions.collected_data.name` | `profiles`/`auth.users` (já existiam desde a 1ª mensagem) |
| 2 | Perfil de atuação (tipo de empresa) | `.companyType`/`.profileLabel` | `companies.company_type` |
| 3 | Intenção inicial | `.intentId`/`.intentLabel` | Só usada para personalizar a mensagem final — não persiste em tabela própria |
| 4 | Cidade/UF base | `.baseCity`/`.baseState` | `companies.city`/`.state` |
| 5 | Região de atuação | `.region` | `ai_memories` (tipo `operational`, chave `operating_region`) |
| 6 | Trabalha com rota fixa (sim/não) | `.hasFixedRoute` | `ai_memories` (chave `has_fixed_route`) |
| 7 | Marca/modelo do veículo (opcional) | `.primaryVehicleRaw`/`.primaryVehicleSkipped` | `vehicles.notes`/nome (se não pulado) |
| 8 | Configuração do veículo (tipo + eixos) | `.vehicleType`/`.axleCount` | `vehicles.vehicle_type`/`.axle_count` |

**Na finalização** (`finalizeOnboarding.ts`), em ordem: 1) cria `companies` com owner; 2) cria assinatura trial grátis (falha não bloqueia); 3) atualiza `user_channels.company_id` (o canal foi criado antes de existir empresa); 4) grava as 2 memórias acima, se aplicável; 5) cria `vehicles` + marca como padrão, se veículo foi informado. Falha na finalização retrocede o estado para `awaiting_primary_vehicle` (não deixa o cliente preso em "completed" sem empresa).

## 3. Primeiro uso após o onboarding

```
onboarding finalize=true
   ↓
updateOnboardingSession(state="completed")
   ↓
finalizeOnboarding() — cria empresa/assinatura/veículo/memórias
   ↓
mensagem de conclusão (personalizada pela categoria de intenção escolhida):
"Cadastro concluído! Agora você já pode conversar normalmente com o Frota IA.
Escolha uma das opções abaixo para começar ou envie sua própria pergunta
por texto, áudio, foto ou documento."
   ↓
enviarSugestoesIniciais(): tenta lista nativa (10 itens) + lembrete de
pergunta livre; se a Z-API falhar, cai em fallback numerado por texto
   ↓
marca suggestionsMenuSentAt (não reenvia sozinho depois — só por
palavra-gatilho "ajuda"/"menu"/"opções"/"sugestões")
   ↓
CLIENTE MANDA PRÓXIMA MENSAGEM (de fato)
   ↓
gerarRespostaAssistente() — primeira chamada real à IA
```

Se o cliente mandar algo que não é texto/lista/botão durante o onboarding (ex. imagem), o webhook responde: *"Por enquanto, durante o cadastro, preciso que você responda em texto ou toque numa das opções."* — nunca processa como se fosse pós-onboarding.

## 4. Onboarding / acesso do painel (V2)

**Auditado a fundo, não presumido**: existe uma rota `src/app/onboarding/` no código, mas ela **não é um onboarding self-service completo e funcional para cliente novo via painel**.

- O próprio código comenta: *"Onboarding pelo painel web — mantido no código para administração/testes/V2 [...] Na V1, o onboarding de clientes acontece pelo WhatsApp, não aqui."*
- Gate: só passa quem tem `CUSTOMER_PANEL_ENABLED=true` **e** `profiles.is_admin=true`. Como a flag é `false` por padrão, **na prática só administradores acessam esse fluxo hoje**.
- Fluxo, quando acessível: passo 1 cria empresa, passo 2 cadastra o primeiro veículo (opcional, "cadastrar depois").
- Consequência real: um usuário comum sem empresa que tente abrir `/frota` é redirecionado para `/onboarding`, que por sua vez o rejeita de volta para `/login?painel_indisponivel=1` (porque não é admin). **Atualmente não existe onboarding específico completo para V2** utilizável por um cliente comum — o caminho real é: criar conta pelo WhatsApp primeiro, depois pedir/receber acesso ao painel.

## 5. Login do painel

```
cliente sem sessão em /frota
   ↓
redirect /login
   ↓
botão "Continuar com Google" → signInWithGoogle("/auth/callback?next=/")
   ↓ supabase.auth.signInWithOAuth({ provider: "google", redirectTo })
Google OAuth
   ↓
/auth/callback → exchangeCodeForSession(code) → sessão Supabase Auth criada
   ↓ (trigger on_auth_user_created já criou profiles automaticamente)
redirect para "next" (default "/")
   ↓
se o destino for /frota: layout.tsx roda a cadeia completa de acesso —
sessão → empresa (company_members) → entitlement (fleet_panel_enabled OU
subscriptions.fleet_panel_included) → Google Calendar da EMPRESA conectado
→ libera painel
```

Sem empresa vinculada → `/onboarding` (ver seção 4). Sem entitlement → `/frota-indisponivel`. Sem Calendar conectado → `/frota-conectar-agenda` (fora da pasta `src/app/frota` de propósito, para não herdar o próprio gate e causar loop).

## 6. Vínculo de identidade WhatsApp ↔ Painel

Ferramenta de IA `vincular_painel` (ativa): cliente pede pelo WhatsApp ("quero acessar pelo computador"), a IA gera um link assinado válido por 15 minutos. Ao abrir, exige login Google ativo; se a conta Google já tiver empresa própria diferente, pede confirmação explícita antes de vincular (nunca funde automaticamente); se não tiver nenhuma empresa, vincula direto à empresa do WhatsApp.

Existe um segundo mecanismo mais antigo (`whatsappConnectLink`, rota `/auth/whatsapp/connect`) — confirmado como **código órfão** (nada no repositório o chama hoje), mantido só por não ter sido removido.

## 7. Fluxogramas Mermaid

Ver `docs/FROTA_IA_FLUXOS_V1_V2_ATUAL.md`, itens 3 (onboarding) e 16 (jornada completa do cliente).
