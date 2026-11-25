'use strict';
const form = document.querySelector('form');
const isReport = form.id === 'report-form';
const submit = document.querySelector('#submit');
const errorBox = document.querySelector('#error');
const statusLabel = document.querySelector('#progress-label');
const fileInput = document.querySelector('#files');
const progress = document.querySelector('#progress');
let limits;
let files = [];
let sending = false;
let submissionKey;
let previousContents;
const mb = bytes => `${(bytes / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} MB`;

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
  errorBox.focus();
}
function invalidFile(file) {
  if (!file.size) return 'File is empty';
  if (file.size > limits.maxFileBytes) return 'File is too large';
  const extension = '.' + file.name.split('.').pop().toLowerCase();
  if (!limits.allowedExtensions.includes(extension)) return 'Unsupported file type';
  if (file.name.length > 200 || /[\p{C}<>:"/\\]/u.test(file.name)) return 'Unsupported filename';
  return '';
}
function validSelection() {
  return !isReport || (files.length <= limits.maxFiles && files.reduce((n, file) => n + file.size, 0) <= limits.maxTotalBytes && files.every(file => !invalidFile(file)));
}
function updateButton() { submit.disabled = sending || !limits || !validSelection(); }
function renderFiles() {
  const list = document.querySelector('#file-list');
  list.replaceChildren();
  files.forEach((file, index) => {
    const row = document.createElement('li');
    const name = document.createElement('span');
    const problem = invalidFile(file);
    name.textContent = `${file.name} (${mb(file.size)})${problem ? ' — ' + problem : ''}`;
    if (problem) name.classList.add('invalid');
    const remove = document.createElement('button');
    remove.type = 'button'; remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${file.name}`);
    remove.disabled = sending;
    remove.addEventListener('click', () => { files.splice(index, 1); renderFiles(); });
    row.append(name, remove); list.append(row);
  });
  const summary = document.querySelector('#file-summary');
  summary.textContent = `${files.length} file${files.length === 1 ? '' : 's'} selected · ${mb(files.reduce((n, file) => n + file.size, 0))} total${validSelection() ? '' : ' — remove files to meet the limits above.'}`;
  summary.classList.toggle('invalid', !validSelection());
  updateButton();
}
fileInput?.addEventListener('change', () => {
  files.push(...fileInput.files);
  fileInput.value = '';
  renderFiles();
});

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function send(body) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', isReport ? '/api/form/new' : '/api/help');
    xhr.timeout = 180_000;
    xhr.setRequestHeader('Idempotency-Key', submissionKey);
    if (!isReport) xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.upload.onprogress = event => {
      if (progress && event.lengthComputable) {
        progress.value = Math.round(event.loaded / event.total * 100);
        statusLabel.textContent = progress.value === 100 ? 'Files uploaded. Checking and storing your report…' : `Uploading: ${progress.value}%`;
      }
    };
    const uncertain = () => reject(new Error('The connection was interrupted, so receipt could not be confirmed. Keep this page open and retry with the same contents; a retry will not create a second report.'));
    xhr.onerror = uncertain; xhr.ontimeout = uncertain; xhr.onabort = uncertain;
    xhr.onload = () => {
      let response;
      try { response = JSON.parse(xhr.responseText); } catch { return reject(new Error('The server returned an unexpected response. Keep this page open and try again.')); }
      if (xhr.status === 202 && response.status === 'received' && /^[a-f0-9]{24}$/.test(response.formId)) resolve(response);
      else reject(new Error(response.error || 'Submission could not be confirmed. Please try again.'));
    };
    xhr.send(body);
  });
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (sending || !limits || !validSelection() || !form.reportValidity()) return;
  const text = document.querySelector(isReport ? '#description' : '#message').value.trim();
  const subject = isReport ? '' : document.querySelector('#subject').value.trim();
  if (!text || (!isReport && !subject)) return showError('Please complete the required fields with more than whitespace.');
  const contents = JSON.stringify({ text, subject, files: files.map(f => [f.name, f.size, f.lastModified]) });
  if (!submissionKey || contents !== previousContents) { submissionKey = uuid(); previousContents = contents; }
  let body;
  if (isReport) {
    body = new FormData(); body.append('description', text);
    files.forEach(file => body.append('files', file));
  } else body = JSON.stringify({ subject, message: text });
  sending = true; errorBox.hidden = true;
  Array.from(form.elements).forEach(element => { element.disabled = true; });
  statusLabel.textContent = 'Submitting. Please keep this page open…';
  if (progress) { progress.hidden = false; progress.value = 0; }
  const beforeUnload = event => { event.preventDefault(); event.returnValue = ''; };
  window.addEventListener('beforeunload', beforeUnload);
  try {
    const result = await send(body);
    form.reset(); files = []; previousContents = undefined; submissionKey = undefined;
    form.hidden = true;
    document.querySelector('#reference').textContent = result.formId;
    const success = document.querySelector('#success');
    success.hidden = false; success.focus();
  } catch (error) { showError(error.message); }
  finally {
    sending = false;
    window.removeEventListener('beforeunload', beforeUnload);
    Array.from(form.elements).forEach(element => { element.disabled = false; });
    statusLabel.textContent = '';
    if (progress) progress.hidden = true;
    updateButton();
  }
});

fetch('/api/config', { cache: 'no-store' }).then(async response => {
  if (!response.ok) throw new Error('configuration');
  limits = await response.json();
  document.querySelector('#testing').hidden = !limits.testing;
  if (isReport) {
    fileInput.accept = limits.allowedExtensions.join(',');
    fileInput.disabled = false;
    document.querySelector('#limits').textContent = `Up to ${limits.maxFiles} files; ${mb(limits.maxFileBytes)} per file and ${mb(limits.maxTotalBytes)} combined.`;
  }
  updateButton();
}).catch(() => showError('The service is unavailable. Reload this page before entering your report.'));

// Remove the obsolete offline cache when an existing installation is upgraded.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => Promise.all(registrations.map(registration => registration.unregister()))).catch(() => {});
}
if ('caches' in window) caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key)))).catch(() => {});
