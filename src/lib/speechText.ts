/** Limpa apenas a cópia destinada à voz; preserva o texto e os valores exibidos. */
export function prepararTextoParaVoz(texto: string): string {
  return texto
    .replace(/\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[\uFE0E\uFE0F\u200D\u20E3]/gu, "")
    .replace(/[*#_`]/g, "")
    .replace(/\bCPK\b/gi, "custo por quilômetro rodado")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

