"use client";

import { Button } from "@/components/ui/button";
import { detectar } from "@/lib/painel/guia-instalar";
import { useEffect, useState } from "react";
import { ConteudoInstalar } from "./conteudo-instalar";

/** Atalho permanente em Ajustes: "colocar na tela inicial". Só no celular, fora do app (D-40). */
export function AtalhoInstalar() {
  const [mostrar, setMostrar] = useState(false);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    const { eCelular, appInstalado } = detectar();
    setMostrar(eCelular && !appInstalado);
  }, []);

  if (!mostrar) return null;

  return (
    <div className="brand-surface flex flex-col gap-3 rounded-lg p-4 lg:hidden">
      <Button
        type="button"
        variant="outline"
        size="toque"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
      >
        Colocar na tela inicial
      </Button>
      {aberto ? <ConteudoInstalar /> : null}
    </div>
  );
}
