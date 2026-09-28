import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const baixar = vi.fn(); const transcrever = vi.fn(); const configurado = vi.fn(); const planilha = vi.fn();
vi.mock("@/lib/whatsapp/mediaDownloader", () => ({ baixarMidia: (...a: unknown[]) => baixar(...a), paraBase64: () => "YWJj" }));
vi.mock("@/lib/openai/whisperConfig", () => ({ isWhisperConfigured: () => configurado() }));
vi.mock("@/lib/openai/whisperClient", () => ({ transcreverAudio: (...a: unknown[]) => transcrever(...a) }));
vi.mock("@/lib/spreadsheet/spreadsheetParser", () => ({ MIME_TYPES_PLANILHA_SUPORTADOS: new Set(["text/csv"]), planilhaParaTexto: (...a: unknown[]) => planilha(...a) }));
import { prepararEntradaDemo } from "./demoMedia";
beforeEach(() => { vi.clearAllMocks(); baixar.mockResolvedValue({ bytes: new Uint8Array([1]), contentType: "audio/ogg" }); configurado.mockReturnValue(true); transcrever.mockResolvedValue("600 km e 3 km/l"); planilha.mockResolvedValue("litros: 200"); });
describe("mídia na demonstração sem credenciais ou serviços reais", () => {
  it("texto sem baixar arquivo", async () => { expect(await prepararEntradaDemo({ text: { message: "Oi" } })).toMatchObject({ ok: true, texto: "Oi" }); expect(baixar).not.toHaveBeenCalled(); });
  it("foto inclui conteúdo visual mesmo com texto/legenda", async () => {
    const result = await prepararEntradaDemo({ text: { message: "confira" }, image: { imageUrl: "https://media.test/a" } });
    expect(result).toMatchObject({ ok: true, texto: "confira", conteudoMultimodal: [{ type: "image" }], extra: { content_type: "image" } });
  });
  it("PDF enviado visualmente", async () => expect(await prepararEntradaDemo({ document: { documentUrl: "https://media.test/a", mimeType: "application/pdf" } })).toMatchObject({ ok: true, conteudoMultimodal: [{ type: "document" }] }));
  it("CSV convertido em texto", async () => expect(await prepararEntradaDemo({ document: { documentUrl: "https://media.test/a", mimeType: "text/csv" } })).toMatchObject({ ok: true, texto: expect.stringContaining("litros: 200") }));
  it("áudio transcrito com marca de origem", async () => expect(await prepararEntradaDemo({ audio: { audioUrl: "https://media.test/a" } })).toMatchObject({ ok: true, texto: "600 km e 3 km/l", extra: { content_type: "audio" } }));
  it("áudio desconfigurado não chama provedor", async () => { configurado.mockReturnValue(false); expect(await prepararEntradaDemo({ audio: { audioUrl: "https://media.test/a" } })).toMatchObject({ ok: false }); expect(transcrever).not.toHaveBeenCalled(); });
  it("download falho pede reenvio", async () => { baixar.mockResolvedValue(null); expect(await prepararEntradaDemo({ image: { imageUrl: "https://media.test/a" } })).toMatchObject({ ok: false, mensagem: expect.stringContaining("reenviar") }); });
  it("tipo não suportado não faz download", async () => { expect(await prepararEntradaDemo({ document: { mimeType: "text/html" } })).toMatchObject({ ok: false }); expect(baixar).not.toHaveBeenCalled(); });
  it("falha não expõe credenciais ou URLs", async () => { transcrever.mockRejectedValue(new Error("segredo https://privado")); const r = await prepararEntradaDemo({ audio: { audioUrl: "https://media.test/a" } }); expect(r).toMatchObject({ ok: false }); expect(JSON.stringify(r)).not.toContain("segredo"); });
});
