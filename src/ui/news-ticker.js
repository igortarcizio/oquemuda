import { THEMES, themeFor } from '../lib/themes.js';

const MAX_AGE_MS = 72 * 60 * 60 * 1000;
const NEWS_URL = new URL('../../dados/noticias-camara.json', import.meta.url);
const neutralWords = /\b(comiss[aã]o|c[aâ]mara|deputad[oa]s?|projeto|proposta|aprova|analisa|debate|discute|vota|plen[aá]rio|relator[ao]?|lei|prev[eê]|estabelece)\b/gi;

export function classifyHeadline(title) {
  const relevant = title.replace(neutralWords, ' ').replace(/\s+/g, ' ').trim();
  if (!relevant || relevant.split(/\s+/).length < 2) return null;
  const result = themeFor(relevant, [], '');
  return !result.fallback && THEMES.includes(result.theme) ? result.theme : null;
}

function validItems(data) {
  const updated = Date.parse(data?.updated_at);
  if (!Number.isFinite(updated) || updated > Date.now() + 5 * 60_000 || Date.now() - updated > MAX_AGE_MS) return [];
  if (!Array.isArray(data?.items)) return [];
  const dates = data.items.map(item => Date.parse(item?.published_at));
  if (dates.some(value => !Number.isFinite(value)) || Math.max(...dates) < Date.now() - 7 * 24 * 60 * 60 * 1000) return [];
  const seen = new Set();
  return data.items.filter(item => {
    if (typeof item?.title !== 'string' || !item.title.trim() || typeof item?.url !== 'string') return false;
    let url;
    try { url = new URL(item.url); } catch { return false; }
    if (url.protocol !== 'https:' || !['www.camara.leg.br', 'camara.leg.br'].includes(url.hostname) || !/^\/noticias\/\d+/.test(url.pathname)) return false;
    if (seen.has(url.pathname)) return false;
    seen.add(url.pathname);
    return true;
  }).slice(0, 6);
}

function linkFor(item, copy = false) {
  const li = document.createElement('li');
  li.className = 'news-ticker-item';
  const anchor = document.createElement('a');
  anchor.href = item.url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.setAttribute('aria-label', item.title + ' — Agência Câmara de Notícias (abre em nova aba)');
  if (copy) anchor.tabIndex = -1;
  const category = classifyHeadline(item.title);
  if (category) {
    const tag = document.createElement('span');
    tag.className = 'news-ticker-category';
    tag.dataset.area = category;
    tag.textContent = category;
    tag.setAttribute('aria-hidden', 'true');
    anchor.append(tag);
  }
  const headline = document.createElement('span');
  headline.className = 'news-ticker-headline';
  headline.textContent = item.title;
  const external = document.createElement('span');
  external.className = 'news-ticker-external';
  external.textContent = '↗';
  external.setAttribute('aria-hidden', 'true');
  anchor.append(headline, external);
  li.append(anchor);
  return li;
}

export async function initNewsTicker() {
  const root = document.getElementById('newsTicker');
  if (!root) return;
  const viewport = root.querySelector('.news-ticker-viewport');
  const track = root.querySelector('.news-ticker-track');
  try {
    const response = await fetch(NEWS_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error('Notícias indisponíveis');
    const data = await response.json();
    const items = validItems(data);
    if (items.length !== 6) throw new Error('Dados de notícias incompletos ou antigos');
    const first = document.createElement('ul');
    first.className = 'news-ticker-group';
    first.setAttribute('aria-label', 'Seis notícias recentes da Agência Câmara');
    const clone = document.createElement('ul');
    clone.className = 'news-ticker-group';
    clone.setAttribute('aria-hidden', 'true');
    for (const item of items) {
      first.append(linkFor(item));
      clone.append(linkFor(item, true));
    }
    track.replaceChildren(first, clone);
    root.title = 'Atualizado em ' + new Date(data.updated_at).toLocaleString('pt-BR');
    root.classList.add('news-ticker-ready');
    const setDuration = () => {
      const distance = first.getBoundingClientRect().width;
      if (distance > 0) track.style.setProperty('--news-duration', (distance / 30).toFixed(2) + 's');
    };
    setDuration();
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(setDuration);
      observer.observe(first);
    }
    viewport.addEventListener('focusin', () => root.classList.add('news-ticker-focused'));
    viewport.addEventListener('focusout', event => {
      if (!viewport.contains(event.relatedTarget)) root.classList.remove('news-ticker-focused');
    });
  } catch {
    track.textContent = 'Notícias temporariamente indisponíveis';
    root.classList.add('news-ticker-unavailable');
  }
}
