import { describe, expect, it } from "bun:test";
import { sizeGuideFor } from "@/lib/size-guide";

/**
 * O que estes testes protegem é a promessa da tabela: cada espécie de peça
 * mostra as medidas que fazem sentido para ela. O erro que motivou o guia foi
 * um boné exibindo "busto 98 cm" — a tabela de camisa aparecia em tudo.
 */

describe("sizeGuideFor", () => {
  it("dá busto, ombro e manga para roupa", () => {
    const g = sizeGuideFor("clothes", "Moletom Polo Ralph Lauren");
    expect(g?.columns.map((c) => c.key)).toEqual(["comprimento", "busto", "ombro", "manga"]);
    expect(g?.rows.map((r) => r.size)).toEqual(["P", "M", "G", "GG"]);
  });

  it("troca para cintura e quadril quando o nome diz que é calça", () => {
    const g = sizeGuideFor("clothes", "Calça de Alfaiataria");
    expect(g?.columns.map((c) => c.key)).toEqual(["cintura", "quadril", "entrepernas"]);
    expect(g?.rows[0]).toEqual({
      size: "36",
      medidas: { cintura: "72 cm", quadril: "92 cm", entrepernas: "100 cm" },
    });
  });

  it("usa comprimento de pé em calçado", () => {
    const g = sizeGuideFor("sneakers", "Tênis de Corrida");
    expect(g?.columns.map((c) => c.key)).toEqual(["pe", "palmilha"]);
    expect(g?.rows[0].medidas.pe).toBe("23,5 cm");
  });

  it("não tem tabela para acessório", () => {
    expect(sizeGuideFor("acessorios", "Boné Premium Loro Piana")).toBeNull();
  });

  it("mostra os tamanhos da peça, e não os da grade genérica", () => {
    const g = sizeGuideFor("clothes", "Camisa de Linho", ["M", "G"]);
    expect(g?.rows.map((r) => r.size)).toEqual(["M", "G"]);
  });

  it("aceita tamanho fora da grade, com as medidas em branco", () => {
    const g = sizeGuideFor("clothes", "Camisa de Linho", ["G", "XGGG"]);
    expect(g?.rows.map((r) => r.size)).toEqual(["G", "XGGG"]);
    expect(g?.rows[1].medidas.busto).toBe("—");
  });

  it("cobre PP e XGG, que só existem na grade ampliada", () => {
    const g = sizeGuideFor("clothes", "Camiseta", ["PP", "XGG"]);
    expect(g?.rows[0].medidas.busto).toBe("92 cm");
    expect(g?.rows[1].medidas.busto).toBe("122 cm");
  });

  it("ignora um 'Único' cadastrado por engano numa peça de roupa", () => {
    const g = sizeGuideFor("clothes", "Camisa", ["M", "Único"]);
    expect(g?.rows.map((r) => r.size)).toEqual(["M"]);
  });
});
