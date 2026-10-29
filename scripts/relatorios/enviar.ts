import type {
  Fotografia,
  PedidoRelatorios,
} from "../../supabase/functions/_shared/relatorios/schemas.ts";
import { ErroRelatorios, fragmentarFotografia } from "./fragmentar.ts";

export async function enviarFotografia(
  fotografia: Fotografia,
  transporte: (p: PedidoRelatorios) => Promise<Response>
): Promise<void> {
  // A carga inteira é validada antes do primeiro efeito externo.
  for (const pedido of fragmentarFotografia(fotografia)) {
    let resposta: Response;
    try {
      resposta = await transporte(pedido);
    } catch {
      throw new ErroRelatorios(
        "Falha no transporte local. Repita o mesmo arquivo."
      );
    }
    if (!resposta.ok) {
      await resposta.body?.cancel();
      throw new ErroRelatorios(`Envio interrompido: HTTP ${resposta.status}.`);
    }
    await resposta.body?.cancel();
  }
}

export function criarTransporteLocal(
  destino: string,
  token: string
): (p: PedidoRelatorios) => Promise<Response> {
  let url: URL;
  try {
    url = new URL(destino);
  } catch {
    throw new ErroRelatorios("Configure uma URL local de loopback.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["127.0.0.1", "[::1]", "localhost"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  )
    throw new ErroRelatorios("Somente URL local de loopback é permitida.");
  // Evita resolução DNS até para o nome local conhecido.
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  if (!token.trim() || /[\r\n]/.test(token))
    throw new ErroRelatorios("Configure RF_RELATORIOS_TOKEN para envio local.");
  return async (pedido) => {
    try {
      return await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(pedido),
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      // Nunca propagar erro de fetch, URL ou corpo remoto: podem conter segredos.
      throw new ErroRelatorios(
        "Falha no transporte local. Repita o mesmo arquivo."
      );
    }
  };
}
