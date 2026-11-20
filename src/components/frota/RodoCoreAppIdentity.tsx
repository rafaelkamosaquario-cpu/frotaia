"use client";
import {useEffect} from "react";
import {usePathname} from "next/navigation";

/** The master panel has its own installation identity; customer apps keep theirs. */
export function RodoCoreAppIdentity(){
 const pathname=usePathname();
 useEffect(()=>{
  const restore:(()=>void)[]=[];
  function links(rel:string,href:string,sizes?:string){
   const existing=Array.from(document.head.querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"]`));
   const targets=existing.length?existing:[document.createElement("link")];
   for(const link of targets){
    const attrs=Array.from(link.attributes).map(a=>[a.name,a.value]);
    if(!existing.length){link.rel=rel;document.head.appendChild(link);}
    link.href=href;
    if(sizes){link.sizes.value=sizes;link.type="image/png";}
    restore.push(()=>{if(!existing.length)link.remove();else{for(const a of Array.from(link.attributes))link.removeAttribute(a.name);for(const [name,value] of attrs)link.setAttribute(name,value);}});
   }
  }
  function meta(name:string,content:string){
   const existing=document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
   const tag=existing??document.createElement("meta"),previous=tag.content;
   if(!existing){tag.name=name;document.head.appendChild(tag);}tag.content=content;
   restore.push(()=>{if(existing)tag.content=previous;else tag.remove();});
  }
  links("manifest","/rodocore.webmanifest");
  links("icon","/brand/rodocore/r-48-v1.png","48x48");
  links("apple-touch-icon","/brand/rodocore/r-180-v1.png","180x180");
  meta("apple-mobile-web-app-title","RodoCore");
  meta("application-name","RodoCore");
  return()=>restore.reverse().forEach(fn=>fn());
 },[pathname]);
 return null;
}
