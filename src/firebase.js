// Firebase initialization with dev/prod configs
import { initializeApp, getApps, getApp, deleteApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { getFirestore, doc, collection, getDoc, onSnapshot, setDoc, writeBatch, serverTimestamp, getDocs, query, where, orderBy } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// Dev config
const devConfig = {
	apiKey: "AIzaSyCwHJ1VIqM9s4tfh2hn8KZxqunuYySzuwQ",
	authDomain: "shadow-app-b3fb3.firebaseapp.com",
	projectId: "shadow-app-b3fb3",
	storageBucket: "shadow-app-b3fb3.firebasestorage.app",
	messagingSenderId: "38812973319",
	appId: "1:38812973319:web:1dd89a0ffa61af564f2da2"
};

// Prod config
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
		if (typeof import.meta !== 'undefined' && import.meta.env) {
			const env = import.meta.env;
			const isVercel = env.VERCEL === '1' || env.VERCEL_ENV === 'production';
			const ref = env.VERCEL_GIT_COMMIT_REF || env.VITE_GIT_COMMIT_REF || env.GIT_BRANCH;
			if (isVercel && ref === 'main') return true;
		}
	} catch (e) {}
	try {
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

let currentMode = 'auto';
let firebaseConfig = null;
let app = null;
let analytics = null;

function computeInitialMode() {
	const stored = (typeof window !== 'undefined' && window.localStorage) ? window.localStorage.getItem('firebaseMode') : null;
	if (stored === 'prod' || stored === 'dev') return stored;
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
	try {
		if (mode === 'prod' && typeof getAnalytics === 'function') analytics = getAnalytics(app);
		else analytics = null;
	} catch (e) { analytics = null; }
	// Log only which config was chosen (dev or prod)
	try {
		if (typeof console !== 'undefined' && console.info) console.info('Firebase mode:', String(mode));
	} catch (_) {}
	if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem('firebaseMode', mode);
	return { app, analytics, firebaseConfig, currentMode };
}

async function switchFirebaseConfig(mode) {
	if (mode !== 'prod' && mode !== 'dev' && mode !== 'auto') throw new Error('mode must be "prod", "dev" or "auto"');
	if (mode === 'auto') mode = computeInitialMode();
	return initFirebase(mode);
}

// Initialize immediately with computed mode
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

if (typeof window !== 'undefined') {
	window.switchFirebaseConfig = switchFirebaseConfig;
	window.setFirebaseMode = (m) => switchFirebaseConfig(m);
	window.__firebase_currentMode = () => currentMode;
	window.showFirebaseDebug = showFirebaseDebug;
	window.__firebase_debug = showFirebaseDebug;
}

export { app, analytics, firebaseConfig, currentMode as isProd, switchFirebaseConfig, showFirebaseDebug, initFirebase };

const db = getFirestore(app);
const storage = getStorage(app);

export { db, doc, collection, getDoc, onSnapshot, setDoc, writeBatch, serverTimestamp, getDocs, query, where, orderBy, storage, getStorage, ref, uploadBytes, getDownloadURL };

// --- Lightweight getters used by the UI ---
async function _tryGetDoc(col, id) {
	try {
		const dref = doc(db, col, id);
		const snap = await getDoc(dref).catch(() => null);
		if (snap && snap.exists && typeof snap.exists === 'function' ? snap.exists() : (snap && snap._document)) {
			// prefer data() when available
			try { return typeof snap.data === 'function' ? snap.data() : (snap || null); } catch(_) { return null; }
		}
	} catch (e) {}
	return null;
}

async function getLunchOptions() {
	// Strict: read only the document globals/lunch and require the two expected arrays.
	try {
		const dref = doc(db, 'globals', 'lunch');
		const snap = await getDoc(dref).catch(() => null);
		if (!snap || (typeof snap.exists === 'function' ? !snap.exists() : !snap._document)) {
			const msg = 'globals/lunch not found';
			console.error(msg);
			throw new Error(msg);
		}
		const data = typeof snap.data === 'function' ? snap.data() : (snap || {});
		const vast = Array.isArray(data.vastEten) ? data.vastEten : null;
		const keuze = Array.isArray(data.keuzeEten) ? data.keuzeEten : null;
		if (!Array.isArray(vast) || !Array.isArray(keuze)) {
			const msg = 'globals/lunch invalid: requires arrays "vastEten" and "keuzeEten"';
			console.error(msg, data);
			throw new Error(msg);
		}
		const out = { vastEten: vast.slice(), keuzeEten: keuze.slice() };
		try { sessionStorage.setItem('lunch', JSON.stringify(out)); } catch(_) {}
		return out;
	} catch (e) {
		// propagate error so callers can handle it explicitly
		throw e;
	}
}

async function getPlannedDates() {
	// prefer cached
	try {
		const raw = sessionStorage.getItem('plannedDates');
		if (raw) {
			try { return JSON.parse(raw); } catch(_) { }
		}
	} catch (_) {}

	// Try a doc with an array, then fall back to reading a collection of rides
	const docCandidates = [ {c: 'config', d: 'plannedDates'}, {c: 'globals', d: 'plannedDates'}, {c: 'settings', d: 'plannedDates'} ];
	for (const p of docCandidates) {
		try {
			const res = await _tryGetDoc(p.c, p.d);
			if (res) {
				const arr = Array.isArray(res.dates) ? res.dates : (Array.isArray(res.plannedDates) ? res.plannedDates : []);
				if (arr.length) { try { sessionStorage.setItem('plannedDates', JSON.stringify(arr)); } catch(_){}; return arr; }
			}
		} catch(_){}
	}

	// fallback: read collection variants and map a date field or doc.id
	const colCandidates = ['planned', 'plannedRides', 'ritten', 'rides', 'dates'];
	for (const colName of colCandidates) {
		try {
			const snaps = await getDocs(collection(db, colName)).catch(() => null);
			if (snaps && Array.isArray(snaps.docs) && snaps.docs.length) {
				const out = [];
				for (const s of snaps.docs) {
					try {
						const data = typeof s.data === 'function' ? s.data() : (s || {});
						if (data && (data.date || data.iso || data.d)) out.push(data.date || data.iso || data.d);
						else if (s.id) out.push(s.id);
					} catch(_){}
				}
				if (out.length) { try { sessionStorage.setItem('plannedDates', JSON.stringify(out)); } catch(_){}; return out; }
			}
		} catch(_){}
	}

	// nothing found
	try { sessionStorage.setItem('plannedDates', JSON.stringify([])); } catch(_){}
	return [];
}

// --- Member helpers ---
// Get a member document by id (returns data() or null)
async function getMemberById(id) {
	try {
		if (!id) return null;
		const dref = doc(db, 'members', String(id));
		const snap = await getDoc(dref).catch(() => null);
		if (!snap || (typeof snap.exists === 'function' ? !snap.exists() : !snap._document)) return null;
		try { return typeof snap.data === 'function' ? snap.data() : snap; } catch(_) { return null; }
	} catch (e) { console.warn('getMemberById error', e); return null; }
}

// Search members by prefix (matches Naam or Voor naam start), returns array of {id, naam, voor}
async function searchMembers(prefix, maxResults = 8) {
	try {
		const q = String(prefix || '').trim();
		if (!q) return [];
		// Try range query on 'Naam' field (requires an index); fallback to scanning a limited set.
		const max = Math.max(1, Number(maxResults) || 8);
		const start = q;
		const end = q + '\uf8ff';
		try {
			const qry = query(collection(db, 'members'), orderBy('Naam'), where('Naam', '>=', start), where('Naam', '<=', end));
			const snap = await getDocs(qry).catch(() => null);
			const out = [];
			if (snap && Array.isArray(snap.docs)) {
				for (const s of snap.docs) {
					try {
						const d = typeof s.data === 'function' ? s.data() : (s || {});
						out.push({ id: s.id || (s.ref && s.ref.id) || null, naam: (d.Naam || d.naam || '') , voor: (d['Voor naam'] || d.voor || d.voornaam || '') });
						if (out.length >= max) break;
					} catch(_){}
				}
			}
			if (out.length) return out.slice(0, max);
		} catch (e) {
			// ignore and fallback
		}
		// Fallback: read first N members and filter client-side
		try {
			const snap = await getDocs(query(collection(db, 'members'), orderBy('Naam'), limit(max * 10))).catch(() => null);
			const out = [];
			if (snap && Array.isArray(snap.docs)) {
				for (const s of snap.docs) {
					try {
						const d = typeof s.data === 'function' ? s.data() : (s || {});
						const naam = (d.Naam || d.naam || '').toString();
						const voor = (d['Voor naam'] || d.voor || d.voornaam || '').toString();
						if (naam.toLowerCase().startsWith(q.toLowerCase()) || voor.toLowerCase().startsWith(q.toLowerCase())) {
							out.push({ id: s.id || (s.ref && s.ref.id) || null, naam, voor });
							if (out.length >= max) break;
						}
					} catch(_){}
				}
			}
			return out.slice(0, max);
		} catch (e) { console.warn('searchMembers fallback error', e); return []; }
	} catch (e) { console.error('searchMembers error', e); return []; }
}

// When loading index.html, fetch lunch + planned dates and stash in sessionStorage for UI use
function _snapshotSession() {
	try {
		const out = {};
		for (let i=0;i<sessionStorage.length;i++) {
			const k = sessionStorage.key(i);
			try { out[k] = JSON.parse(sessionStorage.getItem(k)); } catch(_) { out[k] = sessionStorage.getItem(k); }
		}
		console.debug('sessionStorage snapshot', out);
	} catch (e) { console.debug('sessionStorage snapshot failed', e); }
}

async function _loadLunchAndRidesIfIndex() {
	try {
		if (typeof window === 'undefined' || typeof document === 'undefined') return;
		const path = (window.location && window.location.pathname) ? window.location.pathname.replace(/\\/g,'/') : '';
		const isIndex = path === '/' || path.endsWith('/index.html') || path === '';
		if (!isIndex) return;
		// wait for DOM ready so other scripts can observe sessionStorage
		const run = async () => {
			try {
				await getLunchOptions().catch(()=>null);
				await getPlannedDates().catch(()=>null);
				_snapshotSession();
			} catch (e) { console.warn('load lunch/planned failed', e); }
		};
		if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
		else run();
	} catch (e) { /* ignore */ }
}

try { _loadLunchAndRidesIfIndex(); } catch(_) {}

export { getLunchOptions, getPlannedDates, searchMembers, getMemberById };

