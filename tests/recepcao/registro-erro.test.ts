import { describe, expect, it } from "vitest";
import {
  type RegistroErroDb,
  registrarErroNoBanco,
} from "../../supabase/functions/_shared/registro-erro";

const registro = {
  restauranteId: "00000000-0000-0000-0000-000000000001",
  httpStatus: 422,
  erro: "formato inválido",
  payload: null,
};

describe("registro de erro da recepção", () => {
  it("recusa insert sem erro que não retorna uma linha", async () => {
    const db: RegistroErroDb = {
      inserirEnvio: async () => ({ id: null, error: null }),
      atualizarSinal: async () => ({
        restauranteId: registro.restauranteId,
        error: null,
      }),
    };
    await expect(
      registrarErroNoBanco(db, registro, "2026-10-12T12:00:00.000Z")
    ).rejects.toThrow("falha ao registrar envio");
  });

  it("recusa upsert sem erro que não retorna a identidade do sinal", async () => {
    const db: RegistroErroDb = {
      inserirEnvio: async () => ({ id: 1, error: null }),
      atualizarSinal: async () => ({ restauranteId: null, error: null }),
    };
    await expect(
      registrarErroNoBanco(db, registro, "2026-10-12T12:00:00.000Z")
    ).rejects.toThrow("falha ao registrar sinal");
  });
});
