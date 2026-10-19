// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  CurvaDoDia,
  rotuloDaHora,
} from "@/components/painel/hoje/curva-do-dia";
import type { PontoDaCurva } from "@/lib/metricas/tipos";

afterEach(cleanup);

/**
 * 48 faixas de 30 min desde a virada do dia. `agora` é o índice da última faixa
 * que já chegou: dali em diante `hoje` é null (o futuro não se desenha). O
 * acumulado cresce 100 por faixa; o dia típico, 120.
 */
function curva({
  agora,
  comTipico,
}: {
  agora: number;
  comTipico: boolean;
}): PontoDaCurva[] {
  return Array.from({ length: 48 }, (_, i) => ({
    minuto: i * 30,
    hoje: i <= agora ? (i * 100).toFixed(2) : null,
    tipico: comTipico ? (i * 120).toFixed(2) : null,
  }));
}

const ROTULO = /curva acumulada de hoje contra o dia típico/i;

function linhas(container: HTMLElement) {
  return Array.from(container.querySelectorAll("path.recharts-line-curve"));
}

describe("CurvaDoDia", () => {
  it("expõe a curva como imagem com o rótulo acessível", () => {
    render(<CurvaDoDia pontos={curva({ agora: 20, comTipico: true })} />);
    expect(screen.getByRole("img", { name: ROTULO })).toBeTruthy();
  });

  it("desenha a linha de hoje (laranja, cheia) e a do dia típico (cinza, tracejada)", () => {
    const { container } = render(
      <CurvaDoDia pontos={curva({ agora: 20, comTipico: true })} />
    );

    const desenhadas = linhas(container);
    expect(desenhadas).toHaveLength(2);
    const hoje = desenhadas.find(
      (linha) => linha.getAttribute("stroke") === "var(--color-hoje)"
    );
    const tipico = desenhadas.find(
      (linha) => linha.getAttribute("stroke") === "var(--color-tipico)"
    );
    if (!(hoje && tipico)) {
      throw new Error("esperava a linha de hoje e a do dia típico");
    }

    expect(hoje.getAttribute("stroke-dasharray")).toBeNull();
    expect(tipico.getAttribute("stroke-dasharray")).toBeTruthy();

    // As cores da marca moram no ChartConfig, publicadas como variáveis.
    const css = container.querySelector("style")?.textContent ?? "";
    expect(css).toContain("--color-hoje: #FF5A1F");
    expect(css).toContain("--color-tipico: #A3A3A3");
  });

  it("marca o ponto de agora na última faixa com valor de hoje", () => {
    const { container } = render(
      <CurvaDoDia pontos={curva({ agora: 20, comTipico: true })} />
    );
    expect(container.querySelectorAll(".recharts-reference-dot")).toHaveLength(
      1
    );
  });

  it("sem histórico (tipico todo null) desenha só a linha de hoje, sem quebrar", () => {
    const { container } = render(
      <CurvaDoDia pontos={curva({ agora: 20, comTipico: false })} />
    );

    const desenhadas = linhas(container);
    expect(desenhadas).toHaveLength(1);
    expect(desenhadas[0]?.getAttribute("stroke")).toBe("var(--color-hoje)");
    expect(container.querySelector("path[stroke-dasharray]")).toBeNull();
    // O rótulo não promete uma comparação que não está na tela.
    expect(
      screen.getByRole("img", {
        name: /curva acumulada de hoje.*sem histórico/i,
      })
    ).toBeTruthy();
  });

  it("não desenha o futuro: hoje null depois de agora não vira linha nem quebra", () => {
    const { container } = render(
      <CurvaDoDia pontos={curva({ agora: 3, comTipico: true })} />
    );
    expect(linhas(container)).toHaveLength(2);
    expect(container.querySelectorAll(".recharts-reference-dot")).toHaveLength(
      1
    );
  });

  it("casa recém-aberta, sem nenhuma faixa de hoje, renderiza sem ponto de agora", () => {
    const pontos = curva({ agora: -1, comTipico: true });
    const { container } = render(<CurvaDoDia pontos={pontos} />);
    expect(screen.getByRole("img", { name: ROTULO })).toBeTruthy();
    expect(container.querySelectorAll(".recharts-reference-dot")).toHaveLength(
      0
    );
  });

  it("lista vazia não quebra", () => {
    const { container } = render(<CurvaDoDia pontos={[]} />);
    expect(
      screen.getByRole("img", { name: /curva acumulada de hoje/i })
    ).toBeTruthy();
    expect(linhas(container)).toHaveLength(0);
    expect(container.querySelectorAll(".recharts-reference-dot")).toHaveLength(
      0
    );
  });

  it("sem a hora de virada o eixo fica escondido: minuto não diz que horas são", () => {
    const { container } = render(
      <CurvaDoDia pontos={curva({ agora: 20, comTipico: true })} />
    );
    expect(container.querySelector(".recharts-xAxis")).toBeNull();
  });

  it("com a hora de virada o eixo ganha um rótulo a cada 6 horas", () => {
    const { container } = render(
      <CurvaDoDia
        pontos={curva({ agora: 20, comTipico: true })}
        horaDeVirada={5}
      />
    );
    // O jsdom não mede texto, então o Recharts não escreve os rótulos: confere
    // as quatro marcas (0, 6, 12 e 18 h depois da virada). O texto de cada uma
    // é o `rotuloDaHora`, testado abaixo.
    expect(
      container.querySelectorAll(
        ".recharts-xAxis .recharts-cartesian-axis-tick"
      )
    ).toHaveLength(4);
  });
});

describe("rotuloDaHora", () => {
  it("soma os minutos à hora de virada e volta ao zero depois da meia-noite", () => {
    expect(rotuloDaHora(0, 5)).toBe("5h");
    expect(rotuloDaHora(360, 5)).toBe("11h");
    expect(rotuloDaHora(720, 5)).toBe("17h");
    expect(rotuloDaHora(1080, 5)).toBe("23h");
    expect(rotuloDaHora(1200, 5)).toBe("1h");
    expect(rotuloDaHora(1410, 5)).toBe("4h");
  });

  it("ignora os minutos que não completam uma hora", () => {
    expect(rotuloDaHora(30, 5)).toBe("5h");
    expect(rotuloDaHora(90, 5)).toBe("6h");
  });
});
