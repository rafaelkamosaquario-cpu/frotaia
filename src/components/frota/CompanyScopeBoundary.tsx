"use client";
import { useEffect, useState } from "react";
import { scopedCompanyFetch } from "@/lib/frota/companyScope";

/** Pin fetches (including RSC and server actions) to the company visible in this tab. */
export function CompanyScopeBoundary({ companyId, children }: { companyId:string; children:React.ReactNode }) {
 const [ready,setReady]=useState(false);
 useEffect(()=>{
  const previous=window.fetch;
  const scoped=scopedCompanyFetch(previous,companyId,window.location.href);
  window.fetch=scoped;
  // Children must not mount/fetch until this external request adapter is installed.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setReady(true);
  return ()=>{if(window.fetch===scoped)window.fetch=previous;};
 },[companyId]);
 return ready?children:<p role="status" className="p-6">Preparando o ambiente da empresa…</p>;
}
