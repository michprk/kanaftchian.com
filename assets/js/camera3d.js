/* ==========================================================================
   Hani Kanaftchian — l’appareil photo de l’intro, en 3D (Three.js)
   Un hybride plein format d’aujourd’hui, modélisé dans le code (aucun
   fichier 3D) : boîtier magnésium noir, poignée gainée, viseur électronique,
   écran orientable allumé sur un portrait, zoom 24-70 mm f/2.8 à bague rouge.
   « KANAFTCHIAN » est gravé sur le viseur, le monogramme HK doré sur la poignée.

   Au repos, l’appareil tourne lentement sur lui-même et suit la souris.
   shoot() : il termine son tour dans le même sens jusqu’à regarder le visiteur,
   avance, le voyant d’autofocus s’allume, la mise au point tourne, le
   diaphragme se ferme, le déclencheur s’enfonce… et la promesse se résout à
   l’instant du déclic avec la position de l’objectif à l’écran.
   ========================================================================== */
import * as THREE from '../vendor/three.module.min.js';

const TAU = Math.PI * 2;
const GOLD = 0xc9a84c;
const RED = 0xb3121d;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const out3 = (t) => 1 - Math.pow(1 - t, 3);

/* ---------- Géométries ---------- */
function rrect(w, h, r) {
  const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
  const s = new THREE.Shape();
  const x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
  s.moveTo(x0 + bl, y0);
  s.lineTo(x1 - br, y0);
  if (br) s.absarc(x1 - br, y0 + br, br, -Math.PI / 2, 0, false);
  s.lineTo(x1, y1 - tr);
  if (tr) s.absarc(x1 - tr, y1 - tr, tr, 0, Math.PI / 2, false);
  s.lineTo(x0 + tl, y1);
  if (tl) s.absarc(x0 + tl, y1 - tl, tl, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, y0 + bl);
  if (bl) s.absarc(x0 + bl, y0 + bl, bl, Math.PI, Math.PI * 1.5, false);
  return s;
}

// Trapèze aux angles hauts arrondis (vue de face du viseur)
function trapezoid(wBottom, wTop, h, r) {
  const s = new THREE.Shape();
  const b = wBottom / 2, t = wTop / 2, y0 = -h / 2, y1 = h / 2;
  s.moveTo(-b, y0);
  s.lineTo(b, y0);
  s.lineTo(t + r * 0.35, y1 - r);
  s.quadraticCurveTo(t, y1, t - r, y1);
  s.lineTo(-t + r, y1);
  s.quadraticCurveTo(-t, y1, -t - r * 0.35, y1 - r);
  s.closePath();
  return s;
}

// Normales lissées sous un angle de pli : reflets continus sur les biseaux
function crease(geo, angle) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  const pos = geo.attributes.position, n = pos.count;
  const cos = Math.cos(angle || Math.PI / 3.4);
  const fw = new Float32Array(n * 3), fu = new Float32Array(n * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    c.sub(b); a.sub(b); c.cross(a);
    const len = c.length() || 1;
    for (let k = 0; k < 3; k++) {
      fw.set([c.x, c.y, c.z], (i + k) * 3);
      fu.set([c.x / len, c.y / len, c.z / len], (i + k) * 3);
    }
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const k = Math.round(pos.getX(i) * 2e3) + '|' + Math.round(pos.getY(i) * 2e3) + '|' + Math.round(pos.getZ(i) * 2e3);
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(i);
  }
  const outN = new Float32Array(n * 3);
  for (const list of groups.values()) {
    for (const i of list) {
      let sx = 0, sy = 0, sz = 0;
      const ux = fu[i * 3], uy = fu[i * 3 + 1], uz = fu[i * 3 + 2];
      for (const j of list) {
        if (ux * fu[j * 3] + uy * fu[j * 3 + 1] + uz * fu[j * 3 + 2] >= cos) { sx += fw[j * 3]; sy += fw[j * 3 + 1]; sz += fw[j * 3 + 2]; }
      }
      const l = Math.hypot(sx, sy, sz) || 1;
      outN[i * 3] = sx / l; outN[i * 3 + 1] = sy / l; outN[i * 3 + 2] = sz / l;
    }
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(outN, 3));
  return geo;
}

// Extrusion le long de Z, centrée ; `shear(x, y, z)` peut déformer les sommets avant le calcul des normales
function slab(shape, depth, bevel, segs, shear) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: segs || 6, curveSegments: 28
  });
  g.translate(0, 0, -depth / 2);
  if (shear) {
    const p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      shear(v);
      p.setXYZ(i, v.x, v.y, v.z);
    }
  }
  return crease(g, Math.PI / 3.2);
}

// Profil tourné autour de l’axe de l’objectif (+Z) : points [rayon, distance]
function lathe(points, segs) {
  const g = new THREE.LatheGeometry(points.map(([r, h]) => new THREE.Vector2(r, h)), segs || 128);
  g.rotateX(Math.PI / 2);
  return g;
}

function cylinder(r, h, segs, open) {
  return new THREE.CylinderGeometry(r, r, h, segs || 96, 1, !!open);
}

// Calotte sphérique de rayon de base `base` et de flèche `sag`, tournée vers +Z
function sphereCap(base, sag) {
  const R = (base * base + sag * sag) / (2 * sag);
  const theta = Math.asin(base / R);
  const g = new THREE.SphereGeometry(R, 96, 24, 0, TAU, 0, theta);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, -R * Math.cos(theta));
  return g;
}

/* ---------- Textures dessinées ---------- */
function canvasTex(w, h, draw, srgb) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Carte de hauteur → carte de normales (bruit aléatoire répété)
function bumpNormal(N, count, rMin, rMax, strength, seed0) {
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d');
  x.fillStyle = '#808080';
  x.fillRect(0, 0, N, N);
  let seed = seed0 || 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    const px = rnd() * N, py = rnd() * N, r = rMin + rnd() * (rMax - rMin);
    const v = 70 + rnd() * 120;
    x.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
    x.beginPath();
    for (let k = -1; k <= 1; k++) for (let m = -1; m <= 1; m++) x.moveTo(px + k * N + r, py + m * N), x.arc(px + k * N, py + m * N, r, 0, TAU);
    x.fill();
  }
  const src = x.getImageData(0, 0, N, N).data;
  const out = x.createImageData(N, N);
  const hgt = (i, j) => src[(((j + N) % N) * N + ((i + N) % N)) * 4] / 255;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const dx = (hgt(i + 1, j) - hgt(i - 1, j)) * strength;
      const dy = (hgt(i, j + 1) - hgt(i, j - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const o = (j * N + i) * 4;
      out.data[o] = (-dx / l * 0.5 + 0.5) * 255;
      out.data[o + 1] = (dy / l * 0.5 + 0.5) * 255;
      out.data[o + 2] = (1 / l * 0.5 + 0.5) * 255;
      out.data[o + 3] = 255;
    }
  }
  x.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Côtes de caoutchouc (créneaux adoucis) → carte de normales
function ribNormal(count, duty) {
  const t = canvasTex(2048, 8, (x, w, h) => {
    const img = x.createImageData(w, h);
    const prof = (u) => { const f = ((u % 1) + 1) % 1; const e = 0.08; if (f < e) return f / e; if (f < duty) return 1; if (f < duty + e) return 1 - (f - duty) / e; return 0; };
    for (let i = 0; i < w; i++) {
      const u = (i / w) * count;
      const d = (prof(u + 0.004) - prof(u - 0.004)) / 0.008;
      const nx = clamp(d * 0.065, -0.85, 0.85), nz = Math.sqrt(1 - nx * nx);
      for (let j = 0; j < h; j++) {
        const o = (j * w + i) * 4;
        img.data[o] = (nx * 0.5 + 0.5) * 255; img.data[o + 1] = 128; img.data[o + 2] = (nz * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
  }, false);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// Moletage → carte de normales en bandes
function knurlNormal(count) {
  const t = canvasTex(1024, 8, (x, w, h) => {
    const img = x.createImageData(w, h);
    for (let i = 0; i < w; i++) {
      const s = Math.sin((i / w) * count * TAU);
      const nx = s * 0.75, nz = Math.sqrt(1 - nx * nx);
      for (let j = 0; j < h; j++) {
        const o = (j * w + i) * 4;
        img.data[o] = (nx * 0.5 + 0.5) * 255; img.data[o + 1] = 128; img.data[o + 2] = (nz * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
  }, false);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function ringText(text, opts) {
  const o = Object.assign({ size: 1024, radius: 0.47, font: '600 30px Manrope, sans-serif', color: '#e9e7e2', start: -Math.PI / 2, accent: null }, opts);
  return canvasTex(o.size, o.size, (x, w) => {
    x.translate(w / 2, w / 2);
    x.font = o.font;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const chars = Array.from(text);
    const R = w * o.radius;
    const widths = chars.map((ch) => x.measureText(ch).width + w * 0.003);
    const total = widths.reduce((s, v) => s + v, 0);
    let a = o.start - (total / R) / 2;
    chars.forEach((ch, i) => {
      const half = widths[i] / 2 / R;
      a += half;
      x.save();
      x.rotate(a + Math.PI / 2);
      x.fillStyle = o.accent && ch === '◆' ? o.accent : o.color;
      x.fillText(ch === '◆' ? '●' : ch, 0, -R);
      x.restore();
      a += half;
    });
  });
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

/* ---------- Environnement studio (boîtes à lumière) ---------- */
function studioEnvironment(renderer) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), new THREE.MeshBasicMaterial({ color: 0x060606, side: THREE.BackSide })));
  const panel = (w, h, color, k, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(...(look || [0, 0, 0]));
    env.add(m);
  };
  panel(10, 5, 0xffffff, 2.6, [0, 11, 1]);             // grande boîte à lumière au-dessus
  panel(14, 5, 0xffffff, 0.8, [0, 7, 10]);              // grand dégradé avant-haut : reflet sur le capot
  panel(2.4, 13, 0xfff7ee, 3.6, [-10.5, 1, 3]);        // strip vertical à gauche
  panel(1.8, 11, 0xeef2ff, 2.7, [10.5, 2, 1]);         // strip froid à droite
  panel(9, 1.4, 0xffe2a8, 3.2, [0, 3.5, -11]);         // liseré doré en contre-jour
  panel(3.5, 9, 0xffe7bd, 2.2, [-8, 1, -8]);           // contre-jour doré latéral
  panel(3.5, 9, 0xffffff, 1.8, [8, 1, -8]);
  panel(12, 3, 0xffffff, 0.45, [0, -5, 9]);            // réflecteur bas, face
  panel(9, 6, 0xffffff, 0.32, [0, 1, 12]);            // voile de face très doux
  panel(3.4, 3.4, 0xffffff, 1.5, [-6, 5, 9]);          // parapluie avant gauche
  // couronne de diffuseurs : le noir garde des reflets sous tous les angles
  [1.6, 0.35, 1.1, 0.25, 2.0, 0.5, 1.3, 0.3, 1.0, 0.4].forEach((k, i) => {
    const a = (i / 10) * TAU + 0.2;
    panel(3.0, 4.2, i % 3 ? 0xffffff : 0xfff0d8, k, [Math.sin(a) * 12, 0.8, Math.cos(a) * 12]);
  });
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.02);
  pmrem.dispose();
  return rt.texture;
}

// Reflets propres au verre traité : boîtes à lumière douces, un anneau, une touche dorée
function softTex(ring) {
  return canvasTex(256, 256, (x, w) => {
    const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    if (ring) {
      g.addColorStop(0.55, 'rgba(255,255,255,0)'); g.addColorStop(0.78, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    } else {
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    }
    x.fillStyle = g; x.fillRect(0, 0, w, w);
  }, false);
}
function lensEnvironment(renderer) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), new THREE.MeshBasicMaterial({ color: 0x040405, side: THREE.BackSide })));
  const soft = softTex(false), ring = softTex(true);
  const add = (size, tex, color, k, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), new THREE.MeshBasicMaterial({ map: tex, transparent: true, color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide, depthWrite: false }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  add([7, 7], ring, 0xffffff, 1.6, [0, 0, 11]);          // anneau de lumière (ring light) face à l’objectif
  add([5, 3.2], soft, 0xffffff, 1.8, [-3, 3.4, 9]);      // boîte à lumière haute gauche
  add([1.4, 6], soft, 0xeef2ff, 1.6, [3.6, 0.4, 9]);     // strip droit
  add([1.6, 1.6], soft, GOLD, 2.2, [-2, -2.6, 9]);       // touche dorée
  add([6, 6], soft, 0xffffff, 1.4, [-9, 3, 5]);
  add([1.2, 8], soft, 0xf6f1ea, 1.6, [9, 1, 5]);
  add([8, 1.2], soft, 0xffffff, 1.0, [0, 7, 7]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.01);
  pmrem.dispose();
  return rt.texture;
}

/* ---------- L’appareil ---------- */
// Repères (unités ≈ 40 mm) : l’objectif regarde +Z, la poignée est à gauche (x < 0) vue de face.
const W = 3.4, BEV = 0.07;
const BODY_BOTTOM = -1.12, SHOULDER = 0.78;
const FRONT = 0.5, BACK = -0.5;
const LX = 0.32, LY = -0.1;          // axe de l’objectif
const LENS_LEN = 1.75;               // de la baïonnette à la lentille frontale
const PIVOT_Z = 0.8;                // l’appareil tourne autour de son centre (boîtier + objectif)

function buildCamera(assets) {
  const rig = new THREE.Group();
  const model = new THREE.Group();
  model.position.z = -PIVOT_Z;
  rig.add(model);

  const paintN = bumpNormal(256, 9000, 0.4, 1.1, 0.9, 11);
  paintN.repeat.set(5, 5);
  const rubberN = bumpNormal(256, 2600, 1.2, 3.0, 2.2, 7);
  rubberN.repeat.set(3.2, 3.2);
  const knurl = knurlNormal(140);

  const mat = {
    paint: new THREE.MeshPhysicalMaterial({ color: 0x18181b, metalness: 0.3, roughness: 0.4, normalMap: paintN, normalScale: new THREE.Vector2(0.12, 0.12), clearcoat: 0.55, clearcoatRoughness: 0.32 }),
    rubber: new THREE.MeshPhysicalMaterial({ color: 0x111113, metalness: 0, roughness: 0.78, normalMap: rubberN, normalScale: new THREE.Vector2(0.6, 0.6), sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x2c2c30) }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0x151517, metalness: 0.35, roughness: 0.36, clearcoat: 0.45, clearcoatRoughness: 0.25 }),
    ribs: new THREE.MeshPhysicalMaterial({ color: 0x0f0f11, metalness: 0, roughness: 0.72, sheen: 0.3, sheenColor: new THREE.Color(0x2a2a2e) }),
    zoom: new THREE.MeshPhysicalMaterial({ color: 0x111113, metalness: 0, roughness: 0.7, normalMap: ribNormal(64, 0.55), normalScale: new THREE.Vector2(1.6, 1.6), sheen: 0.3, sheenColor: new THREE.Color(0x2a2a2e) }),
    focus: new THREE.MeshPhysicalMaterial({ color: 0x111113, metalness: 0, roughness: 0.7, normalMap: ribNormal(120, 0.5), normalScale: new THREE.Vector2(1.4, 1.4), sheen: 0.3, sheenColor: new THREE.Color(0x2a2a2e) }),
    knurled: new THREE.MeshPhysicalMaterial({ color: 0x232327, metalness: 0.85, roughness: 0.32, normalMap: knurl, normalScale: new THREE.Vector2(1.2, 1.2) }),
    chrome: new THREE.MeshPhysicalMaterial({ color: 0xdadade, metalness: 1, roughness: 0.14 }),
    red: new THREE.MeshPhysicalMaterial({ color: RED, metalness: 0.15, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08 }),
    button: new THREE.MeshPhysicalMaterial({ color: 0x1c1c1f, metalness: 0.2, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x020203, roughness: 0.95, metalness: 0 }),
    blade: new THREE.MeshStandardMaterial({ color: 0x1d1d21, metalness: 0.85, roughness: 0.4, side: THREE.DoubleSide })
  };
  const add = (geo, m, x, y, z, parent) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x || 0, y || 0, z || 0);
    (parent || model).add(mesh);
    return mesh;
  };
  const decal = (tex, w, h, x, y, z, opts) => {
    const o = Object.assign({ metalness: 0.2, roughness: 0.5 }, opts);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshPhysicalMaterial({ map: tex, transparent: true, metalness: o.metalness, roughness: o.roughness, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.set(x, y, z);
    m.renderOrder = 2;
    (o.parent || model).add(m);
    return m;
  };

  /* ----- Boîtier ----- */
  const bodyH = SHOULDER - BODY_BOTTOM;
  const bodyCY = (SHOULDER + BODY_BOTTOM) / 2;
  add(slab(rrect(W - 2 * BEV, bodyH - 2 * BEV, [0.3, 0.3, 0.16, 0.16]), FRONT - BACK - 2 * BEV, BEV), mat.paint, 0, bodyCY, 0);

  // Poignée gainée, profonde (vue de face : à gauche)
  const GB = 0.19, GX0 = -W / 2, GX1 = -0.92, GTOP = 0.72;
  const gw = GX1 - GX0, gh = GTOP - BODY_BOTTOM;
  const gripFront = FRONT + 0.64;
  add(slab(rrect(gw - 2 * GB, gh - 2 * GB, [0.16, 0.12, 0.12, 0.16]), 0.72 - 2 * GB, GB, 8, (v) => {
    // le haut de la poignée descend vers l’avant (doigt sur le déclencheur)
    const front = clamp((v.z + 0.17) / 0.34, 0, 1);
    const top = clamp((v.y - (gh / 2 - 0.55)) / 0.55, 0, 1);
    v.y -= 0.22 * front * top * top;
  }), mat.rubber, (GX0 + GX1) / 2, (GTOP + BODY_BOTTOM) / 2, gripFront - 0.36);

  // Viseur : trapèze dont la face avant fuit vers l’arrière (prisme)
  const HB = 0.06, H0 = 0.6, H1 = 1.42, HD = 0.96;
  const hz = -0.06;
  add(slab(trapezoid(1.5 - 2 * HB, 1.0 - 2 * HB, H1 - H0 - 2 * HB, 0.12), HD - 2 * HB, HB, 6, (v) => {
    const y = v.y + (H0 + H1) / 2;
    const t = clamp((y - SHOULDER) / (H1 - SHOULDER), 0, 1);
    if (v.z > 0) v.z -= 0.36 * t * clamp(v.z / (HD / 2), 0, 1.2);
  }), mat.paint, LX, (H0 + H1) / 2, hz);
  // gravure « KANAFTCHIAN » sur la face avant inclinée du viseur
  const slope = Math.atan2(0.36, H1 - SHOULDER);
  const wmY = 1.12;
  const wmZ = hz + HD / 2 - 0.36 * clamp((wmY - SHOULDER) / (H1 - SHOULDER), 0, 1) + 0.006;
  if (assets.wordmark) {
    const tex = canvasTex(1024, 160, (x, w, h) => {
      const k = Math.min(w / assets.wordmark.width, h / assets.wordmark.height) * 0.94;
      const iw = assets.wordmark.width * k, ih = assets.wordmark.height * k;
      x.drawImage(assets.wordmark, (w - iw) / 2, (h - ih) / 2, iw, ih);
    });
    const wm = decal(tex, 0.86, 0.134, LX, wmY, wmZ, { metalness: 0.3, roughness: 0.35 });
    wm.rotation.x = -slope;
  }
  // griffe porte-accessoire
  add(new THREE.BoxGeometry(0.5, 0.035, 0.42), mat.chrome, LX, H1 + 0.005, hz - 0.08);
  add(new THREE.BoxGeometry(0.38, 0.03, 0.34), mat.dark, LX, H1 + 0.03, hz - 0.08);

  // Écran supérieur (à droite du viseur pour le photographe)
  const top = canvasTex(512, 320, (x, w, h) => {
    x.fillStyle = '#060708'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#e9ecef';
    x.font = '600 64px Manrope, sans-serif';
    x.textBaseline = 'middle';
    x.fillText('F2.8', 34, 84);
    x.fillText('1/200', 250, 84);
    x.font = '600 40px Manrope, sans-serif';
    x.fillText('ISO 100', 34, 190);
    x.fillText('AWB', 250, 190);
    x.fillStyle = '#c9a84c';
    x.fillText('[ 999 ]', 34, 268);
    x.fillStyle = '#e9ecef';
    x.fillRect(400, 250, 70, 34); x.fillStyle = '#060708'; x.fillRect(404, 254, 20, 26);
  });
  const lcdTop = add(new THREE.PlaneGeometry(0.66, 0.42), new THREE.MeshPhysicalMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: top, emissiveIntensity: 0.55, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }), -0.92, SHOULDER + 0.006, -0.12);
  lcdTop.rotation.x = -Math.PI / 2;
  add(slab(rrect(0.74, 0.5, 0.05), 0.01, 0.008), mat.button, -0.92, SHOULDER - 0.002, -0.12).rotation.x = -Math.PI / 2;

  // Déclencheur sur le haut de la poignée, molette principale juste derrière
  const shutter = new THREE.Group();
  const SHY = GTOP - 0.17, SHZ = gripFront - 0.24;
  shutter.position.set((GX0 + GX1) / 2 + 0.02, SHY, SHZ);
  shutter.rotation.x = 0.42;
  model.add(shutter);
  add(cylinder(0.15, 0.05, 64), mat.chrome, 0, 0, 0, shutter);
  const btn = add(cylinder(0.115, 0.07, 64), mat.button, 0, 0.04, 0, shutter);
  const mainDial = add(cylinder(0.2, 0.09, 96), [mat.knurled, mat.button, mat.knurled], (GX0 + GX1) / 2 + 0.02, SHOULDER - 0.03, FRONT - 0.02);
  mainDial.rotation.x = 0.12;
  // petits boutons du dessus
  [[-0.55, 0.25], [-0.75, 0.25], [-1.08, 0.3]].forEach(([x, z]) => add(cylinder(0.055, 0.04, 32), mat.button, x, SHOULDER + 0.01, z));
  // molette arrière du dessus, interrupteur et bouton MODE à gauche
  add(cylinder(0.21, 0.1, 96), [mat.knurled, mat.button, mat.knurled], -1.32, SHOULDER - 0.02, BACK + 0.16);
  add(cylinder(0.16, 0.05, 64), mat.button, 1.18, SHOULDER + 0.015, -0.18);
  const power = add(new THREE.BoxGeometry(0.2, 0.04, 0.07), mat.button, 1.32, SHOULDER + 0.04, -0.18);
  power.rotation.y = 0.5;
  add(cylinder(0.07, 0.04, 32), mat.button, 1.12, SHOULDER + 0.01, 0.2);

  // Œillets de courroie
  [-W / 2 - 0.02, W / 2 + 0.02].forEach((x) => {
    const t = add(new THREE.TorusGeometry(0.07, 0.02, 12, 32), mat.chrome, x, 0.48, 0.05);
    t.rotation.y = Math.PI / 2;
  });

  // Monogramme HK doré sur le haut de la poignée
  if (assets.monogram) {
    const tex = canvasTex(256, 256, (x, w, h) => {
      const k = Math.min(w / assets.monogram.width, h / assets.monogram.height) * 0.9;
      x.drawImage(assets.monogram, (w - assets.monogram.width * k) / 2, (h - assets.monogram.height * k) / 2, assets.monogram.width * k, assets.monogram.height * k);
    });
    decal(tex, 0.3, 0.3, (GX0 + GX1) / 2, 0.08, gripFront + 0.001, { metalness: 0.75, roughness: 0.3 });
  }

  // Façade : voyant d’autofocus, boutons, déverrouillage
  const lamp = add(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 32), new THREE.MeshStandardMaterial({ color: 0x2a1408, emissive: 0xffa33a, emissiveIntensity: 0.05, roughness: 0.15 }), -0.66, 0.5, FRONT + 0.005);
  lamp.rotation.x = Math.PI / 2;
  [[-0.72, -0.25], [-0.72, -0.5]].forEach(([x, y]) => add(cylinder(0.065, 0.04, 32), mat.button, x, y, FRONT + 0.01).rotation.x = Math.PI / 2);
  add(cylinder(0.11, 0.05, 48), mat.button, LX + 1.06, LY - 0.36, FRONT + 0.01).rotation.x = Math.PI / 2;

  /* ----- Dos : écran orientable, viseur, boutons ----- */
  const screenFrame = add(slab(rrect(2.0, 1.34, 0.06), 0.06, 0.02), mat.paint, 0.36, -0.24, BACK - 0.05);
  add(cylinder(0.05, 1.1, 32), mat.button, 1.38, -0.24, BACK - 0.05);
  const lcdTex = canvasTex(960, 640, (x, w, h) => drawScreen(x, w, h, assets.screen));
  const lcd = add(new THREE.PlaneGeometry(1.88, 1.24), new THREE.MeshPhysicalMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: lcdTex, emissiveIntensity: 1, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04 }), 0.36, -0.24, BACK - 0.111);
  lcd.rotation.y = Math.PI;
  // œilleton
  add(slab(rrect(0.78, 0.5, 0.16), 0.16, 0.05), mat.rubber, LX, 1.05, hz - HD / 2 - 0.08);
  add(new THREE.PlaneGeometry(0.44, 0.26), new THREE.MeshPhysicalMaterial({ color: 0x05060a, roughness: 0.05, metalness: 0.2, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.4 }), LX, 1.05, hz - HD / 2 - 0.211).rotation.y = Math.PI;
  // repose-pouce, AF-ON, joystick, molette de contrôle rapide
  add(slab(rrect(0.46, 0.58, 0.2), 0.02, 0.015), mat.rubber, -1.36, 0.32, BACK - 0.012);
  add(cylinder(0.12, 0.05, 48), mat.button, -0.98, 0.5, BACK - 0.03).rotation.x = Math.PI / 2;
  add(cylinder(0.065, 0.1, 32), mat.button, -1.12, 0.06, BACK - 0.05).rotation.x = Math.PI / 2;
  add(lathe([[0.22, 0], [0.33, 0], [0.34, 0.025], [0.32, 0.05], [0.22, 0.05]], 96), mat.knurled, -1.1, -0.5, BACK - 0.06).rotation.y = Math.PI;
  add(cylinder(0.12, 0.04, 48), mat.button, -1.1, -0.5, BACK - 0.03).rotation.x = Math.PI / 2;
  [[-0.92, -0.95], [-1.28, -0.95], [-1.46, -0.3]].forEach(([x, y]) => add(cylinder(0.055, 0.04, 32), mat.button, x, y, BACK - 0.02).rotation.x = Math.PI / 2);

  /* ----- Baïonnette et objectif 24-70 mm f/2.8 ----- */
  add(lathe([[0.82, 0], [0.9, 0], [0.9, 0.04], [0.84, 0.05]], 128), mat.chrome, LX, LY, FRONT);
  add(new THREE.CircleGeometry(0.035, 24), mat.red, LX, LY + 0.92, FRONT + 0.003);

  const lens = new THREE.Group();
  lens.position.set(LX, LY, FRONT);
  model.add(lens);
  const L = (pts, m, segs) => add(lathe(pts, segs || 128), m, 0, 0, 0, lens);
  // bague caoutchouc à côtes parallèles à l’axe, chanfreinée aux deux bouts
  const ring = (r, h0, h1, m) => {
    L([[r - 0.03, h0], [r, h0 + 0.02]], m === mat.zoom ? mat.ribs : mat.ribs);
    L([[r, h1 - 0.02], [r - 0.03, h1]], mat.ribs);
    const c = new THREE.Mesh(cylinder(r, h1 - h0 - 0.04, 192, true), m);
    c.rotation.x = Math.PI / 2; c.position.z = (h0 + h1) / 2; lens.add(c);
    return c;
  };
  L([[0.8, 0.0], [0.84, 0.02], [0.84, 0.05], [0.9, 0.07], [0.93, 0.1], [0.93, 0.2]], mat.lens);              // base
  const zoomRing = ring(0.972, 0.2, 0.74, mat.zoom);                                                        // bague de zoom
  L([[0.935, 0.74], [0.945, 0.76], [0.945, 0.88], [0.955, 0.9]], mat.lens);                                  // fût
  const focusRing = ring(0.982, 0.9, 1.3, mat.focus);                                                        // bague de mise au point
  L([[0.955, 1.3], [0.965, 1.32], [0.965, 1.36]], mat.lens);
  const control = new THREE.Mesh(cylinder(0.972, 0.14, 160, true), mat.knurled);                            // bague de contrôle
  control.rotation.x = Math.PI / 2; control.position.z = 1.43; lens.add(control);
  L([[0.965, 1.5], [0.96, 1.53]], mat.lens);
  L([[0.96, 1.53], [0.982, 1.535], [0.982, 1.565], [0.96, 1.57]], mat.red);                                   // bague rouge
  L([[0.96, 1.57], [0.985, 1.59], [0.985, 1.69], [0.97, 1.73], [0.92, 1.75], [0.86, 1.745], [0.79, 1.72], [0.76, 1.7]], mat.lens); // avant et lèvre
  // repères de la bague de zoom et inscriptions du fût
  const scale = canvasTex(2048, 120, (x, w, h) => {
    x.fillStyle = '#efede8';
    x.font = '600 50px Manrope, sans-serif';
    x.textBaseline = 'middle';
    [['24', 0], ['28', 1], ['35', 2], ['50', 3], ['70', 4]].forEach(([t, i]) => x.fillText(t, 760 + i * 120, h / 2));
    x.font = '600 40px Manrope, sans-serif';
    x.fillText('ZOOM', 1430, h / 2);
  });
  scale.wrapS = THREE.RepeatWrapping;
  const sm = new THREE.Mesh(cylinder(0.9325, 0.1, 160, true), new THREE.MeshPhysicalMaterial({ map: scale, transparent: true, metalness: 0.2, roughness: 0.4 }));
  sm.rotation.x = Math.PI / 2; sm.rotation.y = 0.6; sm.position.z = 0.14; lens.add(sm);
  const barrel = canvasTex(2048, 110, (x, w, h) => {
    x.fillStyle = '#efede8';
    x.font = '600 46px Manrope, sans-serif';
    x.textBaseline = 'middle';
    x.fillText('24–70 mm  1:2.8', 700, h / 2);
    x.fillStyle = '#c9a84c';
    x.fillText('HK', 1180, h / 2);
    x.fillStyle = '#efede8';
    x.font = '500 34px Manrope, sans-serif';
    x.fillText('STABILISÉ  ·  MACRO 0,21 m', 1290, h / 2);
  });
  barrel.wrapS = THREE.RepeatWrapping;
  const bm = new THREE.Mesh(cylinder(0.9465, 0.1, 160, true), new THREE.MeshPhysicalMaterial({ map: barrel, transparent: true, metalness: 0.2, roughness: 0.4 }));
  bm.rotation.x = Math.PI / 2; bm.rotation.y = 0.4; bm.position.z = 0.82; lens.add(bm);
  // interrupteurs AF/MF et stabilisateur, côté gauche du fût
  const sw = new THREE.Group();
  sw.position.set(0.95, 0.05, 0.82); sw.rotation.y = Math.PI / 2;
  lens.add(sw);
  add(slab(rrect(0.3, 0.2, 0.04), 0.03, 0.01), mat.button, 0, 0, 0, sw);
  add(new THREE.BoxGeometry(0.07, 0.05, 0.05), mat.chrome, -0.06, 0.03, 0.025, sw);
  add(new THREE.BoxGeometry(0.07, 0.05, 0.05), mat.chrome, 0.06, -0.03, 0.025, sw);
  // anneau de la face avant
  const front = add(new THREE.RingGeometry(0.62, 0.765, 160), new THREE.MeshStandardMaterial({
    map: ringText('ZOOM 24–70 mm 1:2.8  ◆  Ø 82 mm  ◆  HANI KANAFTCHIAN  ◆  BRUXELLES  ◆  ', { radius: 0.445, font: '600 21px Manrope, sans-serif', color: '#d8d5cf', accent: '#c9a84c' }),
    roughness: 0.6, metalness: 0.2, color: 0x2a2a2e
  }), 0, 0, 1.695, lens);
  front.material.color = new THREE.Color(0xffffff);
  front.renderOrder = 1;

  // Intérieur : chambre noire, diaphragme à 9 lames, lentilles traitées
  add(cylinder(0.62, 1.2, 96, true), new THREE.MeshStandardMaterial({ color: 0x030304, roughness: 1, side: THREE.BackSide }), 0, 0, 1.08, lens).rotation.x = Math.PI / 2;
  [1.5, 1.0, 0.7].forEach((z) => add(new THREE.RingGeometry(0.5, 0.62, 96), mat.dark, 0, 0, z, lens));
  // bagues internes qui accrochent la lumière : la profondeur se lit
  const innerMetal = new THREE.MeshPhysicalMaterial({ color: 0x3a3a40, metalness: 0.9, roughness: 0.3 });
  [[1.62, 0.615, 0.6], [1.28, 0.6, 0.55], [0.95, 0.58, 0.52]].forEach(([z, r0, r1]) => add(lathe([[r0, -0.012], [r1, 0], [r0, 0.012]], 96), innerMetal, 0, 0, z, lens));
  const inner = add(sphereCap(0.5, 0.06), new THREE.MeshPhysicalMaterial({ color: 0x0b0e1a, metalness: 0.1, roughness: 0.05, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.55, iridescenceThicknessRange: [200, 700], envMapIntensity: 3.6 }), 0, 0, 0.82, lens);
  inner.renderOrder = 1;
  const mid = add(sphereCap(0.6, 0.1), new THREE.MeshPhysicalMaterial({ color: 0x0a0c12, metalness: 0.05, roughness: 0.04, transparent: true, opacity: 0.7, iridescence: 1, iridescenceIOR: 1.35, iridescenceThicknessRange: [100, 500], envMapIntensity: 2.6 }), 0, 0, 1.33, lens);
  mid.renderOrder = 1;
  const irisGroup = new THREE.Group();
  irisGroup.position.z = 1.15;
  lens.add(irisGroup);
  const iris = { mesh: null, open: 0.44 };
  const setIris = (r) => {
    iris.open = r;
    if (iris.mesh) { iris.mesh.geometry.dispose(); irisGroup.remove(iris.mesh); }
    const N = 9, rot = (0.44 - r) * 1.8;
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 0.62, 0, TAU, false);
    const hole = new THREE.Path();
    // lames arrondies : chaque côté du polygone est un arc (bokeh circulaire)
    const rr = Math.max(r, 0.004);
    for (let i = 0; i <= N; i++) {
      const a = rot + (i / N) * TAU;
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      if (i === 0) hole.moveTo(px, py);
      else {
        const am = rot + ((i - 0.5) / N) * TAU;
        const bulge = rr * 1.035;
        hole.quadraticCurveTo(Math.cos(am) * bulge, Math.sin(am) * bulge, px, py);
      }
    }
    shape.holes.push(hole);
    iris.mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 24), mat.blade);
    irisGroup.add(iris.mesh);
  };
  setIris(0.44);

  // Lentille frontale : verre traité, transparent (on voit le diaphragme)
  const glass = add(sphereCap(0.765, 0.21), new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.02, transmission: 1, thickness: 0.3, ior: 1.62,
    iridescence: 0.9, iridescenceIOR: 1.3, iridescenceThicknessRange: [120, 460],
    specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.25,
    attenuationColor: new THREE.Color(0x6a7898), attenuationDistance: 1.1
  }), 0, 0, 1.49, lens);
  glass.renderOrder = 3;

  return {
    rig, shutter: btn, lamp, setIris, iris, lens, focusRing, control,
    lensCenter: new THREE.Vector3(LX, LY, FRONT + LENS_LEN - PIVOT_Z),
    mats: mat, lcdTex, glass, inner, mid, screenFrame
  };
}

// Écran arrière : le portrait affiché avec l’interface de l’appareil
function drawScreen(x, w, h, img) {
  x.fillStyle = '#0b0b0c';
  x.fillRect(0, 0, w, h);
  if (img) {
    const k = Math.max(w / img.width, h / img.height);
    x.drawImage(img, (w - img.width * k) / 2, (h - img.height * k) / 2, img.width * k, img.height * k);
    x.fillStyle = 'rgba(0,0,0,.12)';
    x.fillRect(0, 0, w, h);
  }
  // collimateur sur le visage, grille des tiers
  x.strokeStyle = 'rgba(255,255,255,.22)';
  x.lineWidth = 2;
  [w / 3, (2 * w) / 3].forEach((v) => { x.beginPath(); x.moveTo(v, 0); x.lineTo(v, h); x.stroke(); });
  [h / 3, (2 * h) / 3].forEach((v) => { x.beginPath(); x.moveTo(0, v); x.lineTo(w, v); x.stroke(); });
  x.strokeStyle = '#c9a84c';
  x.lineWidth = 4;
  const fx = w * 0.56, fy = h * 0.3, s = 64;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
    x.beginPath(); x.moveTo(fx + sx * s, fy + sy * (s - 22)); x.lineTo(fx + sx * s, fy + sy * s); x.lineTo(fx + sx * (s - 22), fy + sy * s); x.stroke();
  });
  x.fillStyle = 'rgba(0,0,0,.55)';
  x.fillRect(0, h - 74, w, 74);
  x.fillRect(0, 0, w, 60);
  x.fillStyle = '#f5f3ee';
  x.font = '600 30px Manrope, sans-serif';
  x.textBaseline = 'middle';
  x.fillText('1/200   F8   ISO 100   ±0', 36, h - 37);
  x.fillStyle = '#c9a84c';
  x.fillText('RAW', w - 110, h - 37);
  x.fillStyle = '#f5f3ee';
  x.font = '600 26px Manrope, sans-serif';
  x.fillText('Hani Kanaftchian', 36, 31);
  x.fillText('●  [ 999 ]', w - 190, 31);
}

/* ---------- Ombre portée douce ---------- */
function contactShadow() {
  const t = canvasTex(512, 256, (x, w, h) => {
    const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(0,0,0,.9)');
    g.addColorStop(0.45, 'rgba(0,0,0,.4)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.setTransform(1, 0, 0, 0.5, 0, h / 4);
    x.fillStyle = g;
    x.fillRect(0, 0, w, w);
  }, false);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.85 }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

/* ==========================================================================
   Mise en scène
   ========================================================================== */
const CY = -0.1; // recentrage vertical (viseur compris)

function waitFonts(ms) {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  const loads = Promise.all([
    document.fonts.load('600 40px Manrope')
  ]).catch(() => {});
  return Promise.race([loads, new Promise((r) => setTimeout(r, ms))]);
}

export async function createCamera3D(container, options) {
  const opts = Object.assign({ still: false, screenSrc: '', wordmarkSrc: '', monogramSrc: '', onFirstFrame: null, idleSpeed: 0.5, startYaw: Math.PI - 0.7 }, options);
  const [, screen, wordmark, monogram] = await Promise.all([
    waitFonts(1500), loadImage(opts.screenSrc), loadImage(opts.wordmarkSrc), loadImage(opts.monogramSrc)
  ]);

  const mobile = Math.min(window.innerWidth, window.innerHeight) < 700;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.75 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.className = 'cam3d';
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 100);
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(-3, 5, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffe0a8, 1.6);
  rim.position.set(4, 3, -5);
  scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0xfff4e2, 0.9);
  rim2.position.set(-5, 1, -4);
  scene.add(rim2);
  scene.add(new THREE.AmbientLight(0xffffff, 0.06));

  const root = new THREE.Group();
  scene.add(root);
  const cam = buildCamera({ screen, wordmark, monogram });
  cam.rig.position.y = CY;
  root.add(cam.rig);
  const lensEnv = lensEnvironment(renderer);
  cam.glass.material.envMap = lensEnv;
  cam.inner.material.envMap = lensEnv;
  cam.mid.material.envMap = lensEnv;
  const shadow = contactShadow();
  shadow.position.y = BODY_BOTTOM + CY - 0.06;
  root.add(shadow);

  /* ----- État ----- */
  const REST = { yaw: opts.startYaw, pitch: 0.2 };
  let VW = 1, VH = 1, stageY = 0.5, fit = 1;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const pose = { yaw: REST.yaw, pitch: REST.pitch, roll: 0, bob: 0, dist: 14, center: 0, lift: 0 };
  let mode = opts.still ? 'still' : 'idle';
  let shot = null;
  let dirty = true;
  let running = false;
  let visible = true;
  let last = performance.now();
  let first = true;
  const lensWorld = new THREE.Vector3();
  let clockFn = null; // horloge remplaçable pour les tests image par image
  const nowMs = () => (clockFn ? clockFn() : performance.now());

  // Distance qui cadre l’appareil (tour complet compris) dans la zone prévue
  const tanH = () => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  function idleDist() {
    const aspect = VW / VH;
    const t = tanH();
    const fw = Number(container.dataset.fillW || (VW < 700 ? 0.9 : VW < 1100 ? 0.62 : 0.5));
    const fh = Number(container.dataset.fill || (VW < 700 ? 0.36 : 0.5));
    return Math.max(4.9 / (fw * 2 * t * aspect), 2.9 / (fh * 2 * t));
  }
  // Distance du déclenchement : l’objectif remplit une bonne part de l’écran
  function nearDist() {
    const t = tanH();
    const share = VW < VH ? 0.5 : 0.62;
    const byH = 1.96 / (share * 2 * t);
    const byW = 1.96 / (0.8 * 2 * t * (VW / VH));
    return Math.max(byH, byW) + cam.lensCenter.z;
  }
  function resize() {
    const r = container.getBoundingClientRect();
    VW = Math.max(1, r.width); VH = Math.max(1, r.height);
    renderer.setSize(VW, VH, false);
    camera.aspect = VW / VH;
    camera.updateProjectionMatrix();
    stageY = clamp(Number(container.dataset.stageY || 0.5), 0.2, 0.8);
    fit = idleDist();
    if (mode !== 'shoot') pose.dist = fit;
    dirty = true;
  }

  function applyPose() {
    const dy = (stageY - 0.5) * VH * (1 - pose.center);
    camera.setViewOffset(VW, VH, 0, -dy, VW, VH);
    camera.position.set(0, 0, pose.dist);
    camera.lookAt(0, 0, 0);
    const free = 1 - pose.lift;
    cam.rig.rotation.set(pose.pitch + pointer.y * 0.12 * free, pose.yaw + pointer.x * 0.28 * free, pose.roll);
    // pendant le déclenchement, l’objectif vient sur l’axe de visée
    root.position.set(-cam.lensCenter.x * pose.center, pose.bob - (CY + cam.lensCenter.y) * pose.center, 0);
    shadow.material.opacity = 0.85 * (1 - pose.center);
  }

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!visible && mode !== 'shoot') return;
    const k = Math.min(1, dt * 3.2);
    if (Math.abs(pointer.tx - pointer.x) > 1e-4 || Math.abs(pointer.ty - pointer.y) > 1e-4) {
      pointer.x += (pointer.tx - pointer.x) * k;
      pointer.y += (pointer.ty - pointer.y) * k;
      dirty = true;
    }
    if (mode === 'idle') {
      pose.yaw += opts.idleSpeed * dt;
      pose.bob = Math.sin(now / 1500) * 0.04;
      pose.roll = Math.sin(now / 2300) * 0.016;
      dirty = true;
    } else if (mode === 'shoot' && shot) {
      shot(nowMs());
      dirty = true;
    }
    if (!dirty) return;
    dirty = false;
    applyPose();
    renderer.render(scene, camera);
    if (first) { first = false; if (opts.onFirstFrame) opts.onFirstFrame(); }
  }
  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }
  function stop() { running = false; }

  // Position de l’objectif à l’écran (en pixels de la fenêtre)
  function lensScreen() {
    applyPose();
    root.updateMatrixWorld(true);
    lensWorld.copy(cam.lensCenter);
    cam.rig.localToWorld(lensWorld);
    lensWorld.project(camera);
    const r = container.getBoundingClientRect();
    return { x: r.left + (lensWorld.x * 0.5 + 0.5) * VW, y: r.top + (-lensWorld.y * 0.5 + 0.5) * VH };
  }

  /* ----- Déclenchement ----- */
  function shoot() {
    if (mode === 'shoot') return Promise.reject(new Error('busy'));
    return new Promise((resolve) => {
      const t0 = nowMs();
      const from = { yaw: pose.yaw + pointer.x * 0.28, pitch: pose.pitch + pointer.y * 0.12, roll: pose.roll, bob: pose.bob, dist: pose.dist };
      // il continue de tourner dans le même sens jusqu’à regarder le visiteur
      let to = Math.ceil(from.yaw / TAU) * TAU;
      if (to - from.yaw < 0.6) to += TAU;
      const near = nearDist();
      // la durée suit l’angle restant : le tour reste doux, quel que soit le moment du geste
      const TURN = Math.round((0.9 + (to - from.yaw) * 0.28) * 1000);
      const FIRE = TURN + 60, PRESS = FIRE - 120, AF = FIRE - 600;
      const T = TURN / 1000;
      // Hermite : départ à la vitesse de rotation du repos, arrivée immobile
      const v0 = mode === 'idle' ? opts.idleSpeed : 0;
      const herm = (u) => {
        const u2 = u * u, u3 = u2 * u;
        return (2 * u3 - 3 * u2 + 1) * from.yaw + (u3 - 2 * u2 + u) * T * v0 + (-2 * u3 + 3 * u2) * to;
      };
      let pressed = false, fired = false, beeped = false;
      const focus0 = cam.focusRing.rotation.y;
      pointer.x = pointer.tx = 0;
      pointer.y = pointer.ty = 0;
      mode = 'shoot';
      shot = (now) => {
        const t = now - t0;
        const k = clamp(t / TURN, 0, 1);
        pose.yaw = herm(k);
        pose.pitch = lerp(from.pitch, 0, out3(k));
        pose.roll = lerp(from.roll, 0, k);
        pose.lift = out3(k);
        const z = inOut(clamp((t - FIRE * 0.18) / (FIRE * 0.82), 0, 1));
        pose.bob = lerp(from.bob, 0, z);
        pose.dist = lerp(from.dist, near, z);
        pose.center = z;
        // voyant d’autofocus, mise au point, diaphragme qui se ferme, déclencheur
        const af = t > AF && t < FIRE + 60;
        cam.lamp.material.emissiveIntensity = af ? 2.4 + Math.sin(t / 30) * 0.8 : 0.05;
        cam.focusRing.rotation.y = focus0 + Math.sin(clamp((t - AF) / 380, 0, 1) * Math.PI) * 0.16 + clamp((t - AF) / 380, 0, 1) * 0.05;
        if (!beeped && t >= AF + 330) { beeped = true; window.dispatchEvent(new CustomEvent('hk:focus')); }
        cam.setIris(lerp(0.44, 0.1, inOut(clamp((t - (FIRE - 320)) / 300, 0, 1))));
        const p = clamp((t - PRESS + 70) / 70, 0, 1) - clamp((t - PRESS - 70) / 160, 0, 1);
        cam.shutter.position.y = 0.04 - 0.04 * p;
        if (!pressed && t >= PRESS) { pressed = true; window.dispatchEvent(new CustomEvent('hk:press')); }
        if (!fired && t >= FIRE) { fired = true; resolve(lensScreen()); }
        if (t > FIRE + 900) hold(null);
      };
      start();
    });
  }

  // fige la dernière image (le site est affiché par-dessus) : plus aucun rendu
  function hold(p) {
    mode = 'still';
    shot = null;
    if (p) Object.assign(pose, p);
    dirty = true;
  }

  // Retour à l’état de repos (pour rejouer l’intro)
  function reset() {
    mode = opts.still ? 'still' : 'idle';
    shot = null;
    Object.assign(pose, { yaw: REST.yaw, pitch: REST.pitch, roll: 0, bob: 0, center: 0, lift: 0, dist: fit });
    cam.setIris(0.44);
    cam.lamp.material.emissiveIntensity = 0.05;
    cam.shutter.position.y = 0.04;
    dirty = true;
    start();
  }

  /* ----- Souris : l’appareil suit le regard ; détection du survol ----- */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function hit(clientX, clientY) {
    const r = container.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    root.updateMatrixWorld(true);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObject(cam.rig, true).length > 0;
  }
  function setPointer(nx, ny) { pointer.tx = clamp(nx, -1, 1); pointer.ty = clamp(ny, -1, 1); }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((e) => { visible = e[e.length - 1].isIntersecting; if (visible) dirty = true; }).observe(container);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
  window.addEventListener('resize', resize);
  resize();
  applyPose();
  start();

  return {
    canvas,
    shoot,
    reset,
    setPointer,
    hit,
    lensScreen,
    resize,
    pause: stop,
    resume: start,
    get busy() { return mode === 'shoot'; },
    get yaw() { return pose.yaw; },
    hold,
    release() { if (mode === 'still' && !opts.still) mode = 'idle'; },
    snapshot() { applyPose(); renderer.render(scene, camera); return canvas.toDataURL('image/png'); },
    pose,
    _debug: { scene, cam, renderer, camera, THREE, redraw: () => { dirty = true; }, setClock(fn) { clockFn = fn; }, tick() { if (shot) shot(nowMs()); applyPose(); renderer.render(scene, camera); return canvas.toDataURL('image/png'); } }
  };
}
