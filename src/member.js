// member.js — geplande-sterren met highlight op basis van ScanDatums
import QRCode from "qrcode";
import { db, getDoc, doc, collection, query, orderBy, startAt, endAt, limit, getDocs, onSnapshot, serverTimestamp } from "./firebase.js";
import { withRetry, updateOrCreateDoc } from './firebase-helpers.js';

// Helper: check whether both lunch and jaarhanger selections are present
function isQrReady() {
  try {
    const lunchYesEl = document.getElementById('lunchYes');
    const lunchNoEl = document.getElementById('lunchNo');
    const lunchDeelname = (lunchYesEl && lunchYesEl.classList.contains('active')) ? 'ja'
                       : (lunchNoEl && lunchNoEl.classList.contains('active')) ? 'nee'
                       : null;
    if (!lunchDeelname) return false;
    if (lunchDeelname === 'ja') {
      const keuzeWrap = document.getElementById('keuzeEtenButtons');
      if (keuzeWrap) {
        const btns = keuzeWrap.querySelectorAll('button');
        if (btns.length > 0) {
          const active = keuzeWrap.querySelector('button.active');
          if (!active) return false;
        }
      }
    }
    const yYes = document.getElementById('yearhangerYes');
    const yNo = document.getElementById('yearhangerNo');
    const jaar = (yYes && yYes.classList.contains('active')) || (yNo && yNo.classList.contains('active'));
    if (!jaar) return false;
    return true;
  } catch (_) { return false; }
}

// Export helper so other modules (admin pages) can signal a selection
export async function setSelectedDocFromEntry(entry) {
  try {
    if (!entry || !entry.id) return;
    // Set module-local selectedDoc so other handlers (saveYearhanger etc.) work
    selectedDoc = entry;
    // Fetch freshest member document
    let memberData = entry.data || {};
    try {
      const snap = await getDoc(doc(db, 'members', String(entry.id)));
      if (snap && snap.exists()) memberData = snap.data() || memberData;
    } catch (_) {}

    // Populate lunch-related module state from the member document
    _lunchChoice = (memberData && typeof memberData.lunchDeelname === 'string') ? memberData.lunchDeelname : _lunchChoice;
    _selectedKeuzeEten = [];
    if (memberData && memberData.lunchKeuze) {
      _selectedKeuzeEten = [memberData.lunchKeuze];
    }

    // Decide whether the jaarhanger UI should be shown and render appropriately
    const isVastMenuOnly = _selectedKeuzeEten.length > 0 && _selectedKeuzeEten[0] === 'vast-menu';
    const shouldShowJaarhanger = _lunchChoice === "nee" || (_lunchChoice === "ja" && (_selectedKeuzeEten.length > 0 || isVastMenuOnly));
    if (shouldShowJaarhanger) {
      try {
        const snap2 = await getDoc(doc(db, 'members', String(entry.id)));
        const data2 = snap2 && snap2.exists() ? snap2.data() : memberData;
        const existingJaarhanger = data2?.Jaarhanger;
        if (existingJaarhanger === 'Ja' || existingJaarhanger === 'Nee') {
          _yearhangerVal = existingJaarhanger;
          renderYearhangerUI(existingJaarhanger);
          try { await generateQrForEntry(selectedDoc); } catch(_) {}
        } else {
          renderYearhangerUI(null);
        }
      } catch (e) {
        console.error('setSelectedDocFromEntry: failed to evaluate jaarhanger', e);
        try { renderYearhangerUI(null); } catch(_) {}
      }
    } else {
      // Hide jaarhanger if not applicable
      try { if (yearhangerRow) yearhangerRow.style.display = 'none'; } catch(_) {}
      try { const info = document.getElementById('jaarhangerInfo'); if (info) info.style.display = 'none'; } catch(_) {}
    }
  } catch (e) {
    console.error('setSelectedDocFromEntry failed', e);
  }
}

// ------- Planning (geplande datums) -------
export async function getPlannedDates() {
  try {
    // Simple in-memory cache to minimize repeated reads
    const now = Date.now();
    const TTL = 30 * 1000; // 30s
    if (getPlannedDates._cache && (now - getPlannedDates._cacheAt) < TTL) {
      return getPlannedDates._cache;
    }
    const ref = doc(db, "globals", "ridePlan");
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : {};
    const arr = Array.isArray(data.plannedDates) ? data.plannedDates : [];
    const filtered = arr.filter(Boolean);
    getPlannedDates._cache = filtered;
    getPlannedDates._cacheAt = Date.now();
    return filtered;
  } catch (e) {
    console.error("Kon plannedDates niet laden:", e);
    return [];
  }
}

// --- Lunch keuze (module-level cached) ---
export async function loadLunchOptions() {
  try {
    const now = Date.now();
    const TTL = 60 * 1000; // cache lunch options for 60s
    if (loadLunchOptions._cache && (now - (loadLunchOptions._cacheAt || 0)) < TTL) {
      return loadLunchOptions._cache;
    }
    const lunchRef = doc(db, 'globals', 'lunch');
    const snap = await getDoc(lunchRef);
    const res = snap.exists()
      ? { vastEten: Array.isArray(snap.data().vastEten) ? snap.data().vastEten : [], keuzeEten: Array.isArray(snap.data().keuzeEten) ? snap.data().keuzeEten : [] }
      : { vastEten: [], keuzeEten: [] };
    loadLunchOptions._cache = res;
    loadLunchOptions._cacheAt = Date.now();
    return res;
  } catch (e) {
    console.error('Fout bij laden lunch opties:', e);
    return { vastEten: [], keuzeEten: [] };
  }
}

/* Normaliseer allerlei datumvormen naar 'YYYY-MM-DD' */
function toYMD(value) {
  try {
    if (!value) return "";
    if (typeof value === "object" && value.seconds) {
      const d = new Date(value.seconds * 1000);
      return d.toISOString().slice(0,10);
    }
    if (typeof value === "string") {
      const m = value.match(/\d{4}-\d{2}-\d{2}/);
      if (m) return m[0];
    }
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0,10);
    return "";
  } catch { return ""; }
}

/* Bouw sterrenstring en tooltip met highlights per geplande datum */
export function plannedStarsWithHighlights(plannedDates, scanDates) {
  const planned = plannedDates.map(toYMD).filter(Boolean);
  const scans = new Set((Array.isArray(scanDates) ? scanDates : []).map(toYMD).filter(Boolean));
  const stars = planned.map(d => scans.has(d) ? "★" : "☆").join("");
  const starsHtml = planned.map(d => scans.has(d) ? '<span class="star filled">★</span>' : '<span class="star empty">☆</span>').join('');
  const tooltip = planned.map((d, i) => `${i+1}: ${d} — ${scans.has(d) ? "Geregistreerd" : "Niet geregistreerd"}`).join("\\n");
  return { stars, starsHtml, tooltip, planned };
}

/* Helper: geregistreerde ritten naar ★/☆ (behouden feature) */
let STAR_MAX = 5;
export async function loadStarMax() {
  try {
    const now = Date.now();
    const TTL = 5 * 60 * 1000; // 5 minutes
    if (loadStarMax._cacheAt && (now - loadStarMax._cacheAt) < TTL) {
      return STAR_MAX;
    }
    const ref = doc(db, "globals", "starConfig");
    const snap = await getDoc(ref);
    const max = snap.exists() && typeof snap.data().max === "number" ? snap.data().max : 5;
    STAR_MAX = Math.max(1, Math.floor(max));
    loadStarMax._cacheAt = Date.now();
    return STAR_MAX;
  } catch {
    STAR_MAX = 5;
    return STAR_MAX;
  }
}

// === QR Fullscreen overlay ===
function openQrFullscreenFromCanvas(qrCanvas) {
  try {
    const dataUrl = qrCanvas.toDataURL("image/png");
    const overlay = document.createElement("div");
    overlay.id = "qrFullscreenOverlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.95)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "9999";
    overlay.style.cursor = "zoom-out";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "QR-code fullscreen");

    const img = document.createElement("img");
    img.src = dataUrl;
    img.alt = "QR-code";
    img.style.width = "100vmin";
    img.style.height = "100vmin";
    img.style.imageRendering = "pixelated";

    const hint = document.createElement("div");
    hint.textContent = "Klik of druk op Esc om te sluiten";
    hint.style.position = "fixed";
    hint.style.bottom = "24px";
    hint.style.left = "50%";
    hint.style.transform = "translateX(-50%)";
    hint.style.color = "#e5e7eb";
    hint.style.fontSize = "14px";
    hint.style.opacity = "0.8";

    function close() {
      try { document.removeEventListener("keydown", onKey); } catch(_) {}
      overlay.remove();
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    overlay.addEventListener("click", close, { passive: true });
    document.addEventListener("keydown", onKey);

    overlay.appendChild(img);
    overlay.appendChild(hint);
    document.body.appendChild(overlay);
  } catch (e) {
    console.error("QR fullscreen overlay faalde:", e);
  }
}



export async function initMemberView() {
  try {
    // Update splash progress: start
    try { if (window?.appSplash) window.appSplash.setProgress(5, 'Initialiseren leden...'); } catch(_) {}
    await loadStarMax();
    try { if (window?.appSplash) window.appSplash.setProgress(30, 'Ster-config laden...'); } catch(_) {}
  } catch(e) {}

  const $ = (id) => document.getElementById(id);
  const nameInput   = $("nameInput");
  let _debounceHandle = null;
  const suggestList = $("suggestions");
  const resultBox   = $("result");
  const errBox      = $("error");
  const rName       = $("rName");
  const rMemberNo   = $("rMemberNo");
  const rRides      = $("rRidesCount");
  const qrCanvas    = $("qrCanvas");
  const rRegion    = $("rRegion");
  const loadingIndicator = $("loadingIndicator");

  // Lunch keuze UI elementen
  const lunchChoiceSection = $("lunchChoiceSection");
  const lunchToggle = $("lunchToggle");
  const lunchYes = $("lunchYes");
  const lunchNo = $("lunchNo");
  const lunchDetailsSection = $("lunchDetailsSection");
  const vastEtenDisplay = $("vastEtenDisplay");
  const keuzeEtenButtons = $("keuzeEtenButtons");
  const keuzeEtenSection = $("keuzeEtenSection");
  const lunchSelectionBadge = $("lunchSelectionBadge");
  const lunchSummaryText = $("lunchSummaryText");
  const lunchScannedDisclaimer = $("lunchScannedDisclaimer");
  const lunchDeadlineInfo = $("lunchDeadlineInfo");
  const jaarhangerSelectionBadge = $("jaarhangerSelectionBadge");
  let lunchDetailsElement = null; // Reference to the details element
  let _lunchChoice = null; // "ja" of "nee"
  let _selectedKeuzeEten = []; // array van geselecteerde keuze eten items
  let _isScannedForRide = false; // flag om bij te houden of lid al gescand is

// Helper functie voor foutmeldingen
function getErrorMessage(error) {
  if (!navigator.onLine) {
    return "Geen internetverbinding. Check je wifi of mobiele data.";
  }
  
  const errorCode = error?.code || '';
  const errorMessage = error?.message || '';
  
  // Firestore specifieke fouten
  if (errorCode === 'permission-denied' || errorMessage.includes('permission')) {
    return "Toegang geweigerd. Neem contact op met de beheerder.";
  }
  if (errorCode === 'unavailable' || errorMessage.includes('unavailable')) {
    return "Database tijdelijk niet bereikbaar. Probeer het over een paar seconden opnieuw.";
  }
  if (errorCode === 'not-found' || errorMessage.includes('not-found')) {
    return "Gegevens niet gevonden. Neem contact op met de inschrijfbalie.";
  }
  if (errorCode === 'deadline-exceeded' || errorMessage.includes('timeout')) {
    return "Verzoek duurt te lang. Check je internetverbinding en probeer opnieuw.";
  }
  if (errorCode === 'resource-exhausted') {
    return "Te veel verzoeken. Wacht even en probeer opnieuw.";
  }
  if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
    return "Netwerkfout. Check je internetverbinding.";
  }
  
  // Algemene fout
  return "Er ging iets mis. Probeer het opnieuw of ga naar de inschrijfbalie.";
}

function showError(message, isWarning = false) {
  if (!errBox) return;
  errBox.textContent = message;
  errBox.style.display = "block";
  errBox.style.color = isWarning ? "#fbbf24" : "#fca5a5";
}

function hideError() {
  if (errBox) errBox.style.display = "none";
}

// --- Lunch keuze functies ---

// Helpers om datums te vergelijken in lokale tijd (YYYY-MM-DD)
function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toYMDString(value) {
  try {
    if (typeof value === 'string' && /\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0,10);
    const d = new Date(value);
    if (!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return '';
  } catch { return ''; }
}

async function getNextPlannedRideYMD() {
  try {
    const planned = await getPlannedDates();
    const list = (Array.isArray(planned) ? planned : []).map(toYMDString).filter(Boolean).sort();
    const today = todayYMD();
    // Kies de eerste datum die vandaag of later is
    const next = list.find(d => d >= today);
    return next || '';
  } catch (_) { return ''; }
}

// Check of lid al is gescand voor de eerstvolgende rit
function isScannedForNextRide(scanDatums, nextRideYMD) {
  if (!nextRideYMD) return false;
  const scans = (Array.isArray(scanDatums) ? scanDatums : []).map(d => toYMDString(d)).filter(Boolean);
  return scans.includes(nextRideYMD);
}

// Check real-time of het huidige lid al is gescand (haalt data op uit Firestore)
async function checkIfCurrentMemberIsScanned() {
  try {
    if (!selectedDoc || !selectedDoc.id) return false;
    
    const nextRideYMD = await getNextPlannedRideYMD();
    if (!nextRideYMD) return false;
    
    // Haal de meest recente data op uit Firestore
    const docRef = doc(db, "members", String(selectedDoc.id));
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) return false;
    
    const data = docSnap.data();
    const memberScans = Array.isArray(data.ScanDatums) ? data.ScanDatums : [];
    
    return isScannedForNextRide(memberScans, nextRideYMD);
  } catch (e) {
    console.error("Fout bij checken scan status:", e);
    return false;
  }
}

function showLunchChoice() {
  if (lunchChoiceSection) {
    lunchChoiceSection.style.display = 'block';
    // Voeg een smooth fade-in animatie toe
    lunchChoiceSection.style.opacity = '0';
    lunchChoiceSection.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      lunchChoiceSection.style.transition = 'all 0.4s ease';
      lunchChoiceSection.style.opacity = '1';
      lunchChoiceSection.style.transform = 'translateY(0)';
    }, 10);
    
    // Laad en toon het vaste eten menu (altijd zichtbaar)
    loadLunchOptions().then(({ vastEten }) => {
      if (vastEtenDisplay) {
        vastEtenDisplay.textContent = vastEten.length > 0 
          ? vastEten.join(', ') 
          : 'Geen vast eten beschikbaar';
      }
    }).catch(err => {
      console.error('Fout bij laden vast eten:', err);
      if (vastEtenDisplay) {
        vastEtenDisplay.textContent = 'Fout bij laden menu';
      }
    });
    
    // Vind het details element
    if (!lunchDetailsElement && lunchChoiceSection) {
      lunchDetailsElement = lunchChoiceSection.querySelector('details');
    }
    
    // Toon/verberg disclaimer op basis van scan status
    if (lunchScannedDisclaimer) {
      lunchScannedDisclaimer.style.display = _isScannedForRide ? 'block' : 'none';
    }
    // lunchDeadlineInfo blijft altijd zichtbaar
    
    // Disable ja/nee buttons als lid al gescand is
    if (lunchYes && lunchNo) {
      lunchYes.disabled = _isScannedForRide;
      lunchNo.disabled = _isScannedForRide;
      if (_isScannedForRide) {
        lunchYes.style.opacity = '0.6';
        lunchYes.style.cursor = 'not-allowed';
        lunchNo.style.opacity = '0.6';
        lunchNo.style.cursor = 'not-allowed';
      } else {
        lunchYes.style.opacity = '';
        lunchYes.style.cursor = '';
        lunchNo.style.opacity = '';
        lunchNo.style.cursor = '';
      }
    }
    
    // Bepaal open/dicht op basis van huidige keuze-status
    // Open alleen als er nog géén keuze is gemaakt, of bij 'ja' zonder gekozen snack
    if (lunchDetailsElement) {
      const shouldOpen = (_lunchChoice === null) || (_lunchChoice === 'ja' && Array.isArray(_selectedKeuzeEten) && _selectedKeuzeEten.length === 0);
      lunchDetailsElement.open = shouldOpen;
    }
  }
}

function collapseLunchSection() {
  if (lunchDetailsElement) {
    setTimeout(() => {
      lunchDetailsElement.open = false;
    }, 300); // Kleine vertraging voor smooth UX
  }
}

function hideLunchChoice() {
  if (lunchChoiceSection) lunchChoiceSection.style.display = 'none';
  if (lunchDetailsSection) lunchDetailsSection.style.display = 'none';
  _lunchChoice = null;
  _selectedKeuzeEten = [];
  // Reset button states so nothing appears selected by default
  try {
    const yesBtn = document.getElementById('lunchYes');
    const noBtn = document.getElementById('lunchNo');
    if (yesBtn) {
      yesBtn.classList.remove('active', 'yes');
      yesBtn.setAttribute('aria-checked', 'false');
    }
    if (noBtn) {
      noBtn.classList.remove('active', 'no');
      noBtn.setAttribute('aria-checked', 'false');
    }
  } catch(_) {}
  updateLunchBadge();
}

function updateLunchBadge() {
  if (!lunchSelectionBadge) return;
  
  // Check of het "vast-menu" dummy waarde is (= geen keuze-eten beschikbaar)
  const isVastMenuOnly = _selectedKeuzeEten.length > 0 && _selectedKeuzeEten[0] === 'vast-menu';
  
  if (_lunchChoice === "ja" && _selectedKeuzeEten.length > 0 && !isVastMenuOnly) {
    lunchSelectionBadge.textContent = `✓ Ja · ${_selectedKeuzeEten[0]}`;
    lunchSelectionBadge.style.display = 'block';
    lunchSelectionBadge.style.background = 'rgba(16, 185, 129, 0.2)';
    lunchSelectionBadge.style.color = '#10b981';
    lunchSelectionBadge.style.border = '1px solid rgba(16, 185, 129, 0.3)';
  } else if (_lunchChoice === "ja" && isVastMenuOnly) {
    // Vast menu alleen: toon simpel "Ja"
    lunchSelectionBadge.textContent = '✓ Ja';
    lunchSelectionBadge.style.display = 'block';
    lunchSelectionBadge.style.background = 'rgba(16, 185, 129, 0.2)';
    lunchSelectionBadge.style.color = '#10b981';
    lunchSelectionBadge.style.border = '1px solid rgba(16, 185, 129, 0.3)';
  } else if (_lunchChoice === "nee") {
    lunchSelectionBadge.textContent = '✕ Nee';
    lunchSelectionBadge.style.display = 'block';
    lunchSelectionBadge.style.background = 'rgba(239, 68, 68, 0.2)';
    lunchSelectionBadge.style.color = '#ef4444';
    lunchSelectionBadge.style.border = '1px solid rgba(239, 68, 68, 0.3)';
  } else if (_lunchChoice === "ja" && _selectedKeuzeEten.length === 0) {
    lunchSelectionBadge.textContent = '✓ Ja · Maak een keuze';
    lunchSelectionBadge.style.display = 'block';
    lunchSelectionBadge.style.background = 'rgba(251, 191, 36, 0.2)';
    lunchSelectionBadge.style.color = '#fbbf24';
    lunchSelectionBadge.style.border = '1px solid rgba(251, 191, 36, 0.3)';
  } else {
    lunchSelectionBadge.style.display = 'none';
  }
}

async function renderLunchUI(choice) {
  _lunchChoice = choice;
  
  // Toon/verberg disclaimer op basis van scan status
  if (lunchScannedDisclaimer) {
    lunchScannedDisclaimer.style.display = _isScannedForRide ? 'block' : 'none';
  }
  
  if (lunchYes && lunchNo) {
    lunchYes.classList.toggle("active", choice === "ja");
    lunchNo.classList.toggle("active", choice === "nee");
    lunchYes.classList.toggle("yes", choice === "ja");
    lunchNo.classList.toggle("no", choice === "nee");
    lunchYes.setAttribute("aria-checked", String(choice === "ja"));
    lunchNo.setAttribute("aria-checked", String(choice === "nee"));
    
    // Disable knoppen als al gescand
    lunchYes.disabled = _isScannedForRide;
    lunchNo.disabled = _isScannedForRide;
    if (_isScannedForRide) {
      lunchYes.style.opacity = '0.6';
      lunchYes.style.cursor = 'not-allowed';
      lunchNo.style.opacity = '0.6';
      lunchNo.style.cursor = 'not-allowed';
    } else {
      lunchYes.style.opacity = '1';
      lunchYes.style.cursor = 'pointer';
      lunchNo.style.opacity = '1';
      lunchNo.style.cursor = 'pointer';
    }
    
    // Verwijder kleuren van niet-actieve buttons
    if (choice !== "ja") lunchYes.classList.remove("yes");
    if (choice !== "nee") lunchNo.classList.remove("no");
  }
  
  if (choice === "nee") {
    // Verberg lunch details
    if (lunchDetailsSection) lunchDetailsSection.style.display = 'none';
    // Toon jaarhanger - maar wacht tot saveLunchChoice klaar is om eventueel bestaande keuze te laden
    // Dit gebeurt nu via de click handler die await saveLunchChoice() aanroept
    updateLunchBadge();
    collapseLunchSection(); // Klap sectie in na "nee" keuze
    // Direct tonen van jaarhanger zodat operator meteen kan kiezen tijdens testen
    if (yearhangerRow) yearhangerRow.style.display = "block";
    const info = document.getElementById("jaarhangerInfo");
    if (info) info.style.display = "block";
    renderYearhangerUI(_yearhangerVal || null);
  } else if (choice === "ja") {
    // Laad en toon lunch details
    if (lunchDetailsSection) lunchDetailsSection.style.display = 'block';
    
    const { vastEten, keuzeEten } = await loadLunchOptions();
    
    // Toon vast eten als tekst
    if (vastEtenDisplay) {
      vastEtenDisplay.textContent = vastEten.length > 0 
        ? vastEten.join(', ') 
        : 'Geen vast eten beschikbaar';
    }
    
    // Als er GEEN keuze-eten is, markeer direct als "voltooid" en toon jaarhanger
    const hasKeuzeEten = keuzeEten && keuzeEten.length > 0;
    
    if (!hasKeuzeEten) {
      // Geen keuze-eten: verberg de keuze sectie, toon direct jaarhanger
      if (keuzeEtenButtons) keuzeEtenButtons.innerHTML = '';
      if (keuzeEtenSection) keuzeEtenSection.style.display = 'none';
      // Markeer als "geen keuze nodig"
      _selectedKeuzeEten = ['vast-menu']; // Dummy waarde om aan te geven dat er geen keuze nodig is
      updateLunchBadge();
      // Klap lunch sectie in omdat er niets meer te kiezen valt
      collapseLunchSection();
      // Toon jaarhanger direct
      if (yearhangerRow) yearhangerRow.style.display = "block";
      const info = document.getElementById("jaarhangerInfo");
      if (info) info.style.display = "block";
      renderYearhangerUI(_yearhangerVal || null);
    } else {
      // Wel keuze-eten: verberg jaarhanger totdat een keuze is gemaakt
      if (keuzeEtenSection) keuzeEtenSection.style.display = 'block';
      if (yearhangerRow) yearhangerRow.style.display = "none";
      const info = document.getElementById("jaarhangerInfo");
      if (info) info.style.display = "none";
      
      // Render keuze eten buttons (radio button gedrag - slechts 1 keuze)
      if (keuzeEtenButtons) {
        keuzeEtenButtons.innerHTML = '';
        keuzeEten.forEach(item => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'seg-btn';
          btn.textContent = item;
          btn.style.cssText = `
            flex: 1 1 auto;
            min-width: 140px;
            padding: 14px 20px;
            font-size: 15px;
            font-weight: 600;
            border-radius: 8px;
            transition: all 0.3s ease;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          `;
          
          // Check of dit item al eerder geselecteerd was en markeer het groen
          if (_selectedKeuzeEten.includes(item)) {
            btn.classList.add('active', 'yes');
          }
          
          // Disable button als al gescand
          btn.disabled = _isScannedForRide;
          if (_isScannedForRide) {
            btn.style.opacity = '0.6';
            btn.style.cursor = 'not-allowed';
          }
          
          btn.addEventListener('click', async () => {
            // Check real-time of lid al gescand is
            const isScanned = await checkIfCurrentMemberIsScanned();
            if (isScanned) {
              _isScannedForRide = true;
              // Toon disclaimer
              if (lunchScannedDisclaimer) lunchScannedDisclaimer.style.display = 'block';
              // Disable alle buttons
              if (lunchYes) {
                lunchYes.disabled = true;
                lunchYes.style.opacity = '0.6';
                lunchYes.style.cursor = 'not-allowed';
              }
              if (lunchNo) {
                lunchNo.disabled = true;
                lunchNo.style.opacity = '0.6';
                lunchNo.style.cursor = 'not-allowed';
              }
              // Disable alle keuze buttons
              const allBtns = keuzeEtenButtons.querySelectorAll('button');
              allBtns.forEach(b => {
                b.disabled = true;
                b.style.opacity = '0.6';
                b.style.cursor = 'not-allowed';
              });
              return;
            }
            
            // Verwijder alle active classes van alle buttons (radio gedrag)
            const allBtns = keuzeEtenButtons.querySelectorAll('button');
            allBtns.forEach(b => b.classList.remove('active', 'yes'));
            
            // Selecteer alleen deze button
            btn.classList.add('active', 'yes');
            _selectedKeuzeEten = [item]; // Alleen deze ene keuze opslaan
            
              updateLunchBadge();
              // Generate QR only when both lunch and jaarhanger are set
              try { if (selectedDoc && isQrReady()) await generateQrForEntry(selectedDoc); } catch(_) {}
            // Toon jaarhanger direct na keuze
            renderYearhangerUI(_yearhangerVal || null);
            // Klap sectie in na keuze eten selectie
            collapseLunchSection();
          });
          keuzeEtenButtons.appendChild(btn);
        });
      }
    }
    
    // Update badge
    updateLunchBadge();
  }
}

async function saveLunchChoice() {
  try {
    // If tests require scanning-only, set `window.DISABLE_AUTO_SAVE = true` in the console
    // to prevent UI-driven saves from writing to Firestore.
    if (typeof window !== 'undefined' && window.DISABLE_AUTO_SAVE) {
      console.info('Auto-save disabled; skipping saveLunchChoice');
      return;
    }
    if (!selectedDoc || !selectedDoc.id) return;
    
    // Check of het "vast-menu" dummy waarde is (geen echte keuze)
    const isVastMenuOnly = _selectedKeuzeEten.length > 0 && _selectedKeuzeEten[0] === 'vast-menu';
    
    // Sla op als string (eerste item) of null als geen keuze, behalve bij vast-menu dummy
    const keuzeEtenValue = (isVastMenuOnly || _selectedKeuzeEten.length === 0) ? null : _selectedKeuzeEten[0];
    
    // Koppel keuze aan de eerstvolgende ritdatum (vandaag of later)
    const rideYMD = await getNextPlannedRideYMD();
    
    // Use safe helper to prefer update and fall back to merge-create if missing
    await withRetry(() => updateOrCreateDoc(doc(db, "members", String(selectedDoc.id)), {
      lunchDeelname: _lunchChoice,
      lunchKeuze: keuzeEtenValue,
      lunchTimestamp: serverTimestamp(),
      lunchRideDateYMD: rideYMD || null
    }), { retries: 3 });
    
    // Na het opslaan, check of er al een jaarhanger keuze is
    // Als lunch keuze "nee" is OF als lunch "ja" is met een keuze (of vast-menu), en er is al een jaarhanger
    const shouldShowJaarhanger = _lunchChoice === "nee" || 
                                 (_lunchChoice === "ja" && (_selectedKeuzeEten.length > 0 || isVastMenuOnly));
    
    if (shouldShowJaarhanger) {
      // Haal de nieuwste data op om te zien of er een jaarhanger keuze is
      const memberDoc = await getDoc(doc(db, "members", String(selectedDoc.id)));
      if (memberDoc.exists()) {
        const data = memberDoc.data();
        const existingJaarhanger = data?.Jaarhanger;
        
        // Als er al een jaarhanger keuze is (Ja of Nee), update de state en genereer QR
        if (existingJaarhanger === "Ja" || existingJaarhanger === "Nee") {
          _yearhangerVal = existingJaarhanger;
          // Render de jaarhanger UI met de bestaande keuze
          renderYearhangerUI(existingJaarhanger);
          // Genereer QR code automatisch
          try {
            await generateQrForEntry(selectedDoc);
          } catch (e) {
            console.error("QR genereren mislukt:", e);
          }
        } else {
          // Geen bestaande jaarhanger keuze, toon de keuze UI
          renderYearhangerUI(null);
        }
      } else {
        // Document bestaat niet, toon de keuze UI
        renderYearhangerUI(null);
      }
    }
    
  } catch (e) {
    console.error("Lunch keuze opslaan mislukt", e);
  }
}

// Lunch keuze event listeners
if (lunchYes) {
  lunchYes.addEventListener("click", async function() {
    // Check real-time of lid al gescand is
    const isScanned = await checkIfCurrentMemberIsScanned();
    if (isScanned) {
      _isScannedForRide = true;
      // Toon disclaimer
      if (lunchScannedDisclaimer) lunchScannedDisclaimer.style.display = 'block';
      // Disable buttons
      lunchYes.disabled = true;
      lunchNo.disabled = true;
      lunchYes.style.opacity = '0.6';
      lunchYes.style.cursor = 'not-allowed';
      lunchNo.style.opacity = '0.6';
      lunchNo.style.cursor = 'not-allowed';
      return;
    }
    await renderLunchUI("ja");
    try { if (selectedDoc && isQrReady()) await generateQrForEntry(selectedDoc); } catch(_) {}
  });
}
if (lunchNo) {
  lunchNo.addEventListener("click", async function() {
    // Check real-time of lid al gescand is
    const isScanned = await checkIfCurrentMemberIsScanned();
    if (isScanned) {
      _isScannedForRide = true;
      // Toon disclaimer
      if (lunchScannedDisclaimer) lunchScannedDisclaimer.style.display = 'block';
      // Disable buttons
      lunchYes.disabled = true;
      lunchNo.disabled = true;
      lunchYes.style.opacity = '0.6';
      lunchYes.style.cursor = 'not-allowed';
      lunchNo.style.opacity = '0.6';
      lunchNo.style.cursor = 'not-allowed';
      return;
    }
    // Reset de keuze eten selectie wanneer "Nee" wordt gekozen
    _selectedKeuzeEten = [];
    await renderLunchUI("nee");
    try { if (selectedDoc && isQrReady()) await generateQrForEntry(selectedDoc); } catch(_) {}
  });
}

// --- Jaarhanger UI (segmented Ja/Nee) ---
let yearhangerRow = document.getElementById("yearhangerRow");
let yearhangerYes = document.getElementById("yearhangerYes");
let yearhangerNo  = document.getElementById("yearhangerNo");
let yearhangerDetailsElement = null; // Reference to the details element
let _yearhangerVal = null; // default: no selection until we read Firestore or user clicks

function ensureYearhangerUI() {
  yearhangerRow = document.getElementById("yearhangerRow");
  yearhangerYes = document.getElementById("yearhangerYes");
  yearhangerNo  = document.getElementById("yearhangerNo");
}
ensureYearhangerUI();

function collapseJaarhangerSection() {
  if (!yearhangerDetailsElement && yearhangerRow) {
    yearhangerDetailsElement = yearhangerRow.querySelector('details');
  }
  if (yearhangerDetailsElement) {
    setTimeout(() => {
      yearhangerDetailsElement.open = false;
    }, 300); // Kleine vertraging voor smooth UX
  }
}

function updateJaarhangerBadge() {
  if (!jaarhangerSelectionBadge) return;
  // Hide badge if jaarhanger block is not visible or no selection yet
  if (!yearhangerRow || yearhangerRow.style.display === 'none' || !_yearhangerVal) {
    jaarhangerSelectionBadge.style.display = 'none';
    return;
  }
  if (_yearhangerVal === 'Ja') {
    jaarhangerSelectionBadge.textContent = '✓ Ja';
    jaarhangerSelectionBadge.style.display = 'block';
    jaarhangerSelectionBadge.style.background = 'rgba(16, 185, 129, 0.2)';
    jaarhangerSelectionBadge.style.color = '#10b981';
    jaarhangerSelectionBadge.style.border = '1px solid rgba(16, 185, 129, 0.3)';
  } else if (_yearhangerVal === 'Nee') {
    jaarhangerSelectionBadge.textContent = '✕ Nee';
    jaarhangerSelectionBadge.style.display = 'block';
    jaarhangerSelectionBadge.style.background = 'rgba(239, 68, 68, 0.2)';
    jaarhangerSelectionBadge.style.color = '#ef4444';
    jaarhangerSelectionBadge.style.border = '1px solid rgba(239, 68, 68, 0.3)';
  } else {
    jaarhangerSelectionBadge.style.display = 'none';
  }
}

function renderYearhangerUI(val) {
  ensureYearhangerUI();
  
  // Controleer eerst of lunch keuze is gemaakt
  // Als lunch keuze nog niet gemaakt is, toon jaarhanger niet
  if (_lunchChoice === null) {
    if (yearhangerRow) yearhangerRow.style.display = "none";
    const info = document.getElementById("jaarhangerInfo");
    if (info) info.style.display = "none";
    if (jaarhangerSelectionBadge) jaarhangerSelectionBadge.style.display = 'none';
    return;
  }
  
  // Check of het "vast-menu" dummy waarde is (geen echte keuze nodig)
  const isVastMenuOnly = _selectedKeuzeEten.length > 0 && _selectedKeuzeEten[0] === 'vast-menu';
  
  // Als lunch keuze "ja" is maar nog geen keuze eten geselecteerd (en niet vast-menu), toon jaarhanger niet
  if (_lunchChoice === "ja" && _selectedKeuzeEten.length === 0 && !isVastMenuOnly) {
    if (yearhangerRow) yearhangerRow.style.display = "none";
    const info = document.getElementById("jaarhangerInfo");
    if (info) info.style.display = "none";
    if (jaarhangerSelectionBadge) jaarhangerSelectionBadge.style.display = 'none';
    return;
  }
  
  const v = (val==="Ja"||val===true)?"Ja":(val==="Nee"||val===false)?"Nee":null; // default Ja
  _yearhangerVal = v;
  if (yearhangerRow) yearhangerRow.style.display = "block";
  
  // Als er al een keuze is opgeslagen (Ja of Nee), klap de sectie in
  if (!yearhangerDetailsElement && yearhangerRow) {
    yearhangerDetailsElement = yearhangerRow.querySelector('details');
  }
  // Open de jaarhanger details zodat operator direct de info en knoppen ziet
  if (!yearhangerDetailsElement && yearhangerRow) {
    yearhangerDetailsElement = yearhangerRow.querySelector('details');
  }
  try {
    if (yearhangerDetailsElement) {
      // Open details only when there is no saved jaarhanger choice (v === null).
      // If a choice exists (Ja/Nee) keep the section collapsed.
      try {
        yearhangerDetailsElement.open = (v === null);
      } catch (_) {
        // ignore
      }
    }
  } catch (_) {}
  
  // Toon uitleg pas als jaarhangerRow zichtbaar is
  const info = document.getElementById("jaarhangerInfo");
  if (info) info.style.display = "block";
  if (yearhangerYes && yearhangerNo) {
    yearhangerYes.classList.toggle("active", v === "Ja");
    yearhangerNo.classList.toggle("active",  v === "Nee");
    yearhangerYes.classList.toggle("yes", v === "Ja");
    yearhangerNo.classList.toggle("no", v === "Nee");
    yearhangerYes.setAttribute("aria-checked", String(v === "Ja"));
    yearhangerNo.setAttribute("aria-checked",  String(v === "Nee"));
    // Verwijder kleur als niet actief
    if (v !== "Ja") yearhangerYes.classList.remove("yes");
    if (v !== "Nee") yearhangerNo.classList.remove("no");
  }
  updateJaarhangerBadge();
  // Zorg dat de operator meteen de result sectie (en daarmee de "Vandaag" knop) ziet
  try {
    if (typeof window !== 'undefined' && typeof window.ensureResultVisibleAndScroll === 'function') {
      window.ensureResultVisibleAndScroll();
    }
  } catch (_) {}
}
async function saveYearhanger(val) {
  try {
    // Allow tests to disable automatic jaarhanger saves by setting
    // `window.DISABLE_AUTO_SAVE = true` in the browser console.
    if (typeof window !== 'undefined' && window.DISABLE_AUTO_SAVE) {
      console.info('Auto-save disabled; skipping saveYearhanger');
      return;
    }
    if (!selectedDoc || !selectedDoc.id) return;
    const v = (val==="Ja"||val===true)?"Ja":(val==="Nee"||val===false)?"Nee":null;
    _yearhangerVal = v;
    
    // Check internet connection
    if (!navigator.onLine) {
      const errBox = document.getElementById("error");
      if (errBox) {
        errBox.textContent = "Geen internetverbinding. Check je wifi of mobiele data.";
        errBox.style.display = "block";
        errBox.style.color = "#fca5a5";
      }
      return;
    }
    
    // Show loading during save
    const loadingIndicator = document.getElementById("loadingIndicator");
    if (loadingIndicator) loadingIndicator.style.display = "flex";
    
  // Save jaarhanger using safe update to avoid unnecessary merges
  await withRetry(() => updateOrCreateDoc(doc(db, "members", String(selectedDoc.id)), { Jaarhanger: v }), { retries: 3 });
  updateJaarhangerBadge();
    // After saving the Jaarhanger choice, generate QR only if lunch + jaarhanger are present
    try { if (selectedDoc && isQrReady()) await generateQrForEntry(selectedDoc); } catch(_) {}
    
    // Hide loading after save completes
    if (loadingIndicator) loadingIndicator.style.display = "none";
  } catch (e) {
    console.error("Jaarhanger opslaan mislukt", e);
    const loadingIndicator = document.getElementById("loadingIndicator");
    if (loadingIndicator) loadingIndicator.style.display = "none";
    
    // Show specific error message
    const errBox = document.getElementById("error");
    if (errBox) {
      const errorMessage = getErrorMessage(e);
      errBox.textContent = `Opslaan mislukt: ${errorMessage}`;
      errBox.style.display = "block";
      errBox.style.color = "#fca5a5";
    }
  }
}

// Voeg click event listeners toe aan de knoppen
if (yearhangerYes) {
  yearhangerYes.addEventListener("click", function() {
    renderYearhangerUI("Ja");
    // Set the in-memory yearhanger value so generateQrForEntry includes it
    _yearhangerVal = "Ja";
    // Auto-save removed for testing — generate QR with current UI values instead
    try { if (selectedDoc && isQrReady()) generateQrForEntry(selectedDoc); } catch(_) {}
    // Klap sectie in na selectie
    collapseJaarhangerSection();
  });
}
if (yearhangerNo) {
  yearhangerNo.addEventListener("click", function() {
    renderYearhangerUI("Nee");
    // Set the in-memory yearhanger value so generateQrForEntry includes it
    _yearhangerVal = "Nee";
    // Auto-save removed for testing — generate QR with current UI values instead
    try { if (selectedDoc && isQrReady()) generateQrForEntry(selectedDoc); } catch(_) {}
    // Klap sectie in na selectie
    collapseJaarhangerSection();
  });
}



  let selectedDoc = null;
  let unsubscribe = null;
    if (yearhangerRow) yearhangerRow.style.display = "none";

  function fullNameFrom(docData) {
    const tussen = (docData["Tussen voegsel"] || "").trim();
    const parts = [
      docData["Voor naam"] || "",
      docData["Voor letters"] ? `(${docData["Voor letters"]})` : "",
      tussen ? tussen : "",
      docData["Naam"] || ""
    ].filter(Boolean);
    return parts.join(" ").replace(/\\s+/g, " ").trim();
  }

  function hideSuggestions() {
    if (!suggestList) return;
    suggestList.innerHTML = "";
    suggestList.style.display = "none";
  }
  function showSuggestions(items) {
    if (!suggestList) return;
    suggestList.innerHTML = "";
    
    if (!items || items.length === 0) {
      // Show empty state in suggestions
      const emptyLi = document.createElement("li");
      emptyLi.style.textAlign = "center";
      emptyLi.style.padding = "24px 12px";
      emptyLi.style.color = "var(--muted)";
      emptyLi.innerHTML = `
        <div style="font-size: 32px; margin-bottom: 8px; opacity: 0.3;">🔍</div>
        <div style="font-weight: 600; margin-bottom: 4px;">Geen leden gevonden</div>
        <div style="font-size: 13px;">Probeer een andere zoekterm</div>
      `;
      suggestList.appendChild(emptyLi);
      suggestList.style.display = "block";
      return;
    }
    
    for (const it of items) {
      const li = document.createElement("li");
      li.textContent = fullNameFrom(it.data) + ` — ${it.id}`;
      li.addEventListener("click", async () => {
        selectedDoc = it;
        // Toon de geselecteerde naam in het invoerveld zodat duidelijk is wie is gekozen
        try {
          if (nameInput) {
            nameInput.value = li.textContent || (fullNameFrom(it.data) + ` — ${it.id}`);
            // Plaats de cursor aan het eind (visuele bevestiging, geen nieuw input event)
            const len = nameInput.value.length;
            nameInput.setSelectionRange?.(len, len);
          }
        } catch(_) {}
        await renderSelected(it);
        hideSuggestions();
      });
      suggestList.appendChild(li);
    }
    suggestList.style.display = items.length ? "block" : "none";
  }

  async function queryByLastNamePrefix(prefix) {
    if (!prefix) return [];
    const maxResults = 8;
    try {
      // Check internet connection first
      if (!navigator.onLine) {
        throw new Error('No internet connection');
      }
      
      // Query both last name (Naam) and first name (Voor naam)
      const qName = query(collection(db, "members"), orderBy("Naam"), startAt(prefix), endAt(prefix + "\uf8ff"), limit(maxResults));
      const qVoor = query(collection(db, "members"), orderBy("Voor naam"), startAt(prefix), endAt(prefix + "\uf8ff"), limit(maxResults));
      const [snapName, snapVoor] = await Promise.all([getDocs(qName), getDocs(qVoor)]);
      const map = new Map();
      snapName.forEach(d => { if (!map.has(d.id)) map.set(d.id, { id: d.id, data: d.data() }); });
      snapVoor.forEach(d => { if (!map.has(d.id)) map.set(d.id, { id: d.id, data: d.data() }); });
      const res = Array.from(map.values()).slice(0, maxResults);
      return res;
    } catch (e) {
      console.error('queryByLastNamePrefix failed', e);
      throw e; // Re-throw to handle in caller
    }
  }

  function hideResultBox() {
    if (resultBox) resultBox.style.display = "none";
    const privacyEl = document.getElementById("qrPrivacy");
    if (privacyEl) privacyEl.style.display = "none";
  }
  
  function showLoading() {
    if (loadingIndicator) loadingIndicator.style.display = "flex";
    hideResultBox();
  }
  
  function hideLoading() {
    if (loadingIndicator) loadingIndicator.style.display = "none";
  }
  
  function resetSelection() {
    selectedDoc = null;
    hideResultBox();
    hideLoading();
    hideError();
    hideLunchChoice();
    try { if (unsubscribe) unsubscribe(); } catch(_) {}
    unsubscribe = null;
    if (yearhangerRow) yearhangerRow.style.display = 'none';
  if (jaarhangerSelectionBadge) jaarhangerSelectionBadge.style.display = 'none';
    // Ensure jaarhanger in-memory state and UI do not carry over between selections
    try {
      _yearhangerVal = null;
      if (yearhangerYes) {
        yearhangerYes.classList.remove('active', 'yes');
        yearhangerYes.setAttribute('aria-checked', 'false');
        yearhangerYes.disabled = false;
        yearhangerYes.style.opacity = '';
        yearhangerYes.style.cursor = '';
      }
      if (yearhangerNo) {
        yearhangerNo.classList.remove('active', 'no');
        yearhangerNo.setAttribute('aria-checked', 'false');
        yearhangerNo.disabled = false;
        yearhangerNo.style.opacity = '';
        yearhangerNo.style.cursor = '';
      }
      jaarhangerDetailsElement = null;
    } catch(_) {}
    // Verberg uitleg als jaarhangerRow verborgen wordt
    const info = document.getElementById("jaarhangerInfo");
    if (info) info.style.display = "none";
    if (rRides) {
      rRides.textContent = "—";
      rRides.removeAttribute("title");
      rRides.removeAttribute("aria-label");
      rRides.style.letterSpacing = "";
      rRides.style.fontSize = "";
    }
    if (rRegion) rRegion.textContent = "—";
  }

  async function handleFocus() {
    // Leeg het invoerveld zodra het focus krijgt
    try { if (nameInput) nameInput.value = ""; } catch(_) {}
    // Verberg huidige selectie en suggesties
    resetSelection();
    hideSuggestions();
  }
  async function onInputChanged() {
    if (_debounceHandle) clearTimeout(_debounceHandle);
    _debounceHandle = setTimeout(async () => {
      try {
        resetSelection();
        const term = (nameInput && nameInput.value ? nameInput.value : "").trim();
        if (term.length < 2) { hideSuggestions(); return; }
        
        // Show subtle loading for search
        showError("Zoeken...", true);
        
        const items = await queryByLastNamePrefix(term);
        
        if (!items || !items.length) {
          showError("Geen lid met uw achternaam gevonden — ga naar de inschrijfbalie voor meer informatie.");
          hideSuggestions();
          return;
        }
        
        hideError();
        showSuggestions(items);
      } catch (e) {
        hideSuggestions();
        showError(getErrorMessage(e));
      }
    }, 250);
  }
  async function handleFind() {
    hideError();
    try {
      const term = (nameInput && nameInput.value ? nameInput.value : "").trim();
      if (!term) { hideSuggestions(); return; }
      
      const items = await queryByLastNamePrefix(term);
      
      if (!items.length) {
        showError("Geen lid met uw achternaam gevonden — ga naar de inschrijfbalie voor meer informatie.");
        hideSuggestions(); 
        return;
      }
      showSuggestions(items);
    } catch (e) {
      showError(getErrorMessage(e));
    }
  }

  // Functie om oude lunch keuzes te verwijderen (ouder dan 1 dag)
  async function checkAndCleanupOldLunchChoice(memberId, memberData) {
    try {
      // Als er geen lunchkeuze is, niets te doen
      if (!memberData || (!memberData.lunchDeelname && !memberData.lunchKeuze)) return false;

      const rideYMD = typeof memberData.lunchRideDateYMD === 'string' ? memberData.lunchRideDateYMD.slice(0,10) : '';
      if (!rideYMD) {
        // Als er geen gekoppelde ritdatum is, wijzig niets (we verwijderen niets op tijd alleen).
        return false;
      }

      const today = todayYMD();
      // Verwijder keuze wanneer de dag NA de rit is aangebroken (today > rideYMD)
      if (today > rideYMD) {
        await withRetry(() => updateOrCreateDoc(doc(db, "members", String(memberId)), {
          lunchDeelname: null,
          lunchKeuze: null,
          lunchTimestamp: null,
          lunchRideDateYMD: null
        }), { retries: 2 });
        console.log(`Lunch keuze gewist voor lid ${memberId} — rit ${rideYMD} voorbij (${today}).`);
        return true;
      }
      return false;
    } catch (e) {
      console.error('Fout bij cleanup lunch data (op basis van ritdatum):', e);
      return false;
    }
  }

  async function renderSelected(entry) {
    showLoading();
    hideError();
    
    try {
      // Zorg dat we werken met de meest recente versie van het leden-document.
      // Haal eerst vers document op in plaats van te vertrouwen op de (mogelijk stale) entry.data
      let data = entry.data || {};
      try {
        const docSnapInit = await getDoc(doc(db, "members", entry.id));
        if (docSnapInit.exists()) {
          data = docSnapInit.data();
          entry.data = data;
        }
      } catch (e) {
        console.error('Fout bij ophalen van vers member doc (fallback naar entry.data):', e);
      }

      // Check of lunch keuze ouder is dan 1 dag en verwijder indien nodig
      // Work on the fresh `data` we just fetched so cleanup acts on up-to-date state
      const cleaned = await checkAndCleanupOldLunchChoice(entry.id, data);
      if (cleaned) {
        try {
          const freshSnap = await getDoc(doc(db, "members", entry.id));
          if (freshSnap.exists()) {
            // Gebruik de verse data voor verdere logica zodat UI geen verouderde waarden toont
            data = freshSnap.data();
            // Zorg er ook voor dat 'entry.data' overeenkomt met de nieuwste state
            entry.data = data;
          } else {
            data = {};
            entry.data = data;
          }
        } catch (e) {
          console.error('Fout bij herladen member na cleanup:', e);
        }
      }
      
      // Check of dit lid al is gescand voor de eerstvolgende rit
      const nextRideYMD = await getNextPlannedRideYMD();
      const memberScans = Array.isArray(data.ScanDatums) ? data.ScanDatums : [];
      _isScannedForRide = isScannedForNextRide(memberScans, nextRideYMD);
      
      if (rRegion) rRegion.textContent = (data["Regio Omschrijving"] || "—");
      if (rName) rName.textContent = fullNameFrom(data);
      if (rMemberNo) rMemberNo.textContent = entry.id;
      const _jh = (entry?.data?.Jaarhanger === "Nee") ? "Nee" : (entry?.data?.Jaarhanger === "Ja" ? "Ja" : "");
      
      // Laad bestaande lunch keuze indien beschikbaar
      const savedLunchChoice = data.lunchDeelname || null;
      // Ondersteun zowel oude array als nieuwe string format
      const savedLunchKeuze = data.lunchKeuze;
      
      // Check eerst of er überhaupt keuze-eten beschikbaar is
      const { keuzeEten } = await loadLunchOptions();
      const hasKeuzeEten = keuzeEten && keuzeEten.length > 0;
      
      if (typeof savedLunchKeuze === 'string' && savedLunchKeuze) {
        _selectedKeuzeEten = [savedLunchKeuze];
      } else if (Array.isArray(savedLunchKeuze) && savedLunchKeuze.length > 0) {
        _selectedKeuzeEten = [savedLunchKeuze[0]]; // Neem alleen eerste item
      } else if (savedLunchChoice === 'ja' && !hasKeuzeEten) {
        // Als lunch "ja" is maar geen keuze-eten beschikbaar, gebruik dummy waarde
        _selectedKeuzeEten = ['vast-menu'];
      } else {
        _selectedKeuzeEten = [];
      }
      // Toon lunch keuze sectie ná het bepalen van de huidige status, zodat open/dicht correct is
      _lunchChoice = savedLunchChoice || null;
      showLunchChoice();
      
      if (savedLunchChoice) {
        // Render lunch UI - buttons worden automatisch correct gemarkeerd via renderLunchUI
        await renderLunchUI(savedLunchChoice);
        
        // Update de badge met de opgeslagen keuze
        updateLunchBadge();
        
        // Check of jaarhanger getoond moet worden
        const isVastMenuOnly = _selectedKeuzeEten.length > 0 && _selectedKeuzeEten[0] === 'vast-menu';
        const shouldShowJaarhanger = savedLunchChoice === "nee" || 
                                     (savedLunchChoice === "ja" && (_selectedKeuzeEten.length > 0 || isVastMenuOnly));
        
        // Als er al een keuze is gemaakt, toon de jaarhanger
        if (shouldShowJaarhanger) {
          renderYearhangerUI(_jh || null);
          
          // Als er al een jaarhanger keuze is opgeslagen, genereer meteen de QR code
          if (_jh) {
            try {
              await generateQrForEntry(entry);
            } catch (e) {
              console.error("QR genereren mislukt:", e);
            }
          }
        }
      } else {
        // Geen lunch keuze gemaakt: verberg jaarhanger totdat keuze is gemaakt
        if (yearhangerRow) yearhangerRow.style.display = "none";
        const info = document.getElementById("jaarhangerInfo");
        if (info) info.style.display = "none";
      }
      
      // If Jaarhanger is not set, require user to choose before generating QR. Do not auto-set a default.
      // If Jaarhanger already set in Firestore, generate QR immediately.

      // ⭐ Vergelijk ScanDatums met globale plannedDates en licht sterren op per index
      const planned = await getPlannedDates();
      const scanDatums = Array.isArray(data.ScanDatums) ? data.ScanDatums : [];
      
      // Check if there are any planned dates
      if (!planned || planned.length === 0) {
        if (rRides) {
          rRides.innerHTML = '<span style="color: var(--muted); font-size: 14px;">Geen ritten gepland</span>';
          rRides.setAttribute("title", "Er zijn nog geen landelijke ritten ingepland voor dit jaar");
          rRides.removeAttribute("aria-label");
          rRides.style.letterSpacing = "";
          rRides.style.fontSize = "";
        }
      } else {
        const { stars, starsHtml, tooltip, planned: plannedNorm } = plannedStarsWithHighlights(planned, scanDatums);
        if (rRides) {
          rRides.innerHTML = starsHtml || "—";
          rRides.setAttribute("title", stars ? tooltip : "Geen ingeplande datums");
          rRides.setAttribute("aria-label", stars ? `Sterren per datum (gepland: ${plannedNorm.length})` : "Geen ingeplande datums");
          rRides.style.letterSpacing = "3px";
          rRides.style.fontSize = "20px";
        }
      }

      // Live ridesCount (feature behouden — elders gebruiken indien gewenst)
      try { if (unsubscribe) unsubscribe(); } catch(_) {}
      // Debounced snapshot handler to avoid rapid UI churn when many updates arrive
      const processMemberSnapshot = async (snap) => {
        try {
          const d = snap.exists() ? snap.data() : {};
          const scanDatumsLive = Array.isArray(d.ScanDatums) ? d.ScanDatums : [];
          try {
            const planned = await getPlannedDates();
            if (!planned || planned.length === 0) {
              if (rRides) {
                rRides.innerHTML = '<span style="color: var(--muted); font-size: 14px;">Geen ritten gepland</span>';
                rRides.setAttribute("title", "Er zijn nog geen landelijke ritten ingepland voor dit jaar");
                rRides.removeAttribute("aria-label");
                rRides.style.letterSpacing = "";
                rRides.style.fontSize = "";
              }
            } else {
              const { stars, starsHtml, tooltip, planned: plannedNorm } = plannedStarsWithHighlights(planned, scanDatumsLive);
              if (rRides) {
                rRides.innerHTML = starsHtml || "—";
                rRides.setAttribute("title", stars ? tooltip : "Geen ingeplande datums");
                rRides.setAttribute("aria-label", stars ? `Sterren per datum (gepland: ${plannedNorm.length})` : "Geen ingeplande datums");
                rRides.style.letterSpacing = "3px";
                rRides.style.fontSize = "20px";
              }
            }
          } catch(_) {}
          const jh = (d && typeof d.Jaarhanger === "string") ? d.Jaarhanger : "";
          renderYearhangerUI(jh || _yearhangerVal || null);
        } catch (e) {
          // swallow errors from rapid updates
          console.debug('member snapshot handler error', e);
        }
      };

      // simple debounce wrapper (scoped to this selection)
      const debouncedProcess = (function(){
        let t = null;
        const wait = 150; // ms
        return (snap) => {
          if (t) clearTimeout(t);
          t = setTimeout(() => { try { processMemberSnapshot(snap); } catch(_) {} }, wait);
        };
      })();

      unsubscribe = onSnapshot(doc(db, "members", entry.id), debouncedProcess);

      // QR generation is conditional: only if Jaarhanger already set AND lunch choice is made
      const hasLunchChoice = savedLunchChoice !== null;
      const canShowQR = _jh && hasLunchChoice && (savedLunchChoice === "nee" || (savedLunchChoice === "ja" && _selectedKeuzeEten.length > 0));
      
      if (canShowQR) {
        try { 
          await generateQrForEntry(entry);
          hideLoading();
        } catch (e) { 
          console.error('QR creation failed', e);
          showError(getErrorMessage(e));
          hideLoading();
        }
      } else {
        // Ensure QR/result are hidden until all choices are made
        hideLoading();
        if (resultBox) resultBox.style.display = 'none';
        const privacyEl = document.getElementById("qrPrivacy");
        if (privacyEl) privacyEl.style.display = 'none';
        // Jaarhanger wordt gecontroleerd door renderYearhangerUI zelf
      }
    } catch (e) {
      console.error('renderSelected failed', e);
      showError(getErrorMessage(e));
      hideLoading();
    }
  }

  // Events
  nameInput?.addEventListener("focus", handleFocus);
  nameInput?.addEventListener("input", onInputChanged);
  nameInput?.addEventListener("keydown", (ev) => { if (ev.key === "Escape") hideSuggestions(); if (ev.key === "Enter") { ev.preventDefault(); handleFind(); } });

  if (qrCanvas) {
    qrCanvas.style.cursor = "zoom-in";
    qrCanvas.addEventListener("click", () => openQrFullscreenFromCanvas(qrCanvas), { passive: true });
    qrCanvas.setAttribute("title", "Klik om fullscreen te openen");
  }
  // Preload planned dates to speed up first interaction and update splash progress
  try {
    try { if (window?.appSplash) window.appSplash.setProgress(50, 'Ritdatums ophalen...'); } catch(_) {}
    await getPlannedDates();
    try { if (window?.appSplash) window.appSplash.setProgress(80, 'Initialisatie bijna klaar...'); } catch(_) {}
  } catch (_) {}

  // Hide splash when member init has finished
  try { if (window?.appSplash) { window.appSplash.setProgress(100, 'Klaar'); window.appSplash.hide(); } } catch(_) {}
}

// Generate QR for an entry and show result box
async function generateQrForEntry(entry) {
  try {
    if (!entry) return;
    // Build payload including lunch / jaarhanger values so other devices can process them.
    // Prefer current UI selections; fall back to stored member values when missing.
    let payload = JSON.stringify({ t: "member", uid: entry.id });
    try {
      // Read UI state from DOM (may be null). Avoid referencing inner-scope module vars.
      const lunchYesEl = document.getElementById('lunchYes');
      const lunchNoEl = document.getElementById('lunchNo');
      const uiLunchDeelname = (lunchYesEl && lunchYesEl.classList.contains('active')) ? 'ja'
                            : (lunchNoEl && lunchNoEl.classList.contains('active')) ? 'nee'
                            : null;

      const keuzeWrap = document.getElementById('keuzeEtenButtons');
      let uiLunchKeuze = null;
      if (keuzeWrap) {
        const activeBtn = keuzeWrap.querySelector('button.active');
        if (activeBtn) uiLunchKeuze = (activeBtn.textContent || '').trim();
      }

      const yYesEl = document.getElementById('yearhangerYes');
      const yNoEl = document.getElementById('yearhangerNo');
      const uiJaarhanger = (yYesEl && yYesEl.classList.contains('active')) ? 'Ja'
                        : (yNoEl && yNoEl.classList.contains('active')) ? 'Nee'
                        : null;

      const clientTimestamp = new Date().toISOString();
      // Compute next planned ride date locally to avoid cross-scope errors
      const planned = await getPlannedDates();
      function localToYMD(v) {
        try {
          if (typeof v === 'string' && /\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0,10);
          const d = new Date(v);
          if (!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        } catch (_) {}
        return '';
      }
      const list = (Array.isArray(planned) ? planned : []).map(localToYMD).filter(Boolean).sort();
      function localTodayYMD() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
      const today = localTodayYMD();
      const uiRideYMD = list.find(d => d >= today) || '';

      // Read stored values only if UI hasn't provided them
      const snap = await getDoc(doc(db, 'members', String(entry.id)));
      const data = snap && snap.exists() ? snap.data() : {};

      const lunchDeelname = uiLunchDeelname !== null ? uiLunchDeelname : (typeof data?.lunchDeelname === 'string' ? data.lunchDeelname : null);
      const lunchKeuze = uiLunchKeuze !== null ? uiLunchKeuze : (typeof data?.lunchKeuze === 'string' ? data.lunchKeuze : null);
      const Jaarhanger = uiJaarhanger !== null ? uiJaarhanger : (data?.Jaarhanger || null);
      const lunchRideDateYMD = uiRideYMD || (data?.lunchRideDateYMD ? String(data.lunchRideDateYMD).slice(0,10) : null);

      const payloadObj = {
        t: "member",
        uid: entry.id,
        lunchDeelname: lunchDeelname,
        lunchKeuze: lunchKeuze,
        lunchRideDateYMD: lunchRideDateYMD,
        lunchTimestamp: clientTimestamp,
        Jaarhanger: Jaarhanger
      };
      payload = JSON.stringify(payloadObj);
    } catch (e) {
      // fallback to minimal payload
      try { console.warn('generateQrForEntry: could not enrich payload, fallback', e); } catch(_){}
      payload = JSON.stringify({ t: "member", uid: entry.id });
    }
    const qrCanvas = document.getElementById('qrCanvas');
    const resultBox = document.getElementById('result');
    const errBox = document.getElementById('error');
    return new Promise((resolve, reject) => {
      if (!qrCanvas) return resolve();
      // Bepaal dynamisch de beschikbare breedte van de container en schaal de QR hierop
      try {
        // Zorg dat het resultaat-element meetbaar is (display:none → 0px breedte)
        let prevDisplay = "";
        let prevVisibility = "";
        if (resultBox) {
          prevDisplay = resultBox.style.display;
          prevVisibility = resultBox.style.visibility;
          resultBox.style.display = 'grid';
          // verberg tijdelijk om flikkeren te voorkomen terwijl we tekenen
          resultBox.style.visibility = 'hidden';
        }

        const parent = qrCanvas.parentElement;
        const measured = parent?.clientWidth || qrCanvas.getBoundingClientRect().width || 220;
        const containerWidth = Math.max(220, Math.floor(measured));
        // Maak canvas visueel 100% breed en houd het vierkant
        qrCanvas.style.width = '100%';
        qrCanvas.style.height = 'auto';
        qrCanvas.style.aspectRatio = '1 / 1';
        // Render met voldoende resolutie voor scherp beeld op grotere containers
        // Limiteer naar een redelijke max om performance te bewaren
        const drawSize = Math.min(containerWidth, 1024);
        QRCode.toCanvas(qrCanvas, payload, { width: drawSize, margin: 1 }, (err) => {
          if (err) {
            const errorMsg = "QR-code genereren mislukt. Probeer het opnieuw.";
            if (errBox) { 
              errBox.textContent = errorMsg;
              errBox.style.display = "block";
              errBox.style.color = "#fca5a5";
            }
            reject(new Error(errorMsg));
            return;
          }
          if (resultBox) {
            resultBox.style.display = 'grid';
            // herstel zichtbaarheid zodat de QR nu zichtbaar wordt
            resultBox.style.visibility = prevVisibility || '';
          }
          const privacyEl = document.getElementById("qrPrivacy");
          if (privacyEl) privacyEl.style.display = "block";
          resolve();
        });
        return; // voorkom fallback render hieronder
      } catch(_) {}
      // Fallback render
      QRCode.toCanvas(qrCanvas, payload, { width: 220, margin: 1 }, (err) => {
        if (err) {
          const errorMsg = "QR-code genereren mislukt. Probeer het opnieuw.";
          if (errBox) { 
            errBox.textContent = errorMsg;
            errBox.style.display = "block";
            errBox.style.color = "#fca5a5";
          }
          reject(new Error(errorMsg));
          return;
        }
        if (resultBox) resultBox.style.display = "grid";
        const privacyEl = document.getElementById("qrPrivacy");
        if (privacyEl) privacyEl.style.display = "block";
        resolve();
      });
    });
  } catch (e) {
    console.error('generateQrForEntry failed', e);
    throw e;
  }
}


// Removed unused `ensureMemberConsent` helper during cleanup.
