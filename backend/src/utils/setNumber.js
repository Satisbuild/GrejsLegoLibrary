/**
 * LEGO-sætnumre skrives typisk som "75192" eller med variant som "75192-1".
 * Kataloget gemmer altid den kanoniske form med variant ("75192-1").
 * Enkelte sæt har bogstaver (fx "k34431" eller "bl19001"), så de tillades også.
 */
const SET_NUMBER_RE = /^([a-z0-9]{1,20})(?:-(\d{1,3}))?$/;

export function normalizeSetNumber(input) {
  if (typeof input !== 'string') return null;
  const value = input.trim().toLowerCase();
  const match = SET_NUMBER_RE.exec(value);
  if (!match) return null;
  const variant = match[2] ? String(Number.parseInt(match[2], 10)) : '1';
  if (variant === '0') return null;
  return `${match[1]}-${variant}`;
}

export function isValidSetNumber(input) {
  return normalizeSetNumber(input) !== null;
}
