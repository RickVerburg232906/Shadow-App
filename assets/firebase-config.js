// External Firebase configs for legacy pages that rely on a global var.
// This file will pick a config based on `window.__FIREBASE_ENV__` or
// `window.FIREBASE_USE_PROD` if present; otherwise it defaults to development.
window.__firebaseConfigs = {
  development: {
    apiKey: "AIzaSyCwHJ1VIqM9s4tfh2hn8KZqunuYySzuwQ",
    authDomain: "shadow-app-b3fb3.firebaseapp.com",
    projectId: "shadow-app-b3fb3",
    storageBucket: "shadow-app-b3fb3.firebasestorage.app",
    messagingSenderId: "38812973319",
    appId: "1:38812973319:web:1dd89a0ffa61af564f2da2"
  },
  production: {
    apiKey: "AIzaSyBiV580AjErqJlOhwXR8VTNbY0b1DZJDwM",
    authDomain: "landelijke-rit.firebaseapp.com",
    projectId: "landelijke-rit",
    storageBucket: "landelijke-rit.firebasestorage.app",
    messagingSenderId: "1001186852750",
    appId: "1:1001186852750:web:317122d6d230188cd1eedf",
    measurementId: "G-33G3DH2YFZ"
  }
};

// Determine choice: explicit env override, then boolean flag, else default to development.
var _env = (typeof window !== 'undefined' && window.__FIREBASE_ENV__) ? window.__FIREBASE_ENV__ : null;
if (!_env && typeof window !== 'undefined' && window.FIREBASE_USE_PROD) {
  try { if (String(window.FIREBASE_USE_PROD) === 'true') _env = 'production'; } catch(e){}
}
if (!_env) _env = 'development';

window.firebaseConfigDev = window.__firebaseConfigs[_env] || window.__firebaseConfigs.development;
// Backwards-compatible alias
var firebaseConfigDev = window.firebaseConfigDev;
