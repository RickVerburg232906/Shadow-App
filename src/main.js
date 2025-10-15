import { prewarm, findMemberByNameFast } from "./firebase.js";
import QRCode from "qrcode";

const $ = (id) => document.getElementById(id);
const nameInput = $("nameInput");
const findBtn   = $("findBtn");
const resultBox = $("result");
const errBox    = $("error");
const rName     = $("rName");
const rMemberNo = $("rMemberNo");
const rStatus   = $("rStatus");
const qrCanvas  = $("qrCanvas");

window.addEventListener("load", async () => {
  nameInput.focus();
  await prewarm();
});

function setLoading(on) {
  findBtn.disabled = on;
  findBtn.textContent = on ? "Zoeken..." : "Zoek & Genereer QR";
}

async function handleFind() {
  errBox.style.display = "none";
  resultBox.style.display = "none";
  setLoading(true);

  const name = (nameInput.value || "").trim();
  if (!name) {
    errBox.textContent = "Vul eerst je naam in.";
    errBox.style.display = "block";
    setLoading(false);
    return;
  }

  try {
    const matches = await findMemberByNameFast(name);

    if (!matches || matches.length === 0) {
      errBox.textContent = "Je bent nog geen lid";
      errBox.style.display = "block";
      return;
    }

    const m = matches[0];
    rName.textContent = m.displayName || "—";
    rMemberNo.textContent = m.memberNo ?? "—";
    rStatus.textContent = (m.active === false) ? "Inactief" : "Actief";

    const payload = JSON.stringify({ t: "member", uid: m.uid });
    await new Promise((resolve, reject) => {
      QRCode.toCanvas(qrCanvas, payload, { width: 220, margin: 1 }, (err) => err ? reject(err) : resolve());
    });

    resultBox.style.display = "grid";
  } catch (e) {
    console.error(e);
    errBox.textContent = "Er ging iets mis tijdens het ophalen. Probeer het opnieuw.";
    errBox.style.display = "block";
  } finally {
    setLoading(false);
  }
}

findBtn.addEventListener("click", handleFind);
nameInput.addEventListener("keydown", (ev) => { if (ev.key === "Enter") handleFind(); });
