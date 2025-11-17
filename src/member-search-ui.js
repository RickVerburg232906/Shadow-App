// Generic, reusable member search UI initializer
// Config contract:
// {
//   nameInputId: string,
//   suggestionsListId: string,
//   errorId: string,
//   loadingId: string,
//   resultBoxId: string,
//   fields: { nameId: string, memberNoId: string, ridesCountId: string, regionId: string },
//   withQr?: boolean,
//   qrCanvasId?: string,
//   qrPrivacyTextId?: string,
//   enableQrFullscreen?: boolean
// }

import {
  queryByLastNamePrefix,
  showSuggestions,
  hideSuggestions,
  fullNameFrom,
  showError,
  hideError,
  showLoading,
  hideLoading,
  generateQrForEntry,
  openQrFullscreenFromCanvas,
} from './landelijke-signup.js';
import { getPlannedDates, plannedStarsWithHighlights, setSelectedDocFromEntry } from './member.js';
import { doc, onSnapshot, getDoc } from './firebase.js';
import { db } from './firebase.js';

export function initMemberSearchSection(config) {
  const {
    nameInputId,
    suggestionsListId,
    errorId,
    loadingId,
    resultBoxId,
    fields: { nameId, memberNoId, ridesCountId, regionId },
    withQr = false,
    qrCanvasId,
    qrPrivacyTextId,
    enableQrFullscreen = true,
    onSelected,
  } = config || {};

  const nameInput = document.getElementById(nameInputId);
  const resultBox = document.getElementById(resultBoxId);

  let selectedDoc = null;
  let unsubscribe = null;
  let _debounceHandle = null;

  function cleanup() {
    try { if (unsubscribe) unsubscribe(); } catch (_) {}
    unsubscribe = null;
  }

  function resetSelection() {
    selectedDoc = null;
    if (resultBox) resultBox.style.display = 'none';
    hideLoading(loadingId);
    hideError(errorId);
    cleanup();
  }

  async function handleFocus() {
    try { if (nameInput) nameInput.value = ''; } catch (_) {}
    resetSelection();
    hideSuggestions(suggestionsListId);
  }

  async function onInputChanged() {
    if (_debounceHandle) clearTimeout(_debounceHandle);
    _debounceHandle = setTimeout(async () => {
      try {
        resetSelection();
        const term = (nameInput && nameInput.value ? nameInput.value : '').trim();
        if (term.length < 2) {
          hideSuggestions(suggestionsListId);
          return;
        }

        showError('Zoeken...', true, errorId);

        const items = await queryByLastNamePrefix(term);

        if (!items || !items.length) {
          showError('Geen lid gevonden met deze achternaam', false, errorId);
          hideSuggestions(suggestionsListId);
          return;
        }

        hideError(errorId);
        showSuggestions(items, suggestionsListId, async (it, li) => {
          selectedDoc = it;
          try {
            if (nameInput) {
              nameInput.value = li.textContent || (fullNameFrom(it.data) + ` — ${it.id}`);
              const len = nameInput.value.length;
              nameInput.setSelectionRange?.(len, len);
            }
          } catch (_) {}
          // Verberg suggesties na kiezen
          try { hideSuggestions(suggestionsListId); } catch (_) {}
          console.debug('[member-search-ui] Selected item', it?.id);
          await renderSelected(it);
        });
      } catch (e) {
        hideSuggestions(suggestionsListId);
        showError('Fout bij zoeken. Controleer je verbinding.', false, errorId);
      }
    }, 250);
  }

  async function handleFind() {
    hideError(errorId);
    try {
      const term = (nameInput && nameInput.value ? nameInput.value : '').trim();
      if (!term) {
        hideSuggestions(suggestionsListId);
        return;
      }

      const items = await queryByLastNamePrefix(term);

      if (!items.length) {
        showError('Geen lid gevonden met deze achternaam', false, errorId);
        hideSuggestions(suggestionsListId);
        return;
      }

      showSuggestions(items, suggestionsListId, async (it, li) => {
        selectedDoc = it;
        try {
          if (nameInput) {
            nameInput.value = li.textContent || (fullNameFrom(it.data) + ` — ${it.id}`);
            const len = nameInput.value.length;
            nameInput.setSelectionRange?.(len, len);
          }
        } catch (_) {}
        // Verberg suggesties na kiezen
        try { hideSuggestions(suggestionsListId); } catch (_) {}
        console.debug('[member-search-ui] Selected item (enter)', it?.id);
        await renderSelected(it);
      });
    } catch (e) {
      showError('Fout bij zoeken. Controleer je verbinding.', false, errorId);
    }
  }

  async function renderSelected(entry) {
    showLoading(loadingId);
    hideError(errorId);

    try {
      const data = entry.data || {};

      // Fill base fields
      const nameEl = document.getElementById(nameId);
      const memberNoEl = document.getElementById(memberNoId);
      const ridesCountEl = document.getElementById(ridesCountId);
      const regionEl = document.getElementById(regionId);

      if (nameEl) nameEl.textContent = fullNameFrom(data);
      if (memberNoEl) memberNoEl.textContent = entry.id;
      if (regionEl) regionEl.textContent = (data['Regio Omschrijving'] || '—');

      // Toon alvast het resultaat-kader voordat we plannen laden, zodat de gebruiker direct feedback ziet
      if (!withQr) {
        if (resultBox) {
          resultBox.style.display = 'grid';
          console.debug('[member-search-ui] Showing resultBox immediately (no QR)');
        }
      } else {
        // Voor QR-variant: zorg dat layout alvast ruimte heeft
        if (resultBox) {
          resultBox.style.display = 'grid';
          resultBox.style.visibility = 'hidden';
          console.debug('[member-search-ui] Preparing resultBox for QR rendering');
        }
      }

      // Ritten/sterren asynchroon laden; fouten mogen UI niet blokkeren
      try {
        const planned = await getPlannedDates();
        const scanDatums = Array.isArray(data.ScanDatums) ? data.ScanDatums : [];

        if (!planned || planned.length === 0) {
          if (ridesCountEl) {
            ridesCountEl.innerHTML = '<span style="color: var(--muted); font-size: 14px;">Geen ritten gepland</span>';
            ridesCountEl.setAttribute('title', 'Er zijn nog geen landelijke ritten ingepland voor dit jaar');
          }
        } else {
          const { stars, starsHtml, tooltip } = plannedStarsWithHighlights(planned, scanDatums);
          if (ridesCountEl) {
            ridesCountEl.innerHTML = starsHtml || '—';
            ridesCountEl.setAttribute('title', stars ? tooltip : 'Geen ingeplande datums');
            ridesCountEl.style.letterSpacing = '3px';
            ridesCountEl.style.fontSize = '20px';
          }
        }
      } catch (_) {
          if (ridesCountEl) {
          ridesCountEl.innerHTML = '<span style="color: var(--muted); font-size: 14px;">Ritten laden mislukt</span>';
          ridesCountEl.setAttribute('title', 'Kon geplande datums niet laden');
        }
      }

      // Live updates of rides
      cleanup();
      unsubscribe = onSnapshot(doc(db, 'members', entry.id), (snap) => {
        const d = snap.exists() ? snap.data() : {};
        const scanDatumsLive = Array.isArray(d.ScanDatums) ? d.ScanDatums : [];
        getPlannedDates().then((plannedLatest) => {
          const el = document.getElementById(ridesCountId);
          if (!plannedLatest || plannedLatest.length === 0) {
            if (el) {
              el.innerHTML = '<span style="color: var(--muted); font-size: 14px;">Geen ritten gepland</span>';
            }
          } else {
            const { stars, starsHtml, tooltip } = plannedStarsWithHighlights(plannedLatest, scanDatumsLive);
            if (el) {
              el.innerHTML = starsHtml || '—';
              el.setAttribute('title', stars ? tooltip : 'Geen ingeplande datums');
            }
          }
        }).catch(() => {});
      });

      if (withQr) {
        try {
          if (!qrCanvasId) throw new Error('qrCanvasId ontbreekt');
          await generateQrForEntry(entry, qrCanvasId, resultBoxId);
          hideLoading(loadingId);

          // Show privacy text if provided
          if (qrPrivacyTextId) {
            const privacyEl = document.getElementById(qrPrivacyTextId);
            if (privacyEl) privacyEl.style.display = 'block';
          }

          // Fullscreen handler and cursor
          const canvas = document.getElementById(qrCanvasId);
          if (canvas) {
            canvas.style.cursor = enableQrFullscreen ? 'zoom-in' : 'default';
            canvas.setAttribute('title', enableQrFullscreen ? 'Klik om fullscreen te openen' : '');
            if (enableQrFullscreen) {
              canvas.addEventListener('click', () => openQrFullscreenFromCanvas(canvas), { passive: true });
            }
          }
        } catch (e) {
          console.error('QR creation failed', e);
          showError('QR-code maken mislukt', false, errorId);
          hideLoading(loadingId);
        }
      } else {
        // Resultaat zonder QR is al zichtbaar gezet; verzeker dit nogmaals en stop de loader
        hideLoading(loadingId);
        if (resultBox) resultBox.style.display = 'grid';
      }

      // Notify member module about the selection so module-level state (jaarhanger/lunch)
      // is updated consistently across different search UIs. Then notify caller.
      try {
        if (typeof setSelectedDocFromEntry === 'function') {
          try { await setSelectedDocFromEntry(entry); } catch (_) {}
        }
      } catch (_) {}
      try {
        if (typeof onSelected === 'function') {
          onSelected(entry, { resultBoxId, config });
        }
      } catch (_) {}
    } catch (e) {
      console.error('renderSelected failed', e);
      showError('Fout bij ophalen gegevens', false, errorId);
      hideLoading(loadingId);
    }
  }

  // Wire up events
  nameInput?.addEventListener('focus', handleFocus);
  nameInput?.addEventListener('input', onInputChanged);
  nameInput?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') hideSuggestions(suggestionsListId);
    if (ev.key === 'Enter') {
      ev.preventDefault();
      handleFind();
    }
  });

  // Expose teardown in case caller needs to clean up
  return {
    teardown: () => {
      try { if (_debounceHandle) clearTimeout(_debounceHandle); } catch (_) {}
      cleanup();
      nameInput?.removeEventListener('focus', handleFocus);
      nameInput?.removeEventListener('input', onInputChanged);
      // Not strictly necessary to remove keydown in SPA context, but keep symmetrical
    },
  };
}
