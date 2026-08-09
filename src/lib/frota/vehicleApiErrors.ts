export const MENSAGEM_UM_VEICULO_ATIVO =
  "Esta empresa já tem um veículo ativo — só empresas do tipo transportadora podem ter mais de um.";

/** O trigger enforce_one_vehicle_for_individual_accounts (Fase 1) devolve essa mensagem via exceção do Postgres. */
export function isUmVeiculoAtivoError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string" &&
    (error as { message: string }).message.includes("já tem um veículo ativo")
  );
}
