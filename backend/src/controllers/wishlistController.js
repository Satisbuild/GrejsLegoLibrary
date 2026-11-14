import { WishlistItem } from '../models/WishlistItem.js';
import { CollectionItem } from '../models/CollectionItem.js';
import { AppError } from '../utils/AppError.js';
import { parse } from '../middleware/validate.js';
import { markPurchasedSchema, wishCreateSchema, wishUpdateSchema } from '../validators/schemas.js';
import { addToCollection, findOwned, pickDefined, resolveSet } from '../services/ownership.js';

const MAX_ITEMS = 5000;
const WISH_FIELDS = ['priority', 'targetPrice', 'notes'];

export async function loadWishlist(userId) {
  const docs = await WishlistItem.find({ userId }).sort({ addedAt: -1 }).limit(MAX_ITEMS).populate('setId');
  return docs.map((d) => d.toPublic());
}

function alreadyOnWishlist(existingId) {
  return new AppError(409, 'ALREADY_ON_WISHLIST', 'Sættet står allerede på din ønskeliste.', {
    itemId: existingId ?? null,
  });
}

export function createWishlistController({ catalog }) {
  return {
    async list(req, res) {
      const items = await loadWishlist(req.user._id);
      res.json({ data: { items } });
    },

    async create(req, res) {
      const data = parse(wishCreateSchema, req.body);
      const set = await resolveSet(catalog, data.setNumber);

      const existing = await WishlistItem.findOne({ userId: req.user._id, setId: set._id }).select('_id');
      if (existing) throw alreadyOnWishlist(existing._id.toString());

      let item;
      try {
        item = await WishlistItem.create({
          ...pickDefined(data, WISH_FIELDS),
          userId: req.user._id,
          setId: set._id,
          setNumber: set.setNumber,
        });
      } catch (err) {
        if (err?.code === 11000) throw alreadyOnWishlist();
        throw err;
      }
      await item.populate('setId');
      res.status(201).json({ data: { item: item.toPublic() } });
    },

    async get(req, res) {
      const item = await findOwned(WishlistItem, req.user._id, req.params.id);
      res.json({ data: { item: item.toPublic() } });
    },

    async update(req, res) {
      const data = parse(wishUpdateSchema, req.body);
      const item = await findOwned(WishlistItem, req.user._id, req.params.id);
      item.set(pickDefined(data, WISH_FIELDS));
      if (data.status && data.status !== item.status) {
        item.status = data.status;
        item.purchasedAt = data.status === 'purchased' ? new Date() : null;
      }
      await item.save();
      res.json({ data: { item: item.toPublic() } });
    },

    async remove(req, res) {
      const item = await findOwned(WishlistItem, req.user._id, req.params.id, { populate: false });
      await WishlistItem.deleteOne({ _id: item._id, userId: req.user._id });
      res.json({ data: { deleted: true, id: item._id.toString() } });
    },

    /**
     * Markerer et ønske som købt. Med moveToCollection=true oprettes en samlingspost
     * med de oplysninger, brugeren har bekræftet, og ønsket fjernes fra listen.
     */
    async markPurchased(req, res) {
      const data = parse(markPurchasedSchema, req.body);
      const wish = await findOwned(WishlistItem, req.user._id, req.params.id);

      if (!data.moveToCollection) {
        if (wish.status !== 'purchased') {
          wish.status = 'purchased';
          wish.purchasedAt = new Date();
          await wish.save();
        }
        return res.json({ data: { moved: false, wishlistItem: wish.toPublic(), collectionItem: null } });
      }

      const input = { ...(data.collection ?? {}) };
      if (input.notes === undefined && wish.notes) input.notes = wish.notes;

      const { item, merged } = await addToCollection(req.user._id, wish.setId, input);
      try {
        await WishlistItem.deleteOne({ _id: wish._id, userId: req.user._id });
      } catch (err) {
        // Rul samlingsposten tilbage, så sættet ikke ender begge steder ved en fejl.
        if (!merged) await CollectionItem.deleteOne({ _id: item._id }).catch(() => {});
        throw err;
      }

      res.json({ data: { moved: true, merged, wishlistItem: null, collectionItem: item.toPublic() } });
    },
  };
}
