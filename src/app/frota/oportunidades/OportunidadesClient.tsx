"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import type { FreightRadarRow, FreightSourceRow, VehicleRow } from "@/lib/supabase/tables";
import type { MatchComOportunidade } from "@/services/supabase/freightMatchService";
import { ContextualHelp } from "@/components/frota/ContextualHelp";

type OportunidadeComDetalhes = MatchComOportunidade & { detalhes: string[] };

interface PreAnaliseResumo {
  custoTotal?: number;
  margemPercentual?: number;
}

interface OportunidadesClientProps {
  radaresIniciais: FreightRadarRow[];
  oportunidadesIniciais: OportunidadeComDetalhes[];
  fontesIniciais: FreightSourceRow[];
  veiculos: VehicleRow[];
  podeEditar: boolean;
  modoAnaliseInicial: string;
}

const STATUS_LABEL: Record<string, string> = {
  new: "Novo",
  notified: "Notificado",
  viewed: "Visto",
  analyzed: "Analisado",
  favorited: "Favorito",
  ignored: "Ignorado",
  expired: "Expirado",
};

const RADAR_STATUS_LABEL: Record<string, string> = {
  active: "Ativo",
  paused: "Pausado",
  expired: "Expirado",
  cancelled: "Cancelado",
};

function formatarReais(valor: number | null): string {
  if (valor === null) return "valor não informado";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function OportunidadesClient({ radaresIniciais, oportunidadesIniciais, fontesIniciais, veiculos, podeEditar, modoAnaliseInicial }: OportunidadesClientProps) {
  const { showToast } = useToast();
  const [radares, setRadares] = useState(radaresIniciais);
  const [oportunidades, setOportunidades] = useState(oportunidadesIniciais);
  const [fontes, setFontes] = useState(fontesIniciais);
  const [carregando, setCarregando] = useState<string | null>(null);
  const [modoAnalise, setModoAnalise] = useState(modoAnaliseInicial === "analise_automatica" ? "analise_automatica" : "avisar_primeiro");
  const [analises, setAnalises] = useState<Record<string, PreAnaliseResumo | null>>({});

  const [novoRadar, setNovoRadar] = useState({ origemCidade: "", origemUf: "", destinoCidade: "", destinoUf: "", veiculoId: "" });
  const [novaFonteId, setNovaFonteId] = useState("");

  async function mudarModoAnalise(novoModo: "avisar_primeiro" | "analise_automatica") {
    const modoAnterior = modoAnalise;
    setModoAnalise(novoModo);
    setCarregando("modo-analise");
    try {
      const response = await fetch("/api/frota/configuracoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ freightRadarAnalysisMode: novoModo }),
      });
      if (!response.ok) {
        setModoAnalise(modoAnterior);
        const data = await response.json();
        showToast({ title: "Não foi possível salvar a preferência", description: data.error, variant: "error" });
        return;
      }
      showToast({ title: "Preferência salva", variant: "success" });
    } finally {
      setCarregando(null);
    }
  }

  async function criarRadar() {
    if (!novoRadar.origemCidade && !novoRadar.origemUf) {
      showToast({ title: "Informe ao menos a origem", variant: "error" });
      return;
    }
    setCarregando("criar-radar");
    try {
      const response = await fetch("/api/frota/radares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originCity: novoRadar.origemCidade || undefined,
          originState: novoRadar.origemUf || undefined,
          destinationCity: novoRadar.destinoCidade || undefined,
          destinationState: novoRadar.destinoUf || undefined,
          vehicleId: novoRadar.veiculoId || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        showToast({ title: "Não foi possível criar o radar", description: data.error, variant: "error" });
        return;
      }
      setRadares((atual) => [data.radar, ...atual]);
      setNovoRadar({ origemCidade: "", origemUf: "", destinoCidade: "", destinoUf: "", veiculoId: "" });
      showToast({ title: "Radar criado", variant: "success" });
    } finally {
      setCarregando(null);
    }
  }

  async function mudarStatusRadar(radarId: string, status: "active" | "paused" | "cancelled") {
    setCarregando(`radar-${radarId}`);
    try {
      const response = await fetch(`/api/frota/radares/${radarId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) {
        showToast({ title: "Não foi possível atualizar o radar", description: data.error, variant: "error" });
        return;
      }
      setRadares((atual) => atual.map((r) => (r.id === radarId ? data.radar : r)));
    } finally {
      setCarregando(null);
    }
  }

  async function agirNaOportunidade(matchId: string, body: Record<string, unknown>) {
    setCarregando(`oportunidade-${matchId}`);
    try {
      const response = await fetch(`/api/frota/oportunidades/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        showToast({ title: "Não foi possível concluir a ação", description: data.error, variant: "error" });
        return;
      }
      const matchAtualizado = data.match;
      setOportunidades((atual) => atual.map((o) => (o.id === matchId ? { ...o, ...matchAtualizado } : o)));
      if (body.acao === "analisar") {
        setAnalises((atual) => ({ ...atual, [matchId]: data.preAnalise ?? null }));
      }
      showToast({ title: "Feito", variant: "success" });
    } finally {
      setCarregando(null);
    }
  }

  async function adicionarFonte() {
    if (!novaFonteId.trim()) return;
    setCarregando("nova-fonte");
    try {
      const response = await fetch("/api/frota/fontes-radar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupExternalId: novaFonteId.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        showToast({ title: "Não foi possível adicionar o grupo", description: data.error, variant: "error" });
        return;
      }
      setFontes((atual) => [data.fonte, ...atual]);
      setNovaFonteId("");
      showToast({ title: "Grupo autorizado", variant: "success" });
    } finally {
      setCarregando(null);
    }
  }

  async function alternarFonte(fonteId: string, enabled: boolean) {
    setCarregando(`fonte-${fonteId}`);
    try {
      const response = await fetch(`/api/frota/fontes-radar/${fonteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await response.json();
      if (!response.ok) {
        showToast({ title: "Não foi possível atualizar", description: data.error, variant: "error" });
        return;
      }
      setFontes((atual) => atual.map((f) => (f.id === fonteId ? data.fonte : f)));
    } finally {
      setCarregando(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">⚡ Oportunidades</h1>
          <p className="text-sm text-muted-foreground">Radar de Fretes — buscas ativas e cargas encontradas compatíveis com seus veículos.</p>
        </div>
        <ContextualHelp topic="radar" />
      </div>

      {podeEditar && (
        <Card className="p-4">
          <h2 className="mb-1 text-sm font-semibold text-foreground">Como quer receber oportunidades?</h2>
          <p className="mb-3 text-xs text-muted-foreground">Vale pra todos os radares desta empresa.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={carregando === "modo-analise"}
              onClick={() => mudarModoAnalise("avisar_primeiro")}
              className={cn(
                "rounded-lg border p-3 text-left text-sm transition-colors",
                modoAnalise === "avisar_primeiro" ? "border-primary bg-primary/5" : "border-border"
              )}
            >
              <span className="font-medium text-foreground">Avisar primeiro</span>
              <p className="mt-1 text-xs text-muted-foreground">Assim que uma carga compatível aparecer, você recebe o aviso no WhatsApp e decide se quer a análise completa.</p>
            </button>
            <button
              type="button"
              disabled={carregando === "modo-analise"}
              onClick={() => mudarModoAnalise("analise_automatica")}
              className={cn(
                "rounded-lg border p-3 text-left text-sm transition-colors",
                modoAnalise === "analise_automatica" ? "border-primary bg-primary/5" : "border-border"
              )}
            >
              <span className="font-medium text-foreground">Analisar antes de avisar</span>
              <p className="mt-1 text-xs text-muted-foreground">O Frota IA já manda uma estimativa de custo e margem junto com o aviso, quando tiver dado suficiente pra calcular.</p>
            </button>
          </div>
        </Card>
      )}

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Radares ativos</h2>

        {podeEditar && (
          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Origem (cidade)</label>
              <input className="h-9 w-32 rounded-lg border border-border bg-surface px-2 text-sm" value={novoRadar.origemCidade} onChange={(e) => setNovoRadar((r) => ({ ...r, origemCidade: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">UF origem</label>
              <input className="h-9 w-16 rounded-lg border border-border bg-surface px-2 text-sm uppercase" maxLength={2} value={novoRadar.origemUf} onChange={(e) => setNovoRadar((r) => ({ ...r, origemUf: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Destino (cidade)</label>
              <input className="h-9 w-32 rounded-lg border border-border bg-surface px-2 text-sm" value={novoRadar.destinoCidade} onChange={(e) => setNovoRadar((r) => ({ ...r, destinoCidade: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">UF destino</label>
              <input className="h-9 w-16 rounded-lg border border-border bg-surface px-2 text-sm uppercase" maxLength={2} value={novoRadar.destinoUf} onChange={(e) => setNovoRadar((r) => ({ ...r, destinoUf: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Veículo</label>
              <select className="h-9 rounded-lg border border-border bg-surface px-2 text-sm" value={novoRadar.veiculoId} onChange={(e) => setNovoRadar((r) => ({ ...r, veiculoId: e.target.value }))}>
                <option value="">Sem veículo</option>
                {veiculos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name || v.plate || v.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={carregando === "criar-radar"}
              onClick={criarRadar}
              className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              Criar radar
            </button>
          </div>
        )}

        {radares.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum radar criado ainda.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {radares.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="text-sm">
                  <span className="font-medium text-foreground">
                    {[r.origin_city, r.origin_state].filter(Boolean).join(" - ") || "qualquer origem"} → {[r.destination_city, r.destination_state].filter(Boolean).join(" - ") || r.destination_region_label || "qualquer destino"}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">expira em {r.expires_at.slice(0, 10)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", r.status === "active" ? "bg-success/10 text-success" : "bg-surface-muted text-muted-foreground")}>{RADAR_STATUS_LABEL[r.status]}</span>
                  {podeEditar && r.status === "active" && (
                    <button type="button" disabled={carregando === `radar-${r.id}`} onClick={() => mudarStatusRadar(r.id, "paused")} className="text-xs text-primary hover:underline">
                      Pausar
                    </button>
                  )}
                  {podeEditar && r.status === "paused" && (
                    <button type="button" disabled={carregando === `radar-${r.id}`} onClick={() => mudarStatusRadar(r.id, "active")} className="text-xs text-primary hover:underline">
                      Reativar
                    </button>
                  )}
                  {podeEditar && (r.status === "active" || r.status === "paused") && (
                    <button type="button" disabled={carregando === `radar-${r.id}`} onClick={() => mudarStatusRadar(r.id, "cancelled")} className="text-xs text-danger hover:underline">
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Oportunidades encontradas</h2>
        {oportunidades.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma oportunidade ainda — crie um radar acima pra começar a receber avisos.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {oportunidades.map((o) => (
              <div key={o.id} className="rounded-lg border border-border p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {[o.opportunity.origin_city, o.opportunity.origin_state].filter(Boolean).join(" - ") || "origem não informada"} → {[o.opportunity.destination_city, o.opportunity.destination_state].filter(Boolean).join(" - ") || "destino não informado"}
                  </span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{o.compatibility_score}% compatível</span>
                </div>
                <p className="mb-2 text-xs text-muted-foreground">
                  {formatarReais(o.opportunity.freight_value_cents ? o.opportunity.freight_value_cents / 100 : null)}
                  {o.opportunity.weight_kg ? ` · ${(o.opportunity.weight_kg / 1000).toLocaleString("pt-BR")} t` : ""}
                  {o.opportunity.body_type ? ` · ${o.opportunity.body_type}` : ""}
                  {" · "}
                  {STATUS_LABEL[o.status] ?? o.status}
                </p>
                {o.detalhes.length > 0 && (
                  <ul className="mb-2 flex flex-col gap-0.5 text-xs text-muted-foreground">
                    {o.detalhes.map((linha, i) => (
                      <li key={i}>• {linha}</li>
                    ))}
                  </ul>
                )}
                {analises[o.id] !== undefined && (
                  <div className="mb-2 rounded-lg bg-surface-muted p-2 text-xs">
                    {analises[o.id] === null ? (
                      <span className="text-muted-foreground">Não foi possível estimar custo/margem — faltam dados de consumo ou preço de combustível no cadastro do veículo.</span>
                    ) : (
                      <span className="text-foreground">
                        Custo estimado: {formatarReais(analises[o.id]!.custoTotal ?? null)}
                        {analises[o.id]!.margemPercentual !== undefined ? ` · Margem estimada: ${analises[o.id]!.margemPercentual!.toFixed(0)}%` : ""}
                      </span>
                    )}
                  </div>
                )}
                <div className="flex gap-3">
                  <button type="button" disabled={carregando === `oportunidade-${o.id}`} onClick={() => agirNaOportunidade(o.id, { acao: "analisar" })} className="text-xs font-medium text-primary hover:underline">
                    Analisar
                  </button>
                  <button type="button" disabled={carregando === `oportunidade-${o.id}`} onClick={() => agirNaOportunidade(o.id, { status: "favorited" })} className="text-xs font-medium text-warning hover:underline">
                    Favoritar
                  </button>
                  <button type="button" disabled={carregando === `oportunidade-${o.id}`} onClick={() => agirNaOportunidade(o.id, { status: "ignored" })} className="text-xs text-muted-foreground hover:underline">
                    Ignorar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {podeEditar && (
        <Card className="p-4">
          <h2 className="mb-1 text-sm font-semibold text-foreground">Fontes do Radar</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Hoje o Radar só busca oportunidades em grupos de WhatsApp (com o número do Frota IA dentro) — sem integração com Fretebras, Truckpad ou outras
            plataformas ainda. Pegue o id do grupo com o Frota IA (suporte).
          </p>
          <div className="mb-3 flex items-center gap-2">
            <input className="h-9 flex-1 rounded-lg border border-border bg-surface px-2 text-sm" placeholder="Id do grupo (ex.: 1203...-group)" value={novaFonteId} onChange={(e) => setNovaFonteId(e.target.value)} />
            <button type="button" disabled={carregando === "nova-fonte"} onClick={adicionarFonte} className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">
              Adicionar
            </button>
          </div>
          {fontes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum grupo autorizado ainda.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {fontes.map((f) => (
                <div key={f.id} className="flex items-center justify-between rounded-lg border border-border p-2 text-sm">
                  <span>{f.group_name || f.group_external_id}</span>
                  <button type="button" disabled={carregando === `fonte-${f.id}`} onClick={() => alternarFonte(f.id, !f.enabled)} className={cn("text-xs font-medium", f.enabled ? "text-success" : "text-muted-foreground")}>
                    {f.enabled ? "Ativo" : "Desativado"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
