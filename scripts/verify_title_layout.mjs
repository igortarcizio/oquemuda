import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const files = process.argv.slice(2);
if (!files.length) throw new Error('Informe ao menos um registro de títulos.');
const records = files.flatMap(file => JSON.parse(readFileSync(file, 'utf8')).records)
  .filter(record => record.visual_status === 'pending');
const seen = new Set();
const pending = records.filter(record => {
  if (seen.has(record.id)) return false;
  seen.add(record.id);
  return true;
});
const rows = pending.map(record => {
  const match = /^([A-Z]+) (\d+)\/(\d+)$/.exec(record.reference);
  if (!match) throw new Error('Referência inválida: ' + record.reference);
  return {
    id: record.id, siglaTipo: match[1], numero: Number(match[2]),
    ano: Number(match[3]), ementa: '', dataApresentacao: '2025-03-20',
    expected: record.title
  };
});
const types = { '.css':'text/css', '.js':'text/javascript', '.html':'text/html', '.svg':'image/svg+xml' };
const root = process.cwd();
const server = createServer((req, res) => {
  if (req.url?.startsWith('/__title_qa__')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles/base.css"><link rel="stylesheet" href="/styles/components.css"><link rel="stylesheet" href="/node_modules/@fontsource/newsreader/500.css"><body><div class="page" id="title-qa"><div class="grid"></div><div class="editorial-feature-host"></div></div></body></html>');
    return;
  }
  const file = resolve(root, '.' + decodeURIComponent((req.url || '/').split('?')[0]));
  if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
  try {
    res.setHeader('Content-Type', (types[extname(file)] || 'application/octet-stream') + '; charset=utf-8');
    res.end(readFileSync(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = 'http://127.0.0.1:' + server.address().port;
let browser;
const report = { checked_at: new Date().toISOString(), files, pending: pending.length, widths: [], failures: [] };
try {
  browser = await chromium.launch({ headless: true });
  for (const width of [1440, 375, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(base + '/__title_qa__', { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(async items => {
      const { card, editorialFeature, detailPage } = await import('/src/ui/components.js');
      const fonts = await document.fonts.load('500 22px Newsreader');
      const host = document.getElementById('title-qa');
      const grid = host.querySelector('.grid');
      grid.innerHTML = items.map(item => card(item, null, false)).join('');
      const failures = [];
      function check(element, item, section) {
        const link = element.querySelector('a');
        const range = document.createRange();
        range.selectNodeContents(link);
        const lines = range.getClientRects().length;
        const font = getComputedStyle(element).fontFamily;
        if (link.textContent !== item.expected || !font.includes('Newsreader') ||
            lines > 5 || element.scrollHeight > element.clientHeight + 2) {
          failures.push({ id: item.id, section, lines, font, height: element.clientHeight,
            scroll_height: element.scrollHeight, actual: link.textContent });
        }
      }
      const headings = grid.querySelectorAll('.card h3');
      items.forEach((item, i) => check(headings[i], item, 'card'));
      const feature = host.querySelector('.editorial-feature-host');
      for (const item of items) {
        feature.innerHTML = editorialFeature(item, null, false);
        check(feature.querySelector('h3'), item, 'focus');
      }
      const parser = new DOMParser();
      for (const item of items) {
        const heading = parser.parseFromString(detailPage(item, {}, false), 'text/html').querySelector('h1');
        if (heading?.textContent.trim() !== item.expected)
          failures.push({ id: item.id, section: 'detail', actual: heading?.textContent });
      }
      return { font_loaded: fonts.length > 0, failures };
    }, rows);
    if (!result.font_loaded) report.failures.push({ width, section: 'font', reason: 'Newsreader não carregou' });
    report.failures.push(...result.failures.map(failure => ({ width, ...failure })));
    report.widths.push({ width, checked: rows.length, font_loaded: result.font_loaded, failures: result.failures.length });
    await page.close();
  }
} finally {
  await browser?.close();
  server.close();
}
mkdirSync('reports', { recursive: true });
writeFileSync('reports/title-layout.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
if (report.failures.length) process.exitCode = 1;
