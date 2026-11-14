import argon2 from 'argon2';
import crypto from 'node:crypto';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { parse } from '../middleware/validate.js';
import { destroySession, startUserSession } from '../middleware/auth.js';
import { changePasswordSchema, loginSchema, registerSchema } from '../validators/schemas.js';

const HASH_OPTIONS = { type: argon2.argon2id };

// Bruges når e-mailen ikke findes, så svartiden ikke afslører om en konto eksisterer.
let dummyHashPromise;
function getDummyHash() {
  dummyHashPromise ??= argon2.hash(crypto.randomBytes(32).toString('hex'), HASH_OPTIONS);
  return dummyHashPromise;
}

export function createAuthController({ sessionCookieName, cookieOptions }) {
  return {
    async register(req, res) {
      const data = parse(registerSchema, req.body);

      const [emailTaken, usernameTaken] = await Promise.all([
        User.exists({ email: data.email }),
        User.findByUsername(data.username).select('_id').lean(),
      ]);
      const details = [];
      if (emailTaken) details.push({ field: 'email', message: 'Der findes allerede en konto med denne e-mail.' });
      if (usernameTaken) details.push({ field: 'username', message: 'Brugernavnet er allerede taget.' });
      if (details.length) throw new AppError(409, 'USER_EXISTS', details[0].message, details);

      const passwordHash = await argon2.hash(data.password, HASH_OPTIONS);
      let user;
      try {
        user = await User.create({ username: data.username, email: data.email, passwordHash });
      } catch (err) {
        if (err?.code === 11000) {
          const field = err.keyPattern?.email ? 'email' : 'username';
          const message =
            field === 'email' ? 'Der findes allerede en konto med denne e-mail.' : 'Brugernavnet er allerede taget.';
          throw new AppError(409, 'USER_EXISTS', message, [{ field, message }]);
        }
        throw err;
      }

      await startUserSession(req, user);
      res.status(201).json({ data: { user: user.toPublic() } });
    },

    async login(req, res) {
      const data = parse(loginSchema, req.body);
      const user = await User.findOne({ email: data.email }).select('+passwordHash');

      let valid = false;
      if (user) {
        valid = await argon2.verify(user.passwordHash, data.password);
      } else {
        await argon2.verify(await getDummyHash(), data.password).catch(() => false);
      }

      if (!valid) {
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Forkert e-mail eller adgangskode.');
      }

      await startUserSession(req, user);
      res.json({ data: { user: user.toPublic() } });
    },

    async logout(req, res) {
      await destroySession(req);
      const { maxAge, ...clearOptions } = cookieOptions;
      res.clearCookie(sessionCookieName, clearOptions);
      res.json({ data: { loggedOut: true } });
    },

    async me(req, res) {
      res.json({ data: { user: req.user.toPublic() } });
    },

    async changePassword(req, res) {
      const data = parse(changePasswordSchema, req.body);
      const user = await User.findById(req.user._id).select('+passwordHash');

      const valid = await argon2.verify(user.passwordHash, data.currentPassword);
      if (!valid) {
        throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Den nuværende adgangskode er forkert.', [
          { field: 'currentPassword', message: 'Den nuværende adgangskode er forkert.' },
        ]);
      }

      user.passwordHash = await argon2.hash(data.newPassword, HASH_OPTIONS);
      user.sessionVersion += 1; // logger alle andre enheder ud
      await user.save();

      await startUserSession(req, user);
      res.json({ data: { changed: true } });
    },
  };
}
