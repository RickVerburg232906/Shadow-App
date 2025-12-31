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
