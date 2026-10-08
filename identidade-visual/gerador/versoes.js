// Monta todas as versões da marca repply food. (símbolos, logo completo, só texto) em SVG
// e renderiza PNGs de prévia. Proporções do logo copiadas do repply crm (medidas no PNG oficial).
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const { GS, rPath, TR, C } = require('./simbolo');

// ---------- peças ----------
const R = rPath();
const rG = (cor) => `<g transform="scale(${R.s})"><path d="${R.d}" fill="${cor}"/></g>`;

// tomate traçado do ChatGPT. mono = só a silhueta (corpo + folhas numa cor, com os vãos vazados)
function tomate({ contorno = C.branco, corpo = C.tomate, folha = C.folha, mono = null } = {}) {
  if (mono) {
    return `<g transform="${TR.transform}"><path d="${TR.red}" fill="${mono}"/><path d="${TR.green}" fill="${mono}"/></g>`;
  }
  return `<g transform="${TR.transform}">` +
    (contorno ? `<path d="${TR.sil}" fill="${contorno}"/>` : '') +
    `<path d="${TR.red}" fill="${corpo}" stroke="${corpo}" stroke-width="4" stroke-linejoin="round"/>` +
    `<path d="${TR.green}" fill="${folha}" stroke="${folha}" stroke-width="2" stroke-linejoin="round"/>` +
    `</g>`;
}
// caixa do tomate no espaço 0–100 do símbolo (silhueta medida)
const TOM_BOX = { x0: 53.99, x1: 78.47, y0: 53.35, y1: 75.44 };

// símbolo 100×100
function simboloG({ fundo, letra, borda = null, tomateOpts = {} }) {
  const caixa = fundo
    ? `<rect x="${borda ? 0.75 : 0}" y="${borda ? 0.75 : 0}" width="${borda ? 98.5 : 100}" height="${borda ? 98.5 : 100}" rx="${borda ? 22.5 : 23}" fill="${fundo}"${borda ? ` stroke="${borda}" stroke-width="1.5"` : ''}/>`
    : '';
  return caixa + rG(letra) + tomate(tomateOpts);
}

// ---------- wordmark "repply food" + tomate no lugar do ponto ----------
const XH = 41.5;                                   // altura-x = 41,5% da altura do símbolo (igual ao CRM)
const FS = XH / (GS.tables.os2.sxHeight / GS.unitsPerEm);
const BASE = 79.5;                                 // linha de base
const TRACK = -0.0497 * FS;                        // espaçamento apertado medido no CRM
const ESPACO = 16.25;                              // vão entre "repply" e "food" (tinta a tinta), como no CRM

function palavra(texto, x, cor) {
  // desenha letra a letra com o tracking da marca, respeitando o kerning
  let d = '';
  let cx = x;
  const glyphs = GS.stringToGlyphs(texto);
  glyphs.forEach((g, i) => {
    d += g.getPath(cx, BASE, FS).toPathData(2);
    let adv = g.advanceWidth * FS / GS.unitsPerEm;
    if (i < glyphs.length - 1) adv += GS.getKerningValue(g, glyphs[i + 1]) * FS / GS.unitsPerEm + TRACK;
    cx += adv;
  });
  const bb = GS.getPath(texto, 0, 0, FS).getBoundingBox();
  return { svg: `<path d="${d}" fill="${cor}"/>`, fim: cx, inicioTinta: x + bb.x1 * 0 };
}
function tinta(texto, x) { // limites de tinta reais da palavra posicionada
  let d = ''; let cx = x; const gl = GS.stringToGlyphs(texto);
  const p = new (require('opentype.js').Path)();
  gl.forEach((g, i) => { p.extend(g.getPath(cx, BASE, FS)); let adv = g.advanceWidth * FS / GS.unitsPerEm; if (i < gl.length - 1) adv += GS.getKerningValue(g, gl[i + 1]) * FS / GS.unitsPerEm + TRACK; cx += adv; });
  return p.getBoundingBox();
}

// ponto-assinatura do nome: igual ao do repply crm (medido no PNG oficial):
// diâmetro 14,25% da altura, 5 unidades depois da tinta da última letra, apoiado em y = 79.
// REGRA: o tomate só aparece no símbolo (junto do "r"). No nome por extenso vai o ponto da casa,
// na mesma cor da palavra "food".
const PONTO = { d: 14.25, gap: 5, base: 79.0 };
function wordmark({ x = 0, cor1, cor2, corPonto = cor2 }) {
  const t1 = tinta('repply', x);
  const dx1 = x - t1.x1;                             // alinha a tinta do "r" em x
  const p1 = palavra('repply', x + dx1, cor1);
  const t1b = tinta('repply', x + dx1);
  const xFood = t1b.x2 + ESPACO;
  const t2 = tinta('food', xFood);
  const dx2 = xFood - t2.x1;
  const p2 = palavra('food', xFood + dx2, cor2);
  const t2b = tinta('food', xFood + dx2);
  const r = PONTO.d / 2;
  const cx = t2b.x2 + PONTO.gap + r, cy = PONTO.base - r;
  const ponto = `<circle cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="${r}" fill="${corPonto}"/>`;
  return { svg: p1.svg + p2.svg + ponto, fim: cx + r };
}

// ---------- versões ----------
const V = {};
const svg = (w, h, inner, fundo = null) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 10}" height="${h * 10}">` +
  (fundo ? `<rect width="${w}" height="${h}" fill="${fundo}"/>` : '') + inner + `</svg>`;

// símbolos
V['simbolo-principal'] = svg(100, 100, simboloG({ fundo: C.laranja, letra: C.branco }));
V['simbolo-preto'] = svg(100, 100, simboloG({ fundo: C.preto, letra: C.branco }));
V['simbolo-branco'] = svg(100, 100, simboloG({ fundo: C.branco, letra: C.preto, borda: '#E6E6E6' }));
V['simbolo-solto-preto'] = svg(100, 100, simboloG({ fundo: null, letra: C.preto }));
V['simbolo-solto-branco'] = svg(100, 100, simboloG({ fundo: null, letra: C.branco }));
V['simbolo-mono-preto'] = svg(100, 100, simboloG({ fundo: null, letra: C.preto, tomateOpts: { mono: C.preto } }));
V['simbolo-mono-branco'] = svg(100, 100, simboloG({ fundo: null, letra: C.branco, tomateOpts: { mono: C.branco } }));

// logo completo (símbolo + nome). x do texto = 132 (vão de 32% da altura, como no CRM)
function logo(simb, cor1, cor2) {
  const w = wordmark({ x: 132, cor1, cor2 });
  return { inner: simb + w.svg, largura: Math.ceil(w.fim + 1) };
}
let L;
L = logo(simboloG({ fundo: C.laranja, letra: C.branco }), C.preto, C.laranja);
V['logo-fundo-claro'] = svg(L.largura, 100, L.inner);
L = logo(simboloG({ fundo: C.laranja, letra: C.branco }), C.branco, C.laranja);
V['logo-fundo-escuro'] = svg(L.largura, 100, L.inner);
L = logo(simboloG({ fundo: C.preto, letra: C.branco }), C.branco, C.preto);
V['logo-fundo-laranja'] = svg(L.largura, 100, L.inner);
let WM = wordmark({ x: 132, cor1: C.preto, cor2: C.preto });
V['logo-mono-preto'] = svg(Math.ceil(WM.fim + 1), 100, simboloG({ fundo: C.preto, letra: C.branco, tomateOpts: { mono: C.branco } }) + WM.svg);
WM = wordmark({ x: 132, cor1: C.branco, cor2: C.branco });
V['logo-mono-branco'] = svg(Math.ceil(WM.fim + 1), 100, simboloG({ fundo: C.branco, letra: C.preto, tomateOpts: { mono: C.preto } }) + WM.svg);

// só texto
let W1 = wordmark({ x: 0, cor1: C.preto, cor2: C.laranja });
V['texto-fundo-claro'] = svg(Math.ceil(W1.fim + 1), 100, W1.svg);
W1 = wordmark({ x: 0, cor1: C.branco, cor2: C.laranja });
V['texto-fundo-escuro'] = svg(Math.ceil(W1.fim + 1), 100, W1.svg);

module.exports = { V, simboloG, wordmark, tomate };

if (require.main === module) {
  const out = process.argv[2];
  const svgDir = process.argv[3];
  fs.mkdirSync(out, { recursive: true });
  if (svgDir) fs.mkdirSync(svgDir, { recursive: true });
  for (const [nome, s] of Object.entries(V)) {
    const largura = nome.startsWith('simbolo') ? 512 : 1400;
    fs.writeFileSync(path.join(out, `vv-${nome}.png`), new Resvg(s, { fitTo: { mode: 'width', value: largura } }).render().asPng());
    if (svgDir) fs.writeFileSync(path.join(svgDir, `${nome}.svg`), s);
  }
  console.log(Object.keys(V).join('\n'));
}
