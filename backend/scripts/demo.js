// Lokal demo UDEN installeret MongoDB: starter en midlertidig MongoDB i hukommelsen
// og serverer frontend på http://localhost:3000. Alle data forsvinder, når den stoppes.
// Kun til afprøvning – brug `npm run dev` med en rigtig MONGODB_URI til alt andet.
import { randomBytes } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongo = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongo.getUri('grejslegolibrary');
process.env.SESSION_SECRET ||= randomBytes(32).toString('hex');
process.env.SERVE_FRONTEND ||= 'true';
process.env.NODE_ENV ||= 'development';

const stop = () => mongo.stop().finally(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

console.log('Demo-tilstand: midlertidig database i hukommelsen – data gemmes ikke.');
console.log('Åbn http://localhost:3000 i browseren.');
await import('../src/server.js');
