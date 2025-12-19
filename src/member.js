// member.js — geplande-sterren met highlight op basis van ScanDatums
import QRCode from "qrcode";
import { db, getDoc, doc, collection, query, orderBy, startAt, endAt, limit, getDocs, onSnapshot, serverTimestamp } from "./firebase.js";
import { withRetry, updateOrCreateDoc } from './firebase-helpers.js';
// import { renderYearhanger } from './yearhanger-ui.js';

// ====== Star / planned dates helpers (exported) ======
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

// Global planned dates cache
let PLANNED_DATES = [];
export async function getPlannedDates() {
  try {
    if (Array.isArray(PLANNED_DATES) && PLANNED_DATES.length) return PLANNED_DATES;
    const planRef = doc(db, "globals", "rideConfig");
    const cfgSnap = await getDoc(planRef);
    const dates = cfgSnap.exists() && Array.isArray(cfgSnap.data().plannedDates) ? cfgSnap.data().plannedDates.filter(Boolean) : [];
    PLANNED_DATES = dates.map(d => {
      if (typeof d === 'string') { const m = d.match(/\d{4}-\d{2}-\d{2}/); if (m) return m[0]; }
      const dt = new Date(d); if (!isNaN(dt)) return dt.toISOString().slice(0,10); return "";
    }).filter(Boolean);
    return PLANNED_DATES;
  } catch(e){ console.error("getPlannedDates()", e); PLANNED_DATES = []; return PLANNED_DATES; }
}

// Planned stars + tooltip helper
export function plannedStarsWithHighlights(plannedDates, scanDates) {
  const planned = plannedDates.map(v => {
    try {
      if (!v) return "";
      if (typeof v === 'object' && v.seconds) {
        const d = new Date(v.seconds * 1000);
        return d.toISOString().slice(0,10);
      }
      if (typeof v === 'string') {
        const m = v.match(/\d{4}-\d{2}-\d{2}/);
        if (m) return m[0];
      }
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0,10);
      return "";
    } catch { return ""; }
  }).filter(Boolean);
  const scans = new Set((Array.isArray(scanDates) ? scanDates : []).map(v => {
    try { if (typeof v === 'string') { const m = v.match(/\d{4}-\d{2}-\d{2}/); if (m) return m[0]; } const d = new Date(v); if (!isNaN(d)) return d.toISOString().slice(0,10); } catch{} return "";
  }).filter(Boolean));
  const starsHtml = planned.map(d => scans.has(d) ? '<span class="star filled">★</span>' : '<span class="star empty">☆</span>').join('');
  const tooltip = planned.map((d, i) => `${i+1}: ${d} — ${scans.has(d) ? "Geregistreerd" : "Niet geregistreerd"}`).join("\\n");
  const stars = planned.map(d => scans.has(d) ? "★" : "☆").join("");
  return { stars, starsHtml, tooltip, planned };
}

// ====== Lunch options loader (cached, exported) ======
export async function loadLunchOptions() {
  try {
    const now = Date.now();
    const TTL = 60 * 1000; // cache for 60s
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
    console.error('loadLunchOptions failed', e);
    return { vastEten: [], keuzeEten: [] };
  }
}

// Jaarhanger listeners are attached after UI nodes are ensured further below

export async function initMemberView() {
  try {
    // Update splash progress: start
    try { if (window?.appSplash) window.appSplash.setProgress(5, 'Initialiseren leden...'); } catch(_) {}
    await loadStarMax();
    try { if (window?.appSplash) window.appSplash.setProgress(30, 'Ster-config laden...'); } catch(_) {}
  } catch(e) {}

  const $ = (id) => document.getElementById(id);
  let _debounceHandle = null;
  const resultBox   = $("result");
  const errBox      = $("error");
  const rName       = $("rName");
  const rMemberNo   = $("rMemberNo");
  const rRides      = $("rRidesCount");
  const qrCanvas    = $("qrCanvas");
  const rRegion    = $("rRegion");
  const loadingIndicator = $("loadingIndicator");

  // Lunch UI is delegated to `src/lunch-ui.js`.
  // Keep minimal stubs here for backward compatibility (no DOM access).
  let lunchChoiceSection = null;
  let lunchToggle = null;
  let lunchYes = null;
  let lunchNo = null;
  let lunchDetailsSection = null;
  let vastEtenDisplay = null;
  let keuzeEtenButtons = null;
  let keuzeEtenSection = null;
  let lunchSelectionBadge = null;
  let lunchSummaryText = null;
  let lunchScannedDisclaimer = null;
  let lunchDeadlineInfo = null;
  // Jaarhanger UI is handled by `src/yearhanger-ui.js` (rendered where needed)
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
      const suppressed = lunchDetailsElement.dataset && lunchDetailsElement.dataset.suppressAutoOpen === 'true';
      const shouldOpen = !suppressed && ((_lunchChoice === null) || (_lunchChoice === 'ja' && Array.isArray(_selectedKeuzeEten) && _selectedKeuzeEten.length === 0));
      lunchDetailsElement.open = shouldOpen;
    }
  }
}

function collapseLunchSection() {
  // no-op: controlled by lunch-ui.js
}

function hideLunchChoice() {
  // no-op: lunch UI is delegated to `src/lunch-ui.js`.
  _lunchChoice = null;
  _selectedKeuzeEten = [];
}

function updateLunchBadge() {
  // no-op: badge is rendered by lunch-ui.js
}

async function renderLunchUI(choice) {
  // Deprecated: lunch UI is now handled by `src/lunch-ui.js`.
  // Keep this stub so callers do not throw; actual rendering and logic
  // are performed in the dedicated module.
  try { _lunchChoice = choice; } catch(_) {}
  try { console.warn('renderLunchUI() is deprecated — use src/lunch-ui.js'); } catch(_) {}
}

// Lunch keuze UI is handled by `src/lunch-ui.js` and does its own event wiring.

// Jaarhanger UI responsibilities moved to `src/yearhanger-ui.js`.
// All legacy jaarhanger DOM and logic removed from this file. Use the
// `yearhanger:changed` event emitted by `src/yearhanger-ui.js` and
// centralized save helpers (for example `saveYearhanger(memberId, value)` in
// `src/landelijke-signup.js`) to persist choices when needed.

  // Events

  // Events
  // Input-based member search removed: no input/focus listeners attached.

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
