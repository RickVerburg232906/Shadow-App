// New UI main script

import { getPlannedDates, searchMembers } from './firestore.js';

console.log('New UI loaded');

// Simple virtual navigation stack. Use a stable container selector that doesn't depend on layout classes.
const pageContainerSelector = '.relative.flex';

console.log('Setting up virtual navigation — pageContainerSelector=' + pageContainerSelector);

const originalPage = `<header class="flex items-center justify-between px-4 py-3 bg-surface-light dark:bg-surface-dark border-b border-gray-100 dark:border-gray-800 z-10">
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
<div id="rides-list" class="px-4 flex flex-col gap-3 mt-2">
<div class="bg-surface-light dark:bg-surface-dark border border-gray-100 dark:border-gray-700 rounded-xl p-4 flex items-center justify-between shadow-sm cursor-pointer hover:border-primary/30 transition-all">
<span class="text-[#0e121a] dark:text-white font-medium text-base">December 22, 2025</span>
<span class="bg-[#1e2530] text-accent-yellow border border-gray-700 px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm">
            Vandaag
        </span>
</div>
<div class="bg-surface-light dark:bg-surface-dark border border-gray-100 dark:border-gray-700 rounded-xl p-4 flex items-center justify-between shadow-sm cursor-pointer hover:border-primary/30 transition-all">
<span class="text-[#0e121a] dark:text-white font-medium text-base">Januari 16, 2026</span>
<span class="bg-[#1e2530]/50 text-accent-yellow dark:bg-[#1e2530] border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm">
            25 dagen
        </span>
</div>
</div>
<div class="px-4 pt-8 pb-2">
<h3 class="text-[#0e121a] dark:text-white text-xl font-bold leading-tight tracking-tight">Voorwaarden Deelname</h3>
</div>
<div class="px-4 pb-6">
<div class="bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700">
<div class="h-2 w-full bg-accent-red"></div>
<div class="p-5">
<div class="flex items-start gap-3 mb-3">
<span class="material-symbols-outlined text-accent-red text-[28px] shrink-0">gavel</span>
<h4 class="text-lg font-bold text-gray-900 dark:text-white leading-tight">Veiligheid &amp; Privacy</h4>
</div>
<p class="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                            Door deel te nemen aan dit evenement bevestigt u dat u beschikt over een geldig rijbewijs. U gaat akkoord met het delen van foto's gemaakt tijdens de dag.
                        </p>
<div class="mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg flex gap-3 items-center">
<span class="material-symbols-outlined text-accent-red text-[20px]">warning</span>
<span class="text-xs font-semibold text-accent-red dark:text-red-300">Deelname is volledig op eigen risico.</span>
</div>
<div class="mt-4 flex items-center gap-3">
</div>
</div>
</div>
</div>
</main>
<div class="absolute bottom-0 left-0 w-full bg-surface-light dark:bg-surface-dark border-t border-gray-100 dark:border-gray-800 p-4 pb-6 z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
<div class="flex flex-col gap-3">
<button id="agree-button" class="w-full bg-primary hover:bg-primary-hover text-white font-bold text-base h-12 rounded-xl shadow-lg shadow-blue-900/20 transition-all active:scale-[0.98] flex items-center justify-center">
<span>Ja, ik ga akkoord</span>
</button>
</div>
</div>`;

const signupPage = `<header class="sticky top-0 z-50 w-full bg-white dark:bg-surface-dark shadow-sm">
<div class="flex items-center justify-between px-4 py-3 min-h-[64px]">
<button id="back-button" aria-label="Ga terug" class="flex size-10 items-center justify-center rounded-full text-text-main dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
<span class="material-symbols-outlined text-[24px]">arrow_back_ios_new</span>
</button>
<h2 class="text-text-main dark:text-white text-lg font-bold leading-tight tracking-tight flex-1 text-center truncate px-2">
</h2>
<button class="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-white text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm">
<span class="material-symbols-outlined text-base">table_restaurant</span>
                Inschrijftafel
            </button>
</div>
</header>
<main class="flex-1 flex flex-col w-full max-w-md mx-auto px-4 pt-6 pb-28 gap-6">
<div class="flex flex-col gap-2">
<h1 class="text-text-main dark:text-white text-[28px] font-extrabold leading-tight tracking-tight">
                Inschrijven voor Landelijke Rit
            </h1>
<p class="text-text-main/70 dark:text-gray-400 text-base font-normal leading-relaxed">
                Vul hieronder je gegevens in om deel te nemen aan de rit.
            </p>
</div>
<div class="bg-surface-light dark:bg-surface-dark rounded-xl p-5 shadow-sm border border-gray-200/50 dark:border-gray-800">
<label class="flex flex-col gap-2 group">
<span class="text-text-main dark:text-gray-200 text-sm font-bold uppercase tracking-wider ml-1">
                    Volledige Naam
                </span>
<div class="relative flex items-center">
<span class="material-symbols-outlined absolute left-4 text-text-muted">person</span>
<input id="participant-name-input" class="form-input w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 text-text-main dark:text-white h-14 pl-12 pr-4 text-base font-medium placeholder:text-text-muted/70 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none" placeholder="Bijv. Jan Jansen" type="text" value="" autocomplete="off"/>
    <div id="name-suggestions" class="absolute left-0 right-0 top-full mt-2 z-50 bg-surface-light dark:bg-surface-dark rounded-lg shadow-lg hidden max-h-60 overflow-auto"></div>
</div>
<p class="text-xs text-text-muted dark:text-gray-500 ml-1 mt-1">
                    Deze naam wordt gebruikt voor de deelnemerslijst.
                </p>
</label>
</div>
<div class="flex-1"></div>
<div class="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-surface-dark border-t border-gray-100 dark:border-gray-800 p-6 pb-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
<div class="max-w-md mx-auto w-full">
<button class="w-full flex items-center justify-center rounded-xl bg-primary hover:bg-blue-800 text-white h-14 px-6 text-lg font-bold tracking-wide shadow-lg shadow-primary/30 transition-all active:scale-[0.98]">
<span>Verder</span>
</button>
</div>
</div>
</main>`;

// Navigation stack holds HTML strings. The top is current page.
const navStack = [originalPage];

function render(html) {
    const container = document.querySelector(pageContainerSelector);
    if (!container) {
        console.warn('render: container not found for selector', pageContainerSelector);
        return;
    }
    container.innerHTML = html;
}

function pushPage(html) {
    console.log('pushPage: pushing');
    navStack.push(html);
    render(html);
    const container = document.querySelector(pageContainerSelector);
    if (container) {
        container.classList.remove('h-screen', 'shadow-xl', 'overflow-hidden');
        container.classList.add('min-h-screen');
    }
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
function delegatedClickHandler(ev) {
    try {
        const withinContainer = ev.target.closest(pageContainerSelector);
        if (!withinContainer) return;

        const agree = ev.target.closest('#agree-button');
        if (agree) {
            pushPage(signupPage);
            return;
        }

        const back = ev.target.closest('#back-button');
        if (back) {
            popPage();
            return;
        }
    } catch (err) {
        console.error('delegatedClickHandler error', err);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
        console.log('DOMContentLoaded — attaching delegated click handler to document');
            document.addEventListener('click', delegatedClickHandler);
            document.addEventListener('input', delegatedInputHandler);
            document.addEventListener('click', delegatedSuggestionClickHandler);
        // initial render
        render(navStack[0]);
        // load dynamic rides data from Firestore
        loadAndRenderRides().catch(e => console.error('loadAndRenderRides failed', e));
    });
} else {
    console.log('Document already loaded — attaching delegated click handler to document');
    document.addEventListener('click', delegatedClickHandler);
    document.addEventListener('input', delegatedInputHandler);
    document.addEventListener('click', delegatedSuggestionClickHandler);
    // initial render
    render(navStack[0]);
    // load dynamic rides data from Firestore
    loadAndRenderRides().catch(e => console.error('loadAndRenderRides failed', e));
}

// ----- Rides loader -----
function todayYMD() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function niceDateLabel(ymd) {
    try {
        const parts = ymd.split('-').map(Number);
        const d = new Date(parts[0], parts[1]-1, parts[2]);
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    } catch { return ymd; }
}

async function loadAndRenderRides() {
    try {
        const container = document.getElementById('rides-list');
        if (!container) {
            console.warn('loadAndRenderRides: rides-list container not found');
            return;
        }
        container.innerHTML = `<div class="px-4 py-4 text-sm text-gray-500">Laden...</div>`;
        const dates = await getPlannedDates();
        if (!Array.isArray(dates) || dates.length === 0) {
            container.innerHTML = `<div class="px-4 py-4 text-sm text-gray-500">Geen geplande ritten gevonden.</div>`;
            return;
        }
        const today = todayYMD();
        // Normalize, filter out past dates (strictly before today), sort ascending
        const normalized = dates.map(d => (typeof d === 'string' ? d.slice(0,10) : '')).filter(Boolean);
        const future = normalized.filter(d => d >= today).sort();
        if (future.length === 0) {
            container.innerHTML = `<div class="px-4 py-4 text-sm text-gray-500">Geen toekomstige ritten gevonden.</div>`;
            return;
        }
        const items = future.map(ymd => {
            const label = niceDateLabel(ymd);
            const isToday = ymd === today;
            const daysDiff = Math.round((new Date(ymd) - new Date(today)) / (1000*60*60*24));
            const badge = isToday
                ? `<span class="bg-[#1e2530] text-accent-yellow border border-gray-700 px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm">Vandaag</span>`
                : `<span class="bg-[#1e2530]/50 text-accent-yellow dark:bg-[#1e2530] border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm">${daysDiff} dagen</span>`;
            return `
<div class="bg-surface-light dark:bg-surface-dark border border-gray-100 dark:border-gray-700 rounded-xl p-4 flex items-center justify-between shadow-sm cursor-pointer hover:border-primary/30 transition-all">
  <span class="text-[#0e121a] dark:text-white font-medium text-base">${label}</span>
  ${badge}
</div>`;
        }).join('\n');
        container.innerHTML = items;
    } catch (e) {
        console.error('loadAndRenderRides error', e);
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
        const newRaw = raw.replace(/^(\s*)(\S)/, (m, spaces, ch) => spaces + ch.toUpperCase());
        if (newRaw !== raw) {
            const start = target.selectionStart || 0;
            const end = target.selectionEnd || start;
            target.value = newRaw;
            try { target.setSelectionRange(start, end); } catch (e) {}
        }
        const val = (newRaw || '').trim();
        const suggestionsEl = document.getElementById('name-suggestions');
        if (!suggestionsEl) return;
        if (!val) {
            suggestionsEl.innerHTML = '';
            suggestionsEl.classList.add('hidden');
            return;
        }
        // query members
        const results = await searchMembers(val, 8);
        if (!Array.isArray(results) || results.length === 0) {
            suggestionsEl.innerHTML = '';
            suggestionsEl.classList.add('hidden');
            return;
        }
        const html = results.map(r => {
            const label = (r.voor && r.naam) ? `${r.voor} ${r.naam}` : (r.naam || r.voor || '');
            return `<button type="button" data-member-id="${r.id}" class="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800">${label}</button>`;
        }).join('\n');
        suggestionsEl.innerHTML = `<div class="flex flex-col">${html}</div>`;
        suggestionsEl.classList.remove('hidden');
    } catch (e) {
        console.error('delegatedInputHandler error', e);
    }
}

// Click handler to capture suggestion clicks (delegated)
function delegatedSuggestionClickHandler(ev) {
    try {
        const btn = ev.target.closest('#name-suggestions button[data-member-id]');
        if (!btn) return;
        const id = btn.getAttribute('data-member-id');
        const text = (btn.textContent || '').trim();
        const input = document.getElementById('participant-name-input');
        if (input) {
            input.value = text;
            input.setAttribute('data-member-id', id);
        }
        const suggestionsEl = document.getElementById('name-suggestions');
        if (suggestionsEl) suggestionsEl.classList.add('hidden');
    } catch (e) { console.error('delegatedSuggestionClickHandler error', e); }
}