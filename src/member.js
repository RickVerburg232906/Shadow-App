// member.js — geplande-sterren met highlight op basis van ScanDatums
import QRCode from "qrcode";
import { db } from "./firebase.js";
import { getDoc, doc, collection, query, orderBy, startAt, endAt, limit, getDocs, onSnapshot, setDoc } from "firebase/firestore";

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

// --- Jaarhanger UI (segmented Ja/Nee) ---
let yearhangerRow = document.getElementById("yearhangerRow");
let yearhangerYes = document.getElementById("yearhangerYes");
let yearhangerNo  = document.getElementById("yearhangerNo");
let _yearhangerVal = "Ja"; // default

function ensureYearhangerUI() {
  yearhangerRow = document.getElementById("yearhangerRow");
  yearhangerYes = document.getElementById("yearhangerYes");
  yearhangerNo  = document.getElementById("yearhangerNo");
}
ensureYearhangerUI();

function renderYearhangerUI(val) {
  ensureYearhangerUI();
  const v = (val==="Ja"||val===true)?"Ja":(val==="Nee"||val===false)?"Nee":null; // default Ja
  _yearhangerVal = v;
  if (yearhangerRow) yearhangerRow.style.display = "block";
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
}
async function saveYearhanger(val) {
  try {
    if (!selectedDoc || !selectedDoc.id) return;
    const v = (val==="Ja"||val===true)?"Ja":(val==="Nee"||val===false)?"Nee":null;
    _yearhangerVal = v;
    
    // Show loading during save
    const loadingIndicator = document.getElementById("loadingIndicator");
    if (loadingIndicator) loadingIndicator.style.display = "flex";
    
    await setDoc(doc(db, "members", String(selectedDoc.id)), { Jaarhanger: v }, { merge: true });
    // After saving the Jaarhanger choice, generate QR for the selected member
    try { if (selectedDoc) await generateQrForEntry(selectedDoc); } catch(_) {}
    
    // Hide loading after save completes
    if (loadingIndicator) loadingIndicator.style.display = "none";
  } catch (e) {
    console.error("Jaarhanger opslaan mislukt", e);
    const loadingIndicator = document.getElementById("loadingIndicator");
    if (loadingIndicator) loadingIndicator.style.display = "none";
  }
}

// Voeg click event listeners toe aan de knoppen
if (yearhangerYes) {
  yearhangerYes.addEventListener("click", function() {
    renderYearhangerUI("Ja");
    saveYearhanger("Ja");
  });
}
if (yearhangerNo) {
  yearhangerNo.addEventListener("click", function() {
    renderYearhangerUI("Nee");
    saveYearhanger("Nee");
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
    for (const it of items) {
      const li = document.createElement("li");
      li.textContent = fullNameFrom(it.data) + ` — ${it.id}`;
      li.addEventListener("click", async () => {
        selectedDoc = it;
        // keep the user's typed input intact; do not overwrite with the selected member's name
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
      return [];
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
    if (errBox) errBox.style.display = "none";
    try { if (unsubscribe) unsubscribe(); } catch(_) {}
    unsubscribe = null;
    if (yearhangerRow) yearhangerRow.style.display = "none";
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
    resetSelection();
    const term = (nameInput && nameInput.value ? nameInput.value : "").trim();
    if (term.length >= 1) {
      try { const items = await queryByLastNamePrefix(term); if (items && items.length) showSuggestions(items); else hideSuggestions(); }
      catch { hideSuggestions(); }
    } else { hideSuggestions(); }
  }
  async function onInputChanged() {
    if (_debounceHandle) clearTimeout(_debounceHandle);
    _debounceHandle = setTimeout(async () => {
      try {
        resetSelection();
        const term = (nameInput && nameInput.value ? nameInput.value : "").trim();
        if (term.length < 2) { hideSuggestions(); return; }
        
        // Show subtle loading for search
        if (errBox) { errBox.textContent = "Zoeken..."; errBox.style.display = "block"; errBox.style.color = "var(--muted)"; }
        
        const items = await queryByLastNamePrefix(term);
        
        if (!items || !items.length) {
          if (errBox) { errBox.textContent = "Geen lid met uw achternaam gevonden — ga naar de inschrijfbalie voor meer informatie."; errBox.style.display = "block"; errBox.style.color = "#fca5a5"; }
          hideSuggestions();
          return;
        }
        
        if (errBox) errBox.style.display = "none";
        showSuggestions(items);
      } catch (e) {
        hideSuggestions();
        if (errBox) { errBox.textContent = "Er ging iets mis tijdens het zoeken. Probeer het opnieuw of ga naar de inschrijfbalie."; errBox.style.display = "block"; errBox.style.color = "#fca5a5"; }
      }
    }, 250);
  }
  async function handleFind() {
    if (errBox) errBox.style.display = "none";
    try {
      const term = (nameInput && nameInput.value ? nameInput.value : "").trim();
      if (!term) { hideSuggestions(); return; }
      const items = await queryByLastNamePrefix(term);
      if (!items.length) {
        if (errBox) { errBox.textContent = "Geen lid met uw achternaam gevonden — ga naar de inschrijfbalie voor meer informatie."; errBox.style.display = "block"; }
        hideSuggestions(); return;
      }
      showSuggestions(items);
    } catch (e) {
      if (errBox) { errBox.textContent = "Er ging iets mis tijdens het zoeken. Probeer het opnieuw of ga naar de inschrijfbalie."; errBox.style.display = "block"; }
    }
  }

  async function renderSelected(entry) {
    showLoading();
    const data = entry.data || {};
        if (rRegion) rRegion.textContent = (data["Regio Omschrijving"] || "—");
if (rName) rName.textContent = fullNameFrom(data);
    if (rMemberNo) rMemberNo.textContent = entry.id;
  const _jh = (entry?.data?.Jaarhanger === "Nee") ? "Nee" : (entry?.data?.Jaarhanger === "Ja" ? "Ja" : "");
  renderYearhangerUI(_jh || null);
  // If Jaarhanger is not set, require user to choose before generating QR. Do not auto-set a default.
  // If Jaarhanger already set in Firestore, generate QR immediately.

    // ⭐ Vergelijk ScanDatums met globale plannedDates en licht sterren op per index
    const planned = await getPlannedDates();
    const scanDatums = Array.isArray(data.ScanDatums) ? data.ScanDatums : [];
    const { stars, starsHtml, tooltip, planned: plannedNorm } = plannedStarsWithHighlights(planned, scanDatums);
    if (rRides) {
      rRides.innerHTML = starsHtml || "—";
      rRides.setAttribute("title", stars ? tooltip : "Geen ingeplande datums");
      rRides.setAttribute("aria-label", stars ? `Sterren per datum (gepland: ${plannedNorm.length})` : "Geen ingeplande datums");
      rRides.style.letterSpacing = "3px";
      rRides.style.fontSize = "20px";
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
  const { stars, starsHtml, tooltip, planned: plannedNorm } = plannedStarsWithHighlights(planned, scanDatumsLive);
  if (rRides) {
    rRides.innerHTML = starsHtml || "—";
    rRides.setAttribute("title", stars ? tooltip : "Geen ingeplande datums");
    rRides.setAttribute("aria-label", stars ? `Sterren per datum (gepland: ${plannedNorm.length})` : "Geen ingeplande datums");
    rRides.style.letterSpacing = "3px";
    rRides.style.fontSize = "20px";
  }
}).catch(() => {});
const jh = (d && typeof d.Jaarhanger === "string") ? d.Jaarhanger : "";
renderYearhangerUI(jh || _yearhangerVal || null);
});

    // QR generation is conditional: only if Jaarhanger already set
    if (_jh) {
      try { 
        await generateQrForEntry(entry);
        hideLoading();
      } catch (e) { 
        console.error('QR creation failed', e);
        hideLoading();
      }
    } else {
      // Ensure QR/result are hidden until choice is made
      hideLoading();
      if (resultBox) resultBox.style.display = 'none';
      const privacyEl = document.getElementById("qrPrivacy");
      if (privacyEl) privacyEl.style.display = 'none';
      // show yearhanger UI (renderYearhangerUI already done above)
      if (yearhangerRow) yearhangerRow.style.display = 'block';
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
      QRCode.toCanvas(qrCanvas, payload, { width: 220, margin: 1 }, (err) => {
        if (err) {
          if (errBox) { errBox.textContent = "QR genereren mislukte."; errBox.style.display = "block"; }
          reject(err);
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
