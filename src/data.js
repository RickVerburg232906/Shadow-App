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
          canvas.style.height = '320px';
          chart.appendChild(canvas);
        } else {
          // ensure canvas is inside our chart container for consistent sizing
          if (canvas.parentNode !== chart) chart.appendChild(canvas);
        }

        const counts = await fetchCountsForYears(yearsToShow);
        const labels = yearsToShow;
        const data = labels.map(y => counts[y] || 0);
        // deterministic color per year so colors remain stable when selection changes
        const bgColors = labels.map((y) => {
          const yr = Number(y) || 0;
          const h = (yr * 47) % 360; // multiplier chosen to spread hues
          return `hsl(${h},65%,50%)`;
        });

        if (yearChartInstance) { try { yearChartInstance.destroy(); } catch(_){} yearChartInstance = null; }

        yearChartInstance = new Chart(canvas, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              label: 'Inschrijvingen',
              data: data,
              backgroundColor: bgColors,
              borderRadius: 4,
              barPercentage: 1.0,
              categoryPercentage: 1.0,
              maxBarThickness: 40
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: { enabled: true }
            },
            scales: {
              x: { beginAtZero: true, ticks: { precision: 0 }, title: { display: false } },
              y: { title: { display: false } }
            },
            onClick: async (evt) => {
              try {
                const points = yearChartInstance.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false);
                if (!points || points.length === 0) return;
                const idx = points[0].index;
                const y = labels[idx];
                // Tooltip removed per request; keep click as a no-op or log for debug
                try { console.log('year clicked:', y); } catch(_){}
              } catch(_){ }
            }
          }
        });

        // ensure parent has compact height proportional to number of years (compact multi-year view)
        try {
          const p = canvas.parentElement;
          if (p) {
            const h = Math.min(Math.max(labels.length * 36, 120), 640);
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
        for (const y of selectedYears) countsByYear[String(y)] = new Array(maxLen).fill(0);

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
                    for (const it of map) {
                      try { countsByYear[it.year][it.pos] = (countsByYear[it.year][it.pos] || 0) + 1; } catch(_){}
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
        try { cacheWrite(cacheKey, out); } catch(_){}
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

        // prepare canvas
        let canvas = document.getElementById('perRideChart');
        if (!canvas) {
          canvas = document.createElement('canvas');
          canvas.id = 'perRideChart';
          canvas.style.width = '100%';
          canvas.style.height = '320px';
          container.appendChild(canvas);
        } else {
          if (canvas.parentNode !== container) container.appendChild(canvas);
        }

        // If mode is 'regio', aggregate positions into region buckets
        let finalLabels = labels;
        let finalCountsByYear = countsByYear;
        if (perRideMode === 'regio') {
          // Build set of regions across selected years
          const regionSet = new Set();
          const perYearRegionCounts = {};
          for (const y of selectedYears) {
            const ystr = String(y);
            perYearRegionCounts[ystr] = {};
            const positions = countsByYear[ystr] || [];
            const regions = (yearRegions[ystr] && Array.isArray(yearRegions[ystr])) ? yearRegions[ystr] : [];
            for (let i = 0; i < positions.length; i++) {
              const rname = (regions[i] && String(regions[i]).trim()) ? String(regions[i]).trim() : 'Onbekend';
              regionSet.add(rname);
              perYearRegionCounts[ystr][rname] = (perYearRegionCounts[ystr][rname] || 0) + (positions[i] || 0);
            }
          }
          finalLabels = Array.from(regionSet).sort();
          // rebuild finalCountsByYear as arrays aligned to finalLabels
          finalCountsByYear = {};
          for (const y of selectedYears) {
            const ystr = String(y);
            const rc = perYearRegionCounts[ystr] || {};
            finalCountsByYear[ystr] = finalLabels.map(lbl => rc[lbl] || 0);
          }
        }

        // build datasets: one dataset per selected year, colored by year
        const datasets = [];
        for (const y of selectedYears) {
          const ystr = String(y);
          const dataArr = finalCountsByYear[ystr] || new Array(finalLabels.length).fill(0);
          datasets.push({ label: ystr, data: dataArr, backgroundColor: getColorForYear(ystr), borderRadius: 4 });
        }

        if (perRideChartInstance) { try { perRideChartInstance.destroy(); } catch(_){} perRideChartInstance = null; }

        perRideChartInstance = new Chart(canvas, {
          type: 'bar',
          data: { labels: finalLabels, datasets: datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: true } },
            scales: {
              x: { title: { display: true, text: 'Ritten' } },
              y: { beginAtZero: true, ticks: { precision: 0 } }
            }
          }
        });

        try { const p = canvas.parentElement; if (p) p.style.height = Math.min(Math.max((finalLabels.length||1) * 28, 160), 640) + 'px'; } catch(_){ }
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
