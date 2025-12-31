import { getRideConfig, listMembersByJaarhanger, getAdminPasswords, updateAdminPasswords, updateRideConfig } from './firebase.js';

export async function initBeheer() {
  try {
    // Populate planner from `sessionStorage.rideConfig.regions` (keys = dates, values = regio)
    let regions = {};
    let dates = [];
    try {
      const raw = sessionStorage.getItem('rideConfig');
      if (raw) {
        try {
          const obj = JSON.parse(raw);
          const currentYearKey = String((new Date()).getFullYear());
          if (obj && obj[currentYearKey] && typeof obj[currentYearKey] === 'object') {
            regions = obj[currentYearKey];
            dates = Object.keys(regions).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
          } else if (obj && obj.regions && typeof obj.regions === 'object') {
            // legacy fallback
            regions = obj.regions;
            dates = Object.keys(regions).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
          }
        } catch (_) { /* ignore parse errors */ }
      }
      // Fill the rideDate1..rideDate6 inputs and region selects if mapping exists
      for (let i = 0; i < 6; i++) {
        const input = document.querySelector(`input[name=rideDate${i+1}]`);
        const select = document.querySelector(`select[name=region${i+1}]`);
        const val = dates[i];
        if (input && val) {
          try { input.value = String(val).slice(0,10); } catch(_){ }
        }
        try {
          const dKey = val ? String(val).slice(0,10) : null;
          if (select && dKey && Object.prototype.hasOwnProperty.call(regions, dKey)) {
            const regionVal = regions[dKey] || '';
            if (regionVal) select.value = regionVal;
          }
        } catch(_){ }
      }
    } catch (_) { /* ignore sessionStorage errors */ }
    // Attach submit handler and auto-save on change (debounced)
    try {
      const form = document.getElementById('plan-rides-form');
      if (form && !form._beheerSaveAttached) {
        const gather = () => {
          const newDates = [];
          const newRegions = {};
          for (let i = 0; i < 6; i++) {
            const inEl = document.querySelector(`input[name=rideDate${i+1}]`);
            const sel = document.querySelector(`select[name=region${i+1}]`);
            const dateVal = inEl && inEl.value ? String(inEl.value).trim() : '';
            if (dateVal) {
              newDates.push(dateVal.slice(0,10));
              if (sel && sel.value) newRegions[dateVal.slice(0,10)] = sel.value;
            }
          }
          return { newDates, newRegions };
        };

        const doSave = async () => {
          if (!form) return;
          if (form._saving) return; // prevent concurrent saves
          const { newDates, newRegions } = gather();
          if (!newDates || newDates.length === 0) return; // nothing to save
          try {
            form._saving = true;
            const btn = form.querySelector('button[type="submit"]');
            if (btn) { btn.disabled = true; btn.classList.add('disabled'); }
            try {
              // Persist current-year map to sessionStorage (runtime-only canonical source)
              try {
                const currentYear = String((new Date()).getFullYear());
                sessionStorage.setItem('rideConfig', JSON.stringify({ [currentYear]: newRegions }));
                try { window._rideConfig = { [currentYear]: newRegions }; } catch(_){ }
              } catch(_) {
                try { sessionStorage.setItem('rideConfig', JSON.stringify({ regions: newRegions })); } catch(_) {}
                try { window._rideConfig = { regions: newRegions }; } catch(_){ }
              }

              // Determine if we have at least one valid date+region pair to push to Firestore
              const regionKeys = Object.keys(newRegions || {}).filter(k => k && newRegions[k]);
              if (regionKeys.length > 0) {
                try {
                  try { console.debug('beheer: calling updateRideConfig', { regionKeys, newRegions }); } catch(_){}
                  // compute keys that existed previously but are now removed so we can delete them server-side
                  let oldMap = {};
                  try {
                    const r = await getRideConfig().catch(()=>({}));
                    const currentYearKey = String(new Date().getFullYear());
                    if (r && r[currentYearKey] && typeof r[currentYearKey] === 'object') {
                      oldMap = r[currentYearKey] || {};
                    } else if (r && r.regions) {
                      oldMap = r.regions || {};
                    }
                  } catch(_) { oldMap = {}; }
                  const oldKeys = Object.keys(oldMap || {}).filter(k => k && /^\d{4}-\d{2}-\d{2}$/.test(k));
                  const removed = oldKeys.filter(k => !(k in (newRegions || {})));
                  const currentYear = String((new Date()).getFullYear());
                  const yearsPayload = { [currentYear]: newRegions };
                  const removeYearsDates = removed.length ? removed.map(d => ({ year: currentYear, date: d })) : undefined;
                  const up = await updateRideConfig({ years: yearsPayload, removeRegions: removed.length ? removed : undefined, removeYearsDates });
                  try { console.debug('beheer: updateRideConfig result', up, { removed }); } catch(_){}
                  if (up && up.success) {
                    window.showScanSuccess && window.showScanSuccess('Automatisch opgeslagen');
                  } else {
                    window.showScanError && window.showScanError('Opslaan naar server mislukt');
                    console.warn('updateRideConfig failed', up);
                  }
                } catch (e) {
                  try { console.error('beheer: updateRideConfig exception', e); } catch(_){}
                  window.showScanError && window.showScanError('Opslaan naar server mislukt');
                  console.warn('updateRideConfig error', e);
                }
              } else {
                // No valid entries to send to server; keep runtime/session update only
                window.showScanSuccess && window.showScanSuccess('Lokaal opgeslagen (geen datum+regio)');
              }

              if (btn) { btn.disabled = false; btn.classList.remove('disabled'); }
            } catch (e) {
              if (btn) { btn.disabled = false; btn.classList.remove('disabled'); }
              window.showScanError && window.showScanError('Automatisch opslaan mislukt');
              console.warn('auto save rideConfig failed', e);
            }
          } catch (e) {
            console.error('auto-save error', e);
            window.showScanError && window.showScanError('Automatisch opslaan mislukt');
          } finally { form._saving = false; }
        };

        // debounce helper
        const scheduleSave = (delay = 900) => {
          try { if (form._saveTimer) clearTimeout(form._saveTimer); } catch(_){}
          form._saveTimer = setTimeout(() => { doSave(); }, delay);
        };

        // attach listeners to inputs and selects
        for (let i = 0; i < 6; i++) {
          const inEl = document.querySelector(`input[name=rideDate${i+1}]`);
          const sel = document.querySelector(`select[name=region${i+1}]`);
          if (inEl) inEl.addEventListener('input', () => scheduleSave(900));
          if (sel) sel.addEventListener('change', () => scheduleSave(600));
        }

        // keep manual submit handler for fallback saving
        form.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          try { await doSave(); } catch(_){}
        });

        form._beheerSaveAttached = true;
      }
    } catch(_){ }
  } catch (e) {
    console.error('initBeheer error', e);
  }
  // Wire password change handlers for access-control section
  try {
    const insInput = document.getElementById('pwd-inschrijf-input');
    const insBtn = document.getElementById('pwd-inschrijf-save');
    const adminCur = document.getElementById('pwd-admin-current');
    const adminNew = document.getElementById('pwd-admin-new');
    const adminBtn = document.getElementById('pwd-admin-save');

    // load cached passwords for validation
    let cachedPw = null;
    try { cachedPw = await getAdminPasswords(); } catch (_) { cachedPw = null; }

    if (insBtn && insInput && !insBtn._bound) {
      insBtn.addEventListener('click', async () => {
        try {
          const v = (insInput.value || '').trim();
          if (!v) { window.showScanError && window.showScanError('Vul een nieuw wachtwoord in'); return; }
          insBtn.disabled = true;
          const res = await updateAdminPasswords({ inschrijftafel: v });
          insBtn.disabled = false;
          if (res && res.success) {
            try { window.showScanSuccess && window.showScanSuccess('Wachtwoord opgeslagen'); } catch(_){}
            insInput.value = '';
          } else {
            console.warn('update inschrijftafel pwd failed', res);
            window.showScanError && window.showScanError('Opslaan mislukt');
          }
        } catch (e) { console.error('inschrijf pwd save error', e); window.showScanError && window.showScanError('Opslaan mislukt'); };
      });
      insBtn._bound = true;
    }

    if (adminBtn && adminCur && adminNew && !adminBtn._bound) {
      adminBtn.addEventListener('click', async () => {
        try {
          const cur = (adminCur.value || '').trim();
          const neu = (adminNew.value || '').trim();
          if (!cur || !neu) { window.showScanError && window.showScanError('Vul huidig en nieuw wachtwoord in'); return; }
          // ensure we have latest cached password
          try { cachedPw = await getAdminPasswords(); } catch(_) { cachedPw = cachedPw || null; }
          const real = cachedPw && cachedPw.hoofdadmin ? String(cachedPw.hoofdadmin) : null;
          if (real === null) { window.showScanError && window.showScanError('Kan huidig wachtwoord niet verifiëren'); return; }
          if (String(cur) !== String(real)) { window.showScanError && window.showScanError('Huidig wachtwoord ongeldig'); return; }
          adminBtn.disabled = true;
          const res = await updateAdminPasswords({ hoofdadmin: neu });
          adminBtn.disabled = false;
          if (res && res.success) {
            try { window.showScanSuccess && window.showScanSuccess('Admin wachtwoord gewijzigd'); } catch(_){}
            adminCur.value = '';
            adminNew.value = '';
            // update cache
            cachedPw = { ...(cachedPw || {}), hoofdadmin: neu };
          } else {
            console.warn('update hoofdadmin pwd failed', res);
            window.showScanError && window.showScanError('Wijzigen mislukt');
          }
        } catch (e) { console.error('admin pwd change error', e); window.showScanError && window.showScanError('Wijzigen mislukt'); }
      });
      adminBtn._bound = true;
    }
  } catch (e) { console.error('Password handlers wiring failed', e); }
}

// Helper: convert various date-like strings to year number (or null)
function toYear(val) {
  if (!val) return null;
  try {
    // if already ISO-like string
    if (typeof val === 'string') {
      const m = val.match(/^(\d{4})-/);
      if (m) return Number(m[1]);
      const d = new Date(val);
      if (!isNaN(d)) return d.getFullYear();
    } else if (val instanceof Date) return val.getFullYear();
  } catch(_){}
  return null;
}

// Build Excel and trigger download. Excludes any fields starting with 'lunch' (case-insensitive).
async function handleExportCsvClick(ev) {
  try {
    const ok = window.confirm && window.confirm('Download deelnemerslijst als Excel (.xlsx)?');
    if (!ok) return;
    // fetch members that have Jaarhanger == ja (server-side)
    const members = await listMembersByJaarhanger(5000);
    if (!Array.isArray(members) || members.length === 0) {
      alert('Geen leden gevonden om te exporteren.');
      return;
    }
    const filtered = members;

    const currentYear = new Date().getFullYear();

    // Prepare rows with only the requested columns: Volledige naam (incl. tussenvoegsel), Regio, AantalSterren
    const header = ['Volledige naam', 'Regio', 'AantalSterren'];
    const aoa = [header];
    for (const m of filtered) {
      // build name pieces including tussenvoegsel inside the full name
      const voor = (m['Voor naam'] || m.voor || m.Voor || m.firstName || m.voornaam || '') || '';
      const tussen = (m['Tussenvoegsel'] || m['Tussen voegsel'] || m.tussenvoegsel || m.tussen || '') || '';
      const naam = (m.Naam || m.naam || m.lastName || '') || '';
      const fullName = `${String(voor).trim()} ${String(tussen).trim()} ${String(naam).trim()}`.replace(/\s+/g, ' ').trim();
      // region
      const region = (m['Regio Omschrijving'] || m.Regio || m.regio || m.region || '') || '';
      // aantal sterren: count scan dates in current year
      const rawArr = m.ScanDatums || m.scandatums || m.scans || [];
      let count = 0;
      if (Array.isArray(rawArr)) {
        for (const s of rawArr) {
          const y = toYear(s);
          if (y && Number(y) === Number(currentYear)) count++;
        }
      }
      aoa.push([fullName, String(region), String(count)]);
    }

    // ensure XLSX available (load from CDN if necessary)
    if (typeof window.XLSX === 'undefined') {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.onload = () => resolve();
        s.onerror = (e) => reject(new Error('Failed to load XLSX library'));
        document.head.appendChild(s);
      });
    }

    // build workbook
    const ws = window.XLSX.utils.aoa_to_sheet(aoa);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Deelnemers');
    const fname = `leden_export_${new Date().toISOString().slice(0,10)}.xlsx`;
    // write file (triggers download)
    try {
      window.XLSX.writeFile(wb, fname);
    } catch (e) {
      // fallback: write as binary and create blob
      const wopts = { bookType: 'xlsx', type: 'array' };
      const wbout = window.XLSX.write(wb, wopts);
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.setAttribute('download', fname);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  } catch (e) {
    console.error('export excel error', e);
    alert('Export mislukt: ' + (e && e.message ? e.message : String(e)));
  }
}

// Attach export handler to button if present
try {
  const btn = document.getElementById('export-csv');
  if (btn && !btn._exportBound) {
    btn.addEventListener('click', handleExportCsvClick);
    btn._exportBound = true;
  }
} catch (_) {}

export default { initBeheer };
