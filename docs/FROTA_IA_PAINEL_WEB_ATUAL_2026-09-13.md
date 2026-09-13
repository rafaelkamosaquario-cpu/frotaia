# Frota IA — Painel Web: as 22 telas em detalhe (estado atual, 2026-09-13)

Documento técnico/comercial gerado direto do código real (`src/app/frota/**`, `frotaNavItems.ts`, `fleetPanelAccess.ts`, `vehicleLimit.ts`) — não é uma descrição aspiracional, é o que está em produção hoje. Complementa `FROTA_IA_FERRAMENTAS_ATUAL_2026-09-06.md`, que cita as 22 telas em uma única linha; aqui cada uma é detalhada.

## Quem acessa o Painel, de verdade

O Painel de Gestão (`/frota/*`) é um **add-on separado do WhatsApp**, não um benefício automático de qualquer plano:

- **Entitlement**: `companies.fleet_panel_enabled` (manual, legado) **OU** `subscriptions.fleet_panel_included` (novo, ligado ao plano contratado) — basta um dos dois. Sem nenhum, o cliente é redirecionado para uma tela de "painel indisponível".
- **Onboarding próprio**: mesmo com entitlement, se a empresa ainda não completou `fleet_onboarding_completed_at`, cai num wizard de ativação que reaproveita a empresa/veículo já cadastrados via WhatsApp — nunca duplica cadastro.
- **A flag `CUSTOMER_PANEL_ENABLED`** (histórica) não controla mais este painel — ela só restringe o chat de teste V1 (`/`) a usuários `is_admin`. São dois controles de acesso independentes.

**Papéis dentro da empresa** (`company_member_role`: owner/admin/operator/viewer) — confirmados via RLS real do banco:
- Qualquer membro vê os dados (select).
- Criar/editar é liberado para owner, admin e operator.
- Excluir e mudar configurações sensíveis (Empresa, Configurações, Notícias, Oportunidades) é restrito a owner/admin — a própria tela desabilita os campos e avisa quem não pode editar.

**Limite de veículos por plano — 1 (Individual) / 3 (Essencial) / 10 (Pro)** — reforçado em 3 camadas independentes (trigger no Postgres, a ferramenta de IA usada tanto pelo WhatsApp quanto pelo painel, e a própria tela de Veículos), então não dá para contornar por nenhum canal.

**Widget de IA embutido**: toda tela do painel tem um chat flutuante "Pergunte ao Frota IA" — é literalmente o mesmo motor do WhatsApp (`gerarRespostaAssistente`, mesmas ferramentas, mesmos dados), com upload de imagem e contexto da tela atual. Nunca é uma segunda IA com regras próprias.

## As 22 telas, por grupo

### Visão geral

**Dashboard** (`/frota/dashboard`) — agrega em uma única tela: 6 indicadores (veículos ativos, motoristas ativos, manutenções pendentes, documentos vencidos, documentos vencendo em 30 dias, despesas dos últimos 30 dias — mostra "—" quando não há dado, nunca zero falso), um insight gerado por IA (cacheado por até 20h por empresa, para não gastar chamada de IA a cada carregamento), até 5 alertas urgentes com atalho para a tela de Alertas, e o progresso do checklist diário. Somente leitura — é um agregador dos mesmos dados usados pelo WhatsApp, não uma fonte própria.

### Operação

**Veículos** (`/frota/veiculos`) — cadastro completo (nunca exclusão física, só desativação), com seguro/licenciamento vinculados. É aqui que o limite do plano (1/3/10) é aplicado na prática — tentar ativar acima do limite é bloqueado.

**Motoristas** (`/frota/motoristas`) — cadastro completo, com vencimento de CNH e exame toxicológico visíveis na lista.

**Fretes / Análises** (`/frota/fretes`) — **somente leitura**, e só existe o que foi pedido pelo WhatsApp ("esse frete compensa?", "compare essas propostas"). Não há botão de criar análise pela tela.

**Oportunidades / Radar de Fretes** (`/frota/oportunidades`) — a tela mais rica em ações: preferência de modo (avisar direto ou analisar antes de avisar — só owner/admin decide), radares ativos com pausa/reativação, lista de oportunidades com % de compatibilidade e ações de analisar/favoritar/ignorar, e o cadastro dos grupos de WhatsApp que alimentam o radar. **Limitação real, já documentada na própria tela**: o Radar hoje só lê grupos de WhatsApp autorizados — nenhuma integração com Fretebras, Truckpad ou plataforma de frete equivalente ainda.

### Gestão

**Manutenção** (`/frota/manutencao`) — agenda por data ou por km, cruzando com a última leitura de odômetro disponível (de qualquer módulo) para avisar "faltam ~X km".

**Documentos** (`/frota/documentos`) — tacógrafo, RNTRC, seguro, licenciamento, CNH, exame toxicológico, vinculados a veículo ou motorista, com upload de arquivo.

**Despesas** (`/frota/despesas`) — cadastro livre por tipo (combustível, manutenção, pedágio, alimentação, hospedagem, documentação, pneu, seguro, multa, outro), com filtro por veículo/tipo e total do período filtrado.

**Jornadas** (`/frota/jornadas`) — **somente leitura**, só o que foi salvo pelo WhatsApp ("organize minha jornada" → "salva essa jornada").

**Rotas salvas** (`/frota/rotas`) — pode nascer tanto na tela quanto no WhatsApp; mostra distância, duração e pedágio estimados.

**Checklists** (`/frota/checklists`) — só analítico (a configuração de envio mora em Configurações): indicadores do dia (enviado/respondido/sem resposta/com atenção) e aderência por motorista, com filtro de período e expansão de histórico.

**Postos e fornecedores** (`/frota/fornecedores`) — cadastro reaproveitado depois em Despesas e Abastecimentos; também pode nascer pelo WhatsApp.

**Abastecimentos** (`/frota/abastecimentos`) — histórico com cálculo de consumo médio **real** (a partir de duas ou mais leituras de odômetro), não a estimativa "de fábrica". Excluir um abastecimento nunca apaga a despesa vinculada, só desfaz o vínculo.

**Pneus** (`/frota/pneus`) — status (montado/estoque/manutenção/sucateado), km rodado e km restante calculados a partir da última leitura de odômetro; sem exclusão, só edição de status.

**Receitas** (`/frota/receitas`) — registra frete **já fechado de verdade** (nunca simulação — isso é o que diferencia Receitas de Fretes/Análises).

### Acompanhamento

**Agenda** (`/frota/agenda`) — a única tela que depende de fato do Google Calendar: sem conta conectada, mostra um bloqueio dedicado com botão de conexão em vez do conteúdo. O Google Calendar é a fonte única de verdade (nenhum evento é duplicado no banco do Frota IA) — é a mesma agenda usada pelo WhatsApp.

**Alertas** (`/frota/alertas`) — central única para 5 origens (manual, manutenção, documento, pneu, checklist). Só os alertas manuais são editáveis aqui; os demais mostram "controlado pela tela de origem" com link direto, para nunca duplicar a regra de negócio em dois lugares.

**Relatórios** (`/frota/relatorios`) — filtros por período/veículo/motorista, com blocos que só aparecem quando há dado real: veículos, motoristas, documentos, manutenções, despesas, jornadas, checklists/aderência, fretes analisados, e um bloco de **Resultado do período** (Receita − Custo). O botão "Baixar PDF" usa exatamente os mesmos filtros da tela — nunca diverge do que está sendo mostrado.

**Documentos gerados** (`/frota/documentos-gerados`) — **somente leitura**, histórico de PDFs gerados pela IA (pelo WhatsApp ou pelo próprio painel), com botão de abrir/baixar o arquivo.

**Notícias do setor** (`/frota/noticias`) — o toggle de opt-in do resumo diário (desativado por padrão, só owner/admin altera); o conteúdo do resumo é entregue pelo WhatsApp, o controle mora aqui.

### Administração

**Empresa** (`/frota/empresa`) — dados cadastrais (nome, documento, tipo de operação, cidade/UF) — só owner/admin edita, os demais veem tudo desabilitado.

**Configurações** (`/frota/configuracoes`) — estilo de resposta da IA (simples/técnico/objetivo — muda só a explicação, nunca o número calculado), preferências de memória da IA (perguntar antes de guardar / guardar automaticamente), configuração do checklist diário (horário, itens conferidos), e atalhos para Notícias e para reabrir o guia de primeiros passos a qualquer momento.

## Resumo — de onde vem o dado de cada tela

| Como o dado nasce | Telas |
|---|---|
| Só pelo WhatsApp (somente leitura no painel) | Fretes/Análises, Jornadas |
| Nasce nos dois canais (CRUD completo no painel e no WhatsApp) | Veículos, Motoristas, Manutenção, Documentos, Despesas, Rotas salvas, Postos e fornecedores, Abastecimentos, Pneus, Receitas, Alertas (parcial), Oportunidades |
| Fonte externa, nunca duplicada no banco | Agenda (Google Calendar) |
| Configuração/preferência, sem equivalente no WhatsApp | Empresa, Configurações, Notícias (o toggle) |
| Só agrega o que já existe, sem dado próprio | Dashboard, Checklists, Relatórios, Documentos gerados |

## Achado e corrigido em 13/09/2026

O texto mostrado ao cliente na tela de Veículos, na mensagem de erro de limite, nos comentários/mensagens de `gerenciar_veiculo` e nas instruções de `systemPrompt.ts` (inclusive a apresentação de planos em `gerenciar_assinatura`, que só citava "Individual ou Gestão") ainda descreviam o modelo binário antigo (1 sem Painel de Gestão, até 10 com Painel de Gestão / só 2 planos). O bloqueio de banco sempre funcionou certo (1/3/10 desde 10/09/2026) — só a cópia visível ao cliente e as instruções da IA estavam desatualizadas. Corrigido nesta mesma sessão: textos agora refletem Individual (1) / Essencial (até 3) / Pro (até 10), e a IA passa a oferecer os 3 planos reais ao vender pelo WhatsApp, não só 2.
