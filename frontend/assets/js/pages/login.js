import { post } from '../api.js';
import { optionalUser, safeNext } from '../layout.js';
import { alertBox, clearFieldErrors, setBusy, showFormError } from '../ui.js';

const params = new URLSearchParams(location.search);
const next = safeNext(params.get('next'));

const user = await optionalUser('login');
if (user) location.replace(next);

const form = document.getElementById('login-form');
const alert = form.querySelector('.form-alert');
if (params.get('loggedOut')) alert.replaceChildren(alertBox('ok', 'Du er nu logget ud.'));
if (params.get('registered')) alert.replaceChildren(alertBox('ok', 'Din konto er oprettet.'));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFieldErrors(form);
  const email = form.elements.email.value.trim();
  const password = form.elements.password.value;

  const details = [];
  if (!email) details.push({ field: 'email', message: 'Skriv din e-mail.' });
  if (!password) details.push({ field: 'password', message: 'Skriv din adgangskode.' });
  if (details.length) return showFormError(form, { details });

  const button = form.querySelector('button[type=submit]');
  setBusy(button, true, 'Logger ind…');
  try {
    await post('/auth/login', { email, password });
    location.replace(next);
  } catch (err) {
    setBusy(button, false);
    form.elements.password.value = '';
    showFormError(form, err);
  }
});
