// Convenient BOJ — 채점 현황 페이지
// 분할 화면의 [제출]로 열린 제출 탭(B)에서만 동작한다.
// 1) 제출 직후 이 페이지가 열리면 포커스를 문제 탭(A)으로 돌려 달라고 백그라운드에 알린다.
// 2) B는 뒤에서 채점 결과를 읽어 storage로 A에 전달하고, 채점이 끝나면 백그라운드가 B를 닫는다.
(() => {
  if (globalThis.__cbojStatusLoaded) return;
  globalThis.__cbojStatusLoaded = true;
  const ext = globalThis.chrome;
  const FINAL = globalThis.CBOJ_FINAL;
  const parseRow = globalThis.cbojParseRow;
  const send = (msg) => Promise.resolve(ext.runtime.sendMessage(msg)).catch(() => ({}));

  send({ type: 'cboj:is-submit-window' }).then((r) => {
    if (!r || !r.isSubmitWindow) return;
    ext.storage.local.get({ cbojWatch: null }, ({ cbojWatch: w }) => {
      if (!w || Date.now() - w.at > 15 * 60 * 1000) return;
      send({ type: 'cboj:submitted' }); // A로 포커스 돌려주기
      watch(w);
    });
  });

  function watch(w) {
    let solId = sessionStorage.getItem('cbojSolId');
    let last = '';
    let lastChange = Date.now();

    const S = globalThis.CBOJ_SEL.status;
    const findRow = () => {
      if (solId) return document.getElementById(S.rowIdPrefix + solId);
      return [...document.querySelectorAll(S.rows)]
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
        send({ type: 'cboj:judge-done' }); // 백그라운드가 이 창을 닫는다
      }
    };

    const observer = new MutationObserver(tick);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] });
    // 실시간 갱신이 멈춘 것처럼 보이면 페이지를 다시 불러온다.
    const fallback = setInterval(() => {
      if (Date.now() - lastChange > 6000) location.reload();
    }, 2000);
    tick();
  }
})();
