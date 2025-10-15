import * as XLSX from "xlsx";
import { db, storage, writeBatch, doc, setDoc, ref, uploadBytes } from "./firebase.js";

const $ = (id) => document.getElementById(id);
const fileInput = $("fileInput");
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
  uploadBtn.textContent = on ? "Bezig met uploaden…" : "Uploaden";
}

function parseFileToRows(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const firstSheet = wb.SheetNames[0];
        const ws = wb.Sheets[firstSheet];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

async function uploadOriginalToStorage(file) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `admin_uploads/${ts}-${file.name}`;
  const r = ref(storage, path);
  await uploadBytes(r, file);
  return path;
}

function normalizeRow(r) {
  // map case-insensitive keys to canonical names
  const mapKey = (k) => (k || "").toString().trim().toLowerCase();
  const out = {};
  for (const [k,v] of Object.entries(r)) {
    const mk = mapKey(k);
    if (["displayname","naam","name"].includes(mk)) out.displayName = v?.toString().trim();
    else if (["memberno","lidnummer","lidnr","nummer","no"].includes(mk)) out.memberNo = v?.toString().trim();
    else if (["active","actief"].includes(mk)) out.active = (v===true || v==="true" || v===1 || v==="1" || v==="ja");
    else if (["ridescount","ritten","rittenaantal"].includes(mk)) out.ridesCount = Number(v) || 0;
    else if (["uid","id"].includes(mk)) out.uid = v?.toString().trim();
  }
  if (out.ridesCount == null) out.ridesCount = 0;
  if (out.active == null) out.active = true;
  return out;
}

async function importRowsToFirestore(rows) {
  // Schrijft in batches van 400 (onder Firestore limiet 500 operaties).
  const chunk = 400;
  let total = 0, created = 0, updated = 0, skipped = 0;

  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const batch = writeBatch(db);

    for (const raw of slice) {
      const r = normalizeRow(raw);
      if (!r.displayName || !r.memberNo) {
        skipped++;
        log(`Overgeslagen (ontbrekende displayName/memberNo): ${JSON.stringify(raw)}`, "warn");
        continue;
      }
      // Document-ID strategie:
      // 1) Als uid aanwezig → gebruik uid als doc id
      // 2) Anders gebruik memberNo (stabiel), zodat herhaalde uploads updaten i.p.v. dups
      const docId = r.uid || r.memberNo;
      const ref = doc(db, "members", docId);
      // set() merge: true → bestaande docs worden bijgewerkt
      batch.set(ref, {
        displayName: r.displayName,
        memberNo: r.memberNo,
        active: r.active,
        ridesCount: r.ridesCount
      }, { merge: true });
      updated++; // telt zowel create als update in deze simplificatie
    }

    await batch.commit();
    total += slice.length;
    log(`Batch geschreven: ${total}/${rows.length}`, "ok");
  }
  return { total, created, updated, skipped };
}

async function handleUpload() {
  logEl.innerHTML = "";
  statusEl.textContent = "";
  const file = fileInput.files?.[0];
  if (!file) {
    statusEl.textContent = "Kies eerst een bestand.";
    return;
  }
  setLoading(true);
  try {
    log(`Bestand: ${file.name}`);
    const storagePath = await uploadOriginalToStorage(file);
    log(`Origineel opgeslagen in Storage: ${storagePath}`, "ok");

    const rows = await parseFileToRows(file);
    log(`Rijen gevonden: ${rows.length}`);

    const res = await importRowsToFirestore(rows);
    log(`Klaar. Totaal rijen: ${res.total}, verwerkt: ${res.updated}, overgeslagen: ${res.skipped}`, "ok");
    statusEl.textContent = "✅ Upload & import voltooid";
  } catch (e) {
    console.error(e);
    statusEl.textContent = "❌ Fout tijdens upload/import";
    log(String(e?.message || e), "err");
  } finally {
    setLoading(false);
  }
}

uploadBtn.addEventListener("click", handleUpload);
