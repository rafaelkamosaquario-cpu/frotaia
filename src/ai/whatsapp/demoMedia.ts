import type Anthropic from "@anthropic-ai/sdk";
import type { MessageInsert } from "@/lib/supabase/tables";
import { baixarMidia, paraBase64 } from "@/lib/whatsapp/mediaDownloader";
import { isWhisperConfigured } from "@/lib/openai/whisperConfig";
import { transcreverAudio } from "@/lib/openai/whisperClient";
import { MIME_TYPES_PLANILHA_SUPORTADOS, planilhaParaTexto } from "@/lib/spreadsheet/spreadsheetParser";
export interface DemoInput {
  text?: { message?: string };
  image?: { imageUrl?: string; caption?: string; mimeType?: string };
  document?: { documentUrl?: string; caption?: string; mimeType?: string };
  audio?: { audioUrl?: string; mimeType?: string };
}
export type DemoMediaResult = { ok: true; texto: string; conteudoMultimodal?: Anthropic.ContentBlockParam[]; extra: Partial<MessageInsert> } | { ok: false; mensagem: string };
const IMAGES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
/** Só prepara entrada, sem gravação, ferramentas ou alteração de credenciais. */
export async function prepararEntradaDemo(body: DemoInput): Promise<DemoMediaResult> {
  try {
    if (body.image) {
      const mime = body.image.mimeType ?? "image/jpeg";
      if (!IMAGES.has(mime)) return { ok: false, mensagem: "Pode reenviar a foto em JPEG, PNG, GIF ou WebP? Esse formato não é suportado." };
      const media = await baixarMidia(body.image.imageUrl ?? "", { rejectRedirects: true });
      if (!media) return { ok: false, mensagem: "Não consegui baixar a foto. Pode reenviar ou digitar os dados?" };
      return { ok: true, texto: body.image.caption?.trim() || body.text?.message?.trim() || "[foto recebida para análise; peça apenas os dados que faltarem]", conteudoMultimodal: [{ type: "image", source: { type: "base64", media_type: mime as "image/jpeg", data: paraBase64(media.bytes) } }], extra: { content_type: "image", metadata: { mimeType: mime } } };
    }
    if (body.document) {
      const mime = body.document.mimeType ?? "application/octet-stream";
      if (mime !== "application/pdf" && !MIME_TYPES_PLANILHA_SUPORTADOS.has(mime)) return { ok: false, mensagem: "Consigo ler PDF, XLSX e CSV. Pode mandar nesse formato ou me contar os dados?" };
      const media = await baixarMidia(body.document.documentUrl ?? "", { rejectRedirects: true });
      if (!media) return { ok: false, mensagem: "Não consegui baixar o documento. Pode reenviar ou escrever os dados?" };
      const texto = body.document.caption?.trim() || "[documento recebido para análise]";
      const extra: Partial<MessageInsert> = { content_type: "document", metadata: { mimeType: mime } };
      if (mime === "application/pdf") return { ok: true, texto, extra, conteudoMultimodal: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: paraBase64(media.bytes) } }] };
      return { ok: true, texto: `${texto}\n${await planilhaParaTexto(media.bytes, mime)}`, extra };
    }
    if (body.audio) {
      if (!isWhisperConfigured()) return { ok: false, mensagem: "O áudio está indisponível agora. Pode escrever?" };
      const media = await baixarMidia(body.audio.audioUrl ?? "", { rejectRedirects: true });
      if (!media) return { ok: false, mensagem: "Não consegui baixar seu áudio. Pode reenviar ou escrever?" };
      const texto = (await transcreverAudio(media.bytes, body.audio.mimeType || media.contentType)).trim();
      if (!texto) return { ok: false, mensagem: "Não consegui entender seu áudio. Pode reenviar ou escrever?" };
      return { ok: true, texto, extra: { content_type: "audio", metadata: { transcrito: true } } };
    }
    const texto = body.text?.message?.trim();
    return texto ? { ok: true, texto, extra: { content_type: "text" } } : { ok: false, mensagem: "Pode me contar o que precisa ou escolher um assunto?" };
  } catch {
    return { ok: false, mensagem: "Não consegui interpretar esse arquivo agora. Pode reenviar ou escrever os dados?" };
  }
}
