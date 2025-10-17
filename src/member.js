import QRCode from "qrcode";
import { db } from "./firebase.js";
import { collection, query, orderBy, startAt, endAt, limit, getDocs, doc, onSnapshot } from "firebase/firestore";

/* Helper: toon geregistreerde ritten als sterren (★/☆) op schaal 0–5 */
function ridesToStars(count) {
  const max = 5;
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const filled = Math.min(n, max);
  const empty = Math.max(0, max - filled);
  return "★".repeat(filled) + "☆".repeat(empty);
}

export function initMemberView() {
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

  // On focus: direct QR/resultaat verbergen en (indien 1+ chars) meteen suggesties tonen
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
      // geen tekst → lijst verbergen
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

        // GEEN auto-select: altijd suggesties tonen
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
    // Enter → geen auto-select: alleen (opnieuw) suggesties tonen
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
      // En privacyregel tonen (als aanwezig)
      const privacyEl = document.getElementById("qrPrivacy");
      if (privacyEl) privacyEl.style.display = "block";
    });

    // Realtime updates voor ridesCount
    try { if (unsubscribe) { unsubscribe(); } } catch(_) {}
    const ref = doc(collection(db, "members"), entry.id);
    unsubscribe = onSnapshot(ref, (snap) => {
      const d = snap.exists() ? snap.data() : null;
      const count = (d && typeof d.ridesCount === "number") ? d.ridesCount : 0;
      if (rRides) {
        rRides.textContent = ridesToStars(count);
        rRides.setAttribute("title", `Geregistreerde ritten: ${count}`);
        rRides.setAttribute("aria-label", `Geregistreerde ritten: ${count}`);
      }
    }, (err) => {
      console.error("ridesCount realtime fout:", err);
      if (rRides) rRides.textContent = "—";
    });
  }

  nameInput?.addEventListener("focus", handleFocus);
  nameInput?.addEventListener("input", onInputChanged);
  nameInput?.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") hideSuggestions();
    if (ev.key === "Enter") { ev.preventDefault(); handleFind(); }
  });
}

// Compat-layer: als je ook de oude IIFE had, dit bestand vervangt die noodzaak doordat
// we nu direct #rRidesCount updaten en toegankelijk maken met title/aria-label.
