// Lightweight Firestore REST helper that only uses files inside new-ui
// Uses the project's development Firebase config (safe for local dev builds in this workspace).
// Exports `getPlannedDates()` which returns an array of YYYY-MM-DD strings.

const firebaseConfigDev = {
  apiKey: "AIzaSyCwHJ1VIqM9s4tfh2hn8KZxqunuYySzuwQ",
  projectId: "shadow-app-b3fb3",
};

const BASE_URL = `https://firestore.googleapis.com/v1/projects/${firebaseConfigDev.projectId}/databases/(default)/documents`;

function parseFirestoreValue(val) {
  if (!val) return null;
  if (val.stringValue !== undefined) return val.stringValue;
  if (val.timestampValue !== undefined) return val.timestampValue;
  if (val.integerValue !== undefined) return String(val.integerValue);
  if (val.doubleValue !== undefined) return String(val.doubleValue);
  return null;
}

export async function getPlannedDates() {
  try {
    const url = `${BASE_URL}/globals/rideConfig?key=${firebaseConfigDev.apiKey}`;
    const res = await fetch(url, { method: 'GET', credentials: 'omit' });
    if (!res.ok) {
      console.warn('getPlannedDates: fetch failed', res.status, res.statusText);
      return [];
    }
    const data = await res.json();
    // Firestore document format: { fields: { plannedDates: { arrayValue: { values: [ { stringValue: '...' }, ... ] } } } }
    const fields = data && data.fields;
    if (!fields || !fields.plannedDates) return [];
    const arr = fields.plannedDates.arrayValue && fields.plannedDates.arrayValue.values ? fields.plannedDates.arrayValue.values : [];
    const out = arr.map(v => parseFirestoreValue(v) || '').filter(Boolean).map(s => {
      // Normalize timestamp to YYYY-MM-DD if needed
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
      // timestampValue format: 2025-12-22T... convert
      const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
      if (m) return m[1];
      try { const d = new Date(s); if (!isNaN(d)) return d.toISOString().slice(0,10); } catch(_){}
      return s;
    }).filter(Boolean);
    return out;
  } catch (e) {
    console.error('getPlannedDates error', e);
    return [];
  }
}

export default { getPlannedDates };