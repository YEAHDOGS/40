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

  /* ---------- notify form: the waitlist ----------
     The address is saved by the DOGS API Worker (api.dogs.red, D1); nothing is emailed yet.
       POST <API>/waitlist { email, site: "40", token } -> { joined: true }
     `token` is a Cloudflare Turnstile proof that a person sent it, in invisible mode: no box or
     puzzle is shown. Its script loads only when the form is submitted, never before. */
  var WAITLIST_URL = 'https://api.dogs.red/waitlist';
  var SITE = '40';
  var TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  var TURNSTILE_SITE_KEY = '0x4AAAAAAFn0k2xvNoVQuLjj';
  var TURNSTILE_ACTION = 'waitlist';
  var TOKEN_TIMEOUT_MS = 15000;
  var JOINED_KEY = 'forty-waitlist-joined';
  var JOINED_WORDS = 'You are on the list. One email when the doors open.';
  var STATUS_WORDS = {
    400: 'That does not look like an email address.',
    429: 'Too many tries. Wait a minute.',
    503: 'Please try again tomorrow.'
  };
  var FAILED = 'Could not join. Please try again.';

  var turnstileLoad = null;
  function loadTurnstile() {
    if (turnstileLoad) return turnstileLoad;
    turnstileLoad = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = TURNSTILE_SCRIPT;
      script.async = true;
      script.onload = function () { resolve(window.turnstile); };
      script.onerror = function () { turnstileLoad = null; reject(new Error('turnstile')); };
      document.head.appendChild(script);
    });
    return turnstileLoad;
  }
  // One single-use token. The invisible widget draws nothing but needs an element to live in.
  function turnstileToken() {
    return loadTurnstile().then(function (turnstile) {
      return new Promise(function (resolve, reject) {
        var host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:0;overflow:hidden';
        document.body.appendChild(host);
        var widget = null;
        function finish(settle, value) {
          clearTimeout(timer);
          if (widget !== null) turnstile.remove(widget);
          host.remove();
          settle(value);
        }
        var timer = setTimeout(function () { finish(reject, new Error('turnstile')); }, TOKEN_TIMEOUT_MS);
        widget = turnstile.render(host, {
          sitekey: TURNSTILE_SITE_KEY,
          action: TURNSTILE_ACTION,
          callback: function (token) { finish(resolve, token); },
          'error-callback': function () { finish(reject, new Error('turnstile')); return true; }
        });
      });
    });
  }

  var notify = document.querySelector('form[data-notify]');
  if (notify) {
    var email = notify.querySelector('input[type="email"]');
    var error = notify.querySelector('.field-error');
    var button = notify.querySelector('button');

    function setError(msg) {
      error.textContent = msg;
      email.setAttribute('aria-invalid', msg ? 'true' : 'false');
    }
    function showJoined() {
      var ok = document.createElement('p');
      ok.className = 'form-ok';
      ok.textContent = JOINED_WORDS;
      notify.replaceWith(ok);
    }
    email.addEventListener('input', function () { setError(''); });

    // Someone who already joined on this browser sees the thank-you, not an empty form.
    try { if (localStorage.getItem(JOINED_KEY)) showJoined(); } catch (err) { /* storage is optional */ }

    notify.addEventListener('submit', function (e) {
      e.preventDefault();
      var value = email.value.trim().toLowerCase();
      if (!value) { setError('Please enter your email address.'); email.focus(); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        setError(STATUS_WORDS[400]);
        email.focus();
        return;
      }
      setError('');
      button.disabled = true;
      turnstileToken().then(function (token) {
        return fetch(WAITLIST_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: value, site: SITE, token: token })
        });
      }).then(function (res) {
        button.disabled = false;
        if (!res.ok) return setError(STATUS_WORDS[res.status] || FAILED);
        try { localStorage.setItem(JOINED_KEY, '1'); } catch (err) { /* storage is optional */ }
        showJoined();
      }).catch(function () { button.disabled = false; setError(FAILED); });
    });
  }
})();
