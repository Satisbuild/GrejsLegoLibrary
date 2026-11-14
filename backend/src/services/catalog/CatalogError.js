/**
 * Fejl fra en ekstern katalog-datakilde.
 *  - RATE_LIMITED:   datakilden har afvist pga. for mange forespørgsler
 *  - UNAVAILABLE:    netværksfejl, timeout eller 5xx fra datakilden
 *  - AUTH_FAILED:    API-nøglen er ugyldig eller mangler rettigheder
 */
export class CatalogError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CatalogError';
    this.code = code;
  }
}
