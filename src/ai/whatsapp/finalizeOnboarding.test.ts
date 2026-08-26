import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const createCompanyWithOwner = vi.fn();
const updateProfile = vi.fn();
const createVehicle = vi.fn();
const setDefaultVehicle = vi.fn();
const createRoute = vi.fn();
const saveMemory = vi.fn();
const criarAssinaturaTeste = vi.fn();
const setCompanyForUserChannels = vi.fn();
const setOperatingRegion = vi.fn();

vi.mock("@/services/supabase/companyService", () => ({ createCompanyWithOwner: (...a: unknown[]) => createCompanyWithOwner(...a) }));
vi.mock("@/services/supabase/profileService", () => ({ updateProfile: (...a: unknown[]) => updateProfile(...a) }));
vi.mock("@/services/supabase/vehicleService", () => ({
  createVehicle: (...a: unknown[]) => createVehicle(...a),
  setDefaultVehicle: (...a: unknown[]) => setDefaultVehicle(...a),
}));
vi.mock("@/services/supabase/savedRouteService", () => ({ createRoute: (...a: unknown[]) => createRoute(...a) }));
vi.mock("@/services/supabase/memoryService", () => ({ saveMemory: (...a: unknown[]) => saveMemory(...a) }));
vi.mock("@/services/supabase/subscriptionService", () => ({ criarAssinaturaTeste: (...a: unknown[]) => criarAssinaturaTeste(...a) }));
vi.mock("@/services/supabase/channelIdentityService", () => ({ setCompanyForUserChannels: (...a: unknown[]) => setCompanyForUserChannels(...a) }));
vi.mock("@/services/supabase/companyPreferencesService", () => ({ setOperatingRegion: (...a: unknown[]) => setOperatingRegion(...a) }));

const COMPANY = { id: "empresa-1", name: "João Silva" };

// Nível de arquivo (não dentro de um describe específico) — precisa valer
// pra TODOS os describes deste arquivo, senão call history de saveMemory/
// setOperatingRegion vaza de um teste pro outro entre describes diferentes.
beforeEach(() => {
  vi.clearAllMocks();
  createCompanyWithOwner.mockResolvedValue(COMPANY);
  updateProfile.mockResolvedValue({});
  criarAssinaturaTeste.mockResolvedValue({});
  setCompanyForUserChannels.mockResolvedValue(undefined);
  setOperatingRegion.mockResolvedValue(undefined);
  saveMemory.mockResolvedValue({});
  createVehicle.mockResolvedValue({ id: "veiculo-1" });
  setDefaultVehicle.mockResolvedValue(undefined);
  createRoute.mockResolvedValue({});
});

describe("finalizeOnboarding", () => {
  it("nome informado também grava profiles.full_name (coerência autônomo/empresa, 08/2026)", async () => {
    const { finalizeOnboarding } = await import("./finalizeOnboarding");
    await finalizeOnboarding({} as never, "user-1", { name: "João Silva" }, "+5541999998888");
    expect(updateProfile).toHaveBeenCalledWith(expect.anything(), "user-1", { fullName: "João Silva" });
  });

  it("falha ao gravar profiles.full_name nunca trava a conclusão do onboarding", async () => {
    updateProfile.mockRejectedValue(new Error("falha qualquer"));
    const { finalizeOnboarding } = await import("./finalizeOnboarding");
    await expect(finalizeOnboarding({} as never, "user-1", { name: "João Silva" }, "+5541999998888")).resolves.toEqual(COMPANY);
  });

  it("sem nome informado, não tenta atualizar o perfil", async () => {
    const { finalizeOnboarding } = await import("./finalizeOnboarding");
    await finalizeOnboarding({} as never, "user-1", {}, "+5541999998888");
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("nome muito longo é truncado (mesmo limite de 200 do schema de profiles, com reticências — padrão já usado por truncate())", async () => {
    const nomeLongo = "a".repeat(250);
    const { finalizeOnboarding } = await import("./finalizeOnboarding");
    await finalizeOnboarding({} as never, "user-1", { name: nomeLongo }, "+5541999998888");
    const chamada = updateProfile.mock.calls[0][2] as { fullName: string };
    expect(chamada.fullName.length).toBeLessThan(nomeLongo.length);
    expect(chamada.fullName.endsWith("…")).toBe(true);
  });
});

describe("finalizeOnboarding — marca/modelo/ano estruturados (08/2026)", () => {
  it("texto com marca reconhecida grava brand/model/modelYear além de name/notes (nunca substitui o texto bruto)", async () => {
    const { finalizeOnboarding } = await import("./finalizeOnboarding");
    await finalizeOnboarding({} as never, "user-1", { vehicleType: "cavalo_mecanico", primaryVehicleRaw: "Scania R450 2022" }, "+5541999998888");

    expect(createVehicle).toHaveBeenCalledWith(
      expect.anything(),
      "empresa-1",
      "user-1",
      expect.objectContaining({
        name: "Scania R450 2022",
        notes: "Scania R450 2022",
        brand: "Scania",
        model: "R450",
        modelYear: 2022,
      })
    );
  });

  it("texto sem marca reconhecível grava brand/model/modelYear indefinidos, mas name/notes sempre preservam o texto bruto", async () => {
    const { finalizeOnboarding } = await import("./finalizeOnboarding");
    await finalizeOnboarding({} as never, "user-1", { vehicleType: "toco", primaryVehicleRaw: "meu caminhão véio confiável" }, "+5541999998888");

    expect(createVehicle).toHaveBeenCalledWith(
      expect.anything(),
      "empresa-1",
      "user-1",
      expect.objectContaining({
        name: "meu caminhão véio confiável",
        notes: "meu caminhão véio confiável",
        brand: undefined,
        model: undefined,
        modelYear: undefined,
      })
    );
  });
});

describe("finalizeOnboarding — região vira dado estrutural, não só memória (08/2026)", () => {
  it("região informada grava em company_preferences.operating_region (setOperatingRegion), nunca em ai_memories", async () => {
    const { finalizeOnboarding } = await import("./finalizeOnboarding");
    await finalizeOnboarding({} as never, "user-1", { region: "Sul" }, "+5541999998888");

    expect(setOperatingRegion).toHaveBeenCalledWith(expect.anything(), "empresa-1", "Sul");
    expect(saveMemory).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), expect.objectContaining({ key: "operating_region" }));
  });

  it("sem região informada, não chama setOperatingRegion", async () => {
    const { finalizeOnboarding } = await import("./finalizeOnboarding");
    await finalizeOnboarding({} as never, "user-1", {}, "+5541999998888");
    expect(setOperatingRegion).not.toHaveBeenCalled();
  });

  it("falha ao gravar região nunca trava a conclusão do onboarding", async () => {
    setOperatingRegion.mockRejectedValue(new Error("falha qualquer"));
    const { finalizeOnboarding } = await import("./finalizeOnboarding");
    await expect(finalizeOnboarding({} as never, "user-1", { region: "Sul" }, "+5541999998888")).resolves.toEqual(COMPANY);
  });
});

describe("finalizeOnboarding — intenção inicial persistida (08/2026)", () => {
  it("intenção reconhecida (diferente de ver_tudo) vira memória de perfil", async () => {
    const { finalizeOnboarding } = await import("./finalizeOnboarding");
    await finalizeOnboarding({} as never, "user-1", { intentId: "fretes", intentLabel: "Fretes e oportunidades" }, "+5541999998888");

    expect(saveMemory).toHaveBeenCalledWith(
      expect.anything(),
      "empresa-1",
      "user-1",
      expect.objectContaining({
        memoryType: "profile",
        key: "initial_intent",
        valueJson: { intentId: "fretes", intentLabel: "Fretes e oportunidades" },
      })
    );
  });

  it('"ver_tudo" (sem intenção específica) nunca vira memória', async () => {
    const { finalizeOnboarding } = await import("./finalizeOnboarding");
    await finalizeOnboarding({} as never, "user-1", { intentId: "ver_tudo", intentLabel: "Ver tudo" }, "+5541999998888");
    expect(saveMemory).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), expect.objectContaining({ key: "initial_intent" }));
  });

  it("sem intentId, não tenta salvar memória de intenção", async () => {
    const { finalizeOnboarding } = await import("./finalizeOnboarding");
    await finalizeOnboarding({} as never, "user-1", {}, "+5541999998888");
    expect(saveMemory).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), expect.objectContaining({ key: "initial_intent" }));
  });
});
