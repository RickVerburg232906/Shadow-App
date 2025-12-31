let _html5qrcodeLoading = false;
export function ensureHtml5Qrcode(timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.Html5QrcodeScanner) return resolve(true);
    if (_html5qrcodeLoading) {
      const t0 = Date.now();
      const int = setInterval(() => {
        if (window.Html5QrcodeScanner) { clearInterval(int); resolve(true); }
        if (Date.now() - t0 > timeout) { clearInterval(int); reject(new Error('Timeout loading html5-qrcode')); }
      }, 120);
      return;
    }
    _html5qrcodeLoading = true;
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/html5-qrcode';
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => reject(new Error('Failed to load html5-qrcode'));
    document.head.appendChild(s);
  });
}

export async function selectRearCameraDeviceId() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return null;
  try {
    // helper: call global toast if available, then invoke provided onDecode
    // Do not emit a generic scan toast here; pages should show domain-specific toasts.
    const wrappedOnDecode = async (decoded) => {
      try { if (typeof onDecode === 'function') onDecode(decoded); } catch (e) { console.error('onDecode', e); }
    };
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter(d => d.kind === 'videoinput');
    if (!videoInputs.length) return null;
    for (const d of videoInputs) {
      const label = (d.label || '').toLowerCase();
      if (label.includes('rear') || label.includes('back') || label.includes('environment') || label.includes('achter')) return d.deviceId;
    }
    return videoInputs[videoInputs.length - 1].deviceId;
  } catch (e) {
    console.error('selectRearCameraDeviceId error', e);
    return null;
  }
}

export async function startQrScanner(targetElementId = 'adminQRReader', onDecode, opts = {}) {
  await ensureHtml5Qrcode();
  const target = String(targetElementId || 'adminQRReader');
  const defaultCfg = { fps: 10, qrbox: 250, aspectRatio: 1.333 };
  const cfg = Object.assign({}, defaultCfg, opts);
  // eslint-disable-next-line no-undef
  const html5Qr = new Html5Qrcode(target);

  function createControls(cameras) {
    const root = document.getElementById(target);
    if (!root) return null;
    const parent = root.parentElement;
    if (parent) parent.style.position = parent.style.position || 'relative';

    const selectContainer = document.createElement('div');
    selectContainer.className = 'admin-scanner-select';
    selectContainer.style.position = 'absolute';
    selectContainer.style.bottom = '12px';
    selectContainer.style.left = '50%';
    selectContainer.style.transform = 'translateX(-50%)';
    selectContainer.style.zIndex = '9999';
    selectContainer.style.display = 'flex';
    selectContainer.style.justifyContent = 'center';
    selectContainer.style.alignItems = 'center';

    const select = document.createElement('select');
    select.style.padding = '8px 12px';
    select.style.borderRadius = '999px';
    select.style.border = 'none';
    select.style.fontWeight = '600';
    select.style.minWidth = '200px';
    select.style.boxShadow = '0 6px 18px rgba(0,0,0,0.2)';

    if (Array.isArray(cameras) && cameras.length) {
      cameras.forEach(cam => {
        const opt = document.createElement('option');
        opt.value = cam.id;
        opt.textContent = cam.label || cam.id;
        select.appendChild(opt);
      });
    }

    select.addEventListener('change', async () => {
      const camId = select.value;
      try { await html5Qr.stop(); } catch (_) {}
      try { await html5Qr.start(camId, { fps: cfg.fps, qrbox: cfg.qrbox }, (decoded) => { try { if (typeof onDecode === 'function') onDecode(decoded); } catch (e) { console.error('onDecode', e); } }, (err) => {}); } catch (e) { console.error('switch camera failed', e); }
    });

    selectContainer.appendChild(select);
    parent.appendChild(selectContainer);
    try { parent.style.transition = parent.style.transition || 'transform 220ms ease, max-height 220ms ease, opacity 220ms ease'; } catch(_){ }
    return { container: selectContainer, select };
  }

  let chosenCameraId = null;
  try {
    // eslint-disable-next-line no-undef
    const cams = await Html5Qrcode.getCameras();
    if (Array.isArray(cams) && cams.length) {
      const hints = ['rear', 'back', 'environment', 'achter'];
      let rear = cams.find(c => (c.label || '').toLowerCase().split('/').some(l => hints.some(h => l.includes(h))));
      if (!rear) rear = cams.find(c => (c.label || '').toLowerCase().includes('rear') || (c.label || '').toLowerCase().includes('back') || (c.label || '').toLowerCase().includes('environment'));
      chosenCameraId = (rear && rear.id) ? rear.id : cams[cams.length - 1].id;
      // save preview parent original styles BEFORE any DOM mutations
      try {
        const rootElem = document.getElementById(target);
        const pParent = rootElem && rootElem.parentElement;
        html5Qr.__previewState = html5Qr.__previewState || {};
        if (pParent) {
          html5Qr.__previewState.prevBackgroundImage = pParent.style.backgroundImage || '';
          try { html5Qr.__previewState.prevBackgroundComputed = window.getComputedStyle(pParent).backgroundImage || ''; } catch(_) { html5Qr.__previewState.prevBackgroundComputed = ''; }
          html5Qr.__previewState.prevHeight = pParent.style.height || '';
          html5Qr.__previewState.prevMaxHeight = pParent.style.maxHeight || '';
          html5Qr.__previewState.prevClass = pParent.className || '';
        }
        try {
          if (rootElem) {
            rootElem.dataset.prevBackgroundImage = (pParent && pParent.style.backgroundImage) || '';
            rootElem.dataset.prevHeight = (pParent && pParent.style.height) || '';
            rootElem.dataset.prevMaxHeight = (pParent && pParent.style.maxHeight) || '';
            rootElem.dataset.prevClass = (pParent && pParent.className) || '';
          }
        } catch(_) {}
      } catch(_) {}
      const controls = createControls(cams);
      html5Qr.__controls = controls;
    }
  } catch (e) {
    console.warn('could not enumerate cameras', e);
  }

  try {
    // Do not emit a generic scan toast here; the admin flow will show registration toast.
    // Audio auto-play disabled in scanner module — forwarding decoded payload to caller only.
    const wrappedOnDecode = (decoded) => {
      try { console.debug('wrappedOnDecode - raw decoded:', decoded); } catch(_) {}
      try { if (typeof onDecode === 'function') onDecode(decoded); } catch (e) { console.error('onDecode', e); }
    };

    const startWithDevice = async (device) => {
      try {
        await html5Qr.start(device, { fps: cfg.fps, qrbox: cfg.qrbox }, wrappedOnDecode, (err) => {});
        return true;
      } catch (err) {
        console.warn('start attempt failed for device', device, err);
        return false;
      }
    };

    let started = false;
    const isIOS = (typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream);
    // On iOS Safari try facingMode exact first as some devices require it
    if (isIOS) {
      try { started = await startWithDevice({ facingMode: { exact: 'environment' } }); } catch(_) { started = false; }
    }
    if (!started && chosenCameraId) started = await startWithDevice(chosenCameraId);
    if (!started) {
      try {
        const cams = await Html5Qrcode.getCameras();
        if (Array.isArray(cams) && cams.length) {
          for (const cam of cams) {
            if (cam.id === chosenCameraId) continue;
            started = await startWithDevice(cam.id);
            if (started) break;
          }
        }
      } catch (e) { }
    }

    if (!started) {
      try {
        await html5Qr.start({ facingMode: 'environment' }, { fps: cfg.fps, qrbox: cfg.qrbox }, wrappedOnDecode, (err) => {});
        started = true;
      } catch (e) {
        console.error('startQrScanner final fallback failed', e);
      }
    }

    if (!started) throw new Error('Could not start any camera (NotReadableError or permission issue)');
    try {
      const previewParent = document.getElementById(target).parentElement;
      html5Qr.__previewState = html5Qr.__previewState || {};
      if (previewParent) {
      html5Qr.__previewState.prevBackgroundImage = previewParent.style.backgroundImage || '';
      try { html5Qr.__previewState.prevBackgroundComputed = window.getComputedStyle(previewParent).backgroundImage || ''; } catch(_) { html5Qr.__previewState.prevBackgroundComputed = ''; }
      html5Qr.__previewState.prevHeight = previewParent.style.height || '';
      html5Qr.__previewState.prevMaxHeight = previewParent.style.maxHeight || '';
        const root = document.getElementById(target);
        if (root) { root.style.width = '100%'; root.style.height = '100%'; root.style.minHeight = '60vh'; }
        // Use class toggle for transform-based animation instead of directly manipulating height
        try {
          previewParent.classList.add('scanner-open');
          // ensure the scanner-card is scrolled into view after opening (allow a tick for layout/animation)
          try {
            setTimeout(() => {
              // prefer scrolling the whole card so the control area (stop button) is visible
              const card = previewParent.closest && previewParent.closest('.scanner-card') ? previewParent.closest('.scanner-card') : previewParent;
              try { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(_) {}
              // after the initial scroll, nudge further down if bottom of card is cut off so the stop button becomes visible
              setTimeout(() => {
                try {
                  const rect = card.getBoundingClientRect();
                  const margin = 120; // keep 120px free from bottom so controls are visible
                  if (rect.bottom > window.innerHeight - margin) {
                    const overshoot = rect.bottom - (window.innerHeight - margin) + 12;
                    window.scrollBy({ top: overshoot, behavior: 'smooth' });
                  }
                } catch(_) {}
              }, 160);
            }, 80);
          } catch(_) {}
        } catch(_) { previewParent.style.height = '60vh'; previewParent.style.maxHeight = '80vh'; }
      }
    } catch (_) {}
  } catch (e) {
    console.error('startQrScanner failed to start', e);
    throw e;
  }

  return { scannerInstance: html5Qr };
}

export async function stopQrScanner(scannerInstance) {
  try {
    if (!scannerInstance) return;
    try { if (typeof scannerInstance.stop === 'function') await scannerInstance.stop(); } catch (_) {}
    try { if (typeof scannerInstance.clear === 'function') await scannerInstance.clear(); } catch (_) {}
    try {
      const c = scannerInstance.__controls;
      if (c && c.container && c.container.parentNode) c.container.parentNode.removeChild(c.container);
    } catch (_) {}
    try {
      const st = scannerInstance.__previewState;
      const root = document.getElementById(scannerInstance._elementId || 'adminQRReader');
      const previewParent = root && root.parentElement;

      const doRestore = () => {
        try {
          if (st && previewParent) {
            if (st.prevBackgroundImage) previewParent.style.backgroundImage = st.prevBackgroundImage;
            else if (st.prevBackgroundComputed) previewParent.style.backgroundImage = st.prevBackgroundComputed;
            else previewParent.style.removeProperty('background-image');
            // Prefer restoring previous class; fall back to heights
            if (st.prevClass) {
              try { previewParent.className = st.prevClass; } catch(_) { previewParent.classList.remove('scanner-open'); }
            } else {
              try { previewParent.classList.remove('scanner-open'); } catch(_) { }
              if (st.prevHeight) previewParent.style.height = st.prevHeight;
              else previewParent.style.removeProperty('height');
              if (st.prevMaxHeight) previewParent.style.maxHeight = st.prevMaxHeight;
              else previewParent.style.removeProperty('max-height');
            }
          }
        } catch (_) {}

        // Ensure preview has a blue fallback background if computed style ended up empty
        try {
          if (previewParent) {
            const compBg = (window.getComputedStyle && window.getComputedStyle(previewParent).backgroundImage) || '';
            if (!compBg || compBg === 'none') {
              previewParent.style.background = 'linear-gradient(180deg, rgba(22,62,141,0.44) 0%, rgba(22,62,141,0.22) 100%)';
              previewParent.style.backgroundSize = 'cover';
            }
          }
        } catch(_) {}
        try {
          const r = root || document.getElementById('adminQRReader');
          const pParent = r && r.parentElement;
          if (r && pParent) {
            if ((!st || !st.prevBackgroundImage) && r.dataset.prevBackgroundImage) pParent.style.backgroundImage = r.dataset.prevBackgroundImage || '';
            else if ((!st || !st.prevBackgroundImage)) pParent.style.removeProperty('background-image');
            // restore class (preferred) or heights
            if ((!st || !st.prevClass) && r.dataset.prevClass) {
              try { pParent.className = r.dataset.prevClass || ''; } catch(_) { pParent.classList.remove('scanner-open'); }
            } else if ((!st || !st.prevClass)) {
              try { pParent.classList.remove('scanner-open'); } catch(_) {}
            }
            if ((!st || !st.prevHeight) && r.dataset.prevHeight) pParent.style.height = r.dataset.prevHeight || '';
            else if ((!st || !st.prevHeight)) pParent.style.removeProperty('height');
            if ((!st || !st.prevMaxHeight) && r.dataset.prevMaxHeight) pParent.style.maxHeight = r.dataset.prevMaxHeight || '';
            else if ((!st || !st.prevMaxHeight)) pParent.style.removeProperty('max-height');
          }
          const placeholder = document.getElementById('adminQRPlaceholder');
          if (placeholder) {
            const prev = (st && st.prevPlaceholderDisplay) || (placeholder && placeholder.dataset.prevDisplay) || (r && r.dataset.prevPlaceholderDisplay) || '';
            placeholder.style.display = prev || '';
            try {
              const prevHtml = (st && st.prevPlaceholderInnerHtml) || placeholder.dataset.prevInnerHtml || '';
              if (prevHtml) placeholder.innerHTML = prevHtml;
            } catch (_) {}
          }
          if (r) {
            if (r.dataset.prevWidth) r.style.width = r.dataset.prevWidth; else r.style.removeProperty('width');
            if (r.dataset.prevHeight) r.style.height = r.dataset.prevHeight; else r.style.removeProperty('height');
            if (r.dataset.prevPosition) r.style.position = r.dataset.prevPosition; else r.style.removeProperty('position');
            if (r.dataset.prevMinHeight) r.style.minHeight = r.dataset.prevMinHeight; else r.style.removeProperty('min-height');
          }
        } catch (_) {}

        try {
          const rootEl = document.getElementById(scannerInstance._elementId || 'adminQRReader');
          if (rootEl) {
            delete rootEl.dataset.prevBackgroundImage;
            delete rootEl.dataset.prevHeight;
            delete rootEl.dataset.prevMaxHeight;
            delete rootEl.dataset.prevWidth;
            delete rootEl.dataset.prevPosition;
            delete rootEl.dataset.prevMinHeight;
            delete rootEl.dataset.prevPlaceholderDisplay;
            delete rootEl.dataset.prevInnerHtml;
          }
          const placeholderEl = document.getElementById('adminQRPlaceholder');
          if (placeholderEl) {
            delete placeholderEl.dataset.prevDisplay;
          }
        } catch (_) {}
      };

      try {
        // If the preview was opened with class, remove class to trigger collapse animation, then restore after transition
        if (previewParent && previewParent.classList && previewParent.classList.contains('scanner-open')) {
          try { previewParent.classList.remove('scanner-open'); } catch(_) {}
          setTimeout(doRestore, 360);
        } else {
          doRestore();
        }
      } catch (_) {
        doRestore();
      }
    } catch (_) {}
  } catch (e) { console.warn('stopQrScanner failed', e); }
}

export default {
  ensureHtml5Qrcode,
  selectRearCameraDeviceId,
  startQrScanner,
  stopQrScanner
};