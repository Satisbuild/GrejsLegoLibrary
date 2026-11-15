import { get } from './api.js';
import { h, icon, ICONS, toast, alertBox } from './ui.js';

const PRIVATE_NAV = [
  { href: 'dashboard.html', label: 'Dashboard', key: 'dashboard' },
  { href: 'collection.html', label: 'Min samling', key: 'collection' },
  { href: 'wishlist.html', label: 'Wishlist', key: 'wishlist' },
  { href: 'profile.html', label: 'Indstillinger', key: 'profile' },
];

export function renderHeader(user, active) {
  const header = document.getElementById('site-header');
  if (!header) return;

  const nav = h('nav', { class: 'nav', id: 'main-nav', 'aria-label': 'Hovedmenu' });
  // Ingen konti – navigationen er altid den samme.
  for (const item of PRIVATE_NAV) {
    nav.append(h('a', { href: item.href, 'aria-current': item.key === active ? 'page' : null }, item.label));
  }

  const toggle = h(
    'button',
    { type: 'button', class: 'nav-toggle', 'aria-controls': 'main-nav', 'aria-expanded': 'false', 'aria-label': 'Menu' },
    icon(ICONS.menu),
  );
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  header.replaceChildren(
    h(
      'div',
      { class: 'container header-inner' },
      h(
        'a',
        { class: 'brand', href: 'index.html' },
        h('img', { src: 'assets/images/logo.svg', alt: '', width: 36, height: 36 }),
        h('span', {}, 'Grejs', h('span', { class: 'brand-accent' }, 'Lego'), 'Library'),
      ),
      toggle,
      nav,
    ),
  );
}

/**
 * Til sider, der kræver login. Sender brugeren til login, hvis sessionen mangler.
 * @returns {Promise<object>} den indloggede bruger
 */
export async function requireUser(active) {
  renderHeader(null, active);
  try {
    const { user } = await get('/auth/me');
    renderHeader(user, active);
    return user;
  } catch (err) {
    const main = document.getElementById('main');
    main?.replaceChildren(
      alertBox('error', err.message || 'Siden kunne ikke indlæses.'),
      h('p', {}, h('button', { class: 'btn', type: 'button', onclick: () => location.reload() }, 'Prøv igen')),
    );
    return new Promise(() => {}); // stop videre indlæsning af siden
  }
}

/** Til offentlige sider: viser den rigtige navigation, hvis man allerede er logget ind. */
export async function optionalUser(active) {
  renderHeader(null, active);
  try {
    const { user } = await get('/auth/me');
    renderHeader(user, active);
    return user;
  } catch {
    return null;
  }
}

/** Håndterer en API-fejl, der opstår efter sideindlæsning (fx udløbet session). */
export function handleApiError(err, fallbackMessage) {
  toast(err?.message || fallbackMessage || 'Der opstod en fejl.', 'error');
}
