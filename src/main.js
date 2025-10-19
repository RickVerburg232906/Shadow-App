
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
async function setHoofdAdminPwd(newPwd) {
  const ref = doc(db, "globals", "passwords");
  await setDoc(ref, { hoofdadmin: String(newPwd || ""), updatedAt: Date.now() }, { merge: true });
  PASSWORDS = { ...(PASSWORDS || {}), hoofdadmin: String(newPwd || "") };
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


function setAdminSubtabActive(n) {
  try {
    sessionStorage.setItem("admin_subtab", String(n));
    const root = document.getElementById("adminSubtabs");
    if (!root) return;
    const btns = Array.from(root.querySelectorAll(".subtab"));
    btns.forEach(b => {
      const isActive = String(b.dataset.adminTab) === String(n);
      b.setAttribute("aria-pressed", String(isActive));
    });
    const cards = Array.from(document.querySelectorAll("#viewAdmin .card"));
    cards.forEach(card => {
      const grp = card.getAttribute("data-admin-group");
      if (!grp) return; // leave cards without group to default behavior
      card.style.display = (String(grp) === String(n)) ? "" : "none";
    });
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch(_) {}
  } catch (_) {}
}

function setupAdminSubtabs() {
  try {
    const root = document.getElementById("adminSubtabs");
    if (!root) return;
    const lvl = sessionStorage.getItem("admin_level") || "admin";
    // Only show subtabs for hoofdadmin (root)
    if (lvl !== "root") {
      root.setAttribute("hidden", "");
      // Ensure grouped cards are visible/hidden by applyAdminLevel for non-root
      return;
    }
    root.removeAttribute("hidden");
    // Attach listeners
    root.addEventListener("click", (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLElement)) return;
      if (t.classList.contains("subtab") && t.dataset.adminTab) {
        setAdminSubtabActive(t.dataset.adminTab);
      }
    }, { passive: true });
    // Initial tab
    const saved = sessionStorage.getItem("admin_subtab") || "1";
    setAdminSubtabActive(saved);
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


// === Masked password modal ===

async function promptPasswordMasked(title = "Wachtwoord", placeholder = "Wachtwoord") {
  return new Promise((resolve) => {
    // Overlay
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.4)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "9999";

    // Dialog
    const card = document.createElement("div");
    card.style.background = "var(--card-bg, #111)";
    card.style.color = "var(--fg, #fff)";
    card.style.border = "1px solid rgba(255,255,255,0.12)";
    card.style.borderRadius = "16px";
    card.style.padding = "18px 16px";
    card.style.minWidth = "320px";
    card.style.maxWidth = "92vw";
    card.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";
    card.setAttribute("role","dialog");
    card.setAttribute("aria-modal","true");
    card.setAttribute("aria-label", title);

    const h = document.createElement("h3");
    h.textContent = title;
    h.style.margin = "0 0 10px 0";
    h.style.fontSize = "18px";

    const input = document.createElement("input");
    input.type = "password";
    input.placeholder = placeholder;
    input.autocomplete = "current-password";
    input.style.width = "100%";
    input.style.padding = "10px 12px";
    input.style.borderRadius = "10px";
    input.style.border = "1px solid rgba(255,255,255,0.2)";
    input.style.background = "transparent";
    input.style.color = "inherit";

    // Actions under the input
    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "10px";
    actions.style.alignItems = "center";
    actions.style.justifyContent = "flex-end";
    actions.style.marginTop = "12px";

    const ok = document.createElement("button");
    ok.className = "btn";
    ok.textContent = "Doorgaan";

    const cancel = document.createElement("button");
    cancel.className = "btn btn-ghost";
    cancel.textContent = "Annuleren";

    actions.appendChild(cancel);
    actions.appendChild(ok);

    card.appendChild(h);
    card.appendChild(input);
    card.appendChild(actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    let finished = false;
    function close(val) {
      if (finished) return;
      finished = true;
      try { document.body.removeChild(overlay); } catch(_) {}
      resolve(val);
    }

    ok.addEventListener("click", () => close(input.value || ""));
    cancel.addEventListener("click", () => close(null));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(null);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); ok.click(); }
      if (e.key === "Escape") { e.preventDefault(); close(null); }
    });

    setTimeout(() => input.focus(), 0);
  });
}




// Tab handlers (member direct, admin via prompt)
tabMember?.addEventListener("click", () => switchTo("member"));

tabAdmin?.addEventListener("click", async () => {
  try {
    await ensurePasswordsLoaded();
    const pwd = await promptPasswordMasked("Vul uw wachtwoord in", "Wachtwoord");
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
    try { setupAdminSubtabs(); } catch (_) {}
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

function setupRootAdminPwdSection() {
  try {
    const btn = document.getElementById("saveRootPwd");
    const input = document.getElementById("newRootPwd");
    const status = document.getElementById("rootPwdStatus");
    if (!btn || !input) return;
    input.value = "";
    btn.addEventListener("click", async () => {
      const v = String(input.value || "").trim();
      if (v.length < 4) {
        if (status) { status.textContent = "Minimaal 4 tekens."; status.classList.add("error"); }
        return;
      }
      try {
        await setHoofdAdminPwd(v);
        if (status) { status.textContent = "✅ Nieuw hoofdadmin-wachtwoord opgeslagen in Firestore."; status.classList.remove("error"); }
        input.value = "";
      } catch (e) {
        console.error(e);
        if (status) { status.textContent = "❌ Opslaan mislukt."; status.classList.add("error"); }
      }
    });
  } catch (_) {}
}

document.addEventListener("DOMContentLoaded", () => {
  try { if (sessionStorage.getItem("admin_ok")==="1") applyAdminLevel();
    try { setupAdminSubtabs(); } catch (_) {} } catch(_) {}
  setupAdminPwdSection();
  setupRootAdminPwdSection();

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
