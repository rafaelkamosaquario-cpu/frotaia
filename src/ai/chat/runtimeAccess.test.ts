import { describe, it, expect } from "vitest";
import { runtimeAccessPrompt } from "./runtimeAccess";
describe("estado atual versus histórico de demonstração", () => {
 it("prioriza demonstração mesmo com acesso sinalizado", () => expect(runtimeAccessPrompt(true,true)).toContain("Mantenha as restrições"));
 it("trial válido não equivale a demo nem pagamento", () => {
  const text=runtimeAccessPrompt(false,true);
  expect(text).toContain("TRIAL válido permite uso operacional"); expect(text).toContain("não significa pagamento efetuado");
  expect(text).toContain("Respostas antigas");
 });
 it("não libera acesso bloqueado", () => expect(runtimeAccessPrompt(false,false)).toContain("não registre operações"));
 it("não inventa estado sem verificação", () => expect(runtimeAccessPrompt(false)).toContain("Consulte gerenciar_assinatura"));
});
