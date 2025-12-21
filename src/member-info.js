// member-info.js
// Renders a compact member info card showing name, member number, region
// and planned-rides stars. Stars update in real-time based on the member
// document's `ScanDatums` field and the global planned dates.
import { db, doc, onSnapshot, getDoc } from './firebase.js';

// Local planned-dates helpers for this module so `member-info` is self-contained.
// These are intentionally module-scoped and do not remove the originals in
// `src/member.js` which other modules may rely on.
let _MI_PLANNED_CACHE = [];
async function getPlannedDatesLocal() {
  try {
    if (Array.isArray(_MI_PLANNED_CACHE) && _MI_PLANNED_CACHE.length) return _MI_PLANNED_CACHE;
    const planRef = doc(db, 'globals', 'rideConfig');
    const cfgSnap = await getDoc(planRef);
    const dates = cfgSnap.exists() && Array.isArray(cfgSnap.data().plannedDates) ? cfgSnap.data().plannedDates.filter(Boolean) : [];
    _MI_PLANNED_CACHE = dates.map(d => {
      try {
        if (typeof d === 'string') { const m = d.match(/\d{4}-\d{2}-\d{2}/); if (m) return m[0]; }
        const dt = new Date(d); if (!isNaN(dt)) return dt.toISOString().slice(0,10); return '';
      } catch(_) { return ''; }
    }).filter(Boolean);
    return _MI_PLANNED_CACHE;
  } catch (e) { console.error('member-info.getPlannedDatesLocal failed', e); _MI_PLANNED_CACHE = []; return _MI_PLANNED_CACHE; }
}

function plannedStarsWithHighlightsLocal(plannedDates, scanDates) {
  const planned = plannedDates.map(v => {
    try {
      if (!v) return '';
      if (typeof v === 'object' && v.seconds) {
        const d = new Date(v.seconds * 1000);
        return d.toISOString().slice(0,10);
      }
      if (typeof v === 'string') {
        const m = v.match(/\d{4}-\d{2}-\d{2}/);
        if (m) return m[0];
      }
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0,10);
      return '';
    } catch { return ''; }
  }).filter(Boolean);
  const scans = new Set((Array.isArray(scanDates) ? scanDates : []).map(v => {
    try { if (typeof v === 'string') { const m = v.match(/\d{4}-\d{2}-\d{2}/); if (m) return m[0]; } const d = new Date(v); if (!isNaN(d)) return d.toISOString().slice(0,10); } catch{} return '';
  }).filter(Boolean));
  const starsHtml = planned.map(d => scans.has(d) ? '<span class="star filled">★</span>' : '<span class="star empty">☆</span>').join('');
  const stars = planned.map(d => scans.has(d) ? '★' : '☆').join('');
  return { stars, starsHtml, planned };
}

export function renderMemberInfo(container = null, opts = {}) {
  try {
    if (!container) container = document.getElementById('memberInfoMount');
    if (!container) return null;

    // Build a clean, fixed member info card. Keep the existing element ids
    // (`rName`, `rMemberNo`, `rRidesCount`, `rRegion`) for compatibility.
    container.innerHTML = `
      <div id="memberInfoCard" class="card member-card hidden">
        <div class="member-card__row">
          <div class="member-card__main">
            <div class="member-card__meta">
              <div class="member-card__name" id="rName">—</div>
              <div class="member-card__details">
                <div class="member-card__detail"><span class="muted">LidNr</span> <strong id="rMemberNo">—</strong></div>
                <div class="member-card__detail"><span class="muted">Regio</span> <strong id="rRegion">—</strong></div>
              </div>
            </div>
          </div>
          <div class="member-card__right">
            <div class="muted">Gereden ritten</div>
            <div id="rRidesCount" class="member-card__rides">—</div>
          </div>
          <div class="member-card__note" role="note" aria-live="polite" style="margin-top:8px; font-size:14px; padding:8px 12px; border-radius:6px; display:flex; gap:10px; align-items:center;">
            <div style="flex:1; font-weight:600;">Er wordt niets opgeslagen totdat je ingecheckt bent.</div>
          </div>
      </div>
    `;

    const card = container.querySelector('#memberInfoCard');
    const nameEl = container.querySelector('#rName');
    const memberNoEl = container.querySelector('#rMemberNo');
    const ridesEl = container.querySelector('#rRidesCount');
    const regionEl = container.querySelector('#rRegion');

    let _unsub = null;
    let _currentId = null;

    async function updateFromSnapshot(data) {
      try {
        if (!data) return;
        const d = data;
        const fullName = `${d['Voor naam'] || ''} ${(d['Tussen voegsel'] || '').trim()} ${d['Naam'] || ''}`.replace(/\s+/g,' ').trim() || '—';
        if (nameEl) nameEl.textContent = fullName;
        if (memberNoEl) memberNoEl.textContent = String(d.id || d.LidNr || d.lidNr || d.memberNo || d.MemberNo || '—');
        if (regionEl) regionEl.textContent = d['Regio Omschrijving'] || d.Regio || d.regio || d.region || '—';
        const scanDates = Array.isArray(d.ScanDatums) ? d.ScanDatums : (Array.isArray(d.scandatums) ? d.scandatums : []);
        // planned dates may be cached; fetch once
        const planned = await getPlannedDatesLocal();
        const { starsHtml, tooltip, planned: plannedNorm } = plannedStarsWithHighlightsLocal(planned, scanDates);
        if (ridesEl) {
          ridesEl.innerHTML = starsHtml || '—';
          if (tooltip) ridesEl.setAttribute('title', tooltip);
          ridesEl.setAttribute('aria-label', starsHtml ? `Sterren: ${plannedNorm.length}` : 'Geen geplande ritten');
          // ensure star styles present
        }
        
      } catch (e) { console.error('member-info.updateFromSnapshot failed', e); }
    }

    async function setMember(id) {
      try {
        // unsubscribe previous
        try { if (_unsub) { _unsub(); _unsub = null; } } catch(_) {}
        _currentId = id ? String(id) : null;
        if (!_currentId) {
          try { if (card) card.classList.add('hidden'); } catch(_) {}
          return;
        }
        try { if (card) card.classList.remove('hidden'); } catch(_) {}

        // first try to load a snapshot listener for realtime updates
        try {
          const ref = doc(db, 'members', _currentId);
          _unsub = onSnapshot(ref, (snap) => {
            if (!snap.exists()) return;
            const data = snap.data() || {};
            // attach id for convenience
            data.id = snap.id;
            updateFromSnapshot(data);
          }, (err) => {
            console.warn('member-info: onSnapshot error', err);
          });
        } catch (e) {
          // fallback: one-off read
          try {
            const snap = await getDoc(doc(db, 'members', _currentId));
            if (snap && snap.exists()) updateFromSnapshot(Object.assign({ id: snap.id }, snap.data()));
          } catch (e2) { console.error('member-info: failed to load member', e2); }
        }
      } catch (e) { console.error('member-info.setMember failed', e); }
    }

    function destroy() {
      try { if (_unsub) { _unsub(); _unsub = null; } } catch(_) {}
      try { container.innerHTML = ''; } catch(_) {}
    }

    return { el: container, setMember, destroy, getCurrent: () => _currentId };
  } catch (e) { console.error('renderMemberInfo failed', e); return null; }
}

export default renderMemberInfo;
