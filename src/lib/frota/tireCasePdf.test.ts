import {it,expect} from "vitest";
import {PDFDocument} from "pdf-lib";
import {writeFileSync,mkdirSync} from "node:fs";
import {tireCasePdf} from "./tireCasePdf";
import type {TireCaseRow} from "./tireCases";
it("gera documento com histórico longo sem perder páginas",async()=>{
 const id="00000000-0000-4000-8000-000000000001";
 const row:TireCaseRow={id,company_id:id,actor_id:id,version:1,created_at:"",updated_at:"",data:{client:{name:"CLIENTE FICTÍCIO - DEMONSTRAÇÃO",document:"Não informado",address:"Dados ilustrativos",phone:""},plate:"ABC1D23",vehicle:"Caminhão 6x4",operation:"Demonstração - sem registro real",baseline:{product:"Pneu anterior (exemplo)",cost:1800,distance:60000,basis:"medido",notes:"Simulação"},tires:[{id,code:"DEMO-01",product:"Recapagem de demonstração",brand:"Exemplo",model:"Tração",size:"295/80 R22.5",life:"1ª recapagem",position:"Eixo 2 - esquerdo externo",mountedAt:"2026-09-01",mountedKm:100000,cost:900,targetKm:135000,advice:"Conferir rodízio e condições com o responsável técnico; orientação ilustrativa."}],events:Array.from({length:25},(_,i)=>({id:crypto.randomUUID(),tireId:id,date:`2026-09-${String(i+2).padStart(2,'0')}`,km:100000+i*1000,type:"Leitura" as const,position:"",notes:"Leitura de demonstração registrada para conferência do acompanhamento.",evidence:[]})),notes:"MODELO DE TESTE. Não representa resultado de cliente real."}};
 const bytes=await tireCasePdf(row);const pdf=await PDFDocument.load(bytes);expect(pdf.getPageCount()).toBeGreaterThan(1);
 mkdirSync("../../tmp/pdfs",{recursive:true});writeFileSync("../../tmp/pdfs/acompanhamento-demo.pdf",bytes);
});
