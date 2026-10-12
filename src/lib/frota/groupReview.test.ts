import { describe, it, expect } from "vitest";
import { groupReviewCommand, observationStage } from "./groupReview";
import type { GroupObservation } from "./groupObservation";
const event: GroupObservation = { id:"10000000-0000-4000-8000-000000000001", company_id:"c", registry_id:"g", message_id:"m", received_at:"2026-10-12", sender_name:"Motorista", kind:"image", original_text:"", summary:"", evidence:{}, status:"review" };
describe("conferência de grupos", () => {
  it("nunca transforma interpretação ou anotação em lançamento", () => {
    expect(observationStage(event).index).toBe(2);
    expect(observationStage({ ...event, reviewed_at:"2026-10-12", review_note:"Conferido" }).index).toBe(2);
    expect(observationStage({ ...event, status:"processing" }).index).toBe(0);
    expect(observationStage({ ...event, status:"unreadable" }).index).toBe(1);
    expect(observationStage({ ...event, fuel_fillup_id:"real-record" }).index).toBe(3);
  });
  it("exige confirmação explícita, observação e IDs válidos", () => {
    const valid = { observationId:event.id, recordId:event.id, recordType:"fuel", confirmed:true, note:"Original conferido" };
    expect(groupReviewCommand.safeParse(valid).success).toBe(true);
    for (const patch of [{confirmed:false},{note:""},{recordId:"outro"},{recordType:"expense"},{companyId:"outra"}]) expect(groupReviewCommand.safeParse({...valid,...patch}).success).toBe(false);
  });
});
