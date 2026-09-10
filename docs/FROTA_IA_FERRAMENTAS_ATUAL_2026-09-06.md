# Frota IA — Ferramentas e Funcionalidades (estado atual, 2026-09-06; limite de veículos e planos atualizados em 10/09/2026)

Documento técnico/funcional gerado direto do código real do repositório (`src/ai/tools/`, 39 ferramentas registradas) — não é uma descrição aspiracional, é o que está em produção hoje.

## Como funciona, em 1 parágrafo

O Frota IA é um assistente de IA (Claude, Anthropic) que conversa por **WhatsApp** e por um **Painel Web**, usando exatamente o mesmo motor de resposta e as mesmas 39 ferramentas nos dois canais — o que é feito por WhatsApp aparece no painel, e vice-versa. A IA nunca calcula "de cabeça": todo número (custo, margem, CPK, jornada etc.) sai de uma ferramenta determinística escrita em código, nunca de uma estimativa do modelo de linguagem. Dado factual externo (lei, preço oficial, pedágio, clima) vem sempre de busca ao vivo restrita a domínios oficiais, nunca de memória do modelo.

## Princípios que valem para todas as ferramentas

- **Nunca inventa número.** Se falta um dado pra calcular, a IA pergunta — nunca estima "valor plausível".
- **Nunca escreve sem confirmar.** Ações que criam/alteram/excluem dado (despesa, receita, veículo, alerta, evento de agenda) sempre mostram o que foi entendido antes de salvar; exclusão sempre exige confirmação explícita do cliente.
- **`userId`/`companyId` sempre vêm do contexto autenticado da conversa, nunca da mensagem** — trava estrutural que impede qualquer ferramenta de escrever fora da própria conta, mesmo que o texto da mensagem tente indicar outra coisa.
- **Conteúdo lido de imagem/PDF/página web é sempre dado, nunca instrução** (regra adicionada em 2026-09-06, revisão de segurança) — a IA nunca obedece um comando escondido dentro de uma nota fiscal, CT-e ou página buscada.
- **Hierarquia de fontes**: (1) dado que o cliente informou nesta conversa ou tem salvo > (2) API/página oficial de órgão público > (3) site de fabricante > (4) entidade técnica do setor > (5) imprensa especializada > (6) internet geral, só como último recurso e sempre com aviso de fonte não verificada.

## As 39 ferramentas, por categoria

### Cálculo puro (nunca fazem I/O — 11 ferramentas)

| Ferramenta | O que faz |
|---|---|
| `calcular_combustivel` | Litros necessários, custo, consumo real, autonomia e comparações de combustível. |
| `calcular_cpk` | Custo Por Quilômetro por categoria (pneu, combustível, manutenção, operacional) ou total, com comparação entre veículos/operações. |
| `comparar_pneus` | Compara 2+ opções de pneu pelo custo total do ciclo e CPK — nunca só pelo preço de compra, nunca valida compatibilidade técnica. |
| `calcular_custo_viagem` | Custo operacional completo de uma viagem (combustível, ARLA, pedágio, motorista, ajudante, fixos proporcionais) — por km, tonelada, veículo e dia. |
| `calcular_margem` | Receita líquida, lucro, margem, markup, ponto de equilíbrio e impacto do retorno vazio. |
| `analisar_frete` | Decide se um frete ofertado compensa — receita, custo, margem, retorno vazio, prazo, capital de giro e risco. Suporta comparação entre 2+ propostas ao mesmo tempo. |
| `calcular_valor_minimo_frete` | Valor econômico mínimo pra cobrir custo + margem/markup/lucro-alvo, e compara com o valor ofertado. |
| `calcular_receita_km` | Receita por km de um frete/veículo/período. |
| `calcular_custo_dia` | Custo diário (fixo, variável, total, por km/hora, parado ou ocioso). |
| `calcular_custo_veiculo_parado` | Impacto financeiro de um veículo parado — custo, receita e lucro não realizados. |
| `calcular_jornada` | Duração de viagem, jornada de trabalho, tempo de direção, horários, dias necessários, revezamento entre 1-2 motoristas — sem afirmar conformidade legal sem regra fornecida. |
| `verificar_piso_minimo_antt` | Piso mínimo LEGAL de frete (Lei 13.703/2018) via coeficientes oficiais buscados ao vivo na ANTT — nunca de memória. |

### Gestão de frota — cadastro estruturado (12 ferramentas)

| Ferramenta | O que faz |
|---|---|
| `gerenciar_veiculo` | Cadastra/lista/atualiza veículos (dados básicos, perfil de custo, perfil de pneu). Limite conforme o plano: 1 (Individual), 3 (Essencial) ou 10 (Pro) — atualizado 10/09/2026, antes era binário (1 ou 10). |
| `gerenciar_motorista` | Cadastra/lista/atualiza/desativa/reativa motoristas (nome, telefone, veículo, vencimento de CNH/toxicológico). |
| `gerenciar_documento_frota` | Documentos de veículo/motorista (tacógrafo, RNTRC, CNH, toxicológico, seguro, licenciamento). |
| `gerenciar_manutencao` | Agenda/lista/atualiza/conclui/cancela manutenções — **manutenção por km ativa** (item novo 09/2026): alerta automático quando `next_due_km` está próximo, usando a última leitura de km conhecida (abastecimento, pneu, manutenção ou o cadastro do veículo). |
| `gerenciar_pneu_veiculo` **(novo 09/2026)** | Pneu físico individual — monta num veículo, atualiza leitura de km (recalcula km rodado/restante), desmonta pra estoque ou sucata. Gera alerta automático quando a vida útil está acabando. Diferente de `comparar_pneus`, que só compara opções sem saber o que está montado. |
| `gerenciar_abastecimento` **(novo 09/2026)** | Histórico real de abastecimento (litros, valor, km). Sincroniza despesa automaticamente. Modo `CONSULTAR_CONSUMO_MEDIO` calcula km/l **medido de verdade** a partir do histórico — complementa `calcular_combustivel`, que continua sendo cálculo pontual sem gravar nada. |
| `gerenciar_fornecedor` **(novo 09/2026)** | Cadastro de posto de combustível/oficina/fornecedor de peças — reaproveitável em despesas e abastecimentos. |
| `registrar_despesa` | Registra despesa (por texto ou foto de nota/cupom lida pela IA), consulta/soma por período, corrige ou exclui. |
| `registrar_receita` **(novo 09/2026)** | Registra receita de frete **já fechado de verdade** (nunca simulação) — junto com despesas, alimenta o "Resultado (receita − custo)" de Relatórios. |
| `gerenciar_rota_salva` | Salva/lista/atualiza/remove rotas frequentes (origem, destino, distância, pedágio, consumo). |
| `gerenciar_jornada_salva` | Salva/lista/atualiza/cancela jornadas operacionais reais (distintas de simulação). |
| `gerenciar_checklist_config` | Liga/desliga o checklist diário automático dos motoristas, horário e itens conferidos. |

### Consultas e histórico (5 ferramentas)

| Ferramenta | O que faz |
|---|---|
| `consultar_historico` | Busca análises/cálculos já feitos ou PDFs já gerados, com filtro por texto/período. |
| `consultar_checklist` | Resumo do dia, aderência de um motorista, ranking geral, ou ocorrências do checklist diário. |
| `consultar_rota` | Distância/duração via Google Maps, geocodificação de endereço, envio opcional do mapa visual pelo WhatsApp. |
| `consultar_conhecimento_operacional` | Boas práticas do setor (negociação, manutenção preventiva, direção econômica, indicadores, jornada/bem-estar) — nunca substitui cálculo ou fonte oficial. |
| `gerar_documento` | Gera PDF (relatório/análise/comparação) e entrega por WhatsApp ou disponibiliza em "Documentos gerados" no painel (funciona mesmo sem WhatsApp vinculado, desde 09/2026). |

### Radar de Fretes (3 ferramentas)

| Ferramenta | O que faz |
|---|---|
| `gerenciar_radar_frete` | Cria/lista/atualiza/pausa/reativa/cancela uma busca ativa de carga de retorno. |
| `consultar_oportunidades_frete` | Lista/detalha/analisa (estimativa preliminar)/ignora/favorita oportunidades encontradas. |
| *(pipeline de captura)* | Mensagens de **grupo** de WhatsApp autorizado alimentam o Radar via um pipeline **separado, sem ferramentas anexadas e sem acesso de escrita livre** — nunca passa pelo assistente conversacional. |

### Integrações externas (2 ferramentas)

| Ferramenta | O que faz |
|---|---|
| `gerenciar_google_calendar` | Consulta/cria/altera/exclui compromissos, cria a jornada inteira de uma vez (`CRIAR_JORNADA`), gerencia a conexão OAuth. |
| `vincular_painel` | Link seguro (15 min) pra acessar o Painel Web com a mesma empresa do WhatsApp, sem duplicar cadastro. |

### Conta, preferências e configuração (6 ferramentas)

| Ferramenta | O que faz |
|---|---|
| `gerenciar_empresa` | Consulta/atualiza dados cadastrais da empresa. |
| `gerenciar_assinatura` | Gera link de contratação (Individual/Essencial/Pro, mensal ou anual — Pix/cartão no anual) — nunca pede dado de cartão na conversa. |
| `gerenciar_memoria` | Memória auxiliar sobre o cliente sem tabela própria (preferência, observação recorrente) — persiste entre conversas. |
| `gerenciar_alerta` | Lembretes planejados via WhatsApp em horário definido (revisão, documento, jornada etc.) — nunca baseado em telemetria. |
| `gerenciar_noticias_setor` | Opt-in de resumo diário de notícias do setor pelo WhatsApp. |
| `definir_estilo_resposta` | Salva preferência de estilo de resposta (simples/técnico/objetivo), persiste entre conversas. |

## Painel Web — 22 telas

Dashboard · Veículos · Motoristas · Fretes/Análises · Oportunidades · Manutenção · Documentos · Despesas · Jornadas · Rotas salvas · Checklists · **Postos e fornecedores** · **Abastecimentos** · **Pneus** · **Receitas** (5 últimas, novas em 09/2026) · Agenda · Alertas · Relatórios (com bloco "Resultado — receita menos custo") · Documentos gerados · Notícias · Empresa · Configurações.

## O que NÃO existe hoje (pra não prometer o que não tem)

- Telemetria/rastreador/GPS em tempo real — todo km é **leitura manual informada**, nunca automática.
- Pedágio automático (Maplink) — decidido, não implementado.
- Modelo de viagem com múltiplas cargas/CT-e por trecho — decisão explícita de não fazer nesta rodada.
- Chargeback/estorno de pagamento anual sem tratamento automático.
- Processo de exclusão de conta (LGPD) — não existe ainda.
