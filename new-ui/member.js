// Minimal member-side helpers for signupPage
import { getPlannedDates, getLunchOptions, searchMembers, getMemberById } from './firestore.js';
// Keeps only what `lid-ui/signupPage.html` (and index) require: footer binding, simple suggestions glue,
// sessionStorage diagnostics and safe helpers. Other features removed.

// Dump sessionStorage for diagnostics
function dumpSessionStorage() {
	try {
		const keys = Object.keys(sessionStorage || {});
		if (!keys.length) { console.debug('dumpSessionStorage: empty'); return; }
		const snapshot = {};
		for (const k of keys) {
			try {
				const raw = sessionStorage.getItem(k);
				try { snapshot[k] = JSON.parse(raw); } catch (_) { snapshot[k] = raw; }
			} catch (e) { snapshot[k] = `__error__: ${String(e)}`; }
		}
		console.debug('dumpSessionStorage snapshot', snapshot);
	} catch (e) { console.warn('dumpSessionStorage failed', e); }
}

// Safe session setter that prints diagnostics
function setSessionAndDump(key, value) {
	try {
		sessionStorage.setItem(key, value);
		console.debug('setSessionAndDump: wrote', key);
	} catch (e) { console.warn('setSessionAndDump failed', e); }
	try { dumpSessionStorage(); } catch(_) {}
}

// Write a field into the member-specific shadow session object when possible,
// otherwise fall back to a top-level sessionStorage key with the same name.
function setMemberSessionField(field, val) {
	try {
		let memberId = '';
		try { memberId = window._selectedMemberId || ''; } catch(_) { memberId = ''; }
		if (!memberId) {
			try {
				for (const k of Object.keys(sessionStorage || {})) {
					if (String(k).indexOf('shadow_ui_member_') === 0) { memberId = String(k).slice('shadow_ui_member_'.length); break; }
				}
			} catch(_) { memberId = ''; }
		}
		if (memberId) {
			const key = `shadow_ui_member_${String(memberId)}`;
			try {
				const raw = sessionStorage.getItem(key);
				const obj = raw ? JSON.parse(raw) : {};
				if (val === null) delete obj[field]; else obj[field] = val;
				try { setSessionAndDump(key, JSON.stringify(obj)); } catch(e) { sessionStorage.setItem(key, JSON.stringify(obj)); }
				return true;
			} catch (e) { console.debug('setMemberSessionField failed', e); }
		}
	} catch(_) {}
	try {
		if (val === null) sessionStorage.removeItem(field); else sessionStorage.setItem(field, String(val));
	} catch(_) {}
	return false;
}

// Read a field from the member-specific shadow session object when possible,
// otherwise fallback to top-level sessionStorage key
function getMemberSessionField(field) {
	try {
		let memberId = '';
		try { memberId = window._selectedMemberId || ''; } catch(_) { memberId = ''; }
		if (!memberId) {
			try {
				for (const k of Object.keys(sessionStorage || {})) {
					if (String(k).indexOf('shadow_ui_member_') === 0) { memberId = String(k).slice('shadow_ui_member_'.length); break; }
				}
			} catch(_) { memberId = ''; }
		}
		if (memberId) {
			try {
				const key = `shadow_ui_member_${String(memberId)}`;
				const raw = sessionStorage.getItem(key);
				if (raw) {
					try {
						const obj = JSON.parse(raw);
						if (Object.prototype.hasOwnProperty.call(obj, field)) return obj[field];
					} catch(_) {}
				}
			} catch(_) {}
		}
	} catch(_) {}
	try {
		const val = sessionStorage.getItem(field);
		return val;
	} catch(_) { return null; }
}

// Enable/disable the lunch footer button according to rules:
// 1) enabled if lunchDeelname == 'nee'
// 2) if lunch has keuzeEten: enabled when lunchDeelname == 'ja' AND lunchKeuze matches a valid keuze
// 3) if no keuzeEten configured: enabled when lunchDeelname == 'ja'
function updateLunchFooterState() {
	try {
		const btn = document.getElementById('agree-lunch');
		if (!btn) return;
		// default disabled
		let enabled = false;

		// read global lunch config to know if keuzeEten exists
		let lunchRaw = null;
		try { lunchRaw = sessionStorage.getItem('lunch'); } catch(_) { lunchRaw = null; }
		let lunchCfg = null;
		try { lunchCfg = lunchRaw ? JSON.parse(lunchRaw) : null; } catch(_) { lunchCfg = null; }
		const keuzeList = Array.isArray(lunchCfg?.keuzeEten) ? lunchCfg.keuzeEten.map(String) : [];

		// read stored values (member-scoped preferred)
		let deel = null;
		try { deel = getMemberSessionField('lunchDeelname'); } catch(_) { deel = null; }
		if (typeof deel === 'string') deel = deel.toLowerCase();

		// If deel is 'nee', enable
		if (deel === 'nee') enabled = true;
		else if (deel === 'ja') {
			if (Array.isArray(keuzeList) && keuzeList.length > 0) {
				// need lunchKeuze to be a non-empty value that matches lijst
				let keuze = null;
				try { keuze = getMemberSessionField('lunchKeuze'); } catch(_) { keuze = null; }
				if (keuze && keuzeList.indexOf(String(keuze)) !== -1) enabled = true;
			} else {
				// no keuze options: yes alone is enough
				enabled = true;
			}
		}

		btn.disabled = !enabled;
		if (btn.disabled) { btn.setAttribute('aria-disabled','true'); btn.classList && btn.classList.add('disabled'); }
		else { btn.removeAttribute('aria-disabled'); btn.classList && btn.classList.remove('disabled'); }
	} catch (e) { console.warn('updateLunchFooterState failed', e); }
}

// Remove all per-member shadow keys
function clearAllMemberSessionData() {
	try {
		const keys = Object.keys(sessionStorage || {});
		for (const k of keys) {
			try {
				if (String(k).indexOf('shadow_ui_member_') === 0) sessionStorage.removeItem(k);
			} catch(_) {}
		}
		try { sessionStorage.removeItem('shadow_ui_current_member'); } catch(_) {}
		console.debug('clearAllMemberSessionData: cleared member keys');
	} catch (e) { console.warn('clearAllMemberSessionData failed', e); }
}

// Minimal suggestions wiring: expects a global `searchMembers(prefix,max)` function (optional).
function setupMemberSuggestions() {
	try {
		const inputs = Array.from(document.querySelectorAll('input.form-input'));
		for (const el of inputs) {
			try {
				if (!el || (el.dataset && el.dataset._suggestBound)) continue;
				let timer = null;
				let listEl = null;
				function closeList() { if (listEl && listEl.parentNode) listEl.parentNode.removeChild(listEl); listEl = null; }
				async function showSuggestions(prefix) {
					try {
						const q = String(prefix || '').trim();
						if (!q) { closeList(); return; }
						// Prefer window.searchMembers if present, otherwise do nothing
						const searchFn = window.searchMembers || (typeof searchMembers === 'function' ? searchMembers : null);
						if (!searchFn) return;
						const results = await searchFn(q, 8);
						if (!Array.isArray(results) || results.length === 0) { closeList(); return; }
						closeList();
						listEl = document.createElement('div');
						listEl.className = 'member-suggestions';
						listEl.style.position = 'absolute';
						listEl.style.zIndex = 9999;
						listEl.style.background = '#fff';
						listEl.style.border = '1px solid rgba(0,0,0,0.08)';
						listEl.style.borderRadius = '8px';
						listEl.style.overflow = 'hidden';
						listEl.style.minWidth = (el.offsetWidth || 200) + 'px';
						listEl.setAttribute('role','listbox');
						const rect = el.getBoundingClientRect();
						listEl.style.top = (rect.bottom + window.scrollY + 6) + 'px';
						listEl.style.left = (rect.left + window.scrollX) + 'px';
						results.forEach((r) => {
							const item = document.createElement('div');
							item.className = 'member-suggestion-item';
							item.style.padding = '8px 12px';
							item.style.cursor = 'pointer';
							const nameDisplay = `${(r.voor||'').trim()} ${(r.naam||'').trim()}`.trim();
							item.textContent = nameDisplay || (r.naam || r.voor || r.id || '');
							item.dataset.memberId = r.id || '';
							item.addEventListener('click', (ev) => {
								try {
									ev.preventDefault();
									el.value = item.textContent;
									const pickedId = item.dataset.memberId || '';
									try { clearAllMemberSessionData(); } catch(_) {}
									try { if (el.dataset) el.dataset.selectedMember = pickedId; } catch(_) {}
									try { window._selectedMemberId = pickedId || ''; } catch(_) {}
									closeList();
									try { updateSignupFooterState(); } catch(_) {}
									// Do not fetch full member here; fetching happens when the footer button is pressed
								} catch (e) { console.warn('suggestion click failed', e); }
							});
							listEl.appendChild(item);
						});
						document.body.appendChild(listEl);
					} catch (e) { console.warn('showSuggestions failed', e); }
				}
				function schedule(prefix) { if (timer) clearTimeout(timer); timer = setTimeout(() => { showSuggestions(prefix); }, 300); }
				el.addEventListener('input', (ev) => {
					try {
						if (el.dataset) { delete el.dataset.selectedMember; }
						try { window._selectedMemberId = ''; } catch(_) {}
						schedule(el.value || '');
						try { updateSignupFooterState(); } catch(_) {}
					} catch(_) {}
				});
				if (el.dataset) el.dataset._suggestBound = '1';
			} catch (_) {}
		}
	} catch (e) { console.warn('setupMemberSuggestions failed', e); }
}

// Update signup footer: enable only when an explicit selection exists or input resolves
function updateSignupFooterState() {
	try {
		const btn = document.getElementById('agree-signup');
		if (!btn) return;
		const input = document.querySelector('input.form-input');
		const explicit = (input && input.dataset && input.dataset.selectedMember) ? String(input.dataset.selectedMember) : (window._selectedMemberId || '');
		const typed = input ? (input.value || '').trim() : '';
		// Only enable the signup button when an explicit dropdown selection exists
		const enable = Boolean(explicit);
		btn.disabled = !enable;
		if (btn.disabled) { btn.setAttribute('aria-disabled','true'); btn.classList && btn.classList.add('disabled'); }
		else { btn.removeAttribute('aria-disabled'); btn.classList && btn.classList.remove('disabled'); }
	} catch (e) { console.warn('updateSignupFooterState failed', e); }
}

// Bind signup footer button — fetch full member on confirm (if helper exists) and store to session
function setupSignupFooterNavigation() {
	try {
		const btn = document.getElementById('agree-signup');
		if (!btn) return;
		if (btn.dataset && btn.dataset._signupBound) return;
		btn.addEventListener('click', async (e) => {
			try {
				e.preventDefault();
				const container = document.querySelector('.main-content') || document.body;
				const input = container.querySelector('input.form-input');
				let memberId = '';
				try { memberId = window._selectedMemberId || (input && input.dataset ? (input.dataset.selectedMember || '') : ''); } catch(_) { memberId = (input && input.dataset ? (input.dataset.selectedMember || '') : ''); }
				const typed = input ? (input.value || '').trim() : '';
				if (!memberId && typed) {
					const searchFn = window.searchMembers || (typeof searchMembers === 'function' ? searchMembers : null);
					if (searchFn) {
						const matches = await searchFn(typed, 8);
						if (Array.isArray(matches) && matches.length > 0) {
							const norm = typed.toLowerCase().replace(/\s+/g,' ').trim();
							const found = matches.find(m => `${(m.voor||'').trim()} ${(m.naam||'').trim()}`.toLowerCase().replace(/\s+/g,' ').trim() === norm);
							if (found) memberId = found.id;
							else if (matches.length === 1) memberId = matches[0].id;
						}
					}
				}
				if (!memberId) {
					// nothing to do
					console.warn('agree-signup: no member selected or resolved');
					return;
				}
				// If a getMemberById helper exists, fetch full member and persist under shadow key
				const getById = window.getMemberById || (typeof getMemberById === 'function' ? getMemberById : null);
				if (getById) {
					try {
						const full = await getById(String(memberId));
						if (full) {
							try { setSessionAndDump(`shadow_ui_member_${String(memberId)}`, JSON.stringify(full)); } catch(_) {}
							try {
								const scanDates = Array.isArray(full.ScanDatums) ? full.ScanDatums : (Array.isArray(full.scandatums) ? full.scandatums : []);
								const scansY = (Array.isArray(scanDates) ? scanDates.map(toYMDString).filter(Boolean) : []);
								const today = todayYMD();
								if (scansY.includes(today)) {
									try { window.location.href = '../lid-ui/memberInfoPage.html'; return; } catch(_) {}
								} else {
									// mark that we navigated to lunch so signup can clear when returning
									try { sessionStorage.setItem('clearSignupOnShow','1'); } catch(_) {}
									try { window.location.href = '../lid-ui/lunchPage.html'; return; } catch(_) {}
								}
							} catch(_) {}
						}
					} catch (e) { console.warn('setupSignupFooterNavigation: getMemberById failed', e); }
				} else {
					// mark current member id for other widgets
					// do not set shadow_ui_current_member here; not required
				}
				// Optionally navigate / render result (if helper present)
				try { if (typeof renderFragment === 'function') renderFragment('signup'); } catch(_) {}
			} catch (err) { console.warn('agree-signup handler failed', err); }
		});
		if (btn.dataset) btn.dataset._signupBound = '1';
	} catch (e) { console.warn('setupSignupFooterNavigation failed', e); }
}

// Bind index footer button to navigate to the signup page
function setupIndexFooterNavigation() {
	try {
		const btn = document.getElementById('agree-index');
		if (!btn) return;
		if (btn.dataset && btn.dataset._indexBound) return;
		btn.addEventListener('click', (e) => {
			try {
				// navigate to the signup page (sibling folder `lid-ui`)
				e.preventDefault();
				window.location.href = '../lid-ui/signupPage.html';
			} catch (err) { console.warn('agree-index handler failed', err); }
		});
		if (btn.dataset) btn.dataset._indexBound = '1';
	} catch (e) { console.warn('setupIndexFooterNavigation failed', e); }
}

// Simple footer delegation to ensure footer buttons are wired in static pages
function setupFooterDelegation() {
	try {
		// provide a lightweight binding for agree-signup enablement
		try { setupMemberSuggestions(); } catch(_) {}
		try { setupSignupFooterNavigation(); } catch(_) {}
	try { setupIndexFooterNavigation(); } catch(_) {}
	try { setupHeaderBackButtons(); } catch(_) {}
	try { setupSignupInputClear(); } catch(_) {}
		// ensure initial state
		try { updateSignupFooterState(); } catch(_) {}
		// expose helpers for console
		try { window.dumpSessionStorage = dumpSessionStorage; } catch(_) {}
		try { window.clearAllMemberSessionData = clearAllMemberSessionData; } catch(_) {}
	} catch (e) { console.warn('setupFooterDelegation failed', e); }
}

// When the signup input is focused/clicked, clear its contents and any selected-member metadata
function setupSignupInputClear() {
	try {
		const inputs = Array.from(document.querySelectorAll('input.form-input'));
		if (!inputs || inputs.length === 0) return;

		function doClear(input) {
			try {
				input.value = '';
				if (input.dataset) { delete input.dataset.selectedMember; }
				try { window._selectedMemberId = ''; } catch(_) {}
				try { updateSignupFooterState(); } catch(_) {}
			} catch(_) {}
		}

		// Clear on focus/click as before
		for (const input of inputs) {
			try {
				if (input.dataset && input.dataset._clearBound) continue;
				const clearFn = (ev) => { try { doClear(input); } catch(_) {} };
				input.addEventListener('focus', clearFn);
				input.addEventListener('click', clearFn);
				if (input.dataset) input.dataset._clearBound = '1';
			} catch(_) {}
		}

		// Also clear on initial load/pageshow when returning from lunch
		function clearIfFromLunch() {
			try {
				const flag = (function(){ try { return sessionStorage.getItem('clearSignupOnShow'); } catch(_) { return null; } })();
				const ref = (typeof document !== 'undefined' && document.referrer) ? String(document.referrer) : '';
				const fromLunchRef = ref.indexOf('lunchPage.html') !== -1 || ref.indexOf('lunchpage.html') !== -1;
				if (flag === '1' || fromLunchRef) {
					for (const input of inputs) { try { doClear(input); } catch(_) {} }
					try { sessionStorage.removeItem('clearSignupOnShow'); } catch(_) {}
				}
			} catch(_) {}
		}

		// run on DOMContentLoaded/pageshow
		try { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', clearIfFromLunch); else clearIfFromLunch(); } catch(_) {}
		try { window.addEventListener && window.addEventListener('pageshow', clearIfFromLunch); } catch(_) {}
	} catch (e) { console.warn('setupSignupInputClear failed', e); }
}

// Wire header back buttons to sensible navigation behavior.
function setupHeaderBackButtons() {
	try {
		const buttons = Array.from(document.querySelectorAll('.back-button'));
		if (!buttons || buttons.length === 0) return;
		for (const btn of buttons) {
			try {
				if (btn.dataset && btn.dataset._backBound) continue;
				btn.addEventListener('click', (ev) => {
					try {
						ev.preventDefault();
						const filename = (window.location.pathname || '').split('/').pop() || '';
						const name = String(filename).toLowerCase();
						// memberInfo page: always go to index.html
						if (name.indexOf('memberinfopage.html') !== -1) {
							try { window.location.href = '../index.html'; } catch(_) { window.location.href = '/index.html'; }
							return;
						}
						// Prefer to go back in history when possible, otherwise fall back to index
						try {
							if (window.history && window.history.length > 1) {
								window.history.back();
								return;
							}
						} catch(_) {}
						try { window.location.href = '../index.html'; } catch(_) { window.location.href = '/index.html'; }
					} catch(_) {}
				});
				if (btn.dataset) btn.dataset._backBound = '1';
			} catch(_) {}
		}
	} catch (e) { console.warn('setupHeaderBackButtons failed', e); }
}

// Run on import
try { setupFooterDelegation(); } catch(_) {}

// No exports — module is side-effecting for signup page

// End of minimal member helpers

// Ensure ride and lunch data are present in sessionStorage so pages past loading continue.
(function ensureShadowData() {
	try {
		async function init() {
			try {
				const [plannedDates, lunchOptions] = await Promise.all([getPlannedDates().catch(()=>[]), getLunchOptions().catch(()=>({ vastEten: [], keuzeEten: [] }))]);
				try { setSessionAndDump('rideConfig', JSON.stringify({ plannedDates: Array.isArray(plannedDates) ? plannedDates : [] })); } catch(_) {}
				try { setSessionAndDump('lunch', JSON.stringify(lunchOptions || { vastEten: [], keuzeEten: [] })); } catch(_) {}
				// Hide any loading indicator if present
				try { const li = document.getElementById('loadingIndicator'); if (li) li.style.display = 'none'; } catch(_) {}
				// Dispatch a small event for other code that might wait for this
				try { document.dispatchEvent(new CustomEvent('shadow:config-ready', { detail: { plannedDates, lunchOptions } })); } catch(_) {}
			} catch (e) { console.warn('ensureShadowData.init failed', e); }
		}
		if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
	} catch (e) { console.warn('ensureShadowData failed', e); }
})();

// Render planned rides section from sessionStorage 'rideConfig'
function formatDateLocal(iso) {
	try {
		const d = new Date(iso);
		if (isNaN(d)) return iso;
		// Dutch localized, capitalize first letter of month name
		const s = d.toLocaleDateString('nl-NL', { year: 'numeric', month: 'long', day: 'numeric' });
		return s.charAt(0).toUpperCase() + s.slice(1);
	} catch(_) { return iso; }
}

function daysUntil(iso) {
	try {
		const today = new Date();
		const target = new Date(iso);
		// normalize to local midnight
		const t0 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
		const t1 = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
		return Math.round((t1 - t0) / (1000 * 60 * 60 * 24));
	} catch(_) { return null; }
}

function toYMDString(val) {
	try {
		if (!val) return '';
		if (typeof val === 'string') {
			const s = val.trim();
			const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
			if (m) return m[1];
			const d = new Date(s);
			if (!isNaN(d)) return d.toISOString().slice(0,10);
			return '';
		}
		if (val instanceof Date) {
			if (isNaN(val)) return '';
			return val.toISOString().slice(0,10);
		}
		return '';
	} catch(_) { return ''; }
}

function todayYMD() { try { return new Date().toISOString().slice(0,10); } catch(_) { return ''; } }

function renderPlannedRides() {
	try {
		const container = document.querySelector('.planned-rides');
		if (!container) return;
		// Clear
		container.innerHTML = '';
		let cfgRaw = null;
		try { cfgRaw = sessionStorage.getItem('rideConfig'); } catch(_) { cfgRaw = null; }
		if (!cfgRaw) return;
		let cfg = null;
		try { cfg = JSON.parse(cfgRaw); } catch(_) { cfg = null; }
		const dates = (cfg && Array.isArray(cfg.plannedDates)) ? cfg.plannedDates.filter(Boolean) : [];
		// Show only today and future rides
		const upcoming = dates.filter(d => {
			try { return daysUntil(d) >= 0; } catch(_) { return false; }
		});
		const regions = (cfg && cfg.regions) ? cfg.regions : {};
		// If no upcoming rides, show friendly season-over message
		if (!Array.isArray(upcoming) || upcoming.length === 0) {
			const msgWrap = document.createElement('div');
			msgWrap.className = 'card-wrapper';
			const card = document.createElement('div');
			card.className = 'card';
			// center content inside the card
			card.style.justifyContent = 'center';
			const txt = document.createElement('div');
			txt.style.display = 'flex';
			txt.style.flexDirection = 'column';
			txt.style.alignItems = 'center';
			txt.style.textAlign = 'center';
			const heading = document.createElement('div');
			heading.className = 'ride-date';
			heading.textContent = 'Het seizoen is voorbij';
			const sub = document.createElement('div');
			sub.style.marginTop = '6px';
			sub.style.color = '#6b7280';
			sub.textContent = 'Tot volgend jaar.';
			txt.appendChild(heading);
			txt.appendChild(sub);
			card.appendChild(txt);
			msgWrap.appendChild(card);
			container.appendChild(msgWrap);
			return;
		}
		// Sort ascending
		upcoming.sort((a,b) => (a < b ? -1 : a > b ? 1 : 0));
		for (const iso of upcoming) {
			try {
				const regionText = regions && (regions[iso] || regions[String(iso)]) ? (regions[iso] || regions[String(iso)]) : '';

				const wrapper = document.createElement('div');
				wrapper.className = 'card-wrapper';
				const card = document.createElement('div');
				card.className = 'card';

				const left = document.createElement('div');
				left.style.display = 'flex';
				left.style.flexDirection = 'column';
				left.style.alignItems = 'flex-start';

				const dateEl = document.createElement('div');
				dateEl.className = 'ride-date';
				dateEl.textContent = formatDateLocal(iso);
				left.appendChild(dateEl);

				if (regionText) {
					const regionEl = document.createElement('div');
					regionEl.style.fontSize = '0.85rem';
					regionEl.style.color = '#6b7280';
					regionEl.style.marginTop = '6px';
					regionEl.textContent = regionText;
					left.appendChild(regionEl);
				}

				const right = document.createElement('div');
				right.style.display = 'flex';
				right.style.alignItems = 'center';

				const badge = document.createElement('span');
				badge.className = 'badge';
				const delta = daysUntil(iso);
				if (delta === 0) { badge.textContent = 'Vandaag'; badge.classList.add('badge-today'); }
				else if (delta > 0) { badge.textContent = `${delta} dagen`; badge.classList.add('badge-count'); }
				else { badge.textContent = `${Math.abs(delta)} dagen geleden`; badge.classList.add('badge-past'); }
				right.appendChild(badge);

				card.appendChild(left);
				card.appendChild(right);
				wrapper.appendChild(card);
				container.appendChild(wrapper);
			} catch(_) { continue; }
		}
	} catch (e) { console.warn('renderPlannedRides failed', e); }
}

// Update render on load and when config ready
try {
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderPlannedRides);
	else renderPlannedRides();
	document.addEventListener('shadow:config-ready', renderPlannedRides);
} catch(_) {}

// Render lunch preview area (vastEten / keuzeEten) from sessionStorage 'lunch'
function renderLunchPreview() {
	try {
		const vastEl = document.getElementById('vastEtenDisplay');
		const keuzeWrap = document.getElementById('keuzeEtenButtons');
		const keuzeSection = document.getElementById('keuzeEtenSection');
		if (!vastEl && !keuzeWrap) return;
		let raw = null;
		try { raw = sessionStorage.getItem('lunch'); } catch(_) { raw = null; }
		if (!raw) {
			if (vastEl) vastEl.textContent = 'Laden...';
			if (keuzeWrap) keuzeWrap.innerHTML = '';
			if (keuzeSection) { keuzeSection.style.display = 'none'; keuzeSection.hidden = true; }
			return;
		}
		let data = null;
		try { data = JSON.parse(raw); } catch(_) { data = null; }
		const vast = data && Array.isArray(data.vastEten) ? data.vastEten : [];
		const keuze = data && Array.isArray(data.keuzeEten) ? data.keuzeEten : [];
		if (vastEl) {
			if (vast && vast.length > 0) {
				// build styled list using existing CSS (.vast-list, .vast-item)
				const list = document.createElement('div');
				list.className = 'vast-list';
				for (const v of vast) {
					const row = document.createElement('div');
					row.className = 'vast-item';
					row.textContent = String(v || '');
					list.appendChild(row);
				}
				vastEl.innerHTML = '';
				vastEl.appendChild(list);
			} else {
				vastEl.textContent = 'Geen vast eten beschikbaar';
			}
		}
		if (keuzeWrap) {
			keuzeWrap.innerHTML = '';
			if (keuze && keuze.length > 0) {
					for (const k of keuze) {
						try {
							// Build markup matching the user's snippet:
							// <label class="...">
							//   <input type="radio" class="choice-card-input sr-only" name="keuzeEten" value="..." />
							//   <div class="choice-card"> ... </div>
							// </label>
							const labelEl = document.createElement('label');
							labelEl.className = 'choice-card-label';

							const input = document.createElement('input');
							input.type = 'radio';
							input.name = 'keuzeEten';
							input.value = String(k || '');
							// preserve accessible hiding via existing .sr-only class
							input.className = 'choice-card-input sr-only';

							// when a keuze is selected, persist it to the member session under `lunchKeuze`
							input.addEventListener('change', (ev) => {
								try {
									if (input.checked) {
										setMemberSessionField('lunchKeuze', input.value);
										try { updateLunchFooterState(); } catch(_) {}
									}
								} catch(_) {}
							});

							const card = document.createElement('div');
							card.className = 'choice-card';

							const content = document.createElement('div');
							content.className = 'choice-card-content';

							const title = document.createElement('p');
							title.className = 'choice-title';
							title.textContent = String(k || '');

							content.appendChild(title);
							card.appendChild(content);

							const check = document.createElement('div');
							check.className = 'check-circle';
							const icon = document.createElement('span');
							icon.className = 'material-symbols-outlined always-white-icon';
							icon.textContent = 'check';
							check.appendChild(icon);

							card.appendChild(check);

							// Assemble
							labelEl.appendChild(input);
							labelEl.appendChild(card);
							keuzeWrap.appendChild(labelEl);
						} catch(_) { continue; }
				}
				if (keuzeSection) { keuzeSection.style.display = ''; keuzeSection.hidden = false; }
			} else {
				if (keuzeSection) { keuzeSection.style.display = 'none'; keuzeSection.hidden = true; }
			}
		}
	} catch (e) { console.warn('renderLunchPreview failed', e); }
	// ensure footer state updates after initial render and when config becomes available
	try { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', updateLunchFooterState); else updateLunchFooterState(); document.addEventListener('shadow:config-ready', updateLunchFooterState); } catch(_) {}
}

try {
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderLunchPreview);
	else renderLunchPreview();
	document.addEventListener('shadow:config-ready', renderLunchPreview);
} catch(_) {}

// Handle participation (Ja / Nee) behavior on the lunch page
function setupLunchParticipationHandlers() {
	try {
		function setMemberSessionLunch(val) {
			try { setMemberSessionField('lunchDeelname', val); } catch(_) { try { sessionStorage.setItem('lunchDeelname', val); } catch(_) {} }
		}

		function applyNoState() {
			try {
				// footer button
				const btn = document.getElementById('agree-lunch');
				if (btn) {
					btn.classList.add('app-footer__button--danger');
					btn.textContent = 'Afwezigheid Bevestigen';
				}
				// unselect keuzeEten radios
				try {
					const kInputs = Array.from(document.querySelectorAll('input[name="keuzeEten"]'));
					for (const i of kInputs) { try { i.checked = false; } catch(_) {} }
				} catch(_) {}

				// ensure the participation radios reflect the 'nee' choice
				try {
					const p = Array.from(document.querySelectorAll('input[name="participation-lunch"]'));
					for (const rr of p) {
						try {
							const vv = (rr.value || '').toString().toLowerCase();
							rr.checked = (vv === 'no' || vv.indexOf('nee') !== -1 || vv.indexOf('sla') !== -1);
						} catch(_) {}
					}
				} catch(_) {}
				// clear member's gekozen lunch keuze
				try { setMemberSessionField('lunchKeuze', null); } catch(_) {}
				// fade sections
				try { const v = document.getElementById('vastEtenSection'); if (v) v.classList.add('muted-section'); } catch(_) {}
				try { const k = document.getElementById('keuzeEtenSection'); if (k) k.classList.add('muted-section'); } catch(_) {}

				// disable keuzeEten inputs so they are not clickable when absent
				try {
					const kInputs = Array.from(document.querySelectorAll('input[name="keuzeEten"]'));
					for (const i of kInputs) {
						try {
							i.disabled = true;
							const lbl = i.closest('label');
							if (lbl && lbl.classList) lbl.classList.add('choice-disabled');
						} catch(_) {}
					}
				} catch(_) {}
				// sessionStorage flag
				try { setMemberSessionLunch('nee'); } catch(_) {}
			} catch(_) {}
		}

		function applyYesState() {
			try {
				const btn = document.getElementById('agree-lunch');
				if (btn) {
					btn.classList.remove('app-footer__button--danger');
					btn.textContent = 'Keuze Bevestigen';
				}
				try { const v = document.getElementById('vastEtenSection'); if (v) v.classList.remove('muted-section'); } catch(_) {}

				// ensure the participation radios reflect the 'ja' choice
				try {
					const p = Array.from(document.querySelectorAll('input[name="participation-lunch"]'));
					for (const rr of p) {
						try {
							const vv = (rr.value || '').toString().toLowerCase();
							rr.checked = (vv === 'yes' || vv.indexOf('ja') !== -1);
						} catch(_) {}
					}
				} catch(_) {}
				try { const k = document.getElementById('keuzeEtenSection'); if (k) k.classList.remove('muted-section'); } catch(_) {}

				// enable keuzeEten inputs when participating
				try {
					const kInputs = Array.from(document.querySelectorAll('input[name="keuzeEten"]'));
					for (const i of kInputs) {
						try {
							i.disabled = false;
							const lbl = i.closest('label');
							if (lbl && lbl.classList) lbl.classList.remove('choice-disabled');
						} catch(_) {}
					}
				} catch(_) {}
				try { setMemberSessionLunch('ja'); } catch(_) {}
			} catch(_) {}
		}

		const radios = Array.from(document.querySelectorAll('input[name="participation-lunch"]'));
		if (!radios || radios.length === 0) return;
		for (const r of radios) {
			try {
				r.addEventListener('change', (ev) => {
					try {
						const val = (r.value || '').toString().toLowerCase();
						if (val === 'no' || val.includes('nee') || val.includes('sla')) {
							applyNoState();
						} else {
							applyYesState();
						}
							try { updateLunchFooterState(); } catch(_) {}
					} catch(_) {}
				});
			} catch(_) {}
		}

		// initialize state from sessionStorage if present
		try {
			let saved = null;
			try { saved = getMemberSessionField('lunchDeelname'); } catch(_) { saved = null; }
			if (!saved) {
				try { saved = sessionStorage.getItem('lunchDeelname'); } catch(_) { saved = null; }
			}
			saved = (saved || '').toString().toLowerCase();
			if (saved === 'nee') {
				applyNoState();
			} else if (saved === 'ja') {
				applyYesState();
			}

			// if there is a saved lunchKeuze, select the corresponding radio
			try {
				let savedKeuze = getMemberSessionField('lunchKeuze');
				if (!savedKeuze) savedKeuze = sessionStorage.getItem('lunchKeuze');
				if (savedKeuze) {
					const sel = document.querySelectorAll(`input[name="keuzeEten"][value="${String(savedKeuze).replace(/"/g,'\"')}"]`);
					if (sel && sel.length) {
						try { sel[0].checked = true; } catch(_) {}
					}
				}
			} catch(_) {}
		} catch(_) {}
	} catch (e) { console.warn('setupLunchParticipationHandlers failed', e); }
}

try { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupLunchParticipationHandlers); else setupLunchParticipationHandlers(); document.addEventListener('shadow:config-ready', setupLunchParticipationHandlers); } catch(_) {}

// Setup jaarhanger page auto-fill from sessionStorage
function setupJaarhangerHandlers() {
	try {
		const radios = Array.from(document.querySelectorAll('input[name="participation-jaarhanger"]'));
		if (!radios || radios.length === 0) return;

		function applySelection(val) {
			try {
				const v = (val || '').toString().toLowerCase();
				for (const r of radios) {
					try { r.checked = (r.value || '').toString().toLowerCase() === (v === 'yes' || v === 'ja' ? 'yes' : (v === 'no' || v === 'nee' ? 'no' : r.value)); } catch(_) {}
				}
				// enable footer when a selection exists
				try { const btn = document.getElementById('agree-jaarhanger'); if (btn) { const any = radios.some(rr => rr.checked); btn.disabled = !any; if (btn.disabled) { btn.classList && btn.classList.add('disabled'); btn.setAttribute('aria-disabled','true'); } else { btn.classList && btn.classList.remove('disabled'); btn.removeAttribute('aria-disabled'); } } } catch(_) {}
			} catch(_) {}
		}

		// try to read member session fields for jaarhanger choice
		let val = null;
		try { val = getMemberSessionField('jaarhanger'); } catch(_) { val = null; }
		if (!val) {
			// try other common keys
			try { val = getMemberSessionField('Jaarhanger'); } catch(_) { val = null; }
		}
		if (!val) {
			try { val = sessionStorage.getItem('jaarhanger'); } catch(_) { val = null; }
		}
		if (val) applySelection(val);

		// wire change to update footer state
		for (const r of radios) {
			try { r.addEventListener('change', () => { try { const btn = document.getElementById('agree-jaarhanger'); if (btn) { const any = radios.some(rr => rr.checked); btn.disabled = !any; if (btn.disabled) { btn.classList && btn.classList.add('disabled'); btn.setAttribute('aria-disabled','true'); } else { btn.classList && btn.classList.remove('disabled'); btn.removeAttribute('aria-disabled'); } } } catch(_) {} }); } catch(_) {}
		}
	} catch (e) { console.warn('setupJaarhangerHandlers failed', e); }
}

try { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupJaarhangerHandlers); else setupJaarhangerHandlers(); document.addEventListener('shadow:config-ready', setupJaarhangerHandlers); } catch(_) {}

