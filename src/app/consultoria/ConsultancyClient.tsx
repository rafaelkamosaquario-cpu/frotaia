"use client";
import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { ConsultancyCompany } from "@/lib/frota/consultancy";
import { CompanyModulesEditor } from "./CompanyModulesEditor";
const input = "mt-1 block w-full rounded-lg border border-border bg-background p-3";
const button = "rounded-lg border border-border px-4 py-3 font-medium disabled:opacity-50";
async function api(path: string, body?: unknown) {
  const response = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Não foi possível concluir.");
  return result;
}
export function ConsultancyClient() {
  const [companies, setCompanies] = useState<ConsultancyCompany[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [target, setTarget] = useState<ConsultancyCompany | null>(null), [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [share, setShare] = useState("");
  const [moduleTarget, setModuleTarget] = useState<ConsultancyCompany | null>(null);
  const requestId = useRef<string | null>(null);
  async function refresh() { const data = await api("/api/consultoria"); setCompanies(data.companies); }
  useEffect(() => { api("/api/consultoria").then(data => setCompanies(data.companies)).catch(e => setError(e.message)); }, []);
  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(""); setMessage("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Falha de conexão."); } finally { setBusy(false); }
  }
  return <main className="min-h-dvh bg-background p-4 text-foreground sm:p-8"><div className="mx-auto max-w-4xl space-y-6">
    <header><a className="text-primary underline" href="/empresas">Voltar às empresas</a><h1 className="mt-4 text-3xl font-semibold">Implantação pela consultoria</h1><p className="mt-3 text-muted-foreground">Prepare a operação no computador e entregue o painel pronto. Caminho separado, sem checkout ou cobrança automática.</p></header>
    {error && <p role="alert" className="rounded-lg border border-red-500 p-4">{error}</p>}
    {message && <p role="status" className="rounded-lg border border-emerald-500 p-4">{message}</p>}
    <form className="space-y-4 rounded-xl border border-border p-5" onSubmit={event => {
      event.preventDefault(); const form = event.currentTarget; const fields = Object.fromEntries(new FormData(form));
      requestId.current ??= crypto.randomUUID();
      run(async () => { await api("/api/consultoria", { action: "create", requestId: requestId.current, ...fields });
        requestId.current = null; form.reset(); await refresh(); setMessage("Empresa criada. Abra o painel abaixo e cadastre a operação antes de entregar o acesso."); });
    }}>
      <h2 className="text-xl font-semibold">1. Cadastrar empresa</h2>
      <div className="grid gap-4 sm:grid-cols-2">{[
        ["name", "Nome da empresa", "text", true, 150], ["contactName", "Responsável", "text", true, 150],
        ["email", "E-mail do cliente", "email", true, 254], ["phone", "Telefone", "tel", false, 30],
        ["document", "CPF/CNPJ", "text", false, 30], ["city", "Cidade", "text", false, 100],
        ["state", "UF (duas letras maiúsculas)", "text", false, 2],
      ].map(([name, label, type, required, max]) => <label key={String(name)}>{String(label)}<input className={input} name={String(name)} type={String(type)} required={Boolean(required)} maxLength={Number(max)} disabled={busy} /></label>)}</div>
      <p className="text-sm text-muted-foreground">Liberação manual do painel para até 10 veículos. Sem assinatura financeira criada. O acompanhamento da consultoria dura 90 dias após a entrega; o acesso do cliente não expira por esse motivo.</p>
      <button className={button} disabled={busy}>Criar empresa para implantação</button>
    </form>
    <section className="space-y-4"><h2 className="text-xl font-semibold">2. Preparar e entregar</h2>{companies.map(company => <article key={company.company_id} className="space-y-3 rounded-xl border border-border p-5">
      <h3 className="text-lg font-semibold">{company.name}</h3><p>{company.contact_name} · {company.client_email}</p>
      <p className="text-sm">{company.claimed_at ? "Cliente ativou sua senha pessoal" : company.delivered_at ? "Aguardando primeiro acesso e troca de senha (validade: 7 dias)" : "Em preparação — acesso ainda não entregue"}</p>
      {company.consultant_until && <p className="text-sm">Acompanhamento até {new Date(company.consultant_until).toLocaleDateString("pt-BR")}. Depois, solicite nova autorização ao cliente.</p>}
      <div className="flex flex-wrap gap-3"><button className={button} disabled={busy || (!!company.consultant_until && new Date(company.consultant_until) <= new Date())} onClick={() => run(async () => { await api("/api/company-access", { action: "select", company_id: company.company_id }); window.location.assign("/frota/dashboard"); })}>Abrir painel para configurar</button>
        <button className={button} disabled={busy || (!!company.consultant_until && new Date(company.consultant_until) <= new Date())} onClick={() => setModuleTarget(company)}>Personalizar módulos</button>
        {!company.delivered_at && <button className={button} disabled={busy} onClick={() => { setTarget(company); setPassword(""); setShowPassword(false); setShare(""); }}>Preparar acesso do cliente</button>}</div>
        {moduleTarget?.company_id === company.company_id && <CompanyModulesEditor key={company.company_id} company={company} onClose={() => setModuleTarget(null)} />}
    </article>)}</section>
    {target && <form className="space-y-4 rounded-xl border border-primary p-5" onSubmit={event => { event.preventDefault(); run(async () => {
      const result = await api("/api/consultoria", { action: "deliver", companyId: target.company_id, password });
      setShare(`Seu painel Frota IA está preparado.\nAcesse: ${window.location.origin}${result.loginPath}\nE-mail: ${result.email}\nEnvie a senha temporária separadamente. No primeiro acesso, crie sua senha pessoal.\nVocê pode adicionar o painel à tela inicial do celular pelo menu do navegador.`);
      setPassword(""); setTarget(null); await refresh(); setMessage(result.recovered ? "Entrega anterior recuperada. A senha é a da PRIMEIRA tentativa, não a digitada agora. Não compartilhe se não guardou a senha original; solicite recuperação segura." : "Acesso preparado. Compartilhe o link e o e-mail abaixo; a senha temporária não pode ser consultada depois.");
    }); }}><h2 className="text-xl font-semibold">Entregar acesso · {target.name}</h2>
      <p>Confira o e-mail: <strong>{target.client_email}</strong>. Você é responsável por entregar as credenciais à pessoa correta.</p>
      <div>
        <label htmlFor="temporary-client-password">Senha temporária (12 ou mais caracteres, letras e números)</label>
        <div className="relative">
          <input id="temporary-client-password" autoComplete="new-password" spellCheck={false} autoCapitalize="none" className={`${input} pr-14`} type={showPassword ? "text" : "password"} minLength={12} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} />
          <button type="button" aria-label={showPassword ? "Ocultar senha temporária" : "Mostrar senha temporária"} aria-controls="temporary-client-password" aria-pressed={showPassword} title={showPassword ? "Ocultar senha" : "Mostrar senha"} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary" onClick={() => setShowPassword(visible => !visible)}>
            {showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>
      <p className="text-sm">Não reutilize senhas. Guarde esta senha apenas para a entrega; após a troca, você continuará entrando com a sua conta. O cliente será proprietário da empresa.</p>
      <button className={button} disabled={busy}>Confirmar entrega e iniciar 90 dias</button>
    </form>}
    {share && <section className="space-y-3 rounded-xl border border-border p-5"><h2 className="text-xl font-semibold">Mensagem para o cliente</h2><textarea readOnly className={`${input} min-h-48`} value={share} /><button className={button} onClick={() => run(async () => { await navigator.clipboard.writeText(share); setMessage("Mensagem copiada."); })}>Copiar mensagem (sem senha)</button></section>}
  </div></main>;
}
