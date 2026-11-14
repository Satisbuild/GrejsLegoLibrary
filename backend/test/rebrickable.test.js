import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRebrickableProvider } from '../src/services/catalog/providers/rebrickable.js';

/** Efterligner Rebrickable API v3's svarformat. */
function fakeFetch(routes, log = []) {
  return async (url, options) => {
    log.push({ url, auth: options.headers.Authorization });
    const path = url.replace('https://rebrickable.com/api/v3/lego', '');
    const route = routes[path];
    if (route === undefined) return new Response('{"detail":"Not found."}', { status: 404 });
    if (typeof route === 'number') return new Response('{}', { status: route });
    return new Response(JSON.stringify(route), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

const ROUTES = {
  '/sets/75192-1/': {
    set_num: '75192-1',
    name: 'Millennium Falcon',
    year: 2017,
    theme_id: 171,
    num_parts: 7541,
    set_img_url: 'https://cdn.rebrickable.com/media/sets/75192-1/10350.jpg',
    set_url: 'https://rebrickable.com/sets/75192-1/millennium-falcon/',
    last_modified_dt: '2024-01-01T00:00:00Z',
  },
  '/themes/171/': { id: 171, parent_id: 158, name: 'Ultimate Collector Series' },
  '/themes/158/': { id: 158, parent_id: null, name: 'Star Wars' },
  '/sets/75192-1/minifigs/?page_size=1000': {
    count: 2,
    results: [
      { set_num: 'fig-1', quantity: 1 },
      { set_num: 'fig-2', quantity: 3 },
    ],
  },
};

test('henter og mapper sæt, hovedtema og minifigurer', async () => {
  const log = [];
  const provider = createRebrickableProvider({ apiKey: 'nøgle', fetchImpl: fakeFetch(ROUTES, log) });
  const set = await provider.fetchSet('75192-1');
  assert.deepEqual(set, {
    setNumber: '75192-1',
    name: 'Millennium Falcon',
    theme: 'Star Wars',
    subtheme: 'Ultimate Collector Series',
    releaseYear: 2017,
    pieceCount: 7541,
    minifigureCount: 4,
    imageUrl: 'https://cdn.rebrickable.com/media/sets/75192-1/10350.jpg',
    description: null,
    instructionsUrl: null,
    sourceUrl: 'https://rebrickable.com/sets/75192-1/millennium-falcon/',
  });
  assert.ok(log.every((l) => l.auth === 'key nøgle'));

  // Temaer caches i hukommelsen
  const before = log.length;
  await provider.fetchSet('75192-1');
  assert.equal(log.length - before, 2);
});

test('returnerer null for ukendte sæt', async () => {
  const provider = createRebrickableProvider({ apiKey: 'k', fetchImpl: fakeFetch(ROUTES) });
  assert.equal(await provider.fetchSet('1-1'), null);
});

test('oversætter HTTP-fejl til CatalogError-koder', async () => {
  for (const [status, code] of [[429, 'RATE_LIMITED'], [401, 'AUTH_FAILED'], [500, 'UNAVAILABLE']]) {
    const provider = createRebrickableProvider({ apiKey: 'k', fetchImpl: fakeFetch({ '/sets/1-1/': status }) });
    await assert.rejects(provider.fetchSet('1-1'), (err) => err.code === code);
  }
  const offline = createRebrickableProvider({
    apiKey: 'k',
    fetchImpl: async () => {
      throw new TypeError('fetch failed');
    },
  });
  await assert.rejects(offline.fetchSet('1-1'), (err) => err.code === 'UNAVAILABLE');
});

test('er ikke konfigureret uden API-nøgle', () => {
  assert.equal(createRebrickableProvider({ apiKey: '' }).isConfigured(), false);
});
