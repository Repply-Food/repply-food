export const metadata = { title: "Sem conexão · repply food." };

export default function PaginaOffline() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">Sem conexão</h1>
      <p className="text-quiet">
        Você está sem internet agora. Assim que a conexão voltar, abra o painel
        de novo.
      </p>
      <a href="/" className="underline">
        Tentar de novo
      </a>
    </main>
  );
}
