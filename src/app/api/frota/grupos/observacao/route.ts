import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {loadFleetPanelAccess} from '@/services/supabase/fleetPanelAccess';
import {isConsultant,sameOrigin} from '@/lib/frota/consultancy';
import {observationCommand} from '@/lib/frota/groupObservation';
import {findExactOperationalGroup} from '@/services/whatsapp/groupDiscovery';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function authorized() {
 const db=await createClient(), access=await loadFleetPanelAccess(db);
 if(!access.ok || !['owner','admin'].includes(access.role)) return null;
 return {db,access};
}
export async function GET() {
 const auth=await authorized(); if(!auth) return reply({error:'Acesso não autorizado.'},403);
 const admin=createAdminClient(), company=auth.access.company.id;
 const [bindings,events]=await Promise.all([
  admin.from('operational_group_bindings').select('*').eq('company_id',company),
  admin.from('operational_group_observations').select('*').eq('company_id',company).order('received_at',{ascending:false}).limit(100),
 ]);
 if(bindings.error||events.error) return reply({error:'Observação indisponível. Tente atualizar.'},503);
 const {data:{user}}=await auth.db.auth.getUser();
 return reply({bindings:bindings.data,events:events.data,canActivate:isConsultant(user)});
}
export async function POST(request:Request) {
 if(!sameOrigin(request)) return reply({error:'Origem inválida.'},403);
 const command=observationCommand.safeParse(await request.json().catch(()=>null));
 if(!command.success) return reply({error:'Comando inválido.'},400);
 const auth=await authorized(); if(!auth) return reply({error:'Acesso não autorizado.'},403);
 const {data:{user}}=await auth.db.auth.getUser();
 if(!user || !isConsultant(user)) return reply({error:'Vinculação restrita à consultoria.'},403);
 const admin=createAdminClient(), company=auth.access.company.id;
 const draft=await admin.from('consultancy_onboardings').select('consultant_until').eq('company_id',company).eq('consultant_id',user.id).maybeSingle();
 if(draft.error || (draft.data?.consultant_until && Date.parse(draft.data.consultant_until)<=Date.now())) return reply({error:'Acompanhamento encerrado.'},403);
 const registry=await admin.from('operational_group_registry').select('*').eq('company_id',company).eq('id',command.data.registryId).maybeSingle();
 if(registry.error || !registry.data || registry.data.archived) return reply({error:'Grupo não disponível nesta empresa.'},404);
 const existing=await admin.from('operational_group_bindings').select('*').eq('registry_id',registry.data.id).eq('company_id',company).maybeSingle();
 if(existing.error) return reply({error:'Não foi possível conferir o vínculo.'},503);
 if(command.data.action==='pause' && !existing.data) return reply({error:'Grupo ainda não vinculado.'},400);
 try {
  const now=new Date().toISOString();
  const result=existing.data ? await admin.from('operational_group_bindings').update({enabled:command.data.action==='activate',updated_at:now,updated_by:user.id}).eq('registry_id',registry.data.id).eq('company_id',company)
   : await admin.from('operational_group_bindings').insert({company_id:company,registry_id:registry.data.id,external_id:await findExactOperationalGroup(registry.data.name),enabled:true,updated_by:user.id,activated_at:now,updated_at:now});
  if(result.error) return reply({error:result.error.code==='23505'?'Grupo já vinculado. Atualize e confira a empresa.':'Não foi possível salvar o vínculo.'},409);
  return reply({ok:true});
 } catch(e) { return reply({error:e instanceof Error?e.message:'Não foi possível vincular.'},503); }
}
