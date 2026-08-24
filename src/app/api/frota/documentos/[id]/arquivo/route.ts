import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { getVehicleDocument, attachDocumentFile, removeDocumentFile } from "@/services/supabase/vehicleDocumentService";
import {
  buildDocumentStoragePath,
  uploadDocumentFile,
  deleteDocumentFile,
  createSignedDocumentUrl,
  ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_DOCUMENT_FILE_BYTES,
} from "@/lib/storage/vehicleDocumentsStorage";

/**
 * Upload/visualização/remoção do arquivo anexado a um documento (Rodada 1,
 * evolução funcional 08/2026). O documento (metadados: tipo, dono, vencimento)
 * precisa já existir — este endpoint só cuida do arquivo em si. Bucket
 * privado, todo acesso passa pelo client admin (ver lib/storage/
 * vehicleDocumentsStorage.ts) — leitura/escrita nunca expõem o storage_path
 * bruto ao navegador, só URLs assinadas de 60s ou o upload em si.
 */

function statusForAccessReason(reason: "unauthenticated" | "no_company" | "not_entitled") {
  return reason === "unauthenticated" ? 401 : 403;
}

function ownerKindAndEntityId(documento: { vehicle_id: string | null; driver_id: string | null }): { ownerKind: "vehicle" | "driver"; entityId: string } {
  if (documento.vehicle_id) return { ownerKind: "vehicle", entityId: documento.vehicle_id };
  return { ownerKind: "driver", entityId: documento.driver_id! };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const documento = await getVehicleDocument(supabase, id, access.company.id);
  if (!documento) {
    return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  }

  const formData = await request.formData().catch(() => null);
  const arquivo = formData?.get("file");
  if (!formData || !(arquivo instanceof File)) {
    return NextResponse.json({ error: "Envie um arquivo no campo 'file'." }, { status: 400 });
  }
  if (!ALLOWED_DOCUMENT_MIME_TYPES.has(arquivo.type)) {
    return NextResponse.json({ error: "Formato não suportado — use PDF, JPG ou PNG." }, { status: 400 });
  }
  if (arquivo.size > MAX_DOCUMENT_FILE_BYTES) {
    return NextResponse.json({ error: `Arquivo maior que o limite de ${MAX_DOCUMENT_FILE_BYTES / (1024 * 1024)}MB.` }, { status: 400 });
  }

  const admin = createAdminClient();
  const { ownerKind, entityId } = ownerKindAndEntityId(documento);
  const path = buildDocumentStoragePath(access.company.id, ownerKind, entityId, arquivo.name);
  const bytes = new Uint8Array(await arquivo.arrayBuffer());

  await uploadDocumentFile(admin, path, bytes, arquivo.type);

  // Substituir arquivo: remove o objeto antigo depois que o novo já subiu com sucesso (nunca antes — evita ficar sem nenhum arquivo se o upload novo falhar).
  const pathAntigo = documento.storage_path;
  const atualizado = await attachDocumentFile(admin, id, access.company.id, {
    storagePath: path,
    originalFilename: arquivo.name,
    mimeType: arquivo.type,
    fileSize: arquivo.size,
  });
  if (pathAntigo && pathAntigo !== path) {
    await deleteDocumentFile(admin, pathAntigo).catch(() => {
      // Best-effort: o metadado já aponta pro arquivo novo (correto); um objeto órfão no bucket não é um problema de segurança nem de dado.
    });
  }

  return NextResponse.json({ documento: atualizado });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const documento = await getVehicleDocument(supabase, id, access.company.id);
  if (!documento || !documento.storage_path) {
    return NextResponse.json({ error: "Nenhum arquivo anexado a este documento." }, { status: 404 });
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  const admin = createAdminClient();
  const url = await createSignedDocumentUrl(admin, documento.storage_path, {
    downloadFilename: download ? (documento.original_filename ?? "documento") : undefined,
  });

  return NextResponse.json({ url });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const documento = await getVehicleDocument(supabase, id, access.company.id);
  if (!documento || !documento.storage_path) {
    return NextResponse.json({ error: "Nenhum arquivo anexado a este documento." }, { status: 404 });
  }

  const admin = createAdminClient();
  await deleteDocumentFile(admin, documento.storage_path);
  const atualizado = await removeDocumentFile(admin, id, access.company.id);

  return NextResponse.json({ documento: atualizado });
}
