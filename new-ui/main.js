// New UI main script

import { getPlannedDates, searchMembers, getLunchOptions, getMemberById } from './firestore.js';
import { doc, getDoc, onSnapshot, db } from '../src/firebase.js';

// --- Scan-lock utilities (moved from legacy src/member.js) ---
function todayYMD() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function toYMDString(value) {
    try {
        if (typeof value === 'string' && /\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0,10);
        const d = new Date(value);
        if (!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        return '';
    } catch { return ''; }
}

export async function isMemberScannedToday(memberId) {
    try {
        if (!memberId) return false;
        const ref = doc(db, 'members', String(memberId));
        const snap = await getDoc(ref);
        if (!snap.exists()) return false;
        const data = snap.data() || {};
        const scans = Array.isArray(data.ScanDatums) ? data.ScanDatums.map(d => toYMDString(d)).filter(Boolean) : [];
        return scans.includes(todayYMD());
    } catch (e) { console.error('isMemberScannedToday error', e); return false; }
}

export function attachScanLockListener(memberId, options = {}) {
    try {
        if (!memberId) return () => {};
        const summarySelector = options.summarySelector || '#member-lunch-summary';
        const iconSelector = options.iconSelector || '.summary-touch-icon';
        const ref = doc(db, 'members', String(memberId));
        const unsub = onSnapshot(ref, (snap) => {
            try {
                const data = (snap && snap.exists()) ? snap.data() : {};
                const scans = Array.isArray(data.ScanDatums) ? data.ScanDatums.map(d => toYMDString(d)).filter(Boolean) : [];
                const locked = scans.includes(todayYMD());
                try {
                    const summaryEl = document.querySelector(summarySelector);
                    const iconEl = document.querySelector(iconSelector);
                    if (locked) {
                        if (summaryEl) {
                            summaryEl.dataset.locked = '1';
                            summaryEl.setAttribute('aria-disabled', 'true');
                            summaryEl.style.pointerEvents = 'none';
                            summaryEl.style.opacity = summaryEl.style.opacity || '0.9';
                        }
                        if (iconEl) {
                            try { iconEl.innerHTML = '<span class="material-symbols-outlined">lock</span>'; } catch(_){}
                        }
                    } else {
                        if (summaryEl) {
                            delete summaryEl.dataset.locked;
                            summaryEl.removeAttribute('aria-disabled');
                            summaryEl.style.pointerEvents = '';
                            summaryEl.style.opacity = '';
                        }
                        if (iconEl) {
                            try {
                                const def = iconEl.dataset && iconEl.dataset.defaultIcon;
                                if (def) iconEl.innerHTML = def;
                                else iconEl.innerHTML = '<span class="material-symbols-outlined">touch_app</span>';
                            } catch(_){}
                        }
                    }
                } catch (e) { console.warn('attachScanLockListener UI update failed', e); }
            } catch (e) { console.error('attachScanLockListener snapshot handler error', e); }
        }, (err) => { console.warn('attachScanLockListener onSnapshot error', err); });
        return unsub;
    } catch (e) { console.error('attachScanLockListener error', e); return () => {}; }
}

console.log('New UI loaded');

// Populate the rides list from globals/rideConfig -> plannedDates (show today + future dates)
async function populatePlannedRides() {
    try {
        const arr = await getPlannedDates();
        console.debug('populatePlannedRides: raw plannedDates=', arr);
        if (!Array.isArray(arr) || arr.length === 0) {
            console.debug('populatePlannedRides: no planned dates returned');
            const container = document.getElementById('rides-list');
            if (container) container.innerHTML = `<div class="text-sm text-gray-500">Geen geplande ritten</div>`;
            return;
        }
        // Normalize to YYYY-MM-DD strings and filter today or future
        const today = new Date();
        const todayYmd = today.toISOString().slice(0,10);
        const norm = arr.map(s => (typeof s === 'string' ? s.slice(0,10) : '')).filter(Boolean);
        const future = norm.filter(d => d >= todayYmd).sort();
        const container = document.getElementById('rides-list');
        if (!container) return;
        if (!Array.isArray(future) || future.length === 0) {
            // show friendly placeholder instead of clearing silently
            container.innerHTML = `<div class="text-sm text-gray-500">Geen geplande ritten</div>`;
            return;
        }

        container.innerHTML = future.map(d => {
            const dt = new Date(d);
            const label = dt.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
            const isToday = (d === todayYmd);
            const badge = isToday
                ? `<span class="bg-[#1e2530] text-accent-yellow border border-gray-700 px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm">Vandaag</span>`
                : `<span class="bg-[#1e2530]/50 text-accent-yellow dark:bg-[#1e2530] border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm">${Math.max(1, Math.round((new Date(d) - today) / (1000*60*60*24)))} dagen</span>`;
            return `<div class="bg-surface-light dark:bg-surface-dark border border-gray-100 dark:border-gray-700 rounded-xl p-4 flex items-center justify-between shadow-sm cursor-pointer hover:border-primary/30 transition-all"><span class="text-[#0e121a] dark:text-white font-medium text-base">${label}</span>${badge}</div>`;
        }).join('');
    } catch (e) {
        console.error('populatePlannedRides error', e);
    }
}

// populatePlannedRides() will be called after fragments are loaded and the initial page is rendered

// Simple virtual navigation stack. Use a stable container selector that doesn't depend on layout classes.
const pageContainerSelector = '.relative.flex';

console.log('Setting up virtual navigation — pageContainerSelector=' + pageContainerSelector);

// Currently selected member (persist selection across page fragments)
let selectedMember = null;
// When true, confirming lunch will skip the jaarhanger page and go straight to member-info
let skipJaarhangerOnConfirm = false;
// When true, a user-initiated click on the jaarhanger summary should force-open the jaarhanger page for editing
let forceOpenJaarhanger = false;

// Page fragments are loaded from external HTML files in ./lid-ui/ to keep main.js small.
let originalPage;
let signupPage;
let lunchPage;
let jaarhangerPage;
let memberInfoPage;


// Navigation stack holds HTML strings. The top is current page.
const navStack = [];

function render(html) {
    const container = document.querySelector(pageContainerSelector);
    if (!container) {
        console.warn('render: container not found for selector', pageContainerSelector);
        return;
    }
    container.innerHTML = html;
    // If the rendered page contains lunch placeholders, populate them.
    try {
        const hasKeuze = !!document.getElementById('keuzeEtenList');
        const hasVast = !!document.getElementById('vastEtenList');
        if (hasKeuze || hasVast) {
            // populate options; do not block render
            try { fillLunchOptions().catch(e => console.error('fillLunchOptions failed after render', e)); } catch (e) { console.error(e); }
        }
        // set jaarhanger date label if present
        try {
            const jlab = document.getElementById('jaarhanger-date-label');
            if (jlab) jlab.textContent = formatShortDateNL(new Date());
        } catch (e) { console.error('setting jaarhanger date label failed', e); }
        // set member info on memberInfoPage if present
        try {
            const nameEl = document.getElementById('member-name');
            const numEl = document.getElementById('member-number');
            const regionEl = document.getElementById('member-region');
            if (nameEl) nameEl.textContent = (selectedMember && selectedMember.name) ? selectedMember.name : '';
            if (numEl) numEl.textContent = (selectedMember && selectedMember.lidnummer) ? selectedMember.lidnummer : '';
            if (regionEl) regionEl.textContent = (selectedMember && selectedMember.regio) ? selectedMember.regio : '';
            // Set jaarhanger edition to current year
            try {
                const editionEl = document.getElementById('member-jaarhanger-edition');
                if (editionEl) editionEl.textContent = `${new Date().getFullYear()} Editie`;
            } catch (e) { console.error('setting jaarhanger edition failed', e); }
            // Populate lunch choice text and status if present
            try {
                const lunchTextEl = document.getElementById('member-choice-lunch-text');
                const lunchStatusEl = document.getElementById('member-choice-lunch-status');
                if (lunchTextEl) {
                    if (selectedMember) {
                        const part = selectedMember.participation ?? null;
                        if (part === 'no') lunchTextEl.textContent = 'Niet aanwezig';
                        else lunchTextEl.textContent = selectedMember.lunchChoice || 'Geen keuze';
                    } else {
                        lunchTextEl.textContent = '';
                    }
                }
                // Attach scan-lock listener for member pages so lunch summary locks when scanned today
                try {
                    const iconEl = document.querySelector('#member-lunch-summary .ml-2');
                    if (iconEl && !iconEl.dataset.defaultIcon) iconEl.dataset.defaultIcon = iconEl.innerHTML || '<span class="material-symbols-outlined text-[14px] leading-none">touch_app</span>';
                    if (selectedMember) {
                        // unsubscribe previous listener if any
                        try { if (selectedMember._scanLockUnsub && typeof selectedMember._scanLockUnsub === 'function') selectedMember._scanLockUnsub(); } catch(_){}
                        const memberId = (selectedMember.lidnummer || selectedMember.id || selectedMember.lid || selectedMember.memberId) ? (selectedMember.lidnummer || selectedMember.id || selectedMember.lid || selectedMember.memberId) : null;
                        if (memberId) selectedMember._scanLockUnsub = attachScanLockListener(memberId, { summarySelector: '#member-lunch-summary', iconSelector: '#member-lunch-summary .ml-2' });
                    }
                } catch (e) { console.error('attach scan lock listener failed', e); }
                if (lunchStatusEl) {
                    if (selectedMember) {
                        const part = selectedMember.participation ?? null;
                        if (part === 'no') {
                            lunchStatusEl.className = 'w-9 h-9 flex items-center justify-center rounded-full bg-accent-red/10 dark:bg-accent-red/20 text-accent-red';
                            lunchStatusEl.innerHTML = '<span class="material-symbols-outlined text-[16px] leading-none">close</span>';
                        } else {
                            lunchStatusEl.className = 'w-9 h-9 flex items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
                            lunchStatusEl.innerHTML = '<span class="material-symbols-outlined text-[16px] leading-none">check</span>';
                        }
                    } else {
                        lunchStatusEl.innerHTML = '<span class="material-symbols-outlined text-[16px] leading-none">check</span>';
                        lunchStatusEl.className = 'w-9 h-9 flex items-center justify-center rounded-full';
                    }
                }
                // Jaarhanger status icon (mirror of lunch status behavior)
                try {
                    const jaarStatusEl = document.getElementById('member-choice-jaarhanger-status');
                    if (jaarStatusEl) {
                        if (selectedMember) {
                            const jpart = selectedMember.jaarhanger ?? null;
                            if (jpart === 'no') {
                                jaarStatusEl.className = 'w-9 h-9 flex items-center justify-center rounded-full bg-accent-red/10 dark:bg-accent-red/20 text-accent-red';
                                jaarStatusEl.innerHTML = '<span class="material-symbols-outlined text-[16px] leading-none">close</span>';
                            } else if (jpart === 'yes') {
                                jaarStatusEl.className = 'w-9 h-9 flex items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
                                jaarStatusEl.innerHTML = '<span class="material-symbols-outlined text-[16px] leading-none">check</span>';
                            } else {
                                jaarStatusEl.className = 'w-9 h-9 flex items-center justify-center rounded-full';
                                jaarStatusEl.innerHTML = '<span class="text-xs font-medium text-gray-500">Nog ophalen</span>';
                            }
                        } else {
                            jaarStatusEl.className = 'w-9 h-9 flex items-center justify-center rounded-full';
                            jaarStatusEl.innerHTML = '<span class="text-xs font-medium text-gray-500">Nog ophalen</span>';
                        }
                    }
                } catch (e) { console.error('setting jaarhanger status failed', e); }
                // Restore jaarhanger participation radio on jaarhanger page (if applicable)
                try {
                    const jaarContainer = document.getElementById('jaarhanger-page');
                    if (jaarContainer && selectedMember) {
                        // Only restore jaarhanger if the user explicitly set it previously
                        const partVal = (typeof selectedMember.jaarhanger !== 'undefined') ? selectedMember.jaarhanger : null;
                        if (partVal) {
                            const partInput = jaarContainer.querySelector(`input[name="participation"][value="${partVal}"]`);
                            if (partInput) {
                                partInput.checked = true;
                                try { partInput.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
                            }
                        }
                    }
                } catch (e) { console.error('restore jaarhanger selection failed', e); }
            } catch (e) { console.error('setting member lunch choice failed', e); }
                    // Render member stars based on plannedDates and member ScanDatums
                    try {
                        const starsContainer = document.getElementById('member-stars');
                        if (starsContainer) {
                            // unsubscribe previous stars listener if any
                            try { if (selectedMember && selectedMember._starsUnsub && typeof selectedMember._starsUnsub === 'function') selectedMember._starsUnsub(); } catch(_){}
                            // async fetch planned dates and then render
                            getPlannedDates().then(dates => {
                                try {
                                    if (!Array.isArray(dates)) dates = [];
                                    // normalize dates to YMD strings (use all planned dates)
                                    const planned = dates.map(d => (typeof d === 'string' ? d.slice(0,10) : '')).filter(Boolean);
                                    // get member scan dates normalized
                                    const scans = getMemberScanYMDs(selectedMember || {});
                                    console.debug('member stars: planned=', planned, 'scans=', scans);
                                    // build stars: one per planned date (up to 5)
                                    const html = planned.map(pd => {
                                        const isScanned = scans.includes(pd);
                                        const title = `Rit ${pd}`;
                                        if (isScanned) {
                                                return `<span title="${title}" class="material-symbols-outlined text-accent-yellow text-[32px]" style="font-variation-settings: 'FILL' 1, 'wght' 400; -webkit-font-variation-settings: 'FILL' 1, 'wght' 400;">star</span>`;
                                            } else {
                                                return `<span title="${title}" class="material-symbols-outlined text-gray-300 dark:text-gray-600 text-[32px]" style="font-variation-settings: 'FILL' 0, 'wght' 400; -webkit-font-variation-settings: 'FILL' 0, 'wght' 400;">star</span>`;
                                            }
                                    }).join('');
                                    if (html) starsContainer.innerHTML = html; else starsContainer.innerHTML = `<div class="text-sm text-gray-500">Geen geplande ritten</div>`;
                                    try {
                                        const countEl = document.getElementById('member-ridden-count');
                                        if (countEl) {
                                            const matched = planned.filter(pd => scans.includes(pd)).length;
                                            countEl.textContent = `${matched} / ${planned.length}`;
                                        }
                                    } catch (e) { console.error('updating member ridden count failed', e); }
                                    // Generate check-in QR code for this member's choices
                                    try {
                                        const qrImg = document.getElementById('checkin-qr-img');
                                        if (qrImg) {
                                            const memberId = (selectedMember && (selectedMember.lidnummer || selectedMember.id || selectedMember.lid || selectedMember.memberId)) ? (selectedMember.lidnummer || selectedMember.id || selectedMember.lid || selectedMember.memberId) : '';
                                            const payload = {
                                                memberId: String(memberId || ''),
                                                lunchKeuze: (selectedMember && selectedMember.lunchChoice) ? selectedMember.lunchChoice : '',
                                                lunchDeelname: (selectedMember && selectedMember.participation) ? selectedMember.participation : '',
                                                Jaarhanger: (selectedMember && typeof selectedMember.jaarhanger !== 'undefined' && selectedMember.jaarhanger !== null) ? selectedMember.jaarhanger : ''
                                            };
                                            const dataStr = JSON.stringify(payload);
                                            // Use external QR generation service to produce a PNG URL
                                            const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=480x480&data=' + encodeURIComponent(dataStr);
                                            qrImg.src = qrUrl;
                                            qrImg.alt = `QR: ${dataStr}`;
                                            qrImg.setAttribute('data-qrcode-payload', dataStr);
                                        }
                                    } catch (e) { console.error('generating checkin QR failed', e); }
                                } catch (e) { console.error('rendering member stars failed', e); }
                            }).catch(e => { console.error('getPlannedDates failed for member stars', e); if (document.getElementById('member-stars')) document.getElementById('member-stars').innerHTML = '<div class="text-sm text-gray-500">Fout bij laden</div>'; });
                            // Attach live listener to update stars when member ScanDatums change
                            try {
                                const memberId = (selectedMember && (selectedMember.lidnummer || selectedMember.id || selectedMember.lid || selectedMember.memberId)) ? (selectedMember.lidnummer || selectedMember.id || selectedMember.lid || selectedMember.memberId) : null;
                                if (memberId) {
                                    selectedMember._starsUnsub = onSnapshot(doc(db, 'members', String(memberId)), snap => {
                                        try {
                                            const data = (snap && snap.exists()) ? snap.data() : {};
                                            const scans = getMemberScanYMDs(data || {});
                                            getPlannedDates().then(dates2 => {
                                                try {
                                                    const planned = (Array.isArray(dates2) ? dates2 : []).map(d => (typeof d === 'string' ? d.slice(0,10) : '')).filter(Boolean);
                                                    const html = planned.map(pd => {
                                                        const isScanned = scans.includes(pd);
                                                        const title = `Rit ${pd}`;
                                                        if (isScanned) return `<span title="${title}" class="material-symbols-outlined text-accent-yellow text-[32px]" style="font-variation-settings: 'FILL' 1, 'wght' 400; -webkit-font-variation-settings: 'FILL' 1, 'wght' 400;">star</span>`;
                                                        return `<span title="${title}" class="material-symbols-outlined text-gray-300 dark:text-gray-600 text-[32px]" style="font-variation-settings: 'FILL' 0, 'wght' 400; -webkit-font-variation-settings: 'FILL' 0, 'wght' 400;">star</span>`;
                                                    }).join('');
                                                    if (starsContainer) starsContainer.innerHTML = (html || `<div class="text-sm text-gray-500">Geen geplande ritten</div>`);
                                                    try { const countEl = document.getElementById('member-ridden-count'); if (countEl) { const matched = planned.filter(pd => scans.includes(pd)).length; countEl.textContent = `${matched} / ${planned.length}`; } } catch (e) { console.error('updating member ridden count failed', e); }
                                                } catch (e) { console.error('live stars update failed', e); }
                                            }).catch(e => { console.error('getPlannedDates failed for live update', e); });
                                        } catch (e) { console.error('member stars snapshot handler error', e); }
                                    }, err => { console.warn('member stars onSnapshot error', err); });
                                }
                            } catch (e) { console.error('attach live stars listener failed', e); }
                        }
                    } catch (e) { console.error('scheduling member stars render failed', e); }
        } catch (e) { console.error('setting member info failed', e); }
    } catch (e) { console.error('render post-fill check failed', e); }
    // Ensure new pages start at the top (reset scroll)
    try {
        resetScrollPositions();
        // adjust inner main to fit viewport (header/footer aware)
        try { adjustMainHeight(); } catch(e) { console.error('adjustMainHeight post-render failed', e); }
    } catch (e) { console.error('render scroll reset failed', e); }
    // If this rendered page contains the rides list, (re)populate it.
    try {
        if (typeof populatePlannedRides === 'function' && document.getElementById('rides-list')) {
            try { populatePlannedRides().catch(err => console.error('populatePlannedRides render-time failed', err)); } catch (err) { console.error('populatePlannedRides invocation failed', err); }
        }
    } catch (e) { console.error('render: checking for rides-list failed', e); }
}

// Reset scroll on likely scroll containers so new pages always start at the top.
function resetScrollPositions() {
    try {
        // window / document
        try { window.scrollTo(0, 0); } catch(_){}
        try { document.documentElement.scrollTop = 0; } catch(_){}
        try { document.body.scrollTop = 0; } catch(_){}
    } catch (e) {}
    try {
        // app container
        const container = document.querySelector(pageContainerSelector);
        if (container) {
            try { container.scrollTop = 0; } catch(_){}
        }
    } catch (e) {}
    try {
        // main and typical overflow containers
        const els = Array.from(document.querySelectorAll('main, [class*="overflow-y-auto"], [class*="overflow-auto"]'));
        els.forEach(el => {
            try {
                if (typeof el.scrollTo === 'function') el.scrollTo({ top: 0, behavior: 'auto' });
                else el.scrollTop = 0;
            } catch(_){}
        });
    } catch (e) {}
}

// Ensure inner <main> uses the available viewport height (header + footer aware)
function adjustMainHeight() {
    try {
        const container = document.querySelector(pageContainerSelector);
        if (!container) return;
        const main = container.querySelector('main');
        if (!main) return;
        const header = container.querySelector('header');
        const footer = container.querySelector('footer');
        const vh = window.innerHeight || document.documentElement.clientHeight || 0;
        const headerH = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
        const footerH = footer ? Math.ceil(footer.getBoundingClientRect().height) : 0;
        const available = Math.max(0, vh - headerH - footerH);
        main.style.maxHeight = available + 'px';
        main.style.overflowY = 'auto';
        main.style.boxSizing = 'border-box';
        // ensure main starts at top
        try { if (typeof main.scrollTo === 'function') main.scrollTo({ top: 0 }); else main.scrollTop = 0; } catch(_){}
    } catch (e) { console.error('adjustMainHeight failed', e); }
}

window.addEventListener('resize', function () { try { adjustMainHeight(); } catch(e){console.error(e);} });

function pushPage(html) {
    console.log('pushPage: pushing');
    navStack.push(html);
    render(html);
    const container = document.querySelector(pageContainerSelector);
    if (container) {
        container.classList.remove('h-screen', 'shadow-xl', 'overflow-hidden');
        container.classList.add('min-h-screen');
    }
    // ensure we reset scroll immediately after pushing a new page
    try { resetScrollPositions(); } catch(_){ }
    try { adjustMainHeight(); } catch(_){ }
}

function popPage() {
    if (navStack.length <= 1) {
        console.warn('popPage: nothing to pop');
        return;
    }
    navStack.pop();
    const prev = navStack[navStack.length - 1];
    render(prev);
    const container = document.querySelector(pageContainerSelector);
    if (container && navStack.length === 1) {
        container.classList.remove('min-h-screen');
        container.classList.add('h-screen', 'shadow-xl', 'overflow-hidden');
    }
}

// Event delegation on document so handler is present even if the container is replaced.
async function delegatedClickHandler(ev) {
    try {
        const withinContainer = ev.target.closest(pageContainerSelector);
        if (!withinContainer) return;

        // Make whole keuze-eten card clickable: if a click lands inside a label
        // that contains an input[name="main_course"], select that input.
        try {
            const keuzeContainer = withinContainer.querySelector('#keuzeEtenList');
            if (keuzeContainer) {
                const lbl = ev.target.closest('label');
                if (lbl) {
                    const inp = lbl.querySelector('input[name="main_course"]');
                    if (inp) {
                        // mark checked and manage visuals
                        if (!inp.checked) {
                            inp.checked = true;
                            const labels = Array.from(keuzeContainer.querySelectorAll('label'));
                            labels.forEach(l => l.classList.remove('active'));
                            try { lbl.classList.add('active'); } catch(_) {}
                            try { inp.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
                            try { updateConfirmButtonState(); } catch(_) {}
                        }
                        return;
                    }
                }
            }
        } catch (e) { console.error('choice-card click handling failed', e); }

        const agree = ev.target.closest('#agree-button');
        if (agree) {
            pushPage(signupPage);
            return;
        }

        const cont = ev.target.closest('#continue-button');
        if (cont && !cont.disabled) {
            // normal flow: do not skip jaarhanger
            skipJaarhangerOnConfirm = false;
            // If a member is selected and already scanned today, skip to member-info and load their data live
            try {
                if (selectedMember) {
                    const memberId = (selectedMember.lidnummer || selectedMember.id || selectedMember.lid || selectedMember.memberId) ? (selectedMember.lidnummer || selectedMember.id || selectedMember.lid || selectedMember.memberId) : null;
                    if (memberId) {
                        const already = await isMemberScannedToday(memberId);
                        if (already) {
                            // fetch latest member data and navigate to member info
                            try {
                                const fresh = await getMemberById(memberId);
                                if (fresh) {
                                    // merge into selectedMember
                                    selectedMember = Object.assign({}, selectedMember, fresh, { lidnummer: memberId });
                                }
                            } catch (e) { console.warn('failed to fetch member on scanned-continue', e); }
                            try { pushPage(memberInfoPage); } catch(e){ console.error('pushPage memberInfoPage failed', e); }
                            return;
                        }
                    }
                }
            } catch (e) { console.error('scanned-continue check failed', e); }

            pushPage(lunchPage);
            // After rendering lunchPage, populate options from Firestore
            try { fillLunchOptions().catch(e=>console.error('fillLunchOptions failed',e)); } catch(_) {}
            return;
        }

        const confirmLunch = ev.target.closest('#confirm-lunch-button');
        const confirmJaar = ev.target.closest('#confirm-jaarhanger-button');
        if (confirmLunch || confirmJaar) {
            const clicked = confirmJaar || confirmLunch;
            if (clicked.disabled) return;
            // If the jaarhanger confirm was clicked, capture jaarhanger participation then go to member info
            if (confirmJaar) {
                try {
                    const partEl = withinContainer.querySelector('input[name="participation"]:checked');
                    const part = partEl ? partEl.value : null;
                    if (!selectedMember) selectedMember = {};
                    // store as 'yes' or 'no' (or null)
                    selectedMember.jaarhanger = part;
                } catch (e) { console.error('capturing jaarhanger participation failed', e); }
                try { pushPage(memberInfoPage); } catch (e) { console.error('pushPage memberInfoPage failed', e); }
                return;
            }
            // Otherwise (confirmLunch) capture current participation and selected lunch choice into selectedMember
            try {
                const partEl = withinContainer.querySelector('input[name="participation"]:checked');
                const part = partEl ? partEl.value : null;
                let choiceText = '';
                const keuzeInput = withinContainer.querySelector('input[name="main_course"]:checked');
                if (keuzeInput) {
                    const lbl = keuzeInput.closest('label');
                    if (lbl) {
                        const p = lbl.querySelector('p');
                        if (p) choiceText = p.textContent.trim();
                    }
                }
                if (!selectedMember) selectedMember = {};
                selectedMember.participation = part;
                selectedMember.lunchChoice = choiceText || '';
            } catch (e) { console.error('capturing lunch participation failed', e); }
            // If Firestore already has a concrete jaarhanger value ('yes' or 'no'), skip the jaarhanger page
            try {
                if (selectedMember && (typeof selectedMember.jaarhanger !== 'undefined') && selectedMember.jaarhanger !== null) {
                    try {
                        const norm = normalizeYesNo(selectedMember.jaarhanger);
                        if (norm === 'yes' || norm === 'no') {
                            selectedMember.jaarhanger = norm;
                            pushPage(memberInfoPage);
                            return;
                        }
                    } catch (_) { /* ignore normalization errors and continue to jaarhanger page */ }
                }
            } catch (e) { console.error('checking prefilled jaarhanger failed', e); }
            // Show next page: normally jaarhanger, but if user came from member-info summary, go straight to member-info
            try {
                if (skipJaarhangerOnConfirm) {
                    // reset flag and go straight to member-info
                    skipJaarhangerOnConfirm = false;
                    pushPage(memberInfoPage);
                } else {
                    pushPage(jaarhangerPage);
                }
            } catch (e) { console.error('pushPage next after confirmLunch failed', e); }
            return;
        }

        const back = ev.target.closest('#back-button');
        if (back) {
            popPage();
            return;
        }

        // Home button in member-info: clear stored values and return to start
        const homeBtn = ev.target.closest('#home-button');
        if (homeBtn) {
            try {
                // clear selection state
                selectedMember = null;
                skipJaarhangerOnConfirm = false;
                forceOpenJaarhanger = false;
                // clear input field if present
                try {
                    const nameIn = document.getElementById('participant-name-input');
                    if (nameIn) {
                        nameIn.value = '';
                        try { nameIn.removeAttribute('data-member-id'); } catch(_){}
                    }
                    const suggestionsEl = document.getElementById('name-suggestions');
                    if (suggestionsEl) { suggestionsEl.classList.add('hidden'); suggestionsEl.style.display = 'none'; }
                } catch (_) {}
                // reset navigation stack to initial page and render
                try {
                    navStack.length = 0;
                    navStack.push(originalPage);
                    render(navStack[0]);
                    const container = document.querySelector(pageContainerSelector);
                    if (container) {
                        container.classList.remove('min-h-screen');
                        container.classList.add('h-screen', 'shadow-xl', 'overflow-hidden');
                    }
                } catch (e) { console.error('home navigation failed', e); }
            } catch (e) { console.error('home button handler failed', e); }
            return;
        }

        // Save QR button: download or share the generated QR image
        const saveQr = ev.target.closest('#save-qr-button');
        if (saveQr) {
            try {
                const qrImg = document.getElementById('checkin-qr-img');
                if (!qrImg || !qrImg.src) {
                    console.warn('save-qr: QR image not found or empty');
                    return;
                }
                const src = qrImg.src;
                fetch(src, { mode: 'cors' }).then(res => res.blob()).then(blob => {
                    const nameBase = (selectedMember && selectedMember.lidnummer) ? `QR_${selectedMember.lidnummer}` : `qr`;
                    const filename = `${nameBase}.png`;
                    const tryShare = async () => {
                        try {
                            const file = new File([blob], filename, { type: blob.type });
                            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                                await navigator.share({ files: [file], title: 'Check-in QR' });
                                return true;
                            }
                        } catch (e) {
                            // ignore share errors and fall back to download
                        }
                        return false;
                    };
                    const fallbackDownload = () => {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        setTimeout(() => URL.revokeObjectURL(url), 1500);
                    };
                    tryShare().then(didShare => { if (!didShare) fallbackDownload(); });
                }).catch(err => {
                    console.error('save-qr: fetch failed', err);
                    // fallback: open the image in a new tab so user can save manually
                    try { window.open(src, '_blank'); } catch(_){}
                });
            } catch (e) { console.error('save-qr handler failed', e); }
            return;
        }

        

        // If user clicks the lunch summary on the member-info page, navigate back to the lunch page
        const lunchSummaryClick = ev.target.closest('#member-lunch-summary') || ev.target.closest('#member-choice-lunch-text') || ev.target.closest('#member-choice-lunch-status');
        if (lunchSummaryClick) {
            // If the summary card is locked (scanned today), ignore clicks immediately
            try {
                if (lunchSummaryClick.dataset && lunchSummaryClick.dataset.locked === '1') return;
                if (lunchSummaryClick.getAttribute && lunchSummaryClick.getAttribute('aria-disabled') === 'true') return;
            } catch(_){}
            try {
                // when coming from member-info summary, skip jaarhanger on confirm
                skipJaarhangerOnConfirm = true;
                pushPage(lunchPage);
                // fillLunchOptions will restore selections from selectedMember
            } catch (e) { console.error('navigate to lunchPage failed', e); }
            return;
        }

        // Click on jaarhanger summary should navigate to jaarhanger page
        const jaarSummaryClick = ev.target.closest('#member-jaarhanger-summary') || ev.target.closest('#member-jaarhanger-edition') || ev.target.closest('#member-choice-jaarhanger-status');
        if (jaarSummaryClick) {
            try {
                // User explicitly clicked the jaarhanger summary: always open the jaarhanger page for editing
                forceOpenJaarhanger = true;
                pushPage(jaarhangerPage);
                // reset the flag right away — render/handlers can rely on selectedMember.jaarhanger
                forceOpenJaarhanger = false;
            } catch (e) { console.error('navigate to jaarhangerPage failed', e); }
            return;
        }

        
    } catch (err) {
        console.error('delegatedClickHandler error', err);
    }
}

// Handle participation change specifically for the jaarhanger in-app page
function handleJaarhangerParticipationChange(target) {
    try {
        const container = target ? (target.closest(pageContainerSelector) || document.querySelector(pageContainerSelector) || document) : (document.querySelector(pageContainerSelector) || document);
        const footerBtn = (container && container.querySelector) ? container.querySelector('footer button') : document.querySelector('footer button');
        if (!footerBtn) return;
        const footerSpan = footerBtn.querySelector('span span') || footerBtn.querySelector('span');
        if (target.value === 'no') {
            footerBtn.style.background = '#8C2B07';
            if (footerSpan) footerSpan.innerText = 'Bevestigen';
        } else {
            footerBtn.style.background = '';
            if (footerSpan) footerSpan.innerText = 'Bevestigen';
        }
        try { updateConfirmButtonState(); } catch(_){}
    } catch (e) { console.error('handleJaarhangerParticipationChange failed', e); }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
        initApp();
    });
} else {
    initApp();
}

async function initApp() {
    console.log('initApp — attaching delegated handlers and loading fragments');
    document.addEventListener('click', delegatedClickHandler);
    document.addEventListener('input', delegatedInputHandler);
    document.addEventListener('click', delegatedSuggestionClickHandler);
    document.addEventListener('change', delegatedChangeHandler);
    // Load page fragments, then render the initial page and rides
    try {
        await loadFragments();
    } catch (e) { console.error('initApp: loadFragments failed', e); }
    // push initial page and render
    try {
        navStack.push(originalPage || '');
        render(navStack[0]);
        try { await populatePlannedRides(); } catch(e) { console.error('populatePlannedRides post-render failed', e); }
    } catch (e) { console.error('initApp: initial render failed', e); }
}

// ----- Rides loader -----

async function loadFragments() {
        // Try several candidate base paths so the dev server or production paths resolve correctly.
        const bases = ['./lid-ui/', 'lid-ui/', '/lid-ui/', '/new-ui/lid-ui/'];
        const files = ['originalPage.html', 'signupPage.html', 'lunchPage.html', 'jaarhangerPage.html', 'memberInfoPage.html'];
        const results = {};
        try {
                for (const fname of files) {
                        let got = '';
                        for (const base of bases) {
                                const path = base + fname;
                                try {
                                        const res = await fetch(path, {cache: 'no-store'});
                                        if (res && res.ok) {
                                                const txt = await res.text();
                                                if (txt && txt.trim()) { got = txt; console.debug('loadFragments: loaded', path, 'len=', txt.length); break; }
                                        }
                                } catch (e) {
                                        console.debug('loadFragments: fetch failed for', path, e);
                                }
                        }
                        results[fname] = got || '';
                }
                originalPage = results['originalPage.html'] || '';
                signupPage = results['signupPage.html'] || '';
                lunchPage = results['lunchPage.html'] || '';
                jaarhangerPage = results['jaarhangerPage.html'] || '';
                memberInfoPage = results['memberInfoPage.html'] || '';
        } catch (e) {
                console.error('loadFragments failed', e);
                originalPage = originalPage || '';
                signupPage = signupPage || '';
                lunchPage = lunchPage || '';
                jaarhangerPage = jaarhangerPage || '';
                memberInfoPage = memberInfoPage || '';
        }

        // If originalPage is still empty, provide a minimal inline fallback that includes #rides-list
        if (!originalPage || !originalPage.includes('id="rides-list"')) {
                console.warn('loadFragments: originalPage fragment missing or did not contain #rides-list; using inline fallback');
                originalPage = `
<header class="flex items-center justify-between px-4 py-3 bg-surface-light dark:bg-surface-dark border-b border-gray-100 dark:border-gray-800 z-10">
    <div class="w-8"></div>
    <h1 class="text-sm font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 hidden">Ritten</h1>
    <button class="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-white text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors ml-auto flex items-center gap-1.5 shadow-sm">
        <span class="material-symbols-outlined text-base">table_restaurant</span>
        Inschrijftafel
    </button>
</header>
<main class="flex-1 overflow-y-auto pb-[140px]">
    <div class="px-4 pt-6 pb-2">
        <h3 class="text-[#0e121a] dark:text-white text-xl font-bold leading-tight tracking-tight">Geplande Ritten</h3>
    </div>
    <div id="rides-list" class="px-4 flex flex-col gap-3 mt-2"></div>
</main>
<div class="fixed bottom-0 left-0 w-full bg-surface-light dark:bg-surface-dark border-t border-gray-100 dark:border-gray-800 p-4 pb-6 z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.05)] app-footer">
    <div class="flex flex-col gap-3">
        <button id="agree-button" class="w-full bg-primary hover:bg-primary-hover text-white font-bold text-base h-12 rounded-xl shadow-lg shadow-blue-900/20 transition-all active:scale-[0.98] flex items-center justify-center">
            <span>Ja, ik ga akkoord</span>
        </button>
    </div>
</div>`;
        }
}

// Input handler for name autocomplete (delegated)
async function delegatedInputHandler(ev) {
    try {
        const target = ev.target;
        if (!target) return;
        if (target.id !== 'participant-name-input') return;
        const raw = target.value || '';
        // Ensure the first non-space character is uppercase
        const newRaw = raw.replace(/^([\s]*)(\S)/, (m, spaces, ch) => spaces + ch.toUpperCase());
        if (newRaw !== raw) {
            const start = target.selectionStart || 0;
            const end = target.selectionEnd || start;
            target.value = newRaw;
            try { target.setSelectionRange(start, end); } catch (e) {}
        }
        const val = (newRaw || '').trim();
        const suggestionsEl = document.getElementById('name-suggestions');
        if (!suggestionsEl) return;
        // clear any previously-selected member id while typing and disable continue
        const continueBtn = document.getElementById('continue-button');
        try { if (document.getElementById('participant-name-input')) document.getElementById('participant-name-input').removeAttribute('data-member-id'); } catch(_) {}
        // Clear persisted selected member when typing new text
        selectedMember = null;
        if (continueBtn) { continueBtn.disabled = true; continueBtn.classList.add('opacity-50'); continueBtn.setAttribute('aria-disabled','true'); }
        if (!val) {
            suggestionsEl.innerHTML = '';
            suggestionsEl.classList.add('hidden');
            suggestionsEl.style.display = 'none';
            return;
        }
        const results = await searchMembers(val, 8);
        // Abort if the input changed while the async search was in flight
        const currentNow = (target.value || '').trim();
        if (currentNow !== val) {
            console.log('delegatedInputHandler: aborting stale results for', val, 'current is', currentNow);
            return;
        }
        if (!Array.isArray(results) || results.length === 0) {
            suggestionsEl.innerHTML = '';
            suggestionsEl.classList.add('hidden');
            suggestionsEl.style.display = 'none';
            return;
        }
        const html = results.map(r => {
            const label = (r.voor && r.naam) ? `${r.voor} ${r.naam}` : (r.naam || r.voor || '');
            const json = encodeURIComponent(JSON.stringify(r || {}));
            return `<button type="button" data-member-id="${r.id}" data-member-json="${json}" class="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800">${label}</button>`;
        }).join('\n');
        suggestionsEl.innerHTML = `<div class="flex flex-col">${html}</div>`;
        suggestionsEl.classList.remove('hidden');
        suggestionsEl.style.display = '';
    } catch (e) {
        console.error('delegatedInputHandler error', e);
    }
}

// Click handler to capture suggestion clicks (delegated)
async function delegatedSuggestionClickHandler(ev) {
    try {
        const btn = ev.target.closest('#name-suggestions button[data-member-id]');
        if (!btn) return;
        const id = btn.getAttribute('data-member-id');
        const raw = btn.getAttribute('data-member-json');
        const text = (btn.textContent || '').trim();
        let memberObj = null;
        try { memberObj = raw ? JSON.parse(decodeURIComponent(raw)) : null; } catch (e) { memberObj = null; }
        // If the quick result didn't include full fields, fetch the full member doc
        try {
            const full = await getMemberById(id);
            if (full) {
                memberObj = Object.assign({}, memberObj || {}, full);
                console.debug('Fetched full member for selected suggestion', id, memberObj);
            }
        } catch (e) { console.warn('fetching full member failed', e); }
        const input = document.getElementById('participant-name-input');
        if (input) {
            input.value = text;
            input.setAttribute('data-member-id', id);
        }
        const suggestionsEl = document.getElementById('name-suggestions');
        if (suggestionsEl) {
            suggestionsEl.classList.add('hidden');
            suggestionsEl.style.display = 'none';
        }
        // Persist selected member info for later pages
        try {
            selectedMember = {
                id: id,
                name: text,
                // Firestore fields: 'LidNr' and 'Regio Omschrijving'
                lidnummer: memberObj?.LidNr ?? memberObj?.lidnr ?? memberObj?.lidnummer ?? '',
                regio: memberObj?.['Regio Omschrijving'] ?? memberObj?.regio ?? memberObj?.region ?? memberObj?.woonplaats ?? ''
            };
            // copy scan datum raw data if present so getMemberScanYMDs can find it
            try {
                selectedMember.ScanDatums = memberObj?.ScanDatums ?? memberObj?.scanDatums ?? memberObj?.ScanDatum ?? memberObj?.scanDatum ?? memberObj?.scanDates ?? memberObj?.ScanDates ?? null;
            } catch (_) { selectedMember.ScanDatums = null; }
            try { console.debug('selectedMember raw scans:', selectedMember.ScanDatums); } catch(_){}
            // If the full doc contains a jaarhanger field, normalize and persist it
            try {
                const rawJaar = memberObj?.Jaarhanger ?? memberObj?.jaarhanger ?? memberObj?.JaarhangerAanvraag ?? memberObj?.['Jaarhanger Aanvraag'] ?? memberObj?.jaarhanger_aanvraag ?? memberObj?.jaarhangerAanvraag ?? null;
                const norm = normalizeYesNo(rawJaar);
                if (norm) selectedMember.jaarhanger = norm;
            } catch (e) { /* ignore */ }
        } catch (e) { selectedMember = { id, name: text }; }
        // Enable continue button now that a member was explicitly selected
        const continueBtn2 = document.getElementById('continue-button');
        if (continueBtn2) { continueBtn2.disabled = false; continueBtn2.classList.remove('opacity-50'); continueBtn2.removeAttribute('aria-disabled'); }
    } catch (e) { console.error('delegatedSuggestionClickHandler error', e); }
}

// Change handler for radios (participation on lunch page)
function delegatedChangeHandler(ev) {
    try {
        const target = ev.target;
        if (!target) return;
        const container = target.closest(pageContainerSelector) || document;
        // Participation radios (Ja/Nee)
        if (target.name === 'participation') {
            const footerBtn = (container && container.querySelector) ? container.querySelector('footer button') : document.querySelector('footer button');
            if (!footerBtn) return;
            const footerSpan = footerBtn.querySelector('span span') || footerBtn.querySelector('span');
            const sections = (container && container.querySelectorAll) ? container.querySelectorAll('main section:not(:first-child)') : document.querySelectorAll('main section:not(:first-child)');
                // If the change comes from the jaarhanger page, handle it differently
                const inJaarhanger = !!(container && container.querySelector && container.querySelector('#jaarhanger-page'));
                if (inJaarhanger) {
                    handleJaarhangerParticipationChange(target);
                    return;
                }
                // Default (lunch) behaviour: fade page sections and update footer text
                if (target.value === 'no') {
                    footerBtn.style.background = '#8C2B07';
                    if (footerSpan) footerSpan.innerText = 'Afwezigheid Bevestigen';
                    sections.forEach(sec => { sec.style.opacity = '0.3'; sec.style.pointerEvents = 'none'; });
                    // Clear any keuze-eten selections when user chooses 'nee'
                    try {
                        const keuzeContainer = document.getElementById('keuzeEtenList');
                        if (keuzeContainer) {
                            const inputs = Array.from(keuzeContainer.querySelectorAll('input[name="main_course"]'));
                            inputs.forEach(i => {
                                try { i.checked = false; } catch(_) {}
                                const lbl = i.closest('label');
                                if (lbl) lbl.classList.remove('active');
                            });
                        }
                    } catch (e) { console.error('clearing keuze selections failed', e); }
                } else {
                    footerBtn.style.background = '';
                    if (footerSpan) footerSpan.innerText = 'Keuze Bevestigen';
                    sections.forEach(sec => { sec.style.opacity = '1'; sec.style.pointerEvents = 'auto'; });
                }
                try { updateConfirmButtonState(); } catch(_){}
                return;
        }

        // Keuze eten radios (main_course) — toggle active class on label
        if (target.name === 'main_course') {
            try {
                const container = document.getElementById('keuzeEtenList');
                if (!container) return;
                const inputs = Array.from(container.querySelectorAll('input[name="main_course"]'));
                inputs.forEach(i => {
                    const lbl = i.closest('label');
                    if (!lbl) return;
                    if (i === target || i.checked) lbl.classList.add('active'); else lbl.classList.remove('active');
                });
            } catch (e) { console.error('main_course change handler failed', e); }
            try { updateConfirmButtonState(); } catch(_){}
            return;
        }
    } catch (e) {
        console.error('delegatedChangeHandler error', e);
    }
}

// Populate lunch page placeholders with data from Firestore
async function fillLunchOptions() {
    try {
        const opts = await getLunchOptions();
        const vast = Array.isArray(opts?.vastEten) ? opts.vastEten : [];
        const keuze = Array.isArray(opts?.keuzeEten) ? opts.keuzeEten : [];

        const vastEl = document.getElementById('vastEtenList');
        const keuzeEl = document.getElementById('keuzeEtenList');
        if (vastEl) {
            if (vast.length === 0) {
                vastEl.innerHTML = `<div class="p-4 text-sm text-gray-500">Geen vast menu beschikbaar</div>`;
            } else {
                vastEl.innerHTML = vast.map((item, idx) => `
                    <div class="relative flex items-center gap-4 p-4 transition-colors hover:bg-gray-50 dark:hover:bg-white/5">
                        <div class="flex-1 pl-2"><p class="text-base font-bold text-text-main dark:text-white">${escapeHtml(String(item))}</p></div>
                    </div>
                    ${idx < vast.length-1 ? '<div class="h-px w-full bg-gray-100 dark:bg-gray-700"></div>' : ''}`
                ).join('\n');
            }
        }
        if (keuzeEl) {
            const keuzeSection = keuzeEl.closest('section');
            if (!keuze || keuze.length === 0) {
                keuzeEl.innerHTML = `<div class="p-4 text-sm text-gray-500">Geen keuze-eten opties beschikbaar</div>`;
                try { if (keuzeSection) keuzeSection.style.display = 'none'; } catch(_) {}
            } else {
                try { if (keuzeSection) keuzeSection.style.display = ''; } catch(_) {}
                // Build radio-like choice cards (keep same structure as original)
                keuzeEl.innerHTML = keuze.map((item, idx) => {
                    const val = String(item).toLowerCase().replace(/[^a-z0-9]+/g, '-');
                    return `
                    <label class="cursor-pointer relative group">
                        <input class="choice-card-input sr-only" name="main_course" type="radio" value="${escapeHtml(val)}" />
                        <div class="choice-card relative flex items-center gap-4 rounded-2xl border-2 border-transparent bg-surface-light dark:bg-surface-dark p-3 shadow-card transition-all hover:shadow-card-hover min-h-[64px]">
                            <div class="flex flex-col justify-center py-0.5 pr-8 flex-1 pl-2"><p class="text-base font-bold text-text-main dark:text-white leading-tight">${escapeHtml(String(item))}</p></div>
                            <div class="check-circle absolute right-4 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-gray-300 text-transparent transition-all dark:border-gray-600"><span class="material-symbols-outlined text-[16px] font-bold">check</span></div>
                        </div>
                    </label>`;
                }).join('\n');
                
            }
        }
    } catch (e) {
        console.error('fillLunchOptions error', e);
    }
    // Ensure confirm button state reflects current selections after rendering
    try { updateConfirmButtonState(); } catch(_){}
    // Set lunch date label to today's short Dutch date
    try {
        const lab = document.getElementById('lunch-date-label');
        if (lab) lab.textContent = formatShortDateNL(new Date());
    } catch (_) {}
    // Adjust main height after async content population
    try { adjustMainHeight(); } catch (e) { console.error('adjustMainHeight after fillLunchOptions failed', e); }

    // After populating the lunch options, restore any previously selected choices
    try { restoreLunchSelection(); } catch (e) { console.error('restoreLunchSelection failed', e); }
}

// Minimal HTML escaping for inserted strings
function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]);
}

// Normalize values that might represent yes/no/boolean-like fields from Firestore
function normalizeYesNo(v) {
    try {
        if (v === null || typeof v === 'undefined') return null;
        if (typeof v === 'boolean') return v ? 'yes' : 'no';
        const s = String(v).trim().toLowerCase();
        if (s === '') return null;
        if (s === 'ja' || s === 'yes' || s === 'true' || s === '1' || s === 'y') return 'yes';
        if (s === 'nee' || s === 'no' || s === 'false' || s === '0' || s === 'n') return 'no';
        // if it's a number >0 treat as yes
        const num = Number(s);
        if (!isNaN(num)) return num > 0 ? 'yes' : 'no';
        return null;
    } catch (e) { return null; }
}

// Restore lunch page inputs from `selectedMember` if present
function restoreLunchSelection() {
    try {
        if (!selectedMember) return;
        const container = document.querySelector(pageContainerSelector) || document;
        // Restore participation radio
        try {
            const partVal = selectedMember.participation ?? null;
            if (partVal) {
                const partInput = container.querySelector(`input[name="participation"][value="${partVal}"]`);
                if (partInput) {
                    partInput.checked = true;
                    // Ensure change handlers run
                    partInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        } catch (e) { console.error('restore participation failed', e); }
        // Restore main_course selection by matching label text
        try {
            const choiceText = selectedMember.lunchChoice || '';
            if (choiceText) {
                const keuzeContainer = container.querySelector('#keuzeEtenList');
                if (keuzeContainer) {
                    const labels = Array.from(keuzeContainer.querySelectorAll('label'));
                    for (const lbl of labels) {
                        const p = lbl.querySelector('p');
                        const inp = lbl.querySelector('input[name="main_course"]');
                        if (!p || !inp) continue;
                        if ((p.textContent || '').trim() === choiceText) {
                            inp.checked = true;
                            // toggle visual active class
                            try { lbl.classList.add('active'); } catch (_) {}
                        } else {
                            try { lbl.classList.remove('active'); } catch (_) {}
                        }
                    }
                }
            }
        } catch (e) { console.error('restore main_course failed', e); }
        try { updateConfirmButtonState(); } catch (_) {}
    } catch (e) { console.error('restoreLunchSelection top-level failed', e); }
}

// Format a short Dutch date like: "Wo, 24 Okt"
function formatShortDateNL(d) {
    try {
        if (!(d instanceof Date)) d = new Date(d);
        const weekday = new Intl.DateTimeFormat('nl-NL', { weekday: 'short' }).format(d).replace('.', '');
        const day = d.getDate();
        let month = new Intl.DateTimeFormat('nl-NL', { month: 'short' }).format(d).replace('.', '');
        // Capitalize first letter for display
        const wd = weekday.charAt(0).toUpperCase() + weekday.slice(1);
        month = month.charAt(0).toUpperCase() + month.slice(1);
        return `${wd}, ${day} ${month}`;
    } catch (e) { return ''; }
}

// Enable/disable the lunch confirm button based on selection rules
function updateConfirmButtonState() {
    try {
        const container = document.querySelector(pageContainerSelector) || document;
        const btn = container.querySelector('#confirm-lunch-button') || document.getElementById('confirm-lunch-button');
        if (!btn) return;
        // find selected participation
        const part = (container && container.querySelector) ? container.querySelector('input[name="participation"]:checked') : document.querySelector('input[name="participation"]:checked');
        if (!part) {
            btn.disabled = true; btn.classList.add('opacity-50'); btn.setAttribute('aria-disabled','true');
            return;
        }
        if (part.value === 'no') {
            btn.disabled = false; btn.classList.remove('opacity-50'); btn.removeAttribute('aria-disabled');
            return;
        }
        // part.value === 'yes'
        // If there are keuze options, require one to be selected
        const keuzeContainer = (container && container.querySelector) ? container.querySelector('#keuzeEtenList') : document.getElementById('keuzeEtenList');
        if (!keuzeContainer) { btn.disabled = false; btn.classList.remove('opacity-50'); btn.removeAttribute('aria-disabled'); return; }
        const keuzeInputs = Array.from(keuzeContainer.querySelectorAll('input[name="main_course"]'));
        if (!keuzeInputs || keuzeInputs.length === 0) {
            // no choices available, allow confirm
            btn.disabled = false; btn.classList.remove('opacity-50'); btn.removeAttribute('aria-disabled');
            return;
        }
        const anyChecked = keuzeInputs.some(i => i.checked);
        if (anyChecked) { btn.disabled = false; btn.classList.remove('opacity-50'); btn.removeAttribute('aria-disabled'); }
        else { btn.disabled = true; btn.classList.add('opacity-50'); btn.setAttribute('aria-disabled','true'); }
    } catch (e) { console.error('updateConfirmButtonState failed', e); }
}

// Return array of YMD scan dates from member object. Accepts several shapes.
function getMemberScanYMDs(member) {
    try {
        if (!member) return [];
        // try common field names
        const candidates = [member.ScanDatums, member.scanDatums, member.ScanDatum, member.scanDatum, member.scanDates, member.ScanDates, member.ScanDatumList, member.scanDatumList];
        let raw = null;
        for (const c of candidates) { if (typeof c !== 'undefined' && c !== null) { raw = c; break; } }
        // fallback: look for any key that contains 'scan' in the member object
        if (!raw) {
            for (const k of Object.keys(member || {})) {
                if (k.toLowerCase().includes('scan')) {
                    raw = member[k];
                    break;
                }
            }
        }
        if (!raw) return [];
        const result = [];
        // If array
        if (Array.isArray(raw)) {
            for (const it of raw) {
                if (!it) continue;
                if (typeof it === 'string') { result.push(String(it).slice(0,10)); continue; }
                if (typeof it === 'object') {
                    // Firestore timestamp object? (seconds/nanoseconds)
                    if (typeof it.seconds === 'number') {
                        try { result.push(new Date(it.seconds * 1000).toISOString().slice(0,10)); continue; } catch(_){}
                    }
                    // nested value property
                    if (it.value && typeof it.value === 'string') { result.push(String(it.value).slice(0,10)); continue; }
                    // if it has a date-like prop
                    for (const pk of ['date','datum','scanDate','ScanDatum']) {
                        if (it[pk]) { result.push(String(it[pk]).slice(0,10)); break; }
                    }
                }
            }
            return Array.from(new Set(result)).filter(Boolean);
        }
        // If object/map: keys may be date strings or values may be timestamps
        if (typeof raw === 'object') {
            for (const [k,v] of Object.entries(raw)) {
                // if key looks like a date
                if (typeof k === 'string' && /^\d{4}-\d{2}-\d{2}/.test(k)) result.push(k.slice(0,10));
                // if value is timestamp-like
                if (v) {
                    if (typeof v === 'string') result.push(v.slice(0,10));
                    else if (typeof v === 'object' && typeof v.seconds === 'number') result.push(new Date(v.seconds * 1000).toISOString().slice(0,10));
                }
            }
            return Array.from(new Set(result)).filter(Boolean);
        }
        // If string
        if (typeof raw === 'string') {
            return [raw.slice(0,10)];
        }
        return [];
    } catch (e) { return []; }
}