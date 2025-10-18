import { initMemberView } from "./member.js";
import { initAdminView } from "./admin.js";

const $ = (id) => document.getElementById(id);

const tabMember = $("tabMember");
const tabAdmin  = $("tabAdmin");
const viewMember = $("viewMember");
const viewAdmin  = $("viewAdmin");

function switchTo(which) {
  const isMember = which === "member";
  tabMember.classList.toggle("active", isMember);
  tabAdmin.classList.toggle("active", !isMember);
  viewMember.classList.toggle("active", isMember);
  viewAdmin.classList.toggle("active", !isMember);
  tabMember.setAttribute("aria-pressed", String(isMember));
  tabAdmin.setAttribute("aria-pressed", String(!isMember));
  // Scroll to top on small screens to avoid half-visible cards after tab switch
  if (window.innerWidth < 560) window.scrollTo({ top: 0, behavior: "smooth" });
}

tabMember?.addEventListener("click", () => switchTo("member"));
tabAdmin?.addEventListener("click", () => switchTo("admin"));

initMemberView();
initAdminView();



// GATE: landelijke rit consent
document.addEventListener("DOMContentLoaded", () => {
  const gate = document.getElementById("rideConsentGate");
  if (!gate) return;
  const chk = document.getElementById("rideConsentChk");
  const btn = document.getElementById("rideConsentBtn");
  const warn = document.getElementById("rideConsentWarn");

  // Heuristiek: vind de sectie 'Inschrijven voor landelijke rit'
  function findSignupSection() {
    // 1) expliciete id/data attribuut
    const explicit = document.querySelector('#landelijkeSignup, [data-ride-signup="true"]');
    if (explicit) return explicit.closest("section") || explicit;
    // 2) zoek koppen met tekst
    const heads = Array.from(document.querySelectorAll("section h1, section h2, section h3"));
    const hit = heads.find(h => /inschrijven\s+voor\s+landelijke\s+rit/i.test(h.textContent || ""));
    if (hit) return hit.closest("section");
    // 3) fallback: null
    return null;
  }

  const signup = findSignupSection();
  if (!signup) return; // niets te verbergen als we 'm niet vinden

  // Start: verbergen
  signup.setAttribute("aria-hidden", "true");
  signup.style.display = "none";

  function updateUI() {
    btn.disabled = !chk.checked;
    warn.textContent = chk.checked ? "" : "Vink het akkoord aan om verder te gaan.";
  }
  chk?.addEventListener("change", updateUI);
  updateUI();

  btn?.addEventListener("click", () => {
    if (!chk.checked) { updateUI(); return; }
    // Akkoord → tonen en gate verbergen
    signup.style.display = "";
    signup.removeAttribute("aria-hidden");
    gate.style.display = "none";
  });
});
