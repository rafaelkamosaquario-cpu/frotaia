import {describe, expect, it} from "vitest";
import {nfcCommand, nfcPath, tagCanTransition} from "./nfc";
const id = "11111111-1111-4111-8111-111111111111";
const base = {companyId: id, action: "create", kind: "vehicle", vehicleId: id, label: "ONM1C53", physicalCode: ""};
describe("NFC configuration", () => {
  it("requires a saved vehicle and company", () => {
    expect(nfcCommand.safeParse(base).success).toBe(true);
    expect(nfcCommand.safeParse({...base, vehicleId: null}).success).toBe(false);
    expect(nfcCommand.safeParse({...base, companyId: ""}).success).toBe(false);
  });
  it("keeps pumps separate from vehicle tags", () => {
    expect(nfcCommand.safeParse({...base, kind: "pump", vehicleId: null}).success).toBe(true);
    expect(nfcCommand.safeParse({...base, kind: "pump"}).success).toBe(false);
  });
  it("rejects client tokens and status injection", () => {
    expect(nfcCommand.safeParse({...base, token: "chosen"}).success).toBe(false);
    expect(nfcCommand.safeParse({...base, status: "tested"}).success).toBe(false);
  });
  it("cannot reactivate or retest revoked tags", () => {
    expect(tagCanTransition("revoked", "tested")).toBe(false);
    expect(tagCanTransition("revoked", "revoke")).toBe(false);
    expect(tagCanTransition("pending", "tested")).toBe(true);
    expect(tagCanTransition("tested", "tested")).toBe(false);
    expect(tagCanTransition("tested", "revoke")).toBe(true);
  });
  it("encodes token paths without a company or driver credential", () => {
    expect(nfcPath("a/b")).toBe("/nfc/a%2Fb");
  });
});
