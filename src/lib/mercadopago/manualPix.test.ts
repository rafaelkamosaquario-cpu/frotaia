import { describe, expect, it } from "vitest";
import { DIRECT_PLANS } from "./directSales";
import { CATALOGO_OFERTAS, formatarReais } from "./catalog";
import { manualPixCode, manualPixMessage, pixCrc16, MANUAL_PIX_KEY } from "./manualPix";
function fields(s: string) {
 const values: Record<string,string> = {};
 for (let i=0;i<s.length;) {const id=s.slice(i,i+2), size=Number(s.slice(i+2,i+4)); expect(Number.isInteger(size)).toBe(true); values[id]=s.slice(i+4,i+4+size);expect(values[id]).toHaveLength(size);i+=4+size;expect(i).toBeLessThanOrEqual(s.length);}
 return values;
}
describe("Pix estático para compartilhamento manual", () => {
 it("matches independent CRC check vector and supplied Pix", () => {
  expect(pixCrc16("123456789")).toBe("29B1");
  const supplied="00020126360014br.gov.bcb.pix0114+5541997295836520400005303986540589.905802BR5918Frotaia Assistente6009Sao Paulo62230519daqr4630366342640606304717A";
  expect(pixCrc16(supplied.slice(0,-4))).toBe("717A");
 });
 it.each(DIRECT_PLANS)("encodes correct price, recipient, lengths and checksum for %s", plan => {
  const code=manualPixCode(plan), f=fields(code);
  expect(f["00"]).toBe("01");expect(f["53"]).toBe("986");expect(f["58"]).toBe("BR");
  expect(f["54"]).toBe((CATALOGO_OFERTAS[plan].precoCentavos/100).toFixed(2));
  expect(fields(f["26"])["01"]).toBe(MANUAL_PIX_KEY);expect(fields(f["62"])["05"]).toBe("***");
  expect(f["63"]).toBe(pixCrc16(code.slice(0,-4)));
  const message=manualPixMessage(plan);expect(message).toContain(code);expect(message).toContain(formatarReais(CATALOGO_OFERTAS[plan].precoCentavos));expect(message).toContain("Vou conferir o recebimento e liberar");
 });
 it("rejects unsupported plans",()=>expect(()=>manualPixCode("TRIAL" as typeof DIRECT_PLANS[number])).toThrow("Plano inválido"));
});
