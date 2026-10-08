import { z } from "zod";

/** Modules are product capabilities, not row-level privacy boundaries. Financial summaries include historical records. */
export const COMPANY_MODULES = [
  { id: "frota", label: "Frota e motoristas", routes: ["veiculos", "motoristas"], tools: ["gerenciar_veiculo", "gerenciar_motorista"] },
  { id: "financeiro", label: "Resultados, receitas, despesas e remunerações", routes: ["resultados", "metas", "receitas", "clientes", "despesas", "custos", "abastecimentos", "estoque-diesel", "fornecedores", "relatorios"], tools: ["registrar_receita", "registrar_despesa", "gerenciar_abastecimento", "gerenciar_fornecedor", "calcular_combustivel", "calcular_cpk", "calcular_margem", "calcular_receita_km", "calcular_custo_dia", "calcular_custo_veiculo_parado"] },
  { id: "manutencao", label: "Manutenção", routes: ["manutencao"], tools: ["gerenciar_manutencao"] },
  { id: "pneus", label: "Pneus", routes: ["pneus"], tools: ["gerenciar_pneu_veiculo", "comparar_pneus"] },
  { id: "documentos", label: "Documentos da frota", routes: ["documentos"], tools: ["gerenciar_documento_frota"] },
  { id: "grupos", label: "Grupos do WhatsApp — painel de acompanhamento", routes: ["grupos"], tools: [] },
  { id: "avisos", label: "Avisos da operação", routes: ["alertas"], tools: ["gerenciar_alerta"] },
  { id: "agenda", label: "Agenda e lembretes Google", routes: ["agenda"], tools: ["gerenciar_google_calendar"] },
  { id: "fretes", label: "Análise de fretes", routes: ["fretes"], tools: ["analisar_frete", "verificar_piso_minimo_antt", "calcular_valor_minimo_frete", "calcular_custo_viagem"] },
  { id: "radar", label: "Radar de oportunidades", routes: ["oportunidades", "radares", "fontes-radar"], tools: ["gerenciar_radar_frete", "consultar_oportunidades_frete"] },
  { id: "rotas", label: "Rotas", routes: ["rotas"], tools: ["consultar_rota", "gerenciar_rota_salva"] },
  { id: "jornadas", label: "Jornadas", routes: ["jornadas"], tools: ["gerenciar_jornada_salva", "calcular_jornada"] },
  { id: "checklists", label: "Checklists", routes: ["checklists"], tools: ["consultar_checklist", "gerenciar_checklist_config"] },
  { id: "gerados", label: "Geração de documentos", routes: ["documentos-gerados"], tools: ["gerar_documento"] },
  { id: "noticias", label: "Notícias", routes: ["noticias"], tools: ["gerenciar_noticias_setor"] },
  { id: "assistente", label: "Assistente no painel", routes: [], tools: [] },
] as const;
export type CompanyModuleId = typeof COMPANY_MODULES[number]["id"];
export type CompanyModuleConfig = { company_id: string; enabled: string[]; revision: number; updated_at: string; updated_by: string };
export const ALL_MODULE_IDS = COMPANY_MODULES.map(m => m.id);
export const TIMBER_MODULE_IDS: CompanyModuleId[] = ["frota", "financeiro", "manutencao", "pneus", "documentos", "grupos", "avisos", "agenda", "assistente"];
export const moduleCommand = z.object({ companyId: z.string().uuid(), revision: z.number().int().min(0), enabled: z.array(z.enum(ALL_MODULE_IDS as [CompanyModuleId, ...CompanyModuleId[]])).max(ALL_MODULE_IDS.length) }).strict().refine(value => new Set(value.enabled).size === value.enabled.length, "Módulos duplicados").refine(value => !value.enabled.includes("financeiro") || value.enabled.includes("frota"), "Resultados financeiros exigem o cadastro da frota");
export function toggleCompanyModule(current: string[], id: string, checked: boolean) {
  if (checked) return [...new Set([...current, id, ...(id === "financeiro" ? ["frota"] : [])])];
  return current.filter(value => value !== id && !(id === "frota" && value === "financeiro"));
}
export function routeModule(path: string): CompanyModuleId | null {
  let normalized = path;
  try { normalized = decodeURIComponent(path); } catch { /* invalid URL is rejected by the router */ }
  const route = normalized.replace(/^\/api\/frota\//, "").replace(/^\/frota\//, "").split(/[/?#]/)[0];
  return COMPANY_MODULES.find(m => (m.routes as readonly string[]).includes(route))?.id ?? null;
}
export function modulePathAllowed(enabled: readonly string[] | null, path: string) {
  const capability = routeModule(path);
  return enabled === null || capability === null || enabled.includes(capability);
}
export function moduleToolAllowed(enabled: readonly string[] | null, tool: string) {
  if (enabled === null) return true;
  const capability = COMPANY_MODULES.find(m => (m.tools as readonly string[]).includes(tool));
  if (capability) return enabled.includes(capability.id);
  // Cross-module history can contain records from disabled modules; do not offer it in a restricted panel.
  if (tool === "consultar_historico") return enabled.length === ALL_MODULE_IDS.length;
  return ["definir_estilo_resposta", "consultar_conhecimento_operacional", "gerenciar_empresa", "gerenciar_memoria", "gerenciar_assinatura", "vincular_painel"].includes(tool);
}
