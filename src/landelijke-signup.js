// landelijke-signup.js — Universele functies voor landelijke rit signup
import { db, getDoc, doc, collection, query, orderBy, startAt, endAt, limit, getDocs, serverTimestamp } from "./firebase.js";
import { withRetry, updateOrCreateDoc } from './firebase-helpers.js';
import { getPlannedDates, plannedStarsWithHighlights, loadLunchOptions } from "./member.js";

// ========== Helper functies ==========

function $(id) {
  return document.getElementById(id);
}

export function fullNameFrom(docData) {
  const tussen = (docData["Tussen voegsel"] || "").trim();
  const parts = [
    docData["Voor naam"] || "",
    docData["Voor letters"] ? `(${docData["Voor letters"]})` : "",
    tussen ? tussen : "",
    docData["Naam"] || ""
  ].filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function toYMDString(value) {
  try {
    if (typeof value === 'string' && /\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0,10);
    const d = new Date(value);
    if (!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return '';
  } catch { return ''; }
}

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function getNextPlannedRideYMD() {
  try {
    const planned = await getPlannedDates();
    const list = (Array.isArray(planned) ? planned : []).map(toYMDString).filter(Boolean).sort();
    const today = todayYMD();
    const next = list.find(d => d >= today);
    return next || '';
  } catch (_) { return ''; }
}

function isScannedForNextRide(scanDatums, nextRideYMD) {
  if (!nextRideYMD) return false;
  const scans = (Array.isArray(scanDatums) ? scanDatums : []).map(d => toYMDString(d)).filter(Boolean);
  return scans.includes(nextRideYMD);
}

export async function checkIfCurrentMemberIsScanned(memberId) {
  try {
    if (!memberId) return false;
    
    const nextRideYMD = await getNextPlannedRideYMD();
    if (!nextRideYMD) return false;
    
    const docRef = doc(db, "members", String(memberId));
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

function getErrorMessage(error) {
  if (!navigator.onLine) {
    return "Geen internetverbinding. Check je wifi of mobiele data.";
  }
  
  const errorCode = error?.code || '';
  const errorMessage = error?.message || '';
  
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
  
  return "Er ging iets mis. Probeer het opnieuw of ga naar de inschrijfbalie.";
}

// ========== Query functies ==========

export async function queryByLastNamePrefix(prefix) {
  if (!prefix) return [];
  const maxResults = 8;
  try {
    if (!navigator.onLine) {
      throw new Error('No internet connection');
    }
    
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
    throw e;
  }
}

// ========== Suggesties UI ==========

export function hideSuggestions(suggestListId = "suggestions") {
  const suggestList = $(suggestListId);
  if (!suggestList) return;
  suggestList.innerHTML = "";
  suggestList.style.display = "none";
}

export function showSuggestions(items, suggestListId = "suggestions", onSelectCallback) {
  const suggestList = $(suggestListId);
  if (!suggestList) return;
  suggestList.innerHTML = "";
  
  if (!items || items.length === 0) {
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
      if (onSelectCallback) {
        await onSelectCallback(it, li);
      }
      hideSuggestions(suggestListId);
    });
    suggestList.appendChild(li);
  }
  suggestList.style.display = items.length ? "block" : "none";
}

// ========== Error/Loading helpers ==========

export function showError(message, isWarning = false, errorBoxId = "error") {
  const errBox = $(errorBoxId);
  if (!errBox) return;
  errBox.textContent = message;
  errBox.style.display = "block";
  errBox.style.color = isWarning ? "#fbbf24" : "#fca5a5";
}

export function hideError(errorBoxId = "error") {
  const errBox = $(errorBoxId);
  if (errBox) errBox.style.display = "none";
}

export function showLoading(loadingIndicatorId = "loadingIndicator") {
  const loadingIndicator = $(loadingIndicatorId);
  if (loadingIndicator) loadingIndicator.style.display = "flex";
}

export function hideLoading(loadingIndicatorId = "loadingIndicator") {
  const loadingIndicator = $(loadingIndicatorId);
  if (loadingIndicator) loadingIndicator.style.display = "none";
}

// ========== QR Code generatie ==========

// Legacy generateQrForEntry removed — QR generation is centralized in index.html.

// QR fullscreen overlay is now centralized in `index.html` (openQrFullscreenFromCanvas there).

// ========== Cleanup oude lunch keuzes ==========

export async function checkAndCleanupOldLunchChoice(memberId, memberData) {
  try {
    if (!memberData || (!memberData.lunchDeelname && !memberData.lunchKeuze)) return;

    const rideYMD = typeof memberData.lunchRideDateYMD === 'string' ? memberData.lunchRideDateYMD.slice(0,10) : '';
    if (!rideYMD) return;

    const today = todayYMD();
    if (today > rideYMD) {
      await withRetry(() => updateOrCreateDoc(doc(db, "members", String(memberId)), {
        lunchDeelname: null,
        lunchKeuze: null,
        lunchRideDateYMD: null
      }), { retries: 2 });
      console.log(`Lunch keuze gewist voor lid ${memberId} — rit ${rideYMD} voorbij (${today}).`);
    }
  } catch (e) {
    console.error('Fout bij cleanup lunch data (op basis van ritdatum):', e);
  }
}

// ========== Save functies ==========

// `saveLunchChoice` removed — lunch choices are no longer persisted from the UI.

export async function saveYearhanger(memberId, yearhangerValue) {
  try {
    if (!memberId) return;
    
    if (!navigator.onLine) {
      throw new Error("Geen internetverbinding. Check je wifi of mobiele data.");
    }
    
    const v = (yearhangerValue === "Ja" || yearhangerValue === true) ? "Ja" : 
              (yearhangerValue === "Nee" || yearhangerValue === false) ? "Nee" : null;
    
  await withRetry(() => updateOrCreateDoc(doc(db, "members", String(memberId)), { Jaarhanger: v }), { retries: 3 });
    
    return v;
  } catch (e) {
    console.error("Jaarhanger opslaan mislukt", e);
    throw e;
  }
}
