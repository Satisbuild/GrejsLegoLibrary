import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { loadConfig } from '../src/config/env.js';
import { ensureIndexes } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import { CatalogError } from '../src/services/catalog/CatalogError.js';
import '../src/models/User.js';
import '../src/models/LegoSet.js';
import '../src/models/CollectionItem.js';
import '../src/models/WishlistItem.js';

export const FRONTEND_ORIGIN = 'https://frontend.example';
export const CSRF = { 'X-Requested-With': 'GrejsLegoLibrary' };

/**
 * Test-datakilde. Kun til automatiske tests – appen selv bruger altid en rigtig datakilde.
 * `sets` er en map fra kanonisk sætnummer til de data, datakilden skal returnere.
 */
export function createStubProvider(sets = {}) {
  const stub = {
    name: 'rebrickable',
    mode: 'ok', // 'ok' | 'unavailable' | 'rate_limited'
    calls: 0,
    configured: true,
    isConfigured: () => stub.configured,
    async fetchSet(setNumber) {
      stub.calls += 1;
      if (stub.mode === 'unavailable') throw new CatalogError('UNAVAILABLE', 'nede');
      if (stub.mode === 'rate_limited') throw new CatalogError('RATE_LIMITED', 'for mange');
      return sets[setNumber] ? { ...sets[setNumber] } : null;
    },
  };
  return stub;
}

export const FALCON = {
  setNumber: '75192-1',
  name: 'Millennium Falcon',
  theme: 'Star Wars',
  subtheme: 'Ultimate Collector Series',
  releaseYear: 2017,
  pieceCount: 7541,
  minifigureCount: 8,
  imageUrl: 'https://cdn.rebrickable.com/media/sets/75192-1/10350.jpg',
  description: null,
  instructionsUrl: null,
  sourceUrl: 'https://rebrickable.com/sets/75192-1/millennium-falcon/',
};

export const TECHNIC = {
  setNumber: '42115-1',
  name: 'Lamborghini Sián FKP 37',
  theme: 'Technic',
  subtheme: null,
  releaseYear: 2020,
  pieceCount: 3696,
  minifigureCount: 0,
  imageUrl: 'https://cdn.rebrickable.com/media/sets/42115-1/1.jpg',
  description: null,
  instructionsUrl: null,
  sourceUrl: null,
};

export async function startTestServer(envOverrides = {}) {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('gll-test'));
  await ensureIndexes();

  const config = loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: mongo.getUri('gll-test'),
    SESSION_SECRET: 'test-secret-test-secret-test-secret-123',
    FRONTEND_ORIGIN,
    LEGO_CATALOG_API_KEY: 'unused-in-tests',
    ...envOverrides,
  });

  const provider = createStubProvider({ '75192-1': FALCON, '42115-1': TECHNIC });
  const app = createApp({
    config,
    mongoClient: mongoose.connection.getClient(),
    catalogProvider: provider,
    disableRateLimits: true,
  });

  return {
    app,
    provider,
    config,
    async reset() {
      await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
      provider.mode = 'ok';
      provider.calls = 0;
      provider.configured = true;
    },
    async stop() {
      await mongoose.disconnect();
      await mongo.stop();
    },
  };
}

let counter = 0;

/** Opretter en bruger og returnerer en supertest-agent, der er logget ind. */
export async function registerUser(app, overrides = {}) {
  counter += 1;
  const agent = request.agent(app);
  const body = {
    username: `bruger${counter}`,
    email: `bruger${counter}@example.com`,
    password: 'KlodserErSjove123',
    confirmPassword: 'KlodserErSjove123',
    ...overrides,
  };
  const res = await agent.post('/api/auth/register').set(CSRF).send(body);
  if (res.status !== 201) throw new Error(`Registrering fejlede: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, user: res.body.data.user, credentials: body };
}
