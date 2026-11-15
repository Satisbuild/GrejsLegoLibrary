// Bygger det indbyggede LEGO-katalog ud fra Rebrickables gratis datafiler
// (https://rebrickable.com/downloads/ – ingen API-nøgle nødvendig).
//
//   node scripts/build-catalog.mjs        (kræver Node.js 20 eller nyere, ingen npm install)
//
// Skriver frontend/assets/data/rebrickable-sets.json.
//
// Kør igen en gang imellem for at få nye sæt med.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const BASE = 'https://cdn.rebrickable.com/media/downloads';
const SET_NUMBER_RE = /^[a-z0-9]{1,20}-\d{1,3}$/;
const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = [path.join(repoDir, 'frontend/assets/data/rebrickable-sets.json')];

/** Minimal CSV-parser med understøttelse af "citerede, felter" og "" i navne. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...data] = rows.filter((r) => r.length > 1 || r[0]);
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

async function download(name) {
  const res = await fetch(`${BASE}/${name}.csv.gz`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return parseCsv(gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf8'));
}

console.log('Henter Rebrickable-data...');
const [sets, themes, inventories, invMinifigs] = await Promise.all(
  ['sets', 'themes', 'inventories', 'inventory_minifigs'].map(download),
);

// Temaer: hovedtema (roden) og undertema (sættets eget tema, hvis det ikke er roden).
const themeById = new Map(themes.map((t) => [t.id, { name: t.name, parentId: t.parent_id || null }]));
const themeNames = [];
const themeIndex = new Map();
const idx = (name) => {
  if (!themeIndex.has(name)) {
    themeIndex.set(name, themeNames.length);
    themeNames.push(name);
  }
  return themeIndex.get(name);
};
function themeOf(id) {
  const chain = [];
  for (let cur = id, d = 0; cur && d < 6; d += 1) {
    const t = themeById.get(cur);
    if (!t) break;
    chain.push(t.name);
    cur = t.parentId;
  }
  if (!chain.length) return [-1, -1];
  return [idx(chain[chain.length - 1]), chain.length > 1 ? idx(chain[0]) : -1];
}

// Minifigurer: summen i sættets første inventarversion. Intet inventar = ukendt (null).
const firstInventory = new Map();
for (const inv of inventories) {
  const cur = firstInventory.get(inv.set_num);
  if (!cur || Number(inv.version) < cur.version) firstInventory.set(inv.set_num, { id: inv.id, version: Number(inv.version) });
}
const figsByInventory = new Map();
for (const m of invMinifigs) {
  figsByInventory.set(m.inventory_id, (figsByInventory.get(m.inventory_id) ?? 0) + (Number(m.quantity) || 0));
}

const out = {};
let skipped = 0;
for (const s of sets) {
  const setNumber = s.set_num.toLowerCase();
  if (!SET_NUMBER_RE.test(setNumber)) {
    skipped += 1;
    continue;
  }
  const [theme, subtheme] = themeOf(s.theme_id);
  const inv = firstInventory.get(s.set_num);
  const minifigs = inv ? figsByInventory.get(inv.id) ?? 0 : null;
  const standardImg = `https://cdn.rebrickable.com/media/sets/${setNumber}.jpg`;
  const img = !s.img_url ? 0 : s.img_url.toLowerCase() === standardImg ? 1 : s.img_url.startsWith('https://') ? s.img_url : 0;
  const year = Number.parseInt(s.year, 10);
  const parts = Number.parseInt(s.num_parts, 10);
  // [navn, år, hovedtema, undertema, klodser, minifigurer, billede]
  out[setNumber] = [s.name, Number.isFinite(year) ? year : null, theme, subtheme, Number.isFinite(parts) ? parts : null, minifigs, img];
}

const json = JSON.stringify({
  source: 'Rebrickable (https://rebrickable.com/downloads/)',
  generatedAt: new Date().toISOString(),
  themes: themeNames,
  sets: out,
});
for (const file of targets) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, json);
  console.log(`Skrev ${file}`);
}
console.log(`${Object.keys(out).length} sæt, ${themeNames.length} temaer (${skipped} sæt med usædvanlige numre sprunget over).`);
