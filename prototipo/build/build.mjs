// Gera prototipo/oquemuda-funcional.html a partir do acervo do repositório.
// Uso (na raiz do repositório): node prototipo/build/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

globalThis.window = {};
for (const f of ['dados/catalogo.js', 'dados/editorial.js', 'dados/deputados-partidos.js']) {
  new Function('window', read(f))(globalThis.window);
}
const {classifyTags} = await import(pathToFileURL(path.join(root, 'src/lib/tags.js')).href);
const {EDITORIAL_PRIORITY} = await import(pathToFileURL(path.join(root, 'src/lib/editorial.js')).href);
const C = await import(pathToFileURL(path.join(root, 'src/lib/themes.js')).href);
// A mesma regra de temas do site vai embutida no HTML, para classificar também o que chega ao vivo.
const classifySrc = 'var THEME_CLASSIFIER=(function(){\n' + read('src/lib/themes.js').replace(/^export /gm, '') +
  '\nreturn {THEMES:THEMES,themeFor:themeFor};})();';

// Registros que não são propostas reais (ex.: "Teste de Comissão") ficam fora do acervo (revisão C8).
const isJunk = (p) => !p.ementa || p.ementa.trim().length < 20 || /^teste\b/i.test(p.ementa.trim());

const ed = window.OBM_EDITORIAL || {};
const tagNames = [], tagIdx = new Map();
const ti = (t) => { if (!tagIdx.has(t)) { tagIdx.set(t, tagNames.length); tagNames.push(t); } return tagIdx.get(t); };
const rows = [], fallback = [], skipped = [];
for (const p of window.OBM_DATA.items) {
  if (isJunk(p)) { skipped.push(`${p.siglaTipo} ${p.numero}/${p.ano}`); continue; }
  const tags = classifyTags(p.ementa);
  const e = ed[String(p.id)] || {};
  let area;
  if (e.area && C.THEMES.includes(e.area)) area = e.area;
  else { const r = C.themeFor(p.ementa, tags, p.siglaTipo); area = r.theme; if (r.fallback) fallback.push(p.id); }
  rows.push([p.id, p.siglaTipo, p.numero, p.ano, String(p.dataApresentacao || '').slice(0, 10), p.ementa, tags.map(ti), C.THEMES.indexOf(area)]);
}
const editorial = {};
for (const [id, e] of Object.entries(ed)) editorial[id] = {t: e.titulo, i: e.impacto, p: e.publicos, a: e.area};

const data = {partidos: window.OBM_PARTIDOS_DEPUTADOS || {}, generatedAt: window.OBM_DATA.generatedAt,
  areas: C.THEMES, tags: tagNames, priority: EDITORIAL_PRIORITY, editorial, rows};
const titlesSrc = 'var TITLES=(function(){\n' + read('src/lib/titles.js').replace(/^export /gm, '') +
  '\nreturn {descriptiveTitle:descriptiveTitle,amendedLaws:amendedLaws};})();';
const html = fs.readFileSync(path.join(here, 'template.html'), 'utf8')
  .replace('/*__CLASSIFY__*/', () => classifySrc)
  .replace('/*__TITLES__*/', () => titlesSrc)
  .replace('/*__DATA__*/', () => JSON.stringify(data).replace(/<\//g, '<\\/'));
const out = path.join(root, 'prototipo/oquemuda-funcional.html');
fs.writeFileSync(out, html);

const count = {};
for (const r of rows) count[C.THEMES[r[7]]] = (count[C.THEMES[r[7]]] || 0) + 1;
console.log(`Propostas: ${rows.length} (ignoradas: ${skipped.join(', ') || 'nenhuma'})`);
console.log(`Sem pista de tema (tema padrão): ${fallback.length}`);
console.log(count);
console.log(`Gerado: ${path.relative(root, out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
