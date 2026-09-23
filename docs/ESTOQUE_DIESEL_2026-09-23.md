# Abastecimento interno e piloto de grupo

## Operação

- Painel em Abastecimentos: entrada por nota/fornecedor/data/litros/total; preço unitário calculado. Uma reserva de diesel por empresa.
- Custo médio ponderado pelo saldo de litros e valor. Retirada registra abastecimento, despesa de consumo e baixa em uma transação PostgreSQL.
- Compra é aquisição de estoque: fica no histórico, não cria uma segunda despesa operacional. Não representa pagamento automático nem conta a pagar.
- Não importa nem desconta os abastecimentos antigos. Para iniciar, lançar a entrada que corresponda ao saldo físico inicial, com identificação clara e valor informado pelo usuário.
- Entradas e retiradas em ordem de data. Correção/estorno de movimento interno não implementado: edição/exclusão bloqueadas para preservar saldo. Abastecimento externo continua no formulário anterior.
- Retirada exige equipamento da empresa, condutor, litros, data e odômetro/horímetro. Horímetro não entra no cálculo de km/L.

## Grupo

- `FUEL_GROUP_ENABLED=true` habilita somente vínculos de `FUEL_GROUP_BINDINGS`.
- Cada vínculo contém `groupId`, `companyId`, `operatorId`, `senders` em dígitos internacionais e `dryRun` (padrão true).
- Operador delegado precisa manter vínculo ativo owner/admin/operator. Somente remetentes explicitamente autorizados são processados.
- Rascunho separado por empresa/grupo/remetente. Fotos e texto complementam dados. Confirmação exige código do rascunho e revisão atual; expira após duas horas sem atualização.
- `NOVO`/`CANCELAR` reiniciam a conferência; `RESUMO` e `TESTE ABASTECIMENTO` mostram pendências. Não há preços nas mensagens.
- `dryRun=true` não insere abastecimento/despesa/movimento; apenas evidências e deduplicação. A ida real até WhatsApp ainda precisa ser validada pelo usuário.
- `FUEL_MEDIA_HOSTS` contém os hosts exatos do armazenamento do provedor, separados por vírgula, após conferência. Sem configuração, imagens são recusadas e o sistema pede texto. HTTPS obrigatório; sem redirecionamento. Não liberar hosts arbitrários ou domínios amplos de nuvem.
- Antes de uso amplo: validar fotos reais e escolhas, confirmar participantes do grupo, política de retenção dos eventos e procedimento de estorno. Não liberar todos os grupos ou clientes automaticamente.

## Publicação e segurança

- Aplicar migrations `20260923030000` e `20260923031000` antes das flags; ambas aditivas, RLS nas novas tabelas e RPCs somente service_role.
- `FUEL_INTERNAL_ENABLED=true` libera painel/API e escrita real quando vínculo tiver dryRun=false.
- Migrações aplicadas manualmente no SQL Editor do projeto frotaia em 23/09/2026. Conferir o registro no histórico de migrations antes de usar db push para evitar reaplicação.
- Conferência antes/depois na empresa de teste: 8 equipamentos, 9 condutores, 5 abastecimentos, R$ 23.033,20. Nenhum movimento de estoque ou evento de grupo criado na implantação da estrutura.
- Validação local: 86 testes direcionados, lint, TypeScript e build webpack. Teste PostgreSQL isolado cobre atomicidade, custo médio, repetição, nota duplicada, empresa, vínculo inativo, estoque insuficiente, imutabilidade, isolamento de remetente e dry-run.
- Pendências de avisos anuais existentes no workspace não fazem parte desta publicação.
