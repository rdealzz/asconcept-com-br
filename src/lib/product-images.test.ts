import { describe, expect, it } from "bun:test";
import { isRemoteImage, productImageSrc, productImageSrcSet } from "@/lib/product-images";

/**
 * O que estes testes protegem é a transição: enquanto o backfill não roda, o
 * banco tem os três formatos convivendo — URL do bucket, data URL base64 antigo
 * e caminho de arquivo estático. Errar o reconhecimento de qualquer um deles
 * apaga a foto da peça na vitrine, que é justamente o que não pode acontecer.
 */

const BUCKET_URL =
  "https://exemplo.supabase.co/storage/v1/object/public/product-photos/abc-123/1000.webp";

describe("productImageSrc", () => {
  it("troca a largura de uma foto do bucket", () => {
    expect(productImageSrc(BUCKET_URL, 480)).toBe(
      "https://exemplo.supabase.co/storage/v1/object/public/product-photos/abc-123/480.webp",
    );
    expect(productImageSrc(BUCKET_URL, 1600)).toBe(
      "https://exemplo.supabase.co/storage/v1/object/public/product-photos/abc-123/1600.webp",
    );
  });

  it("devolve intacta a foto antiga em base64", () => {
    const base64 = "data:image/webp;base64,UklGRh4AAABXRUJQ";
    expect(productImageSrc(base64, 480)).toBe(base64);
  });

  it("devolve intacto o caminho de arquivo estático", () => {
    expect(productImageSrc("/products/product-1.jpg", 480)).toBe("/products/product-1.jpg");
  });

  it("trata foto ausente sem quebrar", () => {
    expect(productImageSrc(null, 480)).toBe("");
    expect(productImageSrc(undefined, 480)).toBe("");
    expect(productImageSrc("", 480)).toBe("");
  });
});

describe("productImageSrcSet", () => {
  it("lista as três variantes de uma foto do bucket", () => {
    const srcset = productImageSrcSet(BUCKET_URL);
    expect(srcset).toContain("/abc-123/480.webp 480w");
    expect(srcset).toContain("/abc-123/1000.webp 1000w");
    expect(srcset).toContain("/abc-123/1600.webp 1600w");
  });

  it("não anuncia variante que não existe", () => {
    // Anunciar 480w/1600w para uma foto que não está no bucket faria o
    // navegador pedir uma URL inventada e a peça aparecer quebrada.
    expect(productImageSrcSet("data:image/webp;base64,UklGRh4AAABXRUJQ")).toBeUndefined();
    expect(productImageSrcSet("/products/product-1.jpg")).toBeUndefined();
    expect(productImageSrcSet(null)).toBeUndefined();
  });
});

describe("isRemoteImage", () => {
  it("aceita só URL http(s)", () => {
    expect(isRemoteImage(BUCKET_URL)).toBe(true);
    expect(isRemoteImage("http://exemplo.com/a.png")).toBe(true);
    // As duas que não podem virar og:image.
    expect(isRemoteImage("data:image/webp;base64,UklGRh4AAABXRUJQ")).toBe(false);
    expect(isRemoteImage("/products/product-1.jpg")).toBe(false);
    expect(isRemoteImage(null)).toBe(false);
  });
});
