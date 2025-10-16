import QRCode from "qrcode";
import { db } from "./firebase.js";
import { collection, query, orderBy, startAt, endAt, limit, getDocs, doc, onSnapshot } from "firebase/firestore";

export function initMemberView() {
  const $ = (id) => document.getElementById(id);
  const nameInput   = $("nameInput");
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
        nameInput.value = it.data["Naam"];
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
    if (unsubscribe) { try { unsubscribe(); } catch(_) {} unsubscribe = null; }
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
    }
  }

  function renderSelected(entry) {
    const data = entry.data;
    rName.textContent = fullNameFrom(data);
    rMemberNo.textContent = entry.id;
    if (rRides) rRides.textContent = (typeof data.ridesCount === "number") ? String(data.ridesCount) : "0";

    const payload = JSON.stringify({ t: "member", uid: entry.id });
    QRCode.toCanvas(qrCanvas, payload, { width: 220, margin: 1 }, (err) => {
      const privacyEl = document.getElementById("qrPrivacy");
      if (privacyEl) privacyEl.style.display = "block";
      if (err) {
        errBox.textContent = "QR genereren mislukte.";
        errBox.style.display = "block";
        return;
      }
      resultBox.style.display = "grid";
    });



    try { if (unsubscribe) { unsubscribe(); } } catch(_) {}
    const ref = doc(collection(db, "members"), entry.id);
    unsubscribe = onSnapshot(ref, (snap) => {
      const d = snap.exists() ? snap.data() : null;
      const count = (d && typeof d.ridesCount === "number") ? d.ridesCount : 0;
      if (rRides) rRides.textContent = String(count);
    }, (err) => {
      console.error("ridesCount realtime fout:", err);
      if (rRides) rRides.textContent = "—";
    });
  }

  nameInput?.addEventListener("input", onInputChanged);
  nameInput?.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") hideSuggestions();
    if (ev.key === "Enter") { ev.preventDefault(); handleFind(); }
  });
}

// Compat-layer: als je ook de oude IIFE hebt die na rMemberNo een regel toevoegt,
// blijft die werken omdat we hier niets verwijderen; rRidesCount krijgt voorrang als aanwezig.
