import type { DefinicaoFerramenta, DefinicaoParametroFerramenta, ResultadoFerramentaBase } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";
import { gerarPdfRelatorio, type LinhaChaveValor } from "@/services/documents/pdfGenerator";
import { sendWhatsappPdf } from "@/lib/whatsapp/zapiClient";
import { listChannelsForUser } from "@/services/supabase/channelIdentityService";
import { recordGeneratedDocument } from "@/services/supabase/generatedDocumentService";
import { getProfile } from "@/services/supabase/profileService";
import { getCompany } from "@/services/supabase/companyService";
import { getVehicle } from "@/services/supabase/vehicleService";
import { buildGeneratedDocumentStoragePath, uploadGeneratedDocumentFile } from "@/lib/storage/generatedDocumentsStorage";

/**
 * Ferramenta: gerar_documento
 *
 * Gera um PDF e entrega pro cliente. Nunca inventa dado ausente: se faltar
 * analysisRunId ou conteúdo, pede antes de gerar (seção 11 do prompt
 * V1-WhatsApp).
 *
 * Entrega pelo canal disponível na CONTA, não por "de onde veio a
 * mensagem" — o motor de IA é deliberadamente agnóstico de canal (ver
 * comentário em gerarRespostaAssistente.ts: "esta função não sabe se está
 * sendo chamada pela web ou pelo WhatsApp"), então esta ferramenta decide
 * sozinha pelos dados já cadastrados:
 * - tem WhatsApp vinculado (`user_channels`) → gera, salva no Storage
 *   (best-effort) e envia o PDF direto na conversa, como sempre;
 * - sem WhatsApp vinculado (conta só-painel, ex.: login Google que nunca
 *   passou pelo onboarding do WhatsApp) → gera e salva no Storage
 *   normalmente, e a resposta aponta pra tela "Documentos gerados" do
 *   painel, em vez de falhar com "não encontrei WhatsApp vinculado" (achado
 *   de auditoria, 09/2026: o widget de IA do painel usa esta MESMA
 *   ferramenta, e pedir um relatório por ali sempre falhava pra quem não
 *   tinha WhatsApp — cliente via a tela, mas o pedido nunca dava certo).
 *
 * Dois modos de entrada:
 * - `analysisRunId`: puxa uma análise já feita (de analysis_runs — ver o
 *   fix em gerarRespostaAssistente.ts que passou a gravar essa tabela) e
 *   monta o relatório a partir dela;
 * - `titulo` + `conteudo`: relatório livre, para pedidos que não vêm de
 *   uma análise específica (ex.: resumo mensal).
 */

export interface GerarDocumentoEntrada {
  userId: string;
  companyId: string;
  conversationId?: string;
  analysisRunId?: string;
  titulo?: string;
  conteudo?: string;
  observacoes?: string;
}

export interface GerarDocumentoResultado extends ResultadoFerramentaBase {
  documentoId?: string;
  nomeArquivo?: string;
  enviado?: boolean;
}

function respostaFalha(alertas: string[], dadosFaltantes: string[] = []): GerarDocumentoResultado {
  return { sucesso: false, alertas, premissas: [], dadosFaltantes, mensagemResumo: alertas[0] ?? "Não foi possível gerar o documento." };
}

async function executar(entrada: GerarDocumentoEntrada): Promise<GerarDocumentoResultado> {
  const { userId, companyId, analysisRunId, titulo, conteudo, observacoes } = entrada;

  if (!userId || !companyId) {
    return respostaFalha(["Não foi possível identificar o usuário/empresa para gerar o documento."], ["userId", "companyId"]);
  }

  if (!analysisRunId && !(titulo && conteudo)) {
    return respostaFalha(
      ["Preciso de uma análise específica (analysisRunId) ou de um título + conteúdo para gerar o documento — nunca invento o que colocar nele."],
      ["analysisRunId", "titulo", "conteudo"]
    );
  }

  const admin = createAdminClient();

  try {
    const canais = await listChannelsForUser(admin, userId);
    const canalWhatsapp = canais.find((c) => c.channel_type === "whatsapp" && c.phone_e164);

    const [profile, company] = await Promise.all([getProfile(admin, userId), getCompany(admin, companyId)]);

    let tituloFinal = titulo ?? "Relatório Frota IA";
    let resumo: string | undefined;
    let pedidoUsuario: string | undefined;
    let periodo: string | undefined;
    const linhas: LinhaChaveValor[] = [];
    let tipoDocumento = "relatorio_livre";

    if (analysisRunId) {
      const { data: run, error } = await admin
        .from("analysis_runs")
        .select("*")
        .eq("id", analysisRunId)
        .eq("company_id", companyId)
        .maybeSingle();

      if (error) throw error;
      if (!run) {
        return respostaFalha(["Não encontrei essa análise para gerar o documento — pode ter sido de outra empresa ou não existir mais."]);
      }

      tipoDocumento = run.analysis_type;
      tituloFinal = titulo ?? `Relatório — ${run.analysis_type.replace(/_/g, " ")}`;
      resumo = run.result_summary ?? undefined;
      pedidoUsuario = run.user_request ?? undefined;
      periodo = new Date(run.started_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

      const dados = (run.result_data ?? {}) as Record<string, unknown>;
      for (const [chave, valor] of Object.entries(dados)) {
        if (["sucesso", "alertas", "premissas", "dadosFaltantes", "mensagemResumo", "modo"].includes(chave)) continue;
        if (valor === undefined || valor === null) continue;
        linhas.push({ chave, valor: typeof valor === "object" ? JSON.stringify(valor) : String(valor) });
      }

      if (run.vehicle_id) {
        const veiculo = await getVehicle(admin, run.vehicle_id).catch(() => null);
        if (veiculo) linhas.unshift({ chave: "Veículo", valor: [veiculo.name, veiculo.plate].filter(Boolean).join(" — ") || veiculo.id });
      }
    } else {
      resumo = conteudo;
    }

    const pdfBytes = await gerarPdfRelatorio({
      titulo: tituloFinal,
      geradoEm: new Date(),
      nomeUsuario: profile?.full_name ?? undefined,
      nomeEmpresa: company?.name ?? undefined,
      periodo,
      pedidoUsuario,
      resumo,
      linhas,
      observacoes,
    });

    const nomeArquivo = `${tipoDocumento}-${new Date().toISOString().slice(0, 10)}.pdf`;

    let storagePath: string | undefined;
    let enviadoPeloWhatsapp = false;

    if (canalWhatsapp?.phone_e164) {
      // Com WhatsApp vinculado: comportamento de sempre — entrega primeiro
      // (nunca atrasa o cliente esperando o Storage), Storage é best-effort
      // depois, só pra alimentar "Documentos gerados" no painel.
      await sendWhatsappPdf(canalWhatsapp.phone_e164, pdfBytes, nomeArquivo);
      enviadoPeloWhatsapp = true;
      try {
        storagePath = buildGeneratedDocumentStoragePath(companyId, nomeArquivo);
        await uploadGeneratedDocumentFile(admin, storagePath, pdfBytes);
      } catch (erroUpload) {
        storagePath = undefined;
        console.error(`[gerar-documento] Falha ao persistir o PDF no Storage (documento já foi enviado por WhatsApp normalmente): ${erroUpload instanceof Error ? erroUpload.message : String(erroUpload)}`);
      }
    } else {
      // Sem WhatsApp vinculado (conta só-painel): aqui o Storage NÃO é
      // best-effort — é a única forma de entrega, então precisa ter
      // sucesso antes de dizer que deu certo.
      try {
        storagePath = buildGeneratedDocumentStoragePath(companyId, nomeArquivo);
        await uploadGeneratedDocumentFile(admin, storagePath, pdfBytes);
      } catch (erroUpload) {
        console.error(`[gerar-documento] Falha ao persistir o PDF no Storage (sem WhatsApp vinculado, era a única via de entrega): ${erroUpload instanceof Error ? erroUpload.message : String(erroUpload)}`);
        return respostaFalha(["Gerei o documento, mas não consegui salvá-lo agora (esta conta não tem WhatsApp vinculado). Pode tentar de novo em instantes?"]);
      }
    }

    const registro = await recordGeneratedDocument(admin, {
      companyId,
      userId,
      conversationId: entrada.conversationId,
      analysisRunId,
      documentType: tipoDocumento,
      title: tituloFinal,
      fileName: nomeArquivo,
      delivered: enviadoPeloWhatsapp,
      storagePath,
    });

    return {
      sucesso: true,
      alertas: [],
      premissas: [],
      dadosFaltantes: [],
      documentoId: registro.id,
      nomeArquivo,
      enviado: enviadoPeloWhatsapp,
      mensagemResumo: enviadoPeloWhatsapp
        ? `Documento "${tituloFinal}" gerado e enviado pelo WhatsApp.`
        : `Documento "${tituloFinal}" gerado — como esta conta não tem WhatsApp vinculado, acesse "Documentos gerados" no painel pra visualizar e baixar.`,
    };
  } catch (err) {
    const detalhe = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    const corpo = err && typeof err === "object" && "body" in err ? String((err as { body: unknown }).body) : "";
    console.error(`[gerar-documento] Falha ao gerar/enviar PDF: ${detalhe}${corpo ? ` | body: ${corpo.slice(0, 300)}` : ""}`);
    return respostaFalha(["Não consegui gerar ou enviar o documento agora. A análise continua salva no histórico — pode tentar de novo em instantes."]);
  }
}

const PARAMETROS: DefinicaoParametroFerramenta[] = [
  { nome: "userId", tipo: "string", obrigatorio: true, descricao: "Usuário para quem gerar o documento (do contexto da conversa)." },
  { nome: "companyId", tipo: "string", obrigatorio: true, descricao: "Empresa dona da análise/documento (do contexto da conversa)." },
  { nome: "conversationId", tipo: "string", obrigatorio: false, descricao: "Conversa de origem." },
  { nome: "analysisRunId", tipo: "string", obrigatorio: false, descricao: "Id de uma análise já feita (retornado por consultar_historico ou disponível no contexto recente) para montar o relatório a partir dela." },
  { nome: "titulo", tipo: "string", obrigatorio: false, descricao: "Título do documento — obrigatório se não houver analysisRunId." },
  { nome: "conteudo", tipo: "string", obrigatorio: false, descricao: "Conteúdo livre do relatório — obrigatório se não houver analysisRunId. Nunca invente o conteúdo, use só o que o usuário/contexto já forneceu." },
  { nome: "observacoes", tipo: "string", obrigatorio: false, descricao: "Observações adicionais para o rodapé do documento." },
];

export const ferramentaGerarDocumento: DefinicaoFerramenta<GerarDocumentoEntrada, GerarDocumentoResultado> = {
  nome: "gerar_documento",
  descricao: "Gera um PDF (relatório de análise, custo, comparação, resumo etc.) e entrega pelo WhatsApp (se vinculado) ou disponibiliza no painel, em Documentos gerados.",
  objetivo: "Entregar ao usuário um documento formal do que já foi calculado/analisado, sem inventar dado ausente, pelo canal disponível na conta.",
  parametros: PARAMETROS,
  executar,
};
