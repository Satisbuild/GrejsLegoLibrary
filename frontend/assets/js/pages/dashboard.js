import { get } from '../api.js';
import { handleApiError, requireUser } from '../layout.js';
import { setCard } from '../set-card.js';
import { PRIORITY_LABELS, alertBox, emptyState, formatNumber, formatPrice, formatTotal, h, loadingBlock } from '../ui.js';

const user = await requireUser('dashboard');
document.getElementById('welcome').textContent = `Hej, ${user.username}!`;
document.getElementById('avatar').textContent = user.username.slice(0, 1);

const root = document.getElementById('dashboard-content');
const BAR_COLORS = ['var(--red)', 'var(--blue)', 'var(--yellow-dark)', 'var(--green)', 'var(--orange)'];

function stat(label, value, note, href) {
  return h(
    href ? 'a' : 'div',
    { class: 'stat', href },
    h('p', { class: 'stat-label' }, label),
    h('p', { class: 'stat-value' }, value),
    note ? h('p', { class: 'stat-note' }, note) : null,
  );
}

function themeBars(themes) {
  if (!themes.length) return h('p', { class: 'meta-line' }, 'Ingen temaer endnu.');
  const top = themes.slice(0, 8);
  const max = Math.max(...top.map((t) => t.copies), 1);
  const list = h('ul', { class: 'bars' });
  top.forEach((t, i) => {
    const fill = h('div', { class: 'bar-fill' });
    fill.style.width = `${(t.copies / max) * 100}%`;
    fill.style.setProperty('--bar', BAR_COLORS[i % BAR_COLORS.length]);
    const name = t.theme || 'Ukendt tema';
    list.append(
      h(
        'li',
        { class: 'bar-row' },
        h('span', { class: 'bar-label', title: name }, name),
        h('div', { class: 'bar-track', role: 'presentation' }, fill),
        h('span', { class: 'bar-value' }, `${formatNumber(t.copies)}`),
      ),
    );
  });
  const rest = themes.length - top.length;
  return [
    h('p', { class: 'visually-hidden' }, 'Antal eksemplarer pr. tema:'),
    list,
    rest > 0 ? h('p', { class: 'meta-line section' }, `+ ${rest} andre temaer`) : null,
  ];
}

function render(d) {
  const c = d.collection;
  const stats = h(
    'div',
    { class: 'stats' },
    stat('Sæt i samlingen', formatNumber(c.uniqueSets), c.totalCopies !== c.uniqueSets ? `${formatNumber(c.totalCopies)} eksemplarer i alt` : null),
    stat('Klodser i alt', formatNumber(c.totalPieces), c.piecesComplete ? null : `Ufuldstændig – ${c.itemsMissingPieces} registrering(er) mangler data`),
    stat('Minifigurer', formatNumber(c.totalMinifigures), c.minifiguresComplete ? null : 'Ufuldstændig – nogle sæt mangler data'),
    stat('Ønsker', formatNumber(d.wishlist.wanted), d.wishlist.purchased ? `${d.wishlist.purchased} markeret som købt` : null),
  );

  const recent = d.recentCollection.length
    ? h(
        'div',
        { class: 'cards cards-compact' },
        ...d.recentCollection.map((item) =>
          setCard(item.set, { compact: true, badgeRight: h('span', { class: 'chip chip-qty' }, `${item.quantity} stk.`) }),
        ),
      )
    : emptyState({
        title: 'Ingen sæt endnu',
        text: 'Tilføj dit første sæt via sætnummeret.',
        action: h('a', { class: 'btn btn-primary', href: 'collection.html#add' }, 'Tilføj et sæt'),
      });

  const wishes = d.topWishes.length
    ? h(
        'div',
        { class: 'cards cards-compact' },
        ...d.topWishes.map((w) =>
          setCard(w.set, {
            compact: true,
            badgeRight: h('span', { class: `chip chip-${w.priority}` }, PRIORITY_LABELS[w.priority]),
            meta: Number.isFinite(w.targetPrice) ? [`Maks. ${formatPrice(w.targetPrice)}`] : [],
          }),
        ),
      )
    : emptyState({
        title: 'Ingen ønsker endnu',
        text: 'Hvilket sæt drømmer du om?',
        action: h('a', { class: 'btn btn-yellow', href: 'wishlist.html#add' }, 'Tilføj et ønske'),
      });

  root.replaceChildren(
    stats,
    h(
      'div',
      { class: 'grid-2 section' },
      h(
        'section',
        { class: 'panel', 'aria-labelledby': 'recent-h' },
        h('div', { class: 'section-head' }, h('h2', { id: 'recent-h', class: 'studs' }, 'Senest tilføjet'), h('a', { href: 'collection.html' }, 'Se hele samlingen')),
        recent,
      ),
      h(
        'section',
        { class: 'panel', 'aria-labelledby': 'wish-h' },
        h('div', { class: 'section-head' }, h('h2', { id: 'wish-h', class: 'studs studs-yellow' }, 'Øverst på ønskelisten'), h('a', { href: 'wishlist.html' }, 'Se ønskelisten')),
        wishes,
      ),
    ),
    h(
      'div',
      { class: 'grid-2 section' },
      h(
        'section',
        { class: 'panel', 'aria-labelledby': 'theme-h' },
        h('div', { class: 'section-head' }, h('h2', { id: 'theme-h', class: 'studs studs-blue' }, 'Fordeling på temaer')),
        themeBars(c.themes),
      ),
      h(
        'section',
        { class: 'panel', 'aria-labelledby': 'value-h' },
        h('div', { class: 'section-head' }, h('h2', { id: 'value-h', class: 'studs studs-green' }, 'Registreret købspris')),
        h('p', { class: 'stat-value' }, formatTotal(c.totalPurchaseValue)),
        h(
          'p',
          { class: 'meta-line' },
          c.registrations
            ? `Summen af de købspriser, du selv har registreret (${c.itemsWithPrice} af ${c.registrations} registreringer har en pris).`
            : 'Registrér købspriser på dine sæt for at se den samlede værdi af dine køb.',
        ),
      ),
    ),
  );
}

async function load() {
  root.replaceChildren(loadingBlock('Henter dit overblik…'));
  try {
    render(await get('/dashboard'));
  } catch (err) {
    if (err.status === 401) return handleApiError(err);
    root.replaceChildren(
      alertBox('error', err.message),
      h('p', {}, h('button', { type: 'button', class: 'btn', onclick: load }, 'Prøv igen')),
    );
  }
}

load();
