// Lightweight browser-friendly Firebase SDK shim (ES module)
// Imports the modular Firebase SDK from Google's CDN and re-exports commonly used helpers.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import { getFirestore, collection, onSnapshot, doc, getDoc } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyCwHJ1VIqM9s4tfh2hn8KxqunuYySzuwQ",
  projectId: "shadow-app-b3fb3",
};

let _app = null;
try { _app = initializeApp(firebaseConfig); } catch (_) { /* already initialized */ }
const db = getFirestore(_app);

export { db, collection, onSnapshot, doc, getDoc };
