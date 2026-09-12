// 40Forty snap-panel landing: countdown, clip reveals, burn demo, notify form.
// No scroll listeners. Transform/opacity motion only.
(function () {
  'use strict';

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- countdown: rolling 40-day grid (concept only) ---------- */
  var CYCLE = 40 * 24 * 60 * 60 * 1000;
  var ANCHOR = Date.UTC(2026, 0, 1); // grid epoch
  var dEl = document.getElementById('d');
  var hEl = document.getElementById('h');
  var mEl = document.getElementById('m');
  var sEl = document.getElementById('s');

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function tick() {
    var now = Date.now();
    var elapsed = (now - ANCHOR) % CYCLE;
    var left = CYCLE - elapsed;
    dEl.textContent = pad(Math.floor(left / 86400000));
    hEl.textContent = pad(Math.floor(left / 3600000) % 24);
    mEl.textContent = pad(Math.floor(left / 60000) % 60);
    sEl.textContent = pad(Math.floor(left / 1000) % 60);
  }
  if (dEl) { tick(); setInterval(tick, 1000); }

  /* ---------- clip reveals: observe the PANEL, reveal children ---------- */
  var panels = document.querySelectorAll('.panel');
  if (panels.length && 'IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); }
        else { en.target.classList.remove('in'); }
      });
    }, { threshold: 0.35 });
    panels.forEach(function (p) { io.observe(p); });
  } else {
    panels.forEach(function (p) { p.classList.add('in'); });
  }

  /* ---------- burn demo: post a note, watch it die ---------- */
  var BURN_MS = 40000; // 40 seconds stands in for 40 days
  var form = document.getElementById('burnForm');
  var input = document.getElementById('burnText');
  var feed = document.getElementById('feed');

  function burn(note) {
    var bar = note.querySelector('.ttl span');
    var started = Date.now();
    function step() {
      var elapsed = Date.now() - started;
      var left = Math.max(0, 1 - elapsed / BURN_MS);
      bar.style.transform = 'scaleX(' + left.toFixed(3) + ')';
      if (left > 0) { setTimeout(step, 1000); return; }
      note.classList.add('dying');
      setTimeout(function () {
        var g = document.createElement('p');
        g.className = 'gone-note';
        g.textContent = 'Wiped. Unrecoverable.';
        note.replaceWith(g);
        setTimeout(function () { g.remove(); }, 6000);
      }, reduceMotion ? 0 : 1150);
    }
    step();
  }

  if (form && input && feed) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = input.value.trim();
      if (!text) { input.focus(); return; }
      while (feed.children.length >= 4) feed.removeChild(feed.firstChild);
      var note = document.createElement('div');
      note.className = 'note';
      var p = document.createElement('p');
      p.textContent = text; // textContent: no HTML injection
      var ttl = document.createElement('div');
      ttl.className = 'ttl';
      ttl.setAttribute('aria-hidden', 'true');
      var span = document.createElement('span');
      ttl.appendChild(span);
      note.appendChild(p);
      note.appendChild(ttl);
      feed.prepend(note);
      input.value = '';
      input.focus();
      burn(note);
    });
  }

  /* ---------- notify form: honest localStorage capture ---------- */
  var notify = document.querySelector('form[data-notify]');
  if (notify) {
    var email = notify.querySelector('input[type="email"]');
    var error = notify.querySelector('.field-error');
    var button = notify.querySelector('button');

    function setError(msg) {
      error.textContent = msg;
      email.setAttribute('aria-invalid', msg ? 'true' : 'false');
    }
    email.addEventListener('input', function () { setError(''); });

    notify.addEventListener('submit', function (e) {
      e.preventDefault();
      var value = email.value.trim().toLowerCase();
      if (!value) { setError('Please enter your email address.'); email.focus(); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        setError('That does not look like an email address.');
        email.focus();
        return;
      }
      setError('');
      try {
        var list = JSON.parse(localStorage.getItem('forty-notify') || '[]');
        if (list.indexOf(value) === -1) list.push(value);
        localStorage.setItem('forty-notify', JSON.stringify(list));
      } catch (err) { /* storage full or blocked: still confirm */ }
      var ok = document.createElement('p');
      ok.className = 'form-ok';
      ok.textContent = 'You are on the list. See you at the next cycle.';
      notify.replaceWith(ok);
    });
  }
})();
