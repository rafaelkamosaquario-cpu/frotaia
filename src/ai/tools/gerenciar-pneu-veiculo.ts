import type { DefinicaoFerramenta, DefinicaoParametroFerramenta, ResultadoFerramentaBase } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";
import { listVehicleTires, getVehicleTire, createVehicleTire, updateVehicleTire, computeTireKm } from "@/services/supabase/vehicleTireService";
import { syncTireAlert } from "@/services/supabase/fleetAlertsService";
import { getVehicle } from "@/services/supabase/vehicleService";
import { getTireProfile } from "@/services/supabase/vehicleTireProfileService";
import type { VehicleTireRow, VehicleTireStatusEnum } from "@/lib/supabase/tables";

/**
 * Ferramenta: gerenciar_pneu_veiculo
 *
 * Ferramenta de INTEGRAÇÃO (I/O real com Supabase — vehicle_tires), mesmo
 * padrão de `gerenciar_manutencao`. Rodada de evolução funcional 09/2026
 * (item 3/5, comparação com sistema de planilha "Frota 7.15"): fecha a
 * lacuna documentada no próprio comentário de `vehicle_tire_profiles`
 * ("NÃO é gestão completa de pneus: sem posição por eixo, estoque,
 * movimentação ou sucata") — rastreia o pneu FÍSICO individual, separado
 * de `comparar_pneus`/`vehicle_tire_profiles` (que continuam servindo só
 * pra comparar OPÇÕES de pneu, sem saber qual está montado onde).
 *
 * Km rodado/restante nunca são guardados — sempre calculados na leitura
 * (`computeTireKm`), a partir de mounted_km/last_checked_km/
 * expected_life_km, todos informados manualmente (nunca telemetria).
 *
 * ATUALIZAR_KM sincroniza um alerta automático (`syncTireAlert`) quando o
 * km restante fica abaixo do limiar — mesmo mecanismo de
 * `gerenciar_manutencao`/documentos vencendo, só que por km em vez de data.
 *
 * `tireId`/`veiculoId`/`perfilPneuId`, quando informados, são sempre
 * verificados contra `companyId` antes de qualquer escrita — nunca confia
 * só no id que o modelo mandou.
 */

export type ModoGerenciarPneuVeiculo = "CRIAR" | "LISTAR" | "ATUALIZAR_KM" | "DESMONTAR";

export interface GerenciarPneuVeiculoEntrada {
  modo: ModoGerenciarPneuVeiculo;
  userId: string;
  companyId: string;
  conversationId?: string;
  /** Obrigatório em ATUALIZAR_KM/DESMONTAR. */
  tireId?: string;

  /** Obrigatório em CRIAR quando o pneu já nasce montado; filtro opcional em LISTAR. */
  veiculoId?: string;
  perfilPneuId?: string;
  posicao?: string;
  marca?: string;
  modelo?: string;
  status?: VehicleTireStatusEnum;
  /** Data de montagem YYYY-MM-DD, se souber — nunca invente. */
  dataMontagem?: string;
  /** Km do veículo no momento da montagem — obrigatório em CRIAR quando há veiculoId. */
  kmMontagem?: number;
  /** Km atual do veículo — usado em CRIAR (leitura inicial, se diferente da montagem) e obrigatório em ATUALIZAR_KM. */
  kmAtual?: number;
  vidaUtilKm?: number;
  observacoes?: string;

  // DESMONTAR
  /** "estoque" (guarda pra reuso) ou "sucateado" (descarte) — nunca "montado" aqui. */
  novoStatus?: VehicleTireStatusEnum;
  dataRemocao?: string;
  motivoRemocao?: string;
}

export interface PneuResumo {
  id: string;
  veiculoId: string | null;
  perfilPneuId: string | null;
  posicao: string | null;
  marca: string | null;
  modelo: string | null;
  status: VehicleTireStatusEnum;
  dataMontagem: string | null;
  kmMontagem: number | null;
  kmAtual: number | null;
  vidaUtilKm: number | null;
  /** Calculado na leitura — nunca guardado (ver computeTireKm). */
  kmRodado: number | null;
  kmRestante: number | null;
  dataRemocao: string | null;
  motivoRemocao: string | null;
  observacoes: string | null;
}

export interface GerenciarPneuVeiculoResultado extends ResultadoFerramentaBase {
  modo: ModoGerenciarPneuVeiculo;
  pneu?: PneuResumo;
  pneus?: PneuResumo[];
}

function mapaPneu(row: VehicleTireRow): PneuResumo {
  const { kmRodado, kmRestante } = computeTireKm(row);
  return {
    id: row.id,
    veiculoId: row.vehicle_id,
    perfilPneuId: row.tire_profile_id,
    posicao: row.position,
    marca: row.brand,
    modelo: row.model,
    status: row.status,
    dataMontagem: row.mounted_at,
    kmMontagem: row.mounted_km !== null ? Number(row.mounted_km) : null,
    kmAtual: row.last_checked_km !== null ? Number(row.last_checked_km) : null,
    vidaUtilKm: row.expected_life_km !== null ? Number(row.expected_life_km) : null,
    kmRodado,
    kmRestante,
    dataRemocao: row.removed_at,
    motivoRemocao: row.removal_reason,
    observacoes: row.notes,
  };
}

function respostaFalha(modo: ModoGerenciarPneuVeiculo, alertas: string[], dadosFaltantes: string[] = []): GerenciarPneuVeiculoResultado {
  return { sucesso: false, modo, alertas, premissas: [], dadosFaltantes, mensagemResumo: alertas[0] ?? "Não foi possível concluir a ação de pneu." };
}

async function executar(entrada: GerenciarPneuVeiculoEntrada): Promise<GerenciarPneuVeiculoResultado> {
  const { modo, userId, companyId } = entrada;

  if (!userId || !companyId) {
    return respostaFalha(modo, ["Não foi possível identificar o usuário/empresa para o pneu."], ["userId", "companyId"]);
  }

  const admin = createAdminClient();

  try {
    if (modo === "CRIAR") {
      const vaiMontar = !!entrada.veiculoId;

      if (vaiMontar) {
        if (entrada.kmMontagem === undefined) {
          return respostaFalha(modo, ["Preciso do km do veículo no momento da montagem pra registrar o pneu montado."], ["kmMontagem"]);
        }
        const veiculo = await getVehicle(admin, entrada.veiculoId!);
        if (!veiculo || veiculo.company_id !== companyId) {
          return respostaFalha(modo, ["Não encontrei esse veículo para esta empresa — use LISTAR de veículos antes se houver dúvida sobre qual é."], ["veiculoId"]);
        }
      } else if (!entrada.marca && !entrada.perfilPneuId) {
        return respostaFalha(modo, ["Preciso de ao menos a marca ou um perfil de pneu já cadastrado pra identificar o pneu no estoque."], ["marca"]);
      }

      if (entrada.perfilPneuId) {
        const perfil = await getTireProfile(admin, entrada.perfilPneuId);
        if (!perfil || perfil.company_id !== companyId) {
          return respostaFalha(modo, ["Não encontrei esse perfil de pneu para esta empresa."], ["perfilPneuId"]);
        }
      }

      const criado = await createVehicleTire(admin, companyId, userId, {
        vehicleId: entrada.veiculoId,
        tireProfileId: entrada.perfilPneuId,
        position: entrada.posicao,
        brand: entrada.marca,
        model: entrada.modelo,
        status: entrada.status ?? (vaiMontar ? "montado" : "estoque"),
        mountedAt: entrada.dataMontagem,
        mountedKm: entrada.kmMontagem,
        lastCheckedKm: entrada.kmAtual ?? entrada.kmMontagem,
        expectedLifeKm: entrada.vidaUtilKm,
        notes: entrada.observacoes,
      });

      await syncTireAlert(admin, companyId, userId, criado);

      return {
        sucesso: true,
        modo,
        alertas: [],
        premissas: [],
        dadosFaltantes: [],
        pneu: mapaPneu(criado),
        mensagemResumo: vaiMontar ? "Pneu montado e registrado." : "Pneu registrado no estoque.",
      };
    }

    if (modo === "LISTAR") {
      const pneus = (await listVehicleTires(admin, { companyId, vehicleId: entrada.veiculoId, status: entrada.status })).map(mapaPneu);
      return {
        sucesso: true,
        modo,
        alertas: [],
        premissas: [],
        dadosFaltantes: [],
        pneus,
        mensagemResumo: pneus.length === 0 ? "Nenhum pneu cadastrado ainda." : `${pneus.length} pneu(s) encontrado(s).`,
      };
    }

    // ATUALIZAR_KM / DESMONTAR exigem tireId, sempre verificado contra a empresa.
    if (!entrada.tireId) {
      return respostaFalha(modo, ["Preciso saber exatamente qual pneu (tireId) — use LISTAR antes se houver dúvida sobre qual é."], ["tireId"]);
    }

    const pneuAtual = await getVehicleTire(admin, entrada.tireId);
    if (!pneuAtual || pneuAtual.company_id !== companyId) {
      return respostaFalha(modo, ["Não encontrei esse pneu para esta empresa."], ["tireId"]);
    }

    if (modo === "ATUALIZAR_KM") {
      if (entrada.kmAtual === undefined) {
        return respostaFalha(modo, ["Preciso do km atual do veículo para atualizar a leitura do pneu."], ["kmAtual"]);
      }

      const atualizado = await updateVehicleTire(admin, entrada.tireId, companyId, userId, { lastCheckedKm: entrada.kmAtual });
      await syncTireAlert(admin, companyId, userId, atualizado);

      const { kmRodado, kmRestante } = computeTireKm(atualizado);
      const partesResumo = [`Km do pneu atualizado.`];
      if (kmRodado !== null) partesResumo.push(`${kmRodado} km rodados desde a montagem.`);
      if (kmRestante !== null) partesResumo.push(kmRestante <= 0 ? "Vida útil estimada já esgotada — considere trocar." : `~${kmRestante} km restantes estimados.`);

      return {
        sucesso: true,
        modo,
        alertas: [],
        premissas: [],
        dadosFaltantes: [],
        pneu: mapaPneu(atualizado),
        mensagemResumo: partesResumo.join(" "),
      };
    }

    // DESMONTAR
    if (entrada.novoStatus === "montado") {
      return respostaFalha(modo, ["DESMONTAR não pode deixar o pneu como 'montado' — use CRIAR/ATUALIZAR_KM pra montar em outro veículo."], ["novoStatus"]);
    }

    const desmontado = await updateVehicleTire(admin, entrada.tireId, companyId, userId, {
      status: entrada.novoStatus ?? "estoque",
      removedAt: entrada.dataRemocao,
      removalReason: entrada.motivoRemocao,
    });
    await syncTireAlert(admin, companyId, userId, desmontado);

    return {
      sucesso: true,
      modo,
      alertas: [],
      premissas: [],
      dadosFaltantes: [],
      pneu: mapaPneu(desmontado),
      mensagemResumo: `Pneu desmontado (${desmontado.status === "sucateado" ? "sucateado" : "para o estoque"}).`,
    };
  } catch {
    return respostaFalha(modo, ["Não foi possível concluir a ação de pneu agora. Confira os dados e tente novamente."]);
  }
}

const PARAMETROS: DefinicaoParametroFerramenta[] = [
  { nome: "modo", tipo: "enum", obrigatorio: true, descricao: "Operação a executar.", valoresPossiveis: ["CRIAR", "LISTAR", "ATUALIZAR_KM", "DESMONTAR"] },
  { nome: "userId", tipo: "string", obrigatorio: true, descricao: "Usuário dono da empresa (do contexto da conversa, nunca da mensagem)." },
  { nome: "companyId", tipo: "string", obrigatorio: true, descricao: "Empresa dona do(s) pneu(s) (do contexto da conversa)." },
  { nome: "conversationId", tipo: "string", obrigatorio: false, descricao: "Conversa de origem." },
  { nome: "tireId", tipo: "string", obrigatorio: false, descricao: "Id do pneu — obrigatório em ATUALIZAR_KM/DESMONTAR. Use LISTAR antes se não tiver certeza de qual é." },
  { nome: "veiculoId", tipo: "string", obrigatorio: false, descricao: "Veículo onde o pneu será montado — obrigatório em CRIAR quando o pneu já nasce montado; filtro opcional em LISTAR." },
  { nome: "perfilPneuId", tipo: "string", obrigatorio: false, descricao: "Perfil de pneu já cadastrado (comparar_pneus/vehicle_tire_profiles) pra reaproveitar marca/modelo/custo, se o cliente identificar um." },
  { nome: "posicao", tipo: "string", obrigatorio: false, descricao: "Posição do pneu no veículo, texto livre (ex.: 'dianteiro esquerdo', 'traseiro direito externo')." },
  { nome: "marca", tipo: "string", obrigatorio: false, descricao: "Marca do pneu — obrigatória em CRIAR quando não for montar direto num veículo e não houver perfilPneuId." },
  { nome: "modelo", tipo: "string", obrigatorio: false, descricao: "Modelo do pneu." },
  { nome: "status", tipo: "enum", obrigatorio: false, descricao: "Status do pneu em CRIAR — normalmente resolvido sozinho (montado se houver veiculoId, senão estoque).", valoresPossiveis: ["montado", "estoque", "manutencao", "sucateado"] },
  { nome: "dataMontagem", tipo: "string", obrigatorio: false, descricao: "Data de montagem em YYYY-MM-DD, se o cliente informar — nunca invente." },
  { nome: "kmMontagem", tipo: "number", obrigatorio: false, descricao: "Km do veículo no momento da montagem — obrigatório em CRIAR quando há veiculoId." },
  { nome: "kmAtual", tipo: "number", obrigatorio: false, descricao: "Km atual do veículo — obrigatório em ATUALIZAR_KM. Nunca invente, não existe leitura automática de odômetro." },
  { nome: "vidaUtilKm", tipo: "number", obrigatorio: false, descricao: "Vida útil esperada em km, se souber (pode vir do perfil de pneu vinculado)." },
  { nome: "observacoes", tipo: "string", obrigatorio: false, descricao: "Observações livres sobre o pneu." },
  { nome: "novoStatus", tipo: "enum", obrigatorio: false, descricao: "DESMONTAR: 'estoque' (guarda pra reuso, padrão) ou 'sucateado' (descarte). Nunca 'montado' aqui.", valoresPossiveis: ["estoque", "sucateado"] },
  { nome: "dataRemocao", tipo: "string", obrigatorio: false, descricao: "Data da desmontagem em YYYY-MM-DD, se souber — nunca invente." },
  { nome: "motivoRemocao", tipo: "string", obrigatorio: false, descricao: "Motivo da desmontagem (ex.: 'desgaste', 'furo', 'rodízio')." },
];

export const ferramentaGerenciarPneuVeiculo: DefinicaoFerramenta<GerenciarPneuVeiculoEntrada, GerenciarPneuVeiculoResultado> = {
  nome: "gerenciar_pneu_veiculo",
  descricao: "Registra o pneu físico montado num veículo (ou em estoque), atualiza a leitura de km e desmonta — diferente de comparar_pneus, que só compara OPÇÕES de pneu sem saber qual está montado onde.",
  objetivo:
    "Rastrear o ciclo de vida de um pneu individual (montagem, leitura de km, desmontagem) reaproveitando o mesmo padrão de gerenciar_manutencao — inclusive o alerta automático quando a vida útil estimada está acabando (km restante abaixo do limiar). Km rodado/restante nunca são inventados: só calculados a partir de leituras de km informadas manualmente pelo cliente.",
  parametros: PARAMETROS,
  executar,
};
