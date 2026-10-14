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
  camposDesconhecidos: [],
};

async function registrarErroAnterior(
  db: RegistroErroDb,
  momento: string
): Promise<void> {
  const envio = await db.inserirEnvio(registro);
  if (envio.error) throw new Error("falha ao registrar envio");
  const sinal = await db.atualizarSinal(registro.restauranteId, momento, true);
  if (sinal.error) throw new Error("falha ao registrar sinal");
}

describe("registro de erro da recepção", () => {
  it("[retrospectivo] demonstra que o adaptador anterior aceitava escrita zero sem erro", async () => {
    const db: RegistroErroDb = {
      inserirEnvio: async () => ({ id: null, error: null }),
      atualizarSinal: async () => ({ restauranteId: null, error: null }),
    };
    await expect(
      registrarErroAnterior(db, "2026-10-12T12:00:00.000Z")
    ).resolves.toBeUndefined();
  });

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

  it("um 429 registra o erro sem contar como envio", async () => {
    const contouComoEnvio: boolean[] = [];
    const db: RegistroErroDb = {
      inserirEnvio: async () => ({ id: 1, error: null }),
      atualizarSinal: async (restauranteId, _agora, contaComoEnvio) => {
        contouComoEnvio.push(contaComoEnvio);
        return { restauranteId, error: null };
      },
    };
    const momento = "2026-10-12T12:00:00.000Z";
    await registrarErroNoBanco(db, { ...registro, httpStatus: 429 }, momento);
    await registrarErroNoBanco(db, { ...registro, httpStatus: 422 }, momento);
    expect(contouComoEnvio).toEqual([false, true]);
  });
});
