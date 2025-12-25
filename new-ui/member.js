// Minimal member-side helpers for signupPage
import { getPlannedDates, getLunchOptions } from './firestore.js';
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
									// Try to fetch full member if helper exists
									const getById = window.getMemberById || (typeof getMemberById === 'function' ? getMemberById : null);
									if (getById && pickedId) {
										(async () => {
											try { const full = await getById(String(pickedId)); if (full) {
												try { if (typeof updatePageOrderForMember === 'function') updatePageOrderForMember(full); } catch(_) {}
												try { if (typeof renderMemberInfoQR === 'function') renderMemberInfoQR(full); } catch(_) {}
											} } catch(_) {}
										})();
									}
								} catch (e) { console.warn('suggestion click failed', e); }
							});
							listEl.appendChild(item);
						});
						document.body.appendChild(listEl);
					} catch (e) { console.warn('showSuggestions failed', e); }
				}
				function schedule(prefix) { if (timer) clearTimeout(timer); timer = setTimeout(() => { showSuggestions(prefix); }, 200); }
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
		const enable = Boolean(explicit) || (typed && typed.length > 0);
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
						}
					} catch (e) { console.warn('setupSignupFooterNavigation: getMemberById failed', e); }
				} else {
					// mark current member id for other widgets
					try { setSessionAndDump('shadow_ui_current_member', String(memberId)); } catch(_) {}
				}
				// Optionally navigate / render result (if helper present)
				try { if (typeof renderFragment === 'function') renderFragment('signup'); } catch(_) {}
			} catch (err) { console.warn('agree-signup handler failed', err); }
		});
		if (btn.dataset) btn.dataset._signupBound = '1';
	} catch (e) { console.warn('setupSignupFooterNavigation failed', e); }
}

// Simple footer delegation to ensure footer buttons are wired in static pages
function setupFooterDelegation() {
	try {
		// provide a lightweight binding for agree-signup enablement
		try { setupMemberSuggestions(); } catch(_) {}
		try { setupSignupFooterNavigation(); } catch(_) {}
		// ensure initial state
		try { updateSignupFooterState(); } catch(_) {}
		// expose helpers for console
		try { window.dumpSessionStorage = dumpSessionStorage; } catch(_) {}
		try { window.clearAllMemberSessionData = clearAllMemberSessionData; } catch(_) {}
	} catch (e) { console.warn('setupFooterDelegation failed', e); }
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

