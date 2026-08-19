import type { DefinicaoFerramenta, DefinicaoParametroFerramenta, ResultadoFerramentaBase } from "./types";
import { normalizarPossivelJson } from "./utils";
import {
  checkCalendarConnection,
  createEvent,
  deleteEvent,
  getDefaultCalendar,
  listCalendars,
  listUpcomingEvents,
  setDefaultCalendar,
  updateEvent,
  GoogleCalendarApiError,
  GoogleCalendarNotConnectedError,
} from "@/services/google/googleCalendarService";
import type { GoogleCalendarEvent, GoogleCalendarListEntry } from "@/lib/google/calendarClient";
import { buildSecureConnectLink } from "@/services/google/googleCalendarConnectLink";
import { isGoogleCalendarConfigured } from "@/lib/google/config";

/**
 * Ferramenta: gerenciar_google_calendar
 *
 * Diferente das outras 11 ferramentas (puras, síncronas, sem I/O), esta é
 * uma ferramenta de INTEGRAÇÃO: faz chamadas reais à API do Google Calendar
 * e ao Supabase (via src/services/google/googleCalendarService.ts). Por
 * isso `executar` é assíncrona — o contrato `DefinicaoFerramenta` já
 * permite isso (ver types.ts).
 *
 * Esta ferramenta NUNCA interpreta linguagem natural: não entende "amanhã",
 * "sexta-feira" nem resolve qual evento "a revisão" se refere quando há
 * mais de um. Isso é responsabilidade de quem monta a entrada (a camada de
 * IA, ainda não implementada — Fase 2 do chat). A ferramenta só executa
 * ações estruturadas e já resolvidas: datas absolutas em ISO 8601 com
 * offset, e — para ALTERAR/EXCLUIR — o id do evento já identificado (por
 * exemplo, por uma chamada anterior no modo CONSULTAR).
 *
 * Nunca lança exceção: qualquer falha (Agenda desconectada, evento
 * inexistente, erro da API do Google) volta como `sucesso: false` com
 * `alertas` explicando o que aconteceu, no mesmo padrão das outras 10
 * ferramentas.
 */

export type ModoGerenciarGoogleCalendar =
  | "VERIFICAR_CONEXAO"
  | "LISTAR_CALENDARIOS"
  | "DEFINIR_CALENDARIO_PADRAO"
  | "CONSULTAR"
  | "CRIAR"
  | "CRIAR_JORNADA"
  | "ALTERAR"
  | "EXCLUIR";

export interface EventoJornadaEntrada {
  title: string;
  /** ISO 8601 com offset — nunca uma expressão relativa. */
  start: string;
  end: string;
  description?: string;
  location?: string;
}

export interface GerenciarGoogleCalendarEntrada {
  modo: ModoGerenciarGoogleCalendar;

  /** Sempre obrigatório — identifica de quem é a Agenda. Vem do contexto da conversa, nunca da mensagem do usuário. */
  userId: string;
  /** Obrigatório para CRIAR/ALTERAR/EXCLUIR (log em calendar_action_logs). */
  companyId?: string;
  conversationId?: string;
  /** Reservado para uso futuro (vincular evento a um veículo) — ainda não persistido em calendar_action_logs. */
  vehicleId?: string;

  calendarId?: string;

  // CRIAR / ALTERAR
  title?: string;
  /** ISO 8601 com offset (ex.: "2026-08-03T08:00:00-03:00") — nunca uma expressão relativa. */
  start?: string;
  end?: string;
  timezone?: string;
  description?: string;
  location?: string;

  // ALTERAR / EXCLUIR
  externalEventId?: string;
  /** Obrigatório como `true` para EXCLUIR. Regra de confirmação vive na camada de IA, não aqui. */
  confirmation?: boolean;

  // CONSULTAR
  searchQuery?: string;
  dateFrom?: string;
  dateTo?: string;
  maxResults?: number;

  // DEFINIR_CALENDARIO_PADRAO
  novoCalendarioPadraoId?: string;

  /**
   * CRIAR_JORNADA — lista de compromissos pra criar de uma vez (viagem
   * completa: saída, paradas, chegada etc.), todos no mesmo `timezone`
   * informado acima. Chega como string JSON do Claude (limitação de schema
   * — ver normalizarPossivelJson em src/ai/tools/utils.ts), nunca array
   * nativo; normalizado no início de executar().
   */
  eventos?: EventoJornadaEntrada[];
}

export interface EventoGoogleCalendarResumo {
  id: string;
  titulo: string;
  inicio?: string;
  fim?: string;
  local?: string;
  descricao?: string;
  link?: string;
}

export interface CalendarioGoogleResumo {
  id: string;
  nome: string;
  padrao: boolean;
  fusoHorario?: string;
}

export interface GerenciarGoogleCalendarResultado extends ResultadoFerramentaBase {
  modo: ModoGerenciarGoogleCalendar;
  conectado?: boolean;
  emailConta?: string | null;
  calendarioPadraoId?: string | null;
  calendarios?: CalendarioGoogleResumo[];
  eventos?: EventoGoogleCalendarResumo[];
  evento?: EventoGoogleCalendarResumo;
  /**
   * Link seguro de conexão OAuth (Camada 4), presente quando a Agenda não
   * está conectada. Funciona igual pelo WhatsApp ou pela web — é a IA que
   * decide como entregar (Camada 6, seção 7: conectar Google pelo
   * WhatsApp). Nunca peça senha do Google na conversa; sempre ofereça este link.
   */
  linkConexao?: string;
}

/** null quando as credenciais do Google Cloud ainda não estão configuradas — a ferramenta nunca inventa um link quebrado. */
function linkConexaoSeDisponivel(userId: string, companyId?: string): string | undefined {
  if (!isGoogleCalendarConfigured()) return undefined;
  try {
    return buildSecureConnectLink(userId, companyId ?? null);
  } catch {
    return undefined;
  }
}

const ISO_COM_OFFSET = /(?:Z|[+-]\d{2}:\d{2})$/;

function mapaEvento(evento: GoogleCalendarEvent): EventoGoogleCalendarResumo {
  return {
    id: evento.id,
    titulo: evento.summary ?? "(sem título)",
    inicio: evento.start.dateTime ?? evento.start.date,
    fim: evento.end.dateTime ?? evento.end.date,
    local: evento.location,
    descricao: evento.description,
    link: evento.htmlLink,
  };
}

function mapaCalendario(item: GoogleCalendarListEntry, padraoId: string | null): CalendarioGoogleResumo {
  return {
    id: item.id,
    nome: item.summary,
    padrao: item.primary === true || item.id === padraoId,
    fusoHorario: item.timeZone,
  };
}

function respostaFalha(
  modo: ModoGerenciarGoogleCalendar,
  alertas: string[],
  dadosFaltantes: string[] = []
): GerenciarGoogleCalendarResultado {
  return {
    sucesso: false,
    modo,
    alertas,
    premissas: [],
    dadosFaltantes,
    mensagemResumo: alertas[0] ?? "Não foi possível concluir a ação na Agenda Google.",
  };
}

function mensagemErroSeguro(err: unknown): { alerta: string; foiDesconectado: boolean } {
  if (err instanceof GoogleCalendarNotConnectedError) {
    return { alerta: "A Agenda Google ainda não está conectada (ou a conexão expirou). Conecte novamente para continuar.", foiDesconectado: true };
  }
  if (err instanceof GoogleCalendarApiError) {
    if (err.code === "EVENT_NOT_FOUND") {
      return { alerta: "Não encontrei esse compromisso na Agenda Google — pode já ter sido excluído ou alterado.", foiDesconectado: false };
    }
    return { alerta: "A Agenda Google não respondeu como esperado. Tente novamente em instantes.", foiDesconectado: false };
  }
  return { alerta: "Não foi possível concluir a ação na Agenda Google por um erro inesperado.", foiDesconectado: false };
}

async function executar(entradaBruta: GerenciarGoogleCalendarEntrada): Promise<GerenciarGoogleCalendarResultado> {
  // eventos chega como string JSON, não array — ver normalizarPossivelJson em utils.ts.
  const entrada: GerenciarGoogleCalendarEntrada = {
    ...entradaBruta,
    eventos: normalizarPossivelJson(entradaBruta.eventos),
  };
  const { modo, userId, companyId } = entrada;

  if (!userId || !companyId) {
    return respostaFalha(
      modo,
      ["userId e companyId são obrigatórios — a ferramenta não sabe de quem/qual empresa é a Agenda sem isso."],
      [!userId ? "userId" : "companyId"].filter(Boolean)
    );
  }

  try {
    switch (modo) {
      case "VERIFICAR_CONEXAO": {
        const status = await checkCalendarConnection(companyId);
        const linkConexao = status.connected ? undefined : linkConexaoSeDisponivel(userId, companyId);
        return {
          sucesso: true,
          modo,
          alertas: status.connected ? [] : ["Agenda Google ainda não conectada."],
          premissas: [],
          dadosFaltantes: [],
          conectado: status.connected,
          emailConta: status.email,
          calendarioPadraoId: status.defaultCalendarId,
          linkConexao,
          mensagemResumo: status.connected
            ? `Agenda conectada (${status.email}).`
            : "Agenda Google não conectada.",
        };
      }

      case "LISTAR_CALENDARIOS": {
        const [calendarios, padraoId] = await Promise.all([listCalendars(companyId), getDefaultCalendar(companyId)]);
        const resumo = calendarios.map((c) => mapaCalendario(c, padraoId));
        return {
          sucesso: true,
          modo,
          alertas: [],
          premissas: [],
          dadosFaltantes: [],
          calendarios: resumo,
          calendarioPadraoId: padraoId,
          mensagemResumo: `${resumo.length} calendário(s) disponível(is).`,
        };
      }

      case "DEFINIR_CALENDARIO_PADRAO": {
        if (!entrada.novoCalendarioPadraoId) {
          return respostaFalha(modo, ["Falta informar qual calendário deve ser o padrão."], ["novoCalendarioPadraoId"]);
        }
        await setDefaultCalendar(companyId, entrada.novoCalendarioPadraoId);
        return {
          sucesso: true,
          modo,
          alertas: [],
          premissas: [],
          dadosFaltantes: [],
          calendarioPadraoId: entrada.novoCalendarioPadraoId,
          mensagemResumo: "Calendário padrão atualizado.",
        };
      }

      case "CONSULTAR": {
        const { items, calendarId } = await listUpcomingEvents({
          companyId,
          calendarId: entrada.calendarId,
          from: entrada.dateFrom,
          to: entrada.dateTo,
          maxResults: entrada.maxResults,
          query: entrada.searchQuery,
        });

        const eventos = items.map(mapaEvento);
        return {
          sucesso: true,
          modo,
          alertas: [],
          premissas: eventos.length === 0 ? [] : [`Consulta feita no calendário "${calendarId}".`],
          dadosFaltantes: [],
          eventos,
          mensagemResumo:
            eventos.length === 0
              ? "Nenhum compromisso encontrado no período consultado."
              : `${eventos.length} compromisso(s) encontrado(s).`,
        };
      }

      case "CRIAR": {
        const faltando: string[] = [];
        if (!entrada.title) faltando.push("title");
        if (!entrada.start) faltando.push("start");
        if (!entrada.end) faltando.push("end");
        if (!entrada.timezone) faltando.push("timezone");
        if (!entrada.companyId) faltando.push("companyId");

        if (faltando.length > 0) {
          return respostaFalha(modo, ["Faltam dados para criar o compromisso — nunca invento data, horário ou título."], faltando);
        }
        if (!ISO_COM_OFFSET.test(entrada.start!) || !ISO_COM_OFFSET.test(entrada.end!)) {
          return respostaFalha(modo, [
            "start/end precisam ser data e horário absolutos com fuso (ex.: 2026-08-03T08:00:00-03:00) — expressões relativas como \"amanhã\" devem ser resolvidas antes de chamar esta ferramenta.",
          ]);
        }

        const criado = await createEvent({
          userId,
          companyId: entrada.companyId!,
          calendarId: entrada.calendarId,
          title: entrada.title!,
          startIso: entrada.start!,
          endIso: entrada.end!,
          timezone: entrada.timezone!,
          description: entrada.description,
          location: entrada.location,
          conversationId: entrada.conversationId,
        });

        return {
          sucesso: true,
          modo,
          alertas: [],
          premissas: [],
          dadosFaltantes: [],
          evento: mapaEvento(criado),
          mensagemResumo: `Compromisso "${entrada.title}" criado na Agenda Google.`,
        };
      }

      case "CRIAR_JORNADA": {
        const faltando: string[] = [];
        if (!entrada.companyId) faltando.push("companyId");
        if (!entrada.timezone) faltando.push("timezone");
        if (!entrada.eventos || entrada.eventos.length === 0) faltando.push("eventos");

        if (faltando.length > 0) {
          return respostaFalha(
            modo,
            ["Faltam dados para criar a jornada completa — nunca invento a programação da viagem (título, início e fim de cada compromisso, e o fuso horário)."],
            faltando
          );
        }

        const criados: EventoGoogleCalendarResumo[] = [];
        const falhas: string[] = [];

        for (const [indice, ev] of entrada.eventos!.entries()) {
          const rotulo = ev?.title || `compromisso ${indice + 1}`;
          if (!ev?.title || !ev.start || !ev.end) {
            falhas.push(`"${rotulo}": faltou título, início ou fim.`);
            continue;
          }
          if (!ISO_COM_OFFSET.test(ev.start) || !ISO_COM_OFFSET.test(ev.end)) {
            falhas.push(`"${rotulo}": start/end precisam ser data e horário absolutos com fuso.`);
            continue;
          }

          try {
            const criado = await createEvent({
              userId,
              companyId: entrada.companyId!,
              calendarId: entrada.calendarId,
              title: ev.title,
              startIso: ev.start,
              endIso: ev.end,
              timezone: entrada.timezone!,
              description: ev.description,
              location: ev.location,
              conversationId: entrada.conversationId,
            });
            criados.push(mapaEvento(criado));
          } catch (err) {
            // Desconexão no meio do lote não é um erro "deste evento" — deixa o
            // catch externo tratar (mesma resposta de reconexão dos outros modos).
            if (err instanceof GoogleCalendarNotConnectedError) throw err;
            const { alerta } = mensagemErroSeguro(err);
            falhas.push(`"${rotulo}": ${alerta}`);
          }
        }

        const todosCriados = falhas.length === 0;
        return {
          sucesso: todosCriados,
          modo,
          alertas: falhas,
          premissas: [],
          dadosFaltantes: [],
          eventos: criados,
          mensagemResumo: todosCriados
            ? `${criados.length} compromisso(s) da jornada criado(s) na Agenda Google.`
            : `${criados.length} de ${entrada.eventos!.length} compromisso(s) criado(s) — ${falhas.length} falharam (ver alertas).`,
        };
      }

      case "ALTERAR": {
        const faltando: string[] = [];
        if (!entrada.externalEventId) faltando.push("externalEventId");
        if (!entrada.companyId) faltando.push("companyId");

        if (faltando.length > 0) {
          return respostaFalha(modo, ["Preciso saber exatamente qual compromisso alterar (externalEventId) antes de agir."], faltando);
        }
        if (entrada.start && !ISO_COM_OFFSET.test(entrada.start)) {
          return respostaFalha(modo, ["start precisa ser data e horário absolutos com fuso."]);
        }
        if (entrada.end && !ISO_COM_OFFSET.test(entrada.end)) {
          return respostaFalha(modo, ["end precisa ser data e horário absolutos com fuso."]);
        }

        const atualizado = await updateEvent({
          userId,
          companyId: entrada.companyId!,
          calendarId: entrada.calendarId,
          eventId: entrada.externalEventId!,
          title: entrada.title,
          startIso: entrada.start,
          endIso: entrada.end,
          timezone: entrada.timezone,
          description: entrada.description,
          location: entrada.location,
          conversationId: entrada.conversationId,
        });

        return {
          sucesso: true,
          modo,
          alertas: [],
          premissas: ["Campos não informados no pedido de alteração foram preservados como estavam."],
          dadosFaltantes: [],
          evento: mapaEvento(atualizado),
          mensagemResumo: "Compromisso alterado na Agenda Google.",
        };
      }

      case "EXCLUIR": {
        const faltando: string[] = [];
        if (!entrada.externalEventId) faltando.push("externalEventId");
        if (!entrada.companyId) faltando.push("companyId");

        if (faltando.length > 0) {
          return respostaFalha(modo, ["Preciso saber exatamente qual compromisso excluir (externalEventId) antes de agir."], faltando);
        }
        if (entrada.confirmation !== true) {
          return respostaFalha(
            modo,
            ["Exclusão não realizada: falta confirmação explícita do usuário (confirmation deve ser true). Nunca excluo por interpretação implícita."],
            ["confirmation"]
          );
        }

        await deleteEvent({
          userId,
          companyId: entrada.companyId!,
          calendarId: entrada.calendarId,
          eventId: entrada.externalEventId!,
          conversationId: entrada.conversationId,
        });

        return {
          sucesso: true,
          modo,
          alertas: [],
          premissas: [],
          dadosFaltantes: [],
          mensagemResumo: "Compromisso excluído da Agenda Google.",
        };
      }

      default: {
        const modoNuncaVisto: never = modo;
        return respostaFalha(modoNuncaVisto as ModoGerenciarGoogleCalendar, [`Modo desconhecido: ${String(modoNuncaVisto)}.`]);
      }
    }
  } catch (err) {
    const { alerta, foiDesconectado } = mensagemErroSeguro(err);
    return {
      sucesso: false,
      modo,
      conectado: foiDesconectado ? false : undefined,
      alertas: [alerta],
      premissas: [],
      dadosFaltantes: [],
      linkConexao: foiDesconectado ? linkConexaoSeDisponivel(userId, companyId) : undefined,
      mensagemResumo: alerta,
    };
  }
}

const PARAMETROS: DefinicaoParametroFerramenta[] = [
  {
    nome: "modo",
    tipo: "enum",
    obrigatorio: true,
    descricao: "Operação a executar na Agenda Google.",
    valoresPossiveis: [
      "VERIFICAR_CONEXAO",
      "LISTAR_CALENDARIOS",
      "DEFINIR_CALENDARIO_PADRAO",
      "CONSULTAR",
      "CRIAR",
      "CRIAR_JORNADA",
      "ALTERAR",
      "EXCLUIR",
    ],
  },
  { nome: "userId", tipo: "string", obrigatorio: true, descricao: "Usuário dono da Agenda (do contexto da conversa, nunca da mensagem)." },
  { nome: "companyId", tipo: "string", obrigatorio: false, descricao: "Empresa relacionada — obrigatório para CRIAR/ALTERAR/EXCLUIR." },
  { nome: "conversationId", tipo: "string", obrigatorio: false, descricao: "Conversa de origem, para registro em calendar_action_logs." },
  { nome: "vehicleId", tipo: "string", obrigatorio: false, descricao: "Veículo relacionado ao compromisso, quando identificado." },
  { nome: "calendarId", tipo: "string", obrigatorio: false, descricao: "Calendário a usar; padrão é o calendário padrão salvo do usuário." },
  { nome: "title", tipo: "string", obrigatorio: false, descricao: "Título do compromisso (CRIAR/ALTERAR)." },
  { nome: "start", tipo: "string", obrigatorio: false, descricao: "Início em ISO 8601 com offset — nunca uma expressão relativa (CRIAR/ALTERAR)." },
  { nome: "end", tipo: "string", obrigatorio: false, descricao: "Fim em ISO 8601 com offset (CRIAR/ALTERAR)." },
  { nome: "timezone", tipo: "string", obrigatorio: false, descricao: "Fuso horário IANA (ex.: America/Sao_Paulo) — em CRIAR_JORNADA, vale para todos os compromissos da lista." },
  {
    nome: "eventos",
    tipo: "string",
    obrigatorio: false,
    descricao:
      'Obrigatório em CRIAR_JORNADA: lista de compromissos da viagem completa, como JSON — array de objetos {title, start, end, description?, location?}, cada start/end em ISO 8601 absoluto com fuso. Ex.: \'[{"title":"Saída","start":"...","end":"..."},{"title":"Parada em X","start":"...","end":"..."}]\'.',
  },
  { nome: "description", tipo: "string", obrigatorio: false, descricao: "Descrição do compromisso." },
  { nome: "location", tipo: "string", obrigatorio: false, descricao: "Local do compromisso." },
  { nome: "externalEventId", tipo: "string", obrigatorio: false, descricao: "Id do evento no Google Calendar — obrigatório para ALTERAR/EXCLUIR." },
  { nome: "confirmation", tipo: "boolean", obrigatorio: false, descricao: "Confirmação explícita do usuário — obrigatória (true) para EXCLUIR." },
  { nome: "searchQuery", tipo: "string", obrigatorio: false, descricao: "Texto de busca livre entre os eventos (CONSULTAR)." },
  { nome: "dateFrom", tipo: "string", obrigatorio: false, descricao: "Início do período de consulta, ISO 8601 (CONSULTAR)." },
  { nome: "dateTo", tipo: "string", obrigatorio: false, descricao: "Fim do período de consulta, ISO 8601 (CONSULTAR)." },
  { nome: "maxResults", tipo: "number", obrigatorio: false, descricao: "Limite de resultados da consulta (máximo 50)." },
  { nome: "novoCalendarioPadraoId", tipo: "string", obrigatorio: false, descricao: "Novo calendário padrão (DEFINIR_CALENDARIO_PADRAO)." },
];

export const ferramentaGerenciarGoogleCalendar: DefinicaoFerramenta<
  GerenciarGoogleCalendarEntrada,
  GerenciarGoogleCalendarResultado
> = {
  nome: "gerenciar_google_calendar",
  descricao:
    "Consulta, cria, altera ou exclui compromissos na Agenda Google do usuário, cria de uma vez todos os compromissos de uma jornada/viagem completa, e verifica/gerencia a conexão da conta.",
  objetivo:
    "Dar à IA acesso estruturado à Agenda Google do cliente para agendar manutenções, vencimentos de documentos e compromissos operacionais, sem nunca interpretar linguagem natural ou inventar data/horário. CRIAR_JORNADA evita ter que criar evento por evento quando o cliente quer a viagem inteira (saída, paradas, chegada) agendada de uma vez.",
  parametros: PARAMETROS,
  executar,
};
