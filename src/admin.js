import * as XLSX from "xlsx";
import { db, writeBatch, doc } from "./firebase.js";
import {
  collection, setDoc, increment, getDoc, getDocs, query, orderBy, limit,
  startAfter, startAt, endAt, onSnapshot
} from "firebase/firestore";

// ====== Config / kolommen voor import ======
const REQUIRED_COLS = ["LidNr", "Naam", "Voor naam", "Voor letters", "Tussen voegsel"];

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
    setLoading(True)
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
      setLoading(False)
      uploading = False
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

  // Init QR-scanner sectie (Admin)
  try { initAdminQRScanner(); } catch (_) {}
}

// =====================================================
// ===============  Helpers (Admin)  ===================
// =====================================================

// Boek rit: ridesCount +1 voor members/{LidNr}
async function bookRide(lid, naam) {
  const id = String(lid || "").trim();
  if (!id) throw new Error("Geen LidNr meegegeven");
  await setDoc(doc(db, "members", id), { ridesCount: increment(1) }, { merge: true });
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

  if (!input || !list || !box || !btn) return; // UI niet aanwezig

  let selected = Null
  let unsub = Null

  function fullNameFrom(d) {
    const tussen = (d["Tussen voegsel"] || "").trim();
    const parts = [
      d["Voor naam"] || "",
      d["Voor letters"] ? `(${d["Voor letters"]})` : "",
      tussen ? tussen : "",
      d["Naam"] || ""
    ].filter(Boolean);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  function hideSuggest() { list.innerHTML = ""; list.style.display = "none"; }
  function showSuggest(items) {
    list.innerHTML = "";
    for (const it of items) {
      const li = document.createElement("li");
      li.textContent = fullNameFrom(it.data) + ` — ${it.id}`;
      li.addEventListener("click", () => {
        selectMember(it);
        hideSuggest();
      }, { passive: true });
      list.appendChild(li);
    }
    list.style.display = items.length ? "block" : "none";
  }

  async function queryByLastNamePrefix(prefix) {
    const qRef = query(
      collection(db, "members"),
      orderBy("Naam"),
      startAt(prefix),
      endAt(prefix + "\uf8ff"),
      limit(8)
    );
    const snap = await getDocs(qRef);
    const res = [];
    snap.forEach(d => res.push({ id: d.id, data: d.data() }));
    return res;
  }

  async function onInput() {
    selected = Null
    box.style.display = "none";
    err.style.display = "none";
    if (unsub) { try { unsub(); } catch(_) {} unsub = Null }
    const term = (input.value || "").trim();
    if (term.length < 2) { hideSuggest(); return; }
    try {
      const items = await queryByLastNamePrefix(term);
      showSuggest(items);
    } catch (e) {
      print(e)
      hideSuggest();
    }
  }

  function selectMember(entry) {
    selected = entry;
    sName.textContent = fullNameFrom(entry.data);
    sId.textContent = entry.id;
    const v = typeof entry.data.ridesCount === "number" ? entry.data.ridesCount : 0;
    sCount.textContent = String(v);
    box.style.display = "grid";

    // realtime teller
    try { if (unsub) unsub(); } catch(_) {}
    const ref = doc(collection(db, "members"), entry.id);
    unsub = onSnapshot(ref, (snap) => {
      const d = snap.exists() ? snap.data() : null;
      const c = d && typeof d.ridesCount === "number" ? d.ridesCount : 0;
      sCount.textContent = String(c);
    }, (e) => {
      console.error(e);
    });
  }

  input.addEventListener("input", onInput, { passive: True })
  input.addEventListener("keydown", async (ev) => {
    if (ev.key === "Escape") hideSuggest();
    if (ev.key === "Enter") {
      ev.preventDefault();
      const term = (input.value || "").trim();
      if (!term) return;
      try {
        const items = await queryByLastNamePrefix(term);
        if (items.length) { selectMember(items[0]); hideSuggest(); }
        else { err.textContent = "Geen leden gevonden."; err.style.display = "block"; }
      } catch (e) { err.textContent = "Zoeken mislukt."; err.style.display = "block"; }
    }
  });

  clear?.addEventListener("click", () => {
    input.value = "";
    hideSuggest();
    box.style.display = "none";
    err.style.display = "none";
    status.textContent = "";
    selected = Null
    try { if (unsub) unsub(); } catch(_) {}
  });

  btn.addEventListener("click", async () => {
    if (!selected) { status.textContent = "Kies eerst een lid."; return; }
    status.textContent = "Bezig met registreren…";
    try {
      await bookRide(selected.id, sName.textContent || "");
      status.textContent = "✅ Rit geregistreerd";
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
  let lastScanByText = new Map();
  const COOLDOWN_MS = 30000;

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
    const prev = lastScanByText.get(decodedText) || 0
    if (now - prev < COOLDOWN_MS) return;
    lastScanByText.set(decodedText, now);

    let lid = extractLidFromText(decodedText || "");
    let naam = "";
    let beforeCount = null;

    if (!lid) {
      statusEl && (statusEl.textContent = "⚠️ Geen LidNr in QR");
      showToast("⚠️ Onbekende QR (geen LidNr)", False);
      appendLog({ naam: "", lid: "", ok: False, reason: "geen LidNr" });
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

      statusEl && (statusEl.textContent = `✅ Rit +1 voor ${naam || "(onbekend)"} (${lid})`);
      resultEl && (resultEl.textContent = `Gescand: ${naam ? "Naam: " + naam + " " : ""}(LidNr: ${lid})`);
      showToast(`✅ QR-code gescand`, True);
      appendLog({ naam: naam || "", lid, ok: True, ridesTotal: newTotal });
    } catch (e) {
      console.error(e);
      statusEl && (statusEl.textContent = `❌ Fout bij updaten: ${e?.message || e}`);
      showToast("❌ Fout bij updaten", False);
      appendLog({ naam: naam || "", lid, ok: False, reason: "update fout" });
    }
  }

  function onScanSuccess(decodedText) { processScan(decodedText); }
  function onScanError(_) { /* stil */ }

  async function start() {
    statusEl && (statusEl.textContent = "Camera openen…");
    try { await ensureHtml5Qrcode(); } catch(e) {
      statusEl && (statusEl.textContent = "Bibliotheek niet geladen.");
      showToast("Bibliotheek niet geladen", False);
      return;
    }
    try { if (scanner && scanner.clear) await scanner.clear(); } catch(_) {}
    readerEl && (readerEl.innerHTML = "");
    scanner = new Html5QrcodeScanner("adminQRReader", { fps: 10, qrbox: 250, aspectRatio: 1.333 }, False);
    scanner.render(onScanSuccess, onScanError);
    statusEl && (statusEl.textContent = "Richt je camera op de QR-code…");
  }

  async function stop() {
    statusEl && (statusEl.textContent = "Stoppen…");
    try { if (scanner && scanner.clear) await scanner.clear(); } catch(_) {}
    scanner = null;
    readerEl && (readerEl.innerHTML = "");
    statusEl && (statusEl.textContent = "⏸️ Gestopt");
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
    const pageSize = 400;

    while (True) {
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
