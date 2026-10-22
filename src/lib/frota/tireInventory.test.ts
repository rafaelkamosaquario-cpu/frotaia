import {describe,it,expect} from "vitest";
import {applyCommand,emptyInventory,positions,type Command,type Inventory} from "./tireInventory";
const customer={name:"Cliente de teste",document:"",address:"",phone:""};
const vehicle={id:"11111111-1111-4111-8111-111111111111",plate:"ABC1D23",model:"Cavalo",layout:"cavalo6x2" as const,spares:1};
const batch:Command={type:"batch",date:"2026-10-01",product:{brand:"Teste",model:"Modelo",size:"295",tread:"Misto",life:"Novo"},tires:[{fire:"",dot:"2024",serial:"",marked:false},{fire:"",dot:"",serial:"",marked:false}]};
function fixture(){return applyCommand(applyCommand(emptyInventory(customer),{type:"vehicle",vehicle}),batch);}
const move=(s:Inventory,destination:"estoque"|"montado"|"servico"|"baixado",position:string|null=null)=>applyCommand(s,{type:"move",tireId:s.tires[0].id,date:"2026-10-02",km:null,reason:"Teste de operação",destination,vehicleId:position?vehicle.id:null,position});
describe("inventário privado de pneus",()=>{
 it("gera fogo único sequencial e mantém a origem intacta",()=>{const s=emptyInventory(customer),next=applyCommand(s,batch);expect(s.tires).toHaveLength(0);expect(next.tires.map(t=>t.fire)).toEqual(["0001","0002"]);expect(next.movements).toHaveLength(2);});
 it("mapeia dez rodas no cavalo e dezesseis na carreta, além de estepes",()=>{expect(positions(vehicle)).toHaveLength(11);expect(positions({...vehicle,layout:"tanque4",spares:2})).toHaveLength(18);});
 it("monta e retorna ao estoque preservando histórico",()=>{const s=move(move(fixture(),"montado","E2-P1"),"estoque");expect(s.tires[0].vehicleId).toBeNull();expect(s.movements).toHaveLength(4);});
 it("rejeita posição ocupada",()=>{const s=move(fixture(),"montado","E2-P1");expect(()=>applyCommand(s,{type:"move",tireId:s.tires[1].id,date:"2026-10-02",km:null,reason:"Teste",destination:"montado",vehicleId:vehicle.id,position:"E2-P1"})).toThrow("ocupada");});
 it("não aceita pneu de outra empresa",()=>{expect(()=>applyCommand(fixture(),{type:"identity",tireId:crypto.randomUUID(),identity:{fire:"0001",dot:"",serial:"",marked:false}})).toThrow("não pertence");});
 it("baixa sem apagar e impede retorno",()=>{const s=move(fixture(),"baixado");expect(s.tires).toHaveLength(2);expect(()=>move(s,"estoque")).toThrow("baixado");});
 it("não recicla número baixado nem permite equivalente com zeros",()=>{const s=move(fixture(),"baixado");expect(()=>applyCommand(s,{...batch,tires:[{fire:"1",dot:"",serial:"",marked:false}]})).toThrow("já utilizado");});
 it("rejeita duas identidades iguais no lote sem aplicação parcial",()=>{const s=fixture();expect(()=>applyCommand(s,{...batch,tires:[{fire:"3",dot:"",serial:"",marked:false},{fire:"03",dot:"",serial:"",marked:false}]})).toThrow();expect(s.tires).toHaveLength(2);});
 it("rejeita posição inexistente e data anterior",()=>{const s=fixture();expect(()=>move(s,"montado","E9-P9")).toThrow();expect(()=>applyCommand(s,{type:"move",tireId:s.tires[0].id,date:"2026-09-01",km:null,reason:"Teste",destination:"baixado",vehicleId:null,position:null})).toThrow("data");});
 it("valida datas reais, motivo obrigatório e não aceita campos extras",()=>{expect(()=>applyCommand(fixture(),{...batch,date:"2026-02-30"})).toThrow();expect(()=>applyCommand(fixture(),{type:"customer",customer,history:[]})).toThrow();});
 it("permite completar identificação sem mudar o fogo",()=>{const s=fixture();const next=applyCommand(s,{type:"identity",tireId:s.tires[0].id,identity:{fire:"0001",dot:"2024",serial:"ABC",marked:true}});expect(next.tires[0].marked).toBe(true);expect(next.movements.at(-1)?.reason).toContain("Identificação");expect(()=>applyCommand(s,{type:"identity",tireId:s.tires[0].id,identity:{fire:"9999",dot:"",serial:"",marked:true}})).toThrow("permanente");});
 it("exige placa única por cliente",()=>{const s=fixture();expect(()=>applyCommand(s,{type:"vehicle",vehicle:{...vehicle,id:crypto.randomUUID()}})).toThrow("já cadastrados");});
});

