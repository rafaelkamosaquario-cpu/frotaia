# Frota IA — Auditoria de Crons e Automações

**Data:** 2026-08-19
**Escopo:** auditoria de código (estática) dos 4 endpoints HTTP de disparo automático (`/api/checklists/dispatch`, `/api/alerts/dispatch`, `/api/news/dispatch`, `/api/subscriptions/trial-warnings/dispatch`). Puramente investigativa — nenhuma correção foi implementada.
**Método:** leitura completa dos 4 arquivos de rota e dos serviços que eles chamam, grep por configuração de cron no repositório.

## 1. Configuração de cron

**Não existe no repositório.** Sem `railway.json`/`railway.toml`, sem script de cron em `package.json`. O agendamento é configurado manualmente no dashboard do Railway, como um serviço "Cron Job" separado, fora do controle de versão — confirmado, não presumido (`docs/camada-6-whatsapp-v1.md:178-182`, `.env.example:129-154`).

## 2. Inventário

Exatamente 4 rotas (grep `dispatch|cron|schedule` em `src/app/api/`, sem 5ª rota):
- `/api/checklists/dispatch`
- `/api/alerts/dispatch`
- `/api/news/dispatch`
- `/api/subscriptions/trial-warnings/dispatch` (documentado, não analisado em detalhe de pagamento — fora do escopo de alteração)

## 3. Autenticação — os 4 endpoints

| Endpoint | Env var | Comparação | Método |
|---|---|---|---|
| `/api/checklists/dispatch` | `CHECKLIST_DISPATCH_SECRET` | `timingSafeEqual` | GET only |
| `/api/alerts/dispatch` | `ALERTS_DISPATCH_SECRET` | `timingSafeEqual` | GET only |
| `/api/news/dispatch` | `NEWS_DISPATCH_SECRET` | `timingSafeEqual` | GET only |
| `/api/subscriptions/trial-warnings/dispatch` | `TRIAL_WARNINGS_DISPATCH_SECRET` | `timingSafeEqual` | GET only |

A função `tokensMatch` (comparação timing-safe) está **duplicada** em cada um dos 4 arquivos de rota, não compartilhada. Token trafega via query string (`?token=`), sujeito a aparecer em logs de acesso HTTP/Railway. `CHECKLIST_DISPATCH_SECRET` não está documentado em `.env.example` (as outras 3 estão) — inconsistência de documentação.

## 4. Timezone — 3 abordagens diferentes, nenhuma usa lib de fuso

| Endpoint | Cálculo | Base |
|---|---|---|
| Checklist | "início do dia Brasília" hardcoded, `setUTCHours(3,0,0,0)` | UTC-3 fixo |
| Alertas | `scheduled_for <= now()` — instante UTC puro, sem noção de "dia" | resolvido antes, na criação do alerta |
| Notícias | "início do dia UTC" (não Brasília — ~3h de diferença, reconhecido no próprio comentário do código) | UTC puro |
| Trial warnings | `Date.now()` bruto vs. offsets em ms (5×24h, 24h) | epoch puro |

Nenhum usa `date-fns-tz`/`Intl.DateTimeFormat` com timeZone. Não é bug hoje (Brasil não tem DST desde 2019), mas é 3 implementações manuais divergentes do mesmo conceito.

## 5. Idempotência / antiduplicação

| Endpoint | Mecanismo | Lock de banco |
|---|---|---|
| Checklist | Query de elegibilidade exclui quem já tem `sent_at` de hoje | Nenhum |
| Alertas | `status='pending'` filtrado, mas `markAlertSent`/`Failed` fazem `UPDATE ... WHERE id=X` sem `AND status='pending'` | Nenhum |
| Notícias | `daily_news_last_sent_at` checado antes, marcado só depois do loop de envio | Nenhum |
| Trial warnings | `trial_avisado_dia5`/`ultimo_dia`, marcado só depois do envio | Nenhum |

**Nenhum dos 4 tem lock explícito** (`SELECT FOR UPDATE`, `UPDATE...WHERE status=X` atômico, ou constraint única). Toda proteção é idempotência por efeito colateral de query, não garantia transacional. Duas execuções concorrentes do cron (ex.: disparo manual + cron ao mesmo tempo) poderiam, em teoria, duplicar envios em notícias/trial-warnings (a marcação de "enviado" ocorre depois do loop) e reprocessar alertas (update não é compare-and-swap).

## 6. Ordem gravação-vs-envio (retry)

- **Checklist**: grava o dispatch **antes** de confirmar o envio via WhatsApp — falha de Z-API após o INSERT deixa um registro "fantasma" que bloqueia reenvio no mesmo dia, sem reprocessamento automático.
- **Alertas**: marca `sent`/`failed` **depois** da tentativa — reflete o resultado real, mas alertas `failed` ficam permanentemente sem retry automático.
- **Notícias/Trial warnings**: marcam "enviado" só depois do loop de envio de todos os números — se nenhum sucesso, a empresa continua elegível na próxima execução (reprocessamento incidental, não por lógica de retry dedicada).

Em nenhum dos 4 existe fila de retry dedicada — a única forma de reprocessamento é a próxima execução do cron externo encontrar o registro ainda elegível.

## 7. Batching

| Endpoint | Limite |
|---|---|
| Checklist | **Sem `LIMIT`** — processa todos os elegíveis numa única execução HTTP |
| Alertas | `LIMIT 50` |
| Notícias | `LIMIT 200` |
| Trial warnings | `LIMIT 200` |

Nenhum implementa paginação real (cursor/offset) — o excedente além do limite só é pego na próxima chamada do cron.

## 8. Falha parcial (1 registro não aborta os demais)

Confirmado nos 4 — cada um processa em loop com `try/catch` por item, uma falha individual não interrompe o restante do lote.

## 9. Z-API — envio ≠ entrega

Confirmado nos 4: o código trata sucesso da chamada HTTP ao Z-API como "enviado" — não há confirmação de entrega real (não seria possível sem um webhook de status de entrega, que não existe hoje). Isso é uma limitação conhecida da integração, não um bug de código.

---

## Resumo de riscos observados (fatos, sem correção aplicada)

| # | Risco | Endpoint(s) | Severidade sugerida |
|---|---|---|---|
| 1 | Sem lock/constraint única para evitar duplo processamento concorrente | Todos os 4 | P2 — nunca observado em produção (só 1 execução por vez via Railway), mas é uma garantia ausente |
| 2 | Checklist sem `LIMIT` de lote | `/api/checklists/dispatch` | P3 — hoje o volume é pequeno (3 empresas reais) |
| 3 | Checklist grava dispatch antes de confirmar envio (registro fantasma em caso de falha Z-API) | `/api/checklists/dispatch` | P3 |
| 4 | Alertas com falha ficam `failed` permanentemente, sem retry | `/api/alerts/dispatch` | P3 |
| 5 | Janela de corrida entre "enviar" e "marcar enviado" pode duplicar mensagem se o cron rodar 2x em sucessão rápida | Notícias, Trial warnings | P3 |
| 6 | 3 cálculos de timezone diferentes, nenhum com lib de fuso | Checklist vs. Notícias vs. Alertas/Trial | P3 — não é bug hoje (sem DST no Brasil) |
| 7 | `CHECKLIST_DISPATCH_SECRET` não documentado em `.env.example` | Checklist | P3 — risco de deploy sem o secret (mitigado: rota responde 503, não falha silenciosamente) |
| 8 | Token do cron trafega em query string, pode aparecer em logs de acesso | Todos os 4 | P3 |
| 9 | Nenhuma configuração de cron versionada no repositório | Todos os 4 | Informativo — depende de configuração manual no Railway, fora do controle de versão |

Nenhum item acima foi corrigido — aguardando decisão sobre quais valem a pena implementar.
