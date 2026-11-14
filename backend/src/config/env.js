import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Indlæser backend/.env (hvis den findes). Variabler sat i miljøet har forrang.
dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env'),
  quiet: true,
});

/**
 * Samler og validerer al konfiguration fra miljøvariabler.
 * Ingen hemmeligheder må have standardværdier i koden.
 */

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function int(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseTrustProxy(value) {
  if (value === undefined || value === '') return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  const n = Number(value);
  return Number.isInteger(n) ? n : value; // fx "loopback" eller en IP/subnet-liste
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  const frontendOrigins = (env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const sameSite = (env.COOKIE_SAMESITE || 'lax').toLowerCase();

  const config = {
    nodeEnv,
    isProduction,
    isTest: nodeEnv === 'test',
    port: int(env.PORT, 3000),
    mongodbUri: env.MONGODB_URI || '',
    sessionSecret: env.SESSION_SECRET || '',
    sessionMaxAgeDays: int(env.SESSION_MAX_AGE_DAYS, 14),
    frontendOrigins,
    cookieSameSite: sameSite,
    cookieSecure: bool(env.COOKIE_SECURE, isProduction),
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    serveFrontend: bool(env.SERVE_FRONTEND, false),
    catalog: {
      provider: (env.LEGO_CATALOG_PROVIDER || 'rebrickable').toLowerCase(),
      apiKey: env.LEGO_CATALOG_API_KEY || '',
      cacheTtlDays: int(env.CATALOG_CACHE_TTL_DAYS, 30),
      requestTimeoutMs: int(env.CATALOG_TIMEOUT_MS, 8000),
    },
  };

  const errors = [];
  if (!config.mongodbUri) errors.push('MONGODB_URI mangler.');
  if (!config.sessionSecret) errors.push('SESSION_SECRET mangler.');
  if (isProduction && config.sessionSecret.length < 32) {
    errors.push('SESSION_SECRET skal være mindst 32 tegn i produktion.');
  }
  if (!['lax', 'strict', 'none'].includes(sameSite)) {
    errors.push('COOKIE_SAMESITE skal være lax, strict eller none.');
  }
  if (sameSite === 'none' && !config.cookieSecure) {
    errors.push('COOKIE_SAMESITE=none kræver COOKIE_SECURE=true (HTTPS).');
  }
  if (isProduction && frontendOrigins.length === 0) {
    errors.push('FRONTEND_ORIGIN skal sættes i produktion.');
  }

  if (errors.length) {
    const err = new Error(`Ugyldig konfiguration:\n - ${errors.join('\n - ')}`);
    err.code = 'CONFIG_ERROR';
    throw err;
  }

  return config;
}
