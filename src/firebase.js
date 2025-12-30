// Minimal firebase loader: only what we need to fetch `globals/lunch` and `globals/rideConfig`
import { initializeApp, getApps, getApp, deleteApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, onSnapshot, setDoc, updateDoc, writeBatch, serverTimestamp, getDocs, query, where, orderBy, deleteField } from 'firebase/firestore';
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
};

let app = null;
let db = null;
let storage = null;
let firebaseConfig = null;

function isProdHost() {
    try {
        if (typeof window !== 'undefined' && window.location && window.location.hostname) {
            const h = window.location.hostname || '';
            return h.includes('landelijke-rit') || h === 'landelijke-rit.firebaseapp.com' || h === 'landelijke-rit.web.app';
        }
    } catch (e) {}
    return false;
}

// Resolve DB environment: url param `?db=dev|prod` overrides localStorage `shadow_db_env`.
function resolveDbEnv() {
    try {
        if (typeof window !== 'undefined') {
            try {
                const params = new URLSearchParams(window.location.search || '');
                const q = params.get('db');
                if (q === 'dev' || q === 'prod') return q;
            } catch(_) {}
            try {
                const ls = localStorage.getItem('shadow_db_env');
                if (ls === 'dev' || ls === 'prod') return ls;
            } catch(_) {}
            // fall back to host detection
            return isProdHost() ? 'prod' : 'dev';
        }
    } catch(_) {}
    return 'dev';
}

function getDbEnv() { return resolveDbEnv(); }

function setDbEnv(env, doReload = true) {
    try {
        if (env !== 'dev' && env !== 'prod') throw new Error('invalid env');
        try { localStorage.setItem('shadow_db_env', env); } catch(_) {}
        if (doReload && typeof window !== 'undefined' && window.location) {
            // reload to ensure full reinitialization
            window.location.reload();
        }
        return true;
    } catch (e) { console.warn('setDbEnv failed', e); return false; }
}

function initFirebase() {
    if (db) return { app, db };
    const env = resolveDbEnv();
    const cfg = (env === 'prod') ? prodConfig : devConfig;
    // attach active env to firebaseConfig for debugging
    firebaseConfig = Object.assign({ _env: env }, cfg);
    try {
        if (getApps().length) {
            try { const existing = getApp(); deleteApp(existing); } catch(_) {}
        }
    } catch(_) {}
    app = initializeApp(cfg);
    try { db = getFirestore(app); } catch(_) { db = null; }
    try { storage = getStorage(app); } catch(_) { storage = null; }
    try {
        const env = (firebaseConfig && firebaseConfig._env) ? firebaseConfig._env : resolveDbEnv();
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
        const env = (firebaseConfig && firebaseConfig._env) ? firebaseConfig._env : resolveDbEnv();
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
        await setDoc(dref, { vastEten: Array.isArray(obj.vastEten) ? obj.vastEten : [], keuzeEten: Array.isArray(obj.keuzeEten) ? obj.keuzeEten : [] }, { merge: true });
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
        await setDoc(dref, obj, { merge: true });
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
    const cfg = await getRideConfig();
    if (!cfg || typeof cfg !== 'object') return [];
    if (Array.isArray(cfg.plannedDates)) return cfg.plannedDates.slice();
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
        const nowIso = new Date().toISOString();
        const q = query(collection(db, 'members'), where('lunchKeuze', '==', String(choice)), where('lunchExpires', '>', nowIso));
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
        const nowIso = new Date().toISOString();
        for (const v of variants) {
            if (!v) continue;
            if (seen.has(v)) continue; seen.add(v);
            const q = query(collection(db, 'members'), where('lunchDeelname', '==', String(v)), where('lunchExpires', '>', nowIso));
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
        try { console.debug('updateRideConfig: start', obj); } catch(_){}
        if (!obj || typeof obj !== 'object') throw new Error('invalid payload');
        if (!db) initFirebase();
        if (!db) throw new Error('Firestore not initialized');
        const dref = doc(db, 'globals', 'rideConfig');
        const updatePayload = {};
        // If caller provided a full regions map, set it (will replace the regions field)
        if (obj.regions && typeof obj.regions === 'object') updatePayload['regions'] = obj.regions;
        // If caller asked to remove specific region keys, mark them for deletion
        if (Array.isArray(obj.removeRegions) && obj.removeRegions.length > 0) {
            for (const k of obj.removeRegions) {
                if (!k) continue;
                // delete the nested field regions.<key>
                updatePayload[`regions.${k}`] = deleteField();
            }
        }
        // Ensure document exists before attempting updates that require it
        const existingSnap = await getDoc(dref).catch(() => null);
        const exists = !!(existingSnap && (typeof existingSnap.exists === 'function' ? existingSnap.exists() : existingSnap._document));
        if (!exists) {
            // If doc doesn't exist, create it with provided `regions` (if any).
            if (obj.regions && typeof obj.regions === 'object') {
                await setDoc(dref, { regions: obj.regions }, { merge: true });
            } else {
                // nothing to create; nothing else to delete
                try { console.debug('updateRideConfig: doc missing and no regions to create'); } catch(_){}
            }
            // If removeRegions was requested but doc didn't exist, nothing to delete.
        } else {
            // If we have a payload with fields to update/delete, use updateDoc
            if (Object.keys(updatePayload).length > 0) {
                await updateDoc(dref, updatePayload);
            } else {
                try { console.debug('updateRideConfig: nothing to update'); } catch(_){}
            }
        }
        // Refresh in-memory copy by merging provided regions
        try { if (typeof window !== 'undefined' && obj.regions && typeof obj.regions === 'object') window._rideConfig = Object.assign({}, window._rideConfig || {}, { regions: obj.regions }); } catch(_){}
        try { console.debug('updateRideConfig: success'); } catch(_){}
        return { success: true };
    } catch (e) { console.error('updateRideConfig error', e); return { success: false, error: (e && e.message) ? e.message : String(e) }; }
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
            // Persist only the regions map to sessionStorage (never plannedDates)
            try {
                const regions = (rideCfg && rideCfg.regions && typeof rideCfg.regions === 'object') ? rideCfg.regions : {};
                sessionStorage.setItem('rideConfig', JSON.stringify({ regions }));
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
                        out.push({ id: s.id || (s.ref && s.ref.id) || null, naam: String(d.Naam || d.naam || ''), voor: String(d['Voor naam'] || d.voor || d.voornaam || '') });
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
                                out.push({ id: s.id || (s.ref && s.ref.id) || null, naam: String(d.Naam || d.naam || ''), voor: String(d['Voor naam'] || d.voor || d.voornaam || '') });
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
async function listMembersByJaarhanger(limit = 500, variants = null) {
    try {
        if (!db) initFirebase();
        if (!db) return [];
        const vals = Array.isArray(variants) && variants.length > 0 ? variants : ['ja','Ja','JA','yes','Yes','YES','true','True','1'];
        // Try server-side IN query (limited to 10 values)
        const q = query(collection(db, 'members'), where('Jaarhanger', 'in', vals));
        const snap = await getDocs(q).catch(()=>null);
        const out = [];
        if (snap && Array.isArray(snap.docs) && snap.docs.length) {
            for (const s of snap.docs) {
                try {
                    const d = typeof s.data === 'function' ? s.data() : (s || {});
                    out.push(Object.assign({ id: s.id || (s.ref && s.ref.id) || null }, d));
                    if (out.length >= limit) break;
                } catch(_){ }
            }
        }
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
    getDbEnv,
    setDbEnv,
    showFirebaseDebugBanner,
    getAdminPasswords,
    updateAdminPasswords,
    updateLunchOptions,
    getDataStatus,
    updateDataStatus,
    updateRideConfig,
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
