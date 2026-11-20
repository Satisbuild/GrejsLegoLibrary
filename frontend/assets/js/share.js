import { bundledSet, normalizeSetNumber } from './local-backend.js';
import { ICONS, PRIORITY_LABELS, debounce, formatPrice, formatSetNumber, h, icon, openModal, prefs, toast } from './ui.js';

/*
 * Deling af ønskelisten uden server: hele listen pakkes (komprimeret) ind i linkets #-del.
 * #-delen sendes aldrig til nogen server, så listen går kun fra afsender til modtager.
 *
 * Format: "z" + base64url(deflate-raw(JSON)) eller "j" + base64url(JSON), hvis browseren
 * ikke kan komprimere. JSON: { v: 1, o?: ejer, i: [[sætnr, prioritet, maks.pris?, noter?, navn?], …] }
 * Navnet sendes kun med for sæt, der ikke står i det indbyggede katalog (fx manuelt indtastede).
 */

const SHARE_PAGE = 'onskeliste.html';
const PRI_CODE = { high: 'h', normal: 'n', low: 'l' };
const PRI_FROM_CODE = { h: 'high', n: 'normal', l: 'low' };
const MAX_ITEMS = 500;
const MAX_DECODED_BYTES = 512 * 1024;
const LIMITS = { owner: 60, notes: 1000, name: 200 };

/* ---------- base64url ---------- */

function toBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/* ---------- Komprimering ---------- */

const canCompress = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

async function readCapped(stream) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_DECODED_BYTES) {
      reader.cancel();
      throw new Error('too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

const deflate = (bytes) => readCapped(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw')));
const inflate = (bytes) => readCapped(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')));

/* ---------- Kodning ---------- */

const clip = (s, max) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, max) : null);

function trimTrailingNulls(arr) {
  while (arr.length && arr[arr.length - 1] === null) arr.pop();
  return arr;
}

/** Er sættet i det indbyggede katalog? Kan kataloget ikke hentes, sendes navnet bare med. */
async function inCatalog(setNumber) {
  try {
    return Boolean(await bundledSet(setNumber));
  } catch {
    return false;
  }
}

/**
 * @param {{ owner?: string, items: object[], includePrice: boolean, includeNotes: boolean }} opts
 * @returns {Promise<string>} den del, der står efter # i linket
 */
export async function encodeWishlist({ owner, items, includePrice, includeNotes }) {
  const rows = await Promise.all(
    items.slice(0, MAX_ITEMS).map(async (w) => {
      const name = (await inCatalog(w.setNumber)) ? null : clip(w.set?.name, LIMITS.name);
      return trimTrailingNulls([
        formatSetNumber(w.setNumber),
        PRI_CODE[w.priority] ?? 'n',
        includePrice && Number.isFinite(w.targetPrice) ? w.targetPrice : null,
        includeNotes ? clip(w.notes, LIMITS.notes) : null,
        name,
      ]);
    }),
  );
  const payload = { v: 1, i: rows };
  const o = clip(owner, LIMITS.owner);
  if (o) payload.o = o;

  const json = new TextEncoder().encode(JSON.stringify(payload));
  const plain = `j${toBase64Url(json)}`;
  if (!canCompress) return plain;
  try {
    const packed = `z${toBase64Url(await deflate(json))}`;
    return packed.length < plain.length ? packed : plain;
  } catch {
    return plain;
  }
}

export class ShareDecodeError extends Error {}

/**
 * Læser en delt ønskeliste fra linkets #-del. Alt valideres, da linket kan være redigeret.
 * @returns {Promise<{ owner: string|null, items: { setNumber, priority, targetPrice, notes, name }[] }>}
 */
export async function decodeWishlist(hash) {
  const raw = String(hash || '').replace(/^#/, '').trim();
  if (!raw) throw new ShareDecodeError('Linket indeholder ingen ønskeliste.');
  const kind = raw[0];
  const body = raw.slice(1);
  if (!/^[A-Za-z0-9_-]+$/.test(body)) throw new ShareDecodeError('Linket er ufuldstændigt eller ødelagt.');

  let payload;
  try {
    let bytes = fromBase64Url(body);
    if (kind === 'z') {
      if (!canCompress) {
        throw new ShareDecodeError('Din browser er for gammel til at åbne linket. Prøv en nyere browser.');
      }
      bytes = await inflate(bytes);
    } else if (kind !== 'j') {
      throw new Error('unknown kind');
    }
    if (bytes.length > MAX_DECODED_BYTES) throw new Error('too large');
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } catch (err) {
    if (err instanceof ShareDecodeError) throw err;
    throw new ShareDecodeError('Linket er ufuldstændigt eller ødelagt.');
  }
  if (!payload || payload.v !== 1 || !Array.isArray(payload.i)) {
    throw new ShareDecodeError('Linket er ufuldstændigt eller ødelagt.');
  }

  const items = [];
  for (const row of payload.i.slice(0, MAX_ITEMS)) {
    if (!Array.isArray(row)) continue;
    const [num, pri, price, notes, name] = row;
    const setNumber = typeof num === 'string' ? normalizeSetNumber(num) : null;
    if (!setNumber) continue;
    items.push({
      setNumber,
      priority: PRI_FROM_CODE[pri] ?? 'normal',
      targetPrice: typeof price === 'number' && Number.isFinite(price) && price >= 0 ? price : null,
      notes: clip(notes, LIMITS.notes),
      name: clip(name, LIMITS.name),
    });
  }
  return { owner: clip(payload.o, LIMITS.owner), items };
}

/* ---------- Tekst ---------- */

/** Dansk ejefald: "Grejs" → "Grejs'", "Anna" → "Annas". */
export function possessive(name) {
  return /[sxz]$/i.test(name) ? `${name}'` : `${name}s`;
}

export const shareTitle = (owner) => (owner ? `${possessive(owner)} LEGO-ønskeliste` : 'Min LEGO-ønskeliste');

function plainTextList({ owner, items, includePrice, includeNotes, url }) {
  const lines = [shareTitle(owner), ''];
  for (const w of items) {
    const extra = [];
    if (w.priority === 'high') extra.push('høj prioritet');
    if (includePrice && Number.isFinite(w.targetPrice)) extra.push(`maks. ${formatPrice(w.targetPrice)}`);
    lines.push(`• ${formatSetNumber(w.setNumber)} ${w.set?.name ?? ''}`.trimEnd() + (extra.length ? ` (${extra.join(', ')})` : ''));
    if (includeNotes && w.notes?.trim()) lines.push(`   ${w.notes.trim().replace(/\s*\n\s*/g, ' ')}`);
  }
  lines.push('', `Se listen med billeder: ${url}`);
  return lines.join('\n');
}

async function copyText(text, fallbackInput) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Ældre browsere / usikre forbindelser: kopiér via et markeret felt.
    const ta = fallbackInput ?? h('textarea', { class: 'visually-hidden', readonly: true });
    if (!fallbackInput) document.body.append(ta);
    const old = ta.value;
    ta.value = text;
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    if (fallbackInput) ta.value = old;
    else ta.remove();
    return ok;
  }
}

/* ---------- Dialog ---------- */

const ICON_SHARE = ['M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7', 'M16 6l-4-4-4 4', 'M12 2v13'];
const ICON_COPY = ['M9 9h11v11H9z', 'M5 15H4V4h11v1'];
const ICON_MAIL = ['M3 5h18v14H3z', 'M3 6l9 7 9-7'];
export const SHARE_ICON = ICON_SHARE;

/**
 * Viser delingsdialogen for de ønsker, der stadig er "ønsket".
 * @param {object[]} items  ønsker i den rækkefølge, de skal vises
 */
export function openShareDialog(items) {
  const ownerInput = h('input', {
    type: 'text',
    id: 'share-owner',
    maxlength: LIMITS.owner,
    autocomplete: 'given-name',
    placeholder: 'Fx Grejs',
    value: prefs.get('share-owner', ''),
  });
  const priceBox = h('input', { type: 'checkbox', id: 'share-price', checked: prefs.get('share-price', '0') === '1' });
  const notesBox = h('input', { type: 'checkbox', id: 'share-notes', checked: prefs.get('share-notes', '0') === '1' });
  const linkInput = h('input', { type: 'text', id: 'share-link', readonly: true, 'aria-describedby': 'share-link-hint' });
  linkInput.addEventListener('focus', () => linkInput.select());

  const hasPrices = items.some((w) => Number.isFinite(w.targetPrice));
  const hasNotes = items.some((w) => w.notes?.trim());

  const btnShare = h('button', { type: 'button', class: 'btn btn-primary' }, icon(ICON_SHARE, { size: 18 }), 'Del…');
  const btnCopy = h('button', { type: 'button', class: 'btn btn-blue' }, icon(ICON_COPY, { size: 18 }), 'Kopiér link');
  const btnText = h('button', { type: 'button', class: 'btn' }, icon(ICONS.list, { size: 18 }), 'Kopiér som tekst');
  const btnMail = h('a', { class: 'btn', href: 'mailto:' }, icon(ICON_MAIL, { size: 18 }), 'Send som e-mail');
  const actions = [btnCopy, btnText, btnMail];
  if (typeof navigator.share === 'function') actions.unshift(btnShare);

  const closeBtn = h('button', { type: 'button', class: 'btn' }, 'Luk');

  const modal = openModal({
    title: 'Del din ønskeliste',
    body: [
      h(
        'p',
        { class: 'share-intro' },
        'Du får et link, som du kan sende på SMS, Messenger eller mail. Hele ønskelisten ligger i selve linket, så modtageren skal ikke downloade noget eller oprette en konto. Det er nok at klikke på linket.',
      ),
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'share-owner' }, 'Dit navn', h('span', { class: 'optional' }, ' (valgfri)')),
        ownerInput,
        h('span', { class: 'hint' }, 'Bruges som overskrift, fx "Grejs\' ønskeliste".'),
      ),
      h(
        'fieldset',
        { class: 'share-options' },
        h('legend', {}, 'Hvad skal med?'),
        h('label', { class: 'check', for: 'share-price' }, priceBox, 'Maks. pris', hasPrices ? null : h('span', { class: 'optional' }, ' (ingen angivet)')),
        h('label', { class: 'check', for: 'share-notes' }, notesBox, 'Mine noter', hasNotes ? null : h('span', { class: 'optional' }, ' (ingen skrevet)')),
      ),
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'share-link' }, 'Link til ønskelisten'),
        linkInput,
        h(
          'span',
          { class: 'hint', id: 'share-link-hint' },
          `${items.length} ${items.length === 1 ? 'ønske' : 'ønsker'} kommer med. Købte sæt deles ikke. Ændrer du listen senere, skal du sende et nyt link.`,
        ),
      ),
      h('div', { class: 'btn-row share-actions' }, ...actions),
    ],
    footer: [closeBtn],
  });
  closeBtn.addEventListener('click', () => modal.close());

  let current = null; // { url, text, title }
  let building = null;

  const options = () => ({
    owner: ownerInput.value,
    items,
    includePrice: priceBox.checked,
    includeNotes: notesBox.checked,
  });

  function setReady(ready) {
    for (const b of [btnShare, btnCopy, btnText]) b.disabled = !ready;
    btnMail.toggleAttribute('aria-disabled', !ready);
  }

  async function rebuild() {
    setReady(false);
    linkInput.value = 'Laver link…';
    const opts = options();
    const job = (async () => {
      const hash = await encodeWishlist(opts);
      const url = new URL(`${SHARE_PAGE}#${hash}`, location.href).href;
      const owner = clip(opts.owner, LIMITS.owner);
      const title = shareTitle(owner);
      const text = plainTextList({ ...opts, owner, url });
      return { url, title, text };
    })();
    building = job;
    const result = await job;
    if (building !== job) return; // en nyere ændring er på vej
    current = result;
    linkInput.value = result.url;
    // Mailprogrammer afviser ofte meget lange mailto-links – så sendes kun linket.
    const mailBody = result.text.length < 1500 ? result.text : `Her er min LEGO-ønskeliste:\n\n${result.url}`;
    btnMail.href = `mailto:?subject=${encodeURIComponent(result.title)}&body=${encodeURIComponent(mailBody)}`;
    setReady(true);
  }

  function savePrefs() {
    prefs.set('share-owner', ownerInput.value.trim());
    prefs.set('share-price', priceBox.checked ? '1' : '0');
    prefs.set('share-notes', notesBox.checked ? '1' : '0');
  }

  ownerInput.addEventListener('input', debounce(() => (savePrefs(), rebuild()), 250));
  priceBox.addEventListener('change', () => (savePrefs(), rebuild()));
  notesBox.addEventListener('change', () => (savePrefs(), rebuild()));

  btnShare.addEventListener('click', async () => {
    if (!current) return;
    try {
      await navigator.share({ title: current.title, text: `${current.title} – se den her:`, url: current.url });
    } catch (err) {
      if (err?.name !== 'AbortError') toast('Deling virkede ikke her – kopiér linket i stedet.', 'error');
    }
  });

  btnCopy.addEventListener('click', async () => {
    if (!current) return;
    const ok = await copyText(current.url, linkInput);
    toast(ok ? 'Linket er kopieret – sæt det ind i en besked.' : 'Kunne ikke kopiere. Markér linket og kopiér det selv.', ok ? 'ok' : 'error');
  });

  btnText.addEventListener('click', async () => {
    if (!current) return;
    const ok = await copyText(current.text);
    toast(ok ? 'Listen er kopieret som tekst med link.' : 'Kunne ikke kopiere teksten.', ok ? 'ok' : 'error');
  });

  btnMail.addEventListener('click', (e) => {
    if (!current) e.preventDefault();
  });

  rebuild();
  return modal;
}
