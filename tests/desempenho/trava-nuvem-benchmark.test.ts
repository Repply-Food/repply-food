// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  validarAmbienteBenchmark,
  validarEnderecoLocalBenchmark,
  validarPostgresLocalBenchmark,
} from "../../scripts/desempenho/trava-nuvem";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("trava-nuvem do benchmark (fail-closed)", () => {
  describe("validarEnderecoLocalBenchmark", () => {
    it.each([
      "http://127.0.0.1:54321",
      "http://localhost:54321",
      "http://[::1]:54321",
    ])("aceita endpoint HTTP em loopback literal: %s", (url) => {
      expect(validarEnderecoLocalBenchmark(url)).toBe(true);
    });

    it.each([
      "https://abc.supabase.co",
      "https://food.repplyhub.com.br",
      "http://192.168.1.50:54321",
      "http://127.0.0.1.attacker.com",
      "http://app.test:3000",
      "http://localhost.localdomain:3000",
      "not-a-valid-url",
      "ftp://127.0.0.1:21",
    ])("recusa endpoint HTTP nao local ou protocolo invalido: %s", (url) => {
      expect(validarEnderecoLocalBenchmark(url)).toBe(false);
    });
  });

  describe("validarPostgresLocalBenchmark", () => {
    it.each([
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      "postgres://postgres:postgres@localhost:54322/postgres",
      "postgresql://postgres:postgres@[::1]:54322/postgres",
    ])("aceita conexao postgres em loopback literal: %s", (connStr) => {
      expect(validarPostgresLocalBenchmark(connStr)).toBe(true);
    });

    it.each([
      "postgresql://postgres:pass@db.xyz.supabase.co:5432/postgres",
      "postgresql://postgres:pass@192.168.1.50:5432/postgres",
      "postgresql://postgres:pass@aws.rds.amazonaws.com:5432/postgres",
      "postgresql://postgres:pass@db.test:5432/postgres",
      "invalid-conn-string",
      "http://127.0.0.1:5432/postgres",
    ])(
      "recusa conexao postgres nao local ou protocolo invalido: %s",
      (connStr) => {
        expect(validarPostgresLocalBenchmark(connStr)).toBe(false);
      }
    );
  });

  describe("validarAmbienteBenchmark", () => {
    it("passa quando HTTP e DB sao loopback literal", () => {
      expect(() =>
        validarAmbienteBenchmark({
          httpUrl: "http://127.0.0.1:54321",
          dbUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        })
      ).not.toThrow();
    });

    it("recusa HTTP remoto mesmo com PERMITIR_NUVEM_NO_DEV=1 ou NODE_ENV=production e nao vaza URL", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("PERMITIR_NUVEM_NO_DEV", "1");
      let erro: unknown;
      try {
        validarAmbienteBenchmark({
          httpUrl: "https://abc.supabase.co",
          dbUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        });
      } catch (e) {
        erro = e;
      }
      expect(erro).toBeInstanceOf(Error);
      const msg = (erro as Error).message.toLowerCase();
      expect(msg).toMatch(/remot|inval/);
      expect(msg).not.toMatch(/abc\.supabase\.co/);
      expect(msg).not.toMatch(/postgres:/);
      expect(msg).not.toMatch(/postgresql:/);
    });

    it("recusa DB remoto mesmo com PERMITIR_NUVEM_NO_DEV=1 ou NODE_ENV=production e nao vaza credenciais", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("PERMITIR_NUVEM_NO_DEV", "1");
      let erro: unknown;
      try {
        validarAmbienteBenchmark({
          httpUrl: "http://127.0.0.1:54321",
          dbUrl:
            "postgresql://postgres:senha-secreta@db.xyz.supabase.co:5432/postgres",
        });
      } catch (e) {
        erro = e;
      }
      expect(erro).toBeInstanceOf(Error);
      const msg = (erro as Error).message.toLowerCase();
      expect(msg).toMatch(/remot|inval/);
      expect(msg).not.toMatch(/db\.xyz\.supabase\.co/);
      expect(msg).not.toMatch(/senha-secreta/);
      expect(msg).not.toMatch(/pass/);
    });

    it("recusa *.test e nomes localhost derivados", () => {
      expect(() =>
        validarAmbienteBenchmark({
          httpUrl: "http://app.test:3000",
          dbUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        })
      ).toThrow();
      expect(() =>
        validarAmbienteBenchmark({
          httpUrl: "http://127.0.0.1:54321",
          dbUrl: "postgresql://postgres:postgres@db.test:5432/postgres",
        })
      ).toThrow();
    });

    it("recusa URLs vazias ou ausentes", () => {
      expect(() =>
        validarAmbienteBenchmark({
          httpUrl: "",
          dbUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        })
      ).toThrow();

      expect(() =>
        validarAmbienteBenchmark({
          httpUrl: "http://127.0.0.1:54321",
          dbUrl: "",
        })
      ).toThrow();
    });
  });
});
