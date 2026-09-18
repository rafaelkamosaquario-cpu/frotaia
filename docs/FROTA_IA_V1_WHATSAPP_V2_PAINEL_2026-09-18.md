# Frota IA — V1 (WhatsApp) e V2 (Painel Web): onboarding e funcionalidades de cada versão

Documento criado em 2026-09-18 pra responder uma lacuna real: os documentos existentes (`FROTA_IA_JORNADA_POR_PLANO_2026-09-10.md`, `FROTA_IA_PAINEL_WEB_ATUAL_2026-09-13.md`, `FROTA_IA_FERRAMENTAS_ATUAL_2026-09-06.md`) cobrem as duas versões, mas nenhum as apresenta lado a lado, cada uma com seu próprio onboarding e suas próprias funcionalidades. Gerado a partir do código real (`src/ai/whatsapp/demoConversation.ts`, `src/ai/whatsapp/onboardingConversation.ts`, `src/app/frota-ativacao/*`, `src/app/frota/**`) e cruzado com o banco de produção (Supabase MCP, `kqquswdrtcqicyfcvvuv`) em 2026-09-18.

---

## V1 — WhatsApp (o produto principal, universal a todos os planos)

### O que é

O canal onde 100% dos clientes entram e onde o produto "mora" de fato — mesmo quem contrata Essencial ou Pro (que ganham acesso ao Painel também) continua operando o dia a dia principalmente por aqui. Não precisa instalar nada, não precisa aprender tela nenhuma: texto, áudio, foto ou documento, no mesmo WhatsApp que o cliente já usa.

### Onboarding da V1 — 2 fases desde a inversão do funil (11/09/2026)

**Fase 1 — Demo pré-cadastro** (todos os planos, exceto lead "Empresas"):

1. Primeira mensagem → menu de 4 opções: *Analisar um frete · Calcular uma rota · Calcular custo de viagem · Conhecer o que o Frota IA faz*. Por baixo, uma empresa mínima (placeholder) + trial de 7 dias são criados em silêncio — nunca mencionados ao cliente.
2. Escolhe um track → IA responde em **modo restrito**, só com as ferramentas daquele track (frete: `analisar_frete`/`calcular_margem`/`calcular_valor_minimo_frete`/`verificar_piso_minimo_antt`; rota: `consultar_rota`; custo: `calcular_custo_viagem`/`calcular_combustivel`) — nunca as 39 completas.
3. Resultado real entregue → CTA de 3 botões: *Ver planos* (Individual/Essencial/Pro, gera link `/assinar`) · *Conhecer mais funções* (reabre o menu) · *Agora não* (segue testando).
4. Cliente pode repetir a demo à vontade — o trial (7 dias) sustenta esse acesso.

Lead **"Empresas"** (+10 veículos) pula direto pro cadastro completo abaixo, sem demo — decisão confirmada: frota grande é negociação humana, não automação.

**Fase 2 — Cadastro completo** (só depois do pagamento confirmado, ou logo após o "Empresas" se manifestar):

11 perguntas + 1 condicional, sempre a mesma sequência pros 3 planos de autoatendimento:

| # | Pergunta | Formato |
|---|---|---|
| 1 | Nome | Texto livre |
| 2 | Perfil | Lista: Motorista autônomo / Apenas motorista / Dono de empresa / Gestor de frota / Transportador |
| 3 | Objetivo inicial | Lista de 9 categorias + "ver tudo" |
| 4 | Cidade base | Texto livre |
| 5 | Região de atuação | Lista: Norte/Nordeste/Centro-Oeste/Sudeste/Sul/Todas |
| 6 | Rota fixa? | Sim/Não — se sim, pergunta condicional 6.1 (rota principal) |
| 7 | Veículo (marca/modelo/ano) | Obrigatório, não pode pular |
| 8 | Placa | Opcional, "depois" pula |
| 9 | Configuração do veículo | Lista: Toco/Truck/Três-quartos/Bitruck/Cavalo mecânico/Carreta/Bitrem/Rodotrem/Outro — cavalo/carreta abre pergunta extra de nº de eixos |
| 10 | Carroceria/implemento | Lista de 9 tipos |
| 11 | Consumo médio km/l | Opcional, última etapa |

Ao concluir: a empresa mínima da demo é **atualizada** (nunca cria uma segunda — `updateCompany`), cria o veículo, libera as **39 ferramentas completas**, mostra menu de 10 sugestões, e só aqui aparece o convite pro guia de 5 passos.

### Funcionalidades da V1 — as 39 ferramentas de IA, por categoria

| Categoria | Qtd | Exemplos |
|---|---|---|
| Cálculo puro (nunca escreve, só calcula) | 11 | `analisar_frete`, `calcular_cpk`, `calcular_margem`, `calcular_custo_viagem`, `verificar_piso_minimo_antt` |
| Gestão de frota — cadastro estruturado | 12 | `gerenciar_veiculo`, `gerenciar_motorista`, `gerenciar_manutencao`, `gerenciar_pneu_veiculo`, `gerenciar_abastecimento`, `registrar_despesa`, `registrar_receita` |
| Consultas e histórico | 5 | `consultar_historico`, `consultar_checklist`, `consultar_rota`, `gerar_documento` |
| Radar de Fretes | 3 | `gerenciar_radar_frete`, `consultar_oportunidades_frete` + pipeline de captura de grupo |
| Integrações externas | 2 | `gerenciar_google_calendar`, `vincular_painel` |
| Conta/preferências/config | 6 | `gerenciar_empresa`, `gerenciar_assinatura`, `gerenciar_alerta`, `gerenciar_noticias_setor`, `definir_estilo_resposta` |

**Total: 39** — confirmado contra o enum `frota_ia_tool_name` do banco em produção (`kqquswdrtcqicyfcvvuv`), sem divergência.

Princípios invioláveis: nunca inventa número (pergunta se falta dado), nunca escreve sem confirmar, conteúdo lido de imagem/PDF/página web é sempre dado nunca instrução, `userId`/`companyId` sempre do contexto autenticado (nunca do que o modelo "decidiu" mandar — trava de código).

---

## V2 — Painel Web (add-on separado, não incluso em todo plano)

### O que é

Uma tela de computador com dashboard, relatórios em PDF e cadastro visual — **é a mesma conta e o mesmo motor de IA da V1**, nunca uma segunda IA com regras próprias. Todo widget "Pergunte ao Frota IA" no painel chama exatamente `gerarRespostaAssistente()`, a mesma função do WhatsApp.

### Quem acessa

- **Entitlement**: `companies.fleet_panel_enabled` (manual, legado) **OU** `subscriptions.fleet_panel_included` (ligado ao plano) — basta um dos dois. Sem nenhum, redireciona pra "painel indisponível".
- Plano **Individual não tem Painel** — só WhatsApp. **Essencial e Pro incluem.**
- `CUSTOMER_PANEL_ENABLED` (flag antiga) **não controla mais** este painel — só restringe o chat V1 (`/`) a admins. São dois controles independentes.
- Papéis (`owner`/`admin`/`operator`/`viewer`, confirmado no enum real do banco): qualquer membro lê; criar/editar é `owner`/`admin`/`operator`; excluir e configurações sensíveis (Empresa, Configurações, Notícias, Oportunidades) só `owner`/`admin`.

### Onboarding da V2 — "Onboarding 2" (`/frota-ativacao`), 5 passos

Só existe pra quem **já concluiu** o cadastro completo da V1 (reaproveita empresa/veículo já criados — nunca duplica) e ainda não tem `companies.fleet_onboarding_completed_at` preenchido. Pré-requisito de acesso ao Painel (login Google + Calendar conectado) é checado **antes** desta página — o wizard em si não pede login nem Calendar.

Confirmado lendo o código real (`AtivacaoFlow.tsx`) — cada etapa grava direto nos dados reais (não existe rascunho intermediário), então nada se perde num refresh:

| Passo | Título | O que acontece |
|---|---|---|
| 1 | "Encontramos sua conta" | Confirma/edita nome da empresa; mostra o Veículo 1 já cadastrado pelo WhatsApp (se existir) |
| 2 | "Veículos da frota" | Lista veículos existentes + botão "Adicionar veículo" (abre o mesmo formulário do Painel normal) — não obrigatório além do 1º |
| 3 | "Motoristas" | Cadastro opcional de motoristas (nome, telefone, veículo, CNH) |
| 4 | "Checklist diário" | Liga/desliga + horário de envio (Brasília) + quais dos 4 itens fixos (óleo/água/pneus/luzes) — tudo opcional |
| 5 | "Tudo pronto" | Resumo (empresa, nº veículos, nº motoristas, status do checklist, status do Calendar) + botão "Ir para o Dashboard" — **só aqui** `fleet_onboarding_completed_at` é marcado |

**Achado técnico real (18/09/2026, leitura direta do código)**: o Passo 2 usa uma constante `VEHICLE_LIMIT = 10` **hardcoded** no componente (`AtivacaoFlow.tsx`) — o texto sempre mostra "Seu plano permite gerenciar até 10 veículos" e o botão "Adicionar veículo" só desabilita ao chegar em 10, **mesmo para um cliente Essencial (limite real = 3)**. O bloqueio de verdade continua funcionando (o trigger `enforce_vehicle_limit_by_entitlement` no Postgres rejeita o 4º veículo de um Essencial independente do que o wizard mostra), mas a experiência fica inconsistente: um cliente Essencial vê "até 10" no resumo e só descobre o limite real de 3 ao tentar cadastrar o 4º e receber um erro. Achado nesta sessão, **sem correção pedida ainda** — mesmo padrão dos outros achados técnicos documentados em `FROTA_IA_PENDENCIAS_2026-09-06.md`.

### Funcionalidades da V2 — as 22 telas, por grupo

| Grupo | Telas |
|---|---|
| Visão geral | Dashboard |
| Operação | Veículos · Motoristas · Fretes/Análises (somente leitura) · Oportunidades/Radar |
| Gestão | Manutenção · Documentos · Despesas · Jornadas (somente leitura) · Rotas salvas · Checklists (analítico) · Postos e fornecedores · Abastecimentos · Pneus · Receitas |
| Acompanhamento | Agenda (única tela dependente do Google Calendar) · Alertas · Relatórios · Documentos gerados · Notícias do setor |
| Administração | Empresa · Configurações |

Limite de veículos reforçado em 3 camadas independentes: trigger no Postgres, a ferramenta de IA (usada pelos dois canais) e a própria tela de Veículos — não dá pra contornar por nenhum canal, apesar do achado acima sobre o texto do wizard.

---

## Tabela-resumo comparativa

| | **V1 — WhatsApp** | **V2 — Painel Web** |
|---|---|---|
| Obrigatório? | Sim, universal a todo cliente | Não — add-on, só Essencial/Pro |
| Onboarding | Demo pré-cadastro (1-4 ferramentas) → cadastro completo pós-pagamento (11+1 perguntas) | "Onboarding 2" (`/frota-ativacao`), 5 passos, só depois do onboarding da V1 |
| Pré-requisito | Nenhum (nem cadastro, pra ver a demo) | Login Google + Calendar conectado + onboarding V1 já concluído |
| Motor de IA | `gerarRespostaAssistente()` | O mesmo `gerarRespostaAssistente()` (widget embutido) |
| Funcionalidades expostas | 39 ferramentas completas (pós-cadastro) | 22 telas — a maioria espelha uma ferramenta, algumas são só leitura ou só agregação |
| Escrita de dados | Cria/edita tudo via conversa | Cria/edita a maior parte via formulário; Fretes/Análises e Jornadas são só leitura (nascem só no WhatsApp) |

## O que este documento NÃO substitui

- Detalhe ferramenta por ferramenta → `FROTA_IA_FERRAMENTAS_ATUAL_2026-09-06.md`
- Detalhe tela por tela do Painel → `FROTA_IA_PAINEL_WEB_ATUAL_2026-09-13.md`
- Jornada de pagamento/checkout por plano → `FROTA_IA_JORNADA_POR_PLANO_2026-09-10.md`
- Simulação literal da conversa de WhatsApp → `FROTA_IA_ONBOARDING_WHATSAPP_2026-09-11.md`
