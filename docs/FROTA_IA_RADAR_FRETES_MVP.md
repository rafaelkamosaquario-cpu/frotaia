# Frota IA — Radar de Fretes (MVP)

**Data:** 2026-08-19
**Status:** implementado, validado (`tsc`/`lint`/`build`/218 testes), **não publicado/deployado** — aguardando confirmação explícita para push.

Objetivo: usar a infraestrutura já existente do Frota IA (motor de cálculo, WhatsApp, painel) como um filtro inteligente entre ofertas de frete recebidas (encaminhadas pelo cliente ou de grupos de WhatsApp autorizados) e o que faz sentido para o veículo/rota daquele cliente. Não é marketplace, não contrata frete, não negocia, não processa pagamento.

## 1. Arquitetura

```
Mensagem de grupo autorizado
        ↓ (webhook, evento — nunca polling)
Pré-filtro barato (cheapFilter.ts, sem IA)
        ↓ possível frete?
Extração estruturada (1 chamada Claude, sem tools)
        ↓ freight_opportunities
Matching determinístico (matching.ts, sem IA) × todos os radares ativos
        ↓ FORTE?
Notificação WhatsApp + registro na conversa
        ↓ cliente pede "analisa"
consultar_oportunidades_frete (ANALISAR) → consultar_rota + calcular_combustivel + analisar_frete
        ↓
analysis_runs + freight_opportunity_matches.status='analyzed'
```

Mensagem direta (encaminhada pelo cliente) continua funcionando exatamente como antes — `analisar_frete` sem precisar de Radar nenhum.

## 2. Tabelas

- **`freight_sources`** — whitelist de grupos autorizados. `company_id` nulo = fonte global (só backend cadastra); preenchido = fonte privada, gerenciável no painel (owner/admin).
- **`freight_radars`** — busca ativa do cliente. Só `vehicle_id` (nunca cópia de dado do veículo). `expires_at` sempre obrigatório — 7 dias por padrão se o cliente não informar prazo (`RADAR_DURACAO_PADRAO_DIAS`).
- **`freight_opportunities`** — a carga recebida. **Não é por empresa** (uma fonte global pode servir várias empresas). Sem RLS para `authenticated` — só o backend lê/escreve; painel sempre acessa via match.
- **`freight_opportunity_matches`** — cruzamento privado por empresa (score, análise, decisão). Isolado por RLS normal.
- `vehicles.body_type` (novo enum `vehicle_body_type`) — carroceria do veículo, que não existia no schema.
- `company_preferences.freight_radar_analysis_mode` — `avisar_primeiro` (padrão) ou `analise_automatica`.

## 3. Services

`freightRadarService.ts`, `freightOpportunityService.ts`, `freightMatchService.ts`, `freightSourceService.ts` (Supabase) + `src/lib/freight/cheapFilter.ts` (pré-filtro puro, testado), `src/lib/freight/matching.ts` (score determinístico puro, testado), `src/services/freight/opportunityExtraction.ts` (1 chamada Claude sem tools), `src/services/freight/radarMatchingEngine.ts` (orquestração: matching → notificação → pré-análise), `src/services/freight/groupMessageIntake.ts` (pipeline completo de uma mensagem de grupo).

## 4. Tools

- **`gerenciar_radar_frete`** — CRIAR/LISTAR/ATUALIZAR/PAUSAR/ATIVAR/CANCELAR.
- **`consultar_oportunidades_frete`** — LISTAR/DETALHAR/ANALISAR/IGNORAR/FAVORITAR. ANALISAR reaproveita a mesma função (`analisarOportunidadeParaMatch`) usada pelo matching automático — nunca um segundo motor de cálculo.

## 5. Webhook

`isGroup` desvia a mensagem 100% para o pipeline do Radar **antes** de `resolveOrCreateUserByPhone` — participante de grupo nunca vira `auth.user`, nunca inicia onboarding, nunca gera `conversation`/`message`. Campos do payload de grupo (`isGroup`, `chatName`, `participantPhone`, `phone` com sufixo `-group`) confirmados na documentação oficial do Z-API, não presumidos.

## 6. Matching

Determinístico, sem IA (`src/lib/freight/matching.ts`). UF de origem/destino divergente é eliminatório (gate); carroceria e data são aditivos (nunca eliminam sozinhos — carroceria/data ausentes ou divergentes só reduzem o score). Pesos: origem 30, destino 30, carroceria 20, data 20. FORTE ≥70, PARCIAL ≥40. Só FORTE dispara notificação proativa no WhatsApp (anti-spam); PARCIAL fica disponível só no painel/`consultar_oportunidades_frete`. Simplificação deliberada da v1 (confirmada com o Rafael): sem raio geográfico/geocoding por mensagem — só UF/cidade.

## 7. Integração com ferramentas existentes

A "pré-análise" automática (`analisarOportunidadeParaMatch`) reaproveita `consultar_rota` (distância real) + `calcular_combustivel` (custo estimado, só combustível) + `analisar_frete` (classificação/margem) — sempre rotulada como **preliminar**. `verificar_piso_minimo_antt` não entra no pipeline automático (exige CCD/CC de busca web ao vivo, que só existe dentro de uma conversa Claude real) — só entra quando o cliente pede a análise completa numa conversa de verdade.

## 8. Fluxo WhatsApp

Comandos naturais (`gerenciar_radar_frete`/`consultar_oportunidades_frete` interpretados pela IA, sem sintaxe técnica). Notificação de oportunidade FORTE é enviada por texto simples E persistida na conversa normal do cliente (`messages`, `role: assistant`) — assim, quando o cliente responde "analisa" numa mensagem nova, a IA tem o contexto de qual oportunidade ele quer dizer (via `consultar_oportunidades_frete` LISTAR, resolvendo pelo status `notified` mais recente se ambíguo).

## 9. Fluxo painel

Nova seção `/frota/oportunidades`: Radares ativos (criar/pausar/reativar/cancelar), Oportunidades (score, Analisar/Favoritar/Ignorar), Grupos autorizados (só owner/admin, fontes privadas da empresa). Widget de chat do painel já "sabe" sobre oportunidades de graça — mesma engine, mesmas tools.

## 10. Grupo autorizado

Whitelist em `freight_sources`. Painel gerencia fontes **privadas** da própria empresa (owner/admin); fontes **globais** (`company_id` nulo, servem várias empresas) continuam só-backend nesta v1 — não existe hoje o conceito de "operador acima de todas as empresas" no produto para dar uma UI de gestão global sem risco.

## 11. Custo esperado

Fluxo comum (mensagem de grupo sem interesse) = R$0 de IA — descartada no pré-filtro em JS puro. Só mensagens que passam o filtro geram 1 chamada Claude de extração (barata, sem tools). Só matches FORTE disparam `consultar_rota` (Google Maps) + cálculo (grátis). Logs `[freight-radar] estagio=...` em cada etapa do funil para reconstruir a métrica `recebidas → possíveis → oportunidades → matches → notificações` via grep nos logs do Railway.

## 12. Testes

218 testes automatizados passando (204 pré-existentes + 14 novos): `cheapFilter.test.ts` (7 cenários incluindo mensagem bagunçada da etapa 55 e sem valor da etapa 56) e `matching.test.ts` (8 cenários: FORTE completo, gate de UF origem/destino, carroceria nunca elimina, radar sem destino fixo, janela de data, piso mínimo de score). `tsc`/`lint`/`build` limpos.

**Não testado nesta rodada** (precisa de teste real com Rafael, mesmo padrão de todo fluxo WhatsApp/OAuth deste projeto): grupo real do WhatsApp com o número do Frota IA dentro, mensagem de grupo real chegando no webhook, notificação real disparando, fluxo completo ponta a ponta pelo WhatsApp e pelo painel.

## 13. Limitações conhecidas desta v1

- Sem raio geográfico (só UF/cidade) — decisão deliberada de custo/simplicidade.
- Painel restringe criação de radar a owner/admin (mesmo padrão de Configurações); RLS do banco também libera `operator` — via WhatsApp um operador já consegue criar radar normalmente (a ferramenta de IA não tem essa restrição extra), só a tela do painel é mais estrita que o banco permitiria.
- Pré-análise automática usa só custo de combustível (não pneus/manutenção/depreciação/motorista) — sempre rotulada como preliminar.
- Fonte global (grupo que serve várias empresas) não tem UI de gestão — só cadastro manual via backend.
- Sem teste ao vivo com grupo real do WhatsApp ainda.

## 14. Roadmap futuro (só documentado, não implementado)

Fase A: API/parceria Fretebras. Fase B: API/parceria TruckPad. Fase C: outras bolsas de frete. Fase D: posição/geolocalização real do veículo. Fase E: match automático de ida+retorno. Fase F: score histórico personalizado por cliente. Fase G: contato/negociação integrada, só com autorização e integração oficial.
