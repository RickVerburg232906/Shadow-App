// yearhanger-ui.js
// Renders the jaarhanger HTML fragment into a container element.
export function renderYearhanger(container = null) {
  try {
    if (!container) container = document.getElementById('yearhangerRow');
    if (!container) return null;
    const html = `
      <details open style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%); border-radius: 12px; padding: 20px; border: 1px solid rgba(59, 130, 246, 0.2);">
        <summary style="cursor: pointer; list-style: none; user-select: none; display: flex; align-items: center; gap: 12px;">
          <div style="flex: 1; display:flex; align-items:center; gap:12px; justify-content:space-between;">
            <div style="flex:1;">
              <h3 style="margin: 0; font-size: 20px;">Jaarhanger</h3>
              <p style="margin: 4px 0 0 0; color: var(--muted); font-size: 14px;">Kies of u dit jaar een jaarhanger wilt</p>
            </div>
            <div style="margin-left:12px; display:flex; align-items:center;">
              <span id="jaarhangerSelectionBadge" style="display: none; padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 600; white-space: nowrap;"></span>
            </div>
          </div>
          <span class="toggle-icon" style="font-size: 24px; transition: transform 0.3s ease;">▼</span>
        </summary>

        <div class="jaarhanger-content" style="margin-top: 16px;">
          <div class="seg-wrap">
            <div class="seg-toggle" id="yearhangerToggle" role="radiogroup" aria-label="Jaarhanger" style="width: 100%; display: flex; gap: 0; border-radius: 10px; overflow: hidden;">
              <button type="button" id="yearhangerYes" class="seg-btn" role="radio" aria-checked="false" style="flex:1; padding: 14px; font-size: 16px; font-weight: 600; border: none;">Ja</button>
              <button type="button" id="yearhangerNo" class="seg-btn" role="radio" aria-checked="false" style="flex:1; padding: 14px; font-size: 16px; font-weight: 600; border: none; border-left: 1px solid rgba(255,255,255,0.08);">Nee</button>
            </div>
          </div>

          <div id="jaarhangerInfo" style="display:none; margin: 16px 0 8px 0;">
            <details class="muted" style="margin-top:4px;">
              <summary>Wat is een jaarhanger?</summary>
              <div style="margin-top:8px;">
                Het aantal sterren geeft aan hoeveel landelijke ritten je dat jaar gereden hebt. De "moederpin" kan je als Shadow lid bestellen in de webshop, zodat je jouw jaarhangers mooi op je vest kwijt kunt. De jaarhangers zijn niet te koop en kan je alleen verdienen door mee te rijden met de landelijke ritten. Da's pas een collectors item!
              </div>
            </details>
          </div>
        </div>
      </details>
    `;
    container.innerHTML = html;
    // After injecting HTML, wire up interactive behavior and expose helpers
    try {
      // module-scoped state
      if (!renderYearhanger._state) renderYearhanger._state = {};
      const S = renderYearhanger._state;
      S.container = container;
      S.row = container;
      S.yes = container.querySelector('#yearhangerYes');
      S.no = container.querySelector('#yearhangerNo');
      S.details = container.querySelector('details');
      S.info = container.querySelector('#jaarhangerInfo');
      S.badge = container.querySelector('#jaarhangerSelectionBadge');
      S._val = null;

      function updateBadge() {
        try {
          const b = S.badge;
          if (!b) return;
          if (!S.row || S.row.style.display === 'none' || !S._val) {
            b.style.display = 'none';
            return;
          }
          if (S._val === 'Ja') {
            b.textContent = 'Ja'; b.style.display = 'block'; b.style.background = 'rgba(16, 185, 129, 0.2)'; b.style.color = '#10b981'; b.style.border = '1px solid rgba(16, 185, 129, 0.3)';
          } else if (S._val === 'Nee') {
            b.textContent = 'Nee'; b.style.display = 'block'; b.style.background = 'rgba(239, 68, 68, 0.2)'; b.style.color = '#ef4444'; b.style.border = '1px solid rgba(239, 68, 68, 0.3)';
          } else {
            b.style.display = 'none';
          }
        } catch (e) { console.error('yearhanger-ui.updateBadge failed', e); }
      }

      function collapseSection() {
        try {
          if (!S.details) S.details = S.row.querySelector('details');
          if (S.details) setTimeout(()=>{ try{ S.details.open = false; } catch(_){} }, 300);
        } catch(_){}
      }

      function renderUI(v) {
        try {
          S._val = (v === 'Ja' || v === true) ? 'Ja' : (v === 'Nee' || v === false) ? 'Nee' : null;
          if (S.row) S.row.style.display = S._val === null ? (S.row.dataset.visibleOnInit === 'true' ? '' : 'block') : 'block';
          if (S.info) S.info.style.display = 'block';
          if (S.yes && S.no) {
            S.yes.classList.toggle('active', S._val === 'Ja');
            S.no.classList.toggle('active', S._val === 'Nee');
            S.yes.classList.toggle('yes', S._val === 'Ja');
            S.no.classList.toggle('no', S._val === 'Nee');
            S.yes.setAttribute('aria-checked', String(S._val === 'Ja'));
            S.no.setAttribute('aria-checked', String(S._val === 'Nee'));
          }
          // Open details only when no explicit choice
          try { if (S.details) S.details.open = (S._val === null); } catch(_){}
          updateBadge();
        } catch (e) { console.error('yearhanger-ui.renderUI failed', e); }
      }

      // Wire click handlers to emit events so hosting code can act (save/generate QR)
      try {
        if (S.yes) {
          S.yes.addEventListener('click', () => {
            renderUI('Ja');
            collapseSection();
            try { document.dispatchEvent(new CustomEvent('yearhanger:changed', { detail: { value: 'Ja' }, bubbles: true })); } catch(_){}
          });
        }
        if (S.no) {
          S.no.addEventListener('click', () => {
            renderUI('Nee');
            collapseSection();
            try { document.dispatchEvent(new CustomEvent('yearhanger:changed', { detail: { value: 'Nee' }, bubbles: true })); } catch(_){}
          });
        }
      } catch(_) {}

      // expose helpers on the function object
      renderYearhanger.ensure = () => S;
      renderYearhanger.renderUI = renderUI;
      renderYearhanger.collapse = collapseSection;
      renderYearhanger.updateBadge = updateBadge;
      renderYearhanger.getValue = () => S._val;
    } catch (e) { console.error('yearhanger-ui: wiring failed', e); }
    return container;
  } catch (e) {
    console.error('renderYearhanger failed', e);
    return null;
  }
}

export default renderYearhanger;
