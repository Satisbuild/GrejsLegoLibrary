import mongoose from 'mongoose';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

const DB_UNAVAILABLE_ERRORS = new Set([
  'MongoServerSelectionError',
  'MongooseServerSelectionError',
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoNotConnectedError',
  'MongoTopologyClosedError',
]);

function isDatabaseUnavailable(err) {
  if (DB_UNAVAILABLE_ERRORS.has(err?.name)) return true;
  // Mongoose: "Operation `x.find()` buffering timed out after 5000ms"
  return err instanceof mongoose.Error && /buffering timed out/i.test(err.message);
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpointet findes ikke.' } });
}

/**
 * Sender ensartede JSON-fejl. Interne detaljer, stack traces og databaseoplysninger
 * sendes aldrig til browseren.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let status = 500;
  let body = { code: 'INTERNAL_ERROR', message: 'Der opstod en uventet fejl. Prøv igen senere.' };

  if (err instanceof AppError) {
    status = err.status;
    body = { code: err.code, message: err.message };
    if (err.details) body.details = err.details;
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    body = { code: 'INVALID_JSON', message: 'Anmodningen indeholder ugyldig JSON.' };
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    body = { code: 'PAYLOAD_TOO_LARGE', message: 'Anmodningen er for stor.' };
  } else if (err?.code === 11000) {
    status = 409;
    body = { code: 'DUPLICATE', message: 'Posten findes allerede.' };
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    body = { code: 'VALIDATION_ERROR', message: 'Ugyldige oplysninger.' };
  } else if (err instanceof mongoose.Error.CastError) {
    status = 404;
    body = { code: 'NOT_FOUND', message: 'Ressourcen blev ikke fundet.' };
  } else if (isDatabaseUnavailable(err)) {
    status = 503;
    body = {
      code: 'DATABASE_UNAVAILABLE',
      message: 'Databasen er midlertidigt utilgængelig. Prøv igen om lidt.',
    };
  }

  if (status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} -> ${status}:`, err?.stack || err);
  }

  if (res.headersSent) return;
  res.status(status).json({ error: body });
}
