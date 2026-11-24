// 개발용: 확장 프로그램을 설치하지 않고 콘텐츠 스크립트를 시험해 보는 로더.
// 백준 문제 페이지 HTML을 로컬에 저장하고 </body> 앞에
//   <script src="http://localhost:<포트>/<이 저장소>/dev/inject.js"></script>
// 를 넣은 뒤 로컬 서버로 열면 가짜 chrome API와 함께 콘텐츠 스크립트가 붙는다.
// manifest에는 들어 있지 않아서 실제 확장 동작에는 영향이 없다.
(() => {
  const BASE = new URL('..', document.currentScript.src).href;
  const listeners = [];
  const msgListeners = [];
  const area = (name) => {
    const KEY = 'cbojDev_' + name;
    const read = () => JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      get(defaults, cb) {
        let base = {};
        if (typeof defaults === 'string') base = { [defaults]: undefined };
        else if (defaults && typeof defaults === 'object') base = defaults;
        const res = { ...base, ...read() };
        if (cb) setTimeout(() => cb(res));
        return Promise.resolve(res);
      },
      set(obj, cb) {
        const cur = read();
        const changes = {};
        for (const k in obj) { changes[k] = { oldValue: cur[k], newValue: obj[k] }; cur[k] = obj[k]; }
        localStorage.setItem(KEY, JSON.stringify(cur));
        setTimeout(() => { listeners.forEach((l) => l(changes, name)); cb && cb(); });
        return Promise.resolve();
      },
      remove(key) {
        const cur = read();
        delete cur[key];
        localStorage.setItem(KEY, JSON.stringify(cur));
        return Promise.resolve();
      },
    };
  };
  async function run({ lang, code, stdin }) {
    const compiler = lang.kind === 'python' ? 'cpython-3.13.18' : lang.kind === 'c' ? 'gcc-13.2.0-c' : 'gcc-13.2.0';
    const options = lang.kind === 'python' ? [] : ['-O2', '-std=' + lang.std, '-DONLINE_JUDGE', '-DBOJ'].concat(lang.kind === 'c' ? ['-lm'] : []);
    const t = Date.now();
    const r = await fetch('https://wandbox.org/api/compile.json', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ compiler, code, stdin, 'compiler-option-raw': options.join('\n') }),
    });
    const j = await r.json();
    return { ok: true, compiler, options, status: j.status, signal: j.signal || '', compileError: j.compiler_error || '',
      stdout: j.program_output || '', stderr: j.program_error || '', ms: Date.now() - t };
  }
  window.__cbojChromeShim = {
    runtime: {
      id: 'dev',
      getURL: (p) => BASE + p,
      onMessage: { addListener: (f) => msgListeners.push(f) },
      sendMessage: async (msg) => (msg.type === 'cboj:run' ? run(msg) : undefined),
    },
    storage: { sync: area('sync'), local: area('local'), onChanged: { addListener: (f) => listeners.push(f) } },
  };
  for (const css of ['vendor/codemirror/codemirror.css', 'content/split.css']) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = BASE + css; document.head.append(l);
  }
  const scripts = ['vendor/codemirror/codemirror.js', 'vendor/codemirror/clike.js', 'vendor/codemirror/python.js',
    'vendor/codemirror/matchbrackets.js', 'vendor/codemirror/closebrackets.js', 'shared/defaults.js',
    'content/split.js'];
  (async () => {
    for (const s of scripts) {
      await new Promise((res, rej) => {
        const el = document.createElement('script'); el.src = BASE + s; el.onload = res; el.onerror = rej; document.head.append(el);
      });
    }
    console.log('[cboj dev] loaded');
  })();
})();
