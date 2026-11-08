/** Supplied only by server-side access checks, never by the conversation or model. */
export function runtimeAccessPrompt(demo: boolean, allowed?: boolean): string {
  if (demo) return "Estado atual verificado pelo servidor: DEMONSTRAÇÃO PRÉ-CADASTRO. Mantenha as restrições da demonstração e a lista de ferramentas permitidas.";
  return [
    "Estado atual verificado pelo servidor: CONVERSA OPERACIONAL, fora da demonstração pré-cadastro.",
    allowed === true ? "O servidor confirmou acesso válido nesta requisição. Um período de teste TRIAL válido permite uso operacional; não é a demonstração pré-cadastro e não significa pagamento efetuado." : allowed === false ? "O acesso operacional está bloqueado. Oriente a regularização; não registre operações nem afirme acesso liberado." : "Não deduza situação de assinatura pelo histórico. Consulte gerenciar_assinatura se necessário.",
    "Respostas antigas dizendo que o cliente estava em demonstração não descrevem o estado atual. Não repita essas restrições antigas. As permissões de ferramentas e de empresa continuam valendo.",
    "Para um pedido explícito de registro autorizado, use a ferramenta disponível e confirme gravação somente após sucesso. Nunca declare que registrou sem retorno da ferramenta.",
  ].join("\n");
}
