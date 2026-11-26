// Convenient BOJ — 서비스 워커
// 작성 중인 코드를 Wandbox(https://wandbox.org)에서 컴파일·실행해 준다.
// 콘텐츠 스크립트에서 바로 부르면 CORS·권한 문제가 생길 수 있어 여기서 대신 요청한다.

const WANDBOX = 'https://wandbox.org/api';
// 백준 채점 환경(https://help.acmicpc.net/language/info)과 같거나 가장 가까운 버전을 고른다.
// 최신 버전으로 실행하면 백준에 없는 문법·함수가 여기서만 통과해 버리기 때문.
//   gcc 11.1 (C++23/26만 gcc 14.2) · clang 12 · Python 3.13 · PyPy 7.3 (Python 3.10) · rustc 1.90
//   Java는 컴파일러 버전 대신 백준처럼 --release 로 맞춘다 (아래 run 참고)
const BOJ_VERSION = {
  c: /^gcc-11\./,
  cpp: /^gcc-11\./,
  clangc: /^clang-12\./,
  clangcpp: /^clang-12\./,
  python: /^cpython-3\.13\./,
  pypy: /^pypy-3\.10-/,
  rust: /^rust-1\.90\./,
};
const FALLBACK = {
  c: 'gcc-11.4.0-c',
  cpp: 'gcc-11.4.0',
  cppNew: 'gcc-13.2.0', // C++23/26 (백준은 gcc 14.2)
  clangc: 'clang-14.0.6-c',
  clangcpp: 'clang-14.0.6',
  python: 'cpython-3.13.18',
  pypy: 'pypy-3.10-v7.3.19',
  java: 'openjdk-jdk-21+35',
  rust: 'rust-1.90.0',
};
const DAY = 24 * 60 * 60 * 1000;
const CACHE_KEY = 'wandboxCompilers5';

let compilerCache = null;

function versionKey(name) {
  return (name.match(/\d+/g) || []).map(Number);
}
// 버전 비교: a가 b보다 새것이면 양수
function compareVersion(a, b) {
  const x = versionKey(a), y = versionKey(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}
function newest(names) {
  return [...names].sort((a, b) => compareVersion(b, a))[0];
}

async function compilers() {
  if (compilerCache) return compilerCache;
  const saved = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY];
  if (saved && Date.now() - saved.at < DAY) return (compilerCache = { ...FALLBACK, ...saved.map });
  try {
    const list = await (await fetch(WANDBOX + '/list.json')).json();
    const names = list.map((c) => c.name);
    const pick = (re) => newest(names.filter((n) => re.test(n)));
    // 백준과 같은 버전이 있으면 그것, 없으면 그보다 새것 중 가장 오래된 것(가장 가까운 것), 그것도 없으면 최신
    const near = (key, re) => {
      const all = names.filter((n) => re.test(n));
      const same = all.filter((n) => BOJ_VERSION[key].test(n));
      if (same.length) return newest(same);
      const newer = all.filter((n) => compareVersion(n, FALLBACK[key]) >= 0).sort(compareVersion);
      return newer[0] || newest(all);
    };
    const map = {
      c: near('c', /^gcc-\d+\.\d+\.\d+-c$/),
      cpp: near('cpp', /^gcc-\d+\.\d+\.\d+$/),
      cppNew: pick(/^gcc-\d+\.\d+\.\d+$/),
      clangc: near('clangc', /^clang-\d+\.\d+\.\d+-c$/),
      clangcpp: near('clangcpp', /^clang-\d+\.\d+\.\d+$/),
      python: near('python', /^cpython-3\.\d+\.\d+$/),
      pypy: near('pypy', /^pypy-3\.\d+-v\d+\.\d+\.\d+$/),
      java: pick(/^openjdk-jdk-\d+/),
      rust: near('rust', /^rust-\d+\.\d+\.\d+$/),
    };
    for (const k in FALLBACK) map[k] = map[k] || FALLBACK[k];
    await chrome.storage.local.set({ [CACHE_KEY]: { at: Date.now(), map } });
    return (compilerCache = map);
  } catch {
    return FALLBACK;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);

function httpError(status) {
  if (status === 429) return '실행 서버(Wandbox)가 지금 너무 바빠요. 잠시 후 다시 실행해 주세요.';
  if (status >= 500) return `실행 서버(Wandbox)에 일시적인 문제가 있어요 (HTTP ${status}). 잠시 후 다시 실행해 주세요.`;
  return `실행 서버 응답 오류 (HTTP ${status})`;
}

async function run({ lang, code, stdin }) {
  const map = await compilers();
  let compiler, options = [], source = code, file = 'main.cpp';
  if (lang.kind === 'python') {
    compiler = lang.pypy ? map.pypy : map.python;
    file = 'main.py';
  } else if (lang.kind === 'java') {
    compiler = map.java;
    file = 'Main.java';
    // Wandbox는 소스 파일 이름이 prog.java라서 'public class Main'을 그대로 컴파일하지 못한다.
    // 줄 수가 바뀌지 않게 public만 지운다.
    source = code.replace(/\bpublic\s+((?:final\s+)?class\s+Main\b)/, '$1');
    // 백준: javac -release 11 (Java 8이면 8) → 그 버전에 없는 API는 컴파일 에러가 나게
    options = ['--release', String(lang.release || '11'), '-Xlint:-options'];
  } else if (lang.kind === 'rust') {
    // 백준: rustc --edition 20XX -O
    compiler = map.rust;
    file = 'main.rs';
    options = ['--edition=' + (lang.edition || '2021'), '-O'];
  } else if (lang.kind === 'c') {
    compiler = lang.clang ? map.clangc : map.c;
    file = 'main.c';
    options = ['-O2', '-std=' + (lang.std || 'gnu11'), '-DONLINE_JUDGE', '-DBOJ', '-lm'];
  } else {
    // 백준 C++23/26은 gcc 14라서 가장 새 gcc로
    const modern = /(?:23|26|2b|2c)$/.test(lang.std || '');
    compiler = lang.clang ? map.clangcpp : modern ? map.cppNew : map.cpp;
    options = ['-O2', '-std=' + (lang.std || 'gnu++17'), '-DONLINE_JUDGE', '-DBOJ'];
  }
  // 컴파일러 메시지의 파일 이름을 사용자가 보는 이름으로 바꾼다
  const rename = (t) => String(t || '').replace(/\bprog\.(?:cc|c|cpp|java|py|rs)\b/g, file);

  const started = Date.now();
  let lastError = '실행 서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.';
  // 서버가 바쁘거나 잠깐 끊긴 경우 두 번까지 다시 시도한다
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(800 * attempt);
    const ctrl = new AbortController();
    // 오래 안 쓴 컴파일러는 Wandbox 첫 요청에 40초 넘게 걸리기도 해서 넉넉히 기다린다
    // (무한 루프는 Wandbox가 스스로 끊는다)
    const timer = setTimeout(() => ctrl.abort(), 90000);
    try {
      const res = await fetch(WANDBOX + '/compile.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compiler, code: source, stdin: stdin || '', 'compiler-option-raw': options.join('\n'), save: false }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        lastError = httpError(res.status);
        if (RETRY_STATUS.has(res.status)) continue;
        return { ok: false, error: lastError, compiler };
      }
      const j = await res.json();
      return {
        ok: true,
        compiler,
        options,
        status: j.status,
        signal: j.signal || '',
        compileError: rename(j.compiler_error),
        stdout: j.program_output || '',
        stderr: rename(j.program_error),
        ms: Date.now() - started,
      };
    } catch (e) {
      if (e.name === 'AbortError') return { ok: false, error: '실행 서버(Wandbox)가 90초 동안 응답하지 않아 중단했어요. 잠시 후 다시 실행해 주세요. (무한 루프라면 코드를 확인해 주세요)', compiler };
      lastError = '실행 서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.';
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, error: lastError + ' (내 PC 실행 도우미를 설치하면 인터넷 없이도 실행돼요)', compiler };
}

// ───────── 제출 탭 관리 ─────────
// A(문제 + 분할 화면)에서 [제출] → 같은 창의 A 바로 옆에 제출 탭 B를 연다.
// B에서 제출하면(채점 현황으로 넘어가면) A 탭으로 돌아오고,
// B는 뒤에서 채점 결과를 읽어 A에 전달한 뒤 채점이 끝나면 닫는다.
const SESSION_KEY = 'cbojSubmitTab';
const getSub = async () => (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY] || null;
const setSub = (v) => (v ? chrome.storage.session.set({ [SESSION_KEY]: v }) : chrome.storage.session.remove(SESSION_KEY));

async function openSubmit(msg, sender) {
  const old = await getSub();
  if (old) {
    await setSub(null); // 이전 탭이 닫혀도 '닫혔어요' 알림이 가지 않게 먼저 지운다
    try { await chrome.tabs.remove(old.tabId); } catch { /* 이미 닫힘 */ }
  }
  // sender.tab.url은 tabs 권한이 없으면 비어 있을 수 있어서, 보낸 쪽이 알려 준 주소를 검사해 쓴다.
  const origin = ['https://acmicpc.net', 'https://www.acmicpc.net'].includes(msg.origin) ? msg.origin : 'https://www.acmicpc.net';
  if (!/^\d+$/.test(String(msg.pid))) return { ok: false, error: 'bad problem id' };
  const tab = await chrome.tabs.create({
    url: `${origin}/submit/${msg.pid}`,
    windowId: sender.tab.windowId,
    index: sender.tab.index + 1,
    openerTabId: sender.tab.id,
    active: true,
  });
  await setSub({
    tabId: tab.id,
    pid: String(msg.pid),
    token: msg.token,
    originTabId: sender.tab.id,
    originWinId: sender.tab.windowId,
    submitted: false,
  });
  return { ok: true };
}

async function isSubmitWindow(sender) {
  const s = await getSub();
  return !!(s && sender.tab && sender.tab.id === s.tabId);
}

async function focusOrigin(s) {
  try { await chrome.tabs.update(s.originTabId, { active: true }); } catch { /* A 탭이 닫힘 */ }
  try { await chrome.windows.update(s.originWinId, { focused: true }); } catch { /* A 창이 닫힘 */ }
}

async function onSubmitted(sender) {
  const s = await getSub();
  if (!s || sender.tab.id !== s.tabId || s.submitted) return { ok: true };
  await setSub({ ...s, submitted: true });
  await focusOrigin(s);
  return { ok: true };
}

async function onJudgeDone(sender) {
  const s = await getSub();
  if (!s || sender.tab.id !== s.tabId) return { ok: true };
  await setSub(null);
  setTimeout(() => { chrome.tabs.remove(s.tabId).catch(() => {}); }, 1200);
  return { ok: true };
}

// 채점이 끝나기 전에 사용자가 제출 탭을 닫은 경우 A에 알려 준다.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const s = await getSub();
  if (!s || s.tabId !== tabId) return;
  await setSub(null);
  chrome.storage.local.set({ cbojJudge: { token: s.token, stage: s.submitted ? 'closed' : 'cancelled' } });
});

// ───────── 내 PC 실행 도우미 연결 ─────────
// 분할 화면(콘텐츠 스크립트)과 PC 도우미(host/cboj_host.py) 사이에서 메시지를 그대로 전달한다.
// 도우미가 설치되지 않았으면 'nohost'를 보내고, 분할 화면은 Wandbox로 실행한다.
const HOST_NAME = 'com.convenient_boj.runner';

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'cboj-runner') return;
  let native = null;
  let closed = false;

  const open = () => {
    if (native) return native;
    try {
      native = chrome.runtime.connectNative(HOST_NAME);
    } catch (e) {
      port.postMessage({ type: 'nohost', error: String(e && e.message || e) });
      return null;
    }
    native.onMessage.addListener((m) => { try { port.postMessage(m); } catch { /* 탭이 닫힘 */ } });
    native.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError && chrome.runtime.lastError.message;
      native = null;
      if (!closed) { try { port.postMessage({ type: 'nohost', error: err || '도우미 연결이 끊겼어요.' }); } catch { /* 탭이 닫힘 */ } }
    });
    return native;
  };

  port.onMessage.addListener((m) => {
    const n = open();
    if (n) n.postMessage(m);
  });
  port.onDisconnect.addListener(() => {
    // 탭이 닫히거나 뒤로 가기 캐시(bfcache)로 들어가면 크롬이 연결을 닫는다.
    // 이유(lastError)를 읽어 두지 않으면 'Unchecked runtime.lastError'로 오류 목록에 쌓인다.
    void chrome.runtime.lastError;
    closed = true;
    if (native) {
      try { native.disconnect(); } catch { /* 이미 끊김 */ }
      native = null;
    }
  });
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
