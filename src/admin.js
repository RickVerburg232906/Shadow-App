import * as XLSX from "xlsx";
import { db, writeBatch, doc } from "./firebase.js";
import { collection, setDoc } from "firebase/firestore";

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
}
