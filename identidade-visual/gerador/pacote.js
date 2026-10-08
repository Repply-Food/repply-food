// Gera o pacote de logomarcas do repply food. (SVG + PNG em vários tamanhos + ícones do app)
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const { V, simboloG } = require('./versoes');
const { C, rPath, T } = require('./simbolo');

const OUT = process.argv[2];
const dir = (d) => { const p = path.join(OUT, d); fs.mkdirSync(p, { recursive: true }); return p; };
const D = { simbolo: dir('simbolo'), logo: dir('logo'), texto: dir('texto'), app: dir('app'), svg: dir('svg') };

const png = (svg, w) => new Resvg(svg, { fitTo: { mode: 'width', value: w } }).render().asPng();
const save = (file, buf) => { fs.writeFileSync(file, buf); lista.push(path.relative(OUT, file).replace(/\\/g, '/')); };
const lista = [];

// ---------- variantes extras: mínimo (16–20 px) e ícone sem cantos (iOS/Android aplicam a máscara) ----------
const R = rPath();
const rG = (cor) => `<g transform="scale(${R.s})"><path d="${R.d}" fill="${cor}"/></g>`;
const minimoG = (fundo, letra, rx = 23) =>
  `<rect width="100" height="100" rx="${rx}" fill="${fundo}"/>` + rG(letra) +
  `<circle cx="${T.cx}" cy="${T.cy}" r="${9.2 + 1.35}" fill="${C.branco}"/><circle cx="${T.cx}" cy="${T.cy}" r="9.2" fill="${C.tomate}"/>`;
const svg100 = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="1024" height="1024">${inner}</svg>`;

const EXTRA = {
  'simbolo-minimo': svg100(minimoG(C.laranja, C.branco)),
  'app-icone-sem-cantos': svg100(simboloG({ fundo: C.laranja, letra: C.branco }).replace(/rx="23"/, 'rx="0"')),
};

// ---------- SVGs mestres ----------
for (const [nome, s] of Object.entries({ ...V, ...EXTRA })) save(path.join(D.svg, `repply-food-${nome}.svg`), s);

// ---------- símbolo ----------
for (const w of [16, 20, 24, 32, 48, 64, 128, 192, 256, 512, 1024]) {
  const s = w <= 20 ? EXTRA['simbolo-minimo'] : V['simbolo-principal'];
  save(path.join(D.simbolo, `repply-food-simbolo-${w}.png`), png(s, w));
}
for (const v of ['preto', 'branco', 'solto-preto', 'solto-branco', 'mono-preto', 'mono-branco']) {
  for (const w of [128, 256, 512, 1024]) save(path.join(D.simbolo, `repply-food-simbolo-${v}-${w}.png`), png(V[`simbolo-${v}`], w));
}

// ---------- logo completo e só o nome (largura em px, como no CRM) ----------
for (const v of ['fundo-claro', 'fundo-escuro', 'fundo-laranja', 'mono-preto', 'mono-branco']) {
  for (const w of [512, 1024, 2048]) save(path.join(D.logo, `repply-food-logo-${v}-${w}.png`), png(V[`logo-${v}`], w));
}
for (const v of ['fundo-claro', 'fundo-escuro']) {
  for (const w of [512, 1024, 2048]) save(path.join(D.texto, `repply-food-texto-${v}-${w}.png`), png(V[`texto-${v}`], w));
}

// ---------- ícones do app (PWA, iPhone, navegador) ----------
save(path.join(D.app, 'favicon.svg'), EXTRA['simbolo-minimo']);
for (const w of [16, 32, 48]) save(path.join(D.app, `favicon-${w}.png`), png(w <= 20 ? EXTRA['simbolo-minimo'] : V['simbolo-principal'], w));
save(path.join(D.app, 'apple-touch-icon.png'), png(EXTRA['app-icone-sem-cantos'], 180)); // iOS arredonda sozinho
save(path.join(D.app, 'icon-192.png'), png(V['simbolo-principal'], 192));
save(path.join(D.app, 'icon-512.png'), png(V['simbolo-principal'], 512));
save(path.join(D.app, 'icon-maskable-192.png'), png(EXTRA['app-icone-sem-cantos'], 192)); // Android recorta no formato do aparelho
save(path.join(D.app, 'icon-maskable-512.png'), png(EXTRA['app-icone-sem-cantos'], 512));

// favicon.ico com 16, 32 e 48 (entradas PNG dentro do ICO)
const icoImgs = [16, 32, 48].map((w) => ({ w, buf: png(w <= 20 ? EXTRA['simbolo-minimo'] : V['simbolo-principal'], w) }));
const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(icoImgs.length, 4);
let offset = 6 + 16 * icoImgs.length;
const entries = icoImgs.map(({ w, buf }) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(w, 0); e.writeUInt8(w, 1); e.writeUInt8(0, 2); e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(buf.length, 8); e.writeUInt32LE(offset, 12);
  offset += buf.length; return e;
});
save(path.join(D.app, 'favicon.ico'), Buffer.concat([head, ...entries, ...icoImgs.map((i) => i.buf)]));

fs.writeFileSync(path.join(OUT, '.lista-de-arquivos.json'), JSON.stringify(lista, null, 2));
console.log(lista.length, 'arquivos');
