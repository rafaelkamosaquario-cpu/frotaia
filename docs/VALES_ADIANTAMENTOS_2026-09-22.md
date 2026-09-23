# Vales e adiantamentos

Em Custos e remunerações, gere o lançamento do mês para a pessoa. Use Registrar vale/adiantamento no lançamento correspondente, informe valor, data e observação opcional. Registre somente dinheiro já entregue; esta função não transfere dinheiro.

Cada lançamento mostra histórico de vales, total adiantado e saldo restante. O custo bruto permanece integral em Despesas quando confirmado; adiantamentos não criam despesas adicionais. Não registre o mesmo vale novamente como outra despesa.

Funciona para motoristas, operadores e demais beneficiários, sem regras especiais por nome. Pessoas com mais de uma função podem receber vales em seus respectivos lançamentos; um mesmo vale não deve ser duplicado. Vales não são recorrentes e não passam automaticamente ao mês seguinte. Valores acima do saldo são rejeitados nesta versão.

Armazenamento aditivo no JSON snapshot. Campos originais são preservados, com histórico append-only contendo identificador, data, valor, observação e autoria. Gravação compare-and-swap protege concorrência e chave por requisição protege repetição. Quitação compara o snapshot e impede data anterior ao último vale. Descarte é bloqueado quando há vales. Isolamento por empresa permanece obrigatório. Sem migração ou alteração de veículos/motoristas. Histórico não tem edição/exclusão nesta versão.
