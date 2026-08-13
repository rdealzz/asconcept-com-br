import { describe, expect, it } from "bun:test";
import { isMissingTable } from "./admin-notifications";

describe("isMissingTable", () => {
  it("reconhece o código do próprio Postgres", () => {
    expect(isMissingTable({ code: "42P01" })).toBe(true);
    expect(
      isMissingTable({ message: 'relation "public.admin_notifications" does not exist' }),
    ).toBe(true);
  });

  it("reconhece a resposta do PostgREST, que é a que chega de verdade", () => {
    // A leitura não fala com o Postgres direto — fala com o PostgREST. Este é
    // o caso que faltava: a aba caía no erro genérico e mostrava um vermelho
    // no lugar do aviso de que a tabela ainda não existe.
    expect(isMissingTable({ code: "PGRST205" })).toBe(true);
    expect(
      isMissingTable({
        code: "PGRST205",
        message: "Could not find the table 'public.admin_notifications' in the schema cache",
      }),
    ).toBe(true);
    // Mesmo sem o código, a mensagem sozinha basta.
    expect(
      isMissingTable({
        message: "Could not find the table 'public.admin_notifications' in the schema cache",
      }),
    ).toBe(true);
  });

  it("não confunde erro de permissão com tabela ausente", () => {
    // RLS recusando leitura é outra história: ali a tabela existe e o aviso
    // certo é o de erro, não o de "ainda não foi criada".
    expect(isMissingTable({ code: "42501", message: "permission denied for table" })).toBe(false);
    expect(isMissingTable({ code: "PGRST301", message: "JWT expired" })).toBe(false);
    expect(isMissingTable({ code: "42703", message: "column x does not exist" })).toBe(false);
  });

  it("trata ausência de erro como ausência de problema", () => {
    expect(isMissingTable(null)).toBe(false);
    expect(isMissingTable({})).toBe(false);
  });
});
