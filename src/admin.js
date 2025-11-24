// ===== JPG export naast 'Herladen' (admin-only) =====
(function() {
  function waitForElement(getter, { tries = 50, delay = 200 } = {}) {
    return new Promise((resolve) => {
      let attempts = 0;
      const iv = setInterval(() => {
        try {
          const el = getter();
          if (el) { clearInterval(iv); resolve(el); return; }
          attempts += 1;
          if (attempts >= tries) { clearInterval(iv); resolve(null); }
        } catch (e) {
          // swallow and retry
        }
      }, delay);
    });
  }

  // Attach a simple JPG download button below a canvas (kept minimal and resilient)
  function attachChartExportJPGNextToReload(canvasId, _chartBoxId, filename = null) {
    async function doAttach() {
      try {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        let btn = document.getElementById('downloadJpgBtn');
        if (!btn) {
          btn = document.createElement('button');
          btn.id = 'downloadJpgBtn';
          btn.type = 'button';
          btn.textContent = 'Download JPG';
          btn.className = 'chart-download-btn';
          btn.style.display = 'block';
          btn.style.width = '100%';
          btn.style.boxSizing = 'border-box';
          btn.style.marginTop = '10px';
          btn.style.padding = '10px 14px';
          btn.style.borderRadius = '10px';
          btn.style.border = 'none';
          btn.style.cursor = 'pointer';
          btn.style.fontWeight = '700';
        }

        const placeBelowChart = () => {
          try {
            const chartBox = canvas.parentElement;
            if (chartBox && chartBox.parentElement) {
              if (btn.parentElement !== chartBox.parentElement) chartBox.insertAdjacentElement('afterend', btn);
            } else {
              if (btn.parentElement !== canvas.parentElement) canvas.insertAdjacentElement('afterend', btn);
            }
          } catch (_) {}
        };

        placeBelowChart();

        const triggerDownload = (blob) => {
          if (!blob) return;
          const a = document.createElement('a');
          const url = URL.createObjectURL(blob);
          a.href = url;
          a.download = filename || (canvasId + '.jpg');
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
        };

        btn.onclick = () => {
          try {
            if (canvas.toBlob) {
              canvas.toBlob((blob) => {
                if (blob) triggerDownload(blob);
                else {
                  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
                  fetch(dataUrl).then(r => r.blob()).then(triggerDownload);
                }
              }, 'image/jpeg', 0.92);
            } else {
              const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
              fetch(dataUrl).then(r => r.blob()).then(triggerDownload);
            }
          } catch (e) {
            console.error('JPG export failed:', e);
            try { if (typeof showToast === 'function') showToast('JPG export mislukt', false); } catch(_) {}
            alert('JPG export mislukt.');
          }
        };

        const ensurePlaced = () => placeBelowChart();
        window.addEventListener('resize', ensurePlaced);
        document.getElementById('adminSubtabs')?.addEventListener('click', () => setTimeout(ensurePlaced, 0));
        const adminView = document.getElementById('viewAdmin');
        if (adminView && window.MutationObserver) {
          const mo = new MutationObserver(() => ensurePlaced());
          mo.observe(adminView, { childList: true, subtree: true });
        }
        ensurePlaced();
      } catch (e) {
        // silently ignore attach errors
      }
    }

    doAttach();
    if (document.readyState !== 'complete' && document.readyState !== 'interactive') {
      document.addEventListener('DOMContentLoaded', doAttach, { once: true });
    }
  }

  window.attachChartExportJPGNextToReload = attachChartExportJPGNextToReload;
})();

import * as XLSX from "xlsx";
import { db, writeBatch, doc, arrayUnion, collection, endAt, getDoc, getDocs, increment, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, startAfter, startAt, runTransaction } from "./firebase.js";
import { withRetry, updateOrCreateDoc } from './firebase-helpers.js';
import { getPlannedDates, plannedStarsWithHighlights } from "./member.js";

// Helper: attach a full-width, nicely-styled download button under a chart canvas
function attachChartDownloadButtonFullWidth(canvasId, btnId, filename = null) {
  try {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    let btn = document.getElementById(btnId);
    if (!btn) {
      btn = document.createElement('button');
      btn.id = btnId;
      btn.type = 'button';
      btn.textContent = 'Download JPG';
      btn.className = 'chart-download-btn';
      // sensible inline defaults for older environments; primary styling in CSS
      btn.style.display = 'block';
      btn.style.width = '100%';
      btn.style.boxSizing = 'border-box';
      btn.style.marginTop = '10px';
      btn.style.padding = '10px 14px';
      btn.style.borderRadius = '10px';
      btn.style.border = 'none';
      btn.style.cursor = 'pointer';
      btn.style.fontWeight = '700';
    }

    const placeBelowChart = () => {
      try {
        const chartBox = canvas.parentElement; // expect .chart-box
        if (chartBox && chartBox.parentElement) {
          if (btn.parentElement !== chartBox.parentElement) chartBox.insertAdjacentElement('afterend', btn);
        } else {
          if (btn.parentElement !== canvas.parentElement) canvas.insertAdjacentElement('afterend', btn);
        }
      } catch (_) {}
    };

    placeBelowChart();

    const triggerDownload = (blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = filename || (canvasId + '.jpg');
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
    };

    btn.onclick = () => {
      try {
        if (canvas.toBlob) {
          canvas.toBlob((blob) => {
            if (blob) triggerDownload(blob);
            else {
              const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
              fetch(dataUrl).then(r => r.blob()).then(triggerDownload);
            }
          }, 'image/jpeg', 0.92);
        } else {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
          fetch(dataUrl).then(r => r.blob()).then(triggerDownload);
        }
      } catch (e) {
        console.error('JPG export failed:', e);
        try { if (typeof showToast === 'function') showToast('JPG export mislukt', false); } catch(_) {}
        alert('JPG export mislukt.');
      }
    };

    // Re-place when layout changes
    const ensurePlaced = () => placeBelowChart();
    window.addEventListener('resize', ensurePlaced);
    const adminView = document.getElementById('viewAdmin');
    adminView?.addEventListener('click', () => setTimeout(ensurePlaced, 0));
    if (adminView && window.MutationObserver) {
      const mo = new MutationObserver(() => ensurePlaced());
      mo.observe(adminView, { childList: true, subtree: true });
    }
  } catch (e) {
    console.error('attachChartDownloadButtonFullWidth failed', e);
  }
}

// ====== Globale ritdatums cache ======
let PLANNED_DATES = [];

// Helper: read the year selection panel and return an array of selected year strings.
function getSelectedYearsFromPanel() {
  try {
    const yearPanel = document.getElementById('rideYearPanel');
    if (!yearPanel) return [];
    const allChk = yearPanel.querySelector('input.all-checkbox');
    const explicit = Array.from(yearPanel.querySelectorAll('input.year-checkbox:not(.all-checkbox):checked')).map(i => i.value).filter(Boolean);
    if ((allChk && allChk.checked) || explicit.length === 0) {
      // treat as all years: enumerate from available items
      const years = Array.from(new Set(Array.from(yearPanel.querySelectorAll('input.year-checkbox:not(.all-checkbox)')).map(i => i.value))).filter(Boolean);
      return years.sort().reverse();
    }
    return explicit;
  } catch (e) { return []; }
}

function getActiveYear() {
  const sel = getSelectedYearsFromPanel();
  if (!sel || sel.length === 0) return String(new Date().getFullYear());
  return sel.length === 1 ? sel[0] : sel[0];
}


// Reset zowel ridesCount als ScanDatums

async function ensureRideDatesLoaded(){
  try{
    if (Array.isArray(PLANNED_DATES) && PLANNED_DATES.length) return PLANNED_DATES;
    const planRef = doc(db, "globals", "ridePlan");
    const snap = await getDoc(planRef);
    const dates = snap.exists() && Array.isArray(snap.data().plannedDates) ? snap.data().plannedDates.filter(Boolean) : [];
    // Normaliseer naar YYYY-MM-DD
    PLANNED_DATES = dates.map(d => {
      if (typeof d === 'string') { const m = d.match(/\d{4}-\d{2}-\d{2}/); if (m) return m[0]; }
      const dt = new Date(d); if (!isNaN(dt)) return dt.toISOString().slice(0,10); return "";
    }).filter(Boolean);
    return PLANNED_DATES;
  } catch(e){ console.error("ensureRideDatesLoaded()", e); PLANNED_DATES = []; return PLANNED_DATES; }
}


// ====== Config / kolommen voor import ======
const REQUIRED_COLS = ["LidNr", "Naam", "Voor naam", "Voor letters", "Tussen voegsel", "Regio Omschrijving"];

// Dynamisch laden van html5-qrcode pas als we echt gaan scannen
let html5qrcodeLoading = false;
function ensureHtml5Qrcode() {
  return new Promise((resolve, reject) => {
    if (window.Html5QrcodeScanner) return resolve(true);
    if (html5qrcodeLoading) {
      const int = setInterval(() => {
        if (window.Html5QrcodeScanner) { clearInterval(int); resolve(true); }
      }, 100);
      setTimeout(() => { clearInterval(int); if (!window.Html5QrcodeScanner) reject(new Error("Timeout bij laden QR-lib")); }, 10000);
      return;
    }
    html5qrcodeLoading = true;
    const s = document.createElement("script");
    s.src = "https://unpkg.com/html5-qrcode";
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => reject(new Error("Kon QR-bibliotheek niet laden"));
    document.head.appendChild(s);
  });
}

// =====================================================
// ===============  Admin hoofd-initialisatie  =========
// =====================================================

// =====================================================
// ===============  Ritstatistieken (bar chart) =========
// =====================================================
// Count members per date, optionally filtered by region (regio Omschrijving)
async function countMembersPerDate(plannedYMDs, regionFilter) {
  // Return map { 'YYYY-MM-DD': count }
  const counts = new Map(plannedYMDs.map(d => [d, 0]));

  try {
    let last = null;
    const pageSize = 400;

    while (true) {
      let qRef = query(collection(db, "members"), orderBy("__name__"), limit(pageSize));
      if (last) qRef = query(collection(db, "members"), orderBy("__name__"), startAfter(last), limit(pageSize));

      const snapshot = await getDocs(qRef);
      if (snapshot.empty) break;

      snapshot.forEach((docSnap) => {
        const d = docSnap.data() || {};
        // If a regionFilter is provided and this member's Regio Omschrijving doesn't match, skip
        if (regionFilter && String(d["Regio Omschrijving"] || "").trim() !== String(regionFilter).trim()) return;
        const scans = Array.isArray(d.ScanDatums) ? d.ScanDatums : [];
        for (const raw of scans) {
          const s = typeof raw === "string" ? (raw.slice(0,10)) : "";
          if (s && counts.has(s)) counts.set(s, counts.get(s) + 1);
        }
      });

      last = snapshot.docs[snapshot.docs.length - 1];
      if (snapshot.size < pageSize) break;
    }
  } catch (e) {
    console.error("[rideStats] tellen mislukt", e);
  }

  return counts;
}

let _rideStatsChart = null;
// Lazy-load Chart.js (ESM build from CDN). Cached in _ChartModule to avoid re-fetch.
let _ChartModule = null;
async function loadChart() {
  if (_ChartModule) return _ChartModule;
  // Try to load an ESM build first (smaller, tree-shakeable when supported)
  try {
    _ChartModule = await import('https://cdn.jsdelivr.net/npm/chart.js/dist/chart.esm.min.js');
    return _ChartModule;
  } catch (e) {
    // If ESM import fails in the browser (often due to nested bare specifiers like @kurkle/color),
    // fallback to injecting the UMD bundle which includes dependencies and exposes `window.Chart`.
    try {
      // If Chart is already present (e.g., loaded previously), reuse it
      if (typeof window !== 'undefined' && window.Chart) {
        _ChartModule = { default: window.Chart, Chart: window.Chart };
        return _ChartModule;
      }

      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        // UMD bundle that contains dependencies bundled in
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js/dist/chart.umd.min.js';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = (err) => reject(err || new Error('Chart UMD load error'));
        document.head.appendChild(script);
      });

      if (typeof window !== 'undefined' && window.Chart) {
        _ChartModule = { default: window.Chart, Chart: window.Chart };
        return _ChartModule;
      }
      // If still no Chart, throw original error
      console.error('Kon Chart.js niet dynamisch laden (UMD fallback mislukte)', e);
      _ChartModule = null;
      return null;
    } catch (err) {
      console.error('Kon Chart.js niet dynamisch laden', e, err);
      _ChartModule = null;
      return null;
    }
  }
}
async function initRideStatsChart() {
  const canvas = document.getElementById("rideStatsChart");
  const statusEl = document.getElementById("rideStatsStatus");
  const reloadBtn = document.getElementById("reloadStatsBtn");
  const regionSelect = document.getElementById("rideRegionFilter");
  const regionStatus = document.getElementById("rideRegionStatus");
  if (!canvas) return;

  async function render() {
    try {
      if (statusEl) statusEl.textContent = "Laden…";
      const planned = (await ensureRideDatesLoaded()) || [];
      // Normaliseer naar YYYY-MM-DD en sorteer
      const plannedYMDsAll = planned.map(d => (typeof d === "string" ? d.slice(0,10) : "")).filter(Boolean).sort();
      // Year filter UI: custom multi-select panel (button + panel)
      const yearToggle = document.getElementById('rideYearToggle');
      const yearPanel = document.getElementById('rideYearPanel');
      // Populate yearPanel once with checkbox items
      if (yearPanel) {
        // If year items (excluding the master 'all' item) are missing, populate them
        const existingYearItems = yearPanel.querySelectorAll('.year-item:not(.year-all)').length;
        if (existingYearItems === 0) {
          const years = Array.from(new Set(plannedYMDsAll.map(d => d.slice(0,4)))).sort().reverse();
          for (const y of years) {
            const item = document.createElement('label');
            item.className = 'year-item';
            const chk = document.createElement('input');
            chk.type = 'checkbox'; chk.value = y; chk.className = 'year-checkbox';
            const span = document.createElement('span'); span.textContent = y;
            item.appendChild(chk); item.appendChild(span);
            yearPanel.appendChild(item);
          }
        }

        // Master 'Alle jaren' checkbox behavior
        const allChk = yearPanel.querySelector('input.all-checkbox');
        // Default: if present and no explicit selection stored, keep master checked
        if (allChk && typeof allChk.checked === 'boolean') {
          // When master toggles, set all individual checkboxes to the same state
          if (!allChk.dataset._wired) {
            allChk.addEventListener('change', () => {
              const items = yearPanel.querySelectorAll('input.year-checkbox:not(.all-checkbox)');
              items.forEach(i => i.checked = allChk.checked);
              updateYearToggleText();
              // Broadcast year change for other page parts
              document.dispatchEvent(new CustomEvent('admin:yearChange', { detail: { selected: getSelectedYearsFromPanel() } }));
              // Defer render slightly to avoid interfering with the originating click event
              setTimeout(() => render(), 0);
            }, { passive: true });
            allChk.dataset._wired = '1';
          }
        }

        // Ensure each individual checkbox updates the master checkbox state
        const bindIndividual = () => {
          const items = yearPanel.querySelectorAll('input.year-checkbox:not(.all-checkbox)');
          items.forEach((chk) => {
            // Avoid double-binding by checking a marker
            if (chk.dataset._wired) return;
            chk.addEventListener('change', () => {
              const allItems = yearPanel.querySelectorAll('input.year-checkbox:not(.all-checkbox)');
              const allChecked = Array.from(allItems).length > 0 && Array.from(allItems).every(i => i.checked);
              if (allChk) allChk.checked = allChecked;
              updateYearToggleText();
              // Broadcast year change for other page parts
              document.dispatchEvent(new CustomEvent('admin:yearChange', { detail: { selected: getSelectedYearsFromPanel() } }));
              // Defer render slightly to avoid interfering with the checkbox click
              setTimeout(() => render(), 0);
            }, { passive: true });
            chk.dataset._wired = '1';
          });
        };
        bindIndividual();

        // Toggle open/close (wire once)
        if (yearToggle && !yearToggle.dataset._wired) {
          yearToggle.addEventListener('click', (ev) => { ev.stopPropagation(); if (yearPanel) { yearPanel.hidden = !yearPanel.hidden; yearPanel.setAttribute('aria-hidden', String(yearPanel.hidden)); } });
          yearToggle.dataset._wired = '1';
        }
        // Click outside to close (wire once)
        if (!document._rideYearPanelWired) {
          document.addEventListener('click', (ev) => {
            if (yearPanel && !yearPanel.hidden && !yearPanel.contains(ev.target) && ev.target !== yearToggle) {
              yearPanel.hidden = true; yearPanel.setAttribute('aria-hidden', 'true');
            }
          });
          document._rideYearPanelWired = true;
        }
        yearPanel.addEventListener('click', (ev) => ev.stopPropagation());
      }

      function updateYearToggleText() {
        if (!yearToggle) return;
        const allChk = yearPanel ? yearPanel.querySelector('input.all-checkbox') : null;
        if (allChk && allChk.checked) {
          yearToggle.textContent = 'Alle jaren ▾';
          return;
        }
        const sel = yearPanel ? Array.from(yearPanel.querySelectorAll('input.year-checkbox:not(.all-checkbox):checked')).map(i => i.value) : [];
        yearToggle.textContent = sel.length ? (sel.join(', ') + ' ▾') : 'Alle jaren ▾';
      }

    // collect selected years (may be multiple) using shared helper
    const selectedYears = getSelectedYearsFromPanel();
    // If exactly one year selected, show that year's planned dates. Otherwise default to all dates (handled later for multi-year rendering)
    const plannedYMDs = (selectedYears.length === 1) ? plannedYMDsAll.filter(d => d.slice(0,4) === selectedYears[0]) : plannedYMDsAll;
      // Ensure toggle text reflects current state
      updateYearToggleText();
      if (!plannedYMDs.length) {
        if (statusEl) statusEl.textContent = "Geen geplande datums.";
        return;
      }
      // Respect region filter if present
      const selectedRegion = regionSelect ? (regionSelect.value || null) : null;
      // regionStatus previously showed `Regio: <name>` but the chart title now contains the region,
      // so we avoid duplicating that text in the UI. Leave the status element empty.
      // if (regionStatus) regionStatus.textContent = selectedRegion ? `Regio: ${selectedRegion}` : "";

  // Year selection may be multiple. Use the selection computed above (`selectedYears`).
  // (selectedYears was derived from selectedYearsInitial, but if none were checked we expanded to allYears)

  let labels = [];
  let datasets = [];
  // Helper: when showing a single year we prefer to label the x-axis as Rit 1, Rit 2, ...
  // but keep the actual planned dates available for tooltip titles.
  let plannedYMDsForTooltips = null;

      if (selectedYears && selectedYears.length > 1) {
        // Multi-year mode for rides chart: provide a choice to view either per-slot (Rit) or aggregated by Regio
        const years = selectedYears.slice();
        const perYearDates = years.map(y => plannedYMDsAll.filter(d => d.slice(0,4) === y));

        // Ensure a small UI control exists to toggle multi-year view mode (Rit vs Regio)
        try {
          const regionRow = regionSelect ? regionSelect.parentElement : null;
          if (regionRow) {
            let modeWrap = document.getElementById('multiYearModeWrap');
            if (!modeWrap) {
              modeWrap = document.createElement('div');
              modeWrap.id = 'multiYearModeWrap';
              // place under the region filter row
              modeWrap.style.display = 'block';
              modeWrap.style.marginTop = '8px';
              modeWrap.innerHTML = `<label for="multiYearMode" class="small muted" style="display:block;margin-bottom:6px;">Filter:</label>`;
              const sel = document.createElement('select');
              sel.id = 'multiYearMode';
              sel.style.padding = '6px 8px';
              sel.style.borderRadius = '8px';
              sel.style.background = 'transparent';
              sel.innerHTML = '<option value="rit">Rit</option><option value="regio">Regio</option>';
              modeWrap.appendChild(sel);
              // insert after the regionRow so it appears on its own line under the region select
              try {
                if (regionRow.parentElement) regionRow.parentElement.insertBefore(modeWrap, regionRow.nextSibling);
                else regionRow.appendChild(modeWrap);
              } catch (e) {
                regionRow.appendChild(modeWrap);
              }
              sel.addEventListener('change', () => {
                // Re-render chart when mode changes
                setTimeout(() => render(), 0);
              }, { passive: true });
            }
          }
        } catch (e) {
          console.error('Kon multi-year mode control niet toevoegen', e);
        }

        // Determine selected mode (default to 'rit')
        const modeEl = document.getElementById('multiYearMode');
        const mode = (modeEl && modeEl.value) ? modeEl.value : 'rit';

        if (mode === 'rit') {
          // Preserve previous behavior (per-year counts per slot)
          const maxSlots = Math.max(...perYearDates.map(a => a.length));
          // labels: Rit 1, Rit 2, ... (simple numeric slot labels)
          labels = Array.from({length: maxSlots}, (_,i) => `Rit ${i+1}`);

          // color palette (repeat if needed)
          const palette = ['#2563eb','#06b6d4','#f97316','#10b981','#8b5cf6','#ef4444','#f59e0b'];

          // For each year build a dataset array aligned to slots
          for (let yi = 0; yi < years.length; yi++) {
            const year = years[yi];
            const dates = perYearDates[yi] || [];
            // compute counts for these dates
            const counts = await countMembersPerDate(dates, selectedRegion);
            const data = [];
            for (let i = 0; i < maxSlots; i++) {
              const d = dates[i] || null;
              data.push(d ? (counts.get(d) || 0) : 0);
            }
            datasets.push({ label: year, data, backgroundColor: palette[yi % palette.length], borderRadius: 6 });
          }
        } else {
          // mode === 'regio': aggregate counts by region across the selected years
          // Load regions mapping (date -> region)
          let regionsMap = {};
          try {
            const regionsRef = doc(db, "globals", "rideRegions");
            const rSnap = await getDoc(regionsRef);
            regionsMap = rSnap.exists() && rSnap.data() ? (rSnap.data().regions || {}) : {};
          } catch (e) {
            console.error('Kon rideRegions niet laden voor regio-aggregatie', e);
          }

          // Build set of all region labels present in the selected years' planned dates
          const regionLabelsSet = new Set();
          for (let yi = 0; yi < years.length; yi++) {
            const dates = perYearDates[yi] || [];
            for (const d of dates) {
              const rname = (d && regionsMap[d]) ? regionsMap[d] : '';
              regionLabelsSet.add(rname || 'Regio (alles)');
            }
          }
          const regionLabels = Array.from(regionLabelsSet).sort((a,b) => a.localeCompare(b));
          labels = regionLabels.slice();

          // For each year, compute counts per region by summing counts for dates in that region
          const palette = ['#2563eb','#06b6d4','#f97316','#10b981','#8b5cf6','#ef4444','#f59e0b'];
          for (let yi = 0; yi < years.length; yi++) {
            const year = years[yi];
            const dates = perYearDates[yi] || [];
            const counts = await countMembersPerDate(dates, selectedRegion);
            const data = regionLabels.map((rLab) => {
              // sum counts for dates in this year that map to rLab
              let sum = 0;
              for (const d of dates) {
                const rname = (d && regionsMap[d]) ? regionsMap[d] : '';
                const labelKey = rname || 'Regio (alles)';
                if (labelKey === rLab) sum += (counts.get(d) || 0);
              }
              return sum;
            });
            datasets.push({ label: year, data, backgroundColor: palette[yi % palette.length], borderRadius: 6 });
          }
        }
      } else {
        // Single-year or none selected -> use Rit labels on the x-axis, but keep real dates for tooltips
        const counts = await countMembersPerDate(plannedYMDs, selectedRegion);
        plannedYMDsForTooltips = plannedYMDs.slice();
        // Load regions mapping (date -> region) so we can append the region name to each Rit label
        let regionsMap = {};
        try {
          const regionsRef = doc(db, "globals", "rideRegions");
          const rSnap = await getDoc(regionsRef);
          regionsMap = rSnap.exists() && rSnap.data() ? (rSnap.data().regions || {}) : {};
        } catch (e) {
          console.error('Kon rideRegions niet laden voor chart labels', e);
        }

        labels = plannedYMDs.map((d, i) => {
          const region = (d && regionsMap[d]) ? regionsMap[d] : '';
          return region ? `Rit ${i+1} — ${region}` : `Rit ${i+1}`;
        });
        const data = plannedYMDs.map(d => counts.get(d) || 0);
        datasets = [{ label: 'Inschrijvingen', data, backgroundColor: (ctx => {
          // gradient will be applied in Chart options later; keep solid fallback
          return '#2563eb';
        }) }];
      }

      // Destroy oud chart om memory leaks te voorkomen
      try { if (_rideStatsChart) { _rideStatsChart.destroy(); _rideStatsChart = null; } } catch(_) {}

      // Dynamically load Chart.js when we first render the stats chart
      const ChartModule = await loadChart();
      const ChartCtor = (ChartModule && (ChartModule.default || ChartModule.Chart)) || null;
      if (!ChartCtor) {
        if (statusEl) statusEl.textContent = '❌ Chart.js niet beschikbaar';
        return;
      }

  const ctx = canvas.getContext("2d");
  // Title should reflect selected region and/or selected year when applicable
  let titleText = 'Inschrijvingen per rit';
  if (selectedRegion) titleText += ` — ${selectedRegion}`;
  // If exactly one year is selected, append the year to the title (e.g. "Inschrijvingen per rit — 2025")
  if (Array.isArray(selectedYears) && selectedYears.length === 1) {
    titleText += ` — ${selectedYears[0]}`;
  }

      // Create a pleasing blue gradient for the bars
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height || 300);
      grad.addColorStop(0, '#60a5fa'); // light
      grad.addColorStop(1, '#2563eb'); // deep

      // Build chart datasets: if single dataset provided earlier, allow gradient
      const chartDatasets = datasets.map((ds, idx) => {
        if (typeof ds.backgroundColor === 'function') {
          return Object.assign({}, ds, { backgroundColor: grad, borderRadius: 8, borderSkipped: false, barPercentage: 0.85, categoryPercentage: 0.9 });
        }
        return Object.assign({}, ds, { borderRadius: 8, borderSkipped: false, barPercentage: 0.85, categoryPercentage: 0.9 });
      });

      _rideStatsChart = new ChartCtor(ctx, {
        type: "bar",
        data: { labels, datasets: chartDatasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 6, right: 6, bottom: 6, left: 6 } },
          scales: {
            x: {
              title: { display: true, text: "Rit" },
              grid: { display: false },
              ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }
            },
            y: {
              beginAtZero: true,
              title: { display: true, text: "Aantal leden" },
              ticks: { precision: 0 },
              grid: { color: 'rgba(148,163,184,0.12)' }
            }
          },
          plugins: {
            title: { display: true, text: titleText, font: { size: 14 } },
            // Only show legend when multiple datasets are present (multi-year mode)
            legend: { display: (Array.isArray(chartDatasets) && chartDatasets.length > 1), position: 'top' },
            tooltip: {
              backgroundColor: '#0f172a',
              titleColor: '#fff',
              bodyColor: '#fff',
              padding: 8,
              callbacks: {
                // Show the actual planned date as tooltip title when available, otherwise fall back to the axis label
                title: (items) => {
                  const ix = items[0].dataIndex;
                  return (plannedYMDsForTooltips && plannedYMDsForTooltips[ix]) || labels[ix] || '';
                },
                label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y} inschrijvingen`
              }
            }
          },
          animation: { duration: 600, easing: 'easeOutQuad' }
        }
      });
  // Add full-width download button under the chart
  try { attachChartDownloadButtonFullWidth('rideStatsChart', 'downloadRideStatsBtn', 'inschrijvingen-per-rit.jpg'); } catch (_) {}
      if (statusEl) {
        try {
          let totalCount = 0;
          if (Array.isArray(chartDatasets) && chartDatasets.length) {
            for (const ds of chartDatasets) {
              if (Array.isArray(ds.data)) totalCount += ds.data.reduce((a,b)=>a + (Number(b) || 0), 0);
            }
          } else if (Array.isArray(datasets) && datasets.length && Array.isArray(datasets[0].data)) {
            totalCount = datasets[0].data.reduce((a,b)=>a + (Number(b) || 0), 0);
          }
          statusEl.textContent = `✅ Gegevens geladen (${totalCount} totaal)`;
        } catch (e) {
          statusEl.textContent = `✅ Gegevens geladen`;
        }
      }
    } catch (e) {
      console.error(e);
      if (statusEl) statusEl.textContent = "❌ Laden mislukt";
    }
  }

  await render();
  // Ensure pre-created multiYearMode select (if present in DOM) triggers re-render when changed
  try {
    const preSel = document.getElementById('multiYearMode');
    if (preSel && !preSel.dataset._wired) {
      preSel.addEventListener('change', () => { setTimeout(() => render(), 0); }, { passive: true });
      preSel.dataset._wired = '1';
    }
  } catch (e) { console.error('Kon multiYearMode hook niet binden', e); }
  if (reloadBtn) reloadBtn.addEventListener("click", () => render(), { passive: true });
  // Populate region select asynchronously
  (async () => {
    try {
      if (!regionSelect) return;
      regionSelect.innerHTML = '<option value="">Alles</option>';
      const regions = await getAllRegions();
      regions.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r;
        opt.textContent = r;
        regionSelect.appendChild(opt);
      });
      regionSelect.addEventListener('change', () => render(), { passive: true });
    } catch (e) {
      console.error("Kon regio's niet laden", e);
    }
  })();
}

// Get all distinct regions from members collection (sorted)
async function getAllRegions() {
  const set = new Set();
  try {
    let last = null;
    const pageSize = 400;
    while (true) {
      let qRef = query(collection(db, "members"), orderBy("__name__"), limit(pageSize));
      if (last) qRef = query(collection(db, "members"), orderBy("__name__"), startAfter(last), limit(pageSize));
      const snap = await getDocs(qRef);
      if (snap.empty) break;
      snap.forEach(s => {
        const d = s.data() || {};
        const r = (d["Regio Omschrijving"] || "").trim();
        if (r) set.add(r);
      });
      last = snap.docs[snap.docs.length - 1];
      if (snap.size < pageSize) break;
    }
  } catch (e) {
    console.error('getAllRegions failed', e);
  }
  return Array.from(set).sort((a,b) => a.localeCompare(b));
}


// =====================================================
// ======= Sterrenverdeling (alleen Jaarhanger = Ja) ====
// =====================================================
async function buildStarBucketsForYearhangerYes(plannedYMDs) {
  // Buckets 0..N (N = aantal geplande datums)
  const N = plannedYMDs.length;
  const buckets = new Array(N + 1).fill(0);
  const plannedSet = new Set(plannedYMDs);

  try {
    let last = null;
    const pageSize = 400;
    while (true) {
      let qRef = query(collection(db, "members"), orderBy("__name__"), limit(pageSize));
      if (last) qRef = query(collection(db, "members"), orderBy("__name__"), startAfter(last), limit(pageSize));
      const snapshot = await getDocs(qRef);
      if (snapshot.empty) break;

      snapshot.forEach((docSnap) => {
        const d = docSnap.data() || {};
        if ((d.Jaarhanger || "").toString() !== "Ja") return; // filter
        const scansRaw = Array.isArray(d.ScanDatums) ? d.ScanDatums : [];
        // normaliseer naar YMD en tel intersectie
        let cnt = 0;
        for (const raw of scansRaw) {
          const ymd = typeof raw === "string" ? raw.slice(0,10) : "";
          if (ymd && plannedSet.has(ymd)) cnt++;
        }
        if (cnt < 0) cnt = 0;
        if (cnt > N) cnt = N;
        buckets[cnt] += 1;
      });

      last = snapshot.docs[snapshot.docs.length - 1];
      if (snapshot.size < pageSize) break;
    }
  } catch (e) {
    console.error("[starDist] bouwen mislukt", e);
  }
  return buckets;
}

// Multi-year aware buckets: accepts an array of year strings (e.g. ['2025','2024'])
// Returns an array where each element is the buckets array for that year (index-aligned with input years).
async function buildStarBucketsForYears(years) {
  // years: ['2025','2024', ...]
  const yearCount = years.length;
  // track counts per year as Map(count -> frequency)
  const maps = Array.from({length: yearCount}, () => new Map());

  try {
    let last = null;
    const pageSize = 400;
    while (true) {
      let qRef = query(collection(db, "members"), orderBy("__name__"), limit(pageSize));
      if (last) qRef = query(collection(db, "members"), orderBy("__name__"), startAfter(last), limit(pageSize));

      const snapshot = await getDocs(qRef);
      if (snapshot.empty) break;

      snapshot.forEach((docSnap) => {
        const d = docSnap.data() || {};
        if ((d.Jaarhanger || "").toString() !== "Ja") return; // filter only Jaarhanger=Ja
        const scansRaw = Array.isArray(d.ScanDatums) ? d.ScanDatums : [];
        // Normalize scans to YMD array
        const scanYMDs = scansRaw.map(s => (typeof s === 'string' ? s.slice(0,10) : '')).filter(Boolean);
        for (let yi = 0; yi < yearCount; yi++) {
          const yr = years[yi];
          // Count scans in this calendar year
          let cnt = 0;
          for (const ymd of scanYMDs) { if (ymd.slice(0,4) === yr) cnt++; }
          const m = maps[yi];
          m.set(cnt, (m.get(cnt) || 0) + 1);
        }
      });

      last = snapshot.docs[snapshot.docs.length - 1];
      if (snapshot.size < pageSize) break;
    }
  } catch (e) {
    console.error('[starDist multi-year] bouwen mislukt', e);
  }

  // Convert maps to buckets arrays (0..max)
  const bucketsPerYear = maps.map(m => {
    const max = Math.max(...Array.from(m.keys(), k => Number(k)), 0);
    const arr = new Array(max + 1).fill(0);
    for (const [k,v] of m.entries()) { arr[Number(k)] = v; }
    return arr;
  });
  return bucketsPerYear;
}

let _starDistChart = null;
async function initStarDistributionChart() {
  const canvas = document.getElementById("starDistChart");
  const statusEl = document.getElementById("starDistStatus");
  const reloadBtn = document.getElementById("reloadStarDistBtn");
  if (!canvas) return;

  async function render() {
    try {
      if (statusEl) statusEl.textContent = "Laden…";
      const planned = (await ensureRideDatesLoaded()) || [];
      const plannedYMDsAll = planned.map(d => (typeof d === "string" ? d.slice(0,10) : "")).filter(Boolean).sort();
  // Star distribution should be independent from the global year selection UI.
  // Always render for the current calendar year to avoid surprising multi-year aggregation.
  const selectedYear = String(new Date().getFullYear());
    const bucketsPerYearSingle = await buildStarBucketsForYears([selectedYear]);
    const buckets = (bucketsPerYearSingle && bucketsPerYearSingle[0]) ? bucketsPerYearSingle[0] : [0];
    const N = Math.max(0, buckets.length - 1);
  const labels = Array.from({length: buckets.length}, (_,i) => String(i));
  const data = buckets;

      // Destroy oud chart
      try { if (_starDistChart) { _starDistChart.destroy(); _starDistChart = null; } } catch(_) {}

      // Dynamically load Chart.js when rendering the star distribution
      const ChartModule = await loadChart();
      const ChartCtor = (ChartModule && (ChartModule.default || ChartModule.Chart)) || null;
      if (!ChartCtor) {
        if (statusEl) statusEl.textContent = '❌ Chart.js niet beschikbaar';
        return;
      }
      const ctx = canvas.getContext("2d");

      // Gradient for star distribution (green hues)
      const grad2 = ctx.createLinearGradient(0, 0, 0, canvas.height || 240);
      grad2.addColorStop(0, '#86efac');
      grad2.addColorStop(1, '#16a34a');

      // Build title for star distribution (tied to selectedYear which is the current calendar year)
      const starTitle = `Sterrenverdeling (Jaarhanger = Ja) — ${selectedYear}`;

      _starDistChart = new ChartCtor(ctx, {
        type: "bar",
        data: {
          labels,
          datasets: [{
            label: "Aantal leden",
            data,
            backgroundColor: grad2,
            borderRadius: 6,
            borderSkipped: false,
            barPercentage: 0.8,
            categoryPercentage: 0.9
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 6, right: 6, bottom: 6, left: 6 } },
          scales: {
            x: {
              title: { display: true, text: "Aantal sterren (0.."+N+")" },
              grid: { display: false }
            },
            y: {
              beginAtZero: true,
              title: { display: true, text: "Aantal leden" },
              ticks: { precision: 0 },
              grid: { color: 'rgba(148,163,184,0.12)' }
            }
          },
          plugins: {
            title: { display: true, text: starTitle },
            legend: { display: false },
            tooltip: {
              backgroundColor: '#0f172a',
              titleColor: '#fff',
              bodyColor: '#fff',
              padding: 8,
              callbacks: { label: (ctx) => ` ${ctx.parsed.y} leden` }
            }
          },
          animation: { duration: 600, easing: 'easeOutQuad' }
        }
      });
  // Add full-width download button under the star distribution chart
  try { attachChartDownloadButtonFullWidth('starDistChart', 'downloadStarDistBtn', 'sterrenverdeling.jpg'); } catch (_) {}
      const totaal = data.reduce((a,b)=>a+b,0);
      if (statusEl) statusEl.textContent = `✅ Gegevens geladen (leden met Jaarhanger=Ja: ${totaal})`;
    } catch (e) {
      console.error(e);
      if (statusEl) statusEl.textContent = "❌ Laden mislukt";
    }
  }

  await render();
  if (reloadBtn) reloadBtn.addEventListener("click", () => render(), { passive: true });
  // React to centralized year selection changes dispatched from the year panel
  // Do NOT react to admin:yearChange — star distribution stays tied to the calendar year only.
}

export function initAdminView() {
  const $ = (id) => document.getElementById(id);
  
  // Detect which admin page we're on based on the current URL
  // Support both with and without .html (e.g., clean URLs on Vercel)
  const fullPath = (window.location.pathname || '/').replace(/\\/g, '/').toLowerCase();
  const base = fullPath.split('/').filter(Boolean).pop() || 'index.html';
  const slug = base.replace(/\.html?$/, ''); // e.g. 'admin-scan', 'index'
  const isAdminScan = slug === 'admin-scan';
  const isAdminPlanning = slug === 'admin-planning';
  const isAdminExcel = slug === 'admin-excel';
  const isAdminPasswords = slug === 'admin-passwords';
  const isAdminStats = slug === 'admin-stats';
  const isAdminLunch = slug === 'admin-lunch';
  const isAdminDev = slug === 'admin-dev';
  const isIndexPage = slug === 'index' || fullPath === '/';

  // Excel upload logic (moved to dedicated admin-excel page)
  if (isAdminExcel) {
    const fileInput = $("fileInput");
    const fileName  = $("fileName");
    const uploadBtn = $("uploadBtn");
    const statusEl  = $("status");
    const logEl     = $("log");

    function log(msg, cls = "") {
      if (!logEl) return;
      const p = document.createElement("div");
      if (cls) p.className = cls;
      p.textContent = msg;
      logEl.appendChild(p);
      logEl.scrollTop = logEl.scrollHeight;
    }
    function setLoading(on) {
      if (uploadBtn) {
        uploadBtn.disabled = on;
        uploadBtn.textContent = on ? "Bezig..." : "Uploaden";
      }
    }

    fileInput?.addEventListener("change", () => {
      const f = fileInput?.files?.[0];
      if (fileName) fileName.textContent = f ? f.name : "Geen bestand gekozen";
    });

    async function readWorkbook(file) {
      const buf = await file.arrayBuffer();
      return XLSX.read(buf, { type: "array" });
    }

    function sheetToRows(wb) {
      const name = wb.SheetNames[0];
      const ws = wb.Sheets[name];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      return rows;
    }

    // ⚠️ Belangrijk: we negeren elke 'ridesCount' uit het bestand
    // zodat bestaande waarden niet overschreven worden.
    function normalizeRows(rows) {
      return rows.map((r) => {
        const out = {};
        for (const k of REQUIRED_COLS) out[k] = (r[k] ?? "").toString().trim();
        // GEEN ridesCount hier!
        return out;
      });
    }

    async function importRowsToFirestore(rows) {
      let total = 0, updated = 0, skipped = 0;
      let batch = writeBatch(db);
      const commit = async () => { await batch.commit(); batch = writeBatch(db); };

      for (const r of rows) {
        total++;
        const id = String(r["LidNr"] || "").trim();
        if (!/^\d+$/.test(id)) { skipped++; continue; }

        // Alleen profielvelden schrijven; ridesCount NIET overschrijven.
        // Gebruik increment(0): behoudt bestaande waarde; als veld ontbreekt → wordt 0.
        const clean = {};
        for (const k of REQUIRED_COLS) clean[k] = r[k];
        clean["ridesCount"] = increment(0);

        batch.set(doc(db, "members", id), clean, { merge: true });
        updated++;

        if (updated % 400 === 0) await commit();
      }
      await commit();
      return { total, updated, skipped };
    }

    let uploading = false;
    async function handleUpload() {
      if (uploading) return; // eenvoudige debounce
      const file = fileInput?.files?.[0];
      if (!file) { if (statusEl) statusEl.textContent = "❗ Kies eerst een bestand"; return; }
      uploading = true;
      setLoading(true);
      if (statusEl) statusEl.textContent = "Bezig met inlezen…";
      if (logEl) logEl.innerHTML = "";

      try {
        const wb   = await readWorkbook(file);
        const rows = normalizeRows(sheetToRows(wb));
        log(`Gelezen rijen: ${rows.length}`);

        if (statusEl) statusEl.textContent = "Importeren naar Firestore…";
        const res = await importRowsToFirestore(rows);
        log(`Klaar. Totaal: ${res.total}, verwerkt: ${res.updated}, overgeslagen: ${res.skipped}`, "ok");
        if (statusEl) statusEl.textContent = "✅ Import voltooid (ridesCount behouden)";
      } catch (e) {
        console.error(e);
        if (statusEl) statusEl.textContent = "❌ Fout tijdens import";
        log(String(e?.message || e), "err");
      } finally {
        setLoading(false);
        uploading = false;
      }
    }

    $("uploadBtn")?.addEventListener("click", handleUpload);

    // ===== Reset-alle-ritten (popup bevestiging) =====
    // Note: the reset button belongs on the planning page; initialization
    // is performed inside initRidePlannerSection so it runs when on that page.

    // ===== Reset Jaarhanger (popup bevestiging) =====
    const resetJBtn = document.getElementById("resetJaarhangerBtn");
    const resetJStatus = document.getElementById("resetJaarhangerStatus");
    if (resetJBtn && !resetJBtn.dataset._wired) {
      resetJBtn.addEventListener("click", async () => {
        const ok = window.confirm("Weet je zeker dat je de Jaarhanger keuze voor ALLE leden wilt resetten naar leeg? Dit kan niet ongedaan worden gemaakt.");
        if (!ok) return;
        await resetAllJaarhanger(resetJStatus);
      });
      resetJBtn.dataset._wired = '1';
    }

  // ===== Ritten plannen (globaal) =====
  // Note: initRidePlannerSection should only run on the planning page (or index).
  // It was previously accidentally called here inside the admin-excel branch.
  }

  // ===== Handmatig rit registreren (Scan page) =====
  if (isAdminScan || isIndexPage) {
    initManualRideSection();

    // Init QR-scanner sectie (Admin)
    try { initAdminQRScanner(); } catch (_) {}
  }

  // Ritten plannen (globaal) - init only on the planning page or index
  if (isAdminPlanning || isIndexPage) {
    try { initRidePlannerSection(); } catch (_) {}
  }

  // Stats page
  if (isAdminStats || isIndexPage) {
    // Ritstatistieken
    try { initRideStatsChart(); } catch (_) {}
    // Sterrenverdeling (Jaarhanger=Ja)
    try { initStarDistributionChart(); } catch (_) {}

  // Export buttons removed in favor of long-press export on the canvases
  }

  // Dev tools page: reset Jaarhanger en Lunch
  if (isAdminDev || isIndexPage) {
    const resetJBtn = document.getElementById("resetJaarhangerBtn");
    const resetJStatus = document.getElementById("resetJaarhangerStatus");
    if (resetJBtn && !resetJBtn.dataset._wired) {
      resetJBtn.addEventListener("click", async () => {
        const ok = window.confirm("Weet je zeker dat je de Jaarhanger keuze voor ALLE leden wilt resetten naar leeg? Dit kan niet ongedaan worden gemaakt.");
        if (!ok) return;
        await resetAllJaarhanger(resetJStatus);
      });
      resetJBtn.dataset._wired = '1';
    }

    const resetLBtn = document.getElementById("resetLunchBtn");
    const resetLStatus = document.getElementById("resetLunchStatus");
    if (resetLBtn && !resetLBtn.dataset._wired) {
      resetLBtn.addEventListener("click", async () => {
        const ok = window.confirm("Weet je zeker dat je ALLE lunchgegevens (deelname/keuze/timestamp/ritdatum) voor alle leden wilt resetten? Dit kan niet ongedaan worden gemaakt.");
        if (!ok) return;
        await resetAllLunch(resetLStatus);
      });
      resetLBtn.dataset._wired = '1';
    }
  }
}

// =====================================================
// ===============  Ritten plannen (globaal) ===========
// =====================================================
function initRidePlannerSection() {
  const $ = (id) => document.getElementById(id);
  const card = $("ridePlannerCard");
  if (!card) return;

  const d1 = $("rideDate1");
  const d2 = $("rideDate2");
  const d3 = $("rideDate3");
  const d4 = $("rideDate4");
  const d5 = $("rideDate5");
  const d6 = $("rideDate6");
  const r1 = $("rideRegion1");
  const r2 = $("rideRegion2");
  const r3 = $("rideRegion3");
  const r4 = $("rideRegion4");
  const r5 = $("rideRegion5");
  const r6 = $("rideRegion6");
  const reloadBtn = $("reloadRidePlanBtn");
  const statusEl = $("ridePlanStatus");

  const planRef = doc(db, "globals", "ridePlan");

  function setStatus(msg, ok = true) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.color = ok ? "#9ca3af" : "#ef4444";
  }

  function setInputs(dates) {
    const arr = Array.isArray(dates) ? dates : [];
    const vals = (arr.slice(0,6).concat(Array(6))).slice(0,6).map(v => v || "");
    [d1,d2,d3,d4,d5,d6].forEach((el, i) => { if (el) el.value = vals[i] || ""; });
    // Regions will be populated separately by loadPlan (mapped by date)
  }

  let isLoadingPlan = false;
  async function loadPlan() {
    try {
      setStatus("Laden…");
      isLoadingPlan = true;
      const snap = await getDoc(planRef);
      let dates = [];
      if (snap.exists()) {
        const data = snap.data() || {};
        dates = Array.isArray(data.plannedDates) ? data.plannedDates : [];
        setInputs(dates);
        setStatus(`✅ ${dates.length} datums geladen`);
      } else {
        setInputs([]);
        setStatus("Nog geen planning opgeslagen.");
      }

      // Load regions mapping (date -> region) and populate selects
      try {
        const regionsRef = doc(db, "globals", "rideRegions");
        const rSnap = await getDoc(regionsRef);
        const regionsMap = rSnap.exists() && rSnap.data() ? (rSnap.data().regions || {}) : {};
        // populate region selects with current regions (values will be set after options loaded)
        await populateRegionOptions();
        // assign mapped values
        const map = regionsMap || {};
        [[d1,r1],[d2,r2],[d3,r3],[d4,r4],[d5,r5],[d6,r6]].forEach(([dateEl, regionEl]) => {
          try {
            const ymd = (dateEl && dateEl.value) ? dateEl.value.slice(0,10) : "";
            if (ymd && map[ymd] && regionEl) regionEl.value = map[ymd];
          } catch(_) {}
        });
      } catch (e) {
        console.error('Kon rideRegions niet laden', e);
      }
    } catch (e) {
      console.error("[ridePlan] loadPlan error", e);
      setStatus("❌ Laden mislukt (controleer regels/verbinding)", false);
    } finally {
      isLoadingPlan = false;
    }
  }

  // Populate region selects with options from members' regions
  async function populateRegionOptions() {
    try {
      const regions = await getAllRegions();
      const inserts = ['',''].map(()=>null); // noop
      const opts = ['<option value="">Regio (alles)</option>'].concat(regions.map(r => `<option value="${r}">${r}</option>`)).join('');
      [r1,r2,r3,r4,r5,r6].forEach(sel => { if (sel) sel.innerHTML = opts; });
    } catch (e) {
      console.error('populateRegionOptions failed', e);
    }
  }

  function collectDates() {
    // Collect date values (preserve unique values and order)
    const vals = [d1,d2,d3,d4,d5,d6].map(el => (el && el.value || "").trim()).filter(Boolean);
    const uniq = Array.from(new Set(vals));
    uniq.sort(); // keep sorted for compatibility
    return uniq;
  }

  function collectRegionsByDate() {
    // Return object mapping normalized date -> selected region
    const pairs = [[d1,r1],[d2,r2],[d3,r3],[d4,r4],[d5,r5],[d6,r6]];
    const map = {};
    pairs.forEach(([dateEl, regionEl]) => {
      try {
        const ymd = (dateEl && dateEl.value) ? dateEl.value.slice(0,10) : "";
        if (ymd) map[ymd] = (regionEl && regionEl.value) ? regionEl.value : "";
      } catch(_) {}
    });
    return map;
  }

  async function savePlan() {
    try {
      const dates = collectDates();
      if (dates.length < 5) {
        setStatus("❗ Vul minimaal 5 datums in.", false);
        return;
      }
      setStatus("Opslaan…");
      // collect regions mapping by date
      const regionsMap = collectRegionsByDate();
      await withRetry(() => updateOrCreateDoc(planRef, { plannedDates: dates, updatedAt: serverTimestamp() }), { retries: 3 });
      // save regions mapping in a separate globals doc (date -> region)
      const regionsRef = doc(db, "globals", "rideRegions");
      await withRetry(() => updateOrCreateDoc(regionsRef, { regions: regionsMap, updatedAt: serverTimestamp() }), { retries: 3 });
      setStatus("✅ Planning opgeslagen");
    } catch (e) {
      console.error("[ridePlan] savePlan error", e);
      setStatus("❌ Opslaan mislukt (controleer regels/verbinding)", false);
    }
  }

  // Auto-save bij wijzigingen (debounced)
  let saveDebounce = null;
  function scheduleSave() {
    if (isLoadingPlan) return; // negeer events veroorzaakt door loadPlan()
    setStatus("Wijziging gedetecteerd…", true);
    clearTimeout(saveDebounce);
    saveDebounce = setTimeout(() => { savePlan(); }, 600);
  }
  [d1,d2,d3,d4,d5,d6].forEach(el => {
    if (!el) return;
    el.addEventListener('input', scheduleSave, { passive: true });
    el.addEventListener('change', scheduleSave, { passive: true });
  });
  [r1,r2,r3,r4,r5,r6].forEach(el => {
    if (!el) return;
    el.addEventListener('change', scheduleSave, { passive: true });
  });
  reloadBtn?.addEventListener("click", loadPlan);

  // ===== Reset-alle-ritten (popup bevestiging) =====
  try {
    const resetBtn = document.getElementById("resetRidesBtn");
    const resetStatus = document.getElementById("resetStatus");
    resetBtn?.addEventListener("click", async () => {
      const ok = window.confirm("Weet je zeker dat je ALLE ridesCount waardes naar 0 wilt zetten? Dit kan niet ongedaan worden gemaakt.");
      if (!ok) return;
      await resetAllRidesCount(resetStatus);
    });
  } catch (_) {}

  // Auto-load bij openen Admin tab
  loadPlan();
}

// =====================================================
// ===============  Helpers (Admin)  ===================
// =====================================================

// Boek rit: ridesCount +1 voor members/{LidNr}
// Boek rit: alleen +1 als gekozen scandatum nog NIET bestaat voor dit lid
async function bookRide(lid, naam, rideDateYMD) {
  const id = String(lid || "").trim();
  if (!id) throw new Error("Geen LidNr meegegeven");

  // Vereiste ritdatum (YYYY-MM-DD)
  const ymd = (rideDateYMD || "").toString().slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error("Geen geldige ritdatum gekozen");

  const memberRef = doc(db, "members", id);

  // Transaction: lees -> check -> conditioneel updaten
  // Use tx.update when the document exists (so FieldValue.increment/arrayUnion are applied reliably)
  // If the document is missing, create it with explicit values.
  const res = await runTransaction(db, async (tx) => {
    const snap = await tx.get(memberRef);
    const data = snap.exists() ? snap.data() : null;
    const currentCount = data && Number.isFinite(Number(data?.ridesCount)) ? Number(data.ridesCount) : 0;
    const scans = data && Array.isArray(data.ScanDatums) ? data.ScanDatums.map(String) : [];
    const hasDate = scans.includes(ymd);

    if (hasDate) {
      // Nothing to change
      return { changed: false, newTotal: currentCount, ymd };
    }

    if (snap.exists()) {
      // Apply increment and arrayUnion via update so sentinel values are processed correctly
      tx.update(memberRef, { ridesCount: increment(1), ScanDatums: arrayUnion(ymd) });
      return { changed: true, newTotal: currentCount + 1, ymd };
    } else {
      // New document: set initial ridesCount and ScanDatums
      tx.set(memberRef, { ridesCount: 1, ScanDatums: [ymd] });
      return { changed: true, newTotal: 1, ymd };
    }
  });

  return { id, ...res };
}



// Extract LidNr uit QR-tekst of URL
function extractLidFromText(text) {
  if (!text) return null;

  // 1) JSON payload? e.g., {"t":"member","uid":"12345"}
  try {
    const obj = JSON.parse(text);
    const cand = obj?.uid || obj?.id || obj?.member || obj?.lid || obj?.lidnr;
    if (cand) return String(cand).trim();
  } catch (_) {}

  // 2) Key:value in plain text e.g., "lidnr: 12345"
  const m1 = text.match(/lidnr\s*[:=]\s*([\w-]+)/i);
  if (m1) return m1[1].trim();

  // 3) URL met query params
  try {
    const u = new URL(text);
    const lid = u.searchParams.get("lid") || u.searchParams.get("lidnr") ||
                u.searchParams.get("member") || u.searchParams.get("id") || u.searchParams.get("uid");
    if (lid) return lid.trim();
  } catch (_) {}

  // 4) Fallback: willekeurige 3+ cijferreeks
  const m2 = text.match(/\b(\d{3,})\b/);
  if (m2) return m2[1];

  return null;
}

function showToast(msg, ok = true) {
  const root = document.getElementById("toast-root") || document.body;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  if (!ok) el.style.background = "#ef4444";
  root.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function hhmmss(d = new Date()) { return d.toTimeString().slice(0, 8); }

// =====================================================
// ============ Handmatig rit registreren  =============
// =====================================================
function initManualRideSection() {
  const $ = (id) => document.getElementById(id);
  const input   = $("adminManualSearchInput");
  const clear   = $("adminManualClear");
  const list    = $("adminManualSuggest");
  const box     = $("adminManualResult");
  const err     = $("adminManualError");
  const sName   = $("adminMName");
  const sId     = $("adminMMemberNo");
  const sCount  = $("adminMRidesCount");
  const status  = $("adminManualStatus");
  const rideButtons = $("adminRideButtons");
  const rideHint = $("adminRideHint");
  let selectedRideDate = null;

  async function attemptBooking(dateYMD) {
    if (!selected) { status.textContent = "Kies eerst een lid."; status.classList.add("error"); return; }
    status.classList.remove("error");
    status.textContent = "Bezig met registreren…";
    try {
      const out = await bookRide(selected.id, sName.textContent || "", dateYMD);
      status.textContent = out.changed
        ? `✅ Rit geregistreerd op ${out.ymd} (totaal: ${out.newTotal})`
        : `ℹ️ Deze datum (${out.ymd}) was al geregistreerd — niets aangepast.`;
      // Update hint
      if (rideHint) rideHint.textContent = `Geregistreerd op: ${out.ymd}`;
    } catch (e) {
      console.error(e);
      status.textContent = "❌ Fout bij registreren";
      status.classList.add("error");
    }
  }

  if (!input || !list || !box) return; // UI niet aanwezig

  let selected = null;
  let unsub = null;

  function fullNameFrom(d) {
    const tussen = (d?.["Tussen voegsel"] || "").toString().trim();
    const parts = [
      (d?.["Voor naam"] || "").toString().trim(),
      d?.["Voor letters"] ? `(${(d["Voor letters"]+"").trim()})` : "",
      tussen,
      (d?.["Naam"] || d?.["name"] || d?.["naam"] || "").toString().trim()
    ].filter(Boolean);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  function hideSuggest() { list.innerHTML = ""; list.style.display = "none"; }
  function showSuggest(items) {
    list.innerHTML = "";
    for (const it of items) {
      const li = document.createElement("li");
      li.textContent = `${fullNameFrom(it.data)} — ${it.id}`;
      li.addEventListener("click", () => {
        selectMember(it);
        hideSuggest();
      }, { passive: true });
      list.appendChild(li);
    }
    list.style.display = items.length ? "block" : "none";
  }

  // Zoeken: probeer "Naam" → "naam" → "name", anders fallback
  async function queryByLastNamePrefix(prefix) {
    if (!prefix) return [];
    const maxResults = 10;
    try {
      const qName = query(collection(db, "members"), orderBy("Naam"), startAt(prefix), endAt(prefix + "\uf8ff"), limit(maxResults));
      const qVoor = query(collection(db, "members"), orderBy("Voor naam"), startAt(prefix), endAt(prefix + "\uf8ff"), limit(maxResults));
      const [snapName, snapVoor] = await Promise.all([getDocs(qName), getDocs(qVoor)]);
      const map = new Map();
      snapName.forEach(d => { if (!map.has(d.id)) map.set(d.id, { id: d.id, data: d.data() }); });
      snapVoor.forEach(d => { if (!map.has(d.id)) map.set(d.id, { id: d.id, data: d.data() }); });
      const res = Array.from(map.values()).slice(0, maxResults);
      return res;
    } catch (e) {
      console.error('queryByLastNamePrefix (admin) failed', e);
      // As a last resort, return empty so caller can handle
      return [];
    }
  }

  function resetSelection() {
    selected = null;
    box.style.display = "none";
    err.style.display = "none";
    status.textContent = "";
    try { if (unsub) unsub(); } catch(_) {}
    unsub = null;
  }

  async function onFocus() {
    resetSelection();           // QR/kaart direct verbergen
    const term = (input.value || "").trim();
    if (term.length >= 1) {
      try {
        const items = await queryByLastNamePrefix(term);
        if (items && items.length) showSuggest(items);
        else hideSuggest();
      } catch {
        hideSuggest();
      }
    } else {
      hideSuggest();
    }
  }

  async function onInput() {
    resetSelection();
    const term = (input.value || "").trim();
    if (term.length < 2) { hideSuggest(); return; }
    try {
      const items = await queryByLastNamePrefix(term);
      showSuggest(items);
    } catch (e) {
      console.error(e);
      hideSuggest();
    }
  }

  async function renderRideChoices(){
    if (!rideButtons) return;
    rideButtons.innerHTML = "";
    selectedRideDate = null;
    try {
      const dates = await ensureRideDatesLoaded();

      // Toon alleen datums t/m vandaag (geen toekomst)
      const today = new Date();
      const todayYMD = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())).toISOString().slice(0,10);
      const visibleDates = (dates || [])
        .map(d => (typeof d === "string" ? d.slice(0,10) : ""))
        .filter(Boolean)
        .filter(d => d.localeCompare(todayYMD) <= 0);

      if (!visibleDates.length) {
        rideButtons.innerHTML = '<span class="muted">Geen geplande ritdatums gevonden.</span>';
        if (rideHint) rideHint.textContent = "Geen (verleden/heden) ritdatums.";
        return;
      }

      const frag = document.createDocumentFragment();
      visibleDates.forEach((d) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chip";
        btn.textContent = d;
        btn.setAttribute("aria-pressed", "false");
        btn.addEventListener("click", async () => {
          selectedRideDate = d;
          if (rideHint) rideHint.textContent = `Registreren voor: ${d}`;
          await attemptBooking(d); // DIRECT boeken bij klik
        }, { passive: true });
        frag.appendChild(btn);
      });

      rideButtons.appendChild(frag);
      if (rideHint) rideHint.textContent = "Klik op een datum om direct te registreren.";
    } catch(e) {
      console.error(e);
      rideButtons.innerHTML = '<span class="error">Kon ritdatums niet laden.</span>';
    }
  }

  function selectMember(entry) {
    selected = entry;
    sName.textContent = fullNameFrom(entry.data);
    sId.textContent = entry.id;
    // Show stars based on planned dates vs. ScanDatums (like member view)
    (async () => {
      try {
        const planned = await getPlannedDates();
        const scanDatums = Array.isArray(entry.data?.ScanDatums) ? entry.data.ScanDatums : [];
  const { stars, starsHtml, tooltip, planned: plannedNorm } = plannedStarsWithHighlights(planned, scanDatums);
  sCount.innerHTML = starsHtml || "—";
  sCount.setAttribute('title', stars ? tooltip : 'Geen ingeplande datums');
      } catch (e) {
        const v = typeof entry.data?.ridesCount === "number" ? entry.data.ridesCount : 0;
        sCount.textContent = String(v);
      }
    })();
    box.style.display = "grid";
    renderRideChoices();

    // realtime teller
    try { if (unsub) unsub(); } catch(_) {}
    const ref = doc(collection(db, "members"), entry.id);
    unsub = onSnapshot(ref, (snap) => {
      const d = snap.exists() ? snap.data() : null;
      (async () => {
        try {
          const planned = await getPlannedDates();
          const scanDatums = d && Array.isArray(d.ScanDatums) ? d.ScanDatums : [];
          const { stars, starsHtml, tooltip } = plannedStarsWithHighlights(planned, scanDatums);
          sCount.innerHTML = starsHtml || "—";
          if (stars) sCount.setAttribute('title', tooltip);
          else sCount.removeAttribute('title');
        } catch (e) {
          const c = d && typeof d.ridesCount === "number" ? d.ridesCount : 0;
          sCount.textContent = String(c);
        }
      })();
    }, (e) => console.error(e));
  }

  input.addEventListener("focus", onFocus, { passive: true });
  input.addEventListener("input", onInput, { passive: true });
  input.addEventListener("keydown", async (ev) => {
    if (ev.key === "Escape") hideSuggest();
    if (ev.key === "Enter") {
      ev.preventDefault();
      const term = (input.value || "").trim();
      if (!term) { hideSuggest(); return; }
      try {
        const items = await queryByLastNamePrefix(term);
        // GEEN auto-select meer: alleen suggesties verversen
        if (items && items.length) showSuggest(items);
        else { err.textContent = "Geen leden gevonden."; err.style.display = "block"; hideSuggest(); }
      } catch (e) {
        err.textContent = "Zoeken mislukt."; err.style.display = "block";
        hideSuggest();
      }
    }
  });

  clear?.addEventListener("click", () => {
    input.value = "";
    hideSuggest();
    resetSelection();
  });
}

// =====================================================
// ===============  QR SCANNER (Admin)  ================
// =====================================================
function initAdminQRScanner() {
  const $ = (id) => document.getElementById(id);
  const startBtn = $("adminScanStart");
  const stopBtn  = $("adminScanStop");
  const statusEl = $("adminQRStatus");
  const readerEl = $("adminQRReader");
  const resultEl = $("adminQRResult");

  function ensureLogContainer() {
    let log = document.getElementById("adminQRLog");
    if (!log) {
      log = document.createElement("div");
      log.id = "adminQRLog";
      log.style.marginTop = "10px";
      log.innerHTML = `<h4 style="margin:6px 0 6px;">Registraties</h4><div id="adminQRLogList" class="qr-log-list"></div>`;
      (resultEl?.parentElement || readerEl?.parentElement || readerEl)?.appendChild(log);
    }
    return document.getElementById("adminQRLogList");
  }
  const qrLogList = ensureLogContainer();

  let scanner = null;
  let lastScanByText = new Map(); // decodedText -> timestamp(ms)
  const COOLDOWN_MS = 30000; // 30 seconden

  function appendLog({ naam, lid, ok, reason, ridesTotal }) {
    if (!qrLogList) return;
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.gap = "8px";
    row.style.padding = "10px 12px";
    row.style.border = "1px solid #1f2937";
    row.style.borderRadius = "12px";
    row.style.marginBottom = "6px";
    row.style.background = ok ? "#0f1d12" : "#1a0f0f";

    const left = document.createElement("div");
    left.textContent = `${hhmmss()} — ${naam ? naam + " " : ""}${lid ? "(LidNr: " + lid + ")" : "(onbekend)"}`;
    const right = document.createElement("div");
    right.textContent = ok
      ? `✓ bijgewerkt${(ridesTotal ?? ridesTotal === 0) ? " — totaal: " + ridesTotal : ""}`
      : `✗ ${reason || "geweigerd"}`;
    row.appendChild(left);
    row.appendChild(right);

    qrLogList.prepend(row);
  }

  async function processScan(decodedText) {
    const now = Date.now();
    const prev = lastScanByText.get(decodedText) || 0;
    if (now - prev < COOLDOWN_MS) return;
    lastScanByText.set(decodedText, now);

    let lid = extractLidFromText(decodedText || "");
    let naam = "";
    let beforeCount = null;

    if (!lid) {
      if (statusEl) statusEl.textContent = "⚠️ Geen LidNr in QR";
      showToast("⚠️ Onbekende QR (geen LidNr)", false);
      appendLog({ naam: "", lid: "", ok: false, reason: "geen LidNr" });
      return;
    }

    try {
      try {
        const snap = await getDoc(doc(db, "members", String(lid)));
        if (snap.exists()) {
          const d = snap.data();
          const composed = `${(d["Voor naam"]||"").toString().trim()} ${(d["Tussen voegsel"]||"").toString().trim()} ${(d["Naam"]||d["name"]||d["naam"]||"").toString().trim()}`
            .replace(/\s+/g, " ").trim();
          naam = composed || (d["Naam"] || d["name"] || d["naam"] || "");
          const rc = Number(d?.ridesCount);
          beforeCount = Number.isFinite(rc) ? rc : 0;
        } else {
          beforeCount = 0;
        }
      } catch (e) {
        beforeCount = (beforeCount ?? 0);
      }

      const todayYMD = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())).toISOString().slice(0,10);
      // Ensure planned dates are loaded and only book if today is a planned ride date
      try {
        await ensureRideDatesLoaded();
      } catch (e) { /* ignore, fallback to empty list */ }
      if (!Array.isArray(PLANNED_DATES) || !PLANNED_DATES.includes(todayYMD)) {
        // Do not book when today is not a planned ride date
        if (statusEl) statusEl.textContent = `ℹ️ ${todayYMD} is geen geplande ritdatum — registratie overgeslagen.`;
        showToast('ℹ️ Niet op geplande ritdatum — niet geregistreerd', true);
        appendLog({ naam: naam || "", lid, ok: false, reason: 'niet geplande datum' });
        return;
      }
      const out = await bookRide(lid, naam || "", todayYMD);
      const newTotal = out.newTotal;

      if (statusEl) statusEl.textContent = out.changed
        ? `✅ Rit +1 voor ${naam || "(onbekend)"} (${lid}) op ${out.ymd}`
        : `ℹ️ ${naam || "(onbekend)"} (${lid}) had ${out.ymd} al geregistreerd — niets aangepast.`;
      if (resultEl) resultEl.textContent = `Gescand: ${naam ? "Naam: " + naam + " " : ""}(LidNr: ${lid})`;
      showToast(out.changed ? "✅ QR-code gescand" : "ℹ️ Reeds geregistreerd", true);
      appendLog({ naam: naam || "", lid, ok: true, ridesTotal: newTotal });
    } catch (e) {
      console.error(e);
      if (statusEl) statusEl.textContent = `❌ Fout bij updaten: ${e?.message || e}`;
      showToast("❌ Fout bij updaten", false);
      appendLog({ naam: naam || "", lid, ok: false, reason: "update fout" });
    }
  }

  function onScanSuccess(decodedText) { processScan(decodedText); }
  function onScanError(_) { /* stil */ }

  async function start() {
    if (statusEl) statusEl.textContent = "Camera openen…";
    try { await ensureHtml5Qrcode(); } catch(e) {
      if (statusEl) statusEl.textContent = "Bibliotheek niet geladen.";
      showToast("Bibliotheek niet geladen", false);
      return;
    }
    try { if (scanner && scanner.clear) await scanner.clear(); } catch(_) {}
    if (readerEl) readerEl.innerHTML = "";
    // eslint-disable-next-line no-undef
    scanner = new Html5QrcodeScanner("adminQRReader", { fps: 10, qrbox: 250, aspectRatio: 1.333 }, false);
    scanner.render(onScanSuccess, onScanError);
    if (statusEl) statusEl.textContent = "Richt je camera op de QR-code…";
  }

  async function stop() {
    if (statusEl) statusEl.textContent = "Stoppen…";
    try { if (scanner && scanner.clear) await scanner.clear(); } catch(_) {}
    scanner = null;
    if (readerEl) readerEl.innerHTML = "";
    if (statusEl) statusEl.textContent = "⏸️ Gestopt";
  }

  startBtn?.addEventListener("click", start);
  stopBtn?.addEventListener("click", stop);
}

// ===== Firestore helper: reset alle ridesCount in batches ======
async function resetAllRidesCount(statusEl) {
  if (!statusEl) return;
  statusEl.textContent = "Voorbereiden…";
  let total = 0;
  let updated = 0;
  let skipped = 0;

  try {
  let last = null;
  const pageSize = 400; // veilig onder batch-limiet

    while (true) {
      let qRef = query(collection(db, "members"), orderBy("__name__"), limit(pageSize));
      if (last) qRef = query(collection(db, "members"), orderBy("__name__"), startAfter(last), limit(pageSize));

      const snapshot = await getDocs(qRef);
      if (snapshot.empty) break;

      let batch = writeBatch(db);
      let batchCount = 0;
      snapshot.forEach((docSnap) => {
        try {
          const data = docSnap.data() || {};
          const current = Number.isFinite(Number(data?.ridesCount)) ? Number(data.ridesCount) : 0;
          // Only reset ridesCount when it's not already 0. Preserve ScanDatums.
          if (current !== 0) {
            batch.set(doc(db, "members", docSnap.id), { ridesCount: 0 }, { merge: true });
            batchCount += 1;
            updated += 1;
          } else {
            skipped += 1;
          }
        } catch (e) {
          console.error('resetAllRidesCount: skipping doc due to error', docSnap.id, e);
          skipped += 1;
        }
      });
      if (batchCount > 0) await batch.commit();
      total += snapshot.size;
      statusEl.textContent = `Verwerkt: ${total} leden…`;

      last = snapshot.docs[snapshot.docs.length - 1];
      if (snapshot.size < pageSize) break;
    }

  // Show a brief success message with counts, then clear after a delay so it doesn't permanently overlay UI
  if (statusEl) {
    statusEl.textContent = `✅ Klaar — bijgewerkt: ${updated}, overgeslagen: ${skipped}`;
    setTimeout(() => { try { statusEl.textContent = ''; } catch(_) {} }, 6000);
  }
  } catch (e) {
    console.error(e);
    statusEl.textContent = `❌ Fout bij resetten: ${e?.message || e}`;
  }
}

// ===== Firestore helper: reset alle Jaarhanger waarden in batches ======
async function resetAllJaarhanger(statusEl) {
  if (!statusEl) return;
  statusEl.textContent = "Voorbereiden…";
  let total = 0;
  let updated = 0;
  let skipped = 0;
  try {
    let last = null;
    const pageSize = 400; // veilig onder batch-limiet

    while (true) {
      let qRef = query(collection(db, "members"), orderBy("__name__"), limit(pageSize));
      if (last) qRef = query(collection(db, "members"), orderBy("__name__"), startAfter(last), limit(pageSize));

      const snapshot = await getDocs(qRef);
      if (snapshot.empty) break;

      let batch = writeBatch(db);
      let batchCount = 0;
      snapshot.forEach((docSnap) => {
        try {
          const data = docSnap.data() || {};
          const cur = (data?.Jaarhanger ?? "");
          if (cur !== "") {
            batch.set(doc(db, "members", docSnap.id), { Jaarhanger: "" }, { merge: true });
            batchCount += 1;
            updated += 1;
          } else {
            skipped += 1;
          }
        } catch (e) {
          console.error('resetAllJaarhanger: skipping doc due to error', docSnap.id, e);
          skipped += 1;
        }
      });
      if (batchCount > 0) await batch.commit();
      total += snapshot.size;
      statusEl.textContent = `Verwerkt: ${total} leden…`;

      last = snapshot.docs[snapshot.docs.length - 1];
      if (snapshot.size < pageSize) break;
    }

  // Show a brief success message with counts, then clear after a delay so it doesn't permanently overlay UI
  if (statusEl) {
    statusEl.textContent = `✅ Klaar — bijgewerkt: ${updated}, overgeslagen: ${skipped}`;
    setTimeout(() => { try { statusEl.textContent = ''; } catch(_) {} }, 6000);
  }
  } catch (e) {
    console.error(e);
    statusEl.textContent = `❌ Fout bij resetten Jaarhanger: ${e?.message || e}`;
  }
}

// ===== Firestore helper: reset alle Lunch velden in batches ======
async function resetAllLunch(statusEl) {
  if (!statusEl) return;
  statusEl.textContent = "Voorbereiden…";
  let total = 0;

  try {
    let last = null;
    const pageSize = 400; // veilig onder batch-limiet
    let updated = 0;
    let skipped = 0;

    while (true) {
      let qRef = query(collection(db, "members"), orderBy("__name__"), limit(pageSize));
      if (last) qRef = query(collection(db, "members"), orderBy("__name__"), startAfter(last), limit(pageSize));

      const snapshot = await getDocs(qRef);
      if (snapshot.empty) break;

      let batch = writeBatch(db);
      let batchCount = 0;
      snapshot.forEach((docSnap) => {
        try {
          const data = docSnap.data() || {};
          const hasAny = (data.lunchDeelname != null) || (data.lunchKeuze != null) || (data.lunchTimestamp != null) || (data.lunchRideDateYMD != null);
          if (hasAny) {
            batch.set(doc(db, "members", docSnap.id), {
              lunchDeelname: null,
              lunchKeuze: null,
              lunchTimestamp: null,
              lunchRideDateYMD: null
            }, { merge: true });
            batchCount += 1;
            updated += 1;
          } else {
            skipped += 1;
          }
        } catch (e) {
          console.error('resetAllLunch: skipping doc due to error', docSnap.id, e);
          skipped += 1;
        }
      });
      if (batchCount > 0) await batch.commit();
      total += snapshot.size;
      statusEl.textContent = `Verwerkt: ${total} leden…`;

      last = snapshot.docs[snapshot.docs.length - 1];
      if (snapshot.size < pageSize) break;
    }

  // Show a brief success message with counts, then clear after a delay so it doesn't permanently overlay UI
  if (statusEl) {
    statusEl.textContent = `✅ Klaar — bijgewerkt: ${updated}, overgeslagen: ${skipped}`;
    setTimeout(() => { try { statusEl.textContent = ''; } catch(_) {} }, 6000);
  }
  } catch (e) {
    console.error(e);
    statusEl.textContent = `❌ Fout bij resetten Lunch: ${e?.message || e}`;
  }
}

// ===== Hoofdadmin Tab 4: Excel export logic =====
async function exportMembersExcel() {
  const status = document.getElementById("exportExcelStatus");
  try {
    if (status) status.textContent = "Bezig met ophalen...";
    // Haal alle leden op
    const snap = await getDocs(collection(db, "members"));
    const rows = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data() || {};
      const naam = d.Naam ?? d.naam ?? d.lastName ?? d.achternaam ?? "";
      const tussen = d["Tussen voegsel"] ?? d.tussenvoegsel ?? d.tussenVoegsel ?? d.tussen ?? d.infix ?? "";
      const voorletters = d["Voor letters"] ?? d.voorletters ?? d.initialen ?? d.initials ?? "";
      const voornaam = d["Voor naam"] ?? d.voornaam ?? d.firstName ?? d.naamVoor ?? "";
      const rides = (typeof d.ridesCount === "number") ? d.ridesCount
                   : (typeof d.rittenCount === "number") ? d.rittenCount
                   : (typeof d.ritten === "number") ? d.ritten : 0;
      let regioOms = d["Regio Omschrijving"] ?? d.regioOmschrijving ?? "";
      if (!regioOms && d.regio && typeof d.regio === "object") {
        regioOms = d.regio.omschrijving ?? d.regio.name ?? d.regio.title ?? "";
      }
      rows.push({
        "Naam": String(naam || ""),
        "Tussen voegsel": String(tussen || ""),
        "Voor letters": String(voorletters || ""),
        "Voor naam": String(voornaam || ""),
        "ridesCount": rides,
        "Regio Omschrijving": String(regioOms || ""),
      });
    });

    const headers = ["Naam","Tussen voegsel","Voor letters","Voor naam","ridesCount","Regio Omschrijving"];
    // XLSX (SheetJS) als beschikbaar
    try {
      if (typeof XLSX !== "undefined" && XLSX.utils && XLSX.write) {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
        XLSX.utils.book_append_sheet(wb, ws, "Leden");
        const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const a = document.createElement("a");
        const url = URL.createObjectURL(blob);
        a.href = url;
        const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,"-");
        a.download = `leden_export_${ts}.xlsx`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
        if (status) status.textContent = `Gereed • ${rows.length} leden`;
        return;
      }
    } catch (e) {
      console.warn("XLSX export faalde, fallback CSV:", e);
    }

    // CSV fallback
    const csvRows = [headers.join(",")];
    for (const r of rows) {
      const vals = headers.map(h => {
        const v = r[h] ?? "";
        const s = String(v).replace(/"/g,'""');
        return `"${s}"`;
      });
      csvRows.push(vals.join(","));
    }
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,"-");
    a.download = `leden_export_${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
    if (status) status.textContent = `Gereed • ${rows.length} leden`;
  } catch (e) {
    console.error("Export mislukt:", e);
    if (status) status.textContent = "Mislukt";
    alert("Export mislukt. Controleer de console voor details.");
  }
}

// Koppel button (bij initialisatie admin)
function initTab4ExcelExportHook() {
  const btn = document.getElementById("exportExcelBtn");
  if (!btn) return;
  if (!btn.dataset._wired) {
    btn.addEventListener("click", exportMembersExcel);
    btn.dataset._wired = "1";
  }
}

// Integreer in bestaande admin-init flow
document.addEventListener("DOMContentLoaded", () => { try { initTab4ExcelExportHook(); } catch(_) {} });
document.getElementById("adminSubtabs")?.addEventListener("click", () => {
  setTimeout(() => { try { initTab4ExcelExportHook(); } catch(_) {} }, 0);
});
if (window.MutationObserver) {
  const adminView = document.getElementById("viewAdmin");
  if (adminView) {
    const mo = new MutationObserver(() => { try { initTab4ExcelExportHook(); } catch(_) {} });
    mo.observe(adminView, { childList: true, subtree: true });
  }
}
