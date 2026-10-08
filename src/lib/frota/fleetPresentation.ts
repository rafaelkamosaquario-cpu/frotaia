import type { VehicleRow } from "@/lib/supabase/tables";

// Customer-approved illustrations, not technical vehicle registration data.
const PILOT = "0fba8f5d-ee49-4b94-bbe5-5b34a33e88ac";
const illustrations: Record<string, { image: string; caption: string; tractor?: boolean }> = {
  ONM1C53: { image: "truck-julieta-4.webp", caption: "6×4 · Julieta de 4 eixos" },
  MMA7F30: { image: "truck-julieta-3.webp", caption: "6×4 · Julieta de 3 eixos" },
  DHA0193: { image: "truck-julieta-3.webp", caption: "6×4 · Julieta de 3 eixos" },
  MDJ7550: { image: "truck.webp", caption: "6×4 · sem Julieta" },
  AOU8I54: { image: "truck.webp", caption: "6×4 · sem Julieta" },
  VA980: { image: "tractor-front-yellow.webp", caption: "MUC dianteiro · carregamento", tractor: true },
  BM125: { image: "tractor-front-yellow.webp", caption: "MUC dianteiro · carregamento", tractor: true },
  FO6610: { image: "tractor-winch.webp", caption: "Guincho florestal · sem MUC", tractor: true },
};
export function fleetIllustration(companyId: string, vehicle: Pick<VehicleRow, "company_id" | "plate">) {
  if (companyId !== PILOT || vehicle.company_id !== companyId) return null;
  const entry = illustrations[(vehicle.plate ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase()];
  return entry ? { ...entry, image: `/fleet-illustrations/${entry.image}` } : null;
}
export function followingMonth(month: string) {
  const [year, part] = month.split("-").map(Number);
  return part === 12 ? `${year + 1}-01` : `${year}-${String(part + 1).padStart(2, "0")}`;
}
export function monthLabel(month: string) {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" });
}
export function partialBalance(revenue: number, expenses: number) {
  return (Math.round(revenue * 100) - Math.round(expenses * 100)) / 100;
}
