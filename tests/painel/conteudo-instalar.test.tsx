import "@testing-library/jest-dom/vitest";
import { ConteudoInstalar } from "@/components/painel/instalar/conteudo-instalar";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

function fingirIOS(ehIOS: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("pointer"),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("navigator", {
    userAgent: ehIOS ? "Mozilla/5.0 (iPhone)" : "Mozilla/5.0 (Linux; Android)",
    platform: ehIOS ? "iPhone" : "Linux",
    maxTouchPoints: 5,
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ConteudoInstalar", () => {
  it("iPhone: mostra o passo do Compartilhar", () => {
    fingirIOS(true);
    render(<ConteudoInstalar />);
    expect(screen.getByText(/Compartilhar/i)).toBeInTheDocument();
    expect(screen.getByText(/Adicionar à Tela de Início/i)).toBeInTheDocument();
  });
  it("Android: mostra os passos manuais (⋮) por padrão", () => {
    fingirIOS(false);
    render(<ConteudoInstalar />);
    expect(screen.getByText(/três pontinhos/i)).toBeInTheDocument();
  });
  it("a chave troca de iPhone para Android", () => {
    fingirIOS(true);
    render(<ConteudoInstalar />);
    fireEvent.click(screen.getByRole("button", { name: "Android" }));
    expect(screen.getByText(/três pontinhos/i)).toBeInTheDocument();
  });
});
