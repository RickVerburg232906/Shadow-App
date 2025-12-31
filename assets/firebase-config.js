(function(){
  try {
    const params = (typeof URLSearchParams !== 'undefined') ? new URLSearchParams(window.location.search) : null;
    const q = params ? params.get('firebase') : null;
    if (q === 'prod' || q === 'dev') {
      try { localStorage.setItem('firebaseMode', q); } catch(_) {}
      console.debug('firebase-config: set firebaseMode to', q);
    }
  } catch (e) { /* ignore */ }
})();

// This file only respects an explicit `?firebase=dev|prod` query parameter and
// sets `localStorage.firebaseMode` accordingly. Environment detection is
// performed by `src/firebase.js` (host-detection) which is the single source
// of truth for selecting dev/prod.

(function(){
  try {
    const params = (typeof URLSearchParams !== 'undefined') ? new URLSearchParams(window.location.search) : null;
    const q = params ? params.get('firebase') : null;
    if (q === 'prod' || q === 'dev') {
      try { localStorage.setItem('firebaseMode', q); } catch(_) {}
      console.debug('firebase-config: set firebaseMode to', q);
    }
  } catch (e) { /* ignore */ }
})();
