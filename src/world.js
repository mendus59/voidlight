'use strict';
// ===== VOIDLIGHT world: each level's large wrapping map =====
// A level is a square map WORLD.size across (STAGES[].mapSize overrides it) that wraps: walk off the north edge and you come back
// in at the south edge, and the same east to west. The player's coordinates are never wrapped; only the map's fixed things are
// (landmarks, anchors, the Map pickup, and later zones and shrines). Each fixed thing is drawn, found and reached at its copy
// nearest the player (wrapNear), so the horde, bullets and everything else in combat never need to know about the wrap.
// Landmarks and anchor points come from a seed per level, so a level looks the same every run; which anchors hold what is
// rolled per run. Loaded after bestiary.js and before main.js.

// small seeded random numbers (mulberry32), so each level's map is the same every run
function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const worldSize = S => Math.max(4000, (S && S.mapSize) || WORLD.size);
// the copy of a fixed point (fx, fy) nearest to (px, py), on a map `size` across
function wrapNear(fx, fy, px, py, size) {
  const dx = fx - px, dy = fy - py;
  return { x: px + dx - size * Math.round(dx / size), y: py + dy - size * Math.round(dy / size) };
}
const wrapMod = (v, size) => ((v % size) + size) % size;
const LANDMARK_KINDS = ['shard', 'ring', 'pillar', 'glyph', 'shard', 'ring'];

function makeWorld(stage) {
  const S = stageDef(stage), size = worldSize(S), rnd = seeded(stage * 7919 + 17), W = { size, stage, landmarks: [], anchors: [], feats: [], seen: new Set() };
  const nL = Math.max(0, WORLD.landmarks | 0);
  for (let k = 0; k < nL; k++) W.landmarks.push({ x: rnd() * size, y: rnd() * size, r: 18 + rnd() * 46, kind: LANDMARK_KINDS[Math.floor(rnd() * LANDMARK_KINDS.length)], rot: rnd() * TAU, n: 3 + Math.floor(rnd() * 4) });
  // anchors on a jittered grid, so they spread over the whole map
  const g = Math.max(2, Math.round(Math.sqrt(Math.max(4, WORLD.anchors | 0)))), cell = size / g;
  for (let i = 0; i < g; i++) for (let j = 0; j < g; j++) W.anchors.push({ x: (i + 0.2 + rnd() * 0.6) * cell, y: (j + 0.2 + rnd() * 0.6) * cell, used: false });
  return W;
}
// the distance from the start (0, 0) to an anchor, through the wrap
const fromStart = (a, size) => Math.hypot(a.x - size * Math.round(a.x / size), a.y - size * Math.round(a.y / size));
// a free anchor at least minFrac of the map's size from the start; marks it used
function takeAnchor(W, minFrac = 0, maxFrac = 1) {
  const ok = W.anchors.filter(a => !a.used && fromStart(a, W.size) >= minFrac * W.size && fromStart(a, W.size) <= maxFrac * W.size);
  const a = ok.length ? pick(ok) : W.anchors.find(x => !x.used); if (!a) return null;
  a.used = true; return a;
}
// A fixed feature: { id, kind, x, y, r, icon, color, name, beacon, onMap: when it shows on the map, ... }.
function addFeature(W, f) { W.feats.push(Object.assign({ id: 'f' + W.feats.length, r: 40, onMap: 'seen' }, f)); return W.feats[W.feats.length - 1]; }
const mapFound = (s, stage) => (s.mapsFound || []).includes(stage);

// A run's world: the level's map plus this run's features. Called from freshRun (main.js) for real runs, not the test canvas.
function worldInit(g) {
  const W = makeWorld(g.stage); g.world = W;
  if (!mapFound(SAVE, g.stage)) { // the level's Map: far from the start; finding it is a permanent unlock for this level
    const a = takeAnchor(W, WORLD.mapMin, 0.75);
    if (a) addFeature(W, { kind: 'map', x: a.x, y: a.y, r: 34, icon: '🗺️', color: '#7fffd4', name: `Map of Level ${g.stage}`, beacon: true, onMap: 'always' });
  }
  if (typeof zonesInit === 'function') zonesInit(g, W); // zones.js and shrines.js add theirs
  if (typeof shrinesInit === 'function') shrinesInit(g, W);
}
function worldUpdate(dt) {
  const W = G.world; if (!W) return;
  if (typeof buffsTick === 'function') buffsTick(dt); // shrines.js
  const P = G.player, view = Math.hypot(VIEW.w, VIEW.h) / 2;
  for (const f of W.feats) {
    if (f.gone) continue;
    const p = wrapNear(f.x, f.y, P.x, P.y, W.size), d = Math.hypot(p.x - P.x, p.y - P.y);
    f.near = p; f.dist = d;
    if (d < view + (f.r || 0)) W.seen.add(f.id);
    if (f.kind === 'map' && d < f.r + P.r + 10) collectMap(f);
    if (f.update) f.update(f, dt, d);
  }
}
function collectMap(f) {
  f.gone = true;
  if (!SAVE.mapsFound.includes(G.stage)) { SAVE.mapsFound.push(G.stage); writeSave(); }
  banner(`🗺️ ${f.name} found!`, f.color, 3);
  later(1.2, () => banner('Zones now show on your map', f.color, 2.5));
  toast(`🗺️ ${f.name}: zones in this level show on the minimap and the pause map from now on, in every run.`);
  fxRing(f.near.x, f.near.y, 160, f.color, 0.8, 6);
}
// beacons for the screen-edge arrows (main.js): the Map and anything else that asks for one
function worldBeacons() {
  const W = G && G.world; if (!W) return [];
  return W.feats.filter(f => !f.gone && f.beacon && f.near && (f.beacon === true || f.beacon(f))).map(f => ({ x: f.near.x, y: f.near.y, color: f.color, icon: f.icon }));
}
// is this feature shown on the minimap / pause map?
const featOnMap = (W, f) => !f.gone && (f.onMap === 'always' || (f.onMap === 'seen' && W.seen.has(f.id)) || (f.onMap === 'map' && mapFound(SAVE, W.stage))); // zones: only once the level's Map is found

// ---------- drawing ----------
// ground layer: landmarks, then features (under pickups, enemies and bullets)
function drawWorld(ox, oy) {
  const W = G.world; if (!W) return;
  const P = G.player, col = STAGE().color, vw = VIEW.w / 2 + 120, vh = VIEW.h / 2 + 120;
  for (const l of W.landmarks) {
    const p = wrapNear(l.x, l.y, P.x, P.y, W.size); if (Math.abs(p.x - P.x) > vw || Math.abs(p.y - P.y) > vh) continue;
    drawLandmark(l, p.x + ox, p.y + oy, col);
  }
  for (const f of W.feats) {
    if (f.gone || !f.near) continue;
    const p = f.near, R = (f.r || 40) + 200; if (Math.abs(p.x - P.x) > vw + R || Math.abs(p.y - P.y) > vh + R) continue;
    if (f.draw) f.draw(f, p.x + ox, p.y + oy); else if (f.kind === 'map') drawMapPickup(f, p.x + ox, p.y + oy);
  }
}
function drawLandmark(l, x, y, col) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(l.rot);
  if (l.kind === 'shard') { // a cluster of crystals
    for (let k = 0; k < l.n; k++) { const a = k * TAU / l.n, d = l.r * 0.35, s = l.r * (0.35 + 0.15 * ((k * 7) % 3));
      ctx.fillStyle = col + '22'; ctx.strokeStyle = col + '66'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d - s); ctx.lineTo(Math.cos(a) * d + s * 0.35, Math.sin(a) * d); ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d + s * 0.4); ctx.lineTo(Math.cos(a) * d - s * 0.35, Math.sin(a) * d); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  } else if (l.kind === 'ring') { // a circle of standing stones
    ctx.strokeStyle = col + '30'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, l.r, 0, TAU); ctx.stroke();
    ctx.fillStyle = col + '44'; for (let k = 0; k < l.n + 3; k++) { const a = k * TAU / (l.n + 3); ctx.fillRect(Math.cos(a) * l.r - 4, Math.sin(a) * l.r - 4, 8, 8); }
  } else if (l.kind === 'pillar') { // a broken column with a faint glow
    ctx.fillStyle = col + '18'; circle(0, 0, l.r * 0.9); ctx.fillStyle = '#100c1e'; ctx.strokeStyle = col + '70'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, l.r * 0.32, 0, TAU); ctx.fill(); ctx.stroke();
  } else { // a rune on the floor
    ctx.strokeStyle = col + '38'; ctx.lineWidth = 2; ctx.beginPath(); for (let k = 0; k <= l.n; k++) { const a = k * TAU * 2 / l.n; const px = Math.cos(a) * l.r * 0.8, py = Math.sin(a) * l.r * 0.8; if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.stroke();
  }
  ctx.restore();
}
function drawMapPickup(f, x, y) {
  const t = G.time, c = f.color;
  const g = ctx.createLinearGradient(x, y - 260, x, y); g.addColorStop(0, c + '00'); g.addColorStop(1, c + '77');
  ctx.fillStyle = g; ctx.fillRect(x - 9, y - 260, 18, 260);
  ctx.fillStyle = c; ctx.globalAlpha = 0.18 + 0.1 * Math.sin(t * 4); circle(x, y, 44); ctx.globalAlpha = 1;
  ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 30 + 4 * Math.sin(t * 3), 0, TAU); ctx.stroke();
  ctx.font = '28px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(f.icon, x, y + Math.sin(t * 3) * 3);
}
// the minimap (top right, under the kills and gold) and the big pause map share this: the whole map, scaled to fit w × h and
// centred on the player (the map wraps, so there is no edge to show)
function drawMapView(c2, x0, y0, w, h, opts = {}) {
  const W = G.world; if (!W) return;
  const P = G.player, k = w / W.size, col = STAGE().color, half = W.size / 2, px = half, py = half;
  const rx = x => wrapMod(x - P.x + half, W.size), ry = y => wrapMod(y - P.y + half, W.size);
  c2.save(); c2.beginPath(); c2.rect(x0, y0, w, h); c2.clip();
  c2.fillStyle = 'rgba(10,8,22,0.82)'; c2.fillRect(x0, y0, w, h);
  c2.fillStyle = col + '30'; for (const l of W.landmarks) if (l.kind === 'pillar' || l.kind === 'ring') c2.fillRect(x0 + rx(l.x) * k, y0 + ry(l.y) * k, opts.big ? 2 : 1, opts.big ? 2 : 1);
  for (const f of W.feats) {
    if (!featOnMap(W, f)) continue;
    const fx = x0 + rx(f.x) * k, fy = y0 + ry(f.y) * k;
    if (f.zoneR) { c2.fillStyle = f.color + '30'; c2.strokeStyle = f.color + 'aa'; c2.lineWidth = 1; c2.beginPath(); c2.arc(fx, fy, Math.max(3, f.zoneR * k), 0, TAU); c2.fill(); c2.stroke(); }
    c2.font = (opts.big ? 16 : 10) + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillStyle = '#fff'; c2.fillText(f.icon, fx, fy);
    if (opts.big && f.name) { c2.font = '10px system-ui,sans-serif'; c2.fillStyle = f.color; c2.fillText(f.name, fx, fy + 14); }
  }
  // the view and the player
  c2.strokeStyle = 'rgba(255,255,255,0.35)'; c2.lineWidth = 1; c2.strokeRect(x0 + px * k - VIEW.w * k / 2, y0 + py * k - VIEW.h * k / 2, Math.max(2, VIEW.w * k), Math.max(2, VIEW.h * k));
  c2.save(); c2.translate(x0 + px * k, y0 + py * k); c2.rotate(P.face); c2.fillStyle = G.char.color; c2.beginPath(); c2.moveTo(opts.big ? 9 : 6, 0); c2.lineTo(opts.big ? -6 : -4, opts.big ? -5 : -4); c2.lineTo(opts.big ? -6 : -4, opts.big ? 5 : 4); c2.closePath(); c2.fill(); c2.restore();
  c2.restore();
  c2.strokeStyle = col + '88'; c2.lineWidth = 1; c2.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
}
// minimap size for this screen
const minimapSize = () => Math.round(clamp(Math.min(VIEW.w, VIEW.h) * 0.2, 90, 170));
function drawMinimap() {
  if (!G.world) return 0;
  const s = minimapSize(), x0 = VIEW.w - s - 12, y0 = 58;
  drawMapView(ctx, x0, y0, s, s);
  ctx.font = '10px system-ui,sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillStyle = mapFound(SAVE, G.stage) ? '#7fffd4' : '#7a7598';
  ctx.fillText(mapFound(SAVE, G.stage) ? '🗺️ Map found' : 'Map not found', VIEW.w - 12, y0 + s + 3);
  return y0 + s + 18; // where the effect pool list starts
}
// the big map in the pause menu
function drawPauseMap(cv) {
  if (!cv || !G || !G.world) return;
  const s = cv.clientWidth || 360, d = Math.min(2, window.devicePixelRatio || 1); cv.width = s * d; cv.height = s * d; cv.style.height = s + 'px';
  const c2 = cv.getContext('2d'); c2.setTransform(d, 0, 0, d, 0, 0);
  drawMapView(c2, 0, 0, s, s, { big: true });
}
