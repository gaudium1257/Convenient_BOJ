// Convenient BOJ — 문제 | 코드 작성 + 정/오답 확인 분할 화면
(() => {
  'use strict';
  const pathMatch = /^\/problem\/(\d+)\/?$/.exec(location.pathname);
  if (!pathMatch || globalThis.__cbojSplitLoaded) return;
  globalThis.__cbojSplitLoaded = true;

  const PID = pathMatch[1];
  const ext = globalThis.chrome;
  const DEFAULTS = globalThis.CBOJ_DEFAULTS;
  const CM = globalThis.CodeMirror;
  if (!ext || !ext.storage || !DEFAULTS || !CM) return;

  // ───────── 언어 ─────────
  const FALLBACK_LANGS = [
    { id: '84', name: 'C++17' }, { id: '95', name: 'C++20' }, { id: '88', name: 'C++14' },
    { id: '75', name: 'C11' }, { id: '0', name: 'C99' },
    { id: '28', name: 'Python 3' }, { id: '73', name: 'PyPy3' },
    { id: '93', name: 'Java 11' },
    { id: '113', name: 'Rust 2021' },
  ];
  const TEMPLATES = globalThis.CBOJ_TEMPLATES;
  const useTabs = () => settings.indent !== 'space'; // 기본: 탭 문자로 들여쓰기
  const expandTemplate = globalThis.cbojExpandTemplate;

  function langInfo(name) {
    // PyPy3는 Python 3와 같은 코드·기본 코드를 쓰고, 실행만 PyPy로 한다
    if (/^PyPy3/.test(name)) return { kind: 'python', family: 'py', pypy: true, mode: 'text/x-python' };
    if (/^Python 3/.test(name)) return { kind: 'python', family: 'py', mode: 'text/x-python' };
    // 백준은 javac -release <버전>으로 컴파일한다 (Java 8, Java 8 (OpenJDK), Java 11, Java 15 …)
    const java = /^Java(?: (\d+))?/.exec(name);
    if (java) return { kind: 'java', family: 'java', release: java[1] || '11', mode: 'text/x-java' };
    const rust = /^Rust(?: (\d{4}))?/.exec(name);
    if (rust) return { kind: 'rust', family: 'rust', edition: rust[1] || '2021', mode: 'rust' };
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

  const FINAL = globalThis.CBOJ_FINAL || ['ac', 'pac', 'wa', 'pe', 'tle', 'mle', 'ole', 'rte', 'ce'];

  // ───────── 유틸 ─────────
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
  const normalize = (s) => {
    const lines = String(s).replace(/\r/g, '').split('\n').map((l) => l.replace(/[ \t]+$/, ''));
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    return lines.join('\n');
  };

  // 작업을 동시에 limit개까지만 돌린다 (결과 순서는 입력 순서 그대로)
  async function mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return out;
  }

  const store = {
    get: (area, defaults) => new Promise((r) => { try { ext.storage[area].get(defaults, (v) => r(v || defaults)); } catch { r(defaults); } }),
    set: (area, obj) => { try { ext.storage[area].set(obj); } catch { /* 확장이 다시 로드됨 */ } },
  };

  const BOJ = globalThis.cbojBoj; // 백준 화면 읽기 (shared/boj.js)
  const SPJ = BOJ.isSpecialJudge();
  const samples = () => BOJ.samples();

  // ───────── 상태 ─────────
  let settings = { ...DEFAULTS };
  let layout = { width: 50, bottom: 260 };
  let langs = FALLBACK_LANGS.filter((l) => langInfo(l.name));
  let langId = null;
  let me = BOJ.username();
  let ui = null;
  let cm = null;
  let saveTimer = 0;
  let running = false;

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
    const timer = h('button', { class: 'cboj-timer', title: '풀이 시간 · 누르면 시작/일시정지' });
    const timerReset = h('button', { class: 'cboj-icon small', title: '풀이 시간 초기화', text: '↺' });
    const editor = h('div', { class: 'cboj-editor' });

    const tabResult = h('button', { class: 'cboj-tab active', 'data-tab': 'result', text: '정/오답 확인' });
    const tabCases = h('button', { class: 'cboj-tab', 'data-tab': 'cases', text: '테스트케이스' });
    const tabTerm = h('button', { class: 'cboj-tab', 'data-tab': 'term', text: '터미널' });
    const casesList = h('div', { class: 'cboj-cases-list' });
    const paneCases = h('div', { class: 'cboj-pane cases' },
      h('div', { class: 'cboj-cases-head' },
        h('div', {},
          h('b', { text: '나만의 테스트케이스' }),
          h('div', { class: 'cboj-cases-hint', text: '▶ 실행(Ctrl+Enter) 때 예제와 함께 채점돼요. 기대 출력을 비워 두면 출력만 보여 줘요.' })),
        h('button', { class: 'cboj-btn small', text: '+ 케이스 추가', onclick: () => addCase('', '') })),
      casesList);
    const status = h('span', { class: 'cboj-status' });

    const card = h('div', { class: 'cboj-card empty', text: '제출하면 이곳에서 채점 결과를 실시간으로 볼 수 있어요.' });
    const histWrap = h('div', { class: 'cboj-hist' },
      h('a', { class: 'cboj-link', target: '_blank', href: `/status?problem_id=${PID}&user_id=${encodeURIComponent(me)}`, text: '이 문제 내 제출 기록 보기 →' }));
    const paneResult = h('div', { class: 'cboj-pane result active' }, card, histWrap);

    const termOut = h('div', { class: 'cboj-term-out', role: 'log' });
    const termIn = h('textarea', { class: 'cboj-term-in', placeholder: '직접 입력할 stdin', spellcheck: 'false' });
    const btnCustom = h('button', { class: 'cboj-btn run small', text: '이 입력으로 실행' });
    const btnClear = h('button', { class: 'cboj-link', text: '지우기' });
    const btnSaveCase = h('button', { class: 'cboj-link', text: '케이스로 저장', title: '이 칸의 입력을 나만의 테스트케이스로 저장' });
    const where = h('button', { class: 'cboj-where', title: '코드를 실행하는 곳' });
    const paneTerm = h('div', { class: 'cboj-pane term' }, termOut,
      h('div', { class: 'cboj-term-bar' }, termIn, h('div', { class: 'cboj-term-actions' }, btnCustom,
        h('div', { class: 'cboj-term-links' }, btnSaveCase, btnClear))));

    const resizerX = h('div', { class: 'cboj-resizer-x', title: '드래그해서 너비 조절' });
    const resizerY = h('div', { class: 'cboj-resizer-y', title: '드래그해서 높이 조절' });
    const bottom = h('div', { class: 'cboj-bottom' },
      h('div', { class: 'cboj-tabs' }, tabResult, tabCases, tabTerm, status), paneResult, paneCases, paneTerm);

    const panel = h('aside', { id: 'cboj-panel', class: 'cboj', 'aria-label': '코드 작성' },
      resizerX,
      h('div', { class: 'cboj-toolbar' },
        h('span', { class: 'cboj-title', text: PID + '번' }), langSel, timer, timerReset,
        h('span', { class: 'cboj-spacer' }), btnReset, btnRun, btnSubmit, btnClose),
      editor, resizerY, bottom);
    document.body.appendChild(panel);

    status.before(where);
    ui = {
      panel, langSel, editor, bottom, card, termOut, termIn, status, btnRun, btnSubmit, btnCustom, where, timer,
      casesList, tabCases,
      tabs: { result: tabResult, cases: tabCases, term: tabTerm },
      panes: { result: paneResult, cases: paneCases, term: paneTerm },
    };

    cm = CM(editor, {
      value: '',
      lineNumbers: true,
      indentUnit: 4,
      tabSize: 4,
      indentWithTabs: useTabs(),
      matchBrackets: true,
      // 괄호 사이 엔터 처리는 smartEnter가 VS Code 방식으로 하므로 explode는 끈다
      autoCloseBrackets: { pairs: '()[]{}\'\'""', explode: '' },
      theme: settings.editorTheme === 'dark' ? 'cboj-dark' : 'cboj-light',
      extraKeys: {
        Tab: (c) => {
          if (c.somethingSelected()) { c.indentSelection('add'); return; }
          if (useTabs()) { c.replaceSelection('\t', 'end'); return; }
          // 공백 모드: 다음 4칸 위치까지 공백을 채운다
          const cur = c.getCursor();
          const col = CM.countColumn(c.getLine(cur.line), cur.ch, 4);
          c.replaceSelection(' '.repeat(4 - (col % 4)), 'end');
        },
        'Shift-Tab': (c) => c.indentSelection('subtract'),
        Enter: (c) => smartEnter(c),
        // 공백 모드에서 줄 앞 공백을 지울 때는 4칸 단위로 한 번에 지운다
        Backspace: (c) => {
          if (useTabs() || c.somethingSelected()) return CM.Pass;
          const cur = c.getCursor();
          const before = c.getLine(cur.line).slice(0, cur.ch);
          if (!before || /[^ ]/.test(before)) return CM.Pass;
          const n = before.length % 4 || 4;
          c.replaceRange('', { line: cur.line, ch: cur.ch - n }, cur);
          return undefined;
        },
        'Ctrl-Enter': () => runSamples(),
        'Cmd-Enter': () => runSamples(),
        'Shift-Ctrl-Enter': () => submit(),
        'Shift-Cmd-Enter': () => submit(),
        'Ctrl-S': () => { saveDraft(true); },
        'Cmd-S': () => { saveDraft(true); },
        'Ctrl-Space': (c) => showHints(c, false),
      },
    });
    cm.setSize('100%', '100%');
    // 코드가 바뀌거나 커서만 옮겨도 잠시 뒤 저장한다 (다시 열면 마지막 작업 위치로)
    const scheduleSave = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveDraft(false), 600);
    };
    cm.on('change', scheduleSave);
    cm.on('cursorActivity', scheduleSave);
    cm.on('inputRead', onInputRead); // 자동완성

    langSel.addEventListener('change', async () => {
      await saveDraft(false);
      if (live) stopLive();
      langId = langSel.value;
      store.set('sync', { lastLangId: langId, lastLangName: currentLang().name });
      await loadDraft();
      renderRunner(); // 언어마다 내 PC 실행 가능 여부가 다를 수 있다 (C/C++은 gcc 필요)
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
    btnSaveCase.addEventListener('click', () => {
      const v = termIn.value;
      if (!v.trim()) { termIn.focus(); setStatus('저장할 입력을 먼저 적어 주세요', 'err'); return; }
      addCase(v, '');
      showTab('cases');
    });
    timer.addEventListener('click', () => (tm.since ? pauseTimer() : startTimer()));
    timerReset.addEventListener('click', () => {
      if (tmNow() > 0 && !confirm('풀이 시간을 0으로 되돌릴까요?')) return;
      resetTimer();
    });
    termIn.addEventListener('keydown', onTermKey);
    where.addEventListener('click', () => {
      if (runner.state === 'on') return;
      checkRunner(true).then(() => {
        if (runner.state !== 'on') window.open(globalThis.CBOJ_LINKS.helperGuide, '_blank');
      });
    });
    [tabResult, tabCases, tabTerm].forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

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
    termOut.append(line('info', '▶ 실행: 문제의 예제 입력으로 돌려보고 정답과 비교해요. (Ctrl+Enter)'));
    termOut.append(line('info', '아래 칸: 프로그램을 터미널에서 실행하고, 실행 중에 입력을 바로 보낼 수 있어요.'));
    renderRunner();
    checkRunner();
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
  }

  function showTab(name) {
    for (const k in ui.tabs) {
      ui.tabs[k].classList.toggle('active', k === name);
      ui.panes[k].classList.toggle('active', k === name);
    }
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
    // 한 번 연 문제는 기본 코드와 똑같은 내용이어도 항상 저장한다.
    // 그래서 $0 위치는 그 문제·언어를 '처음' 열 때와 [↺ 초기화] 때만 쓰인다.
    const { line, ch } = cm.getCursor();
    store.set('local', { [draftKey(info.family)]: { code: cm.getValue(), cursor: { line, ch }, at: Date.now() } });
    if (notify) setStatus('저장했어요', 'ok');
  }
  async function loadDraft() {
    const info = currentInfo();
    cm.setOption('mode', info.mode);
    const key = draftKey(info.family);
    const v = await store.get('local', { [key]: null });
    const d = v[key];
    if (d && typeof d.code === 'string') {
      cm.setValue(d.code);
      cm.clearHistory();
      // 마지막으로 작업하던 자리로 커서를 돌려놓는다 (예전 저장본은 코드 끝으로).
      const last = cm.lastLine();
      if (d.cursor && d.cursor.line <= last) cm.setCursor(d.cursor);
      else cm.setCursor(last, cm.getLine(last).length);
    } else {
      setTemplate();
    }
  }
  // 엔터 자동 들여쓰기: VS Code의 언어별 규칙을 따른다.
  // - C/C++ : 줄이 닫히지 않은 '{' 또는 '('로 끝나면 한 단계 들여쓰기, 그 밖에는 같은 깊이
  //           (';'가 빠진 줄이나 'if (x)' 다음 줄도 같은 깊이)
  //           'case 1:' / 'default:' 다음 줄도 들여쓰기 (VS Code C/C++ 확장 규칙)
  // - Python: 'def/if/for/while/else…'로 시작해 ':'로 끝나거나, 열린 괄호로 끝나면 들여쓰기
  //           'return/pass/break/continue/raise' 다음 줄은 한 단계 내어쓰기
  // - 괄호 쌍 사이( {|}, (|), [|] )에서 누르면 가운데 줄을 만들고 닫는 괄호는 원래 깊이로
  const VSC = {
    cIncrease: /^.*\{[^}"']*$|^.*\([^)"']*$/,
    cCase: /^\s*(?:case\b.*|default\s*):\s*$/,
    pyIncrease: /^\s*(?:def|class|for|if|elif|else|while|try|with|finally|except|async|match|case)\b.*:\s*(#.*)?$/,
    pyBracket: /[([{]\s*(#.*)?$/,
    pyOutdent: /^\s*(?:pass|break|continue|raise\b.*|return\b.*)\s*(#.*)?$/,
  };
  const PAIRS = { '{': '}', '(': ')', '[': ']' };

  function smartEnter(c) {
    if (c.somethingSelected() || c.listSelections().length > 1) return CM.Pass;
    const unit = useTabs() ? '\t' : '    ';
    const cur = c.getCursor();
    const text = c.getLine(cur.line);
    const before = text.slice(0, cur.ch);
    const after = text.slice(cur.ch);
    const base = text.match(/^[ \t]*/)[0];
    const py = currentInfo().family === 'py';
    const beforeCode = py ? before : before.replace(/\/\/.*$/, '');

    let indent = base;
    if (py) {
      if (VSC.pyIncrease.test(before) || VSC.pyBracket.test(before)) indent = base + unit;
      else if (VSC.pyOutdent.test(before)) indent = outdent(base);
    } else if (VSC.cIncrease.test(beforeCode) || VSC.cCase.test(beforeCode)) {
      indent = base + unit;
    }

    const rest = after.replace(/^[ \t]+/, '');
    const open = before.trimEnd().slice(-1);
    if (PAIRS[open] && rest.startsWith(PAIRS[open])) {
      // 괄호 쌍 사이: 가운데 줄은 한 단계 안쪽, 닫는 괄호는 원래 깊이
      c.replaceRange(`\n${base + unit}\n${base}`, cur, { line: cur.line, ch: cur.ch + (after.length - rest.length) });
      c.setCursor({ line: cur.line + 1, ch: (base + unit).length });
      return undefined;
    }
    c.replaceRange(`\n${indent}`, cur, { line: cur.line, ch: cur.ch + (after.length - rest.length) });
    c.setCursor({ line: cur.line + 1, ch: indent.length });
    return undefined;
  }

  function outdent(ws) {
    if (ws.endsWith('\t')) return ws.slice(0, -1);
    const m = ws.match(/ {1,4}$/);
    return m ? ws.slice(0, -m[0].length) : ws;
  }

  function templateFor(family) {
    // 팝업에서 바꾼 기본 코드가 있으면 그걸, 없으면 기본값을 쓴다.
    const custom = settings.templates && settings.templates[family];
    let text = typeof custom === 'string' ? custom : TEMPLATES[family];
    // 탭 모드면 줄 앞 공백 4칸을 탭 문자로 바꿔 둔다 (백스페이스 한 번에 지워지도록)
    if (useTabs()) text = text.replace(/^ +/gm, (m) => '\t'.repeat(Math.floor(m.length / 4)) + ' '.repeat(m.length % 4));
    return expandTemplate(text);
  }
  function setTemplate() {
    const t = templateFor(currentInfo().family);
    cm.setValue(t.code);
    cm.clearHistory();
    if (t.line != null) cm.setCursor({ line: t.line, ch: t.ch });
    else cm.setCursor(cm.lastLine(), cm.getLine(cm.lastLine()).length);
    cm.focus();
  }

  // ───────── 나만의 테스트케이스 ─────────
  // 문제마다 { id, input, expected, on } 목록을 저장하고, ▶ 실행 때 예제와 함께 채점한다.
  const casesKey = `cases:${PID}`;
  let cases = [];
  let casesSaveTimer = 0;

  async function loadCases() {
    const v = await store.get('local', { [casesKey]: [] });
    cases = Array.isArray(v[casesKey]) ? v[casesKey] : [];
    renderCases();
  }
  function persistCases() {
    clearTimeout(casesSaveTimer);
    casesSaveTimer = setTimeout(() => store.set('local', { [casesKey]: cases }), 300);
    updateCasesTab();
  }
  function updateCasesTab() {
    const on = cases.filter((c) => c.on !== false).length;
    ui.tabCases.textContent = cases.length ? `테스트케이스 (${on})` : '테스트케이스';
  }
  function addCase(input, expected) {
    cases.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), input, expected, on: true });
    persistCases();
    renderCases();
    const last = ui.casesList.lastElementChild;
    if (last) { last.scrollIntoView({ block: 'nearest' }); const ta = last.querySelector('textarea'); if (ta && !input) ta.focus(); }
  }
  function renderCases() {
    const list = ui.casesList;
    list.textContent = '';
    if (!cases.length) {
      list.append(h('div', { class: 'cboj-cases-empty', text: '아직 없어요. 반례나 경계값을 저장해 두면 실행할 때마다 함께 확인해요.' }));
    }
    cases.forEach((c, i) => {
      const input = h('textarea', { class: 'cboj-case-ta', spellcheck: 'false', placeholder: '입력' });
      const expected = h('textarea', { class: 'cboj-case-ta', spellcheck: 'false', placeholder: '기대 출력 (비워 두면 비교 안 함)' });
      input.value = c.input || '';
      expected.value = c.expected || '';
      input.addEventListener('input', () => { c.input = input.value; persistCases(); });
      expected.addEventListener('input', () => { c.expected = expected.value; persistCases(); });
      const toggle = h('input', { type: 'checkbox', title: '실행할 때 포함' });
      toggle.checked = c.on !== false;
      toggle.addEventListener('change', () => { c.on = toggle.checked; persistCases(); item.classList.toggle('off', !toggle.checked); });
      const del = h('button', { class: 'cboj-link danger', text: '삭제' });
      del.addEventListener('click', () => {
        if ((c.input || c.expected) && !confirm(`케이스 ${i + 1}을(를) 지울까요?`)) return;
        cases.splice(i, 1);
        persistCases();
        renderCases();
      });
      const item = h('div', { class: 'cboj-case' + (c.on === false ? ' off' : '') },
        h('div', { class: 'cboj-case-head' },
          h('label', {}, toggle, h('b', { text: ` 케이스 ${i + 1}` })), del),
        h('div', { class: 'cboj-case-body' },
          h('div', {}, h('div', { class: 'cboj-case-cap', text: '입력' }), input),
          h('div', {}, h('div', { class: 'cboj-case-cap', text: '기대 출력' }), expected)));
      list.append(item);
    });
    updateCasesTab();
  }

  // ───────── 출력 비교 (어디가 다른지) ─────────
  // 백준처럼 줄 끝 공백과 마지막 빈 줄은 무시하고 비교한다.
  function outLines(s) {
    const lines = String(s == null ? '' : s).replace(/\r/g, '').split('\n').map((l) => l.replace(/[ \t]+$/, ''));
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    return lines;
  }
  const squash = (l) => (l == null ? null : l.replace(/\s+/g, ' ').trim());
  const showSpaces = (l) => l.replace(/ /g, '·').replace(/\t/g, '→');

  function diffView(item, res) {
    const exp = outLines(item.expected);
    const act = outLines(res.stdout);
    const n = Math.max(exp.length, act.length);
    let first = -1;
    for (let i = 0; i < n; i++) if (exp[i] !== act[i]) { first = i; break; }

    const notes = [];
    if (first >= 0) {
      notes.push(`${first + 1}번째 줄부터 달라요`);
      if (exp.length !== act.length) {
        const d = act.length - exp.length;
        notes.push(`기대 ${exp.length}줄 / 내 출력 ${act.length}줄 (${d > 0 ? d + '줄 많음' : -d + '줄 부족'})`);
      }
      if (exp[first] != null && act[first] != null && squash(exp[first]) === squash(act[first])) notes.push('공백(띄어쓰기)만 달라요');
    }

    // 다른 줄 주변만 보여 준다
    const from = Math.max(0, first - 3);
    const to = Math.min(n, first + 12);
    const table = h('table', { class: 'tdiff' },
      h('thead', {}, h('tr', {}, h('th', { text: '' }), h('th', { text: '기대 출력' }), h('th', { text: '내 출력' }))));
    const body = h('tbody');
    if (from > 0) body.append(h('tr', { class: 'gap' }, h('td', { text: '⋮' }), h('td', { text: `(위 ${from}줄 같음)` }), h('td')));
    for (let i = from; i < to; i++) {
      const bad = exp[i] !== act[i];
      const ws = bad && exp[i] != null && act[i] != null && squash(exp[i]) === squash(act[i]);
      const cell = (v) => h('td', { class: v == null ? 'none' : '', text: v == null ? '(없음)' : (ws ? showSpaces(v) : v) });
      body.append(h('tr', { class: bad ? 'bad' : '' }, h('td', { class: 'ln', text: (bad && i === first ? '▶ ' : '') + (i + 1) }), cell(exp[i]), cell(act[i])));
    }
    if (to < n) body.append(h('tr', { class: 'gap' }, h('td', { text: '⋮' }), h('td', { text: `(아래 ${n - to}줄 더 있음)` }), h('td')));
    table.append(body);

    const input = h('details', { class: 'tinput' }, h('summary', { text: '입력 보기' }),
      h('pre', { class: 'tb', text: String(item.input || '').replace(/\n$/, '') || '(비어 있음)' }));
    return h('div', { class: 'tdiff-wrap' },
      notes.length ? h('div', { class: 'tdiff-note', text: notes.join(' · ') }) : null, table, input);
  }

  // ───────── 문제 타이머 ─────────
  const timerKey = `timer:${PID}`;
  let tm = { elapsed: 0, since: null, solved: null };
  let tmTick = 0;
  const tmNow = () => tm.elapsed + (tm.since ? Date.now() - tm.since : 0);
  const fmtTime = (ms) => {
    const t = Math.floor(ms / 1000);
    const hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60;
    const p = (x) => String(x).padStart(2, '0');
    return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
  };

  async function loadTimer() {
    const v = await store.get('local', { [timerKey]: null });
    if (v[timerKey]) tm = { ...tm, ...v[timerKey] };
    if (!tm.since && !tm.elapsed && !tm.solved && settings.timerAutoStart) startTimer();
    else { renderTimer(); if (tm.since) tickTimer(); }
  }
  function persistTimer() { store.set('local', { [timerKey]: tm }); }
  function tickTimer() {
    clearInterval(tmTick);
    tmTick = setInterval(renderTimer, 1000);
  }
  function startTimer() {
    if (tm.since) return;
    tm.since = Date.now();
    tm.solved = null;
    persistTimer();
    renderTimer();
    tickTimer();
  }
  function pauseTimer() {
    if (!tm.since) return;
    tm.elapsed = tmNow();
    tm.since = null;
    clearInterval(tmTick);
    persistTimer();
    renderTimer();
  }
  function resetTimer() {
    clearInterval(tmTick);
    tm = { elapsed: 0, since: null, solved: null };
    persistTimer();
    renderTimer();
  }
  function renderTimer() {
    if (!ui) return;
    const t = ui.timer;
    t.textContent = `⏱ ${fmtTime(tmNow())}`;
    t.className = 'cboj-timer' + (tm.since ? ' running' : tm.solved ? ' solved' : '');
    t.title = tm.since ? '풀이 시간 · 누르면 일시정지'
      : tm.solved ? `맞았을 때 멈춘 시간이에요 (${fmtTime(tm.solved)}). 누르면 다시 시작`
        : '풀이 시간 · 누르면 시작';
  }
  // 맞았습니다!! 를 받으면 타이머를 멈추고 그 시간을 기록한다
  function onSolved() {
    if (!tm.since && !tm.elapsed) return null;
    pauseTimer();
    tm.solved = tm.elapsed;
    persistTimer();
    renderTimer();
    return tm.solved;
  }

  // ───────── 자동완성 ─────────
  const KEYWORDS = {
    cpp: ('int long double float char bool void auto const static struct class public private return if else for while do switch case default break continue '
      + 'true false nullptr namespace using template typename vector string map set unordered_map unordered_set multiset pair queue priority_queue stack deque '
      + 'array tuple bitset make_pair make_tuple push_back pop_back emplace_back push pop front back top size empty clear insert erase find count begin end '
      + 'rbegin rend sort stable_sort reverse lower_bound upper_bound binary_search unique next_permutation min max min_element max_element swap abs memset fill '
      + 'accumulate iota cin cout cerr endl getline ios sync_with_stdio tie greater less numeric_limits INT_MAX LLONG_MAX').split(' '),
    c: ('int long double float char void const static struct return if else for while do switch case default break continue typedef sizeof '
      + 'printf scanf puts gets fgets getchar putchar malloc calloc realloc free memset memcpy strlen strcmp strcpy strcat qsort abs INT_MAX').split(' '),
    java: ('public private protected static final class interface void int long double float char boolean byte short String return if else for while do '
      + 'switch case default break continue new null true false this super import throws throw try catch finally extends implements System out println '
      + 'print printf BufferedReader InputStreamReader BufferedWriter OutputStreamWriter StringTokenizer StringBuilder IOException Integer parseInt Long '
      + 'parseLong ArrayList List LinkedList HashMap Map TreeMap HashSet Set TreeSet ArrayDeque Deque Queue PriorityQueue Arrays Collections Math max min '
      + 'abs append toString length size add get put remove contains containsKey isEmpty sort readLine nextToken hasMoreTokens Scanner nextInt nextLine').split(' '),
    rust: ('fn let mut const static struct enum impl trait pub use mod crate self Self super match if else loop while for in break continue '
      + 'return as ref move where type true false Some None Ok Err Option Result Vec String HashMap HashSet BTreeMap BTreeSet VecDeque BinaryHeap '
      + 'Box Rc RefCell usize isize u8 u32 u64 i32 i64 i128 f64 bool char str std io collections Read Write BufWriter BufRead stdin stdout lock '
      + 'read_to_string read_line split_ascii_whitespace split_whitespace parse unwrap expect push pop insert remove get len is_empty iter into_iter '
      + 'map filter collect sum min max sort sort_unstable reverse contains entry or_insert clone to_string chars bytes writeln println print format').split(' '),
    py: ('def return if elif else for while in not and or is None True False import from as class pass break continue lambda try except finally with '
      + 'yield global nonlocal print input range len int str float list dict set tuple map filter sorted reversed sum min max abs enumerate zip '
      + 'append extend pop insert remove sort join split strip rstrip readline sys stdin collections deque heapq heappush heappop defaultdict '
      + 'Counter itertools permutations combinations math sqrt inf setrecursionlimit').split(' '),
  };

  // 예약어: 점(.)·->·:: 뒤에는 올 수 없어서 그 자리에서는 후보에서 뺀다
  const RESERVED = {
    cpp: 'int long double float char bool void auto const static struct class public private protected return if else for while do switch case default '
      + 'break continue true false nullptr namespace using template typename unsigned signed short inline virtual operator new delete this sizeof typedef',
    c: 'int long double float char void const static struct return if else for while do switch case default break continue typedef sizeof unsigned signed short',
    java: 'public private protected static final class interface void int long double float char boolean byte short return if else for while do switch case '
      + 'default break continue new null true false this super import throws throw try catch finally extends implements',
    rust: 'fn let mut const static struct enum impl trait pub use mod crate super self match if else loop while for in break continue return as ref move where type true false',
    py: 'def return if elif else for while in not and or is None True False import from as class pass break continue lambda try except finally with yield global nonlocal',
  };
  // 점(.) 뒤에 자주 오는 이름. 앞에 있을수록 먼저 보여 준다 (타입을 모르니 많이 쓰는 순서로)
  const MEMBERS = {
    cpp: 'push_back size begin end first second pop_back emplace_back empty clear insert erase find count front back push pop top length substr resize '
      + 'assign reserve at emplace rbegin rend lower_bound upper_bound c_str',
    c: '',
    java: 'println print printf out in append toString length size add get put remove contains containsKey getOrDefault isEmpty readLine nextToken '
      + 'hasMoreTokens parseInt valueOf charAt substring equals split write flush close offer poll peek keySet values entrySet sort max min abs nextInt nextLine next',
    rust: 'unwrap push len iter collect map parse into_iter iter_mut get insert remove pop is_empty contains sort sort_unstable reverse clone to_string '
      + 'chars bytes trim as_str next enumerate rev zip fold sum min max filter entry or_insert lock read_to_string read_line split_ascii_whitespace '
      + 'split_whitespace expect windows new with_capacity from',
    py: 'append split join strip rstrip readline stdin stdout write pop popleft appendleft extend insert remove sort keys values items get count index find '
      + 'replace upper lower startswith endswith add discard update heappush heappop heapify sqrt inf deque defaultdict Counter permutations combinations '
      + 'setrecursionlimit',
  };
  const wordSet = (s) => new Set(s ? s.split(' ') : []);
  const reservedOf = {}, membersOf = {};
  for (const k in KEYWORDS) { reservedOf[k] = wordSet(RESERVED[k]); membersOf[k] = (MEMBERS[k] || '').split(' ').filter(Boolean); }

  // 커서 앞이 점(.)/->/:: 뒤인지
  function hintContext(before) {
    if (/::$/.test(before)) return 'scope';
    if (/->$/.test(before)) return 'member';
    // 1.5 같은 숫자의 점은 빼고, 이름·괄호 뒤의 점만
    if (/[\w)\]]\.$/.test(before) && !/(?:^|[^\w.])\d+\.$/.test(before)) return 'member';
    return 'plain';
  }

  // 글자를 건너뛰어도 찾기 (pb → push_back). 첫 글자는 같아야 한다. 맞은 글자 위치와 빈틈 점수를 돌려준다
  function fuzzyMatch(word, q) {
    const w = word.toLowerCase(), s = q.toLowerCase();
    if (!s || w[0] !== s[0]) return null;
    const idx = [0];
    let j = 1, gaps = 0;
    for (let i = 1; i < w.length && j < s.length; i++) {
      if (w[i] !== s[j]) continue;
      // _ 뒤나 대문자(낙타 표기)에서 맞으면 덜 감점
      if (i !== idx[idx.length - 1] + 1) gaps += word[i - 1] === '_' || /[A-Z]/.test(word[i]) ? 0.5 : 1;
      idx.push(i);
      j++;
    }
    return j === s.length ? { gaps, idx } : null;
  }

  function renderHint(elt, _data, cur) {
    const marks = new Set(cur.idx);
    let run = '', bold = false;
    const flush = () => {
      if (!run) return;
      elt.append(bold ? h('b', { class: 'cboj-hm', text: run }) : document.createTextNode(run));
      run = '';
    };
    [...cur.text].forEach((ch, i) => {
      if (marks.has(i) !== bold) { flush(); bold = marks.has(i); }
      run += ch;
    });
    flush();
  }

  function hintSource(c) {
    const cur = c.getCursor();
    const before = c.getLine(cur.line).slice(0, cur.ch);
    const m = /[A-Za-z_]\w*$/.exec(before);
    const prefix = m ? m[0] : '';
    const ctx = hintContext(before.slice(0, before.length - prefix.length));
    if (!prefix && ctx === 'plain') return null;

    const fam = currentInfo().family;
    const reserved = reservedOf[fam] || new Set();
    const members = membersOf[fam] || [];
    const memberRank = new Map(members.map((w, i) => [w, i]));
    const lang = KEYWORDS[fam] || [];
    const langRank = new Map(lang.map((w, i) => [w, i]));

    // 지금 코드에 나온 이름(몇 번 나왔는지)과, 그중 점(.)·-> 뒤에 나온 이름 (너무 긴 파일은 앞부분만)
    // #include 줄(bits/stdc++.h 의 .h 등)과 문자열 안은 빼고 센다
    const lines = c.getValue().slice(0, 200000).split('\n')
      .map((l) => (/^\s*#\s*include\b/.test(l) ? '' : l.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""')));
    const text = lines.join('\n');
    const used = new Map();
    for (const w of text.match(/[A-Za-z_]\w{2,}/g) || []) used.set(w, (used.get(w) || 0) + 1);
    // 커서가 있는 줄은 빼고 (System.out. 을 치는 중이면 그 out은 '다음에 칠 이름'이 아니다)
    const usedAsMember = new Set();
    const others = lines.filter((_, i) => i !== cur.line).join('\n');
    for (const mm of others.matchAll(/(?:\.|->)\s*([A-Za-z_]\w*)/g)) usedAsMember.add(mm[1]);

    // 어디서 온 후보인지에 따른 순위 (작을수록 먼저)
    const rankOf = (w) => {
      const inCode = used.has(w) && w !== prefix;
      if (ctx === 'member') {
        if (usedAsMember.has(w) && w !== prefix) return 0;
        if (memberRank.has(w)) return 1;
        return inCode ? 2 : 3;
      }
      if (ctx === 'scope') {
        // std:: 뒤: 표준 라이브러리 이름(코드에 이미 썼어도) > 내 코드 이름 > 멤버 함수
        if (langRank.has(w) && !memberRank.has(w)) return 0;
        return inCode ? 1 : 2;
      }
      if (inCode) return 0;
      return memberRank.has(w) ? 2 : 1;
    };

    const pool = new Set([...lang, ...members, ...used.keys()]);
    if (!prefix) {
      // 점 바로 뒤: 자주 쓰는 멤버 + 코드에서 점 뒤에 썼던 이름 / :: 바로 뒤: 타입·함수
      pool.clear();
      if (ctx === 'member') { for (const w of [...usedAsMember, ...members]) pool.add(w); } else { for (const w of lang) pool.add(w); }
    }
    const items = [];
    for (const w of pool) {
      if (w === prefix) continue;
      if (ctx !== 'plain' && reserved.has(w)) continue;
      let tier, gaps = 0, idx = [];
      if (!prefix) tier = 0;
      else if (w.startsWith(prefix)) { tier = 0; idx = [...prefix].map((_, i) => i); }
      else if (prefix.length >= 2) {
        const f = fuzzyMatch(w, prefix);
        if (!f) continue;
        tier = 1; gaps = f.gaps; idx = f.idx;
      } else continue;
      items.push({
        text: w, idx, tier, gaps, rank: rankOf(w), n: used.get(w) || 0, render: renderHint,
        mr: memberRank.has(w) ? memberRank.get(w) : 999,
        lr: langRank.has(w) ? langRank.get(w) : 999,
      });
    }
    // 점 뒤의 자주 쓰는 멤버, 그리고 글자를 아직 안 친 목록은 '많이 쓰는 순서'(목록 순서)로.
    // 글자를 친 뒤에는 VS Code처럼 짧은 이름부터.
    const curated = (a, b) => (ctx === 'member' && a.rank === 1 ? a.mr - b.mr : !prefix ? a.lr - b.lr : 0);
    items.sort((a, b) => a.tier - b.tier || a.rank - b.rank || a.gaps - b.gaps || curated(a, b) || b.n - a.n
      || a.text.length - b.text.length || a.text.localeCompare(b.text));
    const list = items.slice(0, 40);
    return list.length ? { list, from: CM.Pos(cur.line, cur.ch - prefix.length), to: cur } : null;
  }

  function showHints(c, auto) {
    if (!CM.showHint) return;
    c.showHint({
      hint: hintSource,
      completeSingle: !auto,
      container: ui.panel,
      closeCharacters: /[\s()[\]{};:>,.=+\-*/&|!?<"']/,
    });
  }

  function onInputRead(c, change) {
    if (!settings.autocomplete || change.origin !== '+input') return;
    const typed = change.text[0] || '';
    const cur = c.getCursor();
    const tok = c.getTokenAt(cur);
    if (tok.type && /comment|string|meta/.test(tok.type)) return;
    const before = c.getLine(cur.line).slice(0, cur.ch);
    // VS Code처럼 점(.)·->·:: 를 치면 바로 목록을 연다.
    // 같은 입력 처리 안에서 열면 '직전 글자가 닫는 문자'라 곧바로 닫히므로 처리가 끝난 뒤에 연다.
    if (/^[.>:]$/.test(typed) && hintContext(before) !== 'plain') {
      if (typed === ':' && !['cpp', 'rust'].includes(currentInfo().family)) return;
      setTimeout(() => {
        const now = c.getCursor();
        if (now.line !== cur.line || now.ch !== cur.ch) return;
        if (c.state.completionActive) c.state.completionActive.close();
        showHints(c, true);
      }, 0);
      return;
    }
    if (c.state.completionActive || !/^[A-Za-z_0-9]$/.test(typed)) return;
    const w = /[A-Za-z_]\w*$/.exec(before);
    if (!w) return;
    // 보통은 두 글자부터, 점(.)·->·:: 뒤에서는 한 글자부터
    const afterDot = hintContext(before.slice(0, before.length - w[0].length)) !== 'plain';
    if (w[0].length < (afterDot ? 1 : 2)) return;
    showHints(c, true);
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
    const file = { c: 'main.c', java: 'Main.java', rust: 'main.rs' }[info.kind] || 'main.cpp';
    return ['$', res.compiler, ...(res.options || []), file].join(' ');
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
    // Wandbox는 너무 오래 도는 프로그램을 약 55초에 강제 종료한다 (종료 코드 137)
    if (String(res.status) === '137') {
      return res.ms > 30000 ? '시간 초과: 실행 서버 제한 시간(약 55초)을 넘겨 강제 종료됐어요. 무한 루프가 없는지 확인해 주세요.'
        : '강제 종료됐어요 (종료 코드 137, 메모리를 너무 많이 썼을 수 있어요)';
    }
    if (res.status && res.status !== '0') return `종료 코드 ${res.status}`;
    return '';
  }

  // ───────── 내 PC 실행 도우미 (host/cboj_host.py) ─────────
  // 설치돼 있으면 코드를 이 PC에서 컴파일·실행하고(진짜 터미널), 없으면 Wandbox로 실행한다.
  const runner = { port: null, state: 'unknown', info: null, error: '', seq: 0, handlers: new Map(), waiters: [] };

  function runnerPort() {
    if (runner.port) return runner.port;
    try {
      runner.port = ext.runtime.connect({ name: 'cboj-runner' });
    } catch {
      runner.state = 'off';
      return null;
    }
    runner.port.onMessage.addListener(onRunnerMessage);
    runner.port.onDisconnect.addListener(() => {
      // 페이지가 뒤로 가기 캐시에 들어가거나 확장이 다시 시작되면 끊긴다. 다음에 쓸 때 새로 연결한다.
      try { void ext.runtime.lastError; } catch { /* 확장이 다시 로드됨 */ }
      runner.port = null;
      failRunnerJobs('확장 프로그램과 연결이 끊겼어요. 페이지를 새로고침 해주세요.');
    });
    return runner.port;
  }

  function onRunnerMessage(m) {
    if (!m) return;
    if (m.type === 'info') {
      runner.state = 'on';
      runner.info = m;
      settleRunnerWaiters();
      return;
    }
    if (m.type === 'nohost') {
      runner.state = 'off';
      runner.error = m.error || '';
      settleRunnerWaiters();
      failRunnerJobs('내 PC 실행 도우미와 연결이 끊겼어요.');
      return;
    }
    const handler = runner.handlers.get(m.id);
    if (handler) handler(m);
  }

  function settleRunnerWaiters() {
    const ws = runner.waiters.splice(0);
    ws.forEach((w) => w());
    renderRunner();
  }

  function failRunnerJobs(message) {
    for (const [id, handler] of [...runner.handlers]) handler({ id, type: 'lost', message });
    runner.handlers.clear();
  }

  // 도우미가 있는지 확인한다. force면 다시 확인한다(설치 직후 등).
  function checkRunner(force) {
    if (!force && runner.state !== 'unknown') return Promise.resolve(runner.state === 'on');
    runner.state = 'unknown';
    renderRunner();
    return new Promise((resolve) => {
      runner.waiters.push(() => resolve(runner.state === 'on'));
      const port = runnerPort();
      if (!port) { settleRunnerWaiters(); return; }
      port.postMessage({ type: 'info' });
      // 도우미가 없으면 곧바로 'nohost'가 오고, 있으면 첫 시작이 느린 PC(막 켠 직후, 백신 검사)도 있어서 넉넉히 기다린다
      setTimeout(() => {
        if (runner.state === 'unknown') { runner.state = 'off'; runner.error = '응답 없음'; settleRunnerWaiters(); }
      }, 10000);
    });
  }

  // 지금 언어를 이 PC에서 실행할 수 있는지
  function localReady() {
    if (runner.state !== 'on' || !runner.info) return false;
    const info = currentInfo();
    const kind = info.kind;
    if (kind === 'python') return info.pypy ? !!runner.info.pypy : true;
    if (kind === 'java') return !!runner.info.javac;
    if (kind === 'rust') return !!runner.info.rustc;
    return kind === 'c' ? !!runner.info.gcc : !!runner.info.gpp;
  }
  async function useLocal() {
    await checkRunner();
    return localReady();
  }

  function hostRequest(msg, endType) {
    return new Promise((resolve) => {
      const port = runnerPort();
      if (!port) { resolve({ type: 'lost', message: '도우미에 연결하지 못했어요.' }); return; }
      const id = ++runner.seq;
      runner.handlers.set(id, (m) => {
        if (m.type === endType || m.type === 'lost') { runner.handlers.delete(id); resolve(m); }
      });
      port.postMessage({ ...msg, id });
    });
  }

  function renderRunner() {
    if (!ui) return;
    const w = ui.where;
    const info = currentInfo();
    const kind = info.pypy ? 'pypy' : info.kind;
    let text, cls, title;
    if (runner.state === 'unknown') {
      text = '실행 위치 확인 중…'; cls = ''; title = '';
    } else if (localReady()) {
      const tool = kind === 'python' ? `Python ${runner.info.python}`
        : kind === 'pypy' ? runner.info.pypy
        : kind === 'java' ? runner.info.javac : kind === 'rust' ? runner.info.rustc
          : (kind === 'c' ? runner.info.gcc : runner.info.gpp);
      text = '● 내 PC'; cls = 'local';
      title = `내 PC에서 실행해요 (${tool}). 아래 칸에서 터미널처럼 입력을 주고받을 수 있어요.`;
    } else if (runner.state === 'on') {
      // 언어별로 빠진 도구 안내
      const missing = {
        java: ['JDK 없음', 'Java(JDK)', 'Java는', 'JDK'],
        rust: ['Rust 없음', 'Rust(rustc)', 'Rust는', 'Rust'],
        pypy: ['PyPy 없음', 'PyPy', 'PyPy3는', 'PyPy'],
      }[kind] || ['C/C++ 컴파일러 없음', 'gcc/g++', 'C/C++은', 'gcc'];
      text = `● Wandbox (${missing[0]})`; cls = 'remote';
      title = `내 PC에 ${missing[1]}가 없어서 ${missing[2]} Wandbox(온라인)에서 실행해요. 도우미 설치 스크립트(install.bat)를 다시 실행하면 ${missing[3]}를 설치할 수 있어요.`;
    } else {
      text = '● Wandbox'; cls = 'remote';
      title = '내 PC 실행 도우미가 설치되지 않아 Wandbox(온라인)에서 실행해요. 누르면 다시 확인하고, 그래도 없으면 설치 방법을 열어요.';
    }
    w.textContent = text;
    w.className = 'cboj-where ' + cls;
    w.title = title;
    if (!live) {
      const local = localReady();
      ui.btnCustom.textContent = local ? '▶ 터미널에서 실행' : '이 입력으로 실행';
      ui.termIn.placeholder = local
        ? '실행 전에 미리 넣을 입력 (비워 두고 실행한 뒤 입력해도 돼요)'
        : '직접 입력할 stdin';
    }
  }

  // ───────── 예제 실행 (입력을 미리 정해 두고 한꺼번에) ─────────
  async function runInputs(inputs) {
    const info = currentInfo();
    const code = cm.getValue();
    if (await useLocal()) {
      const r = await hostRequest({ type: 'batch', lang: info, code, inputs, timeLimit: 10 }, 'batch-result');
      if (r.type === 'lost') return { fatal: r.message };
      if (r.error) {
        if (r.error.code === 'compile') return { where: '내 PC', cmd: r.cmd && '$ ' + r.cmd, compileError: r.error.message };
        return { fatal: r.error.message };
      }
      const nl = (s) => String(s || '').replace(/\r\n/g, '\n');
      return {
        where: '내 PC',
        cmd: '$ ' + r.cmd,
        warnings: r.warnings,
        results: r.results.map((x) => ({
          stdout: nl(x.stdout),
          stderr: nl(x.stderr),
          ms: x.ms,
          note: x.timeout ? '시간 초과 (10초)' : (x.code ? `${x.note || '런타임 에러'} (종료 코드 ${x.code})` : ''),
        })),
      };
    }
    // Wandbox: 첫 입력으로 컴파일 에러를 확인하고 나머지는 동시에
    const first = await execute(inputs[0]);
    if (!first.ok) return { fatal: first.error };
    if (first.compileError && first.status !== '0' && /\berror\b/.test(first.compileError) && !first.stdout) {
      return { where: 'Wandbox', cmd: commandLine(first, info), compileError: first.compileError };
    }
    // 서버에 한꺼번에 몰리지 않게 동시에 3개까지만 보낸다
    const rest = await mapLimit(inputs.slice(1), 3, (s) => execute(s));
    return {
      where: 'Wandbox',
      cmd: commandLine(first, info),
      warnings: /warning/i.test(first.compileError || '') ? first.compileError : '',
      results: [first, ...rest].map((r) => (r.ok
        ? { stdout: r.stdout, stderr: r.stderr, note: runtimeNote(r) }
        : { stdout: '', stderr: '', note: r.error })),
    };
  }

  async function runSamples() {
    if (running) return;
    if (live) stopLive();
    // 문제 예제 + 켜 둔 나만의 테스트케이스
    const list = [
      ...samples().map((s) => ({ label: `예제 ${s.n}`, input: s.input, expected: s.expected })),
      ...cases.map((c, i) => ({ c, i })).filter(({ c }) => c.on !== false && (c.input || c.expected))
        .map(({ c, i }) => ({ label: `내 케이스 ${i + 1}`, input: c.input || '', expected: (c.expected || '').trim() ? c.expected : null, mine: true })),
    ];
    if (!list.length) {
      showTab('term');
      termAppend(line('warn', '이 문제에는 예제가 없어요. 테스트케이스 탭에서 케이스를 추가하거나, 아래 칸에서 직접 실행해 주세요.'));
      ui.termIn.focus();
      return;
    }
    const nSample = list.filter((x) => !x.mine).length;
    const nMine = list.length - nSample;
    const what = [nSample ? `예제 ${nSample}개` : '', nMine ? `내 케이스 ${nMine}개` : ''].filter(Boolean).join(' + ');
    running = true;
    ui.btnRun.disabled = true;
    showTab('term');
    saveDraft(false);
    ui.termOut.textContent = '';
    termAppend(line('info', `${currentLang().name} · ${what} 실행 중…`));
    setStatus('실행 중…', 'busy');

    const out = await runInputs(list.map((s) => s.input));
    if (out.fatal) {
      termAppend(line('err', '✘ ' + out.fatal));
      setStatus('실행 실패', 'err');
    } else if (out.compileError != null) {
      if (out.cmd) termAppend(line('cmd', `${out.cmd}   [${out.where}]`));
      termAppend(line('err', '✘ 컴파일 에러'), block('컴파일러 메시지', out.compileError.trimEnd(), 'err'));
      setStatus('컴파일 에러', 'err');
    } else {
      termAppend(line('cmd', `${out.cmd}   [${out.where}]`));
      if (out.warnings) termAppend(block('컴파일 경고', out.warnings.trimEnd(), 'dim'));
      let passed = 0, judged = 0;
      list.forEach((s, i) => {
        const res = out.results[i] || { stdout: '', stderr: '', note: '결과 없음' };
        let verdict, kind;
        if (s.expected == null) { verdict = res.note || '출력만 확인'; kind = res.note ? 'err' : 'warn'; }
        else {
          judged++;
          const ok = !res.note && normalize(res.stdout) === normalize(s.expected);
          if (ok) { passed++; verdict = SPJ ? '맞음 (스페셜 저지: 참고용)' : '맞음'; kind = 'ok'; }
          else { verdict = res.note || '틀림'; kind = 'err'; }
        }
        const time = res.ms != null ? `  (${(res.ms / 1000).toFixed(2)}초)` : '';
        termAppend(line(kind, `${kind === 'ok' ? '✔' : kind === 'err' ? '✘' : '•'} ${s.label} — ${verdict}${time}`));
        if (kind === 'err' && s.expected != null && !res.note) {
          termAppend(diffView(s, res)); // 어디가 다른지
        } else if (kind !== 'ok') {
          termAppend(h('div', { class: 'tgrid' },
            block('입력', String(s.input).replace(/\n$/, '')),
            s.expected != null ? block('기대 출력', s.expected.replace(/\n$/, '')) : null,
            block('내 출력', res.stdout.replace(/\n$/, ''), kind === 'err' ? 'err' : '')));
        }
        if (res.stderr) termAppend(block('stderr', res.stderr.trimEnd(), 'dim'));
      });
      if (judged) {
        const all = passed === judged;
        const unit = nMine ? '케이스' : '예제';
        termAppend(line(all ? 'ok big' : 'err big', all
          ? `${unit} ${judged}개 모두 맞았어요! 🎉`
          : `${unit} ${judged}개 중 ${passed}개 맞음`));
        setStatus(all ? (nMine ? '모두 통과' : '예제 통과') : `${passed}/${judged} 통과`, all ? 'ok' : 'err');
      } else {
        setStatus('실행 완료', '');
      }
    }
    running = false;
    ui.btnRun.disabled = false;
  }

  // ───────── 직접 실행 ─────────
  // 내 PC: 진짜 터미널처럼 실행 중에 입력을 주고받는다.  Wandbox: 입력을 한꺼번에 넣고 결과만 받는다.
  let live = null; // { id, pre, pendingEcho }

  async function runCustom() {
    if (live) { stopLive(); return; }
    if (running) return;
    if (await useLocal()) { startLive(); return; }
    running = true;
    showTab('term');
    saveDraft(false);
    const info = currentInfo();
    const stdin = ui.termIn.value;
    termAppend(line('info', `${currentLang().name} · 직접 입력으로 실행 중… [Wandbox]`));
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

  function startLive() {
    const port = runnerPort();
    if (!port) return;
    showTab('term');
    saveDraft(false);
    const id = ++runner.seq;
    const initial = ui.termIn.value;
    ui.termIn.value = '';
    live = { id, pre: h('pre', { class: 'tlive' }), pendingEcho: initial ? withNewline(initial) : '' };
    termAppend(line('info', `${currentLang().name} · 터미널에서 실행 [내 PC]`));
    setLiveUI(true);
    setStatus('컴파일 중…', 'busy');
    runner.handlers.set(id, onLive);
    port.postMessage({ type: 'run', id, lang: currentInfo(), code: cm.getValue(), stdin: live.pendingEcho, interactive: true });
  }

  function withNewline(s) { return s.endsWith('\n') ? s : s + '\n'; }

  function onLive(m) {
    if (!live || m.id !== live.id) return;
    if (m.type === 'compiled') {
      if (!m.ok) {
        if (m.cmd) termAppend(line('cmd', '$ ' + m.cmd));
        if (m.code === 'nocompiler') termAppend(line('err', `✘ ${m.message} 도우미 설치 스크립트(install.bat)를 다시 실행하면 설치할 수 있어요.`));
        else termAppend(line('err', '✘ 컴파일 에러'), block('컴파일러 메시지', String(m.message || '').trimEnd(), 'err'));
        return;
      }
      termAppend(line('cmd', '$ ' + m.cmd));
      if (m.warnings) termAppend(block('컴파일 경고', m.warnings.trimEnd(), 'dim'));
      termAppend(live.pre);
    } else if (m.type === 'start') {
      setStatus('● 실행 중', 'busy');
      if (live.pendingEcho) appendLive(live.pendingEcho, 'in');
      ui.termIn.focus();
    } else if (m.type === 'out') {
      appendLive(String(m.data).replace(/\r\n/g, '\n'), m.stream === 'stderr' ? 'err' : '');
    } else if (m.type === 'error') {
      termAppend(line('err', '✘ ' + m.message));
    } else if (m.type === 'exit' || m.type === 'lost') {
      runner.handlers.delete(m.id);
      if (m.type === 'lost') { termAppend(line('err', '✘ ' + m.message)); setStatus('실행 실패', 'err'); }
      else if (m.compileFailed) setStatus('컴파일 에러', 'err');
      else if (m.overLimit) { termAppend(line('err', '■ 출력이 너무 많아서 중지했어요.')); setStatus('중지됨', 'err'); }
      else if (m.killed) { termAppend(line('warn', '■ 중지했어요.')); setStatus('중지됨', ''); }
      else if (m.code === 0) { termAppend(line('dim', `정상 종료 (${(m.ms / 1000).toFixed(2)}초)`)); setStatus('실행 완료', 'ok'); }
      else { termAppend(line('err', `✘ ${m.note || '런타임 에러'} (종료 코드 ${m.code})`)); setStatus('런타임 에러', 'err'); }
      live = null;
      setLiveUI(false);
    }
  }

  function appendLive(text, cls) {
    if (!live || !text) return;
    const span = document.createElement('span');
    if (cls) span.className = cls;
    span.textContent = text;
    live.pre.append(span);
    ui.termOut.scrollTop = ui.termOut.scrollHeight;
  }

  function sendLive(text) {
    if (!live || !runner.port) return;
    runner.port.postMessage({ type: 'stdin', id: live.id, data: text });
    appendLive(text, 'in');
  }

  function stopLive() {
    if (live && runner.port) runner.port.postMessage({ type: 'kill', id: live.id });
  }

  function setLiveUI(on) {
    ui.btnCustom.classList.toggle('stop', on);
    ui.termIn.classList.toggle('live', on);
    if (on) {
      ui.btnCustom.textContent = '■ 중지';
      ui.termIn.placeholder = '입력하고 Enter  ·  Shift+Enter 줄바꿈  ·  Ctrl+C 중지  ·  Ctrl+D 입력 끝';
    } else {
      renderRunner();
    }
  }

  function onTermKey(e) {
    if (live) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        const v = ui.termIn.value;
        ui.termIn.value = '';
        sendLive(v + '\n');
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C') && ui.termIn.selectionStart === ui.termIn.selectionEnd) {
        e.preventDefault();
        stopLive();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        if (ui.termIn.value) sendLive(ui.termIn.value);
        ui.termIn.value = '';
        if (runner.port) runner.port.postMessage({ type: 'eof', id: live.id });
        appendLive('^D\n', 'dim');
      }
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runCustom(); }
  }

  // ───────── 백준 제출 ─────────
  // 백준은 스크립트 요청(fetch)에 빈 응답을 주고 제출에 reCAPTCHA를 쓰므로,
  // 진짜 제출 페이지를 작은 창으로 열어 코드·언어를 채워 두고 [제출]은 사용자가 직접 누른다.
  // 결과는 그 창의 채점 현황 페이지(content/status.js)가 storage로 알려 준다.
  let submitToken = null;

  function setCard(kind, title, sub, extra) {
    const c = ui.card;
    c.className = 'cboj-card ' + kind;
    c.textContent = '';
    c.append(h('div', { class: 'cboj-card-title', text: title }));
    if (sub) c.append(h('div', { class: 'cboj-card-sub', text: sub }));
    if (extra) c.append(extra);
  }

  function badge(row) {
    return h('span', { class: 'cboj-res ' + (FINAL.includes(row.key) ? row.key : 'pending'), text: row.text || '기다리는 중' });
  }

  function submit() {
    const code = cm.getValue();
    showTab('result');
    if (!code.trim()) { setCard('err', '코드가 비어 있어요'); return; }
    if (!me) {
      setCard('err', '로그인이 필요해요', '백준에 로그인한 뒤 다시 제출해주세요.',
        h('a', { class: 'cboj-link', href: `/login?next=${encodeURIComponent(location.pathname)}`, text: '로그인하러 가기 →' }));
      return;
    }
    saveDraft(false);
    const token = Math.random().toString(36).slice(2);
    submitToken = token;
    setCard('pending', '제출 탭을 여는 중…', `${PID}번 · ${currentLang().name}`);
    setStatus('제출 대기', 'busy');
    // 코드를 먼저 저장한 뒤, 백그라운드에 제출 탭(B)을 열어 달라고 한다.
    const pending = { pid: PID, langId: currentLang().id, langName: currentLang().name, code, codeOpen: settings.codeOpen, token, at: Date.now() };
    Promise.resolve(ext.storage.local.set({ cbojPending: pending, cbojJudge: null }))
      .then(() => ext.runtime.sendMessage({ type: 'cboj:open-submit', pid: PID, token, origin: location.origin }))
      .then((res) => {
        if (!res || !res.ok) throw new Error(res && res.error);
      })
      .catch(() => {
        if (submitToken !== token) return;
        setCard('err', '제출 탭을 열지 못했어요', '확장 프로그램이 업데이트됐다면 이 페이지를 새로고침 해주세요.',
          h('a', { class: 'cboj-link', href: `/submit/${PID}`, target: '_blank', text: '제출 페이지 직접 열기 →' }));
        setStatus('제출 실패', 'err');
      });
  }

  function onJudge(j) {
    if (!ui || !j || j.token !== submitToken) return;
    if (j.stage === 'closed' || j.stage === 'cancelled') {
      const statusUrl = `/status?problem_id=${PID}&user_id=${encodeURIComponent(me)}`;
      setCard(j.stage === 'closed' ? 'pending' : 'empty',
        j.stage === 'closed' ? '채점이 끝나기 전에 제출 탭이 닫혔어요' : '제출 탭을 닫았어요',
        j.stage === 'closed' ? '결과는 제출 기록에서 확인할 수 있어요.' : '제출하지 않았어요.',
        j.stage === 'closed' ? h('a', { class: 'cboj-link', href: statusUrl, target: '_blank', text: '제출 기록 열기 →' }) : null);
      setStatus(j.stage === 'closed' ? '결과 확인 필요' : '', j.stage === 'closed' ? 'busy' : '');
      return;
    }
    if (j.stage === 'filled') {
      const warn = j.langOk ? null
        : h('div', { class: 'cboj-card-sub warn', text: `⚠ 제출 페이지 언어 목록에 ${j.langName || '선택한 언어'}가 없어요. 제출 탭에서 언어를 직접 골라주세요.` });
      setCard('pending', '제출 탭에서 [제출]을 눌러주세요',
        '코드와 언어를 채워 두었어요. 백준의 보안 확인(reCAPTCHA) 때문에 마지막 제출 버튼은 직접 눌러야 해요.', warn);
      setStatus('제출 대기', 'busy');
      return;
    }
    const done = j.stage === 'done';
    setCard(done ? j.key : 'pending', '', '');
    ui.card.firstChild.replaceWith(h('div', { class: 'cboj-card-title' }, badge(j)));
    ui.card.append(h('div', { class: 'cboj-card-meta' },
      j.id ? h('span', { text: `#${j.id}` }) : null,
      j.memory ? h('span', { text: `메모리 ${j.memory}` }) : null,
      j.time ? h('span', { text: `시간 ${j.time}` }) : null,
      j.id ? h('a', { href: `/source/${j.id}`, target: '_blank', text: '코드 보기' }) : null));
    if (done && j.key === 'ac') {
      const t = onSolved(); // 타이머를 멈추고 풀이 시간을 남긴다
      if (t != null) ui.card.lastChild.append(h('span', { class: 'solved-time', text: `⏱ 풀이 시간 ${fmtTime(t)}` }));
    }
    setStatus(done ? j.text : '채점 중…', done ? (j.key === 'ac' ? 'ok' : 'err') : 'busy');
  }

  try {
    ext.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.cbojJudge) onJudge(changes.cbojJudge.newValue);
      if (area === 'local' && changes.cbojLangs && ui) adoptLanguages(changes.cbojLangs.newValue);
    });
  } catch { /* 무시 */ }

  // 제출 페이지에서 본 언어 목록(사용자가 백준에서 고른 언어들)을 쓴다.
  function adoptLanguages(list) {
    const found = (list || []).filter((l) => l && l.id !== '' && langInfo(l.name));
    if (!found.length) return;
    const prevName = langs.length ? currentLang().name : null;
    const order = (l) => ['cpp', 'c', 'java', 'rust', 'py'].indexOf(langInfo(l.name).family);
    langs = found.sort((a, b) => order(a) - order(b));
    const same = langs.find((l) => l.name === prevName) || langs.find((l) => l.id === langId) || langs[0];
    langId = same.id;
    if (ui) renderLangs();
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
      const known = await store.get('local', { cbojLangs: null });
      if (known.cbojLangs) adoptLanguages(known.cbojLangs);
      const last = await store.get('sync', { lastLangId: null, lastLangName: null });
      langId = (langs.find((l) => l.id === last.lastLangId) || langs.find((l) => l.name === last.lastLangName) || langs[0]).id;
      renderLangs();
      await loadDraft();
      await loadCases();
    }
    await loadTimer();
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
    if (live) stopLive();
    clearInterval(tmTick); // 닫혀 있는 동안 화면 갱신만 멈춘다 (시간은 계속 흐름)
    document.documentElement.classList.remove('cboj-open');
    ui.panel.hidden = true;
    toggleBtn.classList.remove('active');
  }
  const toggle = () => (isOpen ? close() : open());

  // 문제 제목 옆 버튼 + 오른쪽 가장자리 손잡이
  const toggleBtn = h('button', { type: 'button', class: 'btn btn-primary cboj-toggle', title: '코드 작성 화면 열기/닫기 (Alt+C)', text: '⇆ 코드 작성' });
  toggleBtn.addEventListener('click', toggle);
  const group = BOJ.titleButtons();
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
    if (cm) cm.setOption('indentWithTabs', useTabs());
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
