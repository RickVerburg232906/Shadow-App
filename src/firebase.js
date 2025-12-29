import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, query, where, orderBy, startAt, startAfter as _startAfter, endAt, limit, getDocs as _getDocs, getDoc as _getDoc, doc, writeBatch as _writeBatch, setDoc as _setDoc, addDoc as _addDoc, serverTimestamp, increment, arrayUnion, runTransaction as _runTransaction, updateDoc as _updateDoc, deleteDoc as _deleteDoc, onSnapshot as _onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
// arrayUnion exporteren voor gemak
// (optioneel, admin.js importeert direct uit firebase/firestore)

import { getStorage, ref, uploadBytes, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js";

// --- Firebase configs for different environments ---
// Keep the existing config as the development config.
const firebaseConfigDev = {
  apiKey: "AIzaSyCwHJ1VIqM9s4tfh2hn8KZxqunuYySzuwQ",
  authDomain: "shadow-app-b3fb3.firebaseapp.com",
  projectId: "shadow-app-b3fb3",
  storageBucket: "shadow-app-b3fb3.appspot.com",
  messagingSenderId: "725156533083",
  appId: "1:725156533083:web:e372fd32d1d0abff4f3f92"
};

// Production config placeholder — replace with your production Firebase project's values.
const firebaseConfigProd = {
  apiKey: "AIzaSyBiV580AjErqJlOhwXR8VTNbY0b1DZJDwM",
  authDomain: "landelijke-rit.firebaseapp.com",
  projectId: "landelijke-rit",
  storageBucket: "landelijke-rit.firebasestorage.app",
  messagingSenderId: "1001186852750",
  appId: "1:1001186852750:web:317122d6d230188cd1eedf",
  measurementId: "G-33G3DH2YFZ"
};

const firebaseConfigs = {
  development: firebaseConfigDev,
  production: firebaseConfigProd
};

// Determine environment with Vercel branch-awareness.
// Priority:
// 1) If `VITE_FIREBASE_ENV` is explicitly set, respect it.
// 2) If building on Vercel: use production only when `VERCEL_ENV=production` AND branch is `main`.
//    Otherwise use development (for preview branches and vercel dev).
// 3) If built with Vite in production locally (`import.meta.env.PROD`), use production.
// 4) Default to development to avoid accidental production usage.
const hasMeta = (typeof import.meta !== 'undefined' && import.meta.env);
const explicit = hasMeta && import.meta.env.VITE_FIREBASE_ENV;
const isDevServer = hasMeta && Boolean(import.meta.env.DEV);
const isViteProd = hasMeta && Boolean(import.meta.env.PROD);

// Allow a runtime override from legacy pages or manual tests.
// Set `window.__FIREBASE_ENV__ = 'production'` or `window.FIREBASE_USE_PROD = true` before scripts load.
const runtimeEnv = (typeof window !== 'undefined' && (window.__FIREBASE_ENV__ || (window.FIREBASE_USE_PROD ? 'production' : null))) || null;

// Branch name available on Vercel as VERCEL_GIT_COMMIT_REF during build
const branchName = (hasMeta && (import.meta.env.VERCEL_GIT_COMMIT_REF || import.meta.env.GIT_COMMIT_REF)) || (typeof process !== 'undefined' && process.env && (process.env.VERCEL_GIT_COMMIT_REF || process.env.GIT_COMMIT_REF)) || null;
const vercelEnv = (hasMeta && import.meta.env.VERCEL_ENV) || (typeof process !== 'undefined' && process.env && process.env.VERCEL_ENV) || null;

let firebaseEnv = 'development';
if (runtimeEnv) {
  firebaseEnv = runtimeEnv;
} else if (explicit) {
  firebaseEnv = explicit;
} else if (vercelEnv) {
  // On Vercel: production only for the main branch
  if (vercelEnv === 'production' && (branchName === 'main' || branchName === 'master')) {
    firebaseEnv = 'production';
  } else {
    firebaseEnv = 'development';
  }
} else if (isViteProd) {
  firebaseEnv = 'production';
} else if (isDevServer) {
  firebaseEnv = 'development';
} else {
  firebaseEnv = 'development';
}

export const firebaseConfig = firebaseConfigs[firebaseEnv] || firebaseConfigProd;
export const firebaseEnvironment = firebaseEnv;

try {
  console.info('[Firebase] selected environment:', firebaseEnvironment, 'projectId:', firebaseConfig && firebaseConfig.projectId, 'runtimeEnv:', runtimeEnv, 'vercelEnv:', vercelEnv, 'branch:', branchName, 'viteProd:', isViteProd);
} catch (_) {}

const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  experimentalAutoDetectLongPolling: true
});
export const storage = getStorage(app);

export function initFirebase(config) {
  try {
    if (config) {
      try { initializeApp(config); } catch(_) { /* already initialized or ignored */ }
    }
  } catch (_) {}
  return db;
}

// --- Firestore metrics tracking ---
// Global counters and a small reporter (exposed on window for debugging)
const metrics = {
  reads: 0,
  writes: 0,
  deletes: 0,
  listeners: 0,
  lastReportAt: 0,
  _pendingLog: false,
};

function scheduleReport() {
  if (metrics._pendingLog) return;
  metrics._pendingLog = true;
  setTimeout(() => {
    metrics._pendingLog = false;
    metrics.lastReportAt = Date.now();
    try { console.info('[Firestore metrics]', { reads: metrics.reads, writes: metrics.writes, deletes: metrics.deletes, listeners: metrics.listeners }); } catch(_) {}
  }, 800);
}

// Wrap a function that performs a read
function wrapRead(orig) {
  return async function(...args) {
    try { metrics.reads += 1; scheduleReport(); } catch(_) {}
    return await orig.apply(this, args);
  };
}

// Wrap a function that performs a write
function wrapWrite(orig) {
  return async function(...args) {
    try { metrics.writes += 1; scheduleReport(); } catch(_) {}
    return await orig.apply(this, args);
  };
}

// Wrap delete
function wrapDelete(orig) {
  return async function(...args) {
    try { metrics.deletes += 1; scheduleReport(); } catch(_) {}
    return await orig.apply(this, args);
  };
}

// Wrap onSnapshot to count subscription (and initial snapshot as a read)
function wrapOnSnapshot(orig) {
  return function(...args) {
    try { metrics.listeners += 1; metrics.reads += 1; scheduleReport(); } catch(_) {}
    const unsub = orig.apply(this, args);
    // unsub may be a function; wrap to decrement listeners
    return function() {
      try { metrics.listeners = Math.max(0, metrics.listeners - 1); scheduleReport(); } catch(_) {}
      try { return unsub(); } catch (e) { /* ignore */ }
    };
  };
}

// Expose metrics for debugging
if (typeof window !== 'undefined') {
  window.firestoreMetrics = {
    get: () => ({ ...metrics }),
    reset: () => { metrics.reads = metrics.writes = metrics.deletes = metrics.listeners = 0; scheduleReport(); },
  };
}

// Wrapped exports (so other modules importing from ./firebase.js get instrumented)
const getDoc = wrapRead(_getDoc);
const getDocs = wrapRead(_getDocs);
const setDoc = wrapWrite(_setDoc);
const addDoc = wrapWrite(_addDoc);
const updateDoc = wrapWrite(_updateDoc);
const deleteDoc = wrapDelete(_deleteDoc);
const startAfter = _startAfter;
const runTransaction = async function(dbRef, updateFunction, options) {
  try { metrics.reads += 1; metrics.writes += 1; scheduleReport(); } catch(_) {}
  return await _runTransaction(dbRef, updateFunction, options);
};
const writeBatch = function(dbRef) {
  const batch = _writeBatch(dbRef);
  // Wrap commit to count a single batch write
  const origCommit = batch.commit.bind(batch);
  batch.commit = async function() { try { metrics.writes += 1; scheduleReport(); } catch(_) {} ; return await origCommit(); };
  return batch;
};
const onSnapshot = wrapOnSnapshot(_onSnapshot);

// Re-export helpers
export { addDoc, arrayUnion, collection, doc, endAt, getDoc, getDocs, increment, limit, orderBy, query, ref, serverTimestamp, setDoc, startAt, startAfter, uploadBytes, uploadBytesResumable, getDownloadURL, where, writeBatch, runTransaction, updateDoc, deleteDoc, onSnapshot };
