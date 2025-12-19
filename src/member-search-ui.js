// member-search-ui.js
// Reusable member autocomplete used by admin pages (handmatig / eerdere ritten)
import { db, collection, query, orderBy, startAt, endAt, limit, getDocs } from './firebase.js';

function el(id) { return document.getElementById(id); }

async function queryByLastNamePrefix(prefix) {
  if (!prefix) return [];
  const maxResults = 8;
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

function clearSuggestions(listEl) {
  if (!listEl) return;
  listEl.innerHTML = '';
  listEl.style.display = 'none';
}

export function initMemberSearchSection(cfg = {}) {
  const nameInput = el(cfg.nameInputId);
  const suggestionsList = el(cfg.suggestionsListId);
  const errorEl = el(cfg.errorId);
  const loadingEl = el(cfg.loadingId);

  if (!nameInput || !suggestionsList) {
    console.warn('initMemberSearchSection: missing required elements', cfg.nameInputId, cfg.suggestionsListId);
    return null;
  }

  let debounce = null;

  async function doSearch(term) {
    try {
      if (loadingEl) loadingEl.style.display = 'flex';
      if (errorEl) { errorEl.textContent = ''; errorEl.style.display = 'none'; }
      const items = await queryByLastNamePrefix(term);
      suggestionsList.innerHTML = '';
      if (!items || items.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'Geen leden gevonden';
        li.style.padding = '10px';
        li.style.color = 'var(--muted)';
        suggestionsList.appendChild(li);
        suggestionsList.style.display = 'block';
        return;
      }
      for (const it of items) {
        const li = document.createElement('li');
        const full = [it.data['Voor naam'] || '', (it.data['Tussen voegsel'] || '').trim() || '', it.data['Naam'] || ''].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
        li.textContent = `${full} — ${it.id}`;
        li.style.cursor = 'pointer';
        li.addEventListener('click', async () => {
          try {
            nameInput.value = li.textContent || '';
          } catch(_) {}
          clearSuggestions(suggestionsList);
          if (typeof cfg.onSelected === 'function') {
            try { await cfg.onSelected(it); } catch (e) { console.error('onSelected callback error', e); }
          }
        });
        suggestionsList.appendChild(li);
      }
      suggestionsList.style.display = 'block';
    } catch (e) {
      console.error('doSearch failed', e);
      if (errorEl) { errorEl.textContent = 'Zoeken mislukt'; errorEl.style.display = 'block'; }
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
    }
  }

  nameInput.addEventListener('input', (ev) => {
    const term = (nameInput.value || '').trim();
    if (debounce) clearTimeout(debounce);
    if (term.length < 2) {
      clearSuggestions(suggestionsList);
      if (typeof cfg.onEmpty === 'function') {
        try { cfg.onEmpty(); } catch(_) {}
      }
      return;
    }
    debounce = setTimeout(() => doSearch(term), 220);
  });

  nameInput.addEventListener('focus', () => {
    clearSuggestions(suggestionsList);
    if (cfg.clearOnFocus) {
      try { nameInput.value = ''; } catch(_) {}
      if (typeof cfg.onEmpty === 'function') {
        try { cfg.onEmpty(); } catch(_) {}
      }
    }
    if (typeof cfg.onFocus === 'function') {
      try { cfg.onFocus(); } catch(_) {}
    }
  });
  nameInput.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') clearSuggestions(suggestionsList); });

  return {
    destroy() {
      try { nameInput.removeEventListener('input', () => {}); } catch(_) {}
      clearSuggestions(suggestionsList);
    }
  };
}

export default initMemberSearchSection;

