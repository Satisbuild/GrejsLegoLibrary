import { get, post } from '../api.js';
import { requireUser } from '../layout.js';
import { alertBox, clearFieldErrors, confirmDialog, h, setBusy, showFormError, toast } from '../ui.js';

await requireUser('profile');

/* ---------- Katalognøgle, sikkerhedskopi og sletning (kun i den lokale udgave) ---------- */

const catalogForm = document.getElementById('catalog-form');
const catalogStatus = document.getElementById('catalog-status');

async function refreshCatalogStatus() {
  const { configured } = await get('/local/catalog-key');
  catalogStatus.textContent = configured
    ? 'API-nøgle gemt: helt nye sæt slås også op hos Rebrickable.'
    : 'Ingen API-nøgle – det indbyggede katalog bruges.';
  document.getElementById('catalog-remove').hidden = !configured;
}
refreshCatalogStatus();

catalogForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFieldErrors(catalogForm);
  const apiKey = catalogForm.elements.apiKey.value.trim();
  if (!apiKey) return showFormError(catalogForm, { details: [{ field: 'apiKey', message: 'Indsæt din API-nøgle.' }] });
  const button = catalogForm.querySelector('button[type=submit]');
  setBusy(button, true, 'Gemmer…');
  try {
    await post('/local/catalog-key', { apiKey });
    catalogForm.reset();
    await refreshCatalogStatus();
    toast('API-nøglen er gemt.');
  } catch (err) {
    showFormError(catalogForm, err);
  } finally {
    setBusy(button, false);
  }
});

document.getElementById('catalog-remove').addEventListener('click', async () => {
  await post('/local/catalog-key', { apiKey: '' });
  await refreshCatalogStatus();
  toast('API-nøglen er fjernet.');
});

const backupAlert = document.getElementById('backup-alert');
const fileInput = document.getElementById('backup-file');

document.getElementById('backup-download').addEventListener('click', async () => {
  try {
    const backup = await get('/local/backup');
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `grejslegolibrary-${backup.exportedAt.slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    backupAlert.replaceChildren(
      alertBox('ok', `Sikkerhedskopi med ${backup.collection.length} samlingsposter og ${backup.wishlist.length} ønsker er downloadet.`),
    );
  } catch (err) {
    backupAlert.replaceChildren(alertBox('error', err.message));
  }
});

document.getElementById('backup-restore').addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  let backup;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error();
    backup = JSON.parse(await file.text());
  } catch {
    backupAlert.replaceChildren(alertBox('error', 'Filen kunne ikke læses som en sikkerhedskopi.'));
    return;
  }
  const ok = await confirmDialog({
    title: 'Gendan sikkerhedskopi?',
    message: 'Din nuværende samling og ønskeliste i denne browser bliver erstattet af indholdet i filen. Det kan ikke fortrydes.',
    confirmText: 'Gendan',
    danger: true,
  });
  if (!ok) return;
  try {
    const { imported } = await post('/local/backup', backup);
    backupAlert.replaceChildren(
      alertBox('ok', `Gendannet: ${imported.collection} samlingsposter og ${imported.wishlist} ønsker.`),
    );
  } catch (err) {
    backupAlert.replaceChildren(alertBox('error', err.message));
  }
});

document.getElementById('delete-all').addEventListener('click', async () => {
  const ok = await confirmDialog({
    title: 'Slet alle data?',
    message: 'Hele din samling, ønskeliste og alle gemte sæt fjernes fra denne browser. Det kan ikke fortrydes.',
    confirmText: 'Slet alt',
    danger: true,
  });
  if (!ok) return;
  try {
    await post('/local/delete-all', { confirm: true });
    backupAlert.replaceChildren(alertBox('ok', 'Alle data er slettet fra denne browser.'));
  } catch (err) {
    backupAlert.replaceChildren(alertBox('error', err.message));
  }
});
