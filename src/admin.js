import * as XLSX from "xlsx";
import { db, writeBatch, doc } from "./firebase.js";
import { collection, setDoc, increment, getDoc } from "firebase/firestore";

// ====== Config / kolommen voor import ======
const REQUIRED_COLS = ["LidNr", "Naam", "Voor naam", "Voor letters", "Tussen voegsel"];
const ENABLE_STORAGE_UPLOAD = false; // alleen gebruiken als je Storage & rules goed hebt staan

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
    const f = fileInput.files?.[0];
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

  function normalizeRows(rows) {
    // Zorgt dat vereiste kolommen bestaan; zet ridesCount (optioneel) naar nummer
    return rows.map((r) => {
      const out = {};
      for (const k of REQUIRED_COLS) out[k] = (r[k] ?? "").toString().trim();
      const rc = r["ridesCount"];
      out["ridesCount"] = rc === "" || rc === undefined ? 0 : Number(rc);
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
      if (!id) { skipped++; continue; }

      const clean = {};
      for (const k of REQUIRED_COLS) clean[k] = r[k];
      clean["ridesCount"] = Number(r["ridesCount"] ?? 0);

      batch.set(doc(db, "members", id), clean, { merge: true });
      updated++;

      if (updated % 400 === 0) await commit();
    }
    await commit();
    return { total, updated, skipped };
  }

  async function handleUpload() {
    const file = fileInput?.files?.[0];
    if (!file) { statusEl.textContent = "❗ Kies eerst een bestand"; return; }
    setLoading(true);
    statusEl.textContent = "Bezig met inlezen…";
    logEl && (logEl.innerHTML = "");

    try {
      const wb   = await readWorkbook(file);
      const rows = normalizeRows(sheetToRows(wb));
      log(`Gelezen rijen: ${rows.length}`);

      statusEl.textContent = "Importeren naar Firestore…";
      const res = await importRowsToFirestore(rows);
      log(`Klaar. Totaal: ${res.total}, verwerkt: ${res.updated}, overgeslagen: ${res.skipped}`, "ok");
      statusEl.textContent = "✅ Import voltooid";
    } catch (e) {
      console.error(e);
      statusEl.textContent = "❌ Fout tijdens import";
      log(String(e?.message || e), "err");
    } finally {
      setLoading(false);
    }
  }

  $("uploadBtn")?.addEventListener("click", handleUpload);

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
  // "LidNr: 12345"
  const m1 = text.match(/lidnr\s*:\s*([\w-]+)/i);
  if (m1) return m1[1].trim();

  // URL ?lid= / ?lidnr= / ?member= / ?id=
  try {
    const u = new URL(text);
    const lid = u.searchParams.get("lid") || u.searchParams.get("lidnr") ||
                u.searchParams.get("member") || u.searchParams.get("id");
    if (lid) return lid.trim();
  } catch (_) {}

  // Anders: eerste numerieke token (≥3 cijfers)
  const m2 = text.match(/\b(\d{3,})\b/);
  if (m2) return m2[1];

  return null;
}

// Bevestigingsmodal aansturen
function openBookModal(message, onYes, onNo) {
  const $ = (id) => document.getElementById(id);
  const modal = $("adminBookModal");
  const msgEl = $("adminBookMsg");
  const btnYes = $("adminBookYes");
  const btnNo  = $("adminBookNo");
  const btnX   = $("adminBookClose");
  if (!modal) { console.warn("Modal ontbreekt in DOM"); onNo && onNo(); return; }

  let handled = false;
  function cleanup() {
    btnYes && (btnYes.onclick = null);
    btnNo  && (btnNo.onclick  = null);
    btnX   && (btnX.onclick   = null);
    modal.style.display = "none";
  }

  msgEl && (msgEl.textContent = message);
  modal.style.display = "flex";

  const resolve = (isNo) => {
    if (handled) return;
    handled = true;
    cleanup();
    if (isNo) { onNo && onNo(); } else { onYes && onYes(); }
  };

  btnYes && (btnYes.onclick = () => resolve(false));
  btnNo  && (btnNo.onclick  = () => resolve(true));
  btnX   && (btnX.onclick   = btnNo?.onclick);
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

  let scanner = null;

  function ensureLib() {
    if (!window.Html5QrcodeScanner) {
      statusEl && (statusEl.textContent = "Bibliotheek niet geladen — controleer je internet.");
      return false;
    }
    return true;
  }

  function parseText(text) {
    const mNaam = text.match(/naam\s*:\s*([^;]+)/i);
    const mLid  = text.match(/lidnr\s*:\s*([^;]+)/i);
    return { naam: mNaam ? mNaam[1].trim() : null, lid: mLid ? mLid[1].trim() : null, raw: text };
  }

  function onScanSuccess(decodedText) {
    const p = parseText(decodedText || "");
    let lid = p.lid || extractLidFromText(decodedText || "");
    let naam = p.naam || "";

    (async () => {
      try {
        if (lid) {
          const snap = await getDoc(doc(db, "members", String(lid)));
          if (snap.exists()) {
            const d = snap.data();
            const composed = `${(d["Voor naam"]||"").toString().trim()} ${(d["Tussen voegsel"]||"").toString().trim()} ${(d["Naam"]||d["name"]||d["naam"]||"").toString().trim()}`
              .replace(/\s+/g, " ").trim();
            naam = composed || naam || (d["Naam"] || d["name"] || d["naam"] || "");
          }
        }
      } catch (e) {
        console.warn("Lookup mislukt:", e);
      }

      const summary = (naam || lid)
        ? `${naam ? "Naam: " + naam : ""} ${lid ? "(LidNr: " + lid + ")" : ""}`.trim()
        : (p.raw || "—");
      resultEl && (resultEl.textContent = "Gescand: " + summary);
      statusEl && (statusEl.textContent = (lid ? "✅ Succes" : "⚠️ Geen LidNr in QR"));

      // Stop tijdelijk om doorlopend scannen te voorkomen
      try { if (scanner && scanner.clear) await scanner.clear(); } catch(_) {}
      readerEl && (readerEl.innerHTML = "");

      // Modal vragen
      const finalNaam = naam || "(onbekend)";
      const finalLid  = lid  || "(onbekend)";
      openBookModal(`Wilt u een rit opboeken van ${finalNaam} ${finalLid}?`,
        async () => {
          if (!lid) { statusEl && (statusEl.textContent = "❌ Geen LidNr — kan niet boeken"); return; }
          try {
            await bookRide(lid, finalNaam);
            statusEl && (statusEl.textContent = `✅ Rit +1 voor ${finalNaam} ${finalLid}`);
          } catch (e) {
            console.error(e);
            statusEl && (statusEl.textContent = `❌ Fout bij updaten: ${e?.message || e}`);
          }
        },
        () => {
          statusEl && (statusEl.textContent = "⏸️ Geannuleerd");
        }
      );
    })();
  }

  function onScanError(_) { /* stil */ }

  async function start() {
    if (!ensureLib()) return;
    statusEl && (statusEl.textContent = "Camera openen…");
    try { if (scanner && scanner.clear) await scanner.clear(); } catch(_) {}
    readerEl && (readerEl.innerHTML = "");
    scanner = new Html5QrcodeScanner("adminQRReader", { fps: 10, qrbox: 250, aspectRatio: 1.333 }, false);
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
