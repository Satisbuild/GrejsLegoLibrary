import { formatSetNumber, h } from './ui.js';

/** Fælles søgning, filtrering og sortering for samling og ønskeliste. */

const collator = new Intl.Collator('da', { numeric: true, sensitivity: 'base' });
export const UNKNOWN_THEME = '__unknown__';

export function matchesQuery(item, q) {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  const set = item.set || {};
  return (
    String(set.name || '').toLowerCase().includes(needle) ||
    formatSetNumber(item.setNumber).toLowerCase().includes(needle) ||
    String(item.setNumber).toLowerCase().includes(needle)
  );
}

export function matchesTheme(item, theme) {
  if (!theme) return true;
  const t = item.set?.theme || UNKNOWN_THEME;
  return t === theme;
}

/** Sammenligner tal med ukendte værdier sidst, uanset retning. */
function byNumber(get, dir = 1) {
  return (a, b) => {
    const x = get(a);
    const y = get(b);
    const xn = Number.isFinite(x);
    const yn = Number.isFinite(y);
    if (!xn && !yn) return 0;
    if (!xn) return 1;
    if (!yn) return -1;
    return (x - y) * dir;
  };
}

export const SORTS = {
  added: (a, b) => new Date(b.addedAt) - new Date(a.addedAt),
  name: (a, b) => collator.compare(a.set?.name || '', b.set?.name || ''),
  setNumber: (a, b) => collator.compare(a.setNumber, b.setNumber),
  'year-desc': byNumber((i) => i.set?.releaseYear, -1),
  'year-asc': byNumber((i) => i.set?.releaseYear, 1),
  'pieces-desc': byNumber((i) => i.set?.pieceCount, -1),
  'pieces-asc': byNumber((i) => i.set?.pieceCount, 1),
  'price-asc': byNumber((i) => i.targetPrice, 1),
  priority: (a, b) => {
    const rank = { high: 0, normal: 1, low: 2 };
    return rank[a.priority] - rank[b.priority] || SORTS.added(a, b);
  },
};

export function sortItems(items, key) {
  const fn = SORTS[key] || SORTS.added;
  // Stabil sortering med "senest tilføjet" som sekundær nøgle
  return [...items].sort((a, b) => fn(a, b) || SORTS.added(a, b));
}

/** Fylder en <select> med værdier og bevarer brugerens valg, hvis det stadig findes. */
export function fillSelect(select, values, { allLabel, labelFor = (v) => v } = {}) {
  const current = select.value;
  select.replaceChildren(h('option', { value: '' }, allLabel), ...values.map((v) => h('option', { value: v }, labelFor(v))));
  select.value = values.includes(current) ? current : '';
}

export function themeOptions(items) {
  const themes = new Set(items.map((i) => i.set?.theme || UNKNOWN_THEME));
  return [...themes].sort((a, b) => {
    if (a === UNKNOWN_THEME) return 1;
    if (b === UNKNOWN_THEME) return -1;
    return collator.compare(a, b);
  });
}

export const themeLabel = (t) => (t === UNKNOWN_THEME ? 'Ukendt tema' : t);
