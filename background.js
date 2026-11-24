// Convenient BOJ — 서비스 워커
// 작성 중인 코드를 Wandbox(https://wandbox.org)에서 컴파일·실행해 준다.
// 콘텐츠 스크립트에서 바로 부르면 CORS·권한 문제가 생길 수 있어 여기서 대신 요청한다.

const WANDBOX = 'https://wandbox.org/api';
const FALLBACK = {
  c: 'gcc-13.2.0-c',
  cpp: 'gcc-13.2.0',
  clangc: 'clang-17.0.1-c',
  clangcpp: 'clang-17.0.1',
  python: 'cpython-3.13.18',
};
const DAY = 24 * 60 * 60 * 1000;

let compilerCache = null;

function versionKey(name) {
  return (name.match(/\d+/g) || []).map(Number);
}
function newest(names) {
  return names.sort((a, b) => {
    const x = versionKey(a), y = versionKey(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const d = (y[i] || 0) - (x[i] || 0);
      if (d) return d;
    }
    return 0;
  })[0];
}

async function compilers() {
  if (compilerCache) return compilerCache;
  const saved = (await chrome.storage.local.get('wandboxCompilers')).wandboxCompilers;
  if (saved && Date.now() - saved.at < DAY) return (compilerCache = saved.map);
  try {
    const list = await (await fetch(WANDBOX + '/list.json')).json();
    const names = list.map((c) => c.name);
    const pick = (re) => newest(names.filter((n) => re.test(n)));
    const map = {
      c: pick(/^gcc-\d+\.\d+\.\d+-c$/),
      cpp: pick(/^gcc-\d+\.\d+\.\d+$/),
      clangc: pick(/^clang-\d+\.\d+\.\d+-c$/),
      clangcpp: pick(/^clang-\d+\.\d+\.\d+$/),
      python: pick(/^cpython-3\.\d+\.\d+$/),
    };
    for (const k in FALLBACK) map[k] = map[k] || FALLBACK[k];
    await chrome.storage.local.set({ wandboxCompilers: { at: Date.now(), map } });
    return (compilerCache = map);
  } catch {
    return FALLBACK;
  }
}

async function run({ lang, code, stdin }) {
  const map = await compilers();
  let compiler, options = [];
  if (lang.kind === 'python') {
    compiler = map.python;
  } else if (lang.kind === 'c') {
    compiler = lang.clang ? map.clangc : map.c;
    options = ['-O2', '-std=' + (lang.std || 'gnu11'), '-DONLINE_JUDGE', '-DBOJ', '-lm'];
  } else {
    compiler = lang.clang ? map.clangcpp : map.cpp;
    options = ['-O2', '-std=' + (lang.std || 'gnu++17'), '-DONLINE_JUDGE', '-DBOJ'];
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 40000);
  const started = Date.now();
  try {
    const res = await fetch(WANDBOX + '/compile.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ compiler, code, stdin: stdin || '', 'compiler-option-raw': options.join('\n'), save: false }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, error: `실행 서버 응답 오류 (HTTP ${res.status})`, compiler };
    const j = await res.json();
    return {
      ok: true,
      compiler,
      options,
      status: j.status,
      signal: j.signal || '',
      compileError: j.compiler_error || '',
      stdout: j.program_output || '',
      stderr: j.program_error || '',
      ms: Date.now() - started,
    };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? '실행 시간이 너무 오래 걸려 중단했어요 (40초).' : '실행 서버에 연결하지 못했어요.', compiler };
  } finally {
    clearTimeout(timer);
  }
}

// ───────── 제출 창 관리 ─────────
// A(문제 + 분할 화면)에서 [제출] → 작은 제출 창 B를 연다.
// B에서 제출하면(채점 현황으로 넘어가면) 포커스를 A로 돌려주고,
// B는 뒤에서 채점 결과를 읽어 A에 전달한 뒤 채점이 끝나면 닫는다.
const SESSION_KEY = 'cbojSubmitWin';
const getWin = async () => (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY] || null;
const setWin = (v) => (v ? chrome.storage.session.set({ [SESSION_KEY]: v }) : chrome.storage.session.remove(SESSION_KEY));

async function openSubmit(msg, sender) {
  const old = await getWin();
  if (old) {
    await setWin(null); // 이전 창이 닫혀도 '닫혔어요' 알림이 가지 않게 먼저 지운다
    try { await chrome.windows.remove(old.winId); } catch { /* 이미 닫힘 */ }
  }
  // sender.tab.url은 tabs 권한이 없으면 비어 있을 수 있어서, 보낸 쪽이 알려 준 주소를 검사해 쓴다.
  const origin = ['https://acmicpc.net', 'https://www.acmicpc.net'].includes(msg.origin) ? msg.origin : 'https://www.acmicpc.net';
  if (!/^\d+$/.test(String(msg.pid))) return { ok: false, error: 'bad problem id' };
  const w = await chrome.windows.create({
    url: `${origin}/submit/${msg.pid}`,
    type: 'popup',
    width: 860,
    height: 780,
    focused: true,
  });
  await setWin({
    winId: w.id,
    pid: String(msg.pid),
    token: msg.token,
    originTabId: sender.tab.id,
    originWinId: sender.tab.windowId,
    submitted: false,
  });
  return { ok: true };
}

async function isSubmitWindow(sender) {
  const s = await getWin();
  return !!(s && sender.tab && sender.tab.windowId === s.winId);
}

async function focusOrigin(s) {
  try { await chrome.windows.update(s.originWinId, { focused: true }); } catch { /* A 창이 닫힘 */ }
  try { await chrome.tabs.update(s.originTabId, { active: true }); } catch { /* A 탭이 닫힘 */ }
}

async function onSubmitted(sender) {
  const s = await getWin();
  if (!s || sender.tab.windowId !== s.winId || s.submitted) return { ok: true };
  await setWin({ ...s, submitted: true });
  await focusOrigin(s);
  return { ok: true };
}

async function onJudgeDone(sender) {
  const s = await getWin();
  if (!s || sender.tab.windowId !== s.winId) return { ok: true };
  await setWin(null);
  setTimeout(() => { chrome.windows.remove(s.winId).catch(() => {}); }, 1200);
  return { ok: true };
}

// 채점이 끝나기 전에 사용자가 제출 창을 닫은 경우 A에 알려 준다.
chrome.windows.onRemoved.addListener(async (winId) => {
  const s = await getWin();
  if (!s || s.winId !== winId) return;
  await setWin(null);
  chrome.storage.local.set({ cbojJudge: { token: s.token, stage: s.submitted ? 'closed' : 'cancelled' } });
});

const HANDLERS = {
  'cboj:run': (msg) => run(msg),
  'cboj:open-submit': openSubmit,
  'cboj:is-submit-window': async (_msg, sender) => ({ ok: true, isSubmitWindow: await isSubmitWindow(sender) }),
  'cboj:submitted': (_msg, sender) => onSubmitted(sender),
  'cboj:judge-done': (_msg, sender) => onJudgeDone(sender),
};

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  const fn = msg && HANDLERS[msg.type];
  if (!fn) return undefined;
  Promise.resolve(fn(msg, sender))
    .then(respond)
    .catch((e) => respond({ ok: false, error: String(e && e.message || e) }));
  return true; // 비동기 응답
});
