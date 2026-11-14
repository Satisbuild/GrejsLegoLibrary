import { patch, post } from './api.js';
import {
  CONDITION_LABELS,
  PRIORITY_LABELS,
  askDuplicateMode,
  clearFieldErrors,
  formatSetNumber,
  h,
  openModal,
  setBusy,
  setImage,
  showFormError,
  toDateInput,
  todayInput,
} from './ui.js';

let uid = 0;
const nextId = (name) => `f${(uid += 1)}-${name}`;

/* ---------- Byggesten til felter ---------- */

function field({ label, name, input, hint, optional }) {
  const id = nextId(name);
  input.id = id;
  input.name = name;
  const hintId = hint ? `${id}-hint` : null;
  if (hintId) input.setAttribute('aria-describedby', hintId);
  return h(
    'div',
    { class: 'field' },
    h('label', { for: id }, label, optional ? h('span', { class: 'optional' }, ' (valgfri)') : null),
    input,
    hint ? h('span', { class: 'hint', id: hintId }, hint) : null,
  );
}

function checkbox(label, name, checked) {
  const id = nextId(name);
  return h(
    'div',
    { class: 'field' },
    h('label', { class: 'check', for: id }, h('input', { type: 'checkbox', id, name, checked: Boolean(checked) }), label),
  );
}

function select(options, value) {
  const el = h('select');
  for (const [v, label] of Object.entries(options)) {
    el.append(h('option', { value: v, selected: v === value }, label));
  }
  return el;
}

const numberValue = (form, name) => {
  const raw = form.elements[name]?.value?.trim();
  return raw === '' || raw === undefined ? null : Number(raw.replace(',', '.'));
};

const formAlert = () => h('div', { class: 'form-alert', tabindex: '-1' });

/** Lille sætoversigt øverst i formularer. */
export function setSummary(set) {
  return h(
    'div',
    { class: 'set-summary' },
    setImage(set),
    h(
      'div',
      {},
      h('span', { class: 'chip chip-set' }, formatSetNumber(set.setNumber)),
      h('p', { class: 'set-summary-name' }, set.name),
      set.theme ? h('p', { class: 'meta-line' }, set.theme) : null,
    ),
  );
}

/* ---------- Samlingsfelter ---------- */

export function collectionFields(values = {}) {
  return [
    h(
      'div',
      { class: 'form-row' },
      field({
        label: 'Antal eksemplarer',
        name: 'quantity',
        input: h('input', { type: 'number', min: 1, max: 999, step: 1, required: true, value: values.quantity ?? 1, inputmode: 'numeric' }),
      }),
      field({ label: 'Stand', name: 'condition', input: select(CONDITION_LABELS, values.condition ?? 'new') }),
    ),
    h(
      'div',
      { class: 'form-row' },
      checkbox('Æske medfølger', 'hasBox', values.hasBox),
      checkbox('Byggevejledning medfølger', 'hasInstructions', values.hasInstructions),
    ),
    h(
      'div',
      { class: 'form-row' },
      field({
        label: 'Købsdato',
        name: 'purchaseDate',
        optional: true,
        input: h('input', { type: 'date', value: toDateInput(values.purchaseDate), max: todayInput() }),
      }),
      field({
        label: 'Købspris pr. stk. (kr.)',
        name: 'purchasePrice',
        optional: true,
        input: h('input', { type: 'number', min: 0, step: '0.01', inputmode: 'decimal', value: values.purchasePrice ?? '' }),
      }),
    ),
    field({
      label: 'Noter',
      name: 'notes',
      optional: true,
      input: h('textarea', { maxlength: 2000, rows: 3 }, values.notes ?? ''),
    }),
  ];
}

export function readCollectionFields(form) {
  return {
    quantity: numberValue(form, 'quantity'),
    condition: form.elements.condition.value,
    hasBox: form.elements.hasBox.checked,
    hasInstructions: form.elements.hasInstructions.checked,
    purchaseDate: form.elements.purchaseDate.value || null,
    purchasePrice: numberValue(form, 'purchasePrice'),
    notes: form.elements.notes.value.trim(),
  };
}

function validateCollectionFields(data) {
  const details = [];
  if (!Number.isInteger(data.quantity) || data.quantity < 1 || data.quantity > 999) {
    details.push({ field: 'quantity', message: 'Antal skal være et helt tal mellem 1 og 999.' });
  }
  if (data.purchasePrice !== null && (!Number.isFinite(data.purchasePrice) || data.purchasePrice < 0)) {
    details.push({ field: 'purchasePrice', message: 'Købsprisen skal være et positivt tal.' });
  }
  return details;
}

/**
 * Dialog til at tilføje et sæt til samlingen eller redigere en eksisterende post.
 * @returns {Promise<object|null>} den gemte post eller null ved annullering
 */
export function openCollectionForm({ set, item = null }) {
  return new Promise((resolve) => {
    let saved = null;
    const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, item ? 'Gem ændringer' : 'Tilføj til samling');
    const cancel = h('button', { type: 'button', class: 'btn' }, 'Annullér');
    const modal = openModal({
      title: item ? 'Redigér sæt i samlingen' : 'Tilføj til min samling',
      form: true,
      body: [setSummary(set), formAlert(), ...collectionFields(item ?? {})],
      footer: [cancel, submit],
      onClose: () => resolve(saved),
    });
    cancel.addEventListener('click', () => modal.close());

    modal.form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFieldErrors(modal.form);
      const data = readCollectionFields(modal.form);
      const problems = validateCollectionFields(data);
      if (problems.length) return showFormError(modal.form, { details: problems });

      setBusy(submit, true, 'Gemmer…');
      try {
        if (item) {
          saved = (await patch(`/collection/${item.id}`, data)).item;
        } else {
          saved = await createCollectionItem({ ...data, setNumber: set.setNumber });
          if (!saved) {
            setBusy(submit, false);
            return; // brugeren annullerede dublet-valget
          }
        }
        modal.close();
      } catch (err) {
        setBusy(submit, false);
        showFormError(modal.form, err);
      }
    });
  });
}

/** POST til samlingen; spørger brugeren ved dubletter. */
async function createCollectionItem(body) {
  try {
    return (await post('/collection', body)).item;
  } catch (err) {
    if (err.code !== 'ALREADY_IN_COLLECTION') throw err;
    const mode = await askDuplicateMode(err.message);
    if (!mode) return null;
    return (await post('/collection', { ...body, duplicateMode: mode })).item;
  }
}

/* ---------- Ønskeliste ---------- */

export function wishFields(values = {}) {
  return [
    h(
      'div',
      { class: 'form-row' },
      field({ label: 'Prioritet', name: 'priority', input: select(PRIORITY_LABELS, values.priority ?? 'normal') }),
      field({
        label: 'Ønsket maks. pris (kr.)',
        name: 'targetPrice',
        optional: true,
        input: h('input', { type: 'number', min: 0, step: '0.01', inputmode: 'decimal', value: values.targetPrice ?? '' }),
      }),
    ),
    field({
      label: 'Personlig note',
      name: 'notes',
      optional: true,
      input: h('textarea', { maxlength: 2000, rows: 3 }, values.notes ?? ''),
    }),
  ];
}

export function openWishForm({ set, item = null }) {
  return new Promise((resolve) => {
    let saved = null;
    const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, item ? 'Gem ændringer' : 'Tilføj til ønskeliste');
    const cancel = h('button', { type: 'button', class: 'btn' }, 'Annullér');
    const modal = openModal({
      title: item ? 'Redigér ønske' : 'Tilføj til ønskeliste',
      form: true,
      body: [setSummary(set), formAlert(), ...wishFields(item ?? {})],
      footer: [cancel, submit],
      onClose: () => resolve(saved),
    });
    cancel.addEventListener('click', () => modal.close());

    modal.form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFieldErrors(modal.form);
      const data = {
        priority: modal.form.elements.priority.value,
        targetPrice: numberValue(modal.form, 'targetPrice'),
        notes: modal.form.elements.notes.value.trim(),
      };
      if (data.targetPrice !== null && (!Number.isFinite(data.targetPrice) || data.targetPrice < 0)) {
        return showFormError(modal.form, { details: [{ field: 'targetPrice', message: 'Prisen skal være et positivt tal.' }] });
      }
      setBusy(submit, true, 'Gemmer…');
      try {
        saved = item
          ? (await patch(`/wishlist/${item.id}`, data)).item
          : (await post('/wishlist', { ...data, setNumber: set.setNumber })).item;
        modal.close();
      } catch (err) {
        setBusy(submit, false);
        showFormError(modal.form, err);
      }
    });
  });
}

/**
 * "Markér som købt": brugeren vælger at flytte sættet til samlingen (og kontrollerer
 * antal og købsoplysninger) eller blot markere ønsket som købt.
 * @returns {Promise<object|null>} API-svaret eller null
 */
export function openMarkPurchasedDialog(wish) {
  return new Promise((resolve) => {
    let result = null;
    const moveId = nextId('move');
    const keepId = nextId('keep');
    const fields = h(
      'div',
      { class: 'form', id: nextId('collection-fields') },
      ...collectionFields({
        quantity: 1,
        condition: 'new',
        hasBox: true,
        hasInstructions: true,
        purchaseDate: todayInput(),
        purchasePrice: null,
        notes: wish.notes,
      }),
    );

    const choice = h(
      'fieldset',
      {},
      h('legend', {}, 'Hvad skal der ske med ønsket?'),
      h(
        'div',
        { class: 'radio-cards' },
        h(
          'label',
          { class: 'radio-card', for: moveId },
          h('input', { type: 'radio', name: 'action', value: 'move', id: moveId, checked: true }),
          h('div', {}, h('strong', {}, 'Flyt til min samling'), h('span', {}, 'Ønsket fjernes fra listen, og sættet gemmes i din samling.')),
        ),
        h(
          'label',
          { class: 'radio-card', for: keepId },
          h('input', { type: 'radio', name: 'action', value: 'keep', id: keepId }),
          h('div', {}, h('strong', {}, 'Markér kun som købt'), h('span', {}, 'Ønsket bliver stående på listen som købt.')),
        ),
      ),
    );

    const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Gem');
    const cancel = h('button', { type: 'button', class: 'btn' }, 'Annullér');
    const modal = openModal({
      title: 'Markér som købt',
      form: true,
      body: [setSummary(wish.set), formAlert(), choice, fields],
      footer: [cancel, submit],
      onClose: () => resolve(result),
    });
    cancel.addEventListener('click', () => modal.close());
    modal.form.addEventListener('change', (e) => {
      if (e.target.name === 'action') fields.hidden = e.target.value !== 'move';
    });

    modal.form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFieldErrors(modal.form);
      const move = modal.form.elements.action.value === 'move';
      const body = { moveToCollection: move };
      if (move) {
        body.collection = readCollectionFields(modal.form);
        const problems = validateCollectionFields(body.collection);
        if (problems.length) return showFormError(modal.form, { details: problems });
      }
      setBusy(submit, true, 'Gemmer…');
      try {
        try {
          result = await post(`/wishlist/${wish.id}/mark-purchased`, body);
        } catch (err) {
          if (err.code !== 'ALREADY_IN_COLLECTION') throw err;
          const mode = await askDuplicateMode(err.message);
          if (!mode) {
            setBusy(submit, false);
            return;
          }
          body.collection.duplicateMode = mode;
          result = await post(`/wishlist/${wish.id}/mark-purchased`, body);
        }
        modal.close();
      } catch (err) {
        setBusy(submit, false);
        showFormError(modal.form, err);
      }
    });
  });
}

/* ---------- Manuel indtastning af sæt ---------- */

export function openManualSetForm(setNumber = '') {
  return new Promise((resolve) => {
    let result = null;
    const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Gem sæt');
    const cancel = h('button', { type: 'button', class: 'btn' }, 'Annullér');
    const year = new Date().getFullYear();
    const modal = openModal({
      title: 'Indtast sæt manuelt',
      form: true,
      body: [
        h(
          'p',
          { class: 'meta-line' },
          'Udfyld de oplysninger, du kender. Sættet markeres som "manuelt indtastet", og oplysningerne erstattes automatisk, hvis LEGO-kataloget senere finder sættet.',
        ),
        formAlert(),
        h(
          'div',
          { class: 'form-row' },
          field({ label: 'Sætnummer', name: 'setNumber', input: h('input', { type: 'text', required: true, maxlength: 24, value: setNumber, autocomplete: 'off' }) }),
          field({ label: 'Udgivelsesår', name: 'releaseYear', optional: true, input: h('input', { type: 'number', min: 1932, max: year + 2, step: 1, inputmode: 'numeric' }) }),
        ),
        field({ label: 'Sættets navn', name: 'name', input: h('input', { type: 'text', required: true, maxlength: 300 }) }),
        h(
          'div',
          { class: 'form-row' },
          field({ label: 'Tema', name: 'theme', optional: true, input: h('input', { type: 'text', maxlength: 120, placeholder: 'fx Star Wars' }) }),
          field({ label: 'Antal klodser', name: 'pieceCount', optional: true, input: h('input', { type: 'number', min: 0, step: 1, inputmode: 'numeric' }) }),
          field({ label: 'Antal minifigurer', name: 'minifigureCount', optional: true, input: h('input', { type: 'number', min: 0, step: 1, inputmode: 'numeric' }) }),
        ),
        field({
          label: 'Billed-URL',
          name: 'imageUrl',
          optional: true,
          hint: 'En https://-adresse til et billede af sættet.',
          input: h('input', { type: 'url', maxlength: 2000, placeholder: 'https://' }),
        }),
        field({ label: 'Beskrivelse', name: 'description', optional: true, input: h('textarea', { maxlength: 5000, rows: 3 }) }),
      ],
      footer: [cancel, submit],
      onClose: () => resolve(result),
    });
    cancel.addEventListener('click', () => modal.close());

    modal.form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFieldErrors(modal.form);
      const f = modal.form.elements;
      const data = {
        setNumber: f.setNumber.value.trim(),
        name: f.name.value.trim(),
        theme: f.theme.value.trim(),
        releaseYear: numberValue(modal.form, 'releaseYear'),
        pieceCount: numberValue(modal.form, 'pieceCount'),
        minifigureCount: numberValue(modal.form, 'minifigureCount'),
        imageUrl: f.imageUrl.value.trim(),
        description: f.description.value.trim(),
      };
      setBusy(submit, true, 'Gemmer…');
      try {
        result = await post('/sets', data);
        modal.close();
      } catch (err) {
        setBusy(submit, false);
        if (err.code === 'SET_EXISTS' && err.details?.set) {
          result = { set: err.details.set, cache: err.details.set.source === 'manual' ? 'manual' : 'hit', existing: true };
          modal.close();
          return;
        }
        showFormError(modal.form, err);
      }
    });
  });
}
