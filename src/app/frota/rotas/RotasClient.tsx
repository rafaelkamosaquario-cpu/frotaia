"use client";

import { useMemo } from "react";
import { MapPin, Star } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { SavedRouteRow, VehicleRow } from "@/lib/supabase/tables";

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

export function RotasClient({ rotas, veiculos }: RotasClientProps) {
  const veiculosPorId = useMemo(() => new Map(veiculos.map((v) => [v.id, v])), [veiculos]);

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-foreground">Rotas salvas</h1>
        <p className="text-sm text-muted-foreground">{rotas.length} rota(s) salva(s) pelo WhatsApp</p>
      </div>

      {rotas.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={MapPin}
            title="Nenhuma rota salva ainda"
            description='Peça pelo WhatsApp "salva essa rota" depois de calcular um trajeto — as rotas frequentes aparecem aqui.'
          />
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Origem → Destino</th>
                <th className="px-4 py-3 font-medium">Veículo</th>
                <th className="px-4 py-3 font-medium text-right">Distância</th>
                <th className="px-4 py-3 font-medium text-right">Duração</th>
                <th className="px-4 py-3 font-medium text-right">Pedágio</th>
              </tr>
            </thead>
            <tbody>
              {rotas.map((rota) => {
                const veiculo = rota.vehicle_id ? veiculosPorId.get(rota.vehicle_id) : null;
                return (
                  <tr key={rota.id} className="border-b border-border last:border-0 hover:bg-surface-muted/50">
                    <td className="px-4 py-3 text-foreground">
                      <div className="flex items-center gap-1.5">
                        {rota.is_favorite && <Star className="size-3.5 fill-primary text-primary" aria-hidden />}
                        <span>
                          {nomeLocal(rota.origin_name, rota.origin_city, rota.origin_state)} → {nomeLocal(rota.destination_name, rota.destination_city, rota.destination_state)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{veiculo ? veiculo.name || veiculo.plate : "—"}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{rota.distance_km ? `${rota.distance_km} km` : "—"}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatDuracao(rota.estimated_duration_minutes)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatBRL(rota.estimated_toll_cost)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
