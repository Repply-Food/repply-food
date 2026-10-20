"use client";

import { Button } from "@/components/ui/button";
import {
  detectar,
  deveMostrarGuia,
  jaViuGuia,
  marcarGuiaVisto,
} from "@/lib/painel/guia-instalar";
import { useEffect, useState } from "react";
import { ConteudoInstalar } from "./conteudo-instalar";

/** Cartão "coloque na tela inicial": uma vez por aparelho, só no celular, fora do app (D-36). */
export function GuiaInstalar() {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const { eCelular, appInstalado } = detectar();
    setVisivel(deveMostrarGuia({ eCelular, appInstalado, jaViu: jaViuGuia() }));
  }, []);

  if (!visivel) return null;

  function dispensar() {
    marcarGuiaVisto();
    setVisivel(false);
  }

  return (
    <section
      aria-label="Instalar no celular"
      className="brand-surface flex flex-col gap-3 rounded-lg p-4 lg:hidden"
    >
      <div className="flex justify-end">
        <button
          type="button"
          aria-label="Fechar"
          onClick={dispensar}
          className="shrink-0 text-quiet"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      {/* O cabeçalho ("Coloque o app na sua tela inicial"), a chave iPhone/Android
          e os passos vêm do ConteudoInstalar (não duplicar aqui). */}
      <ConteudoInstalar />
      <Button type="button" variant="outline" size="toque" onClick={dispensar}>
        Fazer depois
      </Button>
    </section>
  );
}
