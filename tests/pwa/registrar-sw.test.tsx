import { RegistrarSW } from "@/components/pwa/registrar-sw";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("RegistrarSW", () => {
  it("registra /sw.js em produção quando há suporte", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const register = vi.fn(async () => ({}));
    vi.stubGlobal("navigator", { serviceWorker: { register } });
    render(<RegistrarSW />);
    await vi.waitFor(() => expect(register).toHaveBeenCalledWith("/sw.js"));
  });

  it("não registra fora de produção", () => {
    vi.stubEnv("NODE_ENV", "development");
    const register = vi.fn(async () => ({}));
    vi.stubGlobal("navigator", { serviceWorker: { register } });
    render(<RegistrarSW />);
    expect(register).not.toHaveBeenCalled();
  });

  it("não quebra quando register rejeita", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const register = vi.fn(async () => {
      throw new Error("falhou");
    });
    vi.stubGlobal("navigator", { serviceWorker: { register } });
    expect(() => render(<RegistrarSW />)).not.toThrow();
    await vi.waitFor(() => expect(register).toHaveBeenCalled());
  });

  it("não quebra quando não há serviceWorker", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal("navigator", {});
    expect(() => render(<RegistrarSW />)).not.toThrow();
  });
});
