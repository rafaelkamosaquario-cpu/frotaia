import { z } from "zod";

/**
 * Schemas Zod para tudo que a Camada 3 grava no Supabase. Validação de
 * entrada acontece aqui — nunca confiar apenas no que o frontend mandou.
 * Um schema por domínio, reaproveitando os validadores primitivos abaixo.
 */

// ── Validadores primitivos reutilizáveis ────────────────────────────────

export const uuidSchema = z.string().uuid("UUID inválido.");

export const phoneE164Schema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, "Telefone deve estar em E.164 (ex.: +5511999998888).");

export const plateSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/, "Placa em formato inválido (esperado ABC1234 ou ABC1D23).");

export const monetarySchema = z.number().finite().nonnegative("Valor monetário não pode ser negativo.");

export const percentageSchema = z.number().finite().min(0, "Percentual não pode ser negativo.").max(100, "Percentual não pode passar de 100.");

export const confidenceSchema = z.number().finite().min(0).max(1, "confidence deve estar entre 0 e 1.");

export const consumptionKmLSchema = z.number().finite().positive("Consumo deve ser maior que zero.");

export const speedKmhSchema = z.number().finite().positive().max(150, "Velocidade média fora de faixa operacional plausível (até 150 km/h).");

const maxText = (max: number, label: string) => z.string().trim().max(max, `${label} excede o tamanho máximo de ${max} caracteres.`);

export const jsonMetadataSchema = z.record(z.string(), z.unknown()).default({});

// ── profile ──────────────────────────────────────────────────────────────

export const profileUpdateSchema = z.object({
  fullName: maxText(200, "Nome").optional(),
  phoneE164: phoneE164Schema.optional(),
  avatarUrl: z.string().url().optional(),
  timezone: maxText(64, "Timezone").optional(),
  locale: maxText(16, "Locale").optional(),
  onboardingCompleted: z.boolean().optional(),
});

// ── company ──────────────────────────────────────────────────────────────

export const companyTypeSchema = z.enum(["autonomo", "transportadora", "embarcador", "outro"]);

export const companyCreateSchema = z.object({
  name: maxText(200, "Nome da empresa").min(1, "Nome da empresa é obrigatório."),
  tradeName: maxText(200, "Nome fantasia").optional(),
  documentType: z.enum(["cpf", "cnpj", "outro"]).optional(),
  documentNumber: maxText(32, "Documento").optional(),
  companyType: companyTypeSchema.default("autonomo"),
  city: maxText(120, "Cidade").optional(),
  state: maxText(2, "UF").optional(),
  countryCode: maxText(2, "País").default("BR"),
  timezone: maxText(64, "Timezone").default("America/Sao_Paulo"),
});

export const companyUpdateSchema = companyCreateSchema.partial();

// ── WhatsApp / channel identity ──────────────────────────────────────────

export const channelIdentitySchema = z.object({
  channelType: z.enum(["whatsapp", "web", "outro"]).default("whatsapp"),
  provider: z.enum(["z_api", "internal", "outro"]).default("z_api"),
  externalUserId: maxText(128, "external_user_id").min(1),
  phoneE164: phoneE164Schema.optional(),
  displayName: maxText(120, "Nome de exibição").optional(),
  metadata: jsonMetadataSchema.optional(),
});

// ── vehicle ──────────────────────────────────────────────────────────────

export const vehicleTypeSchema = z.enum([
  "utilitario",
  "tres_quartos",
  "toco",
  "truck",
  "cavalo_mecanico",
  "carreta",
  "bitrem",
  "rodotrem",
  "onibus",
  "outro",
]);

export const fuelTypeSchema = z.enum(["diesel_s10", "diesel_s500", "gasolina", "etanol", "eletrico", "outro"]);

export const vehicleCreateSchema = z.object({
  name: maxText(120, "Nome do veículo").optional(),
  plate: plateSchema.optional(),
  vehicleType: vehicleTypeSchema.optional(),
  brand: maxText(80, "Marca").optional(),
  model: maxText(80, "Modelo").optional(),
  modelYear: z.number().int().min(1970).max(2100).optional(),
  fuelType: fuelTypeSchema.optional(),
  averageConsumptionKmL: consumptionKmLSchema.optional(),
  averageSpeedKmh: speedKmhSchema.optional(),
  loadCapacityKg: z.number().finite().nonnegative().optional(),
  currentOdometerKm: z.number().finite().nonnegative().optional(),
  axleCount: z.number().int().min(1).max(12).optional(),
  insuranceExpiryDate: z.string().date().optional(),
  licensingExpiryDate: z.string().date().optional(),
  notes: maxText(2000, "Observações").optional(),
  active: z.boolean().optional(),
});

export const vehicleUpdateSchema = vehicleCreateSchema.partial();

// ── driver ───────────────────────────────────────────────────────────────

export const driverCreateSchema = z.object({
  name: maxText(120, "Nome do motorista"),
  phoneE164: phoneE164Schema.optional(),
  vehicleId: uuidSchema.nullable().optional(),
  cnhExpiryDate: z.string().date().optional(),
  toxicologicoExpiryDate: z.string().date().optional(),
  active: z.boolean().optional(),
});

export const driverUpdateSchema = driverCreateSchema.partial();

// ── maintenance schedule ─────────────────────────────────────────────────

export const maintenanceStatusSchema = z.enum(["pendente", "agendado", "concluido", "cancelado"]);

export const maintenanceScheduleCreateSchema = z.object({
  vehicleId: uuidSchema,
  type: maxText(120, "Tipo de manutenção").min(1, "Tipo é obrigatório."),
  dueDate: z.string().date(),
  status: maintenanceStatusSchema.optional(),
  notes: maxText(2000, "Observações").optional(),
});

export const maintenanceScheduleUpdateSchema = maintenanceScheduleCreateSchema.partial();

// ── vehicle document ─────────────────────────────────────────────────────

export const vehicleDocumentTypeSchema = z.enum(["tacografo", "rntrc", "cnh", "toxicologico", "seguro", "licenciamento"]);

const vehicleDocumentFields = z.object({
  documentType: vehicleDocumentTypeSchema,
  vehicleId: uuidSchema.nullable().optional(),
  driverId: uuidSchema.nullable().optional(),
  expiryDate: z.string().date().optional(),
  notes: maxText(2000, "Observações").optional(),
});

/** Espelha o CHECK vehicle_documents_exactly_one_owner do banco (Fase 1). */
const exactlyOneOwner = (data: { vehicleId?: string | null; driverId?: string | null }) =>
  (data.vehicleId ? 1 : 0) + (data.driverId ? 1 : 0) === 1;

export const vehicleDocumentCreateSchema = vehicleDocumentFields.refine(exactlyOneOwner, {
  message: "Selecione um veículo OU um motorista — nunca os dois, nunca nenhum.",
  path: ["vehicleId"],
});

export const vehicleDocumentUpdateSchema = vehicleDocumentFields.partial().refine(
  (data) => (data.vehicleId === undefined && data.driverId === undefined ? true : exactlyOneOwner(data)),
  { message: "Selecione um veículo OU um motorista — nunca os dois, nunca nenhum.", path: ["vehicleId"] }
);

// ── vehicle cost profile ─────────────────────────────────────────────────

const vehicleCostProfileFields = z.object({
  vehicleId: uuidSchema,
  effectiveFrom: z.string().date().optional(),
  effectiveTo: z.string().date().optional(),
  fuelPricePerLiter: monetarySchema.optional(),
  fixedCostPerDay: monetarySchema.optional(),
  fixedCostPerMonth: monetarySchema.optional(),
  maintenanceCostPerKm: monetarySchema.optional(),
  tireCostPerKm: monetarySchema.optional(),
  depreciationCostPerKm: monetarySchema.optional(),
  driverCostPerDay: monetarySchema.optional(),
  otherCostPerKm: monetarySchema.optional(),
  targetMarginPercent: percentageSchema.optional(),
});

const effectivePeriodValid = (data: { effectiveFrom?: string; effectiveTo?: string }) =>
  !data.effectiveTo || !data.effectiveFrom || data.effectiveTo >= data.effectiveFrom;

export const vehicleCostProfileCreateSchema = vehicleCostProfileFields.refine(effectivePeriodValid, {
  message: "effectiveTo não pode ser anterior a effectiveFrom.",
  path: ["effectiveTo"],
});

export const vehicleCostProfileUpdateSchema = vehicleCostProfileFields.partial().refine(effectivePeriodValid, {
  message: "effectiveTo não pode ser anterior a effectiveFrom.",
  path: ["effectiveTo"],
});

// ── vehicle tire profile ─────────────────────────────────────────────────

export const tireCategorySchema = z.enum(["novo_nacional", "novo_importado", "recapado", "misto", "outro"]);

export const vehicleTireProfileCreateSchema = z.object({
  vehicleId: uuidSchema,
  tireCategory: tireCategorySchema.default("outro"),
  brand: maxText(80, "Marca").optional(),
  model: maxText(80, "Modelo").optional(),
  size: maxText(32, "Medida").optional(),
  acquisitionCost: monetarySchema.optional(),
  expectedLifeKm: z.number().finite().nonnegative().optional(),
  numberOfRecaps: z.number().int().nonnegative().optional(),
  recapCost: monetarySchema.optional(),
  expectedRecapLifeKm: z.number().finite().nonnegative().optional(),
  notes: maxText(2000, "Observações").optional(),
});

export const vehicleTireProfileUpdateSchema = vehicleTireProfileCreateSchema.partial();

// ── saved route ──────────────────────────────────────────────────────────

export const savedRouteCreateSchema = z.object({
  vehicleId: uuidSchema.optional(),
  name: maxText(120, "Nome da rota").optional(),
  originName: maxText(120, "Origem").optional(),
  originCity: maxText(120, "Cidade de origem").optional(),
  originState: maxText(2, "UF de origem").optional(),
  destinationName: maxText(120, "Destino").optional(),
  destinationCity: maxText(120, "Cidade de destino").optional(),
  destinationState: maxText(2, "UF de destino").optional(),
  distanceKm: z.number().finite().nonnegative().optional(),
  estimatedDurationMinutes: z.number().int().nonnegative().optional(),
  estimatedTollCost: monetarySchema.optional(),
  averageConsumptionKmL: consumptionKmLSchema.optional(),
  averageSpeedKmh: speedKmhSchema.optional(),
  isFavorite: z.boolean().optional(),
});

export const savedRouteUpdateSchema = savedRouteCreateSchema.partial();

// ── company preferences ──────────────────────────────────────────────────

export const companyPreferencesUpdateSchema = z.object({
  defaultVehicleId: uuidSchema.optional(),
  defaultFuelType: fuelTypeSchema.optional(),
  defaultFuelPrice: monetarySchema.optional(),
  defaultAverageSpeedKmh: speedKmhSchema.optional(),
  defaultTargetMarginPercent: percentageSchema.optional(),
  defaultCurrency: maxText(3, "Moeda").optional(),
  distanceUnit: maxText(8, "Unidade de distância").optional(),
  preferredResponseStyle: maxText(32, "Estilo de resposta").optional(),
  askBeforeSavingMemory: z.boolean().optional(),
  allowAutomaticMemory: z.boolean().optional(),
  allowAnalysisHistory: z.boolean().optional(),
  allowToolHistory: z.boolean().optional(),
  dailyNewsEnabled: z.boolean().optional(),
});

// ── ai memory ────────────────────────────────────────────────────────────

export const aiMemoryTypeSchema = z.enum([
  "profile",
  "vehicle",
  "cost",
  "tire",
  "route",
  "preference",
  "operational",
  "other",
]);

export const aiMemorySourceTypeSchema = z.enum(["user_explicit", "conversation", "calculation", "system"]);

export const aiMemoryCreateSchema = z.object({
  userId: uuidSchema.optional(),
  vehicleId: uuidSchema.optional(),
  conversationId: uuidSchema.optional(),
  memoryType: aiMemoryTypeSchema,
  key: maxText(120, "key").min(1),
  valueJson: jsonMetadataSchema.optional(),
  summary: maxText(500, "Resumo").optional(),
  sourceType: aiMemorySourceTypeSchema,
  sourceMessageId: uuidSchema.optional(),
  confidence: confidenceSchema.optional(),
  confirmedByUser: z.boolean().optional(),
});

// ── analysis run ─────────────────────────────────────────────────────────

export const analysisRunCreateSchema = z.object({
  userId: uuidSchema,
  vehicleId: uuidSchema.optional(),
  conversationId: uuidSchema.optional(),
  analysisType: maxText(80, "analysisType").min(1),
  userRequest: maxText(4000, "Pedido do usuário").optional(),
  inputSnapshot: jsonMetadataSchema.optional(),
});

// ── tool execution ───────────────────────────────────────────────────────

export const frotaIaToolNameSchema = z.enum([
  "analisar_frete",
  "calcular_combustivel",
  "calcular_cpk",
  "comparar_pneus",
  "calcular_custo_viagem",
  "calcular_margem",
  "calcular_valor_minimo_frete",
  "calcular_receita_km",
  "calcular_custo_dia",
  "calcular_custo_veiculo_parado",
  "calcular_jornada",
  // Corrigido na Camada 6: "gerenciar_google_calendar" existe desde a
  // Camada 4 mas nunca tinha sido adicionado aqui — toda chamada da
  // ferramenta de Agenda vinha reportando falha de gravação em
  // tool_executions (ZodError silencioso, mascarado como "a ferramenta
  // falhou" na resposta da IA) mesmo quando a ação no Google funcionava.
  "gerenciar_google_calendar",
  "consultar_historico",
  "gerenciar_alerta",
  "gerar_documento",
  "verificar_piso_minimo_antt",
  "consultar_rota",
  // Camada 6/7: mesma classe de bug do gerenciar_google_calendar acima -
  // 5 ferramentas novas nunca tinham sido adicionadas aqui. A acao real
  // (registrar_despesa, gerenciar_veiculo, definir_estilo_resposta,
  // consultar_conhecimento_operacional, gerenciar_rota_salva) funcionava
  // normalmente, mas o registro em tool_executions quebrava com ZodError
  // silencioso - a IA reportava "a ferramenta falhou" ao cliente mesmo
  // quando a acao tinha sido salva com sucesso. Achado em teste real no
  // WhatsApp (05/08/2026): definir_estilo_resposta salvou a preferencia
  // corretamente em company_preferences, mas o cliente foi informado de
  // uma falha.
  "registrar_despesa",
  "gerenciar_veiculo",
  "definir_estilo_resposta",
  "consultar_conhecimento_operacional",
  "gerenciar_rota_salva",
  "gerenciar_noticias_setor",
  "gerenciar_assinatura",
  "gerenciar_motorista",
  "gerenciar_manutencao",
  "gerenciar_documento_frota",
]);

export const toolExecutionCreateSchema = z.object({
  userId: uuidSchema,
  analysisRunId: uuidSchema.optional(),
  conversationId: uuidSchema.optional(),
  messageId: uuidSchema.optional(),
  toolName: frotaIaToolNameSchema,
  toolVersion: maxText(32, "toolVersion").optional(),
  inputData: z.record(z.string(), z.unknown()),
});
