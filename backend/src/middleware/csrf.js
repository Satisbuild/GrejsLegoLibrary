import { AppError } from '../utils/AppError.js';

export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'GrejsLegoLibrary';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF-beskyttelse for cookie-baserede sessioner:
 *  1. Alle ændrende requests skal have en brugerdefineret header. Browsere kan ikke
 *     sende den fra fremmede sider uden et CORS-preflight, som kun tillades for
 *     det konfigurerede frontend-domæne.
 *  2. Hvis browseren sender en Origin-header, skal den være på listen over tilladte origins
 *     (eller være serverens eget origin, når frontend serveres af backend).
 */
export function csrfProtection(allowedOrigins) {
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();

    if (req.get(CSRF_HEADER) !== CSRF_HEADER_VALUE) {
      return next(new AppError(403, 'CSRF_REJECTED', 'Anmodningen blev afvist af sikkerhedshensyn.'));
    }

    const origin = req.get('origin');
    if (origin) {
      const selfOrigin = `${req.protocol}://${req.get('host')}`;
      if (origin !== selfOrigin && !allowedOrigins.includes(origin)) {
        return next(new AppError(403, 'ORIGIN_REJECTED', 'Anmodningen kommer fra et ikke-tilladt domæne.'));
      }
    }
    next();
  };
}
