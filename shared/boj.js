// 백준 채점 결과를 읽는 공통 함수 (status.js, split.js에서 사용)
globalThis.CBOJ_FINAL = Object.freeze(['ac', 'pac', 'wa', 'pe', 'tle', 'mle', 'ole', 'rte', 'ce']);

globalThis.cbojResultKey = (span, text) => {
  const FINAL = globalThis.CBOJ_FINAL;
  if (span) {
    for (const c of span.classList) {
      const m = /^result-(.+)$/.exec(c);
      if (m && m[1] !== 'text' && FINAL.includes(m[1])) return m[1];
    }
  }
  const rules = [
    [/맞았습니다/, 'ac'], [/출력 형식/, 'pe'], [/틀렸습니다/, 'wa'], [/시간 초과/, 'tle'],
    [/메모리 초과/, 'mle'], [/출력 초과/, 'ole'], [/런타임 에러/, 'rte'], [/컴파일 에러/, 'ce'],
    [/^\s*\d+(\.\d+)?\s*점/, 'pac'],
  ];
  for (const [re, k] of rules) if (re.test(text || '')) return k;
  return 'pending';
};

// 채점 현황 표의 한 줄:
// 제출 번호 | 아이디 | 문제 | 결과 | 메모리 | 시간 | (채점 서버) | 언어 | 코드 길이 | 제출한 시간
globalThis.cbojParseRow = (tr) => {
  const td = [...tr.querySelectorAll('td')];
  const span = tr.querySelector('.result-text');
  const txt = (el) => ((el || {}).textContent || '').trim();
  const text = (span ? span.textContent : txt(td[3])).trim();
  const langIdx = tr.querySelector('td.judge-platform') || td.length >= 10 ? 7 : 6;
  const mem = txt(tr.querySelector('td.memory') || td[4]);
  const time = txt(tr.querySelector('td.time') || td[5]);
  return {
    id: txt(td[0]),
    text,
    key: globalThis.cbojResultKey(span, text),
    memory: mem ? (/^\d+$/.test(mem) ? mem + ' KB' : mem) : '',
    time: time ? (/^\d+$/.test(time) ? time + ' ms' : time) : '',
    lang: txt(td[langIdx]),
  };
};
