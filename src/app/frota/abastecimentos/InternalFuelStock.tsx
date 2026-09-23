"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { VehicleRow, DriverRow } from "@/lib/supabase/tables";
import type { FuelBalanceRow, FuelMovementRow } from "@/lib/frota/fuelStock";

const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const field = "block w-full rounded-lg border border-border bg-surface p-2 text-foreground";
export function InternalFuelStock({ vehicles, drivers, onRecorded }: { vehicles: VehicleRow[]; drivers: DriverRow[]; onRecorded: () => Promise<void> }) {
  const [balance, setBalance] = useState<Pick<FuelBalanceRow, "liters" | "value" | "last_date"> | null>(null);
  const [history, setHistory] = useState<FuelMovementRow[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState("purchase");
  const [requestId, setRequestId] = useState("");
  const [liters, setLiters] = useState("");
  const [total, setTotal] = useState("");
  const [unit, setUnit] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/frota/estoque-diesel");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setBalance(data.balance); setHistory(data.history);
  }, []);
  useEffect(() => { void Promise.resolve().then(load).then(() => setRequestId(crypto.randomUUID())).catch(e => setError(e.message)); }, [load]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setSuccess("");
    const form = event.currentTarget;
    const values = new FormData(form);
    const command = kind === "purchase"
      ? { kind, requestId, date: values.get("date"), liters: Number(liters), total: Number(total), invoice: values.get("invoice"), supplier: values.get("supplier") }
      : { kind, requestId, date: values.get("date"), liters: Number(liters), vehicleId: values.get("vehicle"), driverId: values.get("driver"), meterKind: values.get("meterKind"), meter: Number(values.get("meter")) };
    try {
      const response = await fetch("/api/frota/estoque-diesel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSuccess("Movimentação registrada. Não lance novamente esse valor em Despesas.");
      setRequestId(crypto.randomUUID()); setLiters(""); setTotal(""); setUnit(""); form.reset();
      await load();
      await onRecorded();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao registrar."); }
    finally { setBusy(false); }
  }
  return <section className="my-5 rounded-xl border border-border bg-surface p-4">
    <h2 className="text-lg font-semibold">Abastecimento interno — estoque de diesel</h2>
    <p className="my-2 text-sm text-muted-foreground">Entradas por nota e retiradas por veículo. O histórico antigo não baixa este estoque. Lance as movimentações em ordem de data.</p>
    {error && <p role="alert" className="my-2 text-red-500">{error}</p>}
    {success && <p role="status" className="my-2 text-green-600">{success}</p>}
    {balance && <>
      <div className="my-4 flex flex-wrap gap-5 font-medium">
        <span>Disponível: {Number(balance.liters).toLocaleString("pt-BR")} L</span>
        <span>Valor em estoque: {money(Number(balance.value))}</span>
        <span>Custo médio/L: {Number(balance.liters) ? (Number(balance.value) / Number(balance.liters)).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : "—"}</span>
      </div>
      <label>Tipo de lançamento<select className={field} disabled={busy} value={kind} onChange={e => { setKind(e.target.value); setRequestId(crypto.randomUUID()); setLiters(""); setTotal(""); setUnit(""); }}><option value="purchase">Entrada de diesel — nota de compra</option><option value="withdrawal">Abastecimento interno — retirada</option></select></label>
      <form key={kind} onSubmit={submit} className="my-4">
        <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
          <label>Data<input className={field} type="date" name="date" required min={balance.last_date ?? undefined} /></label>
          <label>Litros<input className={field} type="number" min="0.001" step="0.001" required value={liters} onChange={e => { setLiters(e.target.value); if (unit) setTotal((Number(e.target.value) * Number(unit)).toFixed(2)); }} /></label>
          {kind === "purchase" ? <>
            <label>Número da nota<input className={field} name="invoice" required maxLength={100} /></label>
            <label>Fornecedor / CNPJ<input className={field} name="supplier" required maxLength={150} /></label>
            <label>Preço por litro (R$)<input className={field} type="number" min="0.000001" step="0.000001" value={unit} onChange={e => { setUnit(e.target.value); if (liters) setTotal((Number(liters) * Number(e.target.value)).toFixed(2)); }} /></label>
            <label>Valor total da nota (R$)<input className={field} type="number" min="0.01" step="0.01" required value={total} onChange={e => { setTotal(e.target.value); setUnit(Number(liters) ? (Number(e.target.value) / Number(liters)).toFixed(6) : ""); }} /></label>
          </> : <>
            <label>Veículo / equipamento<select className={field} name="vehicle" required><option value="">Selecione</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} — {v.name}</option>)}</select></label>
            <label>Condutor<select className={field} name="driver" required><option value="">Selecione</option>{drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
            <label>Tipo de leitura<select className={field} name="meterKind"><option value="km">Quilometragem total</option><option value="hours">Horímetro do equipamento</option></select></label>
            <label>Leitura<input className={field} type="number" name="meter" min="0" step="0.1" required /></label>
          </>}
          <p className="text-sm text-muted-foreground sm:col-span-2">{kind === "purchase" ? "A compra entra no estoque, não soma outra despesa operacional. Seu valor financeiro fica neste histórico de compras." : "O servidor calcula o custo médio e registra a retirada e seu custo em Despesas juntos, sem duplicar. Estoque insuficiente impede a retirada."} Movimentações internas não podem ser editadas ou excluídas diretamente.</p>
          <Button type="submit" disabled={busy || !requestId}>{busy ? "Registrando…" : kind === "purchase" ? "Registrar entrada no estoque" : "Confirmar retirada do estoque"}</Button>
        </fieldset>
      </form>
      <h3 className="font-semibold">Últimas 200 movimentações</h3>
      {history.length === 0 ? <p className="text-sm">Nenhuma entrada ou retirada registrada.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Data</th><th>Movimento</th><th>Nota / veículo</th><th>Litros</th><th>Custo total</th></tr></thead><tbody>{history.map(m => <tr className="border-t border-border" key={m.id}><td className="py-2">{m.movement_date.split("-").reverse().join("/")}</td><td>{m.kind === "purchase" ? "Compra" : "Consumo interno"}</td><td>{m.kind === "purchase" ? `${m.invoice} / ${m.supplier}` : vehicles.find(v => v.id === m.vehicle_id)?.name ?? m.vehicle_id}</td><td>{Number(m.liters).toLocaleString("pt-BR")}</td><td>{money(Number(m.amount))}</td></tr>)}</tbody></table></div>}
    </>}
  </section>;
}
