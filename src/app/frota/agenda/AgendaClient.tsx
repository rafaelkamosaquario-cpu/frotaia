"use client";

import { useMemo, useState } from "react";
import { Plus, Clock, MapPin, SquarePen, Trash2, ChevronLeft, ChevronRight, List, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import type { GoogleCalendarEvent } from "@/lib/google/calendarClient";
import { EventFormModal } from "./EventFormModal";

interface AgendaClientProps {
  eventosIniciais: GoogleCalendarEvent[];
}

type Visualizacao = "lista" | "mes";

function inicioDoEvento(evento: GoogleCalendarEvent): Date | null {
  const iso = evento.start.dateTime ?? evento.start.date;
  return iso ? new Date(iso) : null;
}

function formatarHora(evento: GoogleCalendarEvent): string {
  if (!evento.start.dateTime) return "Dia todo";
  const inicio = new Date(evento.start.dateTime);
  const fim = evento.end.dateTime ? new Date(evento.end.dateTime) : null;
  const hora = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return fim ? `${hora(inicio)} – ${hora(fim)}` : hora(inicio);
}

function chaveDia(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

function labelDia(data: Date): string {
  const hoje = new Date();
  const amanha = new Date(hoje.getTime() + 24 * 60 * 60 * 1000);
  if (chaveDia(data) === chaveDia(hoje)) return "Hoje";
  if (chaveDia(data) === chaveDia(amanha)) return "Amanhã";
  return data.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}

export function AgendaClient({ eventosIniciais }: AgendaClientProps) {
  const { showToast } = useToast();
  const [eventos, setEventos] = useState(eventosIniciais);
  const [visualizacao, setVisualizacao] = useState<Visualizacao>("lista");
  const [mesReferencia, setMesReferencia] = useState(() => new Date());
  const [isLoadingMes, setIsLoadingMes] = useState(false);
  const [formTarget, setFormTarget] = useState<GoogleCalendarEvent | null | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<GoogleCalendarEvent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const eventosPorDia = useMemo(() => {
    const grupos = new Map<string, GoogleCalendarEvent[]>();
    for (const evento of eventos) {
      const data = inicioDoEvento(evento);
      if (!data) continue;
      const chave = chaveDia(data);
      grupos.set(chave, [...(grupos.get(chave) ?? []), evento]);
    }
    return grupos;
  }, [eventos]);

  const diasOrdenados = useMemo(
    () =>
      [...eventosPorDia.entries()].sort(([a], [b]) => a.localeCompare(b)),
    [eventosPorDia]
  );

  function handleSaved(evento: GoogleCalendarEvent) {
    setEventos((prev) => {
      const existe = prev.some((e) => e.id === evento.id);
      return existe ? prev.map((e) => (e.id === evento.id ? evento : e)) : [...prev, evento];
    });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/frota/agenda/${deleteTarget.id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        showToast({ title: "Não foi possível excluir", description: data.error ?? "Tente novamente.", variant: "error" });
        return;
      }
      setEventos((prev) => prev.filter((e) => e.id !== deleteTarget.id));
      showToast({ title: "Evento excluído", variant: "success" });
    } catch {
      showToast({ title: "Não foi possível excluir", description: "Verifique sua conexão e tente novamente.", variant: "error" });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }

  async function navegarMes(delta: number) {
    const novoMes = new Date(mesReferencia.getFullYear(), mesReferencia.getMonth() + delta, 1);
    setMesReferencia(novoMes);
    setIsLoadingMes(true);
    try {
      const inicio = new Date(novoMes.getFullYear(), novoMes.getMonth(), 1);
      const fim = new Date(novoMes.getFullYear(), novoMes.getMonth() + 1, 0, 23, 59, 59);
      const response = await fetch(`/api/frota/agenda?from=${inicio.toISOString()}&to=${fim.toISOString()}`);
      const data = await response.json();
      if (response.ok) setEventos(data.eventos ?? []);
    } catch {
      // Best-effort: mês fica sem atualizar, usuário pode tentar de novo navegando.
    } finally {
      setIsLoadingMes(false);
    }
  }

  const diasDoMes = useMemo(() => {
    const primeiroDia = new Date(mesReferencia.getFullYear(), mesReferencia.getMonth(), 1);
    const ultimoDia = new Date(mesReferencia.getFullYear(), mesReferencia.getMonth() + 1, 0);
    const inicioGrade = new Date(primeiroDia);
    inicioGrade.setDate(inicioGrade.getDate() - primeiroDia.getDay());
    const dias: Date[] = [];
    const cursor = new Date(inicioGrade);
    while (cursor <= ultimoDia || cursor.getDay() !== 0) {
      dias.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
      if (dias.length > 42) break;
    }
    return dias;
  }, [mesReferencia]);

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Agenda</h1>
          <p className="text-sm text-muted-foreground">Google Calendar da empresa — o mesmo que o WhatsApp usa</p>
        </div>
        <Button onClick={() => setFormTarget(null)} className="gap-1.5">
          <Plus className="size-4" aria-hidden />
          Novo evento
        </Button>
      </div>

      <div className="mb-4 inline-flex w-fit gap-1 rounded-full border border-border p-0.5">
        <button
          type="button"
          onClick={() => setVisualizacao("lista")}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
            visualizacao === "lista" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <List className="size-3.5" aria-hidden />
          Lista
        </button>
        <button
          type="button"
          onClick={() => setVisualizacao("mes")}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
            visualizacao === "mes" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <CalendarDays className="size-3.5" aria-hidden />
          Mês
        </button>
      </div>

      {visualizacao === "lista" ? (
        diasOrdenados.length === 0 ? (
          <Card className="p-2">
            <EmptyState icon={CalendarDays} title="Nenhum evento nos próximos 30 dias" description="Crie um evento aqui ou peça pelo WhatsApp." />
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {diasOrdenados.map(([chave, doDia]) => (
              <div key={chave}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{labelDia(new Date(`${chave}T00:00:00`))}</p>
                <div className="flex flex-col gap-2">
                  {doDia
                    .sort((a, b) => (a.start.dateTime ?? "").localeCompare(b.start.dateTime ?? ""))
                    .map((evento) => (
                      <Card key={evento.id} className="flex items-start justify-between gap-3 p-3.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{evento.summary || "(Sem título)"}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="size-3" aria-hidden />
                              {formatarHora(evento)}
                            </span>
                            {evento.location && (
                              <span className="flex items-center gap-1 truncate">
                                <MapPin className="size-3 shrink-0" aria-hidden />
                                {evento.location}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => setFormTarget(evento)} aria-label="Editar">
                            <SquarePen className="size-3.5" aria-hidden />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8 text-danger" onClick={() => setDeleteTarget(evento)} aria-label="Excluir">
                            <Trash2 className="size-3.5" aria-hidden />
                          </Button>
                        </div>
                      </Card>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => navegarMes(-1)} aria-label="Mês anterior">
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <p className="text-sm font-medium text-foreground">
              {mesReferencia.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
              {isLoadingMes && <span className="ml-2 text-xs text-muted-foreground">carregando…</span>}
            </p>
            <Button variant="ghost" size="icon" onClick={() => navegarMes(1)} aria-label="Próximo mês">
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase text-muted-foreground">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {diasDoMes.map((dia) => {
              const doMesAtual = dia.getMonth() === mesReferencia.getMonth();
              const doDia = eventosPorDia.get(chaveDia(dia)) ?? [];
              return (
                <Card
                  key={dia.toISOString()}
                  className={cn("min-h-16 p-1.5 sm:min-h-20", !doMesAtual && "opacity-40")}
                >
                  <p className="text-[11px] font-medium text-muted-foreground">{dia.getDate()}</p>
                  {doDia.length > 0 && (
                    <button type="button" onClick={() => setFormTarget(doDia[0])} className="mt-1 block w-full truncate rounded bg-primary/10 px-1 py-0.5 text-left text-[10px] text-primary">
                      {doDia.length === 1 ? doDia[0].summary || "Evento" : `${doDia.length} eventos`}
                    </button>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <EventFormModal open={formTarget !== undefined} onClose={() => setFormTarget(undefined)} evento={formTarget ?? null} onSaved={handleSaved} />

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Excluir evento"
        description={`Tem certeza que deseja excluir "${deleteTarget?.summary || "este evento"}"? Isso remove o evento do Google Calendar também.`}
        confirmLabel={isDeleting ? "Excluindo..." : "Excluir"}
        variant="danger"
      />
    </div>
  );
}
