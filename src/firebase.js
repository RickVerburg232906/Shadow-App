import { initializeApp } from "firebase/app";
import {
  getFirestore, writeBatch, doc, setDoc
} from "firebase/firestore";
import {
  getStorage, ref, uploadBytes
} from "firebase/storage";

// VUL DIT IN
export const firebaseConfig = {
  apiKey:        "YOUR_API_KEY",
  authDomain:    "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:     "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:         "YOUR_APP_ID",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);

export { writeBatch, doc, setDoc, ref, uploadBytes };
