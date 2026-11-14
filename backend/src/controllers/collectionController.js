import { CollectionItem } from '../models/CollectionItem.js';
import { parse } from '../middleware/validate.js';
import { collectionCreateSchema, collectionUpdateSchema } from '../validators/schemas.js';
import { addToCollection, COLLECTION_FIELDS, findOwned, pickDefined, resolveSet } from '../services/ownership.js';
import { computeCollectionStats } from '../services/statsService.js';

const MAX_ITEMS = 5000;

export async function loadCollection(userId) {
  const docs = await CollectionItem.find({ userId }).sort({ addedAt: -1 }).limit(MAX_ITEMS).populate('setId');
  return docs.map((d) => d.toPublic());
}

export function createCollectionController({ catalog }) {
  return {
    async list(req, res) {
      const items = await loadCollection(req.user._id);
      res.json({ data: { items, stats: computeCollectionStats(items) } });
    },

    async create(req, res) {
      const data = parse(collectionCreateSchema, req.body);
      const set = await resolveSet(catalog, data.setNumber);
      const { item, merged } = await addToCollection(req.user._id, set, data);
      res.status(merged ? 200 : 201).json({ data: { item: item.toPublic(), merged } });
    },

    async get(req, res) {
      const item = await findOwned(CollectionItem, req.user._id, req.params.id);
      res.json({ data: { item: item.toPublic() } });
    },

    async update(req, res) {
      const data = parse(collectionUpdateSchema, req.body);
      const item = await findOwned(CollectionItem, req.user._id, req.params.id);
      item.set(pickDefined(data, COLLECTION_FIELDS));
      await item.save();
      res.json({ data: { item: item.toPublic() } });
    },

    async remove(req, res) {
      const item = await findOwned(CollectionItem, req.user._id, req.params.id, { populate: false });
      await CollectionItem.deleteOne({ _id: item._id, userId: req.user._id });
      res.json({ data: { deleted: true, id: item._id.toString() } });
    },
  };
}
