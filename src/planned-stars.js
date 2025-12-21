// planned-stars.js
// Shared helper to compute planned stars and tooltips from plannedDates and ScanDatums
export function plannedStarsWithHighlights(plannedDates, scanDates) {
  const planned = plannedDates.map(v => {
    try {
      if (!v) return "";
      if (typeof v === 'object' && v.seconds) {
        const d = new Date(v.seconds * 1000);
        return d.toISOString().slice(0,10);
      }
      if (typeof v === 'string') {
        const m = v.match(/\d{4}-\d{2}-\d{2}/);
        if (m) return m[0];
      }
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0,10);
      return "";
    } catch { return ""; }
  }).filter(Boolean);

  const scans = new Set((Array.isArray(scanDates) ? scanDates : []).map(v => {
    try { if (typeof v === 'string') { const m = v.match(/\d{4}-\d{2}-\d{2}/); if (m) return m[0]; } const d = new Date(v); if (!isNaN(d)) return d.toISOString().slice(0,10); } catch{} return "";
  }).filter(Boolean));

  const starsHtml = planned.map(d => scans.has(d) ? '<span class="star filled">★</span>' : '<span class="star empty">☆</span>').join('');
  const tooltip = planned.map((d, i) => `${i+1}: ${d} — ${scans.has(d) ? "Geregistreerd" : "Niet geregistreerd"}`).join("\\n");
  const stars = planned.map(d => scans.has(d) ? '★' : '☆').join('');
  return { stars, starsHtml, tooltip, planned };
}

export default plannedStarsWithHighlights;
