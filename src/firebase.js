import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, query, where, orderBy, startAt, endAt, limit, getDocs, getDoc, doc, writeBatch, setDoc, addDoc, serverTimestamp, increment, arrayUnion, runTransaction } from "firebase/firestore";
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

// Re-export helpers
export {addDoc, arrayUnion, collection, doc, endAt, getDoc, getDocs, increment, limit, orderBy, query, ref, serverTimestamp, setDoc, startAt, uploadBytes, where, writeBatch, runTransaction};
