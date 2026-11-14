import { CatalogError } from '../CatalogError.js';

/**
 * Datakilde: Rebrickable API v3 (https://rebrickable.com/api/v3/docs/).
 * Kræver en gratis API-nøgle. Rebrickable leverer ikke beskrivelser eller links
 * til byggevejledninger, så de felter sættes til null i stedet for at blive opfundet.
 *
 * Et provider-objekt skal implementere:
 *   name:          string
 *   isConfigured(): boolean
 *   fetchSet(setNumber): Promise<SetData | null>   (null = sættet findes ikke)
 */
const BASE_URL = 'https://rebrickable.com/api/v3/lego';

export function createRebrickableProvider({ apiKey, timeoutMs = 8000, fetchImpl = globalThis.fetch }) {
  const themeCache = new Map(); // themeId -> { name, parentId }

  async function request(path, { allowNotFound = false } = {}) {
    let res;
    try {
      res = await fetchImpl(`${BASE_URL}${path}`, {
        headers: { Authorization: `key ${apiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new CatalogError('UNAVAILABLE', 'Rebrickable kunne ikke kontaktes.');
    }

    if (res.status === 404 && allowNotFound) return null;
    if (res.status === 429) throw new CatalogError('RATE_LIMITED', 'Rebrickable rate limit nået.');
    if (res.status === 401 || res.status === 403) {
      throw new CatalogError('AUTH_FAILED', 'Rebrickable afviste API-nøglen.');
    }
    if (!res.ok) throw new CatalogError('UNAVAILABLE', `Rebrickable svarede med status ${res.status}.`);

    try {
      return await res.json();
    } catch {
      throw new CatalogError('UNAVAILABLE', 'Rebrickable sendte et ugyldigt svar.');
    }
  }

  async function getTheme(themeId) {
    if (themeCache.has(themeId)) return themeCache.get(themeId);
    const data = await request(`/themes/${encodeURIComponent(themeId)}/`, { allowNotFound: true });
    const theme = data ? { name: data.name, parentId: data.parent_id ?? null } : null;
    if (theme) themeCache.set(themeId, theme);
    return theme;
  }

  /** Finder hovedtemaet (fx "Star Wars") og evt. undertemaet (fx "Ultimate Collector Series"). */
  async function resolveTheme(themeId) {
    if (!themeId) return { theme: null, subtheme: null };
    try {
      const chain = [];
      let id = themeId;
      for (let depth = 0; id && depth < 5; depth += 1) {
        const t = await getTheme(id);
        if (!t) break;
        chain.push(t.name);
        id = t.parentId;
      }
      if (!chain.length) return { theme: null, subtheme: null };
      const theme = chain[chain.length - 1];
      const subtheme = chain.length > 1 ? chain[0] : null;
      return { theme, subtheme };
    } catch (err) {
      if (err instanceof CatalogError && err.code === 'AUTH_FAILED') throw err;
      return { theme: null, subtheme: null }; // tema er ikke kritisk for opslaget
    }
  }

  async function countMinifigures(setNumber) {
    try {
      const data = await request(`/sets/${encodeURIComponent(setNumber)}/minifigs/?page_size=1000`, {
        allowNotFound: true,
      });
      if (!data || !Array.isArray(data.results)) return null;
      return data.results.reduce((sum, m) => sum + (Number(m.quantity) || 0), 0);
    } catch {
      return null; // ukendt frem for gættet
    }
  }

  return {
    name: 'rebrickable',

    isConfigured() {
      return Boolean(apiKey);
    },

    async fetchSet(setNumber) {
      const data = await request(`/sets/${encodeURIComponent(setNumber)}/`, { allowNotFound: true });
      if (!data) return null;

      const [{ theme, subtheme }, minifigureCount] = await Promise.all([
        resolveTheme(data.theme_id),
        countMinifigures(setNumber),
      ]);

      return {
        setNumber: String(data.set_num).toLowerCase(),
        name: data.name,
        theme,
        subtheme,
        releaseYear: Number.isInteger(data.year) ? data.year : null,
        pieceCount: Number.isInteger(data.num_parts) ? data.num_parts : null,
        minifigureCount,
        imageUrl: typeof data.set_img_url === 'string' && data.set_img_url.startsWith('https://') ? data.set_img_url : null,
        description: null,
        instructionsUrl: null,
        sourceUrl: typeof data.set_url === 'string' && data.set_url.startsWith('https://') ? data.set_url : null,
      };
    },
  };
}
