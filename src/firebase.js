// Minimal firebase loader: only what we need to fetch `globals/lunch` and `globals/rideConfig`
// Use CDN ESM builds so browser can load modules directly (avoids bare specifier resolution issues on static hosts)
import { initializeApp, getApps, getApp, deleteApp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import { getFirestore, doc, getDoc, collection, onSnapshot, setDoc, updateDoc, writeBatch, serverTimestamp, getDocs, query, where, orderBy, deleteField } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js';

// Runtime-only configuration: import the generated JSON runtime config so bundlers
// can inline it and we avoid top-level await issues.
let app = null;
let db = null;
let storage = null;
let firebaseConfig = null;

import runtimeConfig from '../assets/firebase-runtime-config.js';
try { if (typeof window !== 'undefined' && !window.__FIREBASE_RUNTIME_CONFIG) window.__FIREBASE_RUNTIME_CONFIG = runtimeConfig; } catch(_) {}

function initFirebase() {
    if (db) return { app, db };
    // Expect a generated runtime config to be present on the window
    const runtime = (typeof window !== 'undefined' && window.__FIREBASE_RUNTIME_CONFIG) ? window.__FIREBASE_RUNTIME_CONFIG : null;
    if (!runtime || !runtime.config) {
        console.warn('No runtime firebase config found (window.__FIREBASE_RUNTIME_CONFIG).');
        return { app: null, db: null };
    }
    const cfg = runtime.config;
    firebaseConfig = Object.assign({ _env: runtime.env || 'prod' }, cfg);
    try {
        if (getApps().length) {
            try { const existing = getApp(); deleteApp(existing); } catch(_) {}
        }
    } catch(_) {}
    app = initializeApp(cfg);
    try { db = getFirestore(app); } catch(_) { db = null; }
    try { storage = getStorage(app); } catch(_) { storage = null; }
    try {
        const env = (firebaseConfig && firebaseConfig._env) ? firebaseConfig._env : 'prod';
        try { if (typeof window !== 'undefined') window._firebaseEnv = env; } catch(_) {}
        try { console.info('Firebase initialized — env:', env, firebaseConfig && firebaseConfig.projectId ? firebaseConfig.projectId : ''); } catch(_) {}
        try { window.dispatchEvent(new CustomEvent('firebase:env', { detail: { env: env, projectId: firebaseConfig && firebaseConfig.projectId } })); } catch(_) {}
    } catch(_) {}
    return { app, db };
}

// Show a small debug banner on the page indicating which Firebase project/env is active
function showFirebaseDebugBanner() {
    try {
        if (typeof document === 'undefined') return;
        const existing = document.getElementById('shadow-db-debug');
        if (existing) return;
        const env = (firebaseConfig && firebaseConfig._env) ? firebaseConfig._env : 'prod';
        const pid = (firebaseConfig && firebaseConfig.projectId) ? firebaseConfig.projectId : '';
        const el = document.createElement('div');
        el.id = 'shadow-db-debug';
        el.style.position = 'fixed';
        el.style.right = '12px';
        el.style.top = '12px';
        el.style.zIndex = 2147483000;
        el.style.background = 'rgba(0,0,0,0.7)';
        el.style.color = '#fff';
        el.style.padding = '6px 10px';
        el.style.borderRadius = '6px';
        el.style.fontSize = '12px';
        el.style.fontFamily = 'sans-serif';
        el.textContent = `Firebase: ${env} ${pid}`;
        try { document.body.appendChild(el); } catch(_) {}
    } catch(_) {}
}

async function getLunchOptions() {
    try {
        if (!db) initFirebase();
        if (!db) throw new Error('Firestore not initialized');
        const dref = doc(db, 'globals', 'lunch');
        const snap = await getDoc(dref).catch(()=>null);
        if (!snap || (typeof snap.exists === 'function' ? !snap.exists() : !snap._document)) throw new Error('globals/lunch not found');
        const data = typeof snap.data === 'function' ? snap.data() : (snap || {});
        const vast = Array.isArray(data.vastEten) ? data.vastEten : [];
        const keuze = Array.isArray(data.keuzeEten) ? data.keuzeEten : [];
        const out = { vastEten: vast.slice(), keuzeEten: keuze.slice() };
        try { sessionStorage.setItem('lunch', JSON.stringify(out)); } catch(_) {}
        return out;
    } catch (e) { console.warn('getLunchOptions error', e); return null; }
}

// Update lunch options under globals/lunch (merge)
async function updateLunchOptions(obj) {
    try {
        if (!obj || typeof obj !== 'object') throw new Error('invalid payload');
        if (!db) initFirebase();
        if (!db) throw new Error('Firestore not initialized');
        const dref = doc(db, 'globals', 'lunch');
        // Include an `updatedAt` server timestamp so callers can detect when lunch options changed
        await setDoc(dref, { vastEten: Array.isArray(obj.vastEten) ? obj.vastEten : [], keuzeEten: Array.isArray(obj.keuzeEten) ? obj.keuzeEten : [], updatedAt: serverTimestamp() }, { merge: true });
        try { sessionStorage.setItem('lunch', JSON.stringify({ vastEten: Array.isArray(obj.vastEten) ? obj.vastEten : [], keuzeEten: Array.isArray(obj.keuzeEten) ? obj.keuzeEten : [] })); } catch(_){}
        return { success: true };
    } catch (e) { console.error('updateLunchOptions error', e); return { success: false, error: (e && e.message) ? e.message : String(e) }; }
}

// Get dataStatus from globals/dataStatus
async function getDataStatus() {
    try {
        if (!db) initFirebase();
        if (!db) return null;
        const dref = doc(db, 'globals', 'dataStatus');
        const snap = await getDoc(dref).catch(()=>null);
        if (!snap || (typeof snap.exists === 'function' ? !snap.exists() : !snap._document)) return null;
        const data = typeof snap.data === 'function' ? snap.data() : snap;
        return data;
    } catch (e) { console.error('getDataStatus error', e); return null; }
}

// Update globals/dataStatus with { lastUpdated, filename }
async function updateDataStatus(obj) {
    try {
        if (!obj || typeof obj !== 'object') throw new Error('invalid payload');
        if (!db) initFirebase();
        if (!db) throw new Error('Firestore not initialized');
        const dref = doc(db, 'globals', 'dataStatus');
        // Ensure `lastupload` is stored as a Firestore timestamp (server-side) rather than a string.
        // Preserve other provided fields (e.g. filename, lastUpdated) for backward compatibility.
        const payload = Object.assign({}, obj);
        try { delete payload.lastupload; } catch(_) {}
        // use serverTimestamp() so Firestore stores a true timestamp value
        payload.lastupload = serverTimestamp();
        await setDoc(dref, payload, { merge: true });
        return { success: true };
    } catch (e) { console.error('updateDataStatus error', e); return { success: false, error: (e && e.message) ? e.message : String(e) }; }
}

async function getRideConfig() {
    if (!db) initFirebase();
    if (!db) throw new Error('Firestore not initialized');
    const dref = doc(db, 'globals', 'rideConfig');
    const snap = await getDoc(dref).catch(() => null);
    if (!snap || (typeof snap.exists === 'function' ? !snap.exists() : !snap._document)) {
        // No rideConfig defined in Firestore — return a safe default instead of throwing.
        const def = { regions: {} };
        try { if (typeof window !== 'undefined') window._rideConfig = def; } catch(_){}
        return def;
    }
    const data = typeof snap.data === 'function' ? snap.data() : snap;
    // Keep a runtime-only in-memory copy so callers can access without persisting.
    try { if (typeof window !== 'undefined') window._rideConfig = data; } catch(_) {}
    return data;
}

async function getPlannedDates() {
    // Prefer a local cached sessionStorage copy when available to avoid a network fetch
    try {
        if (typeof sessionStorage !== 'undefined') {
            const raw = sessionStorage.getItem('rideConfig');
            if (raw) {
                try {
                    const obj = JSON.parse(raw);
                    const currentYear = String((new Date()).getFullYear());
                    if (obj && obj[currentYear] && typeof obj[currentYear] === 'object') {
                        const keys = Object.keys(obj[currentYear]).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k));
                        keys.sort();
                        return keys;
                    }
                    if (obj && obj.regions && typeof obj.regions === 'object') {
                        const keys = Object.keys(obj.regions).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k));
                        keys.sort();
                        return keys;
                    }
                    if (obj && Array.isArray(obj.plannedDates)) return obj.plannedDates.slice();
                } catch (_) { /* fall through to fetching from Firestore */ }
            }
        }
    } catch (_) {}

    const cfg = await getRideConfig();
    if (!cfg || typeof cfg !== 'object') return [];
    const currentYear = String((new Date()).getFullYear());
    // Prefer per-year storage under cfg.<year> (top-level field for each year)
    try {
        if (cfg && cfg[currentYear] && typeof cfg[currentYear] === 'object') {
            const datesObj = cfg[currentYear];
            if (datesObj && typeof datesObj === 'object') {
                const keys = Object.keys(datesObj).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k));
                keys.sort();
                return keys;
            }
        }
    } catch (_) { /* fall through to legacy behavior */ }
    // Backwards-compatible: respect explicit plannedDates array if present
    if (Array.isArray(cfg.plannedDates)) return cfg.plannedDates.slice();
    // Legacy: fall back to using regions keys as dates
    if (cfg.regions && typeof cfg.regions === 'object') {
        const keys = Object.keys(cfg.regions).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k));
        keys.sort();
        return keys;
    }
    // No planned dates available — return empty array
    return [];
}

// Count members that have a given lunchChoice value using Firestore SDK queries.
async function getLunchChoiceCount(choice) {
    try {
        if (!choice) return 0;
        if (!db) initFirebase();
        if (!db) return 'ERROR';
        const now = new Date();
        const q = query(collection(db, 'members'), where('lunchKeuze', '==', String(choice)), where('lunchExpires', '>', now));
        const snap = await getDocs(q).catch(() => null);
        if (!snap || !Array.isArray(snap.docs)) return 0;
        return snap.docs.length;
    } catch (e) { console.error('getLunchChoiceCount error', e); return 'ERROR'; }
}

// Count members by participation value (handles yes/ja and no/nee) using SDK queries
async function getParticipationCount(choice) {
    try {
        if (!choice) return 0;
        if (!db) initFirebase();
        if (!db) return 'ERROR';
        const variants = [];
        const c = String(choice || '').toLowerCase();
        if (c === 'yes' || c === 'ja') variants.push('yes', 'ja');
        else if (c === 'no' || c === 'nee') variants.push('no', 'nee');
        else variants.push(String(choice));

        let total = 0;
        const seen = new Set();
        const now = new Date();
        for (const v of variants) {
            if (!v) continue;
            if (seen.has(v)) continue; seen.add(v);
            const q = query(collection(db, 'members'), where('lunchDeelname', '==', String(v)), where('lunchExpires', '>', now));
            try {
                const snap = await getDocs(q).catch(()=>null);
                if (snap && Array.isArray(snap.docs)) total += snap.docs.length;
            } catch (e) { console.error('getParticipationCount query error for', v, e); }
        }
        return total;
    } catch (e) { console.error('getParticipationCount error', e); return 'ERROR'; }
}

// Read admin passwords from globals/passwords
async function getAdminPasswords() {
    try {
        if (!db) initFirebase();
        if (!db) return { inschrijftafel: 'Shadow', hoofdadmin: '1100' };
        const dref = doc(db, 'globals', 'passwords');
        const snap = await getDoc(dref).catch(()=>null);
        if (!snap || (typeof snap.exists === 'function' ? !snap.exists() : !snap._document)) return { inschrijftafel: 'Shadow', hoofdadmin: '1100' };
        const data = typeof snap.data === 'function' ? snap.data() : snap;
        return { inschrijftafel: String(data.inschrijftafel || 'Shadow'), hoofdadmin: String(data.hoofdadmin || '1100') };
    } catch (e) { console.error('getAdminPasswords sdk error', e); return { inschrijftafel: 'ERROR', hoofdadmin: 'ERROR' }; }
}

// Update admin passwords (merge)
async function updateAdminPasswords(obj) {
    try {
        if (!obj || typeof obj !== 'object') throw new Error('invalid payload');
        if (!db) initFirebase();
        if (!db) throw new Error('Firestore not initialized');
        await setDoc(doc(db, 'globals', 'passwords'), obj, { merge: true });
        return { success: true };
    } catch (e) { console.error('updateAdminPasswords error', e); return { success: false, error: (e && e.message) ? e.message : String(e) }; }
}

// Update rideConfig (merge) under globals/rideConfig
async function updateRideConfig(obj) {
    try {
        try { console.debug('updateRideConfig: start', obj); } catch(_){ }
        if (!obj || typeof obj !== 'object') throw new Error('invalid payload');
        if (!db) initFirebase();
        if (!db) throw new Error('Firestore not initialized');
        const dref = doc(db, 'globals', 'rideConfig');
        const updatePayload = {};
        // If caller provided a full regions map, set it (will replace the regions field)
        if (obj.regions && typeof obj.regions === 'object') updatePayload['regions'] = obj.regions;
        // If caller provided per-year data, set it under top-level field for that year (merge)
        if (obj.years && typeof obj.years === 'object') {
            for (const yk of Object.keys(obj.years)) {
                if (!yk) continue;
                // set top-level field named after the year, value is expected to be a map date->region
                updatePayload[`${yk}`] = obj.years[yk];
            }
        }
        // If caller asked to remove specific region keys, mark them for deletion
        if (Array.isArray(obj.removeRegions) && obj.removeRegions.length > 0) {
            for (const k of obj.removeRegions) {
                if (!k) continue;
                // delete the nested field regions.<key>
                updatePayload[`regions.${k}`] = deleteField();
            }
        }
        // If caller asked to remove specific year/date keys, support removeYearsDates: [{ year: '2025', date: '2025-06-01' }, ...]
        if (Array.isArray(obj.removeYearsDates) && obj.removeYearsDates.length > 0) {
            for (const it of obj.removeYearsDates) {
                try {
                    const y = (it && it.year) ? String(it.year) : null;
                    const d = (it && it.date) ? String(it.date) : null;
                    if (!y || !d) continue;
                    // remove top-level field for that year/date: <year>.<date>
                    updatePayload[`${y}.${d}`] = deleteField();
                } catch (_) { /* ignore malformed entries */ }
            }
        }
        // Ensure document exists before attempting updates that require it
        const existingSnap = await getDoc(dref).catch(() => null);
        const exists = !!(existingSnap && (typeof existingSnap.exists === 'function' ? existingSnap.exists() : existingSnap._document));
        if (!exists) {
            // If doc doesn't exist, create it with provided fields (regions/years)
            const createPayload = {};
            if (obj.regions && typeof obj.regions === 'object') createPayload.regions = obj.regions;
            if (obj.years && typeof obj.years === 'object') {
                for (const yk of Object.keys(obj.years)) {
                    if (!yk) continue; createPayload[yk] = obj.years[yk];
                }
            }
            if (Object.keys(createPayload).length > 0) {
                await setDoc(dref, createPayload, { merge: true });
            } else {
                // nothing to create; nothing else to delete
                try { console.debug('updateRideConfig: doc missing and no payload to create'); } catch(_){ }
            }
        } else {
            // If we have a payload with fields to update/delete, use updateDoc
            if (Object.keys(updatePayload).length > 0) {
                await updateDoc(dref, updatePayload);
            } else {
                try { console.debug('updateRideConfig: nothing to update'); } catch(_){ }
            }
        }
        // Refresh in-memory copy by merging provided regions/years (top-level year fields)
        try {
            if (typeof window !== 'undefined') {
                if (obj.regions && typeof obj.regions === 'object') window._rideConfig = Object.assign({}, window._rideConfig || {}, { regions: obj.regions });
                if (obj.years && typeof obj.years === 'object') {
                    window._rideConfig = Object.assign({}, window._rideConfig || {});
                    for (const yk of Object.keys(obj.years)) {
                        try { window._rideConfig[yk] = obj.years[yk]; } catch(_){}
                    }
                }
            }
        } catch(_){ }
        try { console.debug('updateRideConfig: success'); } catch(_){ }
        return { success: true };
    } catch (e) { console.error('updateRideConfig error', e); return { success: false, error: (e && e.message) ? e.message : String(e) }; }
}

// Add a participant for a given ride date — store participants separately so
// `globals/rideConfig` remains a pure map of dates/regions per year.
async function addRideParticipant(rideDateYMD, memberId) {
    try {
        if (!rideDateYMD || !memberId) throw new Error('invalid args');
        if (!db) initFirebase();
        if (!db) throw new Error('Firestore not initialized');
        const ymd = String(rideDateYMD).slice(0,10);
        const year = String(ymd).slice(0,4);
        // Write participant info into a separate globals document to avoid
        // polluting `globals/rideConfig` which must only contain date -> region mappings.
        const dref = doc(db, 'globals', 'rideParticipants');
        // merge map: <year>.<date>.<memberId> = true
        const payload = { [year]: { [ymd]: { [String(memberId)]: true } } };
        await setDoc(dref, payload, { merge: true });
        return { success: true };
    } catch (e) { console.error('addRideParticipant error', e); return { success: false, error: (e && e.message) ? e.message : String(e) }; }
}

// Snapshot sessionStorage into an object and expose it via `getSessionSnapshot()`.
function _snapshotSession() {
    try {
        const out = {};
        // Build deterministic key order so JSON comparisons are stable
        const keys = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            try { keys.push(sessionStorage.key(i)); } catch(_){}
        }
        keys.sort();
        for (const k of keys) {
            try { out[k] = JSON.parse(sessionStorage.getItem(k)); } catch (_) { try { out[k] = sessionStorage.getItem(k); } catch(_) { out[k] = null; } }
        }
        try { window._sessionSnapshot = out; } catch (_) {}
        // stringify deterministically by using sorted keys (we already built `out` sorted)
        try {
            const json = JSON.stringify(out);
            if (typeof _lastSessionJson !== 'undefined' && _lastSessionJson === json) {
                return out; // unchanged — do not dispatch
            }
            _lastSessionJson = json;
            try { window.dispatchEvent(new CustomEvent('sessionStorageSnapshot', { detail: out })); } catch (_) {}
        } catch (_) {
            try { window.dispatchEvent(new CustomEvent('sessionStorageSnapshot', { detail: out })); } catch (_) {}
        }
        return out;
    } catch (e) { return {}; }
}

// Keep last emitted snapshot JSON to avoid noisy events when nothing changed
let _lastSessionJson = undefined;

function getSessionSnapshot() {
    try { return window._sessionSnapshot || _snapshotSession(); } catch (_) { return _snapshotSession(); }
}

// Helpers to hide/show the page while critical data loads.
function hidePage() {
    try {
        if (typeof document !== 'undefined' && document.documentElement) document.documentElement.style.visibility = 'hidden';
    } catch (_) {}
}

function showPage() {
    try {
        if (typeof document !== 'undefined' && document.documentElement) document.documentElement.style.visibility = '';
        try { window.dispatchEvent(new CustomEvent('appReady')); } catch (_) {}
    } catch (_) {}
}

// Install hooks to update snapshot when sessionStorage changes in this window.
function installSessionHooks() {
    try {
        if (typeof sessionStorage === 'undefined') return;
        const originalSet = sessionStorage.setItem.bind(sessionStorage);
        const originalRemove = sessionStorage.removeItem.bind(sessionStorage);
        const originalClear = sessionStorage.clear.bind(sessionStorage);
        sessionStorage.setItem = function(k, v) { try { originalSet(k, v); } catch(_){}; try { _snapshotSession(); } catch(_){} };
        sessionStorage.removeItem = function(k) { try { originalRemove(k); } catch(_){}; try { _snapshotSession(); } catch(_){} };
        sessionStorage.clear = function() { try { originalClear(); } catch(_){}; try { _snapshotSession(); } catch(_){} };
        // Also respond to storage events (changes from other windows)
        try { window.addEventListener('storage', () => { try { _snapshotSession(); } catch(_){} }); } catch(_){}
        // initialize
        _snapshotSession();
    } catch (e) { /* ignore */ }
}

try { installSessionHooks(); } catch (_) {}
// Log sessionStorage snapshot on load and whenever snapshot updates
try {
    try {
        if (typeof window !== 'undefined') {
            window.addEventListener('sessionStorageSnapshot', (ev) => {
                try { console.debug('sessionStorageSnapshot event', ev && ev.detail ? ev.detail : window._sessionSnapshot); } catch(_){}
            });
            // Also log an initial snapshot when the page loads
            if (typeof document !== 'undefined') {
                document.addEventListener('DOMContentLoaded', () => {
                    try { const snap = _snapshotSession(); console.debug('sessionStorage snapshot (on DOMContentLoaded)', snap); } catch(_){}
                });
            }
        }
    } catch (_) {}
} catch (_) {}

// Get a member document by id (returns data() or null)
async function getMemberById(id) {
    try {
        if (!id) return null;
        if (!db) initFirebase();
        if (!db) return null;
        const dref = doc(db, 'members', String(id));
        const snap = await getDoc(dref).catch(()=>null);
        if (!snap || (typeof snap.exists === 'function' ? !snap.exists() : !snap._document)) return null;
        try { return typeof snap.data === 'function' ? snap.data() : snap; } catch(_) { return null; }
    } catch (e) { console.warn('getMemberById error', e); return null; }
}

// Search members by prefix on 'Naam' or 'voor' (simple range query)
async function searchMembers(prefix, maxResults = 8) {
    try {
        const q = String(prefix || '').trim();
        if (!q) return [];
        if (!db) initFirebase();
        if (!db) return [];
        const start = q;
        const end = q + '\uf8ff';
        try {
            const qry = query(collection(db, 'members'), orderBy('Naam'), where('Naam', '>=', start), where('Naam', '<=', end));
            const snap = await getDocs(qry).catch(()=>null);
            const out = [];
            if (snap && Array.isArray(snap.docs)) {
                for (const s of snap.docs) {
                    try {
                        const d = typeof s.data === 'function' ? s.data() : (s || {});
                        out.push({ id: s.id || (s.ref && s.ref.id) || null, naam: (d.Naam || d.naam || ''), voor: (d['Voor naam'] || d.voor || d.voornaam || '') });
                        if (out.length >= maxResults) break;
                    } catch(_){}
                }
            }
            return out.slice(0, maxResults);
        } catch (e) { return []; }
    } catch (e) { console.error('searchMembers error', e); return []; }
}

// On index load fetch lunch + rideConfig and stash in sessionStorage
async function _loadIfIndex() {
    try {
        if (typeof window === 'undefined' || typeof document === 'undefined') return;
        const path = (window.location && window.location.pathname) ? window.location.pathname.replace(/\\/g,'/') : '';
        const isIndex = path === '/' || path.endsWith('/index.html') || path === '';
        if (!isIndex) return;
        const run = async () => {
            const [lunchRes, rideCfg] = await Promise.all([getLunchOptions(), getRideConfig()]);
            // Persist only the regions map and current-year ride entries to sessionStorage
            try {
                const currentYear = String((new Date()).getFullYear());
                let ridesForYear = {};
                try {
                    if (rideCfg && rideCfg[currentYear] && typeof rideCfg[currentYear] === 'object') {
                        // expect structure: <year> -> map of date -> object of memberId:true or region
                        ridesForYear = rideCfg[currentYear] && typeof rideCfg[currentYear] === 'object' ? rideCfg[currentYear] : {};
                    }
                } catch (_) { ridesForYear = {}; }
                // Persist only the current-year rides under sessionStorage.rideConfig as { "<year>": { ... } }
                try { sessionStorage.setItem('rideConfig', JSON.stringify({ [currentYear]: ridesForYear })); } catch(_) {}
                // Notify other scripts that the rideConfig is ready for consumption
                try {
                    if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('shadow:config-ready'));
                } catch(_) {}
            } catch (_) {}
            const snap = _snapshotSession();
            console.debug('sessionStorage snapshot after load', snap);
            showPage();
        };
        // Hide page until the critical data has loaded
        hidePage();
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
        else run();
    } catch (_) {}
}

try { _loadIfIndex(); } catch(_) {}
// List all members (id, naam, voor) up to `limit` for client-side searching
async function listAllMembers(limit = 500) {
    try {
        if (!db) initFirebase();
        if (!db) return [];
        const out = [];
        // Try direct collection read first
        try {
            const snap = await getDocs(collection(db, 'members')).catch(()=>null);
            try { console.debug('listAllMembers: members collection snap', snap && snap.docs ? snap.docs.length : 0); } catch(_){}
            if (snap && Array.isArray(snap.docs) && snap.docs.length) {
                for (const s of snap.docs) {
                    try {
                        const d = typeof s.data === 'function' ? s.data() : (s || {});
                            out.push({ id: s.id || (s.ref && s.ref.id) || null, naam: String(d.Naam || d.naam || ''), voor: String(d['Voor naam'] || d.voor || d.voornaam || ''), tussen: String(d['Tussenvoegsel'] || d['Tussen voegsel'] || d.tussenvoegsel || d.tussen || '') });
                        if (out.length >= limit) break;
                    } catch(_){ }
                }
            } else {
                // Try ordered query as a secondary attempt
                try {
                    const q2 = query(collection(db, 'members'), orderBy('Naam'));
                    const snap2 = await getDocs(q2).catch(()=>null);
                    try { console.debug('listAllMembers: ordered members snap', snap2 && snap2.docs ? snap2.docs.length : 0); } catch(_){}
                    if (snap2 && Array.isArray(snap2.docs) && snap2.docs.length) {
                        for (const s of snap2.docs) {
                            try {
                                    const d = typeof s.data === 'function' ? s.data() : (s || {});
                                    out.push({ id: s.id || (s.ref && s.ref.id) || null, naam: String(d.Naam || d.naam || ''), voor: String(d['Voor naam'] || d.voor || d.voornaam || ''), tussen: String(d['Tussenvoegsel'] || d['Tussen voegsel'] || d.tussenvoegsel || d.tussen || '') });
                                if (out.length >= limit) break;
                            } catch(_){ }
                        }
                    }
                } catch (e) { console.debug('listAllMembers: ordered query failed', e); }
            }
        } catch (e) { console.debug('listAllMembers: members collection read failed', e); }

        try { console.debug('listAllMembers: total members', out.length); } catch(_){}
        try { if (typeof window !== 'undefined') window.listAllMembers = listAllMembers; } catch(_){ }
        return out.slice(0, limit);
    } catch (e) { console.error('listAllMembers error', e); return []; }
}

// List members that have a Jaarhanger-like value (case-insensitive variants)
async function listMembersByJaarhanger(limit = 500, variants = null, year = null) {
    try {
        if (!db) initFirebase();
        if (!db) return [];
        const yearStr = year ? String(year) : String((new Date()).getFullYear());
        const vals = Array.isArray(variants) && variants.length > 0 ? variants : ['ja','Ja','yes','Yes','true', true, '1', 1, 'JA', 'YES'];
        const out = [];
        // Prefer server-side query on per-year subfield when possible
        try {
            const fieldPath = `Jaarhanger.${yearStr}`;
            const q = query(collection(db, 'members'), where(fieldPath, 'in', vals));
            const snap = await getDocs(q).catch(()=>null);
            if (snap && Array.isArray(snap.docs) && snap.docs.length) {
                for (const s of snap.docs) {
                    try {
                        const d = typeof s.data === 'function' ? s.data() : (s || {});
                        out.push(Object.assign({ id: s.id || (s.ref && s.ref.id) || null }, d));
                        if (out.length >= limit) break;
                    } catch(_){ }
                }
                return out;
            }
        } catch (e) {
            try { console.debug('listMembersByJaarhanger: per-year query failed, falling back', e); } catch(_){}
        }

        // Fallback: full scan and client-side filter (handles legacy top-level Jaarhanger or per-year object)
        try {
            const collSnap = await getDocs(collection(db, 'members')).catch(()=>null);
            if (collSnap && Array.isArray(collSnap.docs) && collSnap.docs.length) {
                for (const s of collSnap.docs) {
                    try {
                        const d = typeof s.data === 'function' ? s.data() : (s || {});
                        // check per-year object first
                        let match = false;
                        try {
                            if (d && d.Jaarhanger && typeof d.Jaarhanger === 'object') {
                                const vv = d.Jaarhanger && (d.Jaarhanger[yearStr] || d.Jaarhanger[String(yearStr)]);
                                if (typeof vv === 'string' && vv.toLowerCase().indexOf('j') === 0) match = true;
                                else if (typeof vv === 'boolean' && vv) match = true;
                                else if (typeof vv === 'number' && vv === 1) match = true;
                            }
                            if (!match) {
                                const v = d && (d.Jaarhanger || d.jaarhanger || d.JaarHanger || d.jaarHanger);
                                if (typeof v === 'string') { if (v.toLowerCase().indexOf('j') === 0) match = true; }
                                else if (typeof v === 'boolean') { if (v) match = true; }
                                else if (typeof v === 'number') { if (v === 1) match = true; }
                            }
                        } catch(_){ }
                        if (match) {
                            out.push(Object.assign({ id: s.id || (s.ref && s.ref.id) || null }, d));
                            if (out.length >= limit) break;
                        }
                    } catch(_){ }
                }
            }
        } catch (e) { console.error('listMembersByJaarhanger fallback scan failed', e); }

        return out;
    } catch (e) { console.error('listMembersByJaarhanger error', e); return []; }
}
export {
    initFirebase,
    getLunchOptions,
    getRideConfig,
    getPlannedDates,
    getLunchChoiceCount,
    getParticipationCount,
    db,
    firebaseConfig,
    storage,
    getMemberById,
    searchMembers,
    getSessionSnapshot,
    showFirebaseDebugBanner,
    getAdminPasswords,
    updateAdminPasswords,
    updateLunchOptions,
    getDataStatus,
    updateDataStatus,
    updateRideConfig,
    // addRideParticipant removed: participants are stored in members.ScanDatums
    listAllMembers,
    listMembersByJaarhanger,
    collection,
    onSnapshot,
    doc,
    getDoc,
    getDocs,
    setDoc,
    writeBatch,
    serverTimestamp,
    query,
    where,
    orderBy,
    ref,
    uploadBytes,
    getDownloadURL
};
