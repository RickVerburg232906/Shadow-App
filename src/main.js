
import { initMemberView, getPlannedDates } from "./member.js";
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


function setupAdminSubtabs() {
  try {
    const root = document.getElementById("adminSubtabs");
    if (!root) return;
    const lvl = sessionStorage.getItem("admin_level") || "admin";
    // Only show subtabs for hoofdadmin (root)
    if (lvl !== "root") {
      root.setAttribute("hidden", "");
      return;
    }
    root.removeAttribute("hidden");
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




// Expose a reusable admin login flow so we can re-prompt anywhere
async function adminLoginFlow(redirectTo) {
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
    const target = redirectTo || "admin-scan.html";
    if (typeof target === "string") window.location.href = target;
  } catch (e) {
    console.error(e);
    window.alert("Wachtwoordcontrole mislukt");
  }
}
window.adminLoginFlow = adminLoginFlow;

// Tab handlers (member direct, admin via prompt)
tabMember?.addEventListener("click", () => switchTo("member"));

tabAdmin?.addEventListener("click", async () => {
  // Always re-use shared login flow from the home page tab
  await adminLoginFlow("admin-scan.html");
});

// Intercept topbar "Inschrijftafel" nav clicks on admin pages to re-prompt password
document.addEventListener("click", (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLElement)) return;
  const a = t.closest("a.nav-link-admin, .nav .tab") || null;
  if (a && a instanceof HTMLAnchorElement) {
    const href = a.getAttribute("href") || "";
    if (/admin-scan\.html$/i.test(href)) {
      ev.preventDefault();
      // After login, stay on this page by default
      adminLoginFlow(window.location.pathname);
    }
  }
}, { passive: false });
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
    // remove the gate for this run only; do not persist consent across refresh
    gate.remove();
    try { hidePlannedRides(); } catch(_) {}
    const h = signup.querySelector("h1, h2, h3, [tabindex]") || signup;
    if (h) { h.setAttribute("tabindex","-1"); h.focus({ preventScroll:false }); }
  });
});

// Register service worker for PWA (if available)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      console.log('ServiceWorker registered:', reg.scope);
    }).catch((err) => {
      console.warn('ServiceWorker registration failed:', err);
    });
  });
}

// --- Splash control API ---
function setSplashProgress(pct, caption) {
  try {
    const bar = document.getElementById('splashProgressBar');
    const cap = document.getElementById('splashCaption');
    if (bar) bar.style.width = Math.max(0, Math.min(100, Number(pct) || 0)) + '%';
    if (cap && typeof caption !== 'undefined') cap.textContent = String(caption);
  } catch (_) {}
}
function hideSplash() {
  try {
    const splash = document.getElementById('appSplash');
    if (!splash) return;
    splash.setAttribute('aria-hidden', 'true');
    // small delay to allow transition
    setTimeout(() => { try { splash.style.display = 'none'; } catch(_) {} }, 300);
  } catch (_) {}
}
function showSplash() {
  try {
    const splash = document.getElementById('appSplash');
    if (!splash) return;
    splash.setAttribute('aria-hidden', 'false');
    splash.style.display = '';
  } catch (_) {}
}

// Expose API for other modules
window.appSplash = { setProgress: setSplashProgress, hide: hideSplash, show: showSplash };

// Auto-hide splash shortly after initial view inits
try {
  // allow initMemberView/initAdminView to run first
  setTimeout(() => {
    setSplashProgress(100, 'Klaar');
    hideSplash();
  }, 4000);
} catch (_) {}

// --- Planned rides support ---
function formatDateISO(d) {
  try {
    const dt = new Date(d);
    if (isNaN(dt)) return String(d);
    return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch (e) { return String(d); }
}

function renderPlannedRides(listEl, rides) {
  if (!listEl) return;
  listEl.innerHTML = '';
  if (!rides || rides.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Geen geplande ritten.';
    listEl.appendChild(li);
    return;
  }
  // Filter out past dates (already geweest)
  const visible = (Array.isArray(rides) ? rides.slice() : []).filter(r => {
    const d = daysUntil(r);
    // keep null-parsable values (unknown), and dates that are today (0) or in the future (>0)
    return d === null ? true : d >= 0;
  });

  // sort ascending by date
  visible.sort((a,b) => new Date(a) - new Date(b));

  if (visible.length === 0) {
    // Show empty state with visual element
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.innerHTML = `
      <div class="empty-state-icon">📅</div>
      <h3 class="empty-state-title">Nog geen ritten gepland</h3>
      <p class="empty-state-description">
        Er zijn momenteel geen landelijke ritten ingepland. 
        Check later terug of neem contact op met de club voor meer informatie.
      </p>
    `;
    listEl.appendChild(emptyState);
    return;
  }

  visible.forEach(r => {
    const li = document.createElement('li');
    const spanDate = document.createElement('span');
    spanDate.className = 'date';
    spanDate.textContent = formatDateISO(r);

    const spanDays = document.createElement('span');
    spanDays.className = 'days-left';
    const days = daysUntil(r);
    if (days === null) {
      spanDays.textContent = '-';
    } else if (days === 0) {
      spanDays.textContent = 'Vandaag';
    } else if (days === 1) {
      spanDays.textContent = '1 dag';
    } else if (days > 1) {
      spanDays.textContent = `${days} dagen`;
    } else {
      spanDays.textContent = `${Math.abs(days)} dagen geleden`;
    }
    spanDays.classList.add(classifyDays(days));

    li.appendChild(spanDate);
    li.appendChild(spanDays);
    listEl.appendChild(li);
  });
}

function daysUntil(value) {
  try {
    const d = new Date(value);
    if (isNaN(d)) return null;
    // Use local dates (ignore time component)
    const today = new Date();
    const t0 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const t1 = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.round((t1 - t0) / (1000 * 60 * 60 * 24));
    return diff;
  } catch (_) { return null; }
}

function classifyDays(days) {
  // returns a class name for styling
  if (days === null) return '';
  if (days < 0) return 'passed';
  if (days <= 3) return 'soon';
  return 'upcoming';
}

function hidePlannedRides() {
  const section = document.getElementById('plannedRidesSection');
  if (section) section.style.display = 'none';
}

function showPlannedRides() {
  const section = document.getElementById('plannedRidesSection');
  if (section) section.style.display = '';
}

// Example: source of planned rides. In a real app this may come from Firestore.
const DEFAULT_PLANNED_RIDES = [
  // ISO dates for consistency
  '2025-10-25',
  '2025-11-08',
  '2025-12-06'
];

document.addEventListener('DOMContentLoaded', () => {
  try {
    const listEl = document.getElementById('plannedRidesList');
    // try load from Firestore via member.getPlannedDates()
    (async () => {
      try {
        const planned = (typeof getPlannedDates === 'function') ? await getPlannedDates() : null;
        if (planned && Array.isArray(planned) && planned.length) {
          renderPlannedRides(listEl, planned);
        } else {
          renderPlannedRides(listEl, DEFAULT_PLANNED_RIDES);
        }
      } catch (e) {
        renderPlannedRides(listEl, DEFAULT_PLANNED_RIDES);
      }
    })();

    // Always show planned rides on load (consent is not persisted across refresh)
    showPlannedRides();
  } catch (e) { console.error('Planned rides init failed', e); }
});
