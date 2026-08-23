import type { DefinicaoFerramenta, DefinicaoParametroFerramenta, ResultadoFerramentaBase } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompany, updateCompany } from "@/services/supabase/companyService";
import type { CompanyRow, CompanyTypeEnum } from "@/lib/supabase/tables";

/**
 * Ferramenta: gerenciar_empresa
 *
 * Ferramenta de INTEGRAÇÃO (I/O real com Supabase — `companies`), mesmo
 * padrão de `gerenciar_veiculo`. Fecha a lacuna real: `companies` só era
 * editável pelo painel (`/api/frota/empresa`) — o WhatsApp não tinha
 * nenhuma ferramenta pra consultar nem editar os dados da própria empresa.
 */

export type ModoGerenciarEmpresa = "CONSULTAR" | "ATUALIZAR";

const TIPOS_EMPRESA: CompanyTypeEnum[] = ["autonomo", "transportadora", "embarcador", "outro"];

export interface GerenciarEmpresaEntrada {
  modo: ModoGerenciarEmpresa;
  userId: string;
  companyId: string;
  conversationId?: string;

  nome?: string;
  nomeFantasia?: string;
  tipo?: CompanyTypeEnum;
  cidade?: string;
  estado?: string;
}

export interface EmpresaResumo {
  id: string;
  nome: string;
  nomeFantasia: string | null;
  tipo: CompanyTypeEnum;
  cidade: string | null;
  estado: string | null;
}

export interface GerenciarEmpresaResultado extends ResultadoFerramentaBase {
  modo: ModoGerenciarEmpresa;
  empresa?: EmpresaResumo;
}

function mapaEmpresa(row: CompanyRow): EmpresaResumo {
  return { id: row.id, nome: row.name, nomeFantasia: row.trade_name, tipo: row.company_type, cidade: row.city, estado: row.state };
}

function respostaFalha(modo: ModoGerenciarEmpresa, alertas: string[], dadosFaltantes: string[] = []): GerenciarEmpresaResultado {
  return { sucesso: false, modo, alertas, premissas: [], dadosFaltantes, mensagemResumo: alertas[0] ?? "Não foi possível concluir a ação na empresa." };
}

async function executar(entrada: GerenciarEmpresaEntrada): Promise<GerenciarEmpresaResultado> {
  const { modo, userId, companyId } = entrada;

  if (!userId || !companyId) {
    return respostaFalha(modo, ["Não foi possível identificar o usuário/empresa."], ["userId", "companyId"]);
  }

  const admin = createAdminClient();

  try {
    if (modo === "CONSULTAR") {
      const empresa = await getCompany(admin, companyId);
      if (!empresa) return respostaFalha(modo, ["Não encontrei os dados da empresa."]);
      return {
        sucesso: true,
        modo,
        alertas: [],
        premissas: [],
        dadosFaltantes: [],
        empresa: mapaEmpresa(empresa),
        mensagemResumo: `Empresa: ${empresa.name}.`,
      };
    }

    // ATUALIZAR
    if (entrada.tipo && !TIPOS_EMPRESA.includes(entrada.tipo)) {
      return respostaFalha(modo, [`Tipo de empresa inválido: "${entrada.tipo}". Use um de: ${TIPOS_EMPRESA.join(", ")}.`]);
    }

    const atualizada = await updateCompany(admin, companyId, userId, {
      name: entrada.nome,
      tradeName: entrada.nomeFantasia,
      companyType: entrada.tipo,
      city: entrada.cidade,
      state: entrada.estado,
    });

    return {
      sucesso: true,
      modo,
      alertas: [],
      premissas: [],
      dadosFaltantes: [],
      empresa: mapaEmpresa(atualizada),
      mensagemResumo: "Dados da empresa atualizados.",
    };
  } catch {
    return respostaFalha(modo, ["Não foi possível concluir a ação na empresa agora. Tente novamente em instantes."]);
  }
}

const PARAMETROS: DefinicaoParametroFerramenta[] = [
  { nome: "modo", tipo: "enum", obrigatorio: true, descricao: "Operação a executar.", valoresPossiveis: ["CONSULTAR", "ATUALIZAR"] },
  { nome: "userId", tipo: "string", obrigatorio: true, descricao: "Usuário dono da empresa (do contexto da conversa, nunca da mensagem)." },
  { nome: "companyId", tipo: "string", obrigatorio: true, descricao: "Empresa a consultar/atualizar (do contexto da conversa)." },
  { nome: "conversationId", tipo: "string", obrigatorio: false, descricao: "Conversa de origem." },
  { nome: "nome", tipo: "string", obrigatorio: false, descricao: "Razão social/nome da empresa (ATUALIZAR)." },
  { nome: "nomeFantasia", tipo: "string", obrigatorio: false, descricao: "Nome fantasia (ATUALIZAR)." },
  {
    nome: "tipo",
    tipo: "enum",
    obrigatorio: false,
    descricao: "Tipo da empresa — rótulo administrativo/informativo, não afeta mais o limite de veículos (isso depende do plano/Painel de Gestão). Só altere se o cliente pedir explicitamente.",
    valoresPossiveis: TIPOS_EMPRESA,
  },
  { nome: "cidade", tipo: "string", obrigatorio: false, descricao: "Cidade da empresa (ATUALIZAR)." },
  { nome: "estado", tipo: "string", obrigatorio: false, descricao: "UF (2 letras) da empresa (ATUALIZAR)." },
];

export const ferramentaGerenciarEmpresa: DefinicaoFerramenta<GerenciarEmpresaEntrada, GerenciarEmpresaResultado> = {
  nome: "gerenciar_empresa",
  descricao: "Consulta ou atualiza os dados cadastrais da própria empresa (nome, nome fantasia, tipo, cidade, estado).",
  objetivo: "Deixar o cliente ver/corrigir os dados da própria empresa pelo WhatsApp, sem precisar abrir o painel — mesma tabela `companies` que o painel usa.",
  parametros: PARAMETROS,
  executar,
};
