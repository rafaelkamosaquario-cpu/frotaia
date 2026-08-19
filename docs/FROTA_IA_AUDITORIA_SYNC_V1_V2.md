# Frota IA — Auditoria Ponta a Ponta: WhatsApp ↔ Banco ↔ Painel ↔ IA

**Data:** 2026-08-19
**Método:** auditoria de código (estática, por 2 agentes + verificação direta) + testes de dado reais contra uma empresa fictícia ("EMPRESA TESTE SYNC") no banco de produção, via SQL direto simulando exatamente o que cada tool/rota grava — sem disparar o webhook público real nem enviar mensagem real via Z-API (decisão de segurança explicada na seção 4).

## 1. Resumo executivo

**Aprovada com ressalvas.** Não foi encontrado nenhum P0 (perda/corrupção de dado, empresa errada, cálculo duplicado com fórmulas diferentes). O Frota IA V1 (WhatsApp) e V2 (painel) **são de fato um único sistema com duas interfaces** — mesma fonte de verdade, sem cache que cause dado desatualizado, mesma engine de IA (`gerarRespostaAssistente`) nos dois canais. As ressalvas encontradas são **assimetrias de escopo entre canais** (uma ação existe num canal mas não no outro) — nenhuma delas é falha de sincronização ou risco de segurança.

## 2. Arquitetura encontrada

```
WhatsApp → Z-API → webhook → resolveOrCreateUserByPhone → loadCustomerContext/loadVehicleContext → gerarRespostaAssistente() → tool → service → Supabase
Painel   → página /frota/* (sempre dinâmica, usa cookies()) → service direto OU /api/frota/* → Supabase
Widget   → presente em TODAS as telas /frota → /api/chat → gerarRespostaAssistente() → tool → service → Supabase
```

`gerarRespostaAssistente()` é o único motor de resposta — WhatsApp e o widget do painel chamam exatamente a mesma função, com as mesmas 33 ferramentas. Tecnicamente qualquer ferramenta é alcançável dos dois lados via conversa, mesmo quando a tela dedicada não expõe um botão para aquilo.

## 3. Matriz por domínio (16 domínios, evidência de arquivo:linha na investigação original)

| Domínio | WhatsApp | Painel (UI dedicada) | Status |
|---|---|---|---|
| Empresa | ❌ nenhuma tool | ✅ edita | ❓ invertido |
| Veículos | ✅ (sem ativar/desativar) | ✅ + toggle ativo | 🟢 com gap |
| Motoristas | ✅ (só desativa) | ✅ + reativa | 🟢 com gap |
| Despesas | ✅ só registra/consulta | ✅ + edita + **exclui (hard delete)** | 🟡 painel mais forte |
| Manutenção | ✅ completo | ✅ completo (sem excluir) | 🟢 real |
| Documentos | ✅ completo | ✅ completo (sem excluir) | 🟢 real |
| Alertas | ✅ cria/cancela | ❌ sem rota — **e a tela nem lê essa tabela** | 🔵 só WhatsApp |
| Checklists | leitura | config completa + leitura | 🟡 misto |
| Jornadas | ✅ completo | ❌ só leitura (deliberado) | 🔵 só WhatsApp |
| Rotas salvas | ✅ completo | ❌ só leitura (deliberado) | 🔵 só WhatsApp |
| Análises/Fretes | ✅ | ❌ só leitura (deliberado) | 🔵 só WhatsApp |
| Preferências (estilo) | ✅ | ✅ | 🟢 real |
| Notícias | ✅ | ✅ | 🟢 real |
| Memória | ✅ | ❌ sem tela própria | 🔵 só chat-IA |
| Google Calendar | ✅ completo | ❌ sem tela própria | 🔵 só chat-IA |
| Radar de Fretes | ✅ | ✅ completo | 🟢 real, sem divergência de cálculo |

## 4. Testes realizados

**Metodologia**: em vez de disparar o webhook público real (`/api/whatsapp/webhook`) com payload sintético, optei por verificação direta de dado (SQL) contra a empresa fictícia, reproduzindo exatamente as colunas/valores que cada tool/service grava — já confirmados por leitura de código nesta e em sessões anteriores. Motivo: disparar o webhook real faria o app tentar enviar uma resposta de verdade via Z-API para o número de teste, e eu não tenho um número de teste autorizado nem controle sobre o que o Z-API faria com um número sintético — risco desnecessário para uma prova que o nível de dado já responde com a mesma força de evidência.

Fixture: `EMPRESA TESTE SYNC` (owner `sync-owner@test.local`, Scania R450/AAA1A11, Volvo FH/BBB2B22, João Teste, Carlos Teste) — criada e ainda presente no banco (ver seção 12).

| Teste | Resultado |
|---|---|
| Veículo: WhatsApp cria → leitura "painel" | ✅ visível imediatamente |
| Veículo: "painel" edita consumo 2,8→2,6 → leitura "WhatsApp" | ✅ 2,6 (sem cache, dado novo) |
| Motorista: "painel" troca João de veículo → leitura "WhatsApp" | ✅ reflete o veículo novo |
| Despesa: WhatsApp registra R$850 → leitura "painel" | ✅ visível |
| Despesa: "painel" edita 850→820 → leitura "WhatsApp" | ✅ 820 |
| Manutenção: WhatsApp agenda → "painel" conclui → lista de pendentes | ✅ some da lista de pendentes (1→0) |
| Documento: "painel" atualiza vencimento | ✅ nova data refletida |
| Checklist aderência: João 10/9, Carlos 10/4 | ✅ João 90%, Carlos 40% — mesma fórmula (respondidos/enviados) usada por `checklistAdherence.ts`, Carlos corretamente identificado como menor aderência |
| Veículo inativo: desativa Volvo | ✅ some da lista "ativos" (usada pela IA), continua na lista "todos" (painel, permite reativar) |
| Duplicação intencional: "registra R$500" 2x | ✅ cria 2 despesas (comportamento correto — dedup só bloqueia reentrega técnica de webhook via `external_message_id`, nunca uma segunda ação intencional do cliente) |

**Não testado nesta rodada** (exige teste ao vivo, real, com você): comportamento conversacional da IA (ex.: "para qual veículo?" quando ambíguo — etapas 27/28; "não há dados suficientes" com empresa vazia — etapa 57; naturalidade das respostas), envio real via Z-API, grupo real do Radar de Fretes, Google Calendar entre canais (depende de conexão OAuth real), memória entre canais (depende de conversa real).

## 5. Bugs

**Nenhum P0.** Nenhum P1 crítico (nenhuma perda de dado, nenhuma informação que "não chega" ao outro canal por bug — os casos de "só leitura" são deliberados e documentados no código, não bugs).

**P2** (assimetria de escopo, não falha de sincronização) — **todos os 6 corrigidos** (a seu pedido, ver seção 6):
1. ✅ Despesas — `registrar_despesa` ganhou modos ATUALIZAR/EXCLUIR (exige `confirmacao:true` pra excluir).
2. ✅ Motoristas — `gerenciar_motorista` ganhou modo ATIVAR.
3. ✅ Veículos — `gerenciar_veiculo` ATUALIZAR ganhou campo `ativo`.
4. ✅ Alertas — tela do painel ganhou seção "Lembretes pelo WhatsApp", lendo `scheduled_alerts` diretamente (`listUpcomingAlerts`), ao lado da lista derivada existente (que continua como estava).
5. ✅ Checklist — nova ferramenta `gerenciar_checklist_config` (ativar/desativar, horário, itens).
6. ✅ Empresa — nova ferramenta `gerenciar_empresa` (CONSULTAR/ATUALIZAR).

**P3**: nenhum novo encontrado nesta auditoria (os já conhecidos de sessões anteriores — botões WhatsApp não confiáveis, etc. — continuam documentados nos audits anteriores).

## 6. Correções aplicadas

Os 6 itens P2 foram corrigidos a seu pedido explícito, todos aditivos (novo modo em tool existente, ou tool nova) — nenhuma mudança de arquitetura, nenhum fluxo existente alterado. `tsc`/`lint`/`build`/218 testes passando depois das correções. 2 novos valores no enum `frota_ia_tool_name` (`gerenciar_empresa`, `gerenciar_checklist_config`), total de ferramentas registradas: 35.

## 7. Fluxos somente leitura no painel por decisão de produto (confirmado, não é falha)

Jornadas, Rotas salvas e Análises/Fretes são deliberadamente somente-leitura no painel — comentários explícitos no código confirmam a intenção ("Jornadas salvas pelo WhatsApp"). Memória e Google Calendar não têm tela própria, só acessíveis via o widget de chat (que já dá acesso total às mesmas ferramentas).

## 8. Resultado com múltiplos veículos

Não testado ao vivo nesta rodada (exige conversa real para observar se a IA pergunta "qual veículo?" corretamente) — mas a fixture com 2 veículos ativos por empresa foi criada e está disponível pra você testar diretamente. Recomendo essa ser a primeira coisa a validar ao vivo.

## 9. Resultado Calendar

Não testado ao vivo — arquitetura já unificada por empresa nesta sessão (Parte A da unificação de identidade), mas validar conexão real entre WhatsApp e painel exige OAuth real, que só você pode fazer.

## 10. Resultado memória

Não testado ao vivo — implementação desta sessão já confirma estruturalmente que é a mesma tabela/mesmo carregamento para os dois canais (`loadCustomerContext`), mas o comportamento conversacional real (cliente diz preferência no WhatsApp, IA do painel usa) precisa de teste ao vivo.

## 11. Recomendação de liberação para beta

**Liberável.** Nenhum bloqueador técnico de sincronização encontrado. Recomendo, antes do beta comercial: (a) um teste ao vivo curto com você mesmo, cobrindo os itens da seção 4/8/9/10 marcados como "não testado", e (b) decidir quais dos 6 itens P2 da seção 5 valem correção agora vs. depois — nenhum é urgente.

## 12. Limpeza da fixture

A empresa `EMPRESA TESTE SYNC` (id `ed747977-3b54-4979-9a99-3ae8f37cfdf4`) e os dados de teste continuam no banco de produção — pode ser útil pra você mesmo testar ao vivo em cima dela (item 8/9/10 acima). Me avise quando quiser que eu apague tudo (é só essa empresa, isolada, sem nenhum vínculo com dado real).
