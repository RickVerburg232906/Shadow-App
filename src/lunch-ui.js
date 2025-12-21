// lunch-ui.js
// Renders the lunch-choice HTML fragment into a container element.
// Also shows a small preview of available "keuze eten" (if any)
// so members/operators can see the options before clicking "Ja".
import { checkIfCurrentMemberIsScanned } from './landelijke-signup.js';
import { db, getDoc, doc } from './firebase.js';

export function renderLunchChoice(container = null, opts = {}) {
  try {
    if (!container) container = document.getElementById('lunchChoiceSection');
    if (!container) return null;
    const html = `
      <details style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%); border-radius: 12px; padding: 20px; border: 1px solid rgba(59, 130, 246, 0.2);">
        <summary style="cursor: pointer; list-style: none; user-select: none; display: flex; align-items: center; gap: 12px;">
          <div style="flex: 1; display:flex; align-items:center; gap:12px; justify-content:space-between;">
            <div style="flex:1;">
              <h3 style="margin: 0; font-size: 20px;">Lunch deelname</h3>
              <p style="margin: 4px 0 0 0; color: var(--muted); font-size: 14px;">
                <span id="lunchSummaryText">Geef aan of je mee-eet tijdens de lunch</span>
              </p>
            </div>
            <div style="margin-left:12px; display:flex; align-items:center;">
              <span id="lunchSelectionBadge" style="display: none; padding: 6px 10px; border-radius: 8px; font-size: 13px; font-weight: 600; white-space: nowrap; box-shadow: 0 1px 3px rgba(0,0,0,0.12);"></span>
            </div>
          </div>
          <span class="toggle-icon" style="font-size: 24px; transition: transform 0.3s ease;">▼</span>
        </summary>

        <div id="lunchDeadlineInfo" style="padding: 12px; margin-top: 16px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">💡</span>
            <div>
              <strong style="color: #3b82f6; font-size: 14px;">LET OP:</strong>
              <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--muted); line-height: 1.5;">Maak je lunch keuze <strong>vóór het inchecken</strong>. Na het inchecken kan je je keuze niet meer wijzigen.</p>
            </div>
          </div>
        </div>
        
        <div class="lunch-content" style="margin-top: 16px;">
          <div style="margin-bottom:20px; background: rgba(255, 255, 255, 0.03); padding: 14px; border-radius: 8px; border-left: 4px solid #10b981;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
              <span style="font-size: 20px;">🥖</span>
              <strong style="font-size: 15px;">Vast menu voor iedereen:</strong>
            </div>
            <p id="vastEtenDisplay" class="muted" style="margin:0; font-size: 14px; line-height: 1.6;">Laden...</p>
          </div>

          <!-- Keuze-eten preview: styled the same as the 'Vast menu' block -->
          <div id="keuzeEtenPreviewWrap" style="margin-bottom:20px; background: rgba(255, 255, 255, 0.03); padding: 14px; border-radius: 8px; border-left: 4px solid #10b981;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
              <span style="font-size: 20px;">🍽️</span>
              <strong style="font-size: 15px;">Eten waaruit je kunt kiezen:</strong>
            </div>
            <p id="keuzeEtenPreview" class="muted" style="margin:0; font-size: 14px; line-height: 1.6;"></p>
          </div>
          
          <div class="seg-wrap">
            <div class="seg-toggle" id="lunchToggle" role="radiogroup" aria-label="Lunch keuze" style="width: 100%;">
              <button type="button" id="lunchYes" class="seg-btn" role="radio" aria-checked="false" style="flex: 1; padding: 14px; font-size: 16px; font-weight: 600;">Ja, ik eet mee</button>
              <button type="button" id="lunchNo" class="seg-btn" role="radio" aria-checked="false" style="flex: 1; padding: 14px; font-size: 16px; font-weight: 600;">Nee, ik eet niet mee</button>
            </div>
          </div>

          <div id="lunchDetailsSection" style="display:none; margin-top:12px; padding-bottom: 20px;">
            <div id="keuzeEtenSection" style="margin-bottom:0;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                <span style="font-size: 20px;">🍴</span>
                <strong style="font-size: 15px;">Kies jouw voorkeur (selecteer 1 optie):</strong>
              </div>
              <div id="keuzeEtenButtons" style="display:flex; flex-wrap:wrap; gap:10px;"></div>
            </div>
          </div>
        </div>
      </details>
    `;
    container.innerHTML = html;

    // Ensure details and keuze elements are in a collapsed/hidden state by default
    try {
      const detailsEl = container.querySelector('details');
      // explicitly open the details widget so the "Lunch deelname" section
      // starts expanded, but keep internal choice controls hidden until operator
      // explicitly selects 'Ja'. This shows the summary/content area while
      // preventing the keuze-buttons from appearing prematurely.
      try { if (detailsEl) { detailsEl.open = true; detailsEl.dataset.suppressAutoOpen = 'true'; } } catch(_) {}

      const _details = container.querySelector('#lunchDetailsSection');
      if (_details) { _details.style.display = 'none'; _details.hidden = true; }

      const _keuzeWrap = container.querySelector('#keuzeEtenButtons');
      if (_keuzeWrap) { _keuzeWrap.innerHTML = ''; _keuzeWrap.style.display = 'none'; _keuzeWrap.hidden = true; }

      const _keuzeSection = container.querySelector('#keuzeEtenSection');
      if (_keuzeSection) { _keuzeSection.style.display = 'none'; _keuzeSection.hidden = true; }

      const _previewWrap = container.querySelector('#keuzeEtenPreviewWrap');
      // ensure the preview block is visible by default; its inner text may
      // still be empty until options are loaded
      if (_previewWrap) { _previewWrap.style.display = 'block'; _previewWrap.hidden = false; }

      const scanDisc = container.querySelector('#lunchScannedDisclaimer');
      if (scanDisc) { scanDisc.style.display = 'none'; scanDisc.hidden = true; }
      // Hide the entire lunch widget until a member is selected by the host page.
      try { container.style.display = 'none'; } catch(_) {}
    } catch(_) {}

    // Populate the preview and fixed menu text using the centralized loader.
    (async () => {
      try {
        const vastEl = container.querySelector('#vastEtenDisplay');
        const previewWrap = container.querySelector('#keuzeEtenPreviewWrap');
        const previewEl = container.querySelector('#keuzeEtenPreview');

        const opts = await loadLunchOptions();
        const vast = Array.isArray(opts?.vastEten) ? opts.vastEten : [];
        const keuze = Array.isArray(opts?.keuzeEten) ? opts.keuzeEten : [];

        if (vastEl) vastEl.textContent = vast.length ? vast.join(', ') : 'Geen vast eten beschikbaar';

        if (keuze && keuze.length > 0) {
          // Render as comma-separated text inside the same styled block
          if (previewEl) previewEl.textContent = keuze.join(', ');
          // Keep the preview VISIBLE so operators always see what choices exist.
          if (previewWrap) { previewWrap.style.display = 'block'; previewWrap.hidden = false; }
        } else {
          if (previewEl) previewEl.textContent = '';
          if (previewWrap) { previewWrap.style.display = 'none'; previewWrap.hidden = true; }
        }
      } catch (e) {
        // Non-fatal: leave placeholders as-is
        console.error('lunch-ui: failed to load preview options', e);
      }
    })();

    // Local copy of loadLunchOptions to avoid depending on `member.js`.
    // Mirrors the behavior (cached read from `globals/lunch`).
    async function loadLunchOptions() {
      try {
        const now = Date.now();
        const TTL = 60 * 1000; // cache lunch options for 60s
        if (loadLunchOptions._cache && (now - (loadLunchOptions._cacheAt || 0)) < TTL) {
          return loadLunchOptions._cache;
        }
        const lunchRef = doc(db, 'globals', 'lunch');
        const snap = await getDoc(lunchRef);
        const res = snap && snap.exists()
          ? { vastEten: Array.isArray(snap.data().vastEten) ? snap.data().vastEten : [], keuzeEten: Array.isArray(snap.data().keuzeEten) ? snap.data().keuzeEten : [] }
          : { vastEten: [], keuzeEten: [] };
        loadLunchOptions._cache = res;
        loadLunchOptions._cacheAt = Date.now();
        return res;
      } catch (e) {
        console.error('lunch-ui: failed to load lunch options', e);
        return { vastEten: [], keuzeEten: [] };
      }
    }

    const persist = opts && opts.persist === false ? false : true;

      // Attach interactive handlers so this module is self-contained and
    // works wherever it is rendered. The container gets a `setMember(id)`
    // method to bind the currently selected member.
      // In-memory cache for temporary (cleared on page reload) lunch choices
      // This ensures choices do NOT persist across reloads.
      let IN_MEMORY_CACHE = {};
      function readLocalCache() { try { return IN_MEMORY_CACHE || {}; } catch(_) { return {}; } }
      function writeLocalCache(obj) { try { IN_MEMORY_CACHE = obj || {}; } catch(_) { IN_MEMORY_CACHE = {}; } }
      function getLocalChoice(memberId) { try { const all = readLocalCache(); return all && all[String(memberId)] ? all[String(memberId)] : null; } catch(_) { return null; } }
      function saveLocalChoice(memberId, deel, keuze) {
        try {
          if (!memberId) return;
          const all = readLocalCache();
          all[String(memberId)] = { deel: deel || null, keuze: keuze || null, ts: Date.now() };
          writeLocalCache(all);
          return all[String(memberId)];
        } catch (e) { console.error('lunch-ui: saveLocalChoice failed', e); }
      }
      function clearLocalChoices() { try { IN_MEMORY_CACHE = {}; } catch(_) { IN_MEMORY_CACHE = {}; } }
      // Debug helpers (inspectable from console during the page session)
      try { window.getLunchLocalChoices = () => readLocalCache(); window.clearLunchLocalChoices = () => clearLocalChoices(); } catch(_) {}
      function removeLocalChoice(memberId) { try { const all = readLocalCache(); if (all && all[String(memberId)]) { delete all[String(memberId)]; writeLocalCache(all); } } catch(_) {} }
      try { window.removeLunchLocalChoice = (id) => removeLocalChoice(id); } catch(_) {}
    try {
      const lunchYes = container.querySelector('#lunchYes');
      const lunchNo = container.querySelector('#lunchNo');
      const keuzeWrap = container.querySelector('#keuzeEtenButtons');
      const keuzeSection = container.querySelector('#keuzeEtenSection');
      const keuzePreview = container.querySelector('#keuzeEtenPreview');
      const keuzePreviewWrap = container.querySelector('#keuzeEtenPreviewWrap');
      const vastEtenDisplay = container.querySelector('#vastEtenDisplay');
      const lunchScannedDisclaimer = container.querySelector('#lunchScannedDisclaimer');
      const lunchDetailsSection = container.querySelector('#lunchDetailsSection');
      const lunchSelectionBadge = container.querySelector('#lunchSelectionBadge');
      const detailsEl = container.querySelector('details');
      // Create a visual lock overlay inside the lunch-content to indicate choices are locked
      let lockOverlay = null;
      try {
        const lunchContent = container.querySelector('.lunch-content');
            if (lunchContent) {
          lockOverlay = lunchContent.querySelector('.lunch-lock-overlay');
          if (!lockOverlay) {
            lockOverlay = document.createElement('div');
            lockOverlay.className = 'lunch-lock-overlay';
            const msg = document.createElement('div');
            msg.textContent = 'Keuzes vergrendeld — Je bent al ingecheckt';
            msg.className = 'lunch-lock-message';
            lockOverlay.appendChild(msg);
            // ensure lunchContent can position absolute children
            const prevPos = window.getComputedStyle(lunchContent).position;
            if (prevPos === 'static' || !prevPos) lunchContent.style.position = 'relative';
            lunchContent.appendChild(lockOverlay);
          }
        }
      } catch (_) { lockOverlay = null; }

      // Helper: update the small badge shown in the summary when details are closed
      function updateBadge(choice, keuzeText) {
        try {
          if (!lunchSelectionBadge) return;
          if (!choice) {
            lunchSelectionBadge.style.display = 'none';
            lunchSelectionBadge.textContent = '';
            return;
          }
          let text = '';
          let bg = '';
          let color = '#fff';
          let border = '1px solid rgba(0,0,0,0.06)';
          // Determine whether there are keuze-eten options available in the UI
          const previewEl = document.getElementById('keuzeEtenPreview');
          const keuzeWrapEl = document.getElementById('keuzeEtenButtons');
          const hasKeuzeOptions = (previewEl && previewEl.textContent && previewEl.textContent.trim().length > 0) || (keuzeWrapEl && keuzeWrapEl.querySelectorAll('button').length > 0);

          if (choice === 'ja') {
            if (keuzeText) {
              text = `Ja — ${keuzeText}`;
            } else {
              text = 'Ja';
            }
            // yearhanger-like styling: green tint background, green text, soft border
            bg = 'rgba(16, 185, 129, 0.12)';
            color = '#10b981';
            border = '1px solid rgba(16, 185, 129, 0.24)';
          } else if (choice === 'nee') {
            if (keuzeText) {
              text = `Nee — ${keuzeText}`;
            } else {
              text = 'Nee';
            }
            bg = 'rgba(239, 68, 68, 0.12)';
            color = '#ef4444';
            border = '1px solid rgba(239, 68, 68, 0.24)';
          } else {
            text = String(choice);
            bg = 'rgba(107, 114, 128, 0.08)';
            color = '#6b7280';
            border = '1px solid rgba(107, 114, 128, 0.12)';
          }
          lunchSelectionBadge.textContent = text;
          // Show badge when collapsed. If details are expanded but there is an
          // actual selection (choice or specific meal text), keep the badge
          // visible so operators can still see what was chosen (useful when
          // choices are locked by a scan).
          if (detailsEl && detailsEl.open) {
            if (choice || (keuzeText && String(keuzeText).trim().length > 0)) {
              lunchSelectionBadge.style.display = 'inline-block';
            } else {
              lunchSelectionBadge.style.display = 'none';
            }
          } else {
            lunchSelectionBadge.style.display = 'inline-block';
          }
          lunchSelectionBadge.style.background = bg;
          lunchSelectionBadge.style.color = color;
          lunchSelectionBadge.style.padding = '6px 12px';
          lunchSelectionBadge.style.borderRadius = '8px';
          lunchSelectionBadge.style.fontSize = '13px';
          lunchSelectionBadge.style.fontWeight = '600';
          lunchSelectionBadge.style.border = border;
          lunchSelectionBadge.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
        } catch (e) { console.error('lunch-ui: updateBadge failed', e); }
      }

      // Toggle badge visibility when details open/close — preserve the selected meal text
      try {
        if (detailsEl) detailsEl.addEventListener('toggle', async () => {
          try {
            const memberId = container.dataset.memberId;
            const choice = (lunchYes && lunchYes.classList.contains('active')) ? 'ja' : (lunchNo && lunchNo.classList.contains('active')) ? 'nee' : null;
            let meal = null;
            try { const activeBtn = keuzeWrap && keuzeWrap.querySelector('button.active'); if (activeBtn) meal = (activeBtn.textContent || '').trim(); } catch(_) {}

            // If opening and choice is 'ja', ensure keuze buttons are rendered and the saved meal is selected
            if (detailsEl.open && choice === 'ja' && memberId) {
              try {
                // First try Firestore for authoritative saved meal and deel, then fallback to local cache
                let savedMeal = null;
                let savedDeel = null;
                try {
                  const snap = await getDoc(doc(db, 'members', String(memberId)));
                  const mdata = snap && snap.exists() ? snap.data() : {};
                  if (mdata && typeof mdata.lunchKeuze === 'string' && mdata.lunchKeuze) savedMeal = mdata.lunchKeuze;
                  if (mdata && typeof mdata.lunchDeelname === 'string' && mdata.lunchDeelname) savedDeel = String(mdata.lunchDeelname).toLowerCase();
                } catch (_) {}
                if (!savedMeal || !savedDeel) {
                  const local = getLocalChoice(memberId);
                  if (!savedMeal && local && local.keuze) savedMeal = local.keuze;
                  if (!savedDeel && local && local.deel) savedDeel = local.deel;
                }
                const items = await renderKeuzeButtonsIfNeeded(memberId, true);
                if (items && items.length > 0) {
                  try {
                    const btns = Array.from(keuzeWrap.querySelectorAll('button'));
                    btns.forEach(b => {
                      if (savedMeal && b.textContent === savedMeal) b.classList.add('active','yes'); else b.classList.remove('active');
                    });
                    try { const first = keuzeWrap.querySelector('button'); if (first) first.focus({ preventScroll: true }); } catch(_) {}
                  } catch(_) {}
                }
                if (savedMeal) meal = savedMeal;
                // Ensure Ja/Nee buttons reflect authoritative choice (Firestore preferred)
                try {
                  const finalDeel = savedDeel || ((lunchYes && lunchYes.classList.contains('active')) ? 'ja' : (lunchNo && lunchNo.classList.contains('active')) ? 'nee' : null);
                  if (finalDeel === 'ja') {
                    if (lunchYes) { lunchYes.classList.add('active','yes'); lunchYes.setAttribute('aria-checked','true'); }
                    if (lunchNo)  { lunchNo.classList.remove('active','no'); lunchNo.setAttribute('aria-checked','false'); }
                  } else if (finalDeel === 'nee') {
                    if (lunchNo)  { lunchNo.classList.add('active','no'); lunchNo.setAttribute('aria-checked','true'); }
                    if (lunchYes) { lunchYes.classList.remove('active','yes'); lunchYes.setAttribute('aria-checked','false'); }
                  }
                } catch(_) {}
              } catch (_) {}
            }

            updateBadge(choice, meal);
                // Also check if this member is already scanned for today's ride; if so lock changes
                try {
                  const alreadyScanned = await checkIfCurrentMemberIsScanned(memberId);
                  if (alreadyScanned) {
                    // disable segmented buttons and keuze buttons
                    try { if (lunchYes) { lunchYes.disabled = true; lunchYes.style.opacity = '0.6'; lunchYes.style.cursor = 'not-allowed'; } } catch(_) {}
                    try { if (lunchNo) { lunchNo.disabled = true; lunchNo.style.opacity = '0.6'; lunchNo.style.cursor = 'not-allowed'; } } catch(_) {}
                    try { if (keuzeWrap) { const all = keuzeWrap.querySelectorAll('button'); all.forEach(b => { b.disabled = true; b.style.opacity = '0.6'; b.style.cursor = 'not-allowed'; }); } } catch(_) {}
                    try { if (lunchScannedDisclaimer) lunchScannedDisclaimer.style.display = 'block'; } catch(_) {}
                    try { if (lockOverlay) { lockOverlay.style.display = 'flex'; lockOverlay.style.pointerEvents = 'auto'; } } catch(_) {}
                  } else {
                    try { if (lunchYes) { lunchYes.disabled = false; lunchYes.style.opacity = ''; lunchYes.style.cursor = ''; } } catch(_) {}
                    try { if (lunchNo) { lunchNo.disabled = false; lunchNo.style.opacity = ''; lunchNo.style.cursor = ''; } } catch(_) {}
                    try { if (keuzeWrap) { const all = keuzeWrap.querySelectorAll('button'); all.forEach(b => { b.disabled = false; b.style.opacity = ''; b.style.cursor = ''; }); } } catch(_) {}
                    try { if (lunchScannedDisclaimer) lunchScannedDisclaimer.style.display = 'none'; } catch(_) {}
                    try { if (lockOverlay) { lockOverlay.style.display = 'none'; lockOverlay.style.pointerEvents = 'none'; } } catch(_) {}
                  }
                } catch (_) {}
              } catch (_) {}
        });
      } catch(_) {}

      function clearKeuzeButtons() {
        if (keuzeWrap) keuzeWrap.innerHTML = '';
      }

      async function renderKeuzeButtonsIfNeeded(memberId, show = false) {
        try {
          const opts = await loadLunchOptions();
          const keuzeEten = Array.isArray(opts?.keuzeEten) ? opts.keuzeEten : [];
          if (!keuzeEten || keuzeEten.length === 0) {
            if (lunchDetailsSection) { lunchDetailsSection.style.display = 'none'; lunchDetailsSection.hidden = true; }
            if (keuzeSection) { keuzeSection.style.display = 'none'; keuzeSection.hidden = true; }
            if (keuzePreviewWrap) { keuzePreviewWrap.style.display = 'none'; keuzePreviewWrap.hidden = true; }
            if (keuzeWrap) { keuzeWrap.innerHTML = ''; keuzeWrap.style.display = 'none'; keuzeWrap.hidden = true; }
            clearKeuzeButtons();
            return [];
          }
          // Prepare the sections and buttons but only reveal the buttons/details when `show` is true.
          if (keuzeSection) { keuzeSection.style.display = 'none'; keuzeSection.hidden = true; }
          if (lunchDetailsSection) { lunchDetailsSection.style.display = 'none'; lunchDetailsSection.hidden = true; }
          // Keep the keuze preview visible so the operator always sees the available options.
          if (keuzePreviewWrap) { keuzePreviewWrap.style.display = 'block'; keuzePreviewWrap.hidden = false; }
          clearKeuzeButtons();
          if (keuzeWrap) { keuzeWrap.style.display = 'none'; keuzeWrap.hidden = true; }
          keuzeEten.forEach(item => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'seg-btn';
            btn.textContent = item;
            btn.addEventListener('click', async () => {
              try {
                if (!memberId) return;
                // Persist locally (no Firebase writes)
                try { saveLocalChoice(memberId, 'ja', item); } catch(_) {}
                // Visual feedback
                const prev = keuzeWrap.querySelector('button.active');
                if (prev) prev.classList.remove('active');
                btn.classList.add('active','yes');
                try { updateBadge('ja', item); } catch(_) {}
                // QR generation is handled centrally in index.html; no-op here.
                // collapse the details after a brief delay so the operator sees the active state
                try {
                  setTimeout(() => {
                    try { if (detailsEl) detailsEl.open = false; } catch(_) {}
                    try { if (lunchDetailsSection) { lunchDetailsSection.style.display = 'none'; lunchDetailsSection.hidden = true; } } catch(_) {}
                    try { if (keuzeWrap) { keuzeWrap.style.display = 'none'; keuzeWrap.hidden = true; } } catch(_) {}
                    try { updateBadge('ja', item); } catch(_) {}
                  }, 140);
                } catch(_) {}
                // Notify host pages that lunch choice flow completed for this member
                try {
                  try { document.dispatchEvent(new CustomEvent('lunch:completed', { detail: { memberId: String(memberId), deel: 'ja', keuze: item }, bubbles: true })); } catch(_) {}
                } catch(_) {}
              } catch (e) {
                console.error('lunch-ui: keuze handler failed', e);
              }
            });
            keuzeWrap.appendChild(btn);
          });
          // If caller requested to show the keuze UI (user clicked 'Ja'), reveal now.
          if (show) {
            if (keuzeSection) { keuzeSection.style.display = 'block'; keuzeSection.hidden = false; }
            if (lunchDetailsSection) { lunchDetailsSection.style.display = 'block'; lunchDetailsSection.hidden = false; }
            if (keuzePreviewWrap) { keuzePreviewWrap.style.display = 'block'; keuzePreviewWrap.hidden = false; }
            if (keuzeWrap) { keuzeWrap.style.display = 'flex'; keuzeWrap.hidden = false; }
            // Ensure the keuze buttons are scrolled into view for the operator
            try {
              // Allow layout to settle slightly when called from other handlers
              setTimeout(() => {
                try { if (keuzeWrap) keuzeWrap.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(_) {}
              }, 60);
            } catch(_) {}
          }
          return keuzeEten;
        } catch (e) {
          console.error('renderKeuzeButtonsIfNeeded failed', e);
          return [];
        }
      }

      if (lunchYes && lunchNo) {
        lunchYes.addEventListener('click', async () => {
          try {
            const memberId = container.dataset.memberId;
            if (!memberId) return;
            const scanned = await checkIfCurrentMemberIsScanned(memberId);
            if (scanned) {
              lunchYes.disabled = true; lunchNo.disabled = true;
              if (keuzeWrap) { const all = keuzeWrap.querySelectorAll('button'); all.forEach(b=>{ b.disabled=true; b.style.opacity='0.6'; }); }
              if (lunchScannedDisclaimer) lunchScannedDisclaimer.style.display = 'block';
              try { if (lockOverlay) { lockOverlay.style.display = 'flex'; lockOverlay.style.pointerEvents = 'auto'; } } catch(_) {}
              return;
            }
            lunchYes.classList.add('active','yes'); lunchNo.classList.remove('active','no');
            // persist the intent locally
            try { saveLocalChoice(memberId, 'ja', null); } catch(_) {}
            const keuze = await renderKeuzeButtonsIfNeeded(memberId, true);
            try { updateBadge('ja'); } catch(_) {}
            if (keuze && keuze.length > 0) {
              // Show details and keuze section so operator can pick an option
              try { if (detailsEl) detailsEl.open = true; } catch(_) {}
              // focus first keuze button for accessibility
              try { const first = keuzeWrap.querySelector('button'); if (first) first.focus({ preventScroll: true }); } catch(_) {}
            } else {
              // No keuze options: collapse and proceed (no save behaviour)
              try { console.log('lunch-ui: would mark ja (no save):', memberId, ['vast-menu']); } catch(e){ console.error('lunch-ui: action log failed', e); }
              // QR generation is handled centrally in index.html; no-op here.
              try { if (detailsEl) setTimeout(()=>{ try{ detailsEl.open = false; } catch(_){} }, 120); } catch(_) {}
            }
          } catch (e) { console.error('lunchYes handler failed', e); }
        });

        lunchNo.addEventListener('click', async () => {
          try {
            const memberId = container.dataset.memberId;
            if (!memberId) return;
            const scanned = await checkIfCurrentMemberIsScanned(memberId);
            if (scanned) {
              lunchYes.disabled = true; lunchNo.disabled = true; return;
            }
            lunchNo.classList.add('active','no'); lunchYes.classList.remove('active','yes');
            if (keuzeSection) { keuzeSection.style.display = 'none'; keuzeSection.hidden = true; }
            clearKeuzeButtons();
            // persist the 'nee' choice locally
            try { saveLocalChoice(memberId, 'nee', null); } catch(_) {}
            try { updateBadge('nee'); } catch(_) {}
            // Collapse the details so the lunch UI folds up
            try {
              const detailsEl = container.querySelector('details');
              if (detailsEl) {
                // small delay for UX so the active state is visible briefly
                setTimeout(() => { try { detailsEl.open = false; } catch(_) {} }, 120);
              }
            } catch(_) {}
            // Notify host pages that lunch choice flow completed (nee)
            try { document.dispatchEvent(new CustomEvent('lunch:completed', { detail: { memberId: String(memberId), deel: 'nee', keuze: null }, bubbles: true })); } catch(_) {}
          } catch (e) { console.error('lunchNo handler failed', e); }
        });
      }

      // Provide an API so the host page can bind a member id and pre-populate the UI
      container.setMember = async function(memberId) {
        try {
          if (!memberId) {
            delete container.dataset.memberId;
            // reset UI
            if (lunchYes) lunchYes.classList.remove('active','yes');
            if (lunchNo) lunchNo.classList.remove('active','no');
            clearKeuzeButtons();
            try { container.style.display = 'none'; } catch(_) {}
            return;
          }
          container.dataset.memberId = String(memberId);
          // Ensure widget is visible now a member is bound
          try { container.style.display = ''; } catch(_) {}
          // If there is a temporary local choice for this member, remove it first
          // so Firestore is treated as authoritative and local stale values don't override.
          try {
            const existingLocal = getLocalChoice(String(memberId));
            if (existingLocal) {
              try { removeLocalChoice(String(memberId)); } catch(_) {}
            }
          } catch(_) {}
          // load member document to prefill existing choices; prefer Firestore values when present
          try {
            const snap = await getDoc(doc(db, 'members', String(memberId)));
            const data = snap && snap.exists() ? snap.data() : {};
            // Read local cache (temporary) but prefer Firestore values if available
            const local = getLocalChoice(String(memberId));
            const fsDeel = data && typeof data.lunchDeelname === 'string' && data.lunchDeelname !== '' ? String(data.lunchDeelname).toLowerCase() : null;
            const fsKeuze = data && typeof data.lunchKeuze === 'string' && data.lunchKeuze !== '' ? String(data.lunchKeuze) : null;
            const deel = fsDeel !== null ? fsDeel : (local && local.deel ? String(local.deel).toLowerCase() : '');
            const keuze = fsKeuze !== null ? fsKeuze : (local && local.keuze ? String(local.keuze) : '');
            // set active states
            if (deel === 'ja') { if (lunchYes) lunchYes.classList.add('active','yes'); if (lunchNo) lunchNo.classList.remove('active','no'); }
            else if (deel === 'nee') { if (lunchNo) lunchNo.classList.add('active','no'); if (lunchYes) lunchYes.classList.remove('active','yes'); }
            else { if (lunchYes) lunchYes.classList.remove('active','yes'); if (lunchNo) lunchNo.classList.remove('active','no'); }
            // render keuze buttons so they exist, but keep the details and buttons
            // hidden until the operator explicitly presses 'Ja'. This prevents
            // showing the keuze list immediately on member selection.
              // Prepare the keuze buttons. Only reveal the details/buttons when the saved
              // selection is 'ja' AND there is no saved `keuze` yet. If a `keuze` is already
              // present (from Firestore or local), keep the section collapsed.
              const hasSavedKeuze = Boolean(keuze && String(keuze).trim().length > 0);
              const shouldShowKeuze = (deel === 'ja' && !hasSavedKeuze);
              const keuzeItems = await renderKeuzeButtonsIfNeeded(String(memberId), !!shouldShowKeuze);
              if (keuzeItems && keuzeItems.length > 0) {
                const btns = Array.from(keuzeWrap.querySelectorAll('button'));
                btns.forEach(b => { if (b.textContent === keuze) b.classList.add('active','yes'); else b.classList.remove('active'); });
                // If we have a local saved meal, ensure badge shows the exact meal
                try { if (local && local.keuze) updateBadge(local.deel || deel || null, local.keuze); } catch(_) {}
                if (hasSavedKeuze) {
                  // A saved meal exists: keep the details folded so the summary/badge shows the selection
                  try { if (detailsEl) detailsEl.open = false; } catch(_) {}
                  try { if (lunchDetailsSection) { lunchDetailsSection.style.display = 'none'; lunchDetailsSection.hidden = true; } } catch(_) {}
                  try { if (keuzeWrap) { keuzeWrap.style.display = 'none'; keuzeWrap.hidden = true; } } catch(_) {}
                  try { if (keuzeSection) { keuzeSection.style.display = 'none'; keuzeSection.hidden = true; } } catch(_) {}
                } else if (shouldShowKeuze) {
                  // No saved meal yet and Deel === 'ja': reveal and focus
                  try { if (detailsEl) detailsEl.open = true; } catch(_) {}
                  try { if (lunchDetailsSection) { lunchDetailsSection.style.display = 'block'; lunchDetailsSection.hidden = false; } } catch(_) {}
                  try { if (keuzeSection) { keuzeSection.style.display = 'block'; keuzeSection.hidden = false; } } catch(_) {}
                  try { if (keuzeWrap) { keuzeWrap.style.display = 'flex'; keuzeWrap.hidden = false; } } catch(_) {}
                    try { const first = keuzeWrap.querySelector('button'); if (first) first.focus({ preventScroll: true }); } catch(_) {}
                    // Scroll the keuze buttons into view so operator can see options
                    try {
                      setTimeout(() => { try { if (keuzeWrap) keuzeWrap.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(_) {} }, 60);
                    } catch(_) {}
                } else {
                  // Keep hidden: operator must press 'Ja' to reveal
                  try { if (lunchDetailsSection) { lunchDetailsSection.style.display = 'none'; lunchDetailsSection.hidden = true; } } catch(_) {}
                  try { if (keuzeWrap) { keuzeWrap.style.display = 'none'; keuzeWrap.hidden = true; } } catch(_) {}
                  try { if (keuzeSection) { keuzeSection.style.display = 'none'; keuzeSection.hidden = true; } } catch(_) {}
                }
              } else {
                // No keuze options available. If lunchDeelname has a value (ja/nee), keep the section collapsed.
                try {
                  if (deel === 'ja' || deel === 'nee') {
                    try { if (detailsEl) detailsEl.open = false; } catch(_) {}
                    try { if (lunchDetailsSection) { lunchDetailsSection.style.display = 'none'; lunchDetailsSection.hidden = true; } } catch(_) {}
                    try { if (keuzeWrap) { keuzeWrap.style.display = 'none'; keuzeWrap.hidden = true; } } catch(_) {}
                    try { if (keuzeSection) { keuzeSection.style.display = 'none'; keuzeSection.hidden = true; } } catch(_) {}
                    try { updateBadge(deel || null, keuze || null); } catch(_) {}
                  }
                } catch(_) {}
              }
            try { updateBadge(deel || null, keuze || null); } catch(_) {}
            // scanned status
            const scanned = await checkIfCurrentMemberIsScanned(String(memberId));
            if (scanned) {
                    if (lunchYes) { lunchYes.disabled = true; lunchYes.style.opacity = '0.6'; lunchYes.style.cursor = 'not-allowed'; }
                    if (lunchNo) { lunchNo.disabled = true; lunchNo.style.opacity = '0.6'; lunchNo.style.cursor = 'not-allowed'; }
                    if (keuzeWrap) { const all = keuzeWrap.querySelectorAll('button'); all.forEach(b=>{ b.disabled=true; b.style.opacity='0.6'; }); }
                    if (lunchScannedDisclaimer) lunchScannedDisclaimer.style.display = 'block';
                    try { if (lockOverlay) { lockOverlay.style.display = 'flex'; lockOverlay.style.pointerEvents = 'auto'; } } catch(_) {}
            } else {
              if (lunchYes) { lunchYes.disabled = false; lunchYes.style.opacity = ''; lunchYes.style.cursor = ''; }
              if (lunchNo) { lunchNo.disabled = false; lunchNo.style.opacity = ''; lunchNo.style.cursor = ''; }
              if (lunchScannedDisclaimer) lunchScannedDisclaimer.style.display = 'none';
                    try { if (lockOverlay) { lockOverlay.style.display = 'none'; lockOverlay.style.pointerEvents = 'none'; } } catch(_) {}
            }
            // If all relevant lunch values are already present (prefilled from Firestore/local),
            // notify host pages so they can react (e.g. show the jaarhanger/result section).
            try {
              const memberStr = String(memberId);
              // deel is 'ja'|'nee'|''; keuze is string or ''
              const finalDeel = (deel === 'ja' || deel === 'nee') ? deel : null;
              // keuzeItems was created above by renderKeuzeButtonsIfNeeded
              const hasKeuzeOptions = Array.isArray(keuzeItems) && keuzeItems.length > 0;
              const hasSavedKeuze = Boolean(keuze && String(keuze).trim().length > 0);
              let shouldDispatch = false;
              let dispatchKeuze = null;
              if (finalDeel === 'nee') {
                shouldDispatch = true;
                dispatchKeuze = null;
              } else if (finalDeel === 'ja') {
                if (!hasKeuzeOptions) {
                  // no choices to pick from → completed by virtue of Deel='ja'
                  shouldDispatch = true;
                  dispatchKeuze = null;
                } else if (hasSavedKeuze) {
                  // choices exist but a specific saved meal is present
                  shouldDispatch = true;
                  dispatchKeuze = String(keuze);
                }
              }
              if (shouldDispatch) {
                try { document.dispatchEvent(new CustomEvent('lunch:completed', { detail: { memberId: memberStr, deel: finalDeel, keuze: dispatchKeuze }, bubbles: true })); } catch(_) {}
              }
            } catch (_) {}
          } catch (e) {
            console.error('setMember failed to load member data', e);
          }
        } catch (e) { console.error('container.setMember failed', e); }
      };
    } catch (e) {
      console.error('lunch-ui: failed to attach handlers', e);
    }

    return container;
  } catch (e) {
    console.error('renderLunchChoice failed', e);
    return null;
  }
}

export default renderLunchChoice;
