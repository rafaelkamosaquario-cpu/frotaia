# Frota IA — Auditoria das 28 Ferramentas de IA

**Data:** 2026-08-19
**Escopo:** auditoria de código (estática, sem execução ao vivo multimodal de áudio/foto real via WhatsApp) de todas as ferramentas registradas em `FERRAMENTAS_FROTA_IA` (`src/ai/tools/index.ts`), divididas em 12 ferramentas de cálculo puro e 16 ferramentas de integração/escrita.
**Não foi feito:** teste ao vivo com áudio/foto reais pelo WhatsApp, nem ataques destrutivos em empresa real — auditoria 100% de leitura de código.

---

## Parte 1 — 12 ferramentas de cálculo puro

| Ferramenta | Divisão por zero | Negativos | Dado faltante | Mensagens seguras | Status |
|---|---|---|---|---|---|
| `analisar_frete` | Guardado (`dividirSeguro`) | Validado | `sucesso:false` + `dadosFaltantes` | Sim | 🟢 |
| `calcular_combustivel` | Guardado | Validado | idem | Sim | 🟢 |
| `calcular_cpk` | Guardado | Validado | idem | Sim | 🟢 |
| `comparar_pneus` | Guardado (via `calcular_cpk`) | Validado | idem | Sim | 🟢 |
| `calcular_custo_viagem` | Guardado | Validado | idem | Sim | 🟢 |
| `calcular_margem` | Guardado | Validado | idem | Sim | 🟢 |
| `calcular_valor_minimo_frete` | Guardado | Validado | idem | Sim | 🟢 |
| `calcular_receita_km` | Guardado | Validado | idem | Sim | 🟢 |
| `calcular_custo_dia` | Guardado | Validado | idem | Sim | 🟢 |
| `calcular_custo_veiculo_parado` | Guardado (fórmula circular também) | Validado | idem | Sim | 🟢 |
| `calcular_jornada` | Guardado | Validado | idem | Sim | 🟢 |
| `verificar_piso_minimo_antt` | Guardado (CCD sempre exigido, nunca inventado) | Validado | idem | Sim | 🟢 |

**Padrão confirmado nas 12:** toda divisão passa por `dividirViaCpk`/`dividirSeguro` (checa divisor `<= 0` antes) ou checagem inline explícita; todo campo numérico passa por validação centralizada de negativo; todo caminho de dado faltante retorna `{sucesso:false, dadosFaltantes:[...]}` em vez de lançar exceção; nenhuma das 12 usa `throw`/`console.*`. Camada extra de defesa: `gerarRespostaAssistente.ts` envolve `ferramenta.executar()` num `try/catch` geral que devolveria erro genérico mesmo se uma exceção escapasse.

**`verificar_piso_minimo_antt` (verificação específica pedida):** CCD é sempre parâmetro obrigatório — a ferramenta nunca mantém tabela própria de coeficientes nem estima de memória (comentário explícito no código instrui a IA a consultar a fonte oficial antes de chamar a ferramenta). Ausente → `dadosFaltantes`; zero/negativo → rejeitado antes de calcular. CC (carga/descarga) tem fallback `0`, mas sempre com alerta explícito ao usuário, nunca silencioso.

**Cadeia de dependências internas (confirmada):** `calcular_jornada` → `analisar_frete`/`calcular_custo_veiculo_parado`/`calcular_receita_km`/`calcular_margem`/`calcular_cpk` (até 4-5 níveis) — nenhuma reimplementação duplicada de fórmula, tudo reaproveita a ferramenta de nível mais baixo.

**Achados:** nenhum problema de código encontrado (divisão por zero, negativo, dado faltante, mensagens, encadeamento) nas 12 ferramentas. Observações não-bloqueantes (P3/melhoria, não bugs): (1) a profundidade da cadeia de chamadas aumenta a superfície de teste necessária ao mudar contrato de uma ferramenta de nível baixo — mitigado por testes `.test.ts` já existentes; (2) nomes de campo nas mensagens de erro são os nomes reais de parâmetro da API (não são stack traces, é intencional para o Claude mapear de volta o campo a pedir ao usuário).

---

## Parte 2 — 16 ferramentas de integração/escrita

| Ferramenta | `company_id` em toda query | Desambiguação | Valida antes de gravar | Erro externo tratado | Mensagens seguras |
|---|---|---|---|---|---|
| `gerenciar_google_calendar` | Sim | N/A (exige ID) | Sim | Sim (`mensagemErroSeguro`) | Sim |
| `consultar_historico` | Sim | Delega à IA | N/A | Sim | Sim |
| `gerenciar_alerta` | Sim | N/A (exige ID) | Sim | Sim (detalhe só no servidor) | Sim |
| `gerar_documento` | Sim | N/A | Sim | Sim | Sim |
| `consultar_rota` | N/A (Google Maps, sem tabela por empresa) | N/A | Sim | Sim, mas ver achado 1 | Quase (achado 1) |
| `registrar_despesa` | Sim | N/A | Sim | Sim | Sim |
| `gerenciar_veiculo` | Sim (+ posse) | N/A (exige ID) | Sim | Sim | Sim |
| `definir_estilo_resposta` | Sim | N/A | Sim (enum) | Sim | Sim |
| `consultar_conhecimento_operacional` | N/A (arquivo local) | N/A | Sim (enum) | Sim | Sim |
| `gerenciar_rota_salva` | Sim (+ posse, dupla checagem) | N/A (exige ID) | Sim | Sim | Sim |
| `gerenciar_noticias_setor` | Sim | N/A | Sim | Sim | Sim |
| `gerenciar_assinatura` | N/A (só gera link Mercado Pago, não processa pagamento) | N/A | Sim | Sim | Sim |
| `gerenciar_motorista` | Sim (+ posse do veículo vinculado) | N/A (exige ID) | Sim | Sim | Sim |
| `gerenciar_manutencao` | Sim (+ posse do veículo) | N/A (exige ID) | Sim | Sim | Sim |
| `gerenciar_documento_frota` | Sim (+ posse do veículo — ver achado 2) | N/A (exige ID) | Sim (regra "exatamente 1 dono") | Sim | Sim |
| `gerenciar_jornada_salva` | Sim (+ posse) | N/A (exige ID) | Sim | Sim | Sim |

**Padrão de desambiguação (confirmado nas 16):** nenhuma ferramenta faz busca "fuzzy" por nome e escolhe o primeiro resultado. Toda escrita num registro específico exige um ID explícito (a descrição do parâmetro instrui "use LISTAR antes se não tiver certeza"). Quando uma consulta pode retornar múltiplos resultados, a ferramenta devolve a lista completa e a decisão de perguntar ao cliente fica 100% no system prompt/IA — escolha de design deliberada e documentada, não um bug, mas sem rede de segurança em código caso o modelo não siga a instrução.

**`gerenciar_assinatura` (confirmação de segurança de pagamento):** só chama funções que devolvem `initPoint` (link de checkout do Mercado Pago) — não há chamada a API de cobrança nem captura de cartão. Comentário explícito no código confirma que a ferramenta "não bloqueia nem libera acesso por si só — só gera o link".

### Achados

1. **✅ CORRIGIDO — P3 `consultar-rota.ts`**: `erroSeguro()` repassava `err.message` de `GoogleMapsApiError` (podia conter status bruto do Google, ex. `OVER_QUERY_LIMIT`) diretamente ao usuário. Corrigido: agora só repassa a mensagem quando é o caso seguro "rota não encontrada" (único throw sem `httpStatus`/`googleStatus`); qualquer outro erro vira mensagem genérica + log detalhado só no servidor, igual às outras 15 ferramentas.
2. **✅ CORRIGIDO — P2 `gerenciar-documento-frota.ts`**: não verificava se `motoristaId` pertencia à `companyId` antes de CRIAR/ATUALIZAR um documento vinculado a ele. Corrigido: nova função `getDriver(client, driverId, companyId)` (filtro de posse já na própria query, não em checagem separada) usada nos dois pontos, mesmo padrão que já existia para `veiculoId`.
3. **P3 (não corrigido, hardening não-urgente) — padrão "leitura ampla por `id` + checagem manual de `company_id` em JS"** usado em `getVehicle`, `getRoute`, `getSavedJourney` (sem `.eq("company_id", ...)` na própria query de serviço). Seguro hoje porque toda ferramenta que os chama confere posse logo em seguida, mas é dívida técnica frágil — um novo caminho de código que reutilize essas funções sem repetir a checagem reintroduziria vazamento cross-tenant silenciosamente. Recomendação: mover o filtro `company_id` para dentro das funções de serviço.
4. **P3 (não corrigido) — sem trava de desambiguação em código** (ver acima) — depende 100% do system prompt ser seguido pelo modelo.

Nenhum P0/P1 encontrado nas 28 ferramentas. Achados 1 e 2 corrigidos (2026-08-19); 3 e 4 ficam como dívida técnica registrada, sem correção pedida até agora.
