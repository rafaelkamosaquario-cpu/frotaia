"use client";
import type {TireCaseRow} from "@/lib/frota/tireCases";
import {TirePdfActions} from "@/app/acompanhamento-pneus/previa/TirePdfActions";
export function TireCaseReport({row}:{row:TireCaseRow}){return <section className="rounded-xl border border-border p-4"><h2 className="font-semibold">Ficha visual para o cliente</h2><a href={`/acompanhamento-pneus/previa?cliente=${row.id}`}>Abrir ficha compacta</a><TirePdfActions url={`/api/frota/pneus/cases/pdf?id=${row.id}`} plate={row.data.plate}/></section>;}
