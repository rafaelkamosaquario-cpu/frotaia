"use client";

import { useMemo } from "react";
import { AlertTriangle, Clock, Truck, Users, Wrench, WalletCards } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { DriverRow, ExpenseRow, MaintenanceScheduleRow, VehicleDocumentRow, VehicleRow } from "@/lib/supabase/tables";

interface DashboardClientProps {
  veiculos: VehicleRow[];
  motoristas: DriverRow[];
  manutencoes: MaintenanceScheduleRow[];
  documentos: VehicleDocumentRow[];
  /** Já vem filtrado aos últimos 30 dias — ver DashboardPage. */
  despesasRecentes: ExpenseRow[];
}

function formatBRL(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function diasAte(iso: string): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(`${iso}T00:00:00`);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
}

export function DashboardClient({ veiculos, motoristas, manutencoes, documentos, despesasRecentes }: DashboardClientProps) {
  const hojeIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const kpis = useMemo(() => {
    const veiculosAtivos = veiculos.filter((v) => v.active).length;
    const motoristasAtivos = motoristas.filter((m) => m.active).length;
    const manutencoesPendentes = manutencoes.filter((m) => m.status !== "concluido").length;
    const documentosVencidos = documentos.filter((d) => d.expiry_date && d.expiry_date < hojeIso).length;
    const documentosVencendo = documentos.filter(
      (d) => d.expiry_date && d.expiry_date >= hojeIso && diasAte(d.expiry_date) <= 30
    ).length;
    // Só aparece quando há dado real registrado — nunca número artificial pra preencher layout (ver plano de unificação V1+V2, item Dashboard).
    const custo30Dias = despesasRecentes.length > 0 ? despesasRecentes.reduce((soma, d) => soma + d.amount, 0) : null;

    return [
      { label: "Veículos ativos", value: veiculosAtivos, icon: Truck },
      { label: "Motoristas ativos", value: motoristasAtivos, icon: Users },
      { label: "Manutenções pendentes", value: manutencoesPendentes, icon: Wrench },
      { label: "Documentos vencidos", value: documentosVencidos, icon: AlertTriangle },
      { label: "Vencendo em 30 dias", value: documentosVencendo, icon: Clock },
      { label: "Custo nos últimos 30 dias", value: custo30Dias === null ? "—" : formatBRL(custo30Dias), icon: WalletCards },
    ];
  }, [veiculos, motoristas, manutencoes, documentos, despesasRecentes, hojeIso]);

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral da frota</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="flex flex-col gap-3 p-5">
            <div className="flex size-9 items-center justify-center rounded-full bg-surface-muted">
              <Icon className="size-4.5 text-muted-foreground" aria-hidden />
            </div>
            <div>
              <p className="text-2xl font-semibold text-foreground">{value}</p>
              <p className="text-sm text-muted-foreground">{label}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
