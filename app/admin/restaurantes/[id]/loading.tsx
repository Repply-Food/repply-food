/**
 * Enquanto o detalhe carrega da nuvem, mostra a estrutura NA HORA — em vez de a
 * tela parecer travada ao clicar. O Next troca por isto no instante do clique
 * (a lista à esquerda e os cartões do detalhe viram blocos "pulsando") e, quando
 * os dados chegam, substitui pelo conteúdo real. Espelha o layout de duas
 * colunas de `page.tsx`.
 */
const BLOCO = "animate-pulse rounded-xl bg-muted";

export default function Carregando() {
  const linhasDaLista = ["l1", "l2", "l3", "l4", "l5"];
  const cartoes = ["c1", "c2", "c3", "c4"];
  return (
    <div className="lg:grid lg:grid-cols-[1.35fr_1fr] lg:items-start lg:gap-6">
      <div className="hidden lg:flex lg:flex-col lg:gap-2" aria-hidden="true">
        <div className={`${BLOCO} h-8 w-40`} />
        {linhasDaLista.map((chave) => (
          <div key={chave} className={`${BLOCO} h-12 w-full`} />
        ))}
      </div>
      <div
        className="flex flex-col gap-4"
        aria-busy="true"
        aria-label="Carregando o restaurante"
      >
        <div className={`${BLOCO} h-8 w-48`} />
        {cartoes.map((chave) => (
          <div key={chave} className={`${BLOCO} h-28 w-full`} />
        ))}
      </div>
    </div>
  );
}
