import type { Database } from "./database.types";

/**
 * Aliases Row/Insert/Update para as tabelas da Camada 3, para não repetir
 * `Database["public"]["Tables"][...]` em todo service. Gerado a partir de
 * database.types.ts — atualizar junto quando os tipos forem regerados.
 */

type PublicTables = Database["public"]["Tables"];
type PublicEnums = Database["public"]["Enums"];

export type ProfileRow = PublicTables["profiles"]["Row"];
export type ProfileUpdate = PublicTables["profiles"]["Update"];

export type CompanyRow = PublicTables["companies"]["Row"];
export type CompanyInsert = PublicTables["companies"]["Insert"];
export type CompanyUpdate = PublicTables["companies"]["Update"];

export type CompanyMemberRow = PublicTables["company_members"]["Row"];
export type CompanyMemberInsert = PublicTables["company_members"]["Insert"];
export type CompanyMemberUpdate = PublicTables["company_members"]["Update"];

export type UserChannelRow = PublicTables["user_channels"]["Row"];
export type UserChannelInsert = PublicTables["user_channels"]["Insert"];
export type UserChannelUpdate = PublicTables["user_channels"]["Update"];

export type VehicleRow = PublicTables["vehicles"]["Row"];
export type VehicleInsert = PublicTables["vehicles"]["Insert"];
export type VehicleUpdate = PublicTables["vehicles"]["Update"];

export type VehicleCostProfileRow = PublicTables["vehicle_cost_profiles"]["Row"];
export type VehicleCostProfileInsert = PublicTables["vehicle_cost_profiles"]["Insert"];
export type VehicleCostProfileUpdate = PublicTables["vehicle_cost_profiles"]["Update"];

export type VehicleTireProfileRow = PublicTables["vehicle_tire_profiles"]["Row"];
export type VehicleTireProfileInsert = PublicTables["vehicle_tire_profiles"]["Insert"];
export type VehicleTireProfileUpdate = PublicTables["vehicle_tire_profiles"]["Update"];

export type SavedRouteRow = PublicTables["saved_routes"]["Row"];
export type SavedRouteInsert = PublicTables["saved_routes"]["Insert"];
export type SavedRouteUpdate = PublicTables["saved_routes"]["Update"];

export type VendorRow = PublicTables["vendors"]["Row"];
export type VendorInsert = PublicTables["vendors"]["Insert"];
export type VendorUpdate = PublicTables["vendors"]["Update"];

export type FuelFillupRow = PublicTables["fuel_fillups"]["Row"];
export type FuelFillupInsert = PublicTables["fuel_fillups"]["Insert"];
export type FuelFillupUpdate = PublicTables["fuel_fillups"]["Update"];

export type VehicleTireRow = PublicTables["vehicle_tires"]["Row"];
export type VehicleTireInsert = PublicTables["vehicle_tires"]["Insert"];
export type VehicleTireUpdate = PublicTables["vehicle_tires"]["Update"];

export type RevenueRow = PublicTables["revenues"]["Row"];
export type RevenueInsert = PublicTables["revenues"]["Insert"];
export type RevenueUpdate = PublicTables["revenues"]["Update"];

export type CompanyPreferencesRow = PublicTables["company_preferences"]["Row"];
export type CompanyPreferencesInsert = PublicTables["company_preferences"]["Insert"];
export type CompanyPreferencesUpdate = PublicTables["company_preferences"]["Update"];

export type ConversationRow = PublicTables["conversations"]["Row"];
export type ConversationInsert = PublicTables["conversations"]["Insert"];
export type ConversationUpdate = PublicTables["conversations"]["Update"];

export type MessageRow = PublicTables["messages"]["Row"];
export type MessageInsert = PublicTables["messages"]["Insert"];

export type AiMemoryRow = PublicTables["ai_memories"]["Row"];
export type AiMemoryInsert = PublicTables["ai_memories"]["Insert"];
export type AiMemoryUpdate = PublicTables["ai_memories"]["Update"];

export type AnalysisRunRow = PublicTables["analysis_runs"]["Row"];
export type AnalysisRunInsert = PublicTables["analysis_runs"]["Insert"];
export type AnalysisRunUpdate = PublicTables["analysis_runs"]["Update"];

export type ToolExecutionRow = PublicTables["tool_executions"]["Row"];
export type ToolExecutionInsert = PublicTables["tool_executions"]["Insert"];
export type ToolExecutionUpdate = PublicTables["tool_executions"]["Update"];

export type GoogleIntegrationRow = PublicTables["google_integrations"]["Row"];
export type GoogleIntegrationInsert = PublicTables["google_integrations"]["Insert"];
export type GoogleIntegrationUpdate = PublicTables["google_integrations"]["Update"];

export type CalendarActionLogRow = PublicTables["calendar_action_logs"]["Row"];
export type CalendarActionLogInsert = PublicTables["calendar_action_logs"]["Insert"];

export type OnboardingSessionRow = PublicTables["onboarding_sessions"]["Row"];
export type OnboardingSessionInsert = PublicTables["onboarding_sessions"]["Insert"];
export type OnboardingSessionUpdate = PublicTables["onboarding_sessions"]["Update"];

export type ScheduledAlertRow = PublicTables["scheduled_alerts"]["Row"];
export type ScheduledAlertInsert = PublicTables["scheduled_alerts"]["Insert"];
export type ScheduledAlertUpdate = PublicTables["scheduled_alerts"]["Update"];

export type GeneratedDocumentRow = PublicTables["generated_documents"]["Row"];
export type GeneratedDocumentInsert = PublicTables["generated_documents"]["Insert"];

export type ExpenseRow = PublicTables["expenses"]["Row"];
export type ExpenseInsert = PublicTables["expenses"]["Insert"];
export type ExpenseUpdate = PublicTables["expenses"]["Update"];

export type SubscriptionRow = PublicTables["subscriptions"]["Row"];
export type SubscriptionInsert = PublicTables["subscriptions"]["Insert"];
export type SubscriptionUpdate = PublicTables["subscriptions"]["Update"];

export type PaymentEventRow = PublicTables["payment_events"]["Row"];
export type PaymentEventInsert = PublicTables["payment_events"]["Insert"];

export type TrialUsageRow = PublicTables["trial_usage"]["Row"];
export type TrialUsageInsert = PublicTables["trial_usage"]["Insert"];

export type DriverRow = PublicTables["drivers"]["Row"];
export type DriverInsert = PublicTables["drivers"]["Insert"];
export type DriverUpdate = PublicTables["drivers"]["Update"];

export type VehicleDocumentRow = PublicTables["vehicle_documents"]["Row"];
export type VehicleDocumentInsert = PublicTables["vehicle_documents"]["Insert"];
export type VehicleDocumentUpdate = PublicTables["vehicle_documents"]["Update"];

export type MaintenanceScheduleRow = PublicTables["maintenance_schedules"]["Row"];
export type MaintenanceScheduleInsert = PublicTables["maintenance_schedules"]["Insert"];
export type MaintenanceScheduleUpdate = PublicTables["maintenance_schedules"]["Update"];

export type ChecklistDispatchRow = PublicTables["checklist_dispatches"]["Row"];
export type ChecklistDispatchInsert = PublicTables["checklist_dispatches"]["Insert"];
export type ChecklistDispatchUpdate = PublicTables["checklist_dispatches"]["Update"];

export type SavedJourneyRow = PublicTables["saved_journeys"]["Row"];
export type SavedJourneyInsert = PublicTables["saved_journeys"]["Insert"];
export type SavedJourneyUpdate = PublicTables["saved_journeys"]["Update"];

export type NewsDigestRow = PublicTables["news_digests"]["Row"];

export type FreightSourceRow = PublicTables["freight_sources"]["Row"];
export type FreightSourceInsert = PublicTables["freight_sources"]["Insert"];
export type FreightSourceUpdate = PublicTables["freight_sources"]["Update"];

export type FreightRadarRow = PublicTables["freight_radars"]["Row"];
export type FreightRadarInsert = PublicTables["freight_radars"]["Insert"];
export type FreightRadarUpdate = PublicTables["freight_radars"]["Update"];

export type FreightOpportunityRow = PublicTables["freight_opportunities"]["Row"];
export type FreightOpportunityInsert = PublicTables["freight_opportunities"]["Insert"];
export type FreightOpportunityUpdate = PublicTables["freight_opportunities"]["Update"];

export type FreightOpportunityMatchRow = PublicTables["freight_opportunity_matches"]["Row"];
export type FreightOpportunityMatchInsert = PublicTables["freight_opportunity_matches"]["Insert"];
export type FreightOpportunityMatchUpdate = PublicTables["freight_opportunity_matches"]["Update"];

export type CompanyTypeEnum = PublicEnums["company_type"];
export type CompanyMemberRole = PublicEnums["company_member_role"];
export type OnboardingState = PublicEnums["onboarding_state"];
export type ScheduledAlertStatus = PublicEnums["scheduled_alert_status"];
export type VehicleTypeEnum = PublicEnums["vehicle_type"];
export type FuelTypeEnum = PublicEnums["fuel_type"];
export type TireCategoryEnum = PublicEnums["tire_category"];
export type VendorCategoryEnum = PublicEnums["vendor_category"];
export type VehicleTireStatusEnum = PublicEnums["vehicle_tire_status"];
export type AiMemoryTypeEnum = PublicEnums["ai_memory_type"];
export type AiMemorySourceTypeEnum = PublicEnums["ai_memory_source_type"];
export type FrotaIaToolName = PublicEnums["frota_ia_tool_name"];
export type ExpenseTypeEnum = PublicEnums["expense_type"];
export type RunStatus = PublicEnums["run_status"];
export type SubscriptionPlanEnum = PublicEnums["subscription_plan"];
export type SubscriptionStatusEnum = PublicEnums["subscription_status"];
export type VehicleDocumentTypeEnum = PublicEnums["vehicle_document_type"];
export type MaintenanceStatusEnum = PublicEnums["maintenance_status"];
export type ChecklistResponseStatusEnum = PublicEnums["checklist_response_status"];
export type JourneyStatusEnum = PublicEnums["journey_status"];
export type VehicleBodyTypeEnum = PublicEnums["vehicle_body_type"];
export type FreightSourceTypeEnum = PublicEnums["freight_source_type"];
export type FreightRadarStatusEnum = PublicEnums["freight_radar_status"];
export type FreightOpportunitySourceEnum = PublicEnums["freight_opportunity_source"];
export type FreightOpportunityStatusEnum = PublicEnums["freight_opportunity_status"];
export type FreightMatchStatusEnum = PublicEnums["freight_match_status"];
