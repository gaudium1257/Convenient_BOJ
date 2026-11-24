// Convenient BOJ — 팝업 설정 화면
(() => {
  'use strict';
  const ext = (globalThis.chrome && chrome.storage)
    ? chrome
    : (window.parent !== window && window.parent.__cbojChromeShim);
  const DEFAULTS = globalThis.CBOJ_DEFAULTS;
  let s = { ...DEFAULTS };

  function save(patch) {
    Object.assign(s, patch);
    ext.storage.sync.set(patch);
    render();
  }

  function render() {
    document.querySelectorAll('.seg').forEach((seg) => {
      seg.querySelectorAll('button').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.v === String(s[seg.dataset.key])));
      });
    });
    document.querySelectorAll('.toggle input').forEach((inp) => { inp.checked = !!s[inp.dataset.key]; });
    document.querySelectorAll('select.pick').forEach((sel) => { sel.value = s[sel.dataset.key]; });
  }

  document.querySelectorAll('.seg').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) save({ [seg.dataset.key]: b.dataset.v });
    });
  });
  document.querySelectorAll('.toggle input').forEach((inp) => {
    inp.addEventListener('change', () => save({ [inp.dataset.key]: inp.checked }));
  });
  document.querySelectorAll('select.pick').forEach((sel) => {
    sel.addEventListener('change', () => save({ [sel.dataset.key]: sel.value }));
  });

  if (ext) ext.storage.sync.get(DEFAULTS, (v) => { s = { ...DEFAULTS, ...v }; render(); });
  render();
})();
