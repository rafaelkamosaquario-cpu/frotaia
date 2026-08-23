export const MENSAGEM_LIMITE_VEICULOS_ATIVOS =
  "Esta empresa já atingiu o limite de veículos ativos do plano atual. Contas sem o Painel de Gestão têm 1 veículo ativo; com o Painel de Gestão, até 10.";

/** O trigger enforce_vehicle_limit_by_entitlement (Onboarding 2, 08/2026) devolve essa mensagem via exceção do Postgres. */
export function isLimiteVeiculosAtivosError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string" &&
    (error as { message: string }).message.includes("já atingiu o limite de")
  );
}
