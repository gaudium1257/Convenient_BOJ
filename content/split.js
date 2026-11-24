// Convenient BOJ — 문제 | 코드 작성 + 정/오답 확인 분할 화면
(() => {
  'use strict';
  const pathMatch = /^\/problem\/(\d+)\/?$/.exec(location.pathname);
  if (!pathMatch || globalThis.__cbojSplitLoaded) return;
  globalThis.__cbojSplitLoaded = true;

  const PID = pathMatch[1];
  const ext = globalThis.__bojKittyChromeShim || globalThis.chrome;
  const DEFAULTS = globalThis.BOJ_KITTY_DEFAULTS;
  const CM = globalThis.CodeMirror;
  if (!ext || !ext.storage || !DEFAULTS || !CM) return;

  // ───────── 언어 ─────────
  const FALLBACK_LANGS = [
    { id: '84', name: 'C++17' }, { id: '95', name: 'C++20' }, { id: '88', name: 'C++14' },
    { id: '75', name: 'C11' }, { id: '0', name: 'C99' },
    { id: '28', name: 'Python 3' }, { id: '73', name: 'PyPy3' },
  ];
  const TEMPLATES = {
    c: '#include <stdio.h>\n\nint main(void) {\n    \n    return 0;\n}\n',
    cpp: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    \n    return 0;\n}\n',
    py: 'import sys\ninput = sys.stdin.readline\n\n',
  };
  const TEMPLATE_CURSOR = { c: { line: 3, ch: 4 }, cpp: { line: 7, ch: 4 }, py: { line: 3, ch: 0 } };

  function langInfo(name) {
    if (/^(Python 3|PyPy3)/.test(name)) return { kind: 'python', family: 'py', mode: 'text/x-python' };
    let m = /^C\+\+(\d+)?/.exec(name);
    if (m) {
      const v = { 98: '98', '03': '03', 11: '11', 14: '14', 17: '17', 20: '20', 23: '23', 26: '2c' }[m[1] || '17'] || '17';
      const clang = /Clang/i.test(name);
      return { kind: 'cpp', family: 'cpp', clang, std: (clang ? 'c++' : 'gnu++') + v, mode: 'text/x-c++src' };
    }
    m = /^C(\d+|2x)?(?=$| )/.exec(name);
    if (m) {
      const v = { 90: '90', 99: '99', 11: '11', 17: '17', '2x': '2x', 23: '2x' }[m[1] || '11'] || '11';
      const clang = /Clang/i.test(name);
      return { kind: 'c', family: 'c', clang, std: (clang ? 'c' : 'gnu') + v, mode: 'text/x-csrc' };
    }
    return null;
  }

  // ───────── 채점 결과 분류 ─────────
  const FINAL = ['ac', 'pac', 'wa', 'pe', 'tle', 'mle', 'ole', 'rte', 'ce'];
  const TEXT_RULES = [
    [/맞았습니다/, 'ac'], [/출력 형식/, 'pe'], [/틀렸습니다/, 'wa'], [/시간 초과/, 'tle'],
    [/메모리 초과/, 'mle'], [/출력 초과/, 'ole'], [/런타임 에러/, 'rte'], [/컴파일 에러/, 'ce'],
    [/^\s*\d+(\.\d+)?\s*점/, 'pac'],
  ];
  function resultKey(span, text) {
    if (span) {
      for (const c of span.classList) {
        const m = /^result-(.+)$/.exec(c);
        if (!m || m[1] === 'text') continue;
        if (FINAL.includes(m[1])) return m[1];
      }
    }
    for (const [re, k] of TEXT_RULES) if (re.test(text || '')) return k;
    return 'pending';
  }

  // ───────── 유틸 ─────────
  const $ = (sel, root = document) => root.querySelector(sel);
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const k in attrs) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'text') el.textContent = attrs[k];
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    }
    for (const kid of kids) if (kid != null) el.append(kid);
    return el;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const normalize = (s) => {
    const lines = String(s).replace(/\r/g, '').split('\n').map((l) => l.replace(/[ \t]+$/, ''));
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    return lines.join('\n');
  };
  const parseHTML = (text) => new DOMParser().parseFromString(text, 'text/html');
  const emit = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail }));

  const store = {
    get: (area, defaults) => new Promise((r) => { try { ext.storage[area].get(defaults, (v) => r(v || defaults)); } catch { r(defaults); } }),
    set: (area, obj) => { try { ext.storage[area].set(obj); } catch { /* 확장이 다시 로드됨 */ } },
  };

  const SPJ = !!document.querySelector('.problem-label-spj');
  function samples() {
    const list = [];
    document.querySelectorAll('pre[id^="sample-input-"]').forEach((pre) => {
      const n = pre.id.replace('sample-input-', '');
      const out = document.getElementById('sample-output-' + n);
      list.push({ n, input: pre.textContent, expected: out ? out.textContent : null });
    });
    return list;
  }

  // ───────── 상태 ─────────
  let settings = { ...DEFAULTS };
  let layout = { width: 50, bottom: 260 };
  let langs = FALLBACK_LANGS.filter((l) => langInfo(l.name));
  let langId = null;
  let me = ($('meta[name="username"]') || {}).content || '';
  let submitInfo = null; // { loggedIn, form doc }
  let ui = null;
  let cm = null;
  let saveTimer = 0;
  let running = false;
  let submitting = false;

  const currentLang = () => langs.find((l) => l.id === langId) || langs[0];
  const currentInfo = () => langInfo(currentLang().name);
  const draftKey = (family) => `draft:${PID}:${family}`;

  // ───────── 화면 만들기 ─────────
  function build() {
    const langSel = h('select', { class: 'cboj-lang', title: '제출 언어' });
    const btnReset = h('button', { class: 'cboj-btn', title: '기본 템플릿으로 되돌리기', text: '↺ 초기화' });
    const btnRun = h('button', { class: 'cboj-btn run', title: '예제로 실행 (Ctrl+Enter)', text: '▶ 실행' });
    const btnSubmit = h('button', { class: 'cboj-btn submit', title: '백준에 제출 (Ctrl+Shift+Enter)', text: '제출' });
    const btnClose = h('button', { class: 'cboj-icon', title: '분할 화면 닫기', text: '✕' });
    const editor = h('div', { class: 'cboj-editor' });

    const tabResult = h('button', { class: 'cboj-tab active', 'data-tab': 'result', text: '정/오답 확인' });
    const tabTerm = h('button', { class: 'cboj-tab', 'data-tab': 'term', text: '터미널' });
    const status = h('span', { class: 'cboj-status' });

    const card = h('div', { class: 'cboj-card empty', text: '제출하면 이곳에서 채점 결과를 실시간으로 볼 수 있어요.' });
    const histBody = h('tbody');
    const histWrap = h('div', { class: 'cboj-hist' },
      h('div', { class: 'cboj-hist-head' },
        h('b', { text: '이 문제 내 제출' }),
        h('button', { class: 'cboj-link', text: '새로고침', onclick: () => loadHistory() })),
      h('table', {}, h('thead', {}, h('tr', {},
        h('th', { text: '제출 번호' }), h('th', { text: '결과' }), h('th', { text: '메모리' }),
        h('th', { text: '시간' }), h('th', { text: '언어' }), h('th', { text: '제출한 시간' }))), histBody));
    const paneResult = h('div', { class: 'cboj-pane result active' }, card, histWrap);

    const termOut = h('div', { class: 'cboj-term-out', role: 'log' });
    const termIn = h('textarea', { class: 'cboj-term-in', placeholder: '직접 입력할 stdin', spellcheck: 'false' });
    const btnCustom = h('button', { class: 'cboj-btn run small', text: '이 입력으로 실행' });
    const btnClear = h('button', { class: 'cboj-link', text: '지우기' });
    const paneTerm = h('div', { class: 'cboj-pane term' }, termOut,
      h('div', { class: 'cboj-term-bar' }, termIn, h('div', { class: 'cboj-term-actions' }, btnCustom, btnClear)));

    const resizerX = h('div', { class: 'cboj-resizer-x', title: '드래그해서 너비 조절' });
    const resizerY = h('div', { class: 'cboj-resizer-y', title: '드래그해서 높이 조절' });
    const bottom = h('div', { class: 'cboj-bottom' },
      h('div', { class: 'cboj-tabs' }, tabResult, tabTerm, status), paneResult, paneTerm);

    const panel = h('aside', { id: 'cboj-panel', class: 'cboj', 'aria-label': '코드 작성' },
      resizerX,
      h('div', { class: 'cboj-toolbar' },
        h('span', { class: 'cboj-title', text: PID + '번' }), langSel,
        h('span', { class: 'cboj-spacer' }), btnReset, btnRun, btnSubmit, btnClose),
      editor, resizerY, bottom);
    document.body.appendChild(panel);

    ui = { panel, langSel, editor, bottom, card, histBody, termOut, termIn, status, tabResult, tabTerm, paneResult, paneTerm, btnRun, btnSubmit };

    cm = CM(editor, {
      value: '',
      lineNumbers: true,
      indentUnit: 4,
      tabSize: 4,
      indentWithTabs: false,
      matchBrackets: true,
      autoCloseBrackets: true,
      theme: settings.editorTheme === 'dark' ? 'cboj-dark' : 'cboj-light',
      extraKeys: {
        Tab: (c) => (c.somethingSelected() ? c.indentSelection('add') : c.replaceSelection('    ', 'end')),
        'Shift-Tab': (c) => c.indentSelection('subtract'),
        'Ctrl-Enter': () => runSamples(),
        'Cmd-Enter': () => runSamples(),
        'Shift-Ctrl-Enter': () => submit(),
        'Shift-Cmd-Enter': () => submit(),
        'Ctrl-S': () => { saveDraft(true); },
        'Cmd-S': () => { saveDraft(true); },
      },
    });
    cm.setSize('100%', '100%');
    cm.on('change', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveDraft(false), 500);
    });

    langSel.addEventListener('change', async () => {
      await saveDraft(false);
      langId = langSel.value;
      store.set('sync', { lastLangId: langId, lastLangName: currentLang().name });
      await loadDraft();
    });
    btnReset.addEventListener('click', () => {
      if (cm.getValue().trim() && !confirm('작성한 코드를 지우고 기본 템플릿으로 되돌릴까요?')) return;
      setTemplate();
    });
    btnRun.addEventListener('click', () => runSamples());
    btnSubmit.addEventListener('click', () => submit());
    btnClose.addEventListener('click', () => close());
    btnCustom.addEventListener('click', () => runCustom());
    btnClear.addEventListener('click', () => { termOut.textContent = ''; });
    termIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runCustom(); }
    });
    [tabResult, tabTerm].forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

    dragResize(resizerX, (e) => {
      const pct = ((innerWidth - e.clientX) / innerWidth) * 100;
      layout.width = Math.round(Math.min(75, Math.max(28, pct)));
      applyLayout();
    });
    dragResize(resizerY, (e) => {
      const rect = panel.getBoundingClientRect();
      layout.bottom = Math.round(Math.min(rect.height - 160, Math.max(110, rect.bottom - e.clientY)));
      applyLayout();
    });

    applySettings(settings);
    termOut.append(line('info', '▶ 실행을 누르면 문제의 예제 입력으로 코드를 돌려보고 정답과 비교해요. (Ctrl+Enter)'));
    termOut.append(line('dim', '코드는 Wandbox(wandbox.org) 서버에서 컴파일·실행돼요.'));
  }

  function dragResize(handle, onMove) {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      document.documentElement.classList.add('cboj-dragging');
      const move = (ev) => onMove(ev);
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        document.documentElement.classList.remove('cboj-dragging');
        store.set('local', { cbojLayout: layout });
        cm && cm.refresh();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  }

  function applyLayout() {
    document.documentElement.style.setProperty('--cboj-w', layout.width + 'vw');
    if (ui) ui.panel.style.setProperty('--cboj-bottom-h', layout.bottom + 'px');
    emit('cboj:layout', { right: Math.round((innerWidth * layout.width) / 100) });
  }

  function showTab(name) {
    for (const t of [ui.tabResult, ui.tabTerm]) t.classList.toggle('active', t.dataset.tab === name);
    ui.paneResult.classList.toggle('active', name === 'result');
    ui.paneTerm.classList.toggle('active', name === 'term');
  }

  function setStatus(text, kind = '') {
    ui.status.textContent = text;
    ui.status.className = 'cboj-status ' + kind;
  }

  function renderLangs() {
    ui.langSel.textContent = '';
    for (const l of langs) ui.langSel.append(h('option', { value: l.id, text: l.name }));
    ui.langSel.value = langId;
  }

  // ───────── 코드 저장 ─────────
  async function saveDraft(notify) {
    if (!cm) return;
    const info = currentInfo();
    store.set('local', { [draftKey(info.family)]: { code: cm.getValue(), at: Date.now() } });
    if (notify) setStatus('저장했어요', 'ok');
  }
  async function loadDraft() {
    const info = currentInfo();
    cm.setOption('mode', info.mode);
    const key = draftKey(info.family);
    const v = await store.get('local', { [key]: null });
    if (v[key] && typeof v[key].code === 'string') {
      cm.setValue(v[key].code);
      cm.clearHistory();
    } else {
      setTemplate();
    }
  }
  function setTemplate() {
    const info = currentInfo();
    cm.setValue(TEMPLATES[info.family]);
    cm.clearHistory();
    cm.setCursor(TEMPLATE_CURSOR[info.family]);
    cm.focus();
  }

  // ───────── 터미널 ─────────
  function line(kind, text) {
    return h('div', { class: 'tl ' + kind, text });
  }
  function block(title, body, kind = '') {
    const pre = h('pre', { class: 'tb ' + kind, text: body === '' ? '(비어 있음)' : body });
    return h('div', { class: 'tblock' }, h('div', { class: 'tbt', text: title }), pre);
  }
  function termAppend(...nodes) {
    ui.termOut.append(...nodes);
    ui.termOut.scrollTop = ui.termOut.scrollHeight;
  }

  async function execute(stdin) {
    const info = currentInfo();
    try {
      return await ext.runtime.sendMessage({ type: 'cboj:run', lang: info, code: cm.getValue(), stdin });
    } catch {
      return { ok: false, error: '확장 프로그램이 업데이트됐어요. 페이지를 새로고침 해주세요.' };
    }
  }

  function commandLine(res, info) {
    if (!res.compiler) return '$ run';
    if (info.kind === 'python') return `$ ${res.compiler} main.py`;
    return `$ ${res.compiler} ${(res.options || []).join(' ')} main.${info.kind === 'c' ? 'c' : 'cpp'}`;
  }

  function showRunFailure(res) {
    if (!res.ok) { termAppend(line('err', '✘ ' + res.error)); return true; }
    if (res.compileError && res.status !== '0' && /\berror\b/.test(res.compileError) && !res.stdout) {
      termAppend(line('err', '✘ 컴파일 에러'), block('컴파일러 메시지', res.compileError.trimEnd(), 'err'));
      return true;
    }
    return false;
  }

  function runtimeNote(res) {
    if (res.signal) return `프로그램이 신호(${res.signal})로 종료됐어요`;
    if (res.status && res.status !== '0') return `종료 코드 ${res.status}`;
    return '';
  }

  async function runSamples() {
    if (running) return;
    const list = samples();
    if (!list.length) {
      showTab('term');
      termAppend(line('warn', '이 문제에는 예제가 없어요. 아래 칸에 입력을 넣고 "이 입력으로 실행"을 눌러주세요.'));
      ui.termIn.focus();
      return;
    }
    running = true;
    ui.btnRun.disabled = true;
    showTab('term');
    saveDraft(false);
    const info = currentInfo();
    ui.termOut.textContent = '';
    termAppend(line('info', `${currentLang().name} · 예제 ${list.length}개 실행 중…`));
    setStatus('실행 중…', 'busy');

    let passed = 0, judged = 0, shownCmd = false, failed = false;
    const results = new Array(list.length);
    const runOne = async (i) => { results[i] = await execute(list[i].input); };

    // 첫 예제로 컴파일 에러를 먼저 확인하고, 나머지는 동시에 돌린다.
    await runOne(0);
    if (!showRunFailure(results[0])) {
      const rest = [];
      for (let i = 1; i < list.length; i++) rest.push(runOne(i));
      await Promise.all(rest);
    } else {
      failed = true;
    }

    if (!failed) {
      list.forEach((s, i) => {
        const res = results[i];
        if (!shownCmd && res.ok) { termAppend(line('cmd', commandLine(res, info))); shownCmd = true; }
        if (!res.ok) { termAppend(line('err', `✘ 예제 ${s.n}: ${res.error}`)); return; }
        const note = runtimeNote(res);
        let verdict, kind;
        if (s.expected == null) { verdict = '출력 확인 필요'; kind = 'warn'; }
        else {
          judged++;
          const ok = normalize(res.stdout) === normalize(s.expected) && !res.signal;
          if (ok) { passed++; verdict = SPJ ? '맞음 (스페셜 저지: 참고용)' : '맞음'; kind = 'ok'; }
          else { verdict = note || '틀림'; kind = 'err'; }
        }
        termAppend(line(kind, `${kind === 'ok' ? '✔' : kind === 'err' ? '✘' : '•'} 예제 ${s.n} — ${verdict}`));
        if (kind !== 'ok') {
          const grid = h('div', { class: 'tgrid' },
            block('입력', s.input.replace(/\n$/, '')),
            s.expected != null ? block('기대 출력', s.expected.replace(/\n$/, '')) : null,
            block('내 출력', res.stdout.replace(/\n$/, ''), kind === 'err' ? 'err' : ''));
          termAppend(grid);
        }
        if (res.stderr) termAppend(block('stderr', res.stderr.trimEnd(), 'dim'));
        if (res.compileError && /warning/i.test(res.compileError) && i === 0) {
          termAppend(block('컴파일 경고', res.compileError.trimEnd(), 'dim'));
        }
      });
      if (judged) {
        const all = passed === judged;
        termAppend(line(all ? 'ok big' : 'err big', all
          ? `예제 ${judged}개 모두 맞았어요! 🎉`
          : `예제 ${judged}개 중 ${passed}개 맞음`));
        setStatus(all ? '예제 통과' : `예제 ${passed}/${judged}`, all ? 'ok' : 'err');
        emit('cboj:samples', { passed, total: judged });
      } else {
        setStatus('실행 완료', '');
      }
    } else {
      setStatus('컴파일 에러', 'err');
      emit('cboj:samples', { passed: 0, total: list.length, compileError: true });
    }
    running = false;
    ui.btnRun.disabled = false;
  }

  async function runCustom() {
    if (running) return;
    running = true;
    showTab('term');
    saveDraft(false);
    const info = currentInfo();
    const stdin = ui.termIn.value;
    termAppend(line('info', `${currentLang().name} · 직접 입력으로 실행 중…`));
    setStatus('실행 중…', 'busy');
    const res = await execute(stdin);
    if (!showRunFailure(res)) {
      termAppend(line('cmd', commandLine(res, info)));
      termAppend(block('출력', res.stdout.replace(/\n$/, '')));
      if (res.stderr) termAppend(block('stderr', res.stderr.trimEnd(), 'dim'));
      const note = runtimeNote(res);
      termAppend(line(note ? 'err' : 'dim', note || '정상 종료'));
      setStatus(note ? '런타임 문제' : '실행 완료', note ? 'err' : '');
    } else {
      setStatus('컴파일 에러', 'err');
    }
    running = false;
  }

  // ───────── 백준 제출 ─────────
  async function fetchSubmitPage() {
    try {
      const res = await fetch(`/submit/${PID}`, { credentials: 'include', cache: 'no-store' });
      if (/\/login/.test(new URL(res.url).pathname)) return { loggedIn: false };
      const doc = parseHTML(await res.text());
      const form = doc.querySelector('#submit_form') || doc.querySelector('form[action*="/submit"]');
      const name = (doc.querySelector('meta[name="username"]') || {}).content || '';
      if (name) me = name;
      return { loggedIn: true, doc, form, url: res.url };
    } catch {
      return { loggedIn: null };
    }
  }

  function adoptLanguages(doc) {
    const sel = doc && doc.querySelector('select[name="language"]');
    if (!sel) return;
    const found = [...sel.options]
      .map((o) => ({ id: o.value, name: o.textContent.trim() }))
      .filter((l) => l.id !== '' && langInfo(l.name));
    if (!found.length) return;
    const order = (l) => ['cpp', 'c', 'py'].indexOf(langInfo(l.name).family);
    langs = found.sort((a, b) => order(a) - order(b));
  }

  function needsCaptcha(doc) {
    return !!(doc && doc.querySelector('.g-recaptcha, .cf-turnstile, .h-captcha, [data-sitekey]'));
  }

  function fallbackToSubmitPage(reason) {
    const code = cm.getValue();
    try { navigator.clipboard.writeText(code); } catch { /* 무시 */ }
    setCard('err', reason, '코드를 클립보드에 복사했어요. 열린 제출 페이지에 붙여넣고 제출해주세요.');
    window.open(`/submit/${PID}`, '_blank');
  }

  function setCard(kind, title, sub, extra) {
    const c = ui.card;
    c.className = 'cboj-card ' + kind;
    c.textContent = '';
    c.append(h('div', { class: 'cboj-card-title', text: title }));
    if (sub) c.append(h('div', { class: 'cboj-card-sub', text: sub }));
    if (extra) c.append(extra);
  }

  async function submit() {
    if (submitting) return;
    const code = cm.getValue();
    if (!code.trim()) { showTab('result'); setCard('err', '코드가 비어 있어요'); return; }
    submitting = true;
    ui.btnSubmit.disabled = true;
    showTab('result');
    saveDraft(false);
    setStatus('제출 중…', 'busy');
    setCard('pending', '제출하는 중…', `${PID}번 · ${currentLang().name}`);
    try {
      const page = await fetchSubmitPage();
      if (page.loggedIn === false) {
        setCard('err', '로그인이 필요해요', '백준에 로그인한 뒤 다시 제출해주세요.',
          h('a', { class: 'cboj-link', href: `/login?next=${encodeURIComponent(location.pathname)}`, text: '로그인하러 가기 →' }));
        return;
      }
      if (!page.form) { fallbackToSubmitPage('제출 폼을 찾지 못했어요'); return; }
      if (needsCaptcha(page.doc)) { fallbackToSubmitPage('제출 페이지에서 보안 확인이 필요해요'); return; }

      const fd = new FormData();
      for (const el of page.form.elements) {
        if (!el.name || el.disabled) continue;
        const type = (el.type || '').toLowerCase();
        if (['submit', 'button', 'file', 'reset'].includes(type)) continue;
        if ((type === 'radio' || type === 'checkbox') && !el.checked) continue;
        fd.append(el.name, el.value);
      }
      fd.set('source', code);
      fd.set('language', currentLang().id);
      if (!fd.has('problem_id')) fd.set('problem_id', PID);
      if (settings.codeOpen && settings.codeOpen !== 'default') fd.set('code_open', settings.codeOpen);

      const action = new URL(page.form.getAttribute('action') || `/submit/${PID}`, location.origin + `/submit/${PID}`);
      const res = await fetch(action.href, { method: 'POST', body: fd, credentials: 'include' });
      const after = new URL(res.url);
      if (!/\/status/.test(after.pathname)) {
        const doc = parseHTML(await res.text());
        const msg = (doc.querySelector('.alert-danger, .alert, .error-v1, .help-block') || {}).textContent;
        setCard('err', '제출하지 못했어요', (msg || '백준이 제출을 받지 않았어요.').trim().replace(/\s+/g, ' '),
          h('button', { class: 'cboj-link', text: '제출 페이지에서 직접 제출하기 →', onclick: () => fallbackToSubmitPage('직접 제출') }));
        setStatus('제출 실패', 'err');
        return;
      }
      await watch(after.href);
    } catch (e) {
      setCard('err', '제출 중 문제가 생겼어요', String(e && e.message || e));
      setStatus('제출 실패', 'err');
    } finally {
      submitting = false;
      ui.btnSubmit.disabled = false;
    }
  }

  function parseRow(tr) {
    // 열: 제출 번호 | 아이디 | 문제 | 결과 | 메모리 | 시간 | (채점 서버) | 언어 | 코드 길이 | 제출한 시간
    const td = [...tr.querySelectorAll('td')];
    const span = tr.querySelector('.result-text');
    const txt = (el) => ((el || {}).textContent || '').trim();
    const text = (span ? span.textContent : txt(td[3])).trim();
    const hasPlatform = !!tr.querySelector('td.judge-platform') || td.length >= 10;
    const langIdx = hasPlatform ? 7 : 6;
    const mem = txt(tr.querySelector('td.memory') || td[4]);
    const time = txt(tr.querySelector('td.time') || td[5]);
    const last = td[td.length - 1];
    const timeEl = last && last.querySelector('[data-original-title], [title]');
    return {
      id: txt(td[0]),
      text,
      key: resultKey(span, text),
      memory: mem ? (/^\d+$/.test(mem) ? mem + ' KB' : mem) : '',
      time: time ? (/^\d+$/.test(time) ? time + ' ms' : time) : '',
      lang: txt(td[langIdx]),
      length: txt(td[langIdx + 1]),
      when: timeEl ? (timeEl.getAttribute('data-original-title') || timeEl.getAttribute('title')) : txt(last),
    };
  }

  function statusRows(doc) {
    return [...doc.querySelectorAll('#status-table tbody tr')].filter((tr) => tr.querySelectorAll('td').length >= 6);
  }

  function badge(row) {
    return h('span', { class: 'cboj-res ' + (FINAL.includes(row.key) ? row.key : 'pending'), text: row.text || '기다리는 중' });
  }

  async function watch(statusUrl) {
    let solId = null;
    const started = Date.now();
    while (Date.now() - started < 5 * 60 * 1000) {
      let row = null;
      try {
        const doc = parseHTML(await (await fetch(statusUrl, { credentials: 'include', cache: 'no-store' })).text());
        const rows = statusRows(doc);
        const tr = solId ? rows.find((r) => r.id === 'solution-' + solId) : rows[0];
        if (tr) row = parseRow(tr);
      } catch { /* 다음 번에 다시 시도 */ }
      if (row) {
        solId = solId || row.id;
        const done = FINAL.includes(row.key);
        const meta = h('div', { class: 'cboj-card-meta' },
          h('span', { text: `#${row.id}` }),
          row.memory ? h('span', { text: `메모리 ${row.memory}` }) : null,
          row.time ? h('span', { text: `시간 ${row.time}` }) : null,
          h('a', { href: `/source/${row.id}`, target: '_blank', text: '코드 보기' }));
        setCard(done ? row.key : 'pending', '', '', null);
        ui.card.firstChild.replaceWith(h('div', { class: 'cboj-card-title' }, badge(row)));
        ui.card.append(meta);
        setStatus(done ? row.text : '채점 중…', done ? (row.key === 'ac' ? 'ok' : 'err') : 'busy');
        if (done) {
          emit('cboj:judge', { result: row.key, text: row.text });
          loadHistory();
          return;
        }
      }
      await sleep(row ? 1000 : 1500);
    }
    setCard('err', '채점 결과를 기다리다 멈췄어요', '채점 현황 페이지에서 확인해주세요.',
      h('a', { class: 'cboj-link', href: statusUrl, target: '_blank', text: '채점 현황 열기 →' }));
  }

  async function loadHistory() {
    if (!ui) return;
    const body = ui.histBody;
    if (!me) {
      body.textContent = '';
      body.append(h('tr', {}, h('td', { colspan: '6', class: 'muted', text: '로그인하면 이 문제의 내 제출 기록이 보여요.' })));
      return;
    }
    try {
      const url = `/status?problem_id=${PID}&user_id=${encodeURIComponent(me)}&language_id=-1&result_id=-1`;
      const doc = parseHTML(await (await fetch(url, { credentials: 'include', cache: 'no-store' })).text());
      const rows = statusRows(doc).slice(0, 10).map(parseRow);
      body.textContent = '';
      if (!rows.length) {
        body.append(h('tr', {}, h('td', { colspan: '6', class: 'muted', text: '아직 제출한 기록이 없어요.' })));
        return;
      }
      for (const r of rows) {
        body.append(h('tr', {},
          h('td', {}, h('a', { href: `/source/${r.id}`, target: '_blank', text: r.id })),
          h('td', {}, badge(r)),
          h('td', { text: r.memory }), h('td', { text: r.time }),
          h('td', { text: r.lang }), h('td', { class: 'muted', text: r.when })));
      }
    } catch {
      body.textContent = '';
      body.append(h('tr', {}, h('td', { colspan: '6', class: 'muted', text: '제출 기록을 불러오지 못했어요.' })));
    }
  }

  // ───────── 열고 닫기 ─────────
  let isOpen = false;
  async function open() {
    if (isOpen) return;
    isOpen = true;
    if (!ui) {
      const saved = await store.get('local', { cbojLayout: layout });
      layout = { ...layout, ...saved.cbojLayout };
      build();
      const last = await store.get('sync', { lastLangId: null, lastLangName: null });
      langId = (langs.find((l) => l.id === last.lastLangId) || langs.find((l) => l.name === last.lastLangName) || langs[0]).id;
      renderLangs();
      await loadDraft();
      // 실제 제출 페이지에서 언어 번호·로그인 상태를 가져온다.
      fetchSubmitPage().then((page) => {
        submitInfo = page;
        if (page.loggedIn && page.doc) {
          const prevName = currentLang().name;
          adoptLanguages(page.doc);
          const same = langs.find((l) => l.name === prevName) || langs.find((l) => l.id === langId) || langs[0];
          langId = same.id;
          renderLangs();
        }
        loadHistory();
      });
    }
    document.documentElement.classList.add('cboj-open');
    ui.panel.hidden = false;
    applyLayout();
    toggleBtn.classList.add('active');
    setTimeout(() => { cm.refresh(); cm.focus(); }, 30);
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    saveDraft(false);
    document.documentElement.classList.remove('cboj-open');
    ui.panel.hidden = true;
    toggleBtn.classList.remove('active');
    emit('cboj:layout', { right: 0 });
  }
  const toggle = () => (isOpen ? close() : open());

  // 문제 제목 옆 버튼 + 오른쪽 가장자리 손잡이
  const toggleBtn = h('button', { type: 'button', class: 'btn btn-primary cboj-toggle', title: '코드 작성 화면 열기/닫기 (Alt+C)', text: '⇆ 코드 작성' });
  toggleBtn.addEventListener('click', toggle);
  const group = $('.problem-button');
  if (group) group.prepend(toggleBtn);
  else {
    toggleBtn.classList.add('floating');
    document.body.appendChild(toggleBtn);
  }

  document.addEventListener('keydown', (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'c' || e.key === 'C' || e.code === 'KeyC')) {
      e.preventDefault();
      toggle();
    }
  });
  addEventListener('resize', () => { if (isOpen) applyLayout(); });
  addEventListener('beforeunload', () => { if (cm) saveDraft(false); });

  // ───────── 설정 ─────────
  function applySettings(s) {
    settings = { ...DEFAULTS, ...s };
    if (cm) cm.setOption('theme', settings.editorTheme === 'dark' ? 'cboj-dark' : 'cboj-light');
    if (ui) ui.panel.classList.toggle('dark', settings.editorTheme === 'dark');
  }
  store.get('sync', DEFAULTS).then((s) => {
    applySettings(s);
    if (settings.splitAutoOpen) open().then(() => applySettings(settings));
  });
  try {
    ext.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      const s = { ...settings };
      for (const k in changes) s[k] = changes[k].newValue;
      applySettings(s);
    });
  } catch { /* 무시 */ }
})();
