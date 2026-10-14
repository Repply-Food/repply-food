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
    agora: string,
    contaComoEnvio: boolean
  ) => Promise<{ restauranteId: string | null; error: unknown }>;
};

/** O 429 é a recusa por ritmo: registra o erro, mas não é um envio. */
const HTTP_RITMO = 429;

export async function registrarErroNoBanco(
  db: RegistroErroDb,
  registro: RegistroEnvio,
  agora: string
): Promise<void> {
  const envio = await db.inserirEnvio(registro);
  if (envio.error || envio.id === null) {
    throw new Error("falha ao registrar envio");
  }
  // Se o 429 contasse como envio, ele reiniciaria a espera de 20 s e um SCC
  // apressado nunca mais seria aceito (contrato §3).
  const sinal = await db.atualizarSinal(
    registro.restauranteId,
    agora,
    registro.httpStatus !== HTTP_RITMO
  );
  if (sinal.error || sinal.restauranteId !== registro.restauranteId) {
    throw new Error("falha ao registrar sinal");
  }
}
