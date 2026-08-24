"use client";

import { useState } from "react";
import { Loader2, MapPinned } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";
import { savedRouteCreateSchema, savedRouteUpdateSchema } from "@/lib/validation/schemas";
import type { SavedRouteRow, VehicleRow } from "@/lib/supabase/tables";

const selectClass = cn(
  "flex h-10 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent"
);

const labelClass = "mb-1.5 block text-sm font-medium text-foreground";

interface RouteFormModalProps {
  open: boolean;
  onClose: () => void;
  route: SavedRouteRow | null;
  veiculos: VehicleRow[];
  onSaved: (route: SavedRouteRow) => void;
}

interface FormState {
  vehicleId: string;
  name: string;
  originCity: string;
  originState: string;
  destinationCity: string;
  destinationState: string;
  distanceKm: string;
  estimatedDurationMinutes: string;
  estimatedTollCost: string;
}

function toFormState(route: SavedRouteRow | null): FormState {
  return {
    vehicleId: route?.vehicle_id ?? "",
    name: route?.name ?? "",
    originCity: route?.origin_city ?? "",
    originState: route?.origin_state ?? "",
    destinationCity: route?.destination_city ?? "",
    destinationState: route?.destination_state ?? "",
    distanceKm: route?.distance_km != null ? String(route.distance_km) : "",
    estimatedDurationMinutes: route?.estimated_duration_minutes != null ? String(route.estimated_duration_minutes) : "",
    estimatedTollCost: route?.estimated_toll_cost != null ? String(route.estimated_toll_cost) : "",
  };
}

function toPayload(form: FormState): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (form.vehicleId) payload.vehicleId = form.vehicleId;
  if (form.name) payload.name = form.name;
  if (form.originCity) payload.originCity = form.originCity;
  if (form.originState) payload.originState = form.originState.toUpperCase();
  if (form.destinationCity) payload.destinationCity = form.destinationCity;
  if (form.destinationState) payload.destinationState = form.destinationState.toUpperCase();
  if (form.distanceKm) payload.distanceKm = Number(form.distanceKm);
  if (form.estimatedDurationMinutes) payload.estimatedDurationMinutes = Number(form.estimatedDurationMinutes);
  if (form.estimatedTollCost) payload.estimatedTollCost = Number(form.estimatedTollCost);
  return payload;
}

export function RouteFormModal({ open, onClose, route, veiculos, onSaved }: RouteFormModalProps) {
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(() => toFormState(route));
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCalculando, setIsCalculando] = useState(false);
  const isEditing = route !== null;

  const [syncedWith, setSyncedWith] = useState<SavedRouteRow | null>(null);
  if (open && route !== syncedWith) {
    setSyncedWith(route);
    setForm(toFormState(route));
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

  async function handleCalcularDistancia() {
    if (!form.originCity || !form.destinationCity) {
      setFormError("Informe origem e destino antes de calcular.");
      return;
    }
    setIsCalculando(true);
    setFormError(null);
    try {
      const origem = `${form.originCity}${form.originState ? `, ${form.originState}` : ""}`;
      const destino = `${form.destinationCity}${form.destinationState ? `, ${form.destinationState}` : ""}`;
      const response = await fetch("/api/frota/rotas/calcular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origem, destino }),
      });
      const data = await response.json();
      if (!response.ok) {
        setFormError(data.error ?? "Não foi possível calcular a distância.");
        return;
      }
      setForm((prev) => ({ ...prev, distanceKm: String(data.distanciaKm), estimatedDurationMinutes: String(data.duracaoMinutos) }));
      showToast({ title: "Distância calculada", variant: "success" });
    } catch {
      setFormError("Verifique sua conexão e tente novamente.");
    } finally {
      setIsCalculando(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!form.originCity || !form.destinationCity) {
      setFormError("Origem e destino são obrigatórios.");
      return;
    }

    const payload = toPayload(form);
    const schema = isEditing ? savedRouteUpdateSchema : savedRouteCreateSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(isEditing ? `/api/frota/rotas/${route.id}` : "/api/frota/rotas", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        showToast({ title: "Não foi possível salvar", description: data.error ?? "Tente novamente.", variant: "error" });
        return;
      }

      showToast({ title: isEditing ? "Rota atualizada" : "Rota cadastrada", variant: "success" });
      onSaved(data.rota);
      resetAndClose();
    } catch {
      showToast({ title: "Não foi possível salvar", description: "Verifique sua conexão e tente novamente.", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={resetAndClose} title={isEditing ? "Editar rota" : "Nova rota"} className="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className={labelClass}>
            Nome <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <Input id="name" value={form.name} onChange={(e) => updateField("name", e.target.value)} placeholder="Ex.: Curitiba – São Paulo" />
        </div>

        <div className="grid grid-cols-[1fr_5rem] gap-3">
          <div>
            <label htmlFor="originCity" className={labelClass}>
              Origem (cidade)
            </label>
            <Input id="originCity" value={form.originCity} onChange={(e) => updateField("originCity", e.target.value)} required />
          </div>
          <div>
            <label htmlFor="originState" className={labelClass}>
              UF
            </label>
            <Input id="originState" maxLength={2} value={form.originState} onChange={(e) => updateField("originState", e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-[1fr_5rem] gap-3">
          <div>
            <label htmlFor="destinationCity" className={labelClass}>
              Destino (cidade)
            </label>
            <Input id="destinationCity" value={form.destinationCity} onChange={(e) => updateField("destinationCity", e.target.value)} required />
          </div>
          <div>
            <label htmlFor="destinationState" className={labelClass}>
              UF
            </label>
            <Input id="destinationState" maxLength={2} value={form.destinationState} onChange={(e) => updateField("destinationState", e.target.value)} />
          </div>
        </div>

        <Button type="button" variant="outline" size="sm" className="w-full gap-1.5" onClick={handleCalcularDistancia} disabled={isCalculando}>
          {isCalculando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <MapPinned className="size-3.5" aria-hidden />}
          Calcular distância e duração (Google Maps)
        </Button>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="distanceKm" className={labelClass}>
              Km
            </label>
            <Input id="distanceKm" type="number" min={0} step="0.1" value={form.distanceKm} onChange={(e) => updateField("distanceKm", e.target.value)} />
          </div>
          <div>
            <label htmlFor="estimatedDurationMinutes" className={labelClass}>
              Duração (min)
            </label>
            <Input
              id="estimatedDurationMinutes"
              type="number"
              min={0}
              value={form.estimatedDurationMinutes}
              onChange={(e) => updateField("estimatedDurationMinutes", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="estimatedTollCost" className={labelClass}>
              Pedágio (R$)
            </label>
            <Input
              id="estimatedTollCost"
              type="number"
              min={0}
              step="0.01"
              value={form.estimatedTollCost}
              onChange={(e) => updateField("estimatedTollCost", e.target.value)}
            />
          </div>
        </div>

        <div>
          <label htmlFor="vehicleId" className={labelClass}>
            Veículo <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <select id="vehicleId" value={form.vehicleId} onChange={(e) => updateField("vehicleId", e.target.value)} className={selectClass}>
            <option value="">Nenhum específico</option>
            {veiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name || v.plate || v.id}
              </option>
            ))}
          </select>
        </div>

        {formError && <p className="text-sm text-danger">{formError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={resetAndClose}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={isSaving}>
            {isEditing ? "Salvar alterações" : "Cadastrar rota"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
