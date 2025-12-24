import { getPlannedDates } from './firestore.js';

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
	}catch(e){ console.error('init failed', e); }
	// reveal page after initialization
	try{ document.body.classList.remove('is-loading'); }catch(e){}
}

if (document.readyState === 'loading'){
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}

function setupAgreeButton(){
	try{
		const btn = document.getElementById('agree-button');
		if(!btn) return;
		btn.addEventListener('click', ()=>{
			// Navigate to the signup page (relative to site root)
			window.location.href = 'lid-ui/signupPage.html';
		});
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

