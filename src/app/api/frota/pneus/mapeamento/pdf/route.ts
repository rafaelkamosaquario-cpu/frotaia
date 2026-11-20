import {NextResponse} from "next/server";
import {z} from "zod";
import {tireCaseAccess} from "@/services/supabase/tireCaseAccess";
import {createAdminClient} from "@/lib/supabase/admin";
import {inventorySheetData,tireSheetPdf} from "@/lib/frota/tireSheetPdf";
import type {InventoryRow} from "@/lib/frota/tireInventory";
export const runtime="nodejs";
export async function GET(request:Request){
 const a=await tireCaseAccess();if(!a)return new NextResponse(null,{status:403});
 const q=new URL(request.url).searchParams,id=q.get('id'),vehicle=q.get('vehicle');
 if(!z.string().uuid().safeParse(id).success||!z.string().uuid().safeParse(vehicle).success)return new NextResponse(null,{status:400});
 const db=createAdminClient();const {data,error}=await db.from('consultant_tire_inventory').select().eq('id',id!).eq('company_id',a.company.id).eq('actor_id',a.userId).maybeSingle();
 if(error||!data)return new NextResponse(null,{status:404});
 const row=data as InventoryRow;if(!row.data.vehicles.some(v=>v.id===vehicle))return new NextResponse(null,{status:404});
 if(row.source_case_id){const {data:source,error:sourceError}=await db.from('consultant_tire_cases').select('data').eq('id',row.source_case_id).eq('company_id',a.company.id).eq('actor_id',a.userId).maybeSingle();if(sourceError)return new NextResponse(null,{status:503});if(source)row.data.customer=source.data.client;}
 const sheet=inventorySheetData(row,vehicle!);const bytes=await tireSheetPdf(sheet);
 const file=`RodoCore-${sheet.plate.replace(/[^A-Z0-9]/gi,'')}-pneus.pdf`;
 return new NextResponse(Buffer.from(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`${q.get('inline')==='1'?'inline':'attachment'}; filename="${file}"`,'Cache-Control':'private, no-store'}});
}
