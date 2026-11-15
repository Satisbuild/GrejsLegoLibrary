# GrejsLegoLibrary

Et personligt LEGO-bibliotek i browseren. Skriv et sætnummer (fx `75192`), så finder siden sættet (Millennium Falcon), og du kan gemme det i din samling eller på din ønskeliste.

- **Ingen konto og intet login.** Man åbner siden og går i gang.
- **Ingen server.** Alle data gemmes i browserens `localStorage`.
- Siden ligger på GitHub Pages: **https://satisbuild.github.io/GrejsLegoLibrary/**

## Funktioner

- **Sætopslag:** Et indbygget katalog med cirka 28.000 sæt fra [Rebrickable](https://rebrickable.com/) viser navn, tema, år, antal klodser, minifigurer og billede. Det virker uden nøgle. Findes et sæt ikke, kan det indtastes manuelt; der opfindes aldrig data.
- **Min samling:** Antal, stand (ny/åbnet/brugt), æske, byggevejledning, købsdato, købspris og noter. Du kan redigere, slette (med bekræftelse) og have flere eksemplarer af samme sæt. Der er beskyttelse mod utilsigtede dubletter, søgning, filter på tema og år, sortering og gitter- eller listevisning.
- **Ønskeliste:** Prioritet, maksimal pris og noter. Når et sæt er købt, kan det markeres og flyttes til samlingen.
- **Dashboard:** Statistik over sæt, eksemplarer, klodser, minifigurer, købspris og temaer, plus de senest tilføjede sæt og dine vigtigste ønsker.
- **Indstillinger:**
  - Valgfri Rebrickable API-nøgle til helt nye sæt, der ikke er med i kataloget endnu.
  - Sikkerhedskopi: download og gendan.
  - Slet alle data.

## Vigtigt om dine data

- **Kun i den ene browser:** Data findes kun i den browser og på den computer, hvor de er indtastet. Alle, der bruger samme browser, ser den samme samling.
- **Kan forsvinde:** Rydder man browserdata (cookies og webstedsdata), er samlingen væk. Tag derfor en **sikkerhedskopi under Indstillinger** en gang imellem. Kopien kan også bruges til at flytte samlingen til en anden computer.
- **Nøglen:** Rebrickable-nøglen gemmes også kun i browseren og sendes kun til Rebrickable.

## Kør siden lokalt

Siden skal åbnes via en webserver, fordi browsere ikke kører JavaScript-moduler fra en fil, man dobbeltklikker på. Fx:

```bash
python -m http.server 8000 --directory frontend
```

Åbn derefter **http://localhost:8000**. I VS Code kan du også højreklikke på `frontend/index.html` og vælge *Open with Live Server*.

## Opdatér sætkataloget

Kataloget ligger i `frontend/assets/data/rebrickable-sets.json` og bygges ud fra Rebrickables gratis datafiler. Kør dette en gang imellem, så nye sæt kommer med:

```bash
node scripts/build-catalog.mjs
```

Det kræver Node.js 20 eller nyere og ingen `npm install`. Commit og push derefter den opdaterede fil.

## Udgivelse (GitHub Pages)

1. **Settings → Pages → Source:** vælg *GitHub Actions* (kun første gang).
2. Push til `main`. Workflowet `.github/workflows/deploy-frontend.yml` publicerer mappen `frontend/`.

## Projektstruktur

```text
GrejsLegoLibrary/
├── frontend/                  hele siden (det er den, der publiceres)
│   ├── index.html             forside
│   ├── dashboard.html, collection.html, wishlist.html
│   ├── profile.html           Indstillinger
│   └── assets/
│       ├── css/style.css
│       ├── images/            logo og favicon
│       ├── data/              indbygget sætkatalog (rebrickable-sets.json)
│       └── js/
│           ├── local-backend.js  al datalogik: localStorage, validering, katalogopslag, statistik, sikkerhedskopi
│           ├── api.js            siderne kalder local-backend.js gennem denne
│           ├── ui.js, layout.js, forms.js, set-lookup.js, set-card.js, list-tools.js
│           └── pages/            ét script pr. side
├── scripts/build-catalog.mjs  bygger sætkataloget
├── .github/workflows/         GitHub Pages-udgivelse
└── index.html                 viderestilling til frontend/ (hvis repo-roden publiceres)
```

## Teknik

- **Ren HTML, CSS og JavaScript-moduler:** Der er intet byggetrin og ingen afhængigheder.
- **Content-Security-Policy:** Kun egne scripts kører, og netværkskald må kun gå til siden selv og Rebrickable. Brugerdata indsættes aldrig som HTML.
- **Datalogik samlet ét sted:** Siderne kalder et lille internt API (`api.js` → `local-backend.js`), så validering, dubletkontrol og statistik ligger samlet. Alle data gemmes under nøglen `gll.local.db.v1` i `localStorage`.

## Kendte begrænsninger

- Ingen synkronisering mellem enheder. Brug sikkerhedskopien til at flytte data.
- Rebrickable har ikke beskrivelser eller links til byggevejledninger. Siden viser i stedet et søgelink til LEGO's side med byggevejledninger.
- Browseren giver typisk 5–10 MB lokal plads, hvilket rækker til tusindvis af sæt.

GrejsLegoLibrary er et uafhængigt hobbyprojekt og er ikke tilknyttet eller godkendt af LEGO Group.
