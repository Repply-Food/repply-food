"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import type * as React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  // `resolvedTheme`, não `theme`: com "Sistema" fora do app, repassar o valor
  // cru deixaria o sonner resolver "system" por conta própria — ele tem o
  // próprio `matchMedia` — e um toast podia sair escuro numa tela clara. Este
  // era o único lugar onde o "Sistema" órfão viraria defeito VISÍVEL.
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      // `richColors` liga o caminho de cor por tipo do sonner. Sem ele, sucesso e
      // erro saem com a MESMA cara — só muda o desenho do ícone. Com ele ligado,
      // as variáveis abaixo substituem a paleta própria do sonner (verdes e
      // vermelhos em `hsl()` que não são deste sistema) pelos tokens do Food.
      richColors
      style={
        {
          "--normal-bg": "var(--bg)",
          "--normal-text": "var(--fg)",
          "--normal-border": "var(--control-border)",
          "--border-radius": "14px",
          // Fundo neutro e texto principal (contraste medido nos tokens);
          // o tipo do aviso aparece na borda colorida e no ícone, não só na cor.
          "--success-bg": "var(--surface)",
          "--success-border": "var(--success)",
          "--success-text": "var(--fg)",
          "--error-bg": "var(--surface)",
          "--error-border": "var(--danger)",
          "--error-text": "var(--fg)",
          "--warning-bg": "var(--surface)",
          "--warning-border": "var(--warning)",
          "--warning-text": "var(--fg)",
          "--info-bg": "var(--bg)",
          "--info-border": "var(--control-border)",
          "--info-text": "var(--fg)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
