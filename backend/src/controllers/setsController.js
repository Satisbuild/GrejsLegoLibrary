import { CollectionItem } from '../models/CollectionItem.js';
import { WishlistItem } from '../models/WishlistItem.js';
import { parse } from '../middleware/validate.js';
import { manualSetSchema } from '../validators/schemas.js';

/** Hvad ejer/ønsker den indloggede bruger allerede af dette sæt? */
async function ownershipFor(userId, setId) {
  const [items, wish] = await Promise.all([
    CollectionItem.find({ userId, setId }).select('quantity').lean(),
    WishlistItem.findOne({ userId, setId }).select('_id status').lean(),
  ]);
  return {
    collectionQuantity: items.reduce((sum, i) => sum + i.quantity, 0),
    collectionRegistrations: items.length,
    wishlistItemId: wish ? wish._id.toString() : null,
    wishlistStatus: wish ? wish.status : null,
  };
}

export function createSetsController({ catalog }) {
  return {
    async lookup(req, res) {
      const result = await catalog.lookup(req.params.setNumber);
      const ownership = await ownershipFor(req.user._id, result.set._id);
      res.json({
        data: {
          set: result.set.toPublic(),
          cache: result.cache,
          warning: result.warning ?? null,
          ownership,
        },
      });
    },

    async createManual(req, res) {
      const data = parse(manualSetSchema, req.body);
      const set = await catalog.saveManual(req.user._id, data);
      const ownership = await ownershipFor(req.user._id, set._id);
      res.status(201).json({
        data: {
          set: set.toPublic(),
          cache: 'manual',
          warning: 'Oplysningerne er indtastet manuelt og er ikke bekræftet af LEGO-kataloget.',
          ownership,
        },
      });
    },

    async status(req, res) {
      res.json({ data: { provider: catalog.providerName, configured: catalog.isConfigured() } });
    },
  };
}
