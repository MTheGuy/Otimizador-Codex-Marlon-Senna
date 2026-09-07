const form = document.querySelector('#config-form');
const message = document.querySelector('#message');
const controls = [...document.querySelectorAll('input, textarea, button')];
const assetUrls = new Map();
let config;
let busy = false;
let polling;
const fragment = location.hash.slice(1);
if (fragment) sessionStorage.setItem('customize-session', fragment);
history.replaceState(null, '', location.pathname);
const token = sessionStorage.getItem('customize-session') || '';

function showMessage(text, state = '') { message.textContent = text; message.className = `message ${state}`; }
function setBusy(value) { busy = value; controls.forEach((control) => { control.disabled = value; }); }

async function api(route, body, raw = false) {
  const headers = { 'X-Customize-Token': token };
  const options = { headers, cache: 'no-store' };
  if (body !== undefined) {
    options.method = 'POST';
    if (!raw) headers['Content-Type'] = 'application/json';
    options.body = raw ? body : JSON.stringify(body);
  }
  const response = await fetch(route, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir esta ação.');
  return result;
}

function getValue(object, name) { return name.split('.').reduce((value, part) => value[part], object); }
function setValue(object, name, value) {
  const parts = name.split('.');
  const parent = parts.slice(0, -1).reduce((item, part) => item[part], object);
  parent[parts.at(-1)] = value;
}
function readForm() {
  const value = structuredClone(config);
  for (const field of form.querySelectorAll('[name]')) setValue(value, field.name, field.type === 'checkbox' ? field.checked : field.value.trim());
  return value;
}
function updatePreview() {
  if (!config) return;
  const value = readForm();
  document.querySelector('#app-name').textContent = value.name || 'Seu aplicativo';
  document.querySelector('#app-description').textContent = value.description;
  document.querySelector('#app-version').textContent = `Versão ${value.version}`;
  document.querySelector('#installer-name').textContent = `${value.installerPrefix || 'Seu-Aplicativo'}-Setup-x64.exe`;
  for (const role of ['icon', 'logo', 'extensionIcon']) {
    document.querySelector(`#path-${role}`).textContent = value[role] || (role === 'icon' ? 'Marca padrão' : 'Herdar ícone');
  }
}
function populate(value) {
  config = value;
  for (const field of form.querySelectorAll('[name]')) {
    if (field.type === 'checkbox') field.checked = getValue(value, field.name);
    else field.value = getValue(value, field.name);
  }
  updatePreview();
}
function setImage(role, blob) {
  if (assetUrls.has(role)) URL.revokeObjectURL(assetUrls.get(role));
  const image = document.querySelector(`#preview-${role}`);
  image.hidden = !blob;
  if (blob) { const url = URL.createObjectURL(blob); assetUrls.set(role, url); image.src = url; }
  else { assetUrls.delete(role); image.removeAttribute('src'); }
}
async function loadImages() {
  await Promise.all(['icon', 'logo', 'extensionIcon'].map(async (role) => {
    const response = await fetch(`/api/preview/${role}`, { headers: { 'X-Customize-Token': token } });
    setImage(role, response.ok ? await response.blob() : null);
  }));
}
function showDoctor(result) {
  const checks = document.querySelector('#checks');
  checks.replaceChildren(...result.checks.map((check) => {
    const item = document.createElement('li');
    item.className = check.ok ? 'ok' : 'pending';
    item.textContent = `${check.ok ? '✓' : '•'} ${check.label}`;
    return item;
  }));
}
async function save() {
  const result = await api('/api/save', readForm());
  populate(result.config);
  showMessage(result.message, 'success');
  return result;
}
function showBuild(state) {
  document.querySelector('#build-progress').hidden = !state.running;
  document.querySelector('#log-panel').hidden = !state.log;
  document.querySelector('#build-log').textContent = state.log;
  document.querySelector('#build-result').textContent = state.status === 'complete'
    ? `Instalador disponível em ${state.artifact}`
    : state.status === 'failed' ? 'A geração não foi concluída. Confira as mensagens.' : state.running ? 'Gerando o instalador…' : '';
  if (state.running) {
    setBusy(true);
    if (!polling) polling = setInterval(pollBuild, 1500);
  } else {
    clearInterval(polling);
    polling = undefined;
    setBusy(false);
  }
}
async function pollBuild() {
  try { showBuild(await api('/api/status')); } catch (error) {
    clearInterval(polling); polling = undefined; setBusy(false); showMessage(error.message, 'error');
  }
}

form.addEventListener('input', updatePreview);
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  setBusy(true);
  try { await save(); showDoctor(await api('/api/doctor')); } catch (error) { showMessage(error.message, 'error'); }
  finally { setBusy(false); }
});
document.querySelector('#template-button').addEventListener('click', async () => {
  setBusy(true);
  try {
    populate(await api('/api/template'));
    for (const role of ['icon', 'logo', 'extensionIcon']) setImage(role, null);
    showMessage('Modelo neutro carregado. Revise os campos e salve para aplicá-lo.');
  } catch (error) { showMessage(error.message, 'error'); }
  finally { setBusy(false); }
});
document.querySelector('#doctor-button').addEventListener('click', async () => {
  setBusy(true);
  try { showDoctor(await api('/api/doctor')); } catch (error) { showMessage(error.message, 'error'); }
  finally { setBusy(false); }
});
document.querySelector('#build-button').addEventListener('click', async () => {
  if (busy || !form.reportValidity()) return;
  setBusy(true);
  try { await save(); showDoctor(await api('/api/doctor')); showBuild(await api('/api/build', {})); }
  catch (error) { setBusy(false); showMessage(error.message, 'error'); }
});
for (const input of document.querySelectorAll('[data-asset]')) input.addEventListener('change', async () => {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) { showMessage('A imagem deve ter no máximo 4 MB.', 'error'); input.value = ''; return; }
  setBusy(true);
  try {
    const role = input.dataset.asset;
    const result = await api(`/api/assets/${role}`, file, true);
    form.elements.namedItem(role).value = result.path;
    setImage(role, file); updatePreview();
    showMessage('Imagem preparada. Salve a configuração para aplicá-la.');
  } catch (error) { showMessage(error.message, 'error'); }
  finally { input.value = ''; setBusy(false); }
});
for (const button of document.querySelectorAll('[data-clear]')) button.addEventListener('click', () => {
  const role = button.dataset.clear;
  form.elements.namedItem(role).value = '';
  setImage(role, null); updatePreview();
});

setBusy(true);
api('/api/config').then(async (result) => {
  populate(result.config); showBuild(result.build); await loadImages(); showDoctor(await api('/api/doctor'));
}).catch((error) => { showMessage(error.message, 'error'); });
