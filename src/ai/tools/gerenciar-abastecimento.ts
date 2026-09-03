import type { DefinicaoFerramenta, DefinicaoParametroFerramenta, ResultadoFerramentaBase } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  listFuelFillups,
  getFuelFillup,
  createFuelFillup,
  updateFuelFillup,
  deleteFuelFillup,
  computeAverageFuelConsumption,
} from "@/services/supabase/fuelFillupService";
import { syncFuelExpense } from "@/services/supabase/expenseService";
import { getVehicle } from "@/services/supabase/vehicleService";
import { getDriver } from "@/services/supabase/driverService";
import { getVendor } from "@/services/supabase/vendorService";
import type { FuelFillupRow, FuelTypeEnum } from "@/lib/supabase/tables";

/**
 * Ferramenta: gerenciar_abastecimento
 *
 * Ferramenta de INTEGRAÇÃO (I/O real com Supabase — fuel_fillups), mesmo
 * padrão de `registrar_despesa`/`gerenciar_manutencao`. Rodada de evolução
 * funcional 09/2026 (item 2/5, comparação com sistema de planilha "Frota
 * 7.15"): hoje `calcular_combustivel` é puramente pontual (sem I/O, nunca
 * grava nada) — esta ferramenta cria um histórico real de abastecimentos,
 * sem mexer na ferramenta pura existente (princípio arquitetural: cálculo
 * puro nunca faz I/O).
 *
 * CRIAR/ATUALIZAR sempre sincronizam UMA despesa vinculada (categoria
 * combustivel, `expenses.fuel_fillup_id`) — mesmo mecanismo de
 * `syncMaintenanceExpense`, nunca duplica.
 *
 * CONSULTAR_CONSUMO_MEDIO é leitura com I/O real (histórico), diferente de
 * calcular_combustivel: soma litros e km rodado entre abastecimentos
 * consecutivos (por odometer_km) e devolve km/l MEDIDO, nunca estimado.
 *
 * `veiculoId`/`fillupId`/`motoristaId`/`fornecedorId`, quando informados,
 * são sempre verificados contra `companyId` antes de qualquer escrita —
 * nunca confia só no id que o modelo mandou.
 */

export type ModoGerenciarAbastecimento = "CRIAR" | "LISTAR" | "ATUALIZAR" | "EXCLUIR" | "CONSULTAR_CONSUMO_MEDIO";

export interface GerenciarAbastecimentoEntrada {
  modo: ModoGerenciarAbastecimento;
  userId: string;
  companyId: string;
  conversationId?: string;
  /** Obrigatório em ATUALIZAR/EXCLUIR. */
  fillupId?: string;

  /** Obrigatório em CRIAR e em CONSULTAR_CONSUMO_MEDIO; filtro opcional em LISTAR. */
  veiculoId?: string;
  motoristaId?: string;
  fornecedorId?: string;
  /** Data do abastecimento em YYYY-MM-DD — obrigatória em CRIAR. */
  data?: string;
  litros?: number;
  precoPorLitro?: number;
  valorTotal?: number;
  /** Km do odômetro no momento do abastecimento, se informado — nunca lido automaticamente (sem telemetria). Alimenta CONSULTAR_CONSUMO_MEDIO. */
  kmOdometro?: number;
  combustivel?: FuelTypeEnum;
  observacoes?: string;

  // LISTAR / CONSULTAR_CONSUMO_MEDIO
  dataInicio?: string;
  dataFim?: string;
  limite?: number;

  /** EXCLUIR: só true depois que o cliente confirmar explicitamente qual abastecimento excluir. */
  confirmacao?: boolean;
}

export interface AbastecimentoResumo {
  id: string;
  veiculoId: string;
  motoristaId: string | null;
  fornecedorId: string | null;
  data: string;
  litros: number;
  precoPorLitro: number | null;
  valorTotal: number;
  kmOdometro: number | null;
  combustivel: FuelTypeEnum | null;
  observacoes: string | null;
}

export interface GerenciarAbastecimentoResultado extends ResultadoFerramentaBase {
  modo: ModoGerenciarAbastecimento;
  abastecimento?: AbastecimentoResumo;
  abastecimentos?: AbastecimentoResumo[];
  consumoMedio?: {
    veiculoId: string;
    litrosConsiderados: number;
    kmRodado: number;
    consumoMedioKmL: number | null;
    abastecimentosNoPeriodo: number;
    abastecimentosComKm: number;
    gastoTotal: number;
    primeiraData: string | null;
    ultimaData: string | null;
  };
}

const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function mapaAbastecimento(row: FuelFillupRow): AbastecimentoResumo {
  return {
    id: row.id,
    veiculoId: row.vehicle_id,
    motoristaId: row.driver_id,
    fornecedorId: row.vendor_id,
    data: row.fillup_date,
    litros: Number(row.liters),
    precoPorLitro: row.price_per_liter !== null ? Number(row.price_per_liter) : null,
    valorTotal: Number(row.total_amount),
    kmOdometro: row.odometer_km !== null ? Number(row.odometer_km) : null,
    combustivel: row.fuel_type,
    observacoes: row.notes,
  };
}

function respostaFalha(modo: ModoGerenciarAbastecimento, alertas: string[], dadosFaltantes: string[] = []): GerenciarAbastecimentoResultado {
  return { sucesso: false, modo, alertas, premissas: [], dadosFaltantes, mensagemResumo: alertas[0] ?? "Não foi possível concluir a ação de abastecimento." };
}

async function executar(entrada: GerenciarAbastecimentoEntrada): Promise<GerenciarAbastecimentoResultado> {
  const { modo, userId, companyId } = entrada;

  if (!userId || !companyId) {
    return respostaFalha(modo, ["Não foi possível identificar o usuário/empresa para o abastecimento."], ["userId", "companyId"]);
  }

  const admin = createAdminClient();

  try {
    if (modo === "CRIAR") {
      const faltando: string[] = [];
      if (!entrada.veiculoId) faltando.push("veiculoId");
      if (!entrada.data) faltando.push("data");
      if (entrada.litros === undefined) faltando.push("litros");
      if (entrada.valorTotal === undefined) faltando.push("valorTotal");
      if (faltando.length > 0) {
        return respostaFalha(modo, ["Faltam dados para registrar o abastecimento — nunca invento litros, valor ou data."], faltando);
      }
      if (!DATA_REGEX.test(entrada.data!)) {
        return respostaFalha(modo, ['A data do abastecimento precisa estar em "YYYY-MM-DD" — nunca uma expressão relativa.']);
      }

      const veiculo = await getVehicle(admin, entrada.veiculoId!);
      if (!veiculo || veiculo.company_id !== companyId) {
        return respostaFalha(modo, ["Não encontrei esse veículo para esta empresa — use LISTAR de veículos antes se houver dúvida sobre qual é."], ["veiculoId"]);
      }
      if (entrada.motoristaId && !(await getDriver(admin, entrada.motoristaId, companyId))) {
        return respostaFalha(modo, ["Não encontrei esse motorista para esta empresa."], ["motoristaId"]);
      }
      if (entrada.fornecedorId) {
        const fornecedor = await getVendor(admin, entrada.fornecedorId);
        if (!fornecedor || fornecedor.company_id !== companyId) {
          return respostaFalha(modo, ["Não encontrei esse fornecedor para esta empresa."], ["fornecedorId"]);
        }
      }

      const criado = await createFuelFillup(admin, companyId, userId, {
        vehicleId: entrada.veiculoId,
        driverId: entrada.motoristaId,
        vendorId: entrada.fornecedorId,
        fillupDate: entrada.data,
        liters: entrada.litros,
        pricePerLiter: entrada.precoPorLitro,
        totalAmount: entrada.valorTotal,
        odometerKm: entrada.kmOdometro,
        fuelType: entrada.combustivel,
        notes: entrada.observacoes,
      });

      await syncFuelExpense(admin, {
        companyId,
        userId,
        fuelFillupId: criado.id,
        vehicleId: criado.vehicle_id,
        amount: Number(criado.total_amount),
        expenseDate: criado.fillup_date,
        description: `Abastecimento (${criado.liters}L)`,
      });

      return {
        sucesso: true,
        modo,
        alertas: [],
        premissas: [],
        dadosFaltantes: [],
        abastecimento: mapaAbastecimento(criado),
        mensagemResumo: `Abastecimento de ${criado.liters}L registrado.`,
      };
    }

    if (modo === "LISTAR") {
      const limite = Math.min(Math.max(entrada.limite ?? 50, 1), 200);
      const abastecimentos = (
        await listFuelFillups(admin, {
          companyId,
          vehicleId: entrada.veiculoId,
          dateFrom: entrada.dataInicio,
          dateTo: entrada.dataFim,
          limit: limite,
        })
      ).map(mapaAbastecimento);

      return {
        sucesso: true,
        modo,
        alertas: [],
        premissas: [],
        dadosFaltantes: [],
        abastecimentos,
        mensagemResumo: abastecimentos.length === 0 ? "Nenhum abastecimento encontrado com esses critérios." : `${abastecimentos.length} abastecimento(s) encontrado(s).`,
      };
    }

    if (modo === "CONSULTAR_CONSUMO_MEDIO") {
      if (!entrada.veiculoId) {
        return respostaFalha(modo, ["Preciso saber de qual veículo calcular o consumo médio real."], ["veiculoId"]);
      }
      const veiculo = await getVehicle(admin, entrada.veiculoId);
      if (!veiculo || veiculo.company_id !== companyId) {
        return respostaFalha(modo, ["Não encontrei esse veículo para esta empresa."], ["veiculoId"]);
      }

      const consumo = await computeAverageFuelConsumption(admin, companyId, entrada.veiculoId, entrada.dataInicio, entrada.dataFim);

      const mensagemResumo =
        consumo.consumoMedioKmL !== null
          ? `Consumo médio real: ${consumo.consumoMedioKmL} km/l, com base em ${consumo.abastecimentosComKm} abastecimentos com km informado (${consumo.kmRodado} km rodados, ${consumo.litrosConsiderados}L).`
          : "Ainda não há abastecimentos suficientes com km informado para calcular o consumo médio real (preciso de pelo menos 2, com o km do odômetro em cada um).";

      return {
        sucesso: true,
        modo,
        alertas: [],
        premissas: [],
        dadosFaltantes: [],
        consumoMedio: { ...consumo, veiculoId: consumo.vehicleId },
        mensagemResumo,
      };
    }

    // ATUALIZAR / EXCLUIR exigem fillupId, sempre verificado contra a empresa.
    if (!entrada.fillupId) {
      return respostaFalha(modo, ["Preciso saber exatamente qual abastecimento (fillupId) — use LISTAR antes se houver dúvida sobre qual é."], ["fillupId"]);
    }

    const abastecimentoAtual = await getFuelFillup(admin, entrada.fillupId);
    if (!abastecimentoAtual || abastecimentoAtual.company_id !== companyId) {
      return respostaFalha(modo, ["Não encontrei esse abastecimento para esta empresa."], ["fillupId"]);
    }

    if (modo === "ATUALIZAR") {
      if (entrada.data && !DATA_REGEX.test(entrada.data)) {
        return respostaFalha(modo, ['A data do abastecimento precisa estar em "YYYY-MM-DD" — nunca uma expressão relativa.']);
      }
      if (entrada.veiculoId) {
        const veiculo = await getVehicle(admin, entrada.veiculoId);
        if (!veiculo || veiculo.company_id !== companyId) {
          return respostaFalha(modo, ["Não encontrei esse veículo para esta empresa."], ["veiculoId"]);
        }
      }

      const atualizado = await updateFuelFillup(admin, entrada.fillupId, companyId, userId, {
        vehicleId: entrada.veiculoId,
        driverId: entrada.motoristaId,
        vendorId: entrada.fornecedorId,
        fillupDate: entrada.data,
        liters: entrada.litros,
        pricePerLiter: entrada.precoPorLitro,
        totalAmount: entrada.valorTotal,
        odometerKm: entrada.kmOdometro,
        fuelType: entrada.combustivel,
        notes: entrada.observacoes,
      });

      await syncFuelExpense(admin, {
        companyId,
        userId,
        fuelFillupId: atualizado.id,
        vehicleId: atualizado.vehicle_id,
        amount: Number(atualizado.total_amount),
        expenseDate: atualizado.fillup_date,
        description: `Abastecimento (${atualizado.liters}L)`,
      });

      return {
        sucesso: true,
        modo,
        alertas: [],
        premissas: [],
        dadosFaltantes: [],
        abastecimento: mapaAbastecimento(atualizado),
        mensagemResumo: "Abastecimento atualizado.",
      };
    }

    // EXCLUIR
    if (!entrada.confirmacao) {
      return respostaFalha(modo, ["Antes de excluir, confirme com o cliente qual abastecimento exatamente e só então chame de novo com confirmacao:true."], ["confirmacao"]);
    }

    await deleteFuelFillup(admin, entrada.fillupId, companyId);

    return {
      sucesso: true,
      modo,
      alertas: [],
      premissas: [],
      dadosFaltantes: [],
      mensagemResumo: "Abastecimento excluído.",
    };
  } catch {
    return respostaFalha(modo, ["Não foi possível concluir a ação de abastecimento agora. Confira os dados e tente novamente."]);
  }
}

const PARAMETROS: DefinicaoParametroFerramenta[] = [
  {
    nome: "modo",
    tipo: "enum",
    obrigatorio: true,
    descricao: "Operação a executar.",
    valoresPossiveis: ["CRIAR", "LISTAR", "ATUALIZAR", "EXCLUIR", "CONSULTAR_CONSUMO_MEDIO"],
  },
  { nome: "userId", tipo: "string", obrigatorio: true, descricao: "Usuário dono da empresa (do contexto da conversa, nunca da mensagem)." },
  { nome: "companyId", tipo: "string", obrigatorio: true, descricao: "Empresa dona do(s) abastecimento(s) (do contexto da conversa)." },
  { nome: "conversationId", tipo: "string", obrigatorio: false, descricao: "Conversa de origem." },
  { nome: "fillupId", tipo: "string", obrigatorio: false, descricao: "Id do abastecimento — obrigatório em ATUALIZAR/EXCLUIR. Use LISTAR antes se não tiver certeza de qual é." },
  { nome: "veiculoId", tipo: "string", obrigatorio: false, descricao: "Id do veículo — obrigatório em CRIAR e em CONSULTAR_CONSUMO_MEDIO; filtro opcional em LISTAR." },
  { nome: "motoristaId", tipo: "string", obrigatorio: false, descricao: "Motorista que abasteceu, se identificado." },
  { nome: "fornecedorId", tipo: "string", obrigatorio: false, descricao: "Posto cadastrado (gerenciar_fornecedor), se o cliente identificar um já cadastrado — nunca obrigatório." },
  { nome: "data", tipo: "string", obrigatorio: false, descricao: 'Data do abastecimento em "YYYY-MM-DD" — obrigatória em CRIAR.' },
  { nome: "litros", tipo: "number", obrigatorio: false, descricao: "Litros abastecidos — obrigatório em CRIAR." },
  { nome: "precoPorLitro", tipo: "number", obrigatorio: false, descricao: "Preço por litro, se informado." },
  { nome: "valorTotal", tipo: "number", obrigatorio: false, descricao: "Valor total pago no abastecimento em reais — obrigatório em CRIAR. Vira/atualiza uma despesa automaticamente, nunca duplicada." },
  {
    nome: "kmOdometro",
    tipo: "number",
    obrigatorio: false,
    descricao: "Quilometragem do odômetro no momento do abastecimento, só se o cliente informou — nunca invente, não existe leitura automática. Necessário pra CONSULTAR_CONSUMO_MEDIO funcionar.",
  },
  { nome: "combustivel", tipo: "enum", obrigatorio: false, descricao: "Tipo de combustível, se diferente do padrão salvo no veículo.", valoresPossiveis: ["diesel_s10", "diesel_s500", "gasolina", "etanol", "eletrico", "outro"] },
  { nome: "observacoes", tipo: "string", obrigatorio: false, descricao: "Observações livres sobre o abastecimento." },
  { nome: "dataInicio", tipo: "string", obrigatorio: false, descricao: "Início do período em YYYY-MM-DD (LISTAR/CONSULTAR_CONSUMO_MEDIO), já resolvido a partir da data atual." },
  { nome: "dataFim", tipo: "string", obrigatorio: false, descricao: "Fim do período em YYYY-MM-DD (LISTAR/CONSULTAR_CONSUMO_MEDIO)." },
  { nome: "limite", tipo: "number", obrigatorio: false, descricao: "Máximo de resultados em LISTAR (padrão 50, limite 200)." },
  { nome: "confirmacao", tipo: "boolean", obrigatorio: false, descricao: "EXCLUIR: só true depois que o cliente confirmou explicitamente qual abastecimento excluir." },
];

export const ferramentaGerenciarAbastecimento: DefinicaoFerramenta<GerenciarAbastecimentoEntrada, GerenciarAbastecimentoResultado> = {
  nome: "gerenciar_abastecimento",
  descricao: "Registra, lista, atualiza e exclui abastecimentos de um veículo, e calcula o consumo médio REAL (km/l medido) a partir do histórico.",
  objetivo:
    "Criar um histórico real de abastecimentos (litros, valor, km do odômetro) reaproveitando o mesmo padrão de registrar_despesa — cada abastecimento com valor sincroniza automaticamente uma despesa em Despesas, nunca duplicada. CONSULTAR_CONSUMO_MEDIO complementa (não substitui) calcular_combustivel: enquanto essa é um cálculo pontual com o consumo que o cliente informou/tem salvo, esta ferramenta mede o consumo real a partir do histórico de km rodado entre abastecimentos.",
  parametros: PARAMETROS,
  executar,
};
