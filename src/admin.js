import * as XLSX from "xlsx";
import { db, writeBatch, doc } from "./firebase.js";
import { collection, setDoc, increment } from "firebase/firestore";

const REQUIRED_COLS = ["LidNr", "Naam", "Voor naam", "Voor letters", "Tussen voegsel"];
// Toggle: set to true if you configure Firebase Auth + Storage rules correctly.
const ENABLE_STORAGE_UPLOAD = false;

export function initAdminView() {
  const $ = (id) => document.getElementById(id);
  const fileInput = $("fileInput");
  const fileName  = $("fileName");
  const uploadBtn = $("uploadBtn");
  const statusEl  = $("status");
  const logEl     = $("log");

  function log(line, cls="") {
    const p = document.createElement("div");
    if (cls) p.className = cls;
    p.textContent = line;
    logEl.appendChild(p);
    logEl.scrollTop = logEl.scrollHeight;
  }
  function setLoading(on) {
    uploadBtn.disabled = on;
    uploadBtn.textContent = on ? "Bezig..." : "Uploaden";
  }

  fileInput?.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    fileName.textContent = f ? f.name : "Geen bestand gekozen";
  });

  async function readWorkbook(file) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const wsname = wb.SheetNames[0];
    const ws = wb.Sheets[wsname];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    return rows;
  }

  function validateColumns(row0) {
    const cols = Object.keys(row0 || {});
    const missing = REQUIRED_COLS.filter(c => !cols.includes(c));
    if (missing.length) {
      throw new Error("Ontbrekende kolommen: " + missing.join(", "));
    }
  }

  async function importRowsToFirestore(rows) {
    let total = 0, updated = 0, skipped = 0;
    let batch = writeBatch(db)
    const commit = async () => { await batch.commit(); batch = writeBatch(db); };

    for (const r of rows) {
      total++;
      const id = String(r["LidNr"] || "").trim();
      if (!id) { skipped++; continue; }

      const clean = {};
      for (const k of REQUIRED_COLS) clean[k] = (r[k] ?? "").toString().trim();
      clean["ridesCount"] = Number(r["ridesCount"] ?? 0);

      batch.set(doc(db, "members", id), clean, { merge: true });
      updated++;
      if (updated % 480 === 0) { await commit(); log(`Batch geschreven (${updated})`, "ok"); }
    }
    await commit();
    return { total, updated, skipped };
  }

  // No-op to avoid CORS until Storage is configured.
  async function uploadOriginalToStorage(_file) {
    if (!ENABLE_STORAGE_UPLOAD) return;
  }

  async function handleUpload() {
    logEl.innerHTML = "";
    statusEl.textContent = "";
    const file = fileInput.files?.[0];
    if (!file) { statusEl.textContent = "❌ Kies eerst een bestand"; return; }
    setLoading(true);
    try {
      await uploadOriginalToStorage(file);
      const rows = await readWorkbook(file);
      if (!rows.length) throw new Error("Geen rijen gevonden in het bestand");
      validateColumns(rows[0]);
      log(`Rijen gevonden: ${rows.length}`);
      const res = await importRowsToFirestore(rows);
      log(`Klaar. Totaal rijen: ${res.total}, verwerkt: ${res.updated}, overgeslagen: ${res.skipped}`, "ok");
      statusEl.textContent = "✅ Import naar Firestore voltooid";
    } catch (e) {
      console.error(e);
      statusEl.textContent = "❌ Fout tijdens import";
      log(String(e?.message || e), "err");
    } finally {
      setLoading(false);
    }
  }

  $("uploadBtn")?.addEventListener("click", handleUpload);
  // Init QR scanner sectie
  try { initAdminQRScanner(); } catch(_) {}

}


/** =====================
 *  QR SCANNER (Admin tab)
 *  - Renders Html5QrcodeScanner inside #adminQRReader
 *  - Start/Stop via buttons; shows last result in #adminQRResult
 *  ===================== */

// Admin: rides +1 helper
async function bookRide(lid, naam) {
  const id = String(lid || "").trim();
  if (!id) throw new Error("Geen LidNr meegegeven");
  // Gebruik setDoc + increment zodat het ook werkt als het document nog niet bestaat
  await setDoc(doc(db, "members", id), { ridesCount: increment(1) }, { merge: true });
  return id;
}

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
      statusEl.textContent = "Bibliotheek niet geladen — controleer je internet.";
      return false;
    }
    return true;
  }

  function parseText(text) {
    const mNaam = text.match(/naam\s*:\s*([^;]+)/i);
    const mLid  = text.match(/lidnr\s*:\s*([^;]+)/i);
    return {
      naam: mNaam ? mNaam[1].trim() : null,
      lid : mLid ? mLid[1].trim() : null,
      raw : text
    };
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
            const composed = `${(d["Voor naam"]||"").toString().trim()} ${(d["Tussen voegsel"]||"").toString().trim()} ${(d["Naam"]||d["name"]||d["naam"]||"").toString().trim()}`.replace(/\s+/g, " ").trim();
            naam = composed || naam || (d["Naam"] || d["name"] || d["naam"] || "");
          }
        }
      } catch (e) {
        console.warn("Lookup mislukt:", e);
      }

      const summary = (naam || lid)
        ? `${naam ? "Naam: " + naam : ""} ${lid ? "(LidNr: " + lid + ")" : ""}`.trim()
        : (p.raw || "—");
      resultEl.textContent = "Gescand: " + summary;
      statusEl.textContent = (lid ? "✅ Succes" : "⚠️ Geen LidNr in QR");

      // Stop scanner tijdelijk zodat er niet doorlopend gescand wordt
      try { if (scanner && scanner.clear) await scanner.clear(); } catch(_) {}
      readerEl.innerHTML = "";

      // Toon bevestigingsmodal
      const finalNaam = naam || "(onbekend)";
      const finalLid  = lid  || "(onbekend)";
      openBookModal(`Wilt u een rit opboeken van ${finalNaam} ${finalLid}?`,
        async () => {
          if (!lid) { statusEl.textContent = "❌ Geen LidNr — kan niet boeken"; return; }
          try {
            await bookRide(lid, finalNaam);
            statusEl.textContent = `✅ Rit +1 voor ${finalNaam} ${finalLid}`;
          } catch (e) {
            console.error(e);
            statusEl.textContent = `❌ Fout bij updaten: ${e?.message || e}`;
          }
        },
        () => { statusEl.textContent = "⏸️ Geannuleerd"; }
      );
    })();
  }

  function onScanError(_) { /* stil */ }

  async function start() {
    if (!ensureLib()) return;
    statusEl.textContent = "Camera openen…";
    // Clear old instance
    try { if (scanner && scanner.clear) await scanner.clear(); } catch(_) {}
    readerEl.innerHTML = "";
    scanner = new Html5QrcodeScanner("adminQRReader", { fps: 10, qrbox: 250, aspectRatio: 1.333 }, false);
    scanner.render(onScanSuccess, onScanError);
    statusEl.textContent = "Richt je camera op de QR-code…";
  }

  async function stop() {
    statusEl.textContent = "Stoppen…";
    try { if (scanner && scanner.clear) await scanner.clear(); } catch(_) {}
    scanner = null;
    readerEl.innerHTML = "";
    statusEl.textContent = "⏸️ Gestopt";
  }

  startBtn?.addEventListener("click", start);
  stopBtn?.addEventListener("click", stop);
}
  function onScanError(_) { /* stil */ }

  async function start() {
    if (!ensureLib()) return;
    statusEl.textContent = "Camera openen…";
    // Clear old instance
    try { if (scanner && scanner.clear) await scanner.clear(); } catch(_) {}
    readerEl.innerHTML = "";
    scanner = new Html5QrcodeScanner("adminQRReader", { fps: 10, qrbox: 250, aspectRatio: 1.333 }, false);
    scanner.render(onScanSuccess, onScanError);
    statusEl.textContent = "Richt je camera op de QR-code…";
  }

  async function stop() {
    statusEl.textContent = "Stoppen…";
    try { if (scanner && scanner.clear) await scanner.clear(); } catch(_) {}
    scanner = null;
    readerEl.innerHTML = "";
    statusEl.textContent = "⏸️ Gestopt";
  }

  startBtn?.addEventListener("click", start);
  stopBtn?.addEventListener("click", stop);



/** Admin: Boek rit modal helpers */
function openBookModal(message, onYes, onNo) {
  const $ = (id) => document.getElementById(id);
  const modal = $("adminBookModal");
  const msgEl = $("adminBookMsg");
  const btnYes = $("adminBookYes");
  const btnNo  = $("adminBookNo");
  const btnX   = $("adminBookClose");

  let handled = false;
  function cleanup() {
    btnYes.onclick = null;
    btnNo.onclick = null;
    btnX.onclick = null;
    modal.style.display = "none";
  }

  msgEl.textContent = message;
  modal.style.display = "flex";
  btnYes.onclick = () => { if (!handled) { handled = TrueFalse(false); } };
  btnNo.onclick  = () => { if (!handled) { handled = TrueFalse(true); } };
  btnX.onclick   = btnNo.onclick;

  function TrueFalse(isNo){
    cleanup();
    if (isNo){ onNo && onNo(); }
    else { onYes && onYes(); }
    return true;
  }
}
