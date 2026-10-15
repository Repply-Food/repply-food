"use client";

import { Button } from "@/components/ui/button";

/**
 * Tela de erro do painel e do admin (pendência 27). Falha passageira ao ler a
 * sessão ou os dados cai aqui, com "Tentar de novo" (`retry` busca a tela de
 * novo no servidor), em vez de virar "acesso pendente" ou lista vazia. A
 * mensagem técnica do erro não aparece.
 */
export default function ErroDaTela({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Não deu para carregar agora</h1>
        <p className="text-sm text-muted-foreground">
          Pode ser uma falha passageira da internet ou do servidor. Tente de
          novo em instantes.
        </p>
      </div>
      <Button size="toque" className="w-full" onClick={() => retry()}>
        Tentar de novo
      </Button>
    </main>
  );
}
