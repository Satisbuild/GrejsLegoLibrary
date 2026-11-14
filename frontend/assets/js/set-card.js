import { formatNumber, formatSetNumber, h, setImage } from './ui.js';

/**
 * Kort med produktbillede, sætnummer, navn, tema og klodser.
 * @param {object} set
 * @param {object} opts  badges (venstre/højre), meta (ekstra linjer), notes, actions
 */
export function setCard(set, { badgeRight, meta = [], notes, actions = [], compact = false, chips = [] } = {}) {
  const image = setImage(set);
  image.append(
    h(
      'div',
      { class: 'card-badges' },
      h('span', { class: 'chip chip-set' }, formatSetNumber(set.setNumber)),
      badgeRight || null,
    ),
  );

  const baseMeta = [];
  if (compact) {
    if (Number.isFinite(set.pieceCount)) baseMeta.push(`${formatNumber(set.pieceCount)} klodser`);
  } else {
    baseMeta.push(h('span', { class: 'list-only' }, `Nr. ${formatSetNumber(set.setNumber)}`));
    baseMeta.push(Number.isFinite(set.pieceCount) ? `${formatNumber(set.pieceCount)} klodser` : 'Klodser: ukendt');
    if (set.releaseYear) baseMeta.push(String(set.releaseYear));
  }

  return h(
    'article',
    { class: 'card' },
    image,
    h(
      'div',
      { class: 'card-body' },
      h('p', { class: 'card-theme' }, set.theme || 'Ukendt tema'),
      h('h3', { class: 'card-title' }, set.name),
      h('p', { class: 'card-meta' }, ...[...baseMeta, ...meta].map((m) => (m instanceof Node ? m : h('span', {}, m)))),
      chips.length ? h('div', { class: 'chips' }, ...chips) : null,
      notes ? h('p', { class: 'card-notes' }, notes) : null,
    ),
    actions.length ? h('div', { class: 'card-actions' }, ...actions) : null,
  );
}
