"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { GroupObservation } from "@/lib/frota/groupObservation";
import { observationStage } from "@/lib/frota/groupReview";
export function GroupQueueSummary() {
  const [events, setEvents] = useState<GroupObservation[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    let loading = false;
    async function refresh() {
      if (document.visibilityState !== "visible" || loading) return;
      loading = true;
      try {
        const r = await fetch("/api/frota/grupos/observacao", { cache: "no-store", signal: abort.signal });
        if (!r.ok) throw new Error("unavailable");
        const data = await r.json();
        if (!abort.signal.aborted) { setEvents(data.events); setError(false); }
      } catch { if (!abort.signal.aborted) setError(true); }
      finally { loading = false; }
    }
    void refresh(); const timer = setInterval(refresh, 20000);
    return () => { abort.abort(); clearInterval(timer); };
  }, []);
  if (error) return <p role="status" className="text-sm text-muted-foreground">Fila de recebimentos indisponível. Abra os grupos para conferir; isso não significa ausência de mensagens.</p>;
  if (!events) return <p className="text-sm text-muted-foreground">Consultando recebimentos…</p>;
  const pending = events.filter(e => observationStage(e).index !== 3);
  return <div className="rounded-lg border border-border p-3"><p className="text-sm"><strong>{pending.length}</strong> pendência(s) nos últimos {events.length} recebimentos consultados.</p><p className="text-xs text-muted-foreground">Até 100 mensagens recentes · não representa o histórico completo.</p>{pending.slice(0, 2).map(e => <p key={e.id} className="mt-2 line-clamp-2 text-sm">{observationStage(e).label}: {e.summary || "Interpretação pendente"}</p>)}<Link className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary" href="/frota/grupos">Revisar recebimentos →</Link></div>;
}
