import mongoose from 'mongoose';
import { loadConfig } from './config/env.js';
import { connectDatabase } from './config/db.js';
import { createApp } from './app.js';
import { logger } from './utils/logger.js';
// Registrér modellerne, så deres indexes oprettes ved opstart.
import './models/User.js';
import './models/LegoSet.js';
import './models/CollectionItem.js';
import './models/WishlistItem.js';

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    logger.error(err.message);
    process.exit(1);
  }

  try {
    await connectDatabase(config.mongodbUri, { dbName: config.mongoDbName });
  } catch (err) {
    logger.error(`Kunne ikke forbinde til MongoDB: ${err.name}`);
    process.exit(1); // systemd/Docker genstarter processen
  }

  const app = createApp({ config, mongoClient: mongoose.connection.getClient() });

  if (!config.catalog.apiKey && config.catalog.provider !== 'none') {
    logger.warn('LEGO_CATALOG_API_KEY er ikke sat – automatisk opslag af sæt er slået fra (manuel indtastning virker).');
  }

  const server = app.listen(config.port, () => {
    logger.info(`GrejsLegoLibrary API kører på port ${config.port} (${config.nodeEnv})`);
  });

  const shutdown = (signal) => {
    logger.info(`${signal} modtaget – lukker ned...`);
    server.close(async () => {
      await mongoose.disconnect().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
