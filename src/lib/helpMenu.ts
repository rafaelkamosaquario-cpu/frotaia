/**
 * Conteúdo de referência sobre as 22 ferramentas do Frota IA, organizado
 * por categoria com exemplos reais de mensagem.
 *
 * Desde a reformulação das sugestões iniciais (11 itens em
 * src/lib/frotaSuggestions.ts), este arquivo NÃO é mais usado pra montar
 * a lista nativa do WhatsApp — isso agora é `frotaSuggestions.ts`. O que
 * sobra aqui, ainda em uso:
 * 1. `ehPedidoDeAjuda` — detecta a frase-gatilho ("ajuda"/"menu"/
 *    "opções"/"sugestões" etc.) que reabre a lista de sugestões (10 na
 *    lista nativa, 11 no fallback em texto — webhook chama
 *    `frotaSuggestions.ts` diretamente, não este arquivo);
 * 2. `construirTextoAjudaCompleto` — referência completa embutida no
 *    system prompt, pra painel web e qualquer pergunta tipo "o que você
 *    faz" que peça mais detalhe que as sugestões cobrem.
 *
 * Não importa nada de "server-only" — precisa ser seguro de importar tanto
 * no webhook (servidor) quanto em componentes client do painel web.
 */

export interface CategoriaAjuda {
  id: string;
  emoji: string;
  titulo: string;
  /** Parágrafo curto (1-2 frases) explicando o que essa categoria cobre — usado na resposta completa e na transição da pergunta de intenção do onboarding. */
  descricao: string;
  /** 2-4 frases de exemplo, sempre mensagens reais que o cliente mandaria. */
  exemplos: string[];
}

export const CATEGORIAS_AJUDA: CategoriaAjuda[] = [
  {
    id: "fretes",
    emoji: "🚛",
    titulo: "Fretes e oportunidades",
    descricao: "Analiso se o frete compensa, comparo propostas lado a lado, calculo margem e valor mínimo, leio CT-e direto da foto — e encontro oportunidades de carga compatíveis com o Radar de Fretes.",
    exemplos: [
      "Esse frete de R$ 4.200 pra Santos compensa?",
      "Analise este CT-e (manda a foto)",
      "Tenho duas propostas de frete, compare pra mim",
      "Quero encontrar carga voltando pra Curitiba",
    ],
  },
  {
    id: "combustivel_custos",
    emoji: "💰",
    titulo: "Custos e despesas",
    descricao: "Calculo consumo, gasto de diesel, CPK, custo do caminhão parado e sua margem real em qualquer frete.",
    exemplos: [
      "Meu caminhão faz 2,5 km/l, quanto vou gastar até Curitiba?",
      "Calcula meu CPK",
      "Quanto custa meu caminhão parado por 3 dias?",
      "Qual minha margem nesse frete?",
    ],
  },
  {
    id: "pneus_manutencao",
    emoji: "🔧",
    titulo: "Manutenção e pneus",
    descricao: "Comparo pneu novo com recapado, calculo custo por km, e ajudo a organizar a manutenção preventiva.",
    exemplos: ["Vale mais a pena recapar ou comprar pneu novo?", "De quanto em quanto tempo faço manutenção preventiva?"],
  },
  {
    id: "documentos",
    emoji: "📄",
    titulo: "Documentos e vencimentos",
    descricao: "Leio nota fiscal, CRLV, CT-e, comprovante de seguro, PDF e planilha — e gero relatório em PDF das suas análises.",
    exemplos: ["Manda foto de nota fiscal, CRLV, CT-e ou comprovante de seguro", "Gera o relatório dessa análise em PDF", "Quais documentos eu já gerei?"],
  },
  {
    id: "alertas_agenda",
    emoji: "📅",
    titulo: "Agenda e lembretes",
    descricao: "Crio lembretes de vencimento, cobrança e manutenção, e posso integrar com sua Agenda Google.",
    exemplos: ["Me avise 15 dias antes de vencer o seguro", "Me lembra de cobrar esse frete daqui a 30 dias", "Marca a revisão do caminhão pra semana que vem"],
  },
  {
    id: "jornada",
    emoji: "🕐",
    titulo: "Jornada",
    descricao: "Organizo sua jornada de viagem — horário de saída, paradas obrigatórias e se dá tempo de rodar sozinho.",
    exemplos: ["Vou sair amanhã às 5h de Curitiba pra São Paulo, organize minha jornada", "Dá tempo de fazer essa viagem sozinho, sem parar?"],
  },
  {
    id: "rotas",
    emoji: "🗺️",
    titulo: "Rotas e viagens",
    descricao: "Calculo distância e duração de qualquer trajeto, e guardo as rotas que você roda com frequência.",
    exemplos: ["Salva essa rota", "Quais rotas eu tenho salvas?"],
  },
  {
    id: "historico_legislacao",
    emoji: "📊",
    titulo: "Análises e histórico",
    descricao: "Guardo suas análises pra você consultar depois, e busco informação atualizada sobre piso mínimo, preço de combustível e legislação de trânsito.",
    exemplos: ["Traga a análise que eu fiz semana passada", "Esse valor está acima do piso mínimo da ANTT?", "Qual o preço do diesel essa semana?"],
  },
  {
    id: "noticias",
    emoji: "📰",
    titulo: "Notícias do transporte",
    descricao: "Busco notícia e informação atualizada do setor em fontes como ANTT, ANP, PRF e imprensa especializada — e posso mandar um resumo todo dia, se você quiser.",
    exemplos: ["Quero receber notícias do setor todo dia", "Pode desativar as notícias diárias"],
  },
];

const PALAVRAS_GATILHO_AJUDA = ["ajuda", "menu", "opções", "opcoes", "sugestões", "sugestoes", "help"];

/** Tolerante: casa por inclusão, não exige frase exata (mesmo padrão do parser de onboarding). */
export function ehPedidoDeAjuda(texto: string | undefined | null): boolean {
  if (!texto) return false;
  const normalizado = texto.trim().toLowerCase();
  if (normalizado.length > 60) return false; // frase de ajuda é curta — evita falso positivo em mensagem longa que só cita a palavra "ajuda" de passagem
  return PALAVRAS_GATILHO_AJUDA.some((gatilho) => normalizado === gatilho || normalizado.includes(gatilho));
}

/**
 * Separado de PALAVRAS_GATILHO_AJUDA em 07/08/2026 — achado real testando:
 * "quais suas funções" caiu na IA (que resumiu e derrubou uma categoria,
 * inclusive "Notícias do setor") em vez de bater no gatilho determinístico.
 * Pergunta tipo "o que você faz" é justamente o momento mais sensível pra
 * um prospect decidir se vale a pena continuar — não pode depender do
 * julgamento da IA. Intercepta ANTES da IA e manda construirTextoAjudaCompleto()
 * literal, nunca resumido, nunca gasta chamada de modelo.
 */
const PALAVRAS_GATILHO_FUNCOES = [
  "funções",
  "funcoes",
  "funcionalidades",
  "o que você pode fazer",
  "o que voce pode fazer",
  "o que você faz",
  "o que voce faz",
  "o que você oferece",
  "o que voce oferece",
  "mostrar funções",
  "mostrar funcoes",
  "quais são as funções",
  "quais sao as funcoes",
  "quais suas funções",
  "quais suas funcoes",
];

export function ehPedidoDeFuncionalidades(texto: string | undefined | null): boolean {
  if (!texto) return false;
  const normalizado = texto.trim().toLowerCase();
  if (normalizado.length > 80) return false;
  return PALAVRAS_GATILHO_FUNCOES.some((gatilho) => normalizado === gatilho || normalizado.includes(gatilho));
}

/**
 * Guia de Primeiros Passos V1 (08/2026) — comando permanente pra
 * (re)abrir o guia manualmente a qualquer momento, mesmo depois de
 * dispensado. Deliberadamente SEM "o que você faz"/variações — essa frase
 * já tem dono (PALAVRAS_GATILHO_FUNCOES acima) e não deve virar ambíguo
 * entre o catálogo completo e o guia passo a passo.
 */
const PALAVRAS_GATILHO_GUIA = [
  "primeiros passos",
  "guia rápido",
  "guia rapido",
  "guia de primeiros passos",
  "tutorial",
  "como usar o frota ia",
  "como usar o frotaia",
  "me ensina a usar",
  "quero um guia",
];

export function ehPedidoDeGuia(texto: string | undefined | null): boolean {
  if (!texto) return false;
  const normalizado = texto.trim().toLowerCase();
  if (normalizado.length > 60) return false;
  return PALAVRAS_GATILHO_GUIA.some((gatilho) => normalizado === gatilho || normalizado.includes(gatilho));
}

/**
 * Versão em texto corrido (painel web / WhatsApp determinístico via
 * ehPedidoDeFuncionalidades / referência no system prompt) — sem sintaxe
 * de lista nativa do WhatsApp. Formato numerado com descrição + exemplos
 * por categoria, refeito em 07/08/2026 a partir de um rascunho do Rafael —
 * versão anterior (só emoji + bullets) era rasa demais pra decidir se vale
 * a pena continuar usando o produto.
 */
export function construirTextoAjudaCompleto(): string {
  const intro = "🚛 O Frota IA ajuda você em várias áreas da operação:";
  const categorias = CATEGORIAS_AJUDA.map((categoria, indice) => {
    const exemplos = categoria.exemplos.map((ex) => `  - "${ex}"`).join("\n");
    return `${indice + 1}. ${categoria.emoji} ${categoria.titulo}\n${categoria.descricao}\n${exemplos}`;
  }).join("\n\n");
  return `${intro}\n\n${categorias}\n\nManda o que precisar que eu já calculo.`;
}
