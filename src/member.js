// member.js — geplande-sterren met highlight op basis van ScanDatums
import QRCode from "qrcode";
import { db } from "./firebase.js";
import { getDoc, doc, collection, query, orderBy, startAt, endAt, limit, getDocs, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";

// ------- Planning (geplande datums) -------
export async function getPlannedDates() {
  try {
    const ref = doc(db, "globals", "ridePlan");
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : {};
    const arr = Array.isArray(data.plannedDates) ? data.plannedDates : [];
    return arr.filter(Boolean);
  } catch (e) {
    console.error("Kon plannedDates niet laden:", e);
    return [];
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
    const ref = doc(db, "globals", "starConfig");
    const snap = await getDoc(ref);
    const max = snap.exists() && typeof snap.data().max === "number" ? snap.data().max : 5;
    STAR_MAX = Math.max(1, Math.floor(max));
  } catch {
    STAR_MAX = 5;
  }
}
function ridesToStars(count) {
  const max = STAR_MAX;
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const filled = Math.min(n, max);
  const empty = Math.max(0, max - filled);
  return "★".repeat(filled) + "☆".repeat(empty);
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

function fmtDate(d) {
  if (!d || typeof d !== "string" || d.length < 10) return d || "";
  return `${d.slice(8,10)}-${d.slice(5,7)}-${d.slice(0,4)}`;
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
  const lunchSelectionBadge = $("lunchSelectionBadge");
  const lunchSummaryText = $("lunchSummaryText");
  const jaarhangerSelectionBadge = $("jaarhangerSelectionBadge");
  let lunchDetailsElement = null; // Reference to the details element
  let _lunchChoice = null; // "ja" of "nee"
  let _selectedKeuzeEten = []; // array van geselecteerde keuze eten items

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
async function loadLunchOptions() {
  try {
    const lunchRef = doc(db, 'globals', 'lunch');
    const snap = await getDoc(lunchRef);
    if (snap.exists()) {
      const data = snap.data();
      return {
        vastEten: Array.isArray(data.vastEten) ? data.vastEten : [],
        keuzeEten: Array.isArray(data.keuzeEten) ? data.keuzeEten : []
      };
    }
    return { vastEten: [], keuzeEten: [] };
  } catch (e) {
    console.error('Fout bij laden lunch opties:', e);
    return { vastEten: [], keuzeEten: [] };
  }
}

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
    
    // Vind het details element
    if (!lunchDetailsElement && lunchChoiceSection) {
      lunchDetailsElement = lunchChoiceSection.querySelector('details');
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
  
  if (_lunchChoice === "ja" && _selectedKeuzeEten.length > 0) {
    lunchSelectionBadge.textContent = `✓ Ja · ${_selectedKeuzeEten[0]}`;
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
  
  if (lunchYes && lunchNo) {
    lunchYes.classList.toggle("active", choice === "ja");
    lunchNo.classList.toggle("active", choice === "nee");
    lunchYes.classList.toggle("yes", choice === "ja");
    lunchNo.classList.toggle("no", choice === "nee");
    lunchYes.setAttribute("aria-checked", String(choice === "ja"));
    lunchNo.setAttribute("aria-checked", String(choice === "nee"));
    
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
  } else if (choice === "ja") {
    // Laad en toon lunch details, maar verberg jaarhanger totdat keuze eten is geselecteerd
    if (lunchDetailsSection) lunchDetailsSection.style.display = 'block';
    // Verberg jaarhanger totdat een keuze is gemaakt
    if (yearhangerRow) yearhangerRow.style.display = "none";
    const info = document.getElementById("jaarhangerInfo");
    if (info) info.style.display = "none";
    
    const { vastEten, keuzeEten } = await loadLunchOptions();
    
    // Toon vast eten als tekst
    if (vastEtenDisplay) {
      vastEtenDisplay.textContent = vastEten.length > 0 
        ? vastEten.join(', ') 
        : 'Geen vast eten beschikbaar';
    }
    
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
        
        btn.addEventListener('click', async () => {
          // Verwijder alle active classes van alle buttons (radio gedrag)
          const allBtns = keuzeEtenButtons.querySelectorAll('button');
          allBtns.forEach(b => b.classList.remove('active', 'yes'));
          
          // Selecteer alleen deze button
          btn.classList.add('active', 'yes');
          _selectedKeuzeEten = [item]; // Alleen deze ene keuze opslaan
          
          updateLunchBadge();
          await saveLunchChoice();
          // Toon jaarhanger direct na keuze
          renderYearhangerUI(_yearhangerVal || null);
          // Klap sectie in na keuze eten selectie
          collapseLunchSection();
        });
        keuzeEtenButtons.appendChild(btn);
      });
    }
    
    // Update badge ook als "ja" is gekozen zonder keuze eten
    updateLunchBadge();
    
    // Toon jaarhanger NIET automatisch - alleen als er al een keuze is gemaakt
    // Dit wordt gedaan in de button click handler hierboven
  }
}

async function saveLunchChoice() {
  try {
    if (!selectedDoc || !selectedDoc.id) return;
    
    // Sla op als string (eerste item) of null als geen keuze
    const keuzeEtenValue = _selectedKeuzeEten.length > 0 ? _selectedKeuzeEten[0] : null;
    // Koppel keuze aan de eerstvolgende ritdatum (vandaag of later)
    const rideYMD = await getNextPlannedRideYMD();
    
    await setDoc(doc(db, "members", String(selectedDoc.id)), { 
      lunchDeelname: _lunchChoice,
      lunchKeuze: keuzeEtenValue,
      lunchTimestamp: serverTimestamp(),
      lunchRideDateYMD: rideYMD || null
    }, { merge: true });
    
    // Na het opslaan, check of er al een jaarhanger keuze is
    // Als lunch keuze "nee" is OF als lunch "ja" is met een keuze eten, en er is al een jaarhanger
    if (_lunchChoice === "nee" || (_lunchChoice === "ja" && _selectedKeuzeEten.length > 0)) {
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
    await renderLunchUI("ja");
    await saveLunchChoice();
  });
}
if (lunchNo) {
  lunchNo.addEventListener("click", async function() {
    // Reset de keuze eten selectie wanneer "Nee" wordt gekozen
    _selectedKeuzeEten = [];
    await renderLunchUI("nee");
    await saveLunchChoice();
  });
}

// --- Jaarhanger UI (segmented Ja/Nee) ---
let yearhangerRow = document.getElementById("yearhangerRow");
let yearhangerYes = document.getElementById("yearhangerYes");
let yearhangerNo  = document.getElementById("yearhangerNo");
let yearhangerDetailsElement = null; // Reference to the details element
let _yearhangerVal = "Ja"; // default

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
  
  // Als lunch keuze "ja" is maar nog geen keuze eten geselecteerd, toon jaarhanger niet
  if (_lunchChoice === "ja" && _selectedKeuzeEten.length === 0) {
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
  if (yearhangerDetailsElement && v !== null) {
    // Keuze bestaat al: houd ingeklapt
    yearhangerDetailsElement.open = false;
  } else if (yearhangerDetailsElement && v === null) {
    // Geen keuze: open de sectie
    yearhangerDetailsElement.open = true;
  }
  
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
}
async function saveYearhanger(val) {
  try {
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
    
    await setDoc(doc(db, "members", String(selectedDoc.id)), { Jaarhanger: v }, { merge: true });
  updateJaarhangerBadge();
    // After saving the Jaarhanger choice, generate QR for the selected member
    try { if (selectedDoc) await generateQrForEntry(selectedDoc); } catch(_) {}
    
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
    saveYearhanger("Ja");
    // Klap sectie in na selectie
    collapseJaarhangerSection();
  });
}
if (yearhangerNo) {
  yearhangerNo.addEventListener("click", function() {
    renderYearhangerUI("Nee");
    saveYearhanger("Nee");
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
    if (yearhangerRow) yearhangerRow.style.display = "none";
  if (jaarhangerSelectionBadge) jaarhangerSelectionBadge.style.display = 'none';
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
      if (!memberData || (!memberData.lunchDeelname && !memberData.lunchKeuze)) return;

      const rideYMD = typeof memberData.lunchRideDateYMD === 'string' ? memberData.lunchRideDateYMD.slice(0,10) : '';
      if (!rideYMD) {
        // Als er geen gekoppelde ritdatum is, wijzig niets (we verwijderen niets op tijd alleen).
        return;
      }

      const today = todayYMD();
      // Verwijder keuze wanneer de dag NA de rit is aangebroken (today > rideYMD)
      if (today > rideYMD) {
        await setDoc(doc(db, "members", String(memberId)), {
          lunchDeelname: null,
          lunchKeuze: null,
          lunchTimestamp: null,
          lunchRideDateYMD: null
        }, { merge: true });
        console.log(`Lunch keuze gewist voor lid ${memberId} — rit ${rideYMD} voorbij (${today}).`);
      }
    } catch (e) {
      console.error('Fout bij cleanup lunch data (op basis van ritdatum):', e);
    }
  }

  async function renderSelected(entry) {
    showLoading();
    hideError();
    
    try {
      const data = entry.data || {};
      
      // Check of lunch keuze ouder is dan 1 dag en verwijder indien nodig
      await checkAndCleanupOldLunchChoice(entry.id, data);
      
      if (rRegion) rRegion.textContent = (data["Regio Omschrijving"] || "—");
      if (rName) rName.textContent = fullNameFrom(data);
      if (rMemberNo) rMemberNo.textContent = entry.id;
      const _jh = (entry?.data?.Jaarhanger === "Nee") ? "Nee" : (entry?.data?.Jaarhanger === "Ja" ? "Ja" : "");
      
      // Laad bestaande lunch keuze indien beschikbaar
      const savedLunchChoice = data.lunchDeelname || null;
      // Ondersteun zowel oude array als nieuwe string format
      const savedLunchKeuze = data.lunchKeuze;
      if (typeof savedLunchKeuze === 'string' && savedLunchKeuze) {
        _selectedKeuzeEten = [savedLunchKeuze];
      } else if (Array.isArray(savedLunchKeuze) && savedLunchKeuze.length > 0) {
        _selectedKeuzeEten = [savedLunchKeuze[0]]; // Neem alleen eerste item
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
        
        // Als er al een keuze is gemaakt, toon de jaarhanger
        if (savedLunchChoice === "nee" || (savedLunchChoice === "ja" && _selectedKeuzeEten.length > 0)) {
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
      unsubscribe = onSnapshot(doc(db, "members", entry.id), (snap) => {
      
const d = snap.exists() ? snap.data() : {};
const count = typeof d.ridesCount === "number" ? d.ridesCount : 0;
// console.debug("Live ridesCount:", count, ridesToStars(count));
// ⭐ Live update van sterren op basis van actuele ScanDatums
const scanDatumsLive = Array.isArray(d.ScanDatums) ? d.ScanDatums : [];
  getPlannedDates().then((planned) => {
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
}).catch(() => {});
const jh = (d && typeof d.Jaarhanger === "string") ? d.Jaarhanger : "";
renderYearhangerUI(jh || _yearhangerVal || null);
});

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
    const payload = JSON.stringify({ t: "member", uid: entry.id });
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


function ensureMemberConsent(){
  const accepted = window.sessionStorage.getItem(CONSENT_KEY) === "1";
  const gate = document.getElementById("rideConsentGate");
  const enrolls = document.querySelectorAll('#viewMember [data-requires-consent="1"]');
  if (!gate) return;
  if (accepted){
    gate.setAttribute("hidden",""); gate.style.display="none";
    enrolls.forEach(el=>el.removeAttribute("hidden"));
  } else {
    gate.removeAttribute("hidden"); gate.style.display="";
    enrolls.forEach(el=>el.setAttribute("hidden",""));
  }
}
