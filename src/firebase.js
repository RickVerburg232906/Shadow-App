import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection, query, where, limit,
  getDocsFromCache, getDocsFromServer
} from "firebase/firestore";

// VUL DIT IN (Firebase Console → Project settings → Your apps → Web → Config)
export const firebaseConfig = {
  apiKey: "AIzaSyCwHJ1VIqM9s4tfh2hn8KZxqunuYySzuwQ",
  authDomain: "shadow-app-b3fb3.firebaseapp.com",
  projectId: "shadow-app-b3fb3",
  storageBucket: "shadow-app-b3fb3.firebasestorage.app",
  messagingSenderId: "38812973319",
  appId: "1:38812973319:web:1dd89a0ffa61af564f2da2"
};

const app = initializeApp(firebaseConfig);
export const db  = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

// Kleine helper voor Firestore lookups
export async function findMemberByNameFast(name) {
  const qRef = query(collection(db, "members"), where("displayName", "==", name), limit(1));

  // 1) ultrasnelle cache-check
  try {
    const snapCache = await getDocsFromCache(qRef);
    const arr = [];
    snapCache.forEach(d => arr.push({ uid: d.id, ...d.data() }));
    if (arr.length > 0) return arr;
  } catch {}

  // 2) server met timeout-indicatie
  const serverPromise = (async () => {
    const snap = await getDocsFromServer(qRef);
    const arr = [];
    snap.forEach(d => arr.push({ uid: d.id, ...d.data() }));
    return arr;
  })();

  const timeout = new Promise((resolve) => setTimeout(() => resolve("__SLOW__"), 400));
  const first = await Promise.race([serverPromise, timeout]);

  if (first === "__SLOW__") {
    return await serverPromise;
  }
  return first;
}

// Pre-warm (no-op read) — call once on page load
export async function prewarm() {
  try {
    const qRef = query(collection(db, "_warmup"), limit(1));
    await getDocsFromServer(qRef);
  } catch {}
}
