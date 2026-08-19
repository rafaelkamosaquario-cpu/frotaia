/**
 * Radar de Fretes (MVP) — pré-filtro barato de mensagem de grupo, ANTES de
 * qualquer chamada à Claude (etapa 16/47 da spec: fluxo comum de "mensagem
 * sem interesse" tem que custar R$0 de IA). Heurística por palavra-chave —
 * não precisa ser perfeita, só descartar rápido o que claramente não é
 * oferta de frete ("bom dia pessoal", "alguém conhece borracharia?").
 */

const PADRAO_VALOR = /r\$\s?\d|\b\d{3,}[.,]?\d{0,2}\s?(reais|conto)\b/i;
const PADRAO_PESO = /\b\d+([.,]\d+)?\s?(t|ton|tonelada|toneladas|kg)\b/i;

const PALAVRAS_CARROCERIA = [
  "sider",
  "graneleiro",
  "baú",
  "bau",
  "caçamba",
  "cacamba",
  "tanque",
  "grade baixa",
  "prancha",
  "frigorífico",
  "frigorifico",
  "carreta",
  "bitrem",
  "rodotrem",
];

const PALAVRAS_TRANSPORTE = ["carga", "frete", "carregar", "descarregar", "caminhão", "caminhao", "motorista", "toco", "truck", "cavalo"];

function contemAlgumaPalavra(textoLower: string, palavras: string[]): boolean {
  return palavras.some((p) => textoLower.includes(p));
}

/**
 * Pontuação mínima de categorias batidas (de 4: valor/peso/carroceria/transporte)
 * para considerar "possível frete" e mandar pra extração por IA. Documentado
 * e ajustável — não precisa de perfeição, só reduzir o volume que chega na IA.
 */
export const PONTUACAO_MINIMA_POSSIVEL_FRETE = 2;

export interface AvaliacaoPreFiltro {
  pontuacao: number;
  categoriasBatidas: string[];
  parecePossivelFrete: boolean;
}

export function avaliarPossivelFrete(texto: string): AvaliacaoPreFiltro {
  const textoLower = texto.toLowerCase();
  const categoriasBatidas: string[] = [];

  if (PADRAO_VALOR.test(texto)) categoriasBatidas.push("valor");
  if (PADRAO_PESO.test(textoLower)) categoriasBatidas.push("peso");
  if (contemAlgumaPalavra(textoLower, PALAVRAS_CARROCERIA)) categoriasBatidas.push("carroceria");
  if (contemAlgumaPalavra(textoLower, PALAVRAS_TRANSPORTE)) categoriasBatidas.push("transporte");

  const pontuacao = categoriasBatidas.length;
  return { pontuacao, categoriasBatidas, parecePossivelFrete: pontuacao >= PONTUACAO_MINIMA_POSSIVEL_FRETE };
}
