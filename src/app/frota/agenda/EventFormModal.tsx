"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/hooks/useToast";
import type { GoogleCalendarEvent } from "@/lib/google/calendarClient";

const labelClass = "mb-1.5 block text-sm font-medium text-foreground";

interface EventFormModalProps {
  open: boolean;
  onClose: () => void;
  evento: GoogleCalendarEvent | null;
  onSaved: (evento: GoogleCalendarEvent) => void;
}

interface FormState {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
}

function toDateTimeLocal(iso: string | undefined): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function toFormState(evento: GoogleCalendarEvent | null): FormState {
  const inicio = toDateTimeLocal(evento?.start.dateTime ?? evento?.start.date);
  const fim = toDateTimeLocal(evento?.end.dateTime ?? evento?.end.date);
  return {
    title: evento?.summary ?? "",
    date: inicio.date,
    startTime: inicio.time || "08:00",
    endTime: fim.time || "09:00",
    location: evento?.location ?? "",
    description: evento?.description ?? "",
  };
}

function toIso(date: string, time: string): string {
  // Sem timezone explícito no literal — a API sempre recebe o timezone junto (America/Sao_Paulo, fixo no backend), então manda hora local "solta" mesmo.
  return `${date}T${time}:00`;
}

export function EventFormModal({ open, onClose, evento, onSaved }: EventFormModalProps) {
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(() => toFormState(evento));
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isEditing = evento !== null;

  const [syncedWith, setSyncedWith] = useState<GoogleCalendarEvent | null>(null);
  if (open && evento !== syncedWith) {
    setSyncedWith(evento);
    setForm(toFormState(evento));
    setFormError(null);
  } else if (!open && syncedWith !== null) {
    setSyncedWith(null);
  }

  function resetAndClose() {
    setForm(toFormState(null));
    setFormError(null);
    onClose();
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!form.title.trim() || !form.date || !form.startTime || !form.endTime) {
      setFormError("Título, data, início e fim são obrigatórios.");
      return;
    }
    if (form.endTime <= form.startTime) {
      setFormError("O fim precisa ser depois do início.");
      return;
    }

    const payload = {
      title: form.title,
      startIso: toIso(form.date, form.startTime),
      endIso: toIso(form.date, form.endTime),
      location: form.location || undefined,
      description: form.description || undefined,
    };

    setIsSaving(true);
    try {
      const response = await fetch(isEditing ? `/api/frota/agenda/${evento.id}` : "/api/frota/agenda", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        showToast({ title: "Não foi possível salvar", description: data.error ?? "Tente novamente.", variant: "error" });
        return;
      }

      showToast({ title: isEditing ? "Evento atualizado" : "Evento criado", variant: "success" });
      onSaved(data.evento);
      resetAndClose();
    } catch {
      showToast({ title: "Não foi possível salvar", description: "Verifique sua conexão e tente novamente.", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={resetAndClose} title={isEditing ? "Editar evento" : "Novo evento"} className="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="title" className={labelClass}>
            Título
          </label>
          <Input id="title" value={form.title} onChange={(e) => updateField("title", e.target.value)} placeholder="Ex.: Revisão da Scania" required />
        </div>

        <div>
          <label htmlFor="date" className={labelClass}>
            Data
          </label>
          <Input id="date" type="date" value={form.date} onChange={(e) => updateField("date", e.target.value)} required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="startTime" className={labelClass}>
              Início
            </label>
            <Input id="startTime" type="time" value={form.startTime} onChange={(e) => updateField("startTime", e.target.value)} required />
          </div>
          <div>
            <label htmlFor="endTime" className={labelClass}>
              Fim
            </label>
            <Input id="endTime" type="time" value={form.endTime} onChange={(e) => updateField("endTime", e.target.value)} required />
          </div>
        </div>

        <div>
          <label htmlFor="location" className={labelClass}>
            Local <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <Input id="location" value={form.location} onChange={(e) => updateField("location", e.target.value)} />
        </div>

        <div>
          <label htmlFor="description" className={labelClass}>
            Descrição <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <Textarea id="description" rows={3} value={form.description} onChange={(e) => updateField("description", e.target.value)} />
        </div>

        {formError && <p className="text-sm text-danger">{formError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={resetAndClose}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={isSaving}>
            {isEditing ? "Salvar alterações" : "Criar evento"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
