/**
 * Fonte única das 11 sugestões iniciais do Frota IA — usada nos 2 ambientes
 * (mensagem pós-onboarding no WhatsApp e cards da tela inicial do painel
 * web), pra nunca ter texto/id duplicado e divergente entre os dois.
 *
 * Sem "server-only": importado tanto no webhook (servidor) quanto em
 * componente client do painel.
 *
 * `whatsappTitle`/`whatsappDescription` existem separados de `title`/
 * `description` pra permitir copy diferente por canal no futuro — hoje são
 * idênticos porque só foi especificada uma versão de texto por sugestão.
 *
 * `intent` reservado pra roteamento futuro (ex.: abrir direto uma
 * ferramenta específica em vez de só preencher o campo de texto) — hoje não
 * é lido em lugar nenhum, só identifica a sugestão de forma estável.
 *
 * `icon` é o nome do ícone Lucide (PascalCase) usado na web. Onde a
 * especificação sugeriu dois ícones combinados (ex.: "Truck acompanhado de
 * CircleDollarSign"), o tipo só comporta um — usei o principal e deixei o
 * secundário anotado no comentário de cada item, caso o card evolua pra
 * suportar ícone composto depois.
 */

export interface FrotaSuggestion {
  id: string;
  title: string;
  description: string;
  icon: string;
  intent: string;
  whatsappTitle: string;
  whatsappDescription: string;
}

/**
 * Menu pós-onboarding V1 (08/2026, redesenho "1 usuário + 1 veículo") — 10
 * itens, já dentro do limite real de 10 linhas da lista nativa do WhatsApp
 * (`send-option-list` da Z-API, restrição da própria plataforma WhatsApp
 * Business). Substituiu o menu anterior de 11 itens por completo — reflete
 * as ferramentas mais usadas hoje (incluindo Radar de Fretes e registro de
 * despesa, que não tinham atalho aqui antes) em vez de tentar listar as 35.
 */
export const FROTA_SUGGESTIONS: FrotaSuggestion[] = [
  {
    id: "analisar_frete",
    title: "Analisar um frete",
    description: "Esse frete compensa?",
    icon: "Truck",
    intent: "analisar_frete",
    whatsappTitle: "Analisar um frete",
    whatsappDescription: "Esse frete de R$ 4.200 pra Santos compensa?",
  },
  {
    id: "procurar_oportunidades",
    title: "Procurar oportunidades",
    description: "Encontre carga compatível com o Radar de Fretes",
    icon: "Zap",
    intent: "procurar_oportunidades",
    whatsappTitle: "Procurar oportunidades",
    whatsappDescription: "Quero procurar oportunidades de frete com o Radar de Fretes.",
  },
  {
    id: "calcular_custos_viagem",
    title: "Calcular custos da viagem",
    description: "Quanto vou gastar até o destino?",
    icon: "Fuel",
    intent: "calcular_custos_viagem",
    whatsappTitle: "Calcular custos da viagem",
    whatsappDescription: "Quanto vou gastar de combustível até Curitiba?",
  },
  {
    id: "registrar_despesa",
    title: "Registrar uma despesa",
    description: "Registre um gasto da frota",
    icon: "WalletCards",
    intent: "registrar_despesa",
    whatsappTitle: "Registrar uma despesa",
    whatsappDescription: "Gastei R$ 600 de diesel hoje.",
  },
  {
    id: "organizar_manutencao",
    title: "Organizar manutenção",
    description: "Agende uma manutenção do veículo",
    icon: "Wrench",
    intent: "organizar_manutencao",
    whatsappTitle: "Organizar manutenção",
    whatsappDescription: "Preciso agendar a troca de óleo.",
  },
  {
    id: "documentos_vencimentos",
    title: "Documentos e vencimentos",
    description: "Veja o que está vencendo",
    icon: "FileText",
    intent: "documentos_vencimentos",
    whatsappTitle: "Documentos e vencimentos",
    whatsappDescription: "Quais documentos estão vencendo?",
  },
  {
    id: "consultar_rota",
    title: "Consultar uma rota",
    description: "Calcule a distância de um trajeto",
    icon: "MapPin",
    intent: "consultar_rota",
    whatsappTitle: "Consultar uma rota",
    whatsappDescription: "Qual a distância de Curitiba até São Paulo?",
  },
  {
    id: "criar_lembrete",
    title: "Criar um lembrete",
    description: "Me avise 15 dias antes de vencer o seguro do caminhão",
    icon: "Bell",
    intent: "criar_lembrete",
    whatsappTitle: "Criar um lembrete",
    whatsappDescription: "Me avise 15 dias antes de vencer o seguro do caminhão",
  },
  {
    id: "comparar_pneus",
    title: "Analisar pneus",
    description: "Vale mais a pena recapar ou comprar um pneu novo?",
    icon: "CircleGauge",
    intent: "comparar_pneus",
    whatsappTitle: "Analisar pneus",
    whatsappDescription: "Vale mais a pena recapar ou comprar um pneu novo?",
  },
  {
    id: "ver_tudo",
    title: "Ver tudo que o Frota IA faz",
    description: "Conheça todas as áreas do Frota IA",
    icon: "List",
    intent: "ver_tudo",
    whatsappTitle: "Ver tudo que o Frota IA faz",
    // Frase deliberadamente igual a um gatilho de ehPedidoDeFuncionalidades
    // (helpMenu.ts) — o toque nesta sugestão recebe o mesmo tratamento
    // determinístico do texto digitado "o que você faz" (ver webhook route.ts),
    // nunca depende do resumo livre da IA.
    whatsappDescription: "O que você faz?",
  },
];

/**
 * Mantido por compatibilidade com quem já importa este nome — hoje é
 * sempre igual a FROTA_SUGGESTIONS (10 itens, já dentro do limite nativo
 * do WhatsApp).
 */
export const SUGESTOES_LISTA_NATIVA_WHATSAPP: FrotaSuggestion[] = FROTA_SUGGESTIONS;

/**
 * Resolve a resposta de um menu numerado em texto (fallback do WhatsApp,
 * usado só quando o envio da lista nativa falha) — aceita o número (1-10)
 * ou o título exato da sugestão. Só deve ser chamado quando a sessão
 * estiver de fato aguardando essa escolha (ver `awaitingNumberedMenuSelection`
 * em onboarding_sessions.collected_data no webhook) — nunca em mensagem
 * solta, pra não confundir um número de cálculo com escolha de menu.
 */
export function resolverSelecaoNumerada(texto: string | undefined | null): FrotaSuggestion | undefined {
  if (!texto) return undefined;
  const normalizado = texto.trim().toLowerCase();

  const numero = Number(normalizado);
  if (Number.isInteger(numero) && numero >= 1 && numero <= FROTA_SUGGESTIONS.length) {
    return FROTA_SUGGESTIONS[numero - 1];
  }

  return FROTA_SUGGESTIONS.find((s) => s.title.toLowerCase() === normalizado);
}
