/**
 * "Backend" for GrejsLegoLibrary, der kører i browseren. Siderne kalder et lille API
 * (via api.js), og alle data gemmes i browserens localStorage.
 *
 * - Ingen konti eller login: data hører til browseren. Alle poster ejes af én fast
 *   lokal "bruger", så logikken for samling, ønskeliste og dubletter er enkel.
 * - Data ligger KUN i denne browser på denne enhed. Ryddes browserdata, er de væk –
 *   brug sikkerhedskopien under Indstillinger.
 * - Sætopslag: først det indbyggede katalog (assets/data/rebrickable-sets.json, bygget
 *   med scripts/build-catalog.mjs), derefter Rebrickables API, hvis brugeren har
 *   indtastet en nøgle under Indstillinger.
 */

const DB_KEY = 'gll.local.db.v1';
const CATALOG_KEY = 'gll.local.rebrickableKey';

const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 30 * DAY_MS;
const MANUAL_RECHECK_MS = DAY_MS;
const MAX_ITEMS = 5000;

export const CONDITIONS = ['new', 'opened', 'used'];
export const PRIORITIES = ['low', 'normal', 'high'];
export const WISH_STATUSES = ['wanted', 'purchased'];
const COLLECTION_FIELDS = ['quantity', 'condition', 'hasBox', 'hasInstructions', 'purchaseDate', 'purchasePrice', 'notes'];
const WISH_FIELDS = ['priority', 'targetPrice', 'notes'];

/* =====================================================================
   Fejl
   ===================================================================== */

export class LocalError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
const notFound = (message = 'Ressourcen blev ikke fundet.') => new LocalError(404, 'NOT_FOUND', message);

/* =====================================================================
   Lager
   ===================================================================== */

function storage() {
  try {
    const s = window.localStorage;
    s.getItem(DB_KEY);
    return s;
  } catch {
    throw new LocalError(
      503,
      'STORAGE_UNAVAILABLE',
      'Browseren tillader ikke lokal lagring her (fx i et privat vindue eller med blokerede cookies og webstedsdata).',
    );
  }
}

const LOCAL_USER_ID = 'local';
const emptyDb = () => ({ version: 2, createdAt: new Date().toISOString(), sets: [], collection: [], wishlist: [] });

/**
 * Den første udgave havde lokale konti. Flyt alle poster over til den faste lokale
 * bruger; står samme sæt på flere ønskelister, beholdes kun det nyeste ønske.
 */
function migrate(db) {
  if (db.version === 2) return false;
  db.collection.forEach((i) => { i.userId = LOCAL_USER_ID; });
  const bySet = new Map();
  for (const w of [...db.wishlist].sort((a, b) => b.addedAt.localeCompare(a.addedAt))) {
    if (!bySet.has(w.setId)) bySet.set(w.setId, { ...w, userId: LOCAL_USER_ID });
  }
  db.wishlist = [...bySet.values()];
  db.sets.forEach((s) => { if (s.source === 'manual') s.createdBy = LOCAL_USER_ID; });
  db.createdAt = db.users?.map((u) => u.createdAt).sort()[0] ?? new Date().toISOString();
  delete db.users;
  db.version = 2;
  try {
    window.localStorage.removeItem('gll.local.session.v1');
  } catch {
    /* intet at rydde */
  }
  return true;
}

function loadDb() {
  const raw = storage().getItem(DB_KEY);
  if (!raw) return emptyDb();
  try {
    const db = JSON.parse(raw);
    for (const k of ['sets', 'collection', 'wishlist']) if (!Array.isArray(db[k])) throw new Error(k);
    if (migrate(db)) saveDb(db);
    return db;
  } catch (err) {
    if (err instanceof LocalError) throw err;
    // Overskriv ALDRIG beskadigede data automatisk.
    throw new LocalError(500, 'STORAGE_CORRUPT', 'De gemte data i browseren er beskadigede og kan ikke læses.');
  }
}

function saveDb(db) {
  try {
    storage().setItem(DB_KEY, JSON.stringify(db));
  } catch (err) {
    if (err instanceof LocalError) throw err;
    throw new LocalError(507, 'STORAGE_FULL', 'Browserens lokale lager er fuldt. Slet nogle poster, eller tag en sikkerhedskopi.');
  }
}

/* =====================================================================
   Hjælpere
   ===================================================================== */

function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const nowIso = () => new Date().toISOString();
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function pickDefined(data, fields) {
  const out = {};
  for (const f of fields) if (data[f] !== undefined) out[f] = data[f];
  return out;
}

const SET_NUMBER_RE = /^([a-z0-9]{1,20})(?:-(\d{1,3}))?$/;
export function normalizeSetNumber(input) {
  if (typeof input !== 'string') return null;
  const match = SET_NUMBER_RE.exec(input.trim().toLowerCase());
  if (!match) return null;
  const variant = match[2] ? String(Number.parseInt(match[2], 10)) : '1';
  if (variant === '0') return null;
  return `${match[1]}-${variant}`;
}

/* =====================================================================
   Validering (fejlbeskeder pr. felt, som formularerne viser)
   ===================================================================== */

class Issues {
  constructor() {
    this.list = [];
  }
  add(field, message) {
    this.list.push({ field, message });
  }
  get any() {
    return this.list.length > 0;
  }
  throwIfAny() {
    if (this.any) throw new LocalError(400, 'VALIDATION_ERROR', this.list[0].message, this.list);
  }
}

function vString(issues, field, v, { label, typeMsg, min, minMsg, max, maxMsg, trim = true }) {
  if (typeof v !== 'string') {
    issues.add(field, typeMsg ?? `${label} skal være tekst.`);
    return undefined;
  }
  const s = trim ? v.trim() : v;
  if (min !== undefined && s.length < min) issues.add(field, minMsg);
  else if (max !== undefined && s.length > max) issues.add(field, maxMsg);
  return s;
}

function vOptionalText(issues, field, v, max, label) {
  if (v === undefined) return undefined;
  if (v === null || (typeof v === 'string' && v.trim() === '')) return null;
  return vString(issues, field, v, { label, max, maxMsg: `${label} må højst være ${max} tegn.` });
}

function vNullableNumber(issues, field, v, { min, max, int = false, label }) {
  if (v === undefined) return undefined;
  if (v === '' || v === null) return null;
  let n = v;
  if (typeof v === 'string') {
    const parsed = Number(v.trim().replace(',', '.'));
    n = Number.isFinite(parsed) ? parsed : v;
  }
  if (typeof n !== 'number' || !Number.isFinite(n)) return issues.add(field, `${label} skal være et tal.`);
  if (int && !Number.isInteger(n)) return issues.add(field, `${label} skal være et helt tal.`);
  if (n < min) return issues.add(field, `${label} skal være mindst ${min}.`);
  if (n > max) return issues.add(field, `${label} må højst være ${max}.`);
  return n;
}

function vNullableDate(issues, field, v, label) {
  if (v === undefined) return undefined;
  if (v === '' || v === null) return null;
  if (typeof v !== 'string') return issues.add(field, `${label} skal være en dato.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return issues.add(field, `${label} skal have formatet ÅÅÅÅ-MM-DD.`);
  const t = Date.parse(`${v}T00:00:00Z`);
  if (Number.isNaN(t)) return issues.add(field, `${label} er ikke en gyldig dato.`);
  if (t > Date.now() + 48 * 3600 * 1000) return issues.add(field, `${label} kan ikke ligge i fremtiden.`);
  if (Number(v.slice(0, 4)) < 1932) return issues.add(field, `${label} er for langt tilbage i tiden.`);
  return new Date(t).toISOString();
}

function vEnum(issues, field, v, values, message) {
  if (v === undefined) return undefined;
  if (!values.includes(v)) return issues.add(field, message);
  return v;
}

function vBool(issues, field, v, message) {
  if (v === undefined) return undefined;
  if (typeof v !== 'boolean') return issues.add(field, message);
  return v;
}

function vNotes(issues, v) {
  if (v === undefined) return undefined;
  return vString(issues, 'notes', v, {
    typeMsg: 'Noten skal være tekst.',
    max: 2000,
    maxMsg: 'Noten må højst være 2000 tegn.',
  });
}

function vSetNumber(issues, v) {
  if (typeof v !== 'string') return issues.add('setNumber', 'Sætnummer mangler.');
  const s = v.trim();
  if (!s) return issues.add('setNumber', 'Sætnummer mangler.');
  if (!normalizeSetNumber(s)) return issues.add('setNumber', 'Ugyldigt sætnummer. Brug fx 75192 eller 75192-1.');
  return s;
}

function vHttpsUrl(issues, v) {
  if (v === undefined) return undefined;
  if (v === null || (typeof v === 'string' && v.trim() === '')) return null;
  if (typeof v !== 'string') return issues.add('imageUrl', 'Billed-URL skal være tekst.');
  const s = v.trim();
  if (s.length > 2000) return issues.add('imageUrl', 'Billed-URL er for lang.');
  try {
    if (new URL(s).protocol === 'https:') return s;
  } catch {
    /* ugyldig */
  }
  return issues.add('imageUrl', 'Billed-URL skal være en gyldig https://-adresse.');
}

function strictKeys(issues, body, allowed) {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      issues.add(null, 'Feltet kan ikke ændres.');
      return;
    }
  }
}

function asObject(body) {
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

function parseCollectionFields(issues, b) {
  return {
    quantity: vNullableNumber(issues, 'quantity', b.quantity, { min: 1, max: 999, int: true, label: 'Antal' }),
    condition: vEnum(issues, 'condition', b.condition, CONDITIONS, 'Ugyldig stand.'),
    hasBox: vBool(issues, 'hasBox', b.hasBox, 'Ugyldig værdi for æske.'),
    hasInstructions: vBool(issues, 'hasInstructions', b.hasInstructions, 'Ugyldig værdi for byggevejledning.'),
    purchaseDate: vNullableDate(issues, 'purchaseDate', b.purchaseDate, 'Købsdato'),
    purchasePrice: vNullableNumber(issues, 'purchasePrice', b.purchasePrice, { min: 0, max: 10000000, label: 'Købspris' }),
    notes: vNotes(issues, b.notes),
  };
}

function parseDuplicateMode(issues, v) {
  return vEnum(issues, 'duplicateMode', v, ['merge', 'separate'], 'Ugyldig dubletindstilling.');
}

const schemas = {
  manualSet(body) {
    const b = asObject(body);
    const issues = new Issues();
    const out = {
      setNumber: vSetNumber(issues, b.setNumber),
      name: vString(issues, 'name', b.name, {
        typeMsg: 'Sættets navn mangler.',
        min: 1,
        minMsg: 'Sættets navn mangler.',
        max: 300,
        maxMsg: 'Navnet er for langt.',
      }),
      theme: vOptionalText(issues, 'theme', b.theme, 120, 'Tema'),
      releaseYear: vNullableNumber(issues, 'releaseYear', b.releaseYear, {
        min: 1932,
        max: new Date().getFullYear() + 2,
        int: true,
        label: 'Udgivelsesår',
      }),
      pieceCount: vNullableNumber(issues, 'pieceCount', b.pieceCount, { min: 0, max: 100000, int: true, label: 'Antal klodser' }),
      minifigureCount: vNullableNumber(issues, 'minifigureCount', b.minifigureCount, {
        min: 0,
        max: 1000,
        int: true,
        label: 'Antal minifigurer',
      }),
      imageUrl: vHttpsUrl(issues, b.imageUrl),
      description: vOptionalText(issues, 'description', b.description, 5000, 'Beskrivelse'),
    };
    issues.throwIfAny();
    return out;
  },

  collectionCreate(body) {
    const b = asObject(body);
    const issues = new Issues();
    const out = {
      setNumber: vSetNumber(issues, b.setNumber),
      ...parseCollectionFields(issues, b),
      duplicateMode: parseDuplicateMode(issues, b.duplicateMode),
    };
    issues.throwIfAny();
    return out;
  },

  collectionUpdate(body) {
    const b = asObject(body);
    const issues = new Issues();
    strictKeys(issues, b, COLLECTION_FIELDS);
    const out = parseCollectionFields(issues, b);
    if (!issues.any && out.quantity === null) issues.add('quantity', 'Antal skal være mindst 1.');
    issues.throwIfAny();
    return out;
  },

  wishCreate(body) {
    const b = asObject(body);
    const issues = new Issues();
    const out = {
      setNumber: vSetNumber(issues, b.setNumber),
      priority: vEnum(issues, 'priority', b.priority, PRIORITIES, 'Ugyldig prioritet.'),
      targetPrice: vNullableNumber(issues, 'targetPrice', b.targetPrice, { min: 0, max: 10000000, label: 'Ønsket maksimal pris' }),
      notes: vNotes(issues, b.notes),
    };
    issues.throwIfAny();
    return out;
  },

  wishUpdate(body) {
    const b = asObject(body);
    const issues = new Issues();
    strictKeys(issues, b, [...WISH_FIELDS, 'status']);
    const out = {
      priority: vEnum(issues, 'priority', b.priority, PRIORITIES, 'Ugyldig prioritet.'),
      targetPrice: vNullableNumber(issues, 'targetPrice', b.targetPrice, { min: 0, max: 10000000, label: 'Ønsket maksimal pris' }),
      notes: vNotes(issues, b.notes),
      status: vEnum(issues, 'status', b.status, WISH_STATUSES, 'Ugyldig status.'),
    };
    issues.throwIfAny();
    return out;
  },

  markPurchased(body) {
    const b = asObject(body);
    const issues = new Issues();
    let moveToCollection = false;
    if (b.moveToCollection !== undefined) {
      if (typeof b.moveToCollection !== 'boolean') {
        issues.add('moveToCollection', 'Angiv om sættet skal flyttes til samlingen.');
      } else moveToCollection = b.moveToCollection;
    }
    let collection;
    if (b.collection !== undefined) {
      const c = asObject(b.collection);
      const sub = new Issues();
      collection = { ...parseCollectionFields(sub, c), duplicateMode: parseDuplicateMode(sub, c.duplicateMode) };
      for (const i of sub.list) issues.add(i.field ? `collection.${i.field}` : 'collection', i.message);
    }
    issues.throwIfAny();
    return { moveToCollection, collection };
  },
};

/* =====================================================================
   Den faste lokale "bruger" (ingen login)
   ===================================================================== */

function currentUser(db) {
  return { id: LOCAL_USER_ID, username: 'Lokal', email: null, createdAt: db.createdAt };
}

const publicUser = (u) => ({ id: u.id, username: u.username, email: u.email, createdAt: u.createdAt });

/* =====================================================================
   Katalog: lokal cache + Rebrickable (direkte fra browseren)
   ===================================================================== */

function getCatalogKey() {
  try {
    return storage().getItem(CATALOG_KEY) || '';
  } catch {
    return '';
  }
}

class CatalogError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const REBRICKABLE = 'https://rebrickable.com/api/v3/lego';
const themeCache = new Map();

async function rbRequest(path, apiKey, { allowNotFound = false } = {}) {
  let res;
  try {
    res = await fetch(`${REBRICKABLE}${path}`, {
      headers: { Authorization: `key ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new CatalogError('UNAVAILABLE', 'Rebrickable kunne ikke kontaktes.');
  }
  if (res.status === 404 && allowNotFound) return null;
  if (res.status === 429) throw new CatalogError('RATE_LIMITED', 'Rebrickable rate limit nået.');
  if (res.status === 401 || res.status === 403) throw new CatalogError('AUTH_FAILED', 'Rebrickable afviste API-nøglen.');
  if (!res.ok) throw new CatalogError('UNAVAILABLE', `Rebrickable svarede med status ${res.status}.`);
  try {
    return await res.json();
  } catch {
    throw new CatalogError('UNAVAILABLE', 'Rebrickable sendte et ugyldigt svar.');
  }
}

async function resolveTheme(themeId, apiKey) {
  if (!themeId) return { theme: null, subtheme: null };
  try {
    const chain = [];
    let id = themeId;
    for (let depth = 0; id && depth < 5; depth += 1) {
      let t = themeCache.get(id);
      if (!t) {
        const data = await rbRequest(`/themes/${encodeURIComponent(id)}/`, apiKey, { allowNotFound: true });
        if (!data) break;
        t = { name: data.name, parentId: data.parent_id ?? null };
        themeCache.set(id, t);
      }
      chain.push(t.name);
      id = t.parentId;
    }
    if (!chain.length) return { theme: null, subtheme: null };
    return { theme: chain[chain.length - 1], subtheme: chain.length > 1 ? chain[0] : null };
  } catch (err) {
    if (err instanceof CatalogError && err.code === 'AUTH_FAILED') throw err;
    return { theme: null, subtheme: null };
  }
}

async function countMinifigures(setNumber, apiKey) {
  try {
    const data = await rbRequest(`/sets/${encodeURIComponent(setNumber)}/minifigs/?page_size=1000`, apiKey, {
      allowNotFound: true,
    });
    if (!data || !Array.isArray(data.results)) return null;
    return data.results.reduce((sum, m) => sum + (Number(m.quantity) || 0), 0);
  } catch {
    return null;
  }
}

async function fetchFromRebrickable(setNumber, apiKey) {
  const data = await rbRequest(`/sets/${encodeURIComponent(setNumber)}/`, apiKey, { allowNotFound: true });
  if (!data) return null;
  const [{ theme, subtheme }, minifigureCount] = await Promise.all([
    resolveTheme(data.theme_id, apiKey),
    countMinifigures(setNumber, apiKey),
  ]);
  const https = (v) => (typeof v === 'string' && v.startsWith('https://') ? v : null);
  return {
    name: data.name,
    theme,
    subtheme,
    releaseYear: Number.isInteger(data.year) ? data.year : null,
    pieceCount: Number.isInteger(data.num_parts) ? data.num_parts : null,
    minifigureCount,
    imageUrl: https(data.set_img_url),
    description: null,
    instructionsUrl: null,
    sourceUrl: https(data.set_url),
  };
}

function catalogErrorToLocal(err) {
  if (err instanceof CatalogError && err.code === 'RATE_LIMITED') {
    return new LocalError(
      503,
      'CATALOG_RATE_LIMITED',
      'LEGO-kataloget har nået sin grænse for opslag. Prøv igen om lidt, eller indtast sættet manuelt.',
    );
  }
  if (err instanceof CatalogError && err.code === 'AUTH_FAILED') {
    return new LocalError(
      503,
      'CATALOG_UNAVAILABLE',
      'Rebrickable afviste din API-nøgle. Tjek nøglen på profilsiden, eller indtast sættet manuelt.',
    );
  }
  return new LocalError(503, 'CATALOG_UNAVAILABLE', 'LEGO-kataloget svarer ikke lige nu. Prøv igen senere, eller indtast sættet manuelt.');
}

function publicSet(s) {
  return {
    id: s.id,
    setNumber: s.setNumber,
    name: s.name,
    theme: s.theme,
    subtheme: s.subtheme,
    releaseYear: s.releaseYear,
    pieceCount: s.pieceCount,
    minifigureCount: s.minifigureCount,
    imageUrl: s.imageUrl,
    description: s.description,
    instructionsUrl: s.instructionsUrl,
    sourceUrl: s.sourceUrl,
    source: s.source,
    lastFetchedAt: s.lastFetchedAt,
    updatedAt: s.updatedAt,
  };
}

function describeFallback(set) {
  if (set.source === 'manual') {
    return {
      set,
      cache: 'manual',
      warning: 'Oplysningerne er indtastet manuelt af en bruger og er ikke bekræftet af LEGO-kataloget.',
    };
  }
  return { set, cache: 'stale', warning: 'Oplysningerne kommer fra cachen og kunne ikke opdateres lige nu.' };
}

/* ---- Indbygget katalog: assets/data/rebrickable-sets.json (bygget med scripts/build-catalog.mjs) ---- */

let bundledPromise = null;

function loadBundled() {
  bundledPromise ??= fetch('assets/data/rebrickable-sets.json')
    .then((res) => {
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    })
    .catch(() => {
      bundledPromise = null; // prøv igen ved næste opslag
      throw new CatalogError('UNAVAILABLE', 'Det indbyggede katalog kunne ikke indlæses.');
    });
  return bundledPromise;
}

async function fetchFromBundled(setNumber) {
  const c = await loadBundled();
  const row = c.sets?.[setNumber];
  if (!row) return null;
  const [name, releaseYear, theme, subtheme, pieceCount, minifigureCount, img] = row;
  return {
    name,
    theme: theme >= 0 ? c.themes[theme] : null,
    subtheme: subtheme >= 0 ? c.themes[subtheme] : null,
    releaseYear,
    pieceCount,
    minifigureCount,
    imageUrl: img === 1 ? `https://cdn.rebrickable.com/media/sets/${setNumber}.jpg` : img || null,
    description: null,
    instructionsUrl: null,
    sourceUrl: `https://rebrickable.com/sets/${setNumber}/`,
  };
}

/** Slår et sæt op: cache → indbygget katalog → Rebrickable-API (med nøgle). Gemmer selv i db. */
async function catalogLookup(db, raw) {
  const setNumber = normalizeSetNumber(raw);
  if (!setNumber) throw new LocalError(400, 'INVALID_SET_NUMBER', 'Ugyldigt sætnummer. Brug fx 75192 eller 75192-1.');

  const existing = db.sets.find((s) => s.setNumber === setNumber);
  const isFresh = (s) => s.lastFetchedAt && Date.now() - Date.parse(s.lastFetchedAt) < CACHE_TTL_MS;
  if (existing && existing.source !== 'manual' && isFresh(existing)) return { set: existing, cache: 'hit' };

  const recentlyCheckedManual =
    existing?.source === 'manual' &&
    existing.lastProviderCheckAt &&
    Date.now() - Date.parse(existing.lastProviderCheckAt) < MANUAL_RECHECK_MS;

  if (recentlyCheckedManual) return describeFallback(existing);

  // 1) Det indbyggede katalog (ingen nøgle nødvendig). 2) Rebrickables API, hvis der er en nøgle.
  let data = null;
  let bundledError = null;
  try {
    data = await fetchFromBundled(setNumber);
  } catch (err) {
    bundledError = err;
  }
  const apiKey = getCatalogKey();
  if (!data && apiKey) {
    try {
      data = await fetchFromRebrickable(setNumber, apiKey);
    } catch (err) {
      if (existing) return describeFallback(existing);
      throw catalogErrorToLocal(err);
    }
  } else if (!data && bundledError) {
    if (existing) return describeFallback(existing);
    throw catalogErrorToLocal(bundledError);
  }

  // Hent frisk fra lageret: en anden fane kan have ændret data under opslaget.
  const fresh = loadDb();
  const current = fresh.sets.find((s) => s.setNumber === setNumber);
  if (!data) {
    if (current?.source === 'manual') {
      current.lastProviderCheckAt = nowIso();
      saveDb(fresh);
      Object.assign(db, fresh);
      return describeFallback(current);
    }
    if (current) return describeFallback(current);
    throw new LocalError(
      404,
      'SET_NOT_FOUND',
      `Sættet ${setNumber.replace(/-1$/, '')} blev ikke fundet i LEGO-kataloget. Tjek nummeret, eller indtast sættet manuelt.` +
        (apiKey ? '' : ' Helt nye sæt kan findes ved at indtaste en Rebrickable-nøgle under Indstillinger.'),
    );
  }

  const now = nowIso();
  const fields = { ...data, setNumber, source: 'rebrickable', createdBy: null, lastFetchedAt: now, lastProviderCheckAt: now, updatedAt: now };
  let set;
  if (current) {
    Object.assign(current, fields);
    set = current;
  } else {
    set = { id: newId(), createdAt: now, ...fields };
    fresh.sets.push(set);
  }
  saveDb(fresh);
  Object.assign(db, fresh);
  return { set, cache: 'fetched' };
}

async function resolveSet(db, raw) {
  const setNumber = normalizeSetNumber(raw);
  const cached = db.sets.find((s) => s.setNumber === setNumber);
  if (cached) return cached;
  return (await catalogLookup(db, raw)).set;
}

/* =====================================================================
   Samling og ønskeliste
   ===================================================================== */

function byAddedDesc(a, b) {
  return b.addedAt.localeCompare(a.addedAt) || b.seq - a.seq;
}

function publicCollectionItem(db, i) {
  const set = db.sets.find((s) => s.id === i.setId);
  return {
    id: i.id,
    setNumber: i.setNumber,
    setId: i.setId,
    set: set ? publicSet(set) : null,
    quantity: i.quantity,
    condition: i.condition,
    hasBox: i.hasBox,
    hasInstructions: i.hasInstructions,
    purchaseDate: i.purchaseDate,
    purchasePrice: i.purchasePrice,
    notes: i.notes,
    addedAt: i.addedAt,
    updatedAt: i.updatedAt,
  };
}

function publicWish(db, w) {
  const set = db.sets.find((s) => s.id === w.setId);
  return {
    id: w.id,
    setNumber: w.setNumber,
    setId: w.setId,
    set: set ? publicSet(set) : null,
    priority: w.priority,
    targetPrice: w.targetPrice,
    notes: w.notes,
    status: w.status,
    purchasedAt: w.purchasedAt,
    addedAt: w.addedAt,
    updatedAt: w.updatedAt,
  };
}

const nextSeq = (list) => list.reduce((m, x) => Math.max(m, x.seq || 0), 0) + 1;

function loadCollection(db, userId) {
  return db.collection
    .filter((i) => i.userId === userId)
    .sort(byAddedDesc)
    .slice(0, MAX_ITEMS)
    .map((i) => publicCollectionItem(db, i));
}

function loadWishlist(db, userId) {
  return db.wishlist
    .filter((w) => w.userId === userId)
    .sort(byAddedDesc)
    .slice(0, MAX_ITEMS)
    .map((w) => publicWish(db, w));
}

function findOwned(list, userId, id) {
  const doc = list.find((x) => x.id === id && x.userId === userId);
  if (!doc) throw notFound();
  return doc;
}

function addToCollection(db, userId, set, input) {
  const fields = pickDefined(input, COLLECTION_FIELDS);
  if (fields.quantity === null) delete fields.quantity;
  const existing = db.collection
    .filter((i) => i.userId === userId && i.setId === set.id)
    .sort((a, b) => a.addedAt.localeCompare(b.addedAt) || a.seq - b.seq);

  if (existing.length && !input.duplicateMode) {
    const quantity = existing.reduce((s, i) => s + i.quantity, 0);
    throw new LocalError(409, 'ALREADY_IN_COLLECTION', `Du har allerede ${quantity} stk. af dette sæt i din samling.`, {
      existingQuantity: quantity,
      registrations: existing.length,
      itemIds: existing.map((i) => i.id),
    });
  }

  if (existing.length && input.duplicateMode === 'merge') {
    const add = fields.quantity ?? 1;
    const target = existing[0];
    if (target.quantity > 999 - add) throw new LocalError(400, 'VALIDATION_ERROR', 'Antal må højst være 999.');
    target.quantity += add;
    target.updatedAt = nowIso();
    return { item: target, merged: true };
  }

  const now = nowIso();
  const item = {
    id: newId(),
    seq: nextSeq(db.collection),
    userId,
    setId: set.id,
    setNumber: set.setNumber,
    quantity: 1,
    condition: 'new',
    hasBox: false,
    hasInstructions: false,
    purchaseDate: null,
    purchasePrice: null,
    notes: '',
    ...fields,
    addedAt: now,
    updatedAt: now,
  };
  db.collection.push(item);
  return { item, merged: false };
}

function ownershipFor(db, userId, setId) {
  const items = db.collection.filter((i) => i.userId === userId && i.setId === setId);
  const wish = db.wishlist.find((w) => w.userId === userId && w.setId === setId);
  return {
    collectionQuantity: items.reduce((sum, i) => sum + i.quantity, 0),
    collectionRegistrations: items.length,
    wishlistItemId: wish ? wish.id : null,
    wishlistStatus: wish ? wish.status : null,
  };
}

/** Statistik over samlingen; felter, der ikke kan beregnes fuldt ud, markeres som ufuldstændige. */
export function computeCollectionStats(items) {
  const uniqueSetIds = new Set();
  const themes = new Map();
  let totalCopies = 0;
  let totalPieces = 0;
  let totalMinifigures = 0;
  let totalPurchaseValue = 0;
  let itemsMissingPieces = 0;
  let itemsMissingMinifigures = 0;
  let itemsMissingPrice = 0;

  for (const item of items) {
    const set = item.set ?? null;
    const qty = item.quantity || 0;
    uniqueSetIds.add(item.setId);
    totalCopies += qty;
    if (set && Number.isFinite(set.pieceCount)) totalPieces += set.pieceCount * qty;
    else itemsMissingPieces += 1;
    if (set && Number.isFinite(set.minifigureCount)) totalMinifigures += set.minifigureCount * qty;
    else itemsMissingMinifigures += 1;
    if (Number.isFinite(item.purchasePrice)) totalPurchaseValue += item.purchasePrice * qty;
    else itemsMissingPrice += 1;
    const themeName = set?.theme || null;
    const entry = themes.get(themeName) ?? { theme: themeName, sets: new Set(), copies: 0 };
    entry.sets.add(item.setId);
    entry.copies += qty;
    themes.set(themeName, entry);
  }

  const themeDistribution = [...themes.values()]
    .map((t) => ({ theme: t.theme, sets: t.sets.size, copies: t.copies }))
    .sort((a, b) => b.copies - a.copies || String(a.theme).localeCompare(String(b.theme), 'da'));

  return {
    registrations: items.length,
    uniqueSets: uniqueSetIds.size,
    totalCopies,
    totalPieces,
    piecesComplete: itemsMissingPieces === 0,
    itemsMissingPieces,
    totalMinifigures,
    minifiguresComplete: itemsMissingMinifigures === 0,
    itemsMissingMinifigures,
    totalPurchaseValue: Math.round(totalPurchaseValue * 100) / 100,
    itemsWithPrice: items.length - itemsMissingPrice,
    itemsMissingPrice,
    themes: themeDistribution,
  };
}

/* =====================================================================
   Sikkerhedskopi (kun den indloggede brugers egne data)
   ===================================================================== */

const BACKUP_APP = 'GrejsLegoLibrary-local';

function exportBackup(db, user) {
  const collection = db.collection.filter((i) => i.userId === user.id);
  const wishlist = db.wishlist.filter((w) => w.userId === user.id);
  const setIds = new Set([...collection, ...wishlist].map((x) => x.setId));
  const strip = ({ userId, ...rest }) => rest;
  return {
    app: BACKUP_APP,
    version: 1,
    exportedAt: nowIso(),
    sets: db.sets.filter((s) => setIds.has(s.id)).map(({ createdBy, ...s }) => ({ ...s, mine: createdBy === user.id })),
    collection: collection.map(strip),
    wishlist: wishlist.map(strip),
  };
}

function importBackup(db, user, backup) {
  const bad = () => new LocalError(400, 'INVALID_BACKUP', 'Filen er ikke en gyldig sikkerhedskopi fra GrejsLegoLibrary.');
  if (!backup || backup.app !== BACKUP_APP || backup.version !== 1) throw bad();
  for (const k of ['sets', 'collection', 'wishlist']) if (!Array.isArray(backup[k])) throw bad();

  // Sæt: brug eksisterende sæt med samme nummer; ellers opret dem fra kopien.
  const setIdMap = new Map();
  for (const s of backup.sets) {
    const setNumber = normalizeSetNumber(s?.setNumber);
    if (!setNumber || typeof s.name !== 'string' || !s.name.trim()) throw bad();
    let local = db.sets.find((x) => x.setNumber === setNumber);
    if (!local) {
      const now = nowIso();
      local = {
        id: newId(),
        setNumber,
        name: s.name.slice(0, 300),
        theme: s.theme ?? null,
        subtheme: s.subtheme ?? null,
        releaseYear: Number.isInteger(s.releaseYear) ? s.releaseYear : null,
        pieceCount: Number.isInteger(s.pieceCount) ? s.pieceCount : null,
        minifigureCount: Number.isInteger(s.minifigureCount) ? s.minifigureCount : null,
        imageUrl: typeof s.imageUrl === 'string' && s.imageUrl.startsWith('https://') ? s.imageUrl : null,
        description: typeof s.description === 'string' ? s.description.slice(0, 5000) : null,
        instructionsUrl: null,
        sourceUrl: typeof s.sourceUrl === 'string' && s.sourceUrl.startsWith('https://') ? s.sourceUrl : null,
        source: s.source === 'rebrickable' ? 'rebrickable' : 'manual',
        createdBy: s.source === 'rebrickable' ? null : user.id,
        lastFetchedAt: s.source === 'rebrickable' ? s.lastFetchedAt ?? null : null,
        lastProviderCheckAt: s.lastProviderCheckAt ?? null,
        createdAt: now,
        updatedAt: now,
      };
      db.sets.push(local);
    }
    setIdMap.set(s.id, local);
  }

  // Valider alle poster med de normale regler, før noget ændres.
  const toCollection = backup.collection.map((i) => {
    const set = setIdMap.get(i?.setId);
    if (!set) throw bad();
    const issues = new Issues();
    const f = parseCollectionFields(issues, { ...i, purchaseDate: i.purchaseDate ? String(i.purchaseDate).slice(0, 10) : null });
    if (issues.any) throw bad();
    return { set, f, addedAt: i.addedAt, updatedAt: i.updatedAt };
  });
  const toWishlist = backup.wishlist.map((w) => {
    const set = setIdMap.get(w?.setId);
    if (!set) throw bad();
    const issues = new Issues();
    const priority = vEnum(issues, 'priority', w.priority, PRIORITIES, '');
    const targetPrice = vNullableNumber(issues, 'targetPrice', w.targetPrice, { min: 0, max: 10000000, label: '' });
    const notes = vNotes(issues, w.notes ?? '');
    const status = vEnum(issues, 'status', w.status, WISH_STATUSES, '');
    if (issues.any) throw bad();
    return { set, priority, targetPrice, notes, status, purchasedAt: w.purchasedAt ?? null, addedAt: w.addedAt, updatedAt: w.updatedAt };
  });
  const wishSetIds = new Set();
  for (const w of toWishlist) {
    if (wishSetIds.has(w.set.id)) throw bad();
    wishSetIds.add(w.set.id);
  }

  // Erstat brugerens samling og ønskeliste med kopien.
  db.collection = db.collection.filter((i) => i.userId !== user.id);
  db.wishlist = db.wishlist.filter((w) => w.userId !== user.id);
  const validIso = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : nowIso());
  for (const { set, f, addedAt, updatedAt } of toCollection) {
    db.collection.push({
      id: newId(),
      seq: nextSeq(db.collection),
      userId: user.id,
      setId: set.id,
      setNumber: set.setNumber,
      quantity: f.quantity ?? 1,
      condition: f.condition ?? 'new',
      hasBox: f.hasBox ?? false,
      hasInstructions: f.hasInstructions ?? false,
      purchaseDate: f.purchaseDate ?? null,
      purchasePrice: f.purchasePrice ?? null,
      notes: f.notes ?? '',
      addedAt: validIso(addedAt),
      updatedAt: validIso(updatedAt),
    });
  }
  for (const w of toWishlist) {
    db.wishlist.push({
      id: newId(),
      seq: nextSeq(db.wishlist),
      userId: user.id,
      setId: w.set.id,
      setNumber: w.set.setNumber,
      priority: w.priority ?? 'normal',
      targetPrice: w.targetPrice ?? null,
      notes: w.notes ?? '',
      status: w.status ?? 'wanted',
      purchasedAt: w.status === 'purchased' ? w.purchasedAt : null,
      addedAt: validIso(w.addedAt),
      updatedAt: validIso(w.updatedAt),
    });
  }
  return { collection: toCollection.length, wishlist: toWishlist.length };
}

/* =====================================================================
   Ruter
   ===================================================================== */

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };

const routes = [
  ['GET', /^\/health$/, async () => ({ status: 'ok', database: 'local', time: nowIso() })],

  ['GET', /^\/auth\/me$/, async ({ user }) => ({ user: publicUser(user) }), { auth: true }],

  ['GET', /^\/sets\/status$/, async () => ({ provider: 'rebrickable', configured: true }), { auth: true }],

  ['GET', /^\/sets\/([^/]+)$/, async ({ db, user, params }) => {
    const result = await catalogLookup(db, decodeURIComponent(params[0]));
    return {
      set: publicSet(result.set),
      cache: result.cache,
      warning: result.warning ?? null,
      ownership: ownershipFor(db, user.id, result.set.id),
    };
  }, { auth: true }],

  ['POST', /^\/sets$/, async ({ db, user, body }) => {
    const input = schemas.manualSet(body);
    const setNumber = normalizeSetNumber(input.setNumber);
    const existing = db.sets.find((s) => s.setNumber === setNumber);
    if (existing && existing.source !== 'manual') {
      throw new LocalError(409, 'SET_EXISTS', 'Sættet findes allerede i LEGO-kataloget.', { set: publicSet(existing) });
    }
    if (existing && existing.createdBy !== user.id) {
      throw new LocalError(409, 'SET_EXISTS', 'Sættet er allerede indtastet manuelt af en anden bruger.', { set: publicSet(existing) });
    }
    const now = nowIso();
    const fields = {
      name: input.name,
      theme: input.theme ?? null,
      subtheme: null,
      releaseYear: input.releaseYear ?? null,
      pieceCount: input.pieceCount ?? null,
      minifigureCount: input.minifigureCount ?? null,
      imageUrl: input.imageUrl ?? null,
      description: input.description ?? null,
      instructionsUrl: null,
      sourceUrl: null,
      updatedAt: now,
    };
    let set = existing;
    if (set) Object.assign(set, fields);
    else {
      set = { id: newId(), setNumber, ...fields, source: 'manual', createdBy: user.id, lastFetchedAt: null, lastProviderCheckAt: now, createdAt: now };
      db.sets.push(set);
    }
    saveDb(db);
    return {
      status: 201,
      data: {
        set: publicSet(set),
        cache: 'manual',
        warning: 'Oplysningerne er indtastet manuelt og er ikke bekræftet af LEGO-kataloget.',
        ownership: ownershipFor(db, user.id, set.id),
      },
    };
  }, { auth: true }],

  ['GET', /^\/collection$/, async ({ db, user }) => {
    const items = loadCollection(db, user.id);
    return { items, stats: computeCollectionStats(items) };
  }, { auth: true }],

  ['POST', /^\/collection$/, async ({ db, user, body }) => {
    const data = schemas.collectionCreate(body);
    const set = await resolveSet(db, data.setNumber);
    const { item, merged } = addToCollection(db, user.id, set, data);
    saveDb(db);
    return { status: merged ? 200 : 201, data: { item: publicCollectionItem(db, item), merged } };
  }, { auth: true }],

  ['GET', /^\/collection\/([^/]+)$/, async ({ db, user, params }) => ({
    item: publicCollectionItem(db, findOwned(db.collection, user.id, params[0])),
  }), { auth: true }],

  ['PATCH', /^\/collection\/([^/]+)$/, async ({ db, user, params, body }) => {
    const data = schemas.collectionUpdate(body);
    const item = findOwned(db.collection, user.id, params[0]);
    Object.assign(item, pickDefined(data, COLLECTION_FIELDS), { updatedAt: nowIso() });
    saveDb(db);
    return { item: publicCollectionItem(db, item) };
  }, { auth: true }],

  ['DELETE', /^\/collection\/([^/]+)$/, async ({ db, user, params }) => {
    const item = findOwned(db.collection, user.id, params[0]);
    db.collection = db.collection.filter((i) => i !== item);
    saveDb(db);
    return { deleted: true, id: item.id };
  }, { auth: true }],

  ['GET', /^\/wishlist$/, async ({ db, user }) => ({ items: loadWishlist(db, user.id) }), { auth: true }],

  ['POST', /^\/wishlist$/, async ({ db, user, body }) => {
    const data = schemas.wishCreate(body);
    const set = await resolveSet(db, data.setNumber);
    const existing = db.wishlist.find((w) => w.userId === user.id && w.setId === set.id);
    if (existing) {
      throw new LocalError(409, 'ALREADY_ON_WISHLIST', 'Sættet står allerede på din ønskeliste.', { itemId: existing.id });
    }
    const now = nowIso();
    const item = {
      id: newId(),
      seq: nextSeq(db.wishlist),
      userId: user.id,
      setId: set.id,
      setNumber: set.setNumber,
      priority: 'normal',
      targetPrice: null,
      notes: '',
      ...pickDefined(data, WISH_FIELDS),
      status: 'wanted',
      purchasedAt: null,
      addedAt: now,
      updatedAt: now,
    };
    db.wishlist.push(item);
    saveDb(db);
    return { status: 201, data: { item: publicWish(db, item) } };
  }, { auth: true }],

  ['GET', /^\/wishlist\/([^/]+)$/, async ({ db, user, params }) => ({
    item: publicWish(db, findOwned(db.wishlist, user.id, params[0])),
  }), { auth: true }],

  ['PATCH', /^\/wishlist\/([^/]+)$/, async ({ db, user, params, body }) => {
    const data = schemas.wishUpdate(body);
    const item = findOwned(db.wishlist, user.id, params[0]);
    Object.assign(item, pickDefined(data, WISH_FIELDS));
    if (data.status && data.status !== item.status) {
      item.status = data.status;
      item.purchasedAt = data.status === 'purchased' ? nowIso() : null;
    }
    item.updatedAt = nowIso();
    saveDb(db);
    return { item: publicWish(db, item) };
  }, { auth: true }],

  ['DELETE', /^\/wishlist\/([^/]+)$/, async ({ db, user, params }) => {
    const item = findOwned(db.wishlist, user.id, params[0]);
    db.wishlist = db.wishlist.filter((w) => w !== item);
    saveDb(db);
    return { deleted: true, id: item.id };
  }, { auth: true }],

  ['POST', /^\/wishlist\/([^/]+)\/mark-purchased$/, async ({ db, user, params, body }) => {
    const data = schemas.markPurchased(body);
    const wish = findOwned(db.wishlist, user.id, params[0]);

    if (!data.moveToCollection) {
      if (wish.status !== 'purchased') {
        wish.status = 'purchased';
        wish.purchasedAt = nowIso();
        wish.updatedAt = wish.purchasedAt;
        saveDb(db);
      }
      return { moved: false, wishlistItem: publicWish(db, wish), collectionItem: null };
    }

    const input = { ...(data.collection ?? {}) };
    if (input.notes === undefined && wish.notes) input.notes = wish.notes;
    const set = db.sets.find((s) => s.id === wish.setId);
    if (!set) throw notFound('Sættet findes ikke længere i kataloget.');

    // Begge ændringer gemmes i ét skrive-kald, så sættet aldrig ender begge steder.
    const { item, merged } = addToCollection(db, user.id, set, input);
    db.wishlist = db.wishlist.filter((w) => w !== wish);
    saveDb(db);
    return { moved: true, merged, wishlistItem: null, collectionItem: publicCollectionItem(db, item) };
  }, { auth: true }],

  ['GET', /^\/dashboard$/, async ({ db, user }) => {
    const collection = loadCollection(db, user.id);
    const wishlist = loadWishlist(db, user.id);
    const wanted = wishlist.filter((w) => w.status === 'wanted');
    const topWishes = [...wanted]
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || new Date(b.addedAt) - new Date(a.addedAt))
      .slice(0, 4);
    return {
      user: publicUser(user),
      collection: computeCollectionStats(collection),
      wishlist: { total: wishlist.length, wanted: wanted.length, purchased: wishlist.length - wanted.length },
      recentCollection: collection.slice(0, 6),
      topWishes,
    };
  }, { auth: true }],

  /* ---- Kun i den lokale udgave ---- */

  ['GET', /^\/local\/catalog-key$/, async () => ({ configured: Boolean(getCatalogKey()) }), { auth: true }],

  ['POST', /^\/local\/catalog-key$/, async ({ body }) => {
    const key = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';
    if (key && !/^[A-Za-z0-9]{16,64}$/.test(key)) {
      throw new LocalError(400, 'VALIDATION_ERROR', 'API-nøglen ser ikke rigtig ud.', [
        { field: 'apiKey', message: 'API-nøglen ser ikke rigtig ud.' },
      ]);
    }
    if (key) storage().setItem(CATALOG_KEY, key);
    else storage().removeItem(CATALOG_KEY);
    return { configured: Boolean(key) };
  }, { auth: true }],

  ['POST', /^\/local\/delete-all$/, async ({ body }) => {
    if (body?.confirm !== true) throw new LocalError(400, 'VALIDATION_ERROR', 'Sletningen skal bekræftes.');
    saveDb(emptyDb());
    return { deleted: true };
  }, { auth: true }],

  ['GET', /^\/local\/backup$/, async ({ db, user }) => exportBackup(db, user), { auth: true }],

  ['POST', /^\/local\/backup$/, async ({ db, user, body }) => {
    const result = importBackup(db, user, body);
    saveDb(db);
    return { imported: result };
  }, { auth: true }],
];

/**
 * Kaldes af api.js i stedet for fetch(). Returnerer svarets `data`
 * eller kaster LocalError med samme status/kode som serveren ville give.
 */
export async function handleRequest(method, rawPath, body) {
  const path = rawPath.split('?')[0];
  let methodMismatch = false;
  for (const [m, re, fn, opts = {}] of routes) {
    const match = re.exec(path);
    if (!match) continue;
    if (m !== method) {
      methodMismatch = true;
      continue;
    }
    const db = loadDb();
    let user = null;
    if (opts.auth) user = currentUser(db);
    const result = await fn({ db, user, body, params: match.slice(1) });
    if (result && typeof result === 'object' && 'status' in result && 'data' in result) return clone(result.data);
    return clone(result);
  }
  if (methodMismatch) throw new LocalError(405, 'METHOD_NOT_ALLOWED', 'Handlingen er ikke tilladt.');
  throw notFound('Siden eller ressourcen findes ikke.');
}
