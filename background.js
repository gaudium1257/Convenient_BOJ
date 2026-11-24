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

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg && msg.type === 'cboj:run') {
    run(msg).then(respond);
    return true; // 비동기 응답
  }
  return undefined;
});
