import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { LegoSet } from '../src/models/LegoSet.js';
import { User } from '../src/models/User.js';
import { CSRF, FRONTEND_ORIGIN, registerUser, startTestServer } from './helpers.js';
import { normalizeSetNumber } from '../src/utils/setNumber.js';

let server;
let app;

before(async () => {
  server = await startTestServer();
  app = server.app;
});
after(async () => server.stop());
beforeEach(async () => server.reset());

describe('grundstruktur', () => {
  test('health-check svarer ok', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.database, 'connected');
  });

  test('ukendt endpoint giver JSON 404', async () => {
    const res = await request(app).get('/api/findes-ikke');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });

  test('normaliserer sætnumre', () => {
    assert.equal(normalizeSetNumber('75192'), '75192-1');
    assert.equal(normalizeSetNumber(' 75192-01 '), '75192-1');
    assert.equal(normalizeSetNumber('K34431'), 'k34431-1');
    assert.equal(normalizeSetNumber('75192-0'), null);
    assert.equal(normalizeSetNumber('../etc'), null);
    assert.equal(normalizeSetNumber(''), null);
  });
});

describe('sikkerhed', () => {
  test('afviser ændrende requests uden CSRF-header', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.dk', password: 'x' });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'CSRF_REJECTED');
  });

  test('afviser requests fra fremmede origins', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set(CSRF)
      .set('Origin', 'https://ond.example')
      .send({ email: 'a@b.dk', password: 'x' });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'ORIGIN_REJECTED');
  });

  test('CORS tillader kun frontend-domænet', async () => {
    const ok = await request(app)
      .options('/api/auth/login')
      .set('Origin', FRONTEND_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-requested-with');
    assert.equal(ok.headers['access-control-allow-origin'], FRONTEND_ORIGIN);
    assert.equal(ok.headers['access-control-allow-credentials'], 'true');

    const bad = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'https://ond.example')
      .set('Access-Control-Request-Method', 'POST');
    assert.equal(bad.headers['access-control-allow-origin'], undefined);
  });

  test('session-cookien er HttpOnly', async () => {
    const res = await request(app).post('/api/auth/register').set(CSRF).send({
      username: 'cookietest',
      email: 'cookie@example.com',
      password: 'KlodserErSjove123',
      confirmPassword: 'KlodserErSjove123',
    });
    const cookie = res.headers['set-cookie'].join(';');
    assert.match(cookie, /gll\.sid=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
  });

  test('ugyldig JSON giver pæn fejl uden stack trace', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set(CSRF)
      .set('Content-Type', 'application/json')
      .send('{"email":');
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_JSON');
    assert.ok(!JSON.stringify(res.body).includes('at '));
  });
});

describe('brugerkonti', () => {
  test('1. ny bruger kan oprette en konto, og adgangskoden hashes', async () => {
    const { user } = await registerUser(app, { username: 'Grej', email: 'Grej@Example.com' });
    assert.equal(user.username, 'Grej');
    assert.equal(user.email, 'grej@example.com');
    assert.equal(user.passwordHash, undefined);

    const stored = await User.findOne({ email: 'grej@example.com' }).select('+passwordHash');
    assert.match(stored.passwordHash, /^\$argon2id\$/);
    assert.ok(!stored.passwordHash.includes('KlodserErSjove123'));
  });

  test('e-mail og brugernavn skal være unikke (uden hensyn til store/små bogstaver)', async () => {
    await registerUser(app, { username: 'Grej', email: 'grej@example.com' });
    const dupEmail = await request(app).post('/api/auth/register').set(CSRF).send({
      username: 'andenbruger',
      email: 'GREJ@example.com',
      password: 'KlodserErSjove123',
      confirmPassword: 'KlodserErSjove123',
    });
    assert.equal(dupEmail.status, 409);
    assert.equal(dupEmail.body.error.details[0].field, 'email');

    const dupName = await request(app).post('/api/auth/register').set(CSRF).send({
      username: 'gREJ',
      email: 'ny@example.com',
      password: 'KlodserErSjove123',
      confirmPassword: 'KlodserErSjove123',
    });
    assert.equal(dupName.status, 409);
    assert.equal(dupName.body.error.details[0].field, 'username');
  });

  test('validerer e-mail, adgangskodestyrke og gentagelse', async () => {
    const cases = [
      [{ email: 'ikke-en-mail' }, 'email'],
      [{ password: 'kort1', confirmPassword: 'kort1' }, 'password'],
      [{ password: 'barebogstaverher', confirmPassword: 'barebogstaverher' }, 'password'],
      [{ confirmPassword: 'Noget4ndet12345' }, 'confirmPassword'],
      [{ username: 'a' }, 'username'],
    ];
    for (const [override, field] of cases) {
      const res = await request(app).post('/api/auth/register').set(CSRF).send({
        username: 'gyldig',
        email: 'gyldig@example.com',
        password: 'KlodserErSjove123',
        confirmPassword: 'KlodserErSjove123',
        ...override,
      });
      assert.equal(res.status, 400, JSON.stringify(override));
      assert.ok(res.body.error.details.some((d) => d.field === field), `${field}: ${JSON.stringify(res.body)}`);
    }
  });

  test('2. bruger kan logge ind og ud', async () => {
    const { credentials } = await registerUser(app);
    const agent = request.agent(app);

    const wrong = await agent.post('/api/auth/login').set(CSRF).send({ email: credentials.email, password: 'forkert123456' });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.error.message, 'Forkert e-mail eller adgangskode.');

    const unknown = await agent.post('/api/auth/login').set(CSRF).send({ email: 'ingen@example.com', password: 'forkert123456' });
    assert.equal(unknown.status, 401);
    assert.equal(unknown.body.error.message, wrong.body.error.message);

    const login = await agent.post('/api/auth/login').set(CSRF).send({ email: credentials.email.toUpperCase(), password: credentials.password });
    assert.equal(login.status, 200);

    assert.equal((await agent.get('/api/auth/me')).status, 200);
    assert.equal((await agent.post('/api/auth/logout').set(CSRF)).status, 200);
    assert.equal((await agent.get('/api/auth/me')).status, 401);
  });

  test('beskyttede endpoints kræver login', async () => {
    for (const path of ['/api/collection', '/api/wishlist', '/api/dashboard', '/api/sets/75192', '/api/auth/me']) {
      const res = await request(app).get(path);
      assert.equal(res.status, 401, path);
    }
  });

  test('ændring af adgangskode logger andre sessioner ud', async () => {
    const { agent, credentials } = await registerUser(app);
    const other = request.agent(app);
    await other.post('/api/auth/login').set(CSRF).send({ email: credentials.email, password: credentials.password });
    assert.equal((await other.get('/api/auth/me')).status, 200);

    const badCurrent = await agent.post('/api/auth/change-password').set(CSRF).send({
      currentPassword: 'forkert1234567',
      newPassword: 'NyAdgangskode456',
      confirmPassword: 'NyAdgangskode456',
    });
    assert.equal(badCurrent.status, 400);

    const changed = await agent.post('/api/auth/change-password').set(CSRF).send({
      currentPassword: credentials.password,
      newPassword: 'NyAdgangskode456',
      confirmPassword: 'NyAdgangskode456',
    });
    assert.equal(changed.status, 200);
    assert.equal((await agent.get('/api/auth/me')).status, 200, 'den aktuelle session forbliver logget ind');
    assert.equal((await other.get('/api/auth/me')).status, 401, 'andre sessioner logges ud');

    const fresh = request.agent(app);
    const oldPw = await fresh.post('/api/auth/login').set(CSRF).send({ email: credentials.email, password: credentials.password });
    assert.equal(oldPw.status, 401);
    const newPw = await fresh.post('/api/auth/login').set(CSRF).send({ email: credentials.email, password: 'NyAdgangskode456' });
    assert.equal(newPw.status, 200);
  });
});

describe('LEGO-katalog', () => {
  test('4. opslag på 75192 finder Millennium Falcon og cacher resultatet', async () => {
    const { agent } = await registerUser(app);
    const first = await agent.get('/api/sets/75192');
    assert.equal(first.status, 200);
    assert.equal(first.body.data.set.name, 'Millennium Falcon');
    assert.equal(first.body.data.set.theme, 'Star Wars');
    assert.equal(first.body.data.set.setNumber, '75192-1');
    assert.equal(first.body.data.cache, 'fetched');

    const second = await agent.get('/api/sets/75192-1');
    assert.equal(second.body.data.cache, 'hit');
    assert.equal(server.provider.calls, 1);
  });

  test('forældet cache opdateres, og bruges som fallback når datakilden er nede', async () => {
    const { agent } = await registerUser(app);
    await agent.get('/api/sets/75192');
    await LegoSet.updateOne({ setNumber: '75192-1' }, { lastFetchedAt: new Date('2000-01-01') });

    server.provider.mode = 'unavailable';
    const stale = await agent.get('/api/sets/75192');
    assert.equal(stale.status, 200);
    assert.equal(stale.body.data.cache, 'stale');
    assert.ok(stale.body.data.warning);

    server.provider.mode = 'ok';
    const refreshed = await agent.get('/api/sets/75192');
    assert.equal(refreshed.body.data.cache, 'fetched');
  });

  test('ukendt, ugyldigt og utilgængeligt opslag giver forståelige fejl', async () => {
    const { agent } = await registerUser(app);
    const missing = await agent.get('/api/sets/99999');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'SET_NOT_FOUND');
    assert.equal(await LegoSet.countDocuments(), 0, 'der må ikke opfindes oplysninger');

    const invalid = await agent.get('/api/sets/abc%20def');
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error.code, 'INVALID_SET_NUMBER');

    server.provider.mode = 'unavailable';
    const down = await agent.get('/api/sets/42115');
    assert.equal(down.status, 503);
    assert.equal(down.body.error.code, 'CATALOG_UNAVAILABLE');

    server.provider.mode = 'rate_limited';
    const limited = await agent.get('/api/sets/42115');
    assert.equal(limited.status, 503);
    assert.equal(limited.body.error.code, 'CATALOG_RATE_LIMITED');

    server.provider.configured = false;
    const noKey = await agent.get('/api/sets/42115');
    assert.equal(noKey.body.error.code, 'CATALOG_NOT_CONFIGURED');
  });

  test('sæt kan indtastes manuelt, når de ikke findes i kataloget', async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);

    const created = await a.agent.post('/api/sets').set(CSRF).send({
      setNumber: '99999',
      name: 'Hjemmebygget borg',
      theme: 'Castle',
      releaseYear: 2024,
      pieceCount: '1200',
      imageUrl: '',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.set.source, 'manual');
    assert.equal(created.body.data.set.pieceCount, 1200);

    const badUrl = await a.agent.post('/api/sets').set(CSRF).send({ setNumber: '99998', name: 'X', imageUrl: 'javascript:alert(1)' });
    assert.equal(badUrl.status, 400);

    const otherUser = await b.agent.post('/api/sets').set(CSRF).send({ setNumber: '99999', name: 'Overskrevet' });
    assert.equal(otherUser.status, 409);

    const lookup = await b.agent.get('/api/sets/99999');
    assert.equal(lookup.status, 200);
    assert.equal(lookup.body.data.cache, 'manual');
    assert.equal(lookup.body.data.set.name, 'Hjemmebygget borg');

    await a.agent.get('/api/sets/75192');
    const catalogSet = await a.agent.post('/api/sets').set(CSRF).send({ setNumber: '75192', name: 'Falsk navn' });
    assert.equal(catalogSet.status, 409);
  });
});

describe('samling', () => {
  test('5–7. tilføj, flere eksemplarer, redigér og fjern', async () => {
    const { agent } = await registerUser(app);

    const add = await agent.post('/api/collection').set(CSRF).send({
      setNumber: '75192',
      quantity: 1,
      condition: 'new',
      hasBox: true,
      hasInstructions: true,
      purchaseDate: '2023-11-24',
      purchasePrice: '5999,95',
      notes: 'Black Friday',
    });
    assert.equal(add.status, 201, JSON.stringify(add.body));
    const item = add.body.data.item;
    assert.equal(item.set.name, 'Millennium Falcon');
    assert.equal(item.purchasePrice, 5999.95);

    const dup = await agent.post('/api/collection').set(CSRF).send({ setNumber: '75192' });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'ALREADY_IN_COLLECTION');

    const merged = await agent.post('/api/collection').set(CSRF).send({ setNumber: '75192', quantity: 2, duplicateMode: 'merge' });
    assert.equal(merged.status, 200);
    assert.equal(merged.body.data.item.quantity, 3);

    const separate = await agent.post('/api/collection').set(CSRF).send({ setNumber: '75192', condition: 'used', duplicateMode: 'separate' });
    assert.equal(separate.status, 201);

    const list = await agent.get('/api/collection');
    assert.equal(list.body.data.items.length, 2);
    assert.equal(list.body.data.stats.uniqueSets, 1);
    assert.equal(list.body.data.stats.totalCopies, 4);

    const patch = await agent.patch(`/api/collection/${item.id}`).set(CSRF).send({ quantity: 5, condition: 'opened', notes: 'Bygget' });
    assert.equal(patch.status, 200);
    assert.equal(patch.body.data.item.quantity, 5);
    assert.equal(patch.body.data.item.condition, 'opened');

    const badPatch = await agent.patch(`/api/collection/${item.id}`).set(CSRF).send({ quantity: 0 });
    assert.equal(badPatch.status, 400);
    const forbiddenField = await agent.patch(`/api/collection/${item.id}`).set(CSRF).send({ userId: '000000000000000000000000' });
    assert.equal(forbiddenField.status, 400);

    const del = await agent.delete(`/api/collection/${item.id}`).set(CSRF);
    assert.equal(del.status, 200);
    assert.equal((await agent.get(`/api/collection/${item.id}`)).status, 404);
    assert.equal((await agent.get('/api/collection')).body.data.items.length, 1);
  });

  test('ukendt sæt kan ikke tilføjes', async () => {
    const { agent } = await registerUser(app);
    const res = await agent.post('/api/collection').set(CSRF).send({ setNumber: '99999' });
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'SET_NOT_FOUND');
  });
});

describe('ønskeliste', () => {
  test('8–10. tilføj, redigér prioritet/pris og flyt til samlingen', async () => {
    const { agent } = await registerUser(app);

    const add = await agent.post('/api/wishlist').set(CSRF).send({ setNumber: '42115', priority: 'high', targetPrice: 2500, notes: 'Fødselsdag' });
    assert.equal(add.status, 201, JSON.stringify(add.body));
    const wish = add.body.data.item;
    assert.equal(wish.set.theme, 'Technic');

    const dup = await agent.post('/api/wishlist').set(CSRF).send({ setNumber: '42115-1' });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'ALREADY_ON_WISHLIST');

    const patch = await agent.patch(`/api/wishlist/${wish.id}`).set(CSRF).send({ priority: 'low', targetPrice: 2100 });
    assert.equal(patch.body.data.item.priority, 'low');
    assert.equal(patch.body.data.item.targetPrice, 2100);

    const moved = await agent.post(`/api/wishlist/${wish.id}/mark-purchased`).set(CSRF).send({
      moveToCollection: true,
      collection: { quantity: 1, purchasePrice: 2199, purchaseDate: '2024-06-01', condition: 'new', hasBox: true },
    });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(moved.body.data.moved, true);
    assert.equal(moved.body.data.collectionItem.notes, 'Fødselsdag');

    assert.equal((await agent.get('/api/wishlist')).body.data.items.length, 0);
    const coll = (await agent.get('/api/collection')).body.data.items;
    assert.equal(coll.length, 1);
    assert.equal(coll[0].setNumber, '42115-1');
    assert.equal(coll[0].purchasePrice, 2199);
  });

  test('markér som købt uden at flytte', async () => {
    const { agent } = await registerUser(app);
    const wish = (await agent.post('/api/wishlist').set(CSRF).send({ setNumber: '75192' })).body.data.item;
    const res = await agent.post(`/api/wishlist/${wish.id}/mark-purchased`).set(CSRF).send({ moveToCollection: false });
    assert.equal(res.body.data.wishlistItem.status, 'purchased');
    assert.ok(res.body.data.wishlistItem.purchasedAt);
    assert.equal((await agent.get('/api/collection')).body.data.items.length, 0);
  });

  test('flytning til samling respekterer dubletter', async () => {
    const { agent } = await registerUser(app);
    await agent.post('/api/collection').set(CSRF).send({ setNumber: '75192' });
    const wish = (await agent.post('/api/wishlist').set(CSRF).send({ setNumber: '75192' })).body.data.item;

    const conflict = await agent.post(`/api/wishlist/${wish.id}/mark-purchased`).set(CSRF).send({ moveToCollection: true });
    assert.equal(conflict.status, 409);
    assert.equal((await agent.get('/api/wishlist')).body.data.items.length, 1, 'ønsket må ikke forsvinde ved fejl');

    const merged = await agent.post(`/api/wishlist/${wish.id}/mark-purchased`).set(CSRF).send({
      moveToCollection: true,
      collection: { duplicateMode: 'merge' },
    });
    assert.equal(merged.status, 200);
    assert.equal(merged.body.data.collectionItem.quantity, 2);
  });
});

describe('brugeradskillelse', () => {
  test('3. en bruger kan ikke se eller ændre en anden brugers data', async () => {
    const alice = await registerUser(app);
    const bob = await registerUser(app);

    const aItem = (await alice.agent.post('/api/collection').set(CSRF).send({ setNumber: '75192' })).body.data.item;
    const aWish = (await alice.agent.post('/api/wishlist').set(CSRF).send({ setNumber: '42115' })).body.data.item;

    assert.equal((await bob.agent.get('/api/collection')).body.data.items.length, 0);
    assert.equal((await bob.agent.get('/api/wishlist')).body.data.items.length, 0);

    for (const [method, path, body] of [
      ['get', `/api/collection/${aItem.id}`],
      ['patch', `/api/collection/${aItem.id}`, { quantity: 9 }],
      ['delete', `/api/collection/${aItem.id}`],
      ['get', `/api/wishlist/${aWish.id}`],
      ['patch', `/api/wishlist/${aWish.id}`, { priority: 'low' }],
      ['delete', `/api/wishlist/${aWish.id}`],
      ['post', `/api/wishlist/${aWish.id}/mark-purchased`, { moveToCollection: true }],
    ]) {
      const res = await bob.agent[method](path).set(CSRF).send(body);
      assert.equal(res.status, 404, `${method} ${path}`);
    }

    // Et userId i body ignoreres – posten tilhører altid den indloggede bruger.
    const sneaky = await bob.agent.post('/api/collection').set(CSRF).send({ setNumber: '42115', userId: alice.user.id });
    assert.equal(sneaky.status, 201);
    assert.equal((await alice.agent.get('/api/collection')).body.data.items.length, 1);

    const aliceStill = await alice.agent.get(`/api/collection/${aItem.id}`);
    assert.equal(aliceStill.body.data.item.quantity, 1);
    assert.equal((await alice.agent.get('/api/wishlist')).body.data.items.length, 1);
  });
});

describe('dashboard', () => {
  test('11–12. statistik passer med data og overlever nyt login', async () => {
    const { agent, credentials, user } = await registerUser(app);
    await agent.post('/api/collection').set(CSRF).send({ setNumber: '75192', quantity: 2, purchasePrice: 5000 });
    await agent.post('/api/collection').set(CSRF).send({ setNumber: '42115', quantity: 1 });
    await agent.post('/api/sets').set(CSRF).send({ setNumber: '99999', name: 'Ukendt antal klodser' });
    await agent.post('/api/collection').set(CSRF).send({ setNumber: '99999' });
    await agent.post('/api/wishlist').set(CSRF).send({ setNumber: '75192', priority: 'low' });
    await agent.post('/api/wishlist').set(CSRF).send({ setNumber: '42115', priority: 'high' });

    await agent.post('/api/auth/logout').set(CSRF);
    const again = request.agent(app);
    await again.post('/api/auth/login').set(CSRF).send({ email: credentials.email, password: credentials.password });

    const res = await again.get('/api/dashboard');
    assert.equal(res.status, 200);
    const d = res.body.data;
    assert.equal(d.user.username, user.username);
    assert.equal(d.collection.uniqueSets, 3);
    assert.equal(d.collection.totalCopies, 4);
    assert.equal(d.collection.totalPieces, 7541 * 2 + 3696);
    assert.equal(d.collection.piecesComplete, false);
    assert.equal(d.collection.itemsMissingPieces, 1);
    assert.equal(d.collection.totalPurchaseValue, 10000);
    assert.equal(d.collection.itemsMissingPrice, 2);
    assert.deepEqual(
      d.collection.themes.map((t) => [t.theme, t.copies]),
      [['Star Wars', 2], [null, 1], ['Technic', 1]],
    );
    assert.equal(d.wishlist.total, 2);
    assert.equal(d.recentCollection.length, 3);
    assert.equal(d.topWishes[0].set.theme, 'Technic', 'høj prioritet først');
  });
});
