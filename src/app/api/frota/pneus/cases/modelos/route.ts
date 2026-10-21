import {readFile} from "node:fs/promises";
import path from "node:path";
import {NextResponse} from "next/server";
import {tireCaseAccess} from "@/services/supabase/tireCaseAccess";

export const runtime = "nodejs";
const files = new Map([
  ["cavalo-tracao", "cavalo-tracao.pdf"],
  ["carreta-tanque", "carreta-tanque.pdf"],
]);

export async function GET(request: Request) {
  if (!await tireCaseAccess()) return new NextResponse(null, {status:403});
  const query = new URL(request.url).searchParams;
  const filename = files.get(query.get("modelo") ?? "");
  if (!filename) return new NextResponse(null, {status:400});
  try {
    const bytes = await readFile(path.join(process.cwd(), "private-assets", "tire-mapping", filename));
    return new NextResponse(bytes, {headers:{
      "Content-Type":"application/pdf",
      "Content-Disposition":`${query.get("download") === "1" ? "attachment" : "inline"}; filename="mapeamento-${filename}"`,
      "Cache-Control":"private, no-store",
      "X-Content-Type-Options":"nosniff",
    }});
  } catch {
    return NextResponse.json({error:"Modelo indisponível. Tente novamente mais tarde."}, {status:503});
  }
}
