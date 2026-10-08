// Gera o símbolo do repply food. em SVG (viewBox 0 0 100 100) a partir da fonte oficial (../fontes)
// e do tomate traçado da imagem do ChatGPT (../origem/chatgpt-simbolo-original.webp, ver trace.js).
const fs = require('fs');
const path = require('path');
const opentype = require('opentype.js');

const FONTS = path.join(__dirname, '..', 'fontes');
const GS = opentype.loadSync(path.join(FONTS, 'general-sans', 'GeneralSans-Semibold.otf'));

const C = {
  laranja: '#FF5A1F',
  branco: '#FFFFFF',
  tomate: '#E8371F',
  folha: '#2F9E44',
  preto: '#0A0A0A',
};

// ---------- "r" igual ao do repply crm (medido no PNG oficial: x 33.98–58.69, y 34.77–74.71) ----------
function rPath(fill) {
  const g = GS.charToGlyph('r');
  const p = g.getPath(0, 0, 1000);
  const bb = p.getBoundingBox();
  const alvo = { x0: 33.98, y0: 34.77, y1: 74.71 };
  const s = (alvo.y1 - alvo.y0) / (bb.y2 - bb.y1);
  const tx = alvo.x0 - bb.x1 * s;
  const ty = alvo.y0 - bb.y1 * s;
  const d = g.getPath(tx / s, ty / s, 1000).toPathData(3); // ainda em escala 1000
  return { d, s, largura: (bb.x2 - bb.x1) * s };
}

// ---------- tomate ----------
// Centro do corpo e raios (medidos na imagem do ChatGPT)
const T = { cx: 66.3, cy: 66.2, rx: 10.9, ry: 8.1 };
const CALICE = { cx: 66.5, cy: 59.6 };

function corpo() {
  // elipse achatada com um leve afundamento no topo, como tomate de verdade
  const { cx, cy, rx, ry } = T;
  const top = cy - ry, bot = cy + ry, l = cx - rx, r = cx + rx;
  const dip = 1.0;
  return [
    `M ${cx} ${top + dip}`,
    `C ${cx + rx * 0.35} ${top - 0.6} ${r} ${top + ry * 0.25} ${r} ${cy + 0.4}`,
    `C ${r} ${bot - ry * 0.3} ${cx + rx * 0.55} ${bot} ${cx} ${bot}`,
    `C ${cx - rx * 0.55} ${bot} ${l} ${bot - ry * 0.3} ${l} ${cy + 0.4}`,
    `C ${l} ${top + ry * 0.25} ${cx - rx * 0.35} ${top - 0.6} ${cx} ${top + dip}`,
    'Z',
  ].join(' ');
}

// sépala: lâmina curva do centro até a ponta; w = meia-largura no meio
function sepala(tx, ty, w, curva = 0.25) {
  const { cx, cy } = CALICE;
  const dx = tx - cx, dy = ty - cy;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len, ny = dx / len; // normal
  const mx = cx + dx * 0.38, my = cy + dy * 0.38;
  const bend = len * curva * 0.15; // leve curvatura para baixo
  const a = [mx + nx * w, my + ny * w + bend];
  const b = [mx - nx * w, my - ny * w + bend];
  return `M ${cx} ${cy} Q ${a[0].toFixed(2)} ${a[1].toFixed(2)} ${tx} ${ty} Q ${b[0].toFixed(2)} ${b[1].toFixed(2)} ${cx} ${cy} Z`;
}

function calice(grosso = false) {
  const w = grosso ? 2.6 : 2.05;
  const pts = grosso
    ? [[58.6, 58.6], [74.4, 58.2], [66.5, 66.2]]
    : [[58.4, 57.3], [60.1, 63.6], [66.5, 66.6], [72.9, 63.6], [74.6, 56.9]];
  return pts.map(([x, y]) => sepala(x, y, w)).join(' ');
}

function cabo(grosso = false) {
  const w = grosso ? 2.4 : 1.9;
  const x = CALICE.cx - w / 2;
  return `<rect x="${x.toFixed(2)}" y="${grosso ? 54.6 : 54.0}" width="${w}" height="${(CALICE.cy - 54.0).toFixed(2)}" rx="${(w / 2).toFixed(2)}"/>`;
}

// contorno branco: o mesmo desenho com traço branco grosso por baixo
function tomate({ nivel = 'grande', contorno = C.branco, espessura = 2.7 } = {}) {
  if (nivel === 'minimo') {
    const r = 9.2;
    return `<circle cx="${T.cx}" cy="${T.cy}" r="${r + espessura / 2}" fill="${contorno}"/>` +
      `<circle cx="${T.cx}" cy="${T.cy}" r="${r}" fill="${C.tomate}"/>`;
  }
  const grosso = nivel === 'pequeno';
  const formas = (fill) =>
    `<path d="${corpo()}" fill="${fill.c}"/>` +
    `<g fill="${fill.f}">${cabo(grosso).replace('/>', ' />')}<path d="${calice(grosso)}"/></g>`;
  const base = contorno
    ? `<g stroke="${contorno}" stroke-width="${espessura}" stroke-linejoin="round" stroke-linecap="round">` +
      formas({ c: contorno, f: contorno }).replace(/<rect /, `<rect stroke="${contorno}" `) + `</g>`
    : '';
  return base + formas({ c: C.tomate, f: C.folha });
}

// tomate traçado da imagem do ChatGPT (tomate-tracado.json, gerado por trace.js)
const TR = JSON.parse(fs.readFileSync(path.join(__dirname, 'tomate-tracado.json'), 'utf8'));
function tomateTracado({ contorno = C.branco, corpo = C.tomate, folha = C.folha } = {}) {
  return `<g transform="${TR.transform}">` +
    (contorno ? `<path d="${TR.sil}" fill="${contorno}" fill-rule="nonzero"/>` : '') +
    `<path d="${TR.red}" fill="${corpo}" stroke="${corpo}" stroke-width="4" stroke-linejoin="round"/>` +
    `<path d="${TR.green}" fill="${folha}" stroke="${folha}" stroke-width="2" stroke-linejoin="round"/>` +
    `</g>`;
}

function simbolo({ fundo = C.laranja, letra = C.branco, nivel = 'grande', contorno = C.branco } = {}) {
  const r = rPath();
  const t = nivel === 'grande' ? tomateTracado({ contorno }) : tomate({ nivel, contorno });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="1024" height="1024">` +
    `<rect width="100" height="100" rx="23" fill="${fundo}"/>` +
    `<g transform="scale(${r.s})"><path d="${r.d}" fill="${letra}"/></g>` +
    t +
    `</svg>`;
}

module.exports = { simbolo, tomate, tomateTracado, TR, rPath, C, GS, T, CALICE, corpo, calice, cabo };

if (require.main === module) {
  const out = process.argv[2] || '.';
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'simbolo-grande.svg'), simbolo({ nivel: 'grande' }));
  fs.writeFileSync(path.join(out, 'simbolo-pequeno.svg'), simbolo({ nivel: 'pequeno' }));
  fs.writeFileSync(path.join(out, 'simbolo-minimo.svg'), simbolo({ nivel: 'minimo' }));
  const r = rPath();
  console.log('r: escala', r.s.toFixed(5), 'largura', r.largura.toFixed(2), '(CRM: 24.71)');
}
