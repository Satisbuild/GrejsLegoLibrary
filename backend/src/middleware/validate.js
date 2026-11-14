import { AppError } from '../utils/AppError.js';

/** Validerer data med et zod-schema og kaster en brugervenlig 400-fejl ved fejl. */
export function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  const details = result.error.issues.map((issue) => ({
    field: issue.path.join('.') || null,
    message: issue.message,
  }));
  throw new AppError(400, 'VALIDATION_ERROR', details[0]?.message || 'Ugyldige oplysninger.', details);
}
