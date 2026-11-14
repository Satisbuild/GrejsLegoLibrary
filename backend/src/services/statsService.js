/**
 * Beregner statistik ud fra brugerens faktiske samlingsposter (med populeret sæt).
 * Felter, der ikke kan beregnes fuldt ud, markeres som ufuldstændige.
 */
export function computeCollectionStats(items) {
  const uniqueSetIds = new Set();
  const themes = new Map();
  let totalCopies = 0;
  let totalPieces = 0;
  let totalMinifigures = 0;
  let totalPurchaseValue = 0;
  let itemsMissingPieces = 0;
  let itemsMissingMinifigures = 0;
  let itemsMissingPrice = 0;

  for (const item of items) {
    const set = item.set ?? null;
    const qty = item.quantity || 0;
    uniqueSetIds.add(item.setId);
    totalCopies += qty;

    if (set && Number.isFinite(set.pieceCount)) totalPieces += set.pieceCount * qty;
    else itemsMissingPieces += 1;

    if (set && Number.isFinite(set.minifigureCount)) totalMinifigures += set.minifigureCount * qty;
    else itemsMissingMinifigures += 1;

    if (Number.isFinite(item.purchasePrice)) totalPurchaseValue += item.purchasePrice * qty;
    else itemsMissingPrice += 1;

    const themeName = set?.theme || null;
    const entry = themes.get(themeName) ?? { theme: themeName, sets: new Set(), copies: 0 };
    entry.sets.add(item.setId);
    entry.copies += qty;
    themes.set(themeName, entry);
  }

  const themeDistribution = [...themes.values()]
    .map((t) => ({ theme: t.theme, sets: t.sets.size, copies: t.copies }))
    .sort((a, b) => b.copies - a.copies || String(a.theme).localeCompare(String(b.theme), 'da'));

  return {
    registrations: items.length,
    uniqueSets: uniqueSetIds.size,
    totalCopies,
    totalPieces,
    piecesComplete: itemsMissingPieces === 0,
    itemsMissingPieces,
    totalMinifigures,
    minifiguresComplete: itemsMissingMinifigures === 0,
    itemsMissingMinifigures,
    totalPurchaseValue: Math.round(totalPurchaseValue * 100) / 100,
    itemsWithPrice: items.length - itemsMissingPrice,
    itemsMissingPrice,
    themes: themeDistribution,
  };
}
