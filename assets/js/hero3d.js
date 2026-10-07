/* ==========================================================================
   Hani Kanaftchian — mise en place de l’appareil 3D de l’intro
   Le module Three.js n’est chargé que si l’intro est jouée (ou rejouée) et si
   l’écran sait faire de la 3D (WebGL) ; sinon une image fixe de l’appareil
   prend le relais et l’intro garde son flash.
   ========================================================================== */
const d = document.documentElement;
const stage = document.querySelector('[data-stage]');
let loading = null;

function webgl() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}

function ready() {
  d.classList.add('cam-ready');
  window.dispatchEvent(new CustomEvent('hk:cam-ready'));
}

function load() {
  if (loading || !stage) return loading;
  if (d.classList.contains('reduced') || !webgl()) {
    d.classList.add('no-3d');
    window.dispatchEvent(new CustomEvent('hk:cam-ready'));
    return (loading = Promise.resolve(null));
  }
  const base = d.dataset.base || '';
  loading = import('./camera3d.js?v=fc84a56ef3').then(async ({ createCamera3D }) => {
    const api = await createCamera3D(stage, {
      screenSrc: base + '/assets/img/hero-albertine-560.webp',
      wordmarkSrc: base + '/assets/img/camera-wordmark.svg',
      monogramSrc: base + '/assets/img/hk-monogram.svg',
      onFirstFrame: ready
    });
    window.__hkCam = api;
    if (!d.classList.contains('intro-on')) api.pause();
    return api;
  }).catch((e) => {
    console.warn('[hk] 3D indisponible', e);
    d.classList.add('no-3d');
    window.dispatchEvent(new CustomEvent('hk:cam-ready'));
    return null;
  });
  return loading;
}

if (d.classList.contains('intro-on')) load();
window.addEventListener('hk:need-cam', load);
