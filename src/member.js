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
  findBtn?.addEventListener("click", handleFind);
}
