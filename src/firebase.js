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

// Determine environment:
// Priority:
// 1) If `VITE_FIREBASE_ENV` is explicitly set, respect it.
// 2) If running on Vercel and `VERCEL_ENV=production`, use production.
// 3) If running the Vite dev server (`import.meta.env.DEV`) use development.
// 4) Otherwise default to development to avoid accidental production usage from preview builds.
const hasMeta = (typeof import.meta !== 'undefined' && import.meta.env);
const explicit = hasMeta && import.meta.env.VITE_FIREBASE_ENV;
const isDevServer = hasMeta && Boolean(import.meta.env.DEV);
// Vite exposes `import.meta.env.PROD` in production builds; prefer that for build-time detection.
const isViteProd = hasMeta && Boolean(import.meta.env.PROD);
// Check Vercel env (server-side process env during build or injected env during runtime if configured)
const isVercelProd = (typeof process !== 'undefined' && process.env && process.env.VERCEL_ENV === 'production') || (hasMeta && import.meta.env.VERCEL_ENV === 'production');
let firebaseEnv = 'development';
if (explicit) {
  firebaseEnv = explicit;
} else if (isViteProd) {
  // Built with Vite in production mode -> use production config
  firebaseEnv = 'production';
} else if (isVercelProd) {
  firebaseEnv = 'production';
} else if (isDevServer) {
  firebaseEnv = 'development';
} else {
  // Default to development for safety (preview builds / branches should not use production)
  firebaseEnv = 'development';
}
export const firebaseConfig = firebaseConfigs[firebaseEnv] || firebaseConfigProd;
export const firebaseEnvironment = firebaseEnv;

try {
  console.info('[Firebase] selected environment:', firebaseEnvironment, 'projectId:', firebaseConfig && firebaseConfig.projectId);
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
