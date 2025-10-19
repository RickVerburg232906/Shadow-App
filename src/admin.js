import * as XLSX from "xlsx";
import { db, writeBatch, doc } from "./firebase.js";
import { arrayUnion, collection, endAt, getDoc, getDocs, increment, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, startAfter, startAt } from "firebase/firestore";

// ====== Globale ritdatums cache ======
let PLANNED_DATES = [];
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

  // ===== Handmatig rit registreren =====
  initManualRideSection();

  // ===== Ritten plannen (globaal) =====
  initRidePlannerSection();

  // Init QR-scanner sectie (Admin)
  try { initAdminQRScanner(); } catch (_) {}
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
async function bookRide(lid, naam, rideDateYMD) {
  const id = String(lid || "").trim();
  if (!id) throw new Error("Geen LidNr meegegeven");

  
// Vereiste ritdatum (YYYY-MM-DD)
const ymd = (rideDateYMD || "").toString().slice(0,10);
if(!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error("Geen geldige ritdatum gekozen");



  await setDoc(doc(db, "members", id), {
    ridesCount: increment(1),
    ScanDatums: arrayUnion(ymd)
  }, { merge: true });

  return id;
}

// Extract LidNr uit QR-tekst of URL
function extractLidFromText(text) {
  if (!text) return null;
  const m1 = text.match(/lidnr\s*:\s*([\w-]+)/i);
  if (m1) return m1[1].trim();
  try {
    const u = new URL(text);
    const lid = u.searchParams.get("lid") || u.searchParams.get("lidnr") ||
                u.searchParams.get("member") || u.searchParams.get("id");
    if (lid) return lid.trim();
  } catch (_) {}
  const m2 = text.match(/\b(\d{3,})\b/);
  if (m2) return m2[1];
  return null;
}

// Toast via #toast-root (safe area aware)
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
  const btn     = $("adminManualBookBtn");
  const status  = $("adminManualStatus");
  const rideButtons = $("adminRideButtons");
  const rideHint = $("adminRideHint");
  let selectedRideDate = null;

  if (!input || !list || !box || !btn) return; // UI niet aanwezig

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
    const fields = ["Naam", "naam", "name"];
    for (const fld of fields) {
      try {
        const qRef = query(collection(db, "members"), orderBy(fld), startAt(prefix), endAt(prefix + "\uf8ff"), limit(10));
        const snap = await getDocs(qRef);
        const rows = [];
        snap.forEach(d => rows.push({ id: d.id, data: d.data() }));
        if (rows.length) return rows;
      } catch (_) {}
    }
    // Fallback: eerste 200 documenten en client-side filter
    try {
      const qRef = query(collection(db, "members"), orderBy("__name__"), limit(200));
      const snap = await getDocs(qRef);
      const rows = [];
      snap.forEach(d => rows.push({ id: d.id, data: d.data() }));
      const p = prefix.toLowerCase();
      return rows.filter(r => {
        const ln = (r.data?.["Naam"] || r.data?.["name"] || r.data?.["naam"] || "").toString().toLowerCase();
        return ln.startsWith(p);
      }).slice(0, 10);
    } catch (_) {
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
    if (!dates.length) {
      rideButtons.innerHTML = '<span class="muted">Geen geplande ritdatums gevonden.</span>';
      return;
    }
    const frag = document.createDocumentFragment();
    dates.forEach((d) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.textContent = d;
      btn.setAttribute("aria-pressed", "false");
      btn.addEventListener("click", () => {
        selectedRideDate = d;
        Array.from(rideButtons.querySelectorAll('.chip')).forEach(el => el.classList.remove('selected'));
        btn.classList.add('selected');
        if (rideHint) rideHint.textContent = `Gekozen ritdatum: ${d}`;
      }, { passive: true });
      frag.appendChild(btn);
    });
    rideButtons.appendChild(frag);
    if (rideHint) rideHint.textContent = dates.length ? "Kies een ritdatum hieronder." : "";
  } catch(e) {
    console.error(e);
    rideButtons.innerHTML = '<span class="error">Kon ritdatums niet laden.</span>';
  }
}

  function selectMember(entry) {
    selected = entry;
    sName.textContent = fullNameFrom(entry.data);
    sId.textContent = entry.id;
    const v = typeof entry.data?.ridesCount === "number" ? entry.data.ridesCount : 0;
    sCount.textContent = String(v);
    box.style.display = "grid";
    renderRideChoices();

    // realtime teller
    try { if (unsub) unsub(); } catch(_) {}
    const ref = doc(collection(db, "members"), entry.id);
    unsub = onSnapshot(ref, (snap) => {
      const d = snap.exists() ? snap.data() : null;
      const c = d && typeof d.ridesCount === "number" ? d.ridesCount : 0;
      sCount.textContent = String(c);
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

  btn.addEventListener("click", async () => {
    if (!selected) { status.textContent = "Kies eerst een lid."; return; }
    status.textContent = "Bezig met registreren…";
    try {
      if (!selectedRideDate) { status.textContent = "Kies eerst een ritdatum hieronder."; return; }
      await bookRide(selected.id, sName.textContent || "", selectedRideDate);
      status.textContent = `✅ Rit geregistreerd op ${selectedRideDate}`;
    } catch (e) {
      console.error(e);
      status.textContent = "❌ Fout bij registreren";
    }
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

      await bookRide(lid, naam || "");
      const newTotal = (beforeCount ?? 0) + 1;

      if (statusEl) statusEl.textContent = `✅ Rit +1 voor ${naam || "(onbekend)"} (${lid})`;
      if (resultEl) resultEl.textContent = `Gescand: ${naam ? "Naam: " + naam + " " : ""}(LidNr: ${lid})`;
      showToast(`✅ QR-code gescand`, true);
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
        batch.set(doc(db, "members", docSnap.id), { ridesCount: 0 }, { merge: true });
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