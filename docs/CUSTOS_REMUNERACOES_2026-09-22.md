# Custos e remunerações

Área gerencial em `/frota/custos`, para transporte rodoviário, operações com equipamentos e outros serviços. Não substitui folha trabalhista.

## Como usar

1. Opcional: crie operações na aba **Operações**. Os nomes são livres. Um autônomo pode manter tudo em Geral.
2. Em **Novo cadastro**, escolha salário, pró-labore, seguro, aluguel, rastreador, administrativo ou outro.
3. Escolha fixo mensal, percentual, por produção ou fixo mais variável. Informe pessoa, motorista e veículo somente quando aplicável.
4. Caso compartilhe um custo entre operações, distribua 100% do valor. O rateio não duplica o custo.
   Em **Mês do vencimento**, escolha próprio mês ou mês seguinte. Setembro + mês seguinte + dia 5 vence em 05/10, sem mudar a competência de setembro. **Mês final** apenas encerra a recorrência; deixe vazio quando não existir término previsto. Cadastros antigos mantêm vencimento no próprio mês até serem editados. Meses já gerados não são alterados por uma edição da regra.
5. Selecione o mês e use **Gerar mês** em Cadastros recorrentes. Para comissão/produção, informe a base e sua origem. Não há busca automática dos fretes nem cálculo proporcional por dias.
6. Confira o rascunho. Ele pode ser descartado e gerado novamente. Só confirme depois de verificar se o mesmo custo já foi lançado manualmente.
7. Confirmar cria uma única despesa por cadastro/mês, na competência (dia 1). O vencimento fica na nova área. Isso não transfere dinheiro nem confirma pagamento.
8. Depois de pagar por fora, registre a data do pagamento. Isso não cria outra despesa.

## Histórico e limites desta versão

- Editar uma regra vale para lançamentos futuros. Meses gerados guardam valores, bases e rateios próprios.
- Arquivar uma regra preserva seu histórico.
- Lançamentos confirmados ficam protegidos contra edição/exclusão, inclusive pela tela antiga de Despesas. Não há estorno pela interface nesta versão; confira antes de confirmar.
- O registro de pagamento também não possui desfazer nesta versão.
- Recorrência é um cadastro reutilizável: não gera despesas automaticamente.
- Comissões têm base manual conferida. Encargos e benefícios devem ser cadastrados separadamente.
- “Pago” é parte do total confirmado, não um valor adicional.
- Relatórios existentes recebem o custo confirmado como despesa. O detalhamento por operação é consultado nesta nova área.
- Não foram inseridos salários, percentuais de divisão ou custos reais do cliente.

## Segurança e implementação

Migração aditiva `20260922190000_costs_and_remuneration.sql`: três tabelas com RLS, confirmação transacional e proteção de despesa vinculada. Não altera veículos, motoristas ou despesas existentes.

Somente owner/admin/operator da empresa acessam dados financeiros. A API deriva usuário/empresa da sessão; não aceita a empresa enviada pelo navegador. Uma restrição única impede gerar duas vezes a mesma regra no mesmo mês. Confirmações repetidas retornam a mesma despesa.
