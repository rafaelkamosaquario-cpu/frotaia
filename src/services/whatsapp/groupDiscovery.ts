import 'server-only';
import { getWhatsappConfig } from '@/lib/whatsapp/config';
import { normalizedGroupName } from '@/lib/frota/groupObservation';
/** Read-only provider lookup. Never expose the shared instance's full group list. */
export async function findExactOperationalGroup(name:string): Promise<string> {
 const c=getWhatsappConfig(); const matches=new Set<string>();
 for(let page=1;page<=20;page++) {
  const r=await fetch(`https://api.z-api.io/instances/${c.ZAPI_INSTANCE_ID}/token/${c.ZAPI_INSTANCE_TOKEN}/groups?page=${page}&pageSize=10`,{headers:{'Client-Token':c.ZAPI_CLIENT_TOKEN},cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!r.ok) {
   const body=await r.json().catch(()=>null);
   let detail=typeof body?.error==='string'?body.error:typeof body?.message==='string'?body.message:'';
   for(const secret of Object.values(c)) if(secret) detail=detail.split(secret).join('[oculto]');
   detail=detail.replace(/https?:\/\/\S+/gi,'[endereço omitido]').slice(0,180);
   throw new Error(`Não foi possível consultar os grupos na Z-API (HTTP ${r.status}). ${detail} Nenhum grupo ativado.`);
  }
  const rows:unknown=await r.json();
  if(!Array.isArray(rows)) throw new Error('Formato inesperado da lista de grupos. Nenhum grupo ativado.');
  for(const row of rows) if(row && row.isGroup===true && typeof row.name==='string' && typeof row.phone==='string' && /^\d+-group$/.test(row.phone) && normalizedGroupName(row.name)===normalizedGroupName(name)) matches.add(row.phone);
  if(rows.length<10) {
   if(matches.size!==1) throw new Error(matches.size ? 'Há grupos com nomes iguais. A vinculação exige conferência do identificador.' : 'Grupo não encontrado. Confira o nome exato e se o Frota IA já participa.');
   return [...matches][0];
  }
 }
 throw new Error('Lista de grupos incompleta. Vinculação não realizada.');
}
