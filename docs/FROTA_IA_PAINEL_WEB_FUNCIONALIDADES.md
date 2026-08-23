# FROTA IA
## PAINEL WEB — FUNCIONALIDADES E FLUXO OPERACIONAL

### Raio-X funcional da versão atual

**Data:** 23/08/2026
**Branch:** `claude/frota-ia-assistente-setup-qlrbac`
**Commit:** `05c1c76`

Documento escrito a partir de auditoria direta do código atual (páginas, APIs, services, tabelas, RLS, ferramentas de IA) — não de documentação anterior. Cada afirmação abaixo foi verificada no repositório antes de ser escrita. Onde uma funcionalidade existe só parcialmente, isso é dito explicitamente — nada aqui foi arredondado pra "completo".

---

## 1. O que é o Painel Web

O Painel Web (`/frota/*`) é a segunda interface do Frota IA — o assistente nasceu 100% por WhatsApp (V1) e o painel (V2, "Gestão") é a evolução paga que dá uma tela de gestão além da conversa. Não são dois produtos: é o **mesmo motor de IA, os mesmos dados, a mesma empresa** — só um segundo jeito de acessar.

**Para quem serve**: clientes no plano Gestão (mensal ou anual) — até 10 veículos, com Painel de Gestão incluído. Clientes Individual (WhatsApp puro, 1 veículo) não têm acesso ao painel.

**Como o cliente acessa**: login Google (Supabase Auth) em `/login` → gate de acesso (`src/app/frota/layout.tsx`) checa, em ordem: autenticado → empresa vinculada → entitlement de Gestão → Google Calendar conectado (obrigatório) → onboarding do painel concluído (`/frota-ativacao`, se ainda não fez) → libera `/frota/dashboard` e as demais telas.

---

## 2. Mapa do Painel (módulos realmente existentes)

```
PAINEL FROTA IA (/frota/*)
│
├── Dashboard        — indicadores e alertas, só leitura
├── Veículos         — CRUD (sem exclusão real, só ativar/desativar)
├── Motoristas        — CRUD (sem exclusão real, só ativar/desativar)
├── Manutenção        — criar/editar (sem exclusão)
├── Documentos         — criar/editar (sem exclusão, sem upload de arquivo)
├── Despesas         — CRUD completo (único módulo com exclusão real)
├── Checklist          — só leitura (configuração fica em Configurações)
├── Alertas            — só leitura
├── Notícias do setor    — toggle + leitura do último resumo
├── Radar de Fretes (Fretes/Oportunidades) — CRUD completo
├── Relatórios          — leitura + exportação em PDF
├── Fretes (análises)    — só leitura (histórico de análises do WhatsApp)
├── Jornadas          — só leitura (histórico de jornadas do WhatsApp)
├── Rotas             — só leitura (histórico de rotas do WhatsApp)
├── Empresa            — editar dados cadastrais
└── Configurações       — estilo de resposta da IA + config de checklist
```

Não existe tela de agenda/Calendar visual — só uma tela de confirmação de conexão OAuth (ver seção 11). Um widget de chat de IA (`FrotaAiWidget`) fica disponível em **todas** as telas acima (ver seção 16).

---

## 3. Tabela-resumo por área

| Área | Status |
|---|---|
| Dashboard | IMPLEMENTADO E FUNCIONAL (só leitura) |
| Veículos | IMPLEMENTADO E FUNCIONAL (exclusão real não existe, por design) |
| Motoristas | IMPLEMENTADO E FUNCIONAL (exclusão real não existe, por design) |
| Manutenção | IMPLEMENTADO PARCIALMENTE (sem km/custo, sem exclusão) |
| Documentos | IMPLEMENTADO PARCIALMENTE (sem upload de arquivo real) |
| Despesas | IMPLEMENTADO E FUNCIONAL |
| Checklist (painel) | IMPLEMENTADO E FUNCIONAL (só leitura, por design) |
| Alertas (painel) | IMPLEMENTADO PARCIALMENTE (só leitura, sem criar/cancelar pelo painel) |
| Notícias do setor | IMPLEMENTADO E FUNCIONAL (toggle + leitura) |
| Google Calendar/Agenda | IMPLEMENTADO PARCIALMENTE (sem tela de agenda visual) |
| Radar de Fretes | IMPLEMENTADO E FUNCIONAL |
| Relatórios | IMPLEMENTADO PARCIALMENTE (fixo, sem filtros) |
| Fretes (análises) | INTERFACE EXISTENTE MAS SÓ LEITURA (cálculo é só WhatsApp) |
| Jornadas | INTERFACE EXISTENTE MAS SÓ LEITURA (RLS nem permite escrita via painel) |
| Rotas | INTERFACE EXISTENTE MAS SÓ LEITURA (RLS já permite escrita, UI não foi feita) |
| Empresa | IMPLEMENTADO E FUNCIONAL |
| Configurações | IMPLEMENTADO PARCIALMENTE (vários campos do banco sem UI, ver seção 24) |
| Chat de IA no painel (widget) | IMPLEMENTADO E FUNCIONAL |

---

## 4. Dashboard

**Objetivo**: dar ao gestor uma leitura rápida do estado da frota ao abrir o painel.

**Rota**: `src/app/frota/dashboard/page.tsx` (server) + `DashboardClient.tsx`. Sem API própria — os dados são buscados direto no servidor via services, em paralelo.

**Origem de cada card** (tudo calculado no momento da requisição, nenhuma tabela de agregação no banco):
1. **Veículos ativos** — contagem de `vehicles.active = true`.
2. **Motoristas ativos** — contagem de `drivers.active = true`.
3. **Manutenções pendentes** — `maintenance_schedules` com `status ≠ concluido`.
4. **Documentos vencidos** — `vehicle_documents` com `expiry_date` no passado.
5. **Vencendo em 30 dias** — `vehicle_documents` com `expiry_date` entre hoje e +30 dias.
6. **Custo nos últimos 30 dias** — soma de `expenses.amount` dos últimos 30 dias; mostra "—" (nunca zero artificial) quando não há despesa nenhuma registrada.

**Blocos adicionais**:
- **Alertas urgentes** — até 5 itens, derivados ao vivo de veículos/manutenções/documentos vencidos ou vencendo (mesma lógica de `/frota/alertas`), cada um com link direto pra tela de origem.
- **Checklists hoje** — barra de progresso + lista de motoristas com status do checklist do dia (ok/atenção/pendente).
- **"Frota IA sugere"** — um parágrafo gerado por IA (Claude), a partir de um resumo textual dos números acima. Regenerado no máximo 1x a cada 20 horas (cache em `company_preferences.dashboard_insight_text`). Se a chamada de IA falhar, o dashboard continua funcionando normalmente sem esse bloco.

**Ações do usuário**: nenhuma — é uma tela 100% de leitura, só com links de atalho pras telas de origem.

---

## 5. Veículos

**Objetivo**: cadastro e gestão da frota da empresa.

**Rota**: `/frota/veiculos` (`VeiculosClient.tsx` + `VehicleFormModal.tsx`). **API**: `GET`/`POST /api/frota/veiculos`, `PATCH /api/frota/veiculos/[id]`. **Sem `DELETE`** — a política de exclusão existe no banco (RLS), mas não é usada por nenhum caminho do produto; a única forma de "remover" um veículo é desativá-lo (`active: false`).

**Campos reais do cadastro** (tabela `vehicles`): apelido, placa (obrigatória), tipo de veículo, combustível, marca, modelo, ano, número de eixos (1-12), consumo médio (km/l), velocidade média (km/h), capacidade de carga (kg), odômetro atual (km), observações. Vencimento de seguro e de licenciamento também são editáveis na tela, mas **gravam em `vehicle_documents`** (não mais nas colunas `vehicles.insurance_expiry_date`/`licensing_expiry_date`, que existem no banco mas ficaram mortas desde a unificação com o módulo de Documentos).

**Achado**: o campo `body_type` (carroceria — usado pelo Radar de Fretes pra casar oportunidade com veículo) existe no banco e é editável via WhatsApp, mas **não tem campo no formulário do painel** — hoje só dá pra definir a carroceria de um veículo pelo WhatsApp.

**Ações na tela**: cadastrar, editar, ativar/desativar (com confirmação). Sem exclusão, sem filtro, sem busca.

**Vínculos**: motorista (`drivers.vehicle_id`), manutenção, despesas, documentos — todos referenciam o veículo. Perfil de custo e perfil de pneu (usados em cálculos da IA) só são editáveis via WhatsApp, sem tela própria no painel.

**Limite de veículos**: aplicado em 3 camadas redundantes — trigger no banco, a ferramenta de IA, e a API do painel. Vem sempre do entitlement (nunca de um campo digitado): sem Painel de Gestão = 1 veículo ativo; com Painel de Gestão = até 10. Ao tentar cadastrar/ativar o 11º (ou 2º sem plano Gestão), a API devolve **HTTP 409** com a mensagem: *"Esta empresa já atingiu o limite de veículos ativos do plano atual..."*

**Relação com WhatsApp**: ferramenta `gerenciar_veiculo` (modos CRIAR/LISTAR/ATUALIZAR/DEFINIR_PADRAO/DEFINIR_CUSTO/DEFINIR_PNEU) usa a mesma tabela e os mesmos services — painel e WhatsApp sempre veem o mesmo dado, em tempo real.

---

## 6. Motoristas

**Rota**: `/frota/motoristas` (`MotoristasClient.tsx` + `DriverFormModal.tsx`). **API**: `GET`/`POST /api/frota/motoristas`, `PATCH .../[id]`. Sem exclusão real (mesmo padrão de Veículos — só ativa/desativa).

**Campos reais** (tabela `drivers`): nome (obrigatório), telefone, veículo vinculado (opcional), vencimento da CNH, vencimento do exame toxicológico, ativo/inativo. **Não existe campo de número da CNH** — só a data de vencimento.

**Ações na tela**: cadastrar, editar (inclusive desvincular o veículo, escolhendo "Nenhum" — **isso só é possível pelo painel**, a ferramenta de IA não desvincula), ativar/desativar.

**Motorista não tem login/conta própria** — é um registro operacional, nunca acessa o sistema diretamente.

**Relação com WhatsApp**: ferramenta `gerenciar_motorista` (CRIAR/LISTAR/ATUALIZAR/DESATIVAR/ATIVAR), mesma tabela.

---

## 7. Manutenção

**Rota**: `/frota/manutencao` (`ManutencaoClient.tsx` + `MaintenanceFormModal.tsx`). **API**: `GET`/`POST /api/frota/manutencao`, `PATCH .../[id]`. Sem `DELETE` (a policy de exclusão existe no banco, mas não é usada em lugar nenhum — nem painel, nem IA).

**Campos reais** (tabela `maintenance_schedules`): tipo (texto livre, não é enum fixo), veículo, data de vencimento, status (pendente/agendado/concluído/cancelado), observações.

**Importante**: **não existem campos de quilometragem nem de custo** neste módulo — é inteiramente baseado em data. Quem quer registrar quanto uma manutenção custou lança em Despesas (categoria "manutenção"), mas as duas tabelas não têm vínculo entre si.

**Ações na tela**: cadastrar, editar (inclusive marcar como concluída/cancelada trocando o status). Sem exclusão, sem filtro.

**Alerta automático**: sim — toda criação/atualização sincroniza uma linha em `scheduled_alerts` (nunca duplica), que dispara automaticamente às 11h (horário de Brasília) do dia do vencimento, via WhatsApp. Se a manutenção for concluída/cancelada, o alerta pendente é cancelado junto.

**Relação com WhatsApp**: ferramenta `gerenciar_manutencao` (CRIAR/LISTAR/ATUALIZAR/CONCLUIR/CANCELAR), mesma tabela e mesmo mecanismo de alerta — painel e WhatsApp sempre sincronizados.

---

## 8. Documentos

**Rota**: `/frota/documentos` (`DocumentosClient.tsx` + `DocumentFormModal.tsx`). **API**: `GET`/`POST /api/frota/documentos`, `PATCH .../[id]`. Sem `DELETE` (mesmo padrão dos outros módulos).

**Tipos de documento** (enum real): tacógrafo, RNTRC, seguro, licenciamento (vinculados a veículo) e CNH, exame toxicológico (vinculados a motorista) — cada documento pertence a exatamente um veículo OU um motorista, nunca aos dois.

**Campos**: tipo, dono (veículo ou motorista, conforme o tipo), data de vencimento (opcional), observações.

**Importante — não existe upload de arquivo**: o sistema guarda só metadados (tipo, dono, vencimento, observações), **não existe campo de arquivo/PDF/foto anexado nem integração com armazenamento de arquivo neste módulo**. A "leitura por foto" mencionada no WhatsApp (ver abaixo) extrai só os dados (ex.: a data de vencimento) direto da imagem, na hora — não guarda a foto em lugar nenhum.

**Leitura por IA/foto**: a ferramenta de IA `gerenciar_documento_frota` documenta explicitamente que a data de vencimento pode vir "lida de foto do documento ou informada pelo cliente" — usa a visão nativa do Claude (a foto entra na conversa, o modelo extrai o dado), sem uma etapa separada de OCR. Não há leitura automática de CT-e/DACTE neste módulo (isso é tratado por uma ferramenta totalmente diferente, de geração de relatório em PDF, não de cadastro de documento).

**Alerta automático**: mesmo mecanismo de Manutenção — sincroniza `scheduled_alerts`, dispara às 11h do dia do vencimento.

**Relação com WhatsApp**: ferramenta `gerenciar_documento_frota` (CRIAR/LISTAR/ATUALIZAR), mesma tabela.

---

## 9. Despesas / Custos

**Rota**: `/frota/despesas` (`DespesasClient.tsx` + `ExpenseFormModal.tsx`). **API**: `GET`/`POST /api/frota/despesas`, `PATCH`/`DELETE .../[id]` — **este é o único módulo do painel com exclusão real, ponta a ponta** (com diálogo de confirmação na tela).

**Categorias reais** (enum `expense_type`): combustível, manutenção, pedágio, alimentação, hospedagem, documentação, pneu, seguro, multa, outro.

**Campos**: tipo, valor, data, veículo (opcional — despesa pode não ter veículo vinculado), fornecedor, descrição. **Não vincula a motorista** — só a veículo.

**Ações na tela**: criar, editar, excluir, **filtrar por veículo e por tipo** (filtro em memória, sem nova busca ao servidor). O cabeçalho mostra a soma em reais do conjunto filtrado.

**Sem alerta automático** — despesa é só registro histórico, não tem vencimento.

**Relação com WhatsApp**: ferramenta `registrar_despesa` (REGISTRAR/CONSULTAR/ATUALIZAR/EXCLUIR) — é o único módulo com paridade completa de operações entre painel e WhatsApp (excluir pela IA exige confirmação explícita do cliente).

**Uso em cálculo**: o modo CONSULTAR da ferramenta soma despesas por período/veículo/tipo e a IA repassa esse total manualmente para outras ferramentas (ex.: `calcular_cpk`) quando faz sentido na conversa — **não é uma integração automática**; nenhuma ferramenta de cálculo lê a tabela `expenses` diretamente. O painel também não tem nenhum gráfico/relatório de despesas além do total simples mostrado na própria tela.

---

## 10. Checklist

**Fluxo real confirmado**:
```
CONFIGURAÇÕES (painel ou WhatsApp)
↓ define: ligado/desligado, horário de envio, itens conferidos
CRON (a cada 15-30 min)
↓ dispara pelo WhatsApp aos motoristas elegíveis, no horário configurado
MOTORISTA RESPONDE pelo WhatsApp
↓ resposta interpretada (OK vira "ok"; qualquer outra coisa vira "atenção", nunca fica ambíguo)
REGISTRO em checklist_dispatches
↓ se "atenção", cria automaticamente um alerta pro(s) owner/admin da empresa
PAINEL (/frota/checklists) mostra tudo em tempo real
```

**Configuração**: não é feita na própria tela de Checklist (que é 100% leitura) — fica em `/frota/configuracoes` (e também no passo 4 do onboarding do painel): ligar/desligar, horário (0-23h Brasília), quais itens conferir (óleo, água, pneus, luzes — lista fixa hoje).

**Elegibilidade automática**: motorista ativo, com veículo e telefone cadastrados, que ainda não recebeu checklist hoje.

**O que o painel mostra**: KPIs do dia (enviados/respondidos/não respondidos/com atenção), filtro de período (hoje/7 dias/30 dias), tabela de **aderência por motorista** (% de respondidos sobre enviados, pior primeiro, badge vermelho abaixo de 70%), histórico expansível por motorista com o texto literal da resposta.

**Relação com WhatsApp/IA**: disparo e resposta são só WhatsApp. Ferramenta `consultar_checklist` (HOJE/ADERÊNCIA_MOTORISTA/ADERÊNCIA_GERAL/OCORRÊNCIAS) usa exatamente as mesmas funções de cálculo do painel — garante que o número que a IA fala é sempre igual ao que o painel mostra. Ferramenta `gerenciar_checklist_config` permite configurar tudo isso pelo WhatsApp também.

---

## 11. Google Calendar / Agenda

**Não existe uma tela de agenda visual no painel** — nenhuma lista de eventos, nenhum calendário renderizado em `/frota/*`. O único ponto de contato do painel com o Google Calendar é uma tela de confirmação depois do fluxo OAuth (conectado com sucesso / erro).

**Conexão**: por link assinado enviado pelo WhatsApp, ou por sessão de navegador já logada — os dois caminhos levam ao login do Google e depois de volta ao Frota IA.

**Isolamento**: confirmado **por empresa**, não por usuário — `google_integrations.company_id`, com índice único garantindo só 1 conexão ativa por empresa no banco. Isso é o que permite o mesmo Calendar "aparecer" tanto quando a pessoa fala pelo WhatsApp quanto quando entra logada no painel, mesmo sendo tecnicamente dois `user_id` diferentes.

**Segurança**: os tokens de acesso nunca ficam nas tabelas do produto — só uma referência ao cofre (Vault) do Supabase.

**Ações disponíveis** (só via IA — WhatsApp, ou o widget de chat do painel): verificar conexão, listar calendários, definir calendário padrão, consultar eventos, criar evento, criar jornada completa (vários eventos de uma vez), alterar, excluir (sempre com confirmação explícita).

**O que é bidirecional**: tudo. Como o Frota IA não guarda uma cópia local dos eventos — toda consulta é feita ao vivo na API do Google — qualquer evento criado direto no Google Calendar pela pessoa aparece quando a IA consulta, e qualquer evento criado pela IA aparece de verdade no Google Calendar real. **O que não existe** é uma visualização própria dentro do painel — pra ver a agenda, hoje só dá via IA (WhatsApp ou o widget de chat).

---

## 12. Radar de Fretes

**O que é**: um filtro automático entre ofertas de carga (recebidas em grupos de WhatsApp autorizados) e o que faz sentido pro veículo/rota do cliente. Nunca é marketplace — não negocia nem contrata frete, só avisa quando encontra algo compatível.

**IMPLEMENTADO HOJE, de ponta a ponta, automático**:
```
Grupo de WhatsApp autorizado (cadastrado como "fonte")
↓ mensagem chega
filtro barato por palavra-chave (sem custo de IA) — descarta o que claramente não é frete
↓ passou no filtro
extração por IA (Claude) — estrutura origem/destino/UF/data/carroceria/peso/valor
↓ 
verificação de duplicata (mesma oferta não vira 2 oportunidades)
↓
matching determinístico contra os radares ativos de TODAS as empresas
(UF bate = elimina; carroceria/data somam pontos, nunca eliminam sozinhas)
↓ match FORTE (score ≥ 70)
notificação automática pelo WhatsApp pro cliente dono do radar
↓
cliente pode pedir "analisa" (pré-análise de custo, reaproveitando as ferramentas de cálculo)
```

**No painel** (`/frota/oportunidades`, `/frota/fretes` para configuração de fontes): criar/pausar/reativar/cancelar radar de busca (origem, destino, veículo opcional), cadastrar/desativar grupos de WhatsApp autorizados (só owner/admin), ver lista de oportunidades com score de compatibilidade, analisar/favoritar/ignorar cada uma.

**Relação com WhatsApp/IA**: ferramentas `gerenciar_radar_frete` e `consultar_oportunidades_frete` fazem exatamente as mesmas operações que o painel, usando os mesmos services — total paridade.

**ROADMAP FUTURO / preparado mas sem uso real hoje**: fontes de mercado tipo Fretebras/Truckpad (o enum já prevê, mas só WhatsApp/grupo funciona hoje); um modo de "análise automática" antes de notificar (a coluna existe no banco com valor padrão "avisar primeiro", mas não há nenhuma tela nem comando que troque isso hoje).

---

## 13. Alertas e Lembretes

**O painel é só leitura neste módulo** — não existe criar, editar ou cancelar alerta pela tela.

**Origem de cada alerta**:
- **Automático** — sincronizado sozinho sempre que uma manutenção ou documento é criado/editado (painel ou WhatsApp), com vencimento marcado (11h Brasília do dia).
- **Checklist "atenção"** — criado automaticamente para os owners/admins da empresa.
- **Manual, pelo WhatsApp** — ferramenta `gerenciar_alerta` (CRIAR/LISTAR/CANCELAR), pra lembrete livre (sem vínculo a manutenção/documento) — ex. "me lembra de renovar o contrato dia 30".

**Disparo**: um job (cron) roda a cada ~5 minutos, busca os alertas vencidos e ainda pendentes, e manda por WhatsApp pra pessoa. Marca como enviado ou falhou. **Não existe confirmação de leitura/recebimento** — só o status de envio.

**O que o painel mostra** (`/frota/alertas`): uma tabela derivada ao vivo (veículos/manutenções/documentos vencidos ou vencendo em 30 dias, com link pra tela de origem) mais uma seção separada listando os lembretes "livres" criados pelo WhatsApp que ainda não dispararam.

---

## 14. Notícias / Informações do setor

**Aparece no painel**, não é só WhatsApp: `/frota/noticias` mostra um toggle (ligar/desligar o recebimento) e o último resumo gerado, com data/hora.

**Fluxo**: opt-in, desligado por padrão (decisão deliberada — risco de banimento por spam no WhatsApp se fosse automático pra todo mundo). Uma vez por dia, se houver ao menos uma empresa com a opção ligada, o sistema gera **um único resumo geral do setor** (não é por empresa) via busca de notícias restrita a fontes de imprensa/entidades do transporte, e manda por WhatsApp pra todas as empresas que ativaram.

**Relação com WhatsApp/IA**: ferramenta `gerenciar_noticias_setor` só liga/desliga a preferência — o envio em si não passa por uma ferramenta de IA, é o cron que dispara.

---

## 15. Relatórios

**Existe uma única tela de relatórios** (não uma central com vários relatórios navegáveis) — `/frota/relatorios`, com **8 blocos agregados**, cada um exibido só se houver dado (nada de bloco vazio):

1. Veículos por tipo
2. Motoristas por status (ativo/inativo)
3. Documentos por tipo (tacógrafo/RNTRC/seguro/licenciamento/CNH/toxicológico)
4. Manutenções por status
5. Despesas por tipo — soma em reais dos últimos 30 dias
6. Jornadas por status
7. Checklists por status + aderência média + 3 piores aderências por motorista
8. Fretes analisados nos últimos 30 dias (contagem)

**Filtros**: nenhum — o período de 30 dias é fixo no código, sem seletor de data/veículo/motorista na tela.

**Exportação em PDF**: real, gerada com a biblioteca `pdf-lib` (texto corrido, sem gráficos), reaproveitando os mesmos 8 blocos. Botão "Baixar PDF" simples. Sem exportação em CSV/Excel.

**Sem IA envolvida na agregação** — é cálculo puro no servidor a partir das mesmas tabelas dos outros módulos.

---

## 16. IA no Painel

**Existe chat de IA embutido no painel** — um widget flutuante ("Pergunte ao Frota IA") presente em **todas** as telas de `/frota/*`, não só uma pergunta genérica: é literalmente **o mesmo motor de IA do WhatsApp** (mesmo endpoint, mesmas ferramentas, mesmo contexto de empresa/veículos/memórias), com suporte a foto (ex. enviar uma nota fiscal ou CRLV pro modelo ler). Depois de uma resposta que grava dado, a tela atualiza sozinha.

**O que entra no contexto de cada conversa** (WhatsApp ou painel, mesma função): perfil do usuário, empresa (e o papel da pessoa nela), preferências, memórias salvas da IA (até 12 mais relevantes), radares de frete ativos — e, quando relevante, o veículo padrão com seu perfil de custo/pneu e vencimentos.

**Ferramentas de IA (35 no total)** — cerca de 12 são cálculo puro (CPK, combustível, margem, jornada, comparação de pneus, piso ANTT etc.) sem tabela própria nem tela equivalente no painel; as demais ~23 leem/escrevem exatamente as mesmas tabelas que os módulos do painel usam (veículos, motoristas, manutenção, documentos, despesas, alertas, rotas, jornadas, radar, empresa, configurações, checklist) — ou seja, qualquer coisa que a IA grava aparece no painel, e vice-versa.

**IA disponível hoje**: tudo o que está listado acima. **Não há IA planejada e não implementada identificada nesta auditoria** além do que já existe.

---

## 17. WhatsApp ↔ Painel — como trabalham juntos

Os dois canais **leem e escrevem exatamente as mesmas tabelas**, através dos mesmos services — não existem duas cópias de dado nem sincronização assíncrona entre eles.

**Exemplo real (WhatsApp → Painel)**:
```
Motorista manda foto do documento pelo WhatsApp
↓ Frota IA lê a data de vencimento na foto (visão do Claude)
↓ grava em vehicle_documents (gerenciar_documento_frota)
↓ o painel, em /frota/documentos, mostra esse documento imediatamente
  (mesma tabela, sem cache, sem espera)
```

**Exemplo real (Painel → WhatsApp/IA)**:
```
Gestor liga o checklist diário em /frota/configuracoes, define horário e itens
↓ grava em company_preferences
↓ o cron de checklist já usa essa configuração no próximo disparo pelo WhatsApp
```

**Módulos com esse compartilhamento pleno**: Veículos, Motoristas, Manutenção, Documentos, Despesas, Alertas, Radar de Fretes, Empresa, Configurações/Checklist config, Notícias (config). **Módulos onde a escrita só acontece pelo WhatsApp** (o painel só lê): Fretes/análises, Jornadas, Rotas, Agenda/Calendar, Checklist (respostas).

---

## 18. Onboarding do Painel (Onboarding Gestão, `/frota-ativacao`)

**Pré-requisitos** (checados antes mesmo de mostrar o wizard): cliente já tem conta pelo WhatsApp (V1) → entitlement de Gestão → Google conectado → Calendar conectado. Se já concluiu antes, nunca reexibe — vai direto pro dashboard.

**Fluxo real — 5 passos**:
1. **"Encontramos sua conta"** — confirma/permite editar o nome da empresa; mostra o **veículo 1, já reaproveitado do onboarding do WhatsApp** (nome, placa, tipo, eixos, carroceria reais — nunca recriado do zero).
2. **Veículos da frota** — mostra os já cadastrados, permite adicionar mais (até o limite de 10), usando o mesmo formulário da tela de Veículos. Opcional além do primeiro.
3. **Motoristas** — opcional, mesmo formulário da tela de Motoristas.
4. **Checklist diário** — opcional: ligar/desligar, horário, itens — salvo imediatamente a cada mudança (mesma configuração usada depois em `/frota/configuracoes`).
5. **Resumo e conclusão** — mostra o que foi feito, botão "Ir para o Dashboard" marca a empresa como onboarding concluído.

Cada etapa já grava direto nas tabelas reais (não existe rascunho separado) — se a pessoa fechar no meio, nada se perde, e ao voltar o sistema reconhece o que já foi feito.

---

## 19. Acesso e Planos

**Individual** — WhatsApp, 1 veículo, sem painel.
**Gestão** (mensal ou anual, mesmo painel/wizard pros dois) — WhatsApp + Painel, até 10 veículos.
**Empresas** — acima de 10 veículos, comercial, sem automação nem painel diferenciado hoje.

**Como o entitlement controla o painel**: o gate de `/frota/layout.tsx` calcula acesso a partir de `subscriptions.fleet_panel_included` (ligado automaticamente quando um pagamento de plano Gestão é aprovado) OU `companies.fleet_panel_enabled` (override manual legado, ainda existe, aditivo). Sem isso, a pessoa nunca chega em nenhuma tela de `/frota/*`.

---

## 20. Segurança e Multiempresa

**Isolamento de dados**: toda tabela de negócio tem RLS baseada em duas funções: `is_company_member(company_id)` (qualquer papel, só leitura) e `has_company_role(company_id, [papéis])` (escrita, restrita por papel). Uma empresa fisicamente não consegue ler dado de outra — a policy do banco bloqueia antes mesmo da query rodar, independente do que a aplicação faça.

**Papéis reais** (`company_members.role`): `owner`, `admin`, `operator`, `viewer`. **Status**: `active`, `invited`, `removed`. Uma pessoa pode pertencer a mais de uma empresa; sempre existe uma marcada como padrão.

**Autenticação**: Supabase Auth via cookies (login Google). **Achado**: existe um comentário no código citando um "middleware.ts" que cuidaria de renovar a sessão — mas **esse arquivo não existe no repositório hoje**; é uma referência desatualizada, não um bug funcional confirmado (sem evidência de sessão quebrando na prática), mas vale registrar como divergência entre comentário e código real.

**Gate de produto** (`/frota/layout.tsx`) é uma camada a mais, separada da RLS — controla se a pessoa vê a tela, mas RLS continua sendo a garantia real de isolamento por baixo.

**Limite de veículos**: sempre derivado do entitlement (nunca de um campo editável), aplicado em 3 camadas (banco, IA, API do painel).

---

## 21. Banco de dados (principais tabelas do painel)

| Tabela | Função |
|---|---|
| `companies` | Empresa atendida pelo Frota IA |
| `company_members` | Vínculo usuário↔empresa com papel |
| `company_preferences` | Preferências por empresa (checklist, notícias, estilo de resposta etc.) |
| `vehicles` | Veículos da frota |
| `vehicle_documents` | Documentos de veículo/motorista |
| `vehicle_cost_profiles` / `vehicle_tire_profiles` | Perfis de custo/pneu por veículo (só WhatsApp) |
| `drivers` | Motoristas |
| `maintenance_schedules` | Manutenções |
| `expenses` | Despesas |
| `checklist_dispatches` | Envios/respostas do checklist diário |
| `scheduled_alerts` | Alertas/lembretes agendados |
| `saved_routes` | Rotas salvas |
| `saved_journeys` | Jornadas salvas |
| `generated_documents` | Histórico de documentos/PDFs gerados pela IA |
| `freight_sources` / `freight_radars` / `freight_opportunities` / `freight_opportunity_matches` | Radar de Fretes (fontes, buscas, oportunidades, cruzamentos) |
| `news_digests` | Resumos de notícias do setor já enviados |
| `subscriptions` | Estado da assinatura da empresa (Mercado Pago) |
| `google_integrations` | Conexão do Google Calendar por empresa |
| `ai_memories` | Memórias da IA |
| `conversations` / `messages` | Histórico de conversa (WhatsApp e widget do painel) |

---

## 22. Fluxo completo do cliente

```
CLIENTE CONTRATA GESTÃO
↓ pagamento confirmado (Mercado Pago)
↓ entitlement liberado automaticamente
↓ login Google
↓ Google Calendar conectado (obrigatório)
↓ Onboarding Gestão (5 passos, /frota-ativacao)
↓ Dashboard
↓ USO DIÁRIO:
   WhatsApp (conversa, fotos, checklist, alertas)
     + Painel (Veículos, Motoristas, Manutenção, Documentos,
       Despesas, Radar de Fretes, Relatórios, Configurações)
     + Widget de IA (disponível em qualquer tela do painel)
     + Alertas automáticos (vencimentos, checklist com problema)
```

---

## 23. O que o Painel NÃO faz (hoje)

- Não tem tela de agenda/Calendar visual (só confirmação de conexão).
- Não permite excluir veículo, motorista, manutenção ou documento (só ativar/desativar; exclusão só existe em Despesas).
- Não tem upload de arquivo/foto persistido em Documentos (só metadados; a leitura de foto é feita na hora, pelo WhatsApp, sem guardar a imagem).
- Não tem formulário de simulação de frete, jornada ou rota — essas telas são só histórico do que já foi calculado/salvo pelo WhatsApp.
- Não tem filtros de data/veículo nos Relatórios (período fixo de 30 dias).
- Não permite criar, editar ou cancelar um alerta diretamente (só lê o que já existe).
- Não automatiza o Plano Empresas (mais de 10 veículos) — venda comercial direta, sem tela própria.
- Não busca ofertas de frete fora de grupos de WhatsApp cadastrados (Fretebras/Truckpad etc. estão previstos no schema, sem uso real).

---

## 24. Pendências reais

### Bloqueadores
Nenhum bloqueador conhecido no funcionamento atual do painel.

### Importantes
1. **Rotas (`/frota/rotas`) é só leitura apesar de a RLS já permitir escrita via sessão do navegador** — é uma lacuna de UI (o banco já suporta cadastrar/editar rota pelo painel; a tela ainda não foi construída), não uma limitação de segurança.
2. **Referência a `middleware.ts` no comentário de `src/lib/supabase/server.ts`, mas o arquivo não existe no repositório** — divergência entre comentário e código real; sem evidência de problema funcional, mas vale corrigir o comentário ou avaliar se um middleware de refresh de sessão deveria existir.
3. **Vários campos de `company_preferences` existem no banco e são aceitos pela validação, mas nenhuma tela nem ferramenta de IA os grava hoje**: veículo padrão, combustível/preço padrão, velocidade média padrão, margem alvo padrão, moeda, unidade de distância, preferências de memória (perguntar antes de salvar, permitir automática), permitir histórico de análise/ferramenta, modo de análise automática do Radar. São colunas "prontas" sem funcionalidade de produto ligada ainda.
4. **`freight_radar_analysis_mode`** (modo de pré-análise automática do Radar de Fretes) tem coluna e valor padrão no banco, mas nenhuma tela ou comando de WhatsApp permite trocá-lo hoje.

### Melhorias
1. Documentos sem upload/armazenamento real de arquivo — hoje só metadados.
2. Manutenção sem controle de quilometragem/custo — só data.
3. Sem confirmação de leitura/recebimento nos alertas enviados por WhatsApp.
4. Radar de Fretes: fontes externas (Fretebras/Truckpad) previstas no schema, sem integração real.

### Roadmap futuro (não confundir com pendência atual)
Itens de V3 já conhecidos em `docs/v2-gestao-de-frota-roadmap.md`, fora do escopo desta versão: telemetria, rastreadores, TMS, ERP, pneus avançados, integrações maiores.

---

## 25. Quantidade de áreas/módulos encontrados

**17 áreas/telas reais** em `/frota/*` (Dashboard, Veículos, Motoristas, Manutenção, Documentos, Despesas, Checklist, Alertas, Notícias, Oportunidades/Radar, Relatórios, Fretes, Jornadas, Rotas, Empresa, Configurações) + o widget de IA presente em todas elas + o wizard de onboarding (`/frota-ativacao`, fora da árvore de `/frota` por design).
