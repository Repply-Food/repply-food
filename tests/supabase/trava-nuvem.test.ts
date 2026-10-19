// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createServiceClient,
  urlLocalDoSupabase,
} from "@/lib/supabase/service";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("urlLocalDoSupabase", () => {
  it.each([
    ["http://127.0.0.1:54321", true],
    ["http://localhost:54321", true],
    ["http://[::1]:54321", true],
    ["https://abc.supabase.co", false],
    ["https://food.repplyhub.com.br", false],
  ])("%s é local? %s", (url, esperado) => {
    expect(urlLocalDoSupabase(url)).toBe(esperado);
  });
});

describe("trava dev-contra-nuvem (dívida 10)", () => {
  it("em dev, URL de nuvem sem a liberação lança", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k");
    vi.stubEnv("PERMITIR_NUVEM_NO_DEV", "");
    expect(() => createServiceClient()).toThrow(/nuvem/i);
  });

  it("em dev, URL de nuvem COM a liberação passa", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k");
    vi.stubEnv("PERMITIR_NUVEM_NO_DEV", "1");
    expect(() => createServiceClient()).not.toThrow();
  });

  it("em dev, URL local passa (os testes de integração usam 127.0.0.1)", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k");
    expect(() => createServiceClient()).not.toThrow();
  });

  it("em dev, URL vazia não dispara a trava (é o caso 'não configurado')", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k");
    vi.stubEnv("PERMITIR_NUVEM_NO_DEV", "");
    // O createClient do supabase-js recusa URL vazia por conta própria; o que
    // importa aqui é que NÃO seja a nossa trava de nuvem que esteja falando.
    expect(() => createServiceClient()).not.toThrow(/nuvem/i);
  });

  it("em produção nunca lança, seja qual for a URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k");
    vi.stubEnv("PERMITIR_NUVEM_NO_DEV", "");
    expect(() => createServiceClient()).not.toThrow();
  });
});
