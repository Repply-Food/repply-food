// @vitest-environment jsdom
import { Markdown } from "@/components/painel/mentor/markdown";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

// O mentor responde em Markdown (o Gemini formata por natureza). A tela precisa
// renderizar isso — negrito, itálico, código, listas e quebras — SEM virar HTML
// cru: nada de dangerouslySetInnerHTML. Como tudo vira árvore React, o texto é
// escapado e um "<script>" na resposta aparece como texto, nunca executa.

afterEach(cleanup);

describe("Markdown do mentor: renderização", () => {
  it("negrito vira <strong> e some o '**'", () => {
    const { container } = render(
      <Markdown texto="Fechou com **R$ 6.101,90** hoje." />
    );
    const forte = container.querySelector("strong");
    expect(forte?.textContent).toBe("R$ 6.101,90");
    expect(container.textContent).toContain("R$ 6.101,90");
    expect(container.textContent).not.toContain("**");
  });

  it("itálico vira <em>", () => {
    const { container } = render(<Markdown texto="isso é *importante*" />);
    expect(container.querySelector("em")?.textContent).toBe("importante");
    expect(container.textContent).not.toContain("*");
  });

  it("código em linha vira <code>", () => {
    const { container } = render(<Markdown texto="use `metrica_x` aqui" />);
    expect(container.querySelector("code")?.textContent).toBe("metrica_x");
    expect(container.textContent).not.toContain("`");
  });

  it("lista com hífen vira <ul> com <li>", () => {
    const { container } = render(
      <Markdown texto={"Pontos:\n- almoço forte\n- jantar fraco"} />
    );
    const itens = container.querySelectorAll("ul li");
    expect(itens).toHaveLength(2);
    expect(itens[0]?.textContent).toBe("almoço forte");
    expect(itens[1]?.textContent).toBe("jantar fraco");
    expect(container.textContent).not.toContain("- ");
  });

  it("lista numerada vira <ol> com <li>", () => {
    const { container } = render(
      <Markdown texto={"1. primeiro\n2. segundo"} />
    );
    const itens = container.querySelectorAll("ol li");
    expect(itens).toHaveLength(2);
    expect(itens[0]?.textContent).toBe("primeiro");
    expect(itens[1]?.textContent).toBe("segundo");
  });

  it("quebra simples vira <br> no mesmo parágrafo", () => {
    const { container } = render(<Markdown texto={"linha um\nlinha dois"} />);
    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(container.querySelectorAll("br")).toHaveLength(1);
    expect(container.textContent).toContain("linha um");
    expect(container.textContent).toContain("linha dois");
  });

  it("linha em branco separa em parágrafos", () => {
    const { container } = render(<Markdown texto={"p um\n\np dois"} />);
    expect(container.querySelectorAll("p")).toHaveLength(2);
  });

  it("texto sem marcação sai como parágrafo simples", () => {
    const { container } = render(<Markdown texto="A semana fechou em alta." />);
    expect(container.querySelector("p")?.textContent).toBe(
      "A semana fechou em alta."
    );
    expect(container.querySelector("strong")).toBeNull();
  });
});

describe("Markdown do mentor: segurança (sem injeção de HTML)", () => {
  it("HTML na resposta vira texto literal, não elementos", () => {
    const perigo =
      "<script>alert(1)</script> e <img src=x onerror=alert(2)> fim";
    const { container } = render(<Markdown texto={perigo} />);
    // Nenhum elemento perigoso foi criado.
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    // O texto aparece escapado, como o dono deveria ver.
    expect(container.textContent).toContain("<script>alert(1)</script>");
    expect(container.textContent).toContain("<img src=x onerror=alert(2)>");
  });
});
