# FROTA IA — Posicionamento Comercial e Como Vender o Produto

Baseado nos Documentos 1 (Arquitetura Técnica) e 2 (Funcionalidades e Fluxos), auditados em 2026-08-28 diretamente no código, branch `claude/frota-ia-assistente-setup-qlrbac`, commit `dc5903d`. Todo preço/limite citado aqui foi confirmado em `src/lib/mercadopago/catalog.ts` — nenhum valor é herdado de material comercial antigo.

---

## 1. O que é o Frota IA

**1 frase**: Um assistente de IA que vive no WhatsApp do motorista/transportador e calcula, registra e organiza tudo que ele hoje faz de cabeça ou em planilha — frete, custo, manutenção, documento, despesa — com um painel de gestão pra quem cuida de mais de um veículo.

**30 segundos**: O Frota IA é um assistente de IA para transporte rodoviário que funciona direto no WhatsApp — sem baixar app, sem aprender sistema novo. O motorista manda uma pergunta ou uma foto (nota fiscal, documento do veículo) e a IA calcula custo, margem, CPK, piso legal de frete, organiza despesas e avisa de vencimentos. Quem tem mais de um veículo pode contratar o plano Gestão e ganhar um painel web completo pra acompanhar a frota inteira.

**1 minuto**: Motorista autônomo e pequeno transportador brasileiro ainda decidem preço de frete no olho e descobrem vencimento de documento atrasado. O Frota IA resolve isso puxando conversa: você manda "vale a pena esse frete de R$3.800 pra Curitiba-SP?" e ele calcula custo real, margem e ainda confere se está acima do piso legal da ANTT. Você manda foto de uma nota e ele já registra a despesa. Ele avisa sozinho quando um seguro ou CNH está vencendo. Isso tudo é o plano Individual (R$79,90/mês, 1 veículo, só WhatsApp). Quem administra uma frota pequena (até 10 veículos) contrata o Gestão (R$99,90/mês ou plano anual) e ganha, além de tudo isso, um painel web pra cadastrar motoristas, acompanhar manutenção, documentos, despesas, checklist diário e relatórios da frota inteira — sem perder o WhatsApp, que continua sendo o canal do dia a dia de quem está na estrada.

**Apresentação de 3 minutos**: (roteiro) "O Frota IA nasceu de um problema simples: quem dirige não para pra abrir planilha, e quem administra uma frota pequena não tem orçamento pra um ERP de transporte. Então colocamos a inteligência num canal que ninguém precisa aprender a usar: o WhatsApp. [Mostrar uma pergunta real sendo respondida — cálculo de frete ou CPK.] Isso já existia como calculadora — a diferença é que o Frota IA junta os dados: ele lembra qual é o seu veículo, seu consumo, sua rota, e usa isso em toda conta futura, sem você repetir informação. [Mostrar foto de nota virando despesa.] Documentos e manutenção vencem sozinhos sem que ninguém perceba — o Frota IA avisa antes. [Mostrar um alerta.] E pra quem já não cabe mais numa cabeça só — dono de 3, 5, 10 veículos — o Frota IA Gestão dá um painel web completo, mas sem duplicar cadastro: é a mesma conversa, os mesmos dados, só que agora com uma tela pra enxergar a frota inteira de uma vez. [Mostrar o Dashboard.] Não vendemos „IA genérica" — vendemos as contas certas, no lugar certo, na hora certa, pra quem vive de estrada."

---

## 2. Problema que ele resolve

| Problema real do setor | Função do Frota IA | Resultado percebido |
|---|---|---|
| Motorista não sabe se um frete vale a pena de verdade (decide no "sentimento") | `analisar_frete`, `calcular_margem`, `calcular_valor_minimo_frete` | Responde em segundos, com número, não achismo |
| Não sabe se está cobrando abaixo do piso legal (risco de multa ANTT) | `verificar_piso_minimo_antt` | Segurança jurídica sem precisar saber a fórmula |
| Perde nota fiscal, não sabe quanto gastou no mês | `registrar_despesa` (inclusive por foto) | Organização sem esforço de digitação |
| Documento (CNH, seguro, licenciamento) vence sem avisar | `gerenciar_documento_frota` + `scheduled_alerts` | Evita multa/parada por documento vencido |
| Manutenção "de vez em quando", sem histórico | `gerenciar_manutencao` | Cronograma real, despesa vinculada automaticamente |
| Não sabe achar carga de volta pra não rodar vazio | `gerenciar_radar_frete` + Radar de Fretes (grupos WhatsApp) | Oportunidade avisada automaticamente |
| Gestor de frota pequena não tem visão consolidada | Painel Gestão (Dashboard, Relatórios) | Enxerga a frota inteira numa tela |
| Motorista some do controle do gestor (não reporta condição do veículo) | Checklist diário automático | Aderência visível, sem cobrar manualmente |
| Perde tempo em planilha pra saber CPK/consumo | `calcular_cpk`, `calcular_combustivel` | Cálculo pronto, sem fórmula decorada |

---

## 3. Públicos

| Público | Adequação hoje | Por quê |
|---|---|---|
| Motorista autônomo (1 veículo) | ✅ Muito adequado | Plano Individual foi desenhado pra exatamente isso — WhatsApp, sem painel, sem complexidade |
| Proprietário de 1 veículo (não dirige, aluga/terceiriza) | ✅ Adequado | Mesmo caso do autônomo — 1 veículo, sem necessidade de painel |
| Pequeno transportador (2-10 veículos) | ✅ Muito adequado | É exatamente o recorte do plano Gestão (limite técnico de 10 veículos) |
| Gestor de pequena frota (funcionário que cuida da frota, não dono) | ✅ Adequado | Painel com múltiplos papéis (`owner/admin/operator/viewer`) suporta isso |
| Transportadora com até 10 veículos | ✅ Adequado | Limite técnico real do plano Gestão é 10 |
| Empresas maiores (>10 veículos) | 🟡 Atendimento comercial manual, sem automação | Plano "Empresa" existe só como conversa comercial — **não há checkout automatizado, nem recurso técnico pensado pra escala maior** (sem telemetria, sem integração de sistema de gestão existente) |

**Não prometer**: telemetria/GPS, integração com ERP de frota já existente, gestão de frota acima de 10 veículos com os mesmos recursos do plano Gestão.

---

## 4. Individual × Gestão

| | Individual | Gestão |
|---|---|---|
| Preço | R$79,90/mês (recorrente) | R$99,90/mês (recorrente) **ou** R$838,80 em 12x (anual cartão) **ou** R$799 à vista (anual Pix) |
| Painel Web | ❌ Não | ✅ Sim |
| Limite de veículos | 1 | 10 |
| WhatsApp | ✅ Sim (todas as 35 ferramentas) | ✅ Sim (as mesmas) |
| Trial | 7 dias grátis, automático no cadastro | 7 dias grátis (mesma regra, 1 por número de WhatsApp) |

**Quem deve contratar cada um**:
- **Individual**: motorista autônomo ou dono de 1 veículo só, que não precisa de tela — o WhatsApp já é suficiente pro dia a dia dele.
- **Gestão**: qualquer um que precise **acompanhar mais de 1 veículo/motorista de fora da cabine** — o diferencial real não é "mais IA", é o painel (visão consolidada, cadastro de motorista, checklist, relatório).

**Quando recomendar upgrade**: no momento em que o cliente Individual menciona um segundo veículo ou motorista — tecnicamente ele **não consegue** cadastrar um 2º veículo ativo no plano Individual (limite trava em 1), então o upgrade não é só um "upsell de valor", é uma necessidade técnica real a partir do 2º veículo.

**Diferença de operação**: no Individual, é tudo conversa — não existe tela nenhuma. No Gestão, o motorista continua no WhatsApp normalmente (mesma experiência), mas o gestor ganha um painel pra enxergar o que todos os motoristas estão fazendo, sem depender de perguntar um por um.

---

## 5. Proposta de valor

Baseada só em funções que **existem hoje** (ver Documento 2 para status completo):

- **Visualizar custos**: CPK, combustível, custo de viagem, custo diário — todos calculados, nunca "chutados".
- **Lembrar vencimentos**: documento de veículo/motorista e manutenção viram alerta automático — o cliente não precisa lembrar.
- **Manutenção organizada**: cronograma real, com despesa vinculada automaticamente ao concluir.
- **Documentação sem planilha**: extrai dado de foto, guarda vencimento, avisa antes de vencer (e no Gestão, guarda o próprio arquivo).
- **Radar de oportunidade**: avisa quando aparece carga compatível com o perfil do veículo, evitando rodar vazio.
- **Análise de frete confiável**: nunca aceita um número sem checar se cobre custo e ainda confere o piso legal.
- **Organização financeira**: despesa por foto, relatório por período/veículo/motorista.
- **Checklist do motorista**: aderência visível sem precisar cobrar manualmente.
- **IA que "lembra" do cliente**: veículo, consumo, rota fixa e preferências ficam salvos — o cliente não repete informação toda vez.
- **Painel único pra frota pequena**: sem duplicar cadastro entre WhatsApp e tela — é o mesmo dado.
- **Agenda integrada**: quem já usa Google Agenda continua usando, sem sistema paralelo.

**Não prometer**: dashboards com dados de GPS/telemetria em tempo real, integração automática com sistema de nota fiscal eletrônica além de leitura por foto, previsão de preço de frete por IA preditiva (o piso é legal/fórmula, não previsão de mercado).

---

## 6. Como apresentar o produto

Sequência recomendada, na ordem que melhor conta a história do produto (nem toda tela pesa igual — a ordem prioriza "problema → solução → prova → escala"):

1. **WhatsApp — uma pergunta real de frete** (não o Dashboard). Problema: "eu não sei se esse frete vale a pena". Benefício: resposta em segundos, com número.
2. **WhatsApp — foto de nota virando despesa**. Problema: "eu perco recibo, não sei quanto gastei". Benefício: zero digitação.
3. **WhatsApp — um alerta de vencimento chegando**. Problema: "documento vence sem eu perceber". Benefício: tranquilidade, evita multa.
4. **Dashboard do painel** (Gestão). Problema: "eu não enxergo minha frota inteira". Benefício: tudo num lugar só, sem abrir 5 telas.
5. **Veículos + Manutenção**. Benefício: histórico real, nunca mais "de cabeça".
6. **Documentos** (com arquivo anexado). Benefício: nunca mais procurar CRLV/apólice no celular.
7. **Despesas + Relatórios**. Benefício: números prontos pra decisão, sem planilha.
8. **Checklist**. Benefício: sabe o estado da frota sem ligar pra cada motorista.
9. **Radar de Fretes**. Benefício: oportunidade que chega sozinha.
10. **Encerrar voltando pro WhatsApp** — reforçar que o painel é um complemento, não uma obrigação: o motorista continua vivendo 100% no WhatsApp.

Para cada tela: **abrir com o problema em linguagem do motorista** (nunca "veja nossa arquitetura de IA"), mostrar a tela/resposta real, e nomear o benefício em 1 frase.

---

## 7. Demonstração de 10 minutos

1. **(1 min) Abertura**: "Você decide preço de frete no olho hoje? Perde nota fiscal? Esquece vencimento de documento? É exatamente isso que o Frota IA resolve, direto no WhatsApp."
2. **(2 min) Cálculo de frete ao vivo**: manda uma pergunta real tipo "vale a pena um frete de Curitiba pra São Paulo a R$3.800 com meu Scania R450?" — mostrar a resposta chegando com custo, margem e comparação com o piso ANTT.
3. **(1,5 min) Foto virando despesa**: manda foto de uma nota, mostrar virando registro automático.
4. **(1,5 min) Documento e alerta**: mostrar um documento cadastrado e o alerta de vencimento chegando.
5. **(1 min) Radar de Fretes**: explicar o conceito (aviso de carga compatível) mesmo sem grupo ao vivo, se não for possível demonstrar em tempo real.
6. **(2 min) Painel Gestão**: abrir o Dashboard, passar rápido por Veículos → Manutenção → Documentos → Relatórios, sempre reforçando "é o mesmo dado que acabamos de ver no WhatsApp".
7. **(1 min) Fechamento comercial**: apresentar os planos (Individual R$79,90 pra quem tem 1 veículo; Gestão R$99,90/mês ou anual pra quem tem frota), oferecer os 7 dias grátis, perguntar qual encaixa no perfil do lead.

---

## 8. Venda pelo WhatsApp

```
Lead chega (indicação, anúncio, landing page)
  ↓
Conversa inicial — reconhecimento de intenção comercial (se veio de CTA da landing, já é tratado automaticamente)
  ↓
Diagnóstico — quantos veículos, autônomo ou frota, o que mais incomoda hoje (custo? documento? organização?)
  ↓
Demonstração — deixar o próprio cliente fazer 1 pergunta real pro Frota IA (é a melhor demo: ele mesmo testando)
  ↓
Escolha do plano — Individual (1 veículo) ou Gestão (frota, painel)
  ↓
Pagamento — link de checkout gerado na hora (Mercado Pago, cartão recorrente ou Pix)
  ↓
Ativação — acesso liberado automaticamente após confirmação do pagamento (trial já rodava antes disso)
  ↓
Primeiros passos — Guia de Primeiros Passos oferecido automaticamente
```

O maior trunfo comercial deste fluxo: **o próprio produto é a demonstração** — o lead não vê slide, ele manda uma pergunta real e recebe uma resposta real, no canal que ele já usa todo dia.

---

## 9. Argumentos de venda

**Para o autônomo**: "Você já tem WhatsApp aberto o dia inteiro — não é mais um app pra lembrar de abrir. R$79,90 é menos que 1 diária de hotel, e você usa isso em todo frete que fechar."

**Para o dono de pequena frota**: "Você não precisa saber tudo que cada motorista está fazendo — o checklist e os alertas te avisam só quando precisa de atenção. E o painel te dá a visão de cima sem você ficar ligando pra cada um."

**Para o gestor (funcionário)**: "Você não vai brigar pra convencer motorista a usar sistema novo — ele continua no WhatsApp normal. Sua parte é só abrir o painel e ver tudo organizado, sem pedir planilha pra ninguém."

---

## 10. Objeções

| Objeção | Resposta |
|---|---|
| "Eu já uso planilha." | Planilha não avisa vencimento sozinha, não calcula piso legal, e você tem que abrir ela — o Frota IA responde onde você já está, sem esforço extra. |
| "Eu já tenho WhatsApp." | Exatamente — é por isso que funciona: a gente não pede pra você aprender nada novo, só conversar como já conversa hoje. |
| "Eu não preciso de IA." | Você não está comprando "IA" — está comprando cálculo de frete certo, aviso de documento vencendo e organização de despesa. A IA é só o jeito de você pedir isso em português, sem menu. |
| "Minha frota é pequena." | O plano Individual foi feito exatamente pra 1 veículo — você não paga por recurso de frota que não usa; e se crescer, o Gestão acompanha até 10 veículos. |
| "Eu já tenho sistema." | Se seu sistema não conversa no WhatsApp nem calcula o piso legal automaticamente, o Frota IA complementa — não precisa trocar de sistema pra experimentar 7 dias grátis. |
| "Não tenho tempo pra alimentar outro sistema." | Não tem sistema pra alimentar — você manda foto ou fala normal, e a IA organiza. O esforço é menor que uma mensagem de WhatsApp comum. |
| "Vale a pena pagar todo mês?" | Um frete mal calculado custa muito mais que R$79,90 — o produto se paga sozinho evitando 1 decisão errada de preço no mês. |
| "Meus motoristas vão usar?" | Eles não precisam aprender nada — é o mesmo WhatsApp que já usam. O checklist chega sozinho, e responder leva segundos. |

---

## 11. O que NÃO prometer

Baseado só nas limitações confirmadas nos Documentos 1 e 2 — nunca prometer:

- **Telemetria/GPS em tempo real** — não existe rastreamento de veículo; km/localização são sempre informados pelo cliente.
- **Cálculo automático de pedágio** — não implementado (Google Routes não pede esse dado hoje; é roadmap, não recurso atual).
- **Integração com Fretebras/Truckpad/outras bolsas de frete** — o Radar hoje só lê grupos de WhatsApp autorizados.
- **Confirmação de leitura/entrega de mensagem** — a Z-API não oferece isso hoje no produto.
- **Gestão de frota acima de 10 veículos com os mesmos recursos automatizados** — acima disso é atendimento comercial manual, sem automação.
- **Upload de arquivo de documento pelo WhatsApp** — o WhatsApp só extrai o dado da foto; guardar o arquivo em si é recurso exclusivo do painel (Gestão).
- **App próprio (iOS/Android)** — o produto é WhatsApp + painel web, não existe app nativo.
- **Previsão de preço de mercado por IA** — o que existe é o piso legal (fórmula ANTT), não uma IA preditiva de quanto o mercado paga.
- **Renovação automática do plano anual** — o cliente precisa decidir contratar de novo ao fim dos 12 meses; só os planos mensais renovam sozinhos.
- **Exclusão de conta pelo próprio cliente** — hoje isso depende de suporte, não é self-service.

---

## 12. Diferenciação

**Por que Frota IA em vez de planilha?** Planilha não fala com você, não avisa vencimento sozinha, não calcula piso legal, e exige que você abra ela — o Frota IA responde onde você já está o dia inteiro.

**Por que em vez de agenda comum?** Agenda não calcula custo nem organiza despesa — o Frota IA faz as duas coisas e ainda se integra com sua Google Agenda de verdade, sem duplicar.

**Por que em vez de vários apps separados** (1 pra despesa, 1 pra CPK, 1 pra documento)**?** Porque cada app separado não conversa com o outro, e você tem que digitar o mesmo dado várias vezes. No Frota IA, o veículo que você cadastrou uma vez já entra em todo cálculo futuro.

**Por que em vez de só usar ChatGPT genérico?** Um ChatGPT genérico não sabe seu veículo, seu consumo, sua rota, e não guarda nada — cada conversa começa do zero. O Frota IA lembra do seu contexto, calcula com fórmulas reais (não estimativa de texto) e confere o piso legal com fonte oficial, não "acha que é assim".

**Por que em vez de um sistema tradicional de gestão de frota?** Sistema tradicional pede treinamento, exige que o motorista abra um app novo, e custa caro pra frota pequena. O Frota IA entrega o essencial (custo, documento, manutenção, despesa) sem essa fricção, a um preço pensado pra 1-10 veículos.

---

## 13. Mensagem central

Cinco alternativas, todas na linguagem de estrada/frete/frota, sem "revolucionário"/"transforma"/"futuro":

1. "O Frota IA calcula o frete certo antes de você fechar carga."
2. "Documento vencido não vira surpresa — o Frota IA avisa antes."
3. "Sua frota organizada onde você já vive: no WhatsApp."
4. "Menos planilha, mais estrada — o Frota IA cuida da conta."
5. "De 1 caminhão a 10: o Frota IA cresce junto com sua operação."

---

## 14. Materiais comerciais

| Material | Telas/funções que mostram mais valor |
|---|---|
| Screenshots | Resposta de `analisar_frete` no WhatsApp; alerta de vencimento; Dashboard do painel |
| Carrossel | 1 problema por slide (custo, documento, organização, radar) + resolução |
| Vídeo curto (30-60s) | Pergunta real sendo respondida no WhatsApp, do "oi" à resposta com número |
| Demonstração ao vivo | Roteiro da Seção 7 (10 minutos) |
| Landing page | Foco no Individual como porta de entrada (preço baixo, sem fricção) + CTA de WhatsApp |
| PDF comercial | Comparativo Individual × Gestão + tabela de funções por grupo (Documento 2, Parte 6) |
| WhatsApp (material de prospecção) | Print de uma resposta real de cálculo de frete + link direto pra iniciar conversa |
| Posts | Cada função isolada (1 post = 1 problema resolvido), nunca "IA revolucionária" genérica |

---

## 15. Sequência de prints para marketing

Priorizando telas com **dado real de demonstração** (a base demo "Transportes Rocha Sul" já populada em produção serve pra isso).

1. **TELA**: WhatsApp — resposta de `analisar_frete`.
   **O que precisa aparecer**: pergunta do cliente + resposta com custo/margem/classificação.
   **Benefício mostrado**: decisão de frete com número, não achismo.
   **Mensagem**: "Você pergunta, o Frota IA calcula."

2. **TELA**: WhatsApp — alerta de documento vencendo.
   **O que precisa aparecer**: mensagem de aviso com nome do documento e prazo.
   **Benefício**: nunca mais ser pego de surpresa.
   **Mensagem**: "Documento vencido não é mais surpresa."

3. **TELA**: Dashboard do painel (`/frota/dashboard`).
   **O que precisa aparecer**: KPIs com dado real (veículos ativos, manutenções pendentes, custo do mês) + card "Frota IA sugere".
   **Benefício**: visão consolidada da frota.
   **Mensagem**: "Sua frota inteira, numa tela só."

4. **TELA**: Veículos (`/frota/veiculos`).
   **O que precisa aparecer**: lista de veículos com status.
   **Benefício**: organização sem planilha.
   **Mensagem**: "Cada veículo, com seu histórico completo."

5. **TELA**: Documentos (`/frota/documentos`).
   **O que precisa aparecer**: documento com vencimento e arquivo anexado.
   **Benefício**: nunca mais procurar CRLV/apólice.
   **Mensagem**: "Todo documento, sempre à mão."

6. **TELA**: Despesas ou Relatórios com filtro por período.
   **O que precisa aparecer**: total de custo do mês, breakdown por categoria.
   **Benefício**: decisão financeira embasada.
   **Mensagem**: "Seus números, prontos pra decidir."

7. **TELA**: Checklist (`/frota/checklists`).
   **O que precisa aparecer**: aderência dos motoristas.
   **Benefício**: controle sem microgerenciar.
   **Mensagem**: "Saiba o estado da frota sem ligar pra ninguém."

8. **TELA**: WhatsApp — foto de nota virando despesa.
   **O que precisa aparecer**: sequência foto → confirmação de registro.
   **Benefício**: zero digitação.
   **Mensagem**: "Manda a foto, o resto é com a gente."

---

## 16. Conclusão comercial

- **Qual é o principal produto que estamos vendendo?** Um assistente de IA via WhatsApp que calcula frete/custo/CPK com precisão e organiza documento/despesa/manutenção — com um painel de gestão como camada opcional para quem cuida de mais de um veículo.
- **Qual é o principal benefício?** Decisão de frete com número real (não achismo) e zero surpresa com vencimento de documento — nos canais que o motorista já usa.
- **Para quem ele está mais pronto hoje?** Motorista autônomo e pequeno transportador de até 10 veículos — é exatamente o recorte técnico e comercial dos planos atuais.
- **Qual plano é a porta de entrada?** Individual (R$79,90/mês, 1 veículo, sem fricção, 7 dias grátis).
- **Quando vender Gestão?** No momento em que o cliente menciona um 2º veículo ou motorista — não é só upsell, é necessidade técnica (limite trava em 1 no Individual).
- **Quais 5 funções mais ajudam a fechar venda?** (1) `analisar_frete` com piso ANTT — resposta imediata e tangível; (2) registrar despesa por foto — zero esforço, visualmente impressionante; (3) alerta de vencimento de documento — resolve medo real (multa); (4) Dashboard do painel — prova de "visão de gestão" pra quem tem frota; (5) checklist diário — resolve dor de "não sei o que o motorista está fazendo".
- **Qual seria a abordagem para conseguir os primeiros clientes?** Prospecção direta no WhatsApp com motoristas/pequenos transportadores da rede de contato do Rafael (RF Pneus já é adjacente ao setor), oferecendo o teste de 7 dias sem fricção — deixando o próprio produto fazer a demonstração (o lead manda 1 pergunta real e já sente o valor), em vez de apresentação de slide.

---

*Documento gerado por auditoria de código em 2026-08-28, branch `claude/frota-ia-assistente-setup-qlrbac`, commit `dc5903d`. Preços e limites confirmados em `src/lib/mercadopago/catalog.ts` — nenhuma funcionalidade, regra de negócio, banco ou API foi alterada durante a produção deste documento.*
