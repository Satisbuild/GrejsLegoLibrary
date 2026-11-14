import { post } from '../api.js';
import { requireUser } from '../layout.js';
import { alertBox, clearFieldErrors, formatDate, h, setBusy, showFormError } from '../ui.js';

const user = await requireUser('profile');

document.getElementById('account').replaceChildren(
  h('dt', {}, 'Brugernavn'),
  h('dd', {}, user.username),
  h('dt', {}, 'E-mail'),
  h('dd', {}, user.email),
  h('dt', {}, 'Medlem siden'),
  h('dd', {}, formatDate(user.createdAt)),
);

document.getElementById('logout-btn').addEventListener('click', async (e) => {
  setBusy(e.currentTarget, true, 'Logger ud…');
  try {
    await post('/auth/logout');
  } finally {
    location.href = 'login.html?loggedOut=1';
  }
});

const form = document.getElementById('password-form');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFieldErrors(form);
  const data = {
    currentPassword: form.elements.currentPassword.value,
    newPassword: form.elements.newPassword.value,
    confirmPassword: form.elements.confirmPassword.value,
  };

  const details = [];
  if (!data.currentPassword) details.push({ field: 'currentPassword', message: 'Skriv din nuværende adgangskode.' });
  if (data.newPassword.length < 10) details.push({ field: 'newPassword', message: 'Den nye adgangskode skal være mindst 10 tegn.' });
  else if (!(/\p{L}/u.test(data.newPassword) && /\d/.test(data.newPassword))) {
    details.push({ field: 'newPassword', message: 'Den nye adgangskode skal indeholde både bogstaver og tal.' });
  }
  if (data.newPassword !== data.confirmPassword) details.push({ field: 'confirmPassword', message: 'De nye adgangskoder er ikke ens.' });
  if (details.length) return showFormError(form, { details });

  const button = form.querySelector('button[type=submit]');
  setBusy(button, true, 'Gemmer…');
  try {
    await post('/auth/change-password', data);
    form.reset();
    form.querySelector('.form-alert').replaceChildren(
      alertBox('ok', 'Din adgangskode er ændret. Du er logget ud på alle andre enheder.'),
    );
  } catch (err) {
    showFormError(form, err);
  } finally {
    setBusy(button, false);
  }
});
