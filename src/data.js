// src/data.js
// Populate the ride years strip on the Data admin page.
import { getRideConfig, initFirebase, db, doc, getDoc, collection, getDocs } from './firebase.js';

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
        bars.className = 'year-chart-bars';
        for (const y of yearsToShow) {
          const val = counts[y] || 0;
          const barWrap = document.createElement('div');
          barWrap.className = 'year-bar';

          const label = document.createElement('div');
          label.className = 'bar-label';
          label.textContent = y;

          const track = document.createElement('div');
          track.className = 'bar-track';
          const fill = document.createElement('div');
          fill.className = 'bar-fill';
          const pct = Math.round((val / max) * 100);
          fill.style.width = pct + '%';
          fill.setAttribute('title', `${val} inschrijvingen`);
          fill.dataset.year = y;
          track.appendChild(fill);

          barWrap.appendChild(label);
          barWrap.appendChild(track);
          // value label at the end of the row
          const valLabel = document.createElement('div');
          valLabel.className = 'bar-value';
          valLabel.textContent = String(val || 0);
          barWrap.appendChild(valLabel);
          bars.appendChild(barWrap);
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

        // grid overlay for vertical lines
        const grid = document.createElement('div');
        grid.className = 'chart-grid';
        for (const t of ticks) {
          const pct = Math.round((t / Math.max(max,1)) * 100);
          const line = document.createElement('div');
          line.className = 'chart-tick-line';
          line.style.left = pct + '%';
          grid.appendChild(line);
        }
        chartArea.appendChild(grid);
        chart.appendChild(chartArea);

        // (x-axis and axis label intentionally omitted)
      } catch (e) { try { chart.innerHTML = '<div class="chart-error">Kan niet laden</div>'; } catch(_){} }
    }

    // Listen for aggregated year changes and update chart
    document.addEventListener('ride:years:changed', (ev) => {
      try {
        const yrs = (ev && ev.detail && Array.isArray(ev.detail.years)) ? ev.detail.years : [];
        console.log('ride:years:changed event received, years=', yrs);
        renderChartForYears(yrs);
      } catch(err){ console.error('ride:years:changed handler error', err); }
    });

    // Initial render: none selected -> show all years
    renderChartForYears([]);
  } catch (e) { console.warn('populate ride years failed', e); }
})();
