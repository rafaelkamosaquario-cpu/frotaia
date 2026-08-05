import { describe, it, expect } from "vitest";
import { classificarConfiguracaoVeiculo, resolverDesambiguacaoArticulado } from "./vehicleConfigClassifier";

describe("classificarConfiguracaoVeiculo — veículos rígidos (eixos fixos)", () => {
  it("reconhece toco", () => {
    const r = classificarConfiguracaoVeiculo("toco");
    expect(r.status).toBe("resolvido");
    if (r.status === "resolvido") {
      expect(r.vehicleType).toBe("toco");
      expect(r.axleCount).toBe(2);
    }
  });

  it("reconhece truck e trucado com o mesmo número de eixos (6x2/6x4 não muda a contagem)", () => {
    const truck = classificarConfiguracaoVeiculo("truck");
    const trucado = classificarConfiguracaoVeiculo("Meu caminhão é trucado 6x4");
    expect(truck.status).toBe("resolvido");
    expect(trucado.status).toBe("resolvido");
    if (truck.status === "resolvido" && trucado.status === "resolvido") {
      expect(truck.axleCount).toBe(3);
      expect(trucado.axleCount).toBe(3);
      expect(truck.vehicleType).toBe(trucado.vehicleType);
    }
  });

  it("reconhece três-quartos em variações de grafia (3/4, 3-4, com/sem acento)", () => {
    for (const texto of ["três-quartos", "tres quartos", "3/4", "3-4"]) {
      const r = classificarConfiguracaoVeiculo(texto);
      expect(r.status).toBe("resolvido");
      if (r.status === "resolvido") {
        expect(r.vehicleType).toBe("tres_quartos");
        expect(r.axleCount).toBe(2);
      }
    }
  });

  it("reconhece bitruck com eixo count maior que truck comum", () => {
    const r = classificarConfiguracaoVeiculo("bitruck");
    expect(r.status).toBe("resolvido");
    if (r.status === "resolvido") {
      expect(r.axleCount).toBe(4);
    }
  });
});

describe("classificarConfiguracaoVeiculo — composições articuladas explícitas", () => {
  it("reconhece bitrem com 7 eixos", () => {
    const r = classificarConfiguracaoVeiculo("bitrem");
    expect(r.status).toBe("resolvido");
    if (r.status === "resolvido") {
      expect(r.vehicleType).toBe("bitrem");
      expect(r.axleCount).toBe(7);
    }
  });

  it("reconhece rodotrem com 9 eixos", () => {
    const r = classificarConfiguracaoVeiculo("rodotrem");
    expect(r.status).toBe("resolvido");
    if (r.status === "resolvido") {
      expect(r.vehicleType).toBe("rodotrem");
      expect(r.axleCount).toBe(9);
    }
  });
});

describe("classificarConfiguracaoVeiculo — cavalo mecânico/carreta (ambíguo, precisa desambiguar)", () => {
  it("pede desambiguação quando só menciona 'cavalo mecânico'", () => {
    const r = classificarConfiguracaoVeiculo("cavalo mecânico");
    expect(r.status).toBe("precisa_desambiguar");
    if (r.status === "precisa_desambiguar") {
      expect(r.reply.kind).toBe("list");
    }
  });

  it("pede desambiguação quando só menciona 'carreta'", () => {
    const r = classificarConfiguracaoVeiculo("carreta");
    expect(r.status).toBe("precisa_desambiguar");
  });

  it("resolve a escolha da lista de desambiguação pelo id", () => {
    const resolvido = resolverDesambiguacaoArticulado("cavalo_bitrem");
    expect(resolvido).not.toBeNull();
    expect(resolvido?.vehicleType).toBe("cavalo_mecanico");
    expect(resolvido?.axleCount).toBe(7);
  });

  it("retorna null para uma escolha de desambiguação inválida", () => {
    expect(resolverDesambiguacaoArticulado("qualquer coisa")).toBeNull();
  });
});

describe("classificarConfiguracaoVeiculo — não reconhecido / carroceria", () => {
  it("não trata carroceria (baú) como configuração, pede esclarecimento", () => {
    const r = classificarConfiguracaoVeiculo("baú");
    expect(r.status).toBe("nao_reconhecido");
  });

  it("pede esclarecimento pra texto vazio", () => {
    const r = classificarConfiguracaoVeiculo("");
    expect(r.status).toBe("nao_reconhecido");
  });

  it("pede esclarecimento pra texto não reconhecido", () => {
    const r = classificarConfiguracaoVeiculo("sei lá, um caminhão qualquer");
    expect(r.status).toBe("nao_reconhecido");
  });
});
