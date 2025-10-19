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
tabAdmin?.addEventListener("click", () => {
  try {
    const ok = sessionStorage.getItem("admin_ok") === "1";
    if (!ok) {
      const pwd = window.prompt("Vul uw wachtwoord in:");
      if (pwd !== "Shadow") {
        window.alert("Wachtwoord onjuist");
        return;
      }
      sessionStorage.setItem("admin_ok", "1");
    }
    switchTo("admin");
  } catch(e) {
    window.alert("Wachtwoordcontrole mislukt");
  }
});

initMemberView();
initAdminView();

// GATE: landelijke rit consent (single-button)
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
