import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, query, where, orderBy, startAt, startAfter as _startAfter, endAt, limit, getDocs as _getDocs, getDoc as _getDoc, doc, writeBatch as _writeBatch, setDoc as _setDoc, addDoc as _addDoc, serverTimestamp, increment, arrayUnion, runTransaction as _runTransaction, updateDoc as _updateDoc, deleteDoc as _deleteDoc, onSnapshot as _onSnapshot } from "firebase/firestore";
// arrayUnion exporteren voor gemak
// (optioneel, admin.js importeert direct uit firebase/firestore)

import { getStorage, ref, uploadBytes } from "firebase/storage";

export const firebaseConfig = {
  apiKey: "AIzaSyCwHJ1VIqM9s4tfh2hn8KZxqunuYySzuwQ",
  authDomain: "shadow-app-b3fb3.firebaseapp.com",
  projectId: "shadow-app-b3fb3",
  storageBucket: "shadow-app-b3fb3.appspot.com",
  messagingSenderId: "725156533083",
  appId: "1:725156533083:web:e372fd32d1d0abff4f3f92"
};

const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  experimentalAutoDetectLongPolling: true
});
export const storage = getStorage(app);

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
export { addDoc, arrayUnion, collection, doc, endAt, getDoc, getDocs, increment, limit, orderBy, query, ref, serverTimestamp, setDoc, startAt, startAfter, uploadBytes, where, writeBatch, runTransaction, updateDoc, deleteDoc, onSnapshot };
