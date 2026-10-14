import { destinoDaSessao, obterSessao } from "@/lib/auth/sessao";
import { redirect } from "next/navigation";

/** A raiz só encaminha: logado vai para o destino, sem login vai entrar. */
export default async function Inicio() {
  const sessao = await obterSessao();
  redirect(sessao ? destinoDaSessao(sessao) : "/entrar");
}
