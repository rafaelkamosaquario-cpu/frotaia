import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe,it,expect } from "vitest";
import { ObservationReviewCard } from "./ObservationReviewCard";
import type { GroupObservation } from "@/lib/frota/groupObservation";
const event: GroupObservation={id:"o",company_id:"c",registry_id:"g",message_id:"m",received_at:"2026-10-12T12:00:00Z",sender_name:"Exemplo",kind:"foto",original_text:"",status:"review",summary:"150 L",evidence:{}};
describe("card de conferência",()=>{
 it("explica etapas sem afirmar que interpretação lançou valor",()=>{const html=renderToStaticMarkup(<ObservationReviewCard event={event} groupName="Grupo" onSaved={async()=>{}} />);expect(html).toContain("aguardando conferência");expect(html).toContain("Conferir e vincular lançamento");expect(html).toContain("Sem respostas ao grupo");});
 it("só apresenta vínculo confirmado quando há lançamento",()=>{const html=renderToStaticMarkup(<ObservationReviewCard event={{...event,fuel_fillup_id:"record",reviewed_at:"2026-10-12T12:00:00Z"}} groupName="Grupo" onSaved={async()=>{}} />);expect(html).toContain("Registrado · lançamento vinculado");expect(html).not.toContain("Conferir e vincular lançamento");});
});
