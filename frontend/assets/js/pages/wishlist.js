import { del, get } from '../api.js';
import { openMarkPurchasedDialog, openWishForm } from '../forms.js';
import { handleApiError, requireUser } from '../layout.js';
import { fillSelect, matchesQuery, matchesTheme, sortItems, themeLabel, themeOptions } from '../list-tools.js';
import { setCard } from '../set-card.js';
import { mountSetLookup } from '../set-lookup.js';
import {
  ICONS,
  PRIORITY_LABELS,
  alertBox,
  confirmDialog,
  debounce,
  emptyState,
  formatDate,
  formatPrice,
  h,
  icon,
  loadingBlock,
  toast,
} from '../ui.js';

await requireUser('wishlist');

const el = {
  items: document.getElementById('items'),
  count: document.getElementById('result-count'),
  q: document.getElementById('filter-q'),
  theme: document.getElementById('filter-theme'),
  priority: document.getElementById('filter-priority'),
  status: document.getElementById('filter-status'),
  sort: document.getElementById('sort'),
};

const state = { items: [], loaded: false };

const lookup = mountSetLookup(document.getElementById('lookup'), {
  target: 'wishlist',
  onAdded: (item, target) => {
    if (target === 'wishlist') load();
  },
});
if (location.hash === '#add') lookup.focus();

async function load() {
  if (!state.loaded) el.items.replaceChildren(loadingBlock('Henter din ønskeliste…'));
  try {
    const data = await get('/wishlist');
    state.items = data.items;
    state.loaded = true;
    fillSelect(el.theme, themeOptions(state.items), { allLabel: 'Alle temaer', labelFor: themeLabel });
    render();
  } catch (err) {
    if (err.status === 401) return handleApiError(err);
    el.items.replaceChildren(
      alertBox('error', err.message),
      h('p', {}, h('button', { type: 'button', class: 'btn', onclick: load }, 'Prøv igen')),
    );
  }
}

function filtered() {
  return sortItems(
    state.items.filter(
      (i) =>
        matchesQuery(i, el.q.value) &&
        matchesTheme(i, el.theme.value) &&
        (!el.priority.value || i.priority === el.priority.value) &&
        (!el.status.value || i.status === el.status.value),
    ),
    el.sort.value,
  );
}

function resetFilters() {
  el.q.value = '';
  el.theme.value = '';
  el.priority.value = '';
  el.status.value = '';
  render();
}

function wishCard(wish) {
  const set = wish.set ?? { setNumber: wish.setNumber, name: wish.setNumber };
  const purchased = wish.status === 'purchased';

  const meta = [];
  meta.push(Number.isFinite(wish.targetPrice) ? `Maks. ${formatPrice(wish.targetPrice)}` : 'Ingen maks. pris');
  meta.push(`Tilføjet ${formatDate(wish.addedAt)}`);

  const chips = [];
  if (purchased) chips.push(h('span', { class: 'chip chip-ok' }, icon(ICONS.check, { size: 14 }), `Købt ${formatDate(wish.purchasedAt)}`));
  if (set.source === 'manual') chips.push(h('span', { class: 'chip chip-manual' }, 'Manuelt indtastet'));

  const edit = h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': `Redigér ønsket ${set.name}` }, icon(ICONS.edit, { size: 16 }), 'Redigér');
  const bought = h(
    'button',
    { type: 'button', class: 'btn btn-sm btn-yellow', 'aria-label': `Markér ${set.name} som købt` },
    icon(ICONS.bag, { size: 16 }),
    purchased ? 'Flyt til samling' : 'Købt',
  );
  const remove = h('button', { type: 'button', class: 'btn btn-sm btn-danger', 'aria-label': `Fjern ${set.name} fra ønskelisten` }, icon(ICONS.trash, { size: 16 }), 'Fjern');

  edit.addEventListener('click', async () => {
    const saved = await openWishForm({ set, item: wish });
    if (saved) {
      toast('Ønsket er opdateret.');
      load();
    }
  });

  bought.addEventListener('click', async () => {
    const res = await openMarkPurchasedDialog({ ...wish, set });
    if (!res) return;
    toast(res.moved ? `${set.name} er flyttet til din samling.` : `${set.name} er markeret som købt.`);
    load();
  });

  remove.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Fjern fra ønskelisten?',
      message: `Vil du fjerne "${set.name}" fra din ønskeliste?`,
      confirmText: 'Fjern ønske',
      danger: true,
    });
    if (!ok) return;
    try {
      await del(`/wishlist/${wish.id}`);
      toast(`${set.name} er fjernet fra ønskelisten.`);
      load();
    } catch (err) {
      handleApiError(err, 'Ønsket kunne ikke fjernes.');
    }
  });

  return setCard(set, {
    badgeRight: h('span', { class: `chip chip-${wish.priority}` }, `${PRIORITY_LABELS[wish.priority]} prioritet`),
    meta: [h('span', { class: 'list-only' }, `${PRIORITY_LABELS[wish.priority]} prioritet`), ...meta],
    chips,
    notes: wish.notes,
    actions: [edit, bought, remove],
  });
}

function render() {
  if (!state.loaded) return;

  if (!state.items.length) {
    el.count.textContent = '';
    el.items.replaceChildren(
      emptyState({
        title: 'Din ønskeliste er tom',
        text: 'Find et sæt via sætnummeret øverst på siden, og tilføj det til din ønskeliste.',
        action: h('button', { type: 'button', class: 'btn btn-primary', onclick: () => lookup.focus() }, 'Tilføj dit første ønske'),
      }),
    );
    return;
  }

  const items = filtered();
  const hiddenPurchased = el.status.value === 'wanted' ? state.items.filter((i) => i.status === 'purchased').length : 0;
  el.count.textContent =
    `Viser ${items.length} af ${state.items.length} ønsker` + (hiddenPurchased ? ` (${hiddenPurchased} købte er skjult)` : '');

  if (!items.length) {
    el.items.replaceChildren(
      emptyState({
        title: 'Ingen ønsker matcher',
        text: 'Prøv en anden søgning, eller nulstil filtrene.',
        action: h('button', { type: 'button', class: 'btn', onclick: resetFilters }, 'Nulstil filtre'),
      }),
    );
    return;
  }
  el.items.replaceChildren(h('div', { class: 'cards' }, ...items.map(wishCard)));
}

el.q.addEventListener('input', debounce(render, 150));
[el.theme, el.priority, el.status, el.sort].forEach((s) => s.addEventListener('change', render));

load();
