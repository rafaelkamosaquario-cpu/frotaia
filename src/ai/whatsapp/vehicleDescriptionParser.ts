/**
 * Parser determinístico e conservador de marca/modelo/ano a partir do texto
 * livre do onboarding (ex.: "Scania R450 2022") — fechamento de coerência
 * (08/2026): `vehicles.brand`/`model`/`model_year` já existem no schema
 * desde a criação da tabela, mas o onboarding sempre gravou esse texto só
 * em `name`/`notes`, deixando essas 3 colunas vazias pra todo veículo
 * criado via WhatsApp (mesmo formulário do Painel — VehicleFormModal.tsx —
 * e a ferramenta gerenciar_veiculo já usam essas colunas separadamente).
 *
 * Princípio: nunca inventa. Só preenche `brand`/`model` quando o texto
 * COMEÇA com uma marca de uma lista fechada de fabricantes conhecidos do
 * setor (sem IA, mesmo espírito determinístico de vehicleConfigClassifier.ts)
 * — fora isso, devolve só o que tiver certeza (ex.: só o ano, se reconhecível,
 * ou nada) e o texto bruto continua sendo salvo em paralelo por quem chama
 * (nunca substituído).
 */

export interface VehicleDescriptionParsed {
  brand?: string;
  model?: string;
  modelYear?: number;
}

/** Fabricantes de caminhão/ônibus mais comuns no Brasil — mesmo universo já usado em DOMINIOS_FABRICANTES (src/lib/anthropic/tools.ts) para caminhão-motor. Variantes mais longas primeiro, pra "mercedes-benz" vencer "mercedes" quando ambas aparecem. */
const MARCAS_CONHECIDAS: Array<{ chave: string; canonico: string }> = [
  { chave: "mercedes-benz", canonico: "Mercedes-Benz" },
  { chave: "mercedes benz", canonico: "Mercedes-Benz" },
  { chave: "mercedes", canonico: "Mercedes-Benz" },
  { chave: "volkswagen", canonico: "Volkswagen" },
  { chave: "scania", canonico: "Scania" },
  { chave: "volvo", canonico: "Volvo" },
  { chave: "daf", canonico: "DAF" },
  { chave: "iveco", canonico: "Iveco" },
  { chave: "man", canonico: "MAN" },
  { chave: "ford", canonico: "Ford" },
  { chave: "international", canonico: "International" },
  { chave: "agrale", canonico: "Agrale" },
  { chave: "foton", canonico: "Foton" },
  { chave: "hyundai", canonico: "Hyundai" },
  { chave: "jac", canonico: "JAC" },
  { chave: "sinotruk", canonico: "Sinotruk" },
].sort((a, b) => b.chave.length - a.chave.length);

const ANO_RE = /\b(19[7-9]\d|20\d{2}|2100)\b/;

function normalizar(texto: string): string {
  return texto.trim().toLowerCase();
}

export function parseVehicleDescription(textoBruto: string | undefined): VehicleDescriptionParsed {
  const texto = textoBruto?.trim();
  if (!texto) return {};

  const anoMatch = texto.match(ANO_RE);
  const modelYear = anoMatch ? Number(anoMatch[0]) : undefined;

  const textoNormalizado = normalizar(texto);
  const marca = MARCAS_CONHECIDAS.find(({ chave }) => {
    if (!textoNormalizado.startsWith(chave)) return false;
    const proximoChar = textoNormalizado[chave.length];
    // Exige fronteira de palavra depois da marca — nunca casa "Fordson" com "Ford".
    return proximoChar === undefined || proximoChar === " " || proximoChar === "-";
  });

  if (!marca) {
    // Sem marca reconhecida com confiança — nunca inventa modelo. Só o ano, se identificável.
    return modelYear ? { modelYear } : {};
  }

  let resto = texto.slice(marca.chave.length).trim();
  if (anoMatch) {
    resto = resto.replace(anoMatch[0], "").trim();
  }
  resto = resto.replace(/\s{2,}/g, " ").replace(/^[-,]\s*/, "").trim();

  return {
    brand: marca.canonico,
    ...(resto ? { model: resto } : {}),
    ...(modelYear ? { modelYear } : {}),
  };
}
