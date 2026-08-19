import type { DefinicaoFerramenta, DefinicaoParametroFerramenta, ResultadoFerramentaBase } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";
import { listDriversForPanel, createDriver, updateDriver } from "@/services/supabase/driverService";
import { getVehicle } from "@/services/supabase/vehicleService";
import type { DriverRow } from "@/lib/supabase/tables";

/**
 * Ferramenta: gerenciar_motorista
 *
 * Ferramenta de INTEGRAÇÃO (I/O real com Supabase — `drivers`), mesmo
 * padrão de `gerenciar_veiculo`/`gerenciar_rota_salva`. Fecha a lacuna real:
 * `drivers` só existia pro painel web (V2) — o WhatsApp não tinha como
 * cadastrar/consultar motorista, mesmo a tabela e o RLS já sendo os mesmos
 * dos dois canais (plano de unificação V1+V2, Fase 2).
 *
 * Motorista continua sendo só um registro operacional — não é conta de
 * usuário, não tem WhatsApp próprio falando com a IA (decisão já tomada
 * antes desta ferramenta, mantida aqui).
 *
 * `veiculoId`, quando informado, é sempre verificado contra `companyId`
 * antes de vincular — nunca confia só no id que o modelo mandou.
 */

export type ModoGerenciarMotorista = "CRIAR" | "LISTAR" | "ATUALIZAR" | "DESATIVAR" | "ATIVAR";

export interface GerenciarMotoristaEntrada {
  modo: ModoGerenciarMotorista;
  userId: string;
  companyId: string;
  conversationId?: string;
  /** Obrigatório em ATUALIZAR/DESATIVAR. */
  driverId?: string;

  nome?: string;
  telefone?: string;
  /** Ausente = mantém o vínculo atual. Não há como desvincular por aqui (schema de ferramenta não expressa null) — isso continua sendo feito pelo painel. */
  veiculoId?: string;
  vencimentoCnh?: string;
  vencimentoToxicologico?: string;
}

export interface MotoristaResumo {
  id: string;
  nome: string;
  telefone: string | null;
  veiculoId: string | null;
  vencimentoCnh: string | null;
  vencimentoToxicologico: string | null;
  ativo: boolean;
}

export interface GerenciarMotoristaResultado extends ResultadoFerramentaBase {
  modo: ModoGerenciarMotorista;
  motorista?: MotoristaResumo;
  motoristas?: MotoristaResumo[];
}

function mapaMotorista(row: DriverRow): MotoristaResumo {
  return {
    id: row.id,
    nome: row.name,
    telefone: row.phone_e164,
    veiculoId: row.vehicle_id,
    vencimentoCnh: row.cnh_expiry_date,
    vencimentoToxicologico: row.toxicologico_expiry_date,
    ativo: row.active,
  };
}

function respostaFalha(modo: ModoGerenciarMotorista, alertas: string[], dadosFaltantes: string[] = []): GerenciarMotoristaResultado {
  return { sucesso: false, modo, alertas, premissas: [], dadosFaltantes, mensagemResumo: alertas[0] ?? "Não foi possível concluir a ação de motorista." };
}

async function executar(entrada: GerenciarMotoristaEntrada): Promise<GerenciarMotoristaResultado> {
  const { modo, userId, companyId } = entrada;

  if (!userId || !companyId) {
    return respostaFalha(modo, ["Não foi possível identificar o usuário/empresa para o motorista."], ["userId", "companyId"]);
  }

  const admin = createAdminClient();

  try {
    if (entrada.veiculoId) {
      const veiculo = await getVehicle(admin, entrada.veiculoId);
      if (!veiculo || veiculo.company_id !== companyId) {
        return respostaFalha(modo, ["Não encontrei esse veículo para esta empresa — use LISTAR de veículos antes se houver dúvida sobre qual é."], ["veiculoId"]);
      }
    }

    if (modo === "CRIAR") {
      if (!entrada.nome) {
        return respostaFalha(modo, ["Preciso do nome do motorista para cadastrar."], ["nome"]);
      }

      const criado = await createDriver(admin, companyId, {
        name: entrada.nome,
        phoneE164: entrada.telefone,
        vehicleId: entrada.veiculoId,
        cnhExpiryDate: entrada.vencimentoCnh,
        toxicologicoExpiryDate: entrada.vencimentoToxicologico,
      });

      return {
        sucesso: true,
        modo,
        alertas: [],
        premissas: [],
        dadosFaltantes: [],
        motorista: mapaMotorista(criado),
        mensagemResumo: `Motorista "${criado.name}" cadastrado.`,
      };
    }

    if (modo === "LISTAR") {
      const motoristas = (await listDriversForPanel(admin, companyId)).map(mapaMotorista);
      return {
        sucesso: true,
        modo,
        alertas: [],
        premissas: [],
        dadosFaltantes: [],
        motoristas,
        mensagemResumo: motoristas.length === 0 ? "Nenhum motorista cadastrado ainda." : `${motoristas.length} motorista(s) cadastrado(s).`,
      };
    }

    // ATUALIZAR / DESATIVAR / ATIVAR exigem driverId, sempre verificado contra a empresa (via filtro company_id no update).
    if (!entrada.driverId) {
      return respostaFalha(modo, ["Preciso saber exatamente qual motorista (driverId) — use LISTAR antes se houver dúvida sobre qual é."], ["driverId"]);
    }

    if (modo === "ATUALIZAR") {
      const atualizado = await updateDriver(admin, entrada.driverId, companyId, {
        name: entrada.nome,
        phoneE164: entrada.telefone,
        vehicleId: entrada.veiculoId,
        cnhExpiryDate: entrada.vencimentoCnh,
        toxicologicoExpiryDate: entrada.vencimentoToxicologico,
      });

      return {
        sucesso: true,
        modo,
        alertas: [],
        premissas: [],
        dadosFaltantes: [],
        motorista: mapaMotorista(atualizado),
        mensagemResumo: `Dados de "${atualizado.name}" atualizados.`,
      };
    }

    // DESATIVAR / ATIVAR
    const atualizadoStatus = await updateDriver(admin, entrada.driverId, companyId, { active: modo === "ATIVAR" });
    return {
      sucesso: true,
      modo,
      alertas: [],
      premissas: [],
      dadosFaltantes: [],
      motorista: mapaMotorista(atualizadoStatus),
      mensagemResumo: modo === "ATIVAR" ? `Motorista "${atualizadoStatus.name}" reativado.` : `Motorista "${atualizadoStatus.name}" desativado.`,
    };
  } catch {
    return respostaFalha(modo, ["Não foi possível concluir a ação de motorista agora. Confira os dados e tente novamente."]);
  }
}

const PARAMETROS: DefinicaoParametroFerramenta[] = [
  { nome: "modo", tipo: "enum", obrigatorio: true, descricao: "Operação a executar.", valoresPossiveis: ["CRIAR", "LISTAR", "ATUALIZAR", "DESATIVAR", "ATIVAR"] },
  { nome: "userId", tipo: "string", obrigatorio: true, descricao: "Usuário dono da empresa (do contexto da conversa, nunca da mensagem)." },
  { nome: "companyId", tipo: "string", obrigatorio: true, descricao: "Empresa dona do(s) motorista(s) (do contexto da conversa)." },
  { nome: "conversationId", tipo: "string", obrigatorio: false, descricao: "Conversa de origem." },
  { nome: "driverId", tipo: "string", obrigatorio: false, descricao: "Id do motorista — obrigatório em ATUALIZAR/DESATIVAR/ATIVAR. Use LISTAR antes se não tiver certeza de qual é." },
  { nome: "nome", tipo: "string", obrigatorio: false, descricao: "Nome do motorista." },
  { nome: "telefone", tipo: "string", obrigatorio: false, descricao: "Telefone do motorista, formato E.164 (ex.: +5541999998888)." },
  { nome: "veiculoId", tipo: "string", obrigatorio: false, descricao: "Id do veículo a vincular — use LISTAR de veículos (gerenciar_veiculo) antes se não tiver certeza. Omitir mantém o vínculo atual; não é possível desvincular por aqui (só pelo painel)." },
  { nome: "vencimentoCnh", tipo: "string", obrigatorio: false, descricao: "Data de vencimento da CNH, formato YYYY-MM-DD — lida de foto do documento ou informada pelo cliente." },
  { nome: "vencimentoToxicologico", tipo: "string", obrigatorio: false, descricao: "Data de vencimento do exame toxicológico, formato YYYY-MM-DD." },
];

export const ferramentaGerenciarMotorista: DefinicaoFerramenta<GerenciarMotoristaEntrada, GerenciarMotoristaResultado> = {
  nome: "gerenciar_motorista",
  descricao: "Cadastra, lista, atualiza, desativa e reativa motoristas da empresa (nome, telefone, veículo vinculado, vencimento de CNH/toxicológico) a partir do que o cliente conta na conversa.",
  objetivo:
    "Transformar dado de motorista mencionado na conversa num registro estruturado reaproveitável (mesma tabela `drivers` que o painel de gestão de frota usa) — nunca inventa um valor não informado pelo usuário. Motorista aqui é só um registro operacional, não uma conta de usuário.",
  parametros: PARAMETROS,
  executar,
};
