"use client";

import { useMemo, useState } from "react";
import { FileText, SquarePen, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { DriverRow, VehicleDocumentRow, VehicleDocumentTypeEnum, VehicleRow } from "@/lib/supabase/tables";
import { DocumentFormModal } from "./DocumentFormModal";

interface DocumentosClientProps {
  documentosIniciais: VehicleDocumentRow[];
  veiculos: VehicleRow[];
  motoristas: DriverRow[];
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

const DOCUMENT_TYPE_LABEL: Record<VehicleDocumentTypeEnum, string> = {
  tacografo: "Tacógrafo",
  rntrc: "RNTRC",
  seguro: "Seguro",
  licenciamento: "Licenciamento",
  cnh: "CNH",
  toxicologico: "Toxicológico",
};

export function DocumentosClient({ documentosIniciais, veiculos, motoristas }: DocumentosClientProps) {
  const [documentos, setDocumentos] = useState(documentosIniciais);
  const [formTarget, setFormTarget] = useState<VehicleDocumentRow | null | undefined>(undefined);

  const veiculosPorId = useMemo(() => new Map(veiculos.map((v) => [v.id, v])), [veiculos]);
  const motoristasPorId = useMemo(() => new Map(motoristas.map((m) => [m.id, m])), [motoristas]);
  const veiculosAtivos = useMemo(() => veiculos.filter((v) => v.active), [veiculos]);
  const motoristasAtivos = useMemo(() => motoristas.filter((m) => m.active), [motoristas]);

  function handleSaved(documento: VehicleDocumentRow) {
    setDocumentos((prev) => {
      const existe = prev.some((d) => d.id === documento.id);
      const proxima = existe ? prev.map((d) => (d.id === documento.id ? documento : d)) : [documento, ...prev];
      return [...proxima].sort((a, b) => (a.expiry_date ?? "9999-99-99").localeCompare(b.expiry_date ?? "9999-99-99"));
    });
  }

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Documentos</h1>
          <p className="text-sm text-muted-foreground">{documentos.length} documento(s) cadastrado(s)</p>
        </div>
        <Button onClick={() => setFormTarget(null)} className="gap-1.5">
          <SquarePen className="size-4" aria-hidden />
          Novo documento
        </Button>
      </div>

      {documentos.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={FileText}
            title="Nenhum documento cadastrado"
            description="Cadastre o primeiro documento da frota pra começar."
          >
            <Button className="mt-4" onClick={() => setFormTarget(null)}>
              Cadastrar documento
            </Button>
          </EmptyState>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="frota-table w-full min-w-[800px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Veículo</th>
                <th className="px-4 py-3 font-medium">Motorista</th>
                <th className="px-4 py-3 font-medium">Vencimento</th>
                <th className="px-4 py-3 font-medium">Arquivo</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {documentos.map((documento) => {
                const veiculo = documento.vehicle_id ? veiculosPorId.get(documento.vehicle_id) : null;
                const motorista = documento.driver_id ? motoristasPorId.get(documento.driver_id) : null;
                return (
                  <tr key={documento.id} className="border-b border-border last:border-0 hover:bg-surface-muted/50">
                    <td data-label="Tipo" className="px-4 py-3 font-medium text-foreground">{DOCUMENT_TYPE_LABEL[documento.document_type]}</td>
                    <td data-label="Veículo" className="px-4 py-3 text-muted-foreground">{veiculo ? veiculo.name || veiculo.plate : "—"}</td>
                    <td data-label="Motorista" className="px-4 py-3 text-muted-foreground">{motorista ? motorista.name : "—"}</td>
                    <td data-label="Vencimento" className="px-4 py-3 text-muted-foreground">{formatDate(documento.expiry_date)}</td>
                    <td data-label="Arquivo" className="px-4 py-3 text-muted-foreground">
                      {documento.storage_path ? (
                        <span className="inline-flex items-center gap-1.5 text-success">
                          <Paperclip className="size-3.5" aria-hidden />
                          Anexado
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setFormTarget(documento)}>
                        <SquarePen className="size-3.5" aria-hidden />
                        Editar
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <DocumentFormModal
        open={formTarget !== undefined}
        onClose={() => setFormTarget(undefined)}
        document={formTarget ?? null}
        veiculosAtivos={veiculosAtivos}
        motoristasAtivos={motoristasAtivos}
        onSaved={handleSaved}
      />
    </div>
  );
}
