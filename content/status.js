// Convenient BOJ — 채점 현황 페이지
// 분할 화면의 [제출]로 열린 창(이름: cboj-submit)에서만 동작한다.
// 백준이 이 페이지에서 결과를 실시간으로 갱신하면, 그 내용을 storage로 분할 화면에 알려 주고
// 채점이 끝나면 창을 닫는다.
(() => {
  if (window.name !== 'cboj-submit' || globalThis.__cbojStatusLoaded) return;
  globalThis.__cbojStatusLoaded = true;
  const ext = globalThis.__cbojChromeShim || globalThis.chrome;
  const FINAL = globalThis.CBOJ_FINAL;
  const parseRow = globalThis.cbojParseRow;

  ext.storage.local.get({ cbojWatch: null }, ({ cbojWatch: w }) => {
    if (!w || Date.now() - w.at > 15 * 60 * 1000) return;
    let solId = sessionStorage.getItem('cbojSolId');
    let last = '';
    let lastChange = Date.now();

    const findRow = () => {
      if (solId) return document.getElementById('solution-' + solId);
      return [...document.querySelectorAll('#status-table tbody tr')]
        .find((tr) => tr.querySelector(`a[href="/problem/${w.pid}"]`));
    };

    const tick = () => {
      const tr = findRow();
      if (!tr) return;
      const row = parseRow(tr);
      if (!solId) { solId = row.id; sessionStorage.setItem('cbojSolId', solId); }
      const sig = [row.text, row.memory, row.time].join('|');
      if (sig === last) return;
      last = sig;
      lastChange = Date.now();
      const done = FINAL.includes(row.key);
      ext.storage.local.set({ cbojJudge: { token: w.token, stage: done ? 'done' : 'judging', ...row } });
      if (done) {
        observer.disconnect();
        clearInterval(fallback);
        ext.storage.local.remove('cbojWatch');
        sessionStorage.removeItem('cbojSolId');
        setTimeout(() => window.close(), 1500);
      }
    };

    const observer = new MutationObserver(tick);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] });
    // 실시간 갱신이 멈춘 것처럼 보이면 페이지를 다시 불러온다.
    const fallback = setInterval(() => {
      if (Date.now() - lastChange > 6000) location.reload();
    }, 2000);
    tick();
  });
})();
