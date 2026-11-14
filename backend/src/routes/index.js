import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { isDatabaseConnected } from '../config/db.js';
import { createAuthController } from '../controllers/authController.js';
import { createSetsController } from '../controllers/setsController.js';
import { createCollectionController } from '../controllers/collectionController.js';
import { createWishlistController } from '../controllers/wishlistController.js';
import { createDashboardController } from '../controllers/dashboardController.js';

export function createApiRouter({ catalog, limiters, sessionCookieName, cookieOptions }) {
  const router = Router();
  const auth = createAuthController({ sessionCookieName, cookieOptions });
  const sets = createSetsController({ catalog });
  const collection = createCollectionController({ catalog });
  const wishlist = createWishlistController({ catalog });
  const dashboard = createDashboardController();

  router.get('/health', (req, res) => {
    const db = isDatabaseConnected();
    res.status(db ? 200 : 503).json({
      data: { status: db ? 'ok' : 'degraded', database: db ? 'connected' : 'disconnected', time: new Date().toISOString() },
    });
  });

  // Konto
  router.post('/auth/register', limiters.register, auth.register);
  router.post('/auth/login', limiters.loginByIp, limiters.loginByAccount, auth.login);
  router.post('/auth/logout', auth.logout);
  router.get('/auth/me', requireAuth, auth.me);
  router.post('/auth/change-password', limiters.changePassword, requireAuth, auth.changePassword);

  // LEGO-katalog (kræver login for at beskytte API-kvoten hos datakilden)
  router.get('/sets/status', requireAuth, sets.status);
  router.get('/sets/:setNumber', requireAuth, limiters.catalog, sets.lookup);
  router.post('/sets', requireAuth, limiters.catalog, sets.createManual);

  // Samling
  router.get('/collection', requireAuth, collection.list);
  router.post('/collection', requireAuth, collection.create);
  router.get('/collection/:id', requireAuth, collection.get);
  router.patch('/collection/:id', requireAuth, collection.update);
  router.delete('/collection/:id', requireAuth, collection.remove);

  // Ønskeliste
  router.get('/wishlist', requireAuth, wishlist.list);
  router.post('/wishlist', requireAuth, wishlist.create);
  router.get('/wishlist/:id', requireAuth, wishlist.get);
  router.patch('/wishlist/:id', requireAuth, wishlist.update);
  router.delete('/wishlist/:id', requireAuth, wishlist.remove);
  router.post('/wishlist/:id/mark-purchased', requireAuth, wishlist.markPurchased);

  // Dashboard
  router.get('/dashboard', requireAuth, dashboard.get);

  return router;
}
