import type { OnboardingState, VehicleTypeEnum } from "@/lib/supabase/tables";
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
 * Redesenho (identidade obrigatória e curta; detalhe de veículo/implemento
 * fica progressivo — perguntado pela IA só quando uma ferramenta precisar,
 * fora deste arquivo): nome → perfil (lista) → intenção ("o que você quer
 * resolver primeiro", ver askIntent — adicionado em 07/08/2026, a pedido
 * do Rafael, pra já mostrar a abrangência do produto antes de pedir mais
 * dado) → cidade → região → rota fixa (botão) → marca/modelo do veículo
 * (texto livre, opcional) → configuração do veículo (obrigatória, ver
 * vehicleConfigClassifier.ts) → concluído.
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
  primaryVehicleRaw?: string;
  primaryVehicleSkipped?: boolean;
  vehicleType?: VehicleTypeEnum;
  axleCount?: number | null;
  /** true enquanto aguarda a resposta da lista de desambiguação (cavalo mecânico/carreta) — nunca persiste além do próximo turno. */
  awaitingVehicleConfigChoice?: boolean;
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
const SKIP_WORDS = ["pular", "depois"];

function norm(text: string): string {
  return text.trim().toLowerCase();
}

function textReply(text: string): OnboardingReply {
  return { kind: "text", text };
}

/**
 * Reescrita em 07/08/2026 (proposta do Rafael, testando de verdade): a
 * versão anterior pedia o nome sem explicar nada do produto — quem chega
 * pela primeira vez não tinha ideia da abrangência antes de já estar
 * respondendo pergunta. Agora explica o valor primeiro.
 */
export function firstOnboardingMessage(): string {
  return (
    "Olá! Eu sou o Frota IA, seu especialista em transporte pelo WhatsApp.\n\n" +
    "Antes de aceitar um frete ou tomar uma decisão, eu ajudo você a calcular o que realmente compensa. Analiso fretes, custos, combustível, CPK, pneus, manutenção, rotas, jornada e documentos. Também crio alertas e busco notícias e informações em fontes oficiais.\n\n" +
    "Você pode falar comigo por texto, áudio, foto, PDF ou planilha.\n\n" +
    "Como posso chamar você?"
  );
}

const OPCOES_PERFIL: Array<{ id: string; title: string; companyType: OnboardingCompanyType; label: string }> = [
  { id: "motorista_autonomo", title: "Motorista autônomo", companyType: "autonomo", label: "motorista autônomo" },
  { id: "apenas_motorista", title: "Apenas motorista", companyType: "outro", label: "motorista" },
  { id: "dono_empresa", title: "Dono de empresa", companyType: "transportadora", label: "dono de empresa" },
  { id: "gestor_frota", title: "Gestor de frota", companyType: "transportadora", label: "gestor de frota" },
  { id: "transportador", title: "Transportador", companyType: "transportadora", label: "transportador" },
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
 * helpMenu.ts, nunca duplicada) + a opção "ver tudo". Adicionada em
 * 07/08/2026: mostra a abrangência do produto logo no início, em vez de só
 * pedir dado atrás de dado — e o que o cliente escolhe aqui personaliza a
 * mensagem de conclusão do cadastro (ver MENSAGEM_POS_CADASTRO no webhook).
 */
function askIntent(): OnboardingReply {
  return {
    kind: "list",
    text: "O que você quer resolver primeiro com o Frota IA?",
    title: "Por onde começar",
    buttonLabel: "Escolher opção",
    options: [
      ...CATEGORIAS_AJUDA.map((c) => ({ id: c.id, title: `${c.emoji} ${c.titulo}` })),
      { id: ID_VER_TUDO, title: "Ver tudo que o Frota IA faz" },
    ],
  };
}

/** Texto curto de transição por categoria — diz o que mandar em seguida, sem tentar calcular nada ainda (empresa/veículo só existem no fim do onboarding). */
const TRANSICAO_POR_INTENCAO: Record<string, string> = {
  fretes: 'Perfeito! Quando quiser, me manda a foto do CT-e, a proposta de frete, ou escreve: origem e destino, valor oferecido, tipo de veículo, consumo médio e preço do diesel.',
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
  return textReply("Qual cidade ou região você utiliza como base principal?");
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
    text: "Em qual região você mais atua? Toque numa opção, ou digite se forem várias (ex.: \"Sul e Sudeste\").",
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
  return textReply('Você trabalha com rota fixa? Responda "sim" ou "não".');
}

function askPrimaryVehicle(): OnboardingReply {
  return textReply('Qual a marca e modelo do seu veículo? Pode incluir o ano. Caso não queira cadastrar agora, responda "depois".');
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
  { id: "outro", title: "Outro / não sei ainda" },
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

/**
 * O conteúdo real enviado ao cliente na conclusão do cadastro (mensagem
 * fixa + lista das 10 sugestões iniciais) é montado no webhook
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
    // sem o estado anterior, então reiniciamos a pergunta mais básica ainda
    // não respondida a partir do collectedData já salvo.
    if (!collectedData.name) return { nextState: "awaiting_name", reply: textReply(firstOnboardingMessage()), collectedData, finalize: false };
    if (!collectedData.companyType) return { nextState: "awaiting_profile", reply: askProfile(collectedData.name), collectedData, finalize: false };
    if (!collectedData.intentId) return { nextState: "awaiting_intent", reply: askIntent(), collectedData, finalize: false };
    if (!collectedData.baseCity) return { nextState: "awaiting_base_location", reply: askBaseLocation(), collectedData, finalize: false };
    if (!collectedData.region) return { nextState: "awaiting_region", reply: askRegion(), collectedData, finalize: false };
    if (collectedData.hasFixedRoute === undefined) return { nextState: "awaiting_fixed_route", reply: askFixedRoute(), collectedData, finalize: false };
    if (collectedData.primaryVehicleRaw === undefined && !collectedData.primaryVehicleSkipped) {
      return { nextState: "awaiting_primary_vehicle", reply: askPrimaryVehicle(), collectedData, finalize: false };
    }
    return { nextState: "awaiting_vehicle_configuration", reply: askVehicleConfiguration(), collectedData, finalize: false };
  }

  switch (state) {
    case "awaiting_name": {
      const name = incomingText.trim();
      if (!name) {
        return { nextState: state, reply: textReply("Não entendi — como posso te chamar?"), collectedData, finalize: false };
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
      return { nextState: "awaiting_primary_vehicle", reply: askPrimaryVehicle(), collectedData: updated, finalize: false };
    }

    case "awaiting_primary_vehicle": {
      if (SKIP_WORDS.some((w) => t.includes(w))) {
        const updated = { ...collectedData, primaryVehicleSkipped: true };
        return { nextState: "awaiting_vehicle_configuration", reply: askVehicleConfiguration(), collectedData: updated, finalize: false };
      }
      const updated = { ...collectedData, primaryVehicleRaw: incomingText.trim() };
      return { nextState: "awaiting_vehicle_configuration", reply: askVehicleConfiguration(), collectedData: updated, finalize: false };
    }

    case "awaiting_vehicle_configuration": {
      // Meio da desambiguação (cavalo mecânico/carreta): esta mensagem é a
      // escolha da lista anterior, não uma nova descrição livre.
      if (collectedData.awaitingVehicleConfigChoice) {
        const resolvido = resolverDesambiguacaoArticulado(incomingText);
        if (!resolvido) {
          // Toque inválido/texto solto no meio da desambiguação: repete a
          // mesma lista, sem sair do estado (nunca conclui sem os dois campos).
          const classificacao = classificarConfiguracaoVeiculo("cavalo mecanico");
          const reply = classificacao.status === "precisa_desambiguar" ? classificacao.reply : askVehicleConfiguration();
          return { nextState: state, reply, collectedData, finalize: false };
        }
        const updated = {
          ...collectedData,
          vehicleType: resolvido.vehicleType,
          axleCount: resolvido.axleCount,
          awaitingVehicleConfigChoice: false,
        };
        return { nextState: "completed", reply: completionMessage(), collectedData: updated, finalize: true };
      }

      const classificacao = classificarConfiguracaoVeiculo(incomingText);

      if (classificacao.status === "resolvido") {
        const updated = { ...collectedData, vehicleType: classificacao.vehicleType, axleCount: classificacao.axleCount };
        return { nextState: "completed", reply: completionMessage(), collectedData: updated, finalize: true };
      }

      if (classificacao.status === "precisa_desambiguar") {
        const updated = { ...collectedData, awaitingVehicleConfigChoice: true };
        return { nextState: state, reply: classificacao.reply, collectedData: updated, finalize: false };
      }

      // "nao_reconhecido": pergunta obrigatória, nunca pula — repete
      // reformulada até classificar (ver decisão de produto: configuração
      // do veículo é essencial demais pra deixar sem preencher).
      return { nextState: state, reply: classificacao.reply, collectedData, finalize: false };
    }

    default:
      return { nextState: state, reply: textReply("Pode repetir, por favor?"), collectedData, finalize: false };
  }
}
