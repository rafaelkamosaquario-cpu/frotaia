# V1 — correções de confiabilidade, 29/09/2026

Base: b14f112. Sem alteração em checkout, landing, preços ou cadastros existentes.

## Implementado

- Consultas de receitas/despesas leem todas as páginas com os filtros de empresa, veículo e período. Limite afeta somente o detalhamento; o total e a quantidade correspondem a todos os registros. Retorno informa quando a lista é parcial. Falha de página não retorna total parcial como sucesso.
- Total monetário somado em centavos.
- Consumo inclui litros intermediários sem odômetro entre primeira e última leitura. Registros externos a esse intervalo entram só no gasto. Todas as páginas são lidas, com ordenação estável.
- Odômetro inconsistente invalida a média, em vez de omitir trechos. Sem confirmação estruturada de tanque cheio, o resultado é identificado como estimativa, não consumo real medido.
- Radar informa falta de fonte autorizada ao criar/listar/reativar busca. Não promete que esteja captando ofertas quando não há fonte.
- Matching restringe fontes privadas às empresas autorizadas; fonte global exige cadastro explícito. Sem fonte habilitada, sem grupo ou com oferta expirada, não notifica. Consulta de oportunidades revalida autorização e validade, inclusive para matches antigos.

## Validações

- Suíte completa: 972/972 testes aprovados, incluindo 24 novos testes em relação à base de 948.
- TypeScript sem erros na checagem executada.
- Produção antes do deploy: saúde 200; alertas/notícias/checklist/expiração de fretes retornam 401 sem token. Nenhum disparo autorizado foi feito.
- Build local: Turbopack não aceita a junction de dependências fora da raiz; tentativa webpack encontrou restrição de rede/fontes e foi interrompida. Isso não equivale a build aprovado. A publicação deve ser confirmada pela revisão servida e pelo build do Railway.

Testes locais com serviços externos simulados; não enviam mensagens nem criam registros em produção. Regressões cobrem mais de 50/200/1.000 lançamentos, erro de paginação, litros sem km, intervalo incompleto, odômetro regressivo, fontes privadas/globais/desativadas, expiração e ausência de fontes.

O teste ao vivo não deve ser substituído pela suíte: requer conta de teste e checagem dos registros após conversa e no dia seguinte.

## Liberação comercial — pendências que não podem ser presumidas

1. Confirmar deploy e endpoint de saúde com a revisão corrigida.
2. Conferir agendas, últimas execuções e autenticação dos crons no Railway, sem disparar mensagens para clientes.
3. Usuário deve identificar grupo autorizado de fretes. Não cadastrar o grupo de abastecimento como fonte e não transformar fonte privada em global.
4. Homologar no número do usuário: registro, correção, reenvio, consulta e saldo. Verificar origem do registro e vínculo único abastecimento/despesa.
5. Validar lembrete e notícias com opt-in apenas da conta de teste e confirmação de recebimento pelo usuário.
6. Revisar atomicidade de abastecimento/despesa e semântica da exclusão antes de certificar todos os cenários de falha. Esta alteração não cria transação nova nem migra o banco.
7. Manutenção por km continua informativa. Não anunciar disparo automático por km nem rastreamento ao vivo; pneus dependem de atualização do cliente.

Não declarar o produto integralmente homologado apenas porque estas correções foram publicadas.
