import { z } from 'zod';
import { CONDITIONS } from '../models/CollectionItem.js';
import { PRIORITIES, WISH_STATUSES } from '../models/WishlistItem.js';
import { isValidSetNumber } from '../utils/setNumber.js';

/* ---------- Hjælpere ---------- */

const toNumberOrNull = (v) => {
  if (v === '' || v === null) return null;
  if (typeof v === 'string') {
    const n = Number(v.trim().replace(',', '.'));
    return Number.isFinite(n) ? n : v;
  }
  return v;
};

const nullableNumber = ({ min, max, int = false, label }) =>
  z
    .preprocess(
      toNumberOrNull,
      (int ? z.number(`${label} skal være et tal.`).int(`${label} skal være et helt tal.`) : z.number(`${label} skal være et tal.`))
        .min(min, `${label} skal være mindst ${min}.`)
        .max(max, `${label} må højst være ${max}.`)
        .nullable(),
    )
    .optional();

const nullableDate = (label) =>
  z
    .preprocess(
      (v) => (v === '' || v === null ? null : v),
      z
        .string(`${label} skal være en dato.`)
        .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} skal have formatet ÅÅÅÅ-MM-DD.`)
        .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), `${label} er ikke en gyldig dato.`)
        .refine((s) => Date.parse(`${s}T00:00:00Z`) <= Date.now() + 48 * 3600 * 1000, `${label} kan ikke ligge i fremtiden.`)
        .refine((s) => Number(s.slice(0, 4)) >= 1932, `${label} er for langt tilbage i tiden.`)
        .transform((s) => new Date(`${s}T00:00:00Z`))
        .nullable(),
    )
    .optional();

const notes = z.string('Noten skal være tekst.').trim().max(2000, 'Noten må højst være 2000 tegn.').optional();

const optionalText = (max, label) =>
  z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
      z.string(`${label} skal være tekst.`).trim().max(max, `${label} må højst være ${max} tegn.`).nullable(),
    )
    .optional();

const httpsUrl = z
  .preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z
      .string('Billed-URL skal være tekst.')
      .trim()
      .max(2000, 'Billed-URL er for lang.')
      .refine((s) => {
        try {
          return new URL(s).protocol === 'https:';
        } catch {
          return false;
        }
      }, 'Billed-URL skal være en gyldig https://-adresse.')
      .nullable(),
  )
  .optional();

export const setNumberSchema = z
  .string('Sætnummer mangler.')
  .trim()
  .min(1, 'Sætnummer mangler.')
  .refine(isValidSetNumber, 'Ugyldigt sætnummer. Brug fx 75192 eller 75192-1.');

/* ---------- Konto ---------- */

const password = z
  .string('Adgangskode mangler.')
  .min(10, 'Adgangskoden skal være mindst 10 tegn.')
  .max(128, 'Adgangskoden må højst være 128 tegn.')
  .refine((p) => /\p{L}/u.test(p) && /\d/.test(p), 'Adgangskoden skal indeholde både bogstaver og tal.');

const email = z
  .string('E-mail mangler.')
  .trim()
  .toLowerCase()
  .min(1, 'E-mail mangler.')
  .max(254, 'E-mailadressen er for lang.')
  .email('Ugyldig e-mailadresse.');

export const registerSchema = z
  .object({
    username: z
      .string('Brugernavn mangler.')
      .trim()
      .min(3, 'Brugernavnet skal være mindst 3 tegn.')
      .max(30, 'Brugernavnet må højst være 30 tegn.')
      .regex(/^[\p{L}\d_.-]+$/u, 'Brugernavnet må kun indeholde bogstaver, tal, punktum, bindestreg og understreg.'),
    email,
    password,
    confirmPassword: z.string('Gentag adgangskoden.'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Adgangskoderne er ikke ens.',
    path: ['confirmPassword'],
  })
  .refine((d) => !d.password.toLowerCase().includes(d.username.toLowerCase()), {
    message: 'Adgangskoden må ikke indeholde dit brugernavn.',
    path: ['password'],
  });

export const loginSchema = z.object({
  email: z.string('E-mail mangler.').trim().toLowerCase().min(1, 'E-mail mangler.').max(254),
  password: z.string('Adgangskode mangler.').min(1, 'Adgangskode mangler.').max(128),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string('Nuværende adgangskode mangler.').min(1, 'Nuværende adgangskode mangler.').max(128),
    newPassword: password,
    confirmPassword: z.string('Gentag den nye adgangskode.'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'De nye adgangskoder er ikke ens.',
    path: ['confirmPassword'],
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: 'Den nye adgangskode skal være forskellig fra den nuværende.',
    path: ['newPassword'],
  });

/* ---------- Katalog ---------- */

export const manualSetSchema = z.object({
  setNumber: setNumberSchema,
  name: z.string('Sættets navn mangler.').trim().min(1, 'Sættets navn mangler.').max(300, 'Navnet er for langt.'),
  theme: optionalText(120, 'Tema'),
  releaseYear: nullableNumber({ min: 1932, max: new Date().getFullYear() + 2, int: true, label: 'Udgivelsesår' }),
  pieceCount: nullableNumber({ min: 0, max: 100000, int: true, label: 'Antal klodser' }),
  minifigureCount: nullableNumber({ min: 0, max: 1000, int: true, label: 'Antal minifigurer' }),
  imageUrl: httpsUrl,
  description: optionalText(5000, 'Beskrivelse'),
});

/* ---------- Samling ---------- */

const collectionFields = {
  quantity: nullableNumber({ min: 1, max: 999, int: true, label: 'Antal' }),
  condition: z.enum(CONDITIONS, 'Ugyldig stand.').optional(),
  hasBox: z.boolean('Ugyldig værdi for æske.').optional(),
  hasInstructions: z.boolean('Ugyldig værdi for byggevejledning.').optional(),
  purchaseDate: nullableDate('Købsdato'),
  purchasePrice: nullableNumber({ min: 0, max: 10000000, label: 'Købspris' }),
  notes,
};

// Hvis sættet allerede er i samlingen: 'merge' = læg til antal, 'separate' = ny registrering.
const duplicateMode = z.enum(['merge', 'separate'], 'Ugyldig dubletindstilling.').optional();

export const collectionCreateSchema = z.object({
  setNumber: setNumberSchema,
  ...collectionFields,
  duplicateMode,
});

export const collectionUpdateSchema = z
  .object(collectionFields)
  .strict('Feltet kan ikke ændres.')
  .refine((d) => d.quantity !== null, { message: 'Antal skal være mindst 1.', path: ['quantity'] });

/* ---------- Ønskeliste ---------- */

const wishFields = {
  priority: z.enum(PRIORITIES, 'Ugyldig prioritet.').optional(),
  targetPrice: nullableNumber({ min: 0, max: 10000000, label: 'Ønsket maksimal pris' }),
  notes,
};

export const wishCreateSchema = z.object({ setNumber: setNumberSchema, ...wishFields });

export const wishUpdateSchema = z
  .object({ ...wishFields, status: z.enum(WISH_STATUSES, 'Ugyldig status.').optional() })
  .strict('Feltet kan ikke ændres.');

export const markPurchasedSchema = z.object({
  moveToCollection: z.boolean('Angiv om sættet skal flyttes til samlingen.').default(false),
  collection: z.object({ ...collectionFields, duplicateMode }).optional(),
});
