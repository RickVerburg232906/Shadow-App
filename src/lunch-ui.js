// lunch-ui.js
// Renders the lunch-choice HTML fragment into a container element.
export function renderLunchChoice(container = null) {
  try {
    if (!container) container = document.getElementById('lunchChoiceSection');
    if (!container) return null;
    const html = `
      <details open style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%); border-radius: 12px; padding: 20px; border: 1px solid rgba(59, 130, 246, 0.2);">
        <summary style="cursor: pointer; list-style: none; user-select: none; display: flex; align-items: center; gap: 12px;">
          <div style="flex: 1;">
            <h3 style="margin: 0; font-size: 20px;">Lunch deelname</h3>
            <p style="margin: 4px 0 0 0; color: var(--muted); font-size: 14px;">
              <span id="lunchSummaryText">Geef aan of u mee-eet tijdens de lunch</span>
            </p>
            <span id="lunchSelectionBadge" style="display: none; padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 600; white-space: nowrap;"></span>
          </div>
          <span class="toggle-icon" style="font-size: 24px; transition: transform 0.3s ease;">▼</span>
        </summary>
        
        <div class="lunch-content" style="margin-top: 16px;">
          <div id="lunchScannedDisclaimer" style="display: none; padding: 12px; margin-bottom: 16px; background: rgba(251, 191, 36, 0.15); border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 18px;">ℹ️</span>
              <div>
                <strong style="color: #fbbf24; font-size: 14px;">Let op:</strong>
                <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--muted); line-height: 1.5;">U bent al ingecheckt voor deze rit. Uw lunch keuze kan niet meer worden gewijzigd.</p>
              </div>
            </div>
          </div>
          
          <div id="lunchDetailsSection" style="display:none; margin-bottom:20px; padding-bottom: 20px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
            <div id="keuzeEtenSection" style="margin-bottom:0;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                <span style="font-size: 20px;">🍴</span>
                <strong style="font-size: 15px;">Kies uw voorkeur (selecteer 1 optie):</strong>
              </div>
              <div id="keuzeEtenButtons" style="display:flex; flex-wrap:wrap; gap:10px;"></div>
            </div>
          </div>
          
          <div style="margin-bottom:20px; background: rgba(255, 255, 255, 0.03); padding: 14px; border-radius: 8px; border-left: 4px solid #10b981;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
              <span style="font-size: 20px;">🥖</span>
              <strong style="font-size: 15px;">Vast menu voor iedereen:</strong>
            </div>
            <p id="vastEtenDisplay" class="muted" style="margin:0; font-size: 14px; line-height: 1.6;">Laden...</p>
          </div>
          
          <div class="seg-wrap">
            <div class="seg-toggle" id="lunchToggle" role="radiogroup" aria-label="Lunch keuze" style="width: 100%;">
              <button type="button" id="lunchYes" class="seg-btn" role="radio" aria-checked="false" style="flex: 1; padding: 14px; font-size: 16px; font-weight: 600;">✓ Ja, ik eet mee</button>
              <button type="button" id="lunchNo" class="seg-btn" role="radio" aria-checked="false" style="flex: 1; padding: 14px; font-size: 16px; font-weight: 600;">✕ Nee, bedankt</button>
            </div>
          </div>
          
          <div id="lunchDeadlineInfo" style="padding: 12px; margin-top: 16px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 18px;">💡</span>
              <div>
                <strong style="color: #3b82f6; font-size: 14px;">Belangrijk:</strong>
                <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--muted); line-height: 1.5;">Maak uw lunch keuze <strong>vóór het inchecken</strong>. Na het inchecken kan uw keuze niet meer worden gewijzigd.</p>
              </div>
            </div>
          </div>
        </div>
      </details>
    `;
    container.innerHTML = html;
    return container;
  } catch (e) {
    console.error('renderLunchChoice failed', e);
    return null;
  }
}

export default renderLunchChoice;
