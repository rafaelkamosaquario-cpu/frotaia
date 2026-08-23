# Frota IA — Onboarding e Jornada do Cliente (estado atual)

Branch `claude/frota-ia-assistente-setup-qlrbac`, atualizado em 2026-08-23. Extraído diretamente de `src/app/api/whatsapp/webhook/route.ts`, `src/ai/whatsapp/onboardingConversation.ts`, `src/ai/whatsapp/finalizeOnboarding.ts`, `src/ai/whatsapp/vehicleConfigClassifier.ts`.

**Atualização 2026-08-23**: onboarding V1 redesenhado sob o princípio "1 usuário + 1 veículo" — o veículo passou a ser configurado por completo durante o cadastro (placa, carroceria/implemento e consumo médio, além de marca/modelo/ano — que deixou de ser pulável). Ganhou também uma etapa condicional de rota principal. Google Calendar **continua fora do onboarding** — só é pedido sob demanda, depois, quando alguma ferramenta precisar. Usuários que já tinham `onboarding = completed` **não são afetados** — nunca reentram no fluxo.

## 1. Onboarding V1 (WhatsApp) — completo

### Antes da primeira pergunta

```
CLIENTE MANDA PRIMEIRA MENSAGEM (número desconhecido)
   ↓
route.ts normaliza telefone (E.164, corrige DDI duplicado)
   ↓
route.ts resolveOrCreateUserByPhone
   → cria auth.users de verdade via Admin API (nunca "usuário fantasma")
   → cria user_channels (provider z_api, verified=true — telefone "verificado"
     só por ter chegado daquele número na instância, sem OTP)
   → createOnboardingSession(state="awaiting_name")
   ↓
route.ts envia mensagem de boas-vindas
```

**Etapas de pergunta ao cliente hoje: 12** (11 sempre perguntadas + 1 condicional — rota principal, só quando o cliente diz ter rota fixa).

---

**ETAPA 0 — boas-vindas (não valida nada)** — *texto atual do sistema*
> "Olá! Eu sou o Frota IA, seu assistente especializado em transporte. 🚛
>
> Posso analisar fretes, calcular custos, organizar despesas, manutenção, documentos e rotas, criar lembretes e ajudar você a encontrar oportunidades de carga com o Radar de Fretes.
>
> Você pode falar comigo por texto, áudio, foto, PDF ou planilha.
>
> Para eu usar os dados corretos do seu veículo nas análises e recomendações, vou configurar sua operação primeiro.
>
> Como posso chamar você?"

---

**ETAPA 1 — `awaiting_name`**
- Pergunta: a de boas-vindas acima já pergunta o nome.
- Validação: texto vazio → repete "Não entendi — como posso te chamar?".
- Salvo em: `onboarding_sessions.collected_data.name` (rascunho — nada em tabela definitiva ainda).
- Próxima pergunta (lista nativa): *"Prazer, {name}! Como você atua hoje?"* — 5 opções: 🚛 Motorista autônomo, 👤 Apenas motorista, 🏢 Dono de empresa / transportadora, 📊 Gestor de frota, 🚚 Transportador.

**ETAPA 2 — `awaiting_profile`**
- Resposta esperada: toque na lista ou texto livre (heurísticas de autônomo/transportadora/gestor/dono/embarcador).
- Inválido → repete a mesma lista.
- Salvo em: `collected_data.companyType`/`profileLabel`.
- Próxima pergunta (lista nativa): *"O que você quer resolver primeiro com o Frota IA?"* — 9 categorias (🚛 fretes e oportunidades, 💰 custos e despesas, 🔧 manutenção e pneus, 📄 documentos e vencimentos, 📅 agenda e lembretes, 🕐 jornada, 🗺️ rotas e viagens, 📊 análises e histórico, 📰 notícias do transporte) + 📋 "ver tudo que o Frota IA faz".

**ETAPA 3 — `awaiting_intent`**
- Resposta esperada: toque na lista, "ver tudo", ou substring do título.
- Inválido → repete a lista.
- Salvo em: `collected_data.intentId`/`intentLabel`.
- Próxima pergunta: texto de transição personalizado pela categoria + *"Qual cidade você usa como base principal da sua operação?"*. Para "fretes e oportunidades", a transição já cita o Radar de Fretes explicitamente.

**ETAPA 4 — `awaiting_base_location`**
- Resposta esperada: texto livre (cidade/UF, separado por `-,/`).
- Vazio → repete a pergunta.
- Salvo em: `collected_data.baseCity`/`baseState`.
- Próxima pergunta (lista nativa): *"Em quais regiões você costuma rodar mais?"* — Norte/Nordeste/Centro-Oeste/Sudeste/Sul/Todas.

**ETAPA 5 — `awaiting_region`**
- Resposta esperada: toque na lista ou texto livre (múltiplas regiões).
- Vazio → repete.
- Salvo em: `collected_data.region`.
- Próxima pergunta (texto simples, não lista): *'Você costuma trabalhar em uma rota fixa ou recorrente? Responda "sim" ou "não".'*

**ETAPA 6 — `awaiting_fixed_route`**
- **Nota de código**: essa pergunta usa texto simples em vez de botão nativo porque botões (`kind:"buttons"`) falharam silenciosamente em teste real em 05/08/2026 (sem erro na Z-API, mensagem nunca chegava ao aparelho) — comentário explícito no código.
- Resposta esperada: variações de sim/não/s/n.
- Inválido → repete a pergunta.
- Salvo em: `collected_data.hasFixedRoute` (boolean).
- **Bifurcação (nova)**: "sim" → Etapa 6.1 (rota principal); "não" → pula direto pra Etapa 7 (veículo).

**ETAPA 6.1 — `awaiting_primary_route` (nova, condicional)**
- Pergunta: *"Qual é sua rota principal?\n\nEx.: Curitiba → São Paulo"*.
- Aceita texto livre, inclusive mais de uma rota mencionada (ex.: "Curitiba → São Paulo e Curitiba → Campinas").
- Vazio → repete a pergunta.
- Salvo em: `collected_data.primaryRouteRaw` (texto bruto, sempre gravado) + `primaryRouteOrigin`/`primaryRouteDestination` (só a primeira rota reconhecida, quando o parser consegue separar origem/destino por "→"/"->"/"para"/"pra"/"até"/"-"). O texto bruto nunca se perde, mesmo quando o parser não separa tudo — ver seção 2.

**ETAPA 7 — `awaiting_primary_vehicle`**
- Pergunta: *"Agora vamos configurar o veículo que você vai usar no Frota IA.\n\nQual a marca, modelo e ano?\n\nEx.: Scania R450 2022"*.
- **Mudança de comportamento**: deixou de aceitar "pular"/"depois" como pulo — é V1 "1 usuário + 1 veículo", o veículo é parte central do cadastro. Texto vazio → repete a pergunta; qualquer outro texto (inclusive "depois" digitado) é aceito literalmente como resposta.
- Salvo em: `collected_data.primaryVehicleRaw`.

**ETAPA 8 — `awaiting_plate` (nova, opcional)**
- Pergunta: *'Qual a placa do veículo?\n\nEx.: ABC1D23\n\nSe preferir informar depois, responda "depois".'*
- Normaliza (remove espaço/hífen, maiúsculas) e valida contra o formato de placa (Mercosul ou antigo). **Nunca bloqueia**: se não reconhecer, avança sem gravar placa.
- Salvo em: `collected_data.plate` (só quando reconhecida) + `plateAsked: true` (sempre, pra distinguir "ainda não perguntado" de "perguntado e sem placa" numa eventual retomada).

**ETAPA 9 — `awaiting_vehicle_configuration`**
- Classificador determinístico (sem IA, inalterado nesta atualização): 3 resultados possíveis —
  - **Resolvido** (tipo rígido ou articulado explícito, ex. "bitrem") → grava `vehicleType`+`axleCount`, segue pra Etapa 10 (**não finaliza mais aqui**, diferença em relação à versão anterior).
  - **Precisa desambiguar** (ex. "cavalo"/"carreta" solto) → pergunta extra de composição (5/6/7/9 eixos ou "só o cavalo"), não avança ainda.
  - **Não reconhecido** (ex. tipo de carroceria em vez de configuração) → reformula a pergunta, nunca pula (continua sendo a única etapa que repete indefinidamente até resolver).
- Salvo em: `collected_data.vehicleType`/`axleCount`.

**ETAPA 10 — `awaiting_body_type` (nova)**
- Pergunta: *"Qual carroceria ou implemento você utiliza?"* — lista nativa: Sider, Baú, Graneleiro, Basculante (caçamba), Tanque, Grade baixa / carga seca, Prancha, Frigorífico, Outro/não sei. Mesmo vocabulário já usado pela ferramenta `gerenciar_veiculo` (carroceria), nada novo inventado.
- **Nunca bloqueia**: texto não reconhecido cai em `"outro"` automaticamente — esta etapa nunca repete.
- Salvo em: `collected_data.bodyType` (sempre preenchido depois de perguntada).

**ETAPA 11 — `awaiting_consumption` (nova, opcional — última etapa)**
- Pergunta: *'Qual é o consumo médio do seu veículo em km/l?\n\nEx.: 2,8 km/l\n\nSe ainda não souber, responda "não sei".'*
- Aceita vírgula ou ponto, com ou sem "km/l" junto (`"2,8"`, `"2.8 km/l"`, `"faz 2,8"`). "não sei"/qualquer texto sem número → segue sem gravar.
- Salvo em: `collected_data.averageConsumptionKmL` (só quando reconhecido) + `consumptionAsked: true`.
- **Sempre finaliza** (`nextState:"completed"`, `finalize:true`), com ou sem consumo reconhecido — é a última etapa do onboarding.

Estados que existem no enum do banco mas **não são mais usados** pelo código: `awaiting_vehicle_count` (morto desde a Camada 7, mantido só por compatibilidade histórica).

Cancelamento ("cancelar") e pausa ("continuar depois"/"pausar") são reconhecidos em **qualquer** etapa (inclusive as novas) e levam ao estado `paused`; retomada recomeça pela pergunta mais básica ainda não respondida, agora cobrindo toda a ordem nova (rota principal condicional, placa, carroceria, consumo) — campos opcionais usam uma flag própria (`plateAsked`/`consumptionAsked`) pra distinguir "ainda não perguntado" de "perguntado e sem resposta útil".

**Idempotência (nova)**: durante o onboarding, o webhook agora guarda o `messageId` da última mensagem processada com sucesso (`collected_data.__lastMessageId`) e ignora reentregas do mesmo webhook — proteção mínima adicionada nesta atualização, sem refatorar o restante do webhook.

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
| 6.1 | Rota principal (condicional) | `.primaryRouteRaw`/`.primaryRouteOrigin`/`.primaryRouteDestination` | `ai_memories` (chave `recurring_route_text`, texto completo sempre) **+** `saved_routes` (só quando origem/destino foram separados — vinculada ao veículo criado) |
| 7 | Marca/modelo/ano do veículo (agora obrigatório) | `.primaryVehicleRaw` | `vehicles.name`/`.notes` |
| 8 | Placa (opcional) | `.plate`/`.plateAsked` | `vehicles.plate` |
| 9 | Configuração do veículo (tipo + eixos) | `.vehicleType`/`.axleCount` | `vehicles.vehicle_type`/`.axle_count` |
| 10 | Carroceria/implemento | `.bodyType` | `vehicles.body_type` |
| 11 | Consumo médio (opcional) | `.averageConsumptionKmL`/`.consumptionAsked` | `vehicles.average_consumption_km_l` |

Nenhuma coluna nova foi criada no banco para essa atualização — `plate`, `body_type` e `average_consumption_km_l` já existiam em `vehicles` (usadas, por exemplo, pela ferramenta `gerenciar_veiculo`); a única migration foi aditiva, ao enum `onboarding_state` (4 valores novos de estado).

**Na finalização** (`finalizeOnboarding.ts`), em ordem: 1) cria `companies` com owner; 2) cria assinatura trial grátis (falha não bloqueia); 3) atualiza `user_channels.company_id` (o canal foi criado antes de existir empresa); 4) grava as memórias de região/rota fixa/rota principal, se aplicável; 5) cria `vehicles` (com marca/modelo/ano, placa, tipo, eixos, carroceria e consumo) + marca como padrão; 6) se a rota principal foi estruturada, cria também uma `saved_routes` vinculada a esse veículo. Falha na finalização retrocede o estado para `awaiting_consumption` (a última pergunta antes de finalizar — não pro início do cadastro do veículo), reaproveitando os dados já coletados.

## 3. Primeiro uso após o onboarding

```
onboarding finalize=true (sempre a partir de awaiting_consumption)
   ↓
updateOnboardingSession(state="completed")
   ↓
finalizeOnboarding() — cria empresa/assinatura/veículo completo/rota/memórias
   ↓
mensagem de conclusão (personalizada pela categoria de intenção escolhida):
"Cadastro concluído! Agora você já pode conversar normalmente com o Frota IA.
Escolha uma das opções abaixo para começar ou envie sua própria pergunta
por texto, áudio, foto ou documento."
   ↓
enviarSugestoesIniciais(): tenta lista nativa (10 itens, novo menu — ver
abaixo) + lembrete de pergunta livre; se a Z-API falhar, cai em fallback
numerado por texto
   ↓
marca suggestionsMenuSentAt (não reenvia sozinho depois — só por
palavra-gatilho "ajuda"/"menu"/"opções"/"sugestões")
   ↓
CLIENTE MANDA PRÓXIMA MENSAGEM (de fato)
   ↓
gerarRespostaAssistente() — primeira chamada real à IA
```

**Novo menu pós-onboarding (10 itens, substituiu o anterior por completo)**: Analisar um frete, Procurar oportunidades (Radar de Fretes), Calcular custos da viagem, Registrar uma despesa, Organizar manutenção, Documentos e vencimentos, Consultar uma rota, Criar um lembrete, Analisar pneus, Ver tudo que o Frota IA faz. O último item ("Ver tudo") recebe tratamento determinístico igual ao texto digitado "o que você faz" — nunca é resumido livremente pela IA.

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
