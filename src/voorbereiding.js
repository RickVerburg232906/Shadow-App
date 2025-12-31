import { getLunchOptions, updateLunchOptions, getDataStatus, updateDataStatus } from './firebase.js';
import { readWorkbook, sheetToRows, normalizeRows, importRowsToFirestore } from './excel-import.js';

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
    // Read planned dates from sessionStorage.rideConfig (prefer current-year map)
    let planned = [];
    try {
      const raw = sessionStorage.getItem('rideConfig');
      if (raw) {
        const rc = JSON.parse(raw || '{}');
        const currentYearKey = String((new Date()).getFullYear());
        let regions = {};
        if (rc && rc[currentYearKey] && typeof rc[currentYearKey] === 'object') regions = rc[currentYearKey];
        else if (rc && rc.regions && typeof rc.regions === 'object') regions = rc.regions;
        planned = Object.keys(regions || []).filter(Boolean);
      }
    } catch (e) { planned = []; }
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
      // try to persist to Firestore globals/lunch; fall back to sessionStorage on failure
      try {
        const res = await updateLunchOptions({ vastEten: vast, keuzeEten: keuze });
        if (res && res.success) {
          try { if (typeof window !== 'undefined' && typeof window.showScanSuccess === 'function') window.showScanSuccess('Lunch opgeslagen'); } catch(_){}
        } else {
          try { sessionStorage.setItem('lunch', JSON.stringify({ vastEten: vast, keuzeEten: keuze })); } catch(_){}
          try { if (typeof window !== 'undefined' && typeof window.showScanError === 'function') window.showScanError('Opslaan naar server mislukt — lokaal opgeslagen'); } catch(_){}
        }
      } catch (e) {
        try { sessionStorage.setItem('lunch', JSON.stringify({ vastEten: vast, keuzeEten: keuze })); } catch(_){}
        try { if (typeof window !== 'undefined' && typeof window.showScanError === 'function') window.showScanError('Opslaan mislukt — lokaal opgeslagen'); } catch(_){}
      }
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

function normalizeTimestampValue(ts) {
  try {
    if (!ts) return null;
    // Firestore Timestamp with toDate()
    if (typeof ts.toDate === 'function') {
      return ts.toDate().toISOString();
    }
    // Plain object with seconds/nanoseconds
    if (typeof ts === 'object' && ts.seconds && (ts.nanoseconds || ts.nanoseconds === 0)) {
      const ms = (Number(ts.seconds) * 1000) + Math.floor(Number(ts.nanoseconds) / 1e6);
      return new Date(ms).toISOString();
    }
    // ISO string
    if (typeof ts === 'string') {
      // try to parse; if invalid, return null
      const d = new Date(ts);
      if (!isNaN(d.getTime())) return d.toISOString();
      return null;
    }
    // numeric milliseconds or seconds
    if (typeof ts === 'number') {
      // heuristic: if > 1e12 it's ms, if ~1e9 it's seconds
      if (ts > 1e12) return new Date(ts).toISOString();
      return new Date(ts * 1000).toISOString();
    }
    return null;
  } catch (e) { return null; }
}

function wireDataUpload() {
  const badge = document.getElementById('data-status-badge');
  const lastEl = document.getElementById('data-last-update');
  const statusTop = document.querySelector('.data-status-top');
  const input = document.querySelector('.data-upload-btn input[type="file"]') || null;
  const dropzone = document.querySelector('.data-upload-dropzone') || null;
  const chooseBtn = document.querySelector('.data-upload-btn button') || null;

  function setStatus({ state = 'unknown', lastUpdated = null } = {}) {
    if (!badge) return;
    badge.textContent = state;
    if (lastEl) lastEl.textContent = lastUpdated ? `Laatste update: ${formatDateLong(lastUpdated)}` : 'Laatste update: onbekend';
    if (statusTop) {
      statusTop.innerHTML = state === 'Up-to-date' || state === 'Up-to-date (geen ritten)' ? '<span class="material-symbols-outlined">cloud_done</span>' : '<span class="material-symbols-outlined">cloud_off</span>';
    }
    // color: green when up-to-date, red when not
    try {
      if (state === 'Up-to-date' || state === 'Up-to-date (geen ritten)') {
        badge.style.color = '#059669';
      } else if (state === 'Verouderd') {
        // amber/orange for outdated
        badge.style.color = '#F59E0B';
      } else if (state === 'Niet geladen' || state === 'Onbekend' || state === 'Uploaden...') {
        badge.style.color = '';
      } else {
        badge.style.color = '#DC2626';
      }
    } catch (_) {}
  }

  // initialize status from firestore + planned dates
  (async () => {
    try {
      const st = await getDataStatus().catch(() => null);
      // read planned dates from sessionStorage instead of Firebase
      let planned = [];
      try {
        const raw = sessionStorage.getItem('rideConfig');
        if (raw) {
          const rc = JSON.parse(raw || '{}');
          const currentYearKey = String((new Date()).getFullYear());
          let regions = {};
          if (rc && rc[currentYearKey] && typeof rc[currentYearKey] === 'object') regions = rc[currentYearKey];
          else if (rc && rc.regions && typeof rc.regions === 'object') regions = rc.regions;
          planned = Object.keys(regions || []).filter(Boolean);
        }
      } catch (e) { planned = []; }
      const sorted = (Array.isArray(planned) ? planned.map(s => String(s).slice(0,10)).filter(Boolean).sort() : []);
      // helper to evaluate whether lastUpdated is after previous ride and before next ride
      function evaluate(lastUpdatedIso) {
        if (!lastUpdatedIso) return { ok: false, state: 'Niet geladen' };
        const lu = new Date(lastUpdatedIso).getTime();
        const today = new Date().toISOString().slice(0,10);
        let next = sorted.find(d => d >= today);
        if (!next) next = sorted[sorted.length - 1] || null;
        let prev = null;
        if (next) {
          const idx = sorted.indexOf(next);
          if (idx > 0) prev = sorted[idx - 1];
        } else if (sorted.length > 0) {
          prev = sorted[sorted.length - 1];
        }
        // compute boundaries
        let prevEnd = null;
        let nextStart = null;
        if (prev) prevEnd = new Date(prev + 'T23:59:59').getTime();
        if (next) nextStart = new Date(next + 'T00:00:00').getTime();
        // If no next and no prev, nothing to compare -> consider up-to-date
        if (!prev && !next) return { ok: true, state: 'Up-to-date (geen ritten)' };
        const afterPrev = prevEnd ? (lu > prevEnd) : true;
        const beforeNext = nextStart ? (lu < nextStart) : true;
        return { ok: afterPrev && beforeNext, state: (afterPrev && beforeNext) ? 'Up-to-date' : 'Verouderd' };
      }

      if (st && st.lastUpdated) {
        const parsed = normalizeTimestampValue(st.lastUpdated) || null;
        const ev = evaluate(parsed);
        setStatus({ state: ev.state, lastUpdated: parsed });
      } else if (st && st.filename) {
        const parsed = normalizeTimestampValue(st.lastUpdated) || new Date().toISOString();
        const ev = evaluate(parsed);
        setStatus({ state: ev.state, lastUpdated: parsed });
      } else {
        setStatus({ state: 'Niet geladen', lastUpdated: null });
      }
    } catch (e) { setStatus({ state: 'Onbekend', lastUpdated: null }); }
  })();

  input.addEventListener('change', async (ev) => {
    const file = (ev.target.files && ev.target.files[0]) ? ev.target.files[0] : null;
    if (!file) return;
    await processFile(file);
  });
  if (chooseBtn && input) {
    chooseBtn.addEventListener('click', (ev) => { ev.preventDefault(); input.click(); });
  }
  // Native label behavior will open the hidden input when clicked,
  // so we avoid programmatically calling `input.click()` to prevent duplicates.
  async function processFile(file) {
    if (!file) return;
    try {
      setStatus({ state: 'Uploaden...', lastUpdated: new Date().toISOString() });
      if (input) input.disabled = true;

      const wb = await readWorkbook(file);
      const rows = sheetToRows(wb);
      const norm = normalizeRows(rows || []);
      const res = await importRowsToFirestore(norm);

      // update globals/dataStatus so the UI shows 'Up-to-date' relative to the next ride
      try {
        await updateDataStatus({ lastUpdated: new Date().toISOString(), filename: file.name });
      } catch (e) { /* ignore */ }

      setStatus({ state: 'Up-to-date', lastUpdated: new Date().toISOString() });
      try { if (typeof window !== 'undefined' && typeof window.showScanSuccess === 'function') window.showScanSuccess(`Geüpload (${res.updated} records)`); } catch(_) {}
    } catch (e) {
      console.error('data upload failed', e);
      try { if (typeof window !== 'undefined' && typeof window.showScanError === 'function') window.showScanError('Upload mislukt'); } catch(_) {}
      setStatus({ state: 'Fout', lastUpdated: null });
    } finally {
      try { if (input) { input.value = ''; input.disabled = false; } } catch(_){ }
      // cleanup legacy dropzone styles if present
      try { const dz = document.querySelector('.data-upload-dropzone'); if (dz) { dz.style.background = ''; dz.style.borderColor = 'rgba(245,158,11,0.35)'; } } catch(_){ }
    }
  }
  if (dropzone) {
    dropzone.addEventListener('dragenter', (ev) => { ev.preventDefault(); try { dropzone.style.background = 'rgba(245,158,11,0.06)'; dropzone.style.borderColor = 'rgba(245,158,11,0.6)'; } catch(_){} });
    dropzone.addEventListener('dragover', (ev) => { ev.preventDefault(); });
    dropzone.addEventListener('dragleave', (ev) => { ev.preventDefault(); try { dropzone.style.background = ''; dropzone.style.borderColor = 'rgba(245,158,11,0.35)'; } catch(_){} });
    dropzone.addEventListener('drop', async (ev) => {
      ev.preventDefault();
      try { dropzone.style.background = ''; dropzone.style.borderColor = 'rgba(245,158,11,0.35)'; } catch(_){ }
      const file = (ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]) ? ev.dataTransfer.files[0] : null;
      if (!file) return;
      await processFile(file);
    });
  }

  // Also listen at document level so dragging over any child element
  // inside the dropzone still activates the dropzone visuals.
  document.addEventListener('dragover', (ev) => {
    try {
      const dz = ev.target && ev.target.closest && ev.target.closest('.data-upload-dropzone');
      if (!dz) return;
      dz.style.background = 'rgba(245,158,11,0.06)';
      dz.style.borderColor = 'rgba(245,158,11,0.6)';
    } catch (_) {}
  });
  document.addEventListener('dragleave', (ev) => {
    try {
      const dz = ev.target && ev.target.closest && ev.target.closest('.data-upload-dropzone');
      if (!dz) return;
      dz.style.background = '';
      dz.style.borderColor = 'rgba(245,158,11,0.35)';
    } catch (_) {}
  });
  document.addEventListener('drop', (ev) => {
    try {
      const dz = ev.target && ev.target.closest && ev.target.closest('.data-upload-dropzone');
      if (!dz) return;
      dz.style.background = '';
      dz.style.borderColor = 'rgba(245,158,11,0.35)';
    } catch (_) {}
  });
}

/* uploadToStorage removed */

export function initVoorbereiding() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { setNextRide(); initLunchUI(); wireDataUpload(); });
  } else {
    setNextRide(); initLunchUI(); wireDataUpload();
  }
}
