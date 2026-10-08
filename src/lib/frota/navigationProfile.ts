/** Initial navigation preset. It does not change product entitlements or stored data. */
export const isTimberNavigation = (companyId: string) => companyId === "0fba8f5d-ee49-4b94-bbe5-5b34a33e88ac";

export const TIMBER_PRIMARY = [
  { href: "/frota/dashboard", label: "Visão da operação" },
  { href: "/frota/veiculos", label: "Minha frota" },
  { href: "/frota/resultados", label: "Resultado mensal" },
  { href: "/frota/grupos", label: "Grupos do WhatsApp" },
  { href: "/frota/alertas", label: "Avisos da operação" },
  { href: "/frota/empresa", label: "Minha empresa" },
];

export const TIMBER_SUPPORT = ["motoristas", "abastecimentos", "receitas", "despesas", "custos", "manutencao", "pneus", "documentos", "fornecedores", "agenda", "relatorios", "configuracoes"].map(key => `/frota/${key}`);
