// Kopierer GrejsLegoLibrary ind i en delt Express-server (fx Satisbuild/Backend),
// hvor den monteres under /lego. Kør efter ændringer her, og commit så værtsrepoet.
//
//   node scripts/copy-to-server.mjs "C:/Users/<dig>/Desktop/Codening/Backend"
//
// Kopierer: backend/src, backend/package.json + package-lock.json og frontend/ til <server>/lego/.
// Værtens egne filer (lego/loader.cjs, LEGO-API.md, server.js) røres ikke.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target = process.argv[2];
if (!target || !existsSync(path.join(target, 'server.js'))) {
  console.error('Brug: node scripts/copy-to-server.mjs <sti til serverens repo (mappen med server.js)>');
  process.exit(1);
}

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoDir = path.resolve(backendDir, '..');
const dest = path.join(target, 'lego');
mkdirSync(dest, { recursive: true });

for (const dir of ['src', 'frontend']) rmSync(path.join(dest, dir), { recursive: true, force: true });
cpSync(path.join(backendDir, 'src'), path.join(dest, 'src'), { recursive: true });
cpSync(path.join(repoDir, 'frontend'), path.join(dest, 'frontend'), { recursive: true });
for (const f of ['package.json', 'package-lock.json']) cpSync(path.join(backendDir, f), path.join(dest, f));

console.log(`Kopieret til ${dest}`);
console.log('Kør derefter "npm install" i lego/-mappen, hvis package.json er ændret.');
