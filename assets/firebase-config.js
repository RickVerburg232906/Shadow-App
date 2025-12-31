(function(){
  try {
    // Editable default: change this value to 'dev' or 'prod' to force an environment
    // Example: set to 'dev' during local testing, then revert to 'prod' for production
    const DEFAULT_SHADOW_ENV = 'dev';
    try { if (!window.SHADOW_ENV) window.SHADOW_ENV = DEFAULT_SHADOW_ENV; } catch(_) {}

    // Support quick override via URL: ?firebase=dev|prod or ?db=dev|prod
    const params = (typeof URLSearchParams !== 'undefined') ? new URLSearchParams(window.location.search) : null;
    const q = params ? (params.get('firebase') || params.get('db')) : null;
    if (q === 'prod' || q === 'dev') {
      try { localStorage.setItem('shadow_db_env', q); } catch(_) {}
      try { window.SHADOW_ENV = q; } catch(_) {}
      console.debug('firebase-config: set SHADOW_ENV to', q);
    }

    // If no explicit override provided, respect existing localStorage key if available
    try {
      if (typeof window !== 'undefined' && !window.SHADOW_ENV) {
        const ls = localStorage.getItem('shadow_db_env') || null;
        if (ls === 'prod' || ls === 'dev') {
          try { window.SHADOW_ENV = ls; } catch(_){}
        }
      }
    } catch(_){}
  } catch (e) { /* ignore */ }
})();
