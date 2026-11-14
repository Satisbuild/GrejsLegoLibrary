import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';

/**
 * Kræver en gyldig login-session. Brugeren udledes ALTID fra sessionen –
 * aldrig fra et userId sendt af klienten.
 */
export async function requireAuth(req, res, next) {
  const { userId, sessionVersion } = req.session ?? {};
  if (!userId) throw new AppError(401, 'UNAUTHENTICATED', 'Du skal være logget ind.');

  const user = await User.findById(userId);
  if (!user || user.sessionVersion !== sessionVersion) {
    await destroySession(req);
    throw new AppError(401, 'SESSION_EXPIRED', 'Din session er udløbet. Log venligst ind igen.');
  }

  req.user = user;
  next();
}

export function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

export function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

export function destroySession(req) {
  return new Promise((resolve) => {
    if (!req.session) return resolve();
    req.session.destroy(() => resolve());
  });
}

/** Opretter en ny session til brugeren (forhindrer session fixation). */
export async function startUserSession(req, user) {
  await regenerateSession(req);
  req.session.userId = user._id.toString();
  req.session.sessionVersion = user.sessionVersion;
  await saveSession(req);
}
