import {NextResponse} from "next/server";
import {tireCaseAccess} from "@/services/supabase/tireCaseAccess";
import {createAdminClient} from "@/lib/supabase/admin";
import {tireCasePdf} from "@/lib/frota/tireCasePdf";
import {caseSchema} from "@/lib/frota/tireCases";
import {z} from "zod";
export async function GET(request:Request){
 const access=await tireCaseAccess();if(!access)return new NextResponse(null,{status:403});
 const id=new URL(request.url).searchParams.get("id");if(!z.string().uuid().safeParse(id).success)return new NextResponse(null,{status:400});
 const {data,error}=await createAdminClient().from("consultant_tire_cases").select().eq("id",id!).eq("company_id",access.company.id).eq("actor_id",access.userId).maybeSingle();
 if(error||!data)return new NextResponse(null,{status:404});
 const bytes=await tireCasePdf({...data,data:caseSchema.parse(data.data)});
 return new NextResponse(Buffer.from(bytes),{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="acompanhamento-pneus-${data.id}.pdf"`,"Cache-Control":"private, no-store"}});
}
