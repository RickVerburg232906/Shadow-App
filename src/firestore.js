// Lightweight Firestore REST helper that only uses files inside new-ui
// Uses the project's development Firebase config (safe for local dev builds in this workspace).
// Exports `getPlannedDates()` which returns an array of YYYY-MM-DD strings.

const firebaseConfigDev = {
  apiKey: "AIzaSyCwHJ1VIqM9s4tfh2hn8KZxqunuYySzuwQ",
  projectId: "shadow-app-b3fb3",
};

const BASE_URL = `https://firestore.googleapis.com/v1/projects/${firebaseConfigDev.projectId}/databases/(default)/documents`;

// Cache for planned dates to reduce duplicate network requests.
let _plannedDatesCache = null;
let _plannedDatesCachePromise = null;

function parseFirestoreValue(val) {
  if (!val) return null;
  if (val.stringValue !== undefined) return val.stringValue;
  if (val.timestampValue !== undefined) return val.timestampValue;
  if (val.integerValue !== undefined) return String(val.integerValue);
  if (val.doubleValue !== undefined) return String(val.doubleValue);
  return null;
}

export async function getPlannedDates(forceRefresh = false) {
  try {
    if (!forceRefresh) {
      if (_plannedDatesCache) return _plannedDatesCache;
      if (_plannedDatesCachePromise) return await _plannedDatesCachePromise;
    }

    _plannedDatesCachePromise = (async () => {
      const url = `${BASE_URL}/globals/rideConfig?key=${firebaseConfigDev.apiKey}`;
      const res = await fetch(url, { method: 'GET', credentials: 'omit' });
      if (!res.ok) {
        console.warn('getPlannedDates: fetch failed', res.status, res.statusText);
        _plannedDatesCache = [];
        _plannedDatesCachePromise = null;
        return _plannedDatesCache;
      }
      const data = await res.json();
      // Firestore document format: { fields: { plannedDates: { arrayValue: { values: [ { stringValue: '...' }, ... ] } } } }
      const fields = data && data.fields;
      if (!fields || !fields.plannedDates) { _plannedDatesCache = []; _plannedDatesCachePromise = null; return _plannedDatesCache; }
      const arr = fields.plannedDates.arrayValue && fields.plannedDates.arrayValue.values ? fields.plannedDates.arrayValue.values : [];
      const out = arr.map(v => parseFirestoreValue(v) || '').filter(Boolean).map(s => {
        // Normalize timestamp to YYYY-MM-DD if needed
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
        // timestampValue format: 2025-12-22T... convert
        const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
        if (m) return m[1];
        try { const d = new Date(s); if (!isNaN(d)) return d.toISOString().slice(0,10); } catch(_){ }
        return s;
      }).filter(Boolean);
      _plannedDatesCache = out;
      _plannedDatesCachePromise = null;
      return out;
    })();

    return await _plannedDatesCachePromise;
  } catch (e) {
    console.error('getPlannedDates error', e);
    return ['ERROR'];
  }
}

// Clear the cached planned dates (useful after updates)
export function clearPlannedDatesCache() {
  _plannedDatesCache = null;
  _plannedDatesCachePromise = null;
}

export default { getPlannedDates, clearPlannedDatesCache };

// Fetch admin passwords from globals/passwords document. Returns object { inschrijftafel, hoofdadmin }
export async function getAdminPasswords() {
  try {
    const url = `${BASE_URL}/globals/passwords?key=${firebaseConfigDev.apiKey}`;
    const res = await fetch(url, { method: 'GET', credentials: 'omit' });
    if (!res.ok) {
      console.warn('getAdminPasswords: fetch failed', res.status, res.statusText);
      return { inschrijftafel: 'ERROR', hoofdadmin: 'ERROR' };
    }
    const data = await res.json();
    const fields = data && data.fields ? data.fields : {};
    const ins = fields.inschrijftafel ? parseFirestoreValue(fields.inschrijftafel) : null;
    const hoofd = fields.hoofdadmin ? parseFirestoreValue(fields.hoofdadmin) : null;
    return { inschrijftafel: String(ins || 'Shadow'), hoofdadmin: String(hoofd || '1100') };
  } catch (e) {
    console.error('getAdminPasswords error', e);
    return { inschrijftafel: 'ERROR', hoofdadmin: 'ERROR' };
  }
}

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
      return { vastEten: ['ERROR'], keuzeEten: ['ERROR'] };
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
    return { vastEten: ['ERROR'], keuzeEten: ['ERROR'] };
  }
}

// Fetch a full member document by id and return parsed fields object
export async function getMemberById(id) {
  if (!id) return null;
  const url = `${BASE_URL}/members/${encodeURIComponent(id)}?key=${firebaseConfigDev.apiKey}`;
  const res = await fetch(url, { method: 'GET', credentials: 'omit' });
    if (!res.ok) {
        console.warn('getMemberById: fetch failed', res.status, res.statusText);
        return null;
    }
    const data = await res.json();
    if (!data || !data.fields) return null;
    const out = {};
  for (const k of Object.keys(data.fields)) {
    const v = data.fields[k];
    if (!v) { out[k] = null; continue; }
    if (v.arrayValue && Array.isArray(v.arrayValue.values)) {
      out[k] = v.arrayValue.values.map(x => parseFirestoreValue(x)).filter(x => x !== null);
    } else {
      out[k] = parseFirestoreValue(v);
    }
  }
    return out;
}

// Count members that have a given lunchChoice value. Uses runQuery to limit network usage.
export async function getLunchChoiceCount(choice) {
  try {
    if (!choice) return 0;
    const apiKey = firebaseConfigDev.apiKey;
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfigDev.projectId}/databases/(default)/documents:runQuery?key=${apiKey}`;
    const nowIso = new Date().toISOString();
    const body = {
      structuredQuery: {
        from: [{ collectionId: 'members' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: 'lunchKeuze' },
                  op: 'EQUAL',
                  value: { stringValue: String(choice) }
                }
              },
              {
                fieldFilter: {
                  field: { fieldPath: 'lunchExpires' },
                  op: 'GREATER_THAN',
                  value: { timestampValue: nowIso }
                }
              }
            ]
          }
        },
        // request a reasonably large page; adjust if you have >5000 members
        limit: 5000
      }
    };
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      const text = await res.text().catch(() => '<no body>');
      console.warn('getLunchChoiceCount: runQuery failed', res.status, res.statusText, text);
      return 'ERROR';
    }
    const arr = await res.json();
    let count = 0;
    for (const entry of arr) {
      if (entry && entry.document && entry.document.name) count++;
    }
    return count;
  } catch (e) {
    console.error('getLunchChoiceCount error', e);
    return 'ERROR';
  }
}

// Count members by participation value (handles 'yes'/'ja' and 'no'/'nee')
export async function getParticipationCount(choice) {
  try {
    if (!choice) return 0;
    const apiKey = firebaseConfigDev.apiKey;
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfigDev.projectId}/databases/(default)/documents:runQuery?key=${apiKey}`;

    const variants = [];
    const c = String(choice || '').toLowerCase();
    if (c === 'yes' || c === 'ja') variants.push('yes', 'ja');
    else if (c === 'no' || c === 'nee') variants.push('no', 'nee');
    else variants.push(String(choice));

    let total = 0;
    const seen = new Set();
    for (const v of variants) {
      if (!v) continue;
      if (seen.has(v)) continue; seen.add(v);
      const nowIso = new Date().toISOString();
      const body = {
        structuredQuery: {
          from: [{ collectionId: 'members' }],
          where: {
            compositeFilter: {
              op: 'AND',
              filters: [
                {
                  fieldFilter: {
                    field: { fieldPath: 'lunchDeelname' },
                    op: 'EQUAL',
                    value: { stringValue: String(v) }
                  }
                },
                {
                  fieldFilter: {
                    field: { fieldPath: 'lunchExpires' },
                    op: 'GREATER_THAN',
                    value: { timestampValue: nowIso }
                  }
                }
              ]
            }
          },
          limit: 5000
        }
      };
      try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) {
          const text = await res.text().catch(() => '<no body>');
          console.warn('getParticipationCount: runQuery failed', res.status, res.statusText, text);
          continue;
        }
        const arr = await res.json();
        for (const entry of arr) if (entry && entry.document && entry.document.name) total++;
      } catch (e) {
        console.error('getParticipationCount fetch error for', v, e);
      }
    }
    return total;
  } catch (e) {
    console.error('getParticipationCount error', e);
    return 'ERROR';
  }
}

// Fetch the full rideConfig document (plannedDates array + regions map)
export async function getRideConfig() {
  try {
    const url = `${BASE_URL}/globals/rideConfig?key=${firebaseConfigDev.apiKey}`;
    const res = await fetch(url, { method: 'GET', credentials: 'omit' });
    if (!res.ok) {
      console.warn('getRideConfig: fetch failed', res.status, res.statusText);
      return { plannedDates: [], regions: {} };
    }
    const data = await res.json();
    const fields = data && data.fields ? data.fields : {};
    // parse plannedDates similar to getPlannedDates
    const arr = fields.plannedDates && fields.plannedDates.arrayValue && Array.isArray(fields.plannedDates.arrayValue.values) ? fields.plannedDates.arrayValue.values : [];
    const plannedDates = arr.map(v => parseFirestoreValue(v) || '').filter(Boolean).map(s => {
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
      const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
      if (m) return m[1];
      try { const d = new Date(s); if (!isNaN(d)) return d.toISOString().slice(0,10); } catch(_){}
      return s;
    }).filter(Boolean);

    // parse regions map (mapValue.fields)
    const regions = {};
    if (fields.regions && fields.regions.mapValue && fields.regions.mapValue.fields) {
      const map = fields.regions.mapValue.fields;
      for (const k of Object.keys(map)) {
        const v = map[k];
        const parsed = parseFirestoreValue(v);
        if (parsed !== null && parsed !== undefined) regions[k] = parsed;
        else regions[k] = '';
      }
    }
    return { plannedDates, regions };
  } catch (e) {
    console.error('getRideConfig error', e);
    return { plannedDates: [], regions: {} };
  }
}

// Update the rideConfig document with plannedDates array and regions map.
export async function updateRideConfig({ plannedDates = [], regions = {} } = {}) {
  try {
    const url = `${BASE_URL}/globals/rideConfig?key=${firebaseConfigDev.apiKey}`;
    const fields = {};
    // plannedDates -> arrayValue.values of stringValue
    if (Array.isArray(plannedDates)) {
      fields.plannedDates = { arrayValue: { values: plannedDates.map(d => ({ stringValue: String(d) })) } };
    } else {
      fields.plannedDates = { arrayValue: { values: [] } };
    }
    // regions -> mapValue.fields with stringValue entries
    const regionsFields = {};
    for (const k of Object.keys(regions || {})) {
      // Firestore expects field values; empty string allowed
      regionsFields[String(k)] = { stringValue: String(regions[k] || '') };
    }
    fields.regions = { mapValue: { fields: regionsFields } };

    const body = { fields };
    // Use PATCH to set both fields; updateMask ensures only these paths updated
    const finalUrl = url + '&updateMask.fieldPaths=plannedDates&updateMask.fieldPaths=regions';
    const res = await fetch(finalUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      const txt = await res.text().catch(() => '<no body>');
      console.warn('updateRideConfig failed', res.status, res.statusText, txt);
      return { success: false, status: res.status, statusText: res.statusText, raw: txt };
    }
    const json = await res.json();
    // Clear planned dates cache if any
    try { if (typeof clearPlannedDatesCache === 'function') clearPlannedDatesCache(); } catch(_){}
    return { success: true, raw: json };
  } catch (e) {
    console.error('updateRideConfig error', e);
    return { success: false, error: String(e) };
  }
}

// List all members documents, paginating if necessary. Returns array of parsed member objects { id, ...fields }
export async function listAllMembers(pageSize = 500) {
  try {
    const apiKey = firebaseConfigDev.apiKey;
    const out = [];
    let url = `${BASE_URL}/members?pageSize=${pageSize}&key=${apiKey}`;
    while (url) {
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) {
        const txt = await res.text().catch(() => '<no body>');
        console.warn('listAllMembers fetch failed', res.status, res.statusText, txt);
        break;
      }
      const json = await res.json();
      const docs = json.documents || [];
      for (const doc of docs) {
        const id = doc.name ? doc.name.split('/').pop() : null;
        const f = doc.fields || {};
        const parsed = { id };
        for (const k of Object.keys(f)) {
          const v = f[k];
          if (!v) { parsed[k] = null; continue; }
          if (v.arrayValue && Array.isArray(v.arrayValue.values)) {
            parsed[k] = v.arrayValue.values.map(x => parseFirestoreValue(x)).filter(x => x !== null);
          } else {
            parsed[k] = parseFirestoreValue(v);
          }
        }
        out.push(parsed);
      }
      // handle pagination token
      if (json.nextPageToken) {
        url = `${BASE_URL}/members?pageSize=${pageSize}&pageToken=${json.nextPageToken}&key=${apiKey}`;
      } else {
        url = null;
      }
    }
    return out;
  } catch (e) {
    console.error('listAllMembers error', e);
    return [];
  }
}