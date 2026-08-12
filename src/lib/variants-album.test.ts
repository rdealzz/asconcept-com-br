import { describe, expect, it } from "bun:test";
import type { Product } from "@/lib/cart-context";
import {
  buildGroups,
  collapseVariants,
  productIdFromParam,
  productParam,
  swatchBackground,
  swatchLabel,
  type VariantMeta,
} from "@/lib/variants";

/**
 * O álbum visto de fora: o que o cliente vê e o que acontece quando ele clica.
 *
 * São dois comportamentos, e os dois são o motivo de o sistema existir:
 *
 *   1. **duas peças da mesma cor, com logos diferentes, têm seletores
 *      diferentes.** A preta de logo branco e a preta de logo vermelho não
 *      podem virar dois pontos pretos iguais na vitrine — o seletor é dividido
 *      ao meio: a cor da peça de um lado, a do logo do outro;
 *   2. **clicar num seletor abre exatamente aquela cor** — a foto, o preço, o
 *      estoque e o SKU dela, e não os da capa do álbum.
 *
 * O segundo é testado percorrendo o mesmo caminho que o navegador percorre:
 * seletor → URL → parâmetro da rota → peça no catálogo. Quem faz cada etapa em
 * produção é `ColorSwatches` (monta o link), a rota `/produto/$id` (lê o
 * parâmetro) e o `CatalogProvider` (acha a peça).
 */

const ID_BRANCA = "aaaaaaaa-1111-4111-8111-111111111111";
const ID_PRETA_LOGO_BRANCO = "bbbbbbbb-2222-4222-8222-222222222222";
const ID_PRETA_LOGO_VERMELHO = "cccccccc-3333-4333-8333-333333333333";

function peca(
  id: string,
  name: string,
  extra: Partial<Product> = {},
  variant?: VariantMeta,
): Product {
  return {
    id,
    name,
    description: "",
    price: 219.9,
    image: `https://cdn/${id}/1000.webp`,
    gallery: [`https://cdn/${id}/1000.webp`],
    category: "clothes",
    variant: variant ?? null,
    ...extra,
  };
}

/* O álbum do caso real: uma camiseta em três cores, duas delas pretas. */
const ALBUM = "camiseta-basica-polo-ralph-lauren";
const meta = (extra: Partial<VariantMeta>): VariantMeta => ({
  group: ALBUM,
  label: "Camiseta Básica Polo Ralph Lauren",
  ...extra,
});

const branca = peca(
  ID_BRANCA,
  "Camiseta Básica Polo Ralph Lauren – Branca com Logo Azul Marinho",
  {},
  meta({ position: 0, primary: true }),
);
const pretaLogoBranco = peca(
  ID_PRETA_LOGO_BRANCO,
  "Camiseta Básica Polo Ralph Lauren – Preta com Logo Branco",
  { price: 229.9 },
  meta({ position: 1 }),
);
const pretaLogoVermelho = peca(
  ID_PRETA_LOGO_VERMELHO,
  "Camiseta Básica Polo Ralph Lauren – Preta com Logo Vermelho",
  {},
  meta({ position: 2 }),
);

const CATALOGO = [branca, pretaLogoBranco, pretaLogoVermelho, peca("d", "Calça de Linho Bege")];
const GRUPOS = buildGroups(CATALOGO);

describe("mesma cor da peça, logos diferentes", () => {
  it("cada seletor é metade peça, metade logo", () => {
    const fundo = swatchBackground(pretaLogoVermelho.variant, pretaLogoVermelho.name);
    // A metade de baixo é a cor da peça; a de cima, a do logo.
    expect(fundo).toBe("linear-gradient(135deg, #111111 0 50%, #C1121F 50% 100%)");
  });

  it("as duas pretas não podem sair iguais na vitrine", () => {
    const a = swatchBackground(pretaLogoBranco.variant, pretaLogoBranco.name);
    const b = swatchBackground(pretaLogoVermelho.variant, pretaLogoVermelho.name);
    expect(a).not.toBe(b);
    // Mesma primeira metade (a peça é preta nas duas), segunda metade diferente.
    expect(a.startsWith("linear-gradient(135deg, #111111 0 50%")).toBe(true);
    expect(b.startsWith("linear-gradient(135deg, #111111 0 50%")).toBe(true);
    expect(a).toContain("#FFFFFF 50% 100%");
    expect(b).toContain("#C1121F 50% 100%");
  });

  it("o que o admin gravar no painel manda sobre o palpite do nome", () => {
    // Duas peças pretas com logo preto: o nome não separa uma da outra. O
    // painel grava as cores na mão, e é isso que a vitrine pinta.
    const bordado = peca(
      "e",
      "Camiseta Preta com Logo Preto",
      {},
      meta({ color: "#111111", accent: "#C5A059", colorLabel: "Preta com logo dourado" }),
    );
    expect(swatchBackground(bordado.variant, bordado.name)).toBe(
      "linear-gradient(135deg, #111111 0 50%, #C5A059 50% 100%)",
    );
    expect(swatchLabel(bordado)).toBe("Preta com logo dourado");
  });

  it("cor única continua sendo bolinha chapada, sem divisão", () => {
    const bege = peca("f", "Shorts de Praia Premium – Bege");
    expect(swatchBackground(bege.variant, bege.name)).toBe("linear-gradient(#D9C7A8, #D9C7A8)");
  });

  it("cada seletor se anuncia pela cor, não pelo nome da peça", () => {
    expect(swatchLabel(pretaLogoBranco)).toBe("Preta com logo branco");
    expect(swatchLabel(pretaLogoVermelho)).toBe("Preta com logo vermelho");
  });
});

describe("clicar na cor abre exatamente aquela peça", () => {
  it("na vitrine, o álbum ocupa um card só — o da peça principal", () => {
    expect(collapseVariants(CATALOGO, GRUPOS).map((p) => p.id)).toEqual([ID_BRANCA, "d"]);
  });

  it("o seletor da preta com logo vermelho leva à peça preta com logo vermelho", () => {
    const album = GRUPOS.get(ALBUM)!;
    const escolhida = album.members.find((m) => m.id === ID_PRETA_LOGO_VERMELHO)!;

    // 1. o link que o seletor monta
    const href = `/produto/${productParam(escolhida)}`;
    expect(href).toBe(
      `/produto/camiseta-basica-polo-ralph-lauren-preta-com-logo-vermelho--${ID_PRETA_LOGO_VERMELHO}`,
    );

    // 2. o que a rota lê desse link
    const id = productIdFromParam(href.replace("/produto/", ""));

    // 3. a peça que a página abre
    const aberta = CATALOGO.find((p) => p.id === id)!;
    expect(aberta.id).toBe(ID_PRETA_LOGO_VERMELHO);
    expect(aberta.name).toContain("Preta com Logo Vermelho");
    // A foto é a dela, não a da capa do álbum.
    expect(aberta.image).toBe(`https://cdn/${ID_PRETA_LOGO_VERMELHO}/1000.webp`);
    expect(aberta.gallery?.[0]).toBe(`https://cdn/${ID_PRETA_LOGO_VERMELHO}/1000.webp`);
    expect(aberta.image).not.toBe(branca.image);
  });

  it("abre com o preço e o SKU da cor escolhida, não os da capa", () => {
    const id = productIdFromParam(productParam(pretaLogoBranco));
    const aberta = CATALOGO.find((p) => p.id === id)!;
    expect(aberta.price).toBe(229.9);
    expect(branca.price).toBe(219.9);
    // O SKU que vai para o carrinho e para o pedido é o id da variação.
    expect(aberta.id).toBe(ID_PRETA_LOGO_BRANCO);
  });

  it("a página aberta mostra as mesmas cores, com a dela marcada", () => {
    const id = productIdFromParam(productParam(pretaLogoVermelho));
    const aberta = CATALOGO.find((p) => p.id === id)!;
    const album = GRUPOS.get(aberta.variant!.group)!;

    expect(album.members.map((m) => m.id)).toEqual([
      ID_BRANCA,
      ID_PRETA_LOGO_BRANCO,
      ID_PRETA_LOGO_VERMELHO,
    ]);
    // `activeId` do seletor: a cor aberta é a que ganha o anel.
    expect(album.members.filter((m) => m.id === aberta.id)).toHaveLength(1);
  });

  it("todas as cores do álbum abrem, uma a uma, na peça certa", () => {
    for (const membro of GRUPOS.get(ALBUM)!.members) {
      const id = productIdFromParam(productParam(membro));
      expect(CATALOGO.find((p) => p.id === id)).toBe(membro);
    }
  });
});
