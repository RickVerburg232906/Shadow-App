// src/data.js
// Populate the ride years strip on the Data admin page.
import { getRideConfig, initFirebase, db, doc, getDoc, collection, getDocs } from './firebase.js';

// Global date extractor usable by functions outside the init IIFE
function extractDateGlobal(val) {
  try {
    if (val === null || typeof val === 'undefined') return null;
    if (typeof val === 'string') {
      const m = val.match(/^(\s*(\d{4}-\d{2}-\d{2}))/);
      if (m && m[2]) return m[2];
      const d = new Date(val);
      if (!isNaN(d)) return d.toISOString().slice(0,10);
      return null;
    }
    if (typeof val === 'number') {
      const tryMs = new Date(val);
      if (!isNaN(tryMs)) return tryMs.toISOString().slice(0,10);
      const trySecs = new Date(val * 1000);
      if (!isNaN(trySecs)) return trySecs.toISOString().slice(0,10);
    }
    if (val instanceof Date) return val.toISOString().slice(0,10);
    if (typeof val === 'object') {
      if (typeof val.toDate === 'function') {
        try { const d = val.toDate(); if (d instanceof Date && !isNaN(d)) return d.toISOString().slice(0,10); } catch(_){ }
      }
      if (typeof val.seconds === 'number') {
        const d = new Date(val.seconds * 1000);
        if (!isNaN(d)) return d.toISOString().slice(0,10);
      }
    }
  } catch(_){}
  return null;
}

(async function(){
  try {
    try { await initFirebase(); } catch(_){}
    const strip = document.getElementById('ride-years-strip');
    if (!strip) return;
    strip.innerHTML = '<div class="year-loading">Laden…</div>';
    // Use a dedicated datapage cache object in sessionStorage to avoid colliding
    let cfg = null;
    let dataCache = null;
    try {
      const rawCache = sessionStorage.getItem('datapage_cache');
      if (rawCache) dataCache = JSON.parse(rawCache);
    } catch (_) { dataCache = null; }

    // On load, ensure datapage cache matches Firebase for rideConfig and rideParticipants.
    // If differences are found, replace local datapage_cache with Firebase's authoritative values.
    try {
      (async function(){
        try {
          const rawLocal = sessionStorage.getItem('datapage_cache');
          let local = null; try { if (rawLocal) local = JSON.parse(rawLocal); } catch(_) { local = null; }
          let remote = { rideConfig: null, rideParticipants: null };
          try { await initFirebase(); } catch(_){}
          try { remote.rideConfig = await getRideConfig().catch(()=>null); } catch(_) { remote.rideConfig = null; }
          try {
            if (!db) try { await initFirebase(); } catch(_){}
            if (db) {
              const rpRef = doc(db, 'globals', 'rideParticipants');
              const snap = await getDoc(rpRef).catch(()=>null);
              remote.rideParticipants = snap ? (typeof snap.data === 'function' ? snap.data() : snap) : null;
            }
          } catch(_) { remote.rideParticipants = null; }

          try {
            const localRC = local && local.rideConfig ? JSON.stringify(local.rideConfig) : null;
            const remoteRC = remote.rideConfig ? JSON.stringify(remote.rideConfig) : null;
            const localRP = local && local.rideParticipants ? JSON.stringify(local.rideParticipants) : null;
            const remoteRP = remote.rideParticipants ? JSON.stringify(remote.rideParticipants) : null;
            if (localRC !== remoteRC || localRP !== remoteRP) {
              const merged = Object.assign({}, local || {});
              merged.rideConfig = remote.rideConfig;
              merged.rideParticipants = remote.rideParticipants;
              try { sessionStorage.setItem('datapage_cache', JSON.stringify(merged)); } catch(_){}
              dataCache = merged; // update in-memory cache for current run
            }
          } catch(_){}
        } catch(_){}
      })();
    } catch(_) {}
    if (dataCache && dataCache.rideConfig) {
      cfg = dataCache.rideConfig;
    } else {
      try {
        cfg = await getRideConfig();
        if (cfg) {
          dataCache = dataCache || {};
          dataCache.rideConfig = cfg;
          try { sessionStorage.setItem('datapage_cache', JSON.stringify(dataCache)); } catch(_){}
        }
      } catch(_) { cfg = null; }
    }
    strip.innerHTML = '';
    if (!cfg || typeof cfg !== 'object') {
      strip.innerHTML = '<div class="year-chip">Geen jaren</div>';
      return;
    }
    const years = Object.keys(cfg).filter(k => /^\d{4}$/.test(k)).sort((a,b)=>Number(b)-Number(a));
    if (!years.length) {
      strip.innerHTML = '<div class="year-chip">Geen jaren</div>';
      return;
    }
    for (const y of years) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'year-chip';
      btn.textContent = y;
      btn.dataset.year = y;
      btn.setAttribute('aria-pressed', 'false');
      btn.addEventListener('click', (ev) => {
        try {
          const isSelected = btn.classList.contains('selected');
          if (isSelected) {
            try { btn.classList.remove('selected'); btn.setAttribute('aria-pressed','false'); } catch(_){}
          } else {
            try { btn.classList.add('selected'); btn.setAttribute('aria-pressed','true'); } catch(_){}
          }
          const selected = !isSelected;
          document.dispatchEvent(new CustomEvent('ride:year:selected', { detail: { year: y, selected } }));
          const selectedYears = Array.from(strip.querySelectorAll('.year-chip.selected')).map(el => el.dataset.year);
          document.dispatchEvent(new CustomEvent('ride:years:changed', { detail: { years: selectedYears } }));
        } catch(_){}
      });
      strip.appendChild(btn);
    }
    // Auto-select current year (fallback to first available) to ensure one year selected on page open
    try {
      const currentYear = String((new Date()).getFullYear());
      let selectedChip = strip.querySelector(`.year-chip[data-year="${currentYear}"]`);
      if (!selectedChip && years.length) selectedChip = strip.querySelector(`.year-chip[data-year="${years[0]}"]`);
      if (selectedChip) {
        try { selectedChip.classList.add('selected'); selectedChip.setAttribute('aria-pressed','true'); } catch(_){}
        const selectedYears = Array.from(strip.querySelectorAll('.year-chip.selected')).map(el => el.dataset.year);
        try { document.dispatchEvent(new CustomEvent('ride:year:selected', { detail: { year: selectedChip.dataset.year, selected: true } })); } catch(_){}
        try { document.dispatchEvent(new CustomEvent('ride:years:changed', { detail: { years: selectedYears } })); } catch(_){}
      }
    } catch (_) {}
    // Create chart container under the year strip (full width)
    let chart = document.getElementById('ride-years-chart');
    if (!chart) {
      chart = document.createElement('div');
      chart.id = 'ride-years-chart';
      chart.className = 'year-chart';
      // Prefer the dedicated container if present, otherwise fall back to title/strip insertion
      try {
        const container = document.getElementById('ride-years-chart-container');
        if (container) {
          container.appendChild(chart);
        } else {
          const staticTitle = document.getElementById('ride-years-chart-title');
          if (staticTitle && staticTitle.parentNode) staticTitle.insertAdjacentElement('afterend', chart);
          else strip.insertAdjacentElement('afterend', chart);
        }
      } catch(_) { try { strip.insertAdjacentElement('afterend', chart); } catch(_) { document.body.insertBefore(chart, document.body.firstChild); } }
    }

    // Helper: robust year extractor used for caching and counting
    function extractYear(val) {
      try {
        if (val === null || typeof val === 'undefined') return null;
        if (typeof val === 'string') {
          const m = val.match(/^\s*(\d{4})/);
          if (m) return Number(m[1]);
          const d = new Date(val);
          if (!isNaN(d)) return d.getFullYear();
          return null;
        }
        if (typeof val === 'number') {
          if (String(val).length === 4) return Number(val);
          const tryMs = new Date(val);
          if (!isNaN(tryMs)) return tryMs.getFullYear();
          const trySecs = new Date(val * 1000);
          if (!isNaN(trySecs)) return trySecs.getFullYear();
        }
        if (val instanceof Date) return val.getFullYear();
        if (typeof val === 'object') {
          if (typeof val.toDate === 'function') {
            try { const d = val.toDate(); if (d instanceof Date && !isNaN(d)) return d.getFullYear(); } catch(_){ }
          }
          if (typeof val.seconds === 'number') {
            const d = new Date(val.seconds * 1000);
            if (!isNaN(d)) return d.getFullYear();
          }
        }
      } catch(_){}
      return null;
    }

    function extractDate(val) {
      try {
        if (val === null || typeof val === 'undefined') return null;
        if (typeof val === 'string') {
          const m = val.match(/^(\s*(\d{4}-\d{2}-\d{2}))/);
          if (m && m[2]) return m[2];
          const d = new Date(val);
          if (!isNaN(d)) {
            return d.toISOString().slice(0,10);
          }
          return null;
        }
        if (typeof val === 'number') {
          // ms or seconds
          const tryMs = new Date(val);
          if (!isNaN(tryMs)) return tryMs.toISOString().slice(0,10);
          const trySecs = new Date(val * 1000);
          if (!isNaN(trySecs)) return trySecs.toISOString().slice(0,10);
        }
        if (val instanceof Date) return val.toISOString().slice(0,10);
        if (typeof val === 'object') {
          if (typeof val.toDate === 'function') {
            try { const d = val.toDate(); if (d instanceof Date && !isNaN(d)) return d.toISOString().slice(0,10); } catch(_){ }
          }
          if (typeof val.seconds === 'number') {
            const d = new Date(val.seconds * 1000);
            if (!isNaN(d)) return d.toISOString().slice(0,10);
          }
        }
      } catch(_){}
      return null;
    }

    // Helper: fetch participant counts for given years from members/*/ScanDatums
    async function fetchCountsForYears(selectedYears) {
      try {
        const out = {};
        for (const y of selectedYears) out[y] = 0;

        // Try to reuse cached per-member year counts in sessionStorage
        let membersCache = null;
        if (dataCache && dataCache.members_year_counts) {
          membersCache = dataCache.members_year_counts;
        }
        if (!membersCache) {
          // fetch and build cache
          let init = null;
          try { init = await initFirebase(); } catch (_) { init = { app: null, db: null }; }
          const usedDb = (init && init.db) ? init.db : db;
          if (!usedDb) return out;
          const coll = collection(usedDb, 'members');
          let snap = null;
          try { snap = await getDocs(coll); } catch(_) { snap = null; }
          if (!snap || !Array.isArray(snap.docs)) return out;

          membersCache = [];
          for (const sdoc of snap.docs) {
            try {
              const data = typeof sdoc.data === 'function' ? sdoc.data() : sdoc;
              const rawArr = data && (data.ScanDatums || data.scandatums || data.scans) ? (data.ScanDatums || data.scandatums || data.scans) : null;
              if (!rawArr || !Array.isArray(rawArr)) { membersCache.push({ id: sdoc.id || null, yearCounts: {} }); continue; }
              const yc = {};
              for (const entry of rawArr) {
                try {
                  const yr = extractYear(entry);
                  if (!yr) continue;
                  const ystr = String(yr);
                  yc[ystr] = (yc[ystr] || 0) + 1;
                } catch(_){}
              }
              membersCache.push({ id: sdoc.id || null, yearCounts: yc });
            } catch(_) { membersCache.push({ id: (sdoc && sdoc.id) || null, yearCounts: {} }); }
          }
          try {
            dataCache = dataCache || {};
            dataCache.members_year_counts = membersCache;
            sessionStorage.setItem('datapage_cache', JSON.stringify(dataCache));
          } catch(_){}
        }

        // Sum cached counts
        for (const m of membersCache) {
          try {
            const yc = m && m.yearCounts ? m.yearCounts : {};
            for (const y of selectedYears) {
              const c = yc[String(y)] || 0;
              out[String(y)] = (out[String(y)] || 0) + c;
            }
          } catch(_){}
        }

        return out;
      } catch (e) { return selectedYears.reduce((acc,y)=>(acc[y]=0,acc),{}); }
    }

    // Render chart given selected years (array). Bars left->right in ascending year order.
    async function renderChartForYears(selectedYears) {
      try {
        // If no years selected, render an empty plot placeholder
        if (!Array.isArray(selectedYears) || selectedYears.length === 0) {
          chart.innerHTML = '<div class="chart-empty">Geen jaar geselecteerd</div>';
          return;
        }
        const yearsToShow = selectedYears.slice();
        // Normalize ascending order
        yearsToShow.sort((a,b)=>Number(a)-Number(b));
        chart.innerHTML = '<div class="chart-loading">Laden…</div>';
        const counts = await fetchCountsForYears(yearsToShow);
        const max = Math.max(...yearsToShow.map(y=>counts[y]||0), 1);
        const bars = document.createElement('div');
        // Render vertical stacked list of years with horizontal bars (inspired by provided design)
        bars.className = 'year-summary-list';
        for (const y of yearsToShow) {
          const val = counts[y] || 0;
          const pct = Math.round((val / max) * 100);

          const row = document.createElement('div');
          row.className = 'year-summary-row';

          const yearLabel = document.createElement('div');
          yearLabel.className = 'year-summary-year';
          yearLabel.textContent = y;

          const barContainer = document.createElement('div');
          barContainer.className = 'year-summary-bar-container';

          const bar = document.createElement('div');
          bar.className = 'year-summary-bar';
          bar.style.width = pct + '%';
          bar.setAttribute('title', `${val} inschrijvingen`);

          const valSpan = document.createElement('div');
          valSpan.className = 'year-summary-value';
          valSpan.textContent = String(val || 0);
          bar.appendChild(valSpan);

          barContainer.appendChild(bar);
          row.appendChild(yearLabel);
          row.appendChild(barContainer);
          bars.appendChild(row);
        }
        chart.innerHTML = '';
        // Chart area (bars + grid overlay)
        const chartArea = document.createElement('div');
        chartArea.className = 'chart-area';
        chartArea.appendChild(bars);

        // Build x-axis ticks (5 ticks: 0%..100%) based on max
        const ticks = [];
        if (max <= 5) {
          // for very small max, show integer ticks
          for (let i = 0; i <= max; i++) ticks.push(i);
        } else {
          ticks.push(0);
          ticks.push(Math.ceil(max * 0.25));
          ticks.push(Math.ceil(max * 0.5));
          ticks.push(Math.ceil(max * 0.75));
          ticks.push(max);
        }

        // attach chartArea (no axes/ticks for summary list)
        chart.appendChild(chartArea);
        try { chart.classList.add('year-summary-mode'); } catch(_){ }
      } catch (e) { try { chart.innerHTML = '<div class="chart-error">Kan niet laden</div>'; } catch(_){} }
    }

    // Listen for aggregated year changes and update chart
    document.addEventListener('ride:years:changed', (ev) => {
      try {
        const yrs = (ev && ev.detail && Array.isArray(ev.detail.years)) ? ev.detail.years : [];
        console.log('ride:years:changed event received, years=', yrs);
        renderChartForYears(yrs);
        renderRidesChartForYears(yrs);
      } catch(err){ console.error('ride:years:changed handler error', err); }
    });

    // Initial render: use any already-selected chips (auto-select code may have set one),
    // otherwise render with empty selection placeholder.
    try {
      const selectedYears = Array.from(strip.querySelectorAll('.year-chip.selected')).map(el => el.dataset.year);
      if (selectedYears && selectedYears.length > 0) {
        renderChartForYears(selectedYears);
        renderRidesChartForYears(selectedYears);
      } else {
        renderChartForYears([]);
        renderRidesChartForYears([]);
      }
    } catch (e) {
      renderChartForYears([]);
      renderRidesChartForYears([]);
    }
  } catch (e) { console.warn('populate ride years failed', e); }
})();

// --- Per-ride chart functions (placed after the IIFE so they can be referenced) ---
async function fetchRideParticipantsForYears(selectedYears) {
  try {
    // Output: map year -> array of { label: 'rit1', date: 'YYYY-MM-DD', count: N }
    const out = {};
    for (const y of selectedYears) out[y] = [];

    // Load datapage cache
    let dataCache = null;
    try { const raw = sessionStorage.getItem('datapage_cache'); if (raw) dataCache = JSON.parse(raw); } catch(_) { dataCache = null; }

    // Ensure we have members cache (per-member dateCounts)
    let membersCache = null;
    if (dataCache && dataCache.members) {
      membersCache = dataCache.members;
    } else {
      // fetch members and build per-member date counts
      let init = null;
      try { init = await initFirebase(); } catch (_) { init = { app: null, db: null }; }
      const usedDb = (init && init.db) ? init.db : db;
      if (!usedDb) return out;
      const coll = collection(usedDb, 'members');
      let snap = null;
      try { snap = await getDocs(coll); } catch(_) { snap = null; }
      if (!snap || !Array.isArray(snap.docs)) return out;

      membersCache = [];
      for (const sdoc of snap.docs) {
        try {
          const data = typeof sdoc.data === 'function' ? sdoc.data() : sdoc;
          const rawArr = data && (data.ScanDatums || data.scandatums || data.scans) ? (data.ScanDatums || data.scandatums || data.scans) : null;
          const dc = {};
          if (Array.isArray(rawArr)) {
                for (const entry of rawArr) {
                  try {
                    const dateStr = (typeof extractDateGlobal === 'function') ? extractDateGlobal(entry) : null;
                    if (!dateStr) continue;
                    dc[dateStr] = (dc[dateStr] || 0) + 1;
                  } catch(_){}
                }
              }
          membersCache.push({ id: sdoc.id || null, dateCounts: dc });
        } catch(_) { membersCache.push({ id: (sdoc && sdoc.id) || null, dateCounts: {} }); }
      }
      try { dataCache = dataCache || {}; dataCache.members = membersCache; sessionStorage.setItem('datapage_cache', JSON.stringify(dataCache)); } catch(_){}
    }

    // Get rideConfig to know which dates correspond to rides for each year
    let rideConfig = null;
    if (dataCache && dataCache.rideConfig) rideConfig = dataCache.rideConfig;
    if (!rideConfig) {
      try { rideConfig = await getRideConfig(); if (rideConfig) { dataCache = dataCache || {}; dataCache.rideConfig = rideConfig; try { sessionStorage.setItem('datapage_cache', JSON.stringify(dataCache)); } catch(_){} } } catch(_) { rideConfig = null; }
    }

    // For each selected year, determine ordered ride dates and compute counts
    for (const y of selectedYears) {
      const yearStr = String(y);
      let rideDates = [];
      try {
        if (rideConfig && rideConfig[yearStr] && typeof rideConfig[yearStr] === 'object') {
          rideDates = Object.keys(rideConfig[yearStr]).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
        } else if (rideConfig && rideConfig.regions && typeof rideConfig.regions === 'object') {
          // fallback: use regions map keys
          rideDates = Object.keys(rideConfig.regions).filter(k => k.startsWith(yearStr)).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
        }
      } catch(_) { rideDates = []; }

      // If no rideDates from config, try to infer from members' dates for that year
      if (!rideDates || rideDates.length === 0) {
        const datesSeen = new Set();
        for (const m of membersCache) {
          try {
            for (const d of Object.keys(m.dateCounts || {})) {
              if (d && d.indexOf(yearStr) === 0) datesSeen.add(d);
            }
          } catch(_){}
        }
        rideDates = Array.from(datesSeen).sort();
      }

      // Assign labels rit1..ritN in date order and compute counts
      const rides = [];
      for (let i = 0; i < rideDates.length; i++) {
        const date = rideDates[i];
        let total = 0;
        for (const m of membersCache) {
          try { total += (m.dateCounts && m.dateCounts[date]) ? Number(m.dateCounts[date]) : 0; } catch(_){}
        }
        rides.push({ label: `rit${i+1}`, date, count: total });
      }
      out[yearStr] = rides;
    }

    return out;
  } catch(_) { return selectedYears.reduce((acc,y)=>{acc[y]=[];return acc;},{}) }
}

async function renderRidesChartForYears(selectedYears) {
  try {
    const container = document.getElementById('ride-rides-chart-container');
    if (!container) return;
    // if none selected, show placeholder
    if (!Array.isArray(selectedYears) || selectedYears.length === 0) {
      container.innerHTML = '<div class="chart-empty">Geen jaar geselecteerd</div>';
      return;
    }

    // fetch rides data (array per year)
    const rp = await fetchRideParticipantsForYears(selectedYears);

    if (!selectedYears || selectedYears.length === 0) {
      container.innerHTML = '<div class="chart-empty">Geen ritten gevonden voor geselecteerde jaren</div>';
      return;
    }

    // Build vertical bar chart container
    const chart = document.createElement('div');
    chart.className = 'rides-vertical-chart';

    // legend for multi-year
    const palette = ['#163e8d','#1f77b4','#2ca02c','#ff7f0e','#d62728','#9467bd'];
    if (selectedYears.length > 1) {
      const legend = document.createElement('div'); legend.className = 'chart-legend';
      for (let i=0;i<selectedYears.length;i++){
        const l = document.createElement('div'); l.className='legend-item';
        const sw = document.createElement('span'); sw.className='legend-swatch'; sw.style.background = palette[i%palette.length];
        const lab = document.createElement('span'); lab.className='legend-label'; lab.textContent = String(selectedYears[i]);
        l.appendChild(sw); l.appendChild(lab); legend.appendChild(l);
      }
      chart.appendChild(legend);
    }

    // Prepare per-year rides arrays and determine max count
    const perYearRides = selectedYears.map(y => rp[String(y)] || []);
    const maxRides = Math.max(...perYearRides.map(a => a.length));
    let globalMax = 1; for (const arr of perYearRides) for (const it of arr) globalMax = Math.max(globalMax, it.count || 0);

    // Build columns: for each ride index, create a column with one or multiple bars (per year)
    const cols = document.createElement('div'); cols.className = 'rides-cols';

    for (let idx=0; idx<maxRides; idx++){
      const col = document.createElement('div'); col.className = 'ride-col';

      const barsWrap = document.createElement('div'); barsWrap.className = 'ride-bars-wrap';
      // for each selected year, create a vertical bar
      for (let yi=0; yi<perYearRides.length; yi++){
        const arr = perYearRides[yi];
        const item = arr[idx] || {label:`rit${idx+1}`, date:null, count:0};
        const barCol = document.createElement('div'); barCol.className = 'ride-bar-col';

        // If multiple years selected, render compact colored square blocks (non-overlapping)
        if (selectedYears.length > 1) {
          const square = document.createElement('div');
          square.className = 'ride-square';
          square.style.background = palette[yi % palette.length];
          square.textContent = String(item.count || 0);
          square.setAttribute('title', `${selectedYears[yi]} ${item.label || ''}: ${item.count||0}`);
          barsWrap.appendChild(square);
        } else {
          const valueLabel = document.createElement('div'); valueLabel.className = 'ride-bar-value'; valueLabel.textContent = String(item.count || 0);

          const track = document.createElement('div'); track.className = 'ride-bar-track';
          const fill = document.createElement('div'); fill.className = 'ride-bar-fill';
          const pct = Math.round(((item.count||0) / Math.max(globalMax,1)) * 100);
          fill.style.height = pct + '%';
          fill.style.background = palette[yi % palette.length];
          fill.setAttribute('title', `${selectedYears[yi]} ${item.label || ''}: ${item.count||0}`);
          track.appendChild(fill);

          barCol.appendChild(valueLabel);
          barCol.appendChild(track);
          barsWrap.appendChild(barCol);
        }
      }

      // x-label: use date if available (from first year's item) else rit label
      const xLabel = document.createElement('div'); xLabel.className = 'ride-x-label';
      const firstItem = (perYearRides[0] && perYearRides[0][idx]) ? perYearRides[0][idx] : null;
      xLabel.textContent = firstItem && firstItem.date ? (new Date(firstItem.date)).toLocaleDateString('nl-NL', {day:'2-digit', month:'short'}) : `rit${idx+1}`;

      col.appendChild(barsWrap);
      col.appendChild(xLabel);
      cols.appendChild(col);
    }

    const chartInner = document.createElement('div'); chartInner.className = 'rides-chart-inner';
    chartInner.appendChild(cols);

    // assemble (no axis wrapper)
    chart.appendChild(chartInner);

    container.innerHTML = '';
    const chartArea = document.createElement('div'); chartArea.className = 'chart-area';
    chartArea.appendChild(chart);
    container.appendChild(chartArea);
  } catch(e) { try { document.getElementById('ride-rides-chart-container').innerHTML = '<div class="chart-error">Kan niet laden</div>'; } catch(_){} }
}
