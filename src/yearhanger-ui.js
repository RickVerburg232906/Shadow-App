// yearhanger-ui.js
// Renders the jaarhanger HTML fragment into a container element.
export function renderYearhanger(container = null) {
  try {
    if (!container) container = document.getElementById('yearhangerRow');
    if (!container) return null;
    const html = `
      <details open style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%); border-radius: 12px; padding: 20px; border: 1px solid rgba(59, 130, 246, 0.2);">
        <summary style="cursor: pointer; list-style: none; user-select: none; display: flex; align-items: center; gap: 12px;">
          <div style="flex: 1;">
            <h3 style="margin: 0; font-size: 20px;">Jaarhanger</h3>
            <p style="margin: 4px 0 0 0; color: var(--muted); font-size: 14px;">Kies of u dit jaar een jaarhanger wilt</p>
            <span id="jaarhangerSelectionBadge" style="display: none; padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 600; white-space: nowrap;"></span>
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
    return container;
  } catch (e) {
    console.error('renderYearhanger failed', e);
    return null;
  }
}

export default renderYearhanger;
