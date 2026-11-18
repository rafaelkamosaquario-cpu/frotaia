import {describe,it,expect} from "vitest";
import {canShareRelease,directReleaseMessage,type DirectReceipt,type DirectSubscription} from "./directReleaseMessage";
const now=Date.parse("2026-11-18T15:00:00Z");
const receipt:DirectReceipt={id:"r1",company_id:"c1",reference:"123456",plan:"INDIVIDUAL_MENSAL",amount_cents:8990,access_until:"2026-12-18T14:27:43Z"};
const subscription:DirectSubscription={plan:receipt.plan,status:"ATIVA",valido_ate:receipt.access_until,hasProviderLink:false};
describe("mensagem recuperada da liberação Pix",()=>{
 it("recupera liberação vigente do mesmo cadastro",()=>expect(canShareRelease(receipt,"c1",subscription,now)).toBe(true));
 it("não anuncia liberação de outra empresa, vencida, cancelada ou outro plano",()=>{
  expect(canShareRelease(receipt,"c2",subscription,now)).toBe(false);
  expect(canShareRelease(receipt,"c1",{...subscription,status:"CANCELADA"},now)).toBe(false);
  expect(canShareRelease(receipt,"c1",{...subscription,plan:"TRIAL"},now)).toBe(false);
  expect(canShareRelease(receipt,"c1",subscription,Date.parse("2027-01-01"))).toBe(false);
  expect(canShareRelease(receipt,"c1",null,now)).toBe(false);
 });
 it("usa validade gravada e distingue aplicativo opcional",()=>{
  const message=directReleaseMessage(receipt,"+554298006380");
  expect(message).toContain("18/12/2026");
  expect(message).toContain("11:27:43");
  expect(message).toContain("+554298006380");
  expect(message).toContain("https://wa.me/5541997454382");
  expect(message).toContain("contratado separadamente");
  expect(message).toContain("R$ 9,90");
 });
});
