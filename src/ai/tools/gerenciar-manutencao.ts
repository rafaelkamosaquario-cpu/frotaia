import type { DefinicaoFerramenta, DefinicaoParametroFerramenta, ResultadoFerramentaBase } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";
import { listMaintenanceSchedulesForPanel, createMaintenanceSchedule, updateMaintenanceSchedule } from "@/services/supabase/maintenanceScheduleService";
import { getVehicle } from "@/services/supabase/vehicleService";
import type { MaintenanceScheduleRow, MaintenanceStatusEnum } from "@/lib/supabase/tables";

/**
 * Ferramenta: gerenciar_manutencao
 *
 * Ferramenta de INTEGRAÇÃO (I/O real com Supabase — `maintenance_schedules`),
 * mesmo padrão de `gerenciar_veiculo`/`gerenciar_motorista`. Fecha a lacuna
 * real: `maintenance_schedules` só existia pro painel web (V2) — o WhatsApp
 * não tinha como agendar/consultar manutenção (plano de unificação V1+V2,
 * Fase 3).
 *
 * CONCLUIR/CANCELAR são atalhos de ATUALIZAR (só trocam o status) — modos
 * separados porque são a intenção mais comum ("a revisão foi feita",
 * "cancela essa manutenção"), evitando a IA ter que montar um payload de
 * atualização genérico pra uma troca de status simples.
 *
 * `veiculoId`, quando informado, é sempre verificado contra `companyId`
 * antes de vincular — nunca confia só no id que o modelo mandou.
 */

export type ModoGerenciarManutencao = "CRIAR" | "LISTAR" | "ATUALIZAR" | "CONCLUIR" | "CANCELAR";

const STATUS_MANUTENCAO: MaintenanceStatusEnum[] = ["pendente", "agendado", "concluido", "cancelado"];

export interface GerenciarManutencaoEntrada {
  modo: ModoGerenciarManutencao;
  userId: string;
  companyId: string;
  conversationId?: string;
  /** Obrigatório em ATUALIZAR/CONCLUIR/CANCELAR. */
  scheduleId?: string;

  veiculoId?: string;
  tipo?: string;
  /** Data prevista, formato YYYY-MM-DD — sempre resolvida para data absoluta pela IA (mesma convenção de gerenciar_alerta). */
  dataPrevista?: string;
  status?: MaintenanceStatusEnum;
  observacoes?: string;
}

export interface ManutencaoResumo {
  id: string;
  veiculoId: string;
  tipo: string;
  dataPrevista: string;
  status: MaintenanceStatusEnum;
  observacoes: string | null;
}

export interface GerenciarManutencaoResultado extends ResultadoFerramentaBase {
  modo: ModoGerenciarManutencao;
  manutencao?: ManutencaoResumo;
  manutencoes?: ManutencaoResumo[];
}

function mapaManutencao(row: MaintenanceScheduleRow): ManutencaoResumo {
  return {
    id: row.id,
    veiculoId: row.vehicle_id,
    tipo: row.type,
    dataPrevista: row.due_date,
    status: row.status,
    observacoes: row.notes,
  };
}

function respostaFalha(modo: ModoGerenciarManutencao, alertas: string[], dadosFaltantes: string[] = []): GerenciarManutencaoResultado {
  return { sucesso: false, modo, alertas, premissas: [], dadosFaltantes, mensagemResumo: alertas[0] ?? "Não foi possível concluir a ação de manutenção." };
}

async function executar(entrada: GerenciarManutencaoEntrada): Promise<GerenciarManutencaoResultado> {
  const { modo, userId, companyId } = entrada;

  if (!userId || !companyId) {
    return respostaFalha(modo, ["Não foi possível identificar o usuário/empresa para a manutenção."], ["userId", "companyId"]);
  }

  const admin = createAdminClient();

  try {
    if (modo === "CRIAR") {
      if (!entrada.veiculoId || !entrada.tipo || !entrada.dataPrevista) {
        return respostaFalha(
          modo,
          ["Preciso do veículo, do tipo de manutenção e da data prevista para agendar."],
          [!entrada.veiculoId ? "veiculoId" : "", !entrada.tipo ? "tipo" : "", !entrada.dataPrevista ? "dataPrevista" : ""].filter(Boolean)
        );
      }

      const veiculo = await getVehicle(admin, entrada.veiculoId);
      if (!veiculo || veiculo.company_id !== companyId) {
        return respostaFalha(modo, ["Não encontrei esse veículo para esta empresa — use LISTAR de veículos antes se houver dúvida sobre qual é."], ["veiculoId"]);
      }

      const criada = await createMaintenanceSchedule(admin, companyId, {
        vehicleId: entrada.veiculoId,
        type: entrada.tipo,
        dueDate: entrada.dataPrevista,
        status: entrada.status,
        notes: entrada.observacoes,
      });

      return {
        sucesso: true,
        modo,
        alertas: [],
        premissas: [],
        dadosFaltantes: [],
        manutencao: mapaManutencao(criada),
        mensagemResumo: `Manutenção "${criada.type}" agendada para ${criada.due_date}.`,
      };
    }

    if (modo === "LISTAR") {
      const manutencoes = (await listMaintenanceSchedulesForPanel(admin, companyId)).map(mapaManutencao);
      return {
        sucesso: true,
        modo,
        alertas: [],
        premissas: [],
        dadosFaltantes: [],
        manutencoes,
        mensagemResumo: manutencoes.length === 0 ? "Nenhuma manutenção agendada ainda." : `${manutencoes.length} manutenção(ões) encontrada(s).`,
      };
    }

    // ATUALIZAR / CONCLUIR / CANCELAR exigem scheduleId.
    if (!entrada.scheduleId) {
      return respostaFalha(modo, ["Preciso saber exatamente qual manutenção (scheduleId) — use LISTAR antes se houver dúvida sobre qual é."], ["scheduleId"]);
    }

    if (entrada.veiculoId) {
      const veiculo = await getVehicle(admin, entrada.veiculoId);
      if (!veiculo || veiculo.company_id !== companyId) {
        return respostaFalha(modo, ["Não encontrei esse veículo para esta empresa — use LISTAR de veículos antes se houver dúvida sobre qual é."], ["veiculoId"]);
      }
    }

    if (modo === "ATUALIZAR") {
      const atualizada = await updateMaintenanceSchedule(admin, entrada.scheduleId, companyId, {
        vehicleId: entrada.veiculoId,
        type: entrada.tipo,
        dueDate: entrada.dataPrevista,
        status: entrada.status,
        notes: entrada.observacoes,
      });

      return {
        sucesso: true,
        modo,
        alertas: [],
        premissas: [],
        dadosFaltantes: [],
        manutencao: mapaManutencao(atualizada),
        mensagemResumo: `Manutenção "${atualizada.type}" atualizada.`,
      };
    }

    const novoStatus: MaintenanceStatusEnum = modo === "CONCLUIR" ? "concluido" : "cancelado";
    const finalizada = await updateMaintenanceSchedule(admin, entrada.scheduleId, companyId, { status: novoStatus });

    return {
      sucesso: true,
      modo,
      alertas: [],
      premissas: [],
      dadosFaltantes: [],
      manutencao: mapaManutencao(finalizada),
      mensagemResumo: modo === "CONCLUIR" ? `Manutenção "${finalizada.type}" marcada como concluída.` : `Manutenção "${finalizada.type}" cancelada.`,
    };
  } catch {
    return respostaFalha(modo, ["Não foi possível concluir a ação de manutenção agora. Confira os dados e tente novamente."]);
  }
}

const PARAMETROS: DefinicaoParametroFerramenta[] = [
  { nome: "modo", tipo: "enum", obrigatorio: true, descricao: "Operação a executar.", valoresPossiveis: ["CRIAR", "LISTAR", "ATUALIZAR", "CONCLUIR", "CANCELAR"] },
  { nome: "userId", tipo: "string", obrigatorio: true, descricao: "Usuário dono da empresa (do contexto da conversa, nunca da mensagem)." },
  { nome: "companyId", tipo: "string", obrigatorio: true, descricao: "Empresa dona da(s) manutenção(ões) (do contexto da conversa)." },
  { nome: "conversationId", tipo: "string", obrigatorio: false, descricao: "Conversa de origem." },
  { nome: "scheduleId", tipo: "string", obrigatorio: false, descricao: "Id da manutenção — obrigatório em ATUALIZAR/CONCLUIR/CANCELAR. Use LISTAR antes se não tiver certeza de qual é." },
  { nome: "veiculoId", tipo: "string", obrigatorio: false, descricao: "Id do veículo — obrigatório em CRIAR. Use LISTAR de veículos (gerenciar_veiculo) antes se não tiver certeza." },
  { nome: "tipo", tipo: "string", obrigatorio: false, descricao: "Tipo de manutenção (ex.: troca de óleo, revisão, alinhamento) — obrigatório em CRIAR." },
  { nome: "dataPrevista", tipo: "string", obrigatorio: false, descricao: "Data prevista da manutenção, formato YYYY-MM-DD, já resolvida para data absoluta — obrigatória em CRIAR. Também usada em ATUALIZAR para reagendar." },
  { nome: "status", tipo: "enum", obrigatorio: false, descricao: "Status da manutenção — use em ATUALIZAR para ajuste manual; CONCLUIR/CANCELAR já resolvem isso sozinhos.", valoresPossiveis: STATUS_MANUTENCAO },
  { nome: "observacoes", tipo: "string", obrigatorio: false, descricao: "Observações livres sobre a manutenção." },
];

export const ferramentaGerenciarManutencao: DefinicaoFerramenta<GerenciarManutencaoEntrada, GerenciarManutencaoResultado> = {
  nome: "gerenciar_manutencao",
  descricao: "Agenda, lista, atualiza, conclui e cancela manutenções de veículos da empresa a partir do que o cliente conta na conversa.",
  objetivo:
    "Transformar dado de manutenção mencionado na conversa (tipo, veículo, data prevista) num registro estruturado reaproveitável (mesma tabela `maintenance_schedules` que o painel de gestão de frota usa) — nunca inventa um valor não informado pelo usuário, nunca infere data relativa sem resolver pra absoluta antes de chamar.",
  parametros: PARAMETROS,
  executar,
};
