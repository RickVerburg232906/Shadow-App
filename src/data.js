// src/data.js
// Populate the ride years strip on the Data admin page.
import { getRideConfig, initFirebase, db, doc, getDoc, collection, getDocs, getPlannedDates } from './firebase.js';

// Top-level async IIFE to scope variables and start the page logic
(async function() {
  try {
    let dataCache = null;
    try { dataCache = JSON.parse(sessionStorage.getItem('datapage_cache') || 'null'); } catch(_) { dataCache = null; }
    const strip = document.getElementById('ride-years-strip') || document.body;

    // Simple sessionStorage-backed cache with TTL (milliseconds)
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    function cacheRead(key) {
      try {
        if (!dataCache || !dataCache._cache || !dataCache._cache[key]) return null;
        const e = dataCache._cache[key];
        if (!e || typeof e.ts !== 'number') return null;
        if ((Date.now() - e.ts) > (e.ttl || CACHE_TTL)) {
          // expired
          delete dataCache._cache[key];
          try { sessionStorage.setItem('datapage_cache', JSON.stringify(dataCache)); } catch(_){}
          return null;
        }
        return e.value;
      } catch(_) { return null; }
    }
    function cacheWrite(key, value, ttl) {
      try {
        dataCache = dataCache || {};
        dataCache._cache = dataCache._cache || {};
        dataCache._cache[key] = { ts: Date.now(), ttl: (typeof ttl === 'number' ? ttl : CACHE_TTL), value };
        try { sessionStorage.setItem('datapage_cache', JSON.stringify(dataCache)); } catch(_){}
      } catch(_){}
    }

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
    } catch(_){ }
    return null;
  }

    let cfg = null;

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

    // Deterministic color per year helper
    function getColorForYear(y) {
      try {
        const yr = Number(y) || 0;
        const h = (yr * 47) % 360;
        return `hsl(${h},65%,50%)`;
      } catch(_) { return 'rgba(54,162,235,0.85)'; }
    }

    // Deterministic color per region name
    function getColorForRegion(name) {
      try {
        if (!name) return 'rgba(201,203,207,0.85)';
        let n = 0;
        for (let i = 0; i < name.length; i++) n = (n * 31 + name.charCodeAt(i)) & 0xffffffff;
        const h = Math.abs(n) % 360;
        return `hsl(${h},60%,52%)`;
      } catch(_) { return 'rgba(153,102,255,0.85)'; }
    }

    // Render a global legend under the year chips. Regions: array of names, colors: parallel array
    function renderGlobalLegend(regions, colors) {
      try {
        if (!Array.isArray(regions)) regions = [];
        const legendId = 'data-legend';
        let legend = document.getElementById(legendId);
        if (!legend) {
          legend = document.createElement('div');
          legend.id = legendId;
          legend.className = 'data-legend';
          // insert after the year strip
          try {
            const parent = strip && strip.parentNode ? strip.parentNode : document.body;
            if (strip && strip.nextSibling) parent.insertBefore(legend, strip.nextSibling);
            else parent.appendChild(legend);
          } catch(_) { document.body.insertBefore(legend, document.body.firstChild); }
        }
        legend.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'data-legend-inner';
        for (let i = 0; i < regions.length; i++) {
          const name = regions[i] || 'Onbekend';
          const color = (Array.isArray(colors) && colors[i]) ? colors[i] : getColorForRegion(name);
          const item = document.createElement('div');
          item.className = 'legend-item';
          const sw = document.createElement('span');
          sw.className = 'legend-swatch';
          sw.style.background = color;
          const lbl = document.createElement('span');
          lbl.className = 'legend-label';
          lbl.textContent = name;
          item.appendChild(sw);
          item.appendChild(lbl);
          wrap.appendChild(item);
        }
        legend.appendChild(wrap);
      } catch(_){}
    }
    // Helper: fetch participant counts for given years from members/*/ScanDatums
    async function fetchCountsForYears(selectedYears) {
      try {
        const out = {};
        for (const y of selectedYears) out[y] = 0;
        // Try cached per-member year counts first
        let membersCache = cacheRead('members_year_counts');
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
          try { cacheWrite('members_year_counts', membersCache); } catch(_){ }
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

    // Render chart given selected years (array) using Chart.js. Bars left->right in ascending year order.
    let yearChartInstance = null;
    async function renderChartForYears(selectedYears) {
      try {
        if (!Array.isArray(selectedYears) || selectedYears.length === 0) {
          if (yearChartInstance) { try { yearChartInstance.destroy(); } catch(_){} yearChartInstance = null; }
          chart.innerHTML = '<div class="chart-empty">Geen jaar geselecteerd</div>';
          return;
        }
        const yearsToShow = selectedYears.slice().sort((a,b)=>Number(a)-Number(b));
        // ensure chart container is cleared and canvas exists
        chart.innerHTML = '';
        let canvas = document.getElementById('yearSummaryChart');
        if (!canvas) {
          canvas = document.createElement('canvas');
          canvas.id = 'yearSummaryChart';
          canvas.style.width = '100%';
          canvas.style.height = '100%';
          chart.appendChild(canvas);
        } else {
          // ensure canvas is inside our chart container for consistent sizing
          if (canvas.parentNode !== chart) chart.appendChild(canvas);
        }

        // Move page title into Chart.js title plugin (hide external title div)
        const yearTitleEl = document.getElementById('ride-years-chart-title');
        const yearTitleText = yearTitleEl ? (yearTitleEl.textContent || '').trim() : '';
        try { if (yearTitleEl) yearTitleEl.style.display = 'none'; } catch(_){}

        // Build stacked per-region data by using per-ride mapping
        const counts = await fetchCountsForYears(yearsToShow);
        // also get per-position region mapping and counts via fetchCountsPerRide (cached)
        const perRide = await fetchCountsPerRide(yearsToShow).catch(()=>({ yearRegions: {}, countsByYear: {} }));
        const yearRegions = perRide.yearRegions || {};
        const countsByYear = perRide.countsByYear || {};

        // Build datasets grouped by member-region (not ride-config region). Prefer the
        // memberRegions array returned by fetchCountsPerRide; fallback to scanning
        // yearPosRegionCounts to discover member-region names.
        let memberRegions = (perRide && Array.isArray(perRide.memberRegions) && perRide.memberRegions.length) ? perRide.memberRegions.slice() : [];
        if (!memberRegions.length) {
          const mrSet = new Set();
          for (const y of yearsToShow) {
            const ystr = String(y);
            const posMaps = (perRide && perRide.yearPosRegionCounts && perRide.yearPosRegionCounts[ystr]) ? perRide.yearPosRegionCounts[ystr] : [];
            for (const pm of posMaps) for (const k of Object.keys(pm || {})) mrSet.add(k || 'Onbekend');
          }
          memberRegions = Array.from(mrSet).sort();
        }

        // For each member-region, build data array across years by summing the
        // counts found in yearPosRegionCounts for that member-region.
        const regionDatasets = memberRegions.map((r) => {
          const dataArr = yearsToShow.map((y) => {
            const ystr = String(y);
            const posMaps = (perRide && perRide.yearPosRegionCounts && perRide.yearPosRegionCounts[ystr]) ? perRide.yearPosRegionCounts[ystr] : [];
            let sum = 0;
            for (let i = 0; i < posMaps.length; i++) {
              try { sum += (posMaps[i][r] || 0); } catch(_){ }
            }
            return sum;
          });
          return { label: r, data: dataArr, backgroundColor: getColorForRegion(r), borderRadius: 0, stack: 'regions' };
        });

        if (yearChartInstance) { try { yearChartInstance.destroy(); } catch(_){} yearChartInstance = null; }

        yearChartInstance = new Chart(canvas, {
          type: 'bar',
          data: {
            labels: yearsToShow,
            datasets: regionDatasets
          },
          options: {
            plugins: { title: { display: !!yearTitleText, text: yearTitleText, padding: { top: 6, bottom: 8 }, font: { size: 16 } },
                      legend: { display: false }, tooltip: { enabled: true } },
            layout: { padding: { left: 8, right: 8, top: 8, bottom: 20 } },
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { beginAtZero: true, ticks: { precision: 0 }, title: { display: false }, stacked: true },
              y: { title: { display: false }, stacked: true }
            }
          }
        });

        // Render a shared legend under the year chips for the whole page.
        // Prefer memberRegions (from members collection) when available so the
        // legend reflects actual member-level ‘Regio Omschrijving’ values.
        try {
          const memberRegions = (perRide && Array.isArray(perRide.memberRegions) && perRide.memberRegions.length) ? perRide.memberRegions : null;
          if (memberRegions && memberRegions.length) {
            renderGlobalLegend(memberRegions, memberRegions.map(n => getColorForRegion(n)));
          } else {
            const colors = regionDatasets.map(r => r.backgroundColor);
            renderGlobalLegend(regions, colors);
          }
        } catch(_){}

        // ensure parent has compact height proportional to number of years (compact multi-year view)
        try {
          const p = canvas.parentElement;
          if (p) {
            // make year-summary taller for readability: larger per-year row and higher min height
            const h = Math.min(Math.max(yearsToShow.length * 70, 240), 1100);
            p.style.height = h + 'px';
          }
        } catch(_){ }
      } catch (e) { try { if (yearChartInstance) { yearChartInstance.destroy(); yearChartInstance = null; } chart.innerHTML = '<div class="chart-error">Kan niet laden</div>'; } catch(_){} }
    }

    // Fetch per-ride counts broken down per selected year and per position (Rit index)
    async function fetchCountsPerRide(selectedYears) {
      try {
        const out = { labels: [], countsByYear: {}, datesPerPosition: [] };
        if (!Array.isArray(selectedYears) || selectedYears.length === 0) return out;

        // Cache per-combination of years to avoid repeated heavy scans
        const yearsKey = String(selectedYears.slice().sort().join(','));
        const cacheKey = 'perride_counts_' + yearsKey;
        const cached = cacheRead(cacheKey);
        if (cached) return cached;

        // Load rideConfig from cache or Firestore
        let cfg = (dataCache && dataCache.rideConfig) ? dataCache.rideConfig : null;
        if (!cfg) {
          try { cfg = await getRideConfig(); } catch(_) { cfg = null; }
        }

        // Build ordered date arrays per year based on the config insertion/order (do NOT sort)
        const yearDates = {};
        const yearRegions = {};
        let maxLen = 0;
        for (const y of selectedYears) {
          try {
            const ym = cfg && cfg[String(y)];
            if (ym && typeof ym === 'object') {
              // ensure deterministic order: sort ISO date keys so positions remain stable across reloads
              const keys = Object.keys(ym).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
              yearDates[String(y)] = keys;
              // region names per position
              try {
                yearRegions[String(y)] = keys.map(k => {
                  try {
                    const v = ym[k];
                    if (v === null || typeof v === 'undefined') return 'Onbekend';
                    if (typeof v === 'object') return (v.value || v.name || String(v) || 'Onbekend');
                    return String(v);
                  } catch(_) { return 'Onbekend'; }
                });
              } catch(_) { yearRegions[String(y)] = keys.map(()=> 'Onbekend'); }
              if (keys.length > maxLen) maxLen = keys.length;
            } else {
              const reg = cfg && cfg.regions && typeof cfg.regions === 'object' ? Object.keys(cfg.regions).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k) && String(k).indexOf(String(y))===0).sort() : [];
              yearDates[String(y)] = reg;
              try {
                yearRegions[String(y)] = reg.map(k => {
                  try {
                    const v = cfg.regions[k];
                    if (v === null || typeof v === 'undefined') return 'Onbekend';
                    if (typeof v === 'object') return (v.value || v.name || String(v) || 'Onbekend');
                    return String(v);
                  } catch(_) { return 'Onbekend'; }
                });
              } catch(_) { yearRegions[String(y)] = reg.map(()=> 'Onbekend'); }
              if (reg.length > maxLen) maxLen = reg.length;
            }
          } catch(_) { yearDates[String(y)] = []; yearRegions[String(y)] = []; }
        }

        if (maxLen === 0) return out;

        // Build map date -> list of { year, pos }
        const dateMap = Object.create(null);
        for (const y of selectedYears) {
          const arr = yearDates[String(y)] || [];
          for (let idx = 0; idx < arr.length; idx++) {
            const d = arr[idx];
            if (!d) continue;
            dateMap[d] = dateMap[d] || [];
            dateMap[d].push({ year: String(y), pos: idx });
          }
        }

        // Initialize counts per year/position
        const countsByYear = {};
        // year -> array[pos] = total count
        for (const y of selectedYears) countsByYear[String(y)] = new Array(maxLen).fill(0);
        // year -> array[pos] -> { regionName: count }
        const yearPosRegionCounts = {};
        for (const y of selectedYears) yearPosRegionCounts[String(y)] = new Array(maxLen).fill(null).map(()=> ({}));
        // collect all member-level regions seen while scanning members
        const memberRegionSet = new Set();

        // Scan members and increment counts for positions based on the dateMap
        try {
          try { await initFirebase(); } catch(_){}
          if (!db) return out;
          const coll = collection(db, 'members');
          const snap = await getDocs(coll).catch(()=>null);
          if (snap && Array.isArray(snap.docs)) {
            for (const sdoc of snap.docs) {
              try {
                const data = typeof sdoc.data === 'function' ? sdoc.data() : sdoc;
                const rawArr = data && (data.ScanDatums || data.scandatums || data.scans) ? (data.ScanDatums || data.scandatums || data.scans) : null;
                if (!Array.isArray(rawArr)) continue;
                for (const entry of rawArr) {
                  try {
                    const dateStr = extractDate(entry);
                    if (!dateStr) continue;
                    const map = dateMap[dateStr];
                    if (!map) continue;
                    // Determine member-level region from document field 'Regio Omschrijving' (fallbacks supported)
                    let memberRegion = 'Onbekend';
                    try {
                      const possible = data['Regio Omschrijving'] || data.RegioOmschrijving || data.regioOmschrijving || data.regio || data.region || data.regionName || data.regionnaam || data.regio_omschrijving;
                      if (possible && String(possible).trim()) memberRegion = String(possible).trim();
                    } catch(_){ }
                    try { memberRegionSet.add(memberRegion); } catch(_){ }
                    for (const it of map) {
                      try {
                        countsByYear[it.year][it.pos] = (countsByYear[it.year][it.pos] || 0) + 1;
                        const yp = yearPosRegionCounts[it.year] && yearPosRegionCounts[it.year][it.pos] ? yearPosRegionCounts[it.year][it.pos] : null;
                        if (yp) yp[memberRegion] = (yp[memberRegion] || 0) + 1;
                      } catch(_){ }
                    }
                  } catch(_){}
                }
              } catch(_){}
            }
          }
        } catch(_){}

        out.labels = new Array(maxLen).fill(0).map((_,i)=>`Rit ${i+1}`);
        out.countsByYear = countsByYear;
        // representative date per position: first date found for that position across years
        const repDates = new Array(maxLen).fill(null);
        for (const d of Object.keys(dateMap)) {
          try {
            for (const it of dateMap[d]) if (!repDates[it.pos]) repDates[it.pos] = d;
          } catch(_){}
        }
        out.datesPerPosition = repDates;
        out.yearDates = yearDates;
        out.yearRegions = yearRegions;
        out.yearPosRegionCounts = yearPosRegionCounts;
        out.memberRegions = Array.from(memberRegionSet).sort();
        try { cacheWrite(cacheKey, out); } catch(_){ }
        return out;
      } catch(_) { return { labels: [], countsByYear: {}, datesPerPosition: [] }; }
    }

    // Mode for per-ride chart: 'rit' or 'regio'
    let perRideMode = 'rit';

    // Render per-ride chart (vertical bars). X-axis = Rit 1..N or Regio names, left = amount.
    let perRideChartInstance = null;
    function ensurePerRideModeControls(container, onChange) {
      try {
        if (!container) return;
        let ctrl = container.querySelector('.perride-mode');
        if (!ctrl) {
          ctrl = document.createElement('div');
          ctrl.className = 'perride-mode';
          ctrl.style.display = 'flex';
          ctrl.style.gap = '8px';
          ctrl.style.alignItems = 'center';
          const btnRit = document.createElement('button');
          btnRit.type = 'button';
          btnRit.textContent = 'Rit';
          btnRit.className = 'mode-btn rit';
          const btnRegio = document.createElement('button');
          btnRegio.type = 'button';
          btnRegio.textContent = 'Regio';
          btnRegio.className = 'mode-btn regio';
          ctrl.appendChild(btnRit);
          ctrl.appendChild(btnRegio);
          container.insertBefore(ctrl, container.firstChild);
          const setActive = (m, invoke=true) => {
            perRideMode = m;
            try { btnRit.classList.toggle('active', m==='rit'); btnRegio.classList.toggle('active', m==='regio'); } catch(_){ }
            if (invoke) {
              try { if (typeof onChange === 'function') onChange(); } catch(_){ }
            }
          };
          btnRit.addEventListener('click', ()=>setActive('rit', true));
          btnRegio.addEventListener('click', ()=>setActive('regio', true));
          // initial (do not invoke onChange during setup)
          setActive(perRideMode, false);
        }
      } catch(_){ }
    }

    async function renderPerRideChart(selectedYears) {
      try {
        const container = document.getElementById('ride-perride-chart-container') || chart;
        // ensure mode controls exist and will trigger re-render on change
        try { ensurePerRideModeControls(container, ()=>{ try { const yrs = Array.from(strip.querySelectorAll('.year-chip.selected')).map(el=>el.dataset.year); renderPerRideChart(yrs); } catch(_){} }); } catch(_){ }
        if (!container) return;
        // handle empty selection
        if (!Array.isArray(selectedYears) || selectedYears.length === 0) {
          if (perRideChartInstance) { try { perRideChartInstance.destroy(); } catch(_){} perRideChartInstance = null; }
          const existingCanvas = document.getElementById('perRideChart');
          if (existingCanvas && existingCanvas.parentNode !== container) container.appendChild(existingCanvas);
          return;
        }
        const res = await fetchCountsPerRide(selectedYears);
        const labels = res.labels || [];
        const countsByYear = res.countsByYear || {};
        const yearDates = res.yearDates || {};
        const yearRegions = res.yearRegions || {};
        const yearPosRegionCounts = res.yearPosRegionCounts || {};
        // prefer memberRegions derived from the members collection (global) so legend/colors
        // and stacking include all member-level region values
        const allMemberRegions = Array.isArray(res.memberRegions) ? res.memberRegions.slice() : [];

        // Move per-ride page title into Chart.js title and hide external title div
        const perRideTitleEl = document.getElementById('ride-perride-chart-title');
        const perRideTitleText = perRideTitleEl ? (perRideTitleEl.textContent || '').trim() : '';
        try { if (perRideTitleEl) perRideTitleEl.style.display = 'none'; } catch(_){}

        // prepare canvas
        let canvas = document.getElementById('perRideChart');
        if (!canvas) {
          canvas = document.createElement('canvas');
          canvas.id = 'perRideChart';
          canvas.style.width = '100%';
          canvas.style.height = '100%';
          container.appendChild(canvas);
        } else {
          if (canvas.parentNode !== container) container.appendChild(canvas);
        }

        // If mode is 'regio', aggregate positions into region buckets
        let finalLabels = labels;
        let finalCountsByYear = countsByYear;
        // placeholders for computed aggregations when needed
        let computedMemberRegions = [];
        let computedPerYearMemberCounts = {};

        if (perRideMode === 'regio') {
          // X-axis labels = ride regions (from ride-config yearRegions). Bars/segments = member regions (from member data).
          const rideRegionSet = new Set();
          // collect ride regions across years
          for (const y of selectedYears) {
            const ystr = String(y);
            const regs = (yearRegions[ystr] && Array.isArray(yearRegions[ystr])) ? yearRegions[ystr] : [];
            regs.forEach(r => rideRegionSet.add((r || 'Onbekend')));
          }
          const rideRegions = Array.from(rideRegionSet).sort();
          finalLabels = rideRegions;

          // Use the global member region list when available; otherwise fall back to
          // member-region values observed in the selected years.
          let memberRegions = allMemberRegions.length ? allMemberRegions.slice() : [];
          if (!memberRegions.length) {
            const memberRegionSet = new Set();
            for (const y of selectedYears) {
              const ystr = String(y);
              const posMaps = yearPosRegionCounts[ystr] || [];
              for (const m of posMaps) for (const k of Object.keys(m||{})) memberRegionSet.add((k||'Onbekend'));
            }
            memberRegions = Array.from(memberRegionSet).sort();
          }

          // Build per-year, per-memberRegion datasets aggregated by rideRegion
          const perYearMemberCounts = {};
          for (const y of selectedYears) {
            const ystr = String(y);
            perYearMemberCounts[ystr] = {};
            const posMaps = yearPosRegionCounts[ystr] || [];
            const regs = (yearRegions[ystr] && Array.isArray(yearRegions[ystr])) ? yearRegions[ystr] : [];
            for (let i = 0; i < regs.length; i++) {
              const rideR = (regs[i] || 'Onbekend');
              const m = posMaps[i] || {};
              for (const memRegion of Object.keys(m||{})) {
                perYearMemberCounts[ystr][rideR] = perYearMemberCounts[ystr][rideR] || {};
                perYearMemberCounts[ystr][rideR][memRegion] = (perYearMemberCounts[ystr][rideR][memRegion] || 0) + (m[memRegion] || 0);
              }
            }
          }

          // finalCountsByYear will be built from perYearMemberCounts when creating datasets below
          finalCountsByYear = {};
          for (const y of selectedYears) {
            const ystr = String(y);
            finalCountsByYear[ystr] = rideRegions.map(rr => {
              const map = (perYearMemberCounts[ystr] && perYearMemberCounts[ystr][rr]) ? perYearMemberCounts[ystr][rr] : {};
              // total across member regions for this rideRegion
              return Object.values(map).reduce((a,b)=>a+(b||0),0);
            });
          }
          // keep memberRegions and perYearMemberCounts available for dataset building below
          computedMemberRegions = memberRegions;
          computedPerYearMemberCounts = perYearMemberCounts;
        }

        // build datasets: if we're in 'rit' mode, create stacked region segments per year
        let datasets = [];
        if (perRideMode === 'rit') {
          // collect all region names across selected years from member-level counts
          const regionSet = new Set();
          for (const y of selectedYears) {
            const ystr = String(y);
            const posMaps = yearPosRegionCounts[ystr] || [];
            for (const m of posMaps) for (const k of Object.keys(m||{})) regionSet.add((k||'Onbekend'));
          }
          const regions = Array.from(regionSet).sort();
          // For each year, create a stack of datasets (one dataset per region) so stacks are grouped by year
          for (const y of selectedYears) {
            const ystr = String(y);
            const posMaps = yearPosRegionCounts[ystr] || [];
            for (const r of regions) {
              const dataArr = new Array(finalLabels.length).fill(0);
              for (let i = 0; i < finalLabels.length; i++) {
                try {
                  const m = (posMaps[i] || {});
                  dataArr[i] = (m[r] || 0);
                } catch(_){ }
              }
              datasets.push({ label: `${ystr}-${r}`, data: dataArr, backgroundColor: getColorForRegion(r), stack: 'year_' + ystr, borderRadius: 4 });
            }
          }
        } else {
          // default: grouped by year or aggregated by region
          if (perRideMode === 'regio') {
            // For 'regio' mode we want one stacked bar per ride-region showing the
            // distribution of member-regions across the selected years. Build one
            // dataset per member-region aggregated over all selected years and use
            // the same stack id so the colors stack on top of each other.
            const memberRegions = computedMemberRegions && computedMemberRegions.length ? computedMemberRegions.slice() : [];
            for (const mr of memberRegions) {
              const arr = new Array(finalLabels.length).fill(0);
              for (let idx = 0; idx < finalLabels.length; idx++) {
                try {
                  const rideR = finalLabels[idx];
                  let sum = 0;
                  for (const y of selectedYears) {
                    const ystr = String(y);
                    const val = (computedPerYearMemberCounts[ystr] && computedPerYearMemberCounts[ystr][rideR] && computedPerYearMemberCounts[ystr][rideR][mr]) ? computedPerYearMemberCounts[ystr][rideR][mr] : 0;
                    sum += (val || 0);
                  }
                  arr[idx] = sum;
                } catch(_) { arr[idx] = 0; }
              }
              datasets.push({ label: mr, data: arr, backgroundColor: getColorForRegion(mr), stack: 'regio', borderRadius: 4 });
            }
          } else {
            // grouped by year (original behavior)
            for (const y of selectedYears) {
              const ystr = String(y);
              const dataArr = finalCountsByYear[ystr] || new Array(finalLabels.length).fill(0);
              datasets.push({ label: ystr, data: dataArr, backgroundColor: getColorForYear(ystr), borderRadius: 4 });
            }
          }
        }

        if (perRideChartInstance) { try { perRideChartInstance.destroy(); } catch(_){} perRideChartInstance = null; }

        perRideChartInstance = new Chart(canvas, {
          type: 'bar',
          data: { labels: finalLabels, datasets: datasets },
          options: {
            plugins: { title: { display: !!perRideTitleText, text: perRideTitleText, padding: { top: 6, bottom: 8 }, font: { size: 16 } }, legend: { display: false } },
            layout: { padding: { left: 8, right: 8, top: 8, bottom: 48 } },
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { title: { display: false }, stacked: false },
              y: { beginAtZero: true, ticks: { precision: 0 }, stacked: (perRideMode === 'rit' || perRideMode === 'regio') }
            }
          }
        });

        // Update global legend to show member-region colors when available
        try {
          const legendNames = (allMemberRegions && allMemberRegions.length) ? allMemberRegions : ((perRideMode === 'regio' || perRideMode === 'rit') ? (computedMemberRegions || []) : finalLabels);
          const legendColors = Array.isArray(legendNames) ? legendNames.map(n => getColorForRegion(n)) : [];
          if (legendNames && legendNames.length) renderGlobalLegend(legendNames, legendColors);
        } catch(_){ }

        try { const p = canvas.parentElement; if (p) p.style.height = Math.min(Math.max((finalLabels.length||1) * 56, 320), 1100) + 'px'; } catch(_){ }
      } catch(_) { try { if (perRideChartInstance) { perRideChartInstance.destroy(); perRideChartInstance = null; } } catch(_){} }
    }

    // Fetch per-date registration counts for a given year
    async function fetchDateCountsForYear(year) {
      try {
        const out = {};
        const cacheKey = 'datecounts_' + String(year);
        const cached = cacheRead(cacheKey);
        if (cached) return cached;
        // Ensure Firebase available
        try { await initFirebase(); } catch(_){ }
        const usedDb = (typeof db !== 'undefined' && db) ? db : null;
        if (!usedDb) return out;
        const collRef = collection(usedDb, 'members');
        let snap = null;
        try { snap = await getDocs(collRef); } catch(_) { snap = null; }
        if (!snap || !Array.isArray(snap.docs)) return out;
        for (const sdoc of snap.docs) {
          try {
            const data = typeof sdoc.data === 'function' ? sdoc.data() : sdoc;
            const rawArr = data && (data.ScanDatums || data.scandatums || data.scans) ? (data.ScanDatums || data.scandatums || data.scans) : null;
            if (!Array.isArray(rawArr)) continue;
            for (const entry of rawArr) {
              try {
                const dateStr = extractDate(entry);
                if (!dateStr || String(dateStr).indexOf(String(year)) !== 0) continue;
                out[dateStr] = (out[dateStr] || 0) + 1;
              } catch(_){ }
            }
          } catch(_){ }
        }
        try { cacheWrite(cacheKey, out); } catch(_){}
        return out;
      } catch(_) { return {}; }
    }

    // Listen for aggregated year changes and update chart
    document.addEventListener('ride:years:changed', (ev) => {
      try {
        const yrs = (ev && ev.detail && Array.isArray(ev.detail.years)) ? ev.detail.years : [];
        console.log('ride:years:changed event received, years=', yrs);
        renderChartForYears(yrs);
        try { renderPerRideChart(yrs); } catch(_){}
      } catch(err){ console.error('ride:years:changed handler error', err); }
    });

    // Initial render: use any already-selected chips (auto-select code may have set one),
    // otherwise render with empty selection placeholder.
    try {
      const selectedYears = Array.from(strip.querySelectorAll('.year-chip.selected')).map(el => el.dataset.year);
      if (selectedYears && selectedYears.length > 0) {
        renderChartForYears(selectedYears);
        try { renderPerRideChart(selectedYears); } catch(_){ }
      } else {
        renderChartForYears([]);
        try { renderPerRideChart([]); } catch(_){ }
      }
    } catch (e) {
      renderChartForYears([]);
    }
  } catch (e) { console.warn('populate ride years failed', e); }
})();
