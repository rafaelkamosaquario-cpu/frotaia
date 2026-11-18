import {describe,it,expect} from "vitest";
import {addonAllowed,addonToolAllowed,addonPaymentValid,parseAddonReference,type AddonState} from "./addon";
const active:AddonState={allowed:true,baseActive:true,preserved:false,until:"2030-01-01"};
describe("adicional individual",()=>{
 it("exige plano-base e vencimento futuro",()=>{expect(addonAllowed(true,false,"2030-01-01",0)).toBe(true);expect(addonAllowed(false,false,"2030-01-01",0)).toBe(false);expect(addonAllowed(true,false,"2020-01-01")).toBe(false);expect(addonAllowed(true,false,null)).toBe(false);});
 it("preserva contrato anterior apenas com base ativa",()=>{expect(addonAllowed(true,true,null)).toBe(true);expect(addonAllowed(false,true,null)).toBe(false);});
 it.each(["gerar_documento","gerenciar_alerta","gerenciar_google_calendar"])("separa %s por canal e direito",tool=>{expect(addonToolAllowed(tool,active,true)).toBe(false);expect(addonToolAllowed(tool,active,false)).toBe(true);expect(addonToolAllowed(tool,{...active,allowed:false},false)).toBe(false);expect(addonToolAllowed(tool,{...active,preserved:true},true)).toBe(true);});
 it("não ativa notícias automáticas de WhatsApp para novo adicional",()=>expect(addonToolAllowed("gerenciar_noticias_setor",active,false)).toBe(false));
 it("mantém ferramentas-base",()=>expect(addonToolAllowed("registrar_despesa",{...active,allowed:false},true)).toBe(true));
 it("confere valor e moeda",()=>{expect(addonPaymentValid(990,"BRL")).toBe(true);for(const amount of [0,99,989,991,8990])expect(addonPaymentValid(amount,"BRL")).toBe(false);expect(addonPaymentValid(990,"USD")).toBe(false);});
 it("não confunde assinatura base e adicional",()=>{const id="12345678-1234-1234-1234-123456789012";expect(parseAddonReference(id+"|APP_INDIVIDUAL_1M")).toBe(id);expect(parseAddonReference(id+"|INDIVIDUAL_MENSAL")).toBeNull();expect(parseAddonReference(id+"|APP_INDIVIDUAL_1M|x")).toBeNull();});
});
