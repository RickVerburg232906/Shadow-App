// Lightweight Firestore helpers: retry wrapper and safe update-or-create helper
import { updateDoc, setDoc } from './firebase.js';

/**
 * withRetry: retry wrapper for transient errors (exponential backoff + jitter)
 * - does NOT retry permission-denied or authentication errors
 */
export async function withRetry(fn, { retries = 3, baseDelay = 200 } = {}) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const code = (err && (err.code || err.message || '')).toString().toLowerCase();
      // Do not retry on permission errors or not-found for update semantics
      if (/permission-denied|unauthenticated|not-found/.test(code) || attempt === retries - 1) throw err;
      const delay = baseDelay * Math.pow(2, attempt) + Math.floor(Math.random() * 100);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/**
 * updateOrCreateDoc: try updateDoc first (cheaper for single-field changes),
 * and fall back to setDoc(..., { merge: true }) when the document doesn't exist.
 * Accepts a docRef and the data object.
 */
export async function updateOrCreateDoc(docRef, data) {
  try {
    // Prefer updateDoc to avoid merging nested structures unintentionally.
    await updateDoc(docRef, data);
  } catch (e) {
    // If update fails (likely because doc doesn't exist), fall back to setDoc merge
    try {
      await setDoc(docRef, data, { merge: true });
    } catch (err) {
      // rethrow original error if fallback fails
      throw err || e;
    }
  }
}

export default { withRetry, updateOrCreateDoc };
