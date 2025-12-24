import { getPlannedDates, searchMembers, getMemberById } from './firestore.js';

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
		setupSignupFooterNavigation();
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
			// Prefer history.back(); fallback to index.html
			if(window.history && window.history.length > 1){
				window.history.back();
			} else {
				window.location.href = '../index.html';
			}
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
