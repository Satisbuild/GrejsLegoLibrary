import { API_BASE_URL } from './config.js';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Kalder backend-API'et. Sessionen ligger i en HttpOnly-cookie, som browseren
 * sender automatisk (credentials: 'include'). Der gemmes intet login i localStorage.
 */
const NO_BACKEND =
  'Kan ikke få kontakt til GrejsLegoLibrary-serveren. Tjek din internetforbindelse – ' +
  'eller, hvis du kører siden lokalt, at backend er startet (se README).';

// Uden API_BASE_URL ligger API'et ved siden af siderne: /api lokalt, /lego/api når
// siden serveres fra /lego/ på en delt server. Relativ sti følger sidens mappe.
function apiUrl(path) {
  return API_BASE_URL ? `${API_BASE_URL}/api${path}` : `api${path}`;
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'X-Requested-With': 'GrejsLegoLibrary', Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(apiUrl(path), {
      method,
      headers,
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', NO_BACKEND);
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    /* tomt eller ikke-JSON svar */
  }

  // Et svar uden vores JSON-format betyder, at der ikke kører en backend bag adressen
  // (fx hvis HTML-filerne åbnes direkte eller via en ren statisk server).
  if (!json) {
    throw new ApiError(res.status, 'NO_BACKEND', NO_BACKEND);
  }

  if (!res.ok) {
    const err = json?.error;
    throw new ApiError(
      res.status,
      err?.code || `HTTP_${res.status}`,
      err?.message || 'Der opstod en fejl. Prøv igen senere.',
      err?.details,
    );
  }
  return json?.data ?? null;
}

export const get = (path) => api(path);
export const post = (path, body = {}) => api(path, { method: 'POST', body });
export const patch = (path, body) => api(path, { method: 'PATCH', body });
export const del = (path) => api(path, { method: 'DELETE' });
