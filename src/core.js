'use strict';
// ===== VOIDLIGHT core engine: math, state, bullets, effects, enemies helpers =====
// Game version shown on the title screen. Beta, so 0.MINOR.PATCH: bump MINOR for a feature PR, PATCH for a fix/tweak.
// Add a matching line to CHANGELOG.md whenever you bump it.
const VERSION = '0.26.0';
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const d2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const angTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
const pick = a => a[Math.floor(Math.random() * a.length)];
const wrapA = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

const EFFECTS = {
  burn:      { name: 'Burn',     color: '#ff7a2f', icon: '🔥', desc: 'Damage over time.' },
  chill:     { name: 'Chill',    color: '#7fdcff', icon: '❄️', desc: 'Slows; 5+ stacks can freeze.' },
  shock:     { name: 'Shock',    color: '#fff36b', icon: '⚡', desc: 'Hits can arc to nearby enemies.' },
  poison:    { name: 'Poison',   color: '#8cff5a', icon: '☠️', desc: 'Stacking toxin damage.' },
  bounce:    { name: 'Ricochet', color: '#ff6bd5', icon: '🔁', desc: 'Bullets bounce to new enemies.' },
  homing:    { name: 'Homing',   color: '#b48cff', icon: '🎯', desc: 'Bullets steer toward enemies.' },
  pierce:    { name: 'Pierce',   color: '#e8e8ff', icon: '🗡️', desc: 'Bullets pass through more enemies.' },
  knockback: { name: 'Force',    color: '#ffb86b', icon: '💥', desc: 'Hits shove enemies away.' },
  crit:      { name: 'Critical', color: '#ffe14d', icon: '✴️', desc: 'Chance for heavy critical hits.' },
  split:     { name: 'Split',    color: '#5affd9', icon: '✳️', desc: 'Kills can burst into shrapnel.' },
  vampiric:  { name: 'Vampiric', color: '#ff3b5c', icon: '🩸', desc: 'Hits can restore health.' },
};
const EFFECT_KEYS = Object.keys(EFFECTS);
const FUSE_PREFIX = { burn: 'Inferno', chill: 'Glacial', shock: 'Tempest', poison: 'Plague', bounce: 'Chaos', homing: 'Predator', pierce: 'Impaler', knockback: 'Titan', crit: 'Executioner', split: 'Fractal', vampiric: 'Sanguine' };
const SLOTS = {
  weapon: { name: 'Weapon', icon: '🔫', sockets: 2 },
  spell:  { name: 'Spell', icon: '🔮', sockets: 2 },
  orbit:  { name: 'Orbital', icon: '🪐', sockets: 2 },
  trap:   { name: 'Deployable', icon: '🛠️', sockets: 2 },
  relic:  { name: 'Relic', icon: '💠', sockets: 2 },
};
const SLOT_KEYS = Object.keys(SLOTS); // sockets is the base count; the Forge can add more (slotSockets in main.js)
const MAX_LEVEL = 5;
// Player stats that hero perks, Forge ranks and passive items add to. pct: shown as a percentage. neg: lowers the value.
const STAT_INFO = {
  might: { name: 'damage', pct: true }, hp: { name: 'max HP', pct: true }, armor: { name: 'armor' }, regen: { name: 'HP/s' },
  speed: { name: 'move speed', pct: true }, area: { name: 'area', pct: true }, cd: { name: 'cooldowns', pct: true, neg: true },
  projSpd: { name: 'projectile speed', pct: true }, duration: { name: 'duration', pct: true }, amount: { name: 'projectiles' },
  crit: { name: 'crit chance', pct: true }, magnet: { name: 'pickup range', pct: true }, luck: { name: 'luck', pct: true },
  growth: { name: 'XP', pct: true }, greed: { name: 'gold', pct: true },
};
const STAT_KEYS = Object.keys(STAT_INFO);
function statText(m, k = 1) {
  return Object.entries(m || {}).filter(([s, v]) => STAT_INFO[s] && v).map(([s, v]) => { const I = STAT_INFO[s], x = v * k * (I.neg ? -1 : 1);
    return (x >= 0 ? '+' : '−') + (I.pct ? +(Math.abs(x) * 100).toFixed(1) + '%' : +Math.abs(x).toFixed(2)) + ' ' + I.name; }).join(', ');
}
const TIER_COLORS = ['#ffffff', '#ffe14d', '#5affd9', '#ff4cc3'];

let G = null;          // current run state
let VIEW = { w: 960, h: 640 };

// ---------- spatial grid for enemies ----------
const CELL = 72;
const grid = new Map();
function gkey(cx, cy) { return (cx + 4096) * 8192 + (cy + 4096); }
function gridBuild() {
  grid.clear();
  for (const e of G.enemies) {
    if (e.dead) continue;
    const k = gkey(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
    let c = grid.get(k); if (!c) { c = []; grid.set(k, c); } c.push(e);
  }
}
function forNear(x, y, r, fn) {
  const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
  const y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
    const c = grid.get(gkey(cx, cy)); if (!c) continue;
    for (let i = 0; i < c.length; i++) { if (!c[i].dead && fn(c[i]) === false) return; }
  }
}
function enemiesNear(x, y, r) {
  const out = [], rr = r * r;
  forNear(x, y, r + 30, e => { if (d2(x, y, e.x, e.y) <= rr + e.r * e.r * 2) out.push(e); });
  return out;
}
function nearest(x, y, range = 600, exclude = null) {
  let best = null, bd = range * range;
  for (const e of G.enemies) {
    if (e.dead || (exclude && exclude.has(e.id))) continue;
    const dd = d2(x, y, e.x, e.y); if (dd < bd) { bd = dd; best = e; }
  }
  return best;
}
function randomEnemy(x, y, range = 450) {
  const list = enemiesNear(x, y, range); return list.length ? pick(list) : null;
}
function toughest(x, y, range = 650) {
  let best = null;
  for (const e of G.enemies) { if (e.dead || d2(x, y, e.x, e.y) > range * range) continue; if (!best || e.hp > best.hp) best = e; }
  return best;
}

// ---------- scheduling ----------
function later(t, fn) { G.sched.push({ t: G.time + t, fn }); }

// ---------- fx ----------
function fxRing(x, y, r, color, dur = 0.35, width = 3) { if (G.fx.length < 400) G.fx.push({ k: 'ring', x, y, r, color, t: 0, dur, width }); }
function fxBolt(x1, y1, x2, y2, color = '#fff36b') { if (G.fx.length < 400) G.fx.push({ k: 'bolt', x1, y1, x2, y2, color, t: 0, dur: 0.18, seed: Math.random() * 1000 }); }
function fxSpark(x, y, color, n = 4, spd = 120) {
  for (let i = 0; i < n && G.fx.length < 500; i++) { const a = rand(0, TAU), s = rand(spd * 0.3, spd); G.fx.push({ k: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, color, t: 0, dur: rand(0.2, 0.45) }); }
}
function fxText(x, y, txt, color = '#fff', size = 13) { if (G.texts.length > 70) G.texts.shift(); G.texts.push({ x: x + rand(-6, 6), y, txt, color, size, t: 0 }); }
function fxStrikeV(x, y, color) { if (G.fx.length < 400) G.fx.push({ k: 'bolt', x1: x + rand(-30, 30), y1: y - 420, x2: x, y2: y, color, t: 0, dur: 0.22, seed: Math.random() * 1000 }); }

// ---------- player helpers ----------
function heal(n) {
  const P = G.player; if (P.hp >= P.maxHp) return;
  P.hp = Math.min(P.maxHp, P.hp + n); G.stats.healed += n;
  if (n >= 1) fxText(P.x, P.y - 20, '+' + Math.round(n), '#6bff8f', 12);
}
function aimAngle(range = 520) {
  const P = G.player; const e = nearest(P.x, P.y, range);
  return e ? angTo(P.x, P.y, e.x, e.y) : P.face;
}

// ---------- bullets ----------
// Stacks of effect k on a hit: the shared pool, plus the firing item's own bonus (inst.own, set in recomputePool:
// +2 for a single-effect item, +1 per effect for a two-effect item, +3 per effect for a fused item).
// The hero's archetype (G.arch, from archOf) makes every stack of its effects count for more.
function poolStack(b, k) {
  const o = b && b.owner;
  const v = (G.pool[k] || 0) + (o && o.own ? (o.own[k] || 0) : (b && b.effect === k ? 2 : 0));
  const m = v && G.arch ? G.arch.eff[k] : 0;
  return m ? v * (1 + m) : v;
}

// ---------- hero archetypes ----------
// CHARACTERS[].arch in items.js: { name, eff: { effect: potency }, combo: { 'a+b': damage }, slot: { slot: damage } }.
// archOf turns it into what the engine reads: combos as [a, b, x] pairs, and the effects and slots the hero leans toward.
function archOf(ch) {
  const a = (ch && ch.arch) || {}, eff = {}, slot = {}, combo = [];
  for (const [k, x] of Object.entries(a.eff || {})) if (EFFECTS[k] && x) eff[k] = x;
  for (const [k, x] of Object.entries(a.slot || {})) if (SLOTS[k] && x) slot[k] = x;
  for (const [k, x] of Object.entries(a.combo || {})) { const [p, q] = k.split('+'); if (EFFECTS[p] && EFFECTS[q] && p !== q && x) combo.push([p, q, x]); }
  const leans = [...new Set([...Object.keys(eff), ...combo.flatMap(c => [c[0], c[1]])])];
  return { name: a.name || '', eff, slot, combo, leans, slots: Object.keys(slot) };
}
// one line per bonus, for the hero card, the stats panel and the admin preview
function archLines(ch) {
  const A = archOf(ch), pct = x => (x >= 0 ? '+' : '−') + Math.round(Math.abs(x) * 100) + '%', E = k => EFFECTS[k].icon + ' ' + EFFECTS[k].name;
  return [
    ...Object.entries(A.eff).map(([k, x]) => `${E(k)} ${pct(x)} stronger`),
    ...A.combo.map(([p, q, x]) => `${EFFECTS[p].icon}${EFFECTS[q].icon} ${EFFECTS[p].name} + ${EFFECTS[q].name} hits ${pct(x)} damage`),
    ...Object.entries(A.slot).map(([k, x]) => `${SLOTS[k].icon} ${SLOTS[k].name} items ${pct(x)} damage`),
  ];
}
// damage × for an item's slot, and for a hit that carries both effects of an archetype combo
const archSlotMul = def => 1 + ((G && G.arch && G.arch.slot[def.slot]) || 0);
function archComboMul(S) {
  let m = 1; if (!G.arch) return m;
  for (const c of G.arch.combo) if (S(c[0]) > 0 && S(c[1]) > 0) m *= 1 + c[2];
  return m;
}

function shoot(o) {
  // bullet cap; higher fusion tiers get headroom so big fused items are not starved by a screen full of small bullets
  if (G.bullets.length > 2600 + 900 * ((o.owner && o.owner.tier) || 0)) return null;
  const P = G.player;
  const b = Object.assign({ x: P.x, y: P.y, ang: 0, spd: 400, r: 5, dmg: 10, life: 1.5, pierce: 1, t: 0, color: '#fff', shape: 'orb', effect: null }, o);
  b.spd *= P.projSpd;
  b.r *= Math.sqrt(P.area);
  if (isFinite(b.life)) b.life *= P.duration;
  b.vx = Math.cos(b.ang) * b.spd; b.vy = Math.sin(b.ang) * b.spd;
  if (b.wave) { b.px = b.x; b.py = b.y; b.wave.ph = b.wave.ph || 0; }
  if (!b.noMods) {
    b.pierce += Math.floor(poolStack(b, 'pierce') / 2);
    b.bounces = (b.bounces || 0) + Math.floor(poolStack(b, 'bounce') / 2);
    const h = poolStack(b, 'homing'); if (h > 0 && !b.orbit && !b.follow && !b.lob) b.home = (b.home || 0) + 0.55 * h;
  }
  if (b.hitCd) b.hitMap = new Map(); else b.hit = new Set();
  G.bullets.push(b);
  chainAttach(b); // fusion chains (chain.js): links ride on, or fire from, the bullets of the item that absorbed them
  return b;
}

// instant area hit
function strike(x, y, r, dmg, effect, o = {}) {
  const P = G.player; if (!o.raw) r *= Math.sqrt(P.area);
  if (!o.noFx) fxRing(x, y, r, o.color || (effect ? EFFECTS[effect].color : '#fff'), 0.3, 3);
  const pseudo = { dmg, effect, vx: 0, vy: 0, x, y, kb: o.kb || 0, owner: o.owner, link: o.link, dtype: o.dtype };
  for (const e of enemiesNear(x, y, r)) hitEnemy(e, pseudo);
}

function zap(x, y, e, dmg, effect, owner) {
  fxBolt(x, y, e.x, e.y, '#fff36b');
  hitEnemy(e, { dmg, effect: effect || 'shock', vx: e.x - x, vy: e.y - y, x, y, owner, noChain: true, dtype: ['shock'] });
}
function chainZap(from, dmg, n, effect, owner) {
  const seen = new Set([from.id]); let cur = from;
  for (let i = 0; i < n; i++) {
    let best = null, bd = 160 * 160;
    forNear(cur.x, cur.y, 160, e => { if (seen.has(e.id)) return; const dd = d2(cur.x, cur.y, e.x, e.y); if (dd < bd) { bd = dd; best = e; } });
    if (!best) break; seen.add(best.id); zap(cur.x, cur.y, best, dmg, effect, owner); cur = best;
  }
}

function deploy(o) {
  const d = Object.assign({ x: G.player.x, y: G.player.y, t: 0, life: 5, r: 14, color: '#fff', icon: '', tick: 0 }, o);
  if (isFinite(d.life)) d.life *= G.player.duration;
  G.deploys.push(d); chainDeploy(d); // fusion chains (chain.js): links ride on the objects of the item that absorbed them
  return d;
}

function updateBullet(b, dt) {
  const P = G.player;
  b.t += dt;
  if (b.orbit) {
    const o = b.orbit; o.a += o.w * dt; if (o.grow) o.r += o.grow * dt;
    let c = o.center || P;
    if (c.dead) { // satellites of a fusion chain spin outward when what they circle is gone; others die with it
      if (o.free) { o.center = c = { x: c.x, y: c.y }; o.free = false; o.grow = 150; o.w *= 0.7; b.life = Math.min(b.life, b.t + 0.5); } else b.dead = true;
    }
    const rr = o.r * Math.sqrt(P.area) * (o.pulse ? (1 + 0.35 * Math.sin(b.t * o.pulse + o.a)) : 1);
    if (o.fig8) { b.x = c.x + Math.sin(o.a) * rr; b.y = c.y + Math.sin(2 * o.a) * rr * 0.5; }
    else { b.x = c.x + Math.cos(o.a) * rr; b.y = c.y + Math.sin(o.a) * rr * (o.ry || 1); }
  } else if (b.follow) {
    b.x = P.x + (b.ox || 0); b.y = P.y + (b.oy || 0);
  } else {
    if (b.home && b.t > (b.homeDelay || 0)) {
      if (!b.tgt || b.tgt.dead || (b.retarget = (b.retarget || 0) - dt) < 0) { b.tgt = nearest(b.x, b.y, 420); b.retarget = 0.25; }
      if (b.tgt) {
        let cur = Math.atan2(b.vy, b.vx); const want = angTo(b.x, b.y, b.tgt.x, b.tgt.y);
        cur += clamp(wrapA(want - cur), -b.home * dt, b.home * dt);
        const sp = Math.hypot(b.vx, b.vy); b.vx = Math.cos(cur) * sp; b.vy = Math.sin(cur) * sp;
      }
    }
    if (b.curve) { const c = Math.cos(b.curve * dt), s = Math.sin(b.curve * dt); const vx = b.vx * c - b.vy * s; b.vy = b.vx * s + b.vy * c; b.vx = vx; }
    if (b.accel && (!b.maxSpd || b.vx * b.vx + b.vy * b.vy < b.maxSpd * b.maxSpd)) { const f = 1 + b.accel * dt; b.vx *= f; b.vy *= f; }
    if (b.drag) { const f = Math.max(0, 1 - b.drag * dt); b.vx *= f; b.vy *= f; }
    if (b.boomer && b.t > b.life * 0.42) {
      if (!b.returning) { b.returning = true; if (b.hit) b.hit.clear(); }
      const a = angTo(b.x, b.y, P.x, P.y), sp = Math.max(260, Math.hypot(b.vx, b.vy));
      b.vx = lerp(b.vx, Math.cos(a) * sp * 1.2, 0.15); b.vy = lerp(b.vy, Math.sin(a) * sp * 1.2, 0.15);
      if (d2(b.x, b.y, P.x, P.y) < 400) { b.dead = true; if (b.onReturn) b.onReturn(b); }
      b.life = b.t + 1; // keep alive until it returns
      if (b.t > 4) b.dead = true;
    }
    if (b.wave) {
      b.px += b.vx * dt; b.py += b.vy * dt;
      const sp = Math.hypot(b.vx, b.vy) || 1; const off = b.wave.a * Math.sin(b.t * b.wave.f + b.wave.ph);
      b.x = b.px - (b.vy / sp) * off; b.y = b.py + (b.vx / sp) * off;
    } else { b.x += b.vx * dt; b.y += b.vy * dt; }
    if (b.box) { // bounce in box around player
      const bx = b.box;
      if (b.x < P.x - bx) { b.x = P.x - bx; b.vx = Math.abs(b.vx); } if (b.x > P.x + bx) { b.x = P.x + bx; b.vx = -Math.abs(b.vx); }
      if (b.y < P.y - bx) { b.y = P.y - bx; b.vy = Math.abs(b.vy); } if (b.y > P.y + bx) { b.y = P.y + bx; b.vy = -Math.abs(b.vy); }
    }
    if (b.bounceWalls > 0) {
      const l = G.cam.x - VIEW.w / 2, r = G.cam.x + VIEW.w / 2, t = G.cam.y - VIEW.h / 2, bt = G.cam.y + VIEW.h / 2;
      if (b.x < l || b.x > r) { b.vx = b.x < l ? Math.abs(b.vx) : -Math.abs(b.vx); b.bounceWalls--; if (b.hit) b.hit.clear(); }
      if (b.y < t || b.y > bt) { b.vy = b.y < t ? Math.abs(b.vy) : -Math.abs(b.vy); b.bounceWalls--; if (b.hit) b.hit.clear(); }
    }
  }
  if (b.beam && b.beam.follow) { b.x = P.x; b.y = P.y; }
  if (b.trail) { b.trail.push(b.x, b.y); if (b.trail.length > 16) b.trail.splice(0, 2); }
  if (b.rides) chainRide(b, dt);
  if (b.t >= b.life) { b.dead = true; if (b.onExpire && !b.expired) { b.expired = true; b.onExpire(b); } chainExpire(b); }
}

function segDist2(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1; const L = dx * dx + dy * dy || 1;
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / L, 0, 1);
  return d2(px, py, x1 + dx * t, y1 + dy * t);
}

function collideBullet(b) {
  if (b.noHit || b.dead) return;
  if (b.lob && b.t < b.life) return;
  if (b.beam) {
    const L = b.beam.len * Math.sqrt(G.player.area);
    const x2 = b.x + Math.cos(b.beam.ang) * L, y2 = b.y + Math.sin(b.beam.ang) * L;
    const w = b.beam.w;
    for (const e of G.enemies) {
      if (e.dead) continue;
      if (segDist2(e.x, e.y, b.x, b.y, x2, y2) < (w + e.r) * (w + e.r)) {
        const nt = b.hitMap.get(e.id) || 0; if (nt > G.time) continue;
        b.hitMap.set(e.id, G.time + b.hitCd); hitEnemy(e, b);
      }
    }
    return;
  }
  forNear(b.x, b.y, b.r + 40, e => {
    const rr = b.r + e.r; if (d2(b.x, b.y, e.x, e.y) > rr * rr) return;
    if (b.hitMap) {
      const nt = b.hitMap.get(e.id) || 0; if (nt > G.time) return;
      b.hitMap.set(e.id, G.time + b.hitCd); hitEnemy(e, b); if (b.onHit) b.onHit(b, e);
      return;
    }
    if (b.hit.has(e.id)) return;
    b.hit.add(e.id); hitEnemy(e, b); if (b.onHit) b.onHit(b, e);
    if (b.bounces > 0) {
      const n = nearest(e.x, e.y, 260, b.hit);
      if (n) { b.bounces--; const a = angTo(b.x, b.y, n.x, n.y), sp = Math.hypot(b.vx, b.vy); b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; if (b.wave) { b.px = b.x; b.py = b.y; b.wave.a = 0; } b.t = Math.min(b.t, b.life * 0.3); return false; }
    }
    b.pierce--;
    if (b.pierce <= 0) { b.dead = true; if (b.onExpire && !b.expired) { b.expired = true; b.onExpire(b); } return false; }
  });
}

// ---------- damage types ----------
// A hit's types are what fired it: the firing item's own effects and fusion riders (or inst.hitTypes once a Hit augment changed
// them), plus the bullet's own effect (a chain link's shots carry the link's effect). The shared pool never changes a hit's
// type. b.dtype overrides it: burn and poison ticks, shock arcs, shrapnel and reactions say what they are.
function hitTypes(b) {
  if (b.dtype) return b.dtype;
  const o = b.owner, out = o ? (o.hitTypes || instEffects(o)).slice() : [];
  if (b.effect && !out.includes(b.effect)) out.push(b.effect);
  return out;
}
// Damage × enemy e takes from a hit of types ts (weak / resist / only on ENEMY_TYPES and BOSSES, DAMAGE_TYPES in items.js).
// The best type of the hit counts. `only`: immune (×0) to every type not listed. An untyped hit is neutral.
function typeMul(e, ts) {
  const T = e.T; if (!T || (!T.weak && !T.resist && !T.only)) return 1;
  if (T.only && T.only.length && !ts.some(k => T.only.includes(k))) return 0;
  if (!ts.length) return 1;
  let best = 0;
  for (const k of ts) { const m = T.weak && T.weak.includes(k) ? DAMAGE_TYPES.weak : T.resist && T.resist.includes(k) ? DAMAGE_TYPES.resist : 1; if (m > best) best = m; }
  return best;
}

// ---------- damage & effects ----------
let hitDepth = 0;
function hitEnemy(e, b) {
  if (e.dead) return;
  hitDepth++;
  const P = G.player;
  const S = k => poolStack(b, k);
  const tm = typeMul(e, hitTypes(b));
  let dmg = b.dmg * archComboMul(S), crit = false, bonus = 0;
  // critical
  const cc = 0.03 * S('crit') + P.critBonus;
  if (cc > 0 && Math.random() < cc) { dmg *= 2 + 0.1 * S('crit'); crit = true; G.stats.crits++; }
  // reactions
  if (e.burnT > 0 && e.slowT > 0 && (S('burn') || S('chill')) && e.reactCd <= 0) {
    bonus = (dmg + 10) * typeMul(e, ['burn', 'chill']); e.reactCd = 1.2; e.slowT = 0; fxText(e.x, e.y - 18, 'SHATTER', '#c9f4ff', 12); fxSpark(e.x, e.y, '#c9f4ff', 6, 160);
  }
  // status application (an immune enemy shrugs them off too)
  let s;
  if (tm > 0) {
  if ((s = S('burn')) > 0) { e.burnT = 2.5; e.burnDps = Math.max(e.burnDps, 2 + 1.6 * s); }
  if ((s = S('chill')) > 0) { e.slowT = 2; e.slow = Math.max(e.slow, Math.min(0.6, 0.07 * s)); if (s >= 5 && !e.boss && Math.random() < 0.035 * (s - 4)) e.freezeT = 1.2; }
  if ((s = S('poison')) > 0) { e.poisonT = 4; e.poison = Math.min(e.poison + 0.6 * s, 25 + G.time / 10); }
  const kb = S('knockback') * 9 + (b.kb || 0);
  if (kb > 0 && !e.boss) {
    let ax = b.vx, ay = b.vy; if (!ax && !ay) { ax = e.x - (b.x ?? P.x); ay = e.y - (b.y ?? P.y); }
    const l = Math.hypot(ax, ay) || 1; e.kx += (ax / l) * kb * 12 / e.mass; e.ky += (ay / l) * kb * 12 / e.mass;
  }
  }
  if ((s = S('vampiric')) > 0 && Math.random() < 0.012 * s) heal(1);
  dmg = dmg * tm + bonus;
  if (b.lifesteal) heal(dmg * b.lifesteal);
  if (b.owner) e.by = b.owner; // the item credited with the kill (its burn and poison ticks count for it too)
  if (tm === 0 && !bonus) { if (!(e.immT > G.time)) { e.immT = G.time + 0.7; fxText(e.x, e.y - e.r - 4, 'IMMUNE', '#8a86a8', 11); } }
  else damageEnemy(e, dmg, crit ? '#ffe14d' : tm > 1 ? '#ffd24c' : tm < 1 ? '#8a86a8' : (b.effect ? EFFECTS[b.effect].color : '#ffffff'), crit, tm);
  if (hitDepth < 3) chainHit(b, e); // fusion chains (chain.js)
  if (crit && hitDepth < 3 && !b.noTrig) trigger('crit', e); // noTrig: bullets made by a crit trigger, so crits cannot chain forever
  // shock arcs
  if (!b.noChain && hitDepth < 3 && (s = S('shock')) > 0 && Math.random() < 0.06 * s) {
    const n = nearest(e.x, e.y, 150, new Set([e.id]));
    if (n) {
      const mult = e.slowT > 0 ? 1.2 : 0.6;
      if (e.poisonT > 0) { n.poisonT = 4; n.poison = Math.max(n.poison, e.poison * 0.6); }
      zap(e.x, e.y, n, b.dmg * mult, b.effect, b.owner);
    }
  }
  // split on kill
  if (e.dead && hitDepth < 3 && (s = S('split')) > 0 && Math.random() < 0.1 * s) {
    const a0 = rand(0, TAU);
    for (let i = 0; i < 3; i++) shoot({ x: e.x, y: e.y, ang: a0 + i * TAU / 3, spd: 330, r: 3.5, dmg: b.dmg * 0.4 + 2, life: 0.5, color: '#5affd9', shape: 'shard', noMods: true, dtype: ['split'] });
  }
  hitDepth--;
}

// tm: the damage type × of the hit (core.js typeMul): weak hits show bigger with a "!", resisted ones smaller
function damageEnemy(e, dmg, color, crit, tm = 1) {
  if (e.dead) return;
  e.hp -= dmg; e.flash = 0.07; G.stats.damage += dmg;
  if (G.settings.numbers && (crit || dmg >= 3)) fxText(e.x, e.y - e.r, Math.round(dmg) + (tm > 1 ? '!' : ''), color, crit ? 16 : tm > 1 ? 14 : tm < 1 ? 10 : 11);
  if (e.hp <= 0) killEnemy(e);
}

// ---------- triggers (relics) ----------
let trigDepth = 0;
function trigger(name, arg) {
  if (trigDepth > 2) return; trigDepth++;
  for (const inst of G.runners || G.inv) { const on = inst.def.on; if (on && on[name]) on[name](inst, ctxOf(inst), arg); }
  trigDepth--;
}

// ---------- item instance ctx ----------
// inst.base is the item's own base damage. The fusion tier (FUSION in items.js) multiplies it and it grows 30% per level;
// each tier also adds +1 projectile and its cooldown factor. inst.carry is flat damage a fusion carried over: 100% of what
// the kept item hit for when it fused, plus 50% of what each item it absorbed hit for (absorb() in chain.js), so a fusion
// never makes an item weaker, even though it starts its new tier at the level's start level.
function baseDmg(inst) { return (inst.base ?? inst.def.dmg) * tierOf(inst).mul; }
const lvlF = L => 1 + 0.3 * (L - 1);
// damage of one hit before the player's damage bonus (passives: 0)
function itemPower(inst) { return inst.def.dmg || inst.carry ? baseDmg(inst) * lvlF(inst.level) + (inst.carry || 0) : 0; }
function ctxOf(inst) {
  const P = G.player, L = inst.level, T = inst.tier || 0, E = T ? 1 : 0, def = inst.def, e2 = def.effect2 || (inst.riders && inst.riders[0]) || def.effect;
  return { L, E, T, P, x: P.x, y: P.y, d: itemPower(inst) * P.might * archSlotMul(def), n: P.amount + T, aim: aimAngle(), face: P.face,
    col: def.color || EFFECTS[def.effect].color, col2: EFFECTS[e2].color, eff: def.effect, eff2: e2, inst };
}
function itemName(inst) {
  if (inst.nexus && typeof nexusDef === 'function' && nexusDef(inst.nexus)) return nexusDef(inst.nexus).name; // a Nexus (nexus.js)
  const T = inst.tier || 0; if (!T) return inst.def.name;
  const fused = (FUSE_PREFIX[inst.fuseEff || inst.def.effect] || 'Fused') + ' ' + inst.def.name;
  return T === 1 ? fused : tierOf(inst).name + ' ' + fused;
}
