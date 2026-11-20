import type {Metadata} from "next";
export const metadata:Metadata={
 applicationName:"RodoCore",
 description:"Painel mestre RodoCore: gestão de clientes, acompanhamento de pneus e operação.",
 robots:{index:false,follow:false},
 openGraph:{type:"website",locale:"pt_BR",siteName:"RodoCore",title:"RodoCore · Painel mestre",description:"Gestão de clientes, acompanhamento de pneus e operação.",url:"https://frotaia.up.railway.app/administracao",images:[{url:"https://frotaia.up.railway.app/brand/rodocore/r-512-v1.png",width:512,height:512,alt:"Logo RodoCore"}]},
 twitter:{card:"summary",title:"RodoCore · Painel mestre",description:"Gestão de clientes, acompanhamento de pneus e operação.",images:["https://frotaia.up.railway.app/brand/rodocore/r-512-v1.png"]},
 manifest:"/rodocore.webmanifest",
 appleWebApp:{capable:true,title:"RodoCore",statusBarStyle:"black-translucent"},
 icons:{icon:[{url:"/brand/rodocore/r-48-v1.png",sizes:"48x48",type:"image/png"}],apple:[{url:"/brand/rodocore/r-180-v1.png",sizes:"180x180",type:"image/png"}]}
};
export default function Layout({children}:{children:React.ReactNode}){return children;}
