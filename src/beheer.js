import { getRideConfig, updateRideConfig } from './firestore.js';

export async function initBeheer() {
  try {
    const cfg = await getRideConfig().catch(() => ({ plannedDates: [], regions: {} }));
    const dates = Array.isArray(cfg.plannedDates) ? cfg.plannedDates : [];
    const regions = cfg.regions || {};
    if (!dates || dates.length === 0) return;
    // Fill the rideDate1..rideDate6 inputs and region selects if mapping exists
    for (let i = 0; i < 6; i++) {
      const input = document.querySelector(`input[name=rideDate${i+1}]`);
      const select = document.querySelector(`select[name=region${i+1}]`);
      const val = dates[i];
      if (input && val) {
        try { input.value = String(val).slice(0,10); } catch(_){}
      }
      // populate select based on regions map keyed by date string
      try {
        const dKey = val ? String(val).slice(0,10) : null;
        if (select && dKey && Object.prototype.hasOwnProperty.call(regions, dKey)) {
          const regionVal = regions[dKey] || '';
          if (regionVal) select.value = regionVal;
        }
      } catch(_){}
    }
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
            const res = await updateRideConfig({ plannedDates: newDates, regions: newRegions });
            if (btn) { btn.disabled = false; btn.classList.remove('disabled'); }
            if (res && res.success) {
              window.showScanSuccess && window.showScanSuccess('Automatisch opgeslagen');
            } else {
              window.showScanError && window.showScanError('Automatisch opslaan mislukt');
              console.warn('auto save rideConfig failed', res);
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
}

export default { initBeheer };
