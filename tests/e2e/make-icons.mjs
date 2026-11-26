// icons/icon.svg → icons/icon16·32·48·128.png (바깥은 투명)
// 실행: cd tests/e2e && node make-icons.mjs [미리보기.png]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ICONS = path.resolve(HERE, '..', '..', 'icons');
const svg = fs.readFileSync(path.join(ICONS, 'icon.svg'), 'utf8');
const uri = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
});
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent"><img src="${uri}" style="display:block;width:${size}px;height:${size}px"></body></html>`);
  await page.screenshot({ path: path.join(ICONS, `icon${size}.png`), omitBackground: true });
}

// 미리보기: 실제 크기 + TH 아이콘과 나란히
const preview = process.argv[2];
if (preview) {
  const th = process.argv[3] ? 'data:image/svg+xml;base64,' + fs.readFileSync(process.argv[3]).toString('base64') : '';
  await page.setViewport({ width: 560, height: 200, deviceScaleFactor: 2 });
  const img = (s) => `<img src="${uri}" style="width:${s}px;height:${s}px">`;
  await page.setContent(`<html><body style="margin:0;padding:24px;font:13px sans-serif;display:flex;gap:28px;align-items:end;background:#fff">
    ${img(128)}${img(48)}${img(32)}${img(16)}
    ${th ? `<span style="color:#888">TH →</span><img src="${th}" style="width:128px;height:128px">` : ''}
    <div style="background:#202124;padding:10px;display:flex;gap:10px;align-items:center">${img(16)}${img(32)}</div></body></html>`);
  await page.screenshot({ path: preview });
}
await browser.close();
console.log('icons written');
