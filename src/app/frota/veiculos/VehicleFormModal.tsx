"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";
import { vehicleCreateSchema, vehicleUpdateSchema } from "@/lib/validation/schemas";
import type { VehicleRow } from "@/lib/supabase/tables";

const selectClass = cn(
  "flex h-10 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent"
);

const labelClass = "mb-1.5 block text-sm font-medium text-foreground";

interface VehicleFormModalProps {
  open: boolean;
  onClose: () => void;
  vehicle: VehicleRow | null;
  onSaved: (vehicle: VehicleRow) => void;
}

interface FormState {
  name: string;
  plate: string;
  vehicleType: string;
  brand: string;
  model: string;
  modelYear: string;
  fuelType: string;
  averageConsumptionKmL: string;
  averageSpeedKmh: string;
  loadCapacityKg: string;
  currentOdometerKm: string;
  axleCount: string;
  insuranceExpiryDate: string;
  licensingExpiryDate: string;
  notes: string;
}

function toFormState(vehicle: VehicleRow | null): FormState {
  return {
    name: vehicle?.name ?? "",
    plate: vehicle?.plate ?? "",
    vehicleType: vehicle?.vehicle_type ?? "",
    brand: vehicle?.brand ?? "",
    model: vehicle?.model ?? "",
    modelYear: vehicle?.model_year?.toString() ?? "",
    fuelType: vehicle?.fuel_type ?? "",
    averageConsumptionKmL: vehicle?.average_consumption_km_l?.toString() ?? "",
    averageSpeedKmh: vehicle?.average_speed_kmh?.toString() ?? "",
    loadCapacityKg: vehicle?.load_capacity_kg?.toString() ?? "",
    currentOdometerKm: vehicle?.current_odometer_km?.toString() ?? "",
    axleCount: vehicle?.axle_count?.toString() ?? "",
    insuranceExpiryDate: vehicle?.insurance_expiry_date ?? "",
    licensingExpiryDate: vehicle?.licensing_expiry_date ?? "",
    notes: vehicle?.notes ?? "",
  };
}

/** Só inclui campos preenchidos — todos são opcionais no Zod (mesmo schema que a coleta progressiva da IA usa), então string vazia é omitida em vez de enviada. */
function toPayload(form: FormState): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (form.name) payload.name = form.name;
  if (form.plate) payload.plate = form.plate.toUpperCase();
  if (form.vehicleType) payload.vehicleType = form.vehicleType;
  if (form.brand) payload.brand = form.brand;
  if (form.model) payload.model = form.model;
  if (form.modelYear) payload.modelYear = Number(form.modelYear);
  if (form.fuelType) payload.fuelType = form.fuelType;
  if (form.averageConsumptionKmL) payload.averageConsumptionKmL = Number(form.averageConsumptionKmL);
  if (form.averageSpeedKmh) payload.averageSpeedKmh = Number(form.averageSpeedKmh);
  if (form.loadCapacityKg) payload.loadCapacityKg = Number(form.loadCapacityKg);
  if (form.currentOdometerKm) payload.currentOdometerKm = Number(form.currentOdometerKm);
  if (form.axleCount) payload.axleCount = Number(form.axleCount);
  if (form.insuranceExpiryDate) payload.insuranceExpiryDate = form.insuranceExpiryDate;
  if (form.licensingExpiryDate) payload.licensingExpiryDate = form.licensingExpiryDate;
  if (form.notes) payload.notes = form.notes;
  return payload;
}

export function VehicleFormModal({ open, onClose, vehicle, onSaved }: VehicleFormModalProps) {
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(() => toFormState(vehicle));
  const [plateError, setPlateError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isEditing = vehicle !== null;

  function resetAndClose() {
    setForm(toFormState(null));
    setPlateError(null);
    onClose();
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPlateError(null);

    if (!form.plate.trim()) {
      setPlateError("Placa é obrigatória.");
      return;
    }

    const payload = toPayload(form);
    const schema = isEditing ? vehicleUpdateSchema : vehicleCreateSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      setPlateError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(isEditing ? `/api/frota/veiculos/${vehicle.id}` : "/api/frota/veiculos", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        showToast({ title: "Não foi possível salvar", description: data.error ?? "Tente novamente.", variant: "error" });
        return;
      }

      showToast({ title: isEditing ? "Veículo atualizado" : "Veículo cadastrado", variant: "success" });
      onSaved(data.veiculo);
      resetAndClose();
    } catch {
      showToast({ title: "Não foi possível salvar", description: "Verifique sua conexão e tente novamente.", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={resetAndClose} title={isEditing ? "Editar veículo" : "Novo veículo"} className="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="name" className={labelClass}>
              Apelido do veículo
            </label>
            <Input id="name" value={form.name} onChange={(e) => updateField("name", e.target.value)} placeholder="Ex.: FH 540" />
          </div>
          <div>
            <label htmlFor="plate" className={labelClass}>
              Placa
            </label>
            <Input
              id="plate"
              value={form.plate}
              onChange={(e) => updateField("plate", e.target.value)}
              placeholder="ABC1D23"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="vehicleType" className={labelClass}>
              Tipo
            </label>
            <select
              id="vehicleType"
              value={form.vehicleType}
              onChange={(e) => updateField("vehicleType", e.target.value)}
              className={selectClass}
            >
              <option value="">Não informar</option>
              <option value="utilitario">Utilitário</option>
              <option value="tres_quartos">3/4</option>
              <option value="toco">Toco</option>
              <option value="truck">Truck</option>
              <option value="cavalo_mecanico">Cavalo mecânico</option>
              <option value="carreta">Carreta</option>
              <option value="bitrem">Bitrem</option>
              <option value="rodotrem">Rodotrem</option>
              <option value="onibus">Ônibus</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <div>
            <label htmlFor="fuelType" className={labelClass}>
              Combustível
            </label>
            <select
              id="fuelType"
              value={form.fuelType}
              onChange={(e) => updateField("fuelType", e.target.value)}
              className={selectClass}
            >
              <option value="">Não informar</option>
              <option value="diesel_s10">Diesel S10</option>
              <option value="diesel_s500">Diesel S500</option>
              <option value="gasolina">Gasolina</option>
              <option value="etanol">Etanol</option>
              <option value="eletrico">Elétrico</option>
              <option value="outro">Outro</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="brand" className={labelClass}>
              Marca
            </label>
            <Input id="brand" value={form.brand} onChange={(e) => updateField("brand", e.target.value)} placeholder="Ex.: Volvo" />
          </div>
          <div>
            <label htmlFor="model" className={labelClass}>
              Modelo
            </label>
            <Input id="model" value={form.model} onChange={(e) => updateField("model", e.target.value)} placeholder="Ex.: FH 540" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="modelYear" className={labelClass}>
              Ano modelo
            </label>
            <Input
              id="modelYear"
              type="number"
              value={form.modelYear}
              onChange={(e) => updateField("modelYear", e.target.value)}
              placeholder="Ex.: 2022"
            />
          </div>
          <div>
            <label htmlFor="axleCount" className={labelClass}>
              Nº de eixos
            </label>
            <Input
              id="axleCount"
              type="number"
              min="1"
              max="12"
              value={form.axleCount}
              onChange={(e) => updateField("axleCount", e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="averageConsumptionKmL" className={labelClass}>
              Consumo médio (km/l)
            </label>
            <Input
              id="averageConsumptionKmL"
              type="number"
              step="0.1"
              min="0"
              value={form.averageConsumptionKmL}
              onChange={(e) => updateField("averageConsumptionKmL", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="averageSpeedKmh" className={labelClass}>
              Velocidade média (km/h)
            </label>
            <Input
              id="averageSpeedKmh"
              type="number"
              min="0"
              max="150"
              value={form.averageSpeedKmh}
              onChange={(e) => updateField("averageSpeedKmh", e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="loadCapacityKg" className={labelClass}>
              Capacidade de carga (kg)
            </label>
            <Input
              id="loadCapacityKg"
              type="number"
              min="0"
              value={form.loadCapacityKg}
              onChange={(e) => updateField("loadCapacityKg", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="currentOdometerKm" className={labelClass}>
              Odômetro atual (km)
            </label>
            <Input
              id="currentOdometerKm"
              type="number"
              min="0"
              value={form.currentOdometerKm}
              onChange={(e) => updateField("currentOdometerKm", e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="insuranceExpiryDate" className={labelClass}>
              Vencimento do seguro
            </label>
            <Input
              id="insuranceExpiryDate"
              type="date"
              value={form.insuranceExpiryDate}
              onChange={(e) => updateField("insuranceExpiryDate", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="licensingExpiryDate" className={labelClass}>
              Vencimento do licenciamento
            </label>
            <Input
              id="licensingExpiryDate"
              type="date"
              value={form.licensingExpiryDate}
              onChange={(e) => updateField("licensingExpiryDate", e.target.value)}
            />
          </div>
        </div>

        <div>
          <label htmlFor="notes" className={labelClass}>
            Observações
          </label>
          <Textarea id="notes" rows={3} value={form.notes} onChange={(e) => updateField("notes", e.target.value)} />
        </div>

        {plateError && <p className="text-sm text-danger">{plateError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={resetAndClose}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={isSaving}>
            {isEditing ? "Salvar alterações" : "Cadastrar veículo"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
