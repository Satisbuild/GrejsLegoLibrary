/* Små, genbrugelige UI-hjælpere. Al tekst indsættes som tekst (aldrig innerHTML med brugerdata). */

/**
 * Opretter et DOM-element.  h('a', { href: '#', class: 'btn' }, 'Tekst', childNode)
 * Attributter med on-præfiks bliver event listeners.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class') {
      el.className = value;
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Opretter et SVG-ikon ud fra en liste af path-data. */
export function icon(paths, { size = 20, label } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  for (const d of [].concat(paths)) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

export const ICONS = {
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3'],
  plus: ['M12 5v14', 'M5 12h14'],
  edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6'],
  close: ['M18 6 6 18', 'M6 6l12 12'],
  check: ['M20 6 9 17l-5-5'],
  grid: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h7v7h-7z'],
  list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  menu: ['M3 6h18', 'M3 12h18', 'M3 18h18'],
  heart: ['M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z'],
  box: ['M21 8 12 3 3 8v8l9 5 9-5z', 'M3 8l9 5 9-5', 'M12 13v8'],
  bag: ['M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z', 'M3 6h18', 'M16 10a4 4 0 0 1-8 0'],
  external: ['M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6', 'M15 3h6v6', 'M10 14 21 3'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  brick: ['M3 9h18v10H3z', 'M6 9V6h4v3', 'M14 9V6h4v3'],
  chart: ['M3 3v18h18', 'M7 16v-5', 'M12 16V7', 'M17 16v-8'],
  alert: ['M12 9v4', 'M12 17h.01', 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'],
};

/* ---------- Formatering ---------- */

const numberFmt = new Intl.NumberFormat('da-DK');
const priceFmt = new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short', year: 'numeric' });

export const formatNumber = (n) => (Number.isFinite(n) ? numberFmt.format(n) : '–');
export const formatPrice = (n) => (Number.isFinite(n) ? priceFmt.format(n) : '–');
const totalFmt = new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 });
/** Afrundet beløb til totaler/statistik, fx "18.000 kr." */
export const formatTotal = (n) => (Number.isFinite(n) ? totalFmt.format(n) : '–');
export const formatDate = (d) => (d ? dateFmt.format(new Date(d)) : '–');
/** "75192-1" vises som "75192"; andre varianter vises fuldt. */
export const formatSetNumber = (s) => String(s || '').replace(/-1$/, '');
export const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
export const todayInput = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const CONDITION_LABELS = { new: 'Nyt (uåbnet)', opened: 'Åbnet', used: 'Brugt' };
export const PRIORITY_LABELS = { high: 'Høj', normal: 'Normal', low: 'Lav' };

/* ---------- Komponenter ---------- */

export function spinner(label = 'Indlæser…') {
  return h('span', { class: 'spinner', role: 'status', 'aria-label': label });
}

export function loadingBlock(text = 'Indlæser…') {
  return h('div', { class: 'loading-block' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', { role: 'status' }, text));
}

export function alertBox(type, message) {
  return h(
    'div',
    { class: `alert alert-${type}`, role: type === 'error' ? 'alert' : 'status' },
    type === 'error' || type === 'warn' ? icon(ICONS.alert) : null,
    h('p', {}, message),
  );
}

export function emptyState({ title, text, action }) {
  return h(
    'div',
    { class: 'empty' },
    icon(ICONS.brick, { size: 64 }),
    h('h3', {}, title),
    text ? h('p', {}, text) : null,
    action || null,
  );
}

/** Produktbillede med pæn pladsholder, hvis billedet mangler eller ikke kan hentes. */
export function setImage(set, { className = '' } = {}) {
  const placeholder = () =>
    h('div', { class: `set-image placeholder ${className}` }, icon(ICONS.brick, { size: 44 }), h('span', {}, 'Intet billede'));
  if (!set?.imageUrl) return placeholder();
  const img = h('img', {
    src: set.imageUrl,
    alt: `${set.name} (${formatSetNumber(set.setNumber)})`,
    loading: 'lazy',
    decoding: 'async',
    referrerpolicy: 'no-referrer',
  });
  const wrap = h('div', { class: `set-image ${className}` }, img);
  // Ombyg wrapperen på stedet, så evt. badges lagt ovenpå billedet bevares.
  img.addEventListener(
    'error',
    () => {
      wrap.classList.add('placeholder');
      img.replaceWith(icon(ICONS.brick, { size: 44 }), h('span', {}, 'Intet billede'));
    },
    { once: true },
  );
  return wrap;
}

/* ---------- Knapper ---------- */

export function setBusy(button, busy, busyText) {
  if (busy) {
    button.dataset.label = button.textContent;
    button.setAttribute('aria-busy', 'true');
    button.disabled = true;
    button.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), busyText || button.dataset.label);
  } else {
    button.removeAttribute('aria-busy');
    button.disabled = false;
    if (button.dataset.label) button.textContent = button.dataset.label;
  }
}

/* ---------- Toasts ---------- */

let toastRegion;
export function toast(message, type = 'ok') {
  if (!toastRegion) {
    toastRegion = h('div', { class: 'toast-region', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastRegion);
  }
  const t = h('div', { class: `toast ${type === 'error' ? 'toast-error' : ''}` }, message);
  toastRegion.append(t);
  setTimeout(() => t.remove(), 4500);
}

/* ---------- Formularfejl ---------- */

export function clearFieldErrors(form) {
  form.querySelectorAll('.field-error').forEach((e) => e.remove());
  form.querySelectorAll('[aria-invalid]').forEach((e) => {
    e.removeAttribute('aria-invalid');
    e.removeAttribute('aria-errormessage');
  });
  form.querySelectorAll('.form-alert').forEach((e) => e.replaceChildren());
}

/** Viser fejl fra API'et ved de relevante felter og i formularens fejlboks. */
export function showFormError(form, error) {
  clearFieldErrors(form);
  let firstInvalid = null;
  const unplaced = [];
  for (const detail of error?.details && Array.isArray(error.details) ? error.details : []) {
    const name = String(detail.field || '').split('.').pop();
    const input = name ? form.querySelector(`[name="${CSS.escape(name)}"]`) : null;
    if (input) {
      const id = `${input.id || name}-error`;
      if (!document.getElementById(id)) {
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-errormessage', id);
        input.closest('.field')?.append(h('span', { class: 'field-error', id }, detail.message));
      }
      firstInvalid ??= input;
    } else {
      unplaced.push(detail.message);
    }
  }
  const box = form.querySelector('.form-alert');
  if (box && (!firstInvalid || unplaced.length)) {
    box.replaceChildren(alertBox('error', unplaced[0] || error?.message || 'Der opstod en fejl.'));
  }
  (firstInvalid || box)?.focus?.();
}

/* ---------- Dialoger ---------- */

/**
 * Åbner en modal <dialog>. Escape lukker, fokus returneres bagefter.
 * @returns {{ dialog: HTMLDialogElement, body: HTMLElement, foot: HTMLElement, close: Function }}
 */
export function openModal({ title, body, footer, onClose, form = false }) {
  const previouslyFocused = document.activeElement;
  const titleId = `modal-title-${Math.random().toString(36).slice(2)}`;
  const container = form ? h('form', { novalidate: true }) : h('div');
  const bodyEl = h('div', { class: 'modal-body' }, body);
  const footEl = h('div', { class: 'modal-foot' }, footer);
  const dialog = h(
    'dialog',
    { class: 'modal', 'aria-labelledby': titleId },
    container,
  );
  container.append(
    h(
      'div',
      { class: 'modal-head' },
      h('h2', { id: titleId }, title),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Luk', onclick: () => close() }, icon(ICONS.close)),
    ),
    bodyEl,
    footEl,
  );

  let closed = false;
  function close(result) {
    if (closed) return;
    closed = true;
    dialog.close();
    dialog.remove();
    previouslyFocused?.focus?.();
    onClose?.(result);
  }
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close(); // klik på baggrunden
  });

  document.body.append(dialog);
  dialog.showModal();
  const firstField = bodyEl.querySelector('input:not([type=hidden]), select, textarea');
  (firstField || dialog.querySelector('.modal-foot .btn-primary'))?.focus();
  return { dialog, form: form ? container : null, body: bodyEl, foot: footEl, close };
}

/** Bekræftelsesdialog. Returnerer true/false. */
export function confirmDialog({ title, message, confirmText = 'Bekræft', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    const cancelBtn = h('button', { type: 'button', class: 'btn' }, 'Annullér');
    const okBtn = h('button', { type: 'button', class: `btn ${danger ? 'btn-primary' : 'btn-blue'}` }, confirmText);
    const modal = openModal({
      title,
      body: h('p', {}, message),
      footer: [cancelBtn, okBtn],
      onClose: () => resolve(result),
    });
    cancelBtn.addEventListener('click', () => modal.close());
    okBtn.addEventListener('click', () => {
      result = true;
      modal.close();
    });
    cancelBtn.focus();
  });
}

/**
 * Spørger brugeren, hvad der skal ske, når et sæt allerede er i samlingen.
 * Returnerer 'merge', 'separate' eller null (annullér).
 */
export function askDuplicateMode(message) {
  return new Promise((resolve) => {
    let result = null;
    const mergeBtn = h('button', { type: 'button', class: 'btn btn-blue' }, 'Læg til antal');
    const sepBtn = h('button', { type: 'button', class: 'btn' }, 'Ny registrering');
    const cancelBtn = h('button', { type: 'button', class: 'btn btn-ghost' }, 'Annullér');
    const modal = openModal({
      title: 'Sættet er allerede i din samling',
      body: [
        h('p', {}, message),
        h(
          'ul',
          {},
          h('li', {}, h('strong', {}, 'Læg til antal: '), 'øger antallet på din eksisterende registrering.'),
          h(
            'li',
            {},
            h('strong', {}, 'Ny registrering: '),
            'gemmer eksemplaret for sig, fx hvis det har en anden stand eller købspris.',
          ),
        ),
      ],
      footer: [cancelBtn, sepBtn, mergeBtn],
      onClose: () => resolve(result),
    });
    cancelBtn.addEventListener('click', () => modal.close());
    mergeBtn.addEventListener('click', () => {
      result = 'merge';
      modal.close();
    });
    sepBtn.addEventListener('click', () => {
      result = 'separate';
      modal.close();
    });
    mergeBtn.focus();
  });
}

/* ---------- Diverse ---------- */

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Per-browser præferencer (fx gitter/liste). Bruges ALDRIG til samlingsdata. */
export const prefs = {
  get(key, fallback) {
    try {
      return localStorage.getItem(`gll:${key}`) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`gll:${key}`, value);
    } catch {
      /* ignorer */
    }
  },
};
