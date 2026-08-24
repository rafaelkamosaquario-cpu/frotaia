"use client";

import { useMemo, useState } from "react";
import { MapPin, Star, SquarePen, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/hooks/useToast";
import type { SavedRouteRow, VehicleRow } from "@/lib/supabase/tables";
import { RouteFormModal } from "./RouteFormModal";

interface RotasClientProps {
  rotas: SavedRouteRow[];
  veiculos: VehicleRow[];
}

function nomeLocal(nome: string | null, cidade: string | null, uf: string | null): string {
  if (nome) return nome;
  if (cidade && uf) return `${cidade}, ${uf}`;
  if (cidade) return cidade;
  return "—";
}

function formatDuracao(minutos: number | null): string {
  if (!minutos) return "—";
  const horas = Math.floor(minutos / 60);
  const restoMinutos = minutos % 60;
  return horas > 0 ? `${horas}h${restoMinutos > 0 ? `${restoMinutos}min` : ""}` : `${restoMinutos}min`;
}

function formatBRL(valor: number | null): string {
  if (valor === null) return "—";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function RotasClient({ rotas: rotasIniciais, veiculos }: RotasClientProps) {
  const { showToast } = useToast();
  const [rotas, setRotas] = useState(rotasIniciais);
  const [formTarget, setFormTarget] = useState<SavedRouteRow | null | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<SavedRouteRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [favoritando, setFavoritando] = useState<string | null>(null);

  const veiculosPorId = useMemo(() => new Map(veiculos.map((v) => [v.id, v])), [veiculos]);
  const veiculosAtivos = useMemo(() => veiculos.filter((v) => v.active), [veiculos]);

  function handleSaved(rota: SavedRouteRow) {
    setRotas((prev) => {
      const existe = prev.some((r) => r.id === rota.id);
      const proxima = existe ? prev.map((r) => (r.id === rota.id ? rota : r)) : [rota, ...prev];
      return [...proxima].sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite) || (a.name ?? "").localeCompare(b.name ?? ""));
    });
  }

  async function handleFavoritar(rota: SavedRouteRow) {
    setFavoritando(rota.id);
    try {
      const response = await fetch(`/api/frota/rotas/${rota.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: !rota.is_favorite }),
      });
      const data = await response.json();
      if (!response.ok) {
        showToast({ title: "Não foi possível favoritar", description: data.error ?? "Tente novamente.", variant: "error" });
        return;
      }
      handleSaved(data.rota);
    } catch {
      showToast({ title: "Não foi possível favoritar", description: "Verifique sua conexão e tente novamente.", variant: "error" });
    } finally {
      setFavoritando(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/frota/rotas/${deleteTarget.id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        showToast({ title: "Não foi possível remover", description: data.error ?? "Tente novamente.", variant: "error" });
        return;
      }
      setRotas((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      showToast({ title: "Rota removida", variant: "success" });
    } catch {
      showToast({ title: "Não foi possível remover", description: "Verifique sua conexão e tente novamente.", variant: "error" });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Rotas salvas</h1>
          <p className="text-sm text-muted-foreground">{rotas.length} rota(s) salva(s)</p>
        </div>
        <Button onClick={() => setFormTarget(null)} className="gap-1.5">
          <Plus className="size-4" aria-hidden />
          Nova rota
        </Button>
      </div>

      {rotas.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={MapPin}
            title="Nenhuma rota salva ainda"
            description='Cadastre uma rota aqui ou peça pelo WhatsApp "salva essa rota" depois de calcular um trajeto.'
          >
            <Button className="mt-4" onClick={() => setFormTarget(null)}>
              Cadastrar rota
            </Button>
          </EmptyState>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="frota-table w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Origem → Destino</th>
                <th className="px-4 py-3 font-medium">Veículo</th>
                <th className="px-4 py-3 font-medium text-right">Distância</th>
                <th className="px-4 py-3 font-medium text-right">Duração</th>
                <th className="px-4 py-3 font-medium text-right">Pedágio</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rotas.map((rota) => {
                const veiculo = rota.vehicle_id ? veiculosPorId.get(rota.vehicle_id) : null;
                return (
                  <tr key={rota.id} className="border-b border-border last:border-0 hover:bg-surface-muted/50">
                    <td data-label="Origem → Destino" className="px-4 py-3 text-foreground">
                      <button
                        type="button"
                        onClick={() => handleFavoritar(rota)}
                        disabled={favoritando === rota.id}
                        className="mr-1.5 inline-flex align-middle text-muted-foreground hover:text-primary"
                        aria-label={rota.is_favorite ? "Remover dos favoritos" : "Marcar como favorita"}
                      >
                        <Star className={rota.is_favorite ? "size-3.5 fill-primary text-primary" : "size-3.5"} aria-hidden />
                      </button>
                      {nomeLocal(rota.origin_name, rota.origin_city, rota.origin_state)} → {nomeLocal(rota.destination_name, rota.destination_city, rota.destination_state)}
                    </td>
                    <td data-label="Veículo" className="px-4 py-3 text-muted-foreground">{veiculo ? veiculo.name || veiculo.plate : "—"}</td>
                    <td data-label="Distância" className="px-4 py-3 text-right text-muted-foreground">{rota.distance_km ? `${rota.distance_km} km` : "—"}</td>
                    <td data-label="Duração" className="px-4 py-3 text-right text-muted-foreground">{formatDuracao(rota.estimated_duration_minutes)}</td>
                    <td data-label="Pedágio" className="px-4 py-3 text-right text-muted-foreground">{formatBRL(rota.estimated_toll_cost)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setFormTarget(rota)}>
                          <SquarePen className="size-3.5" aria-hidden />
                          Editar
                        </Button>
                        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setDeleteTarget(rota)}>
                          <Trash2 className="size-3.5" aria-hidden />
                          Remover
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <RouteFormModal open={formTarget !== undefined} onClose={() => setFormTarget(undefined)} route={formTarget ?? null} veiculos={veiculosAtivos} onSaved={handleSaved} />

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remover rota"
        description={`Tem certeza que deseja remover "${deleteTarget ? nomeLocal(deleteTarget.name, deleteTarget.origin_city, deleteTarget.origin_state) : ""}"? Ela deixa de aparecer na lista, mas o histórico é preservado.`}
        confirmLabel={isDeleting ? "Removendo..." : "Remover"}
        variant="danger"
      />
    </div>
  );
}
