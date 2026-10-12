export type RegistroEnvio = {
  restauranteId: string;
  httpStatus: number;
  erro: string;
  payload: unknown;
};

export type RegistroErroDb = {
  inserirEnvio: (
    registro: RegistroEnvio
  ) => Promise<{ id: number | null; error: unknown }>;
  atualizarSinal: (
    restauranteId: string,
    agora: string
  ) => Promise<{ restauranteId: string | null; error: unknown }>;
};

export async function registrarErroNoBanco(
  db: RegistroErroDb,
  registro: RegistroEnvio,
  agora: string
): Promise<void> {
  const envio = await db.inserirEnvio(registro);
  if (envio.error || envio.id === null) {
    throw new Error("falha ao registrar envio");
  }
  const sinal = await db.atualizarSinal(registro.restauranteId, agora);
  if (sinal.error || sinal.restauranteId !== registro.restauranteId) {
    throw new Error("falha ao registrar sinal");
  }
}
