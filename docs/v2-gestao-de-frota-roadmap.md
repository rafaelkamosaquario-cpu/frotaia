# V2 — Painel de gestão de frota (roadmap, não iniciado)

Status: **planejamento, sem início de construção** (decisão do Rafael em 09/08/2026: documentar agora, codar depois).

## Contexto

O Frota IA V1 (WhatsApp-first, sem painel pro cliente) é pra motorista autônomo — 1 veículo por conta, trava real no banco (`vehicles_one_active_per_company_idx`). Rafael quer expandir pra atender também transportadora com frota (vários veículos, vários motoristas), usando como referência visual/funcional um protótipo que ele já tem: `rafaelkamosaquario-cpu/Projetos-` (branch `gh-pages`, pasta `frotabot/`) — front-end vanilla JS (`admin/`) + backend Python/Flask separado (`bot/`), com seu próprio Postgres e sua própria instância Z-API.

**Decisões já confirmadas com o Rafael:**
1. **V1 e V2 coexistem** — motorista autônomo continua exatamente como está hoje (1 veículo, WhatsApp-only). V2 é um tipo de conta novo, pra transportadora com frota — não altera nem quebra nada do que já existe.
2. **Painel V2 continua uso interno/admin**, não é o cliente final logando (mesma régua da V1: `CUSTOMER_PANEL_ENABLED` continua controlando isso).
3. Sem prazo definido — é pra planejar agora, construir quando o Rafael decidir avançar.

## Auditoria do protótipo (`Projetos-/frotabot`) — o que aproveitar e o que NUNCA repetir

Fiz uma auditoria completa do código-fonte (frontend `admin.js`/`index.html`/`admin.css` e backend Python `main.py`/`database.py`/`whatsapp.py`) em 09/08/2026. Aproveitar como **referência de UX/funcionalidade**, nunca como código a portar — a stack é completamente diferente (Flask/SQLAlchemy/Postgres próprio vs. Next.js/Supabase/RLS que o Frota IA real já usa, e que é estritamente mais robusto no que já existe).

**Boas ideias de produto pra reaproveitar (conceito, não código):**
- Telas: Empresas, Veículos, Motoristas, Manutenção, Documentos, Checklists, Alertas, Relatórios — bom mapa de funcionalidade pra transportadora.
- Checklist diário automatizado por WhatsApp (pergunta sobre pneu/freio/luz/combustível, rastreia tentativa e resposta).
- Rastreio de documento por tipo (CNH, Tacógrafo, Toxicológico, Licenciamento, RNTRC) além do que já existe (seguro/licenciamento no veículo).
- Página de Relatório consolidado (economia estimada, etc.).

**Falhas reais encontradas — nunca repetir na V2 real:**
- ⚠️ **Nenhuma rota da API tem autenticação** — qualquer um com a URL lê/escreve dado de qualquer empresa. A V2 real precisa de RLS via Supabase (mesmo padrão já usado em todo o Frota IA) desde o primeiro commit, nunca "depois eu protejo".
- ⚠️ **Login com e-mail/senha em texto puro dentro do JS do cliente** — nunca fazer isso; usar Supabase Auth (já existe e já funciona pro painel admin atual).
- **Agendamento em memória (APScheduler dentro do próprio processo Flask)** — frágil, reseta se o serviço reiniciar/dormir. A V2 real deve seguir o padrão já validado no Frota IA: cron externo do Railway chamando uma rota protegida por token (ver `/api/alerts/dispatch`, `/api/news/dispatch`, `/api/subscriptions/trial-warnings/dispatch`).
- **Inconsistência de schema**: `Motorista` tem dois campos pra vincular veículo ao mesmo tempo (`veiculo_placa` e `veiculo_atual_id`) — evitar campo duplicado/redundante. `Documento` não tem chave estrangeira nenhuma — sempre referenciar de verdade.
- **Números do Dashboard não bateram com as listas** no teste ao vivo (12 empresas no card vs. 4 na lista) — Rafael confirmou que é dado fictício de teste, mas é um lembrete de sempre validar que agregados batem com a fonte antes de confiar num relatório.

## Caminho técnico recomendado (alto nível, não é plano de implementação ainda)

1. **Nunca portar o backend Python** — construir nativo na stack real (Next.js + Supabase), reaproveitando tudo que já existe (RLS, migrations, padrão de service/schema Zod, cron via Railway, `subscriptionService`/gating já prontos).
2. **`company_type = 'transportadora'`** (já existe no enum hoje, só não é usado pra diferenciar comportamento) vira o gatilho: quando a empresa é desse tipo, a trava de 1 veículo por conta não se aplica, e o painel libera as telas de frota.
3. Novas tabelas necessárias (nomes preliminares): `drivers`/`motoristas` (com `company_id`, `vehicle_id`, `phone_e164` próprio — motorista pode ter WhatsApp diferente do dono da conta), `vehicle_documents` (tipo genérico — CNH/tacógrafo/toxicológico/licenciamento/RNTRC — em vez de campo fixo por tipo), `maintenance_schedules`, `checklist_dispatches`/`checklist_responses`.
4. Checklist diário reaproveita o padrão de cron já estabelecido (Fase equivalente a `/api/news/dispatch`), não um scheduler novo.
5. Painel web: novas rotas dentro do app Next.js existente (não um projeto separado) — telas React reais consumindo Supabase, não HTML/JS estático.

## Próximo passo, quando o Rafael quiser avançar
Retomar este documento, confirmar prioridade de qual tela construir primeiro (provavelmente Empresas + Veículos + Motoristas, base de tudo o resto), e então sim entrar em plano de implementação fase a fase (mesmo processo usado pra pagamento/notícias — schema primeiro, depois service, depois UI, sempre validado com teste real antes de dar por concluído).
