// Gera o brandbook do repply food. (HTML único, com os desenhos vetoriais do pacote embutidos).
// Uso: node brandbook.js <arquivo-de-saida.html>
const fs = require('fs');
const { rPath, TR, C, T } = require('./simbolo');
const { wordmark } = require('./versoes');

// ---------- desenhos (definidos uma vez, reutilizados com <use>) ----------
const R = rPath();
const W = wordmark({ x: 0, cor1: '__W1__', cor2: '__W2__' });
const WW = Math.ceil(W.fim + 1);
const wordSvg = W.svg.replace(/fill="__W1__"/g, 'style="fill:var(--w1)"').replace(/fill="__W2__"/g, 'style="fill:var(--w2)"');

const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<symbol id="s-r" viewBox="0 0 100 100"><g transform="scale(${R.s})"><path d="${R.d}" style="fill:var(--r,#fff)"/></g></symbol>
<symbol id="s-tom" viewBox="0 0 100 100"><g transform="${TR.transform}"><path d="${TR.sil}" style="fill:var(--tc,#fff)"/><path d="${TR.red}" fill="${C.tomate}" stroke="${C.tomate}" stroke-width="4" stroke-linejoin="round"/><path d="${TR.green}" fill="${C.folha}" stroke="${C.folha}" stroke-width="2" stroke-linejoin="round"/></g></symbol>
<symbol id="s-tom-mono" viewBox="0 0 100 100"><g transform="${TR.transform}"><path d="${TR.red}" style="fill:var(--tm)"/><path d="${TR.green}" style="fill:var(--tm)"/></g></symbol>
<symbol id="s-tom-min" viewBox="0 0 100 100"><circle cx="${T.cx}" cy="${T.cy}" r="10.55" fill="#fff"/><circle cx="${T.cx}" cy="${T.cy}" r="9.2" fill="${C.tomate}"/></symbol>
<symbol id="s-word" viewBox="0 0 ${WW} 100">${wordSvg}</symbol>
<pattern id="salao" width="96" height="96" patternUnits="userSpaceOnUse">
  <g fill="none" stroke="#FF5A1F" stroke-width="1.2">
    <rect x="30" y="30" width="36" height="36" rx="7"/><circle cx="48" cy="17" r="6"/><circle cx="48" cy="79" r="6"/><circle cx="17" cy="48" r="6"/><circle cx="79" cy="48" r="6"/>
  </g>
</pattern>
<pattern id="salao2" width="96" height="96" patternUnits="userSpaceOnUse">
  <g fill="none" stroke="#FF5A1F" stroke-width="1.2">
    <rect x="34" y="28" width="28" height="40" rx="6"/><circle cx="21" cy="40" r="5.5"/><circle cx="21" cy="56" r="5.5"/><circle cx="75" cy="40" r="5.5"/><circle cx="75" cy="56" r="5.5"/>
  </g>
</pattern>
</defs></svg>`;

// símbolo: fundo (cor ou null), cor do r, tomate ('cor' | 'mono:<cor>' | 'min'), contorno do tomate
function sim({ fundo = C.laranja, r = '#fff', tom = 'cor', tc = '#fff', borda = null, cls = '', size = null }) {
  const sz = size ? ` width="${size}" height="${size}"` : '';
  const caixa = fundo ? (borda
    ? `<rect x=".75" y=".75" width="98.5" height="98.5" rx="22.5" fill="${fundo}" stroke="${borda}" stroke-width="1.5"/>`
    : `<rect width="100" height="100" rx="23" fill="${fundo}"/>`) : '';
  let t;
  if (tom === 'min') t = `<use href="#s-tom-min" width="100" height="100"/>`;
  else if (tom.startsWith('mono:')) t = `<use href="#s-tom-mono" width="100" height="100" style="--tm:${tom.slice(5)}"/>`;
  else t = `<use href="#s-tom" width="100" height="100" style="--tc:${tc}"/>`;
  return `<svg class="${cls}" viewBox="0 0 100 100"${sz} role="img" aria-label="símbolo repply food">${caixa}<use href="#s-r" width="100" height="100" style="--r:${r}"/>${t}</svg>`;
}
function nome({ w1 = C.preto, w2 = C.laranja, cls = '' }) {
  return `<svg class="${cls}" viewBox="0 0 ${WW} 100" role="img" aria-label="repply food."><use href="#s-word" width="${WW}" height="100" style="--w1:${w1};--w2:${w2}"/></svg>`;
}
function logo({ simb = {}, w1 = C.preto, w2 = C.laranja, cls = '' }) {
  const s = sim(simb).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  return `<svg class="${cls}" viewBox="0 0 ${132 + WW} 100" role="img" aria-label="logo repply food.">${s}<use href="#s-word" x="132" width="${WW}" height="100" style="--w1:${w1};--w2:${w2}"/></svg>`;
}

const html = fs.readFileSync(require('path').join(__dirname, 'brandbook.template.html'), 'utf8')
  .replace('<!--DEFS-->', DEFS)
  .replace(/\[\[(\w+)(?:\s+(\{[^\]]*\}))?\]\]/g, (_, fn, arg) => {
    const a = arg ? JSON.parse(arg) : {};
    return { sim, nome, logo }[fn](a);
  });

fs.writeFileSync(process.argv[2], html);
console.log('ok', (html.length / 1024).toFixed(0), 'KB');
