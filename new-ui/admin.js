
// Admin helpers for new-ui: scanner + simple Firestore REST writers (simplified)
import { getLunchOptions, getLunchChoiceCount, getParticipationCount } from './firestore.js';
import { ensureHtml5Qrcode, selectRearCameraDeviceId, startQrScanner, stopQrScanner } from './scanner.js';

const firebaseConfigDev = {
  apiKey: "AIzaSyCwHJ1VIqM9s4tfh2hn8KZxqunuYySzuwQ",
  projectId: "shadow-app-b3fb3",
};

const BASE_URL = `https://firestore.googleapis.com/v1/projects/${firebaseConfigDev.projectId}/databases/(default)/documents`;

// Simple Firestore REST update for a member document. Uses PATCH with updateMask to set specific fields.
export async function checkInMemberById(memberId, { lunchDeelname = null, lunchKeuze = null } = {}) {
  if (!memberId) return { success: false, error: 'missing-id' };
  try {
    const url = `${BASE_URL}/members/${encodeURIComponent(memberId)}?key=${firebaseConfigDev.apiKey}`;
    const fields = {};
    if (lunchDeelname !== null) fields.lunchDeelname = { stringValue: String(lunchDeelname) };
    if (lunchKeuze !== null) fields.lunchKeuze = { stringValue: String(lunchKeuze) };
    fields.lastScan = { timestampValue: new Date().toISOString() };
    const body = { fields };
    const params = [];
    if (lunchDeelname !== null) params.push('updateMask.fieldPaths=lunchDeelname');
    if (lunchKeuze !== null) params.push('updateMask.fieldPaths=lunchKeuze');
    params.push('updateMask.fieldPaths=lastScan');
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
    const body = { fields: { ScanDatums: { arrayValue: { values: scans.map(s => ({ stringValue: String(s) })) } }, lastScan: { timestampValue: new Date().toISOString() } } };
    const finalUrl = `${getUrl}&updateMask.fieldPaths=ScanDatums&updateMask.fieldPaths=lastScan`;
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

    (async function(){
      try {
        const yesEl = document.getElementById('count-yes');
        const noEl = document.getElementById('count-no');
        try {
          const [yesCnt, noCnt] = await Promise.all([ getParticipationCount('yes'), getParticipationCount('no') ]);
          if (yesEl) yesEl.textContent = String(isFinite(yesCnt) ? yesCnt : 0);
          if (noEl) noEl.textContent = String(isFinite(noCnt) ? noCnt : 0);
        } catch (e) { if (yesEl) yesEl.textContent = 'ERROR'; if (noEl) noEl.textContent = 'ERROR'; }
      } catch (e) { console.error('update participation UI failed', e); }
    })();

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

            const res = await startQrScanner('adminQRReader', (decoded) => {
              try { console.log('QR decoded:', decoded); alert('Gescand: ' + decoded); } catch(_){ }
            }, { fps: 10, qrbox: 250 });
            running = res && res.scannerInstance ? res.scannerInstance : null;
            try { startBtn.innerHTML = '<span class="material-symbols-outlined">stop</span> Stop Scanner'; } catch(_){ }
          } catch (e) { console.error('scanner start failed', e); alert('Kon scanner niet starten'); }
        });
      }
    } catch (e) { console.error('wire scanner button failed', e); }

}
