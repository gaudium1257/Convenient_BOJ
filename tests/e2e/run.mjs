// Convenient BOJ E2E 테스트
//
// 실제 크롬에 확장 프로그램을 설치하고, 진짜 백준 문제 페이지에서 사용자처럼 클릭·입력해서
// 분할 화면 → 코드 작성 → 실행(내 PC 도우미 / Wandbox) → 결과 확인 → 제출 버튼 → 팝업까지 확인한다.
//
//   helper : 저장소 폴더 그대로 설치 (manifest의 key 때문에 ID가 고정 → 이 PC의 실행 도우미에 연결됨)
//   store  : 웹 스토어 ZIP과 같게 key를 뺀 복사본 설치 (ID가 달라 도우미에 연결되지 않음 → 전부 Wandbox)
//
// 실행: cd tests/e2e && npm install && npm test            (둘 다)
//       npm run test:helper  /  npm run test:store            (하나만)
// 크롬 위치가 다르면 CHROME 환경 변수로 지정. 화면을 보면서 하려면 HEADFUL=1.
// 로그인이 필요한 실제 제출은 reCAPTCHA 때문에 자동화하지 않는다 (사람이 [제출]을 눌러야 함).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const OUT = path.join(HERE, 'out');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BOJ = 'https://www.acmicpc.net';
const RUN_TIMEOUT = 150000; // Wandbox는 오래 안 쓴 컴파일러의 첫 실행이 40초 넘게 걸리기도 한다

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

// ───────── 언어별 A+B (백준 1000번) ─────────
const AB = {
  'C++17': '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n\tint a, b;\n\tcin >> a >> b;\n\tcout << a + b << \'\\n\';\n}\n',
  C11: '#include <stdio.h>\n\nint main(void) {\n\tint a, b;\n\tscanf("%d %d", &a, &b);\n\tprintf("%d\\n", a + b);\n\treturn 0;\n}\n',
  'Python 3': 'a, b = map(int, input().split())\nprint(a + b)\n',
  PyPy3: 'import platform, sys\na, b = map(int, input().split())\nprint(a + b)\nprint(platform.python_implementation(), file=sys.stderr)\n',
  'Java 11': 'import java.io.*;\nimport java.util.*;\n\npublic class Main {\n\tpublic static void main(String[] args) throws IOException {\n'
    + '\t\tBufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n\t\tStringTokenizer st = new StringTokenizer(br.readLine());\n'
    + '\t\tSystem.out.println(Integer.parseInt(st.nextToken()) + Integer.parseInt(st.nextToken()));\n\t}\n}\n',
  'Rust 2021': 'use std::io::{self, Read};\n\nfn main() {\n\tlet mut s = String::new();\n\tio::stdin().read_to_string(&mut s).unwrap();\n'
    + '\tlet v: Vec<i64> = s.split_ascii_whitespace().map(|x| x.parse().unwrap()).collect();\n\tprintln!("{}", v[0] + v[1]);\n}\n',
};

// ───────── 준비 ─────────
// 웹 스토어 ZIP과 같은 복사본 (release.yml과 같은 폴더들, manifest에서 key 제거)
function makeStoreCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cboj-store-'));
  for (const f of ['LICENSE', 'background.js', 'content', 'popup', 'shared', 'icons', 'vendor']) {
    fs.cpSync(path.join(REPO, f), path.join(dir, f), { recursive: true });
  }
  const m = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8'));
  delete m.key;
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m, null, 2));
  return dir;
}

async function launch(extDir) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cboj-e2e-'));
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: !process.env.HEADFUL,
    pipe: true,
    enableExtensions: true, // 크롬 137+는 --load-extension을 막아서 CDP로 설치한다
    userDataDir: profile,
    args: ['--lang=ko-KR'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const id = await browser.installExtension(extDir);
  return { browser, id, profile };
}

// 확장의 콘텐츠 스크립트 공간(isolated world)에서 코드를 실행한다 (에디터 객체는 거기에만 있다)
async function extWorld(page) {
  const client = await page.createCDPSession();
  const contexts = new Map();
  client.on('Runtime.executionContextCreated', ({ context }) => contexts.set(context.id, context));
  client.on('Runtime.executionContextDestroyed', ({ executionContextId }) => contexts.delete(executionContextId));
  await client.send('Runtime.enable');
  const find = () => [...contexts.values()].find((c) => c.auxData && c.auxData.type === 'isolated' && /Convenient BOJ/.test(c.name));
  for (let i = 0; i < 100 && !find(); i++) await wait(100);
  if (!find()) throw new Error('확장 콘텐츠 스크립트 공간을 찾지 못했어요');
  return async (fn, ...args) => {
    const r = await client.send('Runtime.evaluate', {
      expression: `(${fn})(...${JSON.stringify(args)})`, contextId: find().id, awaitPromise: true, returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
}

// ───────── 결과 기록 ─────────
function reporter(mode) {
  const rows = [];
  return {
    rows,
    check(name, ok, extra = '') {
      rows.push({ mode, name, ok: !!ok, extra });
      console.log(`${ok ? 'PASS' : 'FAIL'}  [${mode}] ${name}${extra ? '  — ' + extra : ''}`);
    },
    async step(name, fn) {
      try { await fn(); } catch (e) { this.check(name, false, String(e.message || e).split('\n')[0]); }
    },
  };
}

// ───────── 화면 조작 ─────────
async function openProblem(page, pid) {
  await page.goto(`${BOJ}/problem/${pid}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.cboj-toggle', { timeout: 30000 });
  if (!(await page.$('#cboj-panel .CodeMirror'))) await page.click('.cboj-toggle');
  await page.waitForSelector('#cboj-panel .CodeMirror', { timeout: 20000 });
  await page.waitForFunction(() => !/확인 중/.test(document.querySelector('.cboj-where')?.textContent || ''), { timeout: 15000 }).catch(() => {});
  return extWorld(page);
}

async function selectLang(page, name) {
  const value = await page.$$eval('.cboj-lang option', (opts, name) => (opts.find((o) => o.textContent === name) || {}).value, name);
  if (value == null) throw new Error(`언어 목록에 ${name} 없음`);
  await page.select('.cboj-lang', value);
  await wait(400);
}

const setCode = (ext, code) => ext((code) => {
  const cm = document.querySelector('#cboj-panel .CodeMirror').CodeMirror;
  cm.setValue(code);
  cm.setCursor(cm.lineCount() - 1, 0);
}, code);

// 터미널에 표시를 꽂아 두고, 그 뒤에 새로 나온 글만 읽는다 (실행이 터미널을 비우면 표시도 사라지니 전체)
const markTerm = (page) => page.$eval('.cboj-term-out', (e) => {
  e.querySelector('#e2e-mark')?.remove();
  const m = document.createElement('i');
  m.id = 'e2e-mark';
  e.append(m);
});
const termSince = (page) => page.$eval('.cboj-term-out', (e) => {
  const m = e.querySelector('#e2e-mark');
  if (!m) return e.innerText;
  const r = document.createRange();
  r.setStartAfter(m);
  r.setEndAfter(e.lastChild);
  return r.toString();
});
// 실행이 끝났다는 마지막 줄들: 모두 맞음 / n개 중 m개 맞음 / 컴파일 에러 / 실행 실패
const DONE = /맞았어요|개 중 \d+개 맞음|컴파일 에러|✘ .*(?:실패|오류|연결|중단)/;

// 실행 버튼을 누르고 이번 실행에서 나온 터미널 글을 돌려준다
async function runSamples(page) {
  await markTerm(page);
  await page.click('#cboj-panel .cboj-toolbar .cboj-btn.run');
  await page.waitForFunction((src) => {
    const e = document.querySelector('.cboj-term-out');
    const m = e.querySelector('#e2e-mark');
    let t = e.innerText;
    if (m) { const r = document.createRange(); r.setStartAfter(m); r.setEndAfter(e.lastChild); t = r.toString(); }
    const btn = document.querySelector('#cboj-panel .cboj-toolbar .cboj-btn.run');
    return new RegExp(src).test(t) && !btn.disabled;
  }, { timeout: RUN_TIMEOUT, polling: 300 }, DONE.source);
  return termSince(page);
}

const where = (page) => page.$eval('.cboj-where', (e) => e.textContent);
const firstLines = (t, n = 3) => t.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, n).join(' / ');

// ───────── 시나리오 ─────────
async function scenario(mode, extDir) {
  const r = reporter(mode);
  const { browser, id } = await launch(extDir);
  r.check('확장 설치', !!id, id);
  const page = await browser.newPage();
  const shot = (name) => page.screenshot({ path: path.join(OUT, `${mode}-${name}.png`) });

  let ext;
  await r.step('문제 페이지에 분할 화면', async () => {
    ext = await openProblem(page, 1000);
    const panel = await page.$eval('#cboj-panel', (e) => e.getBoundingClientRect().width);
    r.check('문제 페이지에 분할 화면', panel > 300, `패널 너비 ${Math.round(panel)}px`);
    const names = await page.$$eval('.cboj-lang option', (o) => o.map((x) => x.textContent));
    r.check('언어 목록 (C/C++/Python/PyPy3/Java/Rust)', ['C++17', 'C11', 'Python 3', 'PyPy3', 'Java 11', 'Rust 2021'].every((n) => names.includes(n)), names.join(', '));
    await selectLang(page, 'C++17');
    const tpl = await ext(() => {
      const cm = document.querySelector('#cboj-panel .CodeMirror').CodeMirror;
      return { code: cm.getValue(), cur: cm.getCursor() };
    });
    // $0 은 cin.tie 다음 빈 줄 아래 (0부터 세서 7번째 줄, 탭 한 칸 뒤)
    r.check('C++ 기본 코드와 커서 위치', /sync_with_stdio/.test(tpl.code) && tpl.cur.line === 7 && tpl.cur.ch === 1, `커서 ${tpl.cur.line}:${tpl.cur.ch}`);
    await shot('01-split');
  });

  // 언어별 실행: 내 PC 도우미가 있으면 그쪽, 없으면 Wandbox
  for (const lang of Object.keys(AB)) {
    await r.step(`${lang} 예제 실행`, async () => {
      await selectLang(page, lang);
      await setCode(ext, AB[lang]);
      const w = await where(page);
      const t = await runSamples(page);
      const ok = /✔ 예제 1 — 맞음/.test(t);
      r.check(`${lang} 예제 실행`, ok, `${w} | ${firstLines(t)}`);
      if (mode === 'store') r.check(`${lang} → Wandbox (도우미 없음)`, /Wandbox/.test(w) && /\[Wandbox\]/.test(t), w);
      if (lang === 'C++17' && mode === 'helper') r.check('C++ → 내 PC 도우미', w === '● 내 PC' && /\[내 PC\]/.test(t), w);
      if (lang === 'PyPy3' && /\[Wandbox\]/.test(t)) r.check('PyPy3가 Wandbox에서 진짜 PyPy로 실행', /\$ pypy-3\.10/.test(t) && /PyPy/.test(t.replace(/pypy-3/g, '')), firstLines(t, 2));
      if (lang === 'Java 11' && /\[Wandbox\]/.test(t)) r.check('Java가 Wandbox에서 --release 11', /--release 11/.test(t), firstLines(t, 2));
      if (lang === 'Rust 2021' && /\[Wandbox\]/.test(t)) r.check('Rust가 Wandbox rust-1.90.0', /rust-1\.90\.0 --edition=2021 -O main\.rs/.test(t), firstLines(t, 2));
      // 내 PC 도우미에 그 언어가 설치돼 있으면 백준과 같은 옵션으로 도는지
      if (/\[내 PC\]/.test(t)) {
        if (lang === 'Java 11') r.check('Java가 내 PC에서 --release 11', /javac --release 11 Main\.java/.test(t), firstLines(t, 2));
        if (lang === 'Rust 2021') r.check('Rust가 내 PC에서 rustc --edition 2021 -O', /rustc --edition 2021 -O main\.rs/.test(t), firstLines(t, 2));
        if (lang === 'PyPy3') r.check('PyPy3가 내 PC에서 진짜 PyPy로 실행', /pypy3 main\.py\s+\(PyPy/.test(t) && /(^|\n)PyPy(\n|$)/.test(t), firstLines(t, 2));
      }
    });
  }
  await shot('02-run');

  await r.step('틀린 답 → 출력 비교', async () => {
    await selectLang(page, 'Python 3');
    await setCode(ext, 'a, b = map(int, input().split())\nprint(a - b)\n');
    const t = await runSamples(page);
    const table = await page.$('#cboj-panel table.tdiff tr.bad');
    r.check('틀린 답 → 출력 비교', /✘ 예제 1 — 틀림/.test(t) && /1번째 줄부터 달라요/.test(t) && !!table, firstLines(t, 3));
    await shot('03-wrong');
  });

  await r.step('컴파일 에러 표시', async () => {
    await selectLang(page, 'C++17');
    await setCode(ext, 'int main() { return x; }\n');
    const t = await runSamples(page);
    r.check('컴파일 에러 표시', /컴파일 에러/.test(t) && /'x' was not declared|x.*undeclared|not declared/.test(t), firstLines(t, 3));
  });

  await r.step('나만의 테스트케이스', async () => {
    await setCode(ext, AB['C++17']);
    await page.click('.cboj-tab[data-tab=cases]');
    await page.click('#cboj-panel .cboj-cases-head .cboj-btn');
    await wait(200);
    const tas = await page.$$('#cboj-panel .cboj-case-ta');
    await tas[0].type('40 2');
    await tas[1].type('42');
    await wait(500);
    const t = await runSamples(page);
    r.check('나만의 테스트케이스', /✔ 내 케이스 1 — 맞음/.test(t) && /예제 1개 \+ 내 케이스 1개/.test(t), firstLines(t, 1));
  });

  await r.step('터미널에서 직접 실행', async () => {
    await selectLang(page, 'Python 3');
    await setCode(ext, 'n = int(input())\nprint(n * 2)\nm = int(input())\nprint(m + 1)\n');
    await page.click('.cboj-tab[data-tab=term]').catch(() => {});
    const local = (await where(page)) === '● 내 PC';
    await markTerm(page);
    const until = (re, timeout) => page.waitForFunction((src) => {
      const e = document.querySelector('.cboj-term-out');
      const m = e.querySelector('#e2e-mark');
      let t = e.innerText;
      if (m) { const r = document.createRange(); r.setStartAfter(m); r.setEndAfter(e.lastChild); t = r.toString(); }
      return new RegExp(src).test(t);
    }, { timeout, polling: 200 }, re.source);
    if (local) {
      // VS Code 터미널처럼: 실행해 두고 입력할 때마다 바로 전달
      await page.click('#cboj-panel .cboj-btn.run.small');
      await page.waitForFunction(() => /실행 중/.test(document.querySelector('.cboj-status')?.textContent || ''), { timeout: 30000 });
      await page.focus('.cboj-term-in');
      await page.keyboard.type('21');
      await page.keyboard.press('Enter');
      await until(/42/, 15000);
      const mid = await termSince(page);
      await page.keyboard.type('1');
      await page.keyboard.press('Enter');
      await until(/정상 종료|✘/, 15000);
      const t = await termSince(page);
      r.check('터미널 실시간 입력 (내 PC)', /42/.test(mid) && !/정상 종료/.test(mid) && /(^|\n)2(\n|$)/.test(t) && /정상 종료/.test(t), firstLines(t.replace(/\n+/g, '\n'), 6));
    } else {
      await page.$eval('.cboj-term-in', (e) => { e.value = ''; });
      await page.type('.cboj-term-in', '21\n1');
      await page.click('#cboj-panel .cboj-btn.run.small');
      await until(/정상 종료|✘/, RUN_TIMEOUT);
      const t = await termSince(page);
      r.check('직접 입력으로 실행 (Wandbox)', /42\s+2/.test(t) && /정상 종료/.test(t), firstLines(t, 4));
    }
    await shot('04-terminal');
  });

  await r.step('자동완성 (점 뒤 목록)', async () => {
    await selectLang(page, 'C++17');
    await setCode(ext, '#include <bits/stdc++.h>\nusing namespace std;\nint main() {\n\tvector<int> v;\n\t\n}\n');
    await ext(() => { const cm = document.querySelector('#cboj-panel .CodeMirror').CodeMirror; cm.setCursor(4, 1); cm.focus(); });
    await page.keyboard.type('v.pu', { delay: 80 });
    await wait(400);
    const hints = await page.$$eval('#cboj-panel .CodeMirror-hint', (els) => els.map((e) => e.textContent));
    await page.keyboard.press('Enter');
    await wait(200);
    const line = await ext(() => document.querySelector('#cboj-panel .CodeMirror').CodeMirror.getLine(4));
    r.check('자동완성 (점 뒤 목록)', hints[0] === 'push_back' && line.trim() === 'v.push_back', `${hints.slice(0, 3).join(', ')} → ${line.trim()}`);
  });

  await r.step('엔터 자동 들여쓰기', async () => {
    await setCode(ext, 'int main() {\n\tswitch (x) {\n\tcase 1:');
    await ext(() => { const cm = document.querySelector('#cboj-panel .CodeMirror').CodeMirror; cm.setCursor(2, 8); cm.focus(); });
    await page.keyboard.press('Enter');
    await wait(150);
    const l3 = await ext(() => document.querySelector('#cboj-panel .CodeMirror').CodeMirror.getLine(3));
    r.check('엔터 자동 들여쓰기 (case 1: 다음)', l3 === '\t\t', JSON.stringify(l3));
  });

  await r.step('풀이 타이머', async () => {
    await page.click('.cboj-timer');
    await wait(2300);
    const t = await page.$eval('.cboj-timer', (e) => ({ text: e.textContent, cls: e.className }));
    await page.click('.cboj-timer');
    r.check('풀이 타이머', t.cls.includes('running') && t.text !== '⏱ 00:00', t.text);
  });

  await r.step('작성 중인 코드 저장 (새로고침 후)', async () => {
    const marker = `// e2e ${Date.now()}`;
    await setCode(ext, AB['C++17'] + marker + '\n');
    await ext(() => { const cm = document.querySelector('#cboj-panel .CodeMirror').CodeMirror; cm.setCursor(5, 3); });
    await page.keyboard.down('Control'); await page.keyboard.press('KeyS'); await page.keyboard.up('Control');
    await wait(1000);
    ext = await openProblem(page, 1000);
    const back = await ext(() => {
      const cm = document.querySelector('#cboj-panel .CodeMirror').CodeMirror;
      return { code: cm.getValue(), cur: cm.getCursor(), lang: document.querySelector('.cboj-lang').selectedOptions[0].textContent };
    });
    r.check('작성 중인 코드 저장 (새로고침 후)', back.code.includes(marker) && back.cur.line === 5 && back.lang === 'C++17', `${back.lang}, 커서 ${back.cur.line}:${back.cur.ch}`);
  });

  await r.step('제출 버튼 (로그인 안 됨)', async () => {
    await page.click('#cboj-panel .cboj-btn.submit');
    await wait(500);
    const card = await page.$eval('#cboj-panel .cboj-card', (e) => e.innerText);
    r.check('제출 버튼 (로그인 안 됨) → 로그인 안내', /로그인이 필요해요/.test(card), firstLines(card, 2));
  });

  // 팝업: 실행 위치 표시, 기본 코드 바꾸기 → 새 문제에 쓰이는지
  await r.step('팝업', async () => {
    const pop = await browser.newPage();
    await pop.setViewport({ width: 420, height: 900 });
    await pop.goto(`chrome-extension://${id}/popup/popup.html`, { waitUntil: 'domcontentloaded' });
    await pop.waitForFunction(() => !/확인 중/.test(document.getElementById('runnerState').textContent), { timeout: 15000 });
    const state = await pop.$eval('#runnerState', (e) => e.innerText.replace(/\s+/g, ' '));
    r.check('팝업 실행 위치 표시', mode === 'helper' ? /● 내 PC/.test(state) : /● Wandbox/.test(state), state);
    await pop.click('#tplLang button[data-lang=cpp]');
    await pop.$eval('#tplText', (e) => { e.value = '// my template\nint main() {\n\t$0\n}\n'; e.dispatchEvent(new Event('input')); });
    await pop.click('#tplSave');
    await wait(400);
    const saved = await pop.$eval('#tplState', (e) => e.textContent);
    await pop.screenshot({ path: path.join(OUT, `${mode}-05-popup.png`) });
    await pop.close();
    ext = await openProblem(page, 1001);
    await selectLang(page, 'C++17');
    const t = await ext(() => { const cm = document.querySelector('#cboj-panel .CodeMirror').CodeMirror; return { code: cm.getValue(), cur: cm.getCursor() }; });
    r.check('팝업에서 바꾼 기본 코드가 새 문제에 적용', saved === '저장했어요' && t.code.startsWith('// my template') && t.cur.line === 2, `${saved}, 커서 ${t.cur.line}:${t.cur.ch}`);
  });

  await browser.close();
  return r.rows;
}

// ───────── 실행 ─────────
const modes = process.argv[2] ? [process.argv[2]] : ['helper', 'store'];
const all = [];
for (const mode of modes) {
  const dir = mode === 'store' ? makeStoreCopy() : REPO;
  console.log(`\n=== ${mode} (${dir}) ===`);
  all.push(...(await scenario(mode, dir)));
}
const fail = all.filter((x) => !x.ok);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(all, null, 2));
console.log(`\n${all.length - fail.length}/${all.length} 통과` + (fail.length ? `\n실패:\n${fail.map((x) => `  [${x.mode}] ${x.name} — ${x.extra}`).join('\n')}` : ''));
process.exit(fail.length ? 1 : 0);
