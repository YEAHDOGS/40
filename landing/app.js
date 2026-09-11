// 40Forty landing: countdown, ash particles, reveals, sticky CTA, notify form.
// Notify form is front-end only for now (no backend yet).
(function () {
  'use strict';

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- countdown: rolling 40-day grid ---------- */
  var CYCLE = 40 * 24 * 60 * 60 * 1000;
  var ANCHOR = Date.UTC(2026, 0, 1); // grid epoch; concept countdown only
  var dEl = document.getElementById('d');
  var hEl = document.getElementById('h');
  var mEl = document.getElementById('m');
  var sEl = document.getElementById('s');
  var bar = document.getElementById('cyclebar');

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function setNum(el, val) {
    var t = pad(val);
    if (el.textContent !== t) {
      el.textContent = t;
      if (!reduceMotion) {
        el.classList.add('tick');
        setTimeout(function () { el.classList.remove('tick'); }, 180);
      }
    }
  }

  function tick() {
    var now = Date.now();
    var elapsed = (now - ANCHOR) % CYCLE;
    var left = CYCLE - elapsed;
    setNum(dEl, Math.floor(left / 86400000));
    setNum(hEl, Math.floor(left / 3600000) % 24);
    setNum(mEl, Math.floor(left / 60000) % 60);
    setNum(sEl, Math.floor(left / 1000) % 60);
    if (bar) bar.style.width = ((elapsed / CYCLE) * 100).toFixed(3) + '%';
  }
  if (dEl) { tick(); setInterval(tick, 1000); }

  /* ---------- ash: slow embers drifting up the hero ---------- */
  var canvas = document.getElementById('ash');
  if (canvas && !reduceMotion) {
    var ctx = canvas.getContext('2d');
    var W = 0, H = 0, parts = [], running = true;

    function size() {
      var r = canvas.parentElement.getBoundingClientRect();
      W = canvas.width = Math.floor(r.width);
      H = canvas.height = Math.floor(r.height);
    }
    function spawn(p) {
      p.x = Math.random() * W;
      p.y = H + Math.random() * H * 0.3;
      p.r = 0.6 + Math.random() * 1.8;
      p.vy = 0.15 + Math.random() * 0.45;
      p.vx = (Math.random() - 0.5) * 0.2;
      p.a = 0.08 + Math.random() * 0.28;
      p.ph = Math.random() * Math.PI * 2;
      return p;
    }
    size();
    for (var i = 0; i < 55; i++) {
      var p = spawn({});
      p.y = Math.random() * H; // prefill
      parts.push(p);
    }
    var t = 0;
    function frame() {
      if (!running) return;
      t += 0.016;
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.y -= p.vy;
        p.x += p.vx + Math.sin(t + p.ph) * 0.12;
        if (p.y < -8) spawn(p);
        var tw = 0.7 + 0.3 * Math.sin(t * 2 + p.ph);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.2832);
        ctx.fillStyle = 'rgba(224,154,60,' + (p.a * tw).toFixed(3) + ')';
        ctx.fill();
      }
      requestAnimationFrame(frame);
    }
    frame();
    window.addEventListener('resize', size);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        var vis = es[0].isIntersecting;
        if (vis && !running) { running = true; frame(); }
        else if (!vis) { running = false; }
      }).observe(canvas.parentElement);
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { running = false; }
      else if (!running) { running = true; frame(); }
    });
  }

  /* ---------- reveals ---------- */
  var revs = document.querySelectorAll('.reveal');
  if (revs.length && 'IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    revs.forEach(function (r) { io.observe(r); });
  } else {
    revs.forEach(function (r) { r.classList.add('in'); });
  }

  /* ---------- sticky mobile CTA ---------- */
  var sticky = document.getElementById('stickyCta');
  var hero = document.querySelector('.hero');
  var notify = document.getElementById('notify');
  if (sticky && 'IntersectionObserver' in window) {
    var pastHero = false, atNotify = false;
    function update() { sticky.classList.toggle('show', pastHero && !atNotify); }
    if (hero) new IntersectionObserver(function (es) {
      pastHero = !es[0].isIntersecting && es[0].boundingClientRect.top < 0;
      update();
    }).observe(hero);
    if (notify) new IntersectionObserver(function (es) {
      atNotify = es[0].isIntersecting;
      update();
    }, { threshold: 0.15 }).observe(notify);
  }

  /* ---------- notify form (placeholder, no backend) ---------- */
  var form = document.querySelector('form[data-notify]');
  if (form) {
    var email = form.querySelector('input[type="email"]');
    var error = form.querySelector('.field-error');
    var button = form.querySelector('button');

    function setError(msg) {
      error.textContent = msg;
      email.setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (msg) email.focus();
    }
    email.addEventListener('input', function () { setError(''); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var value = email.value.trim();
      if (!value) { setError('Please enter your email address.'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        setError('That does not look like an email address.');
        return;
      }
      setError('');
      button.disabled = true;
      button.classList.add('loading');
      setTimeout(function () { window.location.href = './thanks.html'; }, 800);
    });
  }
})();
