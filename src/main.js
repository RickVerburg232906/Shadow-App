
import { initMemberView } from "./member.js";
import { initAdminView } from "./admin.js";
import { db, doc, getDoc, setDoc } from "./firebase.js";

const $ = (id) => document.getElementById(id);

// ==== Wachtwoorden uit Firestore (globals/passwords) ====
let PASSWORDS = null; // { inschrijftafel: string, hoofdadmin: string }
async function ensurePasswordsLoaded() {
  if (PASSWORDS) return PASSWORDS;
  const ref = doc(db, "globals", "passwords");
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const defaults = { inschrijftafel: "Shadow", hoofdadmin: "1100", updatedAt: Date.now() };
    await setDoc(ref, defaults, { merge: true });
    PASSWORDS = defaults;
  } else {
    const data = snap.data() || {};
    PASSWORDS = {
      inschrijftafel: String(data.inschrijftafel || "Shadow"),
      hoofdadmin: String(data.hoofdadmin || "1100"),
    };
  }
  return PASSWORDS;
}
async function setInschrijftafelPwd(newPwd) {
  const ref = doc(db, "globals", "passwords");
  await setDoc(ref, { inschrijftafel: String(newPwd || ""), updatedAt: Date.now() }, { merge: true });
  PASSWORDS = { ...(PASSWORDS || {}), inschrijftafel: String(newPwd || "") };
}
async function getInschrijftafelPwd() {
  const p = await ensurePasswordsLoaded();
  return p.inschrijftafel;
}
async function getHoofdAdminPwd() {
  const p = await ensurePasswordsLoaded();
  return p.hoofdadmin;
}

// Tabs & views
const tabMember = $("tabMember");
const tabAdmin  = $("tabAdmin");
const viewMember = $("viewMember");
const viewAdmin  = $("viewAdmin");

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
      // Beperkte admin: alleen QR + Handmatig
      document.body.dataset.role = "admin";
      cards.forEach(card => {
        const id = card.id || "";
        const keep = (id === "qrScanCard") || (id === "manualRideCard");
        card.style.display = keep ? "" : "none";
        if (!keep) card.setAttribute("hidden", "hidden");
      });
    }
  } catch (_) {}
}

function switchTo(which) {
  const isMember = which === "member";
  tabMember?.classList.toggle("active", isMember);
  tabAdmin?.classList.toggle("active", !isMember);
  viewMember?.classList.toggle("active", isMember);
  viewAdmin?.classList.toggle("active", !isMember);
  tabMember?.setAttribute("aria-pressed", String(isMember));
  tabAdmin?.setAttribute("aria-pressed", String(!isMember));
  if (window.innerWidth < 560) window.scrollTo({ top: 0, behavior: "smooth" });
}

// Tab handlers (member direct, admin via prompt)
tabMember?.addEventListener("click", () => switchTo("member"));
tabAdmin?.addEventListener("click", async () => {
  try {
    await ensurePasswordsLoaded();
    const pwd = window.prompt("Vul uw wachtwoord in:");
    if (pwd == null) return;
    const rootPwd = await getHoofdAdminPwd();
    const adminPwd = await getInschrijftafelPwd();

    if (pwd === rootPwd) {
      sessionStorage.setItem("admin_ok", "1");
      sessionStorage.setItem("admin_level", "root");
    } else if (pwd === adminPwd) {
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
    console.error(e);
    window.alert("Wachtwoordcontrole mislukt");
  }
});

// Init views
initMemberView();
initAdminView();

// Hoofdadmin: sectie voor wachtwoord inschrijftafel resetten
function setupAdminPwdSection() {
  try {
    const btn = document.getElementById("saveAdminPwd");
    const input = document.getElementById("newAdminPwd");
    const status = document.getElementById("pwdStatus");
    if (!btn || !input) return;
    input.value = "";
    btn.addEventListener("click", async () => {
      const v = String(input.value || "").trim();
      if (v.length < 3) {
        if (status) { status.textContent = "Minimaal 3 tekens."; status.classList.add("error"); }
        return;
      }
      try {
        await setInschrijftafelPwd(v);
        if (status) { status.textContent = "✅ Nieuw admin-wachtwoord opgeslagen in Firestore."; status.classList.remove("error"); }
        input.value = "";
      } catch (e) {
        console.error(e);
        if (status) { status.textContent = "❌ Opslaan mislukt."; status.classList.add("error"); }
      }
    });
  } catch (_) {}
}

// Consent-gate voor inschrijven landelijke rit (niet tonen aan admin views)
document.addEventListener("DOMContentLoaded", () => {
  try { if (sessionStorage.getItem("admin_ok")==="1") applyAdminLevel(); } catch(_) {}
  setupAdminPwdSection();

  const gate = document.getElementById("rideConsentGate");
  if (!gate) return;

  const adminTabActive = !!document.getElementById("viewAdmin") && document.getElementById("viewAdmin").classList.contains("active");
  const isAdminView = !!document.getElementById("ridePlanSection")
                    || adminTabActive
                    || /(^|\/)(admin|beheer)(\/|$)/i.test(location.pathname);
  if (isAdminView) { gate.remove(); return; }

  function findSignupSection() {
    const explicit = document.querySelector('#landelijkeSignup, [data-ride-signup="true"]');
    if (explicit) return explicit.closest("section") || explicit;
    const heads = Array.from(document.querySelectorAll("section h1, section h2, section h3"));
    const hit = heads.find(h => /inschrijven\s*voor\s*landelijke\s*rit/i.test(h.textContent || ""));
    return hit ? hit.closest("section") : null;
  }
  const signup = findSignupSection();
  if (!signup) { gate.remove(); return; }

  signup.setAttribute("aria-hidden", "true");
  signup.setAttribute("hidden", "");
  signup.style.display = "none";

  const btn  = document.getElementById("rideConsentBtn");
  btn?.addEventListener("click", () => {
    signup.removeAttribute("aria-hidden");
    signup.removeAttribute("hidden");
    signup.style.display = "";
    gate.remove();
    const h = signup.querySelector("h1, h2, h3, [tabindex]") || signup;
    if (h) { h.setAttribute("tabindex","-1"); h.focus({ preventScroll:false }); }
  });
});
