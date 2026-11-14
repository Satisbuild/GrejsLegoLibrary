import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import helmet from 'helmet';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiRouter } from './routes/index.js';
import { csrfProtection, CSRF_HEADER } from './middleware/csrf.js';
import { createRateLimiters } from './middleware/rateLimits.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createCatalogService, createProviderFromConfig } from './services/catalog/index.js';
import { logger } from './utils/logger.js';

const SESSION_COOKIE_NAME = 'gll.sid';
const FRONTEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend');

/**
 * Opretter Express-appen.
 * @param {object} options
 * @param {object} options.config        resultatet af loadConfig()
 * @param {import('mongodb').MongoClient} options.mongoClient  forbundet klient (til sessioner)
 * @param {object} [options.catalogProvider]  udskift datakilden (bruges fx i tests)
 * @param {boolean} [options.disableRateLimits]
 */
export function createApp({ config, mongoClient, catalogProvider, disableRateLimits = false }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  const catalog = createCatalogService({
    provider: catalogProvider ?? createProviderFromConfig(config.catalog),
    cacheTtlDays: config.catalog.cacheTtlDays,
  });
  const limiters = createRateLimiters({ disabled: disableRateLimits });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'https:', 'data:'],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  if (!config.isTest) {
    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`));
      next();
    });
  }

  // CORS: kun det konfigurerede frontend-domæne må kalde API'et med cookies.
  const corsMiddleware = cors({
    origin(origin, cb) {
      if (!origin) return cb(null, false);
      cb(null, config.frontendOrigins.includes(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', CSRF_HEADER],
    maxAge: 600,
  });

  const cookieOptions = {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    maxAge: config.sessionMaxAgeDays * 24 * 60 * 60 * 1000,
    path: '/',
  };

  const api = express.Router();
  api.use(corsMiddleware);
  api.use(limiters.api);
  api.use(express.json({ limit: '50kb' }));
  api.use(
    session({
      name: SESSION_COOKIE_NAME,
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      proxy: Boolean(config.trustProxy),
      cookie: cookieOptions,
      store: MongoStore.create({
        client: mongoClient,
        collectionName: 'sessions',
        ttl: config.sessionMaxAgeDays * 24 * 60 * 60,
        touchAfter: 60 * 60,
      }),
    }),
  );
  api.use(csrfProtection(config.frontendOrigins));
  api.use(createApiRouter({ catalog, limiters, sessionCookieName: SESSION_COOKIE_NAME, cookieOptions }));
  api.use(notFoundHandler);

  app.use('/api', api);

  // Valgfrit: server frontend fra samme proces (praktisk til lokal udvikling).
  if (config.serveFrontend) {
    app.use(express.static(FRONTEND_DIR, { extensions: ['html'] }));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
