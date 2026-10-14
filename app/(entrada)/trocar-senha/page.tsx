import { BotaoSair } from "@/components/entrada/botao-sair";
import { safeNext } from "@/lib/auth/safe-next";
import { destinoDaSessao, exigirSessao } from "@/lib/auth/sessao";
import Link from "next/link";
import { FormularioTrocarSenha } from "./formulario-trocar-senha";

export const metadata = { title: "Trocar a senha · repply food." };

export default async function PaginaTrocarSenha({
  searchParams,
}: {
  searchParams: Promise<{ voltar?: string }>;
}) {
  const sessao = await exigirSessao();
  const primeiroAcesso = sessao.precisaTrocarSenha;
  // Troca voluntária vinda de Ajustes: "Cancelar" e o fim da troca voltam para
  // lá (`?voltar=`, só caminho do próprio site). Sem ele, o destino da conta.
  // A origem fixa existe só para a validação resolver o endereço como o
  // navegador resolveria (pega truques como "/<tab>/outro-site.com").
  const voltar = primeiroAcesso
    ? null
    : safeNext((await searchParams).voltar, "https://painel.invalid");
  const voltarPara = voltar ?? destinoDaSessao(sessao);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">
          {primeiroAcesso ? "Crie sua senha" : "Trocar a senha"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {primeiroAcesso
            ? "Por segurança, troque a senha provisória que você recebeu. Só você vai saber a nova."
            : "Os outros aparelhos que usam este acesso vão precisar da senha nova."}
        </p>
      </div>
      <FormularioTrocarSenha
        pedirSenhaAtual={!primeiroAcesso}
        depois={voltar}
      />
      {primeiroAcesso ? (
        <BotaoSair />
      ) : (
        <Link
          href={voltarPara}
          className="flex min-h-11 items-center justify-center text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Cancelar
        </Link>
      )}
    </section>
  );
}
