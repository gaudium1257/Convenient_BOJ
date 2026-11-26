// 크롬 웹 스토어 등록용 이미지 만들기
//
// 실제 크롬에 확장을 설치하고 진짜 백준 문제 페이지에서 동작하는 화면을 찍은 뒤,
// 위에 한 줄 설명을 얹어 스토어 규격(1280×800)으로 만든다. 프로모션 타일(440×280)과 마키(1400×560)도 만든다.
//
// 실행: cd tests/e2e && node store-assets.mjs        → docs/store/ 에 저장
// 내 PC 실행 도우미가 설치돼 있어야 터미널 화면(3번)이 '내 PC'로 찍힌다.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const OUT = path.join(REPO, 'docs', 'store');
const RAW = path.join(HERE, 'out', 'store-raw');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BOJ = 'https://www.acmicpc.net';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(RAW, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: !process.env.HEADFUL,
  pipe: true,
  enableExtensions: true,
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'cboj-shots-')),
  args: ['--lang=ko-KR', '--hide-scrollbars'],
  defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
});
const extId = await browser.installExtension(REPO);
const page = await browser.newPage();

// ───────── 확장 콘텐츠 스크립트 공간에서 실행 (run.mjs 와 같은 방식) ─────────
async function extWorld() {
  const client = await page.createCDPSession();
  const contexts = new Map();
  client.on('Runtime.executionContextCreated', ({ context }) => contexts.set(context.id, context));
  client.on('Runtime.executionContextDestroyed', ({ executionContextId }) => contexts.delete(executionContextId));
  await client.send('Runtime.enable');
  const find = () => [...contexts.values()].find((c) => c.auxData && c.auxData.type === 'isolated' && /Convenient BOJ/.test(c.name));
  for (let i = 0; i < 100 && !find(); i++) await wait(100);
  return async (fn, ...args) => {
    const r = await client.send('Runtime.evaluate', {
      expression: `(${fn})(...${JSON.stringify(args)})`, contextId: find().id, awaitPromise: true, returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
}

async function openProblem(pid, settings = {}, bottom = 260) {
  await page.goto(`${BOJ}/problem/${pid}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.cboj-toggle', { timeout: 30000 });
  let ext = await extWorld();
  await ext((s) => chrome.storage.sync.set(s), { editorTheme: 'light', ...settings });
  await ext((b) => chrome.storage.local.set({ cbojLayout: { width: 50, bottom: b } }), bottom); // 결과 창 높이
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.cboj-toggle', { timeout: 30000 });
  ext = await extWorld();
  if (!(await page.$('#cboj-panel .CodeMirror'))) await page.click('.cboj-toggle');
  await page.waitForSelector('#cboj-panel .CodeMirror');
  await page.waitForFunction(() => !/확인 중/.test(document.querySelector('.cboj-where')?.textContent || ''), { timeout: 15000 }).catch(() => {});
  // 문제 영역을 맨 위로 (BOJ 헤더 대신 문제 본문이 보이게)
  await page.evaluate(() => { const t = document.querySelector('#problem_title, .page-header'); if (t) t.scrollIntoView(); window.scrollBy(0, -12); });
  return ext;
}

async function selectLang(name) {
  const value = await page.$$eval('.cboj-lang option', (opts, n) => (opts.find((o) => o.textContent === n) || {}).value, name);
  await page.select('.cboj-lang', value);
  await wait(400);
}
const setCode = (ext, code, line, ch) => ext((code, line, ch) => {
  const cm = document.querySelector('#cboj-panel .CodeMirror').CodeMirror;
  cm.setValue(code);
  cm.setCursor(line ?? cm.lineCount() - 1, ch ?? 0);
  cm.focus();
}, code, line, ch);

async function runAndWait() {
  await page.click('#cboj-panel .cboj-toolbar .cboj-btn.run');
  await page.waitForFunction(() => /맞았어요|개 중 \d+개 맞음|컴파일 에러/.test(document.querySelector('.cboj-term-out').innerText)
    && !document.querySelector('#cboj-panel .cboj-toolbar .cboj-btn.run').disabled, { timeout: 150000, polling: 300 });
  await wait(300);
}
const raw = async (name) => { const p = path.join(RAW, name + '.png'); await page.screenshot({ path: p }); return p; };

// ───────── 1) 분할 화면 + 예제 통과 (C++) ─────────
let ext = await openProblem(1000);
await selectLang('C++17');
await setCode(ext, '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n\tios::sync_with_stdio(false);\n\tcin.tie(nullptr);\n\n'
  + '\tint a, b;\n\tcin >> a >> b;\n\tcout << a + b << \'\\n\';\n\treturn 0;\n}\n', 9, 27);
await runAndWait();
const shot1 = await raw('1-split-run');

// ───────── 2) 틀린 답 → 줄 단위 비교 (Python, 여러 줄 예제) ─────────
ext = await openProblem(10950, {}, 380);
await selectLang('Python 3');
await setCode(ext, 'import sys\ninput = sys.stdin.readline\n\nt = int(input())\nfor _ in range(t):\n\ta, b = map(int, input().split())\n\tprint(a + b if a < 5 else a - b)\n', 6, 33);
await runAndWait();
await page.$eval('.cboj-term-out', (e) => { e.scrollTop = 0; });
const shot2 = await raw('2-wrong-diff');

// ───────── 3) 진짜 터미널 (내 PC 도우미, 어두운 테마) ─────────
ext = await openProblem(1000, { editorTheme: 'dark' });
await selectLang('Python 3');
await setCode(ext, 'total = 0\nwhile True:\n\tn = int(input("숫자 (0이면 끝): "))\n\tif n == 0:\n\t\tbreak\n\ttotal += n\n\tprint("지금까지 합:", total)\nprint("최종 합:", total)\n', 7, 20);
await page.click('.cboj-tab[data-tab=term]');
await wait(200);
await page.click('#cboj-panel .cboj-btn.run.small');
await page.waitForFunction(() => /실행 중/.test(document.querySelector('.cboj-status')?.textContent || ''), { timeout: 30000 });
await page.focus('.cboj-term-in');
for (const n of ['12', '30', '0']) {
  await page.keyboard.type(n, { delay: 40 });
  await page.keyboard.press('Enter');
  await wait(500);
}
await page.waitForFunction(() => /정상 종료/.test(document.querySelector('.cboj-term-out').innerText), { timeout: 15000 });
await page.$eval('.cboj-term-in', (e) => e.blur());
const shot3 = await raw('3-live-terminal');

// ───────── 4) 자동완성 (점 뒤 목록) ─────────
ext = await openProblem(1000);
await selectLang('C++17');
await setCode(ext, '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n\tint n;\n\tcin >> n;\n\tvector<int> v;\n\tfor (int i = 0; i < n; i++) {\n\t\tint x;\n\t\tcin >> x;\n\t\t\n\t}\n}\n', 10, 2);
await page.keyboard.type('v.', { delay: 80 });
await wait(500);
const shot4 = await raw('4-autocomplete');
await page.keyboard.press('Escape');

// ───────── 5) 팝업 설정 (실제 팝업 페이지) ─────────
const pop = await browser.newPage();
await pop.setViewport({ width: 380, height: 760, deviceScaleFactor: 1 });
await pop.goto(`chrome-extension://${extId}/popup/popup.html`, { waitUntil: 'domcontentloaded' });
await pop.waitForFunction(() => !/확인 중/.test(document.getElementById('runnerState').textContent), { timeout: 15000 });
await pop.click('#tplLang button[data-lang=java]');
await wait(300);
const popPath = path.join(RAW, '5-popup.png');
await pop.screenshot({ path: popPath, fullPage: false });
await pop.close();
// 팝업 옆에 둘 Rust 실행 화면
ext = await openProblem(1000);
await selectLang('Rust 2021');
await setCode(ext, 'use std::io::{self, Read, Write};\n\nfn main() {\n\tlet mut input = String::new();\n\tio::stdin().read_to_string(&mut input).unwrap();\n'
  + '\tlet mut it = input.split_ascii_whitespace();\n\tlet mut out = io::BufWriter::new(io::stdout().lock());\n\n'
  + '\tlet a: i64 = it.next().unwrap().parse().unwrap();\n\tlet b: i64 = it.next().unwrap().parse().unwrap();\n\twriteln!(out, "{}", a + b).unwrap();\n}\n', 10, 27);
await runAndWait();
const shot5bg = await raw('5-rust-run');

// ───────── 합성: 위에 설명 한 줄 + 아래 화면 ─────────
const dataUri = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
const icon = dataUri(path.join(REPO, 'icons', 'icon128.png'));
const thMark = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(REPO, 'icons', 'th-mark.svg')).toString('base64');
// 만든 사람(TH, gaudium1257.github.io) 브랜드 색
const BRAND = { ink: '#1c1626', from: '#8b5cf6', to: '#4c1d95', light: '#ddd6fe', soft: '#c4b5fd' };
const GRAD = `linear-gradient(135deg, ${BRAND.from}, ${BRAND.to})`;
const signature = (size = 15, color = BRAND.light) => `<div style="display:flex;align-items:center;gap:8px;font-size:${size}px;color:${color};white-space:nowrap">
  <img src="${thMark}" style="width:${Math.round(size * 1.6)}px;height:${Math.round(size * 1.6)}px;border-radius:${Math.round(size * 0.4)}px;box-shadow:0 0 0 1.5px rgba(255,255,255,.35)">
  <span>Made by <b style="color:#fff;font-weight:800">gaudium1257</b></span></div>`;
const canvas = await browser.newPage();
const FONT = `font-family: 'Pretendard', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;`;

async function render(file, width, height, body) {
  await canvas.setViewport({ width, height, deviceScaleFactor: 1 });
  await canvas.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; }
    body { width: ${width}px; height: ${height}px; overflow: hidden; ${FONT} }
  </style></head><body>${body}</body></html>`, { waitUntil: 'load' });
  await canvas.screenshot({ path: path.join(OUT, file), type: 'png' });
}

function captioned(title, sub, inner) {
  return `<div style="height:76px;background:${BRAND.ink};color:#fff;display:flex;align-items:center;gap:18px;padding:0 32px">
      <img src="${icon}" style="width:46px;height:46px;border-radius:11px;box-shadow:0 0 0 1.5px rgba(255,255,255,.25)">
      <div style="flex:1;min-width:0"><div style="font-size:25px;font-weight:800;letter-spacing:-0.5px">${title}</div>
      <div style="font-size:14.5px;color:${BRAND.soft};margin-top:3px">${sub}</div></div>
      ${signature(14)}</div>
    <div style="height:4px;background:linear-gradient(90deg, ${BRAND.from}, ${BRAND.to})"></div>
    <div style="height:720px;overflow:hidden;position:relative;background:#f6f4fa">${inner}</div>`;
}
const full = (p) => `<img src="${dataUri(p)}" style="display:block;width:1280px;height:720px">`;

await render('screenshot-1.png', 1280, 800, captioned('문제 옆에서 바로 코드 작성 · 실행', 'C · C++ · Java · Rust · Python · PyPy3 — 예제를 돌려 기대 출력과 비교해요', full(shot1)));
await render('screenshot-2.png', 1280, 800, captioned('틀리면 어느 줄이 다른지 한눈에', '예제 + 나만의 테스트케이스로 채점하고, 다른 줄을 강조해서 보여 줘요', full(shot2)));
await render('screenshot-3.png', 1280, 800, captioned('VS Code 같은 진짜 터미널', '내 PC 실행 도우미(선택)를 설치하면 실행 중에 입력을 주고받아요', full(shot3)));
await render('screenshot-4.png', 1280, 800, captioned('점(.)만 쳐도 뜨는 자동완성', '많이 쓰는 멤버부터 · 내 코드의 이름 먼저 · 글자를 건너뛰어도 찾아요', full(shot4)));
await render('screenshot-5.png', 1280, 800, captioned('백준과 같은 컴파일 옵션 · 버전으로 실행', '예: Rust는 rustc --edition 2021 -O · 언어별 기본 코드와 테마는 팝업에서 바꿔요', `${full(shot5bg)}
  <div style="position:absolute;left:0;top:0;width:640px;height:720px;background:rgba(15,23,42,.38)"></div>
  <img src="${dataUri(popPath)}" style="position:absolute;left:150px;top:22px;width:342px;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.4)">`));

// 작은 프로모션 타일 440×280
await render('promo-small-440x280.png', 440, 280, `<div style="width:440px;height:280px;background:${GRAD};color:#fff;padding:30px 30px 24px;display:flex;flex-direction:column;justify-content:space-between">
  <div style="display:flex;align-items:center;gap:14px"><img src="${icon}" style="width:60px;height:60px;border-radius:14px;box-shadow:0 0 0 2px rgba(255,255,255,.5),0 8px 20px rgba(28,22,38,.35)">
    <div style="font-size:30px;font-weight:800;letter-spacing:-0.5px;line-height:1.1">Convenient<br>BOJ</div></div>
  <div><div style="font-size:20px;font-weight:700;line-height:1.35">문제 · 코드 · 실행 · 제출을<br>한 화면에서</div></div>
  <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:${BRAND.light}"><span>백준 비공식 확장</span>${signature(12)}</div></div>`);

// 마키 1400×560 (선택)
await render('promo-marquee-1400x560.png', 1400, 560, `<div style="width:1400px;height:560px;background:${GRAD};color:#fff;display:flex;align-items:center;padding:0 70px;gap:56px">
  <div style="flex:0 0 470px">
    <div style="display:flex;align-items:center;gap:18px"><img src="${icon}" style="width:76px;height:76px;border-radius:17px;box-shadow:0 0 0 2px rgba(255,255,255,.5),0 10px 26px rgba(28,22,38,.35)">
      <div style="font-size:44px;font-weight:800;letter-spacing:-1px">Convenient BOJ</div></div>
    <div style="font-size:30px;font-weight:700;margin-top:30px;line-height:1.35">문제 · 코드 · 실행 · 제출을<br>한 화면에서</div>
    <div style="font-size:17px;color:${BRAND.light};margin-top:18px;line-height:1.6">C · C++ · Java · Rust · Python · PyPy3<br>백준과 같은 컴파일 옵션 · 실시간 채점 결과</div>
    <div style="margin-top:34px">${signature(16)}</div>
  </div>
  <img src="${dataUri(shot1)}" style="width:740px;border-radius:12px;box-shadow:0 20px 60px rgba(28,22,38,.45)"></div>`);

await browser.close();
console.log('saved to', OUT);
for (const f of fs.readdirSync(OUT)) console.log(' ', f);
