import { nextCargoProfile, cargoQuestion, cargoSummary, type CargoProfile } from "./cargoProfile";
import type { OnboardingState, VehicleTypeEnum, VehicleBodyTypeEnum } from "@/lib/supabase/tables";
import type { CompanyRow } from "@/lib/supabase/tables";
import { nextVehicleConfiguration, type VehicleSetup } from "./vehicleSetup";
import { CATEGORIAS_AJUDA } from "@/lib/helpMenu";
import { ajudaConversacionalV1 } from "./conversationExperience";

/** Cadastro V1: nome, perfil, intenção, cidade, veículo, placa, configuração, implementos, carroceria e consumo. Confirmação final obrigatória. Estados antigos são mantidos para retomada sem perda de dados. */

export type OnboardingCompanyType = CompanyRow["company_type"];

export interface OnboardingCollectedData {
  vehicleSetup?: VehicleSetup;
  cargoProfile?: CargoProfile;
  /** Preenchido assim que a empresa mínima é criada no primeiro contato (inversão do funil, 09/2026) — presente aqui significa que `finalizeOnboarding` deve ATUALIZAR essa empresa em vez de criar uma nova. Ausente = caminho legado (ex.: lead "Empresas", que nunca passa pela demo). */
  companyId?: string;
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
  /** Dados múltiplos só finalizam após resumo confirmado, sem novo enum no banco. */
  pendingCombinedConfirmation?: boolean;
  usedCombinedInput?: boolean;
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
    "Sou o Frota IA, seu assistente para o dia a dia do caminhão. 🚛\n\n" +
    "Combustível, manutenção, pneus e fretes: vamos usar os dados do seu caminhão para te ajudar. O Radar de Fretes acompanha oportunidades nas fontes disponíveis.\n\n" +
    "Pode responder por texto ou áudio. Depois do cadastro, também pode mandar foto, PDF ou planilha para analisar.\n\n" +
    "Vamos configurar sua operação, uma pergunta por vez.\n\n" +
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
      { id: "combustivel_custos", title: "Combustível e custos" },
      { id: "pneus_manutencao", title: "Manutenção e pneus" },
      { id: "fretes", title: "Fretes e oportunidades" },
      { id: ID_VER_TUDO, title: "Outras possibilidades" },
    ],
  };
}

/** Texto curto de transição por categoria — diz o que mandar em seguida, sem tentar calcular nada ainda (empresa/veículo só existem no fim do onboarding). A pergunta de cidade-base é concatenada logo em seguida (ver case "awaiting_intent"). */
const TRANSICAO_POR_INTENCAO: Record<string, string> = {
  fretes:
    "Perfeito! Você pode me mandar uma proposta de frete para analisar ou usar o Radar de Fretes para procurar oportunidades compatíveis com sua operação.\n\nAgora vamos configurar sua base e seu veículo para eu usar informações mais precisas nas análises.",
  combustivel_custos: "Certo. Vamos usar o consumo e os custos do seu caminhão, sem chutar valores.",
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
  if (/combust[ií]vel|diesel|consumo/.test(t)) return { id: "combustivel_custos", label: "Combustível e custos" };
  if (/pneu|manuten[cç][aã]o|revis[aã]o/.test(t)) return { id: "pneus_manutencao", label: "Manutenção e pneus" };
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

function askPrimaryVehicle(): OnboardingReply {
  return textReply("Vamos cadastrar seu caminhão.\n\nQual a marca, modelo e ano?\n\nEx.: Scania R450 2022");
}

function askPlate(): OnboardingReply {
  return textReply('Qual a placa do veículo?\n\nEx.: ABC1D23 ou ABC1234. A placa é necessária para identificar seus registros.');
}

/** Normaliza (remove espaço/hífen, maiúsculas) e valida contra o formato de placa (Mercosul ou antigo) — mesmo padrão aceito por vehicleCreateSchema. Sem formato válido, a etapa pede a placa novamente. */
function parsePlaca(texto: string): string | null {
  const t = texto.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/.test(t) ? t : null;
}

function askVehicleConfiguration(): OnboardingReply {
  return textReply("É um caminhão rígido (com carroceria no próprio chassi) ou cavalo mecânico? Informe também a tração, como 4x2, 6x2, 6x4 ou 8x4.");
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
    text: "Qual o tipo de carroceria: baú, sider, tanque, graneleiro, basculante ou outra?",
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
function processOnboardingStep(
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
    if (!collectedData.primaryVehicleRaw) return { nextState: "awaiting_primary_vehicle", reply: askPrimaryVehicle(), collectedData, finalize: false };
    if (!collectedData.plate) return { nextState: "awaiting_plate", reply: askPlate(), collectedData, finalize: false };
    if (!collectedData.vehicleSetup?.complete) return { nextState: "awaiting_vehicle_configuration", reply: askVehicleConfiguration(), collectedData, finalize: false };
    if (!collectedData.bodyType) return { nextState: "awaiting_body_type", reply: askBodyType(), collectedData, finalize: false };
    if (!collectedData.cargoProfile?.complete) return { nextState: "awaiting_body_type", reply: textReply(collectedData.cargoProfile?.type ? "Informe o peso habitual e se é carga, PBT ou PBTC." : cargoQuestion), collectedData, finalize: false };
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
      const textoTransicao = resolvido.id === ID_VER_TUDO ? ajudaConversacionalV1() : TRANSICAO_POR_INTENCAO[resolvido.id];
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
      return { nextState: "awaiting_primary_vehicle", reply: askPrimaryVehicle(), collectedData: updated, finalize: false };
    }

    // Retomadas legadas seguem para o veículo sem repetir perguntas removidas.
    case "awaiting_region":
    case "awaiting_fixed_route":
    case "awaiting_primary_route":
      return { nextState: "awaiting_primary_vehicle", reply: askPrimaryVehicle(), collectedData, finalize: false };

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
      // Placa obrigatória: não inventa identificação nem aceita pular.
      const placa = parsePlaca(incomingText);
      if (!placa) return { nextState: state, reply: askPlate(), collectedData, finalize: false };
      const updated: OnboardingCollectedData = { ...collectedData, plateAsked: true, plate: placa };
      return { nextState: "awaiting_vehicle_configuration", reply: askVehicleConfiguration(), collectedData: updated, finalize: false };
    }

    case "awaiting_vehicle_configuration": {
      const setup = nextVehicleConfiguration(collectedData.vehicleSetup, incomingText);
      const updated = { ...collectedData, vehicleSetup: setup.data };
      if (!setup.data.complete) return { nextState: state, reply: textReply(setup.question), collectedData: updated, finalize: false };
      return { nextState: "awaiting_body_type", reply: askBodyType(), collectedData: { ...updated, vehicleType: setup.data.kind === "cavalo" ? "cavalo_mecanico" : setup.data.motorAxles === 2 ? "toco" : "truck", axleCount: setup.data.totalAxles }, finalize: false };
    }

    case "awaiting_body_type": {
      if (!collectedData.bodyType) {
        const updated = { ...collectedData, bodyType: resolverCarroceria(incomingText) };
        return { nextState: state, reply: textReply(cargoQuestion), collectedData: updated, finalize: false };
      }
      const cargo = nextCargoProfile(collectedData.cargoProfile, incomingText);
      const updated = { ...collectedData, cargoProfile: cargo.data };
      return cargo.data.complete
        ? { nextState: "awaiting_consumption", reply: askConsumption(), collectedData: updated, finalize: false }
        : { nextState: state, reply: textReply(cargo.question), collectedData: updated, finalize: false };
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

/** Aproveita campos explícitos em uma fala, mantendo a validação e os estados existentes. */
export function processOnboardingMessage(state: OnboardingState, collectedData: OnboardingCollectedData, incomingText: string): OnboardingStepResult {
  const t = norm(incomingText);
  if (collectedData.pendingCombinedConfirmation) {
    if (/^(sim|confirmo|confirmado|certo|est[aá] certo|isso|isso mesmo|ok|pode)$/.test(t)) {
      if (!collectedData.plate) return { nextState: "awaiting_plate", finalize: false, reply: askPlate(), collectedData: { ...collectedData, pendingCombinedConfirmation: false } };
      if (!collectedData.vehicleSetup?.complete) return { nextState: "awaiting_vehicle_configuration", finalize: false, reply: askVehicleConfiguration(), collectedData: { ...collectedData, pendingCombinedConfirmation: false } };
      if (!collectedData.cargoProfile?.complete) return { nextState: "awaiting_body_type", finalize: false, reply: textReply(cargoQuestion), collectedData: { ...collectedData, pendingCombinedConfirmation: false } };
      return { nextState: "completed", finalize: true, reply: completionMessage(), collectedData: { ...collectedData, pendingCombinedConfirmation: false } };
    }
    if (/^(n[aã]o|corrigir|errado)$/.test(t)) {
      return { nextState: "awaiting_primary_vehicle", finalize: false, reply: textReply("Vamos corrigir o caminhão. Me diga marca, modelo e ano; pode incluir placa, configuração, carroceria e consumo."), collectedData: { ...collectedData, primaryVehicleRaw: undefined, vehicleSetup: undefined, cargoProfile: undefined, plate: undefined, plateAsked: false, vehicleType: undefined, axleCount: undefined, bodyType: undefined, averageConsumptionKmL: undefined, consumptionAsked: false, pendingCombinedConfirmation: false } };
    }
    if (!/cancelar|pausar|continuar depois|depois eu continuo/.test(t)) return { nextState: state, finalize: false, reply: textReply("Está certo o resumo do caminhão? Responda sim ou corrigir."), collectedData };
    collectedData = { ...collectedData, pendingCombinedConfirmation: false };
  }
  let data = { ...collectedData };
  let extras = 0;
  if (["awaiting_primary_vehicle", "awaiting_plate", "awaiting_vehicle_configuration", "awaiting_body_type"].includes(state) && !/cancelar|pausar|continuar depois|depois eu continuo/.test(t)) {
    const plate = incomingText.toUpperCase().match(/\b([A-Z]{3})[- ]?([0-9][0-9A-Z][0-9]{2})\b/);
    if (plate && state !== "awaiting_plate") { data.plate = plate[1] + plate[2]; data.plateAsked = true; extras++; }
    const consumo = incomingText.match(/\b(\d+(?:[.,]\d+)?)\s*(?:km\s*\/\s*l|km por litro|quil[oô]metros por litro)\b/i);
    if (consumo) {
      const value = Number(consumo[1].replace(",", "."));
      if (value > 0 && value <= 30) { data.averageConsumptionKmL = value; data.consumptionAsked = true; extras++; }
    }
    if (state !== "awaiting_body_type" && OPCOES_CARROCERIA.some(o => o.palavras.some(p => t.includes(p)))) { data.bodyType = resolverCarroceria(incomingText); extras++; }
    if (state !== "awaiting_vehicle_configuration" && /\b(cavalo|rigido|rígido|toco|truck|bitruck)\b/.test(t)) {
      const setup = nextVehicleConfiguration(data.vehicleSetup, incomingText);
      data.vehicleSetup = setup.data;
      if (setup.data.complete) {
        data.vehicleType = setup.data.kind === "cavalo" ? "cavalo_mecanico" : setup.data.motorAxles === 2 ? "toco" : "truck";
        data.axleCount = setup.data.totalAxles;
      }
      extras++;
    }
    // Placa com frase natural: o parser estrito recebe só a placa identificada.
    if (state === "awaiting_plate" && plate) incomingText = plate[1] + plate[2];
    if (extras) data.usedCombinedInput = true;
  }
  let result = processOnboardingStep(state, data, incomingText);
  // Nunca consome de novo uma resposta em uma etapa que está pedindo desambiguação.
  for (let i = 0; i < 5 && !result.finalize && result.nextState !== state; i++) {
    data = result.collectedData;
    if (result.nextState === "awaiting_plate" && data.plate) result = processOnboardingStep(result.nextState, data, data.plate ?? "depois");
    else if (result.nextState === "awaiting_vehicle_configuration" && data.vehicleSetup?.complete) result = { ...result, nextState: "awaiting_body_type", reply: askBodyType() };
    else if (result.nextState === "awaiting_body_type" && data.bodyType) { result = { ...result, reply: textReply(cargoQuestion) }; break; }
    else if (result.nextState === "awaiting_consumption" && data.consumptionAsked) result = processOnboardingStep(result.nextState, data, data.averageConsumptionKmL?.toString() ?? "não sei");
    else break;
  }
  if (result.finalize) {
    const d = result.collectedData;
    return { ...result, nextState: "awaiting_consumption", finalize: false, collectedData: { ...d, pendingCombinedConfirmation: true }, reply: textReply(`Confere o que entendi do caminhão:\n${d.primaryVehicleRaw}\nPlaca: ${d.plate ?? "não informada"}\nConfiguração: ${d.vehicleSetup?.label ?? d.vehicleType ?? "não definida"}\nCarroceria: ${d.bodyType ?? "não informada"}\n${cargoSummary(d.cargoProfile)}\nConsumo informado: ${d.averageConsumptionKmL ? `${d.averageConsumptionKmL} km/l` : "não informado"}\n\nEstá certo? Responda sim ou corrigir.`) };
  }
  return result;
}
