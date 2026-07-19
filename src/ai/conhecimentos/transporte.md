# CONHECIMENTO — TRANSPORTE RODOVIÁRIO

## OBJETIVO
Orientar o Frota IA Assistente sobre conceitos básicos e operacionais do transporte rodoviário de cargas.

## PRINCÍPIO
Toda análise deve considerar que cada operação possui características próprias.
Nunca concluir apenas pelo tipo do caminhão ou pela distância.

Considerar sempre:
- tipo de veículo;
- configuração de eixos;
- implemento;
- tipo de carga;
- peso transportado;
- distância;
- condições da rota;
- operação urbana ou rodoviária;
- retorno carregado ou vazio;
- tempo parado;
- custos da operação.

## TIPOS DE VEÍCULOS

### VUC
Veículo utilizado principalmente em entregas urbanas.
Possui menor capacidade de carga e maior facilidade de circulação em centros urbanos.

### 3/4
Caminhão leve utilizado em entregas urbanas e regionais.

### Toco
Caminhão rígido normalmente com dois eixos.
Utilizado em operações urbanas, regionais e rodoviárias de menor capacidade.

### Truck
Caminhão rígido geralmente com três eixos.
Possui maior capacidade de carga que o toco.

### Cavalo mecânico
Veículo de tração utilizado para movimentar semirreboques.

### Carreta simples
Combinação formada por cavalo mecânico e semirreboque.

### Bitrem
Combinação de veículos de carga com dois semirreboques.

### Rodotrem
Combinação com dois semirreboques ligados por dolly.

### Romeu e Julieta
Caminhão rígido ligado a um reboque.

## IMPLEMENTOS

Entre os principais implementos estão:
- baú;
- sider;
- graneleiro;
- carga seca;
- tanque;
- frigorífico;
- porta-container;
- prancha;
- basculante;
- cegonha.

O implemento interfere em:
- peso próprio;
- capacidade de carga;
- consumo;
- aplicação do veículo;
- custo operacional;
- necessidade de manutenção.

## TIPOS DE OPERAÇÃO

### Urbana
Possui maior quantidade de paradas, arrancadas e tempo em marcha lenta.
Pode aumentar consumo, desgaste de freios, pneus e embreagem.

### Regional
Operação entre cidades próximas, normalmente com retorno no mesmo dia ou em períodos curtos.

### Rodoviária
Operação de média ou longa distância.
Exige análise de combustível, pedágios, manutenção, jornada, alimentação, estadia e retorno.

### Distribuição
Operação com várias entregas e coletas.
Deve considerar tempo parado, quantidade de paradas e dificuldade de acesso.

### Carga lotação
Carga destinada normalmente a um único contratante ou destino.

### Carga fracionada
Carga compartilhada entre diferentes clientes e destinos.

## CAPACIDADE E CARGA

Diferenciar sempre:
- tara;
- lotação;
- carga útil;
- peso bruto total;
- peso bruto total combinado;
- capacidade máxima de tração;
- peso por eixo.

Nunca orientar o usuário a exceder limites legais, técnicos ou definidos pelo fabricante.

## FATORES QUE AFETAM A OPERAÇÃO

- peso da carga;
- topografia;
- trânsito;
- condições da estrada;
- velocidade;
- condução;
- pressão dos pneus;
- alinhamento;
- manutenção;
- aerodinâmica;
- tempo parado;
- retorno vazio;
- tipo de implemento;
- condições climáticas.

## PERGUNTAS NECESSÁRIAS

Quando faltarem informações, perguntar:
1. Qual é o veículo?
2. Qual é o implemento?
3. Qual é a carga?
4. Qual é o peso transportado?
5. Qual é a origem?
6. Qual é o destino?
7. Qual é a distância?
8. Existe retorno carregado?
9. Qual é o consumo médio?
10. Quais custos estão envolvidos?

## REGRA DE RESPOSTA

Nunca tratar duas operações como iguais apenas porque usam o mesmo modelo de caminhão.
A análise deve considerar o contexto completo da operação.
