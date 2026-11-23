(function () {
  'use strict';

  var CFG = window.HMO_CONFIG || {};
  var API = CFG.API_URL || '';
  var pagina = document.body.getAttribute('data-pagina') || 'home';
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  function opslag(fn) { try { return fn(); } catch (e) { return null; } }

  // ---------------------------------------------------------------- API
  function post(data) {
    if (!API) return Promise.reject(new Error('geen api'));
    return fetch(API, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain;charset=utf-8'},
      body: JSON.stringify(data),
      redirect: 'follow',
    }).then(function (r) { return r.json(); });
  }
  function beacon(data) {
    if (!API) return;
    var body = JSON.stringify(data);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(API, new Blob([body], {type: 'text/plain;charset=utf-8'}));
    } else {
      fetch(API, {method: 'POST', body: body, keepalive: true, headers: {'Content-Type': 'text/plain;charset=utf-8'}}).catch(function () {});
    }
  }

  // ---------------------------------------------------------------- meten
  var bezoekId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : 'v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  var zichtbaarSinds = document.visibilityState === 'visible' ? Date.now() : 0;
  var actieveMs = 0, maxScroll = 0, kliks = 0;

  function apparaat() {
    var ua = navigator.userAgent;
    if (/iPad|Tablet/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'tablet';
    if (/Mobi|Android|iPhone/i.test(ua)) return 'telefoon';
    return 'computer';
  }
  function herkomst() {
    var p = new URLSearchParams(location.search);
    var bron = p.get('bron') || p.get('utm_source');
    if (bron) return bron;
    if (!document.referrer) return 'direct';
    try {
      var h = new URL(document.referrer).hostname.replace(/^www\./, '');
      return h === location.hostname ? 'eigen site' : h;
    } catch (e) { return 'onbekend'; }
  }
  function duurSec() {
    var ms = actieveMs + (zichtbaarSinds ? Date.now() - zichtbaarSinds : 0);
    return Math.round(ms / 1000);
  }
  function scrollPct() {
    var h = document.documentElement.scrollHeight - innerHeight;
    return h <= 0 ? 100 : Math.min(100, Math.round((scrollY / h) * 100));
  }
  var bezoekKlaar = API ? post({
    t: 'bezoek', id: bezoekId, pagina: pagina, apparaat: apparaat(), breedte: innerWidth, herkomst: herkomst(),
  }).catch(function () {}) : Promise.resolve();

  addEventListener('scroll', function () { var p = scrollPct(); if (p > maxScroll) maxScroll = p; }, {passive: true});
  document.addEventListener('click', function () { kliks++; }, true);
  function stuurUpdate() { beacon({t: 'update', id: bezoekId, duur: duurSec(), scroll: maxScroll, kliks: kliks}); }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      if (zichtbaarSinds) { actieveMs += Date.now() - zichtbaarSinds; zichtbaarSinds = 0; }
      stuurUpdate();
    } else {
      zichtbaarSinds = Date.now();
    }
  });
  addEventListener('pagehide', stuurUpdate);
  setInterval(function () { if (document.visibilityState === 'visible') stuurUpdate(); }, 30000);

  // ---------------------------------------------------------------- scroll-animaties
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (items) {
      items.forEach(function (it) { if (it.isIntersecting) { it.target.classList.add('zichtbaar'); io.unobserve(it.target); } });
    }, {threshold: 0.12, rootMargin: '0px 0px -40px 0px'});
    $$('.reveal').forEach(function (el) { io.observe(el); });
  } else {
    document.documentElement.classList.add('no-js');
  }

  // ---------------------------------------------------------------- teller
  var huidig = null;
  function toonTeller(n, stoot) {
    if (typeof n !== 'number') return;
    var van = huidig == null ? Math.max(0, n - 25) : huidig;
    huidig = n;
    $$('[data-teller]').forEach(function (el) {
      var start = performance.now(), duur = van === n ? 0 : 900;
      (function stap(t) {
        var k = duur ? Math.min(1, (t - start) / duur) : 1;
        var e = 1 - Math.pow(1 - k, 3);
        el.textContent = Math.round(van + (n - van) * e).toLocaleString('nl-NL');
        if (k < 1) requestAnimationFrame(stap);
      })(start);
      if (stoot) { el.classList.remove('stoot'); void el.offsetWidth; el.classList.add('stoot'); }
    });
  }
  var gepauzeerd = false;
  function haalStand() {
    if (!API) return;
    fetch(API + '?a=stand', {redirect: 'follow'}).then(function (r) { return r.json(); }).then(function (s) {
      if (s && s.ok) { toonTeller(s.teller); gepauzeerd = !!s.gepauzeerd; toonPauzeKnop(); }
    }).catch(function () {});
  }
  haalStand();
  setInterval(function () { if (document.visibilityState === 'visible') haalStand(); }, 20000);

  // ---------------------------------------------------------------- pijltjes naar de belofte
  $$('a.naar-belofte').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var doel = $('#belofte');
      if (!doel) return;
      e.preventDefault();
      doel.scrollIntoView({behavior: 'smooth', block: 'start'});
      setTimeout(function () { var n = $('#naam'); if (n && !$('#formulier').hidden && innerWidth > 900) n.focus({preventScroll: true}); }, 700);
    });
  });

  // ---------------------------------------------------------------- STFU-link
  var stfu = $('#stfuLink');
  if (stfu) {
    if (CFG.STFU_URL) { stfu.href = CFG.STFU_URL; stfu.target = '_blank'; stfu.rel = 'noopener'; }
    else { var s = document.createElement('span'); s.textContent = 'STFU'; stfu.replaceWith(s); }
  }

  // ---------------------------------------------------------------- golf + piep
  var canvas = $('#golf'), ctx = canvas && canvas.getContext('2d');
  var piepAan = false, amp = 0;
  var stil = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function teken(t) {
    if (!ctx) return;
    var w = canvas.clientWidth, h = canvas.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    amp += ((piepAan ? 1 : 0.28) - amp) * 0.05;
    for (var l = 0; l < 3; l++) {
      ctx.beginPath();
      for (var x = 0; x <= w; x += 3) {
        var fase = t / (900 - l * 180), env = Math.sin((x / w) * Math.PI);
        var freq = piepAan ? 0.09 + l * 0.02 : 0.012 + l * 0.004;
        var y = h / 2 + Math.sin(x * freq + fase * (piepAan ? 9 : 1)) * env * (h * 0.38) * amp * (1 - l * 0.25);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = l === 0 ? 'rgba(255,107,26,.9)' : 'rgba(255,107,26,' + (0.35 - l * 0.1) + ')';
      ctx.lineWidth = l === 0 ? 2 : 1.4;
      ctx.stroke();
    }
    if (!stil || piepAan) requestAnimationFrame(teken);
  }
  if (ctx) requestAnimationFrame(teken);

  var audio = null, piepTimer = null;
  var piepKnop = $('#piepknop');
  function stopPiep() {
    piepAan = false;
    if (audio) {
      var nu = audio.ctx.currentTime;
      audio.gain.gain.cancelScheduledValues(nu);
      audio.gain.gain.setValueAtTime(audio.gain.gain.value, nu);
      audio.gain.gain.linearRampToValueAtTime(0, nu + 0.25);
      var a = audio; setTimeout(function () { a.ctx.close(); }, 400);
      audio = null;
    }
    clearTimeout(piepTimer);
    if (piepKnop) { piepKnop.setAttribute('aria-pressed', 'false'); piepKnop.querySelector('.piep-tekst').textContent = 'Hoor de piep'; }
  }
  if (piepKnop) piepKnop.addEventListener('click', function () {
    if (piepAan) { stopPiep(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    var c = new AC(), osc = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lfoG = c.createGain();
    osc.type = 'sine'; osc.frequency.value = 6000;           // hoge tinnitus-toon
    lfo.frequency.value = 5; lfoG.gain.value = 12;           // licht trillen, zoals een echte piep
    lfo.connect(lfoG); lfoG.connect(osc.frequency);
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(0.035, c.currentTime + 0.6); // bewust zacht
    osc.connect(g); g.connect(c.destination);
    osc.start(); lfo.start();
    audio = {ctx: c, gain: g};
    piepAan = true;
    if (stil && ctx) requestAnimationFrame(teken);
    piepKnop.setAttribute('aria-pressed', 'true');
    piepKnop.querySelector('.piep-tekst').textContent = 'Stop de piep';
    var u = $('#piepuitleg'); if (u) u.hidden = false;
    piepTimer = setTimeout(stopPiep, 15000);
  });

  // ---------------------------------------------------------------- dB-meter
  var meter = $('.meter'), vulling = $('#meterVulling'), meterGetal = $('#meterGetal');
  if (meter && vulling) {
    var raf = 0;
    var meterUpdate = function () {
      raf = 0;
      var r = meter.getBoundingClientRect();
      var k = Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight * 0.55 + r.height * 0.6)));
      vulling.style.height = (k * 100).toFixed(1) + '%';
      meterGetal.textContent = Math.round(60 + 69 * k);
    };
    addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(meterUpdate); }, {passive: true});
    meterUpdate();
  }

  // ---------------------------------------------------------------- belofte
  var form = $('#formulier');
  if (!form) return;
  var melding = $('#melding'), knop = $('#verstuur'), bedankt = $('#bedankt'), adminPaneel = $('#admin');
  var NAAM = /^[A-Za-zÀ-ÖØ-öø-ÿ]{1,15}$/;
  var FOUTEN = {
    naam: 'Vul je voornaam in: alleen letters, max. 15.',
    leeftijd: 'Vul een leeftijd in van 16 tot en met 85.',
    uitgaan: 'Kies hoe vaak je naar een feest of festival gaat.',
    pauze: 'De beloftes staan even op pauze. Probeer het later nog eens.',
    druk: 'Het is even heel druk. Probeer het over een minuut opnieuw.',
    al: 'Je hebt je belofte al gedaan. Dank je!',
    snel: 'Dat ging wel heel snel. Probeer het nog een keer.',
    server: 'Er ging iets mis. Probeer het nog een keer.',
    netwerk: 'Geen verbinding. Check je internet en probeer het opnieuw.',
    geenapi: 'De belofte is nog niet gekoppeld.',
  };

  function rangtekst(n) { return 'Jij bent de ' + n.toLocaleString('nl-NL') + 'e die zijn oren beschermt!'; }
  function toonBedankt(n, eerder) {
    form.hidden = true;
    bedankt.hidden = false;
    $('#bedanktTitel').textContent = n ? (eerder ? 'Je deed al mee als ' + n.toLocaleString('nl-NL') + 'e. Dank je!' : rangtekst(n)) : 'Dank je wel!';
  }
  var eerder = opslag(function () { return localStorage.getItem('hmo_belofte'); });
  if (eerder) toonBedankt(Number(eerder) || 0, true);

  function fout(veld, tekst) {
    melding.className = 'melding';
    melding.textContent = tekst;
    $$('#formulier input').forEach(function (i) { i.removeAttribute('aria-invalid'); });
    if (veld) { var el = form.querySelector('[name="' + veld + '"]'); if (el) { el.setAttribute('aria-invalid', 'true'); if (el.type !== 'radio') el.focus(); } }
  }

  function verstuur(data, poging) {
    return bezoekKlaar.then(function () { return post(data); }).then(function (r) {
      if (r && r.ok && r.admin) return startAdmin(data.naam, r.stand);
      if (r && r.ok) {
        if (r.nummer) { opslag(function () { localStorage.setItem('hmo_belofte', String(r.nummer)); }); toonTeller(r.nummer, true); }
        else opslag(function () { localStorage.setItem('hmo_belofte', '1'); });
        toonBedankt(r.nummer || 0, false);
        return;
      }
      var f = (r && r.fout) || 'server';
      if (f === 'sessie' && !poging) {
        // bezoek nog niet bekend bij de server: opnieuw aanmelden en na 3,5 sec nog één keer proberen
        bezoekKlaar = post({t: 'bezoek', id: bezoekId, pagina: pagina, apparaat: apparaat(), breedte: innerWidth, herkomst: herkomst()})
          .then(function () { return new Promise(function (res) { setTimeout(res, 3500); }); });
        return verstuur(data, 1);
      }
      if (f === 'al') opslag(function () { localStorage.setItem('hmo_belofte', '1'); });
      fout(['naam', 'leeftijd', 'uitgaan'].indexOf(f) > -1 ? f : null, FOUTEN[f] || FOUTEN.server);
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!API) { fout(null, FOUTEN.geenapi); return; }
    var naam = form.naam.value.trim();
    var leeftijd = form.leeftijd.value.trim();
    var keuze = form.querySelector('input[name="uitgaan"]:checked');
    var data = {t: 'belofte', id: bezoekId, naam: naam, website: form.website.value};

    if (NAAM.test(naam)) {
      // gewone bezoeker: eerst zelf controleren
      var lt = Number(leeftijd);
      if (!leeftijd || !Number.isInteger(lt) || lt < 16 || lt > 85) return fout('leeftijd', FOUTEN.leeftijd);
      if (!keuze) return fout('uitgaan', FOUTEN.uitgaan);
      data.leeftijd = lt; data.uitgaan = keuze.value;
    } else if (!naam || naam.length > 40) {
      return fout('naam', FOUTEN.naam);
    }
    // (een naam met andere tekens gaat ook naar de server: die beslist)

    knop.disabled = true; knop.textContent = 'Even geduld…';
    melding.textContent = '';
    verstuur(data, 0).catch(function () { fout(null, FOUTEN.netwerk); }).then(function () {
      knop.disabled = false; knop.textContent = 'Ik beloof het';
    });
  });

  var deel = $('#deelknop');
  if (deel) deel.addEventListener('click', function () {
    var url = location.origin + location.pathname;
    var tekst = 'Ik draag oordoppen bij mijn volgende feest. Doe jij ook mee?';
    if (navigator.share) { navigator.share({title: 'Hoor Morgen Ook', text: tekst, url: url}).catch(function () {}); }
    else if (navigator.clipboard) { navigator.clipboard.writeText(tekst + ' ' + url).then(function () { deel.textContent = 'Link gekopieerd!'; }); }
  });

  // ---------------------------------------------------------------- admin
  var adminCode = null;
  var aKnop = $('#adminBelofte'), aMelding = $('#adminMelding'), aPauze = $('#adminPauze');
  function toonPauzeKnop() { if (aPauze) aPauze.textContent = gepauzeerd ? 'Beloftes hervatten' : 'Beloftes pauzeren'; }
  function startAdmin(code, stand) {
    adminCode = code;
    form.reset();
    form.hidden = true; bedankt.hidden = true; adminPaneel.hidden = false;
    if (stand) { toonTeller(stand.teller); gepauzeerd = !!stand.gepauzeerd; }
    toonPauzeKnop();
    aMelding.className = 'melding goed'; aMelding.textContent = 'Ingelogd als admin.';
  }
  function cooldown(sec) {
    aKnop.disabled = true;
    (function tik() {
      if (sec <= 0) { aKnop.disabled = false; aKnop.textContent = 'Ik beloof het (admin)'; return; }
      aKnop.textContent = 'Opnieuw over ' + sec + ' sec'; sec--; setTimeout(tik, 1000);
    })();
  }
  if (aKnop) aKnop.addEventListener('click', function () {
    if (!adminCode) return;
    aKnop.disabled = true;
    post({t: 'admin_belofte', code: adminCode, id: bezoekId}).then(function (r) {
      if (r && r.ok) {
        toonTeller(r.nummer, true);
        aMelding.className = 'melding goed'; aMelding.textContent = rangtekst(r.nummer);
        cooldown(10);
      } else {
        aMelding.className = 'melding';
        aMelding.textContent = r && r.fout === 'wacht' ? 'Nog even wachten (10 sec).' : 'Niet gelukt.';
        cooldown(r && r.fout === 'wacht' ? 10 : 2);
      }
    }).catch(function () { aMelding.className = 'melding'; aMelding.textContent = FOUTEN.netwerk; aKnop.disabled = false; });
  });
  if (aPauze) aPauze.addEventListener('click', function () {
    if (!adminCode) return;
    aPauze.disabled = true;
    post({t: 'admin_pauze', code: adminCode, pauze: !gepauzeerd}).then(function (r) {
      if (r && r.ok) { gepauzeerd = !!r.stand.gepauzeerd; toonPauzeKnop();
        aMelding.className = 'melding goed'; aMelding.textContent = gepauzeerd ? 'Beloftes staan op pauze.' : 'Beloftes staan weer aan.'; }
    }).catch(function () {}).then(function () { aPauze.disabled = false; });
  });
  var uit = $('#adminUit');
  if (uit) uit.addEventListener('click', function () {
    adminCode = null; adminPaneel.hidden = true;
    var al = opslag(function () { return localStorage.getItem('hmo_belofte'); });
    if (al) toonBedankt(Number(al) || 0, true); else form.hidden = false;
  });
})();
