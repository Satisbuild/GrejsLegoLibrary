import { get, post } from './api.js';
import { h, icon, ICONS, toast, alertBox } from './ui.js';

const PRIVATE_NAV = [
  { href: 'dashboard.html', label: 'Dashboard', key: 'dashboard' },
  { href: 'collection.html', label: 'Min samling', key: 'collection' },
  { href: 'wishlist.html', label: 'Wishlist', key: 'wishlist' },
  { href: 'profile.html', label: 'Profil', key: 'profile' },
];

// Sider man må sendes tilbage til efter login (forhindrer open redirects).
const ALLOWED_NEXT = new Set(['dashboard.html', 'collection.html', 'wishlist.html', 'profile.html']);

export function safeNext(value, fallback = 'dashboard.html') {
  if (!value) return fallback;
  const [page, hash] = String(value).split('#');
  return ALLOWED_NEXT.has(page) ? page + (hash ? `#${encodeURIComponent(hash)}` : '') : fallback;
}

function currentPage() {
  return location.pathname.split('/').pop() || 'index.html';
}

export function renderHeader(user, active) {
  const header = document.getElementById('site-header');
  if (!header) return;

  const nav = h('nav', { class: 'nav', id: 'main-nav', 'aria-label': 'Hovedmenu' });
  if (user) {
    for (const item of PRIVATE_NAV) {
      nav.append(h('a', { href: item.href, 'aria-current': item.key === active ? 'page' : null }, item.label));
    }
    nav.append(
      h('button', { type: 'button', class: 'nav-link', onclick: logout }, icon(ICONS.logout, { size: 18 }), 'Log ud'),
    );
  } else {
    nav.append(
      h('a', { href: 'login.html', 'aria-current': active === 'login' ? 'page' : null }, 'Log ind'),
      h('a', { href: 'register.html', class: 'btn btn-primary btn-sm' }, 'Opret konto'),
    );
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
        { class: 'brand', href: user ? 'dashboard.html' : 'index.html' },
        h('img', { src: 'assets/images/logo.svg', alt: '', width: 36, height: 36 }),
        h('span', {}, 'Grejs', h('span', { class: 'brand-accent' }, 'Lego'), 'Library'),
      ),
      toggle,
      nav,
    ),
  );
}

async function logout() {
  try {
    await post('/auth/logout');
  } catch {
    /* sessionen ryddes også, når den udløber */
  }
  location.href = 'login.html?loggedOut=1';
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
    if (err.status === 401) {
      const next = currentPage() + location.hash;
      location.replace(`login.html?next=${encodeURIComponent(next)}`);
    } else {
      const main = document.getElementById('main');
      main?.replaceChildren(
        alertBox('error', err.message || 'Siden kunne ikke indlæses.'),
        h('p', {}, h('button', { class: 'btn', type: 'button', onclick: () => location.reload() }, 'Prøv igen')),
      );
    }
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
  if (err?.status === 401) {
    toast('Din session er udløbet. Log venligst ind igen.', 'error');
    setTimeout(() => location.replace(`login.html?next=${encodeURIComponent(currentPage())}`), 1200);
    return;
  }
  toast(err?.message || fallbackMessage || 'Der opstod en fejl.', 'error');
}
