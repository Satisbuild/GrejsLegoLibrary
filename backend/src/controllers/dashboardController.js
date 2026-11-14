import { loadCollection } from './collectionController.js';
import { loadWishlist } from './wishlistController.js';
import { computeCollectionStats } from '../services/statsService.js';

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };

export function createDashboardController() {
  return {
    async get(req, res) {
      const [collection, wishlist] = await Promise.all([loadCollection(req.user._id), loadWishlist(req.user._id)]);

      const wanted = wishlist.filter((w) => w.status === 'wanted');
      const topWishes = [...wanted]
        .sort(
          (a, b) =>
            PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || new Date(b.addedAt) - new Date(a.addedAt),
        )
        .slice(0, 4);

      res.json({
        data: {
          user: req.user.toPublic(),
          collection: computeCollectionStats(collection),
          wishlist: {
            total: wishlist.length,
            wanted: wanted.length,
            purchased: wishlist.length - wanted.length,
          },
          recentCollection: collection.slice(0, 6),
          topWishes,
        },
      });
    },
  };
}
