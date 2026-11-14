import { get } from './api.js';
import { openCollectionForm, openManualSetForm, openWishForm } from './forms.js';
import { handleApiError } from './layout.js';
import {
  ICONS,
  alertBox,
  formatDate,
  formatNumber,
  formatSetNumber,
  h,
  icon,
  setBusy,
  setImage,
  toast,
} from './ui.js';

const SET_NUMBER_RE = /^[a-z0-9]{1,20}(-\d{1,3})?$/i;
const SOURCE_LABELS = { rebrickable: 'Rebrickable', manual: 'manuel indtastning' };

/** Fejlkoder hvor brugeren skal tilbydes manuel indtastning. */
const MANUAL_FALLBACK_CODES = new Set([
  'SET_NOT_FOUND',
  'CATALOG_UNAVAILABLE',
  'CATALOG_RATE_LIMITED',
  'CATALOG_NOT_CONFIGURED',
]);

function fact(label, value) {
  return h('div', { class: 'fact' }, h('dt', {}, label), h('dd', {}, value));
}

/**
 * Søgefelt til opslag via sætnummer.
 * @param {HTMLElement} root
 * @param {object} options
 * @param {'collection'|'wishlist'} options.target  sidens primære handling
 * @param {(item: object, target: string) => void} options.onAdded  kaldes når et sæt er gemt
 */
export function mountSetLookup(root, { target, onAdded }) {
  const inputId = 'set-lookup-input';
  const input = h('input', {
    type: 'search',
    id: inputId,
    name: 'setNumber',
    placeholder: 'fx 75192',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    maxlength: 24,
    required: true,
    'aria-describedby': `${inputId}-hint`,
  });
  const button = h('button', { type: 'submit', class: 'btn btn-primary' }, icon(ICONS.search, { size: 18 }), 'Slå op');
  const result = h('div', { class: 'lookup-result', 'aria-live': 'polite' });

  const form = h(
    'form',
    { role: 'search', novalidate: true },
    h('label', { for: inputId }, target === 'wishlist' ? 'Find et sæt til din ønskeliste' : 'Tilføj et sæt via sætnummer'),
    h('div', { class: 'lookup-form' }, input, button),
    h('p', { class: 'lookup-hint', id: `${inputId}-hint` }, 'Sætnummeret står på æsken og på forsiden af byggevejledningen.'),
  );

  root.replaceChildren(h('section', { class: 'lookup', 'aria-label': 'Opslag af LEGO-sæt' }, h('div', { class: 'lookup-bar' }, form), result));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (!SET_NUMBER_RE.test(value)) {
      input.setAttribute('aria-invalid', 'true');
      result.replaceChildren(alertBox('error', 'Skriv et gyldigt sætnummer, fx 75192 eller 75192-1.'));
      input.focus();
      return;
    }
    input.removeAttribute('aria-invalid');
    await lookup(value);
  });

  async function lookup(value) {
    setBusy(button, true, 'Søger…');
    result.replaceChildren(
      h('div', { class: 'lookup-loading' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), `Slår ${value} op i LEGO-kataloget…`),
    );
    try {
      showResult(await get(`/sets/${encodeURIComponent(value)}`));
    } catch (err) {
      showError(err, value);
    } finally {
      setBusy(button, false);
    }
  }

  function showError(err, value) {
    if (err.status === 401) return handleApiError(err);
    const children = [alertBox(err.code === 'SET_NOT_FOUND' ? 'warn' : 'error', err.message)];
    if (MANUAL_FALLBACK_CODES.has(err.code)) {
      children.push(
        h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn', onclick: () => manual(value) }, icon(ICONS.edit, { size: 18 }), 'Indtast sættet manuelt')),
      );
    }
    result.replaceChildren(...children);
  }

  async function manual(value) {
    const res = await openManualSetForm(value);
    if (res) {
      if (res.existing) toast('Sættet fandtes allerede – oplysningerne vises herunder.');
      // Hent ejerskabsinfo m.m. via et normalt opslag
      await lookup(res.set.setNumber);
    }
  }

  function showResult(data) {
    const { set, ownership, warning } = data;
    const number = formatSetNumber(set.setNumber);
    const links = [];
    if (set.sourceUrl) {
      links.push(h('a', { href: set.sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, `Se sættet hos ${SOURCE_LABELS[set.source] || set.source}`, icon(ICONS.external, { size: 14 })));
    }
    const instructionsHref = set.instructionsUrl
      || (/^\d+$/.test(number) ? `https://www.lego.com/da-dk/service/building-instructions/${number}` : null);
    if (instructionsHref) {
      links.push(
        h('a', { href: instructionsHref, target: '_blank', rel: 'noopener noreferrer' }, set.instructionsUrl ? 'Byggevejledning' : 'Søg efter byggevejledning hos LEGO', icon(ICONS.external, { size: 14 })),
      );
    }

    const ownershipNotes = [];
    if (ownership?.collectionQuantity) {
      ownershipNotes.push(h('span', { class: 'chip chip-ok' }, icon(ICONS.check, { size: 14 }), `Du ejer ${ownership.collectionQuantity} stk.`));
    }
    if (ownership?.wishlistItemId) {
      ownershipNotes.push(h('span', { class: 'chip chip-normal' }, icon(ICONS.heart, { size: 14 }), ownership.wishlistStatus === 'purchased' ? 'Købt fra ønskelisten' : 'På din ønskeliste'));
    }
    if (set.source === 'manual') ownershipNotes.push(h('span', { class: 'chip chip-manual' }, 'Manuelt indtastet'));

    const addCollection = h('button', { type: 'button', class: `btn ${target === 'collection' ? 'btn-primary' : ''}` }, icon(ICONS.plus, { size: 18 }), 'Tilføj til samling');
    const addWish = h('button', { type: 'button', class: `btn ${target === 'wishlist' ? 'btn-primary' : ''}`, disabled: Boolean(ownership?.wishlistItemId) }, icon(ICONS.heart, { size: 18 }), ownership?.wishlistItemId ? 'Allerede på ønskelisten' : 'Tilføj til ønskeliste');

    addCollection.addEventListener('click', async () => {
      const item = await openCollectionForm({ set });
      if (item) {
        toast(`${set.name} er gemt i din samling.`);
        onAdded?.(item, 'collection');
        await lookup(set.setNumber);
      }
    });
    addWish.addEventListener('click', async () => {
      const item = await openWishForm({ set });
      if (item) {
        toast(`${set.name} er tilføjet til din ønskeliste.`);
        onAdded?.(item, 'wishlist');
        await lookup(set.setNumber);
      }
    });

    const actions = target === 'wishlist' ? [addWish, addCollection] : [addCollection, addWish];
    const sourceText = set.source === 'manual'
      ? 'Kilde: manuel indtastning'
      : `Data fra ${SOURCE_LABELS[set.source] || set.source}${set.lastFetchedAt ? ` · opdateret ${formatDate(set.lastFetchedAt)}` : ''}`;

    result.replaceChildren(
      warning ? alertBox('warn', warning) : '',
      h(
        'article',
        { class: 'set-detail' },
        setImage(set),
        h(
          'div',
          {},
          h('div', { class: 'chips' }, h('span', { class: 'chip chip-set' }, number), ...ownershipNotes),
          h('h3', {}, set.name),
          set.theme ? h('p', { class: 'card-theme' }, set.subtheme ? `${set.theme} · ${set.subtheme}` : set.theme) : null,
          h(
            'dl',
            { class: 'facts' },
            fact('Udgivet', set.releaseYear ?? 'Ukendt'),
            fact('Klodser', Number.isFinite(set.pieceCount) ? formatNumber(set.pieceCount) : 'Ukendt'),
            fact('Minifigurer', Number.isFinite(set.minifigureCount) ? formatNumber(set.minifigureCount) : 'Ukendt'),
          ),
          set.description ? h('p', {}, set.description) : null,
          h('div', { class: 'btn-row' }, ...actions),
          links.length ? h('p', { class: 'meta-line lookup-links' }, ...links.flatMap((l, i) => (i ? [' · ', l] : [l]))) : null,
          h('p', { class: 'meta-line' }, sourceText),
        ),
      ),
    );
  }

  return {
    focus: () => input.focus(),
    lookup: (value) => {
      input.value = value;
      return lookup(value);
    },
  };
}
