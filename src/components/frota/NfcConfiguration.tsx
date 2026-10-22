"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { nfcPath, type NfcTag } from "@/lib/frota/nfc";

export function NfcConfiguration({vehicleId, vehicleLabel, companyId}: {vehicleId?: string; vehicleLabel?: string; companyId: string}) {
  const [tags, setTags] = useState<NfcTag[]>([]);
  const [name, setName] = useState(vehicleLabel ?? "Bomba interna");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(true);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [company, setCompany] = useState("");
  const [origin, setOrigin] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/frota/nfc", {cache: "no-store"});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (data.companyId !== companyId) throw new Error("A empresa selecionada mudou. Reabra o cadastro antes de continuar.");
      setTags(data.tags); setCompany(data.companyName); setReady(true); setOrigin(window.location.origin);
    } catch (e) { setReady(false); setMessage(e instanceof Error ? e.message : "Falha ao consultar cartões."); }
    finally { setBusy(false); }
  }, [companyId]);
  // load only updates state after awaiting the HTTP response (or its rejection).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  async function command(body: object) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/frota/nfc", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({...body, companyId})});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessage("Configuração salva. Nenhum checklist ou abastecimento foi lançado.");
      await load();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }
  const rows = tags.filter(t => vehicleId ? t.vehicle_id === vehicleId : t.kind === "pump");
  const current = rows.some(t => t.status !== "revoked");
  return <section className="space-y-4 rounded-xl border border-border bg-surface p-4">
    <h2 className="font-semibold">{vehicleId ? "Identificação NFC do veículo" : "NFC das bombas de combustível"}</h2>
    <p className="text-sm text-muted-foreground">{company} · Preparação dos cartões. O cartão guarda apenas um link; os dados permanecem no Frota IA.</p>
    <p className="rounded-lg bg-amber-500/10 p-3 text-sm">Ainda não é o fluxo operacional do motorista. Nesta etapa você cadastra e testa a identificação. Aproximar o celular não registra saída, checklist ou abastecimento.</p>
    {(!vehicleId || !current) && <div className="space-y-3">
      <label className="block text-sm">{vehicleId ? "Identificação do veículo no cartão" : "Nome da bomba"}<Input value={name} maxLength={100} onChange={e => setName(e.target.value)} /></label>
      <label className="block text-sm">Código do cartão físico (opcional)<Input value={code} maxLength={100} onChange={e => setCode(e.target.value)} placeholder="Ex.: NFC-001; não é identificação do motorista" /></label>
      <Button type="button" disabled={busy || !ready || name.trim().length < 2} onClick={() => command({action: "create", kind: vehicleId ? "vehicle" : "pump", vehicleId: vehicleId ?? null, label: name, physicalCode: code})}>Gerar cadastro e link NFC</Button>
    </div>}
    {message && <p role="status" className="text-sm">{message}</p>}
    <Button type="button" variant="outline" disabled={busy} onClick={load}>Atualizar cartões</Button>
    {rows.map(t => <article key={t.id} className="space-y-2 rounded-lg border border-border p-3 text-sm">
      <strong>{t.label}</strong><p>{t.status === "pending" ? "Aguardando gravação e teste" : t.status === "tested" ? "Identificação testada — operação do motorista ainda não liberada" : "Desativado — histórico preservado"}</p>
      <p>Cartão físico: {t.physical_code || "Não informado"}</p>
      {t.status !== "revoked" && <>
        <label className="block">Link para gravar no NFC<Input readOnly value={origin + nfcPath(t.token)} /></label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={async () => {try {await navigator.clipboard.writeText(origin + nfcPath(t.token)); setMessage("Link copiado. Grave como URL no cartão NFC.");} catch {setMessage("Selecione o link e copie manualmente.");}}}>Copiar link</Button>
          <a className="rounded-lg border border-border px-3 py-2" href={nfcPath(t.token)} target="_blank" rel="noopener noreferrer">Abrir teste</a>
          {t.status === "pending" && <Button type="button" disabled={busy} onClick={() => {if (window.confirm("Você gravou este link no cartão e conferiu a leitura com o celular?")) void command({action: "tested", id: t.id, version: t.version});}}>Confirmar teste físico</Button>}
          <Button type="button" variant="outline" disabled={busy} onClick={() => {if (window.confirm("Desativar este link? O cartão antigo deixará de identificar o veículo/bomba. O histórico será mantido.")) void command({action: "revoke", id: t.id, version: t.version});}}>Desativar cartão</Button>
        </div>
      </>}
    </article>)}
    <p className="text-xs text-muted-foreground">Para substituir: desative o antigo, gere outro cadastro e grave o novo link. Não há gravação automática do cartão pelo painel.</p>
  </section>;
}
