import { optionalUser } from '../layout.js';
import { h } from '../ui.js';

const user = await optionalUser('home');
if (user) {
  document.getElementById('hero-actions')?.replaceChildren(
    h('a', { class: 'btn btn-primary', href: 'dashboard.html' }, 'Gå til dit dashboard'),
    h('a', { class: 'btn', href: 'collection.html#add' }, 'Tilføj et sæt'),
  );
}
