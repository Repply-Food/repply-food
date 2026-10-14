// @vitest-environment node
import { redirecionarRelativo } from "@/lib/auth/redirecionar";
import { describe, expect, it } from "vitest";

describe("redirecionamento relativo das rotas do login", () => {
  it("devolve 307 com o endereço relativo e sem cache", () => {
    const r = redirecionarRelativo("/entrar?next=%2Fr%2Fcasa%2Fhoje");
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toBe("/entrar?next=%2Fr%2Fcasa%2Fhoje");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each([
    "//site-malicioso.com",
    "/\\site-malicioso.com",
    "https://site-malicioso.com",
    "javascript:alert(1)",
    "site-malicioso.com",
    "",
    // O navegador tira tabulação e quebra de linha do endereço: "/\t/x" viraria "//x".
    "/\t/site-malicioso.com",
    "/\n/site-malicioso.com",
  ])("destino que sairia do site (%j) cai na raiz", (para) => {
    expect(redirecionarRelativo(para).headers.get("location")).toBe("/");
  });
});
