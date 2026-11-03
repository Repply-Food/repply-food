// @vitest-environment jsdom
import { VersoesDaCartilha } from "@/components/admin/versoes-da-cartilha";
import type { VersaoDaCartilha } from "@/lib/mentor/cartilha";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

// O histórico da cartilha na tela do admin: só leitura, para conferir e copiar
// o texto de volta para o editor à mão. Aqui vale o que a tela decide: quando
// aparece, a data no fuso do app, qual versão é a ativa (com texto, nunca só
// cor) e que não há nenhum botão de restaurar.

afterEach(cleanup);

// "Hoje" para a tela: 3 de novembro de 2026, 12:00 em Fortaleza (UTC-3).
const AGORA = "2026-11-03T15:00:00+00:00";

const ATIVA: VersaoDaCartilha = {
  id: "c3",
  texto: "Terceira versão.\nSeja breve.",
  criada_em: "2026-11-03T13:30:00+00:00",
  ativa: true,
};
const ANTERIOR: VersaoDaCartilha = {
  id: "c2",
  texto: "Segunda versão.",
  criada_em: "2026-10-30T14:05:00+00:00",
  ativa: false,
};
const MAIS_ANTIGA: VersaoDaCartilha = {
  id: "c1",
  texto: "Primeira versão.",
  criada_em: "2026-10-20T09:00:00+00:00",
  ativa: false,
};

describe("VersoesDaCartilha", () => {
  it("não mostra nada quando não há versão anterior (só a ativa)", () => {
    const { container } = render(
      <VersoesDaCartilha versoes={[ATIVA]} agoraIso={AGORA} />
    );

    expect(container.innerHTML).toBe("");
  });

  it("não mostra nada quando não há nenhuma versão", () => {
    const { container } = render(
      <VersoesDaCartilha versoes={[]} agoraIso={AGORA} />
    );

    expect(container.innerHTML).toBe("");
  });

  it("lista cada versão com a data no fuso do app, da mais nova para a mais antiga", () => {
    render(
      <VersoesDaCartilha
        versoes={[ATIVA, ANTERIOR, MAIS_ANTIGA]}
        agoraIso={AGORA}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Versões anteriores" })
    ).toBeTruthy();
    const itens = screen.getAllByRole("listitem");
    expect(itens).toHaveLength(3);
    expect(
      within(itens[0] as HTMLElement).getByText(/hoje 10:30/)
    ).toBeTruthy();
    expect(
      within(itens[1] as HTMLElement).getByText("30/10 11:05")
    ).toBeTruthy();
    expect(
      within(itens[2] as HTMLElement).getByText("20/10 06:00")
    ).toBeTruthy();
  });

  it("mostra o texto inteiro de cada versão, com as quebras de linha, para conferir e copiar", () => {
    render(<VersoesDaCartilha versoes={[ATIVA, ANTERIOR]} agoraIso={AGORA} />);

    const ativa = screen.getByText(/Terceira versão\./);
    expect(ativa.textContent).toBe("Terceira versão.\nSeja breve.");
    expect(ativa.className).toContain("whitespace-pre-wrap");
    expect(screen.getByText("Segunda versão.")).toBeTruthy();
  });

  it("cada versão abre e fecha sozinha (recolhida por padrão, sem script)", () => {
    const { container } = render(
      <VersoesDaCartilha versoes={[ATIVA, ANTERIOR]} agoraIso={AGORA} />
    );

    const blocos = container.querySelectorAll("details");
    expect(blocos).toHaveLength(2);
    for (const bloco of blocos) {
      expect(bloco.open).toBe(false);
      expect(bloco.querySelector("summary")).not.toBeNull();
    }
  });

  it("marca só a versão ativa, com a palavra 'ativa' (a cor nunca é o único canal)", () => {
    render(
      <VersoesDaCartilha
        versoes={[ATIVA, ANTERIOR, MAIS_ANTIGA]}
        agoraIso={AGORA}
      />
    );

    const itens = screen.getAllByRole("listitem");
    expect(within(itens[0] as HTMLElement).getByText("ativa")).toBeTruthy();
    expect(within(itens[1] as HTMLElement).queryByText("ativa")).toBeNull();
    expect(within(itens[2] as HTMLElement).queryByText("ativa")).toBeNull();
  });

  it("mostra o histórico mesmo sem nenhuma ativa (o admin pode querer copiar de volta)", () => {
    render(<VersoesDaCartilha versoes={[ANTERIOR]} agoraIso={AGORA} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByText("ativa")).toBeNull();
  });

  it("é só leitura: nenhum botão, nenhum campo", () => {
    render(<VersoesDaCartilha versoes={[ATIVA, ANTERIOR]} agoraIso={AGORA} />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });
});
