import QRCode from "qrcode";
import { db } from "./firebase.js";
import {
  collection, query, orderBy, startAt, endAt, limit, getDocs, doc
} from "firebase/firestore";

export function initMemberView() {
  const $ = (id) => document.getElementById(id);
  const nameInput   = $("nameInput");     // search by last name (Naam)
  const suggestList = $("suggestions");
  const findBtn     = $("findBtn");
  const resultBox   = $("result");
  const errBox      = $("error");
  const rName       = $("rName");
  const rMemberNo   = $("rMemberNo");
  const qrCanvas    = $("qrCanvas");

  let selectedDoc = null;

  function setLoading(on) {
    findBtn.disabled = on;
    findBtn.textContent = on ? "Zoeken..." : "Toon QR";
  }

  function fullNameFrom(docData) {
    const tussen = (docData["Tussen voegsel"] || "").trim();
    const parts = [
      docData["Voor naam"] || "",
      docData["Voor letters"] ? `(${docData["Voor letters"]})` : "",
      tussen ? tussen : "",
      docData["Naam"] || ""
    ].filter(Boolean);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  function hideSuggestions() {
    suggestList.innerHTML = "";
    suggestList.style.display = "none";
  }

  function showSuggestions(items) {
    suggestList.innerHTML = "";
    for (const it of items) {
      const li = document.createElement("li");
      li.textContent = fullNameFrom(it.data) + ` — ${it.id}`;
      li.addEventListener("click", () => {
        selectedDoc = it;
        nameInput.value = it.data["Naam"]; // keep achternaam in field
        renderSelected(it);
        hideSuggestions();
      });
      suggestList.appendChild(li);
    }
    suggestList.style.display = items.length ? "block" : "none";
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

  async function onInputChanged() {
    selectedDoc = null;
    resultBox.style.display = "none";
    errBox.style.display = "none";
    const term = (nameInput.value || "").trim();
    if (term.length < 2) { hideSuggestions(); return; }
    try {
      const items = await queryByLastNamePrefix(term);
      showSuggestions(items);
    } catch (e) {
      console.error(e);
      hideSuggestions();
    }
  }

  async function handleFind() {
    errBox.style.display = "none";
    setLoading(true);
    try {
      if (selectedDoc) {
        renderSelected(selectedDoc);
        hideSuggestions();
        return;
      }
      const term = (nameInput.value || "").trim();
      if (!term) return;
      const items = await queryByLastNamePrefix(term);
      if (!items.length) {
        errBox.textContent = "Geen leden gevonden met deze achternaam.";
        errBox.style.display = "block";
        return;
      }
      renderSelected(items[0]);
      hideSuggestions();
    } catch (e) {
      console.error(e);
      errBox.textContent = "Er ging iets mis tijdens het zoeken. Probeer opnieuw.";
      errBox.style.display = "block";
    } finally {
      setLoading(false);
    }
  }

  function renderSelected(entry) {
    const data = entry.data;
    rName.textContent = fullNameFrom(data);
    rMemberNo.textContent = entry.id; // LidNr is doc id
    const payload = JSON.stringify({ t: "member", uid: entry.id });
    QRCode.toCanvas(qrCanvas, payload, { width: 220, margin: 1 }, (err) => {
      if (err) {
        errBox.textContent = "QR genereren mislukte.";
        errBox.style.display = "block";
        return;
      }
      resultBox.style.display = "grid";
    });
  }

  nameInput?.addEventListener("input", onInputChanged);
  nameInput?.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") hideSuggestions();
    if (ev.key === "Enter") { ev.preventDefault(); handleFind(); }
  });
  
  // --- QR SCANNER ---
  const scanBtn  = $("scanBtn");
  const qrModal  = $("qrModal");
  const qrClose  = $("qrClose");
  const qrReader = $("qrReader");
  const qrStatus = $("qrStatus");

  let scanner = null;

  function openScanner() {
    if (!window.Html5QrcodeScanner) {
      alert("Scanner bibliotheek niet geladen. Controleer je internetverbinding.");
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
    return {
      naam: mNaam ? mNaam[1].trim() : null,
      lid: mLid ? mLid[1].trim() : null,
      raw: text
    };
  }

  function onScanSuccess(decodedText, decodedResult) {
    const parsed = parseScannedText(decodedText || "");
    if (parsed.naam) rName.textContent = parsed.naam;
    if (parsed.lid)  rMemberNo.textContent = parsed.lid;

    // Show result box if hidden
    resultBox.style.display = "grid";
    // Also show raw value for visibility
    errBox.style.display = "none";
    qrStatus.textContent = "Gescand: " + (parsed.naam || parsed.lid ? `${parsed.naam || ""} ${parsed.lid ? "(LidNr: " + parsed.lid + ")" : ""}` : parsed.raw);

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
}


// [RIDESCOUNT_REALTIME] — realtime ridesCount updates via onSnapshot
import { doc as _doc3, onSnapshot as _onSnap3, collection as _col3 } from "firebase/firestore";

(function augmentRidesCountRealtime(){
  const lidLine = document.getElementById("rMemberNo");
  if (!lidLine) return;

  let holder = document.getElementById("ridesCountLine");
  function ensureHolder() {
    if (!holder) {
      holder = document.createElement("div");
      holder.id = "ridesCountLine";
      holder.className = "muted";
      lidLine.insertAdjacentElement("afterend", holder);
    }
    return holder;
  }

  let unsubscribe = null;

  function listen(memberId){
    try { if (unsubscribe) { unsubscribe(); } } catch(_) {}
    if (!memberId) return;
    const ref = _doc3(_col3(db, "members"), memberId);
    unsubscribe = _onSnap3(ref, (snap) => {
      const data = snap.exists() ? snap.data() : null;
      const count = data && typeof data.ridesCount === "number" ? data.ridesCount : 0;
      ensureHolder().textContent = `Geregistreerde ritten: ${count}`;
    }, (err) => {
      console.error("ridesCount realtime fout:", err);
      ensureHolder().textContent = `Geregistreerde ritten: —`;
    });
  }

  // Observe veranderingen in #rMemberNo om juiste doc te volgen
  const obs = new MutationObserver(() => {
    const raw = (lidLine.textContent || "").trim();
    const id = raw.replace(/^#/, "");
    if (id) listen(id);
  });
  obs.observe(lidLine, { childList: true, characterData: true, subtree: true });

  // Als er al een waarde staat bij load, luister meteen
  const initId = (lidLine.textContent || "").trim().replace(/^#/, "");
  if (initId) listen(initId);
})();