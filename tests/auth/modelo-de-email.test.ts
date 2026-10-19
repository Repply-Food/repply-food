import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function ler(arquivo: string): string {
  return readFileSync(
    resolve(__dirname, "../../supabase/templates", arquivo),
    "utf8"
  );
}

const recuperacao = ler("recuperar-senha.html");
const senhaAlterada = ler("senha-alterada.html");

describe("modelo de e-mail de recuperação com a marca", () => {
  it("aponta para a página intermediária com token_hash e type=recovery", () => {
    expect(recuperacao).toContain(
      "{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=recovery&next=/nova-senha"
    );
  });

  it("não usa a ConfirmationURL: o link não passa pelo endereço do Supabase", () => {
    expect(recuperacao).not.toContain("ConfirmationURL");
  });

  it("usa o logo PNG hospedado (clientes de e-mail não renderizam SVG)", () => {
    expect(recuperacao).toContain("{{ .SiteURL }}/icon-192.png");
    expect(recuperacao).not.toMatch(/\.svg/);
  });

  it("tem o botão laranja com texto quase-preto, sem fonte externa", () => {
    const html = recuperacao.toLowerCase();
    // Texto branco sobre o laranja da marca reprova no contraste (CLAUDE.md §8).
    const botao = /background-color:#ff5a1f[^>]*>\s*<a [^>]*color:#0a0a0a/;
    expect(html).toMatch(botao);
    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic|@font-face/);
  });
});

describe.each([
  ["recuperar-senha.html", recuperacao],
  ["senha-alterada.html", senhaAlterada],
])("moldura da marca em %s", (_nome, html) => {
  it("escreve o nome com o ponto laranja e usa o logo PNG hospedado", () => {
    expect(html).toContain('repply food<span style="color:#FF5A1F;">.</span>');
    expect(html).toContain("{{ .SiteURL }}/icon-192.png");
  });

  it("tem o CSS em linha, sem bloco <style> nem arquivo externo", () => {
    expect(html).not.toMatch(/<style|<link /i);
    expect(html).toContain('style="');
  });
});
