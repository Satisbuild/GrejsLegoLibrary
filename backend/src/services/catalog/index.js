import { LegoSet } from '../../models/LegoSet.js';
import { AppError } from '../../utils/AppError.js';
import { normalizeSetNumber } from '../../utils/setNumber.js';
import { logger } from '../../utils/logger.js';
import { CatalogError } from './CatalogError.js';
import { createRebrickableProvider } from './providers/rebrickable.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MANUAL_RECHECK_MS = DAY_MS; // manuelle sæt tjekkes højst én gang i døgnet hos datakilden

/** Vælger datakilde ud fra konfigurationen. Nye datakilder tilføjes her. */
export function createProviderFromConfig(catalogConfig) {
  switch (catalogConfig.provider) {
    case 'rebrickable':
      return createRebrickableProvider({
        apiKey: catalogConfig.apiKey,
        timeoutMs: catalogConfig.requestTimeoutMs,
      });
    case 'none':
      return { name: 'none', isConfigured: () => false, fetchSet: async () => null };
    default:
      throw new Error(`Ukendt LEGO_CATALOG_PROVIDER: ${catalogConfig.provider}`);
  }
}

function catalogErrorToAppError(err) {
  if (err instanceof CatalogError && err.code === 'RATE_LIMITED') {
    return new AppError(
      503,
      'CATALOG_RATE_LIMITED',
      'LEGO-kataloget har nået sin grænse for opslag. Prøv igen om lidt, eller indtast sættet manuelt.',
    );
  }
  return new AppError(
    503,
    'CATALOG_UNAVAILABLE',
    'LEGO-kataloget svarer ikke lige nu. Prøv igen senere, eller indtast sættet manuelt.',
  );
}

/**
 * Katalogtjenesten: slår sæt op i den lokale MongoDB-cache og henter
 * fra den eksterne datakilde, når sættet mangler eller cachen er forældet.
 */
export function createCatalogService({ provider, cacheTtlDays = 30 }) {
  const ttlMs = cacheTtlDays * DAY_MS;

  function isFresh(set) {
    return set.lastFetchedAt && Date.now() - set.lastFetchedAt.getTime() < ttlMs;
  }

  async function saveFromProvider(setNumber, data) {
    const now = new Date();
    return LegoSet.findOneAndUpdate(
      { setNumber },
      {
        $set: {
          ...data,
          setNumber,
          source: provider.name,
          createdBy: null,
          lastFetchedAt: now,
          lastProviderCheckAt: now,
        },
      },
      { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
    );
  }

  /**
   * @returns {{ set: LegoSet, cache: 'hit'|'fetched'|'stale'|'manual', warning?: string }}
   */
  async function lookup(rawSetNumber) {
    const setNumber = normalizeSetNumber(rawSetNumber);
    if (!setNumber) {
      throw new AppError(400, 'INVALID_SET_NUMBER', 'Ugyldigt sætnummer. Brug fx 75192 eller 75192-1.');
    }

    const existing = await LegoSet.findOne({ setNumber });

    if (existing && existing.source !== 'manual' && isFresh(existing)) {
      return { set: existing, cache: 'hit' };
    }

    const recentlyCheckedManual =
      existing?.source === 'manual' &&
      existing.lastProviderCheckAt &&
      Date.now() - existing.lastProviderCheckAt.getTime() < MANUAL_RECHECK_MS;

    if (!provider.isConfigured() || recentlyCheckedManual) {
      if (existing) return describeFallback(existing);
      throw new AppError(
        503,
        'CATALOG_NOT_CONFIGURED',
        'Automatisk opslag er ikke sat op på serveren. Du kan indtaste sættet manuelt.',
      );
    }

    let data;
    try {
      data = await provider.fetchSet(setNumber);
    } catch (err) {
      if (err instanceof CatalogError && err.code === 'AUTH_FAILED') {
        logger.error('Katalog-datakilden afviste API-nøglen. Tjek LEGO_CATALOG_API_KEY.');
      } else {
        logger.warn(`Katalogopslag for ${setNumber} fejlede: ${err.message}`);
      }
      if (existing) return describeFallback(existing);
      throw catalogErrorToAppError(err);
    }

    if (!data) {
      if (existing?.source === 'manual') {
        existing.lastProviderCheckAt = new Date();
        await existing.save();
        return describeFallback(existing);
      }
      if (existing) return describeFallback(existing); // fjernet hos datakilden; behold cachen
      throw new AppError(
        404,
        'SET_NOT_FOUND',
        `Sættet ${setNumber.replace(/-1$/, '')} blev ikke fundet i LEGO-kataloget. Tjek nummeret, eller indtast sættet manuelt.`,
      );
    }

    try {
      const saved = await saveFromProvider(setNumber, data);
      return { set: saved, cache: 'fetched' };
    } catch (err) {
      if (err?.code === 11000) {
        // To samtidige opslag af samme sæt: hent det, den anden request gemte.
        return { set: await LegoSet.findOne({ setNumber }), cache: 'fetched' };
      }
      throw err;
    }
  }

  function describeFallback(set) {
    if (set.source === 'manual') {
      return {
        set,
        cache: 'manual',
        warning: 'Oplysningerne er indtastet manuelt af en bruger og er ikke bekræftet af LEGO-kataloget.',
      };
    }
    return {
      set,
      cache: 'stale',
      warning: 'Oplysningerne kommer fra cachen og kunne ikke opdateres lige nu.',
    };
  }

  /** Opretter eller opdaterer et manuelt indtastet sæt. */
  async function saveManual(userId, input) {
    const setNumber = normalizeSetNumber(input.setNumber);
    if (!setNumber) {
      throw new AppError(400, 'INVALID_SET_NUMBER', 'Ugyldigt sætnummer. Brug fx 75192 eller 75192-1.');
    }

    const existing = await LegoSet.findOne({ setNumber });
    if (existing && existing.source !== 'manual') {
      throw new AppError(409, 'SET_EXISTS', 'Sættet findes allerede i LEGO-kataloget.', {
        set: existing.toPublic(),
      });
    }
    if (existing && existing.createdBy?.toString() !== userId.toString()) {
      throw new AppError(409, 'SET_EXISTS', 'Sættet er allerede indtastet manuelt af en anden bruger.', {
        set: existing.toPublic(),
      });
    }

    const fields = {
      name: input.name,
      theme: input.theme ?? null,
      subtheme: null,
      releaseYear: input.releaseYear ?? null,
      pieceCount: input.pieceCount ?? null,
      minifigureCount: input.minifigureCount ?? null,
      imageUrl: input.imageUrl ?? null,
      description: input.description ?? null,
      instructionsUrl: null,
      sourceUrl: null,
    };

    if (existing) {
      existing.set(fields);
      await existing.save();
      return existing;
    }

    return LegoSet.create({
      ...fields,
      setNumber,
      source: 'manual',
      createdBy: userId,
      lastFetchedAt: null,
      lastProviderCheckAt: new Date(),
    });
  }

  return { lookup, saveManual, providerName: provider.name, isConfigured: () => provider.isConfigured() };
}
