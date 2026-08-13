import type { DefinicaoFerramenta, DefinicaoParametroFerramenta, ResultadoFerramentaBase } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";
import { listVehicleDocumentsForPanel, createVehicleDocument, updateVehicleDocument } from "@/services/supabase/vehicleDocumentService";
import { getVehicle } from "@/services/supabase/vehicleService";
import type { VehicleDocumentRow, VehicleDocumentTypeEnum } from "@/lib/supabase/tables";

/**
 * Ferramenta: gerenciar_documento_frota
 *
 * Ferramenta de INTEGRAÇÃO (I/O real com Supabase — `vehicle_documents`),
 * mesmo padrão de `gerenciar_veiculo`/`gerenciar_manutencao`. Fecha a lacuna
 * real: `vehicle_documents` (tacógrafo/RNTRC/CNH/toxicológico e, desde a
 * Fase 4 do plano de unificação, seguro/licenciamento) só existia pro
 * painel web — o WhatsApp não tinha como cadastrar/consultar esses
 * documentos (seguro/licenciamento continuam com um caminho próprio de
 * upsert em `gerenciar_veiculo`, que é o fluxo natural de quando o cliente
 * atualiza dado do veículo — esta ferramenta cobre os outros 4 tipos e
 * consulta geral).
 *
 * Cada documento pertence a EXATAMENTE 1 veículo OU 1 motorista — a mesma
 * regra do CHECK `vehicle_documents_exactly_one_owner` do banco é
 * replicada aqui em código pra dar um erro amigável antes do INSERT falhar.
 */

export type ModoGerenciarDocumentoFrota = "CRIAR" | "LISTAR" | "ATUALIZAR";

const TIPOS_DOCUMENTO: VehicleDocumentTypeEnum[] = ["tacografo", "rntrc", "cnh", "toxicologico", "seguro", "licenciamento"];

export interface GerenciarDocumentoFrotaEntrada {
  modo: ModoGerenciarDocumentoFrota;
  userId: string;
  companyId: string;
  conversationId?: string;
  /** Obrigatório em ATUALIZAR. */
  documentId?: string;

  tipo?: VehicleDocumentTypeEnum;
  veiculoId?: string;
  motoristaId?: string;
  dataVencimento?: string;
  observacoes?: string;
}

export interface DocumentoFrotaResumo {
  id: string;
  tipo: VehicleDocumentTypeEnum;
  veiculoId: string | null;
  motoristaId: string | null;
  dataVencimento: string | null;
  observacoes: string | null;
}

export interface GerenciarDocumentoFrotaResultado extends ResultadoFerramentaBase {
  modo: ModoGerenciarDocumentoFrota;
  documento?: DocumentoFrotaResumo;
  documentos?: DocumentoFrotaResumo[];
}

function mapaDocumento(row: VehicleDocumentRow): DocumentoFrotaResumo {
  return {
    id: row.id,
    tipo: row.document_type,
    veiculoId: row.vehicle_id,
    motoristaId: row.driver_id,
    dataVencimento: row.expiry_date,
    observacoes: row.notes,
  };
}

function respostaFalha(modo: ModoGerenciarDocumentoFrota, alertas: string[], dadosFaltantes: string[] = []): GerenciarDocumentoFrotaResultado {
  return { sucesso: false, modo, alertas, premissas: [], dadosFaltantes, mensagemResumo: alertas[0] ?? "Não foi possível concluir a ação de documento." };
}

async function executar(entrada: GerenciarDocumentoFrotaEntrada): Promise<GerenciarDocumentoFrotaResultado> {
  const { modo, userId, companyId } = entrada;

  if (!userId || !companyId) {
    return respostaFalha(modo, ["Não foi possível identificar o usuário/empresa para o documento."], ["userId", "companyId"]);
  }

  const admin = createAdminClient();

  try {
    if (modo === "CRIAR") {
      if (!entrada.tipo) {
        return respostaFalha(modo, ["Preciso saber o tipo do documento (tacógrafo, RNTRC, CNH, toxicológico, seguro ou licenciamento)."], ["tipo"]);
      }

      const temVeiculo = !!entrada.veiculoId;
      const temMotorista = !!entrada.motoristaId;
      if (temVeiculo === temMotorista) {
        return respostaFalha(modo, ["Preciso de exatamente um dono para o documento — o veículo OU o motorista, nunca os dois nem nenhum."], [
          "veiculoId",
          "motoristaId",
        ]);
      }

      if (entrada.veiculoId) {
        const veiculo = await getVehicle(admin, entrada.veiculoId);
        if (!veiculo || veiculo.company_id !== companyId) {
          return respostaFalha(modo, ["Não encontrei esse veículo para esta empresa — use LISTAR de veículos antes se houver dúvida sobre qual é."], ["veiculoId"]);
        }
      }

      const criado = await createVehicleDocument(admin, companyId, {
        documentType: entrada.tipo,
        vehicleId: entrada.veiculoId,
        driverId: entrada.motoristaId,
        expiryDate: entrada.dataVencimento,
        notes: entrada.observacoes,
      });

      return {
        sucesso: true,
        modo,
        alertas: [],
        premissas: [],
        dadosFaltantes: [],
        documento: mapaDocumento(criado),
        mensagemResumo: `Documento "${criado.document_type}" registrado.`,
      };
    }

    if (modo === "LISTAR") {
      const documentos = (await listVehicleDocumentsForPanel(admin, companyId)).map(mapaDocumento);
      return {
        sucesso: true,
        modo,
        alertas: [],
        premissas: [],
        dadosFaltantes: [],
        documentos,
        mensagemResumo: documentos.length === 0 ? "Nenhum documento cadastrado ainda." : `${documentos.length} documento(s) encontrado(s).`,
      };
    }

    // ATUALIZAR exige documentId.
    if (!entrada.documentId) {
      return respostaFalha(modo, ["Preciso saber exatamente qual documento (documentId) — use LISTAR antes se houver dúvida sobre qual é."], ["documentId"]);
    }

    if (entrada.veiculoId) {
      const veiculo = await getVehicle(admin, entrada.veiculoId);
      if (!veiculo || veiculo.company_id !== companyId) {
        return respostaFalha(modo, ["Não encontrei esse veículo para esta empresa — use LISTAR de veículos antes se houver dúvida sobre qual é."], ["veiculoId"]);
      }
    }

    const atualizado = await updateVehicleDocument(admin, entrada.documentId, companyId, {
      documentType: entrada.tipo,
      vehicleId: entrada.veiculoId,
      driverId: entrada.motoristaId,
      expiryDate: entrada.dataVencimento,
      notes: entrada.observacoes,
    });

    return {
      sucesso: true,
      modo,
      alertas: [],
      premissas: [],
      dadosFaltantes: [],
      documento: mapaDocumento(atualizado),
      mensagemResumo: `Documento "${atualizado.document_type}" atualizado.`,
    };
  } catch {
    return respostaFalha(modo, ["Não foi possível concluir a ação de documento agora. Confira os dados e tente novamente."]);
  }
}

const PARAMETROS: DefinicaoParametroFerramenta[] = [
  { nome: "modo", tipo: "enum", obrigatorio: true, descricao: "Operação a executar.", valoresPossiveis: ["CRIAR", "LISTAR", "ATUALIZAR"] },
  { nome: "userId", tipo: "string", obrigatorio: true, descricao: "Usuário dono da empresa (do contexto da conversa, nunca da mensagem)." },
  { nome: "companyId", tipo: "string", obrigatorio: true, descricao: "Empresa dona do(s) documento(s) (do contexto da conversa)." },
  { nome: "conversationId", tipo: "string", obrigatorio: false, descricao: "Conversa de origem." },
  { nome: "documentId", tipo: "string", obrigatorio: false, descricao: "Id do documento — obrigatório em ATUALIZAR. Use LISTAR antes se não tiver certeza de qual é." },
  { nome: "tipo", tipo: "enum", obrigatorio: false, descricao: "Tipo do documento — obrigatório em CRIAR.", valoresPossiveis: TIPOS_DOCUMENTO },
  {
    nome: "veiculoId",
    tipo: "string",
    obrigatorio: false,
    descricao: "Id do veículo dono do documento — exclusivo com motoristaId (exatamente um dos dois é obrigatório em CRIAR). Use LISTAR de veículos (gerenciar_veiculo) antes se não tiver certeza.",
  },
  {
    nome: "motoristaId",
    tipo: "string",
    obrigatorio: false,
    descricao: "Id do motorista dono do documento — exclusivo com veiculoId (exatamente um dos dois é obrigatório em CRIAR). Use LISTAR de motoristas (gerenciar_motorista) antes se não tiver certeza.",
  },
  { nome: "dataVencimento", tipo: "string", obrigatorio: false, descricao: "Data de vencimento do documento, formato YYYY-MM-DD — lida de foto do documento ou informada pelo cliente." },
  { nome: "observacoes", tipo: "string", obrigatorio: false, descricao: "Observações livres sobre o documento." },
];

export const ferramentaGerenciarDocumentoFrota: DefinicaoFerramenta<GerenciarDocumentoFrotaEntrada, GerenciarDocumentoFrotaResultado> = {
  nome: "gerenciar_documento_frota",
  descricao: "Cadastra, lista e atualiza documentos de veículos e motoristas da frota (tacógrafo, RNTRC, CNH, toxicológico, seguro, licenciamento) a partir do que o cliente conta ou manda em foto na conversa.",
  objetivo:
    "Transformar documento mencionado ou fotografado na conversa (tipo, dono, vencimento) num registro estruturado reaproveitável (mesma tabela `vehicle_documents` que o painel de gestão de frota usa) — nunca inventa um valor não informado pelo usuário. Distinga sempre um arquivo só analisado (ex.: CT-e lido pra calcular frete) de um documento operacional cadastrado de verdade — só use esta ferramenta quando o cliente quiser registrar/atualizar o documento, não pra toda foto enviada na conversa.",
  parametros: PARAMETROS,
  executar,
};
