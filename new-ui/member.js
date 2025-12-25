// --- Section-specific population helpers for Member Info page ---
// Debugging helper for populate functions — reads flag dynamically
function memberDebugLog(...args) { if (!window.MEMBER_POPULATE_DEBUG) return; try { console.debug('[member.populate]', ...args); } catch(_) {} }

// Reset stored choices for a member (clear sessionStorage key)
function resetMemberChoices(memberId) {
	try {
		if (!memberId) return;
		const key = `shadow_ui_member_${String(memberId)}`;
		try {
			const raw = sessionStorage.getItem(key);
			if (raw) {
				try {
					const parsed = JSON.parse(raw || '{}');
					// remove transient choice fields but keep the stored member record
					try { delete parsed.lunchDeelname; } catch(_) {}
					try { delete parsed.lunchKeuze; } catch(_) {}
					try { delete parsed.LunchDeelname; } catch(_) {}
					try { delete parsed.LunchKeuze; } catch(_) {}
					try { delete parsed.Jaarhanger; } catch(_) {}
					// if object now empty, remove key; else write back
					const hasKeys = Object.keys(parsed || {}).length > 0;
					if (hasKeys) setSessionAndDump(key, JSON.stringify(parsed)); else sessionStorage.removeItem(key);
				} catch(_) { try { sessionStorage.removeItem(key); } catch(_) {} }
			}
		} catch(_) {}
		memberDebugLog('resetMemberChoices', { key });
	} catch(_) {}
}

// Clear all member-related sessionStorage keys (used when selecting a different member)
function clearAllMemberSessionData() {
	try {
		const keys = Object.keys(sessionStorage || {});
		for (const k of keys) {
			try {
				if (!k) continue;
				if (k.startsWith('shadow_ui_member_') || k.startsWith('shadow_ui_member_choices_') || k === 'shadow_ui_current_member') {
					try { sessionStorage.removeItem(k); } catch(_) {}
				}
			} catch(_) {}
		}
		try { dumpSessionStorage(); } catch(_) {}
	} catch(_) {}
}

// Download the currently shown QR image (or generate then download)
async function downloadMemberQR() {
	try {
		const img = document.getElementById('memberInfoQRImg');
		if (!img) return;
		let src = img.src || '';
			if (!src) {
			try { await renderMemberInfoQR(null); } catch(_){ }
			src = img.src || '';
		}
		if (!src) return;
		// fetch the image (works for data: and http(s:))
		try {
			const resp = await fetch(src);
			const blob = await resp.blob();
			const lid = 'member';
			const a = document.createElement('a');
			const url = URL.createObjectURL(blob);
			a.href = url;
			a.download = `qr_lid_${String(lid)}.png`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			setTimeout(()=> URL.revokeObjectURL(url), 1500);
			return;
		} catch (e) { console.warn('downloadMemberQR failed', e); }
	} catch (e) { console.warn('downloadMemberQR outer failed', e); }
}

try { window.downloadMemberQR = downloadMemberQR; } catch(_){}

function setupDownloadQRButton() {
	try {
		const btn = document.getElementById('save-qr-btn');
		if (!btn) return;
		if (btn.dataset && btn.dataset._qrBound) return;
		btn.addEventListener('click', (ev) => { ev.preventDefault(); try { downloadMemberQR(); } catch(e){ console.warn(e); } });
		btn.dataset._qrBound = '1';
	} catch(e) { console.warn('setupDownloadQRButton failed', e); }
}


function populateMemberHeader() {
	try {
		const member = null;
		memberDebugLog('populateMemberHeader:start', { member });
		const els = Array.from(document.querySelectorAll('.member-name'));
		if (!els || els.length === 0) return;
		let name = '';
		if (member) {
			const voor = (member.voor || member.Voor || member.voornaam || member.Voornaam || member['Voor naam'] || member.voorletters || member['Voor letters'] || '').trim();
			const ach = (member.naam || member.Naam || '').trim();
			if (voor && ach) name = `${voor} ${ach}`;
			else if (ach) name = ach;
			else if (voor) name = voor;
			else name = String(member.displayName || member.name || member.Naam || member.naam || member.id || member.LidNr || '');
		}
		els.forEach(el => { try { el.textContent = name || ''; } catch(_) {} });
	} catch (e) { console.warn('populateMemberHeader failed', e); }
}

function populateMemberBadges() {
	try {
		const member = null;
		memberDebugLog('populateMemberBadges:start', { member });
		const badges = document.querySelectorAll('.meta-badges .info-chip');
		if (!badges || badges.length === 0) return;
		try {
			const first = badges[0];
			const lid = (member && (member.LidNr || member.lidnr || member.id || member.Lid || '')) || '';
			const lidText = lid ? String(lid) : '';
			const icon = first.querySelector('.material-symbols-outlined');
			first.innerHTML = '';
			if (icon) first.appendChild(icon);
			if (lidText) {
				const span = document.createElement('span');
				span.className = 'member-id';
				span.style.marginLeft = '8px';
				span.textContent = lidText;
				first.appendChild(span);
			}
		} catch(_) {}
		try {
			if (badges.length > 1) {
				const second = badges[1];
				const region = (member && (
					member.RegioOmschrijving || member.regioOmschrijving || member.Regio || member.regio || member['Regio Omschrijving'] || member.regio_omschrijving || member.region || member.Region || ''
				)) || '';
				const regionText = region ? String(region).trim() : '';
				const icon = second.querySelector('.material-symbols-outlined');
				second.innerHTML = '';
				if (icon) second.appendChild(icon);
				if (regionText) {
					const span = document.createElement('span');
					span.className = 'member-region';
					span.style.marginLeft = '8px';
					span.textContent = regionText;
					second.appendChild(span);
				}
			}
		} catch(_) {}
	} catch (e) { console.warn('populateMemberBadges failed', e); }
}

/* Mijn Keuzes population helpers removed per request */

function populateMemberRidesSection() {
	try {
		memberDebugLog('populateMemberRidesSection:start', { _selectedMemberId: (window && window._selectedMemberId) ? window._selectedMemberId : null });
		if (typeof renderRideStars === 'function') renderRideStars();
	} catch(e) { console.warn('populateMemberRidesSection failed', e); }
}

// Populate the Mijn Keuzes (Lunch) display from sessionStorage / SELECTED_MEMBER / Firestore
function populateMemberLunchChoice() {
	try {
		const target = document.querySelector('.mk-item--lunch .mk-item-value');
		const badge = document.querySelector('.mk-item--lunch .mk-status-badge');
		if (!target) return;
		const memberId = window._selectedMemberId || null;
		const itemEl = document.querySelector('.mk-item--lunch');
		const setVal = (v) => {
			memberDebugLog('populateMemberLunchChoice:setVal', { value: v });
			try { target.textContent = v || ''; } catch(_){ }
			try {
				if (!badge) return;
				const isAbsent = (v && String(v).toLowerCase().startsWith('a')) || (v === 'Afwezig');
				if (isAbsent) {
					badge.style.display = 'inline-flex';
					badge.classList.add('mk-badge-no');
					badge.classList.remove('mk-badge-yes');
					badge.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px">close</span>';
					try { if (itemEl) itemEl.classList.add('mk-no'); } catch(_) {}
				} else if (v && String(v).trim()) {
					badge.style.display = 'inline-flex';
					badge.classList.remove('mk-badge-no');
					badge.classList.add('mk-badge-yes');
					badge.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px">check</span>';
					try { if (itemEl) itemEl.classList.remove('mk-no'); } catch(_) {}
				} else {
					badge.style.display = 'none';
					badge.classList.remove('mk-badge-no');
					badge.classList.remove('mk-badge-yes');
					badge.innerHTML = '';
					try { if (itemEl) itemEl.classList.remove('mk-no'); } catch(_) {}
				}
			} catch(_){ }
		};

		// 1) sessionStorage (recent local choices)
		if (memberId) {
			try {
				const key = `shadow_ui_member_${String(memberId)}`;
				const raw = sessionStorage.getItem(key);
				if (raw) {
					try {
						const parsed = JSON.parse(raw || '{}');
						memberDebugLog('populateMemberLunchChoice:sessionStorage', { key, raw, parsed });
						const deel = parsed.lunchDeelname || parsed.lunchDeelname === '' ? parsed.lunchDeelname : null;
						const keuze = parsed.lunchKeuze || null;
						if (deel) {
							const d = String(deel).toLowerCase();
							if (d.startsWith('n')) { memberDebugLog('populateMemberLunchChoice:fromSession', { resolved: 'Afwezig' }); setVal('Afwezig'); return; }
							else { memberDebugLog('populateMemberLunchChoice:fromSession', { resolved: keuze ? String(keuze) : 'Aanwezig' }); setVal(keuze ? String(keuze) : 'Aanwezig'); return; }
						} else if (keuze) { memberDebugLog('populateMemberLunchChoice:fromSession', { resolved: String(keuze) }); setVal(String(keuze)); return; }
					} catch(_){ }
				}
			} catch(_){}
		}

		// 2) SELECTED_MEMBER in-memory
		try {
			const m = null;
			memberDebugLog('populateMemberLunchChoice:inMemoryCandidate', { m });
			if (m) {
				const deel = m.lunchDeelname || m.LunchDeelname || m.lunch || m.Lunch || null;
				const keuze = m.lunchKeuze || m.LunchKeuze || m.keuze || null;
				if (deel) {
					const d = String(deel).toLowerCase();
					if (d.startsWith('n')) { memberDebugLog('populateMemberLunchChoice:fromSELECTED_MEMBER', { resolved: 'Afwezig' }); setVal('Afwezig'); return; }
					else { memberDebugLog('populateMemberLunchChoice:fromSELECTED_MEMBER', { resolved: keuze ? String(keuze) : 'Aanwezig' }); setVal(keuze ? String(keuze) : 'Aanwezig'); return; }
				} else if (keuze) { setVal(String(keuze)); return; }
			}
		} catch(_){}

		// 3) Fetch member from Firestore as fallback
		if (memberId) {
			(async () => {
				try {
					const full = await getMemberById(String(memberId));
					memberDebugLog('populateMemberLunchChoice:fetched', { full });
					if (!full) return;
					const deel = full.lunchDeelname || full.LunchDeelname || full.lunch || full.Lunch || null;
					const keuze = full.lunchKeuze || full.LunchKeuze || full.keuze || null;
					if (deel) {
						const d = String(deel).toLowerCase();
						if (d.startsWith('n')) { memberDebugLog('populateMemberLunchChoice:fromFetch', { resolved: 'Afwezig' }); setVal('Afwezig'); }
						else { memberDebugLog('populateMemberLunchChoice:fromFetch', { resolved: keuze ? String(keuze) : 'Aanwezig' }); setVal(keuze ? String(keuze) : 'Aanwezig'); }
					} else if (keuze) setVal(String(keuze));
				} catch (e) { console.warn('populateMemberLunchChoice: fetch failed', e); }
			})();
			// Kick off caching of Firestore seed data on initial load
			try { loadAndCacheFirestoreSeedData().catch(e => console.warn('initial cache load failed', e)); } catch(_) {}
		}
	} catch (e) { console.warn('populateMemberLunchChoice failed', e); }
}

// Populate the Mijn Keuzes (Jaarhanger) display from sessionStorage / SELECTED_MEMBER / Firestore
function populateMemberJaarhangerChoice() {
	try {
		const target = document.querySelector('.mk-item--jaar .mk-item-value');
		const badge = document.querySelector('.mk-item--jaar .mk-status-badge');
		const itemEl = document.querySelector('.mk-item--jaar');
		if (!target) return;
		const memberId = window._selectedMemberId || null;
		const setVal = (v) => {
			memberDebugLog('populateMemberJaarhangerChoice:setVal', { value: v });
			try {
				const huidig = (new Date()).getFullYear();
				target.textContent = `${huidig} Editie `;
			} catch(_){}
			try {
				if (!badge) return;
				const isAbsent = (v && String(v).toLowerCase().startsWith('n')) || (v === 'Nee');
				if (isAbsent) {
					badge.style.display = 'inline-flex';
					badge.classList.add('mk-badge-no');
					badge.classList.remove('mk-badge-yes');
					badge.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px">close</span>';
					try { if (itemEl) itemEl.classList.add('mk-no'); } catch(_) {}
				} else if (v && String(v).trim()) {
					badge.style.display = 'inline-flex';
					badge.classList.remove('mk-badge-no');
					badge.classList.add('mk-badge-yes');
					badge.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px">check</span>';
					try { if (itemEl) itemEl.classList.remove('mk-no'); } catch(_) {}
				} else {
					badge.style.display = 'none';
					badge.classList.remove('mk-badge-no');
					badge.classList.remove('mk-badge-yes');
					badge.innerHTML = '';
					try { if (itemEl) itemEl.classList.remove('mk-no'); } catch(_) {}
				}
			} catch(_){}
		};

		// 1) sessionStorage
		if (memberId) {
			try {
				const key = `shadow_ui_member_${String(memberId)}`;
				const raw = sessionStorage.getItem(key);
				if (raw) {
					try {
						const parsed = JSON.parse(raw || '{}');
						memberDebugLog('populateMemberJaarhangerChoice:sessionStorage', { key, raw, parsed });
						const jaar = parsed.Jaarhanger || parsed.jaarhanger || null;
						if (jaar !== undefined && jaar !== null) {
							setVal(String(jaar)); return;
						}
					} catch(_){}
				}
			} catch(_){}
		}

		// 2) SELECTED_MEMBER
		try {
			const m = null;
			memberDebugLog('populateMemberJaarhangerChoice:inMemoryCandidate', { m });
			if (m) {
				const jaar = m.Jaarhanger || m.jaarhanger || null;
				if (jaar !== undefined && jaar !== null) { setVal(String(jaar)); return; }
			}
		} catch(_){}

		// 3) fetch fallback
		if (memberId) {
			(async () => {
				try {
					const full = await getMemberById(String(memberId));
					memberDebugLog('populateMemberJaarhangerChoice:fetched', { full });
					if (!full) return;
					const jaar = full.Jaarhanger || full.jaarhanger || null;
					if (jaar !== undefined && jaar !== null) setVal(String(jaar));
				} catch(e) { console.warn('populateMemberJaarhangerChoice: fetch failed', e); }
			})();
		}

	} catch(e) { console.warn('populateMemberJaarhangerChoice failed', e); }
}

// update when other flows complete lunch selection
try { document.addEventListener('lunch:completed', () => { try { populateMemberLunchChoice(); } catch(_){} }); } catch(_){ }
try { document.addEventListener('yearhanger:changed', () => { try { populateMemberJaarhangerChoice(); } catch(_){} }); } catch(_){ }
// update when jaarhanger selection changes
try { document.addEventListener('yearhanger:changed', () => { try { populateMemberJaarhangerChoice(); } catch(_){} }); } catch(_){ }
// module: member.js — main page behaviors for lunch and signup
import { getPlannedDates, searchMembers, getMemberById, getLunchOptions } from './firestore.js';
import { db, doc, onSnapshot } from '../src/firebase.js';

// --- Caching helpers: fetch once on startup and store in sessionStorage to reduce reads ---
const SESSION_KEY_PLANNED = 'shadow_ui_planned_dates';
const SESSION_KEY_LUNCH = 'shadow_ui_lunch_options';

async function cachedGetPlannedDates(force = false) {
	try {
		if (!force) {
			const raw = sessionStorage.getItem(SESSION_KEY_PLANNED);
			if (raw) {
				try { const parsed = JSON.parse(raw); console.debug('cachedGetPlannedDates: using cached plannedDates', parsed); return parsed; } catch(_) { /* fallthrough */ }
			}
		}
			console.debug('cachedGetPlannedDates: fetching from Firestore');
			const dates = await getPlannedDates();
			try { setSessionAndDump(SESSION_KEY_PLANNED, JSON.stringify(dates || [])); console.debug('cachedGetPlannedDates: stored plannedDates in sessionStorage'); } catch (e) { console.warn('cachedGetPlannedDates: failed to store session', e); }
			return dates || [];
	} catch (e) { console.warn('cachedGetPlannedDates failed', e); return []; }
}

async function cachedGetLunchOptions(force = false) {
	try {
		if (!force) {
			const raw = sessionStorage.getItem(SESSION_KEY_LUNCH);
			if (raw) {
				try { const parsed = JSON.parse(raw); console.debug('cachedGetLunchOptions: using cached lunchOptions', parsed); return parsed; } catch(_) { /* fallthrough */ }
			}
		}
		console.debug('cachedGetLunchOptions: fetching from Firestore');
		const opts = await getLunchOptions();
		try { setSessionAndDump(SESSION_KEY_LUNCH, JSON.stringify(opts || {})); console.debug('cachedGetLunchOptions: stored lunchOptions in sessionStorage'); } catch (e) { console.warn('cachedGetLunchOptions: failed to store session', e); }
		return opts || {};
	} catch (e) { console.warn('cachedGetLunchOptions failed', e); return { vastEten: [], keuzeEten: [] }; }
}

// Load and cache both datasets on startup (non-blocking)
async function loadAndCacheFirestoreSeedData() {
	try {
		console.debug('loadAndCacheFirestoreSeedData: starting');
		try { dumpSessionStorage(); } catch(_) {}
		// trigger both in parallel
		const [dates, lunch] = await Promise.all([cachedGetPlannedDates(false), cachedGetLunchOptions(false)]);
		console.debug('loadAndCacheFirestoreSeedData: completed', { dates, lunch });
	} catch (e) { console.warn('loadAndCacheFirestoreSeedData failed', e); }
}

// Debug helper: dump sessionStorage contents (parse JSON when possible)
function dumpSessionStorage() {
	try {
		const keys = Object.keys(sessionStorage || {});
		if (!keys || keys.length === 0) { console.debug('dumpSessionStorage: sessionStorage is empty'); return; }
		const snapshot = {};
		for (const k of keys) {
			try {
				const raw = sessionStorage.getItem(k);
				try { snapshot[k] = JSON.parse(raw); } catch(_) { snapshot[k] = raw; }
			} catch (e) { snapshot[k] = `__error__: ${String(e)}`; }
		}
		console.debug('dumpSessionStorage: snapshot keys=' + keys.length, snapshot);
	} catch (e) { console.warn('dumpSessionStorage failed', e); }
}

// Helper to set sessionStorage and then dump the full contents for debugging
function setSessionAndDump(key, value) {
	try {
		sessionStorage.setItem(key, value);
		console.debug('setSessionAndDump: wrote key=', key);
		// extra debug for member keys: log parsed content and stack
		try {
			if (typeof key === 'string' && key.indexOf('shadow_ui_member_') === 0) {
				let parsed = null;
				try { parsed = JSON.parse(value); } catch(_) { parsed = value; }
				console.debug('setSessionAndDump: member payload for', key, parsed);
				try { console.debug(new Error('stack').stack); } catch(_) {}
			}
		} catch(_) {}
	} catch (e) {
		console.warn('setSessionAndDump: failed to set', key, e);
	}
	try { dumpSessionStorage(); } catch (_) {}
}

// --- Fragment loader & inline navigation for lid-ui pages ---
const lidFragments = {
	originalPage: null,
	signupPage: null,
	lunchPage: null,
	jaarhangerPage: null,
	memberInfoPage: null
};
let lidFragmentsLoaded = false;
const navStack = [];
// Page order for footer-driven linear navigation
const BASE_PAGE_ORDER = ['original','signup','lunch','jaarhanger','member'];
let PAGE_ORDER = Array.from(BASE_PAGE_ORDER);

// Trigger initial cache load on module import so sessionStorage is populated
try {
	if (typeof loadAndCacheFirestoreSeedData === 'function') {
		loadAndCacheFirestoreSeedData().catch(e => console.warn('initial cache load failed', e));
	}
} catch (e) { /* ignore */ }

// Diagnostic helper: force-fetch parsed Firestore documents and log results
try {
	(async () => {
		try {
			console.debug('diagnostic: forcing Firestore fetch for plannedDates and lunchOptions');
			const forceDates = await getPlannedDates(true);
			console.debug('diagnostic:getPlannedDates(force) =>', forceDates);
			const forceLunch = await getLunchOptions();
			console.debug('diagnostic:getLunchOptions =>', forceLunch);
			try { setSessionAndDump(SESSION_KEY_PLANNED, JSON.stringify(forceDates || [])); } catch(_){}
			try { setSessionAndDump(SESSION_KEY_LUNCH, JSON.stringify(forceLunch || {})); } catch(_){}
		} catch (e) { console.warn('diagnostic fetch failed', e); }
	})();
} catch (_) {}

// Update PAGE_ORDER based on selected member (remove jaarhanger if member already has Jaarhanger)
function updatePageOrderForMember(member) {
	try {
		if (!member) { PAGE_ORDER = Array.from(BASE_PAGE_ORDER); return; }
		const hasJ = Boolean(member.Jaarhanger || member.jaarhanger || member.JaarHanger || member.JaarhangerAfgekort);
		// detect if member already scanned today (ScanDatums contains today's YYYY-MM-DD)
		const todayYMD = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
		let scannedToday = false;
		try {
			const scans = member.ScanDatums || member.ScanDatum || member.scandatums || member.ScanDates || null;
			if (Array.isArray(scans)) {
				for (const s of scans) {
					try {
						const v = String(s || '').slice(0,10);
						if (v === todayYMD) { scannedToday = true; break; }
					} catch(_){}
				}
			}
		} catch(_){}

		if (scannedToday) {
			// skip both lunch and jaarhanger if already scanned today
			PAGE_ORDER = BASE_PAGE_ORDER.filter(p => (p !== 'jaarhanger' && p !== 'lunch'));
		} else if (hasJ) {
			PAGE_ORDER = BASE_PAGE_ORDER.filter(p => p !== 'jaarhanger');
		} else {
			PAGE_ORDER = Array.from(BASE_PAGE_ORDER);
		}
	} catch (e) { console.warn('updatePageOrderForMember failed', e); }
}
let currentFragment = 'original';

function normalizeFragmentName(name){
	const n = String(name || '').toLowerCase();
	if (n === 'signup' || n === 'signuppage') return 'signup';
	if (n === 'lunch' || n === 'lunchpage') return 'lunch';
	if (n === 'jaar' || n === 'jaarhanger' || n === 'jaarhangerpage') return 'jaarhanger';
	if (n === 'member' || n === 'memberinfopage') return 'member';
	return 'original';
}

async function loadLidFragments() {
	if (lidFragmentsLoaded) return;
	const bases = ['./lid-ui/', 'lid-ui/', '/lid-ui/', '/new-ui/lid-ui/'];
	const files = ['originalPage.html', 'signupPage.html', 'lunchPage.html', 'jaarhangerPage.html', 'memberInfoPage.html'];
	const results = {};
	for (const fname of files) {
		let got = '';
		for (const base of bases) {
			try {
				const res = await fetch(base + fname, { cache: 'no-store' });
				if (res && res.ok) {
					const txt = await res.text();
					if (txt && txt.trim()) { got = txt; break; }
				}
			} catch (e) {
				// try next base
			}
		}
		results[fname] = got || '';
	}
	lidFragments.originalPage = results['originalPage.html'] || '';
	lidFragments.signupPage = results['signupPage.html'] || '';
	lidFragments.lunchPage = results['lunchPage.html'] || '';
	lidFragments.jaarhangerPage = results['jaarhangerPage.html'] || '';
	lidFragments.memberInfoPage = results['memberInfoPage.html'] || '';

	// Provide minimal fallback if originalPage missing
	if (!lidFragments.originalPage || !lidFragments.originalPage.includes('id="rides-list"')) {
		lidFragments.originalPage = `<header><h1>Geplande Ritten</h1></header><main><div id="rides-list" class="planned-rides"></div></main><footer><button id="agree-index">Ja, ik ga akkoord</button></footer>`;
	}

	lidFragmentsLoaded = true;
}

function getFragmentByName(name) {
	const n = String(name || '').toLowerCase();
	if (n === 'signup' || n === 'signuppage') return lidFragments.signupPage;
	if (n === 'lunch' || n === 'lunchpage') return lidFragments.lunchPage;
	if (n === 'jaar' || n === 'jaarhanger' || n === 'jaarhangerpage') return lidFragments.jaarhangerPage;
	if (n === 'member' || n === 'memberinfopage') return lidFragments.memberInfoPage;
	return lidFragments.originalPage;
}

async function renderFragment(name) {
	try {
		await loadLidFragments();
		const container = document.querySelector('.main-content') || document.body;
		if (!container) return;
		// push current header/footer/main to stack for back navigation
		try {
			const curHeader = document.querySelector('header');
			const curFooter = document.querySelector('footer');
			navStack.push({
				header: curHeader ? curHeader.outerHTML : null,
				footer: curFooter ? curFooter.outerHTML : null,
				main: container.innerHTML || '',
				fragmentName: currentFragment || 'original'
			});
		} catch (_) { try { navStack.push({ header: null, footer: null, main: container.innerHTML || '', fragmentName: currentFragment || 'original' }); } catch(__) {} }

		const norm = normalizeFragmentName(name);
		const html = getFragmentByName(name) || '';
		try {
			const parser = new DOMParser();
			const doc = parser.parseFromString(html, 'text/html');

			// Rename participation radio names to be fragment-scoped to avoid cross-page interference
			try {
				const parts = ['signup','lunch','jaarhanger','member','original'];
				let fragKey = norm || 'original';
				// ensure stable fragment key
				if (!parts.includes(fragKey)) fragKey = fragKey.split(/[^a-z]/)[0] || 'original';
				const inputs = doc.querySelectorAll('input[type="radio"][name="participation"]');
				if (inputs && inputs.length) {
					inputs.forEach((inp) => {
						try { inp.setAttribute('name', `participation-${fragKey}`); } catch(_) {}
					});
				}
			} catch (_) {}

			// If fragment provides its own header/footer, replace the current ones.
			// If the fragment does NOT contain a header/footer, remove the existing one
			const fragHeader = doc.querySelector('header');
			const fragFooter = doc.querySelector('footer');
			// Replace or remove header
			if (fragHeader) {
				try {
					const existingHeader = document.querySelector('header');
					if (existingHeader) existingHeader.replaceWith(fragHeader);
					else document.body.insertBefore(fragHeader, document.body.firstChild);
				} catch (e) {
					try { document.querySelector('header')?.remove(); document.body.insertAdjacentHTML('afterbegin', doc.querySelector('header').outerHTML); } catch(_) {}
				}
			} else {
				// fragment has no header -> remove any existing header to fully adopt fragment page
				try { const existingHeader = document.querySelector('header'); if (existingHeader) existingHeader.remove(); } catch(_) {}
			}
			// Replace or remove footer
			if (fragFooter) {
				try {
					const existingFooter = document.querySelector('footer');
					if (existingFooter) existingFooter.replaceWith(fragFooter);
					else document.body.appendChild(fragFooter);
				} catch (e) {
					try { document.querySelector('footer')?.remove(); document.body.insertAdjacentHTML('beforeend', doc.querySelector('footer').outerHTML); } catch(_) {}
				}
			} else {
				// fragment has no footer -> remove any existing footer to fully adopt fragment page
				try { const existingFooter = document.querySelector('footer'); if (existingFooter) existingFooter.remove(); } catch(_) {}
			}

			// Determine main content to insert
			let insert = '';
			const mainEl = doc.querySelector('main');
			if (mainEl) insert = mainEl.innerHTML;
			else {
				// remove header/footer nodes from cloned body then use remaining
				const cloneBody = doc.body.cloneNode(true);
				const h = cloneBody.querySelector('header'); if (h) h.remove();
				const f = cloneBody.querySelector('footer'); if (f) f.remove();
				insert = cloneBody.innerHTML || html;
			}
			container.innerHTML = insert;
			// mark current fragment
			currentFragment = norm;
			// If jaarhanger fragment, ensure its footer button starts disabled until a selection is made
			try {
				if (currentFragment === 'jaarhanger') {
					const jbtn = document.getElementById('agree-jaarhanger');
					if (jbtn) {
						jbtn.disabled = true;
						jbtn.setAttribute('aria-disabled', 'true');
						jbtn.classList && jbtn.classList.add('disabled');
					}
				}
			} catch (_) {}
		} catch (e) {
			// fallback: insert raw HTML
			container.innerHTML = html;
		}

		// After injecting HTML, run common setup routines so the fragment behaves like a standalone page
		try { setHeaderDate(); } catch (_) {}
		try { await renderPlannedRides('.planned-rides'); } catch (_) {}
		try { setupFormInputCapitalization(); } catch (_) {}
		try { setupMemberSuggestions(); } catch (_) {}
		try { setupLunchOptions(); } catch (_) {}
		try { setupParticipationToggle(); } catch (_) {}
		try {
			if (currentFragment === 'member') {
				try { populateMemberHeader(); } catch(_) {}
				try { populateMemberBadges(); } catch(_) {}
						try { populateMemberRidesSection(); } catch(_) {}
						try { populateMemberLunchChoice(); } catch(_) {}
						try { populateMemberJaarhangerChoice(); } catch(_) {}
						try { renderMemberInfoQR(null); } catch(_) {}
						try { populateMemberJaarhangerChoice(); } catch(_) {}
			} else {
				try { populateMemberHeader(); } catch(_) {}
				try { populateMemberBadges(); } catch(_) {}
			}
		} catch(_) {}
		try { setupAgreeLunchButton(); } catch (_) {}
		try { setupAgreeJaarhanger(); } catch (_) {}
		try { setupSignupFooterNavigation(); } catch (_) {}
		try { setupBackButton(); } catch (_) {}
		try { setupAgreeButton(); } catch (_) {}
		try { setupChoiceItemNavigation(); } catch (_) {}
	} catch (e) {
		console.warn('renderFragment failed', e);
	}
}

function popFragment() {
	try {
		const container = document.querySelector('.main-content') || document.body;
		if (!container) return;
		if (navStack.length === 0) return;
		const prev = navStack.pop();
		if (!prev) return;
		try {
			if (typeof prev === 'string') {
				container.innerHTML = prev || '';
			} else {
				// prev is { header, footer, main }
				const parser = new DOMParser();
				// restore header
				if (prev.header) {
					try {
						const hdoc = parser.parseFromString(prev.header, 'text/html');
						const newHeader = hdoc.querySelector('header');
						if (newHeader) {
							const existingHeader = document.querySelector('header');
							if (existingHeader) existingHeader.replaceWith(newHeader);
							else document.body.insertBefore(newHeader, document.body.firstChild);
						}
					} catch (_) {}
				} else {
					// remove header if fragment had introduced one
					try { const existingHeader = document.querySelector('header'); if (existingHeader) existingHeader.remove(); } catch(_) {}
				}
				// restore footer
				if (prev.footer) {
					try {
						const fdoc = parser.parseFromString(prev.footer, 'text/html');
						const newFooter = fdoc.querySelector('footer');
						if (newFooter) {
							const existingFooter = document.querySelector('footer');
							if (existingFooter) existingFooter.replaceWith(newFooter);
							else document.body.appendChild(newFooter);
						}
					} catch (_) {}
				} else {
					try { const existingFooter = document.querySelector('footer'); if (existingFooter) existingFooter.remove(); } catch(_) {}
				}
				// restore main
				container.innerHTML = prev.main || '';
			}
				// Ensure fragment-specific footer states are initialized after all setup
				try { updateLunchFooterState(); } catch (e) { console.warn('post-render updateLunchFooterState failed', e); }
				try { updateJaarhangerFooterState(); } catch (e) { console.warn('post-render updateJaarhangerFooterState failed', e); }
		} catch (e) {
			// fallback: try string restore
			try { container.innerHTML = (prev && prev.main) ? prev.main : String(prev || ''); } catch(_) { container.innerHTML = '' }
		}
		// re-run basic setup
		try { setHeaderDate(); } catch (_) {}
		try { setupFormInputCapitalization(); } catch (_) {}
		try { setupMemberSuggestions(); } catch (_) {}
		try { setupLunchOptions(); } catch (_) {}
		try { setupParticipationToggle(); } catch (_) {}
		try {
			try { populateMemberHeader(); } catch(_) {}
			try { populateMemberBadges(); } catch(_) {}
				if (currentFragment === 'member') {
					try { populateMemberRidesSection(); } catch(_) {}
					try { populateMemberLunchChoice(); } catch(_) {}
					try { populateMemberJaarhangerChoice(); } catch(_) {}
						try { renderMemberInfoQR(null); } catch(_) {}
				}
		} catch(_) {}
		try { setupBackButton(); } catch (_) {}
		try { setupAgreeButton(); } catch (_) {}
	} catch (e) { console.warn('popFragment failed', e); }
}

// Ensure QR generation helper (dynamic loader)
function ensureQRLib() {
	return new Promise((resolve, reject) => {
		if (window.QRCode && typeof window.QRCode.toDataURL === 'function') return resolve(window.QRCode);
		if (document.querySelector('script[data-qr-lib]')) {
			const s = document.querySelector('script[data-qr-lib]');
			s.addEventListener('load', () => resolve(window.QRCode));
			s.addEventListener('error', () => reject(new Error('QR lib failed')));
			return;
		}
		const s = document.createElement('script');
		s.setAttribute('data-qr-lib', '1');
		s.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js';
		s.onload = () => resolve(window.QRCode);
		s.onerror = () => reject(new Error('Failed to load QR lib'));
		document.head.appendChild(s);
	});
}

async function renderMemberInfoQR(member){
	try{
		const wrap = document.getElementById('memberInfoQRWrap');
		const img = document.getElementById('memberInfoQRImg');
		if(!wrap || !img) return;
		// Build payload with requested fields
		const lid = (member && (member.LidNr || member.id || member.uid || member.memberId)) || '';
		const jaar = member?.Jaarhanger ?? member?.jaarhanger ?? null;
		const lunchDeel = member?.lunchDeelname ?? member?.LunchDeelname ?? member?.lunch ?? member?.Lunch ?? null;
		const lunchKeuze = member?.lunchKeuze ?? member?.LunchKeuze ?? member?.lunchKeuze ?? null;
		// Build JSON payload with requested fields
		const payloadObj = {
			Jaarhanger: (jaar === undefined ? null : jaar),
			LidNr: (lid ? String(lid) : null),
			lunchDeelname: (lunchDeel === undefined ? null : lunchDeel),
			lunchKeuze: (lunchKeuze === undefined ? null : lunchKeuze)
		};
		const payloadStr = JSON.stringify(payloadObj);

		// Try using QR lib, fallback to Google Chart static image
		try{
			await ensureQRLib();
			const container = img.parentElement;
			const measured = (container && container.clientWidth) || img.getBoundingClientRect().width || 300;
			const base = Math.floor(measured);
			// Use 80% of the container width for the QR size, clamp to reasonable range
			const drawSize = Math.min(Math.max(120, Math.floor(base * 0.8)), 2048);
			const internalSize = Math.floor(drawSize * (window.devicePixelRatio || 1));
			const dataUrl = await new Promise((resolve, reject) => {
				try{ window.QRCode.toDataURL(payloadStr, { width: internalSize }, (err, url) => err ? reject(err) : resolve(url)); }catch(e){ reject(e); }
			});
			img.src = dataUrl;
			try { img.removeAttribute('width'); img.removeAttribute('height'); } catch(_){}
			img.style.width = '100%';
			img.style.height = '100%';
			img.style.display = 'block';
			wrap.style.display = 'inline-block';
			try { const btn = document.getElementById('save-qr-btn'); if (btn) btn.style.display = 'inline-block'; } catch(_) {}
			return;
		}catch(e){
			// fallback
			const container = img.parentElement;
			const measured = (container && container.clientWidth) || img.getBoundingClientRect().width || 300;
			const base = Math.floor(measured);
			const drawSize = Math.min(Math.max(120, Math.floor(base * 0.8)), 2048);
			const encoded = encodeURIComponent(payloadStr);
			img.src = `https://chart.googleapis.com/chart?cht=qr&chs=${drawSize}x${drawSize}&chl=${encoded}&choe=UTF-8`;
			try { img.removeAttribute('width'); img.removeAttribute('height'); } catch(_){}
			img.style.width = '100%';
			img.style.height = '100%';
			img.style.display = 'block';
			wrap.style.display = 'inline-block';
			try { const btn = document.getElementById('save-qr-btn'); if (btn) btn.style.display = 'inline-block'; } catch(_) {}
			return;
		}
	}catch(e){ console.warn('renderMemberInfoQR failed', e); }
}

// Render planned rides into the provided selector (e.g. '.planned-rides')
			export async function renderPlannedRides(selector = '.planned-rides') {
				try {
					const container = document.querySelector(selector);
					if (!container) return;
					container.innerHTML = '';
					const dates = await getPlannedDates();
					if (!Array.isArray(dates) || dates.length === 0) {
						container.innerHTML = '<div class="planned-list"><p class="muted">Geen geplande ritten</p></div>';
						return;
					}

					// Helpers
					const toYMD = (v) => {
						try {
							if (!v) return '';
							if (typeof v === 'string' && /\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0,10);
							const d = new Date(v);
							if (!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
							return '';
						} catch { return ''; }
					};

					const today = (() => {
						const d = new Date();
						return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
					})();

					const dayDiff = (ymd) => {
						try {
							const parts = ymd.split('-').map(n => parseInt(n,10));
							if (parts.length !== 3) return NaN;
							const a = new Date(parts[0], parts[1]-1, parts[2]);
							const bParts = today.split('-').map(n => parseInt(n,10));
							const b = new Date(bParts[0], bParts[1]-1, bParts[2]);
							const diff = Math.round((a - b) / 86400000);
							return diff;
						} catch { return NaN; }
					};

					const fmtPretty = (ymd) => {
						try {
							const d = new Date(ymd + 'T00:00:00');
							return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
						} catch { return ymd; }
					};

					const rawList = (Array.isArray(dates) ? dates : []).map(toYMD).filter(Boolean);
					// keep only today or future rides
					const items = rawList.map(ymd => ({ ymd, diff: dayDiff(ymd) })).filter(i => typeof i.diff === 'number' && i.diff >= 0).sort((a,b) => a.ymd.localeCompare(b.ymd));
					if (items.length === 0) {
						container.innerHTML = '<div class="planned-list"><p class="muted">Geen geplande ritten</p></div>';
						return;
					}
					const wrap = document.createElement('div'); wrap.className = 'planned-list';
					for (const it of items) {
						const ymd = it.ymd;
						const diff = it.diff;
						const cardWrap = document.createElement('div'); cardWrap.className = 'card-wrapper';
						const card = document.createElement('div'); card.className = 'card';
						card.setAttribute('data-ride', ymd);
						card.tabIndex = 0;
						const left = document.createElement('div'); left.className = 'ride-date'; left.textContent = fmtPretty(ymd);
						const right = document.createElement('div');
						if (diff === 0) {
							right.className = 'badge badge-today'; right.textContent = 'Vandaag';
						} else {
							right.className = 'badge badge-count'; right.textContent = `${diff} dagen`;
						}
						card.appendChild(left); card.appendChild(right); cardWrap.appendChild(card); wrap.appendChild(cardWrap);
					}
					container.appendChild(wrap);
				} catch (e) {
					console.warn('renderPlannedRides failed', e);
				}
			}

			// Ensure first letter capitalization on text inputs with class `form-input` (idempotent)
			function setupFormInputCapitalization() {
				try {
					const inputs = Array.from(document.querySelectorAll('input.form-input'));
					for (const el of inputs) {
						try {
							if (!el || el.dataset && el.dataset._capBound) continue;
							// composition handling for IME
							el.addEventListener('compositionstart', () => { try { el.dataset._composing = '1'; } catch(_) {} }, { passive: true });
							el.addEventListener('compositionend', (ev) => { try { delete el.dataset._composing; /* run one final capitalization */ capitalizeOnce(el); } catch(_) {} });
							el.addEventListener('input', (ev) => {
								try { if (el.dataset && el.dataset._composing) return; capitalizeOnce(el); } catch(_) {}
							});
							if (el.dataset) el.dataset._capBound = '1';
						} catch (e) { /* ignore per-element errors */ }
					}
				} catch (e) { console.warn('setupFormInputCapitalization failed', e); }

				function capitalizeOnce(el) {
					try {
						const v = el.value || '';
						if (!v) return;
						const first = v.charAt(0);
						const upper = first.toUpperCase();
						if (first === upper) return;
						const s = el.selectionStart;
						const e = el.selectionEnd;
						el.value = upper + v.slice(1);
						// restore caret/selection (length unchanged)
						try { if (typeof s === 'number' && typeof e === 'number') el.setSelectionRange(s, e); } catch(_) {}
					} catch (e) { /* ignore */ }
				}
			}

		// Ensure planned rides render on initial load
		(function ensureInitialPlannedRender() {
			const run = async () => {
				try {
					if (typeof setHeaderDate === 'function') try { setHeaderDate(); } catch(_) {}
					await renderPlannedRides('.planned-rides');
				} catch (e) { /* ignore */ }
			};
			if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
			else run();
		})();

// Fallback: idempotent binding for footer agree button
function setupAgreeButton() {
	try {
		const btn = document.getElementById('agree-index');
		if (!btn) return;
		if (btn.dataset && btn.dataset._agreeBound) return;
		btn.addEventListener('click', (e) => {
			e.preventDefault();
			try {
				const idx = PAGE_ORDER.indexOf(currentFragment || 'original');
				const next = (idx >= 0 && idx < PAGE_ORDER.length - 1) ? PAGE_ORDER[idx + 1] : 'signup';
				renderFragment(next);
			} catch (err) {
				try { window.location.href = 'lid-ui/signupPage.html'; } catch(_) {}
			}
		});
		if (btn.dataset) btn.dataset._agreeBound = '1';
	} catch (e) { console.warn('setupAgreeButton failed', e); }
}

// Member name suggestions: show dropdown of matches after 200ms inactivity
function setupMemberSuggestions() {
	try {
		const inputs = Array.from(document.querySelectorAll('input.form-input'));
		for (const el of inputs) {
			try {
				if (!el || (el.dataset && el.dataset._suggestBound)) continue;
				// Only attach suggestions for likely name inputs (heuristic: placeholder contains 'Bijv' or parent label contains 'Naam')
				const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
				const labelText = (el.closest('label') ? (el.closest('label').innerText || '').toLowerCase() : '');
				if (!placeholder.includes('bijv') && !labelText.includes('naam')) {
					// still allow if page is signup (title Inschrijven)
					const pageTitle = (document.querySelector('.page-title') || {}).textContent || '';
					if (!/inschrijf|inschrijven|inschrijven/i.test(pageTitle)) continue;
				}

				let timer = null;
				let activeIndex = -1;
				let listEl = null;
				const maxResults = 8;

				function closeList() {
					if (listEl && listEl.parentNode) listEl.parentNode.removeChild(listEl);
					listEl = null; activeIndex = -1;
				}

				async function showSuggestions(prefix) {
					try {
						const q = String(prefix || '').trim();
						if (!q) { closeList(); return; }
						const results = await searchMembers(q, maxResults);
						if (!Array.isArray(results) || results.length === 0) { closeList(); return; }
						// build dropdown
						closeList();
						listEl = document.createElement('div');
						listEl.className = 'member-suggestions';
						listEl.style.position = 'absolute';
						listEl.style.zIndex = 9999;
						listEl.style.background = '#fff';
						listEl.style.border = '1px solid rgba(0,0,0,0.08)';
						listEl.style.boxShadow = '0 6px 18px rgba(0,0,0,0.08)';
						listEl.style.borderRadius = '8px';
						listEl.style.overflow = 'hidden';
						listEl.style.minWidth = (el.offsetWidth || 200) + 'px';
						listEl.style.maxHeight = '260px';
						listEl.style.overflowY = 'auto';
						listEl.setAttribute('role','listbox');

						const rect = el.getBoundingClientRect();
						const docEl = document.documentElement;
						const top = rect.bottom + window.scrollY + 6;
						const left = rect.left + window.scrollX;
						listEl.style.top = top + 'px';
						listEl.style.left = left + 'px';

						results.forEach((r, i) => {
							const item = document.createElement('div');
							item.className = 'member-suggestion-item';
							item.setAttribute('role','option');
							item.style.padding = '8px 12px';
							item.style.cursor = 'pointer';
							item.style.borderBottom = '1px solid rgba(0,0,0,0.04)';
							const nameDisplay = `${(r.voor||'').trim()} ${(r.naam||'').trim()}`.trim();
							item.textContent = nameDisplay || (r.naam || r.voor || r.id || '');
							item.dataset.memberId = r.id || '';
							item.addEventListener('click', (ev) => {
								ev.preventDefault();
								el.value = item.textContent;
								const pickedId = item.dataset.memberId || '';
								// clear any existing member-related sessionStorage data when selecting a (new) member
								try { clearAllMemberSessionData(); } catch(_) {}
								// mark explicit selection on the input so footer enablement is only on explicit picks
								try { if (el.dataset) el.dataset.selectedMember = pickedId; } catch(_) {}
								try { window._selectedMemberId = pickedId || ''; } catch(_) {}
								closeList();
								// On touch devices blur to hide on-screen keyboard, otherwise keep focus
								try {
									const isTouch = (('ontouchstart' in window) || (navigator && navigator.maxTouchPoints && navigator.maxTouchPoints > 0));
									if (isTouch) el.blur(); else el.focus();
								} catch (_) { try { el.blur(); } catch(_) {} }
								try { updateSignupFooterState(); } catch(_) {}
								// Fetch full member to update page order immediately (non-blocking)
								(async () => {
									try {
										const id = pickedId || '';
										if (!id) { updatePageOrderForMember(null); return; }
										const full = await getMemberById(String(id));
										if (full) {
											try { updatePageOrderForMember(full); } catch(_) {}
											try { renderMemberInfoQR(full); } catch(_) {}
										}
									} catch (e) { console.warn('suggestion click: getMemberById failed', e); }
								})();
							});
							listEl.appendChild(item);
						});

						document.body.appendChild(listEl);
					} catch (e) { console.warn('showSuggestions failed', e); }
				}

				function schedule(prefix) {
					if (timer) clearTimeout(timer);
					timer = setTimeout(() => { showSuggestions(prefix); }, 200);
				}

				el.addEventListener('compositionstart', () => { try { el.dataset._composing = '1'; } catch(_) {} }, { passive: true });
				el.addEventListener('compositionend', (ev) => { try { delete el.dataset._composing; schedule(el.value || ''); } catch(_) {} });
				el.addEventListener('input', (ev) => {
					try {
						if (el.dataset && el.dataset._composing) return;
						// clear any transient selection markers
						if (el.dataset) { delete el.dataset.selectedMember; }
						try { window._selectedMemberId = ''; } catch(_) {}
						// reset page order when input changes (member no longer selected)
						try { updatePageOrderForMember(null); } catch(_) {}
						schedule(el.value || '');
						try { updateSignupFooterState(); } catch(_) {}
					} catch(_) {}
				});
				el.addEventListener('keydown', (ev) => {
					try {
						if (!listEl) return;
						const items = Array.from(listEl.querySelectorAll('[role="option"]'));
						if (!items.length) return;
						if (ev.key === 'ArrowDown') { ev.preventDefault(); activeIndex = Math.min(items.length-1, activeIndex+1); updateActive(items); }
						else if (ev.key === 'ArrowUp') { ev.preventDefault(); activeIndex = Math.max(0, activeIndex-1); updateActive(items); }
						else if (ev.key === 'Enter') { ev.preventDefault(); if (activeIndex >=0 && items[activeIndex]) items[activeIndex].click(); }
						else if (ev.key === 'Escape') { closeList(); }
					} catch(_){}
				});

				function updateActive(items) {
					items.forEach((it, idx) => { it.style.background = (idx === activeIndex) ? 'rgba(22,62,141,0.06)' : ''; });
					if (items[activeIndex]) {
						items[activeIndex].scrollIntoView({ block: 'nearest' });
					}
				}

				// Keep dropdown open until user selects a suggestion or presses Escape.
				// (Do NOT close on outside click—user requested persistent dropdown until selection.)

				// cleanup flag
				if (el.dataset) el.dataset._suggestBound = '1';
			} catch (e) { /* ignore per-element errors */ }
		}
	} catch (e) { console.warn('setupMemberSuggestions failed', e); }
}

// Document-level delegation so footer navigation works even when footer DOM is replaced
function setupFooterDelegation() {
	try {
		if (document._footerNavBound) return;
		document.addEventListener('click', (e) => {
			try {
				const el = e.target.closest ? e.target.closest('.app-footer__button, button.app-footer__button, #agree-index, [data-next]') : null;
				if (!el) return;
				const footer = el.closest ? (el.closest('footer') || el.closest('.app-footer')) : null;
				if (!footer) return; // ensure footer area
				e.preventDefault();
				const dataNext = el.getAttribute && el.getAttribute('data-next');
				if (dataNext) {
					try { renderFragment(normalizeFragmentName(dataNext)); } catch (_) { window.location.href = dataNext; }
					return;
				}
				const idx = PAGE_ORDER.indexOf(currentFragment || 'original');
				const next = (idx >= 0 && idx < PAGE_ORDER.length - 1) ? PAGE_ORDER[idx + 1] : null;
				if (next) try { renderFragment(next); } catch (err) { window.location.href = `lid-ui/${next}Page.html`; }
				else try { renderFragment('signup'); } catch (err) { window.location.href = 'lid-ui/signupPage.html'; }
			} catch (_) {}
		}, true);
		document._footerNavBound = true;
	} catch (e) { console.warn('setupFooterDelegation failed', e); }
}

try { setupFooterDelegation(); } catch(_) {}

// Store selected member data for other flows
/* SELECTED_MEMBER global removed — feature disabled */
const SELECTED_MEMBER = null;

// Populate member-related UI spots (e.g. .member-name) from SELECTED_MEMBER or window.SELECTED_MEMBER

// Render stars based on planned ride dates from globals/rideConfig
async function renderRideStars() {
	try {
		const container = document.querySelector('.stats-stars');
		if (!container) return;
		container.innerHTML = '';
		const dates = await getPlannedDates(); // array of YYYY-MM-DD
		if (!Array.isArray(dates) || dates.length === 0) return;
		// limit to 5 stars max (show up to 5 planned rides)
		const maxStars = 5;
		const max = Math.min(maxStars, dates.length);
		const use = dates.slice(0, max);
		// build set of member scan dates for quick lookup
		const member = null;
		const scans = new Set();
		try {
			const arr = member && (member.ScanDatums || member.ScanDatum || member.scandatums || member.ScanDates) ? (member.ScanDatums || member.ScanDatum || member.scandatums || member.ScanDates) : [];
			if (Array.isArray(arr)) {
				for (const s of arr) {
					try { const v = String(s || '').slice(0,10); if (v) scans.add(v); } catch(_) {}
				}
			}
		} catch(_) {}

		const fmt = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' });
		let filledCount = 0;
		for (let i = 0; i < use.length; i++) {
			const ymd = use[i];
			const d = new Date(ymd + 'T00:00:00');
			const isScanned = scans.has(String(ymd));
			if (isScanned) filledCount += 1;
			const span = document.createElement('span');
			span.className = `material-symbols-outlined star ${isScanned ? 'filled' : 'empty'}`;
			span.setAttribute('data-ride-date', ymd);
			span.setAttribute('role', 'img');
			span.setAttribute('aria-label', `${isScanned ? 'Bezocht' : 'Niet bezocht'} ${ymd}`);
			try { span.title = `${fmt.format(d)} — ${ymd}`; } catch(_) { span.title = ymd; }
			span.textContent = 'star';
			container.appendChild(span);
		}
		// update stat-count if present
		try {
			const sc = document.querySelector('.stat-count');
			if (sc) sc.textContent = `${filledCount} / ${use.length}`;
		} catch(_) {}
	} catch (e) { console.warn('renderRideStars failed', e); }
}

// Bind the signup footer button to load full member data from Firestore
function setupSignupFooterNavigation() {
	try {
		const btn = document.getElementById('agree-signup');
		if (!btn) return;
		if (btn.dataset && btn.dataset._signupBound) return;
		btn.addEventListener('click', async (e) => {
			try {
				e.preventDefault();
				// find the most relevant input (heuristic: first .form-input in main)
				const container = document.querySelector('.main-content') || document.body;
				const input = container.querySelector('input.form-input');
				let memberId = '';
				try { memberId = window._selectedMemberId || (input && input.dataset ? (input.dataset.selectedMember || '') : ''); } catch(_) { memberId = (input && input.dataset ? (input.dataset.selectedMember || '') : ''); }
				const typed = input ? (input.value || '').trim() : '';
				if (!memberId && typed) {
					// try to resolve by searching members (wider search)
					const matches = await searchMembers(typed, 8);
					if (Array.isArray(matches) && matches.length > 0) {
						// prefer exact display match
						const norm = typed.toLowerCase().replace(/\s+/g,' ').trim();
						const found = matches.find(m => `${(m.voor||'').trim()} ${(m.naam||'').trim()}`.toLowerCase().replace(/\s+/g,' ').trim() === norm);
						if (found) memberId = found.id;
						else if (matches.length === 1) memberId = matches[0].id;
						else memberId = matches[0].id; // fallback to first match
					}
				}
				if (!memberId) {
					// no member found — show simple error and do not proceed
					try { alert('Geen lid geselecteerd. Kies een naam uit de lijst.'); } catch(_) {}
					return;
				}
				// fetch full member
				let full = null;
				try { full = await getMemberById(String(memberId)); } catch (err) { console.warn('getMemberById failed', err); }
				// store full member in sessionStorage for downstream flows
				try {
					if (full) {
						const key = `shadow_ui_member_${String(memberId)}`;
						try { setSessionAndDump(key, JSON.stringify(full)); } catch(_){}
						try { setSessionAndDump('shadow_ui_current_member', JSON.stringify({ id: String(memberId), loadedAt: (new Date()).toISOString() })); } catch(_){}
						console.debug('signup: stored full member in sessionStorage', { key });
					}
				} catch (_) {}
				// reset any stored choices for this member when selecting via signup flow
				try { resetMemberChoices(memberId); } catch(_) {}
				try { renderMemberInfoQR(full); } catch(_) {}
				// adjust page order depending on whether this member already has a Jaarhanger
				try { updatePageOrderForMember(full); } catch(_) {}
				// navigate to next page in order (signup -> lunch)
				try {
					const idx = PAGE_ORDER.indexOf('signup');
					const next = (idx >=0 && idx < PAGE_ORDER.length-1) ? PAGE_ORDER[idx+1] : 'lunch';
					renderFragment(next);
				} catch (err) { try { window.location.href = 'lid-ui/lunchPage.html'; } catch(_) {} }
			} catch (e) { console.warn('signup navigation handler failed', e); }
		});
		if (btn.dataset) btn.dataset._signupBound = '1';
		try { updateSignupFooterState(); } catch(_) {}
	} catch (e) { console.warn('setupSignupFooterNavigation failed', e); }
}

// Enable/disable the signup footer button based on whether a member is selected
function updateSignupFooterState() {
	try {
		const btn = document.getElementById('agree-signup');
		if (!btn) return;
		const input = (document.querySelector('.main-content') || document.body).querySelector('input.form-input');
		const hasSel = Boolean(
			// only allow when an explicit id marker exists from the suggestions (no global selected state)
			(window._selectedMemberId && String(window._selectedMemberId).trim()) ||
			(input && input.dataset && input.dataset.selectedMember)
		);
		btn.disabled = !hasSel;
		if (btn.disabled) {
			btn.setAttribute('aria-disabled', 'true');
			btn.classList && btn.classList.add('disabled');
		} else {
			btn.removeAttribute('aria-disabled');
			btn.classList && btn.classList.remove('disabled');
		}
	} catch (e) { /* ignore */ }
}

// Load lunch options from firestore and render the fixed & choice sections
async function setupLunchOptions() {
	try {
		const display = document.getElementById('vastEtenDisplay');
		const buttonsWrap = document.getElementById('keuzeEtenButtons');
		if (!display && !buttonsWrap) return;
		// show loading
		if (display) display.textContent = 'Laden...';
		if (buttonsWrap) buttonsWrap.innerHTML = '';

		const opts = await cachedGetLunchOptions();
		const vast = Array.isArray(opts && opts.vastEten) ? opts.vastEten : [];
		const keuze = Array.isArray(opts && opts.keuzeEten) ? opts.keuzeEten : [];

		// Render vast eten as a styled list (card with rows)
		if (display) {
			if (vast.length === 0) {
				display.innerHTML = '<div class="muted-text">Geen vaste maaltijd vermeld.</div>';
			} else {
				const list = document.createElement('div');
				list.className = 'vast-list';
				vast.forEach((v, i) => {
					const it = document.createElement('div');
					it.className = 'vast-item';
					const txt = String(v || '').trim();
					it.innerHTML = `<span class="choice-label">${escapeHtml(txt)}</span>`;
					list.appendChild(it);
				});
				// clear and append
				display.innerHTML = '';
				display.appendChild(list);
			}
		}

		// Render keuze eten as radio buttons / choice cards
		if (buttonsWrap) {
			if (keuze.length === 0) {
				buttonsWrap.innerHTML = '<div class="muted-text">Geen keuzemogelijkheden beschikbaar.</div>';
			} else {
				const name = 'lunchChoice';
				const frag = document.createDocumentFragment();
				keuze.forEach((k, i) => {
					const val = String(k || '').trim();
					const id = `lunch-choice-${i}`;
					const label = document.createElement('label');
					label.className = 'choice-option';
					const input = document.createElement('input');
					input.type = 'radio';
					input.name = name;
					input.className = 'sr-only lunch-choice-input';
					input.value = val;
					input.id = id;
					const card = document.createElement('div');
					card.className = 'choice-card';
					card.innerHTML = `<span class="choice-label">${escapeHtml(val)}</span>`;
					label.appendChild(input);
					label.appendChild(card);
					// click handler to set selection
					label.addEventListener('click', (e) => {
						try {
							// mark the input checked
							input.checked = true;
							window._lunchChoice = val;
							if (input.dataset) input.dataset._checked = '1';
							try { updateLunchFooterState(); } catch(_) {}
							// persist this meal choice immediately for the selected member
							try {
								const memberId = window._selectedMemberId || null;
								if (memberId) {
									const key = `shadow_ui_member_${String(memberId)}`;
									const existing = JSON.parse(sessionStorage.getItem(key) || '{}');
									existing.lunchKeuze = val || null;
									existing.lunchDeelname = 'Ja';
									try { setSessionAndDump(key, JSON.stringify(existing)); } catch (e) { console.warn('persist lunchKeuze failed', e); }
									try { document.dispatchEvent(new CustomEvent('lunch:completed', { detail: { memberId: memberId, participation: 'yes', keuze: val } })); } catch(_){}
								}
							} catch (e) { console.warn('persist choice click error', e); }
						} catch(_){ }
					});

					// ensure change events update footer state
					input.addEventListener('change', (e) => {
						try {
							if (input.checked) {
								window._lunchChoice = val;
								// persist selection
								try {
									const memberId = window._selectedMemberId || null;
									if (memberId) {
										const key = `shadow_ui_member_${String(memberId)}`;
										const existing = JSON.parse(sessionStorage.getItem(key) || '{}');
										existing.lunchKeuze = val || null;
										existing.lunchDeelname = 'Ja';
										try { setSessionAndDump(key, JSON.stringify(existing)); } catch (e) { console.warn('persist lunchKeuze failed', e); }
										try { document.dispatchEvent(new CustomEvent('lunch:completed', { detail: { memberId: memberId, participation: 'yes', keuze: val } })); } catch(_){}
									}
								} catch (e) { console.warn('persist choice change error', e); }
							} else {
								window._lunchChoice = window._lunchChoice || '';
							}
							updateLunchFooterState();
						} catch(_) {}
					});
					frag.appendChild(label);
				});
				buttonsWrap.appendChild(frag);
			}
		}

		// Attempt to pre-select stored choice from sessionStorage for transient member id
		try {
			const mid = (window && window._selectedMemberId) ? String(window._selectedMemberId) : null;
				if (mid) {
					const key = `shadow_ui_member_${String(mid)}`;
					const existing = JSON.parse(sessionStorage.getItem(key) || '{}');
				const deel = existing.lunchDeelname || existing.LunchDeelname || existing.lunch || existing.Lunch || null;
				const keuzeVal = existing.lunchKeuze || existing.LunchKeuze || existing.keuze || null;
				if (typeof deel === 'string' && deel.toLowerCase().startsWith('y')) {
					try { window._lunchChoice = keuzeVal || window._lunchChoice || ''; } catch(_){}
				}
				if (window._lunchChoice) {
					const radios = document.querySelectorAll('input.lunch-choice-input');
					radios.forEach(r => { if (r.value === String(window._lunchChoice)) { r.checked = true; r.dataset._checked = '1'; } });
				}
			}
		} catch (e) { /* ignore */ }

		// ensure footer state is correct after rendering
		try { updateLunchFooterState(); } catch(_) {}

	} catch (e) {
		console.warn('setupLunchOptions failed', e);
	}
}

// small helper to escape HTML for insertion
function escapeHtml(s) {
	return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Lunch footer state helpers
function getParticipationValue() {
	try {
		const name = `participation-${currentFragment || 'original'}`;
		const inp = document.querySelector(`input[type="radio"][name="${name}"]:checked`);
		return inp ? (inp.value || '') : '';
	} catch (_) { return ''; }
}

function hasKeuzeOptions() {
	try { return document.querySelectorAll('input.lunch-choice-input').length > 0; } catch (_) { return false; }
}

function hasSelectedKeuze() {
	try { return document.querySelectorAll('input.lunch-choice-input:checked').length > 0; } catch (_) { return false; }
}

function updateLunchFooterState() {
	try {
		const btn = document.getElementById('agree-lunch') || document.querySelector('.app-footer__button#agree-lunch') || document.querySelector('#agree-lunch');
		if (!btn) return;
		const participation = getParticipationValue();
		const keuzesExist = hasKeuzeOptions();
		const keuzeSelected = hasSelectedKeuze();
		let enable = false;
		// 1) if 'no' selected -> enable
		if (participation === 'no') enable = true;
		// 2) if no keuze options exist and 'yes' selected -> enable
		else if (!keuzesExist && participation === 'yes') enable = true;
		// 3) if keuzes exist and 'yes' selected and one keuze selected -> enable
		else if (keuzesExist && participation === 'yes' && keuzeSelected) enable = true;

		btn.disabled = !enable;
		if (btn.disabled) { btn.setAttribute('aria-disabled','true'); btn.classList && btn.classList.add('disabled'); }
		else { btn.removeAttribute('aria-disabled'); btn.classList && btn.classList.remove('disabled'); }
	} catch (e) { console.warn('updateLunchFooterState failed', e); }
}

// Toggle visual state when participation (yes/no) is changed
function setupParticipationToggle() {
	try {
		console.log('[participation] setupParticipationToggle running');
		// avoid double-binding
		if (document._participationBound) return;
		const root = document.querySelector('.main-content') || document.body;
		if (!root) return;

		function applyNoState() {
			try {
				const vast = document.getElementById('vastEtenSection');
				const keuze = document.getElementById('keuzeEtenSection');
				if (vast) vast.classList.add('muted-section');
				if (keuze) keuze.classList.add('muted-section');
				console.log('[participation] applyNoState: vast=', !!vast, 'keuze=', !!keuze);
				// mark footer button as danger
				const footBtn = document.querySelector('.app-footer__button');
				if (footBtn) {
					// preserve original label
					if (!footBtn.dataset._origLabel) footBtn.dataset._origLabel = footBtn.textContent || '';
					footBtn.classList.add('app-footer__button--danger');
					// Only change the visible label for the Lunch page (or when the button id matches)
					if (footBtn.id === 'agree-lunch' || currentFragment === 'lunch') {
						footBtn.textContent = 'Afwezigheid Bevestigen';
					}
					console.log('[participation] applyNoState: footBtn found, classes=', footBtn.className, 'id=', footBtn.id);
					// fallback: apply inline style to ensure visible change when CSS not applied
					try { footBtn.style.background = '#8C2B07'; footBtn.style.color = '#fff'; } catch(_) {}
				}
				// deselect any chosen lunch choice radios
				try {
					const radios = Array.from(document.querySelectorAll('input.lunch-choice-input'));
					radios.forEach(r => { r.checked = false; if (r.dataset) delete r.dataset._checked; });
					try { window._lunchChoice = ''; } catch(_) {}
				} catch(_) {}
			} catch (e) { console.warn('applyNoState failed', e); }
		}

		function applyYesState() {
			try {
				const vast = document.getElementById('vastEtenSection');
				const keuze = document.getElementById('keuzeEtenSection');
				if (vast) vast.classList.remove('muted-section');
				if (keuze) keuze.classList.remove('muted-section');
				const footBtn = document.querySelector('.app-footer__button');
				if (footBtn) {
					console.log('[participation] applyYesState: restoring footBtn classes before=', footBtn.className);
					footBtn.classList.remove('app-footer__button--danger');
					// restore original label if we stored one
					if (footBtn.dataset && footBtn.dataset._origLabel) {
						// only restore if this was modified for lunch
						if (footBtn.id === 'agree-lunch' || currentFragment === 'lunch') {
							footBtn.textContent = footBtn.dataset._origLabel;
						}
						try { delete footBtn.dataset._origLabel; } catch(_) {}
					} else {
						// fallback label only for lunch button
						if (footBtn.id === 'agree-lunch' || currentFragment === 'lunch') footBtn.textContent = 'Keuze Bevestigen';
					}
					// remove inline fallback styles if present
					try { footBtn.style.background = ''; footBtn.style.color = ''; } catch(_) {}
				}
			} catch (e) { console.warn('applyYesState failed', e); }
		}

				try { setupDownloadQRButton(); } catch(_){}
		function onChange(ev) {
			try {
				const val = (ev && ev.target && ev.target.value) ? String(ev.target.value) : '';
				console.log('[participation] change detected ->', val);
				if (!val) return;
				if (val === 'no') applyNoState();
				else applyYesState();
				try { updateLunchFooterState(); } catch(_) {}
				try { updateJaarhangerFooterState(); } catch(_) {}

				// Persist participation immediately for the selected member (write to sessionStorage)
				// Only persist lunch-specific fields when the active fragment is the lunch page
				try {
					if (currentFragment === 'lunch') {
						const participation = val === 'yes' ? 'Ja' : (val === 'no' ? 'Nee' : null);
						const memberId = window._selectedMemberId || null;
						if (memberId) {
							const keuze = (val === 'yes') ? (document.querySelector('input.lunch-choice-input:checked') ? document.querySelector('input.lunch-choice-input:checked').value : (window._lunchChoice || '')) : '';
							const key = `shadow_ui_member_${String(memberId)}`;
							const existing = JSON.parse(sessionStorage.getItem(key) || '{}');
							existing.lunchDeelname = participation;
							existing.lunchKeuze = keuze || null;
							try { setSessionAndDump(key, JSON.stringify(existing)); } catch(e){ console.warn('persist participation failed', e); }
							// dispatch event so other parts update immediately
							try { document.dispatchEvent(new CustomEvent('lunch:completed', { detail: { memberId: memberId, participation: (val === 'yes' ? 'yes' : 'no'), keuze } })); } catch(_){ }
						}
					}
				} catch (e) { console.warn('persist participation error', e); }

				// Also persist jaarhanger choice when on the jaarhanger fragment
				try {
					if (currentFragment === 'jaarhanger') {
						const memberId = window._selectedMemberId || null;
						if (memberId) {
							const key = `shadow_ui_member_${String(memberId)}`;
							const existing = JSON.parse(sessionStorage.getItem(key) || '{}');
							existing.Jaarhanger = (val === 'yes') ? 'Ja' : (val === 'no' ? 'Nee' : existing.Jaarhanger);
							try { setSessionAndDump(key, JSON.stringify(existing)); } catch (e) { console.warn('persist jaarhanger failed', e); }
							try { document.dispatchEvent(new CustomEvent('yearhanger:changed', { detail: { memberId: memberId, value: existing.Jaarhanger || null } })); } catch(_){}
						}
					}
				} catch (e) { console.warn('persist jaarhanger error', e); }
			} catch (err) { console.warn('onChange error', err); }
		}

		// Bind to any participation radios in the fragment (use fragment-scoped name)
		const partName = `participation-${currentFragment || 'original'}`;
		const radios = Array.from(root.querySelectorAll(`input[type="radio"][name="${partName}"]`));
		let boundCount = 0;
		radios.forEach(r => {
			try {
				if (r.dataset && r.dataset._partBound) return;
				r.addEventListener('change', onChange);
				if (r.dataset) r.dataset._partBound = '1';
				boundCount += 1;
			} catch (_) {}
		});

		// Also bind click on visible label/card containers to ensure clicks on the card trigger change
		try {
			const labels = Array.from(root.querySelectorAll('.choice-option'));
			console.log('[participation] found labels count=', labels.length);
			labels.forEach(lb => {
				try {
					if (lb.dataset && lb.dataset._labelBound) return;
					lb.addEventListener('click', (ev) => {
						try {
							// find any radio inside this label (avoid name mismatch from earlier binding timing)
							const inp = lb.querySelector('input[type="radio"]');
							if (inp) {
								inp.checked = true;
								onChange({ target: inp });
							}
						} catch (e) { console.warn('label click handler failed', e); }
					}, true);
					if (lb.dataset) lb.dataset._labelBound = '1';
				} catch (_) {}
			});
		} catch (_) {}

		// If no radios/labels were bound (fragment timing issues), add a delegated click handler as fallback
		try {
				if ((boundCount === 0) && !(root && root._participationDelegationBound)) {
				console.log('[participation] no direct binds — adding delegated click fallback on fragment root');
				try {
					root.addEventListener('click', function delegatedParticipationClick(ev) {
						try {
							const lb = ev.target && ev.target.closest ? ev.target.closest('.choice-option') : null;
							if (!lb) return;
							// find any radio input inside the label to avoid stale partName closures
							const inp = lb.querySelector('input[type="radio"]');
							if (!inp) return;
							inp.checked = true;
							onChange({ target: inp });
						} catch (e) { /* ignore per-click errors */ }
					}, true);
					root._participationDelegationBound = true;
				} catch (_) {}
			}
		} catch (_) {}

		// apply initial state based on currently checked value or SELECTED_MEMBER
		try {
			const checked = radios.find(r => r.checked);
			if (checked) {
				if (checked.value === 'no') applyNoState(); else applyYesState();
			} else {
				// attempt to read persisted choices from sessionStorage for transient member id
				try {
					const mid = (window && window._selectedMemberId) ? String(window._selectedMemberId) : null;
					if (mid) {
						const key = `shadow_ui_member_${String(mid)}`;
						const existing = JSON.parse(sessionStorage.getItem(key) || '{}');
						const deel = existing.lunchDeelname || existing.LunchDeelname || existing.lunch || null;
						if (typeof deel === 'string' && deel.toLowerCase().startsWith('n')) applyNoState();
					}
				} catch(_) {}
			}
		} catch (_) {}
		if (boundCount > 0) document._participationBound = true;
		// initialize footer/button states for relevant fragments
		try { updateLunchFooterState(); } catch(_) {}
		try { updateJaarhangerFooterState(); } catch(_) {}
	} catch (e) { console.warn('setupParticipationToggle failed', e); }
}

// Enable jaarhanger footer only when a participation radio is selected
function updateJaarhangerFooterState() {
	try {
		console.log('[participation] updateJaarhangerFooterState running, currentFragment=', currentFragment);
		const btn = document.getElementById('agree-jaarhanger');
		if (!btn) return;
		const name = `participation-${currentFragment || 'original'}`;
		const selected = document.querySelector(`input[type="radio"][name="${name}"]:checked`);
		const enabled = Boolean(selected);
		btn.disabled = !enabled;
		if (btn.disabled) { btn.setAttribute('aria-disabled','true'); btn.classList && btn.classList.add('disabled'); }
		else { btn.removeAttribute('aria-disabled'); btn.classList && btn.classList.remove('disabled'); }
	} catch (e) { console.warn('updateJaarhangerFooterState failed', e); }
}

// Bind and handle the Lunch confirm button — store selection locally and emit event (no Firestore)
function setupAgreeLunchButton() {
	try {
		const btn = document.getElementById('agree-lunch');
		if (!btn) return;
		if (btn.dataset && btn.dataset._boundAgreeLunch) return;
		btn.addEventListener('click', (ev) => {
			try {
				ev.preventDefault();
				// Safety: only proceed when the active fragment is the lunch page
				if (typeof currentFragment !== 'undefined' && currentFragment !== 'lunch') {
					console.debug('agree-lunch clicked but currentFragment=' + String(currentFragment) + ' — ignoring');
					return;
				}
				// determine member id
				const memberId = window._selectedMemberId || null;
				const participation = getParticipationValue();
				const keuze = (participation === 'yes') ? (document.querySelector('input.lunch-choice-input:checked') ? document.querySelector('input.lunch-choice-input:checked').value : (window._lunchChoice || '')) : '';
				// persist choices to sessionStorage keyed by memberId (no global selected-member)
				try {
					if (memberId) {
						const key = `shadow_ui_member_${String(memberId)}`;
						const existing = JSON.parse(sessionStorage.getItem(key) || '{}');
						existing.lunchDeelname = (participation === 'yes') ? 'Ja' : 'Nee';
						existing.lunchKeuze = keuze || null;
						setSessionAndDump(key, JSON.stringify(existing));
					}
				} catch (e) { console.warn('setupAgreeLunchButton: sessionStorage failed', e); }

				// dispatch a DOM event so other parts (member-info) can react
				try {
					const detail = { memberId: memberId || null, participation: participation || null, keuze: keuze || null };
					document.dispatchEvent(new CustomEvent('lunch:completed', { detail }));
					console.log('lunch:completed dispatched', detail);
				} catch (e) { console.warn('lunch dispatch failed', e); }

			} catch (err) { console.warn('agree-lunch handler failed', err); }
		});
		if (btn.dataset) btn.dataset._boundAgreeLunch = '1';
	} catch (e) { console.warn('setupAgreeLunchButton failed', e); }
}

// Bind and handle the Jaarhanger confirm button — store selection locally and emit event (no Firestore)
function setupAgreeJaarhanger() {
	try {
		const btn = document.getElementById('agree-jaarhanger');
		if (!btn) return;
		if (btn.dataset && btn.dataset._boundAgreeJaar) return;
		btn.addEventListener('click', (ev) => {
			try {
				ev.preventDefault();
				// Safety: only persist jaarhanger when the active fragment is the jaarhanger page
				if (typeof currentFragment !== 'undefined' && currentFragment !== 'jaarhanger') {
					console.debug('agree-jaarhanger clicked but currentFragment=' + String(currentFragment) + ' — ignoring');
					return;
				}
				const memberId = window._selectedMemberId || null;
				const name = `participation-${currentFragment || 'original'}`;
				const sel = document.querySelector(`input[type="radio"][name="${name}"]:checked`);
				const val = sel ? (sel.value || '') : '';
				const jaarVal = (val === 'yes') ? 'Ja' : (val === 'no' ? 'Nee' : null);
				try {
					if (memberId) {
						const key = `shadow_ui_member_${String(memberId)}`;
						const existing = JSON.parse(sessionStorage.getItem(key) || '{}');
						existing.Jaarhanger = jaarVal !== null ? jaarVal : existing.Jaarhanger;
						setSessionAndDump(key, JSON.stringify(existing));
						try {
							const detail = { memberId: memberId || null, value: existing.Jaarhanger || null };
							document.dispatchEvent(new CustomEvent('yearhanger:changed', { detail }));
							console.log('yearhanger:changed dispatched', detail);
						} catch (e) { console.warn('yearhanger dispatch failed', e); }
					} else {
						// dispatch without member id
						try {
							const detail = { memberId: null, value: jaarVal || null };
							document.dispatchEvent(new CustomEvent('yearhanger:changed', { detail }));
							console.log('yearhanger:changed dispatched', detail);
						} catch (e) { console.warn('yearhanger dispatch failed', e); }
					}
				} catch (e) { console.warn('setupAgreeJaarhanger: sessionStorage failed', e); }
			} catch (err) { console.warn('agree-jaarhanger handler failed', err); }
		});
		if (btn.dataset) btn.dataset._boundAgreeJaar = '1';
	} catch (e) { console.warn('setupAgreeJaarhanger failed', e); }
}

// Expose debug helpers to the window for interactive console debugging
try {
	try { window.__memberPopulateDebug = window.__memberPopulateDebug || {}; } catch(_) { window.__memberPopulateDebug = {}; }
	try { window.__memberPopulateDebug.populateMemberHeader = populateMemberHeader; } catch(_) {}
	try { window.__memberPopulateDebug.populateMemberBadges = populateMemberBadges; } catch(_) {}
	try { window.__memberPopulateDebug.populateMemberRidesSection = populateMemberRidesSection; } catch(_) {}
	try { window.__memberPopulateDebug.populateMemberLunchChoice = populateMemberLunchChoice; } catch(_) {}
	try { window.__memberPopulateDebug.populateMemberJaarhangerChoice = populateMemberJaarhangerChoice; } catch(_) {}
	try { window.populateMemberHeader = populateMemberHeader; } catch(_) {}
	try { window.populateMemberBadges = populateMemberBadges; } catch(_) {}
	try { window.populateMemberRidesSection = populateMemberRidesSection; } catch(_) {}
	try { window.populateMemberLunchChoice = populateMemberLunchChoice; } catch(_) {}
	try { window.populateMemberJaarhangerChoice = populateMemberJaarhangerChoice; } catch(_) {}
} catch(_) {}