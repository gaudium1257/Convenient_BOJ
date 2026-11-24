// 백준 냥이 — 팝업 설정 화면
(() => {
  'use strict';
  // 데모 페이지의 iframe 안에서는 부모 창의 가짜 chrome API를 쓴다.
  const ext = (globalThis.chrome && chrome.storage)
    ? chrome
    : (window.parent !== window && window.parent.__bojKittyChromeShim);
  const DEFAULTS = globalThis.BOJ_KITTY_DEFAULTS;
  const FURS = globalThis.BOJ_KITTY_FURS;
  const STRIPES = { cheese: '#E0842A', mackerel: '#5E6670' };
  const LEVELS = [
    [0, '낯가리는 중'], [10, '슬쩍 다가옴'], [30, '꼬리 세우는 사이'],
    [80, '골골송 단짝'], [200, '공식 집사'], [500, '평생 집사'],
  ];
  const TAGLINES = ['오늘도 같이 AC 받자냥', '틀려도 괜찮다냥', '쉬엄쉬엄 풀자냥', '반례는 늘 가까이 있다냥', '골드 가자냥!'];

  const $ = (s) => document.querySelector(s);
  let s = { ...DEFAULTS };

  $('#tagline').textContent = TAGLINES[Math.floor(Math.random() * TAGLINES.length)];

  function save(patch) {
    Object.assign(s, patch);
    ext.storage.sync.set(patch);
    render();
  }

  function render() {
    $('#enabled').checked = !!s.enabled;
    document.body.classList.toggle('off', !s.enabled);
    document.querySelectorAll('.seg').forEach((seg) => {
      const k = seg.dataset.key;
      seg.querySelectorAll('button').forEach((b) => {
        b.setAttribute('aria-pressed', String(String(b.dataset.v) === String(s[k])));
      });
    });
    document.querySelectorAll('.toggle input').forEach((inp) => { inp.checked = !!s[inp.dataset.key]; });
    document.querySelectorAll('select.pick').forEach((sel) => { sel.value = s[sel.dataset.key]; });
    renderFurRows();
  }

  function renderFurRows() {
    const wrap = $('#furRows');
    wrap.textContent = '';
    for (let i = 0; i < s.count; i++) {
      const current = (s.colors && s.colors[i]) || DEFAULTS.colors[i];
      const row = document.createElement('div');
      row.className = 'fur-row';
      const who = document.createElement('span');
      who.className = 'who';
      const name = (FURS.find((f) => f.id === current) || FURS[0]).name;
      who.innerHTML = `${i + 1}번 <b></b>`;
      who.querySelector('b').textContent = name;
      const chips = document.createElement('div');
      chips.className = 'chips';
      for (const f of FURS) {
        const b = document.createElement('button');
        b.className = 'chip' + (STRIPES[f.id] ? ' stripe' : '');
        b.style.setProperty('--c', f.fur);
        b.style.setProperty('--o', f.outline);
        if (STRIPES[f.id]) b.style.setProperty('--s', STRIPES[f.id]);
        b.title = f.name;
        b.setAttribute('aria-label', `${i + 1}번 냥이 ${f.name}`);
        b.setAttribute('aria-pressed', String(f.id === current));
        b.addEventListener('click', () => {
          const colors = [...(s.colors || DEFAULTS.colors)];
          while (colors.length < 3) colors.push(DEFAULTS.colors[colors.length]);
          colors[i] = f.id;
          save({ colors });
        });
        chips.appendChild(b);
      }
      row.append(who, chips);
      wrap.appendChild(row);
    }
  }

  function renderBond(n) {
    n = n | 0;
    let i = 0;
    while (i + 1 < LEVELS.length && n >= LEVELS[i + 1][0]) i++;
    const [lo, name] = LEVELS[i];
    const hi = LEVELS[i + 1] && LEVELS[i + 1][0];
    const pct = hi ? ((n - lo) / (hi - lo)) * 100 : 100;
    $('#bondLevel').textContent = name;
    $('#bondCount').textContent = n;
    $('#bondBar').style.width = pct.toFixed(1) + '%';
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  async function poke(type, okMsg) {
    if (!s.enabled) { toast('냥이가 꺼져 있어요. 스위치를 켜주세요'); return; }
    try {
      const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
      const res = await ext.tabs.sendMessage(tab.id, { type });
      if (res && res.enabled === false) toast('냥이가 꺼져 있어요. 스위치를 켜주세요');
      else toast(okMsg);
    } catch {
      toast('백준(acmicpc.net) 탭에서 눌러주세요냥');
    }
  }

  // 이벤트
  $('#enabled').addEventListener('change', (e) => save({ enabled: e.target.checked }));
  document.querySelectorAll('.seg').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const k = seg.dataset.key;
      save({ [k]: k === 'count' ? Number(b.dataset.v) : b.dataset.v });
    });
  });
  document.querySelectorAll('.toggle input').forEach((inp) => {
    inp.addEventListener('change', () => save({ [inp.dataset.key]: inp.checked }));
  });
  document.querySelectorAll('select.pick').forEach((sel) => {
    sel.addEventListener('change', () => save({ [sel.dataset.key]: sel.value }));
  });
  $('#churu').addEventListener('click', () => poke('boj-kitty:churu', '츄르 배달 완료! 🍡'));
  $('#party').addEventListener('click', () => poke('boj-kitty:party', '축하 리액션 미리보기 🎉'));

  // 불러오기
  ext.storage.sync.get(DEFAULTS, (v) => { s = { ...DEFAULTS, ...v }; render(); });
  ext.storage.local.get({ affection: 0 }, (v) => renderBond(v.affection));
  ext.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.affection) renderBond(changes.affection.newValue);
  });
  render();
})();
