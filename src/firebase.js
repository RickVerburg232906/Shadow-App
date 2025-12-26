import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  query,
  where,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

let db = null;

export function initFirebase(config) {
  if (!config) return null;
  if (!db) {
    const app = initializeApp(config);
    db = getFirestore(app);
  }
  return db;
}

// Auto-init if a global config object is present (pages may set this)
if (typeof window !== 'undefined' && window.__FIREBASE_CONFIG__) {
  try { initFirebase(window.__FIREBASE_CONFIG__); } catch (e) { /* ignore */ }
}

export { db, collection, onSnapshot, doc, getDoc, getDocs, setDoc, addDoc, query, where, Timestamp };
