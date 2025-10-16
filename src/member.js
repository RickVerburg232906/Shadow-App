import { db, doc, getDoc } from "./firebase.js";

function $(id) {
  return document.getElementById(id);
}

const rName = $("rName");
const rMemberNo = $("rMemberNo");
const rRidesCount = $("rRidesCount");

// Leesbaar formatteren (fallback "—")
function fmt(val) {
  if (val === null || val === undefined || val === "" || Number.isNaN(val)) return "—";
  return String(val);
}

// Haal ridesCount uit Firestore: members/{LidNr}
async function fetchRidesCount(lid) {
  try {
    const snap = await getDoc(doc(db, "members", String(lid)));
    if (!snap.exists()) return 0;
    const data = snap.data();
    const rc = Number(data?.ridesCount);
    return Number.isFinite(rc) ? rc : 0;
  } catch (e) {
    console.warn("ridesCount ophalen mislukt:", e);
    return null; // zodat we "—" tonen bij fout
  }
}

// Toon ritten-aantal in de UI
async function refreshRidesCount(lid) {
  if (!rRidesCount) return;
  rRidesCount.textContent = "…";
  const count = await fetchRidesCount(lid);
  rRidesCount.textContent = fmt(count);
}

// Helper om LidNr te parsen uit tekst (b.v. "12345" of "LidNr: 12345")
function parseLidFromText(text) {
  if (!text) return null;
  const t = String(text).trim();
  // Als het al puur numeriek is
  if (/^\d{1,}$/.test(t)) return t;
  // Zoeken naar "LidNr: 12345"
  const m = t.match(/lidnr\s*:\s*(\d{1,})/i);
  if (m) return m[1];
  // Probeer laatste numerieke token
  const m2 = t.match(/(\d{2,})\b/);
  if (m2) return m2[1];
  return null;
}

// Publieke API om vanuit elders het lid te zetten (optioneel te gebruiken)
// - vult Naam en LidNr
// - triggert het ophalen van ridesCount
export function setMemberInView({ naam, lid }) {
  if (rName && naam) rName.textContent = naam;
  if (rMemberNo && lid) rMemberNo.textContent = String(lid);
  if (lid) refreshRidesCount(lid);
}

// Init Member view:
// - als er al een LidNr staat bij laden → meteen ophalen
// - luister op wijzigingen van #rMemberNo (bv. wanneer QR gemaakt wordt)
export function initMemberView() {
  // 1) Direct bij start als er al iets staat
  const initialLid = parseLidFromText(rMemberNo?.textContent || "");
  if (initialLid) {
    refreshRidesCount(initialLid);
  } else if (rRidesCount) {
    rRidesCount.textContent = "—";
  }

  // 2) Observeer wijzigingen in rMemberNo.textContent
  if (rMemberNo && window.MutationObserver) {
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "childList" || m.type === "characterData" || m.type === "subtree") {
          const lid = parseLidFromText(rMemberNo.textContent || "");
          if (lid) {
            refreshRidesCount(lid);
          } else if (rRidesCount) {
            rRidesCount.textContent = "—";
          }
        }
      }
    });
    obs.observe(rMemberNo, { childList: true, characterData: true, subtree: true });
  }
}

// Optioneel: auto-init als dit script los staat
try {
  initMemberView();
} catch (_e) {
  // negeer; kan ook via app router apart aangeroepen worden
}
