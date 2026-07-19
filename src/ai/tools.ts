/**
 * Ferramentas de calculo deterministico do Frota IA Assistente.
 * Os calculos sao feitos em codigo (nao pela IA), evitando erros de
 * arredondamento ou "alucinacao matematica". A Claude API decide quando
 * chamar cada ferramenta (tool use) e recebe o resultado para compor a
 * resposta final ao usuario.
 */

export const TOOLS = [
  {
        name: "calcular_cpk",
        description:
                "Calcula o Custo por Quilometro (CPK), dado o custo total no periodo e a quilometragem total percorrida. Use sempre que o usuario fornecer custo total e km rodados e pedir o CPK.",
        input_schema: {
                type: "object",
                properties: {
                          custoTotal: { type: "number", description: "Custo total no periodo, em reais." },
                          quilometragemTotal: {
                                      type: "number",
                                      description: "Quilometros totais percorridos no periodo.",
                          },
                },
                required: ["custoTotal", "quilometragemTotal"],
        },
  },
  {
        name: "calcular_consumo_combustivel",
        description:
                "Calcula os litros necessarios para uma distancia, o custo total de combustivel e o CPK de combustivel, dado o consumo medio do veiculo.",
        input_schema: {
                type: "object",
                properties: {
                          distanciaKm: { type: "number", description: "Distancia total da viagem, em km." },
                          consumoMedioKmL: {
                                      type: "number",
                                      description: "Consumo medio do veiculo, em km por litro.",
                          },
                          precoLitro: { type: "number", description: "Preco do litro do combustivel, em reais." },
                },
                required: ["distanciaKm", "consumoMedioKmL", "precoLitro"],
        },
  },
  {
        name: "calcular_viabilidade_frete",
        description:
                "Avalia se um frete e viavel, calculando custo de combustivel, custo total, resultado e margem percentual.",
        input_schema: {
                type: "object",
                properties: {
                          valorFrete: { type: "number", description: "Valor total recebido pelo frete, em reais." },
                          distanciaTotalKm: {
                                      type: "number",
                                      description:
                                                    "Distancia total considerada (incluindo retorno vazio, se houver), em km.",
                          },
                          consumoMedioKmL: {
                                      type: "number",
                                      description: "Consumo medio do veiculo, em km por litro.",
                          },
                          precoLitro: { type: "number", description: "Preco do litro do combustivel, em reais." },
                          pedagio: { type: "number", description: "Valor total de pedagios, em reais." },
                          outrosCustos: {
                                      type: "number",
                                      description:
                                                    "Soma de outros custos da viagem (alimentacao, carga/descarga, comissao, etc.), em reais.",
                          },
                },
                required: ["valorFrete", "distanciaTotalKm", "consumoMedioKmL", "precoLitro"],
        },
  },
  {
        name: "calcular_margem",
        description:
                "Calcula o resultado (lucro ou prejuizo) e a margem percentual, dado receita total e custo total.",
        input_schema: {
                type: "object",
                properties: {
                          receitaTotal: { type: "number", description: "Receita total, em reais." },
                          custoTotal: { type: "number", description: "Custo total, em reais." },
                },
                required: ["receitaTotal", "custoTotal"],
        },
  },
  {
        name: "calcular_ponto_equilibrio",
        description:
                "Calcula quantos km (ou fretes) sao necessarios para cobrir os custos fixos, dado o custo fixo do periodo e a margem de contribuicao por unidade.",
        input_schema: {
                type: "object",
                properties: {
                          custoFixoPeriodo: { type: "number", description: "Soma dos custos fixos no periodo, em reais." },
                          margemContribuicaoPorUnidade: {
                                      type: "number",
                                      description:
                                                    "Margem de contribuicao por km rodado ou por frete (receita variavel menos custo variavel, por unidade).",
                          },
                },
                required: ["custoFixoPeriodo", "margemContribuicaoPorUnidade"],
        },
  },
  ];

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

export function executeTool(name: string, input: Record<string, unknown>): unknown {
    switch (name) {
      case "calcular_cpk": {
              const { custoTotal, quilometragemTotal } = input as {
                        custoTotal: number;
                        quilometragemTotal: number;
              };
              if (!quilometragemTotal || quilometragemTotal <= 0) {
                        return { erro: "Quilometragem total deve ser maior que zero." };
              }
              return { cpk: round2(custoTotal / quilometragemTotal) };
      }

      case "calcular_consumo_combustivel": {
              const { distanciaKm, consumoMedioKmL, precoLitro } = input as {
                        distanciaKm: number;
                        consumoMedioKmL: number;
                        precoLitro: number;
              };
              if (!consumoMedioKmL || consumoMedioKmL <= 0) {
                        return { erro: "Consumo medio deve ser maior que zero." };
              }
              const litrosNecessarios = distanciaKm / consumoMedioKmL;
              const custoTotalCombustivel = litrosNecessarios * precoLitro;
              const cpkCombustivel = precoLitro / consumoMedioKmL;
              return {
                        litrosNecessarios: round2(litrosNecessarios),
                        custoTotalCombustivel: round2(custoTotalCombustivel),
                        cpkCombustivel: round2(cpkCombustivel),
              };
      }

      case "calcular_viabilidade_frete": {
              const {
                        valorFrete,
                        distanciaTotalKm,
                        consumoMedioKmL,
                        precoLitro,
                        pedagio = 0,
                        outrosCustos = 0,
              } = input as {
                        valorFrete: number;
                        distanciaTotalKm: number;
                        consumoMedioKmL: number;
                        precoLitro: number;
                        pedagio?: number;
                        outrosCustos?: number;
              };
              if (!consumoMedioKmL || consumoMedioKmL <= 0) {
                        return { erro: "Consumo medio deve ser maior que zero." };
              }
              const litrosNecessarios = distanciaTotalKm / consumoMedioKmL;
              const custoCombustivel = litrosNecessarios * precoLitro;
              const custoTotal = custoCombustivel + pedagio + outrosCustos;
              const resultado = valorFrete - custoTotal;
              const margemPercentual = valorFrete > 0 ? round2((resultado / valorFrete) * 100) : null;
              const fretePorKm = distanciaTotalKm > 0 ? round2(valorFrete / distanciaTotalKm) : null;

              let classificacao: string;
              if (resultado < 0) classificacao = "inviavel";
              else if (margemPercentual !== null && margemPercentual < 10) classificacao = "margem_baixa";
              else classificacao = "viavel";

              return {
                        custoCombustivel: round2(custoCombustivel),
                        pedagio: round2(pedagio),
                        outrosCustos: round2(outrosCustos),
                        custoTotal: round2(custoTotal),
                        resultado: round2(resultado),
                        margemPercentual,
                        fretePorKm,
                        classificacao,
              };
      }

      case "calcular_margem": {
              const { receitaTotal, custoTotal } = input as { receitaTotal: number; custoTotal: number };
              const resultado = receitaTotal - custoTotal;
              const margemPercentual = receitaTotal > 0 ? round2((resultado / receitaTotal) * 100) : null;
              return { resultado: round2(resultado), margemPercentual };
      }

      case "calcular_ponto_equilibrio": {
              const { custoFixoPeriodo, margemContribuicaoPorUnidade } = input as {
                        custoFixoPeriodo: number;
                        margemContribuicaoPorUnidade: number;
              };
              if (!margemContribuicaoPorUnidade || margemContribuicaoPorUnidade <= 0) {
                        return { erro: "Margem de contribuicao por unidade deve ser maior que zero." };
              }
              return {
                        unidadesNecessarias: round2(custoFixoPeriodo / margemContribuicaoPorUnidade),
              };
      }

      default:
              return { erro: `Ferramenta desconhecida: ${name}` };
    }
}
