import { initializeApp } from "firebase/app";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, query, where, orderBy, startAt, endAt, limit,
  getDocs, getDoc, doc, writeBatch, setDoc
} from "firebase/firestore";
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
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
export const storage = getStorage(app);

// Re-export helpers
export {
  collection, query, where, orderBy, startAt, endAt, limit,
  getDocs, getDoc, doc, writeBatch, setDoc, ref, uploadBytes
};
