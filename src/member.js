// Minimal member-side helpers for signupPage
import { getPlannedDates, getLunchOptions, getRideConfig, searchMembers, listAllMembers, getMemberById } from './firebase.js';
import { db, doc, onSnapshot, getDoc } from './firebase.js';
// Keeps only what `lid-ui/signupPage.html` (and index) require: footer binding, simple suggestions glue,
// sessionStorage diagnostics and safe helpers. Other features removed.

// Dump sessionStorage for diagnostics
function dumpSessionStorage() {
	try {
		const keys = Object.keys(sessionStorage || {});
		if (!keys.length) { return; }
		const snapshot = {};
		for (const k of keys) {
			try {
				const raw = sessionStorage.getItem(k);
				try { snapshot[k] = JSON.parse(raw); } catch (_) { snapshot[k] = raw; }
			} catch (e) { snapshot[k] = `__error__: ${String(e)}`; }
		}
		/* debug removed */
	} catch (e) { console.warn('dumpSessionStorage failed', e); }
}

// Safe session setter that prints diagnostics
function setSessionAndDump(key, value) {
	try {
		sessionStorage.setItem(key, value);
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
				} catch (e) { /* debug removed */ }
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

		// Prefer current DOM state: see if participation radio is selected
		let deel = null;
		try {
			const sel = document.querySelector('input[name="participation-lunch"]:checked');
			if (sel) {
				const v = (sel.value || '').toString().toLowerCase();
				if (v === 'no' || v.indexOf('nee') !== -1 || v.indexOf('sla') !== -1) deel = 'nee';
				else deel = 'ja';
			}
		} catch(_) { deel = null; }

		// Fallback to stored value if no current selection
		if (!deel) {
			try { deel = getMemberSessionField('lunchDeelname'); } catch(_) { deel = null; }
			if (typeof deel === 'string') deel = deel.toLowerCase();
			if (!deel) try { deel = (sessionStorage.getItem('lunchDeelname')||'').toString().toLowerCase(); } catch(_) { }
		}

		// If deel is 'nee', enable
		if (deel === 'nee') enabled = true;
		else if (deel === 'ja') {
			if (Array.isArray(keuzeList) && keuzeList.length > 0) {
				// prefer DOM checked keuze
				let keuze = null;
				try { const chosen = document.querySelector('input[name="keuzeEten"]:checked'); if (chosen && chosen.value) keuze = chosen.value; } catch(_) { keuze = null; }
				if (!keuze) {
					try { keuze = getMemberSessionField('lunchKeuze'); } catch(_) { keuze = null; }
					if (!keuze) try { keuze = sessionStorage.getItem('lunchKeuze'); } catch(_) { }
				}
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
	} catch (e) { console.warn('clearAllMemberSessionData failed', e); }
}

// Minimal suggestions wiring: expects a global `searchMembers(prefix,max)` function (optional).
function setupMemberSuggestions() {
	try {
		try { console.debug('setupMemberSuggestions: init'); } catch(_){}
		const inputs = Array.from(document.querySelectorAll('input.form-input'));
		console.debug('setupMemberSuggestions: found inputs', inputs.length);
		for (const el of inputs) {
			try {
				if (!el || (el.dataset && el.dataset._suggestBound)) { console.debug('setupMemberSuggestions: skipping bound or missing el'); continue; }
				let timer = null;
				let listEl = null;
				function closeList() {
					try { if (listEl && listEl.__cleanup) try { listEl.__cleanup(); } catch(_){} } catch(_){}
					try { if (listEl && listEl.parentNode) listEl.parentNode.removeChild(listEl); } catch(_){}
					listEl = null;
				}
				async function showSuggestions(prefix) {
					console.debug('showSuggestions called for prefix', prefix);
					try {
						const q = String(prefix || '').trim();
						if (!q) { closeList(); return; }
								// Build or use an in-memory cache of members for substring search
								let cache = null;
								try { cache = window._memberCache || null; } catch(_) { cache = null; }
								if (!cache) {
									// Always load from the root `members` collection via `listAllMembers`
									try {
										cache = await listAllMembers(2000);
									} catch(_) { cache = []; }
									try { window._memberCache = Array.isArray(cache) ? cache : []; } catch(_) {}
								}
								console.debug('member cache size', Array.isArray(cache) ? cache.length : 0);
								if (!Array.isArray(cache) || cache.length === 0) { closeList(); return; }

								// Substring match across `voor` and `naam` (case-insensitive)
								const ql = q.toLowerCase();
								const matches = cache.filter(m => {
									try {
										const n = (m.naam || '').toLowerCase();
										const v = (m.voor || '').toLowerCase();
										return n.includes(ql) || v.includes(ql) || (`${v} ${n}`).includes(ql) || (`${n} ${v}`).includes(ql);
									} catch(_) { return false; }
								}).slice(0, 20);
								console.debug('matches found', matches.length);
								if (!Array.isArray(matches) || matches.length === 0) { closeList(); return; }
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
								listEl.style.maxHeight = '320px';
								listEl.style.overflowY = 'auto';
						listEl.setAttribute('role','listbox');
						const rect = el.getBoundingClientRect();
						listEl.style.top = (rect.bottom + window.scrollY + 6) + 'px';
						listEl.style.left = (rect.left + window.scrollX) + 'px';
								matches.forEach((r) => {
									const item = document.createElement('div');
									item.className = 'member-suggestion-item';
									item.style.padding = '8px 12px';
									item.style.cursor = 'pointer';
									item.style.whiteSpace = 'nowrap';
									item.style.textOverflow = 'ellipsis';
									item.style.overflow = 'hidden';
									const nameDisplay = `${(r.voor||'').trim()} ${(r.tussen||'').trim()} ${(r.naam||'').trim()}`.replace(/\s+/g,' ').trim();
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
									// Notify other parts of the app that a member was selected
									try { document.dispatchEvent(new CustomEvent('member:selected', { detail: { memberId: pickedId, name: item.textContent, sourceInputId: el.id || null } })); } catch(_) {}
									// Do not fetch full member here; fetching happens when the footer button is pressed
								} catch (e) { console.warn('suggestion click failed', e); }
							});
							listEl.appendChild(item);
						});
						// Always append to body for predictable positioning; log debug info if dropdown not visible
						try {
							const rect = el.getBoundingClientRect();
							listEl.style.position = 'absolute';
							listEl.style.top = (rect.bottom + window.scrollY + 6) + 'px';
							listEl.style.left = (rect.left + window.scrollX) + 'px';
							listEl.style.minWidth = (el.offsetWidth || 200) + 'px';
							listEl.style.zIndex = 2147483646;
							document.body.appendChild(listEl);
							// debug helper in case extension/content scripts interfere
							try { console.debug('member-suggestions appended', { top: listEl.style.top, left: listEl.style.left, minWidth: listEl.style.minWidth, items: listEl.children.length }); } catch(_) {}
						} catch (e) {
							try { console.error('failed to append member-suggestions', e); } catch(_) {}
						}
						// Close the dropdown if the input scrolls out of view (prevents it sticking to bottom)
						const checkInputVisibility = () => {
							try {
								const rect2 = el.getBoundingClientRect();
								// if input entirely above or below viewport, close
								if (rect2.bottom < 0 || rect2.top > (window.innerHeight || document.documentElement.clientHeight)) {
									closeList();
								} else {
									try {
										if (container === document.body) {
											const rect = el.getBoundingClientRect();
											listEl.style.top = (rect.bottom + window.scrollY + 6) + 'px';
											listEl.style.left = (rect.left + window.scrollX) + 'px';
											listEl.style.minWidth = (el.offsetWidth || 200) + 'px';
										} else {
											// inside parent: let CSS positioning handle it, but ensure width
											listEl.style.minWidth = (el.offsetWidth || 200) + 'px';
										}
									} catch(_){ }
								}
							} catch (e) { /* ignore visibility check errors */ }
						};
						// attach listeners
						const onScroll = () => { try { checkInputVisibility(); } catch(_){} };
						const onResize = () => { try { checkInputVisibility(); } catch(_){} };
						window.addEventListener('scroll', onScroll, true);
						window.addEventListener('resize', onResize);
						// store references so closeList can remove them
						listEl.__cleanup = () => {
							try { window.removeEventListener('scroll', onScroll, true); } catch(_){}
							try { window.removeEventListener('resize', onResize); } catch(_){}
						};
						// initial check
						try { checkInputVisibility(); } catch(_){}
// Realtime listener: attach a Firestore onSnapshot listener to update only ScanDatums
function setupMemberScanListener() {
	try {
		(async () => {
			try {
				let memberId = window._selectedMemberId || '';
				if (!memberId) {
					try {
						for (const k of Object.keys(sessionStorage || {})) {
							if (String(k).indexOf('shadow_ui_member_') === 0) { memberId = String(k).slice('shadow_ui_member_'.length); break; }
						}
					} catch(_) { memberId = '' }
				}
				if (!memberId) return;

				const ref = doc(db, 'members', String(memberId));
				// One-time check: fetch current document to verify read access and data shape
				try {
					try {
						const snapOnce = await getDoc(ref);
						try { /* debug removed */ } catch(_) {}
						try { /* debug removed */ } catch(_) {}
						// Normalize same as onSnapshot
						try {
							const dd = (snapOnce && typeof snapOnce.data === 'function') ? snapOnce.data() : (snapOnce && snapOnce._document ? snapOnce._document.data.value.mapValue.fields : null);
							const rawArr = dd ? (dd.ScanDatums || dd.scandatums || dd.scans || null) : null;
							const values = [];
							if (Array.isArray(rawArr)) values.push(...rawArr);
							else if (rawArr && Array.isArray(rawArr.arrayValue && rawArr.arrayValue.values ? rawArr.arrayValue.values : null)) values.push(...(rawArr.arrayValue.values || []));
							const tmp = [];
							for (const it of values) {
								try {
									if (!it) continue;
									if (typeof it.toDate === 'function') { tmp.push(toYMDString(it.toDate())); continue; }
									if (it && typeof it === 'object') { const maybe = it.stringValue || it.timestampValue || it.value || (it.seconds ? (it.seconds + '') : ''); if (maybe) { const y = toYMDString(maybe); if (y) tmp.push(y); continue; } }
									if (typeof it === 'string' || it instanceof String) { const y = toYMDString(String(it)); if (y) tmp.push(y); continue; }
									if (it instanceof Date) { const y = toYMDString(it); if (y) tmp.push(y); continue; }
								} catch(_) { continue; }
							}
							const normalized = Array.from(new Set(tmp)).sort();
							try { /* debug removed */ } catch(_) {}
						} catch(_) {}
					} catch(e) { console.warn('setupMemberScanListener getDoc failed', e); }
				} catch(_) {}

				const unsub = onSnapshot(ref, (snap) => {
					try {
						if (!snap.exists || (typeof snap.exists === 'function' && !snap.exists())) return;
						const data = (typeof snap.data === 'function') ? snap.data() : (snap._document ? snap._document.data.value.mapValue.fields : null);
						if (!data) return;
						// Normalize ScanDatums from multiple possible shapes (Firestore Timestamp, string, Date)
						let newScans = [];
						try {
							const rawArr = data.ScanDatums || data.scandatums || data.scans || null;
							const values = [];
							if (Array.isArray(rawArr)) {
								values.push(...rawArr);
							} else if (rawArr && Array.isArray(rawArr.arrayValue && rawArr.arrayValue.values ? rawArr.arrayValue.values : null)) {
								values.push(...(rawArr.arrayValue.values || []));
							}
							for (const item of values) {
								try {
									if (!item) continue;
									// Firestore client SDK returns Timestamp objects (has toDate)
									if (typeof item.toDate === 'function') {
										const d = item.toDate();
										const y = toYMDString(d);
										if (y) newScans.push(y);
										continue;
									}
									// When using REST-like fields, item may be { stringValue: '...' } or { timestampValue: '...' }
									if (item && typeof item === 'object') {
										const maybe = item.stringValue || item.timestampValue || item.value || item.seconds ? (item.stringValue || item.timestampValue || '') : '';
										if (maybe) {
											const y = toYMDString(maybe);
											if (y) newScans.push(y);
											continue;
										}
									}
									// Plain string or Date
									if (typeof item === 'string' || item instanceof String) {
										const y = toYMDString(String(item));
										if (y) newScans.push(y);
										continue;
									}
									if (item instanceof Date) {
										const y = toYMDString(item);
										if (y) newScans.push(y);
										continue;
									}
								} catch(_) { continue; }
							}
							// unique and sorted
							newScans = Array.from(new Set(newScans)).sort();
						} catch(_) { newScans = []; }

						const key = `shadow_ui_member_${String(memberId)}`;
						let obj = null;
						try { const raw = sessionStorage.getItem(key); obj = raw ? JSON.parse(raw) : {}; } catch(_) { obj = {}; }
						// Update only ScanDatums field
						try { obj.ScanDatums = newScans; sessionStorage.setItem(key, JSON.stringify(obj)); } catch(_) {}
						try { document.dispatchEvent(new CustomEvent('shadow:member-updated', { detail: { memberId, full: obj } })); } catch(_) {}
						try { renderMemberInfoChoices(); } catch(_) {}
					} catch (e) { console.warn('member onSnapshot handler failed', e); }
				}, (err) => { console.warn('member onSnapshot error', err); });

				// Unsubscribe on unload
				try { window.addEventListener('beforeunload', () => { try { unsub && unsub(); } catch(_) {} }); } catch(_) {}
			} catch (e) { console.warn('setupMemberScanListener import/init failed', e); }
		})();
	} catch (e) { console.warn('setupMemberScanListener failed', e); }
}

try { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setupMemberScanListener()); else setupMemberScanListener(); document.addEventListener('shadow:config-ready', () => setupMemberScanListener()); } catch(_) {}
					} catch (e) { console.warn('showSuggestions failed', e); }
				}
				function schedule(prefix) { if (timer) clearTimeout(timer); console.debug('schedule suggestion for', prefix); timer = setTimeout(() => { showSuggestions(prefix); }, 300); }
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
		(async () => {
			try {
				let memberId = window._selectedMemberId || '';
				if (!memberId) {
					try {
						for (const k of Object.keys(sessionStorage || {})) {
							if (String(k).indexOf('shadow_ui_member_') === 0) { memberId = String(k).slice('shadow_ui_member_'.length); break; }
						}
					} catch(_) { memberId = '' }
				}
				if (!memberId) return;

				const ref = doc(db, 'members', String(memberId));

				// optional one-time read to surface shapes in the console
					try {
						const snapOnce = await getDoc(ref).catch(()=>null);
						try { /* debug removed */ } catch(_) {}
						try { const dd = (snapOnce && typeof snapOnce.data === 'function') ? snapOnce.data() : (snapOnce && snapOnce._document ? snapOnce._document.data.value.mapValue.fields : snapOnce); /* debug removed */ } catch(_) {}
					} catch(_) {}

				const unsub = onSnapshot(ref, (snap) => {
					try {
						const data = (snap && typeof snap.data === 'function') ? snap.data() : (snap && snap._document ? snap._document.data.value.mapValue.fields : null);
						const normalized = getMemberScanYMDs(data || {});
						const key = `shadow_ui_member_${String(memberId)}`;
						let obj = {};
						try { const raw = sessionStorage.getItem(key); obj = raw ? JSON.parse(raw) : {}; } catch(_) { obj = {}; }
						try { obj.ScanDatums = normalized; sessionStorage.setItem(key, JSON.stringify(obj)); } catch(_) {}
						try { document.dispatchEvent(new CustomEvent('shadow:member-updated', { detail: { memberId, full: obj } })); } catch(_) {}
						try { renderMemberInfoChoices(); } catch(_) {}
					} catch (e) { console.warn('member onSnapshot handler failed', e); }
				}, (err) => { console.warn('member onSnapshot error', err); });

				// Unsubscribe on unload
				try { window.addEventListener('beforeunload', () => { try { unsub && unsub(); } catch(_) {} }); } catch(_) {}
			} catch (e) { console.warn('setupMemberScanListener import/init failed', e); }
		})();
	} catch (e) { console.warn('setupMemberScanListener failed', e); }

}

// Simple footer delegation to ensure footer buttons are wired in static pages
function setupFooterDelegation() {
	try {
		// provide a lightweight binding for agree-signup enablement
		try { setupMemberSuggestions(); } catch(_) {}
		try { setupSignupFooterNavigation(); } catch(_) {}
		try { setupLunchFooterNavigation(); } catch(_) {}
	try { setupIndexFooterNavigation(); } catch(_) {}
	try { setupHeaderBackButtons(); } catch(_) {}
	try { setupSignupInputClear(); } catch(_) {}
		try { setupJaarhangerFooterNavigation(); } catch(_) {}
		// ensure initial state
		try { updateSignupFooterState(); } catch(_) {}
		// expose helpers for console
		try { window.dumpSessionStorage = dumpSessionStorage; } catch(_) {}
		try { window.clearAllMemberSessionData = clearAllMemberSessionData; } catch(_) {}
	} catch (e) { console.warn('setupFooterDelegation failed', e); }
}

// Render member info choices (Lunch / Jaarhanger) on the memberInfoPage
function renderMemberInfoChoices() {
	// ensure this flag exists in the whole function scope
	let scannedToday = false;
	try {
		// Render member header (name + LidNr) when available in session
		try {
			const nameEl = document.querySelector('.member-name');
			const metaBadges = document.querySelector('.meta-badges');
			// try to obtain the full stored member object from sessionStorage
			let memberObj = null;
			try {
				for (const k of Object.keys(sessionStorage || {})) {
					try {
						if (String(k).indexOf('shadow_ui_member_') === 0) {
							const raw = sessionStorage.getItem(k);
							if (raw) {
								try { memberObj = JSON.parse(raw); break; } catch(_) { continue; }
							}
						}
					} catch(_) {}
				}
			} catch(_) { memberObj = null; }

			// Fallback: window._selectedMemberId -> shadow object
			if (!memberObj) {
				try {
					const mid = window._selectedMemberId || '';
					if (mid) {
						const raw = sessionStorage.getItem(`shadow_ui_member_${String(mid)}`);
						if (raw) memberObj = JSON.parse(raw);
					}
				} catch(_) { memberObj = memberObj || null; }
			}

			// Extract LidNr and name with some common fallbacks
			let lid = '';
			let displayName = '';
			if (memberObj) {
				lid = String(memberObj.id || memberObj.LidNr || memberObj.lidNr || memberObj.lid || memberObj.memberNo || memberObj.MemberNo || '').trim();
				// Prefer composed name fields if present
				const voor = (memberObj['Voor naam'] || memberObj.voor || memberObj.Voor || memberObj.firstName || memberObj.voornaam || '') || '';
				const naam = (memberObj.Naam || memberObj.naam || memberObj.lastName || memberObj.Naam || '') || '';
				displayName = `${String(voor).trim()} ${String(naam).trim()}`.replace(/\s+/g,' ').trim();
			}
			if (nameEl) {
				try { nameEl.textContent = displayName || (memberObj && (memberObj.Naam || memberObj.naam || memberObj.id) ) || '' ; } catch(_) {}
			}
			if (metaBadges) {
				try {
					// Render a LidNr chip first, then preserve any existing second chip (region/icon)
					const chips = [];
					const lidChip = document.createElement('span');
					lidChip.className = 'info-chip';
					const icon = document.createElement('span');
					icon.className = 'material-symbols-outlined';
					icon.setAttribute('aria-hidden','true');
					icon.textContent = 'badge';
					lidChip.appendChild(icon);
					const txt = document.createElement('span');
					txt.style.marginLeft = '8px';
					txt.textContent = lid ? String(lid) : '—';
					lidChip.appendChild(txt);
					chips.push(lidChip);

					// Build a region chip from the stored member object (Regio Omschrijving)
					const regionText = memberObj ? String(memberObj['Regio Omschrijving'] || memberObj.Regio || memberObj.regio || memberObj.region || '').trim() : '';
					const regionChip = document.createElement('span');
					regionChip.className = 'info-chip';
					const locIcon = document.createElement('span');
					locIcon.className = 'material-symbols-outlined';
					locIcon.setAttribute('aria-hidden','true');
					locIcon.textContent = 'location_on';
					regionChip.appendChild(locIcon);
					const regionTxt = document.createElement('span');
					regionTxt.style.marginLeft = '8px';
					regionTxt.textContent = regionText || '—';
					regionChip.appendChild(regionTxt);
					chips.push(regionChip);

					// replace contents
					metaBadges.innerHTML = '';
					for (const c of chips) metaBadges.appendChild(c);
				} catch(_) {}
			}
		} catch(e) { console.warn('renderMemberInfoChoices.header failed', e); }

		// Render ride attendance stats (Gereden Ritten)
		try {
			const statCountEl = document.querySelector('.stat-count');
			const starsContainer = document.querySelector('.stats-stars');
			// read planned dates from sessionStorage.rideConfig (prefer current-year map)
			let planned = [];
			try {
				const raw = sessionStorage.getItem('rideConfig');
				const obj = raw ? JSON.parse(raw) : null;
				if (obj) {
					const currentYearKey = String((new Date()).getFullYear());
					if (obj[currentYearKey] && typeof obj[currentYearKey] === 'object') planned = Object.keys(obj[currentYearKey]).map(d => toYMDString(d)).filter(Boolean);
					else if (obj.regions && typeof obj.regions === 'object') planned = Object.keys(obj.regions).map(d => toYMDString(d)).filter(Boolean);
					else if (Array.isArray(obj.plannedDates)) planned = obj.plannedDates.map(d => toYMDString(d)).filter(Boolean);
				}
			} catch(_) { planned = []; }

			// read member scan dates from stored shadow object
			let scans = [];
			try {
				let memberObj = null;
				for (const k of Object.keys(sessionStorage || {})) {
					try {
						if (String(k).indexOf('shadow_ui_member_') === 0) {
							const raw = sessionStorage.getItem(k);
							if (raw) { try { memberObj = JSON.parse(raw); break; } catch(_) { continue; } }
						}
					} catch(_) {}
				}
				if (!memberObj) {
					try { const mid = window._selectedMemberId || ''; if (mid) { const raw = sessionStorage.getItem(`shadow_ui_member_${String(mid)}`); if (raw) memberObj = JSON.parse(raw); } } catch(_) {}
				}
				if (memberObj) {
					const s = Array.isArray(memberObj.ScanDatums) ? memberObj.ScanDatums : (Array.isArray(memberObj.scandatums) ? memberObj.scandatums : (Array.isArray(memberObj.scans) ? memberObj.scans : []));
					if (Array.isArray(s)) scans = s.map(d=>toYMDString(d)).filter(Boolean);
				}
			} catch(_) { scans = []; }

			const plannedSet = new Set((planned||[]));
			const scanSet = new Set((scans||[]));
			const today = todayYMD();
			let scannedToday = false;
			// Debug: log planned vs scanned dates to help troubleshooting why stars don't light
			try {
				if (window && window.location && window.location.hostname) {
					/* debug removed */
				}
			} catch(_) {}
			let attended = 0;
			if (planned && planned.length > 0) {
				for (const p of planned) if (scanSet.has(p)) attended++;
			}
			const total = planned ? planned.length : 0;
			if (statCountEl) {
				try { statCountEl.textContent = `${attended} / ${total}`; } catch(_) {}
			}
			if (starsContainer) {
				try {
					// Decide whether to show 5 or 6 stars based on ride data
					const numStars = (Array.isArray(planned) && planned.length >= 6) ? 6 : 5;
					// choose dates for each star (take earliest planned dates)
					const sortedPlanned = Array.isArray(planned) ? (planned.slice().sort()) : [];
					const starDates = [];
					for (let i=0;i<numStars;i++) {
						starDates.push(sortedPlanned[i] || '');
					}
					// rebuild stars with date metadata; mark filled if member scanned on that date
					starsContainer.innerHTML = '';
					let filledCount = 0;
					// determine the next planned ride: first planned date >= today
					const todayForStars = todayYMD();
					const nextRide = (Array.isArray(sortedPlanned) ? sortedPlanned.find(d => String(d) >= String(todayForStars)) : null) || null;
					for (let i=0;i<numStars;i++) {
						const date = starDates[i] || '';
						const sp = document.createElement('span');
						sp.className = 'material-symbols-outlined star';
						sp.textContent = 'star';
						if (date) {
							sp.dataset.date = String(date);
							try { sp.title = formatDateLocal(date); } catch(_) {}
							if (scanSet.has(String(date))) {
								sp.classList.add('filled'); filledCount++;
							} else {
								try {
									// Only mark the very next planned ride (today or future) as special blue when unscanned
									if (nextRide && String(date) === String(nextRide)) {
										sp.classList.add('upcoming-unscanned');
									} else {
										sp.classList.add('empty');
									}
								} catch(_) { sp.classList.add('empty'); }
							}
						} else {
							sp.classList.add('empty');
						}
						starsContainer.appendChild(sp);
					}
					// accessible label
					try { starsContainer.setAttribute('aria-label', filledCount ? `Sterren: ${filledCount}` : 'Geen sterren'); } catch(_) {}
				} catch(_) {}
			}
		} catch(e) { console.warn('renderMemberInfoChoices.stats failed', e); }
		// determine scannedToday after stats calculation so other sections can read it
		try {
			scannedToday = scanSet.has(today);
			// fallback: also check the stored shadow member object's ScanDatums using normalization
			if (!scannedToday) {
				let storedMember = null;
				for (const k of Object.keys(sessionStorage || {})) {
					try {
						if (String(k).indexOf('shadow_ui_member_') === 0) {
							const raw = sessionStorage.getItem(k);
							if (raw) { try { storedMember = JSON.parse(raw); break; } catch(_) { /* ignore */ } }
						}
					} catch(_) {}
				}
				if (storedMember) {
					try {
						const scansFromObj = getMemberScanYMDs(storedMember || {});
						if (Array.isArray(scansFromObj) && scansFromObj.includes(today)) scannedToday = true;
					} catch(_) {}
				}
			}
		} catch(_) {}
		const lunchItem = document.querySelector('.mk-item--lunch');
		if (lunchItem) {
			try {
					// If member already scanned today, lock the lunch section
					if (scannedToday) {
						try { lunchItem.dataset.locked = '1'; } catch(_) {}
						try { lunchItem.setAttribute('aria-disabled','true'); } catch(_) {}
						try { lunchItem.style.pointerEvents = 'none'; } catch(_) {}
						const badge = lunchItem.querySelector('.mk-status-badge');
							if (badge) {
								const chevron = lunchItem.querySelector('.mk-chevron');
								if (chevron) chevron.textContent = 'lock';
							}
					}
					let deel = null;
				try { deel = getMemberSessionField('lunchDeelname'); } catch(_) { deel = null; }
				if (!deel) try { deel = sessionStorage.getItem('lunchDeelname'); } catch(_) { }
				deel = (deel || '').toString().toLowerCase();

				const valueEl = lunchItem.querySelector('.mk-item-value');
				const badge = lunchItem.querySelector('.mk-status-badge');
				const icon = badge && badge.querySelector('.material-symbols-outlined');

				if (deel === 'ja') {
					// show check and the chosen meal
					let keuze = null;
					try { keuze = getMemberSessionField('lunchKeuze'); } catch(_) { keuze = null; }
					if (!keuze) try { keuze = sessionStorage.getItem('lunchKeuze'); } catch(_) { }
					// Determine if lunch choices are configured in sessionStorage
					let lunchRaw = null;
					let lunchCfg = null;
					try { lunchRaw = sessionStorage.getItem('lunch'); } catch(_) { lunchRaw = null; }
					try { lunchCfg = lunchRaw ? JSON.parse(lunchRaw) : null; } catch(_) { lunchCfg = null; }
					const hasKeuzeOptions = Array.isArray(lunchCfg && lunchCfg.keuzeEten) && lunchCfg.keuzeEten.length > 0;
					let displayText = '';
					if (keuze && String(keuze).trim()) displayText = String(keuze).trim();
					else if (!hasKeuzeOptions) displayText = 'Eet mee';
					else displayText = (valueEl && valueEl.textContent) ? valueEl.textContent : '';
					if (valueEl) valueEl.textContent = displayText;
					if (icon) icon.textContent = 'check';
					if (badge) { badge.classList.remove('mk-badge-no'); badge.classList.add('mk-badge-yes'); }
					try { lunchItem.classList.remove('mk-no'); } catch(_) {}
				} else if (deel === 'nee') {
					// show cross and Eet niet mee
					if (valueEl) valueEl.textContent = 'Eet niet mee';
					if (icon) icon.textContent = 'close';
					if (badge) { badge.classList.remove('mk-badge-yes'); badge.classList.add('mk-badge-no'); }
					try { lunchItem.classList.add('mk-no'); } catch(_) {}
				} else {
					// no selection: leave as-is or show placeholder
				}
			} catch (e) { console.warn('renderMemberInfoChoices.lunch failed', e); }
		}

		// Jaarhanger (optional): reflect simple yes/no visual if present
		try {
			const jaarItem = document.querySelector('.mk-item--jaar');
			if (jaarItem) {
				let jah = null;
				try { jah = getMemberSessionField('Jaarhanger'); } catch(_) { jah = null; }
				if (!jah) try { jah = sessionStorage.getItem('Jaarhanger'); } catch(_) { }
				jah = (jah || '').toString().toLowerCase();
				// If member scanned today, lock jaarhanger as well
				if (scannedToday) {
					try { jaarItem.dataset.locked = '1'; } catch(_) {}
					try { jaarItem.setAttribute('aria-disabled','true'); } catch(_) {}
					try { jaarItem.style.pointerEvents = 'none'; } catch(_) {}
					const badge = jaarItem.querySelector('.mk-status-badge');
					if (badge) {
						const chevron = jaarItem.querySelector('.mk-chevron');
						if (chevron) chevron.textContent = 'lock';
					}
				}
				const valueEl = jaarItem.querySelector('.mk-item-value');
				// Always show the current year edition as subtitle
				try { if (valueEl) valueEl.textContent = String(new Date().getFullYear()) + ' Editie'; } catch(_) {}
				const badge = jaarItem.querySelector('.mk-status-badge');
				const icon = badge && badge.querySelector('.material-symbols-outlined');
				if (jah === 'ja') {
					if (icon) icon.textContent = 'check';
					if (badge) { badge.classList.remove('mk-badge-no'); badge.classList.add('mk-badge-yes'); }
					try { jaarItem.classList.remove('mk-no'); } catch(_) {}
				} else if (jah === 'nee') {
					if (icon) icon.textContent = 'close';
					if (badge) { badge.classList.remove('mk-badge-yes'); badge.classList.add('mk-badge-no'); }
					try { jaarItem.classList.add('mk-no'); } catch(_) {}
				}
			}
		} catch(_) {}
		try { updateQROverlay(); } catch(_) {}
		try { updateChoiceLocks(); } catch(_) {}
	} catch (e) { console.warn('renderMemberInfoChoices failed', e); }
}

		// Ensure the "Mijn Keuzes" items reflect today's scanned state (lock visuals + nav blocking)
		function updateChoiceLocks() {
			try {
				const today = todayYMD();
				// find stored member
				let storedMember = null;
				try {
					for (const k of Object.keys(sessionStorage || {})) {
						try {
							if (String(k).indexOf('shadow_ui_member_') === 0) {
								const raw = sessionStorage.getItem(k);
								if (raw) { try { storedMember = JSON.parse(raw); break; } catch(_) { /* ignore */ } }
							}
						} catch(_) {}
					}
				} catch(_) { storedMember = null; }

				const scans = getMemberScanYMDs(storedMember || {});
				const isToday = Array.isArray(scans) && scans.includes(today);

				// lunch
				try {
					const lunchItem = document.querySelector('.mk-item--lunch');
					if (lunchItem) {
						if (isToday) {
							lunchItem.dataset.locked = '1';
							lunchItem.setAttribute('aria-disabled','true');
							lunchItem.style.pointerEvents = 'none';
							const badge = lunchItem.querySelector('.mk-status-badge');
							if (badge) {
								const chevron = lunchItem.querySelector('.mk-chevron');
								if (chevron) chevron.textContent = 'lock';
							}
						} else {
							// unlock
							try { delete lunchItem.dataset.locked; } catch(_) {}
							try { lunchItem.removeAttribute('aria-disabled'); } catch(_) {}
							try { lunchItem.style.pointerEvents = ''; lunchItem.style.opacity = ''; } catch(_) {}
							const chevron = lunchItem.querySelector('.mk-chevron');
							if (chevron) chevron.textContent = 'chevron_right';
						}
					}
				} catch(_) {}

				// jaarhanger
				try {
					const jaarItem = document.querySelector('.mk-item--jaar');
					if (jaarItem) {
						if (isToday) {
							jaarItem.dataset.locked = '1';
							jaarItem.setAttribute('aria-disabled','true');
							jaarItem.style.pointerEvents = 'none';
							const badge = jaarItem.querySelector('.mk-status-badge');
							if (badge) {
								const chevron = jaarItem.querySelector('.mk-chevron');
								if (chevron) chevron.textContent = 'lock';
							}
						} else {
							try { delete jaarItem.dataset.locked; } catch(_) {}
							try { jaarItem.removeAttribute('aria-disabled'); } catch(_) {}
							try { jaarItem.style.pointerEvents = ''; jaarItem.style.opacity = ''; } catch(_) {}
							const chevron = jaarItem.querySelector('.mk-chevron');
							if (chevron) chevron.textContent = 'chevron_right';
						}
					}
				} catch(_) {}
			} catch (e) { console.warn('updateChoiceLocks failed', e); }
		}

try { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderMemberInfoChoices); else renderMemberInfoChoices(); document.addEventListener('shadow:config-ready', renderMemberInfoChoices); } catch(_) {}

// Update QR image and overlay based on current session member and scan dates
async function updateQROverlay() {
	try {
		const qrImg = document.getElementById('memberInfoQRImg');
		// resolve member object
		let memberObj2 = null;
		try {
			for (const k of Object.keys(sessionStorage || {})) {
				try {
					if (String(k).indexOf('shadow_ui_member_') === 0) {
						const raw = sessionStorage.getItem(k);
						if (raw) { try { memberObj2 = JSON.parse(raw); break; } catch(_) { /* ignore */ } }
					}
				} catch(_) {}
			}
		} catch(_) { memberObj2 = null; }
		const lidNr = getMemberLid(memberObj2 || {});
		let jah = null; try { jah = getMemberSessionField('Jaarhanger'); } catch(_) { jah = null; } if (!jah) try { jah = sessionStorage.getItem('Jaarhanger'); } catch(_) {}
		let lunchDel = null; try { lunchDel = getMemberSessionField('lunchDeelname'); } catch(_) { lunchDel = null; } if (!lunchDel) try { lunchDel = sessionStorage.getItem('lunchDeelname'); } catch(_) {}
		let lunchKeuze = null; try { lunchKeuze = getMemberSessionField('lunchKeuze'); } catch(_) { lunchKeuze = null; } if (!lunchKeuze) try { lunchKeuze = sessionStorage.getItem('lunchKeuze'); } catch(_) {}
		// Include multiple aliases for the member id so external scanners can reliably extract it
		const payload = {
			LidNr: String(lidNr || ''),
			id: String(lidNr || ''),
			uid: String(lidNr || ''),
			lid: String(lidNr || ''),
			lidnr: String(lidNr || ''),
			Jaarhanger: (jah || '').toString(),
			lunchDeelname: (lunchDel || '').toString(),
			lunchKeuze: (lunchKeuze || '').toString()
		};

		// Add next planned ride date as `scanDate` (YYYY-MM-DD).
		try {
			const plannedDates = await getPlannedDates().catch(() => []);
			const today = todayYMD();
			let nextDate = null;
			if (Array.isArray(plannedDates) && plannedDates.length) {
				const sorted = plannedDates.slice().sort();
				for (const d of sorted) {
					if (typeof d === 'string' && d >= today) { nextDate = d; break; }
				}
				if (!nextDate) nextDate = sorted[0];
			}
			if (nextDate) payload.scanDate = String(nextDate);
			else payload.scanDate = String(today);
		} catch (e) {
			try { payload.scanDate = String(todayYMD()); } catch(_) { payload.scanDate = '';} 
		}

		// Determine if member has a scan for today
		let scansFromObj = [];
		try { scansFromObj = getMemberScanYMDs(memberObj2 || {}) || []; } catch(_) { scansFromObj = []; }
		const isScannedToday = Array.isArray(scansFromObj) && scansFromObj.includes(todayYMD());
		try {
			const dataStr = JSON.stringify(payload);
				if (qrImg) {
					// Also provide an audio URL so scanning the QR opens/plays the MP3 directly.
					let audioUrl = '/assets/wet-fart-335478.mp3';
					try { audioUrl = new URL('../assets/wet-fart-335478.mp3', location.href).href; } catch(_) {}
					// Generate a QR that encodes the audio file URL (so scanners will open/play it).
					qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=' + encodeURIComponent(audioUrl);
					qrImg.alt = `QR (audio): ${audioUrl}`;
					// Keep the original JSON payload on the element for internal use.
					qrImg.setAttribute('data-qrcode-payload', dataStr);
					qrImg.setAttribute('data-audio-url', audioUrl);
				// show overlay when scanned today
				try {
					const wrap = document.getElementById('memberInfoQRWrap');
					if (wrap) {
						let overlay = wrap.querySelector('.qr-overlay');
						const scansFromObj = getMemberScanYMDs(memberObj2 || {});
						const isToday = Array.isArray(scansFromObj) && scansFromObj.includes(todayYMD());
						if (isToday) {
							if (!overlay) {
								overlay = document.createElement('div');
								overlay.className = 'qr-overlay';
								overlay.innerHTML = `<div class="qr-overlay-inner"><span class="material-symbols-outlined">lock</span><div class="overlay-text">Ingeschreven</div></div>`;
								wrap.appendChild(overlay);
							}
						} else {
							if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
						}
					}
				} catch(_) {}
			}
			// The explicit "save" button was removed; mobile users can long-press the QR image to save it.
		} catch (e) { console.warn('updateQROverlay failed', e); }
	} catch(_) {}
}

// Allow clicking the member-info cards to navigate to the related pages
function setupMemberInfoCardNavigation() {
	try {
		const lunchItem = document.querySelector('.mk-item--lunch');
		if (lunchItem && !(lunchItem.dataset && lunchItem.dataset._navBound)) {
			lunchItem.addEventListener('click', (ev) => {
				try {
					if (lunchItem.dataset && lunchItem.dataset.locked === '1') { ev.preventDefault(); return; }
					if (lunchItem.getAttribute && lunchItem.getAttribute('aria-disabled') === 'true') { ev.preventDefault(); return; }
					ev.preventDefault(); window.location.href = '../lid-ui/lunchPage.html';
				} catch(_) { try { window.location.href = '/lid-ui/lunchPage.html'; } catch(_) {} }
			});
			if (lunchItem.dataset) lunchItem.dataset._navBound = '1';
		}

		const jaarItem = document.querySelector('.mk-item--jaar');
		if (jaarItem && !(jaarItem.dataset && jaarItem.dataset._navBound)) {
			jaarItem.addEventListener('click', (ev) => {
				try {
					if (jaarItem.dataset && jaarItem.dataset.locked === '1') { ev.preventDefault(); return; }
					if (jaarItem.getAttribute && jaarItem.getAttribute('aria-disabled') === 'true') { ev.preventDefault(); return; }
					ev.preventDefault(); window.location.href = '../lid-ui/jaarhangerPage.html';
				} catch(_) { try { window.location.href = '/lid-ui/jaarhangerPage.html'; } catch(_) {} }
			});
			if (jaarItem.dataset) jaarItem.dataset._navBound = '1';
		}
	} catch (e) { console.warn('setupMemberInfoCardNavigation failed', e); }
}

try { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupMemberInfoCardNavigation); else setupMemberInfoCardNavigation(); document.addEventListener('shadow:config-ready', setupMemberInfoCardNavigation); } catch(_) {}

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
		const buttons = Array.from(document.querySelectorAll('.back-button, .home-button'));
		if (!buttons || buttons.length === 0) return;
		for (const btn of buttons) {
			try {
				if (btn.dataset && btn.dataset._backBound) continue;
				btn.addEventListener('click', (ev) => {
					try {
						ev.preventDefault();
						// If this is explicitly a home-button, always go to the app index
						try {
							if (btn.classList && btn.classList.contains('home-button')) {
								try { window.location.href = '../index.html'; } catch(_) { window.location.href = '/index.html'; }
								return;
							}
						} catch(_) {}
						const pathnameLower = String(window.location.pathname || '').toLowerCase();
						// memberInfo page (match with or without .html, and on Vercel clean routes): always go to index.html
						if (pathnameLower.indexOf('memberinfo') !== -1 || pathnameLower.indexOf('memberinfopage') !== -1) {
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

// Run on import, but ensure DOM is ready first so inputs exist
try {
	if (typeof document !== 'undefined' && document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => {
			try { setupFooterDelegation(); } catch (e) { console.warn('setupFooterDelegation failed on DOMContentLoaded', e); }
		});
	} else {
		try { setupFooterDelegation(); } catch (e) { console.warn('setupFooterDelegation failed', e); }
	}
} catch(_) {}

// No exports — module is side-effecting for signup page

// End of minimal member helpers

// Ensure ride and lunch data are present in sessionStorage so pages past loading continue.
(function ensureShadowData() {
	try {
		async function init() {
			try {
				const [rideCfg, lunchOptions] = await Promise.all([getRideConfig(), getLunchOptions()]);
				// Persist only regions into sessionStorage (never plannedDates)
				try {
					const currentYear = String((new Date()).getFullYear());
					try {
						if (rideCfg && rideCfg[currentYear] && typeof rideCfg[currentYear] === 'object') {
							setSessionAndDump('rideConfig', JSON.stringify({ [currentYear]: rideCfg[currentYear] }));
						} else if (rideCfg && rideCfg.regions && typeof rideCfg.regions === 'object') {
							// legacy shape: keep regions under `regions`
							setSessionAndDump('rideConfig', JSON.stringify({ regions: rideCfg.regions }));
						} else {
							// Do not remove existing rideConfig here — leave it as-is to avoid clobbering other loaders
						}
					} catch(_) {}
				} catch(_) {}
				try { setSessionAndDump('lunch', JSON.stringify(lunchOptions || { vastEten: [], keuzeEten: [] })); } catch(_) {}
				// Hide any loading indicator if present
				try { const li = document.getElementById('loadingIndicator'); if (li) li.style.display = 'none'; } catch(_) {}
				// Derive plannedDates for the event payload from rideCfg if present
				let plannedDates = [];
				try {
					if (rideCfg) {
						if (Array.isArray(rideCfg.plannedDates)) plannedDates = rideCfg.plannedDates.slice();
						else if (rideCfg.regions && typeof rideCfg.regions === 'object') plannedDates = Object.keys(rideCfg.regions).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
					}
				} catch(_) { plannedDates = []; }
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
						try { result.push(new Date(it.seconds * 1000).toISOString().slice(0,10)); continue; } catch(_){ }
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

// Robustly extract a member identifier (LidNr) from various shapes
function getMemberLid(member) {
	try {
		if (!member) return '';
		// direct common keys
		const keys = ['LidNr','lidnummer','lidNr','lid','id','memberNo','MemberNo','Lid'];
		for (const k of keys) {
			try {
				const v = member[k];
				if (!v) continue;
				if (typeof v === 'string' && v.trim()) return v.trim();
				if (typeof v === 'number') return String(v);
				// Firestore REST shape: { stringValue: '...' }
				if (typeof v === 'object') {
					if (v.stringValue) return String(v.stringValue);
					if (v.label) return String(v.label);
					if (v.value) return String(v.value);
					if (v._text) return String(v._text);
				}
			} catch(_) {}
		}
		// sometimes the full member is wrapped under a 'data' or 'fields' key
		try {
			if (member.data && typeof member.data === 'object') return getMemberLid(member.data);
			if (member.fields && typeof member.fields === 'object') return getMemberLid(member.fields);
		} catch(_) {}
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
		// Read rideConfig for the current year from sessionStorage only (do not fetch from Firebase)
		let cfg = null;
		try { const raw = sessionStorage.getItem('rideConfig'); cfg = raw ? JSON.parse(raw) : null; } catch(_) { cfg = null; }
		if (!cfg) return;
		const currentYear = String((new Date()).getFullYear());
		// Prefer per-year top-level field: e.g. { "2025": { "2025-12-30": "Zuid" } }
		let yearMap = null;
		try {
			if (cfg && typeof cfg === 'object' && cfg[currentYear] && typeof cfg[currentYear] === 'object') yearMap = cfg[currentYear];
			else if (cfg && cfg.regions && typeof cfg.regions === 'object') yearMap = cfg.regions; // legacy fallback
		} catch(_) { yearMap = null; }
		// Derive dates from available shape
		let dates = [];
		try {
			if (yearMap && typeof yearMap === 'object') dates = Object.keys(yearMap).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k));
			else if (cfg && Array.isArray(cfg.plannedDates)) dates = cfg.plannedDates.filter(Boolean);
		} catch(_) { dates = []; }
		// Show only today and future rides
		const upcoming = dates.filter(d => { try { return daysUntil(d) >= 0; } catch(_) { return false; } });
		const regions = yearMap || {};
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
				let regionText = '';
				try {
					const rawVal = regions ? (regions[iso] || regions[String(iso)]) : undefined;
					if (typeof rawVal === 'string') regionText = rawVal;
					else if (rawVal && typeof rawVal === 'object') {
						// accept { region: 'Zuid' } or legacy participant map; prefer explicit region if present
						if (typeof rawVal.region === 'string' && rawVal.region) regionText = rawVal.region;
						else if (typeof rawVal.regio === 'string' && rawVal.regio) regionText = rawVal.regio;
						else regionText = '';
					}
				} catch(_) { regionText = ''; }

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

// Update render on load and when config ready — ensure rideConfig is loaded first
try {
	async function ensureConfigAnd(fn) {
		try {
			// Only proceed if sessionStorage contains rideConfig for current year (or legacy regions/plannedDates)
			const raw = sessionStorage.getItem('rideConfig');
			if (!raw) {
				console.warn('sessionStorage.rideConfig missing; skipping render (per config)');
				return;
			}
			let ok = false;
			try {
				const cfg = JSON.parse(raw);
				const currentYear = String((new Date()).getFullYear());
				if (cfg && typeof cfg === 'object' && cfg[currentYear] && typeof cfg[currentYear] === 'object') ok = true;
				else if (cfg && cfg.regions && typeof cfg.regions === 'object') ok = true;
				else if (cfg && Array.isArray(cfg.plannedDates) && cfg.plannedDates.length > 0) ok = true;
			} catch(_) { ok = false; }
			if (!ok) {
				console.warn('sessionStorage.rideConfig does not contain expected current-year data; skipping render');
				return;
			}
		} catch (e) {
			console.error('failed to check sessionStorage for rideConfig before rendering planned rides', e);
			return;
		}
		try { fn(); } catch (e) { console.error('renderPlannedRides failed after config load', e); }
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => ensureConfigAnd(renderPlannedRides));
	else ensureConfigAnd(renderPlannedRides);
	document.addEventListener('shadow:config-ready', renderPlannedRides);
} catch(_) {}

    		
// Render lunch preview area (vastEten / keuzeEten) from sessionStorage 'lunch'
async function renderLunchPreview() {
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
				// Place the comma-separated text directly into the surface-card container
					const text = vast.map(v => String(v || '')).join(', ');
					vastEl.innerHTML = '';
					vastEl.textContent = text;
					// if the vast display lives inside a .surface-card, add accent class
					try {
						const sc = vastEl.closest && vastEl.closest('.surface-card');
						if (sc) sc.classList.add('surface-card--accent');
					} catch(_) {}
			} else {
					vastEl.textContent = 'Geen vast eten beschikbaar';
					try {
						const sc = vastEl.closest && vastEl.closest('.surface-card');
						if (sc) sc.classList.remove('surface-card--accent');
					} catch(_) {}
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

	// Additional check: if globals/lunch.updatedAt is missing or older-or-equal to the previous ride,
	// fade the lunch sections and show a "not established" message so members know choices aren't set.
	try {
		// normalize various timestamp shapes to ISO string
		function normalizeTimestampValue(ts) {
			try {
				if (!ts) return null;
				if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
				if (typeof ts === 'object' && ts.seconds && (ts.nanoseconds || ts.nanoseconds === 0)) {
					const ms = (Number(ts.seconds) * 1000) + Math.floor(Number(ts.nanoseconds) / 1e6);
					return new Date(ms).toISOString();
				}
				if (typeof ts === 'string') { const d = new Date(ts); if (!isNaN(d.getTime())) return d.toISOString(); return null; }
				if (typeof ts === 'number') { if (ts > 1e12) return new Date(ts).toISOString(); return new Date(ts * 1000).toISOString(); }
				return null;
			} catch (e) { return null; }
		}

		// read planned dates from sessionStorage.rideConfig (prefer current-year map)
		let planned = [];
		try {
			const raw = sessionStorage.getItem('rideConfig');
			if (raw) {
				const rc = JSON.parse(raw || '{}');
				const currentYearKey = String((new Date()).getFullYear());
				let regions = {};
				if (rc && rc[currentYearKey] && typeof rc[currentYearKey] === 'object') regions = rc[currentYearKey];
				else if (rc && rc.regions && typeof rc.regions === 'object') regions = rc.regions;
				planned = Object.keys(regions || []).filter(Boolean);
			}
		} catch (e) { planned = []; }
		const sorted = (Array.isArray(planned) ? planned.map(s => String(s).slice(0,10)).filter(Boolean).sort() : []);

		// determine previous ride date (the ride immediately before the next or last known ride)
		const todayIso = new Date().toISOString().slice(0,10);
		let next = sorted.find(d => d >= todayIso);
		if (!next) next = sorted[sorted.length - 1] || null;
		let prev = null;
		if (next) {
			const idx = sorted.indexOf(next);
			if (idx > 0) prev = sorted[idx - 1];
		} else if (sorted.length > 0) {
			prev = sorted[sorted.length - 1];
		}

		// fetch lunch doc to read updatedAt (server timestamp)
		let lunchUpdatedIso = null;
		try {
			if (db) {
				const lref = doc(db, 'globals', 'lunch');
				const snap = await getDoc(lref).catch(() => null);
				if (snap && (typeof snap.exists === 'function' ? snap.exists() : snap._document)) {
					const ld = typeof snap.data === 'function' ? snap.data() : snap;
					if (ld) lunchUpdatedIso = normalizeTimestampValue(ld.updatedAt || ld.lastUpdated || null) || null;
				}
			}
		} catch (e) { /* ignore fetch errors */ }

		let shouldHide = false;
		// if no previous ride, do not hide
		if (prev) {
			const prevEnd = new Date(prev + 'T23:59:59').getTime();
			if (!lunchUpdatedIso) shouldHide = true;
			else {
				const lu = new Date(lunchUpdatedIso).getTime();
				if (!isNaN(lu) && lu <= prevEnd) shouldHide = true; // older-or-equal to previous ride
			}
		}

		const overlayId = 'lunch-blocker-overlay';
		const mainEl = document.querySelector('main.main-content') || null;

		if (shouldHide) {
			try {
				const vastEl = document.getElementById('vastEtenDisplay');
				const keuzeWrap = document.getElementById('keuzeEtenButtons');
				const keuzeSection = document.getElementById('keuzeEtenSection');
				const vastSection = document.getElementById('vastEtenSection');
				if (vastEl) {
					vastEl.textContent = 'Lunch is nog niet vastgesteld voor de rit.';
					try { const sc = vastEl.closest && vastEl.closest('.surface-card'); if (sc) sc.classList.remove('surface-card--accent'); } catch(_) {}
				}
				if (keuzeWrap) keuzeWrap.innerHTML = '';
				if (keuzeSection) { keuzeSection.style.display = 'none'; keuzeSection.hidden = true; }
				if (vastSection) vastSection.classList.add('muted-section');
				if (keuzeSection) keuzeSection.classList.add('muted-section');
				// disable footer
				try { const btn = document.getElementById('agree-lunch'); if (btn) { btn.disabled = true; btn.setAttribute('aria-disabled','true'); btn.classList && btn.classList.add('disabled'); } } catch(_) {}

				// show blocking overlay over the main content so nothing can be filled
				try {
					let ov = document.getElementById(overlayId);
					if (!ov) {
						ov = document.createElement('div');
						ov.id = overlayId;
						ov.className = 'page-blocker-overlay';
						ov.innerHTML = '<div class="page-blocker-message">Lunch is nog niet vastgesteld voor de rit.</div>';
						if (mainEl) {
							try { const cs = getComputedStyle(mainEl); if (!cs || cs.position === 'static') mainEl.style.position = 'relative'; } catch(_) {}
							mainEl.appendChild(ov);
						} else {
							document.body.appendChild(ov);
						}
					}
				} catch(_) {}
			} catch(_) {}
		} else {
			// remove overlay if present
			try { const existing = document.getElementById(overlayId); if (existing) existing.remove(); } catch(_) {}
		}
	} catch (_) {}
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
				// clear member's gekozen lunch keuze (persist on footer click instead)
				try { /* delayed persist: clear on footer click */ } catch(_) {}
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
				// sessionStorage flag (persist on footer click instead)
				try { /* delayed persist */ } catch(_) {}
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
				try { /* delayed persist */ } catch(_) {}
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
				// update footer state
				try { updateJaarhangerFooterState(); } catch(_) {}
			} catch(_) {}
		}

		// try to read member session fields for jaarhanger choice
		let val = null;
		try { val = getMemberSessionField('Jaarhanger'); } catch(_) { val = null; }
		if (!val) {
			try { val = sessionStorage.getItem('Jaarhanger'); } catch(_) { val = null; }
		}
		if (val) applySelection(val);

		// wire change to update footer state
		for (const r of radios) {
			try {
				r.addEventListener('change', () => {
					try {
						// update footer state; do not persist here (footer click will persist)
						try { updateJaarhangerFooterState(); } catch(_) {}
					} catch(_) {}
				});
			} catch(_) {}
		}

		// ensure initial footer state reflects DOM/session
		try { updateJaarhangerFooterState(); } catch(_) {}
	} catch (e) { console.warn('setupJaarhangerHandlers failed', e); }
}

try { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupJaarhangerHandlers); else setupJaarhangerHandlers(); document.addEventListener('shadow:config-ready', setupJaarhangerHandlers); } catch(_) {}

// Enable/disable jaarhanger footer button based on current selection (DOM first, then session)
function updateJaarhangerFooterState() {
	try {
		const btn = document.getElementById('agree-jaarhanger');
		if (!btn) return;
		let enabled = false;
		try {
			const sel = document.querySelector('input[name="participation-jaarhanger"]:checked');
			if (sel) enabled = true;
		} catch(_) { enabled = false; }
		if (!enabled) {
			try {
				let val = getMemberSessionField('Jaarhanger');
				if (!val) val = sessionStorage.getItem('Jaarhanger');
				if (val && String(val).trim() !== '') enabled = true;
			} catch(_) {}
		}
		// toggle disabled state
		btn.disabled = !enabled;
		if (btn.disabled) { btn.classList && btn.classList.add('disabled'); btn.setAttribute('aria-disabled','true'); }
		else { btn.classList && btn.classList.remove('disabled'); btn.removeAttribute('aria-disabled'); }

		// If the selected option is explicitly 'nee', show a danger (red) footer button
		try {
			const sel = document.querySelector('input[name="participation-jaarhanger"]:checked');
			const isNee = sel ? ((sel.value||'').toString().toLowerCase().indexOf('nee') !== -1 || (sel.value||'').toString().toLowerCase().indexOf('sla') !== -1 || (sel.value||'').toString().toLowerCase() === 'no') : false;
			if (isNee) btn.classList.add('app-footer__button--danger'); else btn.classList.remove('app-footer__button--danger');
		} catch(_) {}
	} catch (e) { console.warn('updateJaarhangerFooterState failed', e); }
}

// Persist jaarhanger choice when the jaarhanger page footer is clicked
function setupJaarhangerFooterNavigation() {
	try {
		const btn = document.getElementById('agree-jaarhanger');
		if (!btn) return;
		if (btn.dataset && btn.dataset._jaarBound) return;
		btn.addEventListener('click', (e) => {
			try {
				e.preventDefault();
				// find selected radio
				const sel = document.querySelector('input[name="participation-jaarhanger"]:checked');
				let toSave = '';
				if (sel) {
					const v = (sel.value || '').toString().toLowerCase();
					if (v === 'yes' || v.indexOf('ja') !== -1) toSave = 'ja';
					else if (v === 'no' || v.indexOf('nee') !== -1) toSave = 'nee';
					else toSave = v || '';
				}
							if (toSave) {
								try { setMemberSessionField('Jaarhanger', toSave); } catch(_) { try { sessionStorage.setItem('Jaarhanger', toSave); } catch(_) {} }
							}
				// After saving, navigate to member info
				try { window.location.href = '../lid-ui/memberInfoPage.html'; } catch(_) { window.location.href = '/lid-ui/memberInfoPage.html'; }
			} catch(_) {}
		});
		if (btn.dataset) btn.dataset._jaarBound = '1';
	} catch (e) { console.warn('setupJaarhangerFooterNavigation failed', e); }
}

// Persist lunch choice when the lunch page footer is clicked
function setupLunchFooterNavigation() {
	try {
		const btn = document.getElementById('agree-lunch');
		if (!btn) return;
		if (btn.dataset && btn.dataset._lunchBound) return;
		btn.addEventListener('click', (e) => {
			try {
				e.preventDefault();
				// determine participation
				let deel = null;
				try { const sel = document.querySelector('input[name="participation-lunch"]:checked'); if (sel && sel.value) deel = (sel.value||'').toString().toLowerCase(); } catch(_) {}
				if (!deel) {
					try { deel = getMemberSessionField('lunchDeelname') || sessionStorage.getItem('lunchDeelname'); } catch(_) { deel = null; }
					if (typeof deel === 'string') deel = deel.toLowerCase();
				}

				// normalize to 'ja'/'nee'
				let toSaveDeel = '';
				if (deel && (deel === 'yes' || deel.indexOf('ja') !== -1)) toSaveDeel = 'ja';
				else if (deel && (deel === 'no' || deel.indexOf('nee') !== -1 || deel.indexOf('sla') !== -1)) toSaveDeel = 'nee';

				// If participating, capture chosen meal if any
				let toSaveKeuze = null;
				if (toSaveDeel === 'ja') {
					try { const chosen = document.querySelector('input[name="keuzeEten"]:checked'); if (chosen && typeof chosen.value !== 'undefined') toSaveKeuze = String(chosen.value); } catch(_) {}
					// fallback to session
					if (!toSaveKeuze) {
						try { toSaveKeuze = getMemberSessionField('lunchKeuze') || sessionStorage.getItem('lunchKeuze'); } catch(_) { toSaveKeuze = null; }
					}
				}

				// Persist into member shadow when possible
				try {
					if (toSaveDeel) setMemberSessionField('lunchDeelname', toSaveDeel);
					else setMemberSessionField('lunchDeelname', '');
					if (toSaveDeel === 'nee') {
						// remove previous keuze when not participating
						try { setMemberSessionField('lunchKeuze', null); } catch(_) {}
					} else if (toSaveKeuze) {
						try { setMemberSessionField('lunchKeuze', toSaveKeuze); } catch(_) {}
					}
				} catch(_) {
					try { if (toSaveDeel) sessionStorage.setItem('lunchDeelname', toSaveDeel); } catch(_) {}
					try { if (toSaveKeuze) sessionStorage.setItem('lunchKeuze', toSaveKeuze); else if (toSaveDeel==='nee') sessionStorage.removeItem('lunchKeuze'); } catch(_) {}
				}

				// After saving, navigate to jaarhanger page when Jaarhanger is not set, otherwise to member info
				try {
					let jah = null;
					try { jah = getMemberSessionField('Jaarhanger'); } catch(_) { jah = null; }
					if (!jah) try { jah = sessionStorage.getItem('Jaarhanger'); } catch(_) { jah = null; }
					jah = (jah || '').toString().trim();
					if (!jah) {
						try { window.location.href = '../lid-ui/jaarhangerPage.html'; } catch(_) { try { window.location.href = '/lid-ui/jaarhangerPage.html'; } catch(_) {} }
					} else {
						try { window.location.href = '../lid-ui/memberInfoPage.html'; } catch(_) { try { window.location.href = '/lid-ui/memberInfoPage.html'; } catch(_) {} }
					}
				} catch(_) {}
			} catch (err) { console.warn('agree-lunch handler failed', err); }
		});
		if (btn.dataset) btn.dataset._lunchBound = '1';
	} catch (e) { console.warn('setupLunchFooterNavigation failed', e); }
}


