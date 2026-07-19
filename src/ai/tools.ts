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
  {
    name: "comparar_pneu_novo_recapado",
    description:
      "Compara o custo por quilometro de um pneu novo versus um pneu recapado, dado o preco e a vida util estimada (em km) de cada opcao. Use quando o usuario perguntar se compensa recapar ou comprar pneu novo.",
    input_schema: {
      type: "object",
      properties: {
        precoPneuNovo: { type: "number", description: "Preco de um pneu novo, em reais." },
        vidaUtilKmPneuNovo: {
          type: "number",
          description: "Vida util estimada do pneu novo, em quilometros.",
        },
        precoRecapagem: { type: "number", description: "Preco de uma recapagem, em reais." },
        vidaUtilKmRecapagem: {
          type: "number",
          description: "Vida util estimada apos a recapagem, em quilometros.",
        },
      },
      required: [
        "precoPneuNovo",
        "vidaUtilKmPneuNovo",
        "precoRecapagem",
        "vidaUtilKmRecapagem",
      ],
    },
  },
  {
    name: "planejar_manutencao_preventiva",
    description:
      "Calcula quantos km faltam para a proxima manutencao preventiva e, se informada a media de km rodados por dia, estima em quantos dias ela sera necessaria. Use para planejamento de manutencao.",
    input_schema: {
      type: "object",
      properties: {
        kmAtual: { type: "number", description: "Quilometragem atual do veiculo." },
        kmUltimaRevisao: {
          type: "number",
          description: "Quilometragem registrada na ultima revisao/manutencao.",
        },
        intervaloKmRevisao: {
          type: "number",
          description: "Intervalo recomendado entre revisoes, em quilometros.",
        },
        mediaKmPorDia: {
          type: "number",
          description: "Media de quilometros rodados por dia (opcional, para estimar dias restantes).",
        },
      },
      required: ["kmAtual", "kmUltimaRevisao", "intervaloKmRevisao"],
    },
  },
  {
    name: "simular_reducao_custos",
    description:
      "Compara um custo atual com um custo proposto (apos alguma mudanca operacional) e calcula a economia em reais, em percentual e, se informada a quilometragem, o impacto no CPK. Use para simular reducao de custos.",
    input_schema: {
      type: "object",
      properties: {
        custoAtualPeriodo: { type: "number", description: "Custo total atual no periodo, em reais." },
        custoPropostoPeriodo: {
          type: "number",
          description: "Custo total estimado apos a mudanca proposta, no mesmo periodo, em reais.",
        },
        quilometragemPeriodo: {
          type: "number",
          description: "Quilometragem total do mesmo periodo (opcional, para calcular impacto no CPK).",
        },
      },
      required: ["custoAtualPeriodo", "custoPropostoPeriodo"],
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

    case "comparar_pneu_novo_recapado": {
      const { precoPneuNovo, vidaUtilKmPneuNovo, precoRecapagem, vidaUtilKmRecapagem } = input as {
        precoPneuNovo: number;
        vidaUtilKmPneuNovo: number;
        precoRecapagem: number;
        vidaUtilKmRecapagem: number;
      };
      if (!vidaUtilKmPneuNovo || vidaUtilKmPneuNovo <= 0 || !vidaUtilKmRecapagem || vidaUtilKmRecapagem <= 0) {
        return { erro: "Vida util em km deve ser maior que zero para ambas as opcoes." };
      }
      const custoPorKmNovo = precoPneuNovo / vidaUtilKmPneuNovo;
      const custoPorKmRecapado = precoRecapagem / vidaUtilKmRecapagem;
      const diferenca = custoPorKmNovo - custoPorKmRecapado;
      const economiaPercentual =
        custoPorKmNovo > 0 ? round2((diferenca / custoPorKmNovo) * 100) : null;

      let opcaoMaisEconomica: string;
      if (Math.abs(diferenca) < 0.0001) opcaoMaisEconomica = "equivalente";
      else opcaoMaisEconomica = diferenca > 0 ? "recapado" : "novo";

      return {
        custoPorKmNovo: round2(custoPorKmNovo),
        custoPorKmRecapado: round2(custoPorKmRecapado),
        economiaPercentual,
        opcaoMaisEconomica,
      };
    }

    case "planejar_manutencao_preventiva": {
      const { kmAtual, kmUltimaRevisao, intervaloKmRevisao, mediaKmPorDia } = input as {
        kmAtual: number;
        kmUltimaRevisao: number;
        intervaloKmRevisao: number;
        mediaKmPorDia?: number;
      };
      if (!intervaloKmRevisao || intervaloKmRevisao <= 0) {
        return { erro: "Intervalo de revisao em km deve ser maior que zero." };
      }
      const kmRodadosDesdeRevisao = kmAtual - kmUltimaRevisao;
      const kmRestantes = round2(intervaloKmRevisao - kmRodadosDesdeRevisao);
      const diasRestantesEstimados =
        mediaKmPorDia && mediaKmPorDia > 0 ? round2(kmRestantes / mediaKmPorDia) : null;

      let status: string;
      if (kmRestantes <= 0) status = "atrasado";
      else if (kmRestantes <= intervaloKmRevisao * 0.1) status = "proximo";
      else status = "em_dia";

      return {
        kmRodadosDesdeRevisao: round2(kmRodadosDesdeRevisao),
        kmRestantes,
        diasRestantesEstimados,
        status,
      };
    }

    case "simular_reducao_custos": {
      const { custoAtualPeriodo, custoPropostoPeriodo, quilometragemPeriodo } = input as {
        custoAtualPeriodo: number;
        custoPropostoPeriodo: number;
        quilometragemPeriodo?: number;
      };
      const economiaValor = custoAtualPeriodo - custoPropostoPeriodo;
      const economiaPercentual =
        custoAtualPeriodo > 0 ? round2((economiaValor / custoAtualPeriodo) * 100) : null;
      const cpkAtual =
        quilometragemPeriodo && quilometragemPeriodo > 0
          ? round2(custoAtualPeriodo / quilometragemPeriodo)
          : null;
      const cpkProposto =
        quilometragemPeriodo && quilometragemPeriodo > 0
          ? round2(custoPropostoPeriodo / quilometragemPeriodo)
          : null;

      let classificacao: string;
      if (economiaValor > 0) classificacao = "reducao";
      else if (economiaValor < 0) classificacao = "aumento";
      else classificacao = "neutro";

      return {
        economiaValor: round2(economiaValor),
        economiaPercentual,
        cpkAtual,
        cpkProposto,
        classificacao,
      };
    }

    default:
      return { erro: `Ferramenta desconhecida: ${name}` };
  }
}
