/**
 * Helpers numéricos e de formatação compartilhados entre as ferramentas de
 * cálculo. Mantém a regra comum a todas elas: nunca arredondar durante os
 * cálculos internos, apenas na saída.
 */

/** Casas decimais usadas por padrão no arredondamento da saída das ferramentas. */
export const CASAS_DECIMAIS_PADRAO = 2;

/**
 * Casas decimais padrão por tipo de grandeza, para ferramentas que
 * diferenciam moeda/CPK/percentual/etc. (ex.: `comparar_pneus`,
 * `calcular_custo_viagem`). Cada ferramenta pode ter suas próprias
 * constantes adicionais (ex.: casas de CPK, de km, de peso) quando o
 * valor padrão difere entre elas.
 */
export const CASAS_DECIMAIS_MOEDA_PADRAO = 2;
export const CASAS_DECIMAIS_PERCENTUAL_PADRAO = 2;
/** Grandezas por km (custo/km, receita/km, lucro/km, CPK) pedem mais precisão que moeda. */
export const CASAS_DECIMAIS_CUSTO_POR_KM_PADRAO = 4;

export function arredondar(valor: number, casas: number): number {
  const fator = 10 ** casas;
  return Math.round((valor + Number.EPSILON) * fator) / fator;
}

export function formatarBRL(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarNumero(valor: number): string {
  return valor.toLocaleString("pt-BR");
}

/**
 * `DefinicaoParametroFerramenta` (types.ts) só descreve campos primitivos
 * (string/number/boolean/enum) — não existe um "tipo lista/objeto" no
 * schema que vai pro Claude (ver comentário em src/lib/anthropic/tools.ts).
 * Por isso todo parâmetro que é, na prática, uma lista de objetos (ex.:
 * `opcoes` de comparar_pneus, `propostas` de analisar_frete, `cenarios`,
 * `motoristas` etc.) é anunciado ao modelo como `tipo: "string"` — e o
 * Claude, seguindo o schema à risca, manda a lista como JSON serializado
 * em texto em vez de um array de verdade. Sem isso, `entrada.opcoes.forEach`
 * (ou equivalente) quebra com TypeError em runtime — foi exatamente o que
 * aconteceu com comparar_pneus em teste real (05/08/2026), sempre que a
 * ferramenta era chamada de verdade.
 *
 * Aceita o valor já como array/objeto (passa direto) ou como string JSON
 * (faz o parse). Nunca lança — retorna `undefined` em caso de falha, pra
 * cair no fluxo já existente de "dados insuficientes" de cada ferramenta
 * em vez de derrubar a execução.
 */
export function normalizarPossivelJson<T>(valor: T | string | null | undefined): T | undefined {
  if (valor === null || valor === undefined) return undefined;
  if (typeof valor !== "string") return valor;
  try {
    return JSON.parse(valor) as T;
  } catch {
    return undefined;
  }
}
