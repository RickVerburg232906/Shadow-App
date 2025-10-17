
import QRCode from "qrcode";
import { db } from "./firebase.js";
import { getDoc, doc, collection, query, orderBy, startAt, endAt, limit, getDocs, onSnapshot } from "firebase/firestore";

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

function findStarContainer() {
  return (
    document.querySelector("#rideStars") ||
    document.querySelector("#stars") ||
    document.querySelector("[data-stars]")
  );
}

function renderStarCount(n) {
  const el = findStarContainer();
  const host = el || (() => {
    const d = document.createElement("div");
    d.id = "rideStars";
    d.style.fontSize = "24px";
    d.style.letterSpacing = "4px";
    document.body.appendChild(d);
    return d;
  })();

  host.setAttribute("aria-label", `${n} geplande ritten`);
  host.setAttribute("role", "img");
  host.textContent = "☆".repeat(n);
}

document.addEventListener("DOMContentLoaded", async () => {
  const dates = await getPlannedDates();
  renderStarCount(dates.length);
});

/* Helper: toon geregistreerde ritten als sterren (★/☆) op schaal 0–5 */
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
    // Vierkant houden: gebruik 100vmin (kleinste van vw en vh) zodat hij maximaal in scherm past als perfect vierkant
    img.style.width = "100vmin";
    img.style.height = "100vmin";
    img.style.imageRendering = "pixelated"; // scherpe blokken
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
  const rRides      = $("rRidesCount");
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
      li.addEventListener("click", () => {
        selectedDoc = it;
        if (nameInput) nameInput.value = it.data["Naam"] || "";
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
    // Debounce snelle typbewegingen
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

  function renderSelected(entry) {
    const data = entry.data || {};
    if (rName) rName.textContent = fullNameFrom(data);
    if (rMemberNo) rMemberNo.textContent = entry.id;

    // Initieel ridesCount als sterren tonen (fallback 0)
    const initCount = (typeof data.ridesCount === "number") ? data.ridesCount : 0;
    if (rRides) {
      rRides.textContent = ridesToStars(initCount);
      rRides.setAttribute("title", `Geregistreerde ritten: ${initCount}`);
      rRides.setAttribute("aria-label", `Geregistreerde ritten: ${initCount}`);
    }

    const payload = JSON.stringify({ t: "member", uid: entry.id });
    QRCode.toCanvas(qrCanvas, payload, { width: 220, margin: 1 }, (err) => {
      if (err) {
        if (errBox) {
          errBox.textContent = "QR genereren mislukte.";
          errBox.style.display = "block";
        }
        return;
      }
      // QR gelukt → resultaat tonen
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

  // Klik op QR → fullscreen overlay (vierkant, 100vmin)
  if (qrCanvas) {
    qrCanvas.style.cursor = "zoom-in";
    qrCanvas.addEventListener("click", () => openQrFullscreenFromCanvas(qrCanvas), { passive: true });
    qrCanvas.setAttribute("title", "Klik om fullscreen te openen");
  }
}

// Compat-layer: als je ook de oude IIFE had, dit bestand vervangt die noodzaak doordat
// we nu direct #rRidesCount updaten en toegankelijk maken met title/aria-label.