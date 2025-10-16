import QRCode from "qrcode";
import { db } from "./firebase.js";
import { collection, query, orderBy, startAt, endAt, limit, getDocs } from "firebase/firestore";

export function initMemberView() {
  const $ = (id) => document.getElementById(id);
  const nameInput   = $("nameInput");
  const suggestList = $("suggestions");
  const resultBox   = $("result");
  const errBox      = $("error");
  const rName       = $("rName");
  const rMemberNo   = $("rMemberNo");
  const qrCanvas    = $("qrCanvas");

  let selectedDoc = null;

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
        nameInput.value = it.data["Naam"]; // achternaam
        renderSelected(it);
        hideSuggestions();
      }, { passive: true });
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

  let inFlight = 0;
  let lastTerm = "";
  async function onInputChanged() {
    selectedDoc = null;
    resultBox.style.display = "none";
    errBox.style.display = "none";
    const term = (nameInput.value || "").trim();
    lastTerm = term;
    if (term.length < 2) { hideSuggestions(); return; }
    try {
      inFlight++;
      const items = await queryByLastNamePrefix(term);
      // Alleen tonen als term nog hetzelfde is (race condition voorkomen op trage netwerken)
      if (term === lastTerm) showSuggestions(items);
    } catch (e) {
      console.error(e);
      hideSuggestions();
    } finally {
      inFlight--;
    }
  }

  async function handleEnterToSelect() {
    const term = (nameInput.value || "").trim();
    if (!term) return;
    try {
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
    }
  }

  function renderSelected(entry) {
    const data = entry.data;
    rName.textContent = fullNameFrom(data);
    rMemberNo.textContent = entry.id;
    const payload = JSON.stringify({ t: "member", uid: entry.id });
    const size = Math.min(320, Math.floor(window.innerWidth * 0.7));
    QRCode.toCanvas(qrCanvas, payload, { width: size, margin: 1 }, (err) => {
      if (err) {
        errBox.textContent = "QR genereren mislukte.";
        errBox.style.display = "block";
        return;
      }
      resultBox.style.display = "grid";
      // Scroll QR in beeld op mobiel
      if (window.innerWidth < 560) {
        qrCanvas.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }

  nameInput?.addEventListener("input", onInputChanged, { passive: true });
  nameInput?.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") hideSuggestions();
    if (ev.key === "Enter") { ev.preventDefault(); handleEnterToSelect(); }
  });
}

// Realtime ridesCount weergave
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

  const obs = new MutationObserver(() => {
    const raw = (lidLine.textContent || "").trim();
    const id = raw.replace(/^#/, "");
    if (id) listen(id);
  });
  obs.observe(lidLine, { childList: true, characterData: true, subtree: true });

  const initId = (lidLine.textContent || "").trim().replace(/^#/, "");
  if (initId) listen(initId);
})();
