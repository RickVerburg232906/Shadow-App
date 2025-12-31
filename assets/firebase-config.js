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

(function(){
  try {
    // Respect explicit localStorage or query overrides
    let mode = null;
    try { mode = localStorage.getItem('firebaseMode'); } catch(_) { mode = null; }
    if (mode === 'prod' || mode === 'dev') {
      window.FIREBASE_MODE = mode;
      return;
    }

    // If running on localhost, default to dev
    const host = (typeof location !== 'undefined' && location.hostname) ? String(location.hostname) : '';
    if (host.indexOf('localhost') !== -1 || host.indexOf('127.0.0.1') !== -1) {
      mode = 'dev';
    } else {
      // Detect Vercel preview branch pattern: `{branch}--{project}.vercel.app`
      // If branch is present and not `main`, use dev.
      let branch = null;
      try {
        if (host && host.indexOf('--') !== -1) {
          branch = host.split('--')[0];
        }
      } catch(_) { branch = null; }
      if (branch && branch !== 'main' && branch.length > 0) mode = 'dev';
      else mode = 'prod';
    }

    try { localStorage.setItem('firebaseMode', mode); } catch(_) {}
    window.FIREBASE_MODE = mode;
    console.debug('firebase-config: auto-detected FIREBASE_MODE =', mode, 'host=', host);
  } catch (e) { /* ignore */ }
})();
