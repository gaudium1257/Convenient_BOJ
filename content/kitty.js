// 백준 냥이 — 백준 화면 아래를 돌아다니는 고양이
(() => {
  'use strict';
  if (globalThis.__bojKittyLoaded) return;
  globalThis.__bojKittyLoaded = true;

  // 데모 페이지에서는 가짜 chrome API(shim)를 쓴다. 실제 확장에서는 chrome.
  const ext = globalThis.__bojKittyChromeShim || globalThis.chrome;
  const DEFAULTS = globalThis.BOJ_KITTY_DEFAULTS;
  const FUR_IDS = (globalThis.BOJ_KITTY_FURS || []).map((f) => f.id);
  if (!ext || !ext.storage || !DEFAULTS) return;

  const BASE_W = 74;
  const SIZES = { small: 0.78, medium: 1, large: 1.28 };
  const SPEEDS = { slow: 26, normal: 44, fast: 70 };
  const GRAVITY = 2300;
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const nowS = () => performance.now() / 1000;
  const alive = () => {
    try { return !!(ext.runtime && ext.runtime.id); } catch { return false; }
  };
  const weighted = (entries) => {
    let total = 0;
    for (const [, w] of entries) total += w;
    let r = Math.random() * total;
    for (const [v, w] of entries) if ((r -= w) <= 0) return v;
    return entries[0][0];
  };

  // ───────── 고양이 그림 (오른쪽을 보는 옆모습, viewBox 100×80) ─────────
  const CAT_SVG = `
<svg class="kitty" viewBox="0 0 100 80" xmlns="http://www.w3.org/2000/svg">
  <ellipse class="shadow" cx="50" cy="76.5" rx="28" ry="3.2"/>
  <g class="rig">
    <g class="tail">
      <path class="tail-o" d="M28 54 C 15 54, 8 43, 11 28"/>
      <path class="tail-f" d="M28 54 C 15 54, 8 43, 11 28"/>
      <path class="tail-s" d="M28 54 C 15 54, 8 43, 11 28"/>
    </g>
    <g class="legs-far">
      <rect class="leg leg-bf" x="35" y="56" width="8" height="19" rx="4"/>
      <rect class="leg leg-ff" x="64" y="56" width="8" height="19" rx="4"/>
    </g>
    <g class="torso">
      <ellipse class="body" cx="48" cy="52" rx="26" ry="15"/>
      <ellipse class="belly" cx="52" cy="60" rx="15" ry="5.5"/>
      <path class="stripe" d="M38 40 q2.5 5 0 10 M46 37.6 q2.5 5.5 0 11 M54 38.2 q2.5 5 0 10"/>
    </g>
    <g class="legs-near">
      <rect class="leg leg-bn" x="28" y="57" width="8" height="18" rx="4"/>
      <rect class="leg leg-fn" x="57" y="57" width="8" height="18" rx="4"/>
    </g>
    <g class="head">
      <path class="ear" d="M60 28 L61.5 11 L73 22 Z"/>
      <path class="ear" d="M76 22 L87.5 11 L89 29 Z"/>
      <path class="ear-in" d="M63 24.5 L63.8 15.5 L70 21.5 Z"/>
      <path class="ear-in" d="M79 21.5 L85.5 15.5 L86.5 25.5 Z"/>
      <circle class="skull" cx="74" cy="36" r="17"/>
      <path class="stripe thin" d="M70 20 l1.2 5 M74 19 v6 M78 20 l-1.2 5"/>
      <ellipse class="muzzle" cx="74" cy="44" rx="8.5" ry="5.5"/>
      <ellipse class="cheek" cx="63.5" cy="42.5" rx="3.2" ry="2"/>
      <ellipse class="cheek" cx="84.5" cy="42.5" rx="3.2" ry="2"/>
      <g class="look"><g class="eyes-open">
        <g class="eye"><ellipse class="iris" cx="68" cy="37" rx="2.6" ry="3.3"/><ellipse class="pupil" cx="68" cy="37.3" rx="1.2" ry="2.4"/><circle class="glint" cx="68.9" cy="35.8" r=".95"/></g>
        <g class="eye"><ellipse class="iris" cx="80" cy="37" rx="2.6" ry="3.3"/><ellipse class="pupil" cx="80" cy="37.3" rx="1.2" ry="2.4"/><circle class="glint" cx="80.9" cy="35.8" r=".95"/></g>
      </g></g>
      <path class="fl eyes-closed" d="M65 36.5 Q68 39.5 71 36.5 M77 36.5 Q80 39.5 83 36.5"/>
      <path class="fl eyes-happy" d="M65 38.5 Q68 34.5 71 38.5 M77 38.5 Q80 34.5 83 38.5"/>
      <path class="fl brows-angry" d="M64.5 31.5 L71 33.8 M83.5 31.5 L77 33.8"/>
      <path class="fl brows-sad" d="M64.8 33.8 L70.8 31.6 M83.2 33.8 L77.2 31.6"/>
      <path class="nose" d="M72.4 41.2 h3.2 l-1.6 1.9 Z"/>
      <path class="mouth mouth-w" d="M74 43.1 v.9 M71 44 q1.5 1.8 3 0 q1.5 1.8 3 0"/>
      <ellipse class="mouth-open" cx="74" cy="45.6" rx="1.8" ry="2"/>
      <path class="mouth mouth-frown" d="M71.2 46.4 q2.8 -2 5.6 0"/>
      <path class="whisker" d="M61 42 L51 40 M61 44.5 L51 45.5 M87 42 L97 40 M87 44.5 L97 45.5"/>
    </g>
  </g>
  <ellipse class="hit" cx="52" cy="46" rx="40" ry="31"/>
</svg>`;

  // 상태 → [자세, 표정]
  const STATES = {
    walk: ['walk', 'normal'],
    run: ['run', 'normal'],
    idle: ['stand', 'normal'],
    loaf: ['loaf', 'normal'],
    sleep: ['loaf', 'closed'],
    stretch: ['stretch', 'closed'],
    purr: ['loaf', 'closed'],
    happy: ['stand', 'happy'],
    wonder: ['stand', 'surprised'],
    angry: ['stand', 'angry'],
    sad: ['stand', 'sad'],
    eat: ['eat', 'happy'],
    greet: ['stand', 'happy'],
    held: ['held', 'surprised'],
    air: ['jump', 'surprised'],
    hop: ['jump', 'happy'],
  };
  const AIRBORNE = new Set(['held', 'air', 'hop']);
  const LOOKING_FACES = new Set(['normal', 'surprised', 'angry', 'sad']);

  // ───────── 무대 (Shadow DOM으로 백준 CSS와 격리) ─────────
  const host = document.createElement('div');
  host.id = 'boj-kitty-root';
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText =
    'all:initial;position:fixed;left:0;right:0;bottom:0;height:0;z-index:2147483000;pointer-events:none;visibility:hidden;';
  const shadow = host.attachShadow({ mode: 'open' });
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = ext.runtime.getURL('content/kitty.css');
  const reveal = () => { host.style.visibility = 'visible'; };
  css.addEventListener('load', reveal);
  css.addEventListener('error', reveal);
  const stage = document.createElement('div');
  stage.className = 'stage';
  shadow.append(css, stage);
  document.documentElement.appendChild(host);

  const VIEW = { w: 0, h: 0 };
  let reserveRight = 0; // 분할 화면이 열려 있으면 그 너비만큼은 피해서 걷는다
  const measure = () => {
    VIEW.w = Math.max(200, (document.documentElement.clientWidth || innerWidth) - reserveRight);
    VIEW.h = innerHeight;
  };
  measure();

  const mouse = { x: -9999, y: -9999, t: -1e9 };
  addEventListener('pointermove', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.t = nowS();
  }, { passive: true, capture: true });

  let settings = { ...DEFAULTS };
  const cats = [];

  // ───────── 친밀도 저장 (모아서 한 번에) ─────────
  let affPending = 0;
  let affTimer = 0;
  function addAffection(n) {
    affPending += n;
    if (affTimer) return;
    affTimer = setTimeout(() => {
      affTimer = 0;
      const add = affPending;
      affPending = 0;
      if (!alive()) return;
      try {
        ext.storage.local.get({ affection: 0 }, (r) => {
          try { ext.storage.local.set({ affection: (r.affection | 0) + add }); } catch { /* 확장이 다시 로드됨 */ }
        });
      } catch { /* 확장이 다시 로드됨 */ }
    }, 800);
  }

  // ───────── 화면 효과 ─────────
  function fx(cls, text, x, y, vars) {
    const d = document.createElement('div');
    d.className = 'fx ' + cls;
    d.textContent = text;
    d.style.left = x + 'px';
    d.style.bottom = y + 'px';
    if (vars) for (const k in vars) d.style.setProperty('--' + k, vars[k]);
    stage.appendChild(d);
    const kill = () => d.remove();
    d.addEventListener('animationend', kill, { once: true });
    setTimeout(kill, 3000);
  }
  function hearts(x, y, n = 1) {
    for (let i = 0; i < n; i++) {
      setTimeout(() => fx('heart', '♥', x + rand(-8, 8), y, { dx: rand(-14, 14).toFixed(1) + 'px' }), i * 150);
    }
  }
  function confetti(x, y) {
    if (REDUCED) return;
    const colors = ['#FF6B8B', '#FFC145', '#5BC0EB', '#9BE564', '#B28DFF', '#FF9F5A'];
    for (let i = 0; i < 22; i++) {
      const a = rand(-Math.PI * 0.92, -Math.PI * 0.08);
      const sp = rand(50, 140);
      fx('confetti', '', x, y, {
        dx: (Math.cos(a) * sp).toFixed(1) + 'px',
        dy: (Math.sin(a) * sp).toFixed(1) + 'px',
        rot: Math.round(rand(-540, 540)) + 'deg',
        c: pick(colors),
      });
    }
  }

  // ───────── 고양이 ─────────
  class Cat {
    constructor(index, fur, scale) {
      this.index = index;
      this.el = document.createElement('div');
      this.el.className = 'cat';
      this.el.innerHTML =
        `<div class="bubble"><span></span></div><div class="flip"><div class="squash">${CAT_SVG}<div class="churu"></div></div></div>`;
      this.bubble = this.el.querySelector('.bubble');
      this.bubbleText = this.bubble.firstChild;
      this.flipEl = this.el.querySelector('.flip');
      this.squashEl = this.el.querySelector('.squash');
      this.hit = this.el.querySelector('.hit');
      stage.appendChild(this.el);

      this.setFur(fur);
      this.setScale(scale);
      this.x = rand(0, this.maxX);
      this.y = 0;
      this.vx = 0;
      this.vy = 0;
      this.dir = Math.random() < 0.5 ? 1 : -1;
      this.drawnDir = 0;
      this.pose = this.face = this.st = null;
      this.state = null;
      this.stateT = 0;
      this.next = null;
      this.hopsLeft = 0;
      this.hopV = 0;
      this.afterHop = null;
      this.clickTimes = [];
      this.petDist = 0;
      this.cool = {};
      this.fxT = 0;
      this.bubbleT = 0;
      this.bubbleW = 0;
      this.shift = 0;
      this.look = '';
      this.press = null;
      this.dragging = false;
      this.samples = [];

      this.onDown = this.onDown.bind(this);
      this.onMove = this.onMove.bind(this);
      this.onUp = this.onUp.bind(this);
      this.onHover = this.onHover.bind(this);
      this.onLeave = () => { this.petDist = 0; };
      this.hit.addEventListener('pointerdown', this.onDown);
      this.hit.addEventListener('pointermove', this.onHover);
      this.hit.addEventListener('pointerleave', this.onLeave);

      this.setState('walk', rand(2, 6));
      this.render();
    }

    get maxX() { return Math.max(0, VIEW.w - this.w); }
    get headX() { return this.x + (this.dir > 0 ? 0.74 : 0.26) * this.w; }
    get headY() { return this.y + this.h * 0.78; }
    get centerX() { return this.x + this.w / 2; }

    setFur(f) {
      for (const id of FUR_IDS) this.el.classList.remove('fur-' + id);
      this.el.classList.add('fur-' + (FUR_IDS.includes(f) ? f : 'cheese'));
    }
    setScale(s) {
      this.w = BASE_W * s;
      this.h = this.w * 0.8;
      this.el.style.setProperty('--w', this.w + 'px');
    }
    clampX() { this.x = clamp(this.x, 0, this.maxX); }

    setState(name, dur, opts = {}) {
      const [pose, face] = STATES[name];
      this.state = name;
      this.stateT = dur;
      this.fxT = 0.4;
      this.swap('pose', opts.pose || pose);
      this.swap('face', opts.face || face);
      this.swap('st', name);
    }
    swap(kind, value) {
      if (this[kind] === value) return;
      if (this[kind]) this.el.classList.remove(kind + '-' + this[kind]);
      this.el.classList.add(kind + '-' + value);
      this[kind] = value;
    }
    setFace(face) { this.swap('face', face); }

    say(text, dur = 1.9) {
      this.bubbleText.textContent = text;
      this.bubble.classList.add('show');
      this.bubbleT = dur;
      this.bubbleW = this.bubble.offsetWidth;
    }

    faceToward(cx) { this.dir = cx >= this.centerX ? 1 : -1; }

    cooled(key, sec) {
      const t = nowS();
      if (t - (this.cool[key] || -1e9) < sec) return false;
      this.cool[key] = t;
      return true;
    }

    hop(v, face = 'happy', count = 1, after = 'idle') {
      if (this.dragging) return;
      this.hopV = v;
      this.hopsLeft = count - 1;
      this.afterHop = after;
      this.vy = v;
      this.y = Math.max(this.y, 0.01);
      this.setState('hop', 99, { face });
    }

    land(impact) {
      this.clampX();
      this.squashEl.classList.remove('land');
      void this.squashEl.offsetWidth; // 애니메이션 재시작
      this.squashEl.classList.add('land');
      if (this.state === 'hop') {
        if (this.hopsLeft > 0) {
          this.hopsLeft--;
          this.vy = this.hopV;
          this.y = 0.01;
          return;
        }
        this.setState(this.afterHop || 'idle', 1.3);
        return;
      }
      if (impact > 1050) {
        this.say(pick(['휴, 살았다냥…', '깜짝 놀랐다냥!', '착지 성공이다냥!']));
        this.setState('wonder', 1.5);
      } else {
        this.setState('idle', 0.9);
      }
    }

    decide() {
      if (this.next) {
        const n = this.next;
        this.next = null;
        if (n.dir) this.dir = n.dir;
        this.setState(n.state, n.dur);
        return;
      }
      if (isQuiet()) {
        this.setState(Math.random() < 0.55 ? 'loaf' : 'sleep', rand(5, 9));
        return;
      }
      if (this.state === 'sleep') {
        this.setState('stretch', 1.8);
        if (Math.random() < 0.35) this.say('하암~', 1.4);
        return;
      }
      if (this.state === 'stretch') {
        this.setState('walk', rand(3, 7));
        return;
      }
      const s = weighted([['walk', 46], ['idle', 14], ['loaf', 14], ['sleep', 7], ['stretch', 6], ['run', 5]]);
      const dur = {
        walk: rand(3, 9), idle: rand(1.5, 4), loaf: rand(5, 12),
        sleep: rand(12, 25), stretch: 1.8, run: rand(1.2, 2.4),
      }[s];
      if ((s === 'walk' || s === 'run') && Math.random() < 0.35) this.dir *= -1;
      this.setState(s, dur);
    }

    calmDown() {
      if (['walk', 'run', 'idle', 'stretch', 'happy', 'wonder', 'greet'].includes(this.state)) {
        this.setState('loaf', rand(4, 7));
      }
    }

    // ── 입력 처리 ──
    onDown(e) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      this.press = { x: e.clientX, y: e.clientY, id: e.pointerId };
      this.samples = [];
      addEventListener('pointermove', this.onMove, true);
      addEventListener('pointerup', this.onUp, true);
      addEventListener('pointercancel', this.onUp, true);
    }

    onMove(e) {
      if (!this.press || e.pointerId !== this.press.id) return;
      if (!this.dragging && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > 6) this.startDrag();
      if (!this.dragging) return;
      e.preventDefault();
      this.dragTo(e.clientX, e.clientY);
      const t = performance.now();
      this.samples.push({ x: e.clientX, y: e.clientY, t });
      while (this.samples.length > 2 && t - this.samples[0].t > 90) this.samples.shift();
    }

    startDrag() {
      this.dragging = true;
      this.vx = this.vy = 0;
      this.hopsLeft = 0;
      this.next = null;
      this.el.classList.add('dragging');
      this.prevCursor = document.documentElement.style.cursor;
      document.documentElement.style.cursor = 'grabbing';
      this.setState('held', 99);
      this.say(pick(['냐앗?!', '어디 가냥?!', '내려달라냥!', '높다냥…!']), 1.6);
    }

    dragTo(cx, cy) {
      // 목덜미(머리 뒤쪽 위)를 잡고 있는 위치
      const gx = (this.dir > 0 ? 0.64 : 0.36) * this.w;
      this.x = clamp(cx - gx, -this.w * 0.3, VIEW.w - this.w * 0.7);
      this.y = clamp(VIEW.h - cy - this.h * 0.7, 0, VIEW.h - this.h);
    }

    onUp(e) {
      if (!this.press || e.pointerId !== this.press.id) return;
      removeEventListener('pointermove', this.onMove, true);
      removeEventListener('pointerup', this.onUp, true);
      removeEventListener('pointercancel', this.onUp, true);
      this.press = null;
      if (!this.dragging) { this.onClick(e); return; }

      this.dragging = false;
      this.el.classList.remove('dragging');
      document.documentElement.style.cursor = this.prevCursor || '';
      let vx = 0, vy = 0;
      const s = this.samples;
      if (s.length >= 2 && performance.now() - s[s.length - 1].t < 120) {
        const a = s[0], b = s[s.length - 1];
        const dt = (b.t - a.t) / 1000;
        if (dt > 0) { vx = (b.x - a.x) / dt; vy = -(b.y - a.y) / dt; }
      }
      this.vx = clamp(vx, -1400, 1400);
      this.vy = clamp(vy, -800, 1300);
      if (Math.abs(this.vx) > 900 || this.vy > 900) this.say('으아아냥~!', 1.4);
      if (this.y > 1 || this.vy > 0) {
        this.y = Math.max(this.y, 0.01);
        this.setState('air', 99);
      } else {
        this.y = 0; this.vy = 0; this.vx = 0;
        this.land(0);
      }
    }

    onClick(e) {
      const t = nowS();
      this.clickTimes = this.clickTimes.filter((c) => t - c < 2.2);
      this.clickTimes.push(t);
      if (AIRBORNE.has(this.state)) return;
      this.faceToward(e.clientX);

      if (this.clickTimes.length >= 5) {
        this.clickTimes = [];
        this.getAngry(e.clientX);
        return;
      }
      if (this.state === 'angry') { this.say('흥! 😾', 1.2); return; }
      if (this.cooled('clickAff', 1.2)) addAffection(1);

      if (this.state === 'sleep') {
        if (Math.random() < 0.5) {
          this.say(pick(['…냥? 😪', '5분만 더 잘래냥…']), 1.8);
          this.stateT += 3;
        } else {
          this.say('깼다냥!', 1.4);
          this.setState('wonder', 1.3);
        }
        return;
      }

      switch (Math.floor(Math.random() * 6)) {
        case 0:
          this.hop(340, 'happy');
          this.say(pick(['냥!', '냥냥!']), 1.3);
          hearts(this.headX, this.headY, 1);
          break;
        case 1:
          this.setState('happy', 1.6);
          this.say(pick(['냐앙~ ♪', '좋다냥~', '헤헤냥']), 1.6);
          hearts(this.headX, this.headY, 2);
          break;
        case 2:
          this.setState('wonder', 1.4);
          this.say(pick(['뭐냥?', '왜 불렀냥?', '응냥?']), 1.5);
          break;
        case 3:
          this.setState('purr', 2.4);
          this.say('골골골…', 1.8);
          hearts(this.headX, this.headY, 1);
          break;
        case 4:
          this.setState('idle', 1.8, { face: 'happy' });
          this.say(pick(['오늘도 화이팅냥!', 'AC 받자냥!', '문제 잘 풀려냥?', '반례 찾아줄까냥?', '물 마시고 하자냥']), 2.2);
          break;
        default:
          this.setState('stretch', 1.6);
          this.say('으라차차냥~', 1.5);
      }
    }

    getAngry(cx) {
      this.setState('angry', 1.2);
      this.say('그만 눌러냥! 💢', 1.7);
      fx('angry-mark', '💢', this.headX, this.headY + 6);
      this.next = { state: 'run', dur: 1.8, dir: cx > this.centerX ? -1 : 1 };
    }

    onHover(e) {
      if (this.press || this.dragging) return;
      if (AIRBORNE.has(this.state) || ['angry', 'eat', 'hop'].includes(this.state)) return;
      this.petDist += Math.hypot(e.movementX || 0, e.movementY || 0);
      if (this.petDist < 220) return;
      if (this.state !== 'purr') {
        this.setState('purr', 2.2);
        this.say(pick(['골골골… 💕', '거기 좋다냥…', '더 쓰다듬어냥']), 1.8);
      } else {
        this.stateT = Math.max(this.stateT, 1.6);
      }
      if (this.cooled('petHeart', 0.55)) hearts(this.headX, this.headY, 1);
      if (this.cooled('petAff', 3)) addAffection(1);
    }

    // ── 매 프레임 ──
    update(dt) {
      if (this.bubbleT > 0 && (this.bubbleT -= dt) <= 0) this.bubble.classList.remove('show');
      if (this.dragging) { this.render(); return; }

      if (this.y > 0 || this.vy > 0) {
        this.vy -= GRAVITY * dt;
        this.y += this.vy * dt;
        this.x += this.vx * dt;
        this.vx *= Math.pow(0.55, dt);
        if (this.x < 0) { this.x = 0; this.vx = Math.abs(this.vx) * 0.4; }
        else if (this.x > this.maxX) { this.x = this.maxX; this.vx = -Math.abs(this.vx) * 0.4; }
        const top = VIEW.h - this.h;
        if (this.y > top) { this.y = top; this.vy = Math.min(this.vy, 0); }
        if (this.y <= 0) {
          const impact = -this.vy;
          this.y = 0; this.vy = 0; this.vx = 0;
          this.land(impact);
        }
      } else {
        if (this.state === 'walk' || this.state === 'run') {
          const sp = (SPEEDS[settings.speed] || 44) * (this.state === 'run' ? 3 : 1) * (this.w / BASE_W);
          this.x += this.dir * sp * dt;
          if (this.x <= 0) { this.x = 0; this.dir = 1; }
          else if (this.x >= this.maxX) { this.x = this.maxX; this.dir = -1; }
        }
        if (!AIRBORNE.has(this.state)) {
          this.stateT -= dt;
          if (this.stateT <= 0) this.decide();
        }
      }

      this.fxT -= dt;
      if (this.fxT <= 0) {
        if (this.state === 'sleep') {
          fx('zzz', pick(['z', 'Z']), this.headX + 6 * this.dir, this.headY + 4);
          this.fxT = 1.5;
        } else if (this.state === 'eat') {
          hearts(this.headX, this.headY, 1);
          this.fxT = 0.9;
        } else {
          this.fxT = 0.5;
        }
      }
      this.render();
    }

    render() {
      this.el.style.transform = `translate3d(${this.x.toFixed(1)}px, ${(-this.y).toFixed(1)}px, 0)`;
      if (this.dir !== this.drawnDir) {
        this.flipEl.classList.toggle('left', this.dir < 0);
        this.drawnDir = this.dir;
      }

      // 말풍선이 화면 밖으로 나가지 않게
      if (this.bubbleT > 0) {
        const half = this.bubbleW / 2;
        const c = this.centerX;
        const shift = Math.round(clamp(c, half + 6, VIEW.w - half - 6) - c);
        if (shift !== this.shift) {
          this.shift = shift;
          this.bubble.style.setProperty('--shift', shift + 'px');
        }
      }

      // 눈동자가 커서를 따라봄
      let lx = 0, ly = 0;
      if (settings.eyeFollow && LOOKING_FACES.has(this.face) && nowS() - mouse.t < 8) {
        const ex = this.headX;
        const ey = VIEW.h - this.y - this.h * (1 - 37 / 80);
        const dx = mouse.x - ex, dy = mouse.y - ey;
        const dist = Math.hypot(dx, dy);
        if (dist > 1 && dist < 480) {
          const k = Math.min(1, dist / 60);
          lx = (dx / dist) * 1.6 * k * this.dir;
          ly = (dy / dist) * 1.2 * k;
        }
      }
      const look = lx.toFixed(1) + ',' + ly.toFixed(1);
      if (look !== this.look) {
        this.look = look;
        this.el.style.setProperty('--lx', lx.toFixed(1) + 'px');
        this.el.style.setProperty('--ly', ly.toFixed(1) + 'px');
      }
    }

    destroy() {
      removeEventListener('pointermove', this.onMove, true);
      removeEventListener('pointerup', this.onUp, true);
      removeEventListener('pointercancel', this.onUp, true);
      if (this.dragging) document.documentElement.style.cursor = this.prevCursor || '';
      this.el.remove();
    }
  }

  // ───────── 고양이끼리 마주치면 인사 ─────────
  let meetCooldown = 0;
  function checkMeet(t) {
    if (cats.length < 2 || t < meetCooldown) return;
    for (let i = 0; i < cats.length; i++) {
      for (let j = i + 1; j < cats.length; j++) {
        const [l, r] = cats[i].x < cats[j].x ? [cats[i], cats[j]] : [cats[j], cats[i]];
        if (l.state !== 'walk' || r.state !== 'walk' || l.dir !== 1 || r.dir !== -1) continue;
        const gap = (r.x + 0.12 * r.w) - (l.x + 0.88 * l.w);
        if (gap > 4) continue;
        meetCooldown = t + 25;
        l.setState('greet', 2.2);
        r.setState('greet', 2.2);
        l.next = { state: 'walk', dur: rand(3, 6), dir: -1 };
        r.next = { state: 'walk', dur: rand(3, 6), dir: 1 };
        l.say('냥?', 1.3);
        setTimeout(() => r.say('냥!', 1.3), 500);
        hearts((l.headX + r.headX) / 2, l.headY + 4, 2);
        return;
      }
    }
  }

  // ───────── 코드 입력 중엔 조용히 ─────────
  let lastTypeAt = -1e9;
  let quietOn = false;
  const isQuiet = () => settings.quietWhileTyping && nowS() - lastTypeAt < 6;
  const isEditable = (t) =>
    !!t && t.nodeType === 1 && (t.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) ||
      (t.closest && !!t.closest('.CodeMirror, .cm-editor, .monaco-editor, .ace_editor')));
  document.addEventListener('keydown', (e) => {
    if (!settings.enabled || !settings.quietWhileTyping || !isEditable(e.target)) return;
    lastTypeAt = nowS();
    if (!quietOn) {
      quietOn = true;
      stage.classList.add('quiet');
      cats.forEach((c) => c.calmDown());
    }
  }, true);

  // ───────── 츄르 / 축하 / 위로 ─────────
  function feed() {
    cats.forEach((c, i) => {
      if (c.dragging) return;
      c.vx = c.vy = 0; c.y = 0; c.hopsLeft = 0;
      c.setState('eat', 4.2);
      c.next = { state: 'happy', dur: 1.6 };
      c.say(i === 0 ? '츄르다냥!! 😻' : pick(['나도 줘냥!', '냠냠냥']), 2);
    });
    addAffection(5);
  }

  function celebrate() {
    cats.forEach((c, i) => {
      if (c.dragging) return;
      c.say(i === 0 ? '맞았습니다냥!! 🎉' : pick(['축하해냥!', '최고다냥!', '천재다냥!']), 2.8);
      c.hop(440, 'happy', 3, 'happy');
      confetti(c.centerX, c.y + c.h * 0.6);
    });
    addAffection(2);
  }

  const JUDGE_MSG = {
    pac: '부분 점수! 조금만 더냥 💪',
    wa: '틀렸다냥… 반례를 찾아보자!',
    pe: '출력 형식을 확인해보라냥',
    tle: '시간 초과냥… ⏰ 더 빠르게!',
    mle: '메모리 초과냥… 🐟',
    ole: '출력 초과냥… 너무 많이 썼다냥',
    rte: '런타임 에러냥… 🙀 인덱스 확인!',
    ce: '컴파일 에러냥! 언어 설정 확인!',
  };
  function comfort(kind) {
    const c = cats.find((k) => !k.dragging);
    if (!c) return;
    c.vx = c.vy = 0; c.y = 0; c.hopsLeft = 0;
    c.setState('sad', 2.8);
    c.next = { state: 'idle', dur: 1.5 };
    c.say(JUDGE_MSG[kind] || '괜찮다냥, 다시 해보자!', 3.2);
    setTimeout(() => {
      if (c.state === 'idle' || c.state === 'sad') {
        c.setFace('happy');
        c.say('다음엔 맞을 거다냥!', 1.8);
      }
    }, 3000);
  }

  // ───────── 채점 현황 감시 ─────────
  const FINAL = ['ac', 'pac', 'wa', 'pe', 'tle', 'mle', 'ole', 'rte', 'ce'];
  const TEXT_RULES = [
    [/맞았습니다/, 'ac'], [/출력 형식/, 'pe'], [/틀렸습니다/, 'wa'], [/시간 초과/, 'tle'],
    [/메모리 초과/, 'mle'], [/출력 초과/, 'ole'], [/런타임 에러/, 'rte'], [/컴파일 에러/, 'ce'],
    [/^\s*\d+(\.\d+)?\s*점/, 'pac'], [/기다리는 중|채점 중|채점 준비|컴파일 중|재채점/, 'pending'],
  ];
  function classify(el) {
    for (const c of el.classList) {
      const m = /^result-(.+)$/.exec(c);
      if (!m || m[1] === 'text') continue;
      if (FINAL.includes(m[1])) return m[1];
      if (/wait|judging|compile|rejudge|ing$/.test(m[1])) return 'pending';
    }
    const txt = el.textContent || '';
    for (const [re, k] of TEXT_RULES) if (re.test(txt)) return k;
    return 'unknown';
  }

  const judgeSeen = new Map();
  let me = null;
  let lastJudgeAt = -1e9;
  function isMine(row, urlUser) {
    if (me) {
      if (urlUser && urlUser === me) return true;
      return !!row.querySelector(`a[href$="/user/${CSS.escape(me)}"]`);
    }
    return !!urlUser;
  }
  function scanResults(react) {
    const spans = document.querySelectorAll('.result-text');
    if (!spans.length) return;
    if (me === null) me = (document.querySelector('a.username')?.textContent || '').trim();
    const urlUser = new URLSearchParams(location.search).get('user_id');
    const results = [];
    for (const el of spans) {
      const row = el.closest('tr');
      if (!row || !row.id) continue;
      const st = classify(el);
      const prev = judgeSeen.get(row.id);
      judgeSeen.set(row.id, st);
      if (react && prev === 'pending' && FINAL.includes(st) && isMine(row, urlUser)) results.push(st);
    }
    if (!results.length) return;
    const t = nowS();
    if (t - lastJudgeAt < 3) return;
    lastJudgeAt = t;
    if (results.includes('ac')) celebrate();
    else comfort(results[0]);
  }
  let scanTimer = 0;
  const judgeObserver = new MutationObserver(() => {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = 0;
      scanResults(settings.enabled && settings.judgeReactions);
    }, 150);
  });
  scanResults(false);
  if (document.body) {
    judgeObserver.observe(document.body, {
      subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'],
    });
  }

  // ───────── 분할 화면(split.js)에서 온 소식 ─────────
  document.addEventListener('cboj:layout', (e) => {
    reserveRight = Math.max(0, (e.detail && e.detail.right) | 0);
    measure();
    cats.forEach((c) => c.clampX());
  });
  document.addEventListener('cboj:judge', (e) => {
    if (!settings.enabled || !settings.judgeReactions || !e.detail) return;
    lastJudgeAt = nowS();
    if (e.detail.result === 'ac') celebrate();
    else comfort(e.detail.result);
  });
  document.addEventListener('cboj:samples', (e) => {
    if (!settings.enabled || !e.detail) return;
    const c = cats.find((k) => !k.dragging && !AIRBORNE.has(k.state));
    if (!c) return;
    const { passed, total, compileError } = e.detail;
    if (compileError) {
      c.setState('wonder', 1.6);
      c.say('컴파일 에러냥! 🙀', 2);
    } else if (passed === total) {
      c.hop(360, 'happy');
      c.say('예제 통과냥! 이제 제출?', 2.2);
    } else {
      c.setState('sad', 1.8);
      c.say(`예제 ${passed}/${total}… 다시 보자냥`, 2.2);
    }
  });

  // ───────── 팝업에서 온 메시지 ─────────
  try {
    ext.runtime.onMessage.addListener((msg, _sender, respond) => {
      if (!msg || typeof msg.type !== 'string') return;
      if (msg.type === 'boj-kitty:churu') {
        if (settings.enabled) feed();
        respond({ ok: true, enabled: settings.enabled });
      } else if (msg.type === 'boj-kitty:party') {
        if (settings.enabled) celebrate();
        respond({ ok: true, enabled: settings.enabled });
      }
    });
  } catch { /* 데모 등 */ }

  // ───────── 설정 ─────────
  function applySettings(s) {
    settings = { ...DEFAULTS, ...s };
    host.style.display = settings.enabled ? '' : 'none';
    const scale = SIZES[settings.size] || 1;
    const count = clamp(Number(settings.count) || 1, 1, 3);
    const furOf = (i) => (settings.colors && settings.colors[i]) || DEFAULTS.colors[i] || 'cheese';
    while (cats.length > count) cats.pop().destroy();
    cats.forEach((c, i) => { c.setFur(furOf(i)); c.setScale(scale); c.clampX(); });
    while (cats.length < count) cats.push(new Cat(cats.length, furOf(cats.length), scale));
    if (!settings.quietWhileTyping && quietOn) { quietOn = false; stage.classList.remove('quiet'); }
    if (settings.enabled) startLoop(); else stopLoop();
  }

  // ───────── 루프 ─────────
  let raf = 0;
  let last = 0;
  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    if (quietOn && !isQuiet()) { quietOn = false; stage.classList.remove('quiet'); }
    for (const c of cats) c.update(dt);
    checkMeet(ts / 1000);
    raf = requestAnimationFrame(frame);
  }
  function startLoop() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  addEventListener('resize', () => {
    measure();
    cats.forEach((c) => c.clampX());
  });

  try {
    ext.storage.sync.get(DEFAULTS, (s) => applySettings(s || {}));
    ext.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      const s = { ...settings };
      for (const k in changes) s[k] = changes[k].newValue;
      applySettings(s);
    });
  } catch {
    applySettings({});
  }
})();
