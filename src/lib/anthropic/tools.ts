import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { FERRAMENTAS_FROTA_IA } from "@/ai/tools";
import type { DefinicaoParametroFerramenta } from "@/ai/tools";

/**
 * Campos de contexto (identidade, nunca dado de negócio) que nenhuma
 * ferramenta expõe ao Claude — são sempre injetados pelo backend depois
 * que o modelo decide chamar a ferramenta, nunca aceitos do que o modelo
 * "imaginou". Mesmo princípio de "não confiar em company_id enviado pelo
 * cliente" usado nas RLS policies da Camada 3, aplicado aqui à saída do
 * modelo. Usado por construirFerramentasAnthropic (para não anunciar esses
 * campos ao Claude) e pela rota /api/chat (para sobrescrever o que o
 * modelo tiver enviado nesses campos, se algo).
 */
// sourceMessageId segue o mesmo princípio: é a mensagem inbound desta rodada
// (ex.: a foto da nota fiscal), sempre injetada por gerarRespostaAssistente.ts
// — o modelo nunca sabe o id real da mensagem, só que "esta rodada" pode ter
// uma origem (ver registrar_despesa).
export const CAMPOS_DE_CONTEXTO_RESERVADOS = new Set(["userId", "companyId", "conversationId", "sourceMessageId"]);

function parametroParaJsonSchema(parametro: DefinicaoParametroFerramenta): Record<string, unknown> {
  const base: Record<string, unknown> = { description: parametro.descricao };

  switch (parametro.tipo) {
    case "string":
      base.type = "string";
      break;
    case "number":
      base.type = "number";
      break;
    case "boolean":
      base.type = "boolean";
      break;
    case "enum":
      base.type = "string";
      base.enum = parametro.valoresPossiveis ?? [];
      break;
  }

  return base;
}

/**
 * Converte as 12 ferramentas para o formato de tool use da Anthropic.
 *
 * Limitação conhecida: `DefinicaoParametroFerramenta` só descreve campos
 * primitivos (string/number/boolean/enum) — não expressa objetos ou listas
 * aninhadas (ex.: `opcoes` de comparar_pneus, `periodos`/`motoristas` de
 * calcular_jornada). Por isso o schema aqui é "aberto"
 * (`additionalProperties: true`): o Claude ainda consegue enviar essa
 * estrutura mais rica com base na descrição em texto da ferramenta, só não
 * tem a validação estrita de schema para ela. Toda ferramenta valida sua
 * entrada de forma defensiva e explica o que falta em vez de quebrar, então
 * isso é seguro — só menos preciso do que seria com um schema completo por
 * ferramenta (melhoria futura).
 */
export function construirFerramentasAnthropic(): Anthropic.Tool[] {
  return FERRAMENTAS_FROTA_IA.map((ferramenta) => {
    const parametrosVisiveis = ferramenta.parametros.filter((p) => !CAMPOS_DE_CONTEXTO_RESERVADOS.has(p.nome));

    return {
      name: ferramenta.nome,
      description: `${ferramenta.descricao} ${ferramenta.objetivo}`.trim(),
      input_schema: {
        type: "object" as const,
        properties: Object.fromEntries(parametrosVisiveis.map((p) => [p.nome, parametroParaJsonSchema(p)])),
        required: parametrosVisiveis.filter((p) => p.obrigatorio).map((p) => p.nome),
        additionalProperties: true,
      },
    };
  });
}

/**
 * Domínios oficiais (órgão público/regulatório) aos quais a busca web fica
 * restrita — cobre a ANTT (piso mínimo, RNTRC, resoluções, pedágio de
 * concessão federal), a ANP (preço de combustível), legislação/trânsito
 * (Planalto, DOU, Lexml, Senatran), malha rodoviária federal e estadual
 * (DNIT, DER-SP, DER-MG, + as 4 agências estaduais de pedágio), PRF (usa o
 * próprio "gov.br" já listado — não tem domínio próprio fora disso),
 * INMET (clima/alerta meteorológico) e os portais públicos de CT-e/MDF-e
 * (Sefaz nacional + SVRS, que atende o "Ambiente de Autorização" de vários
 * estados). Cada domínio foi verificado por busca real antes de entrar
 * aqui, nunca digitado de memória. Restringir a domínios (em vez de busca
 * livre) é o que torna essa ferramenta segura para dado regulatório: nunca
 * traz opinião de blog/terceiro como se fosse fonte oficial. Lista mantida
 * manualmente — ampliar conforme necessário, nunca remover um domínio
 * "porque não achou nada" numa busca isolada.
 *
 * Pedágio estadual de outros estados (fora SP/PR/SC/RS) ainda não tem
 * domínio cadastrado — ver regra correspondente no system prompt: nesse
 * caso a IA pede o valor ao cliente em vez de tentar buscar fora da
 * lista permitida. Concessionárias individuais (ex.: CCR, EcoRodovias)
 * também não têm domínio próprio cadastrado — a tarifa de cada praça já é
 * publicada pela ANTT (federal) ou pela agência estadual correspondente,
 * então essas duas fontes já cobrem o dado sem precisar mapear cada
 * concessionária uma a uma.
 */
const DOMINIOS_OFICIAIS: string[] = [
  "gov.br",
  "antt.gov.br",
  "anttlegis.antt.gov.br",
  "calculadorafrete.antt.gov.br",
  "anp.gov.br",
  "planalto.gov.br",
  "in.gov.br",
  "dnit.gov.br",
  "senatran.gov.br",
  "lexml.gov.br",
  "inmetro.gov.br",
  "inmet.gov.br",
  // Pedágio estadual — só as agências já verificadas (ver comentário acima).
  "artesp.sp.gov.br",
  "agepar.pr.gov.br",
  "aresc.sc.gov.br",
  "agergs.rs.gov.br",
  "daer.rs.gov.br",
  // Malha rodoviária estadual (DER) fora dos 4 estados acima.
  "der.sp.gov.br",
  "der.mg.gov.br",
  // Portais públicos de CT-e/MDF-e (layout, notas técnicas, regras — nunca
  // consulta de documento privado por chave de acesso, ver system prompt).
  "cte.fazenda.gov.br",
  "dfe-portal.svrs.rs.gov.br",
];

/**
 * Domínios comerciais de fabricante (pneu e caminhão/motor) — fonte de
 * ESPECIFICAÇÃO DE PRODUTO (capacidade de carga, índice de velocidade,
 * especificação de óleo, intervalo de manutenção recomendado), nunca de
 * preço nem de fato regulatório (isso continua vindo só dos domínios de
 * DOMINIOS_OFICIAIS acima). Mantida como lista separada por clareza de
 * manutenção e porque a regra de uso no system prompt é diferente — mas
 * tecnicamente as duas listas são concatenadas numa única allowed_domains
 * abaixo, porque a API da Anthropic só permite uma instância de
 * web_search/web_fetch por requisição (nome fixo "web_search"/"web_fetch"),
 * não dá pra ter uma segunda ferramenta de busca isolada só pra fabricante.
 * Cada domínio verificado por busca real (06/08/2026):
 */
const DOMINIOS_FABRICANTES: string[] = [
  // Pneus
  "michelin.com.br",
  "bridgestone.com.br",
  "goodyear.com.br",
  "conti.com.br", // Continental Brasil — domínio próprio, não continental.com.br
  "pirelli.com", // sem .com.br dedicado confirmado, site global com seção pt-br
  "vipal.com", // sem .com.br dedicado confirmado
  "prometeon.com", // ex-divisão industrial da Pirelli, site global com seção BR
  "tipler.com.br", // recapagem
  "borex.com.br", // recapagem
  // Caminhões / motores
  "scania.com", // sem .com.br dedicado, site global com seção /br/pt
  "volvotrucks.com.br",
  "mercedes-benz-trucks.com.br",
  "dafcaminhoes.com.br",
  "iveco.com", // sem .com.br dedicado, site global com seção /brasil
  "vwco.com.br", // Volkswagen Caminhões e Ônibus
  "agrale.com.br",
  "cummins.com", // sem .com.br dedicado, site global com seção pt-br
];

const TODOS_DOMINIOS_PERMITIDOS: string[] = [...DOMINIOS_OFICIAIS, ...DOMINIOS_FABRICANTES];

/**
 * Ferramenta de busca web nativa da Claude (server-side — não é uma das
 * FERRAMENTAS_FROTA_IA, roda na infraestrutura da Anthropic, não passa pelo
 * loop de execução local de gerarRespostaAssistente.ts). Restrita à união
 * dos domínios oficiais + fabricante acima (TODOS_DOMINIOS_PERMITIDOS),
 * para consultar piso mínimo/RNTRC/pedágio de concessão (ANTT + agências
 * estaduais), preço de referência de combustível (ANP), legislação/normas
 * de trânsito, restrição da PRF, malha rodoviária (DNIT/DER), alerta
 * meteorológico (INMET), portal público de CT-e/MDF-e, e especificação de
 * produto de fabricante (pneu/caminhão/motor) — sempre como pesquisa em
 * tempo real, nunca como base de conhecimento própria mantida por este
 * projeto (mais simples de manter, sempre atualizada). `max_uses` limita
 * buscas por resposta, controlando custo.
 */
export function construirFerramentaBuscaOficial(): Anthropic.WebSearchTool20260209 {
  return {
    type: "web_search_20260209",
    name: "web_search",
    max_uses: 3,
    allowed_domains: TODOS_DOMINIOS_PERMITIDOS,
  };
}

/**
 * Ferramenta de leitura de página completa (server-side, nativa da Claude)
 * — complementa a busca. `web_search` só devolve resumo/trecho dos
 * resultados, o que não é suficiente para extrair um valor numérico exato
 * de dentro de uma tabela (ex.: coeficiente CCD/CC de uma resolução ANTT,
 * tabela de tarifa de pedágio, especificação técnica de um manual). Só
 * consegue ler uma URL que já apareceu na conversa — por isso o fluxo
 * esperado é sempre buscar primeiro (achar a página) e só então ler ela por
 * completo com esta ferramenta, nunca usada isolada. Mesma lista de
 * domínios (oficial + fabricante) da busca.
 */
export function construirFerramentaLeituraOficial(): Anthropic.WebFetchTool20260209 {
  return {
    type: "web_fetch_20260209",
    name: "web_fetch",
    max_uses: 3,
    allowed_domains: TODOS_DOMINIOS_PERMITIDOS,
    max_content_tokens: 8000,
  };
}
