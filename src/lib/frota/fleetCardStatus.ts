import { goalProgress, type MonthlyProduction } from "./productionGoals";

// Card status describes recorded production, never inferred GPS/working-day pace.
export function fleetCardStatus(row: MonthlyProduction | undefined, today: string, active = true) {
  const progress = row ? goalProgress(row, today) : null;
  if (!active) return { label: "Inativo", tone: "neutral", progress };
  if (!row || row.actual_tonnes === null) return { label: "Sem apuração", tone: "neutral", progress };
  if (row.month > today.slice(0, 7)) return { label: "Mês futuro", tone: "neutral", progress };
  if (row.target_tonnes === null) return { label: "Sem meta", tone: "neutral", progress };
  if (row.actual_tonnes >= row.target_tonnes) return { label: "Meta atingida", tone: "success", progress };
  if (progress?.closed) return { label: "Abaixo da meta", tone: "danger", progress };
  return { label: "Apuração parcial", tone: "warning", progress };
}
