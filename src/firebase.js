// Firebase initialization with environment-based config selection
import { initializeApp, getApps, getApp, deleteApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore, doc, collection, getDoc, onSnapshot, setDoc, writeBatch, serverTimestamp, getDocs, query, where, orderBy } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const devConfig = {
  apiKey: "AIzaSyCwHJ1VIqM9s4tfh2hn8KZxqunuYySzuwQ",
  authDomain: "shadow-app-b3fb3.firebaseapp.com",
  projectId: "shadow-app-b3fb3",
  storageBucket: "shadow-app-b3fb3.firebasestorage.app",
  messagingSenderId: "38812973319",
  appId: "1:38812973319:web:1dd89a0ffa61af564f2da2"
};

const prodConfig = {
  apiKey: "AIzaSyBiV580AjErqJlOhwXR8VTNbY0b1DZJDwM",
  authDomain: "landelijke-rit.firebaseapp.com",
  projectId: "landelijke-rit",
  storageBucket: "landelijke-rit.firebasestorage.app",
  messagingSenderId: "1001186852750",
  appId: "1:1001186852750:web:317122d6d230188cd1eedf",
  measurementId: "G-33G3DH2YFZ"
};

const configs = { dev: devConfig, prod: prodConfig };

function detectVercelMainProduction() {
  try {
    // Vite / browser envs
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      const env = import.meta.env;
      const isVercel = env.VERCEL === '1' || env.VERCEL_ENV === 'production';
      const ref = env.VERCEL_GIT_COMMIT_REF || env.VITE_GIT_COMMIT_REF || env.GIT_BRANCH;
      if (isVercel && ref === 'main') return true;
    }
  } catch (e) {}

  try {
    // Node / server-side envs
    if (typeof process !== 'undefined' && process.env) {
      const env = process.env;
      const isVercel = env.VERCEL === '1' || env.VERCEL_ENV === 'production';
      const ref = env.VERCEL_GIT_COMMIT_REF || env.GIT_BRANCH || env.BRANCH;
      if (isVercel && ref === 'main') return true;
    }
  } catch (e) {}

  return false;
}

function detectHostProduction() {
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    const host = window.location.hostname;
    return host === 'landelijke-rit.firebaseapp.com' || host === 'landelijke-rit.web.app' || host.includes('landelijke-rit');
  }
  return false;
}

// Mode can be: 'prod' | 'dev' | 'auto'
let currentMode = 'auto';
let firebaseConfig = null;
let app = null;
let analytics = null;

function computeInitialMode() {
  const stored = (typeof window !== 'undefined' && window.localStorage) ? window.localStorage.getItem('firebaseMode') : null;
  if (stored === 'prod' || stored === 'dev') return stored;

  // auto: production only when Vercel published AND branch is main
  if (detectVercelMainProduction()) return 'prod';
  if (detectHostProduction()) return 'prod';
  return 'dev';
}

async function initFirebase(mode = computeInitialMode()) {
  currentMode = mode;
  firebaseConfig = configs[mode === 'prod' ? 'prod' : 'dev'];

  try {
    if (getApps().length) {
      const existing = getApp();
      await deleteApp(existing);
    }
  } catch (e) {}

  app = initializeApp(firebaseConfig);
  analytics = null;
  if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem('firebaseMode', mode);
  return { app, analytics, firebaseConfig, currentMode };
}

// Expose switch function to console and programmatically
async function switchFirebaseConfig(mode) {
  if (mode !== 'prod' && mode !== 'dev' && mode !== 'auto') throw new Error('mode must be "prod", "dev" or "auto"');
  if (mode === 'auto') mode = computeInitialMode();
  return initFirebase(mode);
}

// Initialize immediately
await initFirebase(computeInitialMode());

function showFirebaseDebug() {
  const mode = currentMode;
  const cfg = firebaseConfig || {};
  const maskedKey = cfg.apiKey ? cfg.apiKey.slice(0, 8) + '...' : undefined;
  const info = {
    mode,
    projectId: cfg.projectId,
    authDomain: cfg.authDomain,
    storageBucket: cfg.storageBucket,
    appId: cfg.appId,
    measurementId: cfg.measurementId,
    apiKey: maskedKey
  };
  if (typeof console !== 'undefined' && console.debug) console.debug('Firebase debug:', info);
  return info;
}

// Attach helpers to window for console switching and debugging
if (typeof window !== 'undefined') {
  window.switchFirebaseConfig = switchFirebaseConfig;
  window.setFirebaseMode = (m) => switchFirebaseConfig(m);
  window.__firebase_currentMode = () => currentMode;
  window.showFirebaseDebug = showFirebaseDebug;
  window.__firebase_debug = showFirebaseDebug;
}

export { app, analytics, firebaseConfig, currentMode as isProd, switchFirebaseConfig, showFirebaseDebug, initFirebase };

// Firestore / Storage exports for other modules
const db = getFirestore(app);
const storage = getStorage(app);

// REST helpers using Firestore REST API for lightweight operations used across the UI
function getBaseUrlForConfig(cfg) {
  const conf = cfg || firebaseConfig || configs.dev;
  const pid = (conf && conf.projectId) ? conf.projectId : configs.dev.projectId;
  return `https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents`;
}

function getApiKeyForConfig(cfg) {
  const conf = cfg || firebaseConfig || configs.dev;
  return (conf && conf.apiKey) ? conf.apiKey : configs.dev.apiKey;
}

function parseFirestoreValue(val) {
  if (!val) return null;
  if (val.stringValue !== undefined) return val.stringValue;
  if (val.timestampValue !== undefined) return val.timestampValue;
  if (val.integerValue !== undefined) return String(val.integerValue);
  if (val.doubleValue !== undefined) return String(val.doubleValue);
  return null;
}

// Caching for planned dates
let _plannedDatesCache = null;
let _plannedDatesCachePromise = null;

export async function getPlannedDates(forceRefresh = false) {
  try {
    if (!forceRefresh) {
      if (_plannedDatesCache) return _plannedDatesCache;
      if (_plannedDatesCachePromise) return await _plannedDatesCachePromise;
    }

    _plannedDatesCachePromise = (async () => {
      const BASE_URL = getBaseUrlForConfig();
      const apiKey = getApiKeyForConfig();
      const url = `${BASE_URL}/globals/rideConfig?key=${apiKey}`;
      const res = await fetch(url, { method: 'GET', credentials: 'omit' });
      if (!res.ok) {
        console.warn('getPlannedDates: fetch failed', res.status, res.statusText);
        _plannedDatesCache = [];
        _plannedDatesCachePromise = null;
        return _plannedDatesCache;
      }
      const data = await res.json();
      const fields = data && data.fields;
      if (!fields || !fields.plannedDates) { _plannedDatesCache = []; _plannedDatesCachePromise = null; return _plannedDatesCache; }
      const arr = fields.plannedDates.arrayValue && fields.plannedDates.arrayValue.values ? fields.plannedDates.arrayValue.values : [];
      const out = arr.map(v => parseFirestoreValue(v) || '').filter(Boolean).map(s => {
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
        const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
        if (m) return m[1];
        try { const d = new Date(s); if (!isNaN(d)) return d.toISOString().slice(0,10); } catch(_){}
        return s;
      }).filter(Boolean);
      _plannedDatesCache = out;
      _plannedDatesCachePromise = null;
      return out;
    })();

    return await _plannedDatesCachePromise;
  } catch (e) {
    console.error('getPlannedDates error', e);
    return ['ERROR'];
  }
}

export function clearPlannedDatesCache() { _plannedDatesCache = null; _plannedDatesCachePromise = null; }

export async function getRideConfig() {
  try {
    const BASE_URL = getBaseUrlForConfig();
    const apiKey = getApiKeyForConfig();
    const url = `${BASE_URL}/globals/rideConfig?key=${apiKey}`;
    const res = await fetch(url, { method: 'GET', credentials: 'omit' });
    if (!res.ok) {
      console.warn('getRideConfig: fetch failed', res.status, res.statusText);
      return { plannedDates: [], regions: {} };
    }
    const data = await res.json();
    const fields = data && data.fields ? data.fields : {};
    const arr = fields.plannedDates && fields.plannedDates.arrayValue && Array.isArray(fields.plannedDates.arrayValue.values) ? fields.plannedDates.arrayValue.values : [];
    const plannedDates = arr.map(v => parseFirestoreValue(v) || '').filter(Boolean).map(s => {
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
      const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
      if (m) return m[1];
      try { const d = new Date(s); if (!isNaN(d)) return d.toISOString().slice(0,10); } catch(_){}
      return s;
    }).filter(Boolean);

    const regions = {};
    if (fields.regions && fields.regions.mapValue && fields.regions.mapValue.fields) {
      const map = fields.regions.mapValue.fields;
      for (const k of Object.keys(map)) {
        const v = map[k];
        const parsed = parseFirestoreValue(v);
        regions[k] = parsed !== null && parsed !== undefined ? parsed : '';
      }
    }
    return { plannedDates, regions };
  } catch (e) {
    console.error('getRideConfig error', e);
    return { plannedDates: [], regions: {} };
  }
}

export async function updateRideConfig({ plannedDates = [], regions = {} } = {}) {
  try {
    const BASE_URL = getBaseUrlForConfig();
    const apiKey = getApiKeyForConfig();
    const url = `${BASE_URL}/globals/rideConfig?key=${apiKey}`;
    const fields = {};
    if (Array.isArray(plannedDates)) fields.plannedDates = { arrayValue: { values: plannedDates.map(d => ({ stringValue: String(d) })) } };
    else fields.plannedDates = { arrayValue: { values: [] } };
    const regionsFields = {};
    for (const k of Object.keys(regions || {})) regionsFields[String(k)] = { stringValue: String(regions[k] || '') };
    fields.regions = { mapValue: { fields: regionsFields } };
    const body = { fields };
    const finalUrl = url + '&updateMask.fieldPaths=plannedDates&updateMask.fieldPaths=regions';
    const res = await fetch(finalUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      const txt = await res.text().catch(() => '<no body>');
      console.warn('updateRideConfig failed', res.status, res.statusText, txt);
      return { success: false, status: res.status, statusText: res.statusText, raw: txt };
    }
    const json = await res.json();
    try { clearPlannedDatesCache(); } catch(_){}
    return { success: true, raw: json };
  } catch (e) {
    console.error('updateRideConfig error', e);
    return { success: false, error: String(e) };
  }
}

export async function getLunchOptions() {
  try {
    const BASE_URL = getBaseUrlForConfig();
    const apiKey = getApiKeyForConfig();
    const url = `${BASE_URL}/globals/lunch?key=${apiKey}`;
    const res = await fetch(url, { method: 'GET', credentials: 'omit' });
    if (!res.ok) { console.warn('getLunchOptions: fetch failed', res.status, res.statusText); return { vastEten: ['ERROR'], keuzeEten: ['ERROR'] }; }
    const data = await res.json();
    const fields = data && data.fields ? data.fields : {};
    const parseArrayField = (f) => { try { if (!f) return []; const arr = f.arrayValue && Array.isArray(f.arrayValue.values) ? f.arrayValue.values : []; return arr.map(v => parseFirestoreValue(v)).filter(Boolean); } catch(_) { return []; } };
    const vast = parseArrayField(fields.vastEten);
    const keuze = parseArrayField(fields.keuzeEten);
    return { vastEten: vast, keuzeEten: keuze };
  } catch (e) { console.error('getLunchOptions error', e); return { vastEten: ['ERROR'], keuzeEten: ['ERROR'] }; }
}

export async function getMemberById(id) {
  if (!id) return null;
  try {
    const BASE_URL = getBaseUrlForConfig();
    const apiKey = getApiKeyForConfig();
    const url = `${BASE_URL}/members/${encodeURIComponent(id)}?key=${apiKey}`;
    const res = await fetch(url, { method: 'GET', credentials: 'omit' });
    if (!res.ok) { console.warn('getMemberById: fetch failed', res.status, res.statusText); return null; }
    const data = await res.json();
    if (!data || !data.fields) return null;
    const out = {};
    for (const k of Object.keys(data.fields)) {
      const v = data.fields[k];
      if (!v) { out[k] = null; continue; }
      if (v.arrayValue && Array.isArray(v.arrayValue.values)) out[k] = v.arrayValue.values.map(x => parseFirestoreValue(x)).filter(x => x !== null);
      else out[k] = parseFirestoreValue(v);
    }
    return out;
  } catch (e) { console.error('getMemberById error', e); return null; }
}

export async function searchMembers(prefix, maxResults = 8) {
  try {
    prefix = (prefix || '').trim(); if (!prefix) return [];
    const apiKey = getApiKeyForConfig();
    const url = `https://firestore.googleapis.com/v1/projects/${(firebaseConfig && firebaseConfig.projectId) || configs.dev.projectId}/databases/(default)/documents:runQuery?key=${apiKey}`;
    function escapeFieldPath(fieldPath) { return fieldPath.split('.').map(tok => { if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tok)) return tok; return '`'+tok+'`'; }).join('.'); }
    const makeBody = (fieldPath, limitCount) => { const fp = escapeFieldPath(fieldPath); return { structuredQuery: { from: [{ collectionId: 'members' }], where: { fieldFilter: { field: { fieldPath: fp }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: prefix } } }, orderBy: [{ field: { fieldPath: fp }, direction: 'ASCENDING' }], limit: limitCount } }; };
    const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
    const limitCount = Math.max(maxResults * 2, 16);
    const bodies = [makeBody('Naam', limitCount), makeBody('Voor naam', limitCount)];
    const results = [];
    for (const bdy of bodies) {
      try {
        const res = await fetch(url, Object.assign({}, opts, { body: JSON.stringify(bdy) }));
        if (!res.ok) { const text = await res.text().catch(() => '<no body>'); console.warn('searchMembers: runQuery failed', res.status, res.statusText, text); continue; }
        const arr = await res.json();
        for (const entry of arr) {
          if (entry && entry.document && entry.document.name) {
            const id = entry.document.name.split('/').pop();
            const f = entry.document.fields || {};
            const naam = f.Naam ? (f.Naam.stringValue || '') : '';
            const voor = f['Voor naam'] ? (f['Voor naam'].stringValue || '') : '';
            results.push({ id, naam, voor });
          }
        }
      } catch (e) { console.error('searchMembers fetch error', e); }
    }
    if (results.length === 0) {
      try {
        const listUrl = `${getBaseUrlForConfig()}/members?pageSize=200&key=${apiKey}`;
        const listRes = await fetch(listUrl, { method: 'GET' });
        if (listRes.ok) {
          const listJson = await listRes.json();
          const docs = listJson.documents || [];
          for (const docu of docs) {
            const id = docu.name ? docu.name.split('/').pop() : null;
            const f = docu.fields || {};
            const naam = f.Naam ? (f.Naam.stringValue || '') : '';
            const voor = f['Voor naam'] ? (f['Voor naam'].stringValue || '') : '';
            if (id) results.push({ id, naam, voor });
          }
        } else { console.warn('searchMembers: fallback list fetch failed', listRes.status, listRes.statusText); }
      } catch (e) { console.error('searchMembers fallback error', e); }
    }
    const pl = prefix.toLowerCase();
    const filtered = results.filter(r => { const naam = (r.naam || '').toLowerCase(); const voor = (r.voor || '').toLowerCase(); return (naam && naam.startsWith(pl)) || (voor && voor.startsWith(pl)); });
    const map = new Map(); for (const d of filtered) if (!map.has(d.id)) map.set(d.id, d);
    return Array.from(map.values()).slice(0, maxResults);
  } catch (e) { console.error('searchMembers error', e); return []; }
}

export async function getLunchChoiceCount(choice) {
  try {
    if (!choice) return 0;
    const apiKey = getApiKeyForConfig();
    const url = `https://firestore.googleapis.com/v1/projects/${(firebaseConfig && firebaseConfig.projectId) || configs.dev.projectId}/databases/(default)/documents:runQuery?key=${apiKey}`;
    const nowIso = new Date().toISOString();
    const body = { structuredQuery: { from: [{ collectionId: 'members' }], where: { compositeFilter: { op: 'AND', filters: [ { fieldFilter: { field: { fieldPath: 'lunchKeuze' }, op: 'EQUAL', value: { stringValue: String(choice) } } }, { fieldFilter: { field: { fieldPath: 'lunchExpires' }, op: 'GREATER_THAN', value: { timestampValue: nowIso } } } ] } }, limit: 5000 } };
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) { const text = await res.text().catch(() => '<no body>'); console.warn('getLunchChoiceCount: runQuery failed', res.status, res.statusText, text); return 'ERROR'; }
    const arr = await res.json(); let count = 0; for (const entry of arr) if (entry && entry.document && entry.document.name) count++;
    return count;
  } catch (e) { console.error('getLunchChoiceCount error', e); return 'ERROR'; }
}

export async function getParticipationCount(choice) {
  try {
    if (!choice) return 0;
    const apiKey = getApiKeyForConfig();
    const url = `https://firestore.googleapis.com/v1/projects/${(firebaseConfig && firebaseConfig.projectId) || configs.dev.projectId}/databases/(default)/documents:runQuery?key=${apiKey}`;
    const variants = [];
    const c = String(choice || '').toLowerCase();
    if (c === 'yes' || c === 'ja') variants.push('yes','ja');
    else if (c === 'no' || c === 'nee') variants.push('no','nee');
    else variants.push(String(choice));
    let total = 0; const seen = new Set();
    for (const v of variants) {
      if (!v) continue; if (seen.has(v)) continue; seen.add(v);
      const nowIso = new Date().toISOString();
      const body = { structuredQuery: { from: [{ collectionId: 'members' }], where: { compositeFilter: { op: 'AND', filters: [ { fieldFilter: { field: { fieldPath: 'lunchDeelname' }, op: 'EQUAL', value: { stringValue: String(v) } } }, { fieldFilter: { field: { fieldPath: 'lunchExpires' }, op: 'GREATER_THAN', value: { timestampValue: nowIso } } } ] } }, limit: 5000 } };
      try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) { const text = await res.text().catch(() => '<no body>'); console.warn('getParticipationCount: runQuery failed', res.status, res.statusText, text); continue; }
        const arr = await res.json(); for (const entry of arr) if (entry && entry.document && entry.document.name) total++;
      } catch (e) { console.error('getParticipationCount fetch error for', v, e); }
    }
    return total;
  } catch (e) { console.error('getParticipationCount error', e); return 'ERROR'; }
}

export async function listAllMembers(pageSize = 500) {
  try {
    const apiKey = getApiKeyForConfig();
    const out = [];
    let url = `${getBaseUrlForConfig()}/members?pageSize=${pageSize}&key=${apiKey}`;
    while (url) {
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) { const txt = await res.text().catch(() => '<no body>'); console.warn('listAllMembers fetch failed', res.status, res.statusText, txt); break; }
      const json = await res.json();
      const docs = json.documents || [];
      for (const docu of docs) {
        const id = docu.name ? docu.name.split('/').pop() : null;
        const f = docu.fields || {};
        const parsed = { id };
        for (const k of Object.keys(f)) {
          const v = f[k]; if (!v) { parsed[k] = null; continue; }
          if (v.arrayValue && Array.isArray(v.arrayValue.values)) parsed[k] = v.arrayValue.values.map(x => parseFirestoreValue(x)).filter(x => x !== null);
          else parsed[k] = parseFirestoreValue(v);
        }
        out.push(parsed);
      }
      if (json.nextPageToken) url = `${getBaseUrlForConfig()}/members?pageSize=${pageSize}&pageToken=${json.nextPageToken}&key=${apiKey}`;
      else url = null;
    }
    return out;
  } catch (e) { console.error('listAllMembers error', e); return []; }
}

export async function getAdminPasswords() {
  try {
    const url = `${getBaseUrlForConfig()}/globals/passwords?key=${getApiKeyForConfig()}`;
    const res = await fetch(url, { method: 'GET', credentials: 'omit' });
    if (!res.ok) { console.warn('getAdminPasswords: fetch failed', res.status, res.statusText); return { inschrijftafel: 'ERROR', hoofdadmin: 'ERROR' }; }
    const data = await res.json(); const fields = data && data.fields ? data.fields : {}; const ins = fields.inschrijftafel ? parseFirestoreValue(fields.inschrijftafel) : null; const hoofd = fields.hoofdadmin ? parseFirestoreValue(fields.hoofdadmin) : null; return { inschrijftafel: String(ins || 'Shadow'), hoofdadmin: String(hoofd || '1100') };
  } catch (e) { console.error('getAdminPasswords error', e); return { inschrijftafel: 'ERROR', hoofdadmin: 'ERROR' }; }
}

export async function updateAdminPasswords({ inschrijftafel = undefined, hoofdadmin = undefined } = {}) {
  try {
    const url = `${getBaseUrlForConfig()}/globals/passwords?key=${getApiKeyForConfig()}`;
    const fields = {};
    if (inschrijftafel !== undefined) fields.inschrijftafel = { stringValue: String(inschrijftafel) };
    if (hoofdadmin !== undefined) fields.hoofdadmin = { stringValue: String(hoofdadmin) };
    if (Object.keys(fields).length === 0) return { success: false, error: 'no_fields' };
    const body = { fields };
    let finalUrl = url; for (const p of Object.keys(fields)) finalUrl += `&updateMask.fieldPaths=${encodeURIComponent(p)}`;
    const res = await fetch(finalUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) { const txt = await res.text().catch(() => '<no body>'); console.warn('updateAdminPasswords failed', res.status, res.statusText, txt); return { success: false, status: res.status, statusText: res.statusText, raw: txt }; }
    const json = await res.json(); return { success: true, raw: json };
  } catch (e) { console.error('updateAdminPasswords error', e); return { success: false, error: String(e) }; }
}

export async function updateLunchOptions({ vastEten = undefined, keuzeEten = undefined } = {}) {
  try {
    const url = `${getBaseUrlForConfig()}/globals/lunch?key=${getApiKeyForConfig()}`;
    const fields = {};
    if (vastEten !== undefined) fields.vastEten = { arrayValue: { values: (Array.isArray(vastEten) ? vastEten : []).map(v => ({ stringValue: String(v) })) } };
    if (keuzeEten !== undefined) fields.keuzeEten = { arrayValue: { values: (Array.isArray(keuzeEten) ? keuzeEten : []).map(v => ({ stringValue: String(v) })) } };
    if (Object.keys(fields).length === 0) return { success: false, error: 'no_fields' };
    const body = { fields };
    let finalUrl = url; for (const p of Object.keys(fields)) finalUrl += `&updateMask.fieldPaths=${encodeURIComponent(p)}`;
    const res = await fetch(finalUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) { const txt = await res.text().catch(() => '<no body>'); console.warn('updateLunchOptions failed', res.status, res.statusText, txt); return { success: false, status: res.status, statusText: res.statusText, raw: txt }; }
    const json = await res.json(); return { success: true, raw: json };
  } catch (e) { console.error('updateLunchOptions error', e); return { success: false, error: String(e) }; }
}

export async function updateDataStatus({ lastUpdated = undefined, filename = undefined, downloadUrl = undefined } = {}) {
  try {
    if (lastUpdated === undefined && filename === undefined && downloadUrl === undefined) return { success: false, error: 'no_fields' };
    const payload = {};
    if (lastUpdated !== undefined) { try { payload.lastUpdated = lastUpdated ? new Date(String(lastUpdated)) : serverTimestamp(); } catch(_) { payload.lastUpdated = serverTimestamp(); } }
    if (filename !== undefined) payload.filename = String(filename || '');
    if (downloadUrl !== undefined) payload.downloadUrl = String(downloadUrl || '');
    await setDoc(doc(db, 'globals', 'dataStatus'), payload, { merge: true });
    return { success: true };
  } catch (e) { console.error('updateDataStatus error', e); return { success: false, error: String(e) }; }
}

export async function getDataStatus() {
  try {
    const url = `${getBaseUrlForConfig()}/globals/dataStatus?key=${getApiKeyForConfig()}`;
    const res = await fetch(url, { method: 'GET', credentials: 'omit' });
    if (!res.ok) { console.warn('getDataStatus: fetch failed', res.status, res.statusText); return null; }
    const data = await res.json(); const fields = data && data.fields ? data.fields : {}; const out = {};
    if (fields.lastUpdated && fields.lastUpdated.timestampValue) out.lastUpdated = fields.lastUpdated.timestampValue;
    if (fields.filename && fields.filename.stringValue) out.filename = fields.filename.stringValue;
    if (fields.downloadUrl && fields.downloadUrl.stringValue) out.downloadUrl = fields.downloadUrl.stringValue;
    return out;
  } catch (e) { console.error('getDataStatus error', e); return null; }
}

export { db, doc, collection, getDoc, onSnapshot, setDoc, writeBatch, serverTimestamp, getDocs, query, where, orderBy, storage, ref, uploadBytes, getDownloadURL };
