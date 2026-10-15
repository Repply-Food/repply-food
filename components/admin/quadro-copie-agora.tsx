"use client";

import { BotaoCopiar } from "./botao-copiar";

/**
 * Mostra uma única vez o que não aparece de novo (token, senha provisória).
 * Vive só no estado da tela: sair da página apaga o quadro (desenho §1.1).
 * A borda laranja é elemento gráfico (3:1); o texto fica no tom normal.
 */
export function QuadroCopieAgora({
  titulo,
  rotulo,
  valor,
  copias,
}: {
  titulo: string;
  rotulo: string;
  valor: string;
  copias: readonly { rotulo: string; texto: string }[];
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border-2 border-primary p-4">
      {/* <output> tem role="status": o leitor de tela anuncia o quadro. */}
      <output className="block font-bold">{titulo}</output>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-quiet">{rotulo}</span>
        <code className="number-mono select-all break-all rounded-lg bg-muted px-3 py-2 text-base">
          {valor}
        </code>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {copias.map((copia) => (
          <BotaoCopiar
            key={copia.rotulo}
            rotulo={copia.rotulo}
            texto={copia.texto}
          />
        ))}
      </div>
    </div>
  );
}
