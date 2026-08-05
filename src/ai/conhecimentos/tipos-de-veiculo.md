# Tipos de veículo e configuração de eixos

> Referência de classificação (CONTRAN + terminologia de mercado). Usada tanto pela ferramenta `consultar_conhecimento_operacional` quanto pelo classificador de configuração de veículo do cadastro (onboarding). Número de eixos aqui é o total do conjunto (cavalo + implemento, quando articulado) — é esse número que `verificar_piso_minimo_antt` usa, nunca uma estimativa feita na hora.

## Veículos rígidos (não articulados — um chassi só)

| Tipo | Eixos | PBT/PBTC | Observação |
|---|---|---|---|
| Utilitário / VUC | 2 | até 3,5 t (utilitário) / acima disso (VUC) | uso urbano, restrições de circulação reduzidas |
| Três-quartos (3/4) | 2 | até 10 t | rodado duplo atrás, intermediário entre VUC e toco |
| Toco | 2 | até 16 t | simples na frente, duplo atrás |
| Truck / Trucado | 3 | até 23 t | um eixo dianteiro, dois traseiros — variações 6×2 ou 6×4 são sobre tração (quantos eixos puxam), não mudam o total de eixos |
| Bitruck | 4 (aprox.) | até 33 t | eixo adicional próximo ao dianteiro, versão maior do truck |

## Composições articuladas (cavalo mecânico + implemento)

Cavalo mecânico sozinho não define o total de eixos — depende do que está engatado:

| Composição | Eixos (cavalo + implemento) | PBTC | Observação |
|---|---|---|---|
| Cavalo toco + carreta simples | 2 + 3 = 5 | ~41,5 t | "Romeu e Julieta", a mais comum nas estradas |
| Cavalo trucado + carreta simples | 3 + 3 = 6 | ~48,5 t | mesma carreta, cavalo maior |
| Cavalo trucado + bitrem | 3 + 2 + 2 = 7 | ~57 t | dois implementos, cada um só com eixo traseiro (5ª roda) |
| Cavalo trucado + bitrenzão | 3 + 3 + 3 = 9 | ~74 t | como o bitrem, mas com um eixo a mais em cada implemento |
| Cavalo trucado + rodotrem | 3 + 2 + 4 = 9 | ~74 t | segundo implemento com eixos na frente e atrás, conectado por cambão rígido — consegue ficar em pé sozinho mesmo desacoplado |
| Carreta 4 eixos | 3 + 4 = 7 | ~58,5 t | substituiu a carreta vanderleia (praticamente fora de produção desde 2022) |

Bitrem, bitrenzão e rodotrem exigem AET (Autorização Especial de Trânsito) — isso é informação de contexto, não algo que a IA calcula.

## Como isso se conecta com o resto do sistema

- `axle_count` (número de eixos) e `vehicle_type` do veículo cadastrado alimentam diretamente `verificar_piso_minimo_antt` — sem precisar perguntar de novo a cada cálculo.
- "Baú", "graneleiro", "sider", "caçamba" etc. são tipo de carroceria/implemento, não configuração de eixos — não têm campo próprio no cadastro ainda; se o cliente mencionar isso, vale esclarecer que a pergunta é sobre a configuração do veículo (toco, truck, cavalo mecânico + o que ele puxa), não sobre a carroceria.
- 6×2 vs. 6×4 é sobre tração (quantos eixos recebem força do motor), não muda a contagem total de eixos — não é preciso perguntar isso para preencher `axle_count`.
