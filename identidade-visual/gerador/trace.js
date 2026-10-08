// Traça as máscaras do tomate (do ChatGPT) em caminhos vetoriais, já na escala 0–100 do símbolo.
const fs = require('fs');
const potrace = require('potrace');
const meta = JSON.parse(fs.readFileSync('mask-meta.json', 'utf8'));
const opts = { threshold: 128, turdSize: 20, optTolerance: 0.4, alphaMax: 1.0, turnPolicy: potrace.Potrace.TURNPOLICY_MINORITY };
const sx = 100 / (meta.W * meta.K), ox = meta.cx0 / meta.W * 100, oy = meta.cy0 / meta.W * 100;
function trace(file) {
  return new Promise((res, rej) => {
    const p = new potrace.Potrace(opts);
    p.loadImage(file, (err) => {
      if (err) return rej(err);
      // getPathTag dá os caminhos em pixels da máscara; convertemos com transform no SVG final
      const d = p.getPathTag().match(/ d="([^"]+)"/)[1];
      res(d);
    });
  });
}
(async () => {
  const out = {};
  for (const k of ['sil', 'red', 'green']) out[k] = await trace(`mask-${k}.png`);
  out.transform = `translate(${ox.toFixed(4)} ${oy.toFixed(4)}) scale(${sx.toFixed(6)})`;
  fs.writeFileSync('tomate-tracado.json', JSON.stringify(out));
  console.log('ok', Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])));
})();
