// Admin helpers for new-ui: scanner + simple Firestore REST writers (simplified)
import { getLunchOptions, getLunchChoiceCount, getParticipationCount, getMemberById, searchMembers, getPlannedDates } from './firestore.js';
import { db, collection, onSnapshot, doc } from '../src/firebase.js';
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

// Render stars for a member in the history section (shows planned vs scanned)
async function renderHistoryStars(memberId) {
  try {
    if (!memberId) return;
    const container = document.getElementById('history-member-stars');
    if (!container) return;
    container.innerHTML = '<div class="text-text-sub text-sm">Laden…</div>';
    const planned = await getPlannedDates().catch(() => []);
    const member = await getMemberById(memberId).catch(() => null);
    const scans = getMemberScanYMDs_local(member || {});
    const plannedY = Array.isArray(planned) ? planned.map(d => (typeof d === 'string' ? d.slice(0,10) : '')).filter(Boolean) : [];
    // Build full-width clickable star buttons
    const todayY = new Date().toISOString().slice(0,10);
    const starHtml = plannedY.map(pd => {
      const isScanned = scans.includes(pd);
      const isFuture = (pd > todayY);
      const title = `Rit ${pd}`;
      // large star inside a full-width flex item
      if (isScanned) {
        return `<button data-filled="1" data-history-date="${pd}" aria-label="${title}" class="history-star-btn w-full flex-1 h-14 flex items-center justify-center rounded-lg border border-gray-200 bg-white" title="${title}"><span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1, 'wght' 400; -webkit-font-variation-settings: 'FILL' 1, 'wght' 400; color: #F2C438; font-size:32px;">star</span></button>`;
      }
      if (isFuture) {
        // future event: keep star visible but render a semi-opaque overlay with a centered white lock
        return `
          <button data-filled="0" data-future="1" data-history-date="${pd}" aria-label="${title}" class="history-star-btn w-full flex-1 h-14 flex items-center justify-center rounded-lg border border-gray-200 bg-white relative" title="${title}" disabled aria-disabled="true" style="pointer-events:none;">
            <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 0, 'wght' 400; color: #D1D5DB; font-size:32px; z-index:0;">star</span>
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(22,62,141,0.6);border-radius:0.5rem;z-index:40;pointer-events:none;">
              <div style="width:40px;height:40px;border-radius:9999px;display:flex;align-items:center;justify-content:center;">
                <span class="material-symbols-outlined" style="font-size:20px;color:#ffffff;">lock</span>
              </div>
            </div>
          </button>
        `;
      }
      return `<button data-filled="0" data-history-date="${pd}" aria-label="${title}" class="history-star-btn w-full flex-1 h-14 flex items-center justify-center rounded-lg border border-gray-200 bg-white" title="${title}"><span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 0, 'wght' 400; -webkit-font-variation-settings: 'FILL' 0, 'wght' 400; color: #D1D5DB; font-size:32px;">star</span></button>`;
    }).join('');
    container.innerHTML = `<div class="flex gap-2">${starHtml}</div>` || `<div class="text-sm text-gray-500">Geen geplande ritten</div>`;

    // attach live listener to update when member ScanDatums change (best-effort)
      try {
        if (container._starsUnsub && typeof container._starsUnsub === 'function') container._starsUnsub();
        if (doc && onSnapshot && db) {
          container._starsUnsub = onSnapshot(doc(db, 'members', String(memberId)), snap => {
            try {
              const data = (snap && snap.exists && snap.exists()) ? snap.data() : (snap && snap.data ? snap.data() : {});
              const scans2 = getMemberScanYMDs_local(data || {});
              const todayY2 = new Date().toISOString().slice(0,10);
              const starHtml2 = plannedY.map(pd => {
                const isScanned = scans2.includes(pd);
                const isFuture2 = (pd > todayY2);
                const title = `Rit ${pd}`;
                if (isScanned) return `<button data-filled="1" data-history-date="${pd}" aria-label="${title}" class="history-star-btn w-full flex-1 h-14 flex items-center justify-center rounded-lg border border-gray-200 bg-white"><span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1, 'wght' 400; color: #F2C438; font-size:32px;">star</span></button>`;
                if (isFuture2) return `
                  <button data-filled="0" data-future="1" data-history-date="${pd}" aria-label="${title}" class="history-star-btn w-full flex-1 h-14 flex items-center justify-center rounded-lg border border-gray-200 bg-white relative" title="${title}" disabled aria-disabled="true" style="pointer-events:none;">
                    <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 0, 'wght' 400; color: #D1D5DB; font-size:32px; z-index:0;">star</span>
                    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(22,62,141,0.6);border-radius:0.5rem;z-index:40;pointer-events:none;">
                      <div style="width:40px;height:40px;border-radius:9999px;display:flex;align-items:center;justify-content:center;">
                        <span class="material-symbols-outlined" style="font-size:20px;color:#ffffff;">lock</span>
                      </div>
                    </div>
                  </button>
                `;
                return `<button data-filled="0" data-history-date="${pd}" aria-label="${title}" class="history-star-btn w-full flex-1 h-14 flex items-center justify-center rounded-lg border border-gray-200 bg-white"><span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 0, 'wght' 400; color: #D1D5DB; font-size:32px;">star</span></button>`;
              }).join('');
              container.innerHTML = `<div class="flex gap-2">${starHtml2}</div>`;
              attachHistoryStarHandlers(container, memberId, plannedY);
            } catch (e) { console.error('history stars snapshot render failed', e); }
          });
        }
      } catch (e) { console.warn('attach snapshot for history stars failed', e); }
    // Attach click handlers for stars (register when clicked)
    try { attachHistoryStarHandlers(container, memberId, plannedY); } catch(_){}
  } catch (e) { console.error('renderHistoryStars failed', e); }
}

function attachHistoryStarHandlers(container, memberId, plannedY) {
  try {
    if (!container) return;
    // delegate clicks on buttons
    const btns = Array.from(container.querySelectorAll('button[data-history-date]'));
    btns.forEach(b => {
      // avoid duplicating handlers
      if (b._historyHandlerAttached) return;
      b._historyHandlerAttached = true;
      // skip attaching handler for future (locked) buttons
      try { if (b.getAttribute('data-future') === '1') return; } catch(_){}
      b.addEventListener('click', async (ev) => {
        try {
          ev.preventDefault();
          // If the star is already filled, do nothing
          try { if (b.getAttribute('data-filled') === '1') return; } catch(_){ }
          const date = b.getAttribute('data-history-date');
          if (!memberId || !date) return;
          // Optimistic UI: mark button as filled immediately to avoid re-render flicker
          try {
            b.setAttribute('data-filled', '1');
            b.disabled = true;
            b.innerHTML = '<span class="material-symbols-outlined" style="font-variation-settings: \'FILL\' 1, \'wght\' 400; color: #F2C438; font-size:32px;">star</span>';
          } catch(_){}
          // register the ride for this member/date
          try {
            const res = await manualRegisterRide(String(memberId), String(date));
            if (res && res.success) {
              // success: keep optimistic state; don't re-render entire list
              return;
            } else {
              // revert optimistic state on failure
              try {
                b.setAttribute('data-filled', '0');
                b.disabled = false;
                b.innerHTML = '<span class="material-symbols-outlined" style="font-variation-settings: \'FILL\' 0, \'wght\' 400; color: #D1D5DB; font-size:32px;">star</span>';
              } catch(_){}
              alert('Kon rit niet registreren');
            }
          } catch (e) {
            try {
              b.setAttribute('data-filled', '0');
              b.disabled = false;
              b.innerHTML = '<span class="material-symbols-outlined" style="font-variation-settings: \'FILL\' 0, \'wght\' 400; color: #D1D5DB; font-size:32px;">star</span>';
            } catch(_){}
            console.error('history star register failed', e);
            alert('Fout bij registreren');
          }
        } catch (e) { console.error('history star click failed', e); alert('Fout bij registreren'); }
      });
    });
  } catch (e) { console.error('attachHistoryStarHandlers failed', e); }
}

// Minimal HTML escape used by the manual modal
function escapeHtml(s) {
  try {
    if (s === null || typeof s === 'undefined') return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]);
  } catch (e) { return String(s || ''); }
}

// Normalize yes/no-like values (used when prefilling jaarhanger)
function normalizeYesNo(v) {
  try {
    if (v === null || typeof v === 'undefined') return null;
    if (typeof v === 'boolean') return v ? 'yes' : 'no';
    const s = String(v).trim().toLowerCase();
    if (s === '') return null;
    if (s === 'ja' || s === 'yes' || s === 'true' || s === '1' || s === 'y') return 'yes';
    if (s === 'nee' || s === 'no' || s === 'false' || s === '0' || s === 'n') return 'no';
    const num = Number(s);
    if (!isNaN(num)) return num > 0 ? 'yes' : 'no';
    return null;
  } catch (e) { return null; }
}

// Return array of YMD scan dates from member object. Copied from main.js implementation (scoped helper).
function getMemberScanYMDs_local(member) {
  try {
    if (!member) return [];
    const candidates = [member.ScanDatums, member.scanDatums, member.ScanDatum, member.scanDatum, member.scanDates, member.ScanDates, member.ScanDatumList, member.scanDatumList];
    let raw = null;
    for (const c of candidates) { if (typeof c !== 'undefined' && c !== null) { raw = c; break; } }
    if (!raw) {
      for (const k of Object.keys(member || {})) {
        if (k.toLowerCase().includes('scan')) { raw = member[k]; break; }
      }
    }
    if (!raw) return [];
    const result = [];
    if (Array.isArray(raw)) {
      for (const it of raw) {
        if (!it) continue;
        if (typeof it === 'string') { result.push(String(it).slice(0,10)); continue; }
        if (typeof it === 'object') {
          if (typeof it.seconds === 'number') { try { result.push(new Date(it.seconds * 1000).toISOString().slice(0,10)); continue; } catch(_){} }
          if (it.value && typeof it.value === 'string') { result.push(String(it.value).slice(0,10)); continue; }
          for (const pk of ['date','datum','scanDate','ScanDatum']) { if (it[pk]) { result.push(String(it[pk]).slice(0,10)); break; } }
        }
      }
      return Array.from(new Set(result)).filter(Boolean);
    }
    if (typeof raw === 'object') {
      for (const [k,v] of Object.entries(raw)) {
        if (typeof k === 'string' && /^\d{4}-\d{2}-\d{2}/.test(k)) result.push(k.slice(0,10));
        if (v) {
          if (typeof v === 'string') result.push(v.slice(0,10));
          else if (typeof v === 'object' && typeof v.seconds === 'number') result.push(new Date(v.seconds * 1000).toISOString().slice(0,10));
        }
      }
      return Array.from(new Set(result)).filter(Boolean);
    }
    if (typeof raw === 'string') return [raw.slice(0,10)];
    return [];
  } catch (e) { return []; }
}

// Render lunch choices page elements (used by handmatige-keuzes.html)

export async function renderLunchOptions(hostId = 'lunch-choices-list', inclusiefId = 'inclusief-list', { force = false } = {}) {
  try {
    const host = document.getElementById(hostId);
    const incl = document.getElementById(inclusiefId);

    // If host is not present or intentionally hidden and not forced, skip render
    if (!force && host && (host.style.display === 'none' || host.classList.contains('hidden') || host.getAttribute('aria-hidden') === 'true')) return;

    // always fetch fresh data (no cache)
    const res = await getLunchOptions();

    const keuze = Array.isArray(res && res.keuzeEten) ? res.keuzeEten : [];
    const vast = Array.isArray(res && res.vastEten) ? res.vastEten : [];

    if (incl) {
      if (!vast || vast.length === 0) incl.textContent = 'Geen vaste gerechten gevonden';
      else incl.textContent = String(vast.join(', '));
    }
    if (!host) return;

    // avoid re-rendering identical choice list
    try {
      const hash = JSON.stringify(keuze || []);
      if (!force && host._lastKeuzeHash && host._lastKeuzeHash === hash) return;
      host._lastKeuzeHash = hash;
    } catch(_){}

    if (!keuze || keuze.length === 0) {
      host.innerHTML = '<div class="text-text-sub text-sm">Geen keuze maaltijden gevonden</div>';
      return;
    }

    // build minimal DOM string — avoid expensive work per item
    host.innerHTML = keuze.map((k) => {
      const safe = String(k || '').replace(/"/g, '&quot;');
      return `
        <label class="radio-card group relative flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 cursor-pointer hover:bg-gray-50">
          <div class="flex items-center gap-3">
            <span class="material-symbols-outlined text-gray-400">lunch_dining</span>
            <span class="font-semibold text-text-main">${escapeHtml(String(k))}</span>
          </div>
          <div class="relative flex items-center justify-center w-5 h-5 rounded-full border border-gray-300 bg-white">
            <div class="w-2.5 h-2.5 rounded-full bg-primary opacity-0 transition-opacity"></div>
          </div>
          <input class="invisible absolute" name="lunch_choice" type="radio" value="${safe}" />
        </label>
      `;
    }).join('\n');
  } catch (e) { console.error('renderLunchOptions failed', e); }
}

// Attach handlers to lunch choice radios to update visual state when selected
export function attachLunchChoiceHandlers(hostId = 'lunch-choices-list') {
  try {
    const host = document.getElementById(hostId);
    if (!host) return;
    const radios = Array.from(host.querySelectorAll('input[name="lunch_choice"]'));
    if (!radios || radios.length === 0) return;
    function applyLunchSelectionState() {
      try {
        const rs = Array.from(host.querySelectorAll('input[name="lunch_choice"]'));
        rs.forEach(rr => {
          const lab = rr.closest('label') || rr.parentElement;
          if (!lab) return;
          const innerText = lab.querySelector('.font-semibold');
          const icon = lab.querySelector('.material-symbols-outlined');
          const dot = lab.querySelector('[class~="w-2.5"]');
          const outerCircle = lab.querySelector('[class~="w-5"]');
          if (rr.checked) {
            try {
              lab.classList.add('border-primary');
              lab.classList.remove('border-gray-200');
              lab.style.backgroundColor = '#163e8d';
              lab.style.borderColor = '#163e8d';
              lab.style.color = '#ffffff';
            } catch(_){}
            if (innerText) { innerText.style.color = '#ffffff'; }
            if (icon) { icon.style.color = '#ffffff'; }
            if (outerCircle) {
              try {
                outerCircle.style.backgroundColor = '#ffffff';
                outerCircle.style.borderColor = '#163e8d';
                outerCircle.style.padding = '4px';
                outerCircle.style.borderRadius = '9999px';
                outerCircle.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;color:#163e8d">check</span>';
              } catch(_){}
            }
          } else {
            try {
              lab.classList.remove('border-primary');
              lab.classList.add('border-gray-200');
              lab.style.backgroundColor = '';
              lab.style.borderColor = '';
              lab.style.color = '';
            } catch(_){}
            if (innerText) { innerText.style.color = ''; }
            if (icon) { icon.style.color = ''; }
            if (outerCircle) {
              try {
                outerCircle.style.backgroundColor = '';
                outerCircle.style.borderColor = '';
                outerCircle.style.padding = '';
                outerCircle.style.borderRadius = '';
                outerCircle.innerHTML = '<div class="w-2.5 h-2.5 rounded-full" style="background:#ffffff;opacity:0"></div>';
              } catch(_){}
            }
          }
        });
      } catch (e) { console.error('applyLunchSelectionState failed', e); }
    }

    radios.forEach(r => {
      if (r._lunchHandlerAttached) return;
      r._lunchHandlerAttached = true;
      r.addEventListener('change', () => { try { applyLunchSelectionState(); } catch(e){ console.error(e); } });
    });

    // delegate clicks on host to ensure selection updates even if change doesn't fire immediately
    if (!host._lunchClickHandlerAttached) {
      host._lunchClickHandlerAttached = true;
      host.addEventListener('click', (ev) => {
        try {
          const lbl = ev.target.closest('label') || (ev.target.parentElement && ev.target.parentElement.closest && ev.target.parentElement.closest('label'));
          if (lbl) {
            const input = lbl.querySelector('input[name="lunch_choice"]');
            if (input) {
              // programmatically ensure radio is checked when label area clicked
              try { input.checked = true; } catch(_){ }
              try { input.dispatchEvent(new Event('change', { bubbles: true })); } catch(_){ }
              try { applyLunchSelectionState(); } catch(_){ }
              try { console.debug('lunch host click -> set checked for', input.value); } catch(_){ }
              return;
            }
          }
          // fallback: schedule apply to catch native changes
          setTimeout(() => { try { applyLunchSelectionState(); } catch(_){} }, 0);
        } catch (e) { console.error('host click handler failed', e); }
      });
    }
    // apply initial state
    try {
      const checked = radios.find(r => r.checked);
      if (checked) checked.dispatchEvent(new Event('change', { bubbles: true }));
    } catch(_){}
  } catch (e) { console.error('attachLunchChoiceHandlers failed', e); }
}

// Initialize the handmatige-keuzes page behavior: reveal hosts on member selection
export function initHandmatigeKeuzes({ inputId = 'participant-name-input-manual', lunchHostId = 'lunch-choices-host', jaarHostId = 'jaarhanger-host' } = {}) {
  try {
    const input = document.getElementById(inputId);
    const lunchHost = document.getElementById(lunchHostId);
    const jaarHost = document.getElementById(jaarHostId);

    // keep currently selected member document (if available) so we can read prefills
    let _currentMember = null;

    function getMemberJaarhanger(member) {
      try {
        if (!member) return null;
        let found = null;
        for (const k of Object.keys(member)) {
          const lk = String(k || '').toLowerCase();
          if (lk.includes('jaarhang') || lk.includes('jaarhanger')) { found = member[k]; break; }
        }
        if (found === null) {
          const keys = ['Jaarhanger','jaarhanger','JaarHanger','JaarhangerKeuze','jaarhangerKeuze','Jaarhanger_keuze'];
          for (const k of keys) if (member[k] !== undefined) { found = member[k]; break; }
        }
        const yn = normalizeYesNo(found);
        if (yn === 'yes') return 'ja';
        if (yn === 'no') return 'nee';
        return null;
      } catch (e) { return null; }
    }

    function updateEetMeeState(value) {
      const eatInputs = Array.from(document.querySelectorAll('input[name="eetmee"]'));
      eatInputs.forEach(inp => {
        const visual = inp.nextElementSibling;
        if (!visual) return;
        visual.classList.remove('bg-primary','text-white','border-primary','bg-danger','border-danger');
        visual.classList.add('bg-white','text-gray-600','border-gray-200');
        if (inp.value === value && inp.checked) {
          if (value === 'ja') {
            visual.classList.remove('bg-white','text-gray-600');
            visual.classList.add('bg-primary','text-white','border-primary');
          } else {
            visual.classList.remove('bg-white','text-gray-600');
            visual.classList.add('bg-danger','text-white','border-danger');
          }
        }
      });

      const lunchList = document.getElementById('lunch-choices-list');
      if (value === 'nee') {
        if (lunchList) {
          const radios = Array.from(lunchList.querySelectorAll('input[type="radio"]'));
          radios.forEach(r => {
            try { r.checked = false; } catch(_){}
            try { r.dispatchEvent(new Event('change', { bubbles: true })); } catch(_){}
          });
          lunchList.classList.add('opacity-50','pointer-events-none');
          try {
            // also clear any visual selected state on labels
            const labs = Array.from(lunchList.querySelectorAll('label'));
            labs.forEach(lab => {
              try {
                lab.classList.remove('border-primary','bg-primary');
                lab.classList.add('bg-white','border-gray-200');
                lab.style.backgroundColor = '';
                lab.style.borderColor = '';
                lab.style.color = '';
                const innerText = lab.querySelector('.font-semibold'); if (innerText) innerText.style.color = '';
                const icon = lab.querySelector('.material-symbols-outlined'); if (icon) icon.style.color = '';
                const dot = lab.querySelector('[class~="w-2.5"]'); if (dot) { dot.style.backgroundColor = ''; dot.style.opacity = '0'; }
              } catch(_){}
            });
          } catch(_){}
        }
      } else {
        if (lunchList) {
          lunchList.classList.remove('opacity-50','pointer-events-none');
        }
      }
    }

    const eetInputs = Array.from(document.querySelectorAll('input[name="eetmee"]'));
    eetInputs.forEach(inp => {
      inp.addEventListener('change', () => {
        try { updateEetMeeState(inp.value); } catch (e) { console.error(e); }
      });
    });

    // Save button validation and handler
    const saveBtn = document.getElementById('save-manual-button');
    function setSaveEnabled(enabled) {
      try {
        if (!saveBtn) return;
        saveBtn.disabled = !enabled;
        if (enabled) { saveBtn.classList.remove('opacity-50'); saveBtn.removeAttribute('aria-disabled'); }
        else { saveBtn.classList.add('opacity-50'); saveBtn.setAttribute('aria-disabled', 'true'); }
      } catch(_){}
    }

    function validateAndToggleSave() {
      try {
        if (!saveBtn) return;
        const memberId = (input && ((input.dataset && input.dataset.memberId) || input.getAttribute('data-member-id'))) || null;
        const eet = (document.querySelector('input[name="eetmee"]:checked') || {}).value || null;
        const jaar = (document.querySelector('input[name="jaarhanger"]:checked') || {}).value || null;
        // if jaarhanger not selected in DOM, check current member object for a prefixed value
        const jaarFromMember = (!jaar && _currentMember) ? getMemberJaarhanger(_currentMember) : null;
        let lunchChoice = null;
        if (eet === 'ja') lunchChoice = (document.querySelector('#lunch-choices-list input[name="lunch_choice"]:checked') || {}).value || null;
        const jaarPresent = jaar || jaarFromMember || null;
        const ok = memberId && eet && jaarPresent && (eet !== 'ja' || lunchChoice);
        setSaveEnabled(Boolean(ok));
      } catch (e) { console.error('validateAndToggleSave failed', e); }
    }

    // revalidate on relevant changes
    document.addEventListener('change', (ev) => {
      try { if (ev && ev.target) {
        const name = ev.target.getAttribute && ev.target.getAttribute('name');
        if (name === 'eetmee' || name === 'jaarhanger' || name === 'lunch_choice') validateAndToggleSave();
      } } catch(_){}
    });

    if (saveBtn) {
      // start disabled
      setSaveEnabled(false);
      saveBtn.addEventListener('click', async (ev) => {
        try {
          ev.preventDefault();
          const memberId = (input && ((input.dataset && input.dataset.memberId) || input.getAttribute('data-member-id'))) || null;
          if (!memberId) { alert('Geen deelnemer geselecteerd'); return; }
          const eet = (document.querySelector('input[name="eetmee"]:checked') || {}).value || null;
          const jaar = (document.querySelector('input[name="jaarhanger"]:checked') || {}).value || null;
          let lunchChoice = null;
          if (eet === 'ja') lunchChoice = (document.querySelector('#lunch-choices-list input[name="lunch_choice"]:checked') || {}).value || null;
          setSaveEnabled(false);
          // prefer DOM jaar selection, fallback to member stored value
          const jaarFromMember = (!jaar && _currentMember) ? getMemberJaarhanger(_currentMember) : null;
          const jaarToSave = jaar || jaarFromMember || null;
          const payload = { lunchDeelname: (eet === 'ja' ? 'ja' : 'nee'), lunchKeuze: lunchChoice || null, Jaarhanger: jaarToSave };
          try {
            const res = await checkInMemberById(String(memberId), payload);
            if (res && res.success) {
              // also write today's date into ScanDatums for this member
              try {
                const today = new Date().toISOString().slice(0,10);
                await manualRegisterRide(String(memberId), today);
              } catch (e) { console.warn('write scan date failed', e); }
              setSaveEnabled(false);
              try { setTimeout(() => { window.location.href = 'inschrijftafel.html'; }, 700); } catch(_){}
            } else {
              alert('Kon niet opslaan');
              setSaveEnabled(true);
            }
          } catch (e) { console.error('save failed', e); alert('Fout bij opslaan'); setSaveEnabled(true); }
        } catch (e) { console.error('saveBtn handler failed', e); setSaveEnabled(true); }
      });
    }

      if (input) {
      input.addEventListener('member-selected', async (ev) => {
        try {
          try { console.debug('initHandmatigeKeuzes member-selected detail:', ev && ev.detail); } catch(_){}
          if (lunchHost) { lunchHost.style.display = ''; lunchHost.removeAttribute('aria-hidden'); lunchHost.classList.remove('hidden'); }
          if (jaarHost) { jaarHost.style.display = ''; jaarHost.removeAttribute('aria-hidden'); jaarHost.classList.remove('hidden'); }
                try { await renderLunchOptions(); } catch(e) { console.error(e); }
                try { attachLunchChoiceHandlers(); } catch(_){}
          const selected = document.querySelector('input[name="eetmee"]:checked');
          if (selected) updateEetMeeState(selected.value);
          // attempt to prefill Jaarhanger from member record if available
            try {
            const memberId = (ev && ev.detail && ev.detail.id) || input.dataset.memberId || input.getAttribute('data-member-id');
            const memberDetail = (ev && ev.detail && ev.detail.member) ? ev.detail.member : null;
            let m = null;
            if (memberDetail) m = memberDetail;
            else if (memberId) m = await getMemberById(memberId).catch(() => null);
            // store current member object for validation/save fallback
            if (m) _currentMember = m;
            if (m) {
              // try to find any field that indicates jaarhanger
              let found = null;
              for (const k of Object.keys(m)) {
                const lk = String(k || '').toLowerCase();
                if (lk.includes('jaarhang') || lk.includes('jaarhanger')) { found = m[k]; break; }
              }
              if (found === null) {
                const keys = ['Jaarhanger','jaarhanger','JaarHanger','JaarhangerKeuze','jaarhangerKeuze','Jaarhanger_keuze'];
                for (const k of keys) if (m[k] !== undefined) { found = m[k]; break; }
              }
              if (found !== null && typeof found !== 'undefined' && String(found || '').trim() !== '') {
                const yn = normalizeYesNo(found);
                  if (yn === 'yes') {
                    const el = document.querySelector('input[name="jaarhanger"][value="ja"]'); if (el) { el.checked = true; try { el.dispatchEvent(new Event('change',{bubbles:true})); } catch(_){} }
                  } else if (yn === 'no') {
                    const el = document.querySelector('input[name="jaarhanger"][value="nee"]'); if (el) { el.checked = true; try { el.dispatchEvent(new Event('change',{bubbles:true})); } catch(_){} }
                  }
              }
            }
          } catch (e) { console.warn('prefill jaarhanger failed', e); }
        } catch (e) { console.error('member-selected handler failed', e); }
      });
      // hide hosts again when input is cleared
      input.addEventListener('input', (ev) => {
        try {
          const v = String(input.value || '').trim();
          if (!v) {
            if (lunchHost) { lunchHost.style.display = 'none'; lunchHost.setAttribute('aria-hidden', 'true'); lunchHost.classList.add('hidden'); }
            if (jaarHost) { jaarHost.style.display = 'none'; jaarHost.setAttribute('aria-hidden', 'true'); jaarHost.classList.add('hidden'); }
            // clear cached member when input cleared
            try { _currentMember = null; } catch(_){}
          }
        } catch (e) { console.error('input clear handler failed', e); }
      });
    }
  } catch (e) { console.error('initHandmatigeKeuzes failed', e); }
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
    const inputs = Array.from(document.querySelectorAll('input.participant-name-input'));
    if (!inputs || inputs.length === 0) return;

    inputs.forEach((input) => {
      try {
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
try { if (typeof window !== 'undefined') window.addEventListener('DOMContentLoaded', () => { try { createManualSearchHandlers(); } catch(_){} }); } catch(_) {}