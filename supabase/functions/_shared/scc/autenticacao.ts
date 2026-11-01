import { sha256Hex } from "../token.ts";

export type TokenEnvio = {
  restaurante_id: string;
  expira_em: string | null;
  revogado_em: string | null;
};

/** Mesmas regras de receber-envio, sem consultar ou alterar sinal_de_vida. */
export async function autenticarToken(
  req: Request,
  buscarPorHash: (hash: string) => Promise<TokenEnvio | null>,
  agoraIso = new Date().toISOString()
): Promise<string | null> {
  const token = /^Bearer\s+(.+)$/i
    .exec(req.headers.get("authorization") ?? "")?.[1]
    ?.trim();
  if (!token) return null;
  const linha = await buscarPorHash(await sha256Hex(token));
  if (
    !linha ||
    linha.revogado_em !== null ||
    (linha.expira_em !== null && linha.expira_em <= agoraIso)
  )
    return null;
  return linha.restaurante_id;
}
