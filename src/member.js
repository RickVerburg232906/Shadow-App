// member.js — sterren oplichten o.b.v. ScanDatums vergeleken met globale geplande datums
import QRCode from "qrcode";
import { db } from "./firebase.js";
import { getDoc, doc, collection, query, orderBy, startAt, endAt, limit, getDocs, onSnapshot } from "firebase/firestore";

// ------- Planning (geplande datums) -------
async function getPlannedDates() {
  try {
    const ref = doc(db, "globals", "ridePlan");
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : {};
    const arr = Array.isArray(data.plannedDates) ? data.plannedDates : [];
    return arr.filter(Boolean);
  } catch (e) {
    console.error("Kon plannedDates niet laden:", e);
    return [];
  }
}

/* Helper: normaliseer naar 'YYYY-MM-DD' */
function toYMD(value) {
  try {
    if (!value) return "";
    // Firestore Timestamp?
    if (typeof value === "object" && value.seconds) {
      const d = new Date(value.seconds * 1000);
      return d.toISOString().slice(0,10);
    }
    // String of Date
    const d = new Date(value);
    if (isNaN(d.getTime())) {
      // fallback: probeer direct YYYY-MM-DD uit string te knippen
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        return value.slice(0,10);
      }
      return "";
    }
    return d.toISOString().slice(0,10);
  } catch {
    return "";
  }
}

/* Helper: maak sterstring + tooltip op basis van geplande datums en scanDatums */
function plannedStarsWithHighlights(plannedDates, scanDates) {
  const planned = plannedDates.map(toYMD).filter(Boolean);
  const scans = new Set(scanDates.map(toYMD).filter(Boolean));
  const stars = planned.map(d => scans.has(d) ? "★" : "☆").join("");
  const tooltip = planned.map((d, i) => `${i+1}: ${d} — ${scans.has(d) ? "Geregistreerd" : "Niet geregistreerd"}`).join("\n");
  return { stars, tooltip };
}

/* Helper: toon geregistreerde ritten als sterren (★/☆) op schaal 0–STAR_MAX ) */
let STAR_MAX = 5;
export async function loadStarMax() {
  try {
    const ref = doc(db, "globals", "starConfig");
    const snap = await getDoc(ref);
    const max = snap.exists() && typeof snap.data().max === "number" ? snap.data().max : 5;
    STAR_MAX = Math.max(1, Math.floor(max));
  } catch {
    STAR_MAX = 5;
  }
}
function ridesToStars(count) {
  const max = STAR_MAX;
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const filled = Math.min(n, max);
  const empty = Math.max(0, max - filled);
  return "★".repeat(filled) + "☆".repeat(empty);
}

// === QR Fullscreen overlay ===
function openQrFullscreenFromCanvas(qrCanvas) {
  try {
    const dataUrl = qrCanvas.toDataURL("image/png");
    const overlay = document.createElement("div");
    overlay.id = "qrFullscreenOverlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.95)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "9999";
    overlay.style.cursor = "zoom-out";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "QR-code fullscreen");

    const img = document.createElement("img");
    img.src = dataUrl;
    img.alt = "QR-code";
    img.style.width = "100vmin";
    img.style.height = "100vmin";
    img.style.imageRendering = "pixelated";
    img.style.border = "0";
    img.style.borderRadius = "0";
    img.style.boxShadow = "none";

    const hint = document.createElement("div");
    hint.textContent = "Klik of druk op Esc om te sluiten";
    hint.style.position = "fixed";
    hint.style.bottom = "24px";
    hint.style.left = "50%";
    hint.style.transform = "translateX(-50%)";
    hint.style.color = "#e5e7eb";
    hint.style.fontSize = "14px";
    hint.style.opacity = "0.8";

    function close() {
      try { document.removeEventListener("keydown", onKey); } catch(_) {}
      overlay.remove();
    }
    function onKey(e) {
      if (e.key === "Escape") close();
    }
    overlay.addEventListener("click", close, { passive: true });
    document.addEventListener("keydown", onKey);

    overlay.appendChild(img);
    overlay.appendChild(hint);
    document.body.appendChild(overlay);
  } catch (e) {
    console.error("QR fullscreen overlay faalde:", e);
  }
}

/* Format helper */
function fmtDate(d) {
  if (!d || typeof d !== "string" || d.length < 10) return d || "";
  return `${d.slice(8,10)}-${d.slice(5,7)}-${d.slice(0,4)}`;
}

export async function initMemberView() {
  try { await loadStarMax(); } catch(e) {}

  const $ = (id) => document.getElementById(id);
  const nameInput   = $("nameInput");
  let _debounceHandle = null;
  const suggestList = $("suggestions");
  const resultBox   = $("result");
  const errBox      = $("error");
  const rName       = $("rName");
  const rMemberNo   = $("rMemberNo");
  const rRides      = $("rGereden_Ritten");   // HTML: <span id="rGereden_Ritten">
  const qrCanvas    = $("qrCanvas");

  let selectedDoc = null;
  let unsubscribe = null;

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
    if (!suggestList) return;
    suggestList.innerHTML = "";
    suggestList.style.display = "none";
  }

  function showSuggestions(items) {
    if (!suggestList) return;
    suggestList.innerHTML = "";
    for (const it of items) {
      const li = document.createElement("li");
      li.textContent = fullNameFrom(it.data) + ` — ${it.id}`;
      li.addEventListener("click", async () => {
        selectedDoc = it;
        if (nameInput) nameInput.value = it.data["Naam"] || "";
        await renderSelected(it);
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

  function hideResultBox() {
    if (resultBox) resultBox.style.display = "none";
    const privacyEl = document.getElementById("qrPrivacy");
    if (privacyEl) privacyEl.style.display = "none";
  }

  function resetSelection() {
    selectedDoc = null;
    hideResultBox();
    if (errBox) errBox.style.display = "none";
    try { if (unsubscribe) unsubscribe(); } catch(_) {}
    unsubscribe = null;
    if (rRides) {
      rRides.textContent = "—";
      rRides.removeAttribute("title");
      rRides.removeAttribute("aria-label");
      rRides.style.letterSpacing = "";
      rRides.style.fontSize = "";
    }
  }

  async function handleFocus() {
    resetSelection();
    const term = (nameInput && nameInput.value ? nameInput.value : "").trim();
    if (term.length >= 1) {
      try {
        const items = await queryByLastNamePrefix(term);
        if (items && items.length) {
          showSuggestions(items);
        } else {
          hideSuggestions();
        }
      } catch (e) {
        console.error(e);
        hideSuggestions();
      }
    } else {
      hideSuggestions();
    }
  }

  async function onInputChanged() {
    if (_debounceHandle) clearTimeout(_debounceHandle);
    _debounceHandle = setTimeout(async () => {
      try {
        resetSelection();

        const term = (nameInput && nameInput.value ? nameInput.value : "").trim();
        if (term.length < 2) { hideSuggestions(); return; }

        const items = await queryByLastNamePrefix(term);

        if (!items || !items.length) {
          if (errBox) {
            errBox.textContent = "Geen lid met uw achternaam gevonden — ga naar de inschrijfbalie voor meer informatie.";
            errBox.style.display = "block";
          }
          hideSuggestions();
          return;
        }

        showSuggestions(items);
      } catch (e) {
        console.error(e);
        hideSuggestions();
        if (errBox) {
          errBox.textContent = "Er ging iets mis tijdens het zoeken. Probeer het opnieuw of ga naar de inschrijfbalie.";
          errBox.style.display = "block";
        }
      }
    }, 250);
  }

  async function handleFind() {
    if (errBox) errBox.style.display = "none";
    try {
      const term = (nameInput && nameInput.value ? nameInput.value : "").trim();
      if (!term) { hideSuggestions(); return; }
      const items = await queryByLastNamePrefix(term);
      if (!items.length) {
        if (errBox) {
          errBox.textContent = "Geen lid met uw achternaam gevonden — ga naar de inschrijfbalie voor meer informatie.";
          errBox.style.display = "block";
        }
        hideSuggestions();
        return;
      }
      showSuggestions(items);
    } catch (e) {
      console.error(e);
      if (errBox) {
        errBox.textContent = "Er ging iets mis tijdens het zoeken. Probeer het opnieuw of ga naar de inschrijfbalie.";
        errBox.style.display = "block";
      }
    }
  }

  async function renderSelected(entry) {
    const data = entry.data || {};
    if (rName) rName.textContent = fullNameFrom(data);
    if (rMemberNo) rMemberNo.textContent = entry.id;

    // 1) Sterren o.b.v. GEPLANDE datums, oplichten bij match met ScanDatums
    const planned = await getPlannedDates();
    const scanDatums = Array.isArray(data.ScanDatums) ? data.ScanDatums : []; // verwacht array
    const { stars, tooltip } = plannedStarsWithHighlights(planned, scanDatums);
    if (rRides) {
      rRides.textContent = stars || "—";
      rRides.setAttribute("title", stars ? tooltip : "Geen ingeplande datums");
      rRides.setAttribute("aria-label", stars ? `Sterren per datum (geplande=${planned.length})` : "Geen ingeplande datums");
      rRides.style.letterSpacing = "3px";
      rRides.style.fontSize = "20px";
    }

    // 2) Live updates op Gereden_Ritten blijven actief (features behouden)
    try { if (unsubscribe) unsubscribe(); } catch(_) {}
    unsubscribe = onSnapshot(doc(db, "members", entry.id), (snap) => {
      const d = snap.exists() ? snap.data() : {};
      const count = typeof d.Gereden_Ritten === "number" ? d.Gereden_Ritten : 0;
      // hier zou je desgewenst een ander element kunnen updaten met ridesToStars(count)
    });

    // 3) QR pas na selectie
    const payload = JSON.stringify({ t: "member", uid: entry.id });
    QRCode.toCanvas(qrCanvas, payload, { width: 220, margin: 1 }, (err) => {
      if (err) {
        if (errBox) {
          errBox.textContent = "QR genereren mislukte.";
          errBox.style.display = "block";
        }
        return;
      }
      if (resultBox) resultBox.style.display = "grid";
      const privacyEl = document.getElementById("qrPrivacy");
      if (privacyEl) privacyEl.style.display = "block";
    });
  }

  // === Event listeners ===
  nameInput?.addEventListener("focus", handleFocus);
  nameInput?.addEventListener("input", onInputChanged);
  nameInput?.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") hideSuggestions();
    if (ev.key === "Enter") { ev.preventDefault(); handleFind(); }
  });

  // Klik op QR → fullscreen overlay
  if (qrCanvas) {
    qrCanvas.style.cursor = "zoom-in";
    qrCanvas.addEventListener("click", () => openQrFullscreenFromCanvas(qrCanvas), { passive: true });
    qrCanvas.setAttribute("title", "Klik om fullscreen te openen");
  }
}
