# GrejsLegoLibrary

Et personligt LEGO-bibliotek: opret en konto, slå sæt op via sætnummer (fx `75192` → *Millennium Falcon*), og hold styr på din **samling** og din **ønskeliste**. Alle data gemmes i MongoDB via en Node.js-backend.

- **Frontend:** statisk HTML/CSS/JavaScript (ES-moduler, intet build-trin). Kan hostes på GitHub Pages.
- **Backend:** Node.js + Express + Mongoose. Kører som en separat serverproces (VPS, Docker o.l.).
- **Database:** MongoDB.
- **LEGO-data:** [Rebrickable API v3](https://rebrickable.com/api/v3/docs/) med cache i MongoDB. Datakilden kan udskiftes.

## Indhold

1. [Projektstruktur](#projektstruktur)
2. [Lokal udvikling](#lokal-udvikling)
3. [Miljøvariabler](#miljøvariabler)
4. [LEGO-katalog (Rebrickable)](#lego-katalog-rebrickable)
5. [Tests](#tests)
6. [Deployment](#deployment)
7. [Backup og opdatering](#backup-og-opdatering)
8. [API-oversigt](#api-oversigt)
9. [Sikkerhed](#sikkerhed)
10. [Kendte begrænsninger](#kendte-begrænsninger)

## Projektstruktur

```text
GrejsLegoLibrary/
├── frontend/                  Statisk website (publiceres til GitHub Pages)
│   ├── index.html, login.html, register.html
│   ├── dashboard.html, collection.html, wishlist.html, profile.html
│   └── assets/
│       ├── css/style.css
│       ├── images/            logo og favicon
│       └── js/
│           ├── config.js      API_BASE_URL (overskrives ved deployment)
│           ├── api.js         fetch-wrapper (cookies + CSRF-header)
│           ├── ui.js, layout.js, forms.js, set-lookup.js, set-card.js, list-tools.js
│           └── pages/         ét script pr. side
├── backend/
│   ├── src/
│   │   ├── config/            miljøvariabler og MongoDB-forbindelse
│   │   ├── models/            User, LegoSet, CollectionItem, WishlistItem
│   │   ├── controllers/       auth, sets, collection, wishlist, dashboard
│   │   ├── routes/            alle /api-ruter
│   │   ├── middleware/        login, CSRF, rate limiting, fejlhåndtering
│   │   ├── services/          katalog (+ datakilder), statistik, ejerskab
│   │   ├── validators/        inputvalidering (zod)
│   │   ├── app.js             Express-app
│   │   └── server.js          startpunkt
│   ├── test/                  automatiske tests (node:test + in-memory MongoDB)
│   ├── .env.example
│   ├── Dockerfile
│   └── package.json
├── deploy/                    systemd-service og nginx-eksempel
├── .github/workflows/         GitHub Pages-deployment af frontend
└── index.html                 viderestilling til frontend/ (hvis repo-roden publiceres)
```

## Lokal udvikling

**Hurtig afprøvning uden MongoDB:**

```bash
cd backend
npm install
npm run demo    # åbn derefter http://localhost:3000
```

`npm run demo` starter en midlertidig database i hukommelsen. Alle konti og sæt forsvinder, når serveren stoppes, så brug kun demoen til at prøve siden af.

> Åbner du HTML-filerne direkte (dobbeltklik eller Live Server) uden en kørende backend, kan man hverken oprette en konto eller logge ind. Siden viser så "Kan ikke få kontakt til GrejsLegoLibrary-serveren".

**Rigtig opsætning – krav:** Node.js 20.11 eller nyere og en MongoDB-database.

Har du ikke MongoDB lokalt, kan du fx bruge Docker: `docker run -d --name gll-mongo -p 27017:27017 mongo:7`. Du kan også bruge en MongoDB Community-installation eller en gratis MongoDB Atlas-klynge.

```bash
cd backend
npm install
cp .env.example .env       # Windows PowerShell: Copy-Item .env.example .env
```

Redigér `backend/.env`. Til lokal udvikling er det nok at sætte:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/GrejsLegoLibrary
SESSION_SECRET=<lang tilfældig streng>
FRONTEND_ORIGIN=http://localhost:3000
SERVE_FRONTEND=true
LEGO_CATALOG_API_KEY=<din Rebrickable-nøgle, eller tom>
```

Start serveren:

```bash
npm run dev     # genstarter automatisk ved ændringer
# eller
npm start
```

Åbn **http://localhost:3000**. Med `SERVE_FRONTEND=true` serverer backend også frontend, så alt kører på ét domæne, og `frontend/assets/js/config.js` kan forblive `API_BASE_URL = ''`.

**Frontend på en anden port** (fx VS Code Live Server på `http://127.0.0.1:5500/frontend/`):

- Sæt `API_BASE_URL = 'http://localhost:3000'` i `config.js` (commit ikke ændringen).
- Sæt `FRONTEND_ORIGIN=http://127.0.0.1:5500` i `backend/.env`.

Health-check: `curl http://localhost:3000/api/health`

## Miljøvariabler

Miljøvariablerne bruges kun af backend. De ligger i `backend/.env` lokalt og i serverens miljø i produktion. **De må aldrig committes.** `.env` er i `.gitignore`.

| Variabel | Påkrævet | Beskrivelse |
|---|---|---|
| `PORT` | nej | Port for API'et (standard `3000`). |
| `NODE_ENV` | nej | `development` / `production`. |
| `MONGODB_URI` | **ja** | Forbindelsesstreng til MongoDB. |
| `SESSION_SECRET` | **ja** | Lang tilfældig streng, mindst 32 tegn i produktion. Generér med `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. |
| `FRONTEND_ORIGIN` | ja i prod. | Frontend-domæne(r), kommasepareret. Fx `https://grejslego.dk`. Styrer CORS og CSRF-tjek. |
| `LEGO_CATALOG_PROVIDER` | nej | `rebrickable` (standard) eller `none`. |
| `LEGO_CATALOG_API_KEY` | nej | Rebrickable-nøgle. Uden nøgle virker kun manuel indtastning af sæt. |
| `CATALOG_CACHE_TTL_DAYS` | nej | Antal dage, før cachede sæt hentes igen (standard `30`). |
| `CATALOG_TIMEOUT_MS` | nej | Timeout for eksterne opslag (standard `8000`). |
| `COOKIE_SAMESITE` | nej | `lax` (standard), `strict` eller `none`. Se [Cookies og domæner](#cookies-og-domæner). |
| `COOKIE_SECURE` | nej | `true` i produktion (standard når `NODE_ENV=production`). |
| `TRUST_PROXY` | nej | Sæt til `1` bag én reverse proxy (nginx/Caddy), så HTTPS og klient-IP genkendes. |
| `SERVE_FRONTEND` | nej | `true` = backend serverer også `frontend/`. |
| `SESSION_MAX_AGE_DAYS` | nej | Hvor længe man forbliver logget ind (standard `14`). |

## LEGO-katalog (Rebrickable)

1. Opret en gratis konto på [rebrickable.com](https://rebrickable.com/).
2. Gå til **Profil → Settings → API** og generér en API-nøgle.
3. Sæt nøglen som miljøvariabel på **serveren**: `LEGO_CATALOG_API_KEY=<nøgle>`. Lokalt sættes den i `backend/.env`, i produktion i `/etc/grejslego/backend.env` (se nedenfor).
4. Genstart backend.

Nøglen sendes aldrig til browseren. Sådan fungerer opslaget:

1. Sætnummeret valideres og normaliseres (`75192` → `75192-1`).
2. Først søges der i `legoSets`-cachen i MongoDB.
3. Mangler sættet, eller er cachen ældre end `CATALOG_CACHE_TTL_DAYS`, hentes det fra Rebrickable. Det hentede er sætdata, hovedtema/undertema og antal minifigurer.
4. Er Rebrickable nede, eller er grænsen for opslag nået, vises de cachede data med en advarsel. Findes der ingen cache, får brugeren en forståelig fejl og kan i stedet indtaste sættet manuelt.
5. Findes sættet ikke, opfindes der intet. Brugeren tilbydes manuel indtastning. Manuelle sæt markeres tydeligt og erstattes automatisk, hvis kataloget senere finder sættet.

Rebrickable leverer ikke beskrivelser eller links til byggevejledninger. De felter står derfor tomme. Frontend viser i stedet et søgelink til LEGO's side med byggevejledninger.

**Ny datakilde:** Lav en fil i `backend/src/services/catalog/providers/`, der eksporterer et objekt med `name`, `isConfigured()` og `fetchSet(setNumber)`, og registrér den i `createProviderFromConfig()` i `services/catalog/index.js`. Resten af appen behøver ikke ændres.

## Tests

```bash
cd backend
npm test
```

Testene starter en midlertidig MongoDB i hukommelsen via `mongodb-memory-server`, så de ikke rører en rigtig database. Første kørsel downloader MongoDB-binæren. Testene dækker accept-scenarierne: konti, login/logout, brugeradskillelse, opslag/cache/fejl, samling (inkl. flere eksemplarer), ønskeliste, flytning til samling, dashboard-statistik, ændring af adgangskode, CSRF og CORS. Den eksterne datakilde erstattes kun i testene af en test-stub. Rebrickable-integrationen testes separat mod Rebrickables svarformat.

## Deployment

Frontend og backend deployes uafhængigt af hinanden.

### Cookies og domæner

Login-sessionen ligger i en **HttpOnly-cookie**. Browsere blokerer i stigende grad cookies på tværs af *forskellige* domæner (tredjepartscookies). Den mest robuste løsning er derfor:

- **Anbefalet:** frontend og API på samme hoveddomæne, fx `https://grejslego.dk` (GitHub Pages med eget domæne) og `https://api.grejslego.dk` (VPS). Brug `COOKIE_SAMESITE=lax` og `COOKIE_SECURE=true`.
- **Alternativ:** frontend på `https://<bruger>.github.io` og API på et andet domæne. Det kræver `COOKIE_SAMESITE=none` og `COOKIE_SECURE=true`, og login kan blive blokeret i browsere, der afviser tredjepartscookies (fx Safari).

### Frontend → GitHub Pages

1. **Settings → Pages → Source:** vælg *GitHub Actions*.
2. **Settings → Secrets and variables → Actions → Variables:** opret `API_BASE_URL`, fx `https://api.grejslego.dk`. Det er en offentlig adresse, ikke en hemmelighed.
3. Push til `main`. Workflowet `.github/workflows/deploy-frontend.yml` skriver `config.js` med API-adressen og publicerer mappen `frontend/`.
4. (Valgfrit) Opsæt eget domæne under **Settings → Pages → Custom domain**.

Sæt bagefter backendens `FRONTEND_ORIGIN` til Pages-adressen, fx `https://grejslego.dk` eller `https://satisbuild.github.io`. Origin er kun skema + domæne, uden sti.

### Backend → VPS med systemd

```bash
# På serveren (Ubuntu/Debian), som root eller via sudo
adduser --system --group grejslego
git clone https://github.com/Satisbuild/GrejsLegoLibrary.git /opt/GrejsLegoLibrary
cd /opt/GrejsLegoLibrary/backend && npm ci --omit=dev

mkdir -p /etc/grejslego
cp .env.example /etc/grejslego/backend.env
nano /etc/grejslego/backend.env          # udfyld rigtige værdier, NODE_ENV=production, TRUST_PROXY=1
chown root:grejslego /etc/grejslego/backend.env && chmod 640 /etc/grejslego/backend.env

cp ../deploy/grejslego-backend.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now grejslego-backend  # starter også automatisk efter genstart
journalctl -u grejslego-backend -f        # se loggen
```

Sæt en HTTPS reverse proxy foran backend. Se `deploy/nginx.conf.example` og brug fx `certbot --nginx` til certifikatet. Backend lytter kun lokalt på port 3000 bag proxyen.

### Backend → Docker (alternativ)

```bash
cd backend
docker build -t grejslego-backend .
docker run -d --name grejslego-backend --restart unless-stopped \
  --env-file /etc/grejslego/backend.env -p 127.0.0.1:3000:3000 grejslego-backend
```

### MongoDB i produktion

- Databasen må **ikke** være åben mod internettet. Bind den til `127.0.0.1` eller et privat netværk, og/eller brug firewall-regler, der kun tillader backend-serveren.
- Slå autentificering til, og brug en dedikeret databasebruger, der kun har adgang til `GrejsLegoLibrary`-databasen.
- Backend opretter selv de nødvendige indexes ved opstart: unik e-mail, unikt brugernavn, unikt sætnummer, `userId` på samling og ønskeliste osv.

## Backup og opdatering

**Backup** med `mongodump`, fx dagligt via cron:

```bash
# /etc/cron.daily/grejslego-backup  (chmod +x). MONGODB_URI læses fra miljøfilen – skriv den ikke i scriptet.
#!/bin/sh
set -a; . /etc/grejslego/backend.env; set +a
mkdir -p /var/backups/grejslego
mongodump --uri="$MONGODB_URI" --archive="/var/backups/grejslego/$(date +%F).archive.gz" --gzip
find /var/backups/grejslego -name '*.archive.gz' -mtime +14 -delete
```

Gendannelse: `mongorestore --uri="$MONGODB_URI" --archive=<fil>.archive.gz --gzip --drop`. Kopiér gerne backups til en anden maskine, og test en gendannelse en gang imellem.

**Opdatering af backend:**

```bash
cd /opt/GrejsLegoLibrary && git pull
cd backend && npm ci --omit=dev
systemctl restart grejslego-backend
curl -s https://api.grejslego.dk/api/health
```

Frontend opdateres automatisk, når der pushes til `main`.

## API-oversigt

Alle svar er JSON: `{ "data": ... }` ved succes og `{ "error": { "code", "message", "details?" } }` ved fejl. Ændrende requests (POST/PATCH/DELETE) skal have headeren `X-Requested-With: GrejsLegoLibrary`. Alle endpoints med personlige data kræver login og returnerer kun den indloggede brugers egne poster. Poster, der tilhører andre, giver `404`.

| Metode | Endpoint | Beskrivelse |
|---|---|---|
| GET | `/api/health` | Status for API og database |
| POST | `/api/auth/register` | Opret konto (`username`, `email`, `password`, `confirmPassword`) |
| POST | `/api/auth/login` | Log ind (`email`, `password`) |
| POST | `/api/auth/logout` | Log ud |
| GET | `/api/auth/me` | Den indloggede bruger |
| POST | `/api/auth/change-password` | Skift adgangskode (logger andre enheder ud) |
| GET | `/api/sets/:setNumber` | Slå et sæt op (cache → Rebrickable) |
| POST | `/api/sets` | Indtast et sæt manuelt |
| GET/POST | `/api/collection` | Liste (+ statistik) / tilføj. Dubletter kræver `duplicateMode: "merge" \| "separate"` |
| GET/PATCH/DELETE | `/api/collection/:id` | Læs / redigér / fjern |
| GET/POST | `/api/wishlist` | Liste / tilføj |
| GET/PATCH/DELETE | `/api/wishlist/:id` | Læs / redigér / fjern |
| POST | `/api/wishlist/:id/mark-purchased` | Markér som købt; `moveToCollection: true` flytter til samlingen |
| GET | `/api/dashboard` | Statistik, seneste sæt og vigtigste ønsker |

## Sikkerhed

- Adgangskoder hashes med **Argon2id** og gemmes aldrig i klartekst.
- Sessioner gemmes i MongoDB. Klienten har kun en `HttpOnly`-cookie (`Secure` og `SameSite` styres af konfigurationen). Der gemmes intet login i `localStorage`.
- Session-ID'et fornyes ved login. Ved skift af adgangskode bliver alle andre sessioner ugyldige.
- **CSRF:** en brugerdefineret header kræves på alle ændrende requests, og `Origin` tjekkes mod `FRONTEND_ORIGIN`.
- **CORS** er begrænset til `FRONTEND_ORIGIN`.
- **Rate limiting** på login (pr. IP og pr. konto), registrering, skift af adgangskode, katalogopslag og hele API'et.
- Alt input valideres og normaliseres på serveren. `userId` udledes altid af sessionen og aldrig af klientens data.
- Fejl sendes uden stack traces eller databasedetaljer. Adgangskoder, nøgler og forbindelsesstrenge logges ikke.
- Helmet sætter sikkerheds-headers. Frontend har en Content-Security-Policy og indsætter al brugertekst som tekst, aldrig som HTML.

> **Vigtigt:** Den MongoDB-adgangskode, der blev delt i projektbeskrivelsen, skal betragtes som kompromitteret. **Skift den** i MongoDB, og brug kun den nye adgangskode i serverens miljøfil, aldrig i Git.

## Kendte begrænsninger

- **Automatisk opslag kræver en Rebrickable API-nøgle.** Uden nøgle virker alt andet, og sæt kan indtastes manuelt.
- Rebrickable leverer hverken beskrivelser eller officielle links til byggevejledninger.
- Nulstilling af adgangskode via e-mail er ikke lavet, fordi den kræver en mailtjeneste. Indloggede brugere kan skifte adgangskode under Profil.
- Rate limits ligger i hukommelsen. Det er fint for én serverproces, men ved flere instanser bør der bruges en delt store, fx Redis.

---

GrejsLegoLibrary er et uafhængigt hobbyprojekt og er ikke tilknyttet eller godkendt af LEGO Group. LEGO® er et varemærke tilhørende LEGO Group.
