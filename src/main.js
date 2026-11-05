'use strict';
// ===== VOIDLIGHT: run loop, director, enemies, player, rendering, menus, save =====

// ---------------- save data ----------------
const SAVE_KEY = 'voidlight.save.v1';
function defaultSave() {
  return { gold: 0, upg: {}, unlockedItems: [], unlockedChars: ['kael', 'mira', 'volt'],
    stats: { totalKills: 0, bestTime: 0, bossKills: 0, evolves: 0, wins: 0, runs: 0, maxLevel: 0, totalGold: 0 }, settings: { numbers: true }, lastChar: 'kael' };
}
let SAVE = defaultSave();
function loadSave() {
  try { const raw = localStorage.getItem(SAVE_KEY); if (raw) { const s = JSON.parse(raw); const d = defaultSave(); SAVE = Object.assign(d, s); SAVE.stats = Object.assign(d.stats, s.stats || {}); SAVE.settings = Object.assign(defaultSave().settings, s.settings || {}); } } catch (e) { SAVE = defaultSave(); }
}
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { /* storage unavailable */ } }
const itemUnlocked = d => !d.lock || SAVE.unlockedItems.includes(d.id);
const charUnlocked = c => !c.lock || SAVE.unlockedChars.includes(c.id);
function checkUnlocks() {
  const fresh = [];
  for (const d of ITEMS) if (d.lock && d.lock.cond && !SAVE.unlockedItems.includes(d.id) && d.lock.cond(SAVE.stats)) { SAVE.unlockedItems.push(d.id); fresh.push(d.icon + ' ' + d.name); }
  for (const c of CHARACTERS) if (c.lock && c.lock.cond && !SAVE.unlockedChars.includes(c.id) && c.lock.cond(SAVE.stats)) { SAVE.unlockedChars.push(c.id); fresh.push('🧍 ' + c.name + ' (character)'); }
  if (fresh.length) writeSave();
  return fresh;
}

// ---------------- enemies ----------------
const ENEMY_TYPES = {
  drone:   { name: 'Drone',     hp: 12, spd: 70,  r: 12, dmg: 8,  xp: 1, color: '#a55cff', shape: 'circle' },
  swarm:   { name: 'Swarmling', hp: 5,  spd: 100, r: 7,  dmg: 5,  xp: 1, color: '#ff9e4c', shape: 'circle' },
  darter:  { name: 'Darter',    hp: 9,  spd: 140, r: 9,  dmg: 6,  xp: 1, color: '#ff4c8b', shape: 'tri' },
  spitter: { name: 'Spitter',   hp: 22, spd: 60,  r: 13, dmg: 8,  xp: 2, color: '#4cffd2', shape: 'diamond', ranged: { range: 280, cd: 2.4, pat: 'aim' } },
  brute:   { name: 'Brute',     hp: 80, spd: 45,  r: 22, dmg: 15, xp: 5, color: '#7d5cff', shape: 'square', mass: 4 },
  bomber:  { name: 'Bomber',    hp: 26, spd: 72,  r: 14, dmg: 10, xp: 3, color: '#ffd24c', shape: 'hex', deathRing: 8 },
  warlock: { name: 'Warlock',   hp: 45, spd: 52,  r: 15, dmg: 10, xp: 5, color: '#4c9bff', shape: 'star', ranged: { range: 320, cd: 3, pat: 'spread' } },
  wraith:  { name: 'Wraith',    hp: 55, spd: 115, r: 13, dmg: 12, xp: 4, color: '#d0d6ff', shape: 'tri' },
};
const BOSSES = {
  matriarch: { name: 'Hollow Matriarch', hp: 1800,  spd: 55, r: 46, dmg: 20, xp: 80,  color: '#ff4cc3', shape: 'hex' },
  seraph:    { name: 'Clockwork Seraph', hp: 5500,  spd: 62, r: 44, dmg: 25, xp: 160, color: '#ffd24c', shape: 'star' },
  eclipse:   { name: 'The Eclipse',      hp: 14000, spd: 50, r: 58, dmg: 30, xp: 300, color: '#ff3b5c', shape: 'circle' },
};
const SPAWN_TABLE = [['drone', 0, 10], ['swarm', 0, 4], ['darter', 60, 5], ['spitter', 120, 3], ['brute', 210, 3], ['bomber', 270, 3], ['warlock', 390, 2], ['wraith', 480, 4]];
const RUN_LENGTH = 900;
const BOSS_TIMES = [[300, 'matriarch'], [600, 'seraph'], [900, 'eclipse']];
const hpMul = t => 1 + (t / 60) * 0.3 + Math.pow(t / 60, 2) * 0.04;

function spawnEnemy(type, x, y, o = {}) {
  const T = ENEMY_TYPES[type] || BOSSES[type];
  const m = o.boss ? 1 : hpMul(G.time) * (o.elite ? 8 : 1);
  const e = { id: G.nextId++, type, T, x, y, r: T.r * (o.elite ? 1.6 : 1), hp: T.hp * m, maxHp: T.hp * m, spd: T.spd * (o.elite ? 0.9 : 1) * (1 + Math.min(0.35, G.time / 2400)),
    dmg: T.dmg * (1 + G.time / 900), xp: T.xp * (o.elite ? 10 : 1), color: T.color, mass: T.mass || (o.boss ? 50 : o.elite ? 6 : 1), elite: !!o.elite, boss: !!o.boss,
    kx: 0, ky: 0, burnT: 0, burnDps: 0, slowT: 0, slow: 0, poisonT: 0, poison: 0, freezeT: 0, reactCd: 0, dot: 0, dotT: 0, flash: 0, shootT: rand(0.5, 2), at: 0, spin: 0, phase: 0 };
  G.enemies.push(e); return e;
}
function spawnRing(dist) { const a = rand(0, TAU); const P = G.player; return { x: P.x + Math.cos(a) * dist, y: P.y + Math.sin(a) * dist }; }
function viewRadius() { return Math.hypot(VIEW.w, VIEW.h) / 2 + 40; }
function ebullet(x, y, ang, spd, r = 6, dmg = 8, color = '#ff3b8b') { if (G.ebullets.length < 900) G.ebullets.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, r, dmg, color, t: 0, life: 6 }); }

function director(dt) {
  const t = G.time;
  // regular spawns
  const rate = 0.8 + (t / 60) * 0.75 + Math.pow(t / 60, 2) * 0.05;
  G.spawnAcc += rate * dt;
  const avail = SPAWN_TABLE.filter(s => t >= s[1]); const totalW = avail.reduce((a, s) => a + s[2], 0);
  while (G.spawnAcc >= 1) {
    G.spawnAcc -= 1; if (G.enemies.length > 380) continue;
    let r = Math.random() * totalW, type = avail[0][0]; for (const s of avail) { r -= s[2]; if (r <= 0) { type = s[0]; break; } }
    const p = spawnRing(viewRadius()); const pack = type === 'swarm' ? 4 : 1;
    for (let k = 0; k < pack; k++) spawnEnemy(type, p.x + rand(-20, 20), p.y + rand(-20, 20));
  }
  // encirclement waves
  if (t >= G.nextRing) { G.nextRing += 60; const n = 22 + Math.floor(t / 60) * 2; const R = 360; for (let k = 0; k < n; k++) { const a = k * TAU / n; spawnEnemy(t > 400 ? 'darter' : 'swarm', G.player.x + Math.cos(a) * R, G.player.y + Math.sin(a) * R); } banner('Encirclement!', '#ff9e4c'); }
  // elites
  if (t >= G.nextElite) { G.nextElite += 45; const p = spawnRing(viewRadius()); spawnEnemy(pick(avail)[0], p.x, p.y, { elite: true }); banner('An elite approaches', '#ffe14d'); }
  // bosses
  for (const [bt, id] of BOSS_TIMES) if (t >= bt && !G.bossSpawned[id]) {
    G.bossSpawned[id] = true; const p = spawnRing(viewRadius() - 60); spawnEnemy(id, p.x, p.y, { boss: true }); banner('⚠ ' + BOSSES[id].name + ' ⚠', '#ff3b5c', 3);
  }
}

function bossAI(e, dt) {
  e.at += dt; const P = G.player; const toP = angTo(e.x, e.y, P.x, P.y);
  if (e.type === 'matriarch') {
    e.shootT -= dt; if (e.shootT <= 0) { e.shootT = 2.2; e.spin += 0.17; for (let k = 0; k < 18; k++) ebullet(e.x, e.y, e.spin + k * TAU / 18, 150, 7, 12); }
    e.phase -= dt; if (e.phase <= 0) { e.phase = 6; for (let k = 0; k < 8; k++) spawnEnemy('swarm', e.x + rand(-40, 40), e.y + rand(-40, 40)); }
  } else if (e.type === 'seraph') {
    e.shootT -= dt; if (e.shootT <= 0) { e.shootT = 0.09; e.spin += 0.23; for (let k = 0; k < 2; k++) ebullet(e.x, e.y, e.spin + k * Math.PI, 150, 6, 12, '#ffd24c'); }
    e.phase -= dt; if (e.phase <= 0) { e.phase = 2.5; for (let k = -1; k <= 1; k++) ebullet(e.x, e.y, toP + k * 0.18, 230, 7, 14); }
  } else if (e.type === 'eclipse') {
    const ph = Math.floor(e.at / 6) % 3; e.shootT -= dt;
    if (e.shootT <= 0) {
      if (ph === 0) { e.shootT = 0.1; e.spin += 0.19; for (let k = 0; k < 4; k++) ebullet(e.x, e.y, e.spin + k * TAU / 4, 160, 6, 14, '#ff3b5c'); }
      else if (ph === 1) { e.shootT = 0.85; const off = rand(0, TAU); for (let k = 0; k < 24; k++) ebullet(e.x, e.y, off + k * TAU / 24, 140, 7, 14, '#ff8a3d'); }
      else { e.shootT = 0.55; for (let k = -3; k <= 3; k++) ebullet(e.x, e.y, toP + k * 0.14, 210, 6, 14, '#b48cff'); }
    }
  }
}

function updateEnemies(dt) {
  const P = G.player, far = viewRadius() * 1.8;
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.flash -= dt; e.reactCd -= dt;
    // damage over time
    let dps = 0;
    if (e.burnT > 0) { e.burnT -= dt; dps += e.burnDps; if (e.burnT <= 0) e.burnDps = 0; }
    if (e.poisonT > 0) { e.poisonT -= dt; dps += e.poison; if (e.poisonT <= 0) e.poison = 0; }
    if (dps > 0) { e.dot += dps * dt; e.dotT -= dt; if (e.dotT <= 0) { e.dotT = 0.5; const v = e.dot; e.dot = 0; damageEnemy(e, v, e.poisonT > 0 ? '#8cff5a' : '#ff7a2f', false); if (e.dead) continue; } }
    if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
    if (e.boss) bossAI(e, dt);
    if (e.freezeT > 0) { e.freezeT -= dt; continue; }
    const dist = Math.sqrt(d2(e.x, e.y, P.x, P.y));
    if (!e.boss && dist > far) { const p = spawnRing(viewRadius()); e.x = p.x; e.y = p.y; continue; }
    const a = angTo(e.x, e.y, P.x, P.y);
    let spd = e.spd * (1 - e.slow);
    const R = e.T.ranged;
    if (R) {
      if (dist < R.range * 0.8) spd *= -0.4; else if (dist < R.range) spd *= 0.15;
      e.shootT -= dt;
      if (e.shootT <= 0 && dist < R.range + 60) { e.shootT = R.cd * rand(0.85, 1.15);
        if (R.pat === 'aim') ebullet(e.x, e.y, a, 170, 6, 8); else for (let k = -1; k <= 1; k++) ebullet(e.x, e.y, a + k * 0.25, 160, 6, 9, '#4c9bff'); }
    }
    e.x += (Math.cos(a) * spd + e.kx) * dt; e.y += (Math.sin(a) * spd + e.ky) * dt;
    const damp = Math.max(0, 1 - 7 * dt); e.kx *= damp; e.ky *= damp;
    // contact damage
    if (dist < e.r + P.r + 2) hurtPlayer(e.dmg);
  }
  // light separation
  for (const e of G.enemies) {
    if (e.dead || e.boss) continue;
    forNear(e.x, e.y, e.r * 2, o => { if (o === e || o.id < e.id) return; const rr = e.r + o.r; const dd = d2(e.x, e.y, o.x, o.y); if (dd > 0 && dd < rr * rr) { const d = Math.sqrt(dd), push = (rr - d) * 0.3 / d; const dx = (e.x - o.x) * push, dy = (e.y - o.y) * push; if (!o.boss) { o.x -= dx; o.y -= dy; } e.x += dx; e.y += dy; } });
  }
}

function killEnemy(e) {
  if (e.dead) return; e.dead = true; G.kills++;
  const P = G.player;
  dropGem(e.x, e.y, e.xp);
  if (Math.random() < 0.035 * (1 + P.luck * 2)) drop('coin', e.x + rand(-8, 8), e.y + rand(-8, 8), randi(1, 3));
  if (Math.random() < 0.0015 * (1 + P.luck)) drop('heart', e.x, e.y, 25);
  if (Math.random() < 0.0008) drop('magnet', e.x, e.y, 0);
  if (e.elite) { drop('chest', e.x, e.y, 1); for (let k = 0; k < 6; k++) drop('coin', e.x + rand(-30, 30), e.y + rand(-30, 30), 3); }
  if (e.boss) { G.stats.bossKills++; drop('chest', e.x, e.y, 3); for (let k = 0; k < 15; k++) drop('coin', e.x + rand(-60, 60), e.y + rand(-60, 60), 5); fxRing(e.x, e.y, 200, e.color, 0.8, 8); banner(e.T.name + ' defeated!', '#6bff8f', 2.5);
    if (e.type === 'eclipse') later(1.5, () => endRun(true)); }
  if (e.T.deathRing) for (let k = 0; k < e.T.deathRing; k++) ebullet(e.x, e.y, k * TAU / e.T.deathRing + rand(0, 0.3), 130, 6, 8, '#ffd24c');
  if (e.burnT > 0 && e.poisonT > 0) { fxText(e.x, e.y - 14, 'COMBUST', '#ffb86b', 12); later(0, () => strike(e.x, e.y, 55, 8 + e.maxHp * 0.15, 'burn', { color: '#ffb86b' })); }
  fxSpark(e.x, e.y, e.color, e.boss ? 30 : 4, e.boss ? 300 : 110);
  trigger('kill', e);
}

// ---------------- pickups ----------------
function drop(k, x, y, v) { G.pickups.push({ k, x, y, v, pull: false, t: 0 }); }
function dropGem(x, y, v) {
  if (G.pickups.length > 520) { const g = G.pickups.find(p => p.k === 'gem' && d2(p.x, p.y, x, y) > 250000); if (g) { g.v += v; return; } }
  drop('gem', x, y, v);
}
function updatePickups(dt) {
  const P = G.player; const mag = P.magnet * P.magnet;
  for (const p of G.pickups) {
    if (p.dead) continue; p.t += dt;
    const dd = d2(p.x, p.y, P.x, P.y);
    if (!p.pull && (dd < mag || (p.k === 'chest' && dd < 2500))) p.pull = true;
    if (p.pull) { const a = angTo(p.x, p.y, P.x, P.y), s = 250 + p.t * 60 + (p.k === 'gem' ? 200 : 0); p.x += Math.cos(a) * s * dt; p.y += Math.sin(a) * s * dt; }
    if (dd < 18 * 18) { p.dead = true; collect(p); }
  }
  G.pickups = G.pickups.filter(p => !p.dead);
}
function collect(p) {
  const P = G.player;
  if (p.k === 'gem') { gainXp(p.v * P.growth); trigger('pickup', p); }
  else if (p.k === 'coin') { G.gold += p.v * P.greed; }
  else if (p.k === 'heart') heal(p.v);
  else if (p.k === 'magnet') { for (const q of G.pickups) if (q.k === 'gem') q.pull = true; banner('Magnetized!', '#7fdcff', 1); }
  else if (p.k === 'chest') openChest(p.v);
}
function xpFor(l) { return Math.floor(5 + (l - 1) * 5 + Math.pow(l - 1, 1.75)); }
function gainXp(v) { G.xp += v; while (G.xp >= G.xpNext) { G.xp -= G.xpNext; G.level++; G.xpNext = xpFor(G.level); G.pendingLevels++; } }

// ---------------- inventory ----------------
function available(def) { return itemUnlocked(def) || def.id === G.char.weapon; }
function slotCount(slot) { return G.inv.filter(i => i.def.slot === slot).length; }
function recomputePool() { const p = {}; for (const k of EFFECT_KEYS) p[k] = 0; for (const i of G.inv) p[i.def.effect] += i.level * (i.evo ? 2 : 1); G.pool = p; }
function rebuild(inst) {
  for (const b of G.bullets) if (b.owner === inst && b.persist) b.dead = true;
  for (const d of G.deploys) if (d.owner === inst && d.persist) d.dead = true;
  if (inst.def.spawn) inst.def.spawn(inst, ctxOf(inst));
}
function addItem(def) { const inst = { def, level: 1, timer: 0.3, state: {}, evo: false }; G.inv.push(inst); recomputePool(); rebuild(inst); return inst; }
function levelItem(inst) { inst.level = Math.min(MAX_LEVEL, inst.level + 1); recomputePool(); rebuild(inst); }
function fuseItem(inst) { inst.evo = true; G.stats.evolves++; recomputePool(); rebuild(inst); banner('FUSION: ' + itemName(inst), '#ffe14d', 2.5); fxRing(G.player.x, G.player.y, 160, '#ffe14d', 0.6, 6); }
function fusionPartner(inst) { if (inst.evo || inst.level < MAX_LEVEL) return null; return G.inv.find(o => o !== inst && o.def.effect === inst.def.effect && o.def.slot !== inst.def.slot && o.level >= MAX_LEVEL) || null; }

function buildChoices() {
  const opts = [];
  for (const inst of G.inv) { const p = fusionPartner(inst); if (p) opts.push({ type: 'fuse', inst, partner: p, w: 8 }); }
  for (const inst of G.inv) if (inst.level < MAX_LEVEL) opts.push({ type: 'up', inst, w: 3 });
  for (const s of SLOT_KEYS) {
    if (slotCount(s) >= SLOTS[s].sockets) continue;
    const cands = ITEMS.filter(d => d.slot === s && available(d) && !G.inv.some(i => i.def === d));
    for (const d of cands) opts.push({ type: 'new', def: d, w: 2.4 / cands.length });
  }
  const k = 3 + (Math.random() < 0.15 + G.player.luck * 2 ? 1 : 0);
  const out = [];
  while (out.length < k && opts.length) {
    const tw = opts.reduce((a, o) => a + o.w, 0); let r = Math.random() * tw, idx = 0;
    for (; idx < opts.length; idx++) { r -= opts[idx].w; if (r <= 0) break; }
    idx = Math.min(idx, opts.length - 1); const o = opts.splice(idx, 1)[0];
    if (o.type === 'fuse') { for (let j = opts.length - 1; j >= 0; j--) if (opts[j].inst === o.inst) opts.splice(j, 1); }
    out.push(o);
  }
  if (!out.length) out.push({ type: 'heal' }, { type: 'gold' });
  return out;
}
function applyChoice(o) {
  if (o.type === 'new') addItem(o.def);
  else if (o.type === 'up') levelItem(o.inst);
  else if (o.type === 'fuse') fuseItem(o.inst);
  else if (o.type === 'heal') heal(40);
  else if (o.type === 'gold') G.gold += 25;
}
function openChest(n) {
  const got = [];
  for (let k = 0; k < n; k++) {
    let o = null; const fus = G.inv.filter(fusionPartner);
    if (fus.length) o = { type: 'fuse', inst: fus[0] };
    else { const c = buildChoices().filter(x => x.type !== 'new'); o = c.length ? pick(c) : { type: 'gold' }; }
    applyChoice(o); got.push(describeChoice(o).title);
  }
  G.gold += 10 * n;
  toast('📦 Chest: ' + got.join(', '));
}

// ---------------- player ----------------
const keys = {};
const touch = { active: false, ox: 0, oy: 0, x: 0, y: 0 };
function buildPlayer(ch) {
  const U = id => { const u = UPGRADES.find(x => x.id === id); return u.per * (SAVE.upg[id] || 0); };
  const m = ch.mods;
  const P = { x: 0, y: 0, r: 7, face: 0, moveAng: 0, moving: false, stillT: 0, inv: 1, dashT: 0, dashCd: 0, dashA: 0, hurtFlash: 0,
    might: 1 + U('might') + (m.might || 0), maxHp: Math.round(100 * (1 + U('hp') + (m.hp || 0))), armor: U('armor') + (m.armor || 0), regen: U('regen') + (m.regen || 0),
    speed: 200 * (1 + U('speed') + (m.speed || 0)), area: 1 + U('area') + (m.area || 0), cdMul: 1 - U('cd') - (m.cd || 0), projSpd: 1 + U('projSpd') + (m.projSpd || 0),
    duration: 1 + U('duration') + (m.duration || 0), amount: U('amount') + (m.amount || 0), magnet: 90 * (1 + U('magnet')), luck: U('luck'), growth: 1 + U('growth'), greed: 1 + U('greed'),
    critBonus: (m.crit || 0) + U('luck') * 0.4, revives: U('revive'), rerolls: U('reroll') + 1 };
  P.hp = P.maxHp; return P;
}
function updatePlayer(dt) {
  const P = G.player;
  let mx = 0, my = 0;
  if (keys.KeyW || keys.ArrowUp) my -= 1; if (keys.KeyS || keys.ArrowDown) my += 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1; if (keys.KeyD || keys.ArrowRight) mx += 1;
  if (touch.active) { const dx = touch.x - touch.ox, dy = touch.y - touch.oy, l = Math.hypot(dx, dy); if (l > 8) { mx = dx / Math.max(l, 50); my = dy / Math.max(l, 50); } }
  const l = Math.hypot(mx, my);
  P.moving = l > 0.05;
  if (P.moving) { if (l > 1) { mx /= l; my /= l; } P.moveAng = Math.atan2(my, mx); P.face = P.moveAng; P.stillT = 0; } else P.stillT += dt;
  P.dashCd -= dt;
  let sp = P.speed;
  if (P.dashT > 0) { P.dashT -= dt; mx = Math.cos(P.dashA); my = Math.sin(P.dashA); sp *= 3.4; if (Math.random() < 0.8) fxSpark(P.x, P.y, G.char.color, 1, 60); }
  const ox = P.x, oy = P.y;
  P.x += mx * sp * dt; P.y += my * sp * dt;
  const moved = Math.hypot(P.x - ox, P.y - oy); if (moved > 0) trigger('move', moved);
  P.inv -= dt; P.hurtFlash -= dt;
  if (P.regen > 0) { P.regenAcc = (P.regenAcc || 0) + P.regen * dt; if (P.regenAcc >= 1) { P.hp = Math.min(P.maxHp, P.hp + P.regenAcc); P.regenAcc = 0; } }
}
function dash() { const P = G.player; if (!G || P.dashCd > 0 || G.paused) return; P.dashT = 0.16; P.dashCd = 1.1; P.dashA = P.moving ? P.moveAng : P.face; P.inv = Math.max(P.inv, 0.3); }
function hurtPlayer(dmg) {
  const P = G.player; if (P.inv > 0 || G.over) return;
  dmg = Math.max(1, dmg - P.armor); P.hp -= dmg; P.inv = 0.7; P.hurtFlash = 0.2; G.shake = 6;
  fxText(P.x, P.y - 18, '-' + Math.round(dmg), '#ff3b5c', 14);
  trigger('hurt', dmg);
  if (P.hp <= 0) {
    if (P.revives > 0) { P.revives--; P.hp = P.maxHp * 0.5; P.inv = 2.5; G.ebullets = []; strike(P.x, P.y, 260, 200, 'knockback', { kb: 120 }); banner('Second Wind!', '#6bff8f', 2); }
    else endRun(false);
  }
}
function updateEBullets(dt) {
  const P = G.player;
  for (const b of G.ebullets) {
    b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.t > b.life) { b.dead = true; continue; }
    const rr = b.r * 0.75 + P.r; if (d2(b.x, b.y, P.x, P.y) < rr * rr) { if (P.inv <= 0) { b.dead = true; hurtPlayer(b.dmg); } }
  }
  G.ebullets = G.ebullets.filter(b => !b.dead);
}

// ---------------- run lifecycle ----------------
function newRun(charId) {
  const ch = CHARACTERS.find(c => c.id === charId) || CHARACTERS[0];
  SAVE.lastChar = ch.id; writeSave();
  G = { time: 0, char: ch, player: null, cam: { x: 0, y: 0 }, enemies: [], bullets: [], ebullets: [], fx: [], texts: [], pickups: [], deploys: [], sched: [], inv: [], pool: {},
    kills: 0, level: 1, xp: 0, xpNext: xpFor(1), gold: 0, pendingLevels: 0, paused: false, over: false, nextId: 1, spawnAcc: 0, nextRing: 90, nextElite: 60, bossSpawned: {},
    stats: { evolves: 0, bossKills: 0, crits: 0, healed: 0, damage: 0 }, settings: SAVE.settings, banners: [], shake: 0 };
  G.player = buildPlayer(ch);
  recomputePool();
  addItem(ITEM[ch.weapon]);
  showScreen(null);
}
function update(dt) {
  G.time += dt;
  // scheduled callbacks
  if (G.sched.length) { const due = G.sched.filter(s => s.t <= G.time); if (due.length) { G.sched = G.sched.filter(s => s.t > G.time); for (const s of due) s.fn(); } }
  updatePlayer(dt);
  G.cam.x = G.player.x; G.cam.y = G.player.y;
  director(dt);
  gridBuild();
  // items
  for (const inst of G.inv) {
    const d = inst.def;
    if (d.fire) { inst.timer -= dt; if (inst.timer <= 0) { inst.timer = cdFor(inst, d.cd); d.fire(inst, ctxOf(inst)); } }
    if (d.update) d.update(inst, dt);
  }
  for (const d of G.deploys) { if (d.dead) continue; d.t += dt; if (d.update) d.update(d, dt); if (d.t >= d.life) { d.dead = true; if (d.onEnd) d.onEnd(d); } }
  G.deploys = G.deploys.filter(d => !d.dead);
  for (const b of G.bullets) { if (!b.dead) updateBullet(b, dt); }
  for (const b of G.bullets) collideBullet(b);
  G.bullets = G.bullets.filter(b => !b.dead);
  updateEnemies(dt);
  G.enemies = G.enemies.filter(e => !e.dead);
  updateEBullets(dt);
  updatePickups(dt);
  for (const f of G.fx) { f.t += dt; if (f.k === 'spark') { f.x += f.vx * dt; f.y += f.vy * dt; } }
  G.fx = G.fx.filter(f => f.t < f.dur);
  for (const t of G.texts) t.t += dt; G.texts = G.texts.filter(t => t.t < 0.7);
  for (const b of G.banners) b.t += dt; G.banners = G.banners.filter(b => b.t < b.dur);
  G.shake = Math.max(0, G.shake - dt * 30);
  if (G.pendingLevels > 0 && !G.over) { G.pendingLevels--; trigger('levelup'); openLevelUp(); }
}
function endRun(won) {
  if (G.over) return; G.over = true;
  const s = SAVE.stats; const bonus = Math.floor(G.time / 60) * 10 + (won ? 250 : 0);
  const earned = Math.round(G.gold + bonus);
  SAVE.gold += earned; s.totalGold += earned; s.totalKills += G.kills; s.bestTime = Math.max(s.bestTime, Math.floor(G.time)); s.bossKills += G.stats.bossKills;
  s.evolves += G.stats.evolves; s.runs++; if (won) s.wins++; s.maxLevel = Math.max(s.maxLevel, G.level);
  writeSave();
  const fresh = checkUnlocks();
  setTimeout(() => showGameOver(won, earned, bonus, fresh), 400);
}

// ---------------- banners / toasts ----------------
function banner(text, color = '#fff', dur = 1.8) { if (G) G.banners.push({ text, color, t: 0, dur }); }
function toast(msg) { const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; $('#toasts').appendChild(el); setTimeout(() => el.remove(), 3500); }

// ---------------- rendering ----------------
const canvas = document.getElementById('game'); const ctx = canvas.getContext('2d');
let DPR = 1;
function resize() { DPR = Math.min(2, window.devicePixelRatio || 1); VIEW.w = window.innerWidth; VIEW.h = window.innerHeight; canvas.width = VIEW.w * DPR; canvas.height = VIEW.h * DPR; canvas.style.width = VIEW.w + 'px'; canvas.style.height = VIEW.h + 'px'; }
window.addEventListener('resize', resize); resize();

function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, r), 0, TAU); ctx.fill(); }
function glow(x, y, r, col) { ctx.fillStyle = col; ctx.globalAlpha = 0.22; circle(x, y, r * 2.1); ctx.globalAlpha = 1; circle(x, y, r); ctx.fillStyle = '#fff'; circle(x, y, r * 0.42); }
function poly(x, y, r, n, rot, inner) {
  ctx.beginPath();
  for (let k = 0; k < n * (inner ? 2 : 1); k++) { const rr = inner && k % 2 ? r * inner : r; const a = rot + k * TAU / (n * (inner ? 2 : 1)); const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
  ctx.closePath();
}
function elong(x, y, ang, len, w, col) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = col; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.ellipse(0, 0, len * 1.6, w * 2.2, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1; ctx.beginPath(); ctx.ellipse(0, 0, len, w, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(len * 0.2, 0, len * 0.5, w * 0.45, 0, 0, TAU); ctx.fill(); ctx.restore();
}
function drawBullet(b, x, y) {
  const col = b.rainbow ? `hsl(${(G.time * 400 + b.t * 700) % 360},100%,65%)` : b.color;
  let ang = Math.atan2(b.vy, b.vx);
  if (b.orbit) ang = b.orbit.a + Math.PI / 2 * Math.sign(b.orbit.w);
  if (b.lob) { const h = Math.sin(Math.PI * clamp(b.t / b.life, 0, 1)) * b.lob; ctx.fillStyle = 'rgba(0,0,0,0.4)'; circle(x, y, b.r); y -= h; }
  const r = b.r;
  switch (b.shape) {
    case 'aura': { ctx.fillStyle = col; ctx.globalAlpha = 0.09; circle(x, y, r); ctx.globalAlpha = 0.45; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.8; for (let k = 0; k < 6; k++) { const a = G.time * 0.8 + k * TAU / 6; circle(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85, 2.5); } ctx.globalAlpha = 1; break; }
    case 'beam': { const L = b.beam.len * Math.sqrt(G.player.area); const a = 1 - b.t / b.life; ctx.strokeStyle = col; ctx.globalAlpha = 0.35 * a; ctx.lineWidth = b.beam.w * 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(b.beam.ang) * L, y + Math.sin(b.beam.ang) * L); ctx.stroke(); ctx.globalAlpha = a; ctx.lineWidth = b.beam.w; ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = b.beam.w * 0.35; ctx.stroke(); ctx.globalAlpha = 1; break; }
    case 'shard': case 'feather': case 'spark': elong(x, y, ang, r * 2.2, r * 0.7, col); break;
    case 'bolt': elong(x, y, ang, r * 4.5, r * 0.6, col); break;
    case 'lance': elong(x, y, ang, r * 6, r * 0.6, col); break;
    case 'missile': case 'dagger': elong(x, y, ang, r * 2.6, r * 0.8, col); break;
    case 'petal': elong(x, y, ang, r * 1.8, r * 0.9, col); break;
    case 'disc': case 'glaive': case 'blade': case 'star': case 'prism': case 'shield': {
      const n = { disc: 6, glaive: 3, blade: 4, star: 5, prism: 3, shield: 4 }[b.shape]; const inner = { glaive: 0.35, blade: 0.3, star: 0.45 }[b.shape];
      ctx.fillStyle = col; ctx.globalAlpha = 0.22; circle(x, y, r * 2); ctx.globalAlpha = 1;
      poly(x, y, r * 1.2, n, b.shape === 'shield' ? ang : G.time * (b.shape === 'star' ? 4 : 12) + b.t, inner); ctx.fill(); ctx.fillStyle = '#fff'; circle(x, y, r * 0.35); break; }
    case 'skull': case 'bat': { ctx.fillStyle = col; ctx.globalAlpha = 0.25; circle(x, y, r * 2); ctx.globalAlpha = 1; ctx.beginPath(); ctx.ellipse(x, y, r * 1.4, r * 0.8, ang, 0, TAU); ctx.fill(); ctx.fillStyle = '#200'; circle(x - 2, y - 1, 1.4); circle(x + 2, y - 1, 1.4); break; }
    case 'flame': { const a = 1 - b.t / b.life; ctx.fillStyle = col; ctx.globalAlpha = 0.35 * a; circle(x, y, r * 1.6); ctx.globalAlpha = 0.8 * a; circle(x, y - 2, r * 0.8); ctx.globalAlpha = 1; break; }
    case 'spore': { const a = b.life === Infinity ? 1 : 1 - b.t / b.life; ctx.fillStyle = col; ctx.globalAlpha = 0.3 * a + 0.1; circle(x, y, r * 1.3); ctx.globalAlpha = 0.9; circle(x, y, r * 0.4); ctx.globalAlpha = 1; break; }
    default: glow(x, y, r, col);
  }
}
function drawEnemy(e, x, y) {
  const col = e.flash > 0 ? '#ffffff' : e.color;
  const r = e.r;
  if (e.elite || e.boss) { ctx.fillStyle = e.color; ctx.globalAlpha = 0.15 + 0.08 * Math.sin(G.time * 6); circle(x, y, r * 1.6); ctx.globalAlpha = 1; }
  ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
  const sh = e.T.shape, rot = e.boss ? G.time * 0.6 : angTo(e.x, e.y, G.player.x, G.player.y);
  if (sh === 'circle') { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
  else if (sh === 'tri') poly(x, y, r * 1.2, 3, rot);
  else if (sh === 'diamond') poly(x, y, r * 1.2, 4, rot);
  else if (sh === 'square') poly(x, y, r * 1.2, 4, Math.PI / 4);
  else if (sh === 'hex') poly(x, y, r * 1.1, 6, rot);
  else poly(x, y, r * 1.3, 5, rot, 0.5);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; circle(x, y, r * 0.45);
  ctx.fillStyle = e.boss ? '#fff' : '#ffe'; circle(x + Math.cos(rot) * r * 0.35, y + Math.sin(rot) * r * 0.35, Math.max(1.6, r * 0.16));
  // status rings
  let ring = 0; const st = [[e.burnT > 0, '#ff7a2f'], [e.slowT > 0, '#7fdcff'], [e.poisonT > 0, '#8cff5a'], [e.freezeT > 0, '#ffffff']];
  for (const [on, c] of st) if (on) { ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r + 3 + ring * 3, 0, TAU); ctx.stroke(); ring++; }
  if (e.elite && !e.boss) { const w = r * 2.4; ctx.fillStyle = '#300'; ctx.fillRect(x - w / 2, y - r - 12, w, 4); ctx.fillStyle = '#ffe14d'; ctx.fillRect(x - w / 2, y - r - 12, w * clamp(e.hp / e.maxHp, 0, 1), 4); }
}
function drawDeploy(d, x, y) {
  const c = d.color;
  switch (d.kind) {
    case 'cloud': { ctx.fillStyle = c; ctx.globalAlpha = 0.16 * Math.min(1, (d.life - d.t) * 2); for (let k = 0; k < 4; k++) circle(x + Math.cos(d.t + k * 1.6) * d.r * 0.3, y + Math.sin(d.t * 1.3 + k) * d.r * 0.3, d.r * 0.75); ctx.globalAlpha = 1; break; }
    case 'wave': { ctx.strokeStyle = c; ctx.globalAlpha = 1 - d.t / d.life; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(x, y, Math.max(1, d.R), 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; break; }
    case 'well': { ctx.strokeStyle = c; ctx.lineWidth = 2; for (let k = 0; k < 4; k++) { const rr = ((d.t * 0.8 + k / 4) % 1) * d.r; ctx.globalAlpha = rr / d.r * 0.6; ctx.beginPath(); ctx.arc(x, y, d.r - rr, 0, TAU); ctx.stroke(); } ctx.globalAlpha = 1; ctx.fillStyle = '#000'; circle(x, y, 14); ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(x, y, 14, 0, TAU); ctx.stroke(); break; }
    case 'mine': { ctx.fillStyle = c; ctx.globalAlpha = d.t < 0.5 ? 0.4 : 0.6 + 0.4 * Math.sin(G.time * 10); circle(x, y, 7); ctx.globalAlpha = 0.25; circle(x, y, 14); ctx.globalAlpha = 1; break; }
    case 'pod': { ctx.fillStyle = c; ctx.globalAlpha = 0.6; circle(x, y, 10 + Math.sin(G.time * 20) * 2); ctx.globalAlpha = 1; break; }
    default: { // turret-like objects and pets
      const icon = d.icon || ({ coil: '🗼', totem: '🗿', turret: '🎯', nest: '🔭', altar: '⛩️' })[d.kind] || '•';
      ctx.fillStyle = c; ctx.globalAlpha = 0.2; circle(x, y, d.kind === 'pet' ? 14 : 20); ctx.globalAlpha = 1;
      if (d.kind !== 'pet') { ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 16, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - d.t / d.life)); ctx.stroke(); }
      if (d.kind === 'altar') { ctx.strokeStyle = c; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(x, y, 100, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.font = (d.kind === 'pet' ? 16 : 18) + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(icon, x, y + 1);
    }
  }
}
function drawPickup(p, x, y) {
  if (p.k === 'gem') { const col = p.v >= 10 ? '#ff5a7a' : p.v >= 3 ? '#5aff9c' : '#5ab8ff'; const s = p.v >= 10 ? 7 : p.v >= 3 ? 5.5 : 4.5; ctx.fillStyle = col; ctx.globalAlpha = 0.25; circle(x, y, s * 1.8); ctx.globalAlpha = 1; poly(x, y, s, 4, 0); ctx.fill(); }
  else if (p.k === 'coin') { ctx.fillStyle = '#ffd24c'; circle(x, y, 5); ctx.fillStyle = '#fff6c4'; circle(x - 1, y - 1, 2); }
  else { ctx.font = '18px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText({ heart: '❤️', magnet: '🧲', chest: '📦' }[p.k], x, y + Math.sin(G.time * 4) * 2); }
}
function render() {
  const W = VIEW.w, H = VIEW.h;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#07060f'; ctx.fillRect(0, 0, W, H);
  if (!G) return;
  const sx0 = (G.shake ? rand(-G.shake, G.shake) : 0), sy0 = (G.shake ? rand(-G.shake, G.shake) : 0);
  const ox = W / 2 - G.cam.x + sx0, oy = H / 2 - G.cam.y + sy0;
  // grid
  ctx.strokeStyle = 'rgba(130,100,255,0.08)'; ctx.lineWidth = 1; const gs = 64;
  ctx.beginPath(); for (let x = ((ox % gs) + gs) % gs; x < W; x += gs) { ctx.moveTo(x, 0); ctx.lineTo(x, H); } for (let y = ((oy % gs) + gs) % gs; y < H; y += gs) { ctx.moveTo(0, y); ctx.lineTo(W, y); } ctx.stroke();
  const vis = (x, y, m = 80) => x > -m && x < W + m && y > -m && y < H + m;
  for (const p of G.pickups) { const x = p.x + ox, y = p.y + oy; if (vis(x, y)) drawPickup(p, x, y); }
  for (const d of G.deploys) { const x = d.x + ox, y = d.y + oy; if (vis(x, y, 220)) drawDeploy(d, x, y); }
  for (const e of G.enemies) { const x = e.x + ox, y = e.y + oy; if (vis(x, y)) drawEnemy(e, x, y); }
  ctx.globalCompositeOperation = 'lighter';
  for (const b of G.bullets) { const x = b.x + ox, y = b.y + oy; if (b.beam || vis(x, y, b.r * 3 + 20)) drawBullet(b, x, y); }
  ctx.globalCompositeOperation = 'source-over';
  // player
  const P = G.player, px = P.x + ox, py = P.y + oy;
  if (!(P.inv > 0 && Math.floor(G.time * 20) % 2 && P.dashT <= 0)) {
    ctx.fillStyle = G.char.color; ctx.globalAlpha = 0.2; circle(px, py, 22); ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(px, py); ctx.rotate(P.face); ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-10, -10); ctx.lineTo(-5, 0); ctx.lineTo(-10, 10); ctx.closePath();
    ctx.fillStyle = P.hurtFlash > 0 ? '#ff3b5c' : G.char.color; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  }
  ctx.fillStyle = '#fff'; circle(px, py, 3); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px, py, 3, 0, TAU); ctx.stroke();
  // player hp bar
  ctx.fillStyle = '#300'; ctx.fillRect(px - 18, py + 20, 36, 4); ctx.fillStyle = '#ff3b5c'; ctx.fillRect(px - 18, py + 20, 36 * clamp(P.hp / P.maxHp, 0, 1), 4);
  // enemy bullets
  for (const b of G.ebullets) { const x = b.x + ox, y = b.y + oy; if (!vis(x, y)) continue; ctx.fillStyle = b.color; ctx.globalAlpha = 0.3; circle(x, y, b.r * 1.7); ctx.globalAlpha = 1; circle(x, y, b.r); ctx.fillStyle = '#fff'; circle(x, y, b.r * 0.5); }
  // fx
  for (const f of G.fx) {
    const p = f.t / f.dur;
    if (f.k === 'ring') { ctx.strokeStyle = f.color; ctx.globalAlpha = 1 - p; ctx.lineWidth = f.width; ctx.beginPath(); ctx.arc(f.x + ox, f.y + oy, Math.max(1, f.r * (0.4 + 0.6 * p)), 0, TAU); ctx.stroke(); }
    else if (f.k === 'spark') { ctx.fillStyle = f.color; ctx.globalAlpha = 1 - p; circle(f.x + ox, f.y + oy, 2); }
    else if (f.k === 'spike') { ctx.fillStyle = f.color; ctx.globalAlpha = 1 - p; const x = f.x + ox, y = f.y + oy, h = 22 * Math.sin(Math.PI * Math.min(1, p * 2)); ctx.beginPath(); ctx.moveTo(x - 7, y + 6); ctx.lineTo(x, y + 6 - h); ctx.lineTo(x + 7, y + 6); ctx.fill(); }
    else if (f.k === 'bolt') { ctx.strokeStyle = f.color; ctx.globalAlpha = 1 - p; ctx.lineWidth = 2.5; ctx.beginPath(); const x1 = f.x1 + ox, y1 = f.y1 + oy, x2 = f.x2 + ox, y2 = f.y2 + oy; ctx.moveTo(x1, y1);
      for (let k = 1; k < 6; k++) { const t = k / 6; const j = Math.sin(f.seed + k * 12.9) * 9; ctx.lineTo(lerp(x1, x2, t) + j, lerp(y1, y2, t) - j); } ctx.lineTo(x2, y2); ctx.stroke(); }
  }
  ctx.globalAlpha = 1;
  // damage texts
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const t of G.texts) { ctx.globalAlpha = 1 - t.t / 0.7; ctx.font = `bold ${t.size}px system-ui,sans-serif`; ctx.fillStyle = '#000'; ctx.fillText(t.txt, t.x + ox + 1, t.y + oy - t.t * 40 + 1); ctx.fillStyle = t.color; ctx.fillText(t.txt, t.x + ox, t.y + oy - t.t * 40); }
  ctx.globalAlpha = 1;
  if (touch.active) { ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(touch.ox, touch.oy, 50, 0, TAU); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.3)'; circle(touch.ox + clamp(touch.x - touch.ox, -50, 50), touch.oy + clamp(touch.y - touch.oy, -50, 50), 18); }
  drawHUD();
}
function fmtTime(t) { t = Math.floor(t); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
function drawHUD() {
  const W = VIEW.w, H = VIEW.h, P = G.player; const small = W < 640;
  // xp bar
  ctx.fillStyle = 'rgba(20,16,40,0.9)'; ctx.fillRect(0, 0, W, 10); ctx.fillStyle = '#5ab8ff'; ctx.fillRect(0, 0, W * clamp(G.xp / G.xpNext, 0, 1), 10);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = 'bold 14px system-ui,sans-serif'; ctx.fillStyle = '#fff';
  ctx.fillText('LV ' + G.level, 12, 16);
  // hp
  ctx.fillStyle = '#300'; ctx.fillRect(12, 36, 140, 10); ctx.fillStyle = '#ff3b5c'; ctx.fillRect(12, 36, 140 * clamp(P.hp / P.maxHp, 0, 1), 10);
  ctx.fillStyle = '#fff'; ctx.font = '11px system-ui,sans-serif'; ctx.fillText(Math.ceil(P.hp) + ' / ' + P.maxHp, 16, 36);
  ctx.font = '12px system-ui,sans-serif'; ctx.fillStyle = P.dashCd > 0 ? '#888' : '#7fdcff'; ctx.fillText(P.dashCd > 0 ? 'Dash ' + P.dashCd.toFixed(1) : 'Dash ready', 12, 52);
  // timer
  ctx.textAlign = 'center'; ctx.font = 'bold 26px system-ui,sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(fmtTime(G.time), W / 2, 16);
  // kills/gold
  ctx.textAlign = 'right'; ctx.font = 'bold 14px system-ui,sans-serif'; ctx.fillStyle = '#ddd'; ctx.fillText('☠ ' + G.kills, W - 12, 16); ctx.fillStyle = '#ffd24c'; ctx.fillText('● ' + Math.floor(G.gold), W - 12, 36);
  // boss bar
  const boss = G.enemies.find(e => e.boss);
  if (boss) { const bw = Math.min(520, W - 40); ctx.fillStyle = '#200'; ctx.fillRect(W / 2 - bw / 2, 50, bw, 10); ctx.fillStyle = boss.color; ctx.fillRect(W / 2 - bw / 2, 50, bw * clamp(boss.hp / boss.maxHp, 0, 1), 10); ctx.textAlign = 'center'; ctx.font = 'bold 12px system-ui'; ctx.fillStyle = '#fff'; ctx.fillText(boss.T.name, W / 2, 63); }
  // banners
  let by = H * 0.26; for (const b of G.banners) { ctx.globalAlpha = Math.min(1, (b.dur - b.t) * 2); ctx.textAlign = 'center'; ctx.font = `bold ${small ? 18 : 24}px system-ui,sans-serif`; ctx.fillStyle = '#000'; ctx.fillText(b.text, W / 2 + 2, by + 2); ctx.fillStyle = b.color; ctx.fillText(b.text, W / 2, by); by += 34; }
  ctx.globalAlpha = 1;
  // slots
  const sz = Math.max(20, Math.min(34, Math.floor((W - 24 - 70) / 10))), gap = 4; let x0 = 12, y0 = H - sz - 12;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const s of SLOT_KEYS) {
    const items = G.inv.filter(i => i.def.slot === s);
    for (let k = 0; k < 2; k++) {
      const it = items[k], x = x0 + k * (sz + 2);
      ctx.fillStyle = 'rgba(20,16,40,0.85)'; ctx.fillRect(x, y0, sz, sz);
      ctx.strokeStyle = it ? (it.evo ? '#ffe14d' : EFFECTS[it.def.effect].color) : 'rgba(255,255,255,0.15)'; ctx.lineWidth = it && it.evo ? 2.5 : 1.2; ctx.strokeRect(x + 0.5, y0 + 0.5, sz - 1, sz - 1);
      if (it) { ctx.font = `${sz * 0.55}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`; ctx.fillStyle = '#fff'; ctx.fillText(it.def.icon, x + sz / 2, y0 + sz / 2 - 2);
        for (let l = 0; l < it.level; l++) { ctx.fillStyle = it.evo ? '#ffe14d' : '#fff'; ctx.fillRect(x + 3 + l * ((sz - 6) / 5), y0 + sz - 4, (sz - 6) / 5 - 1, 2); } }
      else { ctx.font = `${sz * 0.4}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`; ctx.globalAlpha = 0.25; ctx.fillStyle = '#fff'; ctx.fillText(SLOTS[s].icon, x + sz / 2, y0 + sz / 2); ctx.globalAlpha = 1; }
    }
    x0 += sz * 2 + 2 + gap * 3;
  }
  // effect pool
  ctx.textAlign = 'right'; ctx.font = '12px system-ui,sans-serif'; let ey = 62;
  for (const k of EFFECT_KEYS) { const v = G.pool[k]; if (!v) continue; ctx.fillStyle = EFFECTS[k].color; ctx.fillText(EFFECTS[k].icon + ' ' + EFFECTS[k].name + ' ×' + v, W - 12, ey); ey += 17; }
}

// ---------------- DOM UI ----------------
const $ = s => document.querySelector(s);
let currentScreen = 'menu';
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.toggle('show', el.id === id));
  currentScreen = id;
  if (id === 'menu') renderMenu(); if (id === 'chars') renderChars(); if (id === 'forge') renderForge(); if (id === 'codex') renderCodex();
}
function goldPill() { return `<span class="gold">● ${Math.floor(SAVE.gold)}</span>`; }
function renderMenu() {
  const s = SAVE.stats;
  $('#menu .stats').innerHTML = `${goldPill()} &nbsp; Best ${fmtTime(s.bestTime)} · ${s.totalKills} kills · ${s.wins} wins · ${SAVE.unlockedItems.length + ITEMS.filter(d => !d.lock).length}/55 items · ${CHARACTERS.filter(charUnlocked).length}/11 heroes`;
}
let selectedChar = null;
function renderChars() {
  selectedChar = selectedChar || SAVE.lastChar;
  const wrap = $('#charGrid'); wrap.innerHTML = '';
  for (const c of CHARACTERS) {
    const un = charUnlocked(c), w = ITEM[c.weapon];
    const el = document.createElement('button'); el.className = 'card char' + (un ? '' : ' locked') + (selectedChar === c.id ? ' sel' : '');
    el.style.setProperty('--c', c.color);
    el.innerHTML = `<div class="avatar">${un ? '◆' : '🔒'}</div><b>${c.name}</b><small>${c.title}</small><div class="wpn">${w.icon} ${w.name}</div><div class="perk">${c.perk}</div>` +
      (un ? '' : c.lock.cost ? `<div class="req">Buy: ● ${c.lock.cost}</div>` : `<div class="req">${c.lock.text}</div>`);
    el.onclick = () => {
      if (!un) { if (c.lock.cost && SAVE.gold >= c.lock.cost) { SAVE.gold -= c.lock.cost; SAVE.unlockedChars.push(c.id); writeSave(); toast('Unlocked ' + c.name + '!'); } else if (c.lock.cost) toast('Not enough gold'); renderChars(); return; }
      selectedChar = c.id; renderChars();
    };
    wrap.appendChild(el);
  }
  $('#chars .gold-line').innerHTML = goldPill();
  const c = CHARACTERS.find(x => x.id === selectedChar); const w = ITEM[c.weapon];
  $('#charInfo').innerHTML = `<b style="color:${c.color}">${c.name}, ${c.title}</b> starts with <b>${w.icon} ${w.name}</b> (${EFFECTS[w.effect].icon} ${EFFECTS[w.effect].name}): ${w.pattern}`;
}
function renderForge() {
  const wrap = $('#forgeGrid'); wrap.innerHTML = '';
  for (const u of UPGRADES) {
    const rank = SAVE.upg[u.id] || 0, maxed = rank >= u.max, cost = upgradeCost(u, rank);
    const el = document.createElement('button'); el.className = 'card up' + (maxed ? ' maxed' : '') + (!maxed && SAVE.gold < cost ? ' poor' : '');
    el.innerHTML = `<div class="ico">${u.icon}</div><b>${u.name}</b><small>${u.desc}</small><div class="pips">${'■'.repeat(rank)}${'□'.repeat(u.max - rank)}</div><div class="cost">${maxed ? 'MAX' : '● ' + cost}</div>`;
    el.onclick = () => { if (maxed) return; if (SAVE.gold < cost) { toast('Not enough gold'); return; } SAVE.gold -= cost; SAVE.upg[u.id] = rank + 1; writeSave(); renderForge(); };
    wrap.appendChild(el);
  }
  $('#forge .gold-line').innerHTML = goldPill() + ` <button class="link" id="refund">Refund all</button>`;
  $('#refund').onclick = () => { let back = 0; for (const u of UPGRADES) for (let r = 0; r < (SAVE.upg[u.id] || 0); r++) back += upgradeCost(u, r); SAVE.gold += back; SAVE.upg = {}; writeSave(); renderForge(); toast('Refunded ● ' + back); };
}
let codexFilter = 'all';
function renderCodex() {
  const tabs = $('#codexTabs'); tabs.innerHTML = '';
  for (const k of ['all', ...SLOT_KEYS]) { const b = document.createElement('button'); b.className = 'tab' + (codexFilter === k ? ' sel' : ''); b.textContent = k === 'all' ? 'All 55' : SLOTS[k].icon + ' ' + SLOTS[k].name; b.onclick = () => { codexFilter = k; renderCodex(); }; tabs.appendChild(b); }
  const wrap = $('#codexGrid'); wrap.innerHTML = '';
  for (const d of ITEMS) {
    if (codexFilter !== 'all' && d.slot !== codexFilter) continue;
    const un = itemUnlocked(d), E = EFFECTS[d.effect];
    const el = document.createElement('div'); el.className = 'card item' + (un ? '' : ' locked'); el.style.setProperty('--c', E.color);
    let lockHtml = '';
    if (!un) lockHtml = d.lock.cost ? `<button class="buy">Unlock ● ${d.lock.cost}</button>` : `<div class="req">🔒 ${d.lock.text}</div>`;
    el.innerHTML = `<div class="ico">${d.icon}</div><div class="body"><b>${d.name}</b><div class="tags"><span>${SLOTS[d.slot].icon} ${SLOTS[d.slot].name}</span><span style="color:${E.color}">${E.icon} ${E.name}</span>${d.trig ? `<span>⏯ ${d.trig}</span>` : ''}</div><small>${d.pattern}</small><small class="fuse">Fuses into <i>${FUSE_PREFIX[d.effect]} ${d.name}</i> with any other ${E.name} item.</small>${lockHtml}</div>`;
    const buy = el.querySelector('.buy');
    if (buy) buy.onclick = () => { if (SAVE.gold < d.lock.cost) { toast('Not enough gold'); return; } SAVE.gold -= d.lock.cost; SAVE.unlockedItems.push(d.id); writeSave(); toast('Unlocked ' + d.name + '!'); renderCodex(); };
    wrap.appendChild(el);
  }
  $('#codex .gold-line').innerHTML = goldPill();
}
function describeChoice(o) {
  if (o.type === 'new') { const d = o.def; return { icon: d.icon, title: d.name, tag: 'NEW', slot: d.slot, eff: d.effect, text: d.pattern }; }
  if (o.type === 'up') { const d = o.inst.def; return { icon: d.icon, title: itemName(o.inst), tag: 'Lv ' + o.inst.level + ' → ' + (o.inst.level + 1), slot: d.slot, eff: d.effect, text: '+30% damage, faster, more projectiles. Adds +1 ' + EFFECTS[d.effect].name + ' to every bullet.' }; }
  if (o.type === 'fuse') { const d = o.inst.def; return { icon: d.icon, title: FUSE_PREFIX[d.effect] + ' ' + d.name, tag: 'FUSION', slot: d.slot, eff: d.effect, text: `Fuse with ${o.partner ? o.partner.def.name : 'its partner'}: ×1.8 damage, −25% cooldown, +1 projectile, double effect stacks.`, fuse: true }; }
  if (o.type === 'heal') return { icon: '❤️', title: 'Restore', tag: 'HEAL', text: 'Recover 40 HP.' };
  return { icon: '●', title: 'Void Gold', tag: 'GOLD', text: '+25 gold.' };
}
let levelChoices = null;
function openLevelUp() {
  G.paused = true; levelChoices = buildChoices(); renderLevelUp(); showScreen('levelup');
}
function renderLevelUp() {
  const wrap = $('#luCards'); wrap.innerHTML = '';
  levelChoices.forEach((o, idx) => {
    const c = describeChoice(o); const E = c.eff ? EFFECTS[c.eff] : null;
    const el = document.createElement('button'); el.className = 'card lu' + (c.fuse ? ' fuse' : ''); if (E) el.style.setProperty('--c', E.color);
    el.innerHTML = `<div class="key">${idx + 1}</div><div class="ico">${c.icon}</div><div class="tag">${c.tag}</div><b>${c.title}</b>${c.slot ? `<div class="tags"><span>${SLOTS[c.slot].icon} ${SLOTS[c.slot].name}</span><span style="color:${E.color}">${E.icon} ${E.name}</span></div>` : ''}<small>${c.text}</small>`;
    el.onclick = () => chooseLevel(idx);
    wrap.appendChild(el);
  });
  $('#luTitle').textContent = 'Level ' + G.level + '!';
  const rr = $('#reroll'); rr.textContent = '🎲 Reroll (' + G.player.rerolls + ')'; rr.disabled = G.player.rerolls <= 0;
}
function chooseLevel(idx) { if (!levelChoices || !levelChoices[idx]) return; applyChoice(levelChoices[idx]); levelChoices = null; showScreen(null); G.paused = false; }
function showGameOver(won, earned, bonus, fresh) {
  $('#goTitle').textContent = won ? 'VICTORY' : 'YOU FELL';
  $('#goTitle').className = won ? 'win' : 'lose';
  const inv = G.inv.map(i => `<span class="chip" style="--c:${EFFECTS[i.def.effect].color}">${i.def.icon} ${itemName(i)} <b>${i.level}</b></span>`).join('');
  $('#goBody').innerHTML = `<div class="row"><div><small>Time</small><b>${fmtTime(G.time)}</b></div><div><small>Level</small><b>${G.level}</b></div><div><small>Kills</small><b>${G.kills}</b></div><div><small>Gold earned</small><b class="gold">● ${earned}</b></div></div>
    <small>Includes ● ${bonus} survival bonus.</small><div class="chips">${inv}</div>` + (fresh.length ? `<div class="unlocks"><b>Unlocked!</b><br>${fresh.join('<br>')}</div>` : '');
  showScreen('gameover');
}
function togglePause() {
  if (!G || G.over || currentScreen === 'levelup') return;
  if (G.paused) { G.paused = false; showScreen(null); }
  else { G.paused = true; renderPause(); showScreen('pause'); }
}
function renderPause() {
  const inv = G.inv.map(i => `<div class="chip" style="--c:${EFFECTS[i.def.effect].color}">${i.def.icon} ${itemName(i)} <b>Lv${i.level}</b><small>${i.def.pattern}</small></div>`).join('');
  const pool = EFFECT_KEYS.filter(k => G.pool[k]).map(k => `<span style="color:${EFFECTS[k].color}">${EFFECTS[k].icon} ${EFFECTS[k].name} ×${G.pool[k]}</span>`).join(' · ') || 'none';
  $('#pauseBody').innerHTML = `<div class="chips col">${inv}</div><p><b>Effect pool</b> (applies to every bullet): ${pool}</p>`;
  $('#numToggle').textContent = 'Damage numbers: ' + (SAVE.settings.numbers ? 'on' : 'off');
}

// ---------------- input ----------------
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (!G || G.over) return;
  if (currentScreen === 'levelup') { const n = parseInt(e.key, 10); if (n >= 1 && n <= 4) chooseLevel(n - 1); if (e.code === 'KeyR') $('#reroll').click(); return; }
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  if ((e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !G.paused) dash();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (G && !G.paused && !G.over) togglePause(); });
canvas.addEventListener('touchstart', e => { if (!G || G.paused) return; e.preventDefault(); const t = e.changedTouches[0]; if (touch.active) { dash(); return; } touch.active = true; touch.id = t.identifier; touch.ox = touch.x = t.clientX; touch.oy = touch.y = t.clientY; }, { passive: false });
canvas.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === touch.id) { touch.x = t.clientX; touch.y = t.clientY; } }, { passive: false });
canvas.addEventListener('touchend', e => { for (const t of e.changedTouches) if (t.identifier === touch.id) touch.active = false; });

// buttons
$('#btnPlay').onclick = () => showScreen('chars');
$('#btnForge').onclick = () => showScreen('forge');
$('#btnCodex').onclick = () => showScreen('codex');
document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => showScreen('menu'));
$('#btnStart').onclick = () => { const c = CHARACTERS.find(x => x.id === selectedChar); if (c && charUnlocked(c)) newRun(c.id); };
$('#reroll').onclick = () => { if (G.player.rerolls <= 0) return; G.player.rerolls--; levelChoices = buildChoices(); renderLevelUp(); };
$('#btnResume').onclick = togglePause;
$('#btnQuit').onclick = () => { G.paused = false; endRun(false); };
$('#numToggle').onclick = () => { SAVE.settings.numbers = !SAVE.settings.numbers; writeSave(); renderPause(); };
$('#btnAgain').onclick = () => { const id = G.char.id; newRun(id); };
$('#btnMenu').onclick = () => { G = null; showScreen('menu'); };
let resetArmed = 0;
$('#btnReset').onclick = () => {
  const b = $('#btnReset');
  if (Date.now() - resetArmed < 4000) { SAVE = defaultSave(); writeSave(); renderMenu(); b.textContent = 'Reset save'; resetArmed = 0; toast('Progress erased'); return; }
  resetArmed = Date.now(); b.textContent = 'Click again to erase all progress'; setTimeout(() => { if (resetArmed && Date.now() - resetArmed >= 4000) b.textContent = 'Reset save'; }, 4100);
};

// ---------------- main loop ----------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  if (G && !G.paused && !G.over) update(dt);
  render();
  requestAnimationFrame(frame);
}
loadSave(); checkUnlocks(); showScreen('menu'); requestAnimationFrame(frame);

// debug hooks for testing
window.VOIDLIGHT = { get G() { return G; }, SAVE: () => SAVE, ITEMS, addItem: id => addItem(ITEM[id]), update, newRun, levelItem, fuseItem };
