import { del, get } from '../api.js';
import { openCollectionForm } from '../forms.js';
import { handleApiError, requireUser } from '../layout.js';
import { fillSelect, matchesQuery, matchesTheme, sortItems, themeLabel, themeOptions } from '../list-tools.js';
import { setCard } from '../set-card.js';
import { mountSetLookup } from '../set-lookup.js';
import {
  CONDITION_LABELS,
  ICONS,
  alertBox,
  confirmDialog,
  debounce,
  emptyState,
  formatDate,
  formatNumber,
  formatPrice,
  formatTotal,
  h,
  icon,
  loadingBlock,
  prefs,
  toast,
} from '../ui.js';

await requireUser('collection');

const el = {
  items: document.getElementById('items'),
  stats: document.getElementById('stats'),
  statsNote: document.getElementById('stats-note'),
  count: document.getElementById('result-count'),
  q: document.getElementById('filter-q'),
  theme: document.getElementById('filter-theme'),
  year: document.getElementById('filter-year'),
  sort: document.getElementById('sort'),
  viewButtons: document.querySelectorAll('.view-toggle button'),
};

const state = { items: [], stats: null, loaded: false, view: prefs.get('collection-view', 'grid') };

const lookup = mountSetLookup(document.getElementById('lookup'), {
  target: 'collection',
  onAdded: (item, target) => {
    if (target === 'collection') load();
  },
});
if (location.hash === '#add') lookup.focus();

/* ---------- Data ---------- */

async function load() {
  if (!state.loaded) el.items.replaceChildren(loadingBlock('Henter din samling…'));
  try {
    const data = await get('/collection');
    state.items = data.items;
    state.stats = data.stats;
    state.loaded = true;
    renderStats();
    renderFilters();
    render();
  } catch (err) {
    if (err.status === 401) return handleApiError(err);
    el.items.replaceChildren(
      alertBox('error', err.message),
      h('p', {}, h('button', { type: 'button', class: 'btn', onclick: load }, 'Prøv igen')),
    );
  }
}

/* ---------- Statistik ---------- */

function stat(label, value, note) {
  return h(
    'div',
    { class: 'stat' },
    h('p', { class: 'stat-label' }, label),
    h('p', { class: 'stat-value' }, value),
    note ? h('p', { class: 'stat-note' }, note) : null,
  );
}

function renderStats() {
  const s = state.stats;
  el.stats.replaceChildren(
    stat('Forskellige sæt', formatNumber(s.uniqueSets)),
    stat('Eksemplarer i alt', formatNumber(s.totalCopies)),
    stat(
      'Klodser i alt',
      formatNumber(s.totalPieces),
      s.piecesComplete ? null : `Ufuldstændig: ${s.itemsMissingPieces} registrering(er) mangler klodsantal`,
    ),
    stat(
      'Registreret købspris',
      formatTotal(s.totalPurchaseValue),
      s.itemsMissingPrice && s.registrations ? `Baseret på ${s.itemsWithPrice} af ${s.registrations} registreringer` : null,
    ),
  );
  el.statsNote.textContent = s.registrations
    ? 'Statistikken er beregnet ud fra dine egne registreringer og de oplysninger, kataloget har om sættene.'
    : '';
}

/* ---------- Filtre ---------- */

function renderFilters() {
  fillSelect(el.theme, themeOptions(state.items), { allLabel: 'Alle temaer', labelFor: themeLabel });
  const years = [...new Set(state.items.map((i) => i.set?.releaseYear).filter(Number.isFinite))].sort((a, b) => b - a);
  fillSelect(el.year, years.map(String), { allLabel: 'Alle år' });
}

function filtered() {
  const year = el.year.value;
  return sortItems(
    state.items.filter(
      (i) => matchesQuery(i, el.q.value) && matchesTheme(i, el.theme.value) && (!year || String(i.set?.releaseYear) === year),
    ),
    el.sort.value,
  );
}

function resetFilters() {
  el.q.value = '';
  el.theme.value = '';
  el.year.value = '';
  render();
}

/* ---------- Visning ---------- */

function applyView() {
  el.viewButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
}

function itemCard(item) {
  const set = item.set ?? { setNumber: item.setNumber, name: item.setNumber };
  const chips = [h('span', { class: 'chip' }, CONDITION_LABELS[item.condition] || item.condition)];
  if (item.hasBox) chips.push(h('span', { class: 'chip' }, 'Æske'));
  if (item.hasInstructions) chips.push(h('span', { class: 'chip' }, 'Vejledning'));
  if (set.source === 'manual') chips.push(h('span', { class: 'chip chip-manual' }, 'Manuelt indtastet'));

  const meta = [];
  if (Number.isFinite(item.purchasePrice)) meta.push(`${formatPrice(item.purchasePrice)} pr. stk.`);
  if (item.purchaseDate) meta.push(`Købt ${formatDate(item.purchaseDate)}`);

  const edit = h('button', { type: 'button', class: 'btn btn-sm' }, icon(ICONS.edit, { size: 16 }), 'Redigér');
  const remove = h('button', { type: 'button', class: 'btn btn-sm btn-danger' }, icon(ICONS.trash, { size: 16 }), 'Fjern');
  edit.setAttribute('aria-label', `Redigér ${set.name}`);
  remove.setAttribute('aria-label', `Fjern ${set.name} fra samlingen`);

  edit.addEventListener('click', async () => {
    const saved = await openCollectionForm({ set, item });
    if (saved) {
      toast('Ændringerne er gemt.');
      load();
    }
  });

  remove.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Fjern fra samlingen?',
      message: `Vil du fjerne "${set.name}" (${item.quantity} stk.) fra din samling? Det kan ikke fortrydes.`,
      confirmText: 'Fjern sæt',
      danger: true,
    });
    if (!ok) return;
    try {
      await del(`/collection/${item.id}`);
      toast(`${set.name} er fjernet fra samlingen.`);
      load();
    } catch (err) {
      handleApiError(err, 'Sættet kunne ikke fjernes.');
    }
  });

  return setCard(set, {
    badgeRight: h('span', { class: 'chip chip-qty' }, `${item.quantity} stk.`),
    meta: [h('span', { class: 'list-only' }, `${item.quantity} stk.`), ...meta],
    chips,
    notes: item.notes,
    actions: [edit, remove],
  });
}

function render() {
  if (!state.loaded) return;
  applyView();

  if (!state.items.length) {
    el.count.textContent = '';
    el.items.replaceChildren(
      emptyState({
        title: 'Din samling er tom',
        text: 'Skriv et sætnummer i feltet øverst for at tilføje dit første LEGO-sæt.',
        action: h('button', { type: 'button', class: 'btn btn-primary', onclick: () => lookup.focus() }, 'Tilføj dit første sæt'),
      }),
    );
    return;
  }

  const items = filtered();
  el.count.textContent =
    items.length === state.items.length
      ? `${items.length} registrering${items.length === 1 ? '' : 'er'}`
      : `Viser ${items.length} af ${state.items.length} registreringer`;

  if (!items.length) {
    el.items.replaceChildren(
      emptyState({
        title: 'Ingen sæt matcher',
        text: 'Prøv en anden søgning, eller nulstil filtrene.',
        action: h('button', { type: 'button', class: 'btn', onclick: resetFilters }, 'Nulstil filtre'),
      }),
    );
    return;
  }

  el.items.replaceChildren(h('div', { class: `cards ${state.view === 'list' ? 'list' : ''}` }, ...items.map(itemCard)));
}

el.q.addEventListener('input', debounce(render, 150));
[el.theme, el.year, el.sort].forEach((s) => s.addEventListener('change', render));
el.viewButtons.forEach((b) =>
  b.addEventListener('click', () => {
    state.view = b.dataset.view;
    prefs.set('collection-view', state.view);
    render();
  }),
);

load();
