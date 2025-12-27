import { getPlannedDates, getLunchOptions, updateLunchOptions, updateDataStatus, getDataStatus } from './firestore.js';
import { initializeApp, getApp } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-storage.js';

function formatDutchShort(dateStr) {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    const parts = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).formatToParts(d);
    const wk = (parts.find(p => p.type === 'weekday') || {}).value || '';
    const day = (parts.find(p => p.type === 'day') || {}).value || '';
    const month = (parts.find(p => p.type === 'month') || {}).value || '';
    const cap = s => s ? (s.replace('.', '').charAt(0).toUpperCase() + s.replace('.', '').slice(1)) : s;
    return `${cap(wk)}, ${day} ${cap(month)}`;
  } catch (e) { return dateStr; }
}

async function setNextRide() {
  try {
    const el = document.getElementById('next-ride-date');
    if (!el) return;
    el.textContent = 'Laden...';
    const planned = await getPlannedDates().catch(() => []);
    if (!planned || planned.length === 0) { el.textContent = 'Geen geplande rit'; return; }
    const todayIso = new Date().toISOString().slice(0,10);
    const sorted = planned.slice().filter(Boolean).map(s => s.slice(0,10)).sort();
    let next = sorted.find(d => d >= todayIso);
    if (!next) next = sorted[sorted.length-1];
    el.textContent = formatDutchShort(next);
  } catch (e) {
    const el = document.getElementById('next-ride-date');
    if (el) el.textContent = 'Onbekend';
  }
}

// --- Lunch options UI logic ---
function makeRow(value = '') {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.alignItems = 'center';
  wrap.style.gap = '8px';

  const inputWrap = document.createElement('div');
  inputWrap.style.flex = '1';
  inputWrap.className = 'icon-input';
  const input = document.createElement('input');
  input.className = 'form-input';
  input.type = 'text';
  input.placeholder = '';
  input.value = value || '';
  input.style.padding = '8px';
  inputWrap.appendChild(input);

  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.title = 'Verwijder';
  btn.style.borderRadius = '10px';
  btn.style.padding = '8px';
  btn.style.background = '#FEF2F2';
  btn.style.border = '1px solid #FEE2E2';
  btn.style.color = '#B91C1C';
  btn.setAttribute('aria-label', 'Verwijder');
  const span = document.createElement('span');
  span.className = 'material-symbols-outlined';
  span.textContent = 'close';
  btn.appendChild(span);

  wrap.appendChild(inputWrap);
  wrap.appendChild(btn);

  return { wrap, input, btn };
}

function debounce(fn, wait = 600) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

export async function initLunchUI() {
  const vastList = document.querySelector('.vast-list');
  const keuzeList = document.querySelector('.keuze-list');
  const addVast = document.getElementById('add-vast');
  const addKeuze = document.getElementById('add-keuze');
  if (!vastList || !keuzeList || !addVast || !addKeuze) return;

  let current = { vastEten: [], keuzeEten: [] };

  async function load() {
    try {
      const opts = await getLunchOptions();
      current.vastEten = Array.isArray(opts.vastEten) ? opts.vastEten.slice() : [];
      current.keuzeEten = Array.isArray(opts.keuzeEten) ? opts.keuzeEten.slice() : [];
      renderAll();
    } catch (e) { console.warn('load lunch options failed', e); }
  }

  function clearContainer(c) { while (c.firstChild) c.removeChild(c.firstChild); }

  const saveDebounced = debounce(async () => {
    try {
      const vast = Array.from(vastList.querySelectorAll('input.form-input')).map(i => i.value.trim()).filter(Boolean);
      const keuze = Array.from(keuzeList.querySelectorAll('input.form-input')).map(i => i.value.trim()).filter(Boolean);
      const res = await updateLunchOptions({ vastEten: vast, keuzeEten: keuze });
      try {
        if (res && res.success) {
          if (typeof window !== 'undefined' && typeof window.showScanSuccess === 'function') window.showScanSuccess('Lunch opgeslagen');
        } else {
          if (typeof window !== 'undefined' && typeof window.showScanError === 'function') window.showScanError('Opslaan mislukt');
        }
      } catch (e) { /* ignore toast errors */ }
    } catch (e) { console.warn('save lunch failed', e); try { if (typeof window !== 'undefined' && typeof window.showScanError === 'function') window.showScanError('Opslaan mislukt'); } catch(_){} }
  }, 600);

  function wireRow(rowEl, inputEl, btnEl) {
    // Save when the user leaves the input (finished typing)
    inputEl.addEventListener('blur', () => saveDebounced());
    // Pressing Enter blurs the input so blur-save triggers immediately
    inputEl.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); inputEl.blur(); } });
    btnEl.addEventListener('click', () => {
      rowEl.remove();
      saveDebounced();
    });
  }

  function renderAll() {
    clearContainer(vastList);
    clearContainer(keuzeList);
    for (const v of current.vastEten) {
      const { wrap, input, btn } = makeRow(v);
      wireRow(wrap, input, btn);
      vastList.appendChild(wrap);
    }
    for (const k of current.keuzeEten) {
      const { wrap, input, btn } = makeRow(k);
      wireRow(wrap, input, btn);
      keuzeList.appendChild(wrap);
    }
  }

  addVast.addEventListener('click', (e) => {
    e.preventDefault();
    const { wrap, input, btn } = makeRow('');
    wireRow(wrap, input, btn);
    vastList.appendChild(wrap);
    input.focus();
    saveDebounced();
  });

  addKeuze.addEventListener('click', (e) => {
    e.preventDefault();
    const { wrap, input, btn } = makeRow('');
    wireRow(wrap, input, btn);
    keuzeList.appendChild(wrap);
    input.focus();
    saveDebounced();
  });

  await load();
}

function formatDateLong(iso) {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
  } catch (e) { return iso; }
}

function wireDataUpload() {
  try {
    const input = document.querySelector('.data-upload-btn input[type=file]');
    const statusBadge = document.getElementById('data-status-badge');
    const lastUpdateEl = document.getElementById('data-last-update');
    const statusIcon = document.querySelector('.data-status-top .material-symbols-outlined');
    if (!input || !statusBadge || !lastUpdateEl) return;

    // load existing status if present
    (async () => {
      try {
        const doc = await getDataStatus();
        if (!doc) return;
        if (doc.filename) statusBadge.textContent = 'Bijgewerkt';
        if (doc.lastUpdated) lastUpdateEl.textContent = 'Laatste update: ' + formatDateLong(doc.lastUpdated);
        const statusIcon = document.querySelector('.data-status-top .material-symbols-outlined');
        if (statusIcon && doc.downloadUrl) statusIcon.textContent = 'cloud_done';
      } catch (e) { /* ignore */ }
    })();

    input.addEventListener('change', async (ev) => {
      const file = input.files && input.files[0];
      if (!file) return;
      // optimistic UI
      statusBadge.textContent = 'Uploading...';
      if (statusIcon) statusIcon.textContent = 'cloud_upload';
      try {
        // ensure firebase app initialized
        try { getApp(); } catch (e) { initializeApp(window.firebaseConfigDev || {}); }

        const uploadResult = await uploadToStorage(file, (pct) => {
          try { statusBadge.textContent = `Uploading ${pct}%`; } catch(_){}
        });
        const nowIso = new Date().toISOString();
        const res = await updateDataStatus({ lastUpdated: nowIso, filename: file.name, downloadUrl: (uploadResult && uploadResult.url) || '' });
        if (res && res.success) {
          if (typeof window !== 'undefined' && typeof window.showScanSuccess === 'function') window.showScanSuccess('Data geüpload en status bijgewerkt');
          statusBadge.textContent = 'Bijgewerkt';
          lastUpdateEl.textContent = 'Laatste update: ' + formatDateLong(nowIso);
          if (statusIcon) statusIcon.textContent = 'cloud_done';
        } else {
          if (typeof window !== 'undefined' && typeof window.showScanError === 'function') window.showScanError('Bijwerken status mislukt');
          statusBadge.textContent = 'Fout';
          if (statusIcon) statusIcon.textContent = 'cloud_off';
        }
      } catch (e) {
        console.warn('data upload handler failed', e);
        // detect auth/storage errors and suggest checking Firebase Storage rules
        let msg = 'Upload mislukt';
        try { if (e && e.code && (e.code === 'storage/unauthorized' || e.code === 'auth/invalid-user-token')) msg = 'Upload geweigerd (controleer Storage regels of auth)'; } catch(_){ }
        if (typeof window !== 'undefined' && typeof window.showScanError === 'function') window.showScanError(msg);
        statusBadge.textContent = 'Fout';
        if (statusIcon) statusIcon.textContent = 'cloud_off';
      }
    });
  } catch (e) { console.warn('wireDataUpload failed', e); }
}

async function uploadToStorage(file, onProgress) {
  if (!file) throw new Error('missing file');
  try {
    const app = (() => { try { return getApp(); } catch (_) { return initializeApp(window.firebaseConfigDev || {}); } })();
    // Ensure storage is created with a valid bucket. Prefer app.options.storageBucket, fallback to window.firebaseConfigDev.storageBucket or projectId.appspot.com
    let storage;
    try {
      const hasDefaultBucket = app && app.options && app.options.storageBucket;
      if (hasDefaultBucket) storage = getStorage(app);
      else {
        const cfg = (typeof window !== 'undefined' && window.firebaseConfigDev) ? window.firebaseConfigDev : null;
        const bucketName = cfg && cfg.storageBucket ? cfg.storageBucket : (cfg && cfg.projectId ? (cfg.projectId + '.appspot.com') : null);
        if (bucketName) {
          const bucketUrl = bucketName.startsWith('gs://') ? bucketName : `gs://${bucketName}`;
          storage = getStorage(app, bucketUrl);
        } else {
          storage = getStorage(app);
        }
      }
    } catch (e) { storage = getStorage(app); }
    const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const path = `uploads/data/${Date.now()}_${safeName}`;
    const storageRef = ref(storage, path);
    const uploadTask = uploadBytesResumable(storageRef, file);
    return await new Promise((resolve, reject) => {
      uploadTask.on('state_changed', snapshot => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        if (onProgress) onProgress(pct);
      }, err => reject(err), async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({ url, path });
        } catch (e) { reject(e); }
      });
    });
  } catch (e) { throw e; }
}

export function initVoorbereiding() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { setNextRide(); initLunchUI(); wireDataUpload(); });
  } else {
    setNextRide(); initLunchUI(); wireDataUpload();
  }
}
