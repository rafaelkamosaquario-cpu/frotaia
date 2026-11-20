import type {Metadata} from "next";
export const metadata:Metadata={
 applicationName:"RodoCore",
 manifest:"/rodocore.webmanifest",
 appleWebApp:{capable:true,title:"RodoCore",statusBarStyle:"black-translucent"},
 icons:{icon:[{url:"/brand/rodocore/r-48-v1.png",sizes:"48x48",type:"image/png"}],apple:[{url:"/brand/rodocore/r-180-v1.png",sizes:"180x180",type:"image/png"}]}
};
export default function Layout({children}:{children:React.ReactNode}){return children;}
