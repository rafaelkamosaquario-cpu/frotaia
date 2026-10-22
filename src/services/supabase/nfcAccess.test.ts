import {beforeEach, expect, it, vi} from "vitest";
const m = vi.hoisted(() => ({user: vi.fn(), access: vi.fn(), grant: vi.fn()}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => ({auth: {getUser: m.user}})}));
vi.mock("./fleetPanelAccess", () => ({loadFleetPanelAccess: m.access}));
vi.mock("@/lib/supabase/admin", () => ({createAdminClient: () => ({from: () => ({select: () => ({eq: () => ({eq: () => ({maybeSingle: m.grant})})})})})}));
import {nfcAccess} from "./nfcAccess";
beforeEach(() => {
  vi.resetAllMocks();
  m.user.mockResolvedValue({data: {user: {email: "rafaelkamosaquario@gmail.com", email_confirmed_at: "2026-01-01"}}});
  m.access.mockResolvedValue({ok: true, role: "owner", userId: "admin", company: {id: "adm"}});
});
it("permits the confirmed admin in their own company", async () => {expect(await nfcAccess()).not.toBeNull();});
it("denies another account even if owner", async () => {
  m.user.mockResolvedValue({data: {user: {email: "client@example.com", email_confirmed_at: "2026-01-01"}}});
  expect(await nfcAccess()).toBeNull();
});
it("denies absent company access", async () => {m.access.mockResolvedValue({ok: false}); expect(await nfcAccess()).toBeNull();});
it("denies expired consultancy", async () => {
  m.access.mockResolvedValue({ok: true, role: "admin", userId: "admin", company: {id: "tr"}});
  m.grant.mockResolvedValue({data: {consultant_until: "2020-01-01"}, error: null});
  expect(await nfcAccess()).toBeNull();
});
it("permits preparation before consultancy delivery", async () => {
  m.access.mockResolvedValue({ok: true, role: "admin", userId: "admin", company: {id: "tr"}});
  m.grant.mockResolvedValue({data: {consultant_until: null}, error: null});
  expect(await nfcAccess()).not.toBeNull();
});
it("denies missing consultancy grant", async () => {
  m.access.mockResolvedValue({ok: true, role: "admin", userId: "admin", company: {id: "tr"}});
  m.grant.mockResolvedValue({data: null, error: null});
  expect(await nfcAccess()).toBeNull();
});
