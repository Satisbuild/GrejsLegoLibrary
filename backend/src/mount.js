/**
 * Monterer GrejsLegoLibrary i en anden Express-server under en sti (fx /lego),
 * så flere projekter kan dele én server og én MongoDB-forbindelsesstreng.
 *
 *   const lego = createLegoLibrary({ mongoUrl, mountPath: '/lego' });
 *   app.use('/lego', lego.handler);   // FØR værtens egne CORS-/body-middlewares
 *   lego.start();
 *
 * Konfiguration læses fra LEGO_*-miljøvariabler (se LEGO-API.md i værtsserveren).
 * Fejler konfigurationen eller databasen, svarer kun /lego med 503 – værtens
 * andre projekter påvirkes ikke, og forbindelsen forsøges igen hvert 10. sekund.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { loadConfig } from './config/env.js';
import { connectDatabase } from './config/db.js';
import { createApp } from './app.js';
import { logger } from './utils/logger.js';
import './models/User.js';
import './models/LegoSet.js';
import './models/CollectionItem.js';
import './models/WishlistItem.js';

const RETRY_MS = 10000;
const HOST_FRONTEND_DIR = fileURLToPath(new URL('../frontend', import.meta.url));

function buildEnv(mongoUrl, mountPath, env) {
  return {
    NODE_ENV: env.NODE_ENV,
    MONGODB_URI: mongoUrl,
    MONGODB_DB: env.LEGO_MONGO_DB || 'grejs-lego',
    SESSION_SECRET: env.LEGO_SESSION_SECRET,
    SESSION_MAX_AGE_DAYS: env.LEGO_SESSION_MAX_AGE_DAYS,
    // Siden serveres fra samme domæne; ekstra domæner (fx GitHub Pages) kan tilføjes her.
    FRONTEND_ORIGIN: env.LEGO_FRONTEND_ORIGIN,
    COOKIE_SAMESITE: env.LEGO_COOKIE_SAMESITE,
    COOKIE_SECURE: env.LEGO_COOKIE_SECURE,
    COOKIE_PATH: mountPath,
    TRUST_PROXY: env.LEGO_TRUST_PROXY || '1',
    SERVE_FRONTEND: 'true',
    // På værtsserveren ligger frontend/ ved siden af src/ (lego/frontend);
    // i GrejsLegoLibrary-repoet bruges standarden (../frontend fra backend/).
    FRONTEND_DIR: existsSync(HOST_FRONTEND_DIR) ? HOST_FRONTEND_DIR : undefined,
    LEGO_CATALOG_PROVIDER: env.LEGO_CATALOG_PROVIDER,
    LEGO_CATALOG_API_KEY: env.LEGO_CATALOG_API_KEY,
    CATALOG_CACHE_TTL_DAYS: env.LEGO_CATALOG_CACHE_TTL_DAYS,
  };
}

function unavailable(req, res, message) {
  res.status(503);
  if (req.path.startsWith('/api')) {
    res.json({ error: { code: 'SERVICE_UNAVAILABLE', message } });
  } else {
    res.type('text/plain; charset=utf-8').send(`GrejsLegoLibrary er midlertidigt utilgængelig. ${message}`);
  }
}

export function createLegoLibrary({ mongoUrl, mountPath = '/lego', env = process.env }) {
  let app = null;
  let configError = null;
  let config = null;

  try {
    config = loadConfig(buildEnv(mongoUrl, mountPath, env));
  } catch (err) {
    configError = err.message.replaceAll('SESSION_SECRET', 'LEGO_SESSION_SECRET')
      .replaceAll('FRONTEND_ORIGIN', 'LEGO_FRONTEND_ORIGIN')
      .replaceAll('COOKIE_', 'LEGO_COOKIE_');
  }

  function handler(req, res, next) {
    // /lego → /lego/, så relative links og API-kald peger det rigtige sted hen.
    if (req.url === '/' && !req.originalUrl.split('?')[0].endsWith('/')) {
      const query = req.originalUrl.slice(req.originalUrl.split('?')[0].length);
      return res.redirect(301, `${req.originalUrl.split('?')[0]}/${query}`);
    }
    if (configError) return unavailable(req, res, 'Serveren mangler konfiguration.');
    if (!app) return unavailable(req, res, 'Databasen er ikke klar endnu – prøv igen om lidt.');
    return app(req, res, next);
  }

  async function connectOnce() {
    await connectDatabase(config.mongodbUri, { dbName: config.mongoDbName });
    app = createApp({ config, mongoClient: mongoose.connection.getClient() });
    if (!config.catalog.apiKey && config.catalog.provider !== 'none') {
      logger.warn('[lego] LEGO_CATALOG_API_KEY er ikke sat – kun manuel indtastning af sæt.');
    }
    logger.info(`[lego] GrejsLegoLibrary kører under ${mountPath}/`);
  }

  function start() {
    if (configError) {
      logger.error(`[lego] Starter ikke: ${configError}`);
      return;
    }
    connectOnce().catch((err) => {
      logger.error(`[lego] Kunne ikke forbinde til MongoDB (${err.name}). Prøver igen om ${RETRY_MS / 1000} s.`);
      setTimeout(start, RETRY_MS).unref();
    });
  }

  async function stop() {
    await mongoose.disconnect().catch(() => {});
  }

  return { handler, start, stop };
}
