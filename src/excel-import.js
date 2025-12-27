import * as XLSX from "xlsx";
import { db, writeBatch, doc } from "./firebase.js";

const REQUIRED_COLS = ["LidNr", "Naam", "Voor naam", "Voor letters", "Tussen voegsel", "Regio Omschrijving"];

export async function readWorkbook(file) {
  const buf = await file.arrayBuffer();
  return XLSX.read(buf, { type: "array" });
}

export function sheetToRows(wb) {
  const name = wb.SheetNames[0];
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  return rows;
}

export function normalizeRows(rows) {
  return rows.map((r) => {
    const out = {};
    for (const k of REQUIRED_COLS) out[k] = (r[k] ?? "").toString().trim();
    return out;
  });
}

export async function importRowsToFirestore(rows) {
  let total = 0, updated = 0, skipped = 0;
  let batch = writeBatch(db);
  const commit = async () => { await batch.commit(); batch = writeBatch(db); };

  for (const r of rows) {
    total++;
    const id = String(r["LidNr"] || "").trim();
    if (!/^\d+$/.test(id)) { skipped++; continue; }

    const clean = {};
    for (const k of REQUIRED_COLS) clean[k] = r[k];
    batch.set(doc(db, "members", id), clean, { merge: true });
    updated++;

    if (updated % 400 === 0) await commit();
  }
  await commit();
  return { total, updated, skipped };
}
