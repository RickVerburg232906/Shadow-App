// member.js — geplande-sterren met highlight op basis van ScanDatums
import { db, getDoc, doc, collection, query, orderBy, startAt, endAt, limit, getDocs, onSnapshot, serverTimestamp } from "./firebase.js";
import { withRetry, updateOrCreateDoc } from './firebase-helpers.js';
import { $, showError, hideError } from './ui-helpers.js';

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

  // Use `$` from `src/ui-helpers.js`
  let _debounceHandle = null;
  const resultBox   = $("result");
  const errBox      = $("error");
  const rName       = $("rName");
  const rMemberNo   = $("rMemberNo");
  const qrCanvas    = $("qrCanvas");
  const rRegion    = $("rRegion");
  const loadingIndicator = $("loadingIndicator");

  // Lunch / jaarhanger UI moved to dedicated modules (`src/lunch-ui.js`, `src/yearhanger-ui.js`).
  // No local DOM stubs or rendering logic remain in this file.

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

// `showError` and `hideError` are provided by `src/ui-helpers.js`

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

  // Preload planned dates to speed up first interaction and update splash progress
  try {
    try { if (window?.appSplash) window.appSplash.setProgress(50, 'Ritdatums ophalen...'); } catch(_) {}
    await getPlannedDates();
    try { if (window?.appSplash) window.appSplash.setProgress(80, 'Initialisatie bijna klaar...'); } catch(_) {}
  } catch (_) {}

  // Hide splash when member init has finished
  try { if (window?.appSplash) { window.appSplash.setProgress(100, 'Klaar'); window.appSplash.hide(); } } catch(_) {}
}

