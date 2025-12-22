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

// Search members by prefix in either `Naam` or `Voor naam` fields.
export async function searchMembers(prefix, maxResults = 8) {
  try {
    prefix = (prefix || '').trim();
    if (!prefix) return [];
    const apiKey = firebaseConfigDev.apiKey;
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfigDev.projectId}/databases/(default)/documents:runQuery?key=${apiKey}`;

    // Use a single GREATER_THAN_OR_EQUAL query per field and filter <= prefix+\uffff on client side.
    function escapeFieldPath(fieldPath) {
      // Split dotted paths and quote tokens that contain characters
      // outside [A-Za-z0-9_] by wrapping them in backticks.
      // Firestore expects backticks around property names with spaces.
      return fieldPath.split('.').map(tok => {
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tok)) return tok;
        return '`' + tok + '`';
      }).join('.');
    }

    const makeBody = (fieldPath, limitCount) => {
      const fp = escapeFieldPath(fieldPath);
      return {
        structuredQuery: {
          from: [{ collectionId: 'members' }],
          where: {
            fieldFilter: { field: { fieldPath: fp }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: prefix } }
          },
          orderBy: [{ field: { fieldPath: fp }, direction: 'ASCENDING' }],
          limit: limitCount
        }
      };
    };

    const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
    const limitCount = Math.max(maxResults * 2, 16);
    const bodies = [makeBody('Naam', limitCount), makeBody('Voor naam', limitCount)];
    const results = [];
    for (const bdy of bodies) {
      try {
        const bodyStr = JSON.stringify(bdy);
        const res = await fetch(url, Object.assign({}, opts, { body: bodyStr }));
        if (!res.ok) {
          const text = await res.text().catch(() => '<no body>');
          console.warn('searchMembers: runQuery failed', res.status, res.statusText, text);
          continue;
        }
        const arr = await res.json();
        for (const entry of arr) {
          if (entry && entry.document && entry.document.name) {
            const id = entry.document.name.split('/').pop();
            const f = entry.document.fields || {};
            const naam = f.Naam ? (f.Naam.stringValue || '') : '';
            const voor = f['Voor naam'] ? (f['Voor naam'].stringValue || '') : '';
            results.push({ id, naam, voor });
          }
        }
      } catch (e) {
        console.error('searchMembers fetch error', e);
      }
    }

    console.log('searchMembers: raw results count', results.length);

    // Fallback: if runQuery returned nothing, fetch a modest page of members and filter client-side.
    if (results.length === 0) {
      try {
        const listUrl = `${BASE_URL}/members?pageSize=200&key=${apiKey}`;
        const listRes = await fetch(listUrl, { method: 'GET' });
        if (listRes.ok) {
          const listJson = await listRes.json();
          const docs = listJson.documents || [];
          for (const doc of docs) {
            const id = doc.name ? doc.name.split('/').pop() : null;
            const f = doc.fields || {};
            const naam = f.Naam ? (f.Naam.stringValue || '') : '';
            const voor = f['Voor naam'] ? (f['Voor naam'].stringValue || '') : '';
            if (id) results.push({ id, naam, voor });
          }
          console.log('searchMembers: fallback list fetched', results.length);
        } else {
          console.warn('searchMembers: fallback list fetch failed', listRes.status, listRes.statusText);
        }
      } catch (e) {
        console.error('searchMembers fallback error', e);
      }
    }

    // Filter client-side: check both `Naam` (last name) and `Voor naam` (first name)
    // so a prefix that matches the first name still returns the member even when last name exists.
    const pl = prefix.toLowerCase();
    const filtered = results.filter(r => {
      const naam = (r.naam || '').toLowerCase();
      const voor = (r.voor || '').toLowerCase();
      return (naam && naam.startsWith(pl)) || (voor && voor.startsWith(pl));
    });
    // Preserve insertion order but dedupe by id
    const map = new Map();
    for (const d of filtered) if (!map.has(d.id)) map.set(d.id, d);
    return Array.from(map.values()).slice(0, maxResults);
  } catch (e) {
    console.error('searchMembers error', e);
    return [];
  }
}

// Fetch lunch options from `globals/lunch` document. Returns { vastEten: [], keuzeEten: [] }
export async function getLunchOptions() {
  try {
    const url = `${BASE_URL}/globals/lunch?key=${firebaseConfigDev.apiKey}`;
    const res = await fetch(url, { method: 'GET', credentials: 'omit' });
    if (!res.ok) {
      console.warn('getLunchOptions: fetch failed', res.status, res.statusText);
      return { vastEten: [], keuzeEten: [] };
    }
    const data = await res.json();
    const fields = data && data.fields ? data.fields : {};
    const parseArrayField = (f) => {
      try {
        if (!f) return [];
        const arr = f.arrayValue && Array.isArray(f.arrayValue.values) ? f.arrayValue.values : [];
        return arr.map(v => parseFirestoreValue(v)).filter(Boolean);
      } catch (_) { return []; }
    };
    const vast = parseArrayField(fields.vastEten);
    const keuze = parseArrayField(fields.keuzeEten);
    return { vastEten: vast, keuzeEten: keuze };
  } catch (e) {
    console.error('getLunchOptions error', e);
    return { vastEten: [], keuzeEten: [] };
  }
}