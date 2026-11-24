// Convenient BOJ — 팝업 설정 화면
(() => {
  'use strict';
  const ext = (globalThis.chrome && chrome.storage)
    ? chrome
    : (window.parent !== window && window.parent.__cbojChromeShim);
  const DEFAULTS = globalThis.CBOJ_DEFAULTS;
  const TEMPLATES = globalThis.CBOJ_TEMPLATES;
  let s = { ...DEFAULTS };

  function save(patch) {
    Object.assign(s, patch);
    ext.storage.sync.set(patch);
    render();
  }

  function render() {
    document.querySelectorAll('.seg[data-key]').forEach((seg) => {
      seg.querySelectorAll('button').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.v === String(s[seg.dataset.key])));
      });
    });
    document.querySelectorAll('.toggle input').forEach((inp) => { inp.checked = !!s[inp.dataset.key]; });
    document.querySelectorAll('select.pick').forEach((sel) => { sel.value = s[sel.dataset.key]; });
  }

  document.querySelectorAll('.seg[data-key]').forEach((seg) => {
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

  // ───────── 기본 코드 ─────────
  const tplLang = document.getElementById('tplLang');
  const tplText = document.getElementById('tplText');
  const tplState = document.getElementById('tplState');
  let lang = 'cpp';

  const currentTemplate = (l) => {
    const custom = s.templates && s.templates[l];
    return typeof custom === 'string' ? custom : TEMPLATES[l];
  };
  const isCustom = (l) => !!(s.templates && typeof s.templates[l] === 'string' && s.templates[l] !== TEMPLATES[l]);

  function showState(kind, message) {
    tplState.className = 'tpl-state ' + (kind || '');
    tplState.textContent = message
      || (kind === 'dirty' ? '저장 안 됨' : kind === 'saved' ? '저장했어요' : (isCustom(lang) ? '내가 바꾼 코드' : '기본값'));
  }

  // 크롬 동기화 저장소는 항목 하나에 8KB(키 이름 + JSON 길이)까지만 들어간다.
  const SYNC_ITEM_LIMIT = 8192;
  const syncItemBytes = (key, value) => new TextEncoder().encode(key + JSON.stringify(value)).length;

  function showTemplate() {
    tplLang.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    tplText.value = currentTemplate(lang);
    showState();
  }

  // 저장에 성공하면 true. 실패하면 이유를 보여 주고 이전 상태를 유지한다.
  async function saveTemplate(text) {
    const templates = { ...(s.templates || {}) };
    if (text === TEMPLATES[lang]) delete templates[lang]; // 기본값과 같으면 따로 저장하지 않는다
    else templates[lang] = text;

    const bytes = syncItemBytes('templates', templates);
    if (bytes > SYNC_ITEM_LIMIT) {
      const kb = (n) => (n / 1024).toFixed(1);
      showState('error', `너무 길어서 저장하지 못했어요 (세 언어 합계 ${kb(bytes)}KB / 최대 8KB)`);
      return false;
    }
    try {
      await ext.storage.sync.set({ templates });
    } catch (e) {
      showState('error', '저장하지 못했어요: ' + ((e && e.message) || '알 수 없는 오류'));
      return false;
    }
    s.templates = templates;
    return true;
  }

  tplLang.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.lang === lang) return;
    const unsaved = tplState.classList.contains('dirty') || tplState.classList.contains('error');
    if (unsaved && !confirm('저장하지 않은 기본 코드가 있어요. 그래도 다른 언어로 넘어갈까요?')) return;
    lang = b.dataset.lang;
    showTemplate();
  });
  tplText.addEventListener('input', () => showState(tplText.value === currentTemplate(lang) ? '' : 'dirty'));
  tplText.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.shiftKey) { // 탭 키는 공백 4칸
      e.preventDefault();
      tplText.setRangeText('    ', tplText.selectionStart, tplText.selectionEnd, 'end');
      tplText.dispatchEvent(new Event('input'));
    } else if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      document.getElementById('tplSave').click();
    }
  });
  document.getElementById('tplSave').addEventListener('click', async () => {
    if (await saveTemplate(tplText.value)) showState('saved');
  });
  document.getElementById('tplReset').addEventListener('click', async () => {
    tplText.value = TEMPLATES[lang];
    if (await saveTemplate(TEMPLATES[lang])) showState('saved');
  });

  if (ext) ext.storage.sync.get(DEFAULTS, (v) => { s = { ...DEFAULTS, ...v }; render(); showTemplate(); });
  render();
  showTemplate();
})();
