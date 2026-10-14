// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enderecoLocal,
  lerConfig,
} from "../../scripts/gerador-dados-ficticios";

const fuso = ["--fuso", "America/Fortaleza"];
const locais = [
  "http://127.0.0.1:54321/functions/v1/receber-envio",
  "http://localhost:54321/functions/v1/receber-envio",
  "http://[::1]:54321/functions/v1/receber-envio",
];
const deFora = [
  "https://exemplo.supabase.co/functions/v1/receber-envio",
  "http://192.168.0.10:54321/functions/v1/receber-envio",
  "http://127.0.0.1.exemplo.com/functions/v1/receber-envio",
  "endereco-invalido",
];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("travas contra a nuvem", () => {
  it.each(locais)("reconhece %s como endereço desta máquina", (url) => {
    expect(enderecoLocal(url)).toBe(true);
  });

  it.each(deFora)("não reconhece %s como endereço desta máquina", (url) => {
    expect(enderecoLocal(url)).toBe(false);
  });

  it.each(locais)("o gerador envia sem confirmação para %s", (url) => {
    vi.stubEnv("SCC_URL", url);
    expect(lerConfig(fuso).url).toBe(url);
  });

  it.each(deFora)("o gerador recusa %s sem confirmação", (url) => {
    vi.stubEnv("SCC_URL", url);
    expect(() => lerConfig(fuso)).toThrow("--confirmo-nuvem");
  });

  it("o gerador aceita endereço de fora com --confirmo-nuvem", () => {
    vi.stubEnv("SCC_URL", deFora[0]);
    expect(lerConfig([...fuso, "--confirmo-nuvem"]).url).toBe(deFora[0]);
  });

  it("o dry-run não pede confirmação, porque não envia nada", () => {
    vi.stubEnv("SCC_URL", deFora[0]);
    expect(lerConfig(["--dry-run"]).dryRun).toBe(true);
  });

  it("o package.json não tem atalho que mexa na nuvem", () => {
    const pacote = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    for (const comando of Object.values(pacote.scripts)) {
      expect(comando).not.toMatch(
        /db push|--linked|functions deploy|secrets set|config push/
      );
    }
  });
});
