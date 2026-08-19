import type { DefinicaoFerramenta, DefinicaoParametroFerramenta, ResultadoFerramentaBase } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";
import { listChecklistDispatchesForPanel, dispatchesFromToday } from "@/services/supabase/checklistDispatchService";
import { listDriversForPanel } from "@/services/supabase/driverService";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { computeChecklistDailySummary, computeChecklistAdherence, type ChecklistAdherenceByDriver } from "@/lib/frota/checklistAdherence";
import type { ChecklistDispatchRow } from "@/lib/supabase/tables";

/**
 * Ferramenta: consultar_checklist (Checklist V2, B.7)
 *
 * Mesma fonte de dado do painel (checklistAdherence.ts) — garante que a IA
 * responde o mesmo número que aparece na tela Checklists, tanto pelo
 * WhatsApp quanto pelo widget do painel. Só leitura, nunca inventa
 * diagnóstico mecânico: "atenção" é sempre o texto literal que o motorista
 * mandou, nunca uma interpretação da IA.
 */

export type ModoConsultarChecklist = "HOJE" | "ADERENCIA_MOTORISTA" | "ADERENCIA_GERAL" | "OCORRENCIAS";

export interface ConsultarChecklistEntrada {
  modo: ModoConsultarChecklist;
  userId: string;
  companyId: string;
  /** ADERENCIA_MOTORISTA — nome (ou parte do nome) do motorista, busca case-insensitive. */
  nomeMotorista?: string;
  /** ADERENCIA_GERAL / OCORRENCIAS — período em dias pra trás (padrão 30). */
  diasPeriodo?: number;
}

interface OcorrenciaResumo {
  motorista: string;
  veiculo: string;
  data: string;
  relato: string | null;
}

export interface ConsultarChecklistResultado extends ResultadoFerramentaBase {
  modo: ModoConsultarChecklist;
  resumoHoje?: { enviados: number; respondidos: number; naoRespondidos: number; atencao: number };
  aderenciaMotorista?: ChecklistAdherenceByDriver;
  rankingAderencia?: ChecklistAdherenceByDriver[];
  ocorrencias?: OcorrenciaResumo[];
}

function respostaFalha(modo: ModoConsultarChecklist, alertas: string[], dadosFaltantes: string[] = []): ConsultarChecklistResultado {
  return { sucesso: false, modo, alertas, premissas: [], dadosFaltantes, mensagemResumo: alertas[0] ?? "Não foi possível consultar o checklist." };
}

function dispatchesDoPeriodo(dispatches: ChecklistDispatchRow[], dias: number): ChecklistDispatchRow[] {
  const limite = Date.now() - dias * 24 * 60 * 60 * 1000;
  return dispatches.filter((d) => new Date(d.sent_at).getTime() >= limite);
}

async function executar(entrada: ConsultarChecklistEntrada): Promise<ConsultarChecklistResultado> {
  const { modo, companyId } = entrada;

  if (!companyId) {
    return respostaFalha(modo, ["Não foi possível identificar a empresa para consultar o checklist."], ["companyId"]);
  }

  try {
    const admin = createAdminClient();
    const [dispatches, motoristas] = await Promise.all([listChecklistDispatchesForPanel(admin, companyId), listDriversForPanel(admin, companyId)]);

    switch (modo) {
      case "HOJE": {
        const resumo = computeChecklistDailySummary(dispatchesFromToday(dispatches));
        return {
          sucesso: true,
          modo,
          alertas: [],
          premissas: [],
          dadosFaltantes: [],
          resumoHoje: resumo,
          mensagemResumo:
            resumo.enviados === 0
              ? "Nenhum checklist enviado hoje ainda."
              : `Hoje: ${resumo.enviados} enviado(s), ${resumo.respondidos} respondido(s), ${resumo.naoRespondidos} sem resposta, ${resumo.atencao} com atenção.`,
        };
      }

      case "ADERENCIA_MOTORISTA": {
        if (!entrada.nomeMotorista) {
          return respostaFalha(modo, ["Preciso saber de qual motorista — informe o nome."], ["nomeMotorista"]);
        }
        const busca = entrada.nomeMotorista.trim().toLowerCase();
        const motorista = motoristas.find((m) => m.name.toLowerCase().includes(busca));
        if (!motorista) {
          return respostaFalha(modo, [`Não encontrei nenhum motorista chamado "${entrada.nomeMotorista}".`]);
        }

        const dias = entrada.diasPeriodo ?? 30;
        const periodo = dispatchesDoPeriodo(dispatches, dias);
        const aderencia = computeChecklistAdherence(periodo, motoristas).find((a) => a.driverId === motorista.id);

        if (!aderencia) {
          return {
            sucesso: true,
            modo,
            alertas: [],
            premissas: [],
            dadosFaltantes: [],
            mensagemResumo: `${motorista.name} não recebeu nenhum checklist nos últimos ${dias} dias.`,
          };
        }

        return {
          sucesso: true,
          modo,
          alertas: [],
          premissas: [],
          dadosFaltantes: [],
          aderenciaMotorista: aderencia,
          mensagemResumo: `${motorista.name} nos últimos ${dias} dias: ${aderencia.enviados} enviado(s), ${aderencia.respondidos} respondido(s), aderência de ${aderencia.aderenciaPercent}%.`,
        };
      }

      case "ADERENCIA_GERAL": {
        const dias = entrada.diasPeriodo ?? 30;
        const ranking = computeChecklistAdherence(dispatchesDoPeriodo(dispatches, dias), motoristas).sort(
          (a, b) => a.aderenciaPercent - b.aderenciaPercent
        );

        return {
          sucesso: true,
          modo,
          alertas: [],
          premissas: [],
          dadosFaltantes: [],
          rankingAderencia: ranking,
          mensagemResumo:
            ranking.length === 0
              ? `Nenhum checklist enviado nos últimos ${dias} dias.`
              : `${ranking.length} motorista(s) com checklist nos últimos ${dias} dias — pior aderência: ${ranking[0].driverName} (${ranking[0].aderenciaPercent}%).`,
        };
      }

      case "OCORRENCIAS": {
        const dias = entrada.diasPeriodo ?? 30;
        const veiculos = await listVehiclesForPanel(admin, companyId);
        const motoristasPorId = new Map(motoristas.map((m) => [m.id, m]));
        const veiculosPorId = new Map(veiculos.map((v) => [v.id, v]));

        const ocorrencias = dispatchesDoPeriodo(dispatches, dias)
          .filter((d) => d.response_status === "atencao")
          .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())
          .map((d) => ({
            motorista: motoristasPorId.get(d.driver_id)?.name ?? "—",
            veiculo: (d.vehicle_id && (veiculosPorId.get(d.vehicle_id)?.name || veiculosPorId.get(d.vehicle_id)?.plate)) || "—",
            data: d.sent_at,
            relato: d.response_text,
          }));

        return {
          sucesso: true,
          modo,
          alertas: [],
          premissas: [],
          dadosFaltantes: [],
          ocorrencias,
          mensagemResumo:
            ocorrencias.length === 0
              ? `Nenhuma ocorrência de checklist nos últimos ${dias} dias.`
              : `${ocorrencias.length} ocorrência(s) de checklist com atenção nos últimos ${dias} dias.`,
        };
      }

      default: {
        const modoNuncaVisto: never = modo;
        return respostaFalha(modoNuncaVisto as ModoConsultarChecklist, [`Modo desconhecido: ${String(modoNuncaVisto)}.`]);
      }
    }
  } catch {
    return respostaFalha(modo, ["Não foi possível consultar o checklist agora. Tente novamente em instantes."]);
  }
}

const PARAMETROS: DefinicaoParametroFerramenta[] = [
  {
    nome: "modo",
    tipo: "enum",
    obrigatorio: true,
    descricao: "Tipo de consulta.",
    valoresPossiveis: ["HOJE", "ADERENCIA_MOTORISTA", "ADERENCIA_GERAL", "OCORRENCIAS"],
  },
  { nome: "userId", tipo: "string", obrigatorio: true, descricao: "Usuário da conversa (do contexto, nunca da mensagem)." },
  { nome: "companyId", tipo: "string", obrigatorio: true, descricao: "Empresa (do contexto da conversa)." },
  { nome: "nomeMotorista", tipo: "string", obrigatorio: false, descricao: "Nome (ou parte) do motorista — obrigatório em ADERENCIA_MOTORISTA." },
  { nome: "diasPeriodo", tipo: "number", obrigatorio: false, descricao: "Período em dias pra trás — padrão 30 (ADERENCIA_MOTORISTA/ADERENCIA_GERAL/OCORRENCIAS)." },
];

export const ferramentaConsultarChecklist: DefinicaoFerramenta<ConsultarChecklistEntrada, ConsultarChecklistResultado> = {
  nome: "consultar_checklist",
  descricao:
    "Consulta o checklist diário dos motoristas: resumo de hoje, aderência de um motorista específico, ranking geral de aderência da empresa, ou lista de ocorrências (checklists respondidos com atenção).",
  objetivo:
    "Deixar o proprietário/gestor perguntar 'quem não respondeu checklist hoje?', 'como está o João nos últimos 30 dias?' ou 'quais veículos tiveram problema no checklist?' e receber a mesma resposta que veria no painel.",
  parametros: PARAMETROS,
  executar,
};
