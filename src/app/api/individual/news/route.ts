import {NextResponse} from "next/server";
import {individualAccess} from "@/services/supabase/individualAccess";
import {getLatestNewsDigest} from "@/services/supabase/newsDigestArchiveService";
export async function GET() {
 try {
  const access=await individualAccess();
  if(!access.ok)return NextResponse.json({error:"Acesso ao aplicativo necessário."},{status:access.status});
  if(!access.enabled.includes("noticias"))return NextResponse.json({error:"Notícias não habilitadas."},{status:403});
  return NextResponse.json({digest:await getLatestNewsDigest(access.client)},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Notícias indisponíveis neste momento."},{status:503});}
}
