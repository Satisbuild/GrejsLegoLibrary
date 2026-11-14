import mongoose from 'mongoose';
import { LegoSet } from '../models/LegoSet.js';
import { CollectionItem } from '../models/CollectionItem.js';
import { AppError, notFound } from '../utils/AppError.js';
import { normalizeSetNumber } from '../utils/setNumber.js';

/**
 * Finder en post, der tilhører brugeren. Findes posten ikke ELLER tilhører den en
 * anden bruger, svares der 404 – så man ikke kan gætte andres ID'er.
 */
export async function findOwned(Model, userId, id, { populate = true } = {}) {
  if (!mongoose.isValidObjectId(id)) throw notFound();
  const query = Model.findOne({ _id: id, userId });
  if (populate) query.populate('setId');
  const doc = await query;
  if (!doc) throw notFound();
  return doc;
}

/** Henter sættet fra kataloget; slår det op eksternt, hvis det ikke er i cachen endnu. */
export async function resolveSet(catalog, rawSetNumber) {
  const setNumber = normalizeSetNumber(rawSetNumber);
  const cached = await LegoSet.findOne({ setNumber });
  if (cached) return cached;
  const { set } = await catalog.lookup(rawSetNumber);
  return set;
}

const COLLECTION_FIELDS = [
  'quantity',
  'condition',
  'hasBox',
  'hasInstructions',
  'purchaseDate',
  'purchasePrice',
  'notes',
];

export function pickDefined(data, fields) {
  const out = {};
  for (const f of fields) if (data[f] !== undefined) out[f] = data[f];
  return out;
}

/**
 * Tilføjer et sæt til brugerens samling og forhindrer utilsigtede dubletter:
 * findes sættet allerede, skal klienten vælge 'merge' (læg til antal) eller
 * 'separate' (ny registrering, fx et brugt eksemplar ved siden af et nyt).
 */
export async function addToCollection(userId, set, input) {
  const fields = pickDefined(input, COLLECTION_FIELDS);
  if (fields.quantity === null) delete fields.quantity;
  const existing = await CollectionItem.find({ userId, setId: set._id }).sort({ addedAt: 1 });

  if (existing.length && !input.duplicateMode) {
    const quantity = existing.reduce((s, i) => s + i.quantity, 0);
    throw new AppError(
      409,
      'ALREADY_IN_COLLECTION',
      `Du har allerede ${quantity} stk. af dette sæt i din samling.`,
      { existingQuantity: quantity, registrations: existing.length, itemIds: existing.map((i) => i._id.toString()) },
    );
  }

  if (existing.length && input.duplicateMode === 'merge') {
    const add = fields.quantity ?? 1;
    const updated = await CollectionItem.findOneAndUpdate(
      { _id: existing[0]._id, userId, quantity: { $lte: 999 - add } },
      { $inc: { quantity: add } },
      { returnDocument: 'after' },
    ).populate('setId');
    if (!updated) throw new AppError(400, 'VALIDATION_ERROR', 'Antal må højst være 999.');
    return { item: updated, merged: true };
  }

  const created = await CollectionItem.create({
    ...fields,
    userId,
    setId: set._id,
    setNumber: set.setNumber,
  });
  await created.populate('setId');
  return { item: created, merged: false };
}

export { COLLECTION_FIELDS };
