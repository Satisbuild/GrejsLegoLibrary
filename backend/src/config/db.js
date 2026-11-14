import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

mongoose.set('strictQuery', true);
// Fejl hurtigt i stedet for at vente længe, hvis databasen er nede.
mongoose.set('bufferTimeoutMS', 5000);

/** Fjerner brugernavn/adgangskode fra en forbindelsesstreng, så den kan logges. */
export function redactMongoUri(uri) {
  try {
    const u = new URL(uri);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return '<ugyldig MONGODB_URI>';
  }
}

export async function connectDatabase(uri) {
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB-forbindelsen blev afbrudt.'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB-forbindelsen er genoprettet.'));
  mongoose.connection.on('error', (err) => logger.error('MongoDB-fejl:', err.message));

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  logger.info(`Forbundet til MongoDB (${redactMongoUri(uri)})`);
  await ensureIndexes();
  return mongoose.connection;
}

/** Sørger for at alle indexes (inkl. unikke) findes, før serveren tager imod trafik. */
export async function ensureIndexes() {
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
}

export function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}
