// Admin helpers for new-ui: scanner + simple Firestore REST writers (simplified)
import { getLunchOptions, getLunchChoiceCount, getParticipationCount, getMemberById, searchMembers, getPlannedDates } from './firestore.js';
import { initFirebase, db, collection, onSnapshot, doc, query, where } from './firebase.js';
import { ensureHtml5Qrcode, selectRearCameraDeviceId, startQrScanner, stopQrScanner } from './scanner.js';

const firebaseConfigDev = {
  apiKey: "AIzaSyCwHJ1VIqM9s4tfh2hn8KZxqunuYySzuwQ",
  projectId: "shadow-app-b3fb3",
};

// Initialize the browser Firebase shim so `db` is available for collection()/onSnapshot()
try { initFirebase(firebaseConfigDev); } catch (e) { console.warn('initFirebase failed', e); }

const BASE_URL = `https://firestore.googleapis.com/v1/projects/${firebaseConfigDev.projectId}/databases/(default)/documents`;
// Timestamp (ms) until which automatic showing of history stars should be suppressed.
let _historySuppressShowUntil = 0;
// Normalize common yes/no values (Dutch/English/boolean-like) to 'yes'|'no'|null
function normalizeYesNo(v) {
  try {
    if (v === null || v === undefined) return null;
    const s = String(v).toLowerCase().trim();
    if (s === 'yes' || s === 'ja' || s === 'y' || s === 'true' || s === '1') return 'yes';
    if (s === 'no' || s === 'nee' || s === 'n' || s === 'false' || s === '0') return 'no';
    return null;
  } catch (_) { return null; }
}

// Clear stored selection/state for the manual page but keep sections visible.
export function clearManualStoredSelections() {
  try {
    // remove stored member id markers
    try { const mi2 = document.getElementById('participant-name-input-manual'); if (mi2) { mi2.removeAttribute('data-member-id'); if (mi2.dataset) delete mi2.dataset.selectedMember; } } catch(_){}
    try { if (window && window._selectedMemberId) delete window._selectedMemberId; } catch(_){}

    // clear lunch radios and choices
    try {
      const eetRadios = Array.from(document.querySelectorAll('#lunch-choices-host input[name="eetmee"]'));
      eetRadios.forEach(r => { try { r.checked = false; r.dispatchEvent(new Event('change', { bubbles: true })); } catch(_){} });
    } catch(_){}
    try {
      const keuzeEls = Array.from(document.querySelectorAll('#lunch-choices-list input[name="keuzeEten"]'));
      keuzeEls.forEach(r => { try { r.checked = false; r.dispatchEvent(new Event('change', { bubbles: true })); } catch(_){} });
    } catch(_){}
    try {
      const jaarEls = Array.from(document.querySelectorAll('#jaarhanger-host input[name="jaarhanger"]'));
      jaarEls.forEach(r => { try { r.checked = false; r.dispatchEvent(new Event('change', { bubbles: true })); } catch(_){} });
    } catch(_){}

    // reset any visual disabled state
    try { const kc = document.getElementById('lunch-choices-list'); if (kc) kc.classList.remove('lunch-disabled'); } catch(_){}
    try { updateManualSaveState(); } catch(_){}
  } catch (e) { console.warn('clearManualStoredSelections failed', e); }
}
// handmatige-keuzes code removed per request; manual-page helpers intentionally omitted.

function ensureScanToastStyles() {
  try {
    if (typeof window === 'undefined') return;
    if (window.__scanToastStylesInjected) return;
    const css = `
      .scan-toast{position:fixed;left:50%;transform:translateX(-50%) translateY(-10px);bottom:24px;background:var(--green, #16a34a);color:#fff;padding:10px 14px;border-radius:10px;font-weight:700;box-shadow:0 8px 24px rgba(16,24,40,0.2);z-index:99999;opacity:0;pointer-events:none;transition:transform .22s ease,opacity .18s ease}
      .scan-toast.show-in{opacity:1;transform:translateX(-50%) translateY(0)}
      .scan-toast.show-out{opacity:0;transform:translateX(-50%) translateY(-10px)}
    `;
    const s = document.createElement('style');
    s.setAttribute('data-generated','scan-toast-styles');
    s.appendChild(document.createTextNode(css));
    (document.head || document.documentElement).appendChild(s);
    window.__scanToastStylesInjected = true;
  } catch (e) { /* ignore */ }
}

function showScanSuccess(msg) {
  try {
    ensureScanToastStyles();
    const el = document.createElement('div');
    el.className = 'scan-toast show-in';
    el.textContent = String(msg || 'Gescand');
    document.body.appendChild(el);
    // Trigger out animation after a short delay so in animation plays first
    requestAnimationFrame(() => {
      // move to out after 1s visible time
      setTimeout(() => {
        el.classList.remove('show-in');
        el.classList.add('show-out');
      }, 1000);
    });
    // Remove after out animation completes (1s delay + 420ms)
    setTimeout(() => { try { if (el && el.parentNode) el.parentNode.removeChild(el); } catch(_){} }, 1500);
  } catch (e) { console.warn('showScanSuccess failed', e); }
}

function showScanError(msg, visibleMs = 5000) {
  try {
    ensureScanToastStyles();
    const el = document.createElement('div');
    el.className = 'scan-toast show-in';
    el.textContent = String(msg || 'Fout');
    el.style.background = 'var(--red, #dc2626)';
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      // keep visible for visibleMs, then animate out
      setTimeout(() => {
        try { el.classList.remove('show-in'); el.classList.add('show-out'); } catch(_){}
      }, visibleMs);
    });
    // Remove after out animation completes (visibleMs + 420ms + small buffer)
    setTimeout(() => { try { if (el && el.parentNode) el.parentNode.removeChild(el); } catch(_){} }, visibleMs + 600);
  } catch (e) { console.warn('showScanError failed', e); }
}

// Expose a global helper so shared scanner module can trigger the same toast
try { if (typeof window !== 'undefined') window.showScanSuccess = showScanSuccess; } catch(_) {}

// Recent scan guard: map of memberId -> timestamp(ms) to prevent spammy duplicate scans
const _recentScans = new Map();
// Members registered during this session (to prevent re-processing the same QR)
const _registeredThisSession = new Set();
function renderActivityItem(member, whenIso) {
  try {
    const container = document.getElementById('recent-activity-list');
    if (!container) return;
    // remove placeholder message if present (first real scan)
    try {
      const ph = document.getElementById('recent-activity-placeholder');
      if (ph && ph.parentNode === container) ph.parentNode.removeChild(ph);
    } catch(_){}
    const time = new Date(whenIso || Date.now());
    const hh = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    // Prefer separate first/last name fields when available (Dutch + English variants)
    // Support Firestore field names like 'Voor naam' (with space) and 'Achternaam'
    const first = member && (member['Voor naam'] || member.Voornaam || member.voornaam || member.firstName || member.first || member.givenName) ? (member['Voor naam'] || member.Voornaam || member.voornaam || member.firstName || member.first || member.givenName) : '';
    const last = member && (member['Naam'] || member.Achternaam || member.achternaam || member.lastName || member.surname || member.familyName) ? (member['Naam'] || member.Achternaam || member.achternaam || member.lastName || member.surname || member.familyName) : '';
    let name = '';
    if (first && last) name = `${first} ${last}`;
    else if (first) name = first;
    else if (last) name = last;
    else if (member && (member.Naam || member.name || member.naam || member.fullName)) name = (member.Naam || member.name || member.naam || member.fullName);
    else if (member && (member.lidnummer || member.id)) name = String(member.lidnummer || member.id);
    else name = 'Onbekend';
    let initials = '';
    try {
      const f = String(first || '').trim();
      const l = String(last || '').trim();
      if (f && l) {
        initials = (f[0] || '') + (l[0] || '');
      } else {
        const base = String(first || name || '').trim();
        const parts = base.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) initials = (parts[0][0] || '') + (parts[1][0] || '');
        else initials = (base.slice(0,2) || '').toString();
      }
      initials = initials.toUpperCase();
    } catch (_) { initials = (String(name || '').slice(0,2) || '').toUpperCase(); }
    const item = document.createElement('div');
    item.className = 'activity-item';
    item.setAttribute('aria-live','polite');
    item.innerHTML = `
      <div class="activity-item__left">
        <div class="activity-accent" aria-hidden="true"></div>
        <div class="activity-avatar" title="${String(name)}">${initials}</div>
        <div class="activity-content">
          <div class="activity-name">${String(name)}</div>
          <div class="activity-meta">${hh}</div>
        </div>
      </div>
      <div class="activity-check" aria-hidden="true"><span class="material-symbols-outlined">check</span></div>
    `;
    container.insertBefore(item, container.firstChild);
    // limit list length to 20 (keep placeholder removed)
    while (container.children.length > 20) container.removeChild(container.lastChild);
    try { updateActivityScrollState(); } catch(_){}
  } catch (e) { console.warn('renderActivityItem failed', e); }
}

// Toggle scrollable state for the activity list when it exceeds 3 items
function updateActivityScrollState() {
  try {
    const container = document.getElementById('recent-activity-list');
    if (!container) return;
    // count only actual activity items (exclude placeholder if present)
    const children = Array.from(container.children).filter(c => !(c.id && c.id === 'recent-activity-placeholder'));
    if (children.length > 3) container.classList.add('scrollable'); else container.classList.remove('scrollable');
  } catch (e) { /* ignore */ }
}

// Simple Firestore REST update for a member document. Uses PATCH with updateMask to set specific fields.
export async function checkInMemberById(memberId, { lunchDeelname = null, lunchKeuze = null, Jaarhanger = null } = {}) {
  if (!memberId) return { success: false, error: 'missing-id' };
  try {
    const url = `${BASE_URL}/members/${encodeURIComponent(memberId)}?key=${firebaseConfigDev.apiKey}`;
    const fields = {};
    if (lunchDeelname !== null) fields.lunchDeelname = { stringValue: String(lunchDeelname) };
    if (lunchKeuze !== null) fields.lunchKeuze = { stringValue: String(lunchKeuze) };
    if (Jaarhanger !== null) fields.Jaarhanger = { stringValue: String(Jaarhanger) };
    // set expiry for lunch fields (24h)
    const expires = new Date(Date.now() + (24 * 60 * 60 * 1000));
    fields.lunchExpires = { timestampValue: expires.toISOString() };
    const body = { fields };
    const params = [];
    if (lunchDeelname !== null) params.push('updateMask.fieldPaths=lunchDeelname');
    if (lunchKeuze !== null) params.push('updateMask.fieldPaths=lunchKeuze');
    if (Jaarhanger !== null) params.push('updateMask.fieldPaths=Jaarhanger');
    params.push('updateMask.fieldPaths=lunchExpires');
    const finalUrl = url + (params.length ? ('&' + params.join('&')) : '');
    const res = await fetch(finalUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      const text = await res.text().catch(() => '<no body>');
      console.warn('checkInMemberById failed', res.status, res.statusText, text);
      return { success: false, status: res.status, statusText: res.statusText, raw: text };
    }
    const json = await res.json();
    return { success: true, raw: json };
  } catch (e) {
    console.error('checkInMemberById error', e);
    return { success: false, error: String(e) };
  }
}

export async function manualRegisterRide(memberId, rideDateYMD) {
  if (!memberId || !rideDateYMD) return { success: false, error: 'missing-params' };
  try {
    const getUrl = `${BASE_URL}/members/${encodeURIComponent(memberId)}?key=${firebaseConfigDev.apiKey}`;
    const getRes = await fetch(getUrl, { method: 'GET' });
    if (!getRes.ok) return { success: false, error: 'member-not-found' };
    const doc = await getRes.json();
    const fields = doc.fields || {};
    const scans = (fields.ScanDatums && Array.isArray(fields.ScanDatums.arrayValue && fields.ScanDatums.arrayValue.values) ? fields.ScanDatums.arrayValue.values.map(v => v.stringValue || '') : []);
    if (!scans.includes(rideDateYMD)) scans.push(rideDateYMD);
    const body = { fields: { ScanDatums: { arrayValue: { values: scans.map(s => ({ stringValue: String(s) })) } } } };
    const finalUrl = `${getUrl}&updateMask.fieldPaths=ScanDatums`;
    const res = await fetch(finalUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) { const txt = await res.text().catch(() => ''); return { success: false, raw: txt }; }
    return { success: true, raw: await res.json() };
  } catch (e) { return { success: false, error: String(e) }; }
}

export default {
  ensureHtml5Qrcode,
  selectRearCameraDeviceId,
  startQrScanner,
  stopQrScanner,
  checkInMemberById,
  manualRegisterRide
};

// Initialize the inschrijftafel page: render lunch options, counts and wire scanner button (minimal)
export async function initInschrijftafel() {
  try {
    try {
      const role = (localStorage.getItem('role') || '').trim();
      if (role !== 'admin') {
        try { const sec = document.getElementById('historie-section'); if (sec) sec.style.display = 'none'; } catch(_){ }
      }
      try {
        // show admin footer only for admin role (use aria-hidden so CSS controls display)
        const footer = document.getElementById('admin-bottom-nav');
        if (footer) {
          if (role === 'admin') { footer.setAttribute('aria-hidden','false'); }
          else { footer.setAttribute('aria-hidden','true'); }
        }
      } catch(_){}
    } catch (e) { console.error('role-visibility', e); }

    try {
      const container = document.getElementById('keuze-maaltijden-list');
      if (container) {
        container.innerHTML = '<div class="text-text-sub text-sm">Laden...</div>';
        const opts = await getLunchOptions();
        const keuze = Array.isArray(opts.keuzeEten) ? opts.keuzeEten : [];
        if (keuze.length === 0) { container.innerHTML = '<div class="text-text-sub text-sm">Geen keuze maaltijden gevonden</div>'; }
        else {
          container.innerHTML = keuze.map((item, idx) => `
            <div class="keuze-item">
              <div class="keuze-name">${String(item)}</div>
              <div id="choice-count-${idx}" class="keuze-count">…</div>
            </div>
          `).join('');
          keuze.forEach((item, idx) => (async () => {
            const el = document.getElementById('choice-count-' + idx);
            try { const cnt = await getLunchChoiceCount(item); if (el) el.textContent = String((typeof cnt === 'number' && isFinite(cnt)) ? cnt : 0); } catch (e) { if (el) el.textContent = 'ERROR'; }
          })());
        }
      }
    } catch (e) { console.error('load lunch options failed', e); }

    try {
      const yesEl = document.getElementById('count-yes');
      const noEl = document.getElementById('count-no');
      try {
        // Start live listener to keep counts dynamic
        initLiveLunchStats();
        // initLiveLunchStats will update yesEl/noEl when snapshot arrives
      } catch (e) { if (yesEl) yesEl.textContent = 'ERROR'; if (noEl) noEl.textContent = 'ERROR'; }
    } catch (e) { console.error('update participation UI failed', e); }

    const buttons = Array.from(document.querySelectorAll('button'));
    let startBtn = null;
    for (const b of buttons) { if (b.textContent && b.textContent.trim().includes('Start Scanner')) { startBtn = b; break; } }
    if (startBtn) {
      let running = null;
      // save original HTML to restore later
      if (!startBtn.dataset.origHtml) startBtn.dataset.origHtml = startBtn.innerHTML;
      // (Removed request-camera-button and handler)
      startBtn.addEventListener('click', async () => {
        try {
          if (running) {
            try { await stopQrScanner(running); } catch(_){ }
            running = null;
            try { startBtn.innerHTML = startBtn.dataset.origHtml || 'Start Scanner'; } catch(_){ }
            return;
          }

          // Prepare preview area: hide placeholder overlay and remove background image so scanner becomes visible
          try {
            const adminQR = document.getElementById('adminQRReader');
            if (adminQR) {
              const previewParent = adminQR.parentElement;
              const placeholder = document.getElementById('adminQRPlaceholder');
              // save previous preview/placeholder state so we can fully restore on stop
              try {
                if (previewParent) {
                  // store previous styles on the scanner root so stopQrScanner can read them
                  adminQR.dataset.prevBackgroundImage = previewParent.style.backgroundImage || '';
                  adminQR.dataset.prevHeight = previewParent.style.height || '';
                  adminQR.dataset.prevMaxHeight = previewParent.style.maxHeight || '';
                }
                if (placeholder) {
                  placeholder.dataset.prevDisplay = placeholder.style.display || '';
                  // save innerHTML so we can fully restore the original picture/icon
                  try { placeholder.dataset.prevInnerHtml = placeholder.innerHTML || ''; } catch(_) { placeholder.dataset.prevInnerHtml = ''; }
                  placeholder.style.display = 'none';
                }
              } catch (_) {}
              // don't remove placeholder/background yet — wait until scanner actually started successfully
              adminQR.style.width = '100%';
              adminQR.style.height = '100%';
              adminQR.style.position = 'relative';
              adminQR.innerHTML = '';
            }
          } catch (e) { console.warn('prepare preview failed', e); }

          let res = null;
          try {
            res = await startQrScanner('adminQRReader', async (decoded) => {
            try {
              console.log('QR decoded:', decoded);
              // Attempt to parse JSON payload; fall back to raw string
              let parsed = null;
              try { parsed = JSON.parse(decoded); } catch(_) { parsed = null; }
              // Expect payload to include a member id and fields: Jaarhanger, lunchDeelname, lunchKeuze
              let memberId = null;
              let Jaarhanger = null;
              let lunchDeelname = null;
              let lunchKeuze = null;
              if (parsed && typeof parsed === 'object') {
                memberId = parsed.memberId || parsed.lidnummer || parsed.id || parsed.lid || parsed.lid_nr || parsed.lidnummer || null;
                Jaarhanger = parsed.Jaarhanger ?? parsed.jaarhanger ?? null;
                lunchDeelname = parsed.lunchDeelname ?? parsed.lunchDeelname ?? parsed.lunchDeelname ?? null;
                lunchKeuze = parsed.lunchKeuze ?? parsed.lunchKeuze ?? parsed.lunchKeuze ?? null;
              } else {
                // Try format like 'id:123|Jaarhanger:yes|lunchDeelname:yes|lunchKeuze:Vlees'
                const parts = String(decoded || '').split(/[|;,]/).map(s => s.trim());
                for (const p of parts) {
                  const kv = p.split(':'); if (kv.length < 2) continue;
                  const k = kv[0].trim().toLowerCase(); const v = kv.slice(1).join(':').trim();
                  if (!memberId && /id|lid|lidnummer/.test(k)) memberId = v;
                  if (!Jaarhanger && /jaarhanger|jaarn?hanger|jaar/.test(k)) Jaarhanger = v;
                  if (!lunchDeelname && /lunchdeelname|participatie|deelname/.test(k)) lunchDeelname = v;
                  if (!lunchKeuze && /lunchkeuze|keuze/.test(k)) lunchKeuze = v;
                }
              }
              // If QR contains a scanDate, ensure it matches today's date
              try {
                let scanDateRaw = null;
                if (parsed && typeof parsed === 'object') {
                  scanDateRaw = parsed.scanDate || parsed.scan_date || parsed.scanDatum || parsed.scanDatum || parsed.scan || parsed.date || null;
                }
                if (!scanDateRaw) {
                  // try to find date in raw parts
                  for (const p of parts || []) {
                    const kv = p.split(':'); if (kv.length < 2) continue;
                    const k = kv[0].trim().toLowerCase(); const v = kv.slice(1).join(':').trim();
                    if (!scanDateRaw && /scandate|scan_date|scandatum|datum|date/.test(k)) scanDateRaw = v;
                  }
                }
                if (scanDateRaw) {
                  // normalize to YYYY-MM-DD if possible
                  let normalized = null;
                  try {
                    if (/^\d{4}-\d{2}-\d{2}/.test(scanDateRaw)) normalized = scanDateRaw.slice(0,10);
                    else {
                      const d = new Date(scanDateRaw);
                      if (!isNaN(d)) normalized = d.toISOString().slice(0,10);
                    }
                  } catch(_) { normalized = null; }
                  const today = (new Date()).toISOString().slice(0,10);
                  if (normalized && normalized !== today) {
                    try { showScanError('Deze QR is niet voor deze rit', 5000); } catch(_) { alert('Deze QR is niet meer geldig'); }
                    return;
                  }
                }
              } catch (e) { /* ignore date-check errors and continue */ }
              if (!memberId) {
                alert('Gescand: geen lidnummer gevonden in QR');
                return;
              }
              // If this member was already registered in this session, ignore further scans
              try {
                if (_registeredThisSession.has(String(memberId))) {
                  return;
                }
              } catch(_){}
              // Prevent the same memberId being processed repeatedly within 2 seconds
              try {
                const now = Date.now();
                const last = _recentScans.get(memberId);
                if (last && (now - last) < 2000) {
                  // duplicate scan within 2s — ignore silently
                  return;
                }
                _recentScans.set(memberId, now);
                // cleanup entry after a short TTL
                setTimeout(() => { try { _recentScans.delete(memberId); } catch(_){} }, 3000);
              } catch (e) { console.warn('recent scan guard error', e); }
              
              // write lunch fields and expiry to Firestore (if present)
              try {
                const r = await checkInMemberById(String(memberId), { lunchDeelname, lunchKeuze, Jaarhanger });
                if (r && r.success) {
                  try { showScanSuccess('Ingeschreven: ' + (memberId || '')); } catch(_) {}
                  try { _registeredThisSession.add(String(memberId)); } catch(_){}
                  
                  // Immediately lock member check-in UI if visible so it's clear the member is registered
                  try {
                    const summary = document.getElementById('member-lunch-summary');
                    if (summary) {
                      summary.dataset.locked = '1';
                      summary.setAttribute('aria-disabled','true');
                      summary.style.pointerEvents = 'none';
                      summary.style.opacity = summary.style.opacity || '0.9';
                      const iconEl = summary.querySelector('.ml-2');
                      if (iconEl) { try { iconEl.innerHTML = '<span class="material-symbols-outlined">lock</span>'; } catch(_){} }
                    }
                    const saveBtn = document.getElementById('save-qr-button');
                    if (saveBtn) { saveBtn.disabled = true; saveBtn.setAttribute('aria-disabled','true'); saveBtn.classList.add('opacity-50'); }
                    const qrImg = document.getElementById('checkin-qr-img');
                    if (qrImg) { qrImg.style.filter = 'grayscale(70%)'; qrImg.title = 'Ingeschreven'; }
                  } catch (e) { console.warn('lock check-in UI failed', e); }

                  // Append to recent activity list (show name/time). Try to fetch member document for name
                  getMemberById(String(memberId)).then(memberDoc => {
                    renderActivityItem(memberDoc || { lidnummer: memberId }, new Date().toISOString());
                  }).catch(_ => {
                    renderActivityItem({ lidnummer: memberId }, new Date().toISOString());
                  });
                } else {
                  console.warn('checkInMemberById returned', r);
                  alert('Kon lid niet bijwerken');
                }
              } catch (e) { console.error('apply scan to member failed', e); alert('Fout bij schrijven naar Firestore'); }

              // also record today's date in ScanDatums
              try {
                const today = new Date().toISOString().slice(0,10);
                const mr = await manualRegisterRide(String(memberId), today);
                if (!mr || !mr.success) console.warn('manualRegisterRide failed', mr);
              } catch (e) { console.error('manualRegisterRide error', e); }
            } catch(_){ }
          }, { fps: 10, qrbox: 250 });
          
          // Only hide the placeholder and remove preview background after scanner actually displays video
          try {
            const adminQR = document.getElementById('adminQRReader');
            if (adminQR) {
              const previewParent = adminQR.parentElement;
              const placeholder = document.getElementById('adminQRPlaceholder');
              const hidePlaceholder = () => {
                try { if (placeholder) placeholder.style.display = 'none'; } catch(_){}
                try {
                  if (previewParent) {
                    previewParent.style.backgroundImage = 'none';
                    previewParent.style.backgroundSize = 'cover';
                  }
                } catch(_){}
              };

              // If a video element was inserted by html5-qrcode, wait for it to start playing
              try {
                const video = adminQR.querySelector('video');
                if (video) {
                  // If already playing, hide immediately
                  if (!video.paused && !video.ended && video.readyState > 2) {
                    hidePlaceholder();
                  } else {
                    const onPlay = () => { try { hidePlaceholder(); video.removeEventListener('playing', onPlay); video.removeEventListener('canplay', onPlay); } catch(_){} };
                    video.addEventListener('playing', onPlay);
                    video.addEventListener('canplay', onPlay);
                    // fallback: after 1500ms hide anyway
                    setTimeout(() => { try { hidePlaceholder(); video.removeEventListener('playing', onPlay); video.removeEventListener('canplay', onPlay); } catch(_){} }, 1500);
                  }
                } else {
                  // no video element yet — wait a bit for DOM insertion then hide as fallback
                  setTimeout(() => { try { hidePlaceholder(); } catch(_){} }, 400);
                }
              } catch (e) {
                try { hidePlaceholder(); } catch(_){}
              }
            }
          } catch(_) {}
          } catch (startErr) {
            console.warn('startQrScanner failed', startErr);
            // restore placeholder/background if start failed
            try {
              const adminQR = document.getElementById('adminQRReader');
              if (adminQR) {
                const previewParent = adminQR.parentElement;
                const placeholder = document.getElementById('adminQRPlaceholder');
                try { if (placeholder) placeholder.style.display = placeholder.dataset.prevDisplay || ''; } catch(_){}
                try { if (previewParent) previewParent.style.removeProperty('background-image'); } catch(_){}
              }
            } catch(_){}
          }

          running = res && res.scannerInstance ? res.scannerInstance : null;
          try { startBtn.innerHTML = '<span class="material-symbols-outlined">stop</span> Stop Scanner'; } catch(_){ }
          
          // Ensure the scanner preview is visible: scroll the reader (or its parent) into view
          try {
            const root = document.getElementById('adminQRReader');
            const previewParent = root && root.parentElement ? root.parentElement : null;
            // delay slightly to allow layout changes to take effect
            setTimeout(() => {
              try {
                const vp = previewParent || root;
                if (vp && typeof window !== 'undefined') {
                  const rect = vp.getBoundingClientRect();
                  const offset = Math.round(window.innerHeight * 0.1); // place viewer ~10% from top
                  const target = Math.max(0, window.scrollY + rect.top - offset);
                  window.scrollTo({ top: target, behavior: 'smooth' });
                } else if (vp && typeof vp.scrollIntoView === 'function') {
                  vp.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              } catch (_) {}
            }, 100);
          } catch (e) { console.warn('scroll to scanner failed', e); }
        } catch (e) {
          try {
            const adminQR = document.getElementById('adminQRReader');
            if (adminQR) {
              const previewParent = adminQR.parentElement;
              const placeholder = document.getElementById('adminQRPlaceholder');
              try { if (placeholder) placeholder.style.display = placeholder.dataset.prevDisplay || ''; } catch(_){}
              try { if (previewParent) previewParent.style.removeProperty('background-image'); } catch(_){}
            }
          } catch(_){}
          console.error('start btn handler error', e);
        }
      });
    }

    // Start live activity listener (real-time) and fall back to initial load
    try { await loadTodayActivity(); } catch(e) { console.warn('loadTodayActivity failed', e); }
    try { initLiveActivityListener(); } catch(e) { console.warn('initLiveActivityListener failed', e); }

    
  } catch (e) { console.error('initInschrijftafel failed', e); }
}

// Load list of members scanned today across all devices and render into the activity list.
export async function loadTodayActivity() {
  try {
    const container = document.getElementById('recent-activity-list');
    if (!container) return;
    // show loading state
    try { container.innerHTML = '<div id="recent-activity-placeholder" class="activity-placeholder text-text-sub text-sm">Laden…</div>'; } catch(_){}
    const apiKey = (typeof firebaseConfigDev !== 'undefined' && firebaseConfigDev.apiKey) ? firebaseConfigDev.apiKey : null;
    if (!apiKey) return;
    const today = new Date().toISOString().slice(0,10);
    const runUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfigDev.projectId}/databases/(default)/documents:runQuery?key=${apiKey}`;
    const body = {
      structuredQuery: {
        from: [{ collectionId: 'members' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'ScanDatums' },
            op: 'ARRAY_CONTAINS',
            value: { stringValue: String(today) }
          }
        },
        limit: 5000
      }
    };
    const res = await fetch(runUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      try { container.innerHTML = '<div class="activity-placeholder text-text-sub text-sm">Kon activiteit niet laden</div>'; } catch(_){}
      console.warn('loadTodayActivity runQuery failed', res.status, res.statusText);
      return;
    }
    const arr = await res.json();
    const seen = new Set();
    // clear list
    try { container.innerHTML = ''; } catch(_){}
    for (const entry of arr) {
      if (!entry || !entry.document) continue;
      try {
        const doc = entry.document;
        const id = doc.name ? String(doc.name).split('/').pop() : null;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const f = doc.fields || {};
        const memberObj = {};
        for (const k of Object.keys(f)) {
          const v = f[k];
          if (!v) { memberObj[k] = null; continue; }
          if (v.arrayValue && Array.isArray(v.arrayValue.values)) {
            memberObj[k] = v.arrayValue.values.map(x => (x.stringValue !== undefined ? x.stringValue : (x.timestampValue !== undefined ? x.timestampValue : null))).filter(Boolean);
          } else {
            memberObj[k] = (v.stringValue !== undefined) ? v.stringValue : (v.timestampValue !== undefined ? v.timestampValue : null);
          }
        }
        // prefer to pass an object with id for renderActivityItem
        memberObj.id = id;
        renderActivityItem(memberObj, new Date().toISOString());
      } catch (e) { console.warn('loadTodayActivity entry parse failed', e); }
    }
    if (seen.size === 0) {
      try {
        container.innerHTML = `
          <div id="recent-activity-placeholder" class="activity-item" aria-hidden="false">
            <div style="display:flex; align-items:center; gap:12px; width:100%;">
              <div class="activity-accent" aria-hidden="true"></div>
              <div style="flex:1 1 auto; text-align:left;">
                <div class="activity-name">Hier zie je iedereen die is ingescand deze rit.</div>
              </div>
            </div>
          </div>
        `;
      } catch(_){ }
    }
    try { updateActivityScrollState(); } catch(_){}
  } catch (e) { console.error('loadTodayActivity failed', e); }
}

// Start a real-time listener for members scanned today and update recent activity live.
export function initLiveActivityListener() {
  try {
    if (typeof db === 'undefined' || !db) {
      try { console.warn('initLiveActivityListener: db not initialized'); } catch(_){}
      return;
    }
    const today = new Date().toISOString().slice(0,10);
    try {
      const q = query(collection(db, 'members'), where('ScanDatums', 'array-contains', String(today)));
      const unsub = onSnapshot(q, snap => {
        try {
          const container = document.getElementById('recent-activity-list');
          if (!container) return;
          // clear list
          container.innerHTML = '';
          const seen = new Set();
          for (const docSnap of snap.docs) {
            try {
              const data = (typeof docSnap.data === 'function') ? docSnap.data() : (docSnap || {});
              const id = docSnap.id || (docSnap.ref && docSnap.ref.id) || null;
              if (!id || seen.has(id)) continue;
              seen.add(id);
              // normalize a lightweight member object
              const memberObj = Object.assign({}, data || {});
              memberObj.id = id;
              // render with current time as display (server timestamps are not stored per-scan)
              renderActivityItem(memberObj, new Date().toISOString());
            } catch (e) { console.warn('live activity per-doc parse failed', e); }
          }
          if (seen.size === 0) {
            try {
              container.innerHTML = `
                <div id="recent-activity-placeholder" class="activity-item" aria-hidden="false">
                  <div style="display:flex; align-items:center; gap:12px; width:100%;">
                    <div class="activity-accent" aria-hidden="true"></div>
                    <div style="flex:1 1 auto; text-align:left;">
                      <div class="activity-name">Hier zie je iedereen die is ingescand deze rit.</div>
                    </div>
                  </div>
                </div>
              `;
            } catch(_){ }
          }
          try { updateActivityScrollState(); } catch(_){}
        } catch (e) { console.warn('live activity snapshot handler failed', e); }
      }, err => { console.warn('live activity onSnapshot error', err); });
      try { if (typeof window !== 'undefined') { window._liveActivityUnsub && window._liveActivityUnsub(); window._liveActivityUnsub = unsub; } } catch(_){}
    } catch (e) { console.warn('initLiveActivityListener query failed', e); }
  } catch (e) { console.warn('initLiveActivityListener failed', e); }
}

// Manual name-search + check-in flow for inschrijftafel page
function createManualSearchHandlers() {
  try {
    const inputs = Array.from(document.querySelectorAll('input.participant-name-input'));
    if (!inputs || inputs.length === 0) return;

    inputs.forEach((input) => {
      try {
        // Skip history inputs: member.js already binds suggestions for history inputs
        try { if (input && ((input.id && input.id.includes('history')) || (input.closest && input.closest('#historie-section')))) return; } catch(_){}
        const suggestionsEl = (input.parentElement && input.parentElement.querySelector('[id^="name-suggestions"]')) || document.getElementById('name-suggestions');
        if (!suggestionsEl) return;
        let selected = null;

        input.addEventListener('input', async () => {
          try {
            const raw = (input.value || '').trim();
            if (!raw) { suggestionsEl.innerHTML = ''; suggestionsEl.classList.add('hidden'); return; }
            const results = await searchMembers(raw, 8);
            if (!Array.isArray(results) || results.length === 0) { suggestionsEl.innerHTML = ''; suggestionsEl.classList.add('hidden'); return; }
            const html = results.map(r => {
              const label = (r.voor && r.naam) ? `${r.voor} ${r.naam}` : (r.naam || r.voor || '');
              const json = encodeURIComponent(JSON.stringify(r || {}));
              return `<button type="button" data-member-id="${r.id}" data-member-json="${json}" class="w-full text-left px-4 py-2 hover:bg-gray-100">${label}</button>`;
            }).join('\n');
            suggestionsEl.innerHTML = `<div class="flex flex-col">${html}</div>`;
            suggestionsEl.classList.remove('hidden');
          } catch (e) { console.error('manual search input error', e); }
        });

        suggestionsEl.addEventListener('click', async (ev) => {
          try {
            const btn = ev.target.closest('button[data-member-id]');
            if (!btn) return;
            const id = btn.getAttribute('data-member-id');
            const raw = btn.getAttribute('data-member-json');
            const label = (btn.textContent || '').trim();
            let memberObj = null;
            try { memberObj = raw ? JSON.parse(decodeURIComponent(raw)) : null; } catch(_) { memberObj = null; }
            try {
              const full = await getMemberById(id);
              if (full) memberObj = Object.assign({}, memberObj || {}, full);
            } catch (e) { console.warn('fetching full member failed', e); }

            selected = { id, label, raw: memberObj };
            input.value = label;
              try { input.setAttribute('data-member-id', id); } catch(_){ }
              try { input.dispatchEvent(new CustomEvent('member-selected', { detail: { id: String(id), member: memberObj || null }, bubbles: true })); } catch(_){ }
            suggestionsEl.classList.add('hidden');

            // If this input is the history input, do NOT open the confirm modal — history input handles registration separately.
            try {
              const isHistory = (input.id && input.id.includes('history')) || (suggestionsEl.id && suggestionsEl.id.includes('history')) || (input.closest && input.closest('#historie-section'));
              if (isHistory) {
                  // keep selection but do not open modal (no toast)
                  try {
                    // render stars for this member in the history stars container
                    try { renderHistoryStars(String(id)); } catch(_){}
                  } catch(_){}
              } else {
                // Manual sign-up UI removed; no modal will be opened for non-history selections.
                // Selection will be stored on the input via data-member-id and no further UI is shown.
              }
            } catch (e) { console.error('post-selection handling failed', e); }
          } catch (e) { console.error('manual suggestion click error', e); }
        });

        // click outside to close suggestions for this input
        document.addEventListener('click', (ev) => {
          if (!suggestionsEl.contains(ev.target) && ev.target !== input) suggestionsEl.classList.add('hidden');
        });
      } catch (e) { console.error('createManualSearchHandlers per-input failed', e); }
    });
  } catch (e) { console.error('createManualSearchHandlers failed', e); }
}

// Initialize handlers specific to the history input: hide stars when
// the input is empty or when it receives focus/click. Show stars when
// a member is selected (renderHistoryStars will also ensure visibility).
function initHistoryInputHandlers() {
  try {
    const input = document.getElementById('participant-name-input-history');
    const container = document.getElementById('history-member-stars');
    if (!input || !container) return;
    // Keep the history stars always visible regardless of input content.
    try { container.style.display = 'flex'; } catch(_){}
    // We still respond to explicit member selection by re-rendering stars elsewhere,
    // so no input-based hiding behaviour is needed here.
  } catch (e) { console.warn('initHistoryInputHandlers failed', e); }
}

// Render history stars for a member in the history section.
// Shows one star per planned date (usually 5 or 6) and marks filled stars
// for dates that exist in the member's `ScanDatums`.
export async function renderHistoryStars(memberId) {
  try {
    const container = document.getElementById('history-member-stars');
    if (!container) return;
    // ensure the container is visible while rendering; caller may hide it again
    try { container.style.display = 'flex'; } catch(_){}
    container.innerHTML = '';

    // Fetch planned dates (YYYY-MM-DD)
    let planned = [];
    try { planned = Array.isArray(await getPlannedDates()) ? await getPlannedDates() : []; } catch(_) { planned = []; }
    // If none, fallback to empty array
    if (!Array.isArray(planned)) planned = [];

    // Limit to sensible maximum (most deployments use 5 or 6 planned dates)
    const count = Math.min(planned.length || 5, 6);
    // Fetch member scans
    let member = null;
    try { member = await getMemberById(String(memberId)); } catch (_) { member = null; }
    const scans = Array.isArray(member && member.ScanDatums) ? member.ScanDatums.map(String) : [];

    // Build compact horizontal star buttons (icon-only) with tooltip
    for (let i = 0; i < count; i++) {
      const date = String(planned[i] || '').slice(0,10) || null;
      const filled = date && scans.indexOf(date) !== -1;
      // lock if date is today or in the future
      let locked = false;
      try {
        if (date) {
          const today = new Date().toISOString().slice(0,10);
          // YYYY-MM-DD string compare works for date ordering
          if (String(date) >= String(today)) locked = true;
        }
      } catch(_) { locked = false; }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'history-star-btn compact ' + (filled ? 'filled' : 'empty') + (locked ? ' locked' : '');
      btn.setAttribute('data-date', date || '');
      btn.setAttribute('aria-pressed', filled ? 'true' : 'false');
      btn.setAttribute('title', date ? (filled ? `Meegereden: ${date}` : `Niet meegereden: ${date}`) : 'Geen datum');
      // main icon: star or lock depending on state
      const ic = document.createElement('span');
      ic.className = 'material-symbols-outlined star-icon ' + (filled ? 'filled' : 'empty') + (locked ? ' locked-main' : '');
      ic.textContent = locked ? 'lock' : 'star';
      btn.appendChild(ic);
      if (locked) {
        try { btn.setAttribute('aria-disabled', 'true'); } catch(_){}
      }
      // click handler: if not filled, register ride for that date
      btn.addEventListener('click', async (ev) => {
        try {
          ev.preventDefault();
          // Block manual save when today is not a planned ride date
          try {
            const plannedRaw = await getPlannedDates().catch(() => []);
            const planned = Array.isArray(plannedRaw) ? plannedRaw.map(d => String(d).slice(0,10)) : [];
            const today = new Date().toISOString().slice(0,10);
            try { console.debug('manual save plannedDates', planned, 'today', today); } catch(_){}
            if (!Array.isArray(planned) || planned.length === 0 || !planned.includes(today)) {
              try { showScanError('Vandaag is geen landelijke rit', 5000); } catch(_) { alert('Vandaag is geen landelijke rit'); }
              return;
            }
          } catch (e) { console.warn('plannedDates check failed', e); }
          // Ensure today is a planned ride date before allowing manual check-in
          try {
            const planned = Array.isArray(await getPlannedDates().catch(()=>[])) ? await getPlannedDates().catch(()=>[]) : await getPlannedDates().catch(()=>[]);
            const today = new Date().toISOString().slice(0,10);
            if (!Array.isArray(planned) || !planned.includes(today)) {
              try { showScanError('Vandaag is geen landelijke rit', 5000); } catch(_) { alert('Vandaag is geen landelijke rit'); }
              return;
            }
          } catch (e) { /* if planned check fails, allow operation to continue */ }
          ev.stopPropagation();
          if (!memberId) { alert('Geen lid geselecteerd'); return; }
          const d = btn.getAttribute('data-date');
          if (!d) { alert('Geen datum beschikbaar'); return; }
          if (btn.classList.contains('filled')) return;
          if (btn.classList.contains('locked')) return;
          // Optimistically update UI: mark this star as filled (yellow)
          try {
            btn.classList.add('filled');
            btn.classList.remove('empty');
            btn.setAttribute('aria-pressed', 'true');
            btn.title = `Meegereden: ${d}`;
            const ic = btn.querySelector('.star-icon'); if (ic) ic.classList.add('filled');
          } catch (_) {}

          // Persist to Firestore but do NOT re-render the whole section
          try {
            const res = await manualRegisterRide(String(memberId), String(d));
            if (res && res.success) {
              // leave the optimistic UI as-is (registration toast handled elsewhere)
            } else {
              // rollback optimistic UI on failure
              try {
                btn.classList.remove('filled'); btn.classList.add('empty'); btn.setAttribute('aria-pressed','false');
                const ic2 = btn.querySelector('.star-icon'); if (ic2) ic2.classList.remove('filled');
                btn.title = `Niet meegereden: ${d}`;
              } catch(_){}
              console.warn('manualRegisterRide failed', res);
              alert('Kon rit niet registreren');
            }
          } catch (e) {
            // rollback optimistic UI on exception
            try { btn.classList.remove('filled'); btn.classList.add('empty'); btn.setAttribute('aria-pressed','false'); const ic3 = btn.querySelector('.star-icon'); if (ic3) ic3.classList.remove('filled'); btn.title = `Niet meegereden: ${d}`; } catch(_){}
            console.warn('history star click failed', e);
            alert('Fout bij registreren');
          }
        } catch (e) { console.warn('history star click failed outer', e); }
      });
      container.appendChild(btn);
    }
    // If nothing rendered, hide the container to keep UI clean
    try { if (!container.children || container.children.length === 0) container.style.display = 'none'; else container.style.display = 'flex'; } catch(_){}
  } catch (e) { console.warn('renderHistoryStars failed', e); }
}

// Live listener to keep lunch statistics dynamic (yes/no + per-choice)
function initLiveLunchStats() {
  try {
    const yesEl = document.getElementById('count-yes');
    const noEl = document.getElementById('count-no');
    const choiceContainers = {}; // map choice -> element id(s)

    // get lunch choices so we can map counts to UI elements
    (async () => {
      try {
        const opts = await getLunchOptions();
        const keuzes = Array.isArray(opts.keuzeEten) ? opts.keuzeEten : [];
        // Ensure choice count placeholders exist (ids choice-count-{idx})
        keuzes.forEach((k, idx) => {
          const el = document.getElementById('choice-count-' + idx);
          if (el) choiceContainers[String(k)] = el;
        });
      } catch (e) { console.error('initLiveLunchStats getLunchOptions failed', e); }
    })();

    // Subscribe to full members collection and recompute counts on every snapshot
    try {
      const colRef = collection(db, 'members');
      const unsub = onSnapshot(colRef, snap => {
        try {
          let yes = 0, no = 0;
          const choiceCounts = new Map();
          const nowMs = Date.now();
          for (const doc of snap.docs) {
            try {
              const data = (typeof doc.data === 'function') ? doc.data() : (doc || {});
              // respect lunchExpires like the REST path does
              let valid = false;
              const exp = data && data.lunchExpires;
              if (exp) {
                try {
                  let expMs = 0;
                  if (typeof exp.toMillis === 'function') expMs = exp.toMillis();
                  else if (typeof exp.seconds === 'number') expMs = Number(exp.seconds) * 1000;
                  else expMs = Date.parse(String(exp)) || 0;
                  if (expMs && expMs > nowMs) valid = true;
                } catch (_) { /* ignore per-doc expiry parse */ }
              }
              // If no expiry field, treat as not registered for lunch
              if (!valid) continue;
              const deel = normalizeYesNo(data.lunchDeelname || data.lunch || data.participation || null);
              if (deel === 'yes') {
                yes += 1;
                const kc = data.lunchKeuze || data.lunchChoice || data.keuze || null;
                if (kc) {
                  const key = String(kc);
                  choiceCounts.set(key, (choiceCounts.get(key) || 0) + 1);
                }
              } else if (deel === 'no') {
                no += 1;
              }
            } catch (e) { /* ignore per-doc errors */ }
          }
          if (yesEl) yesEl.textContent = String(yes);
          if (noEl) noEl.textContent = String(no);
          // update per-choice counts if we have elements
          for (const [choice, el] of Object.entries(choiceContainers)) {
            try { el.textContent = String(choiceCounts.get(choice) || 0); } catch(_){ }
          }
          // also update any choice-count-* elements by matching text if necessary
          try {
            const elems = Array.from(document.querySelectorAll('[id^="choice-count-"]'));
            elems.forEach((e, idx) => {
              if (e && e.textContent && e.textContent.trim() !== '') return;
              const count = Array.from(choiceCounts.values())[idx] || 0;
              e.textContent = String(count);
            });
          } catch (_) {}
        } catch (e) { console.error('live lunch stats snapshot error', e); }
      }, err => { console.warn('live lunch stats onSnapshot error', err); });
      // store unsub on window for debugging if needed
      try { if (typeof window !== 'undefined') window._liveLunchStatsUnsub = unsub; } catch(_){ }
    } catch (e) { console.error('initLiveLunchStats subscribe failed', e); }
  } catch (e) { console.error('initLiveLunchStats failed', e); }
}

// initialize manual search handlers after DOM loaded
try { if (typeof window !== 'undefined') window.addEventListener('DOMContentLoaded', () => { try { createManualSearchHandlers(); } catch(_){} try { initHistoryInputHandlers(); } catch(_){}
    // When either name input receives focus, hide any revealed/manual sections so
    // the admin can start a fresh selection without previous member context.
    try {
      const hist = document.getElementById('participant-name-input-history');
      if (hist && typeof hist.addEventListener === 'function') hist.addEventListener('focus', () => { try { hideRevealedSections(); } catch(_){} });
      const manual = document.getElementById('participant-name-input-manual');
      if (manual && typeof manual.addEventListener === 'function') manual.addEventListener('focus', () => { try { clearManualStoredSelections(); } catch(_){} });
    } catch(_){}
    try { updateActivityScrollState(); } catch(_){}
  }); } catch(_) {}

// Reveal manual choice sections when a member is selected via the shared dropdown
function revealManualChoiceSections(memberId, name) {
  try {
    const lunch = document.getElementById('lunch-choices-host');
    const jaar = document.getElementById('jaarhanger-host');
    if (lunch) {
      lunch.hidden = false;
      lunch.removeAttribute('aria-hidden');
    }
    if (jaar) {
      jaar.hidden = false;
      jaar.removeAttribute('aria-hidden');
    }
    // optionally focus first interactive element
    try { const first = (lunch && lunch.querySelector('input')) || (jaar && jaar.querySelector('input')); if (first && typeof first.focus === 'function') first.focus(); } catch(_){}
  } catch (e) { console.warn('revealManualChoiceSections failed', e); }
}

async function ensureKeuzeRadiosReady(timeoutMs = 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const radios = document.querySelectorAll('#lunch-choices-list input[name="keuzeEten"]');
    if (radios && radios.length > 0) return true;
    // wait a bit
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}

async function populateManualWithMember(memberId) {
  try {
    if (!memberId) return;
    const input = document.getElementById('participant-name-input-manual');
    if (input) {
      try { input.setAttribute('data-member-id', String(memberId)); } catch(_){}
    }
    try { window._selectedMemberId = String(memberId); } catch(_){}

    const doc = await getMemberById(String(memberId));
    if (!doc) return;

    // If member already has today's date in ScanDatums, lock the manual sections
    try {
      const scans = Array.isArray(doc.ScanDatums) ? doc.ScanDatums : (doc.ScanDatums ? [doc.ScanDatums] : []);
      const today = new Date().toISOString().slice(0,10);
      const hasToday = scans && Array.isArray(scans) && scans.indexOf(today) !== -1;
      if (hasToday) {
        applyManualLock(true, 'Lid is al ingeschreven');
        // still prefill fields, but keep locked
      } else {
        applyManualLock(false);
      }
    } catch (e) { console.warn('scanDates check failed', e); }

    // Prefill eetmee (lunch participation)
    try {
      const deel = (doc.lunchDeelname || doc.lunchDeelname || doc.lunch || doc.lunchDeelname || '').toString().toLowerCase();
      const eetRadios = Array.from(document.querySelectorAll('#lunch-choices-host input[name="eetmee"]'));
      if (eetRadios && eetRadios.length > 0) {
        for (const r of eetRadios) {
          try {
            const v = String(r.value || '').toLowerCase();
            if (deel && (deel.indexOf('nee') !== -1 || deel === 'no')) {
              if (v.indexOf('nee') !== -1 || v === 'no') { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
            } else if (deel && (deel.indexOf('ja') !== -1 || deel === 'yes')) {
              if (v.indexOf('ja') !== -1 || v === 'yes') { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
            }
          } catch(_){}
        }
      }
    } catch (e) { console.warn('prefill eetmee failed', e); }

    // Ensure keuze radios are rendered before selecting
    try { await ensureKeuzeRadiosReady(1200); } catch(_){}

    // Prefill lunchKeuze
    try {
      const keuzeVal = (doc.lunchKeuze || doc.lunchChoice || doc.keuze || '').toString();
      if (keuzeVal) {
        const keuzeRadios = Array.from(document.querySelectorAll('#lunch-choices-list input[name="keuzeEten"]'));
        for (const r of keuzeRadios) {
          try {
            if (String(r.value || '') === String(keuzeVal)) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
          } catch(_){}
        }
      }
    } catch (e) { console.warn('prefill lunchKeuze failed', e); }

    // Prefill Jaarhanger
    try {
      const jVal = (doc.Jaarhanger || doc.jaarhanger || '').toString().toLowerCase();
      const jaarRadios = Array.from(document.querySelectorAll('#jaarhanger-host input[name="jaarhanger"]'));
      if (jaarRadios && jaarRadios.length > 0) {
        for (const r of jaarRadios) {
          try {
            const v = String(r.value || '').toLowerCase();
            if (jVal && (jVal.indexOf('nee') !== -1 || jVal === 'no')) {
              if (v.indexOf('nee') !== -1 || v === 'no') { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
            } else if (jVal && (jVal.indexOf('ja') !== -1 || jVal === 'yes')) {
              if (v.indexOf('ja') !== -1 || v === 'yes') { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
            }
          } catch(_){}
        }
      }
    } catch (e) { console.warn('prefill Jaarhanger failed', e); }

    try { updateManualSaveState(); } catch(_){}
  } catch (e) { console.warn('populateManualWithMember failed', e); }
}

// Enable the manual save button only when required fields are present
function updateManualSaveState() {
  try {
    const saveBtn = document.getElementById('save-manual-button');
    if (!saveBtn) return;

    // if sections are locked, disable save
    try {
      const lunchHost = document.getElementById('lunch-choices-host');
      if (lunchHost && lunchHost.dataset && lunchHost.dataset.locked === '1') {
        saveBtn.disabled = true; saveBtn.setAttribute('aria-disabled','true'); saveBtn.classList && saveBtn.classList.add('disabled'); return;
      }
    } catch(_){}

    // check eetmee selection
    const eetSel = document.querySelector('#lunch-choices-host input[name="eetmee"]:checked');
    const jaarSel = document.querySelector('#jaarhanger-host input[name="jaarhanger"]:checked');
    let valid = true;
    if (!eetSel) valid = false;
    if (!jaarSel) valid = false;

    // if eetmee is yes, and keuzeEten options exist, ensure one is selected
    try {
      const eetVal = eetSel ? String(eetSel.value || '').toLowerCase() : '';
      const keuzeEls = Array.from(document.querySelectorAll('#lunch-choices-list input[name="keuzeEten"]'));
      if (eetVal && eetVal.indexOf('ja') !== -1 && keuzeEls.length > 0) {
        const chosen = keuzeEls.find(r => r.checked);
        if (!chosen) valid = false;
      }
    } catch(_) {}

    saveBtn.disabled = !valid;
    if (saveBtn.disabled) { saveBtn.setAttribute('aria-disabled','true'); saveBtn.classList && saveBtn.classList.add('disabled'); }
    else { saveBtn.removeAttribute('aria-disabled'); saveBtn.classList && saveBtn.classList.remove('disabled'); }
  } catch (e) { console.warn('updateManualSaveState failed', e); }
}

function applyManualLock(locked, message = 'Lid is al ingeschreven') {
  try {
    const hosts = [document.getElementById('lunch-choices-host'), document.getElementById('jaarhanger-host')];
    hosts.forEach(host => {
      try {
        if (!host) return;
        const card = host.querySelector('.surface-card') || host.querySelector('.card') || host;
        if (locked) {
          // mark as locked
          host.dataset.locked = '1';
          // disable inputs
          const inputs = host.querySelectorAll('input, button, select, textarea');
          inputs.forEach(i => { try { i.setAttribute('disabled','true'); } catch(_){} });
          // add overlay if not present
          if (!card.querySelector('.manual-locked-overlay')) {
            const ov = document.createElement('div');
            ov.className = 'manual-locked-overlay';
            ov.innerHTML = `<span class="material-symbols-outlined">lock</span><div class="locked-text">${String(message)}</div>`;
            // ensure card is positioned to contain absolute overlay
            try { const pos = window.getComputedStyle(card).position; if (!pos || pos === 'static') card.style.position = 'relative'; } catch(_){}
            card.appendChild(ov);
          }
        } else {
          delete host.dataset.locked;
          const inputs = host.querySelectorAll('input, button, select, textarea');
          inputs.forEach(i => { try { i.removeAttribute('disabled'); } catch(_){} });
          const ov = card.querySelector('.manual-locked-overlay');
          if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        }
      } catch(_){}
    });
    try { updateManualSaveState(); } catch(_){}
  } catch (e) { console.warn('applyManualLock failed', e); }
}

function hideManualChoiceSections() {
  try {
    const lunch = document.getElementById('lunch-choices-host');
    const jaar = document.getElementById('jaarhanger-host');
    if (lunch) {
      lunch.hidden = true;
      lunch.setAttribute('aria-hidden', 'true');
    }
    if (jaar) {
      jaar.hidden = true;
      jaar.setAttribute('aria-hidden', 'true');
    }
    // clear selected member id on manual input
    try {
      const input = document.getElementById('participant-name-input-manual');
      if (input) {
        input.removeAttribute('data-member-id');
      }
    } catch(_){}
    // clear any chosen lunch selections
    try {
      const keuzeContainer = document.getElementById('lunch-choices-list');
      if (keuzeContainer) {
        const chosen = keuzeContainer.querySelectorAll('input[name="keuzeEten"]:checked');
        chosen.forEach(c => { try { c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); } catch(_){} });
        keuzeContainer.classList.remove('lunch-disabled');
      }
    } catch(_){}
    try { updateManualSaveState(); } catch(_){}
  } catch (e) { console.warn('hideManualChoiceSections failed', e); }
}

// Hide all sections that may have been revealed for a selected member
export function hideRevealedSections() {
  try {
    // hide manual choice sections and reset state
    try { hideManualChoiceSections(); } catch(_){}

    // hide history stars container
    try {
      const hs = document.getElementById('history-member-stars');
      if (hs) hs.style.display = 'none';
    } catch(_){}

    // clear selected member markers
    try { if (window && window._selectedMemberId) delete window._selectedMemberId; } catch(_){}
    try { const mi = document.getElementById('participant-name-input-history'); if (mi) mi.removeAttribute('data-member-id'); } catch(_){}
    try { const mi2 = document.getElementById('participant-name-input-manual'); if (mi2) mi2.removeAttribute('data-member-id'); } catch(_){}
  } catch (e) { console.warn('hideRevealedSections failed', e); }
}

try { document.addEventListener('member:selected', (ev) => {
  try {
    const hasManualInput = !!document.getElementById('participant-name-input-manual');
    if (!hasManualInput) return;
    const detail = ev && ev.detail ? ev.detail : {};
    // If event includes sourceInputId and it wasn't the manual input, ignore
    try { if (detail && detail.sourceInputId && String(detail.sourceInputId) !== 'participant-name-input-manual') return; } catch(_) {}
    revealManualChoiceSections(detail.memberId || '', detail.name || '');
    try { populateManualWithMember(String(detail.memberId || '')); } catch(_){}
  } catch (_) {}
}); } catch(_) {}

// Also handle member selection for the history input so stars update
try { document.addEventListener('member:selected', (ev) => {
  try {
    const detail = ev && ev.detail ? ev.detail : {};
    const historyInput = document.getElementById('participant-name-input-history');
    if (!historyInput) return;
    // If event includes sourceInputId and it wasn't the history input, ignore
    try { if (detail && detail.sourceInputId && String(detail.sourceInputId) !== 'participant-name-input-history') return; } catch(_) {}
    try { historyInput.value = detail.name || historyInput.value || ''; } catch(_){}
    try { if (historyInput.dataset) historyInput.dataset.selectedMember = String(detail.memberId || ''); } catch(_){}
    try { window._selectedMemberId = String(detail.memberId || '') || window._selectedMemberId; } catch(_){}
    // Respect suppression window: if recent input click happened, do not auto-show stars
    try {
      if (Date.now() < (_historySuppressShowUntil || 0)) {
        // still update value/dataset but skip rendering
        return;
      }
    } catch(_) {}
    // Also avoid auto-showing when the history input is focused or empty
    try {
      const active = (typeof document !== 'undefined' && document.activeElement) ? document.activeElement : null;
      if (active === historyInput) return;
      const hv = String(historyInput.value || '').trim();
      if (!hv) return; // don't render if input is empty
    } catch(_) {}
    try { renderHistoryStars(String(detail.memberId || '')); } catch(e) { console.warn('renderHistoryStars failed', e); }
  } catch(_){}
}); } catch(_) {}

// Hide manual sections when the manual name input is cleared
try {
  if (typeof window !== 'undefined') {
    const setupHide = () => {
      try {
        const input = document.getElementById('participant-name-input-manual');
        if (!input) return;

        const checkEmpty = () => {
          try {
            const v = String(input.value || '').trim();
            if (!v) hideManualChoiceSections();
          } catch (_) {}
        };

        // Common events that indicate the value changed
        ['input', 'change', 'keyup'].forEach(evName => {
          try { input.addEventListener(evName, checkEmpty); } catch(_) {}
        });

        // On blur also re-check (covers some programmatic changes)
        try { input.addEventListener('blur', checkEmpty); } catch(_) {}

        // Poll fallback while input is focused (covers programmatic sets that don't fire events)
        let pollId = null;
        input.addEventListener('focus', () => {
          try {
            if (pollId) return;
            pollId = setInterval(() => { try { checkEmpty(); } catch(_) {} }, 250);
          } catch(_){}
        });
        input.addEventListener('blur', () => {
          try { if (pollId) { clearInterval(pollId); pollId = null; } } catch(_){}
        });
      } catch (e) { console.warn('setupHide listener failed', e); }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupHide); else setupHide();
  }
} catch(_) {}

// Load and render lunch options specifically for the manual choices page
async function loadManualLunchOptions() {
  try {
    const input = document.getElementById('participant-name-input-manual');
    if (!input) return; // not the manual page
    const listEl = document.getElementById('lunch-choices-list');
    const inclusiefEl = document.getElementById('inclusief-list');
    if (!listEl) return;
    try { listEl.innerHTML = '<div class="text-text-sub text-sm">Laden...</div>'; } catch(_){}
    const opts = await getLunchOptions();
    const keuzes = Array.isArray(opts && opts.keuzeEten) ? opts.keuzeEten : [];
    if (!keuzes || keuzes.length === 0) {
      try { listEl.innerHTML = ''; listEl.setAttribute('aria-hidden','true'); listEl.style.display = 'none'; } catch(_){ }
    } else {
      const html = keuzes.map((k) => {
        const safe = String(k).replace(/"/g, '&quot;');
        return `<label class="choice-option"><input class="sr-only" name="keuzeEten" value="${safe}" type="radio" /><div class="choice-card">${String(k)}</div></label>`;
      }).join('\n');
      try { listEl.innerHTML = html; listEl.removeAttribute('aria-hidden'); } catch(_){}
      // wire change listeners for keuzeEten so save state updates when a choice is selected
      try {
        const radios = Array.from(listEl.querySelectorAll('input[name="keuzeEten"]'));
        radios.forEach(r => { try { r.addEventListener('change', () => { try { updateManualSaveState(); } catch(_){} }); } catch(_){} });
      } catch(_){}
    }
    try {
      if (inclusiefEl) {
        const vast = Array.isArray(opts && opts.vastEten) ? opts.vastEten : (opts && opts.vastEten) || [];
        inclusiefEl.textContent = (Array.isArray(vast) && vast.length > 0) ? vast.join(', ') : '—';
      }
    } catch(_){}
    try { updateManualSaveState(); } catch(_){}
  } catch (e) { console.warn('loadManualLunchOptions failed', e); }
}

try { if (typeof window !== 'undefined') {
  // Run on DOMContentLoaded and also immediately if DOM already ready
  const run = () => { try { loadManualLunchOptions(); } catch(_){} };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  // Also re-run when config is ready if the app emits that
  document.addEventListener('shadow:config-ready', run);
} } catch(_) {}

  // Attach handlers so selecting 'nee' for lunch clears keuzeEten and fades the choices area
  function attachManualLunchHandlers() {
    try {
      const input = document.getElementById('participant-name-input-manual');
      if (!input) return; // not the manual page
      const eetRadios = Array.from(document.querySelectorAll('#lunch-choices-host input[name="eetmee"]'));
      const keuzeContainer = document.getElementById('lunch-choices-list');
      if (!keuzeContainer || !eetRadios) return;

      function setDisabledState(isDisabled) {
        try {
          if (isDisabled) {
            // deselect any chosen keuzeEten radios
            const chosen = keuzeContainer.querySelectorAll('input[name="keuzeEten"]:checked');
            chosen.forEach(c => { try { c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); } catch(_){} });
            keuzeContainer.classList.add('lunch-disabled');
            keuzeContainer.setAttribute('aria-hidden', 'true');
          } else {
            keuzeContainer.classList.remove('lunch-disabled');
            keuzeContainer.removeAttribute('aria-hidden');
          }
        } catch (e) { console.warn('setDisabledState failed', e); }
      }


      // wire change handlers for eetmee
      eetRadios.forEach(r => {
        try {
          r.addEventListener('change', (ev) => {
            try {
              const v = String(ev.target.value || '').toLowerCase();
              if (v.indexOf('nee') !== -1) setDisabledState(true);
              else setDisabledState(false);
            } catch (_) {}
            try { updateManualSaveState(); } catch(_){}
          });
        } catch(_){ }
      });

      // wire jaarhanger radios to update save state
      try {
        const jaarRadios = Array.from(document.querySelectorAll('#jaarhanger-host input[name="jaarhanger"]'));
        jaarRadios.forEach(r => { try { r.addEventListener('change', () => { try { updateManualSaveState(); } catch(_){} }); } catch(_){} });
      } catch(_){}

      // initialize state based on current selection
      try {
        const sel = document.querySelector('#lunch-choices-host input[name="eetmee"]:checked');
        if (sel) {
          setDisabledState(String(sel.value || '').toLowerCase().indexOf('nee') !== -1);
        }
      } catch(_){ }

      // initial save-button state
      try { updateManualSaveState(); } catch(_){}
    } catch (e) { console.warn('attachManualLunchHandlers failed', e); }
  }

  // Run attach on load too
  try { if (typeof window !== 'undefined') {
    const runHandlers = () => { try { attachManualLunchHandlers(); } catch(_){} };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', runHandlers); else runHandlers();
    document.addEventListener('shadow:config-ready', runHandlers);
  } } catch(_) {}

  // Attach save handler for manual page: write selected choices to Firestore
  function attachSaveManualHandler() {
    try {
      const btn = document.getElementById('save-manual-button');
      if (!btn) return;
      if (btn.dataset && btn.dataset._saveBound) return;
      btn.addEventListener('click', async (ev) => {
        try {
          ev.preventDefault();
          const input = document.getElementById('participant-name-input-manual');
          if (!input) { alert('Geen naamveld gevonden'); return; }
          const memberId = (input.dataset && input.dataset.memberId) ? input.dataset.memberId : (window._selectedMemberId || input.getAttribute('data-member-id') || '');
          if (!memberId) { alert('Selecteer eerst een lid uit de suggesties'); return; }

          // read eetmee
          const eetSel = document.querySelector('#lunch-choices-host input[name="eetmee"]:checked');
          const jaarSel = document.querySelector('#jaarhanger-host input[name="jaarhanger"]:checked');
          if (!eetSel || !jaarSel) { alert('Kies eerst of de deelnemer eet en of hij een jaarhanger wil'); return; }
          const eetVal = String(eetSel.value || '').toLowerCase();
          const jaarVal = String(jaarSel.value || '').toLowerCase();

          let lunchDeelname = null;
          if (eetVal.indexOf('nee') !== -1 || eetVal === 'no') lunchDeelname = 'nee'; else lunchDeelname = 'ja';

          let lunchKeuze = null;
          try {
            if (lunchDeelname === 'ja') {
              const chosen = document.querySelector('#lunch-choices-list input[name="keuzeEten"]:checked');
              if (chosen && chosen.value) lunchKeuze = String(chosen.value);
            }
          } catch(_){}

          const Jaarhanger = (jaarVal.indexOf('nee') !== -1 || jaarVal === 'no') ? 'nee' : 'ja';

          // disable button while saving
          try { btn.disabled = true; btn.classList && btn.classList.add('disabled'); } catch(_){}

          const res = await checkInMemberById(String(memberId), { lunchDeelname: lunchDeelname, lunchKeuze: lunchKeuze, Jaarhanger });
          if (res && res.success) {
            // choices saved — do not show a generic toast here; keep only registration toast
            // also register today's date in ScanDatums
            try {
              const today = new Date().toISOString().slice(0,10);
              const mr = await manualRegisterRide(String(memberId), today);
              if (!mr || !mr.success) console.warn('manualRegisterRide failed', mr);
            } catch (e) { console.warn('manualRegisterRide error', e); }
            // optionally update UI state
            try { updateManualSaveState(); } catch(_){}
            // navigate back to inschrijftafel
            try { window.location.href = '../admin-ui/inschrijftafel.html'; } catch(_) { window.location.href = './inschrijftafel.html'; }
            return;
          } else {
            console.warn('save manual choices failed', res);
            alert('Kon keuzes niet opslaan');
          }
        } catch (e) { console.error('manual save handler error', e); alert('Fout bij opslaan'); }
        finally { try { btn.disabled = false; btn.classList && btn.classList.remove('disabled'); } catch(_){} }
      });
      if (btn.dataset) btn.dataset._saveBound = '1';
    } catch (e) { console.warn('attachSaveManualHandler failed', e); }
  }

  try { if (typeof window !== 'undefined') {
    const runSave = () => { try { attachSaveManualHandler(); } catch(_){} };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', runSave); else runSave();
    document.addEventListener('shadow:config-ready', runSave);
  } } catch(_) {}

// Attach handler for the "Zoek op naam" button so we check planned dates before navigating
function attachGotoManualHandler() {
  try {
    const btn = document.getElementById('goto-manual-choices');
    if (!btn) return;
    if (btn.dataset && btn.dataset._gotoBound) return;
    btn.addEventListener('click', async (ev) => {
      try {
        ev.preventDefault();
        // disable while checking
        try { btn.disabled = true; } catch(_){}
        const plannedRaw = await getPlannedDates().catch(() => []);
        const planned = Array.isArray(plannedRaw) ? plannedRaw.map(d => String(d).slice(0,10)) : [];
        const today = (new Date()).toISOString().slice(0,10);
        try { console.debug('goto-manual plannedDates', planned, 'today', today); } catch(_){}
        if (!Array.isArray(planned) || planned.length === 0 || !planned.includes(today)) {
          try { showScanError('Vandaag is geen landelijke rit', 5000); } catch(_) { alert('Vandaag is geen landelijke rit'); }
          return;
        }
        // navigate to configured href (fallback to handmatige-keuzes)
        const href = btn.getAttribute('data-href') || '../admin-ui/handmatige-keuzes.html';
        try { window.location.href = href; } catch(e) { console.warn('navigate failed', e); }
      } catch (e) { console.warn('goto-manual click failed', e); }
      finally { try { btn.disabled = false; } catch(_){} }
    });
    if (btn.dataset) btn.dataset._gotoBound = '1';
  } catch (e) { console.warn('attachGotoManualHandler failed', e); }
}

try { if (typeof window !== 'undefined') {
  const runGoto = () => { try { attachGotoManualHandler(); } catch(_){} };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', runGoto); else runGoto();
  document.addEventListener('shadow:config-ready', runGoto);
} } catch(_) {}