// Sets localized header date into element with class `header-date` on DOM ready
(function(){
  function setDateToHeader() {
    try {
      const el = document.querySelector('.header-date');
      if (!el) return;
      const d = new Date();
      const parts = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).formatToParts(d);
      const wk = (parts.find(p => p.type === 'weekday') || {}).value || '';
      const day = (parts.find(p => p.type === 'day') || {}).value || '';
      const month = (parts.find(p => p.type === 'month') || {}).value || '';
      const cap = s => s ? (s.replace('.', '').charAt(0).toUpperCase() + s.replace('.', '').slice(1)) : s;
      el.textContent = `${cap(wk)}, ${day} ${cap(month)}`;
    } catch (e) { console.warn('header-date set failed', e); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setDateToHeader);
  else setDateToHeader();
})();
