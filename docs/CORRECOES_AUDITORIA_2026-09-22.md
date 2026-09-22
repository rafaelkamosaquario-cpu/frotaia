# Correções de 22/09/2026

Complemento aos PDFs históricos de 06–18/09. Os PDFs originais não foram sobrescritos.

## Preservação dos dados

As correções não incluem limpeza, exclusão, recadastro, redução automática da frota nem alteração em massa de veículos e motoristas. O plano acima de 10 veículos não faz parte desta entrega.

## Regras atualizadas

- Receitas/Despesas: owner e admin criam, editam e excluem; operator cria e edita; viewer apenas consulta. API e ferramentas financeiras do assistente verificam autorização.
- Chat web: valida entitlement da assinatura antes de chamar a IA, preservando liberação manual e acesso interno de administrador.
- Vínculos financeiros: os serviços verificam pertencimento à empresa antes de gravar veículo, motorista e outras referências suportadas.
- Pagamentos: log de recebimento não equivale a conclusão. Falha de processamento retorna 503 para permitir reentrega; o marcador de conclusão só é gravado após processamento. Repetição do mesmo anual preserva a validade já aplicada. Reversão total/chargeback só altera a assinatura correspondente ao pagamento, não uma contratação posterior. Reembolso parcial não revoga automaticamente o acesso.
- Cadastro em andamento: notificação de pagamento não deve reiniciar uma sessão que já avançou para coleta de dados.
- Ativação do painel: substituído o limite fixo de 10 pelo limite efetivo da empresa, contando veículos ativos. O achado de VEHICLE_LIMIT fixo nos documentos de 18/09 fica superado por esta alteração.
- Veículos: a versão anterior a esta correção já oferecia exclusão definitiva para owner/admin, além de desativação. A frase antiga “nunca exclusão física” não descreve mais o produto.
- Fretes e jornadas: ausência de formulário nessas telas não significa exclusividade de criação pelo WhatsApp; o assistente do painel compartilha o motor.
- Empresa, estilo de resposta e notícias possuem operações correspondentes no assistente; não são exclusivos do painel.
- Demo inicial por texto não deve ser confundida com todas as entradas multimodais do assistente completo. Radar depende de grupos autorizados; não há promessa de carga ou rentabilidade garantida.

## Homologação

Testes de escrita são locais com mocks, sem transações financeiras ou mensagens reais. Deploy e saúde do serviço devem ser conferidos separadamente; aprovação de teste local não substitui homologação integral com contas de teste.
