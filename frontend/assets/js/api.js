import { handleRequest, LocalError } from './local-backend.js';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Siderne taler med local-backend.js gennem dette lille API, så al datalogik ligger
 * ét sted. Alle data gemmes i denne browsers localStorage.
 */
export async function api(path, { method = 'GET', body } = {}) {
  try {
    // JSON-rundtur, så siderne får præcis samme slags data som fra en rigtig server.
    const payload = body === undefined ? undefined : JSON.parse(JSON.stringify(body));
    return (await handleRequest(method, path, payload)) ?? null;
  } catch (err) {
    if (err instanceof LocalError) throw new ApiError(err.status, err.code, err.message, err.details);
    console.error(err);
    throw new ApiError(500, 'INTERNAL_ERROR', 'Der opstod en fejl. Prøv igen senere.');
  }
}

export const get = (path) => api(path);
export const post = (path, body = {}) => api(path, { method: 'POST', body });
export const patch = (path, body) => api(path, { method: 'PATCH', body });
export const del = (path) => api(path, { method: 'DELETE' });
