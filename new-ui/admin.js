// Admin helpers for new-ui: scanner + simple Firestore REST writers (simplified)
import { getLunchOptions, getLunchChoiceCount, getParticipationCount, getMemberById, searchMembers } from './firestore.js';
import { ensureHtml5Qrcode, selectRearCameraDeviceId, startQrScanner, stopQrScanner } from './scanner.js';

const firebaseConfigDev = {
  apiKey: "AIzaSyCwHJ1VIqM9s4tfh2hn8KZxqunuYySzuwQ",
  projectId: "shadow-app-b3fb3",
};

const BASE_URL = `https://firestore.googleapis.com/v1/projects/${firebaseConfigDev.projectId}/databases/(default)/documents`;

// Small helper to show a success toast that slides up from bottom and fades away after 1s
function ensureScanToastStyles() {
  if (document.getElementById('scan-toast-styles')) return;
  const css = `
  @keyframes scanToastIn {
    0% { transform: translateY(24px); opacity: 0; }
    60% { transform: translateY(-6px); opacity: 1; }
    100% { transform: translateY(0); opacity: 1; }
  }
  @keyframes scanToastOut {
    0% { opacity: 1; }
    100% { opacity: 0; transform: translateY(-12px); }
  }
  .scan-toast {
    position: fixed;
    left: 50%;
    bottom: 16px;
    transform: translateX(-50%);
    background: rgba(16,185,129,0.98); /* emerald-500 */
    color: white;
    padding: 10px 16px;
    border-radius: 999px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    font-weight: 700;
    z-index: 16000;
    min-width: 120px;
    text-align: center;
    opacity: 0;
  }
  .scan-toast.show-in { animation: scanToastIn 360ms cubic-bezier(.2,.9,.3,1) forwards; }
  .scan-toast.show-out { animation: scanToastOut 420ms ease forwards; animation-delay: 1s; }
  `;
  const s = document.createElement('style');
  s.id = 'scan-toast-styles';
  s.textContent = css;
  document.head.appendChild(s);
}

// Minimal HTML escape used by the manual modal
function escapeHtml(s) {
  try {
    if (s === null || typeof s === 'undefined') return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]);
  } catch (e) { return String(s || ''); }
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

// Recent scan guard: map of memberId -> timestamp(ms) to prevent spammy duplicate scans
const _recentScans = new Map();
// Recent activity list (in-memory for this device session)
const _recentActivity = [];
function renderActivityItem(member, whenIso) {
  try {
    const container = document.getElementById('recent-activity-list');
    if (!container) return;
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
    const initials = (first || name).split(' ').map(p => p[0] || '').slice(0,2).join('').toUpperCase();
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between p-3 bg-surface rounded-lg shadow-sm border-l-4 border-l-primary';
    item.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="size-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">${initials}</div>
        <div class="flex flex-col">
          <span class="text-sm font-bold text-text-main">${String(name)}</span>
          <span class="text-xs text-text-sub">${hh}</span>
        </div>
      </div>
      <span class="material-symbols-outlined text-primary text-xl">check_circle</span>
    `;
    container.insertBefore(item, container.firstChild);
    // limit list length to 20
    while (container.children.length > 20) container.removeChild(container.lastChild);
  } catch (e) { console.warn('renderActivityItem failed', e); }
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
        try { const h = document.getElementById('hamburger-btn'); if (h) h.style.display = 'none'; } catch(_){ }
        try { const sec = document.getElementById('historie-section'); if (sec) sec.style.display = 'none'; } catch(_){ }
      }
    } catch (e) { console.error('role-visibility', e); }

    try {
      const container = document.getElementById('keuze-maaltijden-list');
      if (container) {
        container.innerHTML = '<div class="text-text-sub text-sm">Laden...</div>';
        const opts = await getLunchOptions();
        const keuze = Array.isArray(opts.keuzeEten) ? opts.keuzeEten : [];
        if (keuze.length === 0) { container.innerHTML = '<div class="text-text-sub text-sm">Geen keuze maaltijden gevonden</div>'; }
        else {
          container.innerHTML = keuze.map((item, idx) => `<div class="flex items-center justify-between border-b border-secondary/20 pb-2 last:border-0 last:pb-0"><span class="text-text-main font-medium text-sm">${String(item)}</span><span id="choice-count-${idx}" class="text-danger font-extrabold text-lg">…</span></div>`).join('');
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
        const [yesCnt, noCnt] = await Promise.all([ getParticipationCount('yes'), getParticipationCount('no') ]);
        if (yesEl) yesEl.textContent = String(isFinite(yesCnt) ? yesCnt : 0);
        if (noEl) noEl.textContent = String(isFinite(noCnt) ? noCnt : 0);
      } catch (e) { if (yesEl) yesEl.textContent = 'ERROR'; if (noEl) noEl.textContent = 'ERROR'; }
    } catch (e) { console.error('update participation UI failed', e); }

    const buttons = Array.from(document.querySelectorAll('button'));
    let startBtn = null;
    for (const b of buttons) { if (b.textContent && b.textContent.trim().includes('Start Scanner')) { startBtn = b; break; } }
    if (startBtn) {
      let running = null;
      // save original HTML to restore later
      if (!startBtn.dataset.origHtml) startBtn.dataset.origHtml = startBtn.innerHTML;
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
              if (previewParent) {
                previewParent.style.backgroundImage = 'none';
                previewParent.style.backgroundSize = 'cover';
              }
              adminQR.style.width = '100%';
              adminQR.style.height = '100%';
              adminQR.style.position = 'relative';
              adminQR.innerHTML = '';
            }
          } catch (e) { console.warn('prepare preview failed', e); }

          const res = await startQrScanner('adminQRReader', async (decoded) => {
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
              if (!memberId) {
                alert('Gescand: geen lidnummer gevonden in QR');
                return;
              }
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
        } catch (e) { console.error('start btn handler error', e); }
      });
    }
  } catch (e) { console.error('initInschrijftafel failed', e); }
}

// Manual name-search + check-in flow for inschrijftafel page
function createManualSearchHandlers() {
  try {
    const input = document.getElementById('participant-name-input');
    const suggestionsEl = document.getElementById('name-suggestions');
    let selected = null;
    if (!input || !suggestionsEl) return;

    input.addEventListener('input', async (ev) => {
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
        // fetch full doc if possible
        try {
          const full = await getMemberById(id);
          if (full) memberObj = Object.assign({}, memberObj || {}, full);
        } catch (e) { console.warn('fetching full member failed', e); }

        // store selected
        selected = { id, label, raw: memberObj };
        input.value = label;
        suggestionsEl.classList.add('hidden');

        // open a small inline confirm flow (participation + lunch + jaarhanger)
        openManualConfirm(selected);
      } catch (e) { console.error('manual suggestion click error', e); }
    });

    // click outside to close suggestions
    document.addEventListener('click', (ev) => {
      if (!suggestionsEl.contains(ev.target) && ev.target !== input) suggestionsEl.classList.add('hidden');
    });
  } catch (e) { console.error('createManualSearchHandlers failed', e); }
}

async function openManualConfirm(selected) {
  try {
    if (!selected || !selected.id) return;
    // build simple modal UI under the search area
    let modal = document.getElementById('manual-checkin-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'manual-checkin-modal';
      modal.className = 'mt-3 p-4 bg-surface rounded-xl border border-slate-100 shadow-sm';
      modal.innerHTML = `
        <div class="flex items-center justify-between mb-3">
          <div>
            <div class="text-sm font-bold">Inschrijven: <span id="manual-name" class="font-semibold"></span></div>
            <div class="text-xs text-text-sub">Lidnummer: <span id="manual-lidnr" class="font-mono"></span></div>
          </div>
        </div>
        <div class="mb-3">
          <div class="text-xs font-bold uppercase text-text-sub mb-1">Mee-eten?</div>
          <label class="inline-flex items-center mr-4"><input type="radio" name="manual-participation" value="yes"> <span class="ml-2">Ja</span></label>
          <label class="inline-flex items-center"><input type="radio" name="manual-participation" value="no"> <span class="ml-2">Nee</span></label>
        </div>
        <div class="mb-3">
          <div class="flex items-center justify-between mb-1">
            <div class="text-xs font-bold uppercase text-text-sub">Keuze Maaltijd</div>
            <div class="text-xs text-text-sub">Vast menu:</div>
          </div>
          <div class="flex items-start gap-4">
            <div id="manual-keuze-list" class="flex-1 flex flex-col gap-2"></div>
            <div id="manual-vast-list" class="shrink-0 ml-3 flex flex-col gap-1 max-w-[160px] text-xs text-text-sub"></div>
          </div>
        </div>
        <div class="mb-3">
          <div class="text-xs font-bold uppercase text-text-sub mb-1">Jaarhanger</div>
          <label class="inline-flex items-center mr-4"><input type="radio" name="manual-jaar" value="yes"> <span class="ml-2">Ja</span></label>
          <label class="inline-flex items-center"><input type="radio" name="manual-jaar" value="no"> <span class="ml-2">Nee</span></label>
        </div>
        <div class="flex items-center gap-3">
          <button id="manual-confirm" class="bg-primary text-white rounded-lg px-4 py-2 font-bold">Bevestig</button>
        </div>
      `;
      const container = document.getElementById('manual-search-hint');
      if (container && container.parentNode) container.parentNode.appendChild(modal);
    }

    // populate name and lidnr
    try {
      const nameEl = document.getElementById('manual-name');
      const lidEl = document.getElementById('manual-lidnr');
      if (nameEl) nameEl.textContent = selected.label || '';
      if (lidEl) lidEl.textContent = selected.raw && (selected.raw.lidnummer || selected.raw.LidNr || selected.raw.lidnr) ? (selected.raw.lidnummer || selected.raw.LidNr || selected.raw.lidnr) : '';
    } catch (_) {}

    // fill maaltijd options
    try {
      const list = document.getElementById('manual-keuze-list');
      const vastEl = document.getElementById('manual-vast-list');
      if (list) {
        list.innerHTML = '<div class="text-text-sub text-sm">Laden…</div>';
        const opts = await getLunchOptions();
        const keuze = Array.isArray(opts.keuzeEten) ? opts.keuzeEten : [];
        const vast = Array.isArray(opts.vastEten) ? opts.vastEten : [];
        if (keuze.length === 0) list.innerHTML = '<div class="text-text-sub text-sm">Geen keuze maaltijden gevonden</div>';
        else {
          list.innerHTML = keuze.map((it, idx) => `<label class="inline-flex items-center gap-3"><input type="radio" name="manual-keuze" value="${escapeHtml(String(it))}"><span>${escapeHtml(String(it))}</span></label>`).join('');
        }
        if (vastEl) {
          if (!vast || vast.length === 0) {
            vastEl.innerHTML = '<div class="text-xs text-text-sub">Geen vast menu</div>';
          } else {
            // render compact badges for fixed menu
            vastEl.innerHTML = vast.map(v => `<span class="inline-block px-2 py-1 bg-gray-100 rounded-md text-[12px]">${escapeHtml(String(v))}</span>`).join(' ');
          }
        }
      }
    } catch (e) { console.error('fill manual keuzes failed', e); }

    // wire buttons
    try {
      const confirm = document.getElementById('manual-confirm');
      if (confirm) confirm.addEventListener('click', async () => {
        try {
          const participation = (modal.querySelector('input[name="manual-participation"]:checked') || {}).value || null;
          const keuzeInp = modal.querySelector('input[name="manual-keuze"]:checked');
          const keuze = keuzeInp ? keuzeInp.value : null;
          const jaar = (modal.querySelector('input[name="manual-jaar"]:checked') || {}).value || null;
          // perform check-in (reuse existing checkInMemberById)
          try {
            const memberId = String(selected.id || (selected.raw && (selected.raw.lidnummer || selected.raw.LidNr || selected.raw.lidnr)) || '');
            if (!memberId) { alert('Geen lidnummer gevonden'); return; }
            const r = await checkInMemberById(memberId, { lunchDeelname: participation, lunchKeuze: keuze, Jaarhanger: jaar });
            if (r && r.success) {
              try { showScanSuccess('Ingeschreven: ' + (memberId || '')); } catch(_){}
              // append to recent activity
              try { const full = await getMemberById(memberId); renderActivityItem(full || { lidnummer: memberId }, new Date().toISOString()); } catch(_) { renderActivityItem({ lidnummer: memberId }, new Date().toISOString()); }
            } else { alert('Kon lid niet bijwerken'); }
          } catch (e) { console.error('manual confirm checkin failed', e); alert('Fout bij inschrijven'); }
          // also register today's ride
          try { const today = new Date().toISOString().slice(0,10); await manualRegisterRide(String(selected.id || ''), today); } catch(_){}
          try { modal.remove(); } catch(_){}
        } catch (e) { console.error('manual confirm error', e); }
      });
    } catch (e) { console.error('wire manual buttons failed', e); }

  } catch (e) { console.error('openManualConfirm failed', e); }
}

// initialize manual search handlers after DOM loaded
try { if (typeof window !== 'undefined') window.addEventListener('DOMContentLoaded', () => { try { createManualSearchHandlers(); } catch(_){} }); } catch(_) {}