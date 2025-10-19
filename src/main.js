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

tabMember?.addEventListener("click", () => { switchTo("member"); });
// Admin click handler below (patched)
tabAdmin?.addEventListener("click", () => {
  try {
    const pwd = window.prompt("Vul uw wachtwoord in:");
    if (pwd === "1100") {
      sessionStorage.setItem("admin_ok", "1");
      sessionStorage.setItem("admin_level", "root");
    } else if (pwd === "Shadow") {
      sessionStorage.setItem("admin_ok", "1");
      sessionStorage.setItem("admin_level", "admin");
    } else {
      window.alert("Wachtwoord onjuist");
      return;
    }
    const lvl = sessionStorage.getItem("admin_level") || "admin";
    document.body.dataset.role = (lvl === "root") ? "rootadmin" : "admin";
    switchTo("admin");
    applyAdminLevel();
  } catch(e) {
    window.alert("Wachtwoordcontrole mislukt");
  }
});
initMemberView();
initAdminView();

// GATE: landelijke rit consent (single-button)

function applyAdminLevel() {
  try {
    const lvl = sessionStorage.getItem("admin_level") || "admin";
    const adminView = document.getElementById("viewAdmin");
    if (!adminView) return;
    const cards = Array.from(adminView.querySelectorAll(".card"));

    if (lvl === "root") {
      // Hoofdadmin: toon alles
      cards.forEach(card => { card.style.display = ""; card.removeAttribute("hidden"); });
      document.body.dataset.role = "rootadmin";
    } else {
      // Beperkte admin: alleen QR + handmatig rit
      document.body.dataset.role = "admin";
      cards.forEach(card => {
        const id = card.id || "";
        const keep = (id === "qrScanCard") || (id === "manualRideCard");
        card.style.display = keep ? "" : "none";
        if (!keep) card.setAttribute("hidden", "hidden");
      });
    }
  } catch (e) {
    // Stil falen
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const gate = document.getElementById("rideConsentGate");
  if (!gate) return;

  // Detect admin view → remove gate immediately
  const isAdminView = !!document.getElementById("ridePlanSection")
                    || document.body.dataset.role === "admin"
                    || /(^|\/)(admin|beheer)(\/|$)/i.test(location.pathname);
  if (isAdminView) { gate.remove(); return; }

  // Find signup section
  function findSignupSection() {
    const explicit = document.querySelector('#landelijkeSignup, [data-ride-signup="true"]');
    if (explicit) return explicit.closest("section") || explicit;
    const heads = Array.from(document.querySelectorAll("section h1, section h2, section h3"));
    const hit = heads.find(h => /inschrijven\s*voor\s*landelijke\s*rit/i.test(h.textContent || ""));
    return hit ? hit.closest("section") : null;
  }
  const signup = findSignupSection();
  if (!signup) { gate.remove(); return; }

  // Hide signup hard until consent
  signup.setAttribute("aria-hidden", "true");
  signup.setAttribute("hidden", "");
  signup.style.display = "none";

  const btn  = document.getElementById("rideConsentBtn");
  btn?.addEventListener("click", () => {
    // Show signup & remove gate
    signup.removeAttribute("aria-hidden");
    signup.removeAttribute("hidden");
    signup.style.display = "";
    gate.remove();
    const h = signup.querySelector("h1, h2, h3, [tabindex]") || signup;
    if (h) { h.setAttribute("tabindex","-1"); h.focus({ preventScroll:false }); }
  });
});
