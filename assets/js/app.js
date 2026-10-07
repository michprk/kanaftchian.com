/* ==========================================================================
   Hani Kanaftchian — interactions du site
   L’intro : l’appareil tourne lentement ; au bout de quelques secondes (ou au
   premier geste : molette, glissé, flèche, clic) il se tourne vers vous,
   déclenche, flash… et le site « s’allume » sur la photo qui vient d’être prise.
   Ensuite : défilement amorti, apparitions, références qui défilent, galerie à
   onglets, FAQ, devis avec estimation (validation, anti-spam, API ou e-mail),
   cookies et mesure d’audience après accord, page 404.
   Chaque bloc est isolé : si l’un échoue, le reste du site fonctionne.
   ========================================================================== */
(() => {
  'use strict';
  const d = document.documentElement;
  const reduced = d.classList.contains('reduced');
  const PAGE = d.dataset.page || '';
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const safe = (name, fn) => { try { fn(); } catch (error) { console.warn('[hk] ' + name, error); } };
  const EMAIL = 'hani@kanaftchian.com';
  const KEY = 'hk_';
  const euro = (n, dec) => new Intl.NumberFormat('fr-BE', { minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec ? 2 : 0 }).format(n) + ' €';

  /* ---------- Mesure d’audience (Google Analytics 4, uniquement après accord) ---------- */
  const GA_ID = (d.dataset.ga || '').trim();
  function track(name, params) {
    if (window.gtag && window.__hkGa) window.gtag('event', name, params || {});
  }
  function loadAnalytics() {
    if (!GA_ID || window.__hkGa) return;
    window.__hkGa = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' });
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { anonymize_ip: true });
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(s);
  }
  function clearAnalyticsCookies() {
    const host = location.hostname.split('.');
    document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter((n) => /^_ga/.test(n)).forEach((n) => {
      for (let i = 0; i < host.length; i++) document.cookie = n + '=; Max-Age=0; path=/; domain=' + host.slice(i).join('.');
      document.cookie = n + '=; Max-Age=0; path=/';
    });
  }
  // Le choix est redemandé après 6 mois (durée annoncée dans la politique de confidentialité)
  function readConsent() {
    try {
      const c = JSON.parse(localStorage.getItem(KEY + 'consent') || 'null');
      if (c && c.date && Date.now() - Date.parse(c.date) > 182 * 864e5) return null;
      return c;
    } catch (e) { return null; }
  }
  const cookieUi = { open: null, pending: false };
  safe('cookies', () => {
    const box = $('[data-cookie]');
    const main = box && $('[data-cookie-main]', box);
    const prefs = box && $('[data-cookie-prefs]', box);
    const toggle = box && $('[data-consent-analytics]', box);
    const consent = readConsent();
    if (consent && consent.analytics) loadAnalytics();
    if (!box) return;
    const open = (showPrefs) => {
      const c = readConsent();
      if (toggle) toggle.checked = !!(c && c.analytics);
      box.hidden = false;
      main.hidden = !!showPrefs;
      prefs.hidden = !showPrefs;
      const btn = $('[data-consent="customize"]', box);
      if (btn) btn.setAttribute('aria-expanded', String(!!showPrefs));
    };
    cookieUi.open = open;
    const save = (analytics) => {
      try { localStorage.setItem(KEY + 'consent', JSON.stringify({ analytics, date: new Date().toISOString().slice(0, 10), v: 1 })); } catch (e) { /* navigation privée */ }
      box.hidden = true;
      if (analytics) loadAnalytics();
      else {
        if (window.gtag && window.__hkGa) window.gtag('consent', 'update', { analytics_storage: 'denied' });
        clearAnalyticsCookies();
      }
    };
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-consent]');
      if (!b) return;
      const action = b.dataset.consent;
      if (action === 'accept') save(true);
      else if (action === 'refuse') save(false);
      else if (action === 'customize') open(true);
      else if (action === 'save') save(!!(toggle && toggle.checked));
    });
    $$('[data-cookie-open]').forEach((b) => b.addEventListener('click', () => open(true)));
    // le bandeau ne recouvre jamais l’intro : il arrive une fois le site allumé
    if (!consent) {
      if (d.classList.contains('intro-on')) cookieUi.pending = true;
      else setTimeout(() => open(false), 1400);
    }
  });
  const cookieAfterIntro = () => {
    if (cookieUi.pending && cookieUi.open && !readConsent()) { cookieUi.pending = false; setTimeout(() => cookieUi.open(false), 2200); }
  };

  // Clics suivis (boutons d’action, téléphone, WhatsApp, e-mail, réservation…)
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-track]');
    if (el) track(el.dataset.track, { link_url: el.getAttribute('href') || '', page: PAGE });
  });
  $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });

  /* ---------- Défilement amorti (Lenis) ---------- */
  let lenis = null;
  safe('lenis', () => {
    if (reduced || typeof window.Lenis !== 'function') return;
    lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true, syncTouch: false, autoRaf: true, respectReducedMotion: false });
    window.__hkLenis = lenis; // accès pratique pour le débogage
    if (d.classList.contains('intro-on')) lenis.stop();
  });
  function scrollToY(y, duration) {
    if (lenis) lenis.scrollTo(y, { duration: duration || 1.3, easing: easeInOut, force: true });
    else window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
  }
  function jumpToY(y) {
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
    else window.scrollTo(0, y);
  }
  const header = $('[data-header]');
  const hdrH = () => (header ? header.offsetHeight : 0);
  const targetY = (el) => (el.id === 'top' ? 0 : el.getBoundingClientRect().top + window.scrollY - hdrH() + 1);

  /* ---------- En-tête : voilé dès qu’on quitte le haut de page ---------- */
  const hero = $('[data-hero]');
  safe('header', () => {
    if (!header) return;
    const update = () => header.classList.toggle('is-solid', window.scrollY > 8 || !hero);
    update();
    window.addEventListener('scroll', update, { passive: true });
    const links = $$('.hdr__nav a[data-nav]');
    if (!links.length || !('IntersectionObserver' in window)) return;
    const map = new Map(links.map((a) => [a.dataset.nav, a]));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const link = map.get(entry.target.id);
        if (!link) return;
        if (entry.isIntersecting) { links.forEach((a) => a.classList.remove('is-active')); link.classList.add('is-active'); }
        else link.classList.remove('is-active');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    map.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
  });

  /* ---------- Menu mobile ---------- */
  safe('menu', () => {
    const btn = $('[data-menu-toggle]');
    const menu = $('[data-menu]');
    if (!btn || !menu) return;
    const label = $('.sr-only', btn);
    const set = (open) => {
      menu.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      if (label) label.textContent = open ? 'Fermer le menu' : 'Ouvrir le menu';
      d.classList.toggle('menu-open', open);
      if (lenis) { if (open) lenis.stop(); else lenis.start(); }
      if (open) { const first = $('a', menu); if (first) first.focus({ preventScroll: true }); }
    };
    btn.addEventListener('click', () => set(menu.hidden));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
    document.addEventListener('keydown', (e) => {
      if (menu.hidden) return;
      if (e.key === 'Escape') { set(false); btn.focus(); }
      if (e.key === 'Tab') {
        const items = [btn, ...$$('a, button', menu)];
        const i = items.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
        else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
      }
    });
    window.addEventListener('resize', () => { if (window.innerWidth > 1180 && !menu.hidden) set(false); });
  });

  /* ==========================================================================
     L’intro : tourner, déclencher, allumer le site
     ========================================================================== */
  const intro = $('[data-intro]');
  const flash = $('[data-flash]');
  const AUTO_MS = 4600;      // l’appareil tourne ~4,6 s avant de déclencher tout seul
  const HOLD = /[?&]intro=hold/.test(location.search); // présentation : l’appareil tourne sans déclencher seul
  let introOn = d.classList.contains('intro-on');
  let shooting = false;
  let autoTimer = 0;
  let readyTimer = 0;
  const ring = $('[data-countdown]');

  function setRing(p, ms) {
    if (!ring) return;
    ring.style.transition = ms ? 'stroke-dashoffset ' + ms + 'ms linear' : 'none';
    ring.style.strokeDashoffset = String(188.5 * (1 - p));
  }
  function startCountdown() {
    if (!introOn || autoTimer || shooting) return;
    if (HOLD) return;
    clearTimeout(readyTimer);
    setRing(0, 0);
    requestAnimationFrame(() => requestAnimationFrame(() => setRing(1, AUTO_MS)));
    autoTimer = setTimeout(() => { autoTimer = 0; shoot('auto'); }, AUTO_MS);
  }
  function stopCountdown() { clearTimeout(autoTimer); autoTimer = 0; clearTimeout(readyTimer); }

  function lightUp(fromFlash) {
    introOn = false;
    d.classList.remove('intro-on', 'is-shooting');
    d.classList.toggle('from-flash', !!fromFlash);
    d.classList.add('lit');
    jumpToY(0);
    if (lenis) lenis.start();
    try { sessionStorage.setItem(KEY + 'intro', 'seen'); } catch (e) { /* navigation privée */ }
    const cam = window.__hkCam;
    if (cam) setTimeout(() => { if (!introOn) cam.pause(); }, 1400);
    cookieAfterIntro();
    window.dispatchEvent(new CustomEvent('hk:lit'));
  }

  function stageCenter() {
    return { x: window.innerWidth / 2, y: window.innerHeight * 0.46 };
  }

  // Déclenchement : l’appareil se tourne vers vous, clac, flash, et le site apparaît dessous
  function shoot(source) {
    if (!introOn || shooting) return;
    shooting = true;
    stopCountdown();
    setRing(1, 160);
    d.classList.add('is-shooting');
    track('intro_shot', { source: source || 'auto' });
    const cam = window.__hkCam;
    // (filet de sécurité : si l’onglet ne dessine plus, le flash part quand même)
    const ready = cam && !cam.busy
      ? Promise.race([cam.shoot().catch(() => stageCenter()), new Promise((r) => setTimeout(() => r(stageCenter()), 2600))])
      : new Promise((r) => setTimeout(() => r(stageCenter()), 420));
    ready.then((lens) => {
      if (!introOn) { shooting = false; return; }
      if (window.__hkSound) window.__hkSound.shutter();
      if (!flash) { lightUp(false); shooting = false; return; }
      flash.style.setProperty('--fx', (lens.x / window.innerWidth * 100).toFixed(1) + '%');
      flash.style.setProperty('--fy', (lens.y / window.innerHeight * 100).toFixed(1) + '%');
      flash.classList.remove('is-off');
      flash.classList.add('is-on');
      setTimeout(() => {
        lightUp(true);
        flash.classList.remove('is-on');
        flash.classList.add('is-off');
        setTimeout(() => { flash.classList.remove('is-off'); shooting = false; }, 1400);
      }, 120);
    });
  }

  // Passer l’intro : un simple fondu
  function skip() {
    if (!introOn || shooting) return;
    stopCountdown();
    track('intro_skip');
    lightUp(false);
    const main = $('#main');
    if (main) { main.setAttribute('tabindex', '-1'); main.focus({ preventScroll: true }); }
  }

  // Revoir l’intro (pied de page, bouton du héros)
  function replay() {
    if (reduced || !intro) return;
    stopCountdown();
    jumpToY(0);
    if (lenis) lenis.stop();
    d.classList.remove('lit', 'from-flash', 'is-shooting');
    d.classList.add('intro-on');
    introOn = true;
    shooting = false;
    setRing(0, 0);
    const cam = window.__hkCam;
    if (cam) { cam.reset(); cam.resume(); setTimeout(startCountdown, 900); }
    else { window.dispatchEvent(new CustomEvent('hk:need-cam')); readyTimer = setTimeout(startCountdown, 2600); }
    const skipBtn = $('[data-intro-skip]');
    if (skipBtn) skipBtn.focus({ preventScroll: true });
  }
  window.__hkIntro = { shoot, skip, replay }; // accès pratique pour le débogage

  safe('intro', () => {
    $$('[data-intro-replay]').forEach((b) => {
      if (reduced || !intro) { b.hidden = true; return; }
      b.addEventListener('click', replay);
    });
    if (!intro) return;
    $$('[data-intro-skip]').forEach((b) => b.addEventListener('click', skip));
    $$('[data-shoot]').forEach((b) => b.addEventListener('click', () => shoot('button')));
    // le compte à rebours démarre quand l’appareil est affiché (ou son image de repli)
    window.addEventListener('hk:cam-ready', () => setTimeout(startCountdown, 250));
    if (introOn) {
      if (d.classList.contains('cam-ready') || d.classList.contains('no-3d')) startCountdown();
      readyTimer = setTimeout(() => { if (!d.classList.contains('cam-ready')) d.classList.add('no-3d'); startCountdown(); }, 5000);
    }

    // Un geste suffit : molette, glissé, clavier
    let lastWheel = 0;
    window.addEventListener('wheel', (e) => {
      if (!introOn) return;
      e.preventDefault();
      const now = performance.now();
      const fresh = now - lastWheel > 220;
      lastWheel = now;
      if (fresh && Math.abs(e.deltaY) > 2) shoot('wheel');
    }, { passive: false });
    let ty = 0, used = false;
    window.addEventListener('touchstart', (e) => { if (!introOn) return; ty = e.touches[0].clientY; used = false; }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (!introOn) return;
      if (e.cancelable) e.preventDefault();
      if (!used && Math.abs(ty - e.touches[0].clientY) > 24) { used = true; shoot('touch'); }
    }, { passive: false });
    document.addEventListener('keydown', (e) => {
      if (!introOn || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'Escape') { e.preventDefault(); skip(); return; }
      const onButton = e.target && e.target.closest && e.target.closest('button, a');
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || ((e.key === ' ' || e.key === 'Enter') && !onButton)) { e.preventDefault(); shoot('key'); }
    });
    // Souris : l’appareil suit le regard ; un clic sur l’appareil déclenche
    const stage = $('[data-stage]');
    let hover = false;
    intro.addEventListener('pointermove', (e) => {
      const c = window.__hkCam;
      if (!c || shooting) return;
      c.setPointer(e.clientX / window.innerWidth * 2 - 1, e.clientY / window.innerHeight * 2 - 1);
      if (e.target.closest('a, button')) { if (hover) { hover = false; stage.classList.remove('is-hover'); } return; }
      const h = c.hit(e.clientX, e.clientY);
      if (h !== hover) { hover = h; stage.classList.toggle('is-hover', h); }
    }, { passive: true });
    intro.addEventListener('pointerleave', () => { const c = window.__hkCam; if (c) c.setPointer(0, 0); });
    intro.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;
      const c = window.__hkCam;
      if (!c || c.hit(e.clientX, e.clientY) || !fine) shoot('camera');
    });
  });

  /* ---------- Ancres douces + présélection du formulaire ---------- */
  const formApi = {};
  safe('anchors', () => {
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href*="#"]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const url = new URL(a.getAttribute('href'), location.href);
      if (url.pathname.replace(/index\.html$/, '') !== location.pathname.replace(/index\.html$/, '') || !url.hash) return;
      const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (!target) return;
      e.preventDefault();
      if (a.dataset.need && formApi.preset) formApi.preset(a.dataset.need);
      history.replaceState(null, '', url.hash);
      scrollToY(targetY(target), 1.4);
      if (target.id === 'contact') setTimeout(() => { const f = $('#contact-form [name="name"]'); if (f && fine) f.focus({ preventScroll: true }); }, reduced ? 0 : 1400);
    });
  });

  /* ---------- Titres : lignes qui montent derrière un masque ---------- */
  safe('lines', () => {
    $$('[data-lines]').forEach((el) => {
      // (pas d’attribut style dans le HTML injecté : la politique de sécurité CSP l’interdit)
      const parts = el.innerHTML.split(/<br\s*\/?>/i);
      el.innerHTML = parts.map((html) => '<span class="ml-line"><span class="ml-line__inner">' + html.trim() + '</span></span>').join('');
      $$('.ml-line__inner', el).forEach((s, i) => s.style.setProperty('--ml-delay', (i * 0.1).toFixed(2) + 's'));
    });
  });

  /* ---------- Apparitions à l’entrée dans l’écran ---------- */
  safe('reveal', () => {
    const groups = new Map();
    $$('[data-reveal]').forEach((el) => {
      const p = el.parentElement;
      const n = groups.get(p) || 0;
      groups.set(p, n + 1);
      if (n) el.style.setProperty('--d', Math.min(0.42, n * 0.08).toFixed(2) + 's');
    });
    const targets = $$('[data-reveal], [data-lines]');
    if (!('IntersectionObserver' in window)) { targets.forEach((el) => el.classList.add('is-in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    targets.forEach((el) => io.observe(el));
  });

  /* ---------- Chiffres qui comptent ---------- */
  safe('counters', () => {
    const nums = $$('[data-count]');
    if (!nums.length || reduced || !('IntersectionObserver' in window)) return;
    const fmt = (el, v) => {
      const dec = Number(el.dataset.dec || 0);
      if (el.hasAttribute('data-plain')) return String(Math.round(v));
      return new Intl.NumberFormat('fr-BE', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);
    };
    const run = (el) => {
      const to = Number(el.dataset.count);
      const from = el.hasAttribute('data-plain') ? to - 13 : 0;
      const t0 = performance.now();
      const step = (now) => {
        const t = clamp((now - t0) / 1600, 0, 1);
        el.textContent = fmt(el, from + (to - from) * easeOut(t));
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      run(e.target);
      io.unobserve(e.target);
    }), { threshold: 0.6 });
    nums.forEach((el) => io.observe(el));
  });

  /* ---------- Références : défilement continu, suit le sens du défilement ---------- */
  safe('marquee', () => {
    const box = $('[data-marquee]');
    if (!box) return;
    const row = $('.marquee__row', box);
    const track = document.createElement('div');
    track.className = 'marquee__track';
    box.insertBefore(track, row);
    track.appendChild(row);
    const clone = row.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    track.appendChild(clone);
    if (reduced) return;
    let x = 0, speed = 38, boost = 0, lastY = window.scrollY, last = performance.now(), visible = true;
    if ('IntersectionObserver' in window) new IntersectionObserver((e) => { visible = e[0].isIntersecting; }).observe(box);
    window.addEventListener('scroll', () => { const y = window.scrollY; boost = clamp(boost + (y - lastY) * 0.9, -900, 900); lastY = y; }, { passive: true });
    const step = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (visible) {
        const w = row.offsetWidth || 1;
        x -= (speed + boost * 0.35) * dt;
        boost *= Math.pow(0.04, dt);
        if (x <= -w) x += w;
        if (x > 0) x -= w;
        track.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0)';
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  /* ---------- Parallaxe douce des images de prestations ---------- */
  safe('parallax', () => {
    if (reduced || window.innerWidth < 820) return;
    const imgs = $$('.srv__img img');
    let raf = 0;
    const update = () => {
      raf = 0;
      const vh = window.innerHeight;
      imgs.forEach((img) => {
        const r = img.parentElement.getBoundingClientRect();
        if (r.bottom < -100 || r.top > vh + 100) return;
        const p = (r.top + r.height / 2 - vh / 2) / vh;
        img.style.setProperty('--py', (clamp(p, -1, 1) * -26).toFixed(1) + 'px');
      });
    };
    window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
    update();
  });

  /* ---------- Réalisations : onglets ---------- */
  safe('tabs', () => {
    const list = $('[data-tabs]');
    if (!list) return;
    const tabs = $$('[role="tab"]', list);
    const set = (i, focus) => {
      tabs.forEach((t, j) => {
        const on = i === j;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) {
          panel.hidden = !on;
          if (on) { panel.classList.remove('is-in'); void panel.offsetWidth; panel.classList.add('is-in'); }
        }
      });
      if (focus) tabs[i].focus();
      track('gallery_tab', { tab: tabs[i].textContent.trim() });
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => set(i));
      t.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); set((i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length, true); }
        if (e.key === 'Home') { e.preventDefault(); set(0, true); }
        if (e.key === 'End') { e.preventDefault(); set(tabs.length - 1, true); }
      });
    });
  });

  /* ---------- Questions fréquentes : une seule ouverte à la fois ---------- */
  safe('faq', () => {
    const root = $('[data-faq]');
    if (!root) return;
    const items = $$('details', root);
    items.forEach((det) => {
      det.addEventListener('toggle', () => {
        if (!det.open) return;
        items.forEach((o) => { if (o !== det) o.open = false; });
        track('faq_open', { question: $('summary', det).textContent.trim().slice(0, 80) });
      });
    });
  });

  /* ---------- Devis : formulaire ---------- */
  const NEEDS = { equipe: 'Portraits d’équipe', portrait: 'Portrait individuel', evenement: 'Événement d’entreprise', immobilier: 'Immobilier', 360: 'Visite virtuelle 360°', autre: 'Autre demande', visite: 'Visite du studio', prive: 'Séance privée' };
  const LIEUX = { studio: 'Studio d’Uccle', locaux: 'Dans nos locaux', autre: 'Autre lieu' };
  const EVENT_RATES = { 1: 690, 2: 790, 3: 990, 4: 1190, 5: 1390, 6: 1590, 7: 1790, 8: 1990 };
  const IMMO_RATES = { 1: 390, 5: 350, 10: 320, 20: 290 };
  safe('form', () => {
    const form = $('[data-form]');
    if (!form) return;
    const status = $('[data-status]', form);
    const est = $('[data-estimate]', form);
    const submit = $('button[type="submit"]', form);
    const startedAt = Date.now();
    const val = (n) => (form.elements[n] ? String(form.elements[n].value || '').trim() : '');
    const radio = (n) => (form.querySelector('input[name="' + n + '"]:checked') || {}).value || '';
    const checked = (n) => !!(form.elements[n] && form.elements[n].checked);
    const today = () => { const n = new Date(); return new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
    const dateInput = form.elements.date;
    if (dateInput) dateInput.min = today();

    // Champs propres à chaque besoin + estimation en direct (grille tarifaire de Hani)
    function sync() {
      const need = radio('besoin');
      $$('[data-for]', form).forEach((f) => { f.hidden = f.dataset.for !== need; });
      const lieu = form.elements.lieu;
      if (lieu && need === 'immobilier' && lieu.value === 'studio') lieu.value = 'autre';
      estimate();
    }
    function estimate() {
      const need = radio('besoin');
      let html = '', total = 0;
      if (need === 'portrait') {
        total = 490;
        html = 'Corporate Signature&nbsp;: <strong>' + euro(490) + ' HTVA</strong> · ' + euro(592.9, true) + ' TVAC<small>1 h 30 au studio, 4 à 10 portraits retouchés. Sans prépaiement.</small>';
      } else if (need === 'evenement') {
        const h = Number(val('heures') || 3);
        total = EVENT_RATES[h] || 690;
        html = 'Reportage de ' + (h === 8 ? 'la journée' : h + ' h') + '&nbsp;: <strong>' + euro(total) + ' HTVA</strong> · ' + euro(total * 1.21, true) + ' TVAC<small>Première sélection rapide comprise. Déplacement hors Bruxelles sur devis.</small>';
      } else if (need === 'immobilier') {
        const n = Number(val('biens') || 1);
        const unit = IMMO_RATES[n] || 390;
        total = unit * n;
        html = (n === 1 ? '1 bien' : 'Pack de ' + n + ' biens') + '&nbsp;: <strong>' + euro(total) + ' HTVA</strong>' + (n > 1 ? ' (' + euro(unit) + ' par bien)' : '') + '<small>15 à 20 photos retouchées par bien, livrées sous 24 à 48 h ouvrées.</small>';
      } else if (need === 'equipe') {
        const p = Number(val('personnes') || 0);
        html = 'Équipe' + (p > 1 ? ' de ' + p + ' personnes' : '') + '&nbsp;: <strong>dès ' + euro(690) + ' HTVA</strong> en entreprise<small>Le devis précise le temps de présence, les images par personne et la photo de groupe.</small>';
      } else if (need === '360') {
        html = 'Visite virtuelle 360°&nbsp;: <strong>dès ' + euro(390) + ' HTVA</strong><small>Généralement 390 à 690 € HTVA pour un commerce ou un cabinet de 50 à 150 m².</small>';
      }
      if (est) {
        est.hidden = !html;
        est.innerHTML = html ? 'Estimation indicative · ' + html : '';
        est.dataset.total = String(total);
      }
    }
    form.addEventListener('change', (e) => {
      if (e.target.name === 'besoin') { sync(); const box = $('#err-besoin', form); if (box) { box.hidden = true; box.textContent = ''; } }
      else if (['heures', 'biens'].includes(e.target.name)) estimate();
    });
    form.addEventListener('input', (e) => { if (e.target.name === 'personnes') estimate(); });
    formApi.preset = (need) => {
      const map = { visite: 'autre', prive: 'autre' };
      const r = form.querySelector('input[name="besoin"][value="' + (map[need] || need) + '"]');
      if (r) { r.checked = true; sync(); }
      if (need === 'visite' && !val('message')) form.elements.message.value = 'Je souhaite visiter le studio d’Uccle avant de réserver.';
      if (need === 'prive' && !val('message')) form.elements.message.value = 'Séance privée (portrait, famille, couple ou mariage) : ';
    };

    /* ----- Validation ----- */
    const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/i;
    const PHONE_RE = /^\+?[0-9 ()./-]{8,20}$/;
    const TYPOS = { 'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.fr': 'gmail.com', 'gamil.com': 'gmail.com', 'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmail.co': 'hotmail.com', 'outlok.com': 'outlook.com', 'outlook.co': 'outlook.com', 'yahoo.co': 'yahoo.com', 'skynet.b': 'skynet.be', 'telenet.b': 'telenet.be', 'proximus.b': 'proximus.be' };
    function setStatus(kind, html) {
      status.className = 'form__status' + (kind ? ' is-' + kind : '');
      status.innerHTML = html || '';
    }
    function clearErrors() {
      $$('[aria-invalid="true"]', form).forEach((el) => el.removeAttribute('aria-invalid'));
      $$('.field__error', form).forEach((el) => { el.textContent = ''; el.hidden = true; });
      setStatus('', '');
    }
    function showError(name, message, html) {
      const input = form.elements[name];
      const box = $('#err-' + name, form);
      if (input && input.setAttribute) input.setAttribute('aria-invalid', 'true');
      if (box) { if (html) box.innerHTML = html; else box.textContent = message; box.hidden = false; }
    }
    form.addEventListener('input', (e) => {
      const n = e.target.name;
      if (!n || e.target.getAttribute('aria-invalid') !== 'true') return;
      e.target.removeAttribute('aria-invalid');
      const box = $('#err-' + n, form);
      if (box) { box.textContent = ''; box.hidden = true; }
    });
    ['email', 'phone'].forEach((n) => {
      const el = form.elements[n];
      if (!el) return;
      el.addEventListener('blur', () => {
        const v = el.value.trim();
        if (!v) return;
        if (n === 'email' && !EMAIL_RE.test(v)) showError('email', 'Cette adresse e-mail ne semble pas valide.');
        if (n === 'phone' && !PHONE_RE.test(v)) showError('phone', 'Ce numéro ne semble pas valide.');
      });
    });

    function collect() {
      const need = radio('besoin');
      return {
        form: 'devis', besoin: need,
        personnes: need === 'equipe' ? val('personnes') : '',
        heures: need === 'evenement' ? val('heures') : '',
        biens: need === 'immobilier' ? val('biens') : '',
        date: val('date'), lieu: val('lieu'),
        name: val('name'), societe: val('societe'), email: val('email'), phone: val('phone'), message: val('message'),
        estimation: est ? Number(est.dataset.total || 0) : 0,
        consent: checked('consent'), website: val('website'), elapsed: Date.now() - startedAt
      };
    }
    function validate(data) {
      const errors = {};
      if (!data.besoin) errors.besoin = 'Choisissez le type de prestation.';
      if (data.name.length < 2) errors.name = 'Indiquez votre nom.';
      if (!data.email) errors.email = 'Indiquez votre adresse e-mail.';
      else if (!EMAIL_RE.test(data.email)) errors.email = 'Cette adresse e-mail ne semble pas valide.';
      if (data.phone && !PHONE_RE.test(data.phone)) errors.phone = 'Ce numéro ne semble pas valide.';
      if (data.date && data.date < today()) errors.date = 'Cette date est déjà passée.';
      if (data.message.length < 10) errors.message = 'Décrivez votre projet en quelques mots (10 caractères minimum).';
      else if ((data.message.match(/https?:\/\/|www\./gi) || []).length > 1) errors.message = 'Un seul lien maximum dans le message, s’il vous plaît.';
      if (!data.consent) errors.consent = 'Cochez la case pour que Hani puisse vous répondre.';
      return errors;
    }
    function typoHint(email) {
      const at = email.lastIndexOf('@');
      if (at < 1) return '';
      const domain = email.slice(at + 1).toLowerCase();
      return TYPOS[domain] ? email.slice(0, at + 1) + TYPOS[domain] : '';
    }
    function summary(data) {
      const lines = ['Demande de devis — ' + (NEEDS[data.besoin] || '')];
      if (data.personnes) lines.push('Nombre de personnes : ' + data.personnes);
      if (data.heures) lines.push('Durée : ' + data.heures + ' h');
      if (data.biens) lines.push('Nombre de biens : ' + data.biens);
      if (data.date) lines.push('Date souhaitée : ' + data.date.split('-').reverse().join('/'));
      if (data.lieu) lines.push('Lieu : ' + (LIEUX[data.lieu] || data.lieu));
      if (data.estimation) lines.push('Estimation affichée : ' + euro(data.estimation) + ' HTVA (indicatif)');
      lines.push('', 'Nom : ' + data.name);
      if (data.societe) lines.push('Société : ' + data.societe);
      lines.push('E-mail : ' + data.email);
      if (data.phone) lines.push('Téléphone : ' + data.phone);
      lines.push('', data.message);
      return lines.join('\n');
    }
    function mailto(data) {
      const subject = 'Devis ' + (NEEDS[data.besoin] || '') + ' — ' + data.name + (data.societe ? ' (' + data.societe + ')' : '');
      return 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(summary(data));
    }
    function success(data, viaMail) {
      const first = data.name.split(' ')[0].replace(/[<>&"]/g, '');
      setStatus('ok', '<strong>Merci' + (first ? ', ' + first : '') + '&nbsp;!</strong> ' + (viaMail
        ? 'Votre messagerie s’est ouverte avec la demande prête à envoyer à ' + EMAIL + '. Hani vous répond personnellement dès réception.'
        : 'Votre demande est bien partie. Hani l’étudie et revient vers vous avec une proposition claire.'));
      try { localStorage.setItem(KEY + 'last_submit', String(Date.now())); } catch (e) { /* rien */ }
      track('generate_lead', { form_type: 'devis', need: data.besoin, value: data.estimation || 0, currency: 'EUR', method: viaMail ? 'mailto' : 'api' });
      if (!viaMail) { form.reset(); sync(); }
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors();
      const data = collect();
      // Anti-spam 1 : champ piège rempli par un robot → on fait comme si tout allait bien
      if (data.website) { success(data, false); return; }
      const errors = validate(data);
      const keys = Object.keys(errors);
      if (keys.length) {
        keys.forEach((k) => showError(k, errors[k]));
        setStatus('error', keys.length > 1 ? 'Merci de corriger les ' + keys.length + ' champs indiqués.' : 'Merci de corriger le champ indiqué.');
        const firstBad = $('[aria-invalid="true"]', form) || (errors.besoin && $('input[name="besoin"]', form));
        if (firstBad) firstBad.focus();
        track('form_error', { fields: keys.join(',') });
        return;
      }
      const hint = typoHint(data.email);
      if (hint && !form.dataset.typoChecked) {
        form.dataset.typoChecked = '1';
        showError('email', '', 'Vouliez-vous dire <button type="button" class="link" data-fix-email>' + hint.replace(/[<>&"]/g, '') + '</button>&nbsp;?');
        const fix = $('[data-fix-email]', form);
        if (fix) fix.addEventListener('click', () => { form.elements.email.value = hint; form.elements.email.removeAttribute('aria-invalid'); const b = $('#err-email', form); b.textContent = ''; b.hidden = true; });
        return;
      }
      // Anti-spam 2 : envoi trop rapide pour un humain
      if (data.elapsed < 3000) { setStatus('error', 'Un instant… réessayez dans quelques secondes.'); return; }
      // Anti-spam 3 : une demande par minute depuis ce navigateur
      let last = 0;
      try { last = Number(localStorage.getItem(KEY + 'last_submit') || 0); } catch (err) { last = 0; }
      if (Date.now() - last < 60000) { setStatus('error', 'Votre demande vient d’être envoyée. Patientez une minute avant d’en envoyer une autre.'); return; }

      const api = (d.dataset.api || '').trim().replace(/\/$/, '');
      if (!api) {
        // Sans API (maquette, hébergement statique) : la messagerie du visiteur prend le relais
        window.location.href = mailto(data);
        success(data, true);
        return;
      }
      form.classList.add('is-sending');
      submit.setAttribute('aria-busy', 'true');
      const controller = 'AbortController' in window ? new AbortController() : null;
      const timer = setTimeout(() => controller && controller.abort(), 12000);
      try {
        const res = await fetch(api + '/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(data),
          signal: controller ? controller.signal : undefined
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.ok) { success(data, false); return; }
        if (json.fields) Object.keys(json.fields).forEach((k) => showError(k, json.fields[k]));
        setStatus('error', (json.error || 'Envoi impossible pour le moment.').replace(/[<>&]/g, ''));
      } catch (err) {
        setStatus('error', 'Connexion impossible. <a href="' + mailto(data).replace(/"/g, '&quot;') + '">Envoyer la demande par e-mail</a> ou appelez le +32&nbsp;485&nbsp;87&nbsp;88&nbsp;42.');
      } finally {
        clearTimeout(timer);
        form.classList.remove('is-sending');
        submit.removeAttribute('aria-busy');
      }
    });
    sync();
  });

  /* ---------- Barre d’action mobile : après le héros, cachée près du formulaire ---------- */
  safe('dock', () => {
    const dock = $('[data-dock]');
    if (!dock) return;
    const contact = $('#contact');
    const footer = $('.ftr');
    let near = false;
    if ('IntersectionObserver' in window) {
      const seen = new Set();
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target); });
        near = seen.size > 0;
        update();
      }, { threshold: 0.05 });
      if (contact) io.observe(contact);
      if (footer) io.observe(footer);
    }
    function update() {
      const after = window.scrollY > (hero ? hero.offsetHeight * 0.6 : 300);
      dock.classList.toggle('is-on', after && !near && !introOn);
    }
    update();
    window.addEventListener('scroll', update, { passive: true });
  });

  /* ---------- Animations : réduire / réactiver ---------- */
  safe('motion', () => {
    $$('[data-motion-toggle]').forEach((b) => {
      b.textContent = reduced ? 'Réactiver les animations' : 'Réduire les animations';
      b.addEventListener('click', () => {
        try { localStorage.setItem(KEY + 'motion', reduced ? 'full' : 'reduce'); } catch (e) { /* rien */ }
        const url = new URL(location.href);
        url.searchParams.delete('motion');
        location.replace(url.toString());
      });
    });
  });

  /* ---------- Page 404 : retrouver la bonne page depuis une ancienne adresse ---------- */
  safe('404', () => {
    if (PAGE !== '404') return;
    track('page_404', { path: location.pathname });
    const path = decodeURIComponent(location.pathname.toLowerCase());
    const base = d.dataset.base || '';
    const guesses = [
      [/corporate|linkedin|entreprise|equipe|dirigeant/, '/#prestations', 'Les portraits d’entreprise'],
      [/evenement|soiree|conference|sport/, '/#prestations', 'Les reportages d’événements'],
      [/immobilier|visite-virtuelle|360|lieu/, '/#prestations', 'L’immobilier et les visites 360°'],
      [/tarif|prix|bon-cadeau|offre/, '/#tarifs', 'Les tarifs'],
      [/portfolio|galerie|portrait|mariage|couple|famille|grossesse|paysage/, '/#realisations', 'Les réalisations'],
      [/presse|reference|collaboration/, '/#presse', 'Presse et références'],
      [/studio|a-propos|charte|uccle|ixelles|schaerbeek|woluwe/, '/#studio', 'Le studio et Hani'],
      [/avis/, '/#avis', 'Les avis clients'],
      [/faq|conseil|journal/, '/#faq', 'Les questions fréquentes'],
      [/contact|reservation|devis/, '/#contact', 'Le formulaire de devis'],
      [/confidentialit|privacy|rgpd|cookie|politique/, '/confidentialite.html', 'La politique de confidentialité'],
      [/cgv|cgu|mention|condition|legal|empreinte/, '/cgu.html', 'Les conditions et mentions légales']
    ];
    const hit = guesses.find((g) => g[0].test(path));
    const box = $('[data-guess]');
    if (hit && box) {
      box.innerHTML = 'Vous cherchiez peut-être&nbsp;: <a href="' + base + hit[1] + '">' + hit[2] + '</a>.';
      box.hidden = false;
    }
  });

  d.classList.add('js-ready');
})();
