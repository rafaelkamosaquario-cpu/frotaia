import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const createAdminClient = vi.fn();
const gerarPdfRelatorio = vi.fn();
const sendWhatsappPdf = vi.fn();
const listChannelsForUser = vi.fn();
const recordGeneratedDocument = vi.fn();
const getProfile = vi.fn();
const getCompany = vi.fn();
const buildGeneratedDocumentStoragePath = vi.fn();
const uploadGeneratedDocumentFile = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => createAdminClient() }));
vi.mock("@/services/documents/pdfGenerator", () => ({ gerarPdfRelatorio: (...a: unknown[]) => gerarPdfRelatorio(...a) }));
vi.mock("@/lib/whatsapp/zapiClient", () => ({ sendWhatsappPdf: (...a: unknown[]) => sendWhatsappPdf(...a) }));
vi.mock("@/services/supabase/channelIdentityService", () => ({ listChannelsForUser: (...a: unknown[]) => listChannelsForUser(...a) }));
vi.mock("@/services/supabase/generatedDocumentService", () => ({ recordGeneratedDocument: (...a: unknown[]) => recordGeneratedDocument(...a) }));
vi.mock("@/services/supabase/profileService", () => ({ getProfile: (...a: unknown[]) => getProfile(...a) }));
vi.mock("@/services/supabase/companyService", () => ({ getCompany: (...a: unknown[]) => getCompany(...a) }));
vi.mock("@/services/supabase/vehicleService", () => ({ getVehicle: vi.fn() }));
vi.mock("@/lib/storage/generatedDocumentsStorage", () => ({
  buildGeneratedDocumentStoragePath: (...a: unknown[]) => buildGeneratedDocumentStoragePath(...a),
  uploadGeneratedDocumentFile: (...a: unknown[]) => uploadGeneratedDocumentFile(...a),
}));

const PDF_BYTES = new Uint8Array([1, 2, 3]);

describe("gerar_documento — persistência do PDF no Storage (fechamento de coerência 08/2026)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAdminClient.mockReturnValue({});
    listChannelsForUser.mockResolvedValue([{ channel_type: "whatsapp", phone_e164: "+5541999998888" }]);
    getProfile.mockResolvedValue({ full_name: "João" });
    getCompany.mockResolvedValue({ name: "Empresa Teste" });
    gerarPdfRelatorio.mockResolvedValue(PDF_BYTES);
    sendWhatsappPdf.mockResolvedValue(undefined);
    buildGeneratedDocumentStoragePath.mockReturnValue("empresa-1/generated/123-relatorio.pdf");
    uploadGeneratedDocumentFile.mockResolvedValue(undefined);
    recordGeneratedDocument.mockResolvedValue({ id: "doc-1" });
  });

  it("upload bem-sucedido: grava storagePath no registro, mesmo caminho retornado pelo builder", async () => {
    const { ferramentaGerarDocumento } = await import("./gerar-documento");
    await ferramentaGerarDocumento.executar({ userId: "user-1", companyId: "empresa-1", titulo: "Relatório X", conteudo: "conteúdo" });

    expect(uploadGeneratedDocumentFile).toHaveBeenCalledWith(expect.anything(), "empresa-1/generated/123-relatorio.pdf", PDF_BYTES);
    expect(recordGeneratedDocument).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ storagePath: "empresa-1/generated/123-relatorio.pdf" })
    );
  });

  it("envio pelo WhatsApp acontece ANTES do upload pro Storage (nunca atrasa a entrega ao cliente por causa do Storage)", async () => {
    const ordem: string[] = [];
    sendWhatsappPdf.mockImplementation(async () => {
      ordem.push("whatsapp");
    });
    uploadGeneratedDocumentFile.mockImplementation(async () => {
      ordem.push("storage");
    });

    const { ferramentaGerarDocumento } = await import("./gerar-documento");
    await ferramentaGerarDocumento.executar({ userId: "user-1", companyId: "empresa-1", titulo: "X", conteudo: "y" });

    expect(ordem).toEqual(["whatsapp", "storage"]);
  });

  it("falha no upload pro Storage NUNCA impede o registro nem quebra a ferramenta — só fica sem storagePath", async () => {
    uploadGeneratedDocumentFile.mockRejectedValue(new Error("bucket indisponível"));

    const { ferramentaGerarDocumento } = await import("./gerar-documento");
    const resultado = await ferramentaGerarDocumento.executar({ userId: "user-1", companyId: "empresa-1", titulo: "X", conteudo: "y" });

    expect(resultado.sucesso).toBe(true);
    expect(sendWhatsappPdf).toHaveBeenCalled(); // documento já foi entregue ao cliente, apesar da falha no Storage
    expect(recordGeneratedDocument).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ storagePath: undefined }));
  });
});

describe("gerar_documento — conta sem WhatsApp vinculado (achado de auditoria 09/2026)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAdminClient.mockReturnValue({});
    listChannelsForUser.mockResolvedValue([]); // sem canal whatsapp nenhum — ex.: login só via Google no painel
    getProfile.mockResolvedValue({ full_name: "João" });
    getCompany.mockResolvedValue({ name: "Empresa Teste" });
    gerarPdfRelatorio.mockResolvedValue(PDF_BYTES);
    buildGeneratedDocumentStoragePath.mockReturnValue("empresa-1/generated/123-relatorio.pdf");
    uploadGeneratedDocumentFile.mockResolvedValue(undefined);
    recordGeneratedDocument.mockResolvedValue({ id: "doc-1" });
  });

  it("sem WhatsApp mas com Storage ok: sucede, nunca chama sendWhatsappPdf, aponta pro painel", async () => {
    const { ferramentaGerarDocumento } = await import("./gerar-documento");
    const resultado = await ferramentaGerarDocumento.executar({ userId: "user-1", companyId: "empresa-1", titulo: "X", conteudo: "y" });

    expect(resultado.sucesso).toBe(true);
    expect(resultado.enviado).toBe(false);
    expect(sendWhatsappPdf).not.toHaveBeenCalled();
    expect(uploadGeneratedDocumentFile).toHaveBeenCalled();
    expect(resultado.mensagemResumo).toContain("Documentos gerados");
    expect(recordGeneratedDocument).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ delivered: false, storagePath: "empresa-1/generated/123-relatorio.pdf" })
    );
  });

  it("sem WhatsApp e Storage falha: aqui SIM é uma falha real (não tinha nenhuma outra via de entrega)", async () => {
    uploadGeneratedDocumentFile.mockRejectedValue(new Error("bucket indisponível"));

    const { ferramentaGerarDocumento } = await import("./gerar-documento");
    const resultado = await ferramentaGerarDocumento.executar({ userId: "user-1", companyId: "empresa-1", titulo: "X", conteudo: "y" });

    expect(resultado.sucesso).toBe(false);
    expect(recordGeneratedDocument).not.toHaveBeenCalled();
  });
});
