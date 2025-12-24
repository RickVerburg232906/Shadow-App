// module: member.js — main page behaviors for lunch and signup
import { getPlannedDates, searchMembers, getMemberById, getLunchOptions } from './firestore.js';

/* Header short date */
function formatShortDutchDate(d = new Date()){
	const days = ['Zo','Ma','Di','Wo','Do','Vr','Za'];
	const months = ['Jan','Feb','Mrt','Apr','Mei','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
	return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}

function setHeaderDate(){
	const el = document.querySelector('.header-date');
	if(!el) return;
	el.textContent = formatShortDutchDate();
}

/* Planned rides rendering */
function formatLongDutchDateFromYMD(ymd){
	try{
		const [y,m,d] = ymd.split('-').map(Number);
		const months = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'];
		return `${months[m-1]} ${d}, ${y}`;
	}catch(e){ return ymd; }
}

function daysUntil(ymd){
	const today = new Date();
	const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
	const parts = ymd.split('-').map(Number);
	const d = new Date(parts[0], parts[1]-1, parts[2]);
	const diff = Math.round((d - t) / (1000*60*60*24));
	return diff;
}

function createRideNode(ymd){
	const diff = daysUntil(ymd);
	const longDate = formatLongDutchDateFromYMD(ymd);

	const outer = document.createElement('div');
	outer.className = 'card-wrapper';

	let badgeHtml = '';
	if (diff === 0) {
		badgeHtml = `<span class="badge badge-today">Vandaag</span>`;
	} else if (diff > 0) {
		const label = diff === 1 ? '1 dag' : `${diff} dagen`;
		badgeHtml = `<span class="badge badge-count">${label}</span>`;
	}

	outer.innerHTML = `
		<div class="card">
			<div style="text-align:left">
				<div class="ride-date">${longDate}</div>
			</div>
			<div>
				${badgeHtml}
			</div>
		</div>
	`;
	return outer;
}

export async function renderPlannedRides(selector = '.planned-rides'){
	try{
		const planned = await getPlannedDates();
		const list = (Array.isArray(planned) ? planned : []).map(s => s.slice(0,10)).filter(Boolean).sort();

		let container = document.querySelector(selector);
		if(!container){
			// Do not auto-create the container on pages that don't include it.
			// This prevents planned rides from being injected into pages like the signup page.
			return;
		}

		// Clear and build list into the existing container (header provided in HTML)
		container.innerHTML = '';
		const listWrap = document.createElement('div');
		listWrap.className = 'planned-list';
		for(const ymd of list){
			// skip dates that are already past
			if (daysUntil(ymd) < 0) continue;
			const node = createRideNode(ymd);
			listWrap.appendChild(node);
		}
		// empty state
		if (!listWrap.hasChildNodes()){
			const empty = document.createElement('div');
			empty.className = 'card-wrapper';
			empty.innerHTML = '<div class="card"><div class="ride-date">Geen geplande ritten</div></div>';
			listWrap.appendChild(empty);
		}
		container.appendChild(listWrap);
	}catch(e){ console.error('renderPlannedRides failed', e); }
}

// Init: run async init that waits for data to avoid flashes
async function init(){
	try{
		setHeaderDate();
		await renderPlannedRides();
		setupAgreeButton();
		setupBackButton();
		setupFormInputCapitalization();
		setupMemberSuggestions();
		setupParticipationToggle();
		setupSignupFooterNavigation();
		// load lunch options if present on the page
		try{ await setupLunchOptions(); }catch(_){ }
		// wire agree-lunch validation after lunch options rendered
		try{ setupAgreeLunchButton(); }catch(_){ }
		// wire jaarhanger footer button if present
		try{ setupAgreeJaarhanger(); }catch(_){ }
	}catch(e){ console.error('init failed', e); }
	// reveal page after initialization
	try{ document.body.classList.remove('is-loading'); }catch(e){}
}

function setupFormInputCapitalization(){
	try{
		function capitalizeFirst(el){
			const v = el.value || '';
			if(!v) return;
			const first = v.charAt(0);
			const capital = first.toUpperCase();
			if(first === capital) return;
			const start = el.selectionStart;
			const end = el.selectionEnd;
			el.value = capital + v.slice(1);
			if (typeof start === 'number' && typeof end === 'number') el.setSelectionRange(start, end);
		}

		document.querySelectorAll && document.querySelectorAll('.form-input').forEach(el => {
			el.addEventListener('input', () => capitalizeFirst(el));
		});
	}catch(e){ console.error('setupFormInputCapitalization failed', e); }
}

function setupMemberSuggestions(){
	try{
		const debounceMs = 500;

		function removeSuggestions(el){
			const wrap = el.closest('.icon-input');
			if(!wrap) return;
			const ex = wrap.querySelector('.suggestions');
			if(ex) ex.remove();
		}

		function renderSuggestions(el, items){
			removeSuggestions(el);
			if(!items || items.length === 0) return;
			const wrap = el.closest('.icon-input');
			if(!wrap) return;
			const box = document.createElement('div');
			box.className = 'suggestions';
			for(const it of items){
				const label = (it.voor && it.naam) ? `${it.voor} ${it.naam}` : (it.voor || it.naam || '');
				const row = document.createElement('div');
				row.className = 'suggestion-item';
				row.textContent = label;
				if (it.id) row.dataset.memberId = it.id;
				row.addEventListener('mousedown', (ev)=>{
					// mousedown so it fires before blur
					ev.preventDefault();
					el.value = label;
					// fetch full member document by id, store and dispatch
					(async function(id){
						try{
							const member = await getMemberById(id);
							console.debug('memberSelected (loaded):', member);
							try{ window.selectedMember = member; }catch(_){ }
							try{ sessionStorage.setItem('selectedMember', JSON.stringify(member || {})); }catch(_){ }
							try{ window.dispatchEvent(new CustomEvent('memberSelected', { detail: member })); }catch(_){ }
						}catch(e){ console.error('failed loading member', e); }
					})(it.id);
					removeSuggestions(el);
				});
				box.appendChild(row);
			}
			wrap.appendChild(box);
		}

		document.querySelectorAll('.form-input').forEach(el => {
			let timer = null;
			el.addEventListener('input', ()=>{
				// capitalisation is handled elsewhere; debounce search
				if (timer) clearTimeout(timer);
				const v = (el.value || '').trim();
				if(!v){ removeSuggestions(el); return; }
				timer = setTimeout(async ()=>{
					try{
						const results = await searchMembers(v, 8);
						renderSuggestions(el, results);
					}catch(e){ console.error('member suggestions failed', e); }
				}, debounceMs);
			});

			// clear input on click when it already has content
			el.addEventListener('click', ()=>{
				try{
					if (el.value && String(el.value).trim()){
						el.value = '';
						removeSuggestions(el);
					}
				}catch(e){ /* ignore */ }
			});

			// hide suggestions on blur (slight delay to allow click)
			el.addEventListener('blur', ()=> setTimeout(()=> removeSuggestions(el), 150));
		});
	}catch(e){ console.error('setupMemberSuggestions failed', e); }
}

if (document.readyState === 'loading'){
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}

function setupAgreeButton(){
	try{
		// attach to the index/home agree button (unique id)
		const btnIndex = document.getElementById('agree-index');
		if(btnIndex){
			btnIndex.addEventListener('click', ()=>{
				window.location.href = 'lid-ui/signupPage.html';
			});
		}
	}catch(e){ console.error('setupAgreeButton failed', e); }
}

function setupBackButton(){
	try{
		const b = document.getElementById('back-button');
		if(!b) return;
		b.addEventListener('click', ()=>{
			try{
				const current = (window.location.pathname||'').split('/').filter(Boolean).pop() || '';
				// If we're on the member info page, treat this as a Home button
				if (/memberinfopage/i.test(current)){
					window.location.href = '../index.html';
					return;
				}
				// Prefer history.back(); fallback to index.html
				if(window.history && window.history.length > 1){
					window.history.back();
				} else {
					window.location.href = '../index.html';
				}
			}catch(e){ try{ window.location.href = '../index.html'; }catch(_){} }
		});
	}catch(e){ console.error('setupBackButton failed', e); }
}

// Normalize and extract YMD scan dates from various possible member shapes
function getMemberScanYMDs(member){
	try{
		if (!member) return [];
		const candidates = [member.ScanDatums, member.scanDatums, member.ScanDatum, member.scanDatum, member.scanDates, member.ScanDates, member.ScanDatumList, member.scanDatumList];
		let raw = null;
		for (const c of candidates) { if (typeof c !== 'undefined' && c !== null) { raw = c; break; } }
		if (!raw) {
			for (const k of Object.keys(member || {})) {
				if (k.toLowerCase().includes('scan')) { raw = member[k]; break; }
			}
		}
		if (!raw) return [];
		const result = [];
		if (Array.isArray(raw)){
			for (const it of raw){
				if (!it) continue;
				if (typeof it === 'string'){ result.push(String(it).slice(0,10)); continue; }
				if (typeof it === 'object'){
					if (typeof it.seconds === 'number'){ try{ result.push(new Date(it.seconds*1000).toISOString().slice(0,10)); continue;}catch(_){} }
					if (it.value && typeof it.value === 'string'){ result.push(String(it.value).slice(0,10)); continue; }
					for (const pk of ['date','datum','scanDate','ScanDatum']){ if (it[pk]){ result.push(String(it[pk]).slice(0,10)); break; } }
				}
			}
			return Array.from(new Set(result)).filter(Boolean);
		}
		if (typeof raw === 'object'){
			for (const [k,v] of Object.entries(raw)){
				if (typeof k === 'string' && /^\d{4}-\d{2}-\d{2}/.test(k)) result.push(k.slice(0,10));
				if (v){ if (typeof v === 'string') result.push(v.slice(0,10)); else if (typeof v === 'object' && typeof v.seconds === 'number') result.push(new Date(v.seconds*1000).toISOString().slice(0,10)); }
			}
			return Array.from(new Set(result)).filter(Boolean);
		}
		if (typeof raw === 'string') return [raw.slice(0,10)];
		return [];
	}catch(e){ return []; }
}

function getStoredSelectedMember(){
	try{
		if (window.selectedMember) return window.selectedMember;
		const s = sessionStorage.getItem('selectedMember');
		if (s) return JSON.parse(s);
		return null;
	}catch(e){ return null; }
}

function setupSignupFooterNavigation(){
	try{
		// only wire the signup page footer button
		const btn = document.getElementById('agree-signup');
		if (!btn) return;
		btn.addEventListener('click', (ev) => {
			try{
				const member = getStoredSelectedMember();
				const scans = getMemberScanYMDs(member || {});
				const today = new Date().toISOString().slice(0,10);
				const hasToday = Array.isArray(scans) && scans.includes(today);
				console.debug('signup footer click - member:', member, 'scanYMDs:', scans, 'todayInScans:', hasToday);
				if (hasToday){
					// navigate to member info page
					window.location.href = 'memberInfoPage.html';
				} else {
					// navigate to lunch page
					window.location.href = 'lunchPage.html';
				}
			}catch(e){ console.error('signup footer navigation failed', e); }
		});
	}catch(e){ console.error('setupSignupFooterNavigation failed', e); }
}

// Toggle behavior for participation radios: when 'no' is selected, clear and disable keuzeEten choices and fade sections
function setupParticipationToggle(){
	try{
		const radios = Array.from(document.querySelectorAll('input[name="participation"]'));
		if(!radios || radios.length === 0) return;
		const vastSection = document.getElementById('vastEtenSection');
		const keuzeSection = document.getElementById('keuzeEtenSection');

		function applyNo(){
			// uncheck and disable all main_course radios
			const mains = Array.from(document.querySelectorAll('input[name="main_course"]'));
			mains.forEach(i => {
				try{ if(i.checked) i.checked = false; }catch(_){}
				try{ i.disabled = true; }catch(_){}
				try{ i.dispatchEvent(new Event('change', { bubbles: true })); }catch(_){}
			});
			// remove visual selections
			document.querySelectorAll('.choice-card.is-selected').forEach(n => n.classList.remove('is-selected'));
			// add muted class to containers and their parent sections (fade headers/badges too)
			if(vastSection) vastSection.classList.add('muted-section');
			if(keuzeSection) keuzeSection.classList.add('muted-section');
			try{ const vs = vastSection ? vastSection.closest('section') : null; if(vs) vs.classList.add('muted-section'); }catch(_){ }
			try{ const ks = keuzeSection ? keuzeSection.closest('section') : null; if(ks) ks.classList.add('muted-section'); }catch(_){ }
			// update footer button to reflect absence
			try{
				const btn = document.getElementById('agree-lunch');
				if(btn){ btn.textContent = 'Afwezigheid Bevestigen'; btn.classList.add('app-footer__button--danger'); }
				// also mark jaarhanger page footer button as danger when present
				const btnJ = document.getElementById('agree-jaarhanger');
				if(btnJ){ btnJ.classList.add('app-footer__button--danger'); }
			}catch(_){ }
		}

		function applyYes(){
			const mains = Array.from(document.querySelectorAll('input[name="main_course"]'));
			mains.forEach(i => { try{ i.disabled = false; }catch(_){}});
			if(vastSection) vastSection.classList.remove('muted-section');
			if(keuzeSection) keuzeSection.classList.remove('muted-section');
			try{ const vs = vastSection ? vastSection.closest('section') : null; if(vs) vs.classList.remove('muted-section'); }catch(_){ }
			try{ const ks = keuzeSection ? keuzeSection.closest('section') : null; if(ks) ks.classList.remove('muted-section'); }catch(_){ }
			// restore footer button text and style
			try{
				const btn = document.getElementById('agree-lunch');
				if(btn){ btn.textContent = 'Keuze Bevestigen'; btn.classList.remove('app-footer__button--danger'); }
				const btnJ = document.getElementById('agree-jaarhanger');
				if(btnJ){ btnJ.classList.remove('app-footer__button--danger'); }
			}catch(_){ }
		}

		radios.forEach(r => {
			// Prevent mouse-clicking the label from causing the browser to scroll
			// into view for the visually-hidden radio. Handle click on the label
			// by checking the input and focusing it without scrolling.
			try{
				const lbl = r.closest('.choice-option');
				if (lbl){
					lbl.addEventListener('click', (ev)=>{
						ev.preventDefault();
						try{ r.focus({ preventScroll: true }); }catch(_){ try{ r.focus(); }catch(_){} }
						if (!r.checked){ r.checked = true; }
						try{ r.dispatchEvent(new Event('change', { bubbles: true })); }catch(_){}
					});
				}
			}catch(_){ }

			r.addEventListener('change', ()=>{
				try{
					if(!r.checked) return;
					if(r.value === 'no') applyNo();
					else applyYes();
				}catch(e){ console.error('participation change handler', e); }
			});
		});

		// initialize based on current selection
		const cur = document.querySelector('input[name="participation"]:checked');
		if(cur){ if(cur.value === 'no') applyNo(); else applyYes(); }
	}catch(e){ console.error('setupParticipationToggle failed', e); }
}

// Load and render lunch options from Firestore globals/lunch
async function setupLunchOptions(){
	try{
		const vastEl = document.getElementById('vastEtenDisplay');
		const keuzeWrap = document.getElementById('keuzeEtenButtons');
		if(!vastEl && !keuzeWrap) return; // nothing to do on this page

		// show loading state
		if(vastEl) vastEl.textContent = 'Laden...';
		if(keuzeWrap) keuzeWrap.innerHTML = '';

		const opts = await getLunchOptions();
		const vast = Array.isArray(opts.vastEten) ? opts.vastEten : [];
		const keuze = Array.isArray(opts.keuzeEten) ? opts.keuzeEten : [];

		if(vastEl){
			// Render each item as its own row with dividers (matches screenshot 1)
			vastEl.innerHTML = '';
			const list = document.createElement('div');
			list.className = 'vast-list';
			if(vast.length === 0){
				const e = document.createElement('div');
				e.className = 'muted-text';
				e.textContent = 'Geen vast eten beschikbaar';
				list.appendChild(e);
			} else {
				for (let i = 0; i < vast.length; i++){
					const text = vast[i];
					const row = document.createElement('div');
					row.className = 'vast-row';
					row.textContent = text;
					list.appendChild(row);
					if (i < vast.length - 1){
						const divider = document.createElement('div');
						divider.className = 'vast-divider';
						list.appendChild(divider);
					}
				}
			}
			vastEl.appendChild(list);
		}

		if(keuzeWrap){
			if(keuze.length === 0){
				const e = document.createElement('div');
				e.className = 'muted-text';
				e.textContent = 'Geen keuzemogelijkheden';
				keuzeWrap.appendChild(e);
			} else {
				// render as radio-based choice cards (no default checked)
				for(const k of keuze){
					const lbl = document.createElement('label');
					lbl.className = 'choice-option';

					const input = document.createElement('input');
					input.type = 'radio';
					input.name = 'main_course';
					input.value = k;
					input.className = 'choice-card-input sr-only';

					const card = document.createElement('div');
					card.className = 'choice-card';
					const body = document.createElement('div');
					body.className = 'choice-card__body';
					const title = document.createElement('p');
					title.className = 'choice-card__title';
					title.textContent = k;
					body.appendChild(title);
					card.appendChild(body);

					// wire selection visual state
					input.addEventListener('change', ()=>{
						const currently = keuzeWrap.querySelectorAll('.choice-card.is-selected');
						currently.forEach(n => n.classList.remove('is-selected'));
						if (input.checked) card.classList.add('is-selected');
					});

					lbl.appendChild(input);
					lbl.appendChild(card);
					keuzeWrap.appendChild(lbl);
				}
			}
		}
	}catch(e){ console.error('setupLunchOptions failed', e); }
}

// Enable the lunch confirmation button only when required values are present
function isLunchFormValid(){
	try{
		const participation = document.querySelector('input[name="participation"]:checked');
		if(!participation) return false;
		if(String(participation.value) === 'yes'){
			// If there are no choice options at all, treat as valid (only yes/no required)
			const anyMainExists = document.querySelector('input[name="main_course"]');
			if(!anyMainExists) return true;
			// require a main_course selection when options exist
			const main = document.querySelector('input[name="main_course"]:checked');
			return !!main;
		}
		return true; // 'no' is a valid selection
	}catch(e){ return false; }
}

function updateAgreeLunchButton(){
	try{
		const btn = document.getElementById('agree-lunch');
		if(!btn) return;
		const valid = isLunchFormValid();
		btn.disabled = !valid;
		btn.setAttribute('aria-disabled', String(!valid));
	}catch(e){ }
}

function setupAgreeLunchButton(){
	try{
		const btn = document.getElementById('agree-lunch');
		if(!btn) return;

		// initialize state
		updateAgreeLunchButton();

		// Recompute when participation changes
		document.querySelectorAll('input[name="participation"]').forEach(r => r.addEventListener('change', ()=> updateAgreeLunchButton()));
		// Recompute when a main_course radio changes (these are added dynamically)
		document.addEventListener('change', (ev)=>{
			const t = ev.target;
			if(t && t.name === 'main_course') updateAgreeLunchButton();
		}, { passive: true });

		// Prevent clicks when invalid (defensive)
		btn.addEventListener('click', (ev)=>{
			if(btn.disabled){ ev.preventDefault(); ev.stopPropagation(); return; }
			// When valid, route based on whether the stored member has a Jaarhanger value
			try{
				const member = getStoredSelectedMember();
				const hasJ = hasJaarhanger(member);
				if(hasJ){ window.location.href = 'memberInfoPage.html'; }
				else { window.location.href = 'jaarhangerPage.html'; }
			}catch(e){ console.error('agree-lunch click handler failed', e); }
		});
	}catch(e){ console.error('setupAgreeLunchButton failed', e); }
}

// Determine whether the provided member object contains a Jaarhanger value
function hasJaarhanger(member){
	try{
		if(!member || typeof member !== 'object') return false;
		const candidates = ['Jaarhanger','jaarhanger','JaarHanger','JaarhangerAfgekort','JaarHangerAfgekort'];
		for(const k of candidates){ if(Object.prototype.hasOwnProperty.call(member, k)){ const v = member[k]; if(v === null || typeof v === 'undefined') return false; if(typeof v === 'string' && v.trim() === '') return false; return true; } }
		// fallback: check any key that includes 'jaar' and 'hanger' or 'jaarhanger'
		for(const k of Object.keys(member||{})){
			const lk = String(k).toLowerCase();
			if(lk.includes('jaar') && lk.includes('hanger')){
				const v = member[k]; if(v === null || typeof v === 'undefined') return false; if(typeof v === 'string' && v.trim() === '') return false; return true;
			}
		}
		return false;
	}catch(e){ return false; }
}

// Wire the jaarhanger page footer button to go to member info
function setupAgreeJaarhanger(){
	try{
		const btn = document.getElementById('agree-jaarhanger');
		if(!btn) return;
		btn.addEventListener('click', (ev)=>{
			try{
				if(btn.disabled) { ev.preventDefault(); ev.stopPropagation(); return; }
				window.location.href = 'memberInfoPage.html';
			}catch(e){ console.error('agree-jaarhanger click failed', e); }
		});
	}catch(e){ console.error('setupAgreeJaarhanger failed', e); }
}