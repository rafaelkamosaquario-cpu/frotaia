import {NextResponse} from "next/server";
import {individualAccess} from "@/services/supabase/individualAccess";
import {getGeneratedDocument} from "@/services/supabase/generatedDocumentService";
import {createAdminClient} from "@/lib/supabase/admin";
import {createSignedGeneratedDocumentUrl} from "@/lib/storage/generatedDocumentsStorage";
const headers={"Cache-Control":"private, no-store"};
export async function GET(_request:Request,context:{params:Promise<{id:string}>}) {
  try {
    const access=await individualAccess();
    if(!access.ok)return NextResponse.json({error:"Acesso não autorizado."},{status:access.status,headers});
    if(!access.enabled.includes("gerados"))return NextResponse.json({error:"Documentos não disponíveis para esta conta."},{status:403,headers});
    const {id}=await context.params;
    const doc=await getGeneratedDocument(access.client,id,access.company.id);
    if(!doc?.storage_path || !doc.storage_path.startsWith(`${access.company.id}/generated/`))return NextResponse.json({error:"Arquivo indisponível. Peça ao assistente para gerar novamente."},{status:404,headers});
    const url=await createSignedGeneratedDocumentUrl(createAdminClient(),doc.storage_path,doc.file_name);
    return NextResponse.json({url},{headers});
  }catch{return NextResponse.json({error:"Não foi possível abrir o PDF. Tente novamente."},{status:503,headers});}
}
