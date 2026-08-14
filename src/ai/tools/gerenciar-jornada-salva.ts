import type { DefinicaoFerramenta, DefinicaoParametroFerramenta, ResultadoFerramentaBase } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSavedJourney, listSavedJourneysForPanel, getSavedJourney, updateSavedJourney } from "@/services/supabase/savedJourneyService";
import { getVehicle } from "@/services/supabase/vehicleService";
import type { SavedJourneyRow, JourneyStatusEnum } from "@/lib/supabase/tables";

/**
 * Ferramenta: gerenciar_jornada_salva
 *
 * Ferramenta de INTEGRAÇÃO (I/O real com Supabase — `saved_journeys`),
 * mesmo padrão de `gerenciar_rota_salva`. Persiste uma jornada operacional
 * quando o cliente quer usar de verdade o que `calcular_jornada` simulou —
 * NÃO é um modo de `calcular_jornada` (que é pura e sempre grava em
 * `analysis_runs` a cada simulação; misturar quebraria essa pureza e
 * salvaria toda pergunta hipotética como se fosse operacional).
 *
 * `analysisRunId`, quando informado, só linka na simulação de origem —
 * nunca é lido de volta automaticamente aqui; os campos (origem, destino,
 * horários) precisam vir explícitos na chamada, mesma responsabilidade já
 * delegada à IA em `gerenciar_rota_salva.veiculoId`.
 */

export type ModoGerenciarJornadaSalva = "CRIAR" | "LISTAR" | "ATUALIZAR" | "CANCELAR";

const STATUS_JORNADA: JourneyStatusEnum[] = ["planejada", "em_andamento", "concluida", "cancelada"];

export interface GerenciarJornadaSalvaEntrada {
  modo: ModoGerenciarJornadaSalva;
  userId: string;
  companyId: string;
  conversationId?: string;
  /** Obrigatório em ATUALIZAR/CANCELAR. */
  journeyId?: string;

  analysisRunId?: string;
  motoristaId?: string;
  veiculoId?: string;
  origem?: string;
  destino?: string;
  saidaPrevista?: string;
  chegadaPrevista?: string;
  duracaoMinutos?: number;
  status?: JourneyStatusEnum;
  saidaReal?: string;
  chegadaReal?: string;
  observacoes?: string;
}

export interface JornadaSalvaResumo {
  id: string;
  motoristaId: string | null;
  veiculoId: string | null;
  origem: string | null;
  destino: string | null;
  saidaPrevista: string | null;
  chegadaPrevista: string | null;
  saidaReal: string | null;
  chegadaReal: string | null;
  duracaoMinutos: number | null;
  status: JourneyStatusEnum;
  observacoes: string | null;
}

export interface GerenciarJornadaSalvaResultado extends ResultadoFerramentaBase {
  modo: ModoGerenciarJornadaSalva;
  jornada?: JornadaSalvaResumo;
  jornadas?: JornadaSalvaResumo[];
}

function mapaJornada(row: SavedJourneyRow): JornadaSalvaResumo {
  return {
    id: row.id,
    motoristaId: row.driver_id,
    veiculoId: row.vehicle_id,
    origem: row.origin,
    destino: row.destination,
    saidaPrevista: row.scheduled_departure,
    chegadaPrevista: row.scheduled_arrival,
    saidaReal: row.actual_departure,
    chegadaReal: row.actual_arrival,
    duracaoMinutos: row.duration_minutes,
    status: row.status,
    observacoes: row.notes,
  };
}

function respostaFalha(modo: ModoGerenciarJornadaSalva, alertas: string[], dadosFaltantes: string[] = []): GerenciarJornadaSalvaResultado {
  return { sucesso: false, modo, alertas, premissas: [], dadosFaltantes, mensagemResumo: alertas[0] ?? "Não foi possível concluir a ação de jornada." };
}

async function executar(entrada: GerenciarJornadaSalvaEntrada): Promise<GerenciarJornadaSalvaResultado> {
  const { modo, userId, companyId } = entrada;

  if (!userId || !companyId) {
    return respostaFalha(modo, ["Não foi possível identificar o usuário/empresa para a jornada."], ["userId", "companyId"]);
  }

  const admin = createAdminClient();

  try {
    if (modo === "CRIAR") {
      if (!entrada.origem || !entrada.destino) {
        return respostaFalha(modo, ["Preciso de origem e destino para salvar a jornada."], [!entrada.origem ? "origem" : "", !entrada.destino ? "destino" : ""].filter(Boolean));
      }

      if (entrada.veiculoId) {
        const veiculo = await getVehicle(admin, entrada.veiculoId);
        if (!veiculo || veiculo.company_id !== companyId) {
          return respostaFalha(modo, ["Não encontrei esse veículo para esta empresa — use LISTAR de veículos antes se houver dúvida sobre qual é."], ["veiculoId"]);
        }
      }

      const criada = await createSavedJourney(admin, {
        companyId,
        createdByUserId: userId,
        analysisRunId: entrada.analysisRunId,
        driverId: entrada.motoristaId,
        vehicleId: entrada.veiculoId,
        conversationId: entrada.conversationId,
        origin: entrada.origem,
        destination: entrada.destino,
        scheduledDeparture: entrada.saidaPrevista,
        scheduledArrival: entrada.chegadaPrevista,
        durationMinutes: entrada.duracaoMinutos,
        resultData: {},
        notes: entrada.observacoes,
      });

      return {
        sucesso: true,
        modo,
        alertas: [],
        premissas: [],
        dadosFaltantes: [],
        jornada: mapaJornada(criada),
        mensagemResumo: `Jornada de "${criada.origin}" até "${criada.destination}" salva.`,
      };
    }

    if (modo === "LISTAR") {
      const jornadas = (await listSavedJourneysForPanel(admin, companyId)).map(mapaJornada);
      return {
        sucesso: true,
        modo,
        alertas: [],
        premissas: [],
        dadosFaltantes: [],
        jornadas,
        mensagemResumo: jornadas.length === 0 ? "Nenhuma jornada salva ainda." : `${jornadas.length} jornada(s) encontrada(s).`,
      };
    }

    // ATUALIZAR / CANCELAR exigem journeyId, sempre verificado contra a empresa.
    if (!entrada.journeyId) {
      return respostaFalha(modo, ["Preciso saber exatamente qual jornada (journeyId) — use LISTAR antes se houver dúvida sobre qual é."], ["journeyId"]);
    }

    const jornadaAtual = await getSavedJourney(admin, entrada.journeyId);
    if (!jornadaAtual || jornadaAtual.company_id !== companyId) {
      return respostaFalha(modo, ["Não encontrei essa jornada para esta empresa."], ["journeyId"]);
    }

    if (modo === "ATUALIZAR") {
      const atualizada = await updateSavedJourney(admin, entrada.journeyId, companyId, {
        status: entrada.status,
        actualDeparture: entrada.saidaReal,
        actualArrival: entrada.chegadaReal,
        notes: entrada.observacoes,
      });

      return {
        sucesso: true,
        modo,
        alertas: [],
        premissas: [],
        dadosFaltantes: [],
        jornada: mapaJornada(atualizada),
        mensagemResumo: `Jornada atualizada.`,
      };
    }

    // CANCELAR
    const cancelada = await updateSavedJourney(admin, entrada.journeyId, companyId, { status: "cancelada" });
    return {
      sucesso: true,
      modo,
      alertas: [],
      premissas: [],
      dadosFaltantes: [],
      jornada: mapaJornada(cancelada),
      mensagemResumo: "Jornada cancelada.",
    };
  } catch {
    return respostaFalha(modo, ["Não foi possível concluir a ação de jornada agora. Confira os dados e tente novamente."]);
  }
}

const PARAMETROS: DefinicaoParametroFerramenta[] = [
  { nome: "modo", tipo: "enum", obrigatorio: true, descricao: "Operação a executar.", valoresPossiveis: ["CRIAR", "LISTAR", "ATUALIZAR", "CANCELAR"] },
  { nome: "userId", tipo: "string", obrigatorio: true, descricao: "Usuário dono da empresa (do contexto da conversa, nunca da mensagem)." },
  { nome: "companyId", tipo: "string", obrigatorio: true, descricao: "Empresa dona da(s) jornada(s) (do contexto da conversa)." },
  { nome: "conversationId", tipo: "string", obrigatorio: false, descricao: "Conversa de origem." },
  { nome: "journeyId", tipo: "string", obrigatorio: false, descricao: "Id da jornada — obrigatório em ATUALIZAR/CANCELAR. Use LISTAR antes se não tiver certeza de qual é." },
  { nome: "analysisRunId", tipo: "string", obrigatorio: false, descricao: "Id da simulação de calcular_jornada que originou esta jornada, se houver (vem no resultado dessa ferramenta)." },
  { nome: "motoristaId", tipo: "string", obrigatorio: false, descricao: "Id do motorista — use LISTAR de motoristas (gerenciar_motorista) antes se não tiver certeza." },
  { nome: "veiculoId", tipo: "string", obrigatorio: false, descricao: "Id do veículo — use LISTAR de veículos (gerenciar_veiculo) antes se não tiver certeza." },
  { nome: "origem", tipo: "string", obrigatorio: false, descricao: "Origem da jornada — obrigatória em CRIAR." },
  { nome: "destino", tipo: "string", obrigatorio: false, descricao: "Destino da jornada — obrigatório em CRIAR." },
  { nome: "saidaPrevista", tipo: "string", obrigatorio: false, descricao: "Data/hora prevista de saída, ISO 8601 com offset." },
  { nome: "chegadaPrevista", tipo: "string", obrigatorio: false, descricao: "Data/hora prevista de chegada, ISO 8601 com offset." },
  { nome: "duracaoMinutos", tipo: "number", obrigatorio: false, descricao: "Duração prevista da jornada, em minutos (vem do resultado de calcular_jornada, se disponível)." },
  { nome: "status", tipo: "enum", obrigatorio: false, descricao: "Status da jornada — usado em ATUALIZAR.", valoresPossiveis: STATUS_JORNADA },
  { nome: "saidaReal", tipo: "string", obrigatorio: false, descricao: "Data/hora real de saída, ISO 8601 com offset — usado em ATUALIZAR." },
  { nome: "chegadaReal", tipo: "string", obrigatorio: false, descricao: "Data/hora real de chegada, ISO 8601 com offset — usado em ATUALIZAR." },
  { nome: "observacoes", tipo: "string", obrigatorio: false, descricao: "Observações livres sobre a jornada." },
];

export const ferramentaGerenciarJornadaSalva: DefinicaoFerramenta<GerenciarJornadaSalvaEntrada, GerenciarJornadaSalvaResultado> = {
  nome: "gerenciar_jornada_salva",
  descricao: "Salva, lista, atualiza e cancela jornadas operacionais (distintas de simulação) a partir do que o cliente pede na conversa.",
  objetivo:
    "Permitir que o cliente use de verdade uma jornada simulada por calcular_jornada — salvando origem, destino, motorista, veículo e horários — sem transformar toda pergunta hipotética em registro permanente. Nunca inventa um valor não informado pelo usuário.",
  parametros: PARAMETROS,
  executar,
};
