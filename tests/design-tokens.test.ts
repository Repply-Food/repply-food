import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = ["tokens", "brand"]
  .map((nome) => readFileSync(resolve("app/styles", `${nome}.css`), "utf8"))
  .join("\n");

// CSSOM lê as regras reais; a resolução respeita herança de valores já
// computados (um alias definido apenas na raiz não se reavalia numa ilha).
function estilos(classes: string[][], estado = "") {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  const regras = Array.from(style.sheet?.cssRules ?? []).filter(
    (regra): regra is CSSStyleRule => regra.type === 1
  );
  let herdados: Record<string, string> = {};
  const elementos: Element[] = [document.documentElement];
  for (const nomes of classes) {
    const filho = document.createElement("section");
    filho.className = nomes.join(" ");
    elementos.at(-1)?.append(filho);
    elementos.push(filho);
  }
  try {
    for (const elemento of elementos) {
      herdados = Object.fromEntries(
        Object.entries(herdados).filter(
          ([nome]) =>
            nome.startsWith("--") || ["color", "font-family"].includes(nome)
        )
      );
      const locais: Record<string, string> = {};
      for (const regra of regras) {
        let seletor = regra.selectorText;
        if (/:hover|:focus-visible/.test(seletor)) {
          if (
            !estado ||
            !seletor.includes(`:${estado}`) ||
            elemento !== elementos.at(-1)
          )
            continue;
          seletor = seletor.replace(`:${estado}`, "");
        }
        if (!elemento.matches(seletor)) continue;
        for (let i = 0; i < regra.style.length; i++) {
          const nome = regra.style[i];
          if (nome) locais[nome] = regra.style.getPropertyValue(nome).trim();
        }
      }
      const resolver = (valor: string, caminho: string[] = []): string =>
        valor.replace(
          /var\((--[\w-]+)(?:,\s*([^()]*))?\)/g,
          (_, nome, fallback) => {
            if (caminho.includes(nome))
              throw new Error(`Alias circular: ${nome}`);
            const bruto = locais[nome] ?? herdados[nome] ?? fallback;
            if (!bruto) throw new Error(`Token sem valor: ${nome}`);
            return resolver(bruto, [...caminho, nome]);
          }
        );
      herdados = {
        ...herdados,
        ...Object.fromEntries(
          Object.entries(locais).map(([nome, valor]) => [nome, resolver(valor)])
        ),
      };
    }
    return herdados;
  } finally {
    elementos[1]?.remove();
    style.remove();
  }
}

function luminancia(cor: string) {
  const canais = cor.startsWith("#")
    ? cor
        .slice(1)
        .match(/.{2}/g)
        ?.map((canal) => Number.parseInt(canal, 16))
    : cor
        .match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number);
  if (canais?.length !== 3) throw new Error(`Cor não resolvida: ${cor}`);
  const lineares = canais.map((canal) => {
    const n = canal / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return (
    0.2126 * (lineares[0] ?? 0) +
    0.7152 * (lineares[1] ?? 0) +
    0.0722 * (lineares[2] ?? 0)
  );
}

function contraste(texto: string, fundo: string) {
  const a = luminancia(texto);
  const b = luminancia(fundo);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const contextos: [string, string[][]][] = [
  ["padrão claro", []],
  ["claro explícito", [["theme-light"]]],
  ["escuro", [["theme-dark"]]],
  ["escuro alias dark", [["dark"]]],
  ["paper no claro", [["theme-light"], ["scheme-paper"]]],
  ["ink no claro", [["theme-light"], ["scheme-ink"]]],
  ["paper no escuro", [["theme-dark"], ["scheme-paper"]]],
  ["ink no escuro", [["theme-dark"], ["scheme-ink"]]],
  ["paper dentro de ink", [["theme-dark"], ["scheme-ink"], ["scheme-paper"]]],
  ["ink dentro de paper", [["theme-light"], ["scheme-paper"], ["scheme-ink"]]],
  ["paper no mesmo elemento escuro", [["theme-dark", "scheme-paper"]]],
  ["ink no mesmo elemento claro", [["theme-light", "scheme-ink"]]],
];

describe.each(contextos)("contraste CSS real: %s", (_, classes) => {
  it("texto principal e legenda passam em página e superfície (normal 4.5 / grande 3)", () => {
    const tokens = estilos(classes);
    const fundoSuperficie = tokens["--surface"];
    for (const fundo of [tokens["--bg"], fundoSuperficie]) {
      for (const texto of [tokens["--fg"], tokens["--muted"]]) {
        expect(contraste(texto ?? "", fundo ?? "")).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        contraste(tokens["--fg"] ?? "", fundo ?? "")
      ).toBeGreaterThanOrEqual(3);
    }
    const superficie = estilos([...classes, ["brand-surface"]]);
    const legenda = estilos([...classes, ["brand-surface"], ["text-quiet"]]);
    expect(
      contraste(legenda.color ?? "", superficie["background-color"] ?? "")
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("ação laranja usa quase-preto, inclusive hover; etiquetas têm texto acessível", () => {
    for (const classe of [
      "brand-action",
      "status-success",
      "status-danger",
      "status-warning",
    ]) {
      const consumidor = estilos([...classes, [classe]]);
      const fundo = consumidor["background-color"] ?? "";
      const texto = consumidor.color ?? "";
      expect(contraste(texto, fundo)).toBeGreaterThanOrEqual(4.5);
      if (classe === "brand-action") expect(texto).toBe("#0a0a0a");
    }
    const hover = estilos([...classes, ["brand-action"]], "hover");
    expect(hover.color).toBe("#0a0a0a");
    expect(
      contraste(hover.color ?? "", hover["background-color"] ?? "")
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("aliases da ilha não conservam valores do tema pai e o foco tem contraste", () => {
    const tokens = estilos(classes);
    expect(tokens["--bg"]).toBe(tokens["--color-page"]);
    expect(tokens["--fg"]).toBe(tokens["--color-text"]);
    expect(
      contraste(tokens["--focus-ring"] ?? "", tokens["--bg"] ?? "")
    ).toBeGreaterThanOrEqual(3);
    expect(
      contraste(tokens["--action-fg"] ?? "", tokens["--action-hover"] ?? "")
    ).toBeGreaterThanOrEqual(4.5);
  });
});

it("ilhas paper/ink têm identidade própria, não são inversões do pai", () => {
  for (const tema of ["theme-light", "theme-dark"]) {
    expect(estilos([[tema], ["scheme-paper"]])["--bg"]).toBe("#ffffff");
    expect(estilos([[tema], ["scheme-ink"]])["--bg"]).toBe("#0a0a0a");
    expect(estilos([[tema, "scheme-paper"]])["--bg"]).toBe("#ffffff");
    expect(estilos([[tema, "scheme-ink"]])["--bg"]).toBe("#0a0a0a");
  }
});

it("fontes e cores aprovadas permanecem disponíveis; pontos são decoração, não texto", () => {
  const tokens = estilos([]);
  expect(tokens["--font-display"]).toContain("General Sans");
  expect(tokens["--font-sans"]).toContain("Satoshi");
  expect(tokens["--font-mono"]).toContain("JetBrains Mono");
  expect(tokens["--brand-orange"]).toBe("#ff5a1f");
  expect(tokens["--brand-tomato"]).toBe("#e8371f");
  expect(tokens["--brand-leaf"]).toBe("#2f9e44");
});
