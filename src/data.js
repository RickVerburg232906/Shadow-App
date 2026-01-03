// src/data.js
// Populate the ride years strip and the per-year chart on the Data admin page.
import { getRideConfig, initFirebase, db, collection, getDocs } from './firebase.js';

(async function(){
  try {
    let dataCache = null;
    try { dataCache = JSON.parse(sessionStorage.getItem('datapage_cache') || 'null'); } catch(_) { dataCache = null; }
    const strip = document.getElementById('ride-years-strip') || document.body;

    const CACHE_TTL = 5 * 60 * 1000;
    function cacheRead(key) {
      try {
        if (!dataCache || !dataCache._cache || !dataCache._cache[key]) return null;
        const e = dataCache._cache[key];
        if (!e || typeof e.ts !== 'number') return null;
        if ((Date.now() - e.ts) > (e.ttl || CACHE_TTL)) { delete dataCache._cache[key]; try { sessionStorage.setItem('datapage_cache', JSON.stringify(dataCache)); } catch(_){} return null; }
        return e.value;
      } catch(_) { return null; }
    }
    function cacheWrite(key, value, ttl) {
      try {
        dataCache = dataCache || {};
        dataCache._cache = dataCache._cache || {};
        dataCache._cache[key] = { ts: Date.now(), ttl: (typeof ttl === 'number' ? ttl : CACHE_TTL), value };
        try { sessionStorage.setItem('datapage_cache', JSON.stringify(dataCache)); } catch(_){ }
      } catch(_){ }
    }

    function extractYear(val) {
      try {
        if (!val && val !== 0) return null;
        if (typeof val === 'string') {
          const m = val.match(/^\s*(\d{4})/);
          if (m) return Number(m[1]);
          const d = new Date(val);
          if (!isNaN(d)) return d.getFullYear();
          return null;
        }
        if (typeof val === 'number') {
          if (String(val).length === 4) return Number(val);
          const d = new Date(val);
          if (!isNaN(d)) return d.getFullYear();
          const ds = new Date(val*1000);
          if (!isNaN(ds)) return ds.getFullYear();
        }
        if (val instanceof Date) return val.getFullYear();
        if (typeof val === 'object') {
          if (typeof val.toDate === 'function') {
            try { const d = val.toDate(); if (d instanceof Date && !isNaN(d)) return d.getFullYear(); } catch(_){ }
          }
          if (typeof val.seconds === 'number') return (new Date(val.seconds*1000)).getFullYear();
        }
      } catch(_){}
      return null;
    }

    // Build and render year chips
    let cfg = null;
    try { cfg = cacheRead('rideConfig') || await getRideConfig(); } catch(_) { cfg = null; }
    if (cfg) { try { cacheWrite('rideConfig', cfg, 60*1000); } catch(_){} }
    strip.innerHTML = '';
    if (!cfg || typeof cfg !== 'object') { strip.innerHTML = '<div class="year-chip">Geen jaren</div>'; return; }
    const years = Object.keys(cfg).filter(k => /^\d{4}$/.test(k)).sort((a,b)=>Number(b)-Number(a));
    if (!years.length) { strip.innerHTML = '<div class="year-chip">Geen jaren</div>'; return; }
    for (const y of years) {
      const btn = document.createElement('button'); btn.type='button'; btn.className='year-chip'; btn.textContent=y; btn.dataset.year=y; btn.setAttribute('aria-pressed','false');
      btn.addEventListener('click', ()=>{
        const isSelected = btn.classList.contains('selected');
        if (isSelected) { btn.classList.remove('selected'); btn.setAttribute('aria-pressed','false'); }
        else { btn.classList.add('selected'); btn.setAttribute('aria-pressed','true'); }
        const selectedYears = Array.from(strip.querySelectorAll('.year-chip.selected')).map(el=>el.dataset.year);
        document.dispatchEvent(new CustomEvent('ride:years:changed', { detail: { years: selectedYears } }));
      });
      strip.appendChild(btn);
    }
    // Auto select current or first
    try {
      const currentYear = String((new Date()).getFullYear());
      let sel = strip.querySelector(`.year-chip[data-year="${currentYear}"]`);
      if (!sel && years.length) sel = strip.querySelector(`.year-chip[data-year="${years[0]}"]`);
      if (sel) { sel.classList.add('selected'); sel.setAttribute('aria-pressed','true'); const yrs = Array.from(strip.querySelectorAll('.year-chip.selected')).map(el=>el.dataset.year); document.dispatchEvent(new CustomEvent('ride:years:changed', { detail: { years: yrs } })); }
    } catch(_){ }

    // Fetch simple per-year counts from members collection
    async function fetchCountsForYears(selectedYears) {
      try {
        const out = {};
        for (const y of selectedYears) out[String(y)] = 0;
        const cacheKey = 'members_year_counts_simple_' + String(selectedYears.slice().sort().join(','));
        const cached = cacheRead(cacheKey); if (cached) return cached;
        try { await initFirebase(); } catch(_){ }
        if (!db) return out;
        const coll = collection(db, 'members');
        const snap = await getDocs(coll).catch(()=>null);
        if (!snap || !Array.isArray(snap.docs)) return out;
        for (const sdoc of snap.docs) {
          try {
            const data = typeof sdoc.data === 'function' ? sdoc.data() : sdoc;
            const raw = data && (data.ScanDatums || data.scandatums || data.scans) ? (data.ScanDatums || data.scandatums || data.scans) : null;
            if (!Array.isArray(raw)) continue;
            for (const entry of raw) {
              try {
                const yr = extractYear(entry);
                if (!yr) continue;
                const ys = String(yr);
                if (Object.prototype.hasOwnProperty.call(out, ys)) out[ys] = (out[ys] || 0) + 1;
              } catch(_){ }
            }
          } catch(_){ }
        }
        try { cacheWrite(cacheKey, out, 60*1000); } catch(_){ }
        return out;
      } catch(_) { return selectedYears.reduce((acc,y)=>(acc[y]=0,acc),{}); }
    }

    // Fetch distinct member-region names from members collection (cached)
    async function fetchMemberRegions() {
      try {
        const cacheKey = 'member_regions_global';
        const cached = cacheRead(cacheKey);
        if (cached) return cached.slice();
        try { await initFirebase(); } catch(_){ }
        if (!db) return [];
        const coll = collection(db, 'members');
        const snap = await getDocs(coll).catch(()=>null);
        const set = new Set();
        if (snap && Array.isArray(snap.docs)) {
          for (const sdoc of snap.docs) {
            try {
              const data = typeof sdoc.data === 'function' ? sdoc.data() : sdoc;
              const possible = data && (data['Regio Omschrijving'] || data.RegioOmschrijving || data.regioOmschrijving || data.regio || data.region || data.regionName || data.regionnaam || data.regio_omschrijving);
              if (possible && String(possible).trim()) set.add(String(possible).trim());
            } catch(_){ }
          }
        }
        const out = Array.from(set).sort();
        try { cacheWrite(cacheKey, out, 10*60*1000); } catch(_){ }
        return out;
      } catch(_) { return []; }
    }

    // Fetch counts per region for each selected year
    async function fetchCountsByRegionPerYear(selectedYears) {
      try {
        const out = {};
        for (const y of selectedYears) out[String(y)] = { total: 0, regions: {} };
        const cacheKey = 'members_region_counts_' + String(selectedYears.slice().sort().join(','));
        const cached = cacheRead(cacheKey); if (cached) return cached;
        try { await initFirebase(); } catch(_){ }
        if (!db) return out;
        const coll = collection(db, 'members');
        const snap = await getDocs(coll).catch(()=>null);
        if (!snap || !Array.isArray(snap.docs)) return out;
        for (const sdoc of snap.docs) {
          try {
            const data = typeof sdoc.data === 'function' ? sdoc.data() : sdoc;
            const raw = data && (data.ScanDatums || data.scandatums || data.scans) ? (data.ScanDatums || data.scandatums || data.scans) : null;
            if (!Array.isArray(raw)) continue;
            // determine member region for this document
            let memberRegion = 'Onbekend';
            try {
              const possible = data && (data['Regio Omschrijving'] || data.RegioOmschrijving || data.regioOmschrijving || data.regio || data.region || data.regionName || data.regionnaam || data.regio_omschrijving);
              if (possible && String(possible).trim()) memberRegion = String(possible).trim();
            } catch(_){ }
            for (const entry of raw) {
              try {
                const yr = extractYear(entry);
                if (!yr) continue;
                const ys = String(yr);
                if (!Object.prototype.hasOwnProperty.call(out, ys)) continue;
                out[ys].total = (out[ys].total || 0) + 1;
                out[ys].regions[memberRegion] = (out[ys].regions[memberRegion] || 0) + 1;
              } catch(_){ }
            }
          } catch(_){ }
        }
        try { cacheWrite(cacheKey, out, 60*1000); } catch(_){ }
        return out;
      } catch(_) { return selectedYears.reduce((acc,y)=>(acc[String(y)]={total:0,regions:{}},acc),{}); }
    }

    // Chart rendering
    let yearChartInstance = null;
    let perRideChartInstance = null;
    async function renderChartForYears(selectedYears) {
      try {
        const chartContainer = document.getElementById('ride-years-chart') || (function(){ const c = document.getElementById('ride-years-chart-container'); if (c) return c.appendChild(document.createElement('div')) && document.getElementById('ride-years-chart'); return null; })();
        const container = document.getElementById('ride-years-chart-container') || chartContainer || document.body;
        // Ensure any existing chart on this canvas is destroyed and canvas removed, then create a fresh canvas
        try {
          const existingCanvas = document.getElementById('yearSummaryChart');
          if (existingCanvas) {
            try { const existingChart = (typeof Chart !== 'undefined' && Chart && typeof Chart.getChart === 'function') ? Chart.getChart(existingCanvas) : null; if (existingChart) try{ existingChart.destroy(); }catch(_){} } catch(_){}
            try { existingCanvas.remove(); } catch(_){}
          }
        } catch(_){}
        let canvas = document.createElement('canvas'); canvas.id = 'yearSummaryChart'; canvas.style.width='100%'; canvas.style.height='100%'; container.innerHTML = ''; container.appendChild(canvas);
        if (!Array.isArray(selectedYears) || selectedYears.length === 0) {
          if (yearChartInstance) try{ yearChartInstance.destroy(); }catch(_){}
          yearChartInstance=null;
          try { const existing = (typeof Chart !== 'undefined' && Chart && typeof Chart.getChart === 'function') ? Chart.getChart(canvas) : null; if (existing) try{ existing.destroy(); }catch(_){ } } catch(_){}
          container.innerHTML = '<div class="chart-empty">Geen jaar geselecteerd</div>';
          return;
        }
        const yearsToShow = selectedYears.slice().sort((a,b)=>Number(a)-Number(b));
        const counts = await fetchCountsForYears(yearsToShow);
        const dataArr = yearsToShow.map(y => Number(counts[String(y)] || 0));
        if (yearChartInstance) try{ yearChartInstance.destroy(); }catch(_){} yearChartInstance = null;
        // build region breakdown for tooltips
        const regionBreakdown = await fetchCountsByRegionPerYear(yearsToShow).catch(()=>({}));

        // build stacked datasets per region so each year bar shows region distribution
        const regions = await fetchMemberRegions().catch(()=>[]);
        const regionList = Array.isArray(regions) && regions.length ? regions : (function(){
          // fallback: derive regions from regionBreakdown
          const s = new Set();
          for (const y of yearsToShow) {
            const r = regionBreakdown && regionBreakdown[y] && regionBreakdown[y].regions ? Object.keys(regionBreakdown[y].regions) : [];
            for (const k of r) s.add(k);
          }
          return Array.from(s);
        })();

        const regionDatasets = regionList.map(rname => {
          const data = yearsToShow.map(y => (regionBreakdown && regionBreakdown[y] && regionBreakdown[y].regions && typeof regionBreakdown[y].regions[rname] !== 'undefined') ? regionBreakdown[y].regions[rname] : 0);
          return { label: rname || 'Onbekend', data, backgroundColor: getColorForRegion(rname) };
        });

        // size canvas appropriately
        try { ensureCanvasHeight(canvas, 180); } catch(_){}
        // compute stacked max to keep y-axis integer ticks
        let maxStack = 0;
        try {
          for (let i=0;i<yearsToShow.length;i++) {
            let s = 0;
            for (const ds of regionDatasets) s += Number(ds.data && ds.data[i] ? ds.data[i] : 0);
            if (s > maxStack) maxStack = s;
          }
        } catch(_) { maxStack = Math.max.apply(null, dataArr.concat([0])); }
        const suggestedMaxYear = Math.max(1, Math.ceil(maxStack));

        yearChartInstance = new Chart(canvas, {
          type: 'bar',
          data: { labels: yearsToShow, datasets: regionDatasets },
          options: {
            plugins: {
              title: { display: true, text: (document.getElementById('ride-years-chart-title')||{}).textContent || 'Inschrijvingen per jaar' },
              legend: { display: true },
              tooltip: {
                displayColors: false,
                callbacks: {
                  label: function(context) {
                    try {
                      const year = String(context.label || context.raw);
                      const info = regionBreakdown && regionBreakdown[year] ? regionBreakdown[year] : null;
                      if (info && info.regions) {
                        const regs = Object.keys(info.regions).sort((a,b)=> (info.regions[b]||0) - (info.regions[a]||0));
                        const lines = [];
                        for (const r of regs) lines.push(r + ': ' + (info.regions[r]||0));
                        return lines;
                      }
                      return '';
                    } catch(_) { return ''; }
                  }
                }
              }
            },
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: { x: { stacked: true, beginAtZero: true }, y: { stacked: true, beginAtZero: true, suggestedMax: suggestedMaxYear, ticks: { stepSize: 1, precision: 0 } } }
          }
        });
        // (regions legend removed)
      } catch(e){ console.warn('renderChartForYears error', e); }
    }

    // Fetch counts per ride index across selected years (produce per-year arrays)
    async function fetchCountsPerRide(selectedYears) {
      try {
        const years = (Array.isArray(selectedYears) ? selectedYears.slice().sort((a,b)=>Number(a)-Number(b)) : []).map(String);
        const cacheKey = 'members_per_ride_counts_' + years.join(',');
        const cached = cacheRead(cacheKey); if (cached) return cached;
        try { await initFirebase(); } catch(_){ }
        const out = { labels: [], years: years, countsByYear: {}, breakdown: {} };
        if (!db) return out;
        function plannedDatesForYear(y) {
          try {
            if (!cfg || typeof cfg !== 'object') return [];
            if (cfg[String(y)] && typeof cfg[String(y)] === 'object') {
              const keys = Object.keys(cfg[String(y)]).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)); keys.sort(); return keys;
            }
            if (Array.isArray(cfg.plannedDates)) {
              return cfg.plannedDates.filter(d => String(d).indexOf(String(y)) === 0);
            }
            if (cfg.regions && typeof cfg.regions === 'object') {
              const keys = Object.keys(cfg.regions).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)); return keys.filter(k=>String(k).indexOf(String(y))===0).sort();
            }
            return [];
          } catch(_) { return []; }
        }
        // prepare planned dates per year and determine max rides
        const plannedByYear = {};
        let maxRides = 0;
        for (const y of years) {
          const pd = plannedDatesForYear(y) || [];
          plannedByYear[y] = pd;
          if (pd.length > maxRides) maxRides = pd.length;
        }
        // labels
        for (let i=0;i<maxRides;i++) out.labels.push('Rit ' + (i+1));
        // init per-year arrays and breakdown structure
        for (const y of years) {
          out.countsByYear[y] = new Array(maxRides).fill(0);
          out.breakdown[y] = new Array(maxRides).fill(null).map(()=>({ total:0, regions: {} }));
        }
        out.plannedByYear = plannedByYear;

        const coll = collection(db, 'members');
        const snap = await getDocs(coll).catch(()=>null);
        if (!snap || !Array.isArray(snap.docs)) { try { cacheWrite(cacheKey, out, 30*1000); } catch(_){} return out; }
        for (const sdoc of snap.docs) {
          try {
            const data = typeof sdoc.data === 'function' ? sdoc.data() : sdoc;
            const scans = Array.isArray(data.ScanDatums) ? data.ScanDatums : (Array.isArray(data.scandatums) ? data.scandatums : (Array.isArray(data.scans) ? data.scans : []));
            if (!Array.isArray(scans) || scans.length === 0) continue;
            let memberRegion = 'Onbekend';
            try {
              const possible = data && (data['Regio Omschrijving'] || data.RegioOmschrijving || data.regioOmschrijving || data.regio || data.region || data.regionName || data.regionnaam || data.regio_omschrijving);
              if (possible && String(possible).trim()) memberRegion = String(possible).trim();
            } catch(_){}
            const norm = new Set(scans.map(s => {
              try { const d = new Date(s); if (!isNaN(d)) return d.toISOString().slice(0,10); if (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)) return s; return String(s).slice(0,10); } catch(_) { return String(s); }
            }));
            for (const y of years) {
              const pd = plannedByYear[y] || [];
              for (let i=0;i<pd.length;i++) {
                const d = pd[i]; if (!d) continue;
                if (norm.has(String(d))) {
                  out.countsByYear[y][i] = (out.countsByYear[y][i] || 0) + 1;
                  out.breakdown[y][i].total = (out.breakdown[y][i].total || 0) + 1;
                  out.breakdown[y][i].regions[memberRegion] = (out.breakdown[y][i].regions[memberRegion] || 0) + 1;
                }
              }
            }
          } catch(_){}
        }
        try { cacheWrite(cacheKey, out, 60*1000); } catch(_){}
        return out;
      } catch(_) { return { labels: [], years: [], countsByYear: {}, breakdown: {} }; }
    }

    // Fetch counts per ride index grouped by region for tooltip breakdown (per year)
    async function fetchCountsByRegionPerRide(selectedYears) {
      try {
        const years = (Array.isArray(selectedYears) ? selectedYears.slice().sort((a,b)=>Number(a)-Number(b)) : []).map(String);
        const cacheKey = 'members_per_ride_region_counts_' + years.join(',');
        const cached = cacheRead(cacheKey); if (cached) return cached;
        try { await initFirebase(); } catch(_){ }
        const out = { labels: [], years: years, countsByYear: {}, breakdown: {} };
        if (!db) return out;
        function plannedDatesForYear(y) {
          try {
            if (!cfg || typeof cfg !== 'object') return [];
            if (cfg[String(y)] && typeof cfg[String(y)] === 'object') {
              const keys = Object.keys(cfg[String(y)]).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)); keys.sort(); return keys;
            }
            if (Array.isArray(cfg.plannedDates)) {
              return cfg.plannedDates.filter(d => String(d).indexOf(String(y)) === 0);
            }
            if (cfg.regions && typeof cfg.regions === 'object') {
              const keys = Object.keys(cfg.regions).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)); return keys.filter(k=>String(k).indexOf(String(y))===0).sort();
            }
            return [];
          } catch(_) { return []; }
        }
        const plannedByYear = {};
        let maxRides = 0;
        for (const y of years) {
          const pd = plannedDatesForYear(y) || [];
          plannedByYear[y] = pd;
          if (pd.length > maxRides) maxRides = pd.length;
        }
        for (let i=0;i<maxRides;i++) out.labels.push('Rit ' + (i+1));
        for (const y of years) {
          out.countsByYear[y] = new Array(maxRides).fill(0);
          out.breakdown[y] = new Array(maxRides).fill(null).map(()=>({ total:0, regions: {} }));
        }

        const coll = collection(db, 'members');
        const snap = await getDocs(coll).catch(()=>null);
        if (!snap || !Array.isArray(snap.docs)) { try { cacheWrite(cacheKey, out, 30*1000); } catch(_){} return out; }
        for (const sdoc of snap.docs) {
          try {
            const data = typeof sdoc.data === 'function' ? sdoc.data() : sdoc;
            const scans = Array.isArray(data.ScanDatums) ? data.ScanDatums : (Array.isArray(data.scandatums) ? data.scandatums : (Array.isArray(data.scans) ? data.scans : []));
            if (!Array.isArray(scans) || scans.length === 0) continue;
            let memberRegion = 'Onbekend';
            try {
              const possible = data && (data['Regio Omschrijving'] || data.RegioOmschrijving || data.regioOmschrijving || data.regio || data.region || data.regionName || data.regionnaam || data.regio_omschrijving);
              if (possible && String(possible).trim()) memberRegion = String(possible).trim();
            } catch(_){}
            const norm = new Set(scans.map(s => { try { const d = new Date(s); if (!isNaN(d)) return d.toISOString().slice(0,10); if (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)) return s; return String(s).slice(0,10); } catch(_) { return String(s); } }));
            for (const y of years) {
              const pd = plannedByYear[y] || [];
              for (let i=0;i<pd.length;i++) {
                const d = pd[i]; if (!d) continue;
                if (norm.has(String(d))) {
                  out.countsByYear[y][i] = (out.countsByYear[y][i]||0) + 1;
                  out.breakdown[y][i].total = (out.breakdown[y][i].total || 0) + 1;
                  out.breakdown[y][i].regions[memberRegion] = (out.breakdown[y][i].regions[memberRegion] || 0) + 1;
                }
              }
            }
          } catch(_){}
        }
        try { cacheWrite(cacheKey, out, 60*1000); } catch(_){}
        return out;
      } catch(_) { return { labels: [], years: [], countsByYear: {}, breakdown: {} }; }
    }

    // Render per-ride chart (x-axis Rit 1, Rit 2, ...)
    async function renderPerRideChart(selectedYears) {
      try {
        const container = document.getElementById('per-ride-chart-container') || document.body;
        // Ensure existing perRide canvas/chart removed so Chart.js won't complain about reusing canvas
        try {
          const existingCanvas = document.getElementById('perRideChart');
          if (existingCanvas) {
            try { const existingChart = (typeof Chart !== 'undefined' && Chart && typeof Chart.getChart === 'function') ? Chart.getChart(existingCanvas) : null; if (existingChart) try{ existingChart.destroy(); }catch(_){} } catch(_){}
            try { existingCanvas.remove(); } catch(_){}
          }
        } catch(_){}
        let canvas = document.createElement('canvas'); canvas.id = 'perRideChart'; canvas.style.width='100%'; canvas.style.height='240px'; container.innerHTML = ''; container.appendChild(canvas);
        if (!Array.isArray(selectedYears) || selectedYears.length === 0) {
          if (perRideChartInstance) try{ perRideChartInstance.destroy(); }catch(_){}
          perRideChartInstance=null;
          try { const existing = (typeof Chart !== 'undefined' && Chart && typeof Chart.getChart === 'function') ? Chart.getChart(canvas) : null; if (existing) try{ existing.destroy(); }catch(_){ } } catch(_){}
          container.innerHTML = '<div class="chart-empty">Geen rit geselecteerd</div>';
          return;
        }
        const data = await fetchCountsPerRide(selectedYears);
        let labels = Array.isArray(data.labels) ? data.labels.slice() : [];
          // determine sort mode (segmented control or legacy select)
          const sortEl = document.getElementById('per-ride-sort-mode');
          let sortMode = 'chronologisch';
          try {
            if (sortEl) {
              // segmented control: look for active button
              const activeBtn = sortEl.querySelector && sortEl.querySelector('.seg-btn.active');
              if (activeBtn && activeBtn.dataset && activeBtn.dataset.mode) sortMode = String(activeBtn.dataset.mode || 'chronologisch');
              else if (typeof sortEl.value === 'string' && sortEl.value) sortMode = String(sortEl.value);
            }
          } catch(_){ sortMode = 'chronologisch'; }
          // build per-ride region breakdown for tooltips
        const counts = Array.isArray(data.counts) ? data.counts : [];
        // build per-ride region breakdown for tooltips
        const perRideDetail = await fetchCountsByRegionPerRide(selectedYears).catch(()=>({ breakdown: {} }));
            // If sorting by region, aggregate rides by their ride-region per year and use regions as x-axis
            let datasets = [];
            if (sortMode === 'regio' && Array.isArray(perRideDetail.years) && perRideDetail.years.length) {
              const plannedByYear = data && data.plannedByYear ? data.plannedByYear : {};
              const regionSet = new Set();
              for (const y of perRideDetail.years) {
                const planned = Array.isArray(plannedByYear[y]) ? plannedByYear[y] : [];
                for (const date of planned) {
                  try {
                    let rr = 'Onbekend';
                    if (cfg && cfg[y] && typeof cfg[y] === 'object' && typeof cfg[y][date] !== 'undefined') rr = String(cfg[y][date] || 'Onbekend');
                    else if (cfg && cfg.regions && typeof cfg.regions === 'object' && typeof cfg.regions[date] !== 'undefined') rr = String(cfg.regions[date] || 'Onbekend');
                    regionSet.add(rr || 'Onbekend');
                  } catch(_) { regionSet.add('Onbekend'); }
                }
              }
              const regionList = Array.from(regionSet).sort((a,b)=> a.localeCompare(b));
              labels = regionList.slice();

              const aggregatedBreakdown = {};
              for (const y of perRideDetail.years) {
                aggregatedBreakdown[y] = [];
                const planned = Array.isArray(plannedByYear[y]) ? plannedByYear[y] : [];
                for (let ri=0; ri<regionList.length; ri++) {
                  const rname = regionList[ri];
                  let total = 0;
                  const membersByRegion = {};
                  for (let i=0;i<planned.length;i++) {
                    const date = planned[i];
                    let rideRegion = 'Onbekend';
                    try {
                      if (cfg && cfg[y] && typeof cfg[y] === 'object' && typeof cfg[y][date] !== 'undefined') rideRegion = String(cfg[y][date] || 'Onbekend');
                      else if (cfg && cfg.regions && typeof cfg.regions === 'object' && typeof cfg.regions[date] !== 'undefined') rideRegion = String(cfg.regions[date] || 'Onbekend');
                    } catch(_){}
                    if ((rideRegion || 'Onbekend') !== rname) continue;
                    const cnt = (perRideDetail.countsByYear && perRideDetail.countsByYear[y] && typeof perRideDetail.countsByYear[y][i] !== 'undefined') ? Number(perRideDetail.countsByYear[y][i]||0) : 0;
                    total += cnt;
                    try {
                      const info = perRideDetail.breakdown && perRideDetail.breakdown[y] && perRideDetail.breakdown[y][i] ? perRideDetail.breakdown[y][i] : null;
                      if (info && info.regions) {
                        for (const mr of Object.keys(info.regions)) membersByRegion[mr] = (membersByRegion[mr]||0) + (info.regions[mr]||0);
                      }
                    } catch(_){}
                  }
                  aggregatedBreakdown[y].push({ total: total, regions: membersByRegion });
                }
              }

              datasets = (perRideDetail.years || []).map(y => {
                const arr = (aggregatedBreakdown[y] || []).map(o => Number(o.total || 0));
                return { label: String(y), data: arr, backgroundColor: getColorForYear(y), aggregatedBreakdown: aggregatedBreakdown[y] };
              });
            } else {
              datasets = (perRideDetail.years || []).map((y, di) => {
                const d = perRideDetail.countsByYear && perRideDetail.countsByYear[y] ? perRideDetail.countsByYear[y].slice() : [];
                return { label: String(y), data: d, backgroundColor: getColorForYear(y) };
              });
            }
        try { ensureCanvasHeight(canvas, 300); } catch(_){}
        // compute max for per-ride datasets so y-axis keeps whole numbers
        let maxPerRide = 0;
        try { for (const ds of datasets) { for (const v of (ds.data||[])) { if (Number(v) > maxPerRide) maxPerRide = Number(v); } } } catch(_){ maxPerRide = 0; }
        const suggestedMaxPerRide = Math.max(1, Math.ceil(maxPerRide));

        perRideChartInstance = new Chart(canvas, {
          type: 'bar',
          data: { labels: labels, datasets: datasets },
          options: {
            plugins: {
              legend: { display: true },
              title: { display: true, text: 'Inschrijvingen per rit' },
              tooltip: {
                displayColors: false,
                callbacks: {
                  label: function(context) {
                    try {
                      const datasetIndex = typeof context.datasetIndex === 'number' ? context.datasetIndex : 0;
                      const dataIndex = typeof context.dataIndex === 'number' ? context.dataIndex : (parseInt(String(context.label||'').replace(/\D/g,''),10)-1);
                      const year = (perRideDetail.years && perRideDetail.years[datasetIndex]) ? perRideDetail.years[datasetIndex] : null;
                      // if datasets include aggregatedBreakdown (regio mode), use it
                      const ds = (perRideChartInstance && perRideChartInstance.data && perRideChartInstance.data.datasets && perRideChartInstance.data.datasets[datasetIndex]) ? perRideChartInstance.data.datasets[datasetIndex] : null;
                      let info = null;
                      if (ds && ds.aggregatedBreakdown && Array.isArray(ds.aggregatedBreakdown) && typeof ds.aggregatedBreakdown[dataIndex] !== 'undefined') {
                        info = ds.aggregatedBreakdown[dataIndex];
                      } else {
                        // fallback to original perRideDetail mapping (chronological)
                        const origIndex = dataIndex;
                        info = year && perRideDetail.breakdown && perRideDetail.breakdown[year] && perRideDetail.breakdown[year][origIndex] ? perRideDetail.breakdown[year][origIndex] : null;
                      }
                      if (info && info.regions) {
                        const regs = Object.keys(info.regions).sort((a,b)=> (info.regions[b]||0) - (info.regions[a]||0));
                        const lines = [];
                        for (const r of regs) lines.push(r + ': ' + (info.regions[r]||0));
                        return lines;
                      }
                      return '';
                    } catch(_) { return '' }
                  }
                }
              }
            },
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, suggestedMax: suggestedMaxPerRide, ticks: { stepSize: 1, precision: 0 } } }
          }
        });
      } catch(e){ console.warn('renderPerRideChart error', e); }
    }

    // helper color function
    function getColorForYear(y) { try { const yr = Number(y)||0; const h = (yr * 47) % 360; return `hsl(${h},65%,50%)`; } catch(_) { return 'rgba(54,162,235,0.85)'; } }

    function getColorForRegion(name) {
      try {
        if (!name) return 'rgba(201,203,207,0.85)';
        let n = 0;
        for (let i = 0; i < name.length; i++) n = (n * 31 + name.charCodeAt(i)) & 0xffffffff;
        const h = Math.abs(n) % 360;
        return `hsl(${h},60%,52%)`;
      } catch(_) { return 'rgba(153,102,255,0.85)'; }
    }

    // Ensure canvas has an appropriate height for mobile/desktop so touch interactions are easier
    function ensureCanvasHeight(canvas, preferHeight) {
      try {
        const w = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1024;
        let h = typeof preferHeight === 'number' ? preferHeight : 220;
        if (w <= 420) h = Math.max(h, 320);
        else if (w <= 768) h = Math.max(h, 280);
        else h = Math.max(h, 220);
        canvas.style.height = String(h) + 'px';
        // Set element height attribute too for Chart.js sizing
        try { canvas.height = h; } catch(_){}
      } catch(_){}
    }

    // renderRegionsLegend removed — legend container and rendering are no longer used

    document.addEventListener('ride:years:changed', (ev)=>{ try{ const yrs = (ev && ev.detail && Array.isArray(ev.detail.years)) ? ev.detail.years : []; renderChartForYears(yrs); }catch(_){}});

    // Also render per-ride chart on years change
    document.addEventListener('ride:years:changed', (ev)=>{ try{ const yrs = (ev && ev.detail && Array.isArray(ev.detail.years)) ? ev.detail.years : []; renderPerRideChart(yrs); }catch(_){}});

    // Re-render per-ride chart when sort mode changes (segmented control)
    try {
      const sortContainer = document.getElementById('per-ride-sort-mode');
      if (sortContainer) {
        sortContainer.addEventListener('click', (ev)=>{
          try {
            const btn = ev.target && ev.target.closest && ev.target.closest('.seg-btn');
            if (!btn) return;
            // toggle active state among siblings
            const siblings = Array.from(sortContainer.querySelectorAll('.seg-btn'));
            for (const s of siblings) {
              s.classList.remove('active');
              s.setAttribute('aria-pressed','false');
            }
            btn.classList.add('active');
            btn.setAttribute('aria-pressed','true');
            const selectedYears = Array.from(strip.querySelectorAll('.year-chip.selected')).map(el=>el.dataset.year);
            renderPerRideChart(selectedYears);
          } catch(_){ }
        });
      }
    } catch(_){ }

    // initial render
    try { const selectedYears = Array.from(strip.querySelectorAll('.year-chip.selected')).map(el=>el.dataset.year); if (selectedYears && selectedYears.length) { renderChartForYears(selectedYears); renderPerRideChart(selectedYears); } else { renderChartForYears([]); renderPerRideChart([]); } } catch(_){ renderChartForYears([]); renderPerRideChart([]); }

  } catch(e){ console.warn('populate ride years failed', e); }
})();
