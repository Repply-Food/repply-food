import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = ["tokens", "brand"]
  .map((nome) => readFileSync(resolve("app/styles", `${nome}.css`), "utf8"))
  .join("\n");

// CSSOM lê as regras reais; a resolução respeita herança de valores já
// computados (um alias definido apenas na raiz não se reavalia numa ilha).
// Subconjunto FECHADO, não motor CSS geral: :root e uma classe ASCII simples,
// opcionalmente :hover/:focus-visible, ou listas só desses átomos. Pesos 1/2;
// empate por ordem. Estado simulado apenas no último elemento; seletor de
// interação que casa um ancestral é recusado (não inferimos seu estado).
// IDs, compostos, combinadores, funções (:where/:is etc.),
// escapes, outros estados/pseudo-elementos e at-rules falham ANTES de matches.
// Qualquer "!" bruto é recusado conservadoramente, inclusive em comentários/
// strings: evita perder !important anterior quando CSSOM colapsa declarações.
// Só .signature-dot::after com content "." e color var(--brand-orange) é
// excluído como decoração; novo conteúdo/regra requer revisão explícita.
function estilos(classes: string[][], estado = "", fonteCss = css) {
  if (fonteCss.includes("!"))
    throw new Error("CSS não suportado: prioridade ! não modelada");
  if (!["", "hover", "focus-visible"].includes(estado))
    throw new Error(`CSS não suportado: estado ${estado}`);
  const style = document.createElement("style");
  style.textContent = fonteCss;
  document.head.append(style);
  let herdados: Record<string, string> = {};
  const elementos: Element[] = [document.documentElement];
  for (const nomes of classes) {
    const filho = document.createElement("section");
    filho.className = nomes.join(" ");
    elementos.at(-1)?.append(filho);
    elementos.push(filho);
  }
  try {
    if (!style.sheet)
      throw new Error("CSS não suportado: folha não interpretada");
    const atomo = "(?::root|\\.[A-Za-z_][\\w-]*(?::(?:hover|focus-visible))?)";
    const listaSimples = new RegExp(`^${atomo}(?:\\s*,\\s*${atomo})*$`);
    const regras = Array.from(style.sheet.cssRules).flatMap((regra) => {
      if (regra.type !== 1) throw new Error("CSS não suportado: at-rule");
      const regraEstilo = regra as CSSStyleRule;
      const seletor = regraEstilo.selectorText.trim();
      if (seletor === ".signature-dot::after") {
        const content = regraEstilo.style.getPropertyValue("content").trim();
        if (
          regraEstilo.style.length !== 2 ||
          !['"."', "'.'"].includes(content) ||
          regraEstilo.style.getPropertyValue("color").trim() !==
            "var(--brand-orange)"
        )
          throw new Error(
            "CSS não suportado: assinatura não é o ponto decorativo aprovado"
          );
        return [];
      }
      // Só dividir vírgulas DEPOIS de validar a gramática inteira, que não
      // admite parênteses/strings. Uma lista :where(a,b) nunca entra aqui.
      if (!listaSimples.test(seletor))
        throw new Error(`CSS não suportado: seletor ${seletor}`);
      return [
        {
          regra: regraEstilo,
          seletores: seletor.split(",").map((item) => item.trim()),
        },
      ];
    });
    for (const elemento of elementos) {
      herdados = Object.fromEntries(
        Object.entries(herdados).filter(
          ([nome]) =>
            nome.startsWith("--") || ["color", "font-family"].includes(nome)
        )
      );
      const locais: Record<string, string> = {};
      const pesos: Record<string, number> = {};
      for (const { regra, seletores } of regras) {
        let peso = 0;
        for (const seletor of seletores) {
          const interacao = seletor.match(/:(hover|focus-visible)$/)?.[1];
          const base = interacao
            ? seletor.slice(0, -(interacao.length + 1))
            : seletor;
          if (!elemento.matches(base)) continue;
          if (interacao && elemento !== elementos.at(-1))
            throw new Error("CSS não suportado: interação em ancestral");
          if (interacao && interacao !== estado) continue;
          peso = Math.max(peso, interacao ? 2 : 1);
        }
        if (!peso) continue;
        for (let i = 0; i < regra.style.length; i++) {
          const nome = regra.style[i];
          if (nome && peso >= (pesos[nome] ?? 0)) {
            locais[nome] = regra.style.getPropertyValue(nome).trim();
            pesos[nome] = peso;
          }
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

  it("texto de erro (--danger-text) passa 4.5 em página e superfície", () => {
    const tokens = estilos(classes);
    for (const fundo of [tokens["--bg"], tokens["--surface"]]) {
      expect(
        contraste(tokens["--danger-text"] ?? "", fundo ?? "")
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("borda de campo (--control-border) passa 3 em página e superfície (WCAG 1.4.11)", () => {
    const tokens = estilos(classes);
    for (const fundo of [tokens["--bg"], tokens["--surface"]]) {
      expect(
        contraste(tokens["--control-border"] ?? "", fundo ?? "")
      ).toBeGreaterThanOrEqual(3);
    }
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

describe("Q1: subconjunto fechado do resolvedor de contraste", () => {
  const acaoNormal =
    ".brand-action { color: #0a0a0a; background-color: #ff5a1f; }";

  it("recusa estado não modelado em vez de tratá-lo como ausência de interação", () => {
    expect(() => estilos([["brand-action"]], "active", acaoNormal)).toThrow(
      /CSS não suportado:/
    );
  });

  it("recusa interação no ancestral que poderia mudar a cor herdada do consumidor", () => {
    expect(() =>
      estilos(
        [["theme-dark"], ["brand-action"]],
        "hover",
        ":root { --action-fg: #0a0a0a; } .theme-dark:hover { --action-fg: #ffffff; } .brand-action { color: var(--action-fg); background-color: #ff5a1f; }"
      )
    ).toThrow(/CSS não suportado:/);
  });

  it.each([
    [
      "mais específica anterior",
      `.brand-action.brand-action { color: #ffffff; } ${acaoNormal}`,
    ],
    [
      "seletor contextual anterior",
      `:root .brand-action { color: #ffffff; } ${acaoNormal}`,
    ],
    [
      "ID mesmo sem matching neste caso",
      `#outro { color: #ffffff; } ${acaoNormal}`,
    ],
    [
      "tipo de elemento",
      `section.brand-action { color: #ffffff; } ${acaoNormal}`,
    ],
    [
      "where vale zero, não uma classe",
      `:where(.brand-action) { color: #ffffff; } ${acaoNormal}`,
    ],
    [
      "vírgulas dentro de where",
      `:where(.text-quiet, .brand-action), .brand-action { color: #ffffff; } ${acaoNormal}`,
    ],
    [
      "lista mistura átomo aceito e seletor não suportado",
      `.brand-action, :is(.brand-action, .text-quiet) { color: #ffffff; } ${acaoNormal}`,
    ],
    [
      "important na regra anterior",
      `.brand-action { color: #ffffff !important; } ${acaoNormal}`,
    ],
    [
      "important antes da declaração normal no mesmo bloco",
      ".brand-action { color: #ffffff !important; color: #0a0a0a; background-color: #ff5a1f; }",
    ],
    [
      "important entre declarações de variáveis",
      ":root { --texto: #ffffff !important; --texto: #0a0a0a; } .brand-action { color: var(--texto); background-color: #ff5a1f; }",
    ],
    [
      "prioridade com comentário entre bang e palavra",
      `.brand-action { color: #ffffff !/**/important; } ${acaoNormal}`,
    ],
    [
      "pseudoclasse não modelada",
      `.brand-action:active { color: #ffffff; } ${acaoNormal}`,
    ],
    [
      "at-rule não pode ser descartada silenciosamente",
      `${acaoNormal} @media (min-width: 1px) { .brand-action { color: #ffffff; } }`,
    ],
    [
      "pseudo-elemento textual novo",
      `${acaoNormal} .mensagem::after { content: "Sem dados"; color: #ffffff; }`,
    ],
    [
      "signature-dot virou texto, não decoração",
      `${acaoNormal} .signature-dot::after { content: "Atenção"; color: var(--brand-orange); }`,
    ],
    [
      "signature-dot misturada com elemento real",
      `${acaoNormal} .signature-dot::after, .brand-action { content: "."; color: #ffffff; }`,
    ],
    [
      "signature-dot ganhou propriedade fora da exclusão",
      `${acaoNormal} .signature-dot::after { content: "."; color: var(--brand-orange); background-color: #ffffff; }`,
    ],
  ] as const)(
    "recusa %s em vez de informar contraste falso verde",
    (_, fonteCss) => {
      expect(() => estilos([["brand-action"]], "hover", fonteCss)).toThrow(
        /CSS não suportado:/
      );
    }
  );

  it.each(["hover", "focus-visible"])(
    "%s anterior vence a classe posterior e revela texto branco/laranja reprovado",
    (estado) => {
      const consumidor = estilos(
        [["brand-action"]],
        estado,
        `.brand-action:${estado} { color: #ffffff; } ${acaoNormal}`
      );
      expect(consumidor.color).toBe("#ffffff");
      expect(
        contraste(consumidor.color ?? "", consumidor["background-color"] ?? "")
      ).toBeLessThan(4.5);
    }
  );

  it("lista simples considera o membro normal mesmo sem ativar o outro membro hover", () => {
    const consumidor = estilos(
      [["text-quiet"]],
      "",
      ".brand-action:hover, .text-quiet { color: #404040; }"
    );
    expect(consumidor.color).toBe("#404040");
  });

  it("lista usa a maior especificidade entre os membros que realmente correspondem", () => {
    const consumidor = estilos(
      [["brand-action"]],
      "hover",
      `.brand-action:hover, .text-quiet { color: #ffffff; } ${acaoNormal}`
    );
    expect(consumidor.color).toBe("#ffffff");
  });

  it("root/classe têm o mesmo peso, empate usa ordem, aliases e herança continuam reais", () => {
    const consumidor = estilos(
      [["brand-action"]],
      "",
      ":root { --texto: #ffffff; --texto: #0a0a0a; color: #ffffff; } .brand-action { color: var(--texto); } .brand-action { color: #404040; }"
    );
    expect(consumidor.color).toBe("#404040");
    expect(consumidor["--texto"]).toBe("#0a0a0a");
  });

  it("só o ponto decorativo aprovado é excluído e não altera a cor do elemento real", () => {
    const consumidor = estilos(
      [["signature-dot"]],
      "",
      ':root { --brand-orange: #ff5a1f; } .signature-dot { color: #0a0a0a; } .signature-dot::after { content: "."; color: var(--brand-orange); }'
    );
    expect(consumidor.color).toBe("#0a0a0a");
    expect(consumidor.content).toBeUndefined();
  });
});
