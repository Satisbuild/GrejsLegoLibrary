/* Minimal logger. Log aldrig adgangskoder, hemmeligheder, API-nøgler eller forbindelsesstrenge. */
const silent = process.env.NODE_ENV === 'test' && !process.env.DEBUG_TESTS;

function ts() {
  return new Date().toISOString();
}

export const logger = {
  info: (...args) => !silent && console.log(ts(), '[info]', ...args),
  warn: (...args) => !silent && console.warn(ts(), '[warn]', ...args),
  error: (...args) => !silent && console.error(ts(), '[error]', ...args),
};
