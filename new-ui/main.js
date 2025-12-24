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
			// create a container under main if none exists
			const main = document.querySelector('.main-content') || document.querySelector('main') || document.body;
			container = document.createElement('div');
			container.className = selector.replace(/^\./,'');
			main.appendChild(container);
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

// Init
if (document.readyState === 'loading'){
	document.addEventListener('DOMContentLoaded', ()=>{ setHeaderDate(); renderPlannedRides(); });
} else {
	setHeaderDate(); renderPlannedRides();
}

