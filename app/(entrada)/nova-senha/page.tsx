import {
  COOKIE_RECUPERACAO,
  conferirCookieRecuperacao,
} from "@/lib/auth/cookie-recuperacao";
import { destinoDaSessao, obterSessao } from "@/lib/auth/sessao";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { FormularioNovaSenha } from "./formulario-nova-senha";

export const metadata = { title: "Senha nova · repply food." };

/** Só abre vindo do link do e-mail (a ação confere de novo, por dentro). */
export default async function PaginaNovaSenha() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/entrar?erro=link_invalido");
  const valido = conferirCookieRecuperacao(
    (await cookies()).get(COOKIE_RECUPERACAO)?.value,
    sessao.userId
  );
  if (!valido) redirect(destinoDaSessao(sessao));

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Crie sua senha nova</h1>
        <p className="text-sm text-muted-foreground">Mínimo de 8 caracteres.</p>
      </div>
      <FormularioNovaSenha />
    </section>
  );
}
