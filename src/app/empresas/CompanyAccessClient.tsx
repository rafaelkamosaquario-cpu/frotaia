"use client";
import { useEffect, useState } from "react";
import type { AccessibleCompany, AccessOverview, AccessTeam } from "@/lib/frota/companyAccess";
const roles:Record<string,string>={owner:"Proprietário",admin:"Administrador / consultor",operator:"Operador",viewer:"Consulta"};
const button="rounded-lg border border-border px-4 py-2 font-medium disabled:opacity-50";
async function api(path:string,body?:unknown){
 const r=await fetch(path,body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{cache:"no-store"});
 const result=await r.json();if(!r.ok)throw new Error(result.error??"Não foi possível concluir. Tente novamente.");return result;
}
export function CompanyAccessClient({canProvision=false}:{canProvision?:boolean}){
 const [overview,setOverview]=useState<AccessOverview|null>(null),[email,setEmail]=useState("");
 const [company,setCompany]=useState<AccessibleCompany|null>(null),[team,setTeam]=useState<AccessTeam|null>(null);
 const [inviteEmail,setInviteEmail]=useState(""),[role,setRole]=useState("admin"),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 async function refresh(){const r=await api("/api/company-access");setOverview(r.data);setEmail(r.email??"");}
 useEffect(()=>{let active=true;api("/api/company-access").then(r=>{if(active){setOverview(r.data);setEmail(r.email??"");}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 async function run(fn:()=>Promise<void>){setBusy(true);setError("");setMessage("");try{await fn();}catch(e){setError(e instanceof Error?e.message:"Falha de conexão.");}finally{setBusy(false);}}
 async function loadTeam(c:AccessibleCompany){setTeam(null);setCompany(c);const r=await api(`/api/company-access?company_id=${c.id}`);setTeam(r.data);}
 async function command(body:unknown){await api("/api/company-access",body);await refresh();if(company)await loadTeam(company);}
 return <main className="min-h-dvh bg-background px-4 py-10 text-foreground"><div className="mx-auto max-w-4xl space-y-6">
  <header><p className="text-sm font-semibold text-primary">Frota IA · Gestão V2</p><h1 className="mt-2 text-3xl font-semibold">Minhas empresas</h1><p className="mt-3 text-muted-foreground">Cada cliente mantém sua conta e assinatura. Entre com seu próprio Google para implantar e acompanhar as empresas que autorizaram você.</p><p className="mt-2 text-sm">Sua conta: {email||"Verificando…"}</p></header>
  {canProvision&&<a href="/consultoria" className={`${button} inline-block bg-primary text-primary-foreground`}>Cadastrar cliente pela consultoria — sem checkout</a>}
  {error&&<p role="alert" className="rounded-lg border border-red-500 p-4">{error}</p>}{message&&<p role="status" className="rounded-lg border border-emerald-500 p-4">{message}</p>}
  {!overview&&!error&&<p role="status">Carregando empresas…</p>}
  {overview&&<>
   {overview.invites.length>0&&<section className="space-y-3"><h2 className="text-xl font-semibold">Convites para seu e-mail</h2>{overview.invites.map(i=><article key={i.id} className="rounded-xl border border-border p-5"><h3 className="font-semibold">{i.company_name}</h3><p>{roles[i.role]} · válido até {new Date(i.expires_at).toLocaleDateString("pt-BR")}</p><button disabled={busy} className={`${button} mt-3`} onClick={()=>run(async()=>{await command({action:"accept",invite_id:i.id});setMessage("Convite aceito. Selecione a empresa abaixo para começar.");})}>Aceitar acesso</button></article>)}</section>}
   <section className="space-y-3"><h2 className="text-xl font-semibold">Empresas autorizadas</h2>{overview.companies.length===0&&<p>Você ainda não tem uma empresa autorizada. Peça ao proprietário um convite para o e-mail acima. Não é necessário criar outra empresa para prestar consultoria.</p>}{overview.companies.map(c=><article key={c.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border p-5"><div><h3 className="font-semibold">{c.name}</h3><p className="text-sm text-muted-foreground">{roles[c.role]??c.role}</p></div><div className="flex flex-wrap gap-2"><button disabled={busy} className={`${button} bg-primary text-primary-foreground`} onClick={()=>run(async()=>{await api("/api/company-access",{action:"select",company_id:c.id});window.location.assign("/frota/dashboard");})}>Abrir painel</button>{c.role==="owner"&&<button disabled={busy} className={button} onClick={()=>run(()=>loadTeam(c))}>Gerenciar acessos</button>}</div></article>)}</section>
  </>}
  {company&&team&&<section className="space-y-4 rounded-xl border border-border p-6"><h2 className="text-xl font-semibold">Acessos · {company.name}</h2><p className="text-sm text-muted-foreground">Somente o proprietário autoriza e revoga acessos. O administrador pode configurar a operação; não se torna dono da conta. Revogar acesso não apaga os registros da empresa.</p>
   <form className="space-y-3" onSubmit={e=>{e.preventDefault();run(async()=>{await command({action:"invite",company_id:company.id,email:inviteEmail,role});setInviteEmail("");setMessage("Convite registrado por 7 dias. Compartilhe o endereço desta página: a pessoa deve entrar com o Google do e-mail convidado. Não enviamos e-mail automaticamente.");});}}>
    <label className="block">E-mail Google do convidado<input required type="email" maxLength={254} value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-background p-3" placeholder="consultor@empresa.com"/></label>
    <label className="block">Permissão<select value={role} onChange={e=>setRole(e.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-background p-3"><option value="admin">Administrador / consultor — implantação e gestão</option><option value="operator">Operador</option><option value="viewer">Consulta</option></select></label><button disabled={busy} className={button}>Autorizar e-mail</button>
   </form><p className="text-sm">O convidado acessa <strong>/empresas</strong> neste mesmo site. Não precisa receber sua senha nem contratar outra assinatura para acessar sua empresa.</p>
   <h3 className="font-semibold">Equipe</h3>{team.members.map(m=><div key={m.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border py-3"><span>{m.email} · {roles[m.role]} · {m.status==="active"?"Ativo":"Removido"}</span>{m.role!=="owner"&&m.status==="active"&&<button disabled={busy} className={button} onClick={()=>{if(window.confirm(`Revogar acesso de ${m.email}? Os registros serão preservados.`))run(()=>command({action:"revoke_member",company_id:company.id,id:m.id}));}}>Revogar acesso</button>}</div>)}
   <h3 className="font-semibold">Convites pendentes</h3>{team.invites.length===0&&<p className="text-sm">Nenhum convite pendente.</p>}{team.invites.map(i=><div key={i.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border py-3"><span>{i.email} · {roles[i.role]} · {new Date(i.expires_at)<=new Date()?"Expirado":"Válido até "+new Date(i.expires_at).toLocaleDateString("pt-BR")}</span><button disabled={busy} className={button} onClick={()=>{if(window.confirm("Cancelar este convite?"))run(()=>command({action:"revoke_invite",company_id:company.id,id:i.id}));}}>Cancelar convite</button></div>)}
  </section>}
  <footer className="text-sm text-muted-foreground">Escolher uma empresa aqui não altera a empresa padrão do seu WhatsApp. O painel respeita o plano contratado pela empresa selecionada.</footer>
 </div></main>;
}
