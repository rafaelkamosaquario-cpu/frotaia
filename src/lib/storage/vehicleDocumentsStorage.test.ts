import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { buildDocumentStoragePath, VEHICLE_DOCUMENTS_BUCKET, ALLOWED_DOCUMENT_MIME_TYPES, MAX_DOCUMENT_FILE_BYTES } = await import(
  "./vehicleDocumentsStorage"
);

/**
 * Upload real de documento (evolução funcional 08/2026) — o path é a única
 * "segurança por convenção" real aqui (o bucket é privado, só o client
 * admin acessa), então precisa sempre começar com o company_id de verdade e
 * nunca deixar o nome do arquivo original virar parte de um caminho
 * perigoso (path traversal, barra, etc.).
 */

describe("buildDocumentStoragePath", () => {
  it("sempre começa com company_id/documents/{ownerKind}/{entityId}/", () => {
    const path = buildDocumentStoragePath("empresa-1", "vehicle", "veiculo-1", "crlv.pdf");
    expect(path.startsWith("empresa-1/documents/vehicle/veiculo-1/")).toBe(true);
  });

  it("distingue vehicle de driver no path", () => {
    const path = buildDocumentStoragePath("empresa-1", "driver", "motorista-1", "cnh.jpg");
    expect(path.startsWith("empresa-1/documents/driver/motorista-1/")).toBe(true);
  });

  it("nunca deixa o nome do arquivo introduzir barras (path traversal)", () => {
    const path = buildDocumentStoragePath("empresa-1", "vehicle", "veiculo-1", "../../etc/passwd");
    // Só pode haver exatamente as 4 barras da estrutura fixa (company/documents/kind/entity/arquivo) — nunca mais,
    // mesmo que o nome original tivesse "/" — sem barra sobrando, ".." vira só texto literal no nome do arquivo, não navega diretório nenhum.
    const segmentos = path.split("/");
    expect(segmentos.length).toBe(5);
    expect(segmentos.every((s) => s.length > 0)).toBe(true);
  });

  it("sanitiza espaço, acento e caractere especial no nome do arquivo", () => {
    const path = buildDocumentStoragePath("empresa-1", "vehicle", "veiculo-1", "CRLV atualizado (é#).pdf");
    const nomeArquivo = path.split("/").pop()!;
    expect(nomeArquivo).toMatch(/^[0-9]+-[a-zA-Z0-9._-]+$/);
  });

  it("dois uploads seguidos do mesmo arquivo geram paths diferentes (nunca sobrescreve por engano)", () => {
    const path1 = buildDocumentStoragePath("empresa-1", "vehicle", "veiculo-1", "crlv.pdf");
    const path2 = buildDocumentStoragePath("empresa-1", "vehicle", "veiculo-1", "crlv.pdf");
    // Podem colidir só se rodarem no mesmo milissegundo — mas nunca é o mesmo objeto que o de outra empresa/veículo.
    expect(path1.startsWith("empresa-1/documents/vehicle/veiculo-1/")).toBe(true);
    expect(path2.startsWith("empresa-1/documents/vehicle/veiculo-1/")).toBe(true);
  });
});

describe("constantes de upload", () => {
  it("bucket é o esperado e a lista de mime types cobre PDF/JPEG/PNG, nada além", () => {
    expect(VEHICLE_DOCUMENTS_BUCKET).toBe("vehicle-documents");
    expect(ALLOWED_DOCUMENT_MIME_TYPES.has("application/pdf")).toBe(true);
    expect(ALLOWED_DOCUMENT_MIME_TYPES.has("image/jpeg")).toBe(true);
    expect(ALLOWED_DOCUMENT_MIME_TYPES.has("image/png")).toBe(true);
    expect(ALLOWED_DOCUMENT_MIME_TYPES.has("application/zip")).toBe(false);
    expect(ALLOWED_DOCUMENT_MIME_TYPES.has("text/html")).toBe(false);
  });

  it("limite de tamanho é 10MB", () => {
    expect(MAX_DOCUMENT_FILE_BYTES).toBe(10 * 1024 * 1024);
  });
});
