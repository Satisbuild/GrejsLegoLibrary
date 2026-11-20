import { renderHeader } from '../layout.js';
import { bundledSet } from '../local-backend.js';
import { setCard } from '../set-card.js';
import { ShareDecodeError, decodeWishlist, possessive } from '../share.js';
import { ICONS, PRIORITY_LABELS, alertBox, emptyState, formatPrice, formatSetNumber, h, icon, loadingBlock } from '../ui.js';

/* Skrivebeskyttet visning af en ønskeliste, der er delt via et link. Intet gemmes i modtagerens browser. */

renderHeader(null, null);

const el = {
  title: document.getElementById('title'),
  subtitle: document.getElementById('subtitle'),
  count: document.getElementById('result-count'),
  items: document.getElementById('items'),
};

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };

async function setFor(item) {
  let found = null;
  try {
    found = await bundledSet(item.setNumber);
  } catch {
    /* kataloget kunne ikke hentes – vis det, linket selv indeholder */
  }
  return (
    found ?? {
      setNumber: item.setNumber,
      name: item.name || `Sæt ${formatSetNumber(item.setNumber)}`,
      theme: null,
      source: 'manual',
    }
  );
}

function wishCard(item, set) {
  const short = formatSetNumber(item.setNumber);
  const meta = [];
  if (Number.isFinite(item.targetPrice)) meta.push(`Maks. ${formatPrice(item.targetPrice)}`);

  const legoLink = h(
    'a',
    {
      class: 'btn btn-sm btn-yellow',
      href: `https://www.lego.com/da-dk/search?q=${encodeURIComponent(short)}`,
      target: '_blank',
      rel: 'noopener noreferrer',
      'aria-label': `Find ${set.name} hos LEGO (åbner i en ny fane)`,
    },
    icon(ICONS.external, { size: 16 }),
    'Find hos LEGO',
  );

  return setCard(set, {
    badgeRight: h('span', { class: `chip chip-${item.priority}` }, `${PRIORITY_LABELS[item.priority]} prioritet`),
    meta: [h('span', { class: 'list-only' }, `${PRIORITY_LABELS[item.priority]} prioritet`), ...meta],
    notes: item.notes,
    actions: [legoLink],
  });
}

function showError(message) {
  el.title.textContent = 'Ønskelisten kunne ikke åbnes';
  el.subtitle.textContent = '';
  el.count.textContent = '';
  el.items.replaceChildren(
    emptyState({
      title: message,
      text: 'Bed den, der sendte linket, om at sende det igen. Nogle gange bliver lange links klippet over, når de kopieres.',
      action: h('a', { class: 'btn', href: 'index.html' }, 'Gå til forsiden'),
    }),
  );
}

async function render() {
  el.items.replaceChildren(loadingBlock('Henter ønskelisten…'));
  let list;
  try {
    list = await decodeWishlist(location.hash);
  } catch (err) {
    return showError(err instanceof ShareDecodeError ? err.message : 'Linket er ufuldstændigt eller ødelagt.');
  }

  const title = list.owner ? `${possessive(list.owner)} ønskeliste` : 'En LEGO-ønskeliste';
  el.title.textContent = title;
  document.title = `${title} · GrejsLegoLibrary`;
  el.subtitle.textContent = list.owner
    ? `${list.owner} har delt sin LEGO-ønskeliste med dig. Sættene med høj prioritet står øverst.`
    : 'Nogen har delt sin LEGO-ønskeliste med dig. Sættene med høj prioritet står øverst.';

  if (!list.items.length) {
    el.count.textContent = '';
    el.items.replaceChildren(emptyState({ title: 'Ønskelisten er tom', text: 'Der er ingen sæt på den delte liste.' }));
    return;
  }

  const items = list.items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => PRIORITY_RANK[a.item.priority] - PRIORITY_RANK[b.item.priority] || a.index - b.index)
    .map((x) => x.item);
  const sets = await Promise.all(items.map(setFor));

  el.count.textContent = `${items.length} ${items.length === 1 ? 'ønske' : 'ønsker'}`;
  el.items.replaceChildren(
    alertBox(
      'info',
      'Listen opdateres ikke af sig selv. Køber I gaver sammen, så aftal, hvem der køber hvad, så ingen får det samme sæt to gange.',
    ),
    h('div', { class: 'cards' }, ...items.map((item, i) => wishCard(item, sets[i]))),
  );
}

window.addEventListener('hashchange', render);
render();
