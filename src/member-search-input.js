// Lightweight member search input renderer
// Renders an input (and optional button) and dispatches events — no DB logic here.
import { db, collection, query, orderBy, startAt, endAt, limit, getDocs } from './firebase.js';

// Lightweight member search input renderer
// Renders an input (and optional button) and dispatches events — no DB logic here.

export function renderMemberSearchInput(target, cfg = {}) {
  // target: DOM element or element id
  const container = (typeof target === 'string') ? document.getElementById(target) : target;
  if (!container) {
    console.warn('renderMemberSearchInput: missing target container');
    return null;
  }

  const id = cfg.id || `memberSearch_${Math.random().toString(36).slice(2,9)}`;
  const placeholder = cfg.placeholder || 'Zoek lid (naam of id)';
  const showButton = cfg.showButton === true;

  const wrap = document.createElement('div');
  wrap.className = cfg.wrapperClass || 'member-search-input-wrap';
  // Ensure wrapper expands to available space in flex layouts
  wrap.style.width = '100%';
  wrap.style.display = 'block';

  const input = document.createElement('input');
  input.type = 'search';
  input.id = id;
  input.className = cfg.inputClass || 'member-search-input';
  // Make input use full width of its wrapper and use border-box sizing
  input.style.width = '100%';
  input.style.boxSizing = 'border-box';
  input.autocomplete = cfg.autocomplete || 'off';
  input.placeholder = placeholder;
  input.value = cfg.value || '';
  input.setAttribute('aria-label', cfg.ariaLabel || 'Leden zoeken');

  wrap.appendChild(input);

  let button = null;
  if (showButton) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = cfg.buttonClass || 'member-search-button btn';
    button.textContent = cfg.buttonLabel || 'Zoek';
    wrap.appendChild(button);
  }

  // Dispatch helpers
  function emitInputEvent() {
    const ev = new CustomEvent('member-search:input', { detail: { value: input.value }, bubbles: true });
    wrap.dispatchEvent(ev);
  }
  function emitSubmitEvent() {
    const ev = new CustomEvent('member-search:submit', { detail: { value: input.value }, bubbles: true });
    wrap.dispatchEvent(ev);
  }

  // Listeners
  const onInput = (e) => {
    try {
      const raw = input.value || '';
      // If the value contains letters, capitalize the first letter of each word
      if (/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(raw)) {
        // Preserve whitespace when rebuilding string
        const transformed = raw.split(/(\s+)/).map(tok => {
          if (/^\s+$/.test(tok)) return tok;
          return tok.charAt(0).toUpperCase() + tok.slice(1);
        }).join('');
        if (transformed !== raw) {
          try { input.value = transformed; } catch(_) {}
        }
        console.log('member-search input:', input.value);
      } else {
        console.log('member-search input:', raw);
      }
    } catch (_) {}
    emitInputEvent();
  };
  const onKey = (e) => { if (e.key === 'Enter') { emitSubmitEvent(); } };
  const onButton = () => { emitSubmitEvent(); };

  input.addEventListener('input', onInput, { passive: true });
  input.addEventListener('keydown', onKey);
  if (button) button.addEventListener('click', onButton);

  // Mount
  container.innerHTML = '';
  container.appendChild(wrap);

  return {
    el: wrap,
    inputEl: input,
    buttonEl: button,
    focus() { try { input.focus(); } catch(_) {} },
    setValue(v) { try { input.value = v; emitInputEvent(); } catch(_) {} },
    getValue() { return input.value; },
    destroy() {
      try { input.removeEventListener('input', onInput); input.removeEventListener('keydown', onKey); } catch(_) {}
      if (button) try { button.removeEventListener('click', onButton); } catch(_) {}
      try { wrap.remove(); } catch(_) {}
    }
  };
}

// --- Autocomplete (merged) ---
async function queryByNamePrefix(prefix, maxResults = 8) {
  if (!prefix) return [];
  try {
    const qName = query(collection(db, 'members'), orderBy('Naam'), startAt(prefix), endAt(prefix + '\uffff'), limit(maxResults));
    const qVoor = query(collection(db, 'members'), orderBy('Voor naam'), startAt(prefix), endAt(prefix + '\uffff'), limit(maxResults));
    const [snapName, snapVoor] = await Promise.all([getDocs(qName), getDocs(qVoor)]);
    const map = new Map();
    snapName.forEach(d => { if (!map.has(d.id)) map.set(d.id, { id: d.id, data: d.data() }); });
    snapVoor.forEach(d => { if (!map.has(d.id)) map.set(d.id, { id: d.id, data: d.data() }); });
    return Array.from(map.values()).slice(0, maxResults);
  } catch (e) {
    console.error('member-search query failed', e);
    return [];
  }
}

function clearSuggestionsList(list) {
  if (!list) return;
  list.innerHTML = '';
  list.style.display = 'none';
}

export function wireAutocomplete(widget, cfg = {}) {
  if (!widget || !widget.el || !widget.inputEl) {
    console.warn('wireAutocomplete: invalid widget');
    return null;
  }

  const list = document.createElement('ul');
  list.className = cfg.suggestionsClass || 'member-search-suggestions';
  list.style.listStyle = 'none';
  list.style.margin = '6px 0 0 0';
  list.style.padding = '0';
  list.style.display = 'none';
  list.style.maxHeight = '320px';
  list.style.overflow = 'auto';
  list.style.background = cfg.background || 'var(--panel-bg, #071226)';
  list.style.border = '1px solid rgba(255,255,255,0.06)';
  list.style.borderRadius = '8px';
  list.style.boxSizing = 'border-box';
  list.style.width = '100%';
  list.style.zIndex = '999';

  widget.el.appendChild(list);

  let debounce = null;

  async function doSearch(term) {
    try {
      clearSuggestionsList(list);
      if (!term || term.length < 2) return;
      const items = await queryByNamePrefix(term);
      list.innerHTML = '';
      if (!items || items.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'Geen leden gevonden';
        li.style.padding = '10px';
        li.style.color = 'var(--muted)';
        list.appendChild(li);
        list.style.display = 'block';
        return;
      }
      for (const it of items) {
        const li = document.createElement('li');
        li.style.padding = '10px 12px';
        li.style.cursor = 'pointer';
        li.style.borderBottom = '1px solid rgba(255,255,255,0.02)';
        const full = [it.data['Voor naam'] || '', (it.data['Tussen voegsel'] || '').trim() || '', it.data['Naam'] || '']
          .filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
        li.textContent = `${full} — ${it.id}`;
        li.addEventListener('click', (ev) => {
          try { widget.setValue(li.textContent); } catch(_) {}
          clearSuggestionsList(list);
          const memberId = it.id;
          // Dispatch a high-level event so other modules can listen
          try {
            const selEv = new CustomEvent('member-search:selected', { detail: { id: memberId }, bubbles: true });
            widget.el.dispatchEvent(selEv);
          } catch (_) {}
          // Prefer a lightweight contract: onSelected receives the member id (string)
          if (typeof cfg.onSelected === 'function') {
            try { cfg.onSelected(memberId); } catch (e) { console.error('onSelected error', e); }
          }
        });
        list.appendChild(li);
      }
      list.style.display = 'block';
    } catch (e) {
      console.error('doSearch failed', e);
    }
  }

  function onInputHandler() {
    const term = (widget.getValue() || '').trim();
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => doSearch(term), 220);
  }

  function onKeydown(e) {
    if (e.key === 'Escape') { clearSuggestionsList(list); }
  }

  widget.inputEl.addEventListener('input', onInputHandler, { passive: true });
  widget.inputEl.addEventListener('keydown', onKeydown);

  // Click outside to close
  function onDocClick(e) {
    if (!widget.el.contains(e.target)) clearSuggestionsList(list);
  }
  document.addEventListener('click', onDocClick);

  return {
    destroy() {
      try { widget.inputEl.removeEventListener('input', onInputHandler); widget.inputEl.removeEventListener('keydown', onKeydown); } catch(_) {}
      try { document.removeEventListener('click', onDocClick); } catch(_) {}
      clearSuggestionsList(list);
      try { list.remove(); } catch(_) {}
    }
  };
}

export default renderMemberSearchInput;
