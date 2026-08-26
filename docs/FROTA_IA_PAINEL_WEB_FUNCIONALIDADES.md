# FROTA IA
## PAINEL WEB — FUNCIONALIDADES E FLUXO OPERACIONAL

### Raio-X funcional da versão atual

**Data:** 24/08/2026 (atualizado após a Rodada 1 de evolução funcional — ver seção 26)
**Branch:** `claude/frota-ia-assistente-setup-qlrbac`
**Commit:** `c109e2b`

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
├── Dashboard        — indicadores e alertas, read-only por design
├── Veículos         — CRUD (sem exclusão real, só ativar/desativar)
├── Motoristas        — CRUD (sem exclusão real, só ativar/desativar)
├── Manutenção        — criar/editar (km e/ou data, custo vira despesa vinculada; sem exclusão)
├── Documentos         — criar/editar/anexar arquivo real (PDF/JPG/PNG, sem exclusão do registro)
├── Documentos gerados   — histórico de PDFs gerados pela IA, visualizar/baixar (novo, 26/08/2026)
├── Despesas         — CRUD completo (único módulo com exclusão real)
├── Checklist          — read-only por design (configuração fica em Configurações; resposta é via WhatsApp)
├── Agenda            — CRUD real quando Google conectado; conexão agora é CONTEXTUAL, não bloqueia o resto do painel (26/08/2026)
├── Alertas            — CRUD real (manuais); alertas automáticos (manutenção/documento) só editáveis pela origem
├── Notícias do setor    — toggle + leitura do último resumo
├── Radar de Fretes (Fretes/Oportunidades) — CRUD completo
├── Relatórios          — leitura + filtros reais (período/veículo/motorista) + exportação em PDF
├── Fretes (análises)    — read-only por design (histórico de análises do WhatsApp)
├── Jornadas          — read-only por enquanto (jornada só é salva via WhatsApp hoje)
├── Rotas             — CRUD real (antes só leitura)
├── Empresa            — editar dados cadastrais (nunca gestão de membros — ver seção 20)
└── Configurações       — estilo de resposta da IA, memória da IA, config de checklist
```

Agenda visual existe desde a Rodada 1 de evolução funcional (24/08/2026) — ver seção 11. Um widget de chat de IA (`FrotaAiWidget`) fica disponível em **todas** as telas acima (ver seção 16). Classificação completa e atualizada de cada módulo (com a distinção entre "read-only por design" e "limitação real") está na seção 28.

---

## 3. Tabela-resumo por área

| Área | Status |
|---|---|
| Dashboard | IMPLEMENTADO E FUNCIONAL (só leitura) |
| Veículos | IMPLEMENTADO E FUNCIONAL (exclusão real não existe, por design) |
| Motoristas | IMPLEMENTADO E FUNCIONAL (exclusão real não existe, por design) |
| Manutenção | IMPLEMENTADO E FUNCIONAL (km e/ou data, custo vira despesa vinculada — desde 24/08/2026) |
| Documentos | IMPLEMENTADO E FUNCIONAL (upload real via Supabase Storage — desde 24/08/2026) |
| Despesas | IMPLEMENTADO E FUNCIONAL |
| Checklist (painel) | IMPLEMENTADO E FUNCIONAL (só leitura, por design) |
| Agenda (Google Calendar) | IMPLEMENTADO E FUNCIONAL (Lista + Mês, CRUD real — desde 24/08/2026) |
| Alertas (painel) | IMPLEMENTADO PARCIALMENTE (só leitura, sem criar/cancelar pelo painel — fora do escopo da Rodada 1) |
| Notícias do setor | IMPLEMENTADO E FUNCIONAL (toggle + leitura) |
| Radar de Fretes | IMPLEMENTADO E FUNCIONAL |
| Relatórios | IMPLEMENTADO E FUNCIONAL (filtros reais de período/veículo/motorista — desde 24/08/2026) |
| Fretes (análises) | INTERFACE EXISTENTE MAS SÓ LEITURA (cálculo é só WhatsApp — fora do escopo da Rodada 1) |
| Jornadas | INTERFACE EXISTENTE MAS SÓ LEITURA (RLS nem permite escrita via painel — fora do escopo da Rodada 1) |
| Rotas | IMPLEMENTADO E FUNCIONAL (CRUD real — desde 24/08/2026, antes só leitura) |
| Empresa | IMPLEMENTADO E FUNCIONAL |
| Configurações | IMPLEMENTADO E FUNCIONAL nos campos com efeito real confirmado (estilo de resposta, memória da IA, checklist); campos sem consumidor real permanecem deliberadamente fora da UI (ver seção 24) |
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

**Campos reais** (tabela `maintenance_schedules`): tipo (texto livre, não é enum fixo), veículo, data de vencimento, status (pendente/agendado/concluído/cancelado), observações — e, desde 24/08/2026: **data de execução**, **km de execução** e **próxima manutenção em km** (3 colunas novas, todas opcionais/nulas — manutenção antiga sem esses dados continua válida).

**Controle por data e/ou km**: o cliente pode registrar só data, só km, ou os dois — nada é obrigatório além do que já existia. **Km é sempre informado pelo cliente, nunca lido de telemetria/odômetro automático** — o sistema não finge monitoramento que não existe; "próxima em X km" é só informativo no painel/WhatsApp, não gera alerta sozinho (só o alerta por data continua existindo).

**Custo vira despesa, nunca duplica**: ao concluir uma manutenção (status = concluído), informar um custo cria — ou, se editar de novo, **atualiza** — uma única despesa (categoria "manutenção") vinculada pela nova coluna `expenses.maintenance_schedule_id` (índice único parcial no banco garante no máximo 1 despesa por manutenção). O valor nunca é gravado duas vezes (não existe coluna de custo em `maintenance_schedules`) — a tela de Manutenção só **exibe** o valor lendo a despesa vinculada, a fonte real continua sendo `expenses`. Se a despesa vinculada for excluída (pela tela de Despesas), a manutenção volta a mostrar "sem custo" — informar de novo cria uma nova despesa.

**Ações na tela**: cadastrar, editar (inclusive marcar como concluída/cancelada trocando o status, e informar km/data de execução/custo ao concluir). Sem exclusão, sem filtro.

**Alerta automático**: sim — toda criação/atualização sincroniza uma linha em `scheduled_alerts` (nunca duplica), que dispara automaticamente às 11h (horário de Brasília) do dia do vencimento (por data, não por km), via WhatsApp. Se a manutenção for concluída/cancelada, o alerta pendente é cancelado junto.

**Relação com WhatsApp**: ferramenta `gerenciar_manutencao` (CRIAR/LISTAR/ATUALIZAR/CONCLUIR/CANCELAR) ganhou os mesmos campos novos (km de execução, próxima km — calculada automaticamente se o cliente informar um intervalo, ex. "de 10 em 10 mil km" —, data de execução, custo). Mesma tabela e mesmo mecanismo de alerta/despesa — painel e WhatsApp sempre sincronizados. Exemplo real: *"Troquei o óleo da Scania hoje com 250 mil km, custou R$1.200"* já registra manutenção concluída, km, custo e cria a despesa, sem inventar nenhum dado que o cliente não informou.

---

## 8. Documentos

**Rota**: `/frota/documentos` (`DocumentosClient.tsx` + `DocumentFormModal.tsx`). **API**: `GET`/`POST /api/frota/documentos`, `PATCH .../[id]` (metadados) + `POST`/`GET`/`DELETE /api/frota/documentos/[id]/arquivo` (arquivo, novo desde 24/08/2026). Sem exclusão do **registro** do documento (mesmo padrão dos outros módulos) — mas o **arquivo** anexado pode ser removido separadamente ("remover arquivo" ≠ "remover documento").

**Tipos de documento** (enum real): tacógrafo, RNTRC, seguro, licenciamento (vinculados a veículo) e CNH, exame toxicológico (vinculados a motorista) — cada documento pertence a exatamente um veículo OU um motorista, nunca aos dois.

**Campos**: tipo, dono (veículo ou motorista, conforme o tipo), data de vencimento (opcional), observações — e, desde 24/08/2026: `storage_path`, `original_filename`, `mime_type`, `file_size`, `uploaded_at` (todos nulos até um arquivo ser anexado; documento antigo sem arquivo continua totalmente válido).

**Upload real de arquivo (24/08/2026)** — primeiro uso de Supabase Storage no projeto inteiro: bucket **privado** `vehicle-documents` (sem nenhuma policy pública), caminho sempre `company_id/documents/vehicle|driver/entity_id/timestamp-arquivo` (nome sanitizado, nunca confia no nome original pra segurança). Aceita PDF, JPG e PNG, até 10MB. Visualizar/baixar geram uma **URL assinada de 60 segundos** (nunca um link permanente) via client admin — o navegador nunca recebe o `storage_path` bruto. Cadastrar um documento novo mantém o modal aberto pra permitir anexar o arquivo na mesma ação; documento existente permite ver/baixar/substituir/remover o arquivo diretamente.

**Leitura por IA/foto (WhatsApp) — limitação documentada, não resolvida nesta rodada**: a ferramenta de IA `gerenciar_documento_frota` continua só extraindo os DADOS da foto (tipo, dono, vencimento) — usa a visão nativa do Claude, sem OCR separado — mas **nunca persiste o arquivo em si**. A foto recebida pelo WhatsApp passa só em memória (base64, direto pra chamada da Claude API) e é descartada depois; ligar o WhatsApp ao mesmo Storage do painel exigiria um pipeline novo (baixar a mídia do webhook e fazer upload), não implementado nesta rodada. Upload real hoje é exclusivo do painel.

**Alerta automático**: mesmo mecanismo de Manutenção — sincroniza `scheduled_alerts`, dispara às 11h do dia do vencimento.

**Relação com WhatsApp**: ferramenta `gerenciar_documento_frota` (CRIAR/LISTAR/ATUALIZAR), mesma tabela — os metadados sempre sincronizados; o arquivo em si é só painel (ver limitação acima).

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

**Existe tela de agenda visual desde 24/08/2026** — `/frota/agenda` (`AgendaClient.tsx` + `EventFormModal.tsx`), com 2 visualizações: **Lista** (próximos 30 dias, agrupada por dia) e **Mês** (grade simples, navega entre meses buscando sob demanda). Não recria o Google Calendar inteiro (sem lib de calendário nova, sem drag-and-drop, sem múltiplos calendários simultâneos na tela).

**Fonte de verdade continua sendo só o Google** — a tela NÃO lê de uma tabela própria do Frota IA, consulta a API do Google ao vivo a cada carregamento/navegação de mês. Nenhuma tabela nova, nenhum evento copiado pro banco.

**Conexão**: por link assinado enviado pelo WhatsApp, ou por sessão de navegador já logada — os dois caminhos levam ao login do Google e depois de volta ao Frota IA. O gate de `/frota/layout.tsx` já garante Calendar conectado antes de deixar chegar em `/frota/agenda` (redireciona pra `/frota-conectar-agenda` senão).

**Isolamento**: confirmado **por empresa**, não por usuário — `google_integrations.company_id`, com índice único garantindo só 1 conexão ativa por empresa no banco. Isso é o que permite o mesmo Calendar "aparecer" tanto quando a pessoa fala pelo WhatsApp quanto quando entra logada no painel, mesmo sendo tecnicamente dois `user_id` diferentes.

**Segurança**: os tokens de acesso nunca ficam nas tabelas do produto — só uma referência ao cofre (Vault) do Supabase.

**Ações disponíveis no painel**: criar, editar, excluir (sempre com diálogo de confirmação explícito na tela — mesma exigência de confirmação que a ferramenta de IA já tinha, só que a confirmação acontece na UI em vez de um parâmetro) e visualizar (Lista/Mês). **Ações que continuam só via IA** (WhatsApp ou o widget do painel): verificar conexão, listar/definir calendário padrão, criar jornada completa (vários eventos de uma vez), busca por texto — o painel usa sempre o calendário padrão, sem seletor de múltiplos calendários (mantém a tela simples).

**Bidirecional de verdade, confirmado nos dois sentidos**: evento criado no painel aparece imediatamente quando a IA consulta pelo WhatsApp, e evento criado direto no Google (ou pela IA) aparece na tela ao recarregar/navegar — porque os dois caminhos leem/escrevem a mesma API do Google, reaproveitando literalmente os mesmos services (`listUpcomingEvents`/`createEvent`/`updateEvent`/`deleteEvent` de `googleCalendarService.ts`) que `gerenciar_google_calendar` já usava.

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

**No painel** (`/frota/oportunidades`, `/frota/fretes` para configuração de fontes): criar/pausar/reativar/cancelar radar de busca (origem, destino, veículo opcional), cadastrar/desativar grupos de WhatsApp autorizados (só owner/admin), ver lista de oportunidades com score de compatibilidade e o **porquê** desse score em linguagem simples (origem/destino/carroceria/data confirmados ou não), analisar/favoritar/ignorar cada uma. Ao pedir "Analisar", o resultado (custo/margem estimados, quando houver dado suficiente) aparece direto no card, sem precisar abrir o WhatsApp.

**Relação com WhatsApp/IA**: ferramentas `gerenciar_radar_frete` e `consultar_oportunidades_frete` fazem exatamente as mesmas operações que o painel, usando os mesmos services — total paridade. A ação "Analisar" do painel chama a mesma `analisarOportunidadeParaMatch` usada pelo motor automático — nunca um segundo cálculo.

**IMPLEMENTADO NA RODADA 2 (24/08/2026)**: preferência "Como quer receber oportunidades?" (`freight_radar_analysis_mode`, coluna que já existia mas era travada — hoje é gravável pelo painel, em `/frota/oportunidades`, sem nunca expor o nome técnico do campo ao usuário):
- **Avisar primeiro** (padrão): aviso simples no WhatsApp assim que aparece um match forte (score ≥ 70), pedindo confirmação pra análise completa.
- **Analisar antes de avisar**: o Frota IA já tenta uma pré-análise (só custo de combustível, rotulada como preliminar) antes de notificar; se conseguir calcular, manda custo/margem estimados junto do aviso; se não tiver dado suficiente (veículo sem consumo médio ou sem preço de combustível cadastrado), o aviso explica isso em vez de inventar um número.
- Corrigido nesta rodada um bug em que essa explicação de "dado insuficiente" nunca aparecia (a condição comparava o resultado, não se a tentativa tinha sido feita) — coberto por teste de regressão.

**ROADMAP FUTURO / nunca fingido como funcional hoje**: fontes de mercado tipo Fretebras/Truckpad (o enum já prevê a coluna, mas nenhuma tela ou integração real existe — a tela de Fontes deixa isso explícito) — sem scraping, sem automação de navegador, sem acesso não autorizado a essas plataformas.

---

## 13. Alertas e Lembretes

**IMPLEMENTADO NA RODADA 2 (24/08/2026)**: o painel virou um módulo operacional real — criar, editar e cancelar alertas manuais em `/frota/alertas`, usando a MESMA tabela (`scheduled_alerts`) e os mesmos services que o WhatsApp já usava (`gerenciar_alerta`). Nenhum sistema paralelo foi criado.

**Origem de cada alerta** (mostrada com selo na tela, calculada só pela presença de FK — nunca por texto livre):
- **Automático (manutenção)** — sincronizado sozinho sempre que uma manutenção é criada/editada, com vencimento marcado (11h Brasília do dia). **Não editável nem cancelável pelo painel** — editar redireciona pra tela de Manutenção, que é a fonte real.
- **Automático (documento)** — mesma lógica, a partir de Documentos.
- **Checklist "atenção"** — criado automaticamente para os owners/admins da empresa.
- **Manual** — criado pelo WhatsApp (`gerenciar_alerta`) OU agora pelo painel — os dois editáveis/canceláveis livremente, sempre que ainda estiverem `pending`.

**Proteção contra dessincronização**: reforçada em dois níveis — RLS (as policies de escrita exigem `maintenance_schedule_id` e `vehicle_document_id` nulos) e a API (`409` explicando que o alerta é controlado automaticamente). Cancelamento é sempre soft (`status = cancelled`), nunca exclusão física.

**Disparo**: continua o mesmo job (cron) a cada ~5 minutos, busca os alertas vencidos e ainda pendentes, manda por WhatsApp e marca como enviado ou falhou.

**Confirmação de leitura/entrega**: auditado nesta rodada — **confirmado que não existe**. O webhook do Z-API ignora explicitamente os callbacks de status de mensagem; o sistema só sabe se *tentou* enviar, nunca se a pessoa recebeu ou leu. Documentado aqui de propósito, pra não ser reintroduzido como funcionalidade fake depois.

**O que o painel mostra** (`/frota/alertas`): cards agrupados por Atrasados/Hoje/Próximos/Histórico, com filtro por status/origem/veículo, e badge de origem em cada card. Substituiu a antiga tabela derivada (`computeFleetAlerts`) — que continua existindo só para o Dashboard, sem mudança lá.

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

**Filtros reais desde 24/08/2026** — via query params (`?period=&from=&to=&vehicleId=&driverId=`), compartilháveis/recarregáveis: **período** (últimos 7/30/90 dias, mês atual, mês anterior, personalizado), **veículo** e **motorista**. O filtro só reduz um bloco onde a relação genuinamente existe em cada tabela — ex.: despesas não tem `driver_id`, então filtrar por motorista nunca esconde/falsifica o bloco de despesas; documento sem vencimento nunca é excluído por filtro de período. Um cabeçalho gerencial simples (período/veículo/motorista selecionados + totais de despesas/manutenções/documentos/checklists/fretes) aparece acima dos 8 blocos.

**Exportação em PDF**: real, gerada com a biblioteca `pdf-lib` (texto corrido, sem gráficos), reaproveitando os mesmos 8 blocos — e os MESMOS filtros da tela (o botão "Baixar PDF" sempre carrega a querystring atual, então o PDF nunca diverge do que está sendo exibido). Mostra "Período:", "Veículo:" e "Motorista:" no cabeçalho quando aplicável. Sem exportação em CSV/Excel, sem gráfico (só dados claros, conforme decisão explícita de não instalar biblioteca pesada só pra isso).

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

**Módulos com esse compartilhamento pleno**: Veículos, Motoristas, Manutenção (agora incluindo km/custo), Documentos (metadados), Despesas, Agenda/Calendar (desde 24/08/2026), Rotas (desde 24/08/2026), Alertas, Radar de Fretes, Empresa, Configurações/Checklist config/memória da IA, Notícias (config). **Módulos onde a escrita continua só pelo WhatsApp** (o painel só lê): Fretes/análises, Jornadas, Checklist (respostas), e o **arquivo** de Documentos (o registro/metadado é compartilhado, o binário em si é só painel — ver seção 8).

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

**Storage**: bucket privado `vehicle-documents` (Supabase Storage, desde 24/08/2026) — primeiro uso de Storage no projeto, guarda os arquivos anexados em Documentos. Sem policy pública nenhuma; todo acesso passa pelo client admin do servidor, nunca direto do navegador.

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

- Não permite excluir veículo, motorista, manutenção ou documento (só ativar/desativar; exclusão real só existe em Despesas e, desde 24/08/2026, no arquivo anexado a um Documento — o registro do documento em si continua sem exclusão).
- Não tem formulário de simulação de frete ou jornada — essas telas continuam só histórico do que já foi calculado/salvo pelo WhatsApp (Rotas deixou de estar nessa lista em 24/08/2026, agora tem CRUD real no painel).
- Não permite criar, editar ou cancelar um alerta diretamente pelo painel (só lê o que já existe) — fora do escopo da Rodada 1 de evolução funcional.
- Não automatiza o Plano Empresas (mais de 10 veículos) — venda comercial direta, sem tela própria.
- Não busca ofertas de frete fora de grupos de WhatsApp cadastrados (Fretebras/Truckpad etc. estão previstos no schema, sem uso real) — deliberadamente fora do escopo da Rodada 1.
- WhatsApp continua sem persistir o arquivo de um documento (só o metadado) — ver limitação documentada na seção 8.

---

## 24. Pendências reais

### Bloqueadores
Nenhum bloqueador conhecido no funcionamento atual do painel.

### Importantes
1. **Referência a `middleware.ts` no comentário de `src/lib/supabase/server.ts`, mas o arquivo não existe no repositório** — divergência entre comentário e código real; sem evidência de problema funcional, mas vale corrigir o comentário ou avaliar se um middleware de refresh de sessão deveria existir. (Não resolvida na Rodada 1 — fora do escopo pedido.)
2. **Vários campos de `company_preferences` continuam sem UI, deliberadamente** (confirmado nesta rodada que nenhum tem consumidor real): veículo padrão (`default_vehicle_id` — o mecanismo real é `vehicles.is_default`, campo morto), combustível/preço padrão, velocidade média padrão, margem alvo padrão, moeda, unidade de distância, permitir histórico de análise/ferramenta. `askBeforeSavingMemory`/`allowAutomaticMemory` **saíram desta lista em 24/08/2026** — agora expostos em Configurações.
3. **`freight_radar_analysis_mode`** (modo de pré-análise automática do Radar de Fretes) tem coluna e valor padrão no banco e efeito real confirmado em `radarMatchingEngine.ts`, mas nenhuma tela ou comando de WhatsApp permite trocá-lo — **deliberadamente adiado pra próxima rodada** (fora do escopo da Rodada 1, item explicitamente listado como "não fazer nesta rodada").

### Melhorias
1. Sem confirmação de leitura/recebimento nos alertas enviados por WhatsApp.
2. Radar de Fretes: fontes externas (Fretebras/Truckpad) previstas no schema, sem integração real — próxima rodada.
3. Agenda do painel usa sempre o calendário padrão da empresa — sem seletor de múltiplos calendários na tela (só via IA).
4. WhatsApp não persiste o arquivo de um documento enviado por foto (só o dado extraído) — upload real de arquivo é exclusivo do painel.

### Roadmap futuro (não confundir com pendência atual)
Itens de V3 já conhecidos em `docs/v2-gestao-de-frota-roadmap.md`, fora do escopo desta versão: telemetria, rastreadores, TMS, ERP, pneus avançados, integrações maiores.

---

## 25. Quantidade de áreas/módulos encontrados

**18 áreas/telas reais** em `/frota/*` (Dashboard, Veículos, Motoristas, Manutenção, Documentos, Despesas, Checklist, Agenda, Alertas, Notícias, Oportunidades/Radar, Relatórios, Fretes, Jornadas, Rotas, Empresa, Configurações) + o widget de IA presente em todas elas + o wizard de onboarding (`/frota-ativacao`, fora da árvore de `/frota` por design).

---

## 26. Rodada 1 de evolução funcional (24/08/2026)

Depois deste raio-X (23/08/2026) ter identificado os módulos parciais, uma rodada de evolução funcional resolveu 5 das limitações encontradas (commits `7e6a67f`, `f92ba17`, `1d976e4`, `dd7d24c`, `dc580ce`, `c109e2b`):

1. **Manutenção** — km e/ou data, custo vira despesa vinculada sem duplicar (ver seção 7).
2. **Documentos** — upload real de arquivo via Supabase Storage, bucket privado (ver seção 8).
3. **Relatórios** — filtros reais de período/veículo/motorista, compartilháveis via URL (ver seção 15).
4. **Agenda** — tela visual nova (Lista + Mês), Google Calendar como fonte única (ver seção 11).
5. **Rotas** — CRUD real no painel, antes só leitura (ver seção 17).
6. **Configurações** — memória da IA (perguntar antes de salvar / guardar automaticamente) exposta, único par de campos de `company_preferences` com efeito real confirmado que ainda não tinha UI.

Nenhuma migration destrutiva — todas aditivas (colunas novas nullable, 1 bucket de Storage novo). Nenhum dado antigo invalidado. `freight_radar_analysis_mode`, evolução de Alertas, confirmação de leitura e integração Fretebras/Truckpad ficaram deliberadamente de fora, para uma próxima rodada.

---

## 27. Rodada 2 de evolução funcional (24/08/2026) — Alertas + Radar de Fretes

Segunda rodada, focada nas duas lacunas deixadas de fora da Rodada 1 (commit `11c076c` para Alertas; Radar de Fretes nesta mesma leva).

**Alertas** (ver seção 13 atualizada): virou módulo operacional real — criar/editar/cancelar pelo painel, mesma tabela/services do WhatsApp, nunca um segundo sistema. Origem automática (manutenção/documento) protegida em dois níveis (RLS + API, `409`), sempre redirecionando pra tela de origem em vez de permitir edição direta. Confirmado por auditoria que **não existe confirmação de leitura/entrega** no WhatsApp hoje — documentado como ausência real, não implementado nada fake pra cobrir isso.

**Radar de Fretes** (ver seção 12 atualizada): `freight_radar_analysis_mode` — que já tinha lógica de leitura pronta mas era impossível de mudar por qualquer superfície — agora é gravável pelo painel (`/frota/oportunidades`), sempre em linguagem simples ("Avisar primeiro" / "Analisar antes de avisar"), nunca expondo o nome do campo. A pré-análise automática do modo "Analisar antes" foi corrigida: antes calculava o resultado mas nunca refletia isso na notificação; agora a mensagem muda de verdade quando há custo/margem real, e explica quando não há dado suficiente (nunca inventa número). Nesse processo foi encontrado e corrigido um bug onde essa explicação de "dado insuficiente" nunca aparecia (condição invertida). A ação "Analisar" do painel passou a mostrar o resultado (ou a ausência dele) direto no card, e cada oportunidade ganhou a explicação em linguagem simples do porquê do score (mesmos dados da função de matching, nunca um texto inventado). A tela de Fontes deixa explícito que hoje só WhatsApp funciona — Fretebras/Truckpad continuam roadmap, sem scraping nem integração fake.

Migration nova: nenhuma (a coluna `freight_radar_analysis_mode` já existia desde a v1 do Radar — só destravamos a escrita). Nenhuma migration destrutiva. Regressão completa (388 testes, typecheck, lint, build) rodada depois das duas partes, sem quebrar nenhum módulo anterior.

---

## 28. Rodada 3 de evolução funcional (26/08/2026) — Fechamento de onboarding, planos e coerência

Terceira rodada — correções pontuais e fechamento de coerência entre Onboarding V1, dados do cliente, troca de plano no Mercado Pago e classificação do Painel. Sem mudança de preço, sem redesenho, sem nova arquitetura, sem alterar Radar/Alertas/infraestrutura desta vez.

### 28.1 — Onboarding V1: loop de configuração de veículo corrigido

Achado real e crítico: a opção **"Outro / não sei"** já existia na lista nativa da etapa de configuração do veículo e no enum do banco (`vehicle_type='outro'`), mas o classificador (`vehicleConfigClassifier.ts`) nunca fazia essa ponte — quem tocava "Outro" caía direto em "não reconhecido" e ficava **preso repetindo a mesma pergunta pra sempre**, exatamente quem mais precisava dessa saída. Corrigido: reconhece "outro"/"não sei"/sinônimos e resolve na hora (`vehicleType: "outro"`). Reforçado com uma rede de segurança final — depois de 2 tentativas não reconhecidas (principal ou na desambiguação cavalo/carreta), a 3ª resposta qualquer força avanço com `vehicleType="outro"` (ou "cavalo mecânico" com eixos indefinidos, na desambiguação). **O onboarding nunca mais trava indefinidamente**, mesmo pra texto totalmente sem sentido. 11 testes novos de regressão.

### 28.2 — Nome do cliente/empresa: coerência sem pergunta nova

A pergunta "Como posso chamar você?" gravava só em `companies.name` — `profiles.full_name` (coluna que já existia, usada por `gerar_documento` como "nome da pessoa") ficava sempre vazia pra conta criada via WhatsApp. Corrigido: a mesma resposta agora grava nos dois lugares (`finalizeOnboarding.ts`), sem pergunta adicional — funciona tanto pro autônomo (nome = identidade da operação) quanto pra transportadora (nome de quem respondeu, distinto do nome da empresa).

### 28.3 — Marca/modelo/ano do veículo, estruturados sem pergunta nova

`vehicles.brand`/`model`/`model_year` já existiam no schema desde a criação da tabela, mas o onboarding sempre gravava o texto livre ("Scania R450 2022") só em `name`/`notes`, deixando essas 3 colunas vazias — o mesmo veículo aparecia sem marca/modelo no Painel (`/frota/veiculos`) mesmo o cliente já tendo informado isso. Corrigido com um parser determinístico novo (`vehicleDescriptionParser.ts`, sem IA — mesmo espírito do classificador de configuração): só preenche marca/modelo/ano quando reconhece uma marca de fabricante conhecida com confiança (lista fechada, fronteira de palavra pra nunca casar "Fordson" com "Ford") — fora isso, nunca inventa, e o texto bruto continua sempre salvo em `name`/`notes` como já era. 12 testes cobrindo casos com/sem marca reconhecida.

### 28.4 — Intenção inicial passa a ser lembrada

"O que você quer resolver primeiro?" era usada só pra personalizar a mensagem de conclusão do onboarding e descartada — a IA nunca mais "sabia" disso depois. Agora vira uma memória de perfil (`ai_memories`, `memory_type="profile"`, `key="initial_intent"`) — contexto disponível pra IA depois, nunca um filtro rígido do que ela pode fazer. "Ver tudo" (sem intenção específica) nunca vira memória.

### 28.5 — Região de atuação vira dado estrutural

Achado real: `region` (Norte/Nordeste/Sudeste/Sul/etc.) ficava só em `ai_memories`, ordenada por `updated_at desc` com limite de 12 no prompt — como a região é gravada uma única vez no onboarding e nunca mais tocada, o `updated_at` dela ficava "congelado", e ela podia sair do contexto da IA assim que a empresa acumulasse 12+ memórias mais recentes de qualquer tipo. Corrigido: migration aditiva `company_preferences.operating_region` (nullable) — mesmo padrão de cidade-base (`companies.city/state`, que também é estrutural). A IA nunca mais "esquece" a região por causa de memórias mais novas; o system prompt foi ajustado pra injetar esse dado explicitamente (senão a IA nunca veria o campo).

### 28.6 — Mercado Pago: cobrança dupla na troca de plano corrigida (achado crítico)

A auditoria confirmou um risco real e grave: **nenhum código cancelava a assinatura recorrente anterior no Mercado Pago ao trocar de plano** (ex.: Individual → Gestão Mensal) — o `mercadopago_subscription_id` antigo era sobrescrito pelo novo antes de qualquer cancelamento ser possível, e a assinatura antiga continuava cobrando pra sempre, sem jeito de rastrear o ID depois. Corrigido no webhook (`/api/payments/mercadopago/webhook`): captura o preapproval anterior ANTES de sobrescrever, confirma a nova assinatura ativa no banco primeiro (cliente nunca fica sem acesso entre as duas etapas), e só depois cancela a anterior via `PUT /v1/preapproval/{id}` (`status: "cancelled"` — API real confirmada na documentação oficial do Mercado Pago). Nunca cancela a própria assinatura reportando mudança de status nela mesma (compara os IDs). Best-effort: falha no cancelamento nunca desfaz a ativação da nova, fica registrada pra intervenção manual. 10 cenários de teste cobrindo os 6 fluxos de troca pedidos (Individual→Gestão Mensal, Individual→Anual cartão/Pix, Gestão Mensal→Anual, renovação de anual expirado, cliente novo) mais idempotência e falha isolada.

### 28.7 — Plano anual vencido vira `EXPIRADA` de verdade

Achado: um plano anual vencido ficava com `status="ATIVA"` e `valido_ate` no passado pra sempre — o gate (`isAccessAllowed`) já bloqueava certo comparando a data, mas o status em si nunca refletia isso. Corrigido de forma **reativa** (sem cron novo, conforme pedido): `getSubscription` agora corrige o status pra `EXPIRADA` na primeira leitura depois do vencimento (compare-and-swap simples, nunca sobrescreve uma renovação concorrente). Nunca mexe em plano recorrente (`valido_ate=null` continua o estado normal de um `ATIVA` recorrente). Se o cliente renovar depois, o webhook volta a gravar `ATIVA` normalmente.

### 28.8 — Confirmado: regra 1 cliente = 1 telefone = 1 conta

Auditoria confirmou que **não existe hoje nenhum caminho alcançável pelo cliente** (painel ou IA) pra convidar um segundo humano ou vincular um segundo telefone à mesma empresa:
- `inviteMember` (convite de membro) existe no código mas **nunca é chamado** por nenhuma rota/ferramenta — infraestrutura morta.
- `/auth/whatsapp/connect` (vincular um 2º telefone a uma conta já existente) também existe, mas o gerador do link que o aciona (`buildWhatsappConnectLink`) **nunca é chamado** por nada — órfão.
- `vincular_painel` (a única ferramenta ativa de vínculo de identidade) faz algo diferente: liga o login Google do painel à MESMA pessoa que já usa o WhatsApp (mesmo `user_id` numa segunda linha de `company_members` como owner) — nunca cria um segundo usuário humano.
- `/frota/empresa` não tem nem nunca teve tela de "membros" — só edita dados cadastrais.

A estrutura `company_members`/roles continua existindo internamente (necessária pro próprio vínculo WhatsApp↔Painel), **não foi removida**, só confirmado que não é oferecida ao cliente hoje.

### 28.9 — Google Calendar deixa de ser requisito global do Painel

Achado: o gate de `src/app/frota/layout.tsx` exigia Google Calendar conectado antes de liberar **qualquer** tela do painel — mas só a tela Agenda de fato usa Calendar (Rotas usa Google Maps, API key separada, sem OAuth). Ou seja, 15 das 17 telas do painel eram bloqueadas por uma dependência que nunca usam. Corrigido:
- `src/app/frota/layout.tsx`: checagem de Calendar removida — só sessão, empresa, entitlement e onboarding do painel concluído continuam obrigatórios.
- `/frota-ativacao` (onboarding do painel): não exige mais Calendar pra começar o wizard — o resumo final mostra o status real (conectada ✅ ou link pra conectar) em vez de sempre afirmar "Conectada".
- `/frota/agenda`: passou a checar a conexão por conta própria (antes mascarava "desconectado" como "sem eventos") — mostra um convite claro pra conectar quando não há Calendar.
- Ferramenta de IA `gerenciar_google_calendar`: já tratava isso graciosamente antes (nunca dependeu do gate do painel) — nenhuma mudança necessária, virou o modelo copiado pras telas.

**Sem Google conectado**, o cliente Gestão pago já entra e usa normalmente: Dashboard, Veículos, Motoristas, Manutenção, Documentos, Documentos gerados, Despesas, Checklist, Alertas, Radar, Relatórios, Rotas, Empresa, Configurações. **Só a Agenda** pede conexão, contextualmente, quando o cliente tenta usá-la.

### 28.10 — Nova tela: histórico de documentos gerados

Achado crítico da auditoria: `generated_documents`/`gerar_documento` já existiam, mas (a) não havia nenhuma tela no painel pra consultar o que já foi gerado, e (b) **o PDF em si nunca era persistido em lugar nenhum** — só mandado por WhatsApp em base64 e descartado, sem Storage nenhum preparado. Implementado:
- Migration aditiva: bucket privado novo `generated-documents` + coluna `generated_documents.storage_path` (nullable — documentos gerados antes desta rodada continuam aparecendo no histórico, só sem opção de baixar).
- `gerar_documento` (ferramenta de IA) agora também persiste o PDF no Storage, best-effort — se o upload falhar, o envio por WhatsApp já aconteceu normalmente, só fica sem "baixar de novo" no painel depois.
- Nova tela `/frota/documentos-gerados` — lista título, origem (análise ou relatório livre), data, e um botão "Visualizar/baixar" via signed URL de 60s (mesmo padrão de segurança de Documentos: client de sessão pra confirmar acesso, admin só pra gerar a URL assinada, isolamento por `company_id` sempre, nunca link público permanente).
- PDF gerado pela IA/WhatsApp aparece automaticamente no histórico do painel — o painel só consulta/baixa, não tem editor nem gerador próprio.

### 28.11 — Classificação nova e definitiva dos módulos do Painel

Documentação anterior misturava "read-only por design" com "parcial" sob o mesmo rótulo, gerando contradição (e uma achada de verdade: o mapa da seção 2 dizia "Alertas: só leitura" numa parte do documento enquanto a seção 13 já descrevia CRUD real, desde a Rodada 2 — corrigido nesta rodada). Nova classificação, com evidência de código:

| Módulo | Classificação | Motivo |
|---|---|---|
| Dashboard | 🔵 READ-ONLY POR DESIGN | Propósito é acompanhamento — agrega dados que as outras telas já gerenciam, nunca deveria ter formulário próprio |
| Veículos | ✅ COMPLETO | CRUD real; exclusão é sempre soft (ativar/desativar) por decisão de auditoria/histórico, não uma limitação |
| Motoristas | ✅ COMPLETO | Mesmo padrão de Veículos |
| Manutenção | ✅ COMPLETO | CRUD real, sincroniza despesa e alerta automaticamente sem duplicar |
| Documentos | ✅ COMPLETO | CRUD + upload/download real de arquivo (Storage privado, signed URL) |
| **Documentos gerados** | ✅ COMPLETO (novo, 26/08) | Histórico real com Storage — ver 28.10 |
| Despesas | ✅ COMPLETO | Único módulo com exclusão física real |
| Checklist | 🔵 READ-ONLY POR DESIGN | Propósito é acompanhamento/aderência — disparo e resposta são via WhatsApp por desenho; configuração mora em Configurações |
| Alertas | ✅ COMPLETO | CRUD real de alertas manuais; automáticos (manutenção/documento) bloqueados de edição direta por design, redirecionando pra origem |
| Notícias | 🟡 PARCIAL | Limitação real: o resumo em si só é gerado por um cron externo, 1x/dia, geral do setor — painel não tem "gerar agora" |
| Radar de Fretes / Oportunidades | ✅ COMPLETO (parte) + 🔵 ROADMAP (parte) | Radares/fontes/ações sobre oportunidades: completo. Fretebras/Truckpad: roadmap explícito, nunca fingido como funcional |
| Relatórios | 🔵 READ-ONLY POR DESIGN | Propósito é consulta agregada — PDF usa exatamente os mesmos filtros da tela |
| Fretes (análises) | 🔵 READ-ONLY POR DESIGN | Histórico do que `analisar_frete` (WhatsApp) já gravou — painel nunca teve a proposta de rodar análise nova |
| Jornadas | 🟡 PARCIAL | Diferente de Fretes: o próprio código já marca isso como "por enquanto" — jornada só é salva via WhatsApp hoje, é uma lacuna real, não um design definitivo |
| Rotas | ✅ COMPLETO | CRUD real incluindo exclusão (soft) |
| Agenda | ✅ COMPLETO (quando conectado) | CRUD real ao vivo no Google Calendar; conexão agora é pedida contextualmente (28.9), não é mais limitação do painel em si |
| Empresa | ✅ COMPLETO | Cumpre integralmente o que se propõe (dados cadastrais) — nunca teve proposta de gestão de membros |
| Configurações | 🟡 PARCIAL | O próprio código já reconhece: assinatura/alertas ainda não têm mecanismo configurável aqui — só o que tem efeito real tem UI (ver 28.12) |
| Widget de IA embutido | ✅ COMPLETO | Mesmo motor do WhatsApp, mesmas ferramentas, mesmo contexto |

Nenhum item foi classificado como completo só por ter interface — todos os "✅ COMPLETO" têm CRUD/persistência real confirmada em código.

### 28.12 — `company_preferences`: campos sem efeito real, documentados

Reauditoria completa confirmou 9 colunas graváveis via `PATCH /api/frota/configuracoes` que **não têm nenhum consumidor real** em nenhuma ferramenta de IA, rota de API ou tela do painel — write-only, nunca expostas na UI:

`default_vehicle_id`, `default_fuel_type`, `default_fuel_price`, `default_average_speed_kmh`, `default_target_margin_percent`, `default_currency`, `distance_unit`, `allow_analysis_history`, `allow_tool_history`.

Status: **legado/reservado** — existem no schema desde a criação da tabela (26/07/2026), com constraints de validação (`fuel_price_non_negative`, `speed_plausible`, `margin_range`), mas a integração pretendida (valores padrão pra cálculos) nunca foi implementada. Continuam fora da UI de propósito, seguindo a mesma regra já aplicada nas rodadas anteriores: só expor campo com efeito funcional real confirmado.

### 28.13 — Resumo da regra oficial (Individual vs. Gestão)

**Individual**: 1 cliente, 1 telefone, 1 veículo ativo, 35 ferramentas via WhatsApp, sem Painel.
**Gestão**: 1 cliente, 1 telefone, até 10 veículos, 35 ferramentas via WhatsApp, Painel Web completo (Google Calendar é requisito só da função Agenda, nunca do painel inteiro).
**Memória da IA**: sem UI própria — continua infraestrutura interna, decisão deliberada (nada mudou aqui).

### 28.14 — Migrations e verificação

2 migrations novas, ambas aditivas: `20260826120000_add_operating_region_to_company_preferences.sql`, `20260826130000_generated_documents_storage.sql`. Nenhuma migration destrutiva. 457 testes (34 novos desta rodada), typecheck/lint/build limpos.
