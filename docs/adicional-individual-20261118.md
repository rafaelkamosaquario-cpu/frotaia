# Adicional do aplicativo Individual

Plano-base WhatsApp e adicional têm registros de cobrança separados. R$ 9,90 compra um mês-calendário de acesso ao app; renovação soma ao prazo restante. Não há renovação automática nem oferta anual do adicional. Requer plano-base pago e ativo. A instalação é gratuita e não libera funções.

## Contratação
- Cliente usa seu WhatsApp cadastrado e pede vínculo do aplicativo; entra com a conta Google vinculada.
- /adicional-aplicativo mostra a situação e permite checkout Mercado Pago Pix/cartão ou contato para Pix manual.
- Webhook autenticado reconsulta pagamento, valida valor/moeda e concede somente o adicional.
- ADM: /contratacoes-diretas, localizar WhatsApp, selecionar empresa e usar “Adicional do aplicativo”. Copiar cobrança; conferir recebimento real de R$ 9,90; informar ID da transação e data; confirmar; copiar mensagem de liberação.
- Pagamento repetido não aumenta prazo. Estorno/chargeback revogam a concessão correspondente. Nenhum pagamento do adicional cancela ou renova a assinatura-base.

## Funções
WhatsApp: análises, arquivos compatíveis, registros e consultas da operação.
Aplicativo com adicional: conversa texto/voz compatível, Minha operação mensal, relatórios/PDF solicitados ao assistente, avisos, autorização Agenda Google e notícias (arquivo de resumos com data e busca atualizada).
O filtro visual existente é mensal; não anunciar dashboard semanal dedicado. Relatórios de outros períodos podem ser pedidos na conversa e precisam de conferência dos registros.
Novas contratações usam as ferramentas de agenda/lembretes/PDF no app. Notícias automáticas pelo WhatsApp ficam restritas a acessos anteriores. A entrega de lembretes usa o canal configurado e depende do job de despacho.

## Preservação e segurança
ADM e painel empresarial mantêm seus critérios de acesso. Snapshot de assinaturas pagas ativas na migração preserva o aplicativo incluído; concessões especiais do painel são preservadas em tempo de consulta. Nenhum dado operacional foi removido.
Tabelas com RLS; clientes não executam função de liberação. Pix manual exclusivo do administrador confirmado. Referência única impede duplicação mesmo entre origem manual e webhook.

## Validação
Migração aplicada; teste SQL transacional de replay, estorno, preservação da base e privilégios passou, seguido de rollback. Nenhum pagamento real foi feito. Testes automatizados não substituem teste real de Mercado Pago, Pix manual, OAuth Google e voz no dispositivo.

## Teste do proprietário
1. Contratar e ativar WhatsApp; testar análise e registro.
2. Vincular aplicativo: antes do adicional, deve abrir página de contratação.
3. Comprar adicional por um dos caminhos e conferir prazo.
4. Abrir Minha operação; confirmar registro enviado pelo mesmo WhatsApp.
5. Pedir PDF, consultar notícias e testar voz.
6. Autorizar Agenda Google e criar lembrete de teste.
7. Conferir entrega e renovação em ambiente de teste, sem simular pagamentos de clientes.
