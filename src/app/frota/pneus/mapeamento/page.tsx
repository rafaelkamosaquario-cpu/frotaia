import {redirect} from "next/navigation";
export default async function Page({searchParams}:{searchParams:Promise<{cliente?:string}>}){const {cliente}=await searchParams;redirect("/acompanhamento-pneus/mapeamento"+(cliente?"?cliente="+encodeURIComponent(cliente):""));}
