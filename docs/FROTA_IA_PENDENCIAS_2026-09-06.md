# Frota IA — Itens em aberto (atualizado em 2026-09-10)

Lista consolidada de tudo que está pendente hoje, por categoria. Itens já fechados ficam marcados abaixo — o restante aguarda decisão ou execução.

## Já fechados

1. ~~`vehicles.current_odometer_km` como 4ª fonte de km~~ — ✅ feito 06/09 (commit `ab037d2`). O helper de manutenção por km agora também considera o campo manual do cadastro do veículo, além de abastecimento/pneu/manutenção.
2. ~~Testar prompt injection~~ — ✅ revisão estática do código feita 06/09; 1 lacuna real encontrada e corrigida (regra nova no `systemPrompt.ts` tratando conteúdo de imagem/PDF/página web sempre como dado, nunca instrução). **Teste comportamental ao vivo contra o modelo real continua em aberto**, se quiser fazer depois — precisa você logar no painel ou mandar teste pelo WhatsApp, não é algo que se faz só por revisão de código.
3. ~~Preço novo (Essencial/Pro)~~ — ✅ **implementado e no ar em 10/09/2026**. Catálogo virou Individual R$89,90 / Essencial R$149,90 (até 3 veículos) / Pro R$249,90 (até 10 veículos), todos com opção mensal (cartão) e anual (Pix ou cartão parcelado). Migration no Supabase, catálogo/checkout/tool do WhatsApp/landing page/limite de veículos (trigger de banco incluído) atualizados, 618 testes passando, deploy confirmado em produção sem erro. Detalhes técnicos completos em `docs/FROTA_IA_CHECKOUT_MERCADOPAGO_ATUAL.md` (seção 15).

## Aguardando sua decisão

4. **Pedágio via Maplink** — decidido em 02/08/2026 que seria por aí (não pela Routes API do Google), mas nada foi implementado. Falta você criar a conta na Maplink pra eu confirmar o schema real da API antes de codar.
5. **Patch "staged" pendente no Railway desde 26/08/2026** (34 mudanças, nunca aplicado nem descartado) — investigado em 10/09: a própria API do Railway classifica como não-destrutivo, provável sobra de sessão antiga sem efeito real. Ainda assim, melhor descartar pra limpar — só dá pra fazer no painel web do Railway (eu não tenho ferramenta pra isso), passos já passados a você, ainda não confirmado se foi feito.
6. **`frotaia.app.br` não resolve DNS** (achado em 10/09/2026, `ERR_NAME_NOT_RESOLVED`) — o domínio de serviço `frotaia.up.railway.app` funciona normal, então não é urgente, mas o domínio próprio configurado no Railway está fora do ar. Provável configuração pendente no registrador do domínio — fora do que eu consigo corrigir por código.
7. **Checkout novo não testado com clique real** — os 9 planos/formas de cobrança estão cobertos por teste automatizado e a rota `/assinar` responde normal em produção, mas nenhum link de checkout real chegou a ser gerado e conferido no Mercado Pago (tentativa em 10/09 interrompida por instabilidade do navegador; você optou por confiar nos testes automatizados por ora). Vale fazer esse teste de verdade (você mesmo, ou comigo) antes de divulgar o preço novo pra cliente de verdade.

## Riscos técnicos conhecidos, sem correção pedida ainda

8. **Chargeback/estorno do plano anual** — zero tratamento no código. Se um pagamento anual for estornado depois de aprovado, o acesso ao Painel não é revogado automaticamente.
9. **Webhook do WhatsApp sem teste de rota dedicado** — `src/app/api/whatsapp/webhook/route.ts` não tem teste automatizado próprio (só as peças que ele usa têm). Risco médio de regressão silenciosa em mudança futura nesse arquivo.
10. **Sem aviso automático antes do plano anual vencer** — hoje só o período de teste grátis (TRIAL) tem esse lembrete automático.
11. **Tokens estáticos na URL do webhook/crons** — funciona, mas é uma fraqueza arquitetural conhecida (não é vazamento comprovado).
12. **Falta de HMAC no webhook do WhatsApp** — limitação da própria Z-API (provedor não-oficial), não é algo corrigível sem trocar de provedor.
13. **Conta criada por número de telefone, sem OTP** — qualquer um que tenha acesso físico/temporário ao WhatsApp de alguém pode iniciar um cadastro nesse número.

## Dívida técnica / conteúdo, baixa prioridade

14. **Enum morto `awaiting_vehicle_count`** — sobra de um fluxo antigo, sem uso real, cosmético.
15. **Conteúdo dos 5 arquivos de `src/ai/conhecimentos/*.md`** (negociação, manutenção preventiva, pneus/direção econômica, gestão/indicadores, jornada/bem-estar) — ainda é a primeira versão (rascunho meu), nunca revisado com calma pra tom/precisão.
16. **4 chaves antigas do enum `subscription_plan`** (`MENSAL`, `GESTAO_MENSAL`, `ANUAL_PARCELADO`, `ANUAL_PIX`) ficaram órfãs desde a reestruturação de 10/09 — Postgres não deixa remover valor de enum, então continuam existindo no banco sem uso. Cosmético, não afeta nada.

## Também registrado, sem ação pedida

- **Ajustar exageros comerciais** de uma versão antiga do documento comercial ("segurança jurídica", "o produto se paga sozinho", "zero digitação") — o documento comercial novo (`FROTA_IA_COMERCIAL_ATUAL_2026-09-06.md`) já foi escrito sem essas frases, mas a versão antiga (`FROTA_IA_COMERCIAL_E_APRESENTACAO_DO_PRODUTO.md`) ainda existe no repo com o texto antigo, caso queira que eu corrija ou apague.
