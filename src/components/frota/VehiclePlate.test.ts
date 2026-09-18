import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VehiclePlate } from "./VehiclePlate";

describe("VehiclePlate", () => {
  const render = (plate: string | null) => renderToStaticMarkup(createElement(VehiclePlate, { plate }));
  it("normaliza visualmente Mercosul sem perder identificação acessível", () => {
    const html = render(" abc1d23 ");
    expect(html).toContain("ABC1D23");
    expect(html).toContain("BRASIL");
    expect(html).toContain('aria-label="Placa ABC1D23"');
  });
  it("preserva o padrão antigo, sem convertê-lo para Mercosul", () => {
    const html = render("ABC-1234");
    expect(html).toContain("ABC-1234");
    expect(html).not.toContain("BRASIL");
  });
  it.each([null, "", "   "])("explicita ausência de placa (%s)", plate => {
    expect(render(plate)).toContain("Placa não informada");
  });
  it("preserva identificadores fora do padrão como texto", () => {
    expect(render("implemento-01")).toContain("IMPLEMENTO-01");
    expect(render("implemento-01")).not.toContain("BRASIL");
  });
});
