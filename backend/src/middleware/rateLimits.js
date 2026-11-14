import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

/*
 * Rate limits gemmes i hukommelsen. Det er tilstrækkeligt for én serverproces.
 * Kører flere instanser bag en load balancer, bør der bruges en delt store (fx Redis).
 */

function limitHandler(message) {
  return (req, res, next, options) => {
    res.status(options.statusCode).json({ error: { code: 'RATE_LIMITED', message } });
  };
}

export function createRateLimiters({ disabled = false } = {}) {
  const skip = () => disabled;

  return {
    api: rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 600,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip,
      handler: limitHandler('For mange forespørgsler. Prøv igen om lidt.'),
    }),

    register: rateLimit({
      windowMs: 60 * 60 * 1000,
      limit: 10,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip,
      handler: limitHandler('For mange kontooprettelser fra din forbindelse. Prøv igen senere.'),
    }),

    // Pr. IP: begrænser brute-force mod mange konti.
    loginByIp: rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 30,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip,
      handler: limitHandler('For mange loginforsøg. Vent 15 minutter, og prøv igen.'),
    }),

    // Pr. e-mail: begrænser brute-force mod én konto. Vellykkede logins tæller ikke med.
    loginByAccount: rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 8,
      skipSuccessfulRequests: true,
      standardHeaders: false,
      legacyHeaders: false,
      skip,
      keyGenerator: (req) => {
        const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        return email ? `acct:${email}` : `ip:${ipKeyGenerator(req.ip)}`;
      },
      handler: limitHandler('For mange mislykkede loginforsøg på denne konto. Vent 15 minutter, og prøv igen.'),
    }),

    changePassword: rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip,
      handler: limitHandler('For mange forsøg. Vent lidt, og prøv igen.'),
    }),

    // Beskytter kvoten hos den eksterne LEGO-datakilde.
    catalog: rateLimit({
      windowMs: 60 * 1000,
      limit: 40,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip,
      keyGenerator: (req) => (req.session?.userId ? `user:${req.session.userId}` : `ip:${ipKeyGenerator(req.ip)}`),
      handler: limitHandler('Du har lavet mange opslag på kort tid. Vent et minut, og prøv igen.'),
    }),
  };
}
