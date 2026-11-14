import { post } from '../api.js';
import { optionalUser } from '../layout.js';
import { clearFieldErrors, setBusy, showFormError } from '../ui.js';

const user = await optionalUser('register');
if (user) location.replace('dashboard.html');

const form = document.getElementById('register-form');
const meter = document.getElementById('password-meter');

/** Simpel styrkeindikator (kun vejledende – serveren håndhæver reglerne). */
function strength(pw) {
  let score = 0;
  if (pw.length >= 10) score += 1;
  if (pw.length >= 14) score += 1;
  if (/\p{L}/u.test(pw) && /\d/.test(pw)) score += 1;
  if (/[A-ZÆØÅ]/.test(pw) && /[a-zæøå]/.test(pw)) score += 1;
  if (/[^\p{L}\d]/u.test(pw)) score += 1;
  return score;
}

form.elements.password.addEventListener('input', (e) => {
  const s = strength(e.target.value);
  meter.style.width = `${(s / 5) * 100}%`;
  meter.style.background = s <= 2 ? 'var(--red)' : s === 3 ? 'var(--orange)' : 'var(--green)';
});

function validate(data) {
  const details = [];
  if (data.username.length < 3 || data.username.length > 30) {
    details.push({ field: 'username', message: 'Brugernavnet skal være 3–30 tegn.' });
  } else if (!/^[\p{L}\d_.-]+$/u.test(data.username)) {
    details.push({ field: 'username', message: 'Brugernavnet må kun indeholde bogstaver, tal, punktum, bindestreg og understreg.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    details.push({ field: 'email', message: 'Skriv en gyldig e-mailadresse.' });
  }
  if (data.password.length < 10) {
    details.push({ field: 'password', message: 'Adgangskoden skal være mindst 10 tegn.' });
  } else if (!(/\p{L}/u.test(data.password) && /\d/.test(data.password))) {
    details.push({ field: 'password', message: 'Adgangskoden skal indeholde både bogstaver og tal.' });
  }
  if (data.password !== data.confirmPassword) {
    details.push({ field: 'confirmPassword', message: 'Adgangskoderne er ikke ens.' });
  }
  return details;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFieldErrors(form);
  const data = {
    username: form.elements.username.value.trim(),
    email: form.elements.email.value.trim(),
    password: form.elements.password.value,
    confirmPassword: form.elements.confirmPassword.value,
  };
  const details = validate(data);
  if (details.length) return showFormError(form, { details });

  const button = form.querySelector('button[type=submit]');
  setBusy(button, true, 'Opretter konto…');
  try {
    await post('/auth/register', data);
    location.replace('dashboard.html');
  } catch (err) {
    setBusy(button, false);
    showFormError(form, err);
  }
});
