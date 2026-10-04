"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { passwordSchema } from "@/lib/frota/consultancy";
const field = "mt-1 block w-full rounded-lg border border-border bg-background p-3";
export default function ClientAccessPage() {
  const [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [nextPassword, setNextPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function enter() {
    const db = createClient();
    const state = await db.rpc("consultancy_first_access", { p_complete: false });
    if (state.error) throw new Error("Acesso não liberado ou senha temporária expirada. Contate a consultoria.");
    const status = state.data as { pending: boolean; ready?: boolean; company_id?: string };
    if (status.pending && status.ready) {
      const completed = await db.rpc("consultancy_first_access", { p_complete: true });
      if (completed.error) throw new Error("Ativação não confirmada. Tente novamente ou contate a consultoria.");
      await openCompany((completed.data as { company_id: string }).company_id); return;
    }
    if (status.pending) { setPending(true); return; }
    await openCompany(status.company_id);
  }
  async function openCompany(companyId?: string) {
    if (!companyId) { window.location.assign("/empresas"); return; }
    const response = await fetch("/api/company-access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "select", company_id: companyId }) });
    if (!response.ok) throw new Error("Não foi possível abrir a empresa. Tente entrar novamente.");
    window.location.assign("/frota/dashboard");
  }
  return <main className="flex min-h-dvh items-center justify-center bg-background p-5 text-foreground"><form className="w-full max-w-md space-y-5 rounded-2xl border border-border p-6" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const db = createClient();
      if (!pending) {
        const result = await db.auth.signInWithPassword({ email: email.trim(), password });
        if (result.error) throw new Error("E-mail ou senha inválidos, ou muitas tentativas. Confira os dados e tente novamente mais tarde.");
        await enter();
      } else {
        if (!passwordSchema.safeParse(nextPassword).success || nextPassword !== confirmation || nextPassword === password)
          throw new Error("Use uma senha diferente da temporária, com pelo menos 12 caracteres, letras e números, e confirme igualmente.");
        const changed = await db.auth.updateUser({ password: nextPassword });
        if (changed.error) throw new Error("Não foi possível alterar a senha. Confira os requisitos e tente novamente.");
        // Revoke all temporary sessions, then establish a new one with the final password.
        const signedOut = await db.auth.signOut({ scope: "global" });
        if (signedOut.error) throw new Error("Senha alterada, mas encerramento das sessões não confirmado. Entre novamente com a nova senha.");
        const signedIn = await db.auth.signInWithPassword({ email: email.trim(), password: nextPassword });
        if (signedIn.error) throw new Error("Senha alterada. Entre novamente usando a nova senha.");
        const completed = await db.rpc("consultancy_first_access", { p_complete: true });
        if (completed.error) throw new Error("Senha alterada, mas ativação não confirmada. Entre novamente ou contate a consultoria.");
        setPassword(""); setNextPassword(""); setConfirmation("");
        await openCompany((completed.data as { company_id: string }).company_id);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Falha de conexão. Tente novamente."); }
    finally { setBusy(false); }
  }}>
    <header><p className="font-semibold text-primary">Frota IA · Painel web</p><h1 className="mt-2 text-2xl font-semibold">{pending ? "Crie sua senha pessoal" : "Seu painel está aqui"}</h1><p className="mt-3 text-sm text-muted-foreground">{pending ? "Sua empresa só será liberada após esta troca. A consultoria continua com acesso próprio para acompanhar a implantação por 90 dias, contados da entrega." : "Entre com o e-mail e a senha enviados pela consultoria. Não é necessário passar pelo checkout."}</p></header>
    {error && <p role="alert" className="rounded-lg border border-red-500 p-3">{error}</p>}
    {!pending ? <><label className="block">E-mail<input className={field} type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label><label className="block">Senha<input className={field} type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label></> : <><label className="block">Nova senha<input className={field} type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={nextPassword} onChange={e => setNextPassword(e.target.value)} /></label><label className="block">Repita a nova senha<input className={field} type="password" autoComplete="new-password" required value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label><p className="text-sm">Pelo menos 12 caracteres, com letras e números. Sua senha pessoal não será mostrada à consultoria.</p></>}
    <button disabled={busy} className="w-full rounded-lg bg-primary p-3 font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Aguarde…" : pending ? "Salvar senha e acessar painel" : "Entrar"}</button>
    {pending && <button type="button" className="text-sm underline" onClick={() => { setPending(false); setPassword(""); setNextPassword(""); setConfirmation(""); }}>Voltar ao login</button>}
    <a href="/login?next=/empresas" className="block text-center text-sm underline">Já utiliza Google? Continuar com Google</a>
    <p className="text-sm text-muted-foreground">No celular, abra o link no navegador e use “Adicionar à tela inicial” ou “Instalar aplicativo”, quando disponível. Não exige download pela Play Store.</p>
  </form></main>;
}
