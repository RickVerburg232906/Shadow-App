import { db, doc, getDoc } from "./firebase.js";
const $ = (id) => document.getElementById(id);

const rName = $("rName");
const rMemberNo = $("rMemberNo");
const rRidesCount = $("rRidesCount");
const resultBox = $("resultBox") || document.querySelector("#resultBox, .resultBox");
const errBox = $("errBox") || document.querySelector("#errBox, .errBox");
const findBtn = $("findBtn");
  // --- QR SCANNER ---
  const scanBtn  = $("scanBtn");
  const qrModal  = $("qrModal");
  const qrClose  = $("qrClose");
  const qrReader = $("qrReader");
  const qrStatus = $("qrStatus");

  let scanner = null;

  async function fetchRidesCount(lid) {
    try {
      const snap = await getDoc(doc(db, "members", String(lid)));
      if (!snap.exists()) return 0;
      const data = snap.data();
      const rc = Number(data?.ridesCount);
      return Number.isFinite(rc) ? rc : 0;
    } catch (e) {
      console.warn("ridesCount ophalen mislukt:", e);
      return null; // toon "—" bij fout
    }
  }

  function setRidesCount(count) {
    const el = $("rRidesCount");
    if (!el) return;
    if (count === null || count === undefined || Number.isNaN(count)) {
      el.textContent = "—";
    } else {
      el.textContent = String(count);
    }
  }

  function openScanner() {
    if (!window.Html5QrcodeScanner) {
      // Zacht falen in de UI i.p.v. alert
      if (qrStatus) qrStatus.textContent = "Scanner niet geladen. Controleer internetverbinding.";
      return;
    }
    qrModal.style.display = "flex";
    // Build scanner with reasonable options
    scanner = new Html5QrcodeScanner("qrReader", { fps: 10, qrbox: 250, aspectRatio: 1.333 }, false);
    scanner.render(onScanSuccess, onScanError);
    qrStatus.textContent = "Richt je camera op de QR-code…";
  }

  function closeScanner() {
    try {
      if (scanner && scanner.clear) scanner.clear();
    } catch(_) {}
    scanner = null;
    // Clear container for a clean re-render next time
    if (qrReader) qrReader.innerHTML = "";
    qrModal.style.display = "none";
  }

  function parseScannedText(text) {
    // Accept formats like:
    //  - "Naam: John Doe; LidNr: 12345"
    //  - "LidNr: 12345; Naam: Jane Doe"
    //  - or just raw text/URL
    const mNaam = text.match(/naam\s*:\s*([^;]+)/i);
    const mLid  = text.match(/lidnr\s*:\s*([^;]+)/i);

    // Extra: pak numeriek token als fallback (bijv. alleen "12345" of URL)
    let lid = mLid ? mLid[1].trim() : null;
    if (!lid) {
      try {
        // Querystring als fallback
        const u = new URL(text);
        lid = u.searchParams.get("lid") || u.searchParams.get("lidnr") || u.searchParams.get("member") || u.searchParams.get("id");
      } catch(_) {}
      if (!lid) {
        const m2 = text.match(/\b(\d{3,})\b/);
        if (m2) lid = m2[1];
      }
    }

    return {
      naam: mNaam ? mNaam[1].trim() : null,
      lid: lid || null,
      raw: text
    };
  }

  async function onScanSuccess(decodedText, decodedResult) {
    const parsed = parseScannedText(decodedText || "");

    if (parsed.naam) rName.textContent = parsed.naam;
    if (parsed.lid)  rMemberNo.textContent = parsed.lid;

    // Show result box if hidden
    resultBox.style.display = "grid";
    // Also show raw value for visibility
    errBox.style.display = "none";
    qrStatus.textContent = "Gescand: " + (
      parsed.naam || parsed.lid
        ? `${parsed.naam || ""} ${parsed.lid ? "(LidNr: " + parsed.lid + ")" : ""}`.trim()
        : parsed.raw
    );

    // >>> Nieuw: ridesCount ophalen en tonen
    if (parsed.lid) {
      setRidesCount("…");
      const count = await fetchRidesCount(parsed.lid);
      setRidesCount(count);
    } else {
      setRidesCount(null);
    }

    // Optional: auto-close after a short delay
    setTimeout(closeScanner, 800);
  }

  function onScanError(err) {
    // No spam; only show occasional status
    // console.debug(err);
  }

  scanBtn?.addEventListener("click", openScanner);
  qrClose?.addEventListener("click", closeScanner);
  qrModal?.addEventListener("click", (e) => {
    if (e.target === qrModal) closeScanner();
  });

  findBtn?.addEventListener("click", handleFind);

function parseLidFromText(text) {
  if (!text) return null;
  const t = String(text).trim();
  if (/^\d{1,}$/.test(t)) return t;
  const m = t.match(/lidnr\s*:\s*(\d{1,})/i);
  if (m) return m[1];
  const m2 = t.match(/(\d{2,})\b/);
  if (m2) return m2[1];
  return null;
}

export function initMemberView() {
  // Bij laden: als er al een LidNr staat, haal direct ridesCount op
  const initial = parseLidFromText(rMemberNo?.textContent || "");
  if (initial) {
    const el = document.getElementById("rRidesCount");
    if (el) el.textContent = "…";
    (async () => {
      try {
        const snap = await getDoc(doc(db, "members", String(initial)));
        const data = snap.exists() ? snap.data() : null;
        const rc = Number(data?.ridesCount);
        const val = Number.isFinite(rc) ? rc : 0;
        if (el) el.textContent = String(val);
      } catch (_) {
        if (el) el.textContent = "—";
      }
    })();
  }

  // Observe wijzigingen in rMemberNo (bv. na QR-scan)
  if (rMemberNo && window.MutationObserver) {
    const obs = new MutationObserver(() => {
      const lid = parseLidFromText(rMemberNo.textContent || "");
      const el = document.getElementById("rRidesCount");
      if (lid) {
        if (el) el.textContent = "…";
        (async () => {
          try {
            const snap = await getDoc(doc(db, "members", String(lid)));
            const data = snap.exists() ? snap.data() : null;
            const rc = Number(data?.ridesCount);
            const val = Number.isFinite(rc) ? rc : 0;
            if (el) el.textContent = String(val);
          } catch (_) {
            if (el) el.textContent = "—";
          }
        })();
      } else if (el) {
        el.textContent = "—";
      }
    });
    obs.observe(rMemberNo, { childList: true, characterData: true, subtree: true });
  }
}
