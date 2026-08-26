import { describe, it, expect } from "vitest";
import { parseVehicleDescription } from "./vehicleDescriptionParser";

describe("parseVehicleDescription — nunca inventa, só extrai quando tem certeza", () => {
  it("marca + modelo + ano no formato mais comum", () => {
    expect(parseVehicleDescription("Scania R450 2022")).toEqual({ brand: "Scania", model: "R450", modelYear: 2022 });
  });

  it("marca de duas palavras (Mercedes Benz) reconhecida e canonicalizada", () => {
    expect(parseVehicleDescription("Mercedes Benz Axor 2021")).toEqual({ brand: "Mercedes-Benz", model: "Axor", modelYear: 2021 });
  });

  it("marca com hífen já no texto", () => {
    expect(parseVehicleDescription("Mercedes-Benz Atego 2019")).toEqual({ brand: "Mercedes-Benz", model: "Atego", modelYear: 2019 });
  });

  it("sem ano, ainda extrai marca/modelo", () => {
    expect(parseVehicleDescription("Volvo FH 540")).toEqual({ brand: "Volvo", model: "FH 540" });
  });

  it("só marca, sem modelo nem ano", () => {
    expect(parseVehicleDescription("Scania")).toEqual({ brand: "Scania" });
  });

  it('nunca casa "Fordson" com a marca "Ford" (falso positivo de substring)', () => {
    const resultado = parseVehicleDescription("Fordson modelo antigo 1995");
    expect(resultado.brand).toBeUndefined();
    expect(resultado.modelYear).toBe(1995);
  });

  it("texto sem marca reconhecida devolve vazio — nunca inventa marca/modelo", () => {
    expect(parseVehicleDescription("meu caminhão véio confiável")).toEqual({});
  });

  it("texto sem marca reconhecida, mas com ano plausível — só o ano é extraído", () => {
    expect(parseVehicleDescription("caminhão zero km 2024")).toEqual({ modelYear: 2024 });
  });

  it("número que não parece ano plausível não é extraído como modelYear (ex.: capacidade de carga)", () => {
    const resultado = parseVehicleDescription("Volvo FH com 3000 litros de tanque");
    expect(resultado.modelYear).toBeUndefined();
  });

  it("texto vazio ou só espaços devolve objeto vazio", () => {
    expect(parseVehicleDescription("")).toEqual({});
    expect(parseVehicleDescription("   ")).toEqual({});
    expect(parseVehicleDescription(undefined)).toEqual({});
  });

  it("marca em caixa baixa/mista ainda é reconhecida e canonicalizada", () => {
    expect(parseVehicleDescription("scania r450 2022")).toEqual({ brand: "Scania", model: "r450", modelYear: 2022 });
  });

  it("DAF (marca curta) reconhecida com fronteira de palavra correta", () => {
    expect(parseVehicleDescription("DAF XF 480 2020")).toEqual({ brand: "DAF", model: "XF 480", modelYear: 2020 });
  });
});
