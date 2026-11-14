/*
 * Frontend-konfiguration.
 *
 * API_BASE_URL er adressen på backend-serveren UDEN afsluttende skråstreg, fx
 *   "https://api.grejslego.dk"
 * Tom streng betyder "samme domæne som frontend" (bruges når backend serverer
 * frontend lokalt med SERVE_FRONTEND=true).
 *
 * Ved deployment til GitHub Pages overskrives denne fil automatisk af
 * workflowet .github/workflows/deploy-frontend.yml ud fra repository-variablen
 * API_BASE_URL. Filen må ALDRIG indeholde hemmeligheder.
 */
export const API_BASE_URL = '';
