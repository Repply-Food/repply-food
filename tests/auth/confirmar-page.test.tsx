// @vitest-environment jsdom
import PaginaConfirmar from "@/app/auth/confirmar/page";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

async function montar(params: Record<string, string>) {
  const ui = await PaginaConfirmar({ searchParams: Promise.resolve(params) });
  return render(ui);
}

function valorOculto(container: HTMLElement, nome: string) {
  return container
    .querySelector(`input[type="hidden"][name="${nome}"]`)
    ?.getAttribute("value");
}

describe("página intermediária de /auth/confirmar", () => {
  it("com recovery válido mostra o botão num form POST que não gasta o token", async () => {
    await montar({ token_hash: "abc", type: "recovery", next: "/nova-senha" });
    const botao = screen.getByRole("button", {
      name: /criar minha senha nova/i,
    });
    const form = botao.closest("form");
    expect(form?.getAttribute("method")).toBe("post");
    expect(form?.getAttribute("action")).toBe("/auth/confirmar/validar");
  });

  it("leva token_hash, type e next em campos ocultos", async () => {
    const { container } = await montar({
      token_hash: "abc",
      type: "recovery",
      next: "/nova-senha",
    });
    expect(valorOculto(container, "token_hash")).toBe("abc");
    expect(valorOculto(container, "type")).toBe("recovery");
    expect(valorOculto(container, "next")).toBe("/nova-senha");
  });

  it("aceita o convite (invite)", async () => {
    await montar({ token_hash: "abc", type: "invite", next: "/" });
    expect(
      screen.getByRole("button", { name: /criar minha senha nova/i })
    ).toBeTruthy();
  });

  it("sem next, o destino padrão é /nova-senha", async () => {
    const { container } = await montar({ token_hash: "abc", type: "recovery" });
    expect(valorOculto(container, "next")).toBe("/nova-senha");
  });

  it("sem token_hash mostra link inválido, nenhum botão e a volta para entrar", async () => {
    await montar({ type: "recovery", next: "/nova-senha" });
    expect(screen.getByText(/link inválido/i)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen
        .getByRole("link", { name: /voltar para entrar/i })
        .getAttribute("href")
    ).toBe("/entrar");
  });

  it.each(["signup", "email", "magiclink", "email_change", "qualquer"])(
    "tipo fora da lista (%s) mostra link inválido e nenhum botão",
    async (type) => {
      await montar({ token_hash: "abc", type, next: "/nova-senha" });
      expect(screen.getByText(/link inválido/i)).toBeTruthy();
      expect(screen.queryByRole("button")).toBeNull();
    }
  );

  it("sem nenhum parâmetro (link velho, com `code`) também é link inválido", async () => {
    await montar({});
    expect(screen.getByText(/link inválido/i)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
