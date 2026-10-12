import { isValidElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useState: (initial: unknown) => [initial, vi.fn()] };
});
import { ShareOperationalReport } from "./ShareOperationalReport";
import { reportText, type OperationalReport } from "@/lib/frota/communication";
const report: OperationalReport = { title: "Frota IA informa", company: "Company", subject: "ABC1234", period: "09/2026", fields: [{ label: "Produção", value: "336,76 t" }], notice: "Valores registrados. Não é lucro líquido." };
function buttons(node: ReactNode): { children?: ReactNode; onClick: () => Promise<void> }[] {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!isValidElement<{ children?: ReactNode; onClick: () => Promise<void> }>(node)) return [];
  return node.type === "button" ? [node.props] : buttons(node.props.children);
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("report sharing stays local", () => {
  it("copies the exact report and does not send it to anyone", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined), fetch = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText } }); vi.stubGlobal("fetch", fetch);
    await buttons(ShareOperationalReport({ report }))[0].onClick();
    expect(writeText).toHaveBeenCalledWith(reportText(report));
    expect(fetch).not.toHaveBeenCalled();
  });
  it("generates a branded PNG download without uploading financial data", async () => {
    vi.useFakeTimers();
    const fillText = vi.fn(), drawImage = vi.fn(), click = vi.fn(), fetch = vi.fn();
    const ctx = { font: "", fillStyle: "", measureText: (s: string) => ({ width: s.length * 14 }), fillRect: vi.fn(), fillText, drawImage };
    const canvas = { width: 0, height: 0, getContext: () => ctx, toBlob: (cb: (blob: Blob) => void) => cb(new Blob(["test"], { type: "image/png" })) };
    const link = { href: "", download: "", click };
    vi.stubGlobal("document", { createElement: (tag: string) => tag === "canvas" ? canvas : link });
    vi.stubGlobal("window", { Image: class { src = ""; async decode() {} } });
    vi.stubGlobal("URL", { createObjectURL: () => "blob:local-report", revokeObjectURL: vi.fn() });
    vi.stubGlobal("fetch", fetch);
    await buttons(ShareOperationalReport({ report }))[1].onClick();
    expect(canvas.width).toBe(1080);
    expect(drawImage.mock.calls[0][0].src).toBe("/frota-ia-brand-202609.png");
    expect(fillText).toHaveBeenCalledWith("Frota IA informa", 200, 106);
    expect(fillText.mock.calls.map(call => call[0]).join("\n")).toContain("Produção: 336,76 t");
    expect(link.download).toBe("frota-ia-092026-ABC1234.png");
    expect(click).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("handles unavailable clipboard without throwing", async () => {
    vi.stubGlobal("navigator", {});
    await expect(buttons(ShareOperationalReport({ report }))[0].onClick()).resolves.toBeUndefined();
  });
});
