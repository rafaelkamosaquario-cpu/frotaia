import type { OnboardingState, VehicleTypeEnum, VehicleBodyTypeEnum } from "@/lib/supabase/tables";
import type { CompanyRow } from "@/lib/supabase/tables";
import { classificarConfiguracaoVeiculo, resolverDesambiguacaoArticulado } from "./vehicleConfigClassifier";
import { CATEGORIAS_AJUDA, construirTextoAjudaCompleto } from "@/lib/helpMenu";

/**
 * Onboarding conversacional pelo WhatsApp (Camada 6, seções 3-6 do prompt
 * V1-WhatsApp): uma pergunta por vez, sem formulário, com estado explícito
 * em vez de depender só do histórico de texto. Função pura — quem chama
 * (o webhook) é responsável por persistir o estado/collected_data, enviar
 * a `reply` (texto, lista ou botões, conforme `kind`) e por finalizar
 * (criar company/vehicle) quando finalize=true.
 *
 * Redesenho V1 "1 usuário + 1 veículo" (08/2026, a pedido do Rafael): o
 * veículo passou a ser configurado por completo no próprio onboarding —
 * marca/modelo/ano (agora obrigatório, sem "depois"), placa (opcional),
 * configuração (obrigatória, classificador determinístico inalterado),
 * carroceria/implemento (sempre resolve, cai em "outro" se não reconhecer)
 * e consumo médio (opcional). Também ganhou uma etapa condicional de rota
 * principal, só perguntada a quem respondeu "sim" pra rota fixa/recorrente.
 * Google Calendar continua NUNCA fazendo parte do onboarding — só é pedido
 * sob demanda, depois, quando alguma ferramenta precisar (gerenciar_alerta/
 * gerenciar_google_calendar).
 *
 * nome → perfil (lista) → intenção → cidade → região → rota fixa (sim/não)
 * → [rota principal, só se sim] → marca/modelo/ano → placa → configuração
 * → [composição, só cavalo/carreta] → carroceria → consumo → concluído.
 *
 * Camada 7: a pergunta "quantos veículos" foi removida — o produto só
 * permite 1 veículo ativo por conta (constraint no banco,
 * vehicles_one_active_per_company_idx). O estado `awaiting_vehicle_count`
 * segue existindo no enum do banco só por compatibilidade histórica, mas
 * o código nunca mais atribui esse estado.
 */

export type OnboardingCompanyType = CompanyRow["company_type"];

export interface OnboardingCollectedData {
  name?: string;
  profileLabel?: string;
  companyType?: OnboardingCompanyType;
  baseCity?: string;
  baseState?: string;
  region?: string;
  hasFixedRoute?: boolean;
  /** Categoria escolhida na pergunta "o que você quer resolver primeiro" — id de CATEGORIAS_AJUDA, ou "ver_tudo". Ausente se o cliente veio de uma sessão antiga (retomada em paused) que não tinha essa etapa. */
  intentId?: string;
  intentLabel?: string;
  /** Texto bruto da rota principal, sempre gravado assim que a etapa é respondida (mesmo quando o parser não separa origem/destino, ou quando o cliente menciona mais de uma rota) — nunca perdido, mesmo que só a primeira vire uma saved_route estruturada. */
  primaryRouteRaw?: string;
  primaryRouteOrigin?: string;
  primaryRouteDestination?: string;
  primaryVehicleRaw?: string;
  /** Placa normalizada (só quando reconhecida) — a etapa sempre avança independente do resultado, então a ausência deste campo sozinha não diz se a etapa já foi perguntada (ver plateAsked). */
  plate?: string;
  plateAsked?: boolean;
  vehicleType?: VehicleTypeEnum;
  axleCount?: number | null;
  /** true enquanto aguarda a resposta da lista de desambiguação (cavalo mecânico/carreta) — nunca persiste além do próximo turno. */
  awaitingVehicleConfigChoice?: boolean;
  /** Rede de segurança contra loop infinito (achado real, 08/2026): conta respostas não reconhecidas na etapa de configuração (principal ou desambiguação). Depois de 2 tentativas sem sucesso, a 3ª resposta qualquer força vehicleType="outro" e segue — nunca deixa o onboarding travado pra sempre. */
  vehicleConfigAttempts?: number;
  /** Sempre preenchido assim que a etapa é respondida (cai em "outro" quando não reconhece) — nunca fica indefinido depois de perguntado. */
  bodyType?: VehicleBodyTypeEnum;
  averageConsumptionKmL?: number;
  consumptionAsked?: boolean;
}

export type OnboardingReply =
  | { kind: "text"; text: string }
  | {
      kind: "list";
      text: string;
      title: string;
      buttonLabel: string;
      options: Array<{ id: string; title: string; description?: string }>;
    }
  | { kind: "buttons"; text: string; options: Array<{ id: string; label: string }> };

export interface OnboardingStepResult {
  nextState: OnboardingState;
  reply: OnboardingReply;
  collectedData: OnboardingCollectedData;
  /** true só quando nextState === 'completed' — sinaliza ao webhook para criar company/vehicle de verdade. */
  finalize: boolean;
}

const CANCEL_WORDS = ["cancelar"];
const PAUSE_WORDS = ["continuar depois", "depois eu continuo", "pausar"];

function norm(text: string): string {
  return text.trim().toLowerCase();
}

function textReply(text: string): OnboardingReply {
  return { kind: "text", text };
}

/**
 * Explica o produto (incluindo o Radar de Fretes) antes de pedir o nome, e
 * já avisa que a configuração do veículo faz parte do cadastro — reduz a
 * chance de o cliente estranhar as perguntas de placa/consumo mais adiante.
 *
 * Fechamento de coerência (08/2026): esta mesma resposta vira tanto
 * `profiles.full_name` quanto `companies.name` (ver finalizeOnboarding.ts) —
 * mas a pergunta acontece ANTES de saber se quem responde é motorista
 * autônomo, motorista, dono de empresa/transportadora ou gestor de frota
 * (etapa "awaiting_profile" vem depois). "Como posso chamar você?" sozinho
 * puxa uma resposta de nome pessoal ("Rafael"), que soa estranho quando vira
 * `companies.name` de uma transportadora de verdade. Copy revisada pra
 * cobrir os dois casos sem virar pergunta nova.
 */
export function firstOnboardingMessage(): string {
  return (
    "Olá! Eu sou o Frota IA, seu assistente especializado em transporte. 🚛\n\n" +
    "Posso analisar fretes, calcular custos, organizar despesas, manutenção, documentos e rotas, criar lembretes e ajudar você a encontrar oportunidades de carga com o Radar de Fretes.\n\n" +
    "Você pode falar comigo por texto, áudio, foto, PDF ou planilha.\n\n" +
    "Para eu usar os dados corretos do seu veículo nas análises e recomendações, vou configurar sua operação primeiro.\n\n" +
    "Como posso chamar você (ou sua empresa/operação)?"
  );
}

const OPCOES_PERFIL: Array<{ id: string; title: string; companyType: OnboardingCompanyType; label: string }> = [
  { id: "motorista_autonomo", title: "🚛 Motorista autônomo", companyType: "autonomo", label: "motorista autônomo" },
  { id: "apenas_motorista", title: "👤 Apenas motorista", companyType: "outro", label: "motorista" },
  { id: "dono_empresa", title: "🏢 Dono de empresa / transportadora", companyType: "transportadora", label: "dono de empresa" },
  { id: "gestor_frota", title: "📊 Gestor de frota", companyType: "transportadora", label: "gestor de frota" },
  { id: "transportador", title: "🚚 Transportador", companyType: "transportadora", label: "transportador" },
];

function askProfile(name: string): OnboardingReply {
  return {
    kind: "list",
    text: `Prazer, ${name}! Como você atua hoje?`,
    title: "Como você atua",
    buttonLabel: "Escolher opção",
    options: OPCOES_PERFIL.map((o) => ({ id: o.id, title: o.title })),
  };
}

const ID_VER_TUDO = "ver_tudo";

/**
 * "O que você quer resolver primeiro?" — gerada a partir de
 * CATEGORIAS_AJUDA (mesma fonte da resposta "o que você faz" em
 * helpMenu.ts, nunca duplicada) + a opção "ver tudo". O que o cliente
 * escolhe aqui personaliza a mensagem de conclusão do cadastro (ver
 * MENSAGEM_POS_CADASTRO no webhook).
 */
function askIntent(): OnboardingReply {
  return {
    kind: "list",
    text: "O que você quer resolver primeiro com o Frota IA?",
    title: "Por onde começar",
    buttonLabel: "Escolher opção",
    options: [
      ...CATEGORIAS_AJUDA.map((c) => ({ id: c.id, title: `${c.emoji} ${c.titulo}` })),
      { id: ID_VER_TUDO, title: "📋 Ver tudo que o Frota IA faz" },
    ],
  };
}

/** Texto curto de transição por categoria — diz o que mandar em seguida, sem tentar calcular nada ainda (empresa/veículo só existem no fim do onboarding). A pergunta de cidade-base é concatenada logo em seguida (ver case "awaiting_intent"). */
const TRANSICAO_POR_INTENCAO: Record<string, string> = {
  fretes:
    "Perfeito! Você pode me mandar uma proposta de frete para analisar ou usar o Radar de Fretes para procurar oportunidades compatíveis com sua operação.\n\nAgora vamos configurar sua base e seu veículo para eu usar informações mais precisas nas análises.",
  combustivel_custos: "Show! Me conta o consumo do seu veículo (km/l) e o trajeto, ou os custos que quer calcular — CPK, gasto de combustível, margem, o que precisar.",
  pneus_manutencao: "Legal! Quando quiser, me diz se é pra comparar pneu novo com recapado, calcular custo por km, ou tirar dúvida sobre manutenção preventiva.",
  documentos: "Beleza! Pode mandar foto de nota fiscal, CRLV, CT-e ou comprovante de seguro assim que quiser — eu leio e te digo o que encontrei.",
  alertas_agenda: "Combinado! Quando quiser, me diz o que devo te lembrar (vencimento, cobrança, revisão) e quando.",
  jornada: "Perfeito! Quando for viajar, me conta o horário e o trajeto que eu organizo a jornada pra você.",
  rotas: "Show! Me manda a origem e o destino quando quiser que eu calculo a distância — e posso salvar se for uma rota que você roda sempre.",
  historico_legislacao: "Beleza! Pode perguntar sobre uma análise antiga, piso mínimo da ANTT, preço do diesel ou qualquer dúvida de legislação.",
  noticias: "Legal! Eu busco notícia e informação atualizada do setor sempre que você perguntar — e se quiser, também mando um resumo todo dia (é só pedir depois).",
};

/** Aceita o id da lista (toque) ou, como fallback, o título/texto digitado. */
function resolverIntencao(texto: string): { id: string; label: string } | null {
  const t = norm(texto);
  if (t === ID_VER_TUDO || t.includes("ver tudo")) return { id: ID_VER_TUDO, label: "Ver tudo que o Frota IA faz" };
  const porId = CATEGORIAS_AJUDA.find((c) => norm(c.id) === t);
  if (porId) return { id: porId.id, label: porId.titulo };
  const porTitulo = CATEGORIAS_AJUDA.find((c) => t.includes(norm(c.titulo)));
  if (porTitulo) return { id: porTitulo.id, label: porTitulo.titulo };
  return null;
}

function askBaseLocation(): OnboardingReply {
  return textReply("Qual cidade você usa como base principal da sua operação?\n\nEx.: Curitiba - PR");
}

const OPCOES_REGIAO: Array<{ id: string; title: string; label: string }> = [
  { id: "norte", title: "Norte", label: "Norte" },
  { id: "nordeste", title: "Nordeste", label: "Nordeste" },
  { id: "centro_oeste", title: "Centro-Oeste", label: "Centro-Oeste" },
  { id: "sudeste", title: "Sudeste", label: "Sudeste" },
  { id: "sul", title: "Sul", label: "Sul" },
  { id: "todas", title: "Todas as regiões", label: "Todas as regiões" },
];

/**
 * Lista nativa (confirmada entregando bem em teste real, ao contrário dos
 * botões — ver askFixedRoute) com as 5 regiões + "todas". A lista do
 * WhatsApp só permite tocar em UMA opção por vez (sem seleção múltipla
 * nativa) — pra quem atua em mais de uma região, digitar texto livre
 * continua funcionando em paralelo (ver resolverRegiao), por isso o texto
 * da pergunta menciona as duas formas.
 */
function askRegion(): OnboardingReply {
  return {
    kind: "list",
    text: "Em quais regiões você costuma rodar mais? Toque numa opção, ou digite se forem várias (ex.: \"Sul e Sudeste\").",
    title: "Região de atuação",
    buttonLabel: "Escolher opção",
    options: OPCOES_REGIAO.map((o) => ({ id: o.id, title: o.title })),
  };
}

/** Mapeia o toque na lista pro rótulo bonito; texto livre (uma ou várias regiões) passa direto. */
function resolverRegiao(texto: string): string {
  const t = norm(texto);
  const porId = OPCOES_REGIAO.find((o) => o.id === t);
  return porId ? porId.label : texto.trim();
}

/**
 * Texto simples, não botões — botões nativos (kind "buttons",
 * sendWhatsappButtons/send-button-actions) não estavam sendo entregues em
 * teste real no WhatsApp (05/08/2026), travando o onboarding aqui sem
 * nenhum erro visível nos logs (a chamada à Z-API não lançava exceção, só
 * a mensagem nunca chegava no aparelho). parseFixedRoute já aceita
 * "sim"/"não" em texto livre — trocar pra texto evita depender desse
 * recurso até investigarmos a causa raiz do lado da Z-API.
 */
function askFixedRoute(): OnboardingReply {
  return textReply('Você costuma trabalhar em uma rota fixa ou recorrente?\n\nResponda "sim" ou "não".');
}

function askPrimaryRoute(): OnboardingReply {
  return textReply("Qual é sua rota principal?\n\nEx.: Curitiba → São Paulo");
}

/**
 * Best-effort: identifica o primeiro par origem/destino no texto livre.
 * Se o cliente mencionar mais de uma rota (ex.: "Curitiba → São Paulo e
 * Curitiba → Campinas"), só a primeira vira campos estruturados — o texto
 * completo é sempre preservado em primaryRouteRaw (e vira memória na
 * finalização), então nenhuma informação é perdida mesmo quando o parser
 * não separa tudo.
 */
const SEPARADOR_ROTA = /\s*(?:→|->)\s*|\s+at[ée]\s+|\s+pra\s+|\s+para\s+|\s+-\s+/i;
function parsePrimaryRoute(texto: string): { origin: string; destination: string } | null {
  const partes = texto.trim().split(SEPARADOR_ROTA);
  if (partes.length < 2) return null;
  const origin = partes[0].trim();
  const destination = partes[1].trim().split(/\s+e\s+|[,;]/)[0].trim();
  if (!origin || !destination) return null;
  return { origin, destination };
}

function askPrimaryVehicle(): OnboardingReply {
  return textReply("Agora vamos configurar o veículo que você vai usar no Frota IA.\n\nQual a marca, modelo e ano?\n\nEx.: Scania R450 2022");
}

function askPlate(): OnboardingReply {
  return textReply('Qual a placa do veículo?\n\nEx.: ABC1D23\n\nSe preferir informar depois, responda "depois".');
}

/** Normaliza (remove espaço/hífen, maiúsculas) e valida contra o formato de placa (Mercosul ou antigo) — mesmo padrão aceito por vehicleCreateSchema. Nunca bloqueia a etapa: se não bater, a placa simplesmente não é gravada. */
function parsePlaca(texto: string): string | null {
  const t = texto.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/.test(t) ? t : null;
}

/**
 * Ids batem literalmente com as palavras-chave que
 * vehicleConfigClassifier.ts já reconhece — o toque na lista vira
 * `selectedRowId`, que entra em classificarConfiguracaoVeiculo() do mesmo
 * jeito que texto digitado (nenhuma mudança precisou no classificador).
 * Cavalo mecânico/carreta continuam caindo na desambiguação (5/6/7/9
 * eixos) depois do toque, igual já funcionava com texto livre.
 */
const OPCOES_CONFIG_VEICULO: Array<{ id: string; title: string }> = [
  { id: "toco", title: "Toco" },
  { id: "truck", title: "Truck / Trucado" },
  { id: "tres quartos", title: "Três-quartos" },
  { id: "bitruck", title: "Bitruck" },
  { id: "cavalo mecanico", title: "Cavalo mecânico" },
  { id: "carreta", title: "Carreta" },
  { id: "bitrem", title: "Bitrem" },
  { id: "rodotrem", title: "Rodotrem" },
  { id: "outro", title: "Outro / não sei" },
];

function askVehicleConfiguration(): OnboardingReply {
  return {
    kind: "list",
    text: "Qual a configuração do seu veículo? Toque numa opção, ou digite se preferir (ex.: \"cavalo mecânico\").",
    title: "Configuração do veículo",
    buttonLabel: "Escolher opção",
    options: OPCOES_CONFIG_VEICULO.map((o) => ({ id: o.id, title: o.title })),
  };
}

/** Mesmo vocabulário já usado pela ferramenta gerenciar_veiculo (carroceria) — nada inventado aqui. Sempre resolve algo (cai em "outro" quando não reconhece), então esta etapa nunca trava o onboarding. */
const OPCOES_CARROCERIA: Array<{ id: VehicleBodyTypeEnum; title: string; palavras: string[] }> = [
  { id: "sider", title: "Sider", palavras: ["sider"] },
  { id: "bau", title: "Baú", palavras: ["bau", "baú"] },
  { id: "graneleiro", title: "Graneleiro", palavras: ["graneleiro", "graneleira", "silo"] },
  { id: "cacamba", title: "Basculante (caçamba)", palavras: ["cacamba", "caçamba", "basculante"] },
  { id: "tanque", title: "Tanque", palavras: ["tanque"] },
  { id: "grade_baixa", title: "Grade baixa / carga seca", palavras: ["grade baixa", "carga seca"] },
  { id: "prancha", title: "Prancha", palavras: ["prancha"] },
  { id: "frigorifico", title: "Frigorífico", palavras: ["frigorifico", "frigorífico", "refrigerado"] },
  { id: "outro", title: "Outro / não sei", palavras: [] },
];

function askBodyType(): OnboardingReply {
  return {
    kind: "list",
    text: "Qual carroceria ou implemento você utiliza?",
    title: "Carroceria / implemento",
    buttonLabel: "Escolher opção",
    options: OPCOES_CARROCERIA.map((o) => ({ id: o.id, title: o.title })),
  };
}

/** Nunca retorna vazio — cai em "outro" quando não reconhece a menção, pra esta etapa nunca repetir/travar. */
function resolverCarroceria(texto: string): VehicleBodyTypeEnum {
  const t = norm(texto);
  const porId = OPCOES_CARROCERIA.find((o) => o.id === t);
  if (porId) return porId.id;
  const porPalavra = OPCOES_CARROCERIA.find((o) => o.palavras.some((p) => t.includes(norm(p))));
  return porPalavra ? porPalavra.id : "outro";
}

function askConsumption(): OnboardingReply {
  return textReply('Qual é o consumo médio do seu veículo em km/l?\n\nEx.: 2,8 km/l\n\nSe ainda não souber, responda "não sei".');
}

/** Aceita vírgula ou ponto, com ou sem "km/l" junto. "não sei"/"depois" (e qualquer texto sem número) vira null — a etapa nunca bloqueia. */
function parseConsumo(texto: string): number | null {
  const match = texto.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  const valor = Number(match[1].replace(",", "."));
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

/**
 * O conteúdo real enviado ao cliente na conclusão do cadastro (mensagem
 * fixa + lista das sugestões iniciais) é montado no webhook
 * (`enviarSugestoesIniciais`, src/app/api/whatsapp/webhook/route.ts) — lá
 * é onde dá pra checar idempotência (suggestions_menu_sent_at) e cair no
 * fallback numerado se a lista nativa falhar; nenhuma das duas coisas cabe
 * numa função pura sem I/O. Esta função só preenche o campo `reply`
 * exigido pelo contrato de `OnboardingStepResult` — o webhook ignora esse
 * texto no caminho de finalize=true.
 */
function completionMessage(): OnboardingReply {
  return textReply("Cadastro concluído!");
}

/** Aceita o id da lista (toque no menu) ou, como fallback, texto livre. */
function parseCompanyType(text: string): { companyType: OnboardingCompanyType; label: string } | null {
  const t = norm(text);

  const porId = OPCOES_PERFIL.find((o) => o.id === t);
  if (porId) return { companyType: porId.companyType, label: porId.label };

  if (t.includes("apenas") && t.includes("motorista")) {
    return { companyType: "outro", label: "motorista" };
  }
  if (t.includes("autônomo") || t.includes("autonomo") || t.includes("motorista")) {
    return { companyType: "autonomo", label: "motorista autônomo" };
  }
  if (t.includes("transportadora") || t.includes("transportador")) {
    return { companyType: "transportadora", label: "transportador" };
  }
  if (t.includes("gestor")) {
    return { companyType: "transportadora", label: "gestor de frota" };
  }
  if (t.includes("dono") || t.includes("frota") || t.includes("empresa")) {
    return { companyType: "transportadora", label: "dono de empresa" };
  }
  if (t.includes("embarcador")) {
    return { companyType: "embarcador", label: "embarcador" };
  }
  if (t.trim().length > 0) {
    return { companyType: "outro", label: "outro profissional do transporte" };
  }
  return null;
}

/** Aceita o id do botão (sim/nao) ou, como fallback, texto livre. */
function parseFixedRoute(text: string): boolean | null {
  const t = norm(text);
  if (t === "sim" || t.startsWith("sim") || t === "s") return true;
  if (t === "nao" || t === "não" || t.startsWith("nao") || t.startsWith("não") || t === "n") return false;
  return null;
}

function parseBaseLocation(text: string): { city: string; state?: string } {
  const parts = text.split(/[-,/]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const maybeState = parts[parts.length - 1];
    if (/^[A-Za-z]{2}$/.test(maybeState)) {
      return { city: parts.slice(0, -1).join(", "), state: maybeState.toUpperCase() };
    }
  }
  return { city: text.trim() };
}

/**
 * Processa uma mensagem recebida durante o onboarding. `state` nunca deve
 * ser 'not_started' (isso é resolvido antes, criando a sessão já em
 * 'awaiting_name') nem 'completed' (onboarding concluído não roteia mais
 * para cá). `incomingText` já vem resolvido pelo webhook: texto livre,
 * `selectedRowId` de uma lista, ou `buttonId` de um botão.
 */
export function processOnboardingMessage(
  state: OnboardingState,
  collectedData: OnboardingCollectedData,
  incomingText: string
): OnboardingStepResult {
  const t = norm(incomingText);

  if (state !== "paused" && CANCEL_WORDS.some((w) => t === w || t.includes(w))) {
    return {
      nextState: "paused",
      reply: textReply("Sem problema, cancelei o cadastro por aqui. Quando quiser recomeçar, é só mandar uma mensagem."),
      collectedData,
      finalize: false,
    };
  }

  if (state !== "paused" && PAUSE_WORDS.some((w) => t.includes(w))) {
    return {
      nextState: "paused",
      reply: textReply("Tudo bem, paro por aqui. Quando quiser continuar o cadastro, é só me chamar de novo."),
      collectedData,
      finalize: false,
    };
  }

  if (state === "paused") {
    // Qualquer mensagem retoma de onde parou — mas não sabemos "onde parou"
    // sem o estado anterior, então reconstituímos a pergunta mais básica
    // ainda não respondida a partir do collectedData já salvo. Campos
    // opcionais (placa/consumo) usam uma flag "*Asked" própria porque
    // ausência de valor não distingue "ainda não perguntado" de "perguntado
    // e sem resposta útil" — ver comentário em OnboardingCollectedData.
    if (!collectedData.name) return { nextState: "awaiting_name", reply: textReply(firstOnboardingMessage()), collectedData, finalize: false };
    if (!collectedData.companyType) return { nextState: "awaiting_profile", reply: askProfile(collectedData.name), collectedData, finalize: false };
    if (!collectedData.intentId) return { nextState: "awaiting_intent", reply: askIntent(), collectedData, finalize: false };
    if (!collectedData.baseCity) return { nextState: "awaiting_base_location", reply: askBaseLocation(), collectedData, finalize: false };
    if (!collectedData.region) return { nextState: "awaiting_region", reply: askRegion(), collectedData, finalize: false };
    if (collectedData.hasFixedRoute === undefined) return { nextState: "awaiting_fixed_route", reply: askFixedRoute(), collectedData, finalize: false };
    if (collectedData.hasFixedRoute === true && !collectedData.primaryRouteRaw) {
      return { nextState: "awaiting_primary_route", reply: askPrimaryRoute(), collectedData, finalize: false };
    }
    if (!collectedData.primaryVehicleRaw) return { nextState: "awaiting_primary_vehicle", reply: askPrimaryVehicle(), collectedData, finalize: false };
    if (!collectedData.plateAsked) return { nextState: "awaiting_plate", reply: askPlate(), collectedData, finalize: false };
    if (!collectedData.vehicleType) return { nextState: "awaiting_vehicle_configuration", reply: askVehicleConfiguration(), collectedData, finalize: false };
    if (!collectedData.bodyType) return { nextState: "awaiting_body_type", reply: askBodyType(), collectedData, finalize: false };
    return { nextState: "awaiting_consumption", reply: askConsumption(), collectedData, finalize: false };
  }

  switch (state) {
    case "awaiting_name": {
      const name = incomingText.trim();
      if (!name) {
        return { nextState: state, reply: textReply("Não entendi — como posso te chamar (ou sua empresa/operação)?"), collectedData, finalize: false };
      }
      const updated = { ...collectedData, name };
      return { nextState: "awaiting_profile", reply: askProfile(name), collectedData: updated, finalize: false };
    }

    case "awaiting_profile": {
      const parsed = parseCompanyType(incomingText);
      if (!parsed) {
        return { nextState: state, reply: askProfile(collectedData.name ?? ""), collectedData, finalize: false };
      }
      const updated = { ...collectedData, companyType: parsed.companyType, profileLabel: parsed.label };
      return { nextState: "awaiting_intent", reply: askIntent(), collectedData: updated, finalize: false };
    }

    case "awaiting_intent": {
      const resolvido = resolverIntencao(incomingText);
      if (!resolvido) {
        return { nextState: state, reply: askIntent(), collectedData, finalize: false };
      }
      const updated = { ...collectedData, intentId: resolvido.id, intentLabel: resolvido.label };
      const textoTransicao = resolvido.id === ID_VER_TUDO ? construirTextoAjudaCompleto() : TRANSICAO_POR_INTENCAO[resolvido.id];
      return {
        nextState: "awaiting_base_location",
        reply: textReply(`${textoTransicao}\n\n${(askBaseLocation() as { kind: "text"; text: string }).text}`),
        collectedData: updated,
        finalize: false,
      };
    }

    case "awaiting_base_location": {
      if (!incomingText.trim()) {
        return { nextState: state, reply: textReply("Qual cidade ou região você usa como base?"), collectedData, finalize: false };
      }
      const { city, state: uf } = parseBaseLocation(incomingText);
      const updated = { ...collectedData, baseCity: city, baseState: uf };
      return { nextState: "awaiting_region", reply: askRegion(), collectedData: updated, finalize: false };
    }

    case "awaiting_region": {
      if (!incomingText.trim()) {
        return { nextState: state, reply: askRegion(), collectedData, finalize: false };
      }
      const updated = { ...collectedData, region: resolverRegiao(incomingText) };
      return { nextState: "awaiting_fixed_route", reply: askFixedRoute(), collectedData: updated, finalize: false };
    }

    case "awaiting_fixed_route": {
      const parsed = parseFixedRoute(incomingText);
      if (parsed === null) {
        return { nextState: state, reply: askFixedRoute(), collectedData, finalize: false };
      }
      const updated = { ...collectedData, hasFixedRoute: parsed };
      if (parsed) {
        return { nextState: "awaiting_primary_route", reply: askPrimaryRoute(), collectedData: updated, finalize: false };
      }
      return { nextState: "awaiting_primary_vehicle", reply: askPrimaryVehicle(), collectedData: updated, finalize: false };
    }

    case "awaiting_primary_route": {
      if (!incomingText.trim()) {
        return { nextState: state, reply: askPrimaryRoute(), collectedData, finalize: false };
      }
      const parsedRoute = parsePrimaryRoute(incomingText);
      const updated: OnboardingCollectedData = {
        ...collectedData,
        primaryRouteRaw: incomingText.trim(),
        ...(parsedRoute ? { primaryRouteOrigin: parsedRoute.origin, primaryRouteDestination: parsedRoute.destination } : {}),
      };
      return { nextState: "awaiting_primary_vehicle", reply: askPrimaryVehicle(), collectedData: updated, finalize: false };
    }

    case "awaiting_primary_vehicle": {
      // V1 "1 usuário + 1 veículo": marca/modelo/ano deixou de ser
      // pulável — o veículo é parte central do produto, configurado por
      // completo no onboarding (nunca fica sem name/notes preenchidos).
      if (!incomingText.trim()) {
        return { nextState: state, reply: askPrimaryVehicle(), collectedData, finalize: false };
      }
      const updated = { ...collectedData, primaryVehicleRaw: incomingText.trim() };
      return { nextState: "awaiting_plate", reply: askPlate(), collectedData: updated, finalize: false };
    }

    case "awaiting_plate": {
      // Opcional: a etapa sempre avança, com ou sem placa reconhecida.
      const placa = parsePlaca(incomingText);
      const updated: OnboardingCollectedData = { ...collectedData, plateAsked: true, ...(placa ? { plate: placa } : {}) };
      return { nextState: "awaiting_vehicle_configuration", reply: askVehicleConfiguration(), collectedData: updated, finalize: false };
    }

    case "awaiting_vehicle_configuration": {
      const tentativas = collectedData.vehicleConfigAttempts ?? 0;

      // Meio da desambiguação (cavalo mecânico/carreta): esta mensagem é a
      // escolha da lista anterior, não uma nova descrição livre.
      if (collectedData.awaitingVehicleConfigChoice) {
        const resolvido = resolverDesambiguacaoArticulado(incomingText);
        if (!resolvido) {
          // Rede de segurança (achado real — loop sem saída): depois de 2
          // tentativas sem reconhecer a escolha, assume "só o cavalo" (eixos
          // indefinidos) e segue — nunca trava o onboarding pra sempre.
          if (tentativas >= 2) {
            const updated = {
              ...collectedData,
              vehicleType: "cavalo_mecanico" as VehicleTypeEnum,
              axleCount: null,
              awaitingVehicleConfigChoice: false,
              vehicleConfigAttempts: 0,
            };
            return {
              nextState: "awaiting_body_type",
              reply: textReply("Sem problema — vou seguir sem definir a composição exata agora. Você pode ajustar isso depois no painel ou me contando os detalhes."),
              collectedData: updated,
              finalize: false,
            };
          }
          // Toque inválido/texto solto no meio da desambiguação: repete a
          // mesma lista, sem sair do estado (nunca conclui sem os dois campos).
          const classificacao = classificarConfiguracaoVeiculo("cavalo mecanico");
          const reply = classificacao.status === "precisa_desambiguar" ? classificacao.reply : askVehicleConfiguration();
          return { nextState: state, reply, collectedData: { ...collectedData, vehicleConfigAttempts: tentativas + 1 }, finalize: false };
        }
        const updated = {
          ...collectedData,
          vehicleType: resolvido.vehicleType,
          axleCount: resolvido.axleCount,
          awaitingVehicleConfigChoice: false,
          vehicleConfigAttempts: 0,
        };
        return { nextState: "awaiting_body_type", reply: askBodyType(), collectedData: updated, finalize: false };
      }

      const classificacao = classificarConfiguracaoVeiculo(incomingText);

      if (classificacao.status === "resolvido") {
        const updated = { ...collectedData, vehicleType: classificacao.vehicleType, axleCount: classificacao.axleCount, vehicleConfigAttempts: 0 };
        return { nextState: "awaiting_body_type", reply: askBodyType(), collectedData: updated, finalize: false };
      }

      if (classificacao.status === "precisa_desambiguar") {
        const updated = { ...collectedData, awaitingVehicleConfigChoice: true, vehicleConfigAttempts: 0 };
        return { nextState: state, reply: classificacao.reply, collectedData: updated, finalize: false };
      }

      // "nao_reconhecido": pergunta obrigatória, tenta orientar/reformular
      // até 2 vezes — mas nunca trava pra sempre (achado real: a própria
      // opção "Outro/não sei" da lista caía aqui sem nunca resolver). Na
      // 3ª tentativa sem sucesso, assume vehicleType="outro" e segue.
      if (tentativas >= 2) {
        const updated = { ...collectedData, vehicleType: "outro" as VehicleTypeEnum, axleCount: null, vehicleConfigAttempts: 0 };
        return {
          nextState: "awaiting_body_type",
          reply: textReply("Sem problema — vou seguir com a configuração como \"outro\" por enquanto. Você pode ajustar isso depois no painel ou me contando os detalhes numa conversa."),
          collectedData: updated,
          finalize: false,
        };
      }
      return { nextState: state, reply: classificacao.reply, collectedData: { ...collectedData, vehicleConfigAttempts: tentativas + 1 }, finalize: false };
    }

    case "awaiting_body_type": {
      // Sempre resolve (cai em "outro" se não reconhecer) — nunca repete.
      const updated = { ...collectedData, bodyType: resolverCarroceria(incomingText) };
      return { nextState: "awaiting_consumption", reply: askConsumption(), collectedData: updated, finalize: false };
    }

    case "awaiting_consumption": {
      // Opcional e última etapa: sempre finaliza, com ou sem consumo reconhecido.
      const consumo = parseConsumo(incomingText);
      const updated: OnboardingCollectedData = {
        ...collectedData,
        consumptionAsked: true,
        ...(consumo !== null ? { averageConsumptionKmL: consumo } : {}),
      };
      return { nextState: "completed", reply: completionMessage(), collectedData: updated, finalize: true };
    }

    default:
      return { nextState: state, reply: textReply("Pode repetir, por favor?"), collectedData, finalize: false };
  }
}
