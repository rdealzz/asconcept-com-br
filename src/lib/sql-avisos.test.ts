import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { SQL_AVISOS } from "@/lib/sql-avisos";

/**
 * O painel entrega ao admin o SQL da migração de avisos para ele colar no
 * Supabase — as sessões não alcançam o banco de produção, então colar à mão é
 * o caminho de verdade quando o deploy não aplica a migração.
 *
 * Esse texto é uma cópia dentro do bundle (o arquivo `.sql` não viaja para o
 * navegador), e cópia envelhece. Um painel que entrega SQL diferente do que o
 * repositório tem é pior do que um painel sem botão nenhum: o admin roda, dá
 * certo, e o banco fica com uma versão que ninguém mais conhece.
 *
 * Este teste é a única coisa que impede isso. Se ele falhar, regenere a cópia a
 * partir do arquivo de migração.
 */
const MIGRACAO = "supabase/migrations/20260813120000_estoque_catalogo_avisos.sql";

describe("SQL_AVISOS", () => {
  it("é idêntico ao arquivo de migração", () => {
    expect(SQL_AVISOS).toBe(readFileSync(MIGRACAO, "utf8"));
  });

  it("cria as duas tabelas e reescreve a baixa de estoque", () => {
    expect(SQL_AVISOS).toContain("CREATE TABLE IF NOT EXISTS public.admin_notifications");
    expect(SQL_AVISOS).toContain("CREATE TABLE IF NOT EXISTS public.stock_ledger");
    expect(SQL_AVISOS).toContain("FUNCTION app_private.consume_order_stock");
  });

  /**
   * O admin cola este SQL no editor do Supabase, e às vezes cola duas vezes.
   * Toda criação precisa ser condicional para que a segunda vez não estoure.
   */
  it("pode ser rodado de novo sem estourar", () => {
    const criacoes = SQL_AVISOS.match(/^CREATE (?:TABLE|INDEX)[^\n]*/gm) ?? [];
    expect(criacoes.length).toBeGreaterThan(0);
    for (const c of criacoes) expect(c).toContain("IF NOT EXISTS");
    // Policy não aceita IF NOT EXISTS: a proteção é o DROP que vem antes.
    const policies = SQL_AVISOS.match(/^CREATE POLICY "([^"]+)"/gm) ?? [];
    expect(policies.length).toBeGreaterThan(0);
    for (const p of policies) {
      const nome = /"([^"]+)"/.exec(p)![1];
      expect(SQL_AVISOS).toContain(`DROP POLICY IF EXISTS "${nome}"`);
    }
  });
});
