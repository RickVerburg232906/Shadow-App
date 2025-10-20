// ===== JPG export naast 'Herladen' (admin-only) =====
(function() {
  function waitForElement(getter, { tries=50, delay=200 } = {}) {
    return new Promise((resolve) => {
      let count = 0;
      const tick = () => {
        const el = getter();
        if (el) return resolve(el);
        if (++count >= tries) return resolve(null);
        setTimeout(tick, delay);
      };
      tick();
    });
  }
  function attachChartExportJPGNextToReload(reloadBtnId, canvasId, btnId, filename) {
    const doAttach = async () => {
      const adminView = document.getElementById("viewAdmin");
      if (!adminView) return; // only in admin
      const reloadBtn = await waitForElement(() => adminView.querySelector("#" + reloadBtnId));
      const canvas = await waitForElement(() => adminView.querySelector("#" + canvasId));
      if (!reloadBtn || !canvas) return;

      let btn = document.getElementById(btnId);
      if (!btn) {
        btn = document.createElement("button");
        btn.id = btnId;
        btn.type = "button";
        btn.className = reloadBtn.className || "btn";
        btn.textContent = "Export JPG";
        btn.style.marginLeft = "8px";
      }
      if (reloadBtn.nextSibling !== btn) {
        reloadBtn.insertAdjacentElement("afterend", btn);
      }

      const triggerDownload = (blob) => {
        const a = document.createElement("a");
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = filename || (canvasId + ".jpg");
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
      };

      btn.onclick = () => {
        try {
          if (canvas.toBlob) {
            canvas.toBlob((blob) => {
              if (blob) triggerDownload(blob);
              else {
                const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
                fetch(dataUrl).then(r => r.blob()).then(triggerDownload);
              }
            }, "image/jpeg", 0.92);
          } else {
            const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
            fetch(dataUrl).then(r => r.blob()).then(triggerDownload);
          }
        } catch (e) {
          console.error("JPG export failed:", e);
          alert("JPG export mislukt.");
        }
      };

      const ensurePlaced = () => {
        try {
          if (reloadBtn.nextSibling !== btn) reloadBtn.insertAdjacentElement("afterend", btn);
        } catch (_) {}
      };
      reloadBtn.addEventListener("click", () => setTimeout(ensurePlaced, 0));
      window.addEventListener("resize", ensurePlaced);
      document.getElementById("adminSubtabs")?.addEventListener("click", () => setTimeout(ensurePlaced, 0));
      if (adminView && window.MutationObserver) {
        const mo = new MutationObserver(() => ensurePlaced());
        mo.observe(adminView, { childList: true, subtree: true });
      }
      ensurePlaced();
    };
    doAttach();
    if (document.readyState !== "complete" && document.readyState !== "interactive") {
      document.addEventListener("DOMContentLoaded", doAttach, { once: true });
    }
  }
  window.attachChartExportJPGNextToReload = attachChartExportJPGNextToReload;
})();

import * as XLSX from "xlsx";
import { db, writeBatch, doc } from "./firebase.js";
import { getPlannedDates, plannedStarsWithHighlights } from "./member.js";
import { arrayUnion, collection, endAt, getDoc, getDocs, increment, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, startAfter, startAt, runTransaction } from "firebase/firestore";

// ====== Globale ritdatums cache ======
let PLANNED_DATES = [];


// Reset zowel ridesCount als ScanDatums

async function ensureRideDatesLoaded(){
  try{
    if (Array.isArray(PLANNED_DATES) && PLANNED_DATES.length) return PLANNED_DATES;
    const planRef = doc(db, "globals", "ridePlan");
    const snap = await getDoc(planRef);
    const dates = snap.exists() && Array.isArray(snap.data().plannedDates) ? snap.data().plannedDates.filter(Boolean) : [];
    // Normaliseer naar YYYY-MM-DD
    PLANNED_DATES = dates.map(d => {
      if (typeof d === 'string') { const m = d.match(/\d{4}-\d{2}-\d{2}/); if (m) return m[0]; }
      const dt = new Date(d); if (!isNaN(dt)) return dt.toISOString().slice(0,10); return "";
    }).filter(Boolean);
    return PLANNED_DATES;
  } catch(e){ console.error("ensureRideDatesLoaded()", e); PLANNED_DATES = []; return PLANNED_DATES; }
}


// ====== Config / kolommen voor import ======
const REQUIRED_COLS = ["LidNr", "Naam", "Voor naam", "Voor letters", "Tussen voegsel", "Regio Omschrijving"];

// Dynamisch laden van html5-qrcode pas als we echt gaan scannen
let html5qrcodeLoading = false;
function ensureHtml5Qrcode() {
  return new Promise((resolve, reject) => {
    if (window.Html5QrcodeScanner) return resolve(true);
    if (html5qrcodeLoading) {
      const int = setInterval(() => {
        if (window.Html5QrcodeScanner) { clearInterval(int); resolve(true); }
      }, 100);
      setTimeout(() => { clearInterval(int); if (!window.Html5QrcodeScanner) reject(new Error("Timeout bij laden QR-lib")); }, 10000);
      return;
    }
    html5qrcodeLoading = true;
    const s = document.createElement("script");
    s.src = "https://unpkg.com/html5-qrcode";
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => reject(new Error("Kon QR-bibliotheek niet laden"));
    document.head.appendChild(s);
  });
}

// =====================================================
// ===============  Admin hoofd-initialisatie  =========
// =====================================================

// =====================================================
// ===============  Ritstatistieken (bar chart) =========
// =====================================================
// Count members per date, optionally filtered by region (regio Omschrijving)
async function countMembersPerDate(plannedYMDs, regionFilter) {
  // Return map { 'YYYY-MM-DD': count }
  const counts = new Map(plannedYMDs.map(d => [d, 0]));

  try {
    let last = null;
    const pageSize = 400;

    while (true) {
      let qRef = query(collection(db, "members"), orderBy("__name__"), limit(pageSize));
      if (last) qRef = query(collection(db, "members"), orderBy("__name__"), startAfter(last), limit(pageSize));

      const snapshot = await getDocs(qRef);
      if (snapshot.empty) break;

      snapshot.forEach((docSnap) => {
        const d = docSnap.data() || {};
        // If a regionFilter is provided and this member's Regio Omschrijving doesn't match, skip
        if (regionFilter && String(d["Regio Omschrijving"] || "").trim() !== String(regionFilter).trim()) return;
        const scans = Array.isArray(d.ScanDatums) ? d.ScanDatums : [];
        for (const raw of scans) {
          const s = typeof raw === "string" ? (raw.slice(0,10)) : "";
          if (s && counts.has(s)) counts.set(s, counts.get(s) + 1);
        }
      });

      last = snapshot.docs[snapshot.docs.length - 1];
      if (snapshot.size < pageSize) break;
    }
  } catch (e) {
    console.error("[rideStats] tellen mislukt", e);
  }

  return counts;
}

let _rideStatsChart = null;
async function initRideStatsChart() {
  const canvas = document.getElementById("rideStatsChart");
  const statusEl = document.getElementById("rideStatsStatus");
  const reloadBtn = document.getElementById("reloadStatsBtn");
  const regionSelect = document.getElementById("rideRegionFilter");
  const regionStatus = document.getElementById("rideRegionStatus");
  if (!canvas) return;

  async function render() {
    try {
      if (statusEl) statusEl.textContent = "Laden…";
      const planned = (await ensureRideDatesLoaded()) || [];
      // Normaliseer naar YYYY-MM-DD en sorteer
      const plannedYMDs = planned.map(d => (typeof d === "string" ? d.slice(0,10) : "")).filter(Boolean).sort();
      if (!plannedYMDs.length) {
        if (statusEl) statusEl.textContent = "Geen geplande datums.";
        return;
      }
  // Respect region filter if present
  const selectedRegion = regionSelect ? (regionSelect.value || null) : null;
  if (regionStatus) regionStatus.textContent = selectedRegion ? `Regio: ${selectedRegion}` : "";
  const counts = await countMembersPerDate(plannedYMDs, selectedRegion);
      const labels = plannedYMDs;
      const data = plannedYMDs.map(d => counts.get(d) || 0);

      // Destroy oud chart om memory leaks te voorkomen
      try { if (_rideStatsChart) { _rideStatsChart.destroy(); _rideStatsChart = null; } } catch(_) {}

      // eslint-disable-next-line no-undef
      const ctx = canvas.getContext("2d");
      _rideStatsChart = new Chart(ctx, {
        type: "bar",
        data: {
          labels,
          datasets: [{
            label: "Inschrijvingen",
            data,
            // geen specifieke kleuren zetten; Chart.js kiest defaults
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { title: { display: true, text: "Ritdatum" } },
            y: { beginAtZero: true, title: { display: true, text: "Aantal leden" }, ticks: { precision: 0 } }
          },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: {
              label: (ctx) => ` ${ctx.parsed.y} inschrijvingen`
            }}
          }
        }
      });
      if (statusEl) statusEl.textContent = `✅ Gegevens geladen (${data.reduce((a,b)=>a+b,0)} totaal)`;
    } catch (e) {
      console.error(e);
      if (statusEl) statusEl.textContent = "❌ Laden mislukt";
    }
  }

  await render();
  if (reloadBtn) reloadBtn.addEventListener("click", () => render(), { passive: true });
  // Populate region select asynchronously
  (async () => {
    try {
      if (!regionSelect) return;
      regionSelect.innerHTML = '<option value="">Alles</option>';
      const regions = await getAllRegions();
      regions.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r;
        opt.textContent = r;
        regionSelect.appendChild(opt);
      });
      regionSelect.addEventListener('change', () => render(), { passive: true });
    } catch (e) {
      console.error("Kon regio's niet laden", e);
    }
  })();
}

// Get all distinct regions from members collection (sorted)
async function getAllRegions() {
  const set = new Set();
  try {
    let last = null;
    const pageSize = 400;
    while (true) {
      let qRef = query(collection(db, "members"), orderBy("__name__"), limit(pageSize));
      if (last) qRef = query(collection(db, "members"), orderBy("__name__"), startAfter(last), limit(pageSize));
      const snap = await getDocs(qRef);
      if (snap.empty) break;
      snap.forEach(s => {
        const d = s.data() || {};
        const r = (d["Regio Omschrijving"] || "").trim();
        if (r) set.add(r);
      });
      last = snap.docs[snap.docs.length - 1];
      if (snap.size < pageSize) break;
    }
  } catch (e) {
    console.error('getAllRegions failed', e);
  }
  return Array.from(set).sort((a,b) => a.localeCompare(b));
}


// =====================================================
// ======= Sterrenverdeling (alleen Jaarhanger = Ja) ====
// =====================================================
async function buildStarBucketsForYearhangerYes(plannedYMDs) {
  // Buckets 0..N (N = aantal geplande datums)
  const N = plannedYMDs.length;
  const buckets = new Array(N + 1).fill(0);
  const plannedSet = new Set(plannedYMDs);

  try {
    let last = null;
    const pageSize = 400;
    while (true) {
      let qRef = query(collection(db, "members"), orderBy("__name__"), limit(pageSize));
      if (last) qRef = query(collection(db, "members"), orderBy("__name__"), startAfter(last), limit(pageSize));
      const snapshot = await getDocs(qRef);
      if (snapshot.empty) break;

      snapshot.forEach((docSnap) => {
        const d = docSnap.data() || {};
        if ((d.Jaarhanger || "").toString() !== "Ja") return; // filter
        const scansRaw = Array.isArray(d.ScanDatums) ? d.ScanDatums : [];
        // normaliseer naar YMD en tel intersectie
        let cnt = 0;
        for (const raw of scansRaw) {
          const ymd = typeof raw === "string" ? raw.slice(0,10) : "";
          if (ymd && plannedSet.has(ymd)) cnt++;
        }
        if (cnt < 0) cnt = 0;
        if (cnt > N) cnt = N;
        buckets[cnt] += 1;
      });

      last = snapshot.docs[snapshot.docs.length - 1];
      if (snapshot.size < pageSize) break;
    }
  } catch (e) {
    console.error("[starDist] bouwen mislukt", e);
  }
  return buckets;
}

let _starDistChart = null;
async function initStarDistributionChart() {
  const canvas = document.getElementById("starDistChart");
  const statusEl = document.getElementById("starDistStatus");
  const reloadBtn = document.getElementById("reloadStarDistBtn");
  if (!canvas) return;

  async function render() {
    try {
      if (statusEl) statusEl.textContent = "Laden…";
      const planned = (await ensureRideDatesLoaded()) || [];
      const plannedYMDs = planned.map(d => (typeof d === "string" ? d.slice(0,10) : "")).filter(Boolean).sort();
      const N = plannedYMDs.length;
      if (!N) { if (statusEl) statusEl.textContent = "Geen geplande datums."; return; }

      const buckets = await buildStarBucketsForYearhangerYes(plannedYMDs);
      const labels = Array.from({length: N+1}, (_,i) => String(i));
      const data = buckets;

      // Destroy oud chart
      try { if (_starDistChart) { _starDistChart.destroy(); _starDistChart = null; } } catch(_) {}

      // eslint-disable-next-line no-undef
      const ctx = canvas.getContext("2d");
      _starDistChart = new Chart(ctx, {
        type: "bar",
        data: {
          labels,
          datasets: [{
            label: "Aantal leden",
            data
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { title: { display: true, text: "Aantal sterren (0.."+N+")" } },
            y: { beginAtZero: true, title: { display: true, text: "Aantal leden" }, ticks: { precision: 0 } }
          },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.y} leden` } }
          }
        }
      });
      const totaal = data.reduce((a,b)=>a+b,0);
      if (statusEl) statusEl.textContent = `✅ Gegevens geladen (leden met Jaarhanger=Ja: ${totaal})`;
    } catch (e) {
      console.error(e);
      if (statusEl) statusEl.textContent = "❌ Laden mislukt";
    }
  }

  await render();
  if (reloadBtn) reloadBtn.addEventListener("click", () => render(), { passive: true });
}

export function initAdminView() {
  const $ = (id) => document.getElementById(id);
  const fileInput = $("fileInput");
  const fileName  = $("fileName");
  const uploadBtn = $("uploadBtn");
  const statusEl  = $("status");
  const logEl     = $("log");

  function log(msg, cls = "") {
    if (!logEl) return;
    const p = document.createElement("div");
    if (cls) p.className = cls;
    p.textContent = msg;
    logEl.appendChild(p);
    logEl.scrollTop = logEl.scrollHeight;
  }
  function setLoading(on) {
    if (uploadBtn) {
      uploadBtn.disabled = on;
      uploadBtn.textContent = on ? "Bezig..." : "Uploaden";
    }
  }

  fileInput?.addEventListener("change", () => {
    const f = fileInput?.files?.[0];
    if (fileName) fileName.textContent = f ? f.name : "Geen bestand gekozen";
  });

  async function readWorkbook(file) {
    const buf = await file.arrayBuffer();
    return XLSX.read(buf, { type: "array" });
  }

  function sheetToRows(wb) {
    const name = wb.SheetNames[0];
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    return rows;
  }

  // ⚠️ Belangrijk: we negeren elke 'ridesCount' uit het bestand
  // zodat bestaande waarden niet overschreven worden.
  function normalizeRows(rows) {
    return rows.map((r) => {
      const out = {};
      for (const k of REQUIRED_COLS) out[k] = (r[k] ?? "").toString().trim();
      // GEEN ridesCount hier!
      return out;
    });
  }

  async function importRowsToFirestore(rows) {
    let total = 0, updated = 0, skipped = 0;
    let batch = writeBatch(db);
    const commit = async () => { await batch.commit(); batch = writeBatch(db); };

    for (const r of rows) {
      total++;
      const id = String(r["LidNr"] || "").trim();
      if (!/^\d+$/.test(id)) { skipped++; continue; }

      // Alleen profielvelden schrijven; ridesCount NIET overschrijven.
      // Gebruik increment(0): behoudt bestaande waarde; als veld ontbreekt → wordt 0.
      const clean = {};
      for (const k of REQUIRED_COLS) clean[k] = r[k];
      clean["ridesCount"] = increment(0);

      batch.set(doc(db, "members", id), clean, { merge: true });
      updated++;

      if (updated % 400 === 0) await commit();
    }
    await commit();
    return { total, updated, skipped };
  }

  let uploading = false;
  async function handleUpload() {
    if (uploading) return; // eenvoudige debounce
    const file = fileInput?.files?.[0];
    if (!file) { if (statusEl) statusEl.textContent = "❗ Kies eerst een bestand"; return; }
    uploading = true;
    setLoading(true);
    if (statusEl) statusEl.textContent = "Bezig met inlezen…";
    if (logEl) logEl.innerHTML = "";

    try {
      const wb   = await readWorkbook(file);
      const rows = normalizeRows(sheetToRows(wb));
      log(`Gelezen rijen: ${rows.length}`);

      if (statusEl) statusEl.textContent = "Importeren naar Firestore…";
      const res = await importRowsToFirestore(rows);
      log(`Klaar. Totaal: ${res.total}, verwerkt: ${res.updated}, overgeslagen: ${res.skipped}`, "ok");
      if (statusEl) statusEl.textContent = "✅ Import voltooid (ridesCount behouden)";
    } catch (e) {
      console.error(e);
      if (statusEl) statusEl.textContent = "❌ Fout tijdens import";
      log(String(e?.message || e), "err");
    } finally {
      setLoading(false);
      uploading = false;
    }
  }

  $("uploadBtn")?.addEventListener("click", handleUpload);

  // ===== Reset-alle-ritten (popup bevestiging) =====
  const resetBtn = document.getElementById("resetRidesBtn");
  const resetStatus = document.getElementById("resetStatus");
  resetBtn?.addEventListener("click", async () => {
    const ok = window.confirm("Weet je zeker dat je ALLE ridesCount waardes naar 0 wilt zetten? Dit kan niet ongedaan worden gemaakt.");
    if (!ok) return;
    await resetAllRidesCount(resetStatus);
  });

  // ===== Reset Jaarhanger (popup bevestiging) =====
  const resetJBtn = document.getElementById("resetJaarhangerBtn");
  const resetJStatus = document.getElementById("resetJaarhangerStatus");
  resetJBtn?.addEventListener("click", async () => {
    const ok = window.confirm("Weet je zeker dat je de Jaarhanger keuze voor ALLE leden wilt resetten naar leeg? Dit kan niet ongedaan worden gemaakt.");
    if (!ok) return;
    await resetAllJaarhanger(resetJStatus);
  });

  // ===== Handmatig rit registreren =====
  initManualRideSection();

  // ===== Ritten plannen (globaal) =====
  initRidePlannerSection();

  // Init QR-scanner sectie (Admin)
  try { initAdminQRScanner(); } catch (_) {}

  // Ritstatistieken
  try { initRideStatsChart(); } catch (_) {}
  // Sterrenverdeling (Jaarhanger=Ja)
  try { initStarDistributionChart(); } catch (_) {}

  try { attachChartExportJPGNextToReload("reloadStarDistBtn", "starDistChart", "btnStarDistJPG", "sterrenverdeling.jpg"); } catch(_) {}
  try { attachChartExportJPGNextToReload("reloadStatsBtn", "rideStatsChart", "btnRideStatsJPG", "inschrijvingen-per-rit.jpg"); } catch(_) {}
}

// =====================================================
// ===============  Ritten plannen (globaal) ===========
// =====================================================
function initRidePlannerSection() {
  const $ = (id) => document.getElementById(id);
  const card = $("ridePlannerCard");
  if (!card) return;

  const d1 = $("rideDate1");
  const d2 = $("rideDate2");
  const d3 = $("rideDate3");
  const d4 = $("rideDate4");
  const d5 = $("rideDate5");
  const d6 = $("rideDate6");
  const saveBtn = $("saveRidePlanBtn");
  const reloadBtn = $("reloadRidePlanBtn");
  const statusEl = $("ridePlanStatus");

  const planRef = doc(db, "globals", "ridePlan");

  function setStatus(msg, ok = true) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.color = ok ? "#9ca3af" : "#ef4444";
  }

  function setInputs(dates) {
    const arr = Array.isArray(dates) ? dates : [];
    const vals = (arr.slice(0,6).concat(Array(6))).slice(0,6).map(v => v || "");
    [d1,d2,d3,d4,d5,d6].forEach((el, i) => { if (el) el.value = vals[i] || ""; });
  }

  async function loadPlan() {
    try {
      setStatus("Laden…");
      const snap = await getDoc(planRef);
      if (snap.exists()) {
        const data = snap.data() || {};
        const dates = Array.isArray(data.plannedDates) ? data.plannedDates : [];
        setInputs(dates);
        setStatus(`✅ ${dates.length} datums geladen`);
      } else {
        setInputs([]);
        setStatus("Nog geen planning opgeslagen.");
      }
    } catch (e) {
      console.error("[ridePlan] loadPlan error", e);
      setStatus("❌ Laden mislukt (controleer regels/verbinding)", false);
    }
  }

  function collectDates() {
    const vals = [d1,d2,d3,d4,d5,d6].map(el => (el && el.value || "").trim()).filter(Boolean);
    const uniq = Array.from(new Set(vals));
    uniq.sort(); // YYYY-MM-DD sort
    return uniq;
  }

  async function savePlan() {
    try {
      const dates = collectDates();
      if (dates.length < 5) {
        setStatus("❗ Vul minimaal 5 datums in.", false);
        return;
      }
      setStatus("Opslaan…");
      await setDoc(planRef, { plannedDates: dates, updatedAt: serverTimestamp() }, { merge: true });
      setStatus("✅ Planning opgeslagen");
    } catch (e) {
      console.error("[ridePlan] savePlan error", e);
      setStatus("❌ Opslaan mislukt (controleer regels/verbinding)", false);
    }
  }

  saveBtn?.addEventListener("click", savePlan);
  reloadBtn?.addEventListener("click", loadPlan);

  // Auto-load bij openen Admin tab
  loadPlan();
}

// =====================================================
// ===============  Helpers (Admin)  ===================
// =====================================================

// Boek rit: ridesCount +1 voor members/{LidNr}
// Boek rit: alleen +1 als gekozen scandatum nog NIET bestaat voor dit lid
async function bookRide(lid, naam, rideDateYMD) {
  const id = String(lid || "").trim();
  if (!id) throw new Error("Geen LidNr meegegeven");

  // Vereiste ritdatum (YYYY-MM-DD)
  const ymd = (rideDateYMD || "").toString().slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error("Geen geldige ritdatum gekozen");

  const memberRef = doc(db, "members", id);

  // Transaction: lees -> check -> conditioneel updaten
  const res = await runTransaction(db, async (tx) => {
    const snap = await tx.get(memberRef);
    const data = snap.exists() ? snap.data() : {};
    const currentCount = Number.isFinite(Number(data?.ridesCount)) ? Number(data.ridesCount) : 0;
    const scans = Array.isArray(data?.ScanDatums) ? data.ScanDatums.map(String) : [];
    const hasDate = scans.includes(ymd);

    if (hasDate) {
      // Geen wijziging; niets bijschrijven
      tx.set(memberRef, { ridesCount: currentCount, ScanDatums: scans.length ? scans : [] }, { merge: true });
      return { changed: false, newTotal: currentCount, ymd };
    } else {
      const newTotal = currentCount + 1;
      tx.set(memberRef, { ridesCount: increment(1), ScanDatums: arrayUnion(ymd) }, { merge: true });
      return { changed: true, newTotal, ymd };
    }
  });

  return { id, ...res };
}



// Extract LidNr uit QR-tekst of URL
function extractLidFromText(text) {
  if (!text) return null;

  // 1) JSON payload? e.g., {"t":"member","uid":"12345"}
  try {
    const obj = JSON.parse(text);
    const cand = obj?.uid || obj?.id || obj?.member || obj?.lid || obj?.lidnr;
    if (cand) return String(cand).trim();
  } catch (_) {}

  // 2) Key:value in plain text e.g., "lidnr: 12345"
  const m1 = text.match(/lidnr\s*[:=]\s*([\w-]+)/i);
  if (m1) return m1[1].trim();

  // 3) URL met query params
  try {
    const u = new URL(text);
    const lid = u.searchParams.get("lid") || u.searchParams.get("lidnr") ||
                u.searchParams.get("member") || u.searchParams.get("id") || u.searchParams.get("uid");
    if (lid) return lid.trim();
  } catch (_) {}

  // 4) Fallback: willekeurige 3+ cijferreeks
  const m2 = text.match(/\b(\d{3,})\b/);
  if (m2) return m2[1];

  return null;
}

function showToast(msg, ok = true) {
  const root = document.getElementById("toast-root") || document.body;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  if (!ok) el.style.background = "#ef4444";
  root.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function hhmmss(d = new Date()) { return d.toTimeString().slice(0, 8); }

// =====================================================
// ============ Handmatig rit registreren  =============
// =====================================================
function initManualRideSection() {
  const $ = (id) => document.getElementById(id);
  const input   = $("adminManualSearchInput");
  const clear   = $("adminManualClear");
  const list    = $("adminManualSuggest");
  const box     = $("adminManualResult");
  const err     = $("adminManualError");
  const sName   = $("adminMName");
  const sId     = $("adminMMemberNo");
  const sCount  = $("adminMRidesCount");
  const status  = $("adminManualStatus");
  const rideButtons = $("adminRideButtons");
  const rideHint = $("adminRideHint");
  let selectedRideDate = null;

  async function attemptBooking(dateYMD) {
    if (!selected) { status.textContent = "Kies eerst een lid."; status.classList.add("error"); return; }
    status.classList.remove("error");
    status.textContent = "Bezig met registreren…";
    try {
      const out = await bookRide(selected.id, sName.textContent || "", dateYMD);
      status.textContent = out.changed
        ? `✅ Rit geregistreerd op ${out.ymd} (totaal: ${out.newTotal})`
        : `ℹ️ Deze datum (${out.ymd}) was al geregistreerd — niets aangepast.`;
      // Update hint
      if (rideHint) rideHint.textContent = `Geregistreerd op: ${out.ymd}`;
    } catch (e) {
      console.error(e);
      status.textContent = "❌ Fout bij registreren";
      status.classList.add("error");
    }
  }

  if (!input || !list || !box) return; // UI niet aanwezig

  let selected = null;
  let unsub = null;

  function fullNameFrom(d) {
    const tussen = (d?.["Tussen voegsel"] || "").toString().trim();
    const parts = [
      (d?.["Voor naam"] || "").toString().trim(),
      d?.["Voor letters"] ? `(${(d["Voor letters"]+"").trim()})` : "",
      tussen,
      (d?.["Naam"] || d?.["name"] || d?.["naam"] || "").toString().trim()
    ].filter(Boolean);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  function hideSuggest() { list.innerHTML = ""; list.style.display = "none"; }
  function showSuggest(items) {
    list.innerHTML = "";
    for (const it of items) {
      const li = document.createElement("li");
      li.textContent = `${fullNameFrom(it.data)} — ${it.id}`;
      li.addEventListener("click", () => {
        selectMember(it);
        hideSuggest();
      }, { passive: true });
      list.appendChild(li);
    }
    list.style.display = items.length ? "block" : "none";
  }

  // Zoeken: probeer "Naam" → "naam" → "name", anders fallback
  async function queryByLastNamePrefix(prefix) {
    if (!prefix) return [];
    const maxResults = 10;
    try {
      const qName = query(collection(db, "members"), orderBy("Naam"), startAt(prefix), endAt(prefix + "\uf8ff"), limit(maxResults));
      const qVoor = query(collection(db, "members"), orderBy("Voor naam"), startAt(prefix), endAt(prefix + "\uf8ff"), limit(maxResults));
      const [snapName, snapVoor] = await Promise.all([getDocs(qName), getDocs(qVoor)]);
      const map = new Map();
      snapName.forEach(d => { if (!map.has(d.id)) map.set(d.id, { id: d.id, data: d.data() }); });
      snapVoor.forEach(d => { if (!map.has(d.id)) map.set(d.id, { id: d.id, data: d.data() }); });
      const res = Array.from(map.values()).slice(0, maxResults);
      return res;
    } catch (e) {
      console.error('queryByLastNamePrefix (admin) failed', e);
      // As a last resort, return empty so caller can handle
      return [];
    }
  }

  function resetSelection() {
    selected = null;
    box.style.display = "none";
    err.style.display = "none";
    status.textContent = "";
    try { if (unsub) unsub(); } catch(_) {}
    unsub = null;
  }

  async function onFocus() {
    resetSelection();           // QR/kaart direct verbergen
    const term = (input.value || "").trim();
    if (term.length >= 1) {
      try {
        const items = await queryByLastNamePrefix(term);
        if (items && items.length) showSuggest(items);
        else hideSuggest();
      } catch {
        hideSuggest();
      }
    } else {
      hideSuggest();
    }
  }

  async function onInput() {
    resetSelection();
    const term = (input.value || "").trim();
    if (term.length < 2) { hideSuggest(); return; }
    try {
      const items = await queryByLastNamePrefix(term);
      showSuggest(items);
    } catch (e) {
      console.error(e);
      hideSuggest();
    }
  }

  async function renderRideChoices(){
    if (!rideButtons) return;
    rideButtons.innerHTML = "";
    selectedRideDate = null;
    try {
      const dates = await ensureRideDatesLoaded();

      // Toon alleen datums t/m vandaag (geen toekomst)
      const today = new Date();
      const todayYMD = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())).toISOString().slice(0,10);
      const visibleDates = (dates || [])
        .map(d => (typeof d === "string" ? d.slice(0,10) : ""))
        .filter(Boolean)
        .filter(d => d.localeCompare(todayYMD) <= 0);

      if (!visibleDates.length) {
        rideButtons.innerHTML = '<span class="muted">Geen geplande ritdatums gevonden.</span>';
        if (rideHint) rideHint.textContent = "Geen (verleden/heden) ritdatums.";
        return;
      }

      const frag = document.createDocumentFragment();
      visibleDates.forEach((d) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chip";
        btn.textContent = d;
        btn.setAttribute("aria-pressed", "false");
        btn.addEventListener("click", async () => {
          selectedRideDate = d;
          if (rideHint) rideHint.textContent = `Registreren voor: ${d}`;
          await attemptBooking(d); // DIRECT boeken bij klik
        }, { passive: true });
        frag.appendChild(btn);
      });

      rideButtons.appendChild(frag);
      if (rideHint) rideHint.textContent = "Klik op een datum om direct te registreren.";
    } catch(e) {
      console.error(e);
      rideButtons.innerHTML = '<span class="error">Kon ritdatums niet laden.</span>';
    }
  }

  function selectMember(entry) {
    selected = entry;
    sName.textContent = fullNameFrom(entry.data);
    sId.textContent = entry.id;
    // Show stars based on planned dates vs. ScanDatums (like member view)
    (async () => {
      try {
        const planned = await getPlannedDates();
        const scanDatums = Array.isArray(entry.data?.ScanDatums) ? entry.data.ScanDatums : [];
  const { stars, starsHtml, tooltip, planned: plannedNorm } = plannedStarsWithHighlights(planned, scanDatums);
  sCount.innerHTML = starsHtml || "—";
  sCount.setAttribute('title', stars ? tooltip : 'Geen ingeplande datums');
      } catch (e) {
        const v = typeof entry.data?.ridesCount === "number" ? entry.data.ridesCount : 0;
        sCount.textContent = String(v);
      }
    })();
    box.style.display = "grid";
    renderRideChoices();

    // realtime teller
    try { if (unsub) unsub(); } catch(_) {}
    const ref = doc(collection(db, "members"), entry.id);
    unsub = onSnapshot(ref, (snap) => {
      const d = snap.exists() ? snap.data() : null;
      (async () => {
        try {
          const planned = await getPlannedDates();
          const scanDatums = d && Array.isArray(d.ScanDatums) ? d.ScanDatums : [];
          const { stars, starsHtml, tooltip } = plannedStarsWithHighlights(planned, scanDatums);
          sCount.innerHTML = starsHtml || "—";
          if (stars) sCount.setAttribute('title', tooltip);
          else sCount.removeAttribute('title');
        } catch (e) {
          const c = d && typeof d.ridesCount === "number" ? d.ridesCount : 0;
          sCount.textContent = String(c);
        }
      })();
    }, (e) => console.error(e));
  }

  input.addEventListener("focus", onFocus, { passive: true });
  input.addEventListener("input", onInput, { passive: true });
  input.addEventListener("keydown", async (ev) => {
    if (ev.key === "Escape") hideSuggest();
    if (ev.key === "Enter") {
      ev.preventDefault();
      const term = (input.value || "").trim();
      if (!term) { hideSuggest(); return; }
      try {
        const items = await queryByLastNamePrefix(term);
        // GEEN auto-select meer: alleen suggesties verversen
        if (items && items.length) showSuggest(items);
        else { err.textContent = "Geen leden gevonden."; err.style.display = "block"; hideSuggest(); }
      } catch (e) {
        err.textContent = "Zoeken mislukt."; err.style.display = "block";
        hideSuggest();
      }
    }
  });

  clear?.addEventListener("click", () => {
    input.value = "";
    hideSuggest();
    resetSelection();
  });
}

// =====================================================
// ===============  QR SCANNER (Admin)  ================
// =====================================================
function initAdminQRScanner() {
  const $ = (id) => document.getElementById(id);
  const startBtn = $("adminScanStart");
  const stopBtn  = $("adminScanStop");
  const statusEl = $("adminQRStatus");
  const readerEl = $("adminQRReader");
  const resultEl = $("adminQRResult");

  function ensureLogContainer() {
    let log = document.getElementById("adminQRLog");
    if (!log) {
      log = document.createElement("div");
      log.id = "adminQRLog";
      log.style.marginTop = "10px";
      log.innerHTML = `<h4 style="margin:6px 0 6px;">Registraties</h4><div id="adminQRLogList" class="qr-log-list"></div>`;
      (resultEl?.parentElement || readerEl?.parentElement || readerEl)?.appendChild(log);
    }
    return document.getElementById("adminQRLogList");
  }
  const qrLogList = ensureLogContainer();

  let scanner = null;
  let lastScanByText = new Map(); // decodedText -> timestamp(ms)
  const COOLDOWN_MS = 30000; // 30 seconden

  function appendLog({ naam, lid, ok, reason, ridesTotal }) {
    if (!qrLogList) return;
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.gap = "8px";
    row.style.padding = "10px 12px";
    row.style.border = "1px solid #1f2937";
    row.style.borderRadius = "12px";
    row.style.marginBottom = "6px";
    row.style.background = ok ? "#0f1d12" : "#1a0f0f";

    const left = document.createElement("div");
    left.textContent = `${hhmmss()} — ${naam ? naam + " " : ""}${lid ? "(LidNr: " + lid + ")" : "(onbekend)"}`;
    const right = document.createElement("div");
    right.textContent = ok
      ? `✓ bijgewerkt${(ridesTotal ?? ridesTotal === 0) ? " — totaal: " + ridesTotal : ""}`
      : `✗ ${reason || "geweigerd"}`;
    row.appendChild(left);
    row.appendChild(right);

    qrLogList.prepend(row);
  }

  async function processScan(decodedText) {
    const now = Date.now();
    const prev = lastScanByText.get(decodedText) || 0;
    if (now - prev < COOLDOWN_MS) return;
    lastScanByText.set(decodedText, now);

    let lid = extractLidFromText(decodedText || "");
    let naam = "";
    let beforeCount = null;

    if (!lid) {
      if (statusEl) statusEl.textContent = "⚠️ Geen LidNr in QR";
      showToast("⚠️ Onbekende QR (geen LidNr)", false);
      appendLog({ naam: "", lid: "", ok: false, reason: "geen LidNr" });
      return;
    }

    try {
      try {
        const snap = await getDoc(doc(db, "members", String(lid)));
        if (snap.exists()) {
          const d = snap.data();
          const composed = `${(d["Voor naam"]||"").toString().trim()} ${(d["Tussen voegsel"]||"").toString().trim()} ${(d["Naam"]||d["name"]||d["naam"]||"").toString().trim()}`
            .replace(/\s+/g, " ").trim();
          naam = composed || (d["Naam"] || d["name"] || d["naam"] || "");
          const rc = Number(d?.ridesCount);
          beforeCount = Number.isFinite(rc) ? rc : 0;
        } else {
          beforeCount = 0;
        }
      } catch (e) {
        beforeCount = (beforeCount ?? 0);
      }

      const todayYMD = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())).toISOString().slice(0,10);
      // Ensure planned dates are loaded and only book if today is a planned ride date
      try {
        await ensureRideDatesLoaded();
      } catch (e) { /* ignore, fallback to empty list */ }
      if (!Array.isArray(PLANNED_DATES) || !PLANNED_DATES.includes(todayYMD)) {
        // Do not book when today is not a planned ride date
        if (statusEl) statusEl.textContent = `ℹ️ ${todayYMD} is geen geplande ritdatum — registratie overgeslagen.`;
        showToast('ℹ️ Niet op geplande ritdatum — niet geregistreerd', true);
        appendLog({ naam: naam || "", lid, ok: false, reason: 'niet geplande datum' });
        return;
      }
      const out = await bookRide(lid, naam || "", todayYMD);
      const newTotal = out.newTotal;

      if (statusEl) statusEl.textContent = out.changed
        ? `✅ Rit +1 voor ${naam || "(onbekend)"} (${lid}) op ${out.ymd}`
        : `ℹ️ ${naam || "(onbekend)"} (${lid}) had ${out.ymd} al geregistreerd — niets aangepast.`;
      if (resultEl) resultEl.textContent = `Gescand: ${naam ? "Naam: " + naam + " " : ""}(LidNr: ${lid})`;
      showToast(out.changed ? "✅ QR-code gescand" : "ℹ️ Reeds geregistreerd", true);
      appendLog({ naam: naam || "", lid, ok: true, ridesTotal: newTotal });
    } catch (e) {
      console.error(e);
      if (statusEl) statusEl.textContent = `❌ Fout bij updaten: ${e?.message || e}`;
      showToast("❌ Fout bij updaten", false);
      appendLog({ naam: naam || "", lid, ok: false, reason: "update fout" });
    }
  }

  function onScanSuccess(decodedText) { processScan(decodedText); }
  function onScanError(_) { /* stil */ }

  async function start() {
    if (statusEl) statusEl.textContent = "Camera openen…";
    try { await ensureHtml5Qrcode(); } catch(e) {
      if (statusEl) statusEl.textContent = "Bibliotheek niet geladen.";
      showToast("Bibliotheek niet geladen", false);
      return;
    }
    try { if (scanner && scanner.clear) await scanner.clear(); } catch(_) {}
    if (readerEl) readerEl.innerHTML = "";
    // eslint-disable-next-line no-undef
    scanner = new Html5QrcodeScanner("adminQRReader", { fps: 10, qrbox: 250, aspectRatio: 1.333 }, false);
    scanner.render(onScanSuccess, onScanError);
    if (statusEl) statusEl.textContent = "Richt je camera op de QR-code…";
  }

  async function stop() {
    if (statusEl) statusEl.textContent = "Stoppen…";
    try { if (scanner && scanner.clear) await scanner.clear(); } catch(_) {}
    scanner = null;
    if (readerEl) readerEl.innerHTML = "";
    if (statusEl) statusEl.textContent = "⏸️ Gestopt";
  }

  startBtn?.addEventListener("click", start);
  stopBtn?.addEventListener("click", stop);
}

// ===== Firestore helper: reset alle ridesCount in batches ======
async function resetAllRidesCount(statusEl) {
  if (!statusEl) return;
  statusEl.textContent = "Voorbereiden…";
  let total = 0;

  try {
    let last = null;
    const pageSize = 400; // veilig onder batch-limiet

    while (true) {
      let qRef = query(collection(db, "members"), orderBy("__name__"), limit(pageSize));
      if (last) qRef = query(collection(db, "members"), orderBy("__name__"), startAfter(last), limit(pageSize));

      const snapshot = await getDocs(qRef);
      if (snapshot.empty) break;

      let batch = writeBatch(db);
      snapshot.forEach((docSnap) => {
        batch.set(doc(db, "members", docSnap.id), { ridesCount: 0, ScanDatums: [] }, { merge: true });
      });
      await batch.commit();
      total += snapshot.size;
      statusEl.textContent = `Gerest: ${total} leden…`;

      last = snapshot.docs[snapshot.docs.length - 1];
      if (snapshot.size < pageSize) break;
    }

    statusEl.textContent = `✅ Klaar. Alle ridesCount naar 0 gezet voor ${total} leden.`;
  } catch (e) {
    console.error(e);
    statusEl.textContent = `❌ Fout bij resetten: ${e?.message || e}`;
  }
}

// ===== Firestore helper: reset alle Jaarhanger waarden in batches ======
async function resetAllJaarhanger(statusEl) {
  if (!statusEl) return;
  statusEl.textContent = "Voorbereiden…";
  let total = 0;

  try {
    let last = null;
    const pageSize = 400; // veilig onder batch-limiet

    while (true) {
      let qRef = query(collection(db, "members"), orderBy("__name__"), limit(pageSize));
      if (last) qRef = query(collection(db, "members"), orderBy("__name__"), startAfter(last), limit(pageSize));

      const snapshot = await getDocs(qRef);
      if (snapshot.empty) break;

      let batch = writeBatch(db);
      snapshot.forEach((docSnap) => {
        // set Jaarhanger to empty string "" (explicitly)
        batch.set(doc(db, "members", docSnap.id), { Jaarhanger: "" }, { merge: true });
      });
      await batch.commit();
      total += snapshot.size;
      statusEl.textContent = `Gerest Jaarhanger voor: ${total} leden…`;

      last = snapshot.docs[snapshot.docs.length - 1];
      if (snapshot.size < pageSize) break;
    }

    statusEl.textContent = `✅ Klaar. Jaarhanger gereset voor ${total} leden.`;
  } catch (e) {
    console.error(e);
    statusEl.textContent = `❌ Fout bij resetten Jaarhanger: ${e?.message || e}`;
  }
}

// ===== Hoofdadmin Tab 4: Excel export logic =====
async function exportMembersExcel() {
  const status = document.getElementById("exportExcelStatus");
  try {
    if (status) status.textContent = "Bezig met ophalen...";
    // Haal alle leden op
    const snap = await getDocs(collection(db, "members"));
    const rows = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data() || {};
      const naam = d.Naam ?? d.naam ?? d.lastName ?? d.achternaam ?? "";
      const tussen = d["Tussen voegsel"] ?? d.tussenvoegsel ?? d.tussenVoegsel ?? d.tussen ?? d.infix ?? "";
      const voorletters = d["Voor letters"] ?? d.voorletters ?? d.initialen ?? d.initials ?? "";
      const voornaam = d["Voor naam"] ?? d.voornaam ?? d.firstName ?? d.naamVoor ?? "";
      const rides = (typeof d.ridesCount === "number") ? d.ridesCount
                   : (typeof d.rittenCount === "number") ? d.rittenCount
                   : (typeof d.ritten === "number") ? d.ritten : 0;
      let regioOms = d["Regio Omschrijving"] ?? d.regioOmschrijving ?? "";
      if (!regioOms && d.regio && typeof d.regio === "object") {
        regioOms = d.regio.omschrijving ?? d.regio.name ?? d.regio.title ?? "";
      }
      rows.push({
        "Naam": String(naam || ""),
        "Tussen voegsel": String(tussen || ""),
        "Voor letters": String(voorletters || ""),
        "Voor naam": String(voornaam || ""),
        "ridesCount": rides,
        "Regio Omschrijving": String(regioOms || ""),
      });
    });

    const headers = ["Naam","Tussen voegsel","Voor letters","Voor naam","ridesCount","Regio Omschrijving"];
    // XLSX (SheetJS) als beschikbaar
    try {
      if (typeof XLSX !== "undefined" && XLSX.utils && XLSX.write) {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
        XLSX.utils.book_append_sheet(wb, ws, "Leden");
        const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const a = document.createElement("a");
        const url = URL.createObjectURL(blob);
        a.href = url;
        const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,"-");
        a.download = `leden_export_${ts}.xlsx`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
        if (status) status.textContent = `Gereed • ${rows.length} leden`;
        return;
      }
    } catch (e) {
      console.warn("XLSX export faalde, fallback CSV:", e);
    }

    // CSV fallback
    const csvRows = [headers.join(",")];
    for (const r of rows) {
      const vals = headers.map(h => {
        const v = r[h] ?? "";
        const s = String(v).replace(/"/g,'""');
        return `"${s}"`;
      });
      csvRows.push(vals.join(","));
    }
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,"-");
    a.download = `leden_export_${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
    if (status) status.textContent = `Gereed • ${rows.length} leden`;
  } catch (e) {
    console.error("Export mislukt:", e);
    if (status) status.textContent = "Mislukt";
    alert("Export mislukt. Controleer de console voor details.");
  }
}

// Koppel button (bij initialisatie admin)
function initTab4ExcelExportHook() {
  const btn = document.getElementById("exportExcelBtn");
  if (!btn) return;
  if (!btn.dataset._wired) {
    btn.addEventListener("click", exportMembersExcel);
    btn.dataset._wired = "1";
  }
}

// Integreer in bestaande admin-init flow
document.addEventListener("DOMContentLoaded", () => { try { initTab4ExcelExportHook(); } catch(_) {} });
document.getElementById("adminSubtabs")?.addEventListener("click", () => {
  setTimeout(() => { try { initTab4ExcelExportHook(); } catch(_) {} }, 0);
});
if (window.MutationObserver) {
  const adminView = document.getElementById("viewAdmin");
  if (adminView) {
    const mo = new MutationObserver(() => { try { initTab4ExcelExportHook(); } catch(_) {} });
    mo.observe(adminView, { childList: true, subtree: true });
  }
}
