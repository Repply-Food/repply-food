// @vitest-environment jsdom
import { DicaDoCampo } from "@/components/forms/dica-do-campo";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

describe("DicaDoCampo", () => {
  it("mostra um botão com nome acessível e esconde a dica no início", () => {
    render(
      <DicaDoCampo titulo="O dia vira às">conta no dia anterior</DicaDoCampo>
    );
    const botao = screen.getByRole("button", { name: /o dia vira às/i });
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(screen.queryByText("conta no dia anterior")).toBeNull();
  });

  it("abre e fecha a dica no clique (serve para o toque no celular)", () => {
    render(<DicaDoCampo titulo="CNPJ">com ou sem pontuação</DicaDoCampo>);
    const botao = screen.getByRole("button");
    fireEvent.click(botao);
    expect(screen.getByRole("tooltip").textContent).toContain(
      "com ou sem pontuação"
    );
    expect(botao.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(botao);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("abre ao passar o mouse e fecha ao tirar (computador)", () => {
    render(<DicaDoCampo titulo="Fuso">fuso da cidade</DicaDoCampo>);
    const botao = screen.getByRole("button");
    fireEvent.mouseEnter(botao);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.mouseLeave(botao);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("fecha com a tecla Esc", () => {
    render(<DicaDoCampo titulo="Fuso">fuso da cidade</DicaDoCampo>);
    const botao = screen.getByRole("button");
    fireEvent.click(botao);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.keyDown(botao, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
