"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/hooks/useToast";
import type { GeneratedDocumentRow } from "@/lib/supabase/tables";

interface DocumentosGeradosClientProps {
  documentosIniciais: GeneratedDocumentRow[];
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

function origemDoDocumento(doc: GeneratedDocumentRow): string {
  return doc.analysis_run_id ? "Gerado a partir de uma análise" : "Relatório livre";
}

export function DocumentosGeradosClient({ documentosIniciais }: DocumentosGeradosClientProps) {
  const { showToast } = useToast();
  const [documentos] = useState(documentosIniciais);
  const [baixando, setBaixando] = useState<string | null>(null);

  async function baixar(documentoId: string) {
    setBaixando(documentoId);
    try {
      const response = await fetch(`/api/frota/documentos-gerados/${documentoId}/arquivo`);
      const data = await response.json();
      if (!response.ok) {
        showToast({ title: "Não foi possível abrir o documento", description: data.error, variant: "error" });
        return;
      }
      window.open(data.url, "_blank", "noopener,noreferrer");
    } finally {
      setBaixando(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Documentos gerados</h1>
        <p className="text-sm text-muted-foreground">Histórico de PDFs gerados pela IA (WhatsApp ou painel) — análises, relatórios e resumos que você já pediu.</p>
      </div>

      <Card className="p-4">
        {documentos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum documento gerado ainda. Peça pelo WhatsApp: &quot;gera um PDF dessa análise&quot;.</p>
        ) : (
          <div className="frota-table">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Título</th>
                  <th className="pb-2 pr-3 font-medium">Origem</th>
                  <th className="pb-2 pr-3 font-medium">Gerado em</th>
                  <th className="pb-2 pr-3 font-medium">Ação</th>
                </tr>
              </thead>
              <tbody>
                {documentos.map((doc) => (
                  <tr key={doc.id} className="border-b border-border last:border-0">
                    <td data-label="Título" className="py-3 pr-3">
                      <span className="font-medium text-foreground">{doc.title}</span>
                      <span className="block text-xs text-muted-foreground">{doc.file_name}</span>
                    </td>
                    <td data-label="Origem" className="py-3 pr-3 text-muted-foreground">
                      {origemDoDocumento(doc)}
                    </td>
                    <td data-label="Gerado em" className="py-3 pr-3 text-muted-foreground">
                      {formatarData(doc.created_at)}
                    </td>
                    <td data-label="Ação" className="py-3 pr-3">
                      {doc.storage_path ? (
                        <button
                          type="button"
                          disabled={baixando === doc.id}
                          onClick={() => baixar(doc.id)}
                          className="text-xs font-medium text-primary hover:underline disabled:opacity-60"
                        >
                          Visualizar / baixar
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground" title="Este documento foi gerado antes desta funcionalidade, ou o upload falhou na hora — só o registro ficou salvo.">
                          Arquivo não disponível
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
