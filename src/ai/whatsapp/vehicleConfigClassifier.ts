import type { VehicleTypeEnum } from "@/lib/supabase/tables";
import type { OnboardingReply } from "./onboardingConversation";

/**
 * Classificador determinístico da configuração do veículo (Camada 7) —
 * interpreta o texto livre do motorista contra a tabela de tipos/eixos em
 * src/ai/conhecimentos/tipos-de-veiculo.md (fonte da verdade dos números
 * usados aqui). Deliberadamente sem chamada à IA: segue o mesmo princípio
 * do resto do onboarding (nunca gasta uma chamada de modelo pra algo que
 * casamento de palavra-chave já resolve, sobre um vocabulário pequeno e
 * conhecido — 10 valores de vehicle_type).
 *
 * Veículos rígidos (toco, truck, três-quartos, bitruck) têm eixos fixos —
 * resolve na hora. Composições articuladas (cavalo mecânico/carreta) não
 * têm eixo total definido só pelo nome — depende do que está engatado,
 * então sempre pede uma escolha entre as combinações reais do mercado.
 */

export interface ConfiguracaoResolvida {
  status: "resolvido";
  vehicleType: VehicleTypeEnum;
  axleCount: number | null;
}

export interface ConfiguracaoPrecisaDesambiguar {
  status: "precisa_desambiguar";
  reply: OnboardingReply;
}

export interface ConfiguracaoNaoReconhecida {
  status: "nao_reconhecido";
  reply: OnboardingReply;
}

export type ResultadoClassificacao =
  | ConfiguracaoResolvida
  | ConfiguracaoPrecisaDesambiguar
  | ConfiguracaoNaoReconhecida;

// U+0300 a U+036F: bloco Unicode de acentos combinantes (gerado por code point
// pra nunca depender de caractere acentuado literal sobrevivendo intacto no
// arquivo fonte).
const COMBINING_MARKS_RE = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, "g");

/** Remove acentos (via decomposição Unicode) e caixa, pra casamento de palavra-chave tolerante. */
function norm(texto: string): string {
  return texto.trim().toLowerCase().normalize("NFD").replace(COMBINING_MARKS_RE, "");
}

const OPCOES_ARTICULADO: Array<{ id: string; title: string; vehicleType: VehicleTypeEnum; axleCount: number | null }> = [
  { id: "cavalo_toco_carreta", title: "Cavalo toco + carreta simples (5 eixos)", vehicleType: "cavalo_mecanico", axleCount: 5 },
  { id: "cavalo_trucado_carreta", title: "Cavalo trucado + carreta simples (6 eixos)", vehicleType: "cavalo_mecanico", axleCount: 6 },
  { id: "cavalo_bitrem", title: "Cavalo trucado + bitrem (7 eixos)", vehicleType: "cavalo_mecanico", axleCount: 7 },
  { id: "cavalo_rodotrem", title: "Cavalo trucado + rodotrem/bitrenzão (9 eixos)", vehicleType: "cavalo_mecanico", axleCount: 9 },
  { id: "so_cavalo", title: "Só o cavalo, sem carreta fixa", vehicleType: "cavalo_mecanico", axleCount: null },
];

function textConfigReply(text: string): OnboardingReply {
  return { kind: "text", text };
}

function perguntaDesambiguacaoArticulado(): OnboardingReply {
  return {
    kind: "list",
    text: "Cavalo mecânico ou carreta puxam configurações bem diferentes de eixos — qual dessas é a sua?",
    title: "Configuração do conjunto",
    buttonLabel: "Escolher opção",
    options: OPCOES_ARTICULADO.map((o) => ({ id: o.id, title: o.title })),
  };
}

function perguntaNaoReconhecida(): OnboardingReply {
  return textConfigReply(
    "Não consegui identificar essa configuração. Pode me dizer se é: toco, truck, cavalo mecânico (com carreta/bitrem/rodotrem), três-quartos, bitruck ou outro tipo?"
  );
}

/** Tipos rígidos com número de eixos fixo, independente de detalhe de tração (6x2/6x4 não muda a contagem). */
const RIGIDOS: Array<{ palavras: string[]; vehicleType: VehicleTypeEnum; axleCount: number }> = [
  { palavras: ["utilitario", "vuc"], vehicleType: "utilitario", axleCount: 2 },
  { palavras: ["tres quartos", "3/4", "3-4", "tres-quartos"], vehicleType: "tres_quartos", axleCount: 2 },
  { palavras: ["toco"], vehicleType: "toco", axleCount: 2 },
  { palavras: ["bitruck", "bi-truck", "bi truck"], vehicleType: "truck", axleCount: 4 },
  { palavras: ["truck", "trucado"], vehicleType: "truck", axleCount: 3 },
  { palavras: ["onibus"], vehicleType: "onibus", axleCount: 2 },
];

/** Combinações articuladas explícitas — quando o motorista já dá o eixo/composição de cara, não precisa perguntar de novo. */
const ARTICULADOS_EXPLICITOS: Array<{ palavras: string[]; vehicleType: VehicleTypeEnum; axleCount: number }> = [
  { palavras: ["bitrenzao"], vehicleType: "bitrem", axleCount: 9 },
  { palavras: ["rodotrem"], vehicleType: "rodotrem", axleCount: 9 },
  { palavras: ["bitrem"], vehicleType: "bitrem", axleCount: 7 },
  { palavras: ["carreta 4 eixos", "carreta quatro eixos"], vehicleType: "carreta", axleCount: 7 },
  { palavras: ["vanderleia"], vehicleType: "carreta", axleCount: 6 },
];

/** Menções só de carroceria/implemento (não são configuração de eixos) — pede esclarecimento, não trata como reconhecido. */
const CARROCERIAS = ["bau", "graneleiro", "sider", "cacamba", "tanque", "silo", "grade baixa", "prancha"];

export function classificarConfiguracaoVeiculo(textoBruto: string): ResultadoClassificacao {
  const t = norm(textoBruto);

  if (!t) {
    return { status: "nao_reconhecido", reply: perguntaNaoReconhecida() };
  }

  for (const item of ARTICULADOS_EXPLICITOS) {
    if (item.palavras.some((p) => t.includes(norm(p)))) {
      return { status: "resolvido", vehicleType: item.vehicleType, axleCount: item.axleCount };
    }
  }

  for (const item of RIGIDOS) {
    if (item.palavras.some((p) => t.includes(norm(p)))) {
      return { status: "resolvido", vehicleType: item.vehicleType, axleCount: item.axleCount };
    }
  }

  if (t.includes("cavalo") || t.includes("carreta")) {
    return { status: "precisa_desambiguar", reply: perguntaDesambiguacaoArticulado() };
  }

  if (CARROCERIAS.some((c) => t.includes(norm(c)))) {
    return {
      status: "nao_reconhecido",
      reply: textConfigReply(
        "Isso é o tipo de carroceria/implemento — o que eu preciso saber é a configuração do veículo em si: é toco, truck, cavalo mecânico (com carreta/bitrem/rodotrem), três-quartos ou outro tipo?"
      ),
    };
  }

  return { status: "nao_reconhecido", reply: perguntaNaoReconhecida() };
}

/** Resolve a escolha feita na lista de desambiguação (id da opção tocada). */
export function resolverDesambiguacaoArticulado(idOuTexto: string): ConfiguracaoResolvida | null {
  const t = norm(idOuTexto);
  const opcao = OPCOES_ARTICULADO.find((o) => norm(o.id) === t || norm(o.title) === t);
  if (!opcao) return null;
  return { status: "resolvido", vehicleType: opcao.vehicleType, axleCount: opcao.axleCount };
}
