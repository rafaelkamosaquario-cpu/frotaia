import type { DefinicaoFerramenta, DefinicaoParametroFerramenta, ResultadoFerramentaBase } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";
import { listVendors, getVendor, createVendor, updateVendor, deactivateVendor } from "@/services/supabase/vendorService";
import type { VendorRow, VendorCategoryEnum } from "@/lib/supabase/tables";

/**
 * Ferramenta: gerenciar_fornecedor
 *
 * Ferramenta de INTEGRAÇÃO (I/O real com Supabase — vendors), mesmo padrão
 * de `gerenciar_rota_salva`. Rodada de evolução funcional 09/2026 (item
 * 1/5, comparação com sistema de planilha "Frota 7.15"): cadastro
 * estruturado de posto de combustível/oficina/fornecedor de peças, hoje só
 * existia como texto livre em `expenses.vendor`. `expenses.vendor`
 * continua existindo à parte — este cadastro é opcional, não obrigatório.
 *
 * `vendorId` sempre verificado contra `companyId` antes de qualquer escrita
 * (mesmo princípio de `gerenciar_rota_salva`/`gerenciar_veiculo`) — nunca
 * confia só no id que o modelo mandou.
 */

export type ModoGerenciarFornecedor = "CRIAR" | "LISTAR" | "ATUALIZAR" | "DESATIVAR";

export interface GerenciarFornecedorEntrada {
  modo: ModoGerenciarFornecedor;
  userId: string;
  companyId: string;
  conversationId?: string;
  /** Obrigatório em ATUALIZAR/DESATIVAR. */
  vendorId?: string;

  nome?: string;
  categoria?: VendorCategoryEnum;
  endereco?: string;
  telefone?: string;
  observacoes?: string;
}

export interface FornecedorResumo {
  id: string;
  nome: string;
  categoria: VendorCategoryEnum;
  endereco: string | null;
  telefone: string | null;
  observacoes: string | null;
  ativo: boolean;
}

export interface GerenciarFornecedorResultado extends ResultadoFerramentaBase {
  modo: ModoGerenciarFornecedor;
  fornecedor?: FornecedorResumo;
  fornecedores?: FornecedorResumo[];
}

function mapaFornecedor(row: VendorRow): FornecedorResumo {
  return {
    id: row.id,
    nome: row.name,
    categoria: row.category,
    endereco: row.address,
    telefone: row.phone,
    observacoes: row.notes,
    ativo: row.active,
  };
}

function respostaFalha(modo: ModoGerenciarFornecedor, alertas: string[], dadosFaltantes: string[] = []): GerenciarFornecedorResultado {
  return { sucesso: false, modo, alertas, premissas: [], dadosFaltantes, mensagemResumo: alertas[0] ?? "Não foi possível concluir a ação de fornecedor." };
}

async function executar(entrada: GerenciarFornecedorEntrada): Promise<GerenciarFornecedorResultado> {
  const { modo, userId, companyId } = entrada;

  if (!userId || !companyId) {
    return respostaFalha(modo, ["Não foi possível identificar o usuário/empresa para o fornecedor."], ["userId", "companyId"]);
  }

  const admin = createAdminClient();

  try {
    if (modo === "CRIAR") {
      if (!entrada.nome) {
        return respostaFalha(modo, ["Preciso do nome do posto/fornecedor para cadastrar."], ["nome"]);
      }

      const criado = await createVendor(admin, companyId, userId, {
        name: entrada.nome,
        category: entrada.categoria,
        address: entrada.endereco,
        phone: entrada.telefone,
        notes: entrada.observacoes,
      });

      return {
        sucesso: true,
        modo,
        alertas: [],
        premissas: [],
        dadosFaltantes: [],
        fornecedor: mapaFornecedor(criado),
        mensagemResumo: `Fornecedor "${criado.name}" cadastrado.`,
      };
    }

    if (modo === "LISTAR") {
      const fornecedores = (await listVendors(admin, companyId)).map(mapaFornecedor);
      return {
        sucesso: true,
        modo,
        alertas: [],
        premissas: [],
        dadosFaltantes: [],
        fornecedores,
        mensagemResumo: fornecedores.length === 0 ? "Nenhum posto/fornecedor cadastrado ainda." : `${fornecedores.length} fornecedor(es) cadastrado(s).`,
      };
    }

    // ATUALIZAR / DESATIVAR exigem vendorId, sempre verificado contra a empresa.
    if (!entrada.vendorId) {
      return respostaFalha(modo, ["Preciso saber exatamente qual fornecedor (vendorId) — use LISTAR antes se houver dúvida sobre qual é."], ["vendorId"]);
    }

    const fornecedorAtual = await getVendor(admin, entrada.vendorId);
    if (!fornecedorAtual || fornecedorAtual.company_id !== companyId) {
      return respostaFalha(modo, ["Não encontrei esse fornecedor para esta empresa."], ["vendorId"]);
    }

    if (modo === "ATUALIZAR") {
      const atualizado = await updateVendor(admin, entrada.vendorId, companyId, userId, {
        name: entrada.nome,
        category: entrada.categoria,
        address: entrada.endereco,
        phone: entrada.telefone,
        notes: entrada.observacoes,
      });

      return {
        sucesso: true,
        modo,
        alertas: [],
        premissas: [],
        dadosFaltantes: [],
        fornecedor: mapaFornecedor(atualizado),
        mensagemResumo: `Fornecedor "${atualizado.name}" atualizado.`,
      };
    }

    // DESATIVAR
    const desativado = await deactivateVendor(admin, entrada.vendorId, companyId, userId);
    return {
      sucesso: true,
      modo,
      alertas: [],
      premissas: [],
      dadosFaltantes: [],
      fornecedor: mapaFornecedor(desativado),
      mensagemResumo: `Fornecedor "${desativado.name}" desativado.`,
    };
  } catch {
    return respostaFalha(modo, ["Não foi possível concluir a ação de fornecedor agora. Confira os dados e tente novamente."]);
  }
}

const PARAMETROS: DefinicaoParametroFerramenta[] = [
  { nome: "modo", tipo: "enum", obrigatorio: true, descricao: "Operação a executar.", valoresPossiveis: ["CRIAR", "LISTAR", "ATUALIZAR", "DESATIVAR"] },
  { nome: "userId", tipo: "string", obrigatorio: true, descricao: "Usuário dono da empresa (do contexto da conversa, nunca da mensagem)." },
  { nome: "companyId", tipo: "string", obrigatorio: true, descricao: "Empresa dona do(s) fornecedor(es) (do contexto da conversa)." },
  { nome: "conversationId", tipo: "string", obrigatorio: false, descricao: "Conversa de origem." },
  { nome: "vendorId", tipo: "string", obrigatorio: false, descricao: "Id do fornecedor — obrigatório em ATUALIZAR/DESATIVAR. Use LISTAR antes se não tiver certeza de qual é." },
  { nome: "nome", tipo: "string", obrigatorio: false, descricao: "Nome do posto/fornecedor — obrigatório em CRIAR." },
  { nome: "categoria", tipo: "enum", obrigatorio: false, descricao: "Tipo de fornecedor.", valoresPossiveis: ["posto_combustivel", "oficina_mecanica", "fornecedor_pecas", "outro"] },
  { nome: "endereco", tipo: "string", obrigatorio: false, descricao: "Endereço do posto/fornecedor." },
  { nome: "telefone", tipo: "string", obrigatorio: false, descricao: "Telefone de contato." },
  { nome: "observacoes", tipo: "string", obrigatorio: false, descricao: "Observações livres sobre o fornecedor." },
];

export const ferramentaGerenciarFornecedor: DefinicaoFerramenta<GerenciarFornecedorEntrada, GerenciarFornecedorResultado> = {
  nome: "gerenciar_fornecedor",
  descricao: "Cadastra, lista, atualiza e desativa postos de combustível e fornecedores (oficina/peças) da empresa.",
  objetivo:
    "Estruturar postos/fornecedores como cadastro próprio em vez de texto livre solto em cada despesa — permite reutilizar o mesmo fornecedor em várias despesas/abastecimentos e futuramente cruzar gastos por fornecedor. Não substitui o campo de texto livre `vendor` das despesas, que continua funcionando normalmente para quem não quiser cadastrar.",
  parametros: PARAMETROS,
  executar,
};
