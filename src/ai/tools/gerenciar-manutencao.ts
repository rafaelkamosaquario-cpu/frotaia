import type { DefinicaoFerramenta, DefinicaoParametroFerramenta, ResultadoFerramentaBase } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";
import { listMaintenanceSchedulesForPanel, createMaintenanceSchedule, updateMaintenanceSchedule } from "@/services/supabase/maintenanceScheduleService";
import { getVehicle } from "@/services/supabase/vehicleService";
import { syncMaintenanceAlert } from "@/services/supabase/fleetAlertsService";
import { syncMaintenanceExpense } from "@/services/supabase/expenseService";
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

  /** Data em que a manutenção foi de fato feita (YYYY-MM-DD) — normalmente usada em CONCLUIR; se ausente ali, usa a data de hoje. */
  dataExecucao?: string;
  /** Km do veículo no momento da execução — só o que o cliente informou, nunca lido de telemetria/odômetro (não existe monitoramento automático). */
  kmExecucao?: number;
  /** Km alvo já sabido da PRÓXIMA manutenção, se o cliente informar diretamente. */
  proximaKm?: number;
  /** Intervalo em km até a próxima manutenção — só usado pra CALCULAR proximaKm (kmExecucao + intervaloKm) quando proximaKm não vier direto. Nunca presumir um intervalo que o cliente não informou. */
  intervaloKm?: number;
  /** Custo da manutenção em reais — só relevante ao concluir (CONCLUIR, ou CRIAR/ATUALIZAR quando status já é concluido). Vira/atualiza a despesa vinculada, nunca duplica. */
  custo?: number;
}

export interface ManutencaoResumo {
  id: string;
  veiculoId: string;
  tipo: string;
  dataPrevista: string;
  status: MaintenanceStatusEnum;
  observacoes: string | null;
  dataExecucao: string | null;
  kmExecucao: number | null;
  proximaKm: number | null;
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
    dataExecucao: row.executed_date,
    kmExecucao: row.executed_km,
    proximaKm: row.next_due_km,
  };
}

/** kmExecucao + intervaloKm calculam proximaKm SÓ se o cliente informou o intervalo — nunca presume um intervalo padrão. */
function resolverProximaKm(entrada: GerenciarManutencaoEntrada): number | undefined {
  if (entrada.proximaKm != null) return entrada.proximaKm;
  if (entrada.kmExecucao != null && entrada.intervaloKm != null) return entrada.kmExecucao + entrada.intervaloKm;
  return undefined;
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
        executedDate: entrada.dataExecucao,
        executedKm: entrada.kmExecucao,
        nextDueKm: resolverProximaKm(entrada),
      });

      await syncMaintenanceAlert(admin, companyId, userId, criada);

      if (criada.status === "concluido" && entrada.custo != null) {
        await syncMaintenanceExpense(admin, {
          companyId,
          userId,
          maintenanceScheduleId: criada.id,
          vehicleId: criada.vehicle_id,
          amount: entrada.custo,
          expenseDate: criada.executed_date ?? criada.due_date,
          description: `Manutenção: ${criada.type}`,
        });
      }

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
        executedDate: entrada.dataExecucao,
        executedKm: entrada.kmExecucao,
        nextDueKm: resolverProximaKm(entrada),
      });

      await syncMaintenanceAlert(admin, companyId, userId, atualizada);

      if (atualizada.status === "concluido" && entrada.custo != null) {
        await syncMaintenanceExpense(admin, {
          companyId,
          userId,
          maintenanceScheduleId: atualizada.id,
          vehicleId: atualizada.vehicle_id,
          amount: entrada.custo,
          expenseDate: atualizada.executed_date ?? atualizada.due_date,
          description: `Manutenção: ${atualizada.type}`,
        });
      }

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

    if (modo === "CANCELAR") {
      const cancelada = await updateMaintenanceSchedule(admin, entrada.scheduleId, companyId, { status: "cancelado" });
      await syncMaintenanceAlert(admin, companyId, userId, cancelada);
      return {
        sucesso: true,
        modo,
        alertas: [],
        premissas: [],
        dadosFaltantes: [],
        manutencao: mapaManutencao(cancelada),
        mensagemResumo: `Manutenção "${cancelada.type}" cancelada.`,
      };
    }

    // CONCLUIR — aceita km/data de execução e custo (nunca inventa nenhum dos três se o cliente não informou).
    const concluida = await updateMaintenanceSchedule(admin, entrada.scheduleId, companyId, {
      status: "concluido",
      dueDate: entrada.dataPrevista,
      executedDate: entrada.dataExecucao,
      executedKm: entrada.kmExecucao,
      nextDueKm: resolverProximaKm(entrada),
      notes: entrada.observacoes,
    });

    await syncMaintenanceAlert(admin, companyId, userId, concluida);

    if (entrada.custo != null) {
      await syncMaintenanceExpense(admin, {
        companyId,
        userId,
        maintenanceScheduleId: concluida.id,
        vehicleId: concluida.vehicle_id,
        amount: entrada.custo,
        expenseDate: concluida.executed_date ?? concluida.due_date,
        description: `Manutenção: ${concluida.type}`,
      });
    }

    const partesResumo = [`Manutenção "${concluida.type}" marcada como concluída.`];
    if (entrada.kmExecucao != null) partesResumo.push(`Km registrado: ${entrada.kmExecucao}.`);
    if (concluida.next_due_km != null) partesResumo.push(`Próxima prevista aos ${concluida.next_due_km} km.`);
    if (entrada.custo != null) partesResumo.push(`Custo de R$${entrada.custo.toFixed(2)} registrado em Despesas.`);

    return {
      sucesso: true,
      modo,
      alertas: [],
      premissas: [],
      dadosFaltantes: [],
      manutencao: mapaManutencao(concluida),
      mensagemResumo: partesResumo.join(" "),
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
  { nome: "dataExecucao", tipo: "string", obrigatorio: false, descricao: "Data em que a manutenção foi de fato feita, formato YYYY-MM-DD — use em CONCLUIR quando o cliente informar (ex.: 'troquei ontem'). Se não informado, não presuma — deixe em branco." },
  { nome: "kmExecucao", tipo: "number", obrigatorio: false, descricao: "Quilometragem do veículo no momento da execução, só se o cliente informou (ex.: 'com 250 mil km'). Nunca invente — não existe leitura automática de odômetro." },
  { nome: "proximaKm", tipo: "number", obrigatorio: false, descricao: "Quilometragem alvo da PRÓXIMA manutenção, se o cliente já souber e informar direto (ex.: 'próxima aos 260 mil'). Só informativo, não gera alerta automático." },
  { nome: "intervaloKm", tipo: "number", obrigatorio: false, descricao: "Intervalo em km até a próxima manutenção, SÓ se o cliente informar explicitamente (ex.: 'de 10 em 10 mil km') — usado junto com kmExecucao pra calcular proximaKm. Nunca presuma um intervalo padrão do fabricante/genérico." },
  { nome: "custo", tipo: "number", obrigatorio: false, descricao: "Valor gasto na manutenção em reais, só se o cliente informou — obrigatório junto de CONCLUIR quando o cliente quiser registrar o gasto (ex.: 'custou R$1.200'). Vira uma despesa em Despesas automaticamente, nunca duplicada se a manutenção já tiver uma vinculada." },
];

export const ferramentaGerenciarManutencao: DefinicaoFerramenta<GerenciarManutencaoEntrada, GerenciarManutencaoResultado> = {
  nome: "gerenciar_manutencao",
  descricao: "Agenda, lista, atualiza, conclui e cancela manutenções de veículos da empresa a partir do que o cliente conta na conversa.",
  objetivo:
    "Transformar dado de manutenção mencionado na conversa (tipo, veículo, data prevista) num registro estruturado reaproveitável (mesma tabela `maintenance_schedules` que o painel de gestão de frota usa) — nunca inventa um valor não informado pelo usuário, nunca infere data relativa sem resolver pra absoluta antes de chamar.",
  parametros: PARAMETROS,
  executar,
};
