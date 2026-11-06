'use strict';
// ===== VOIDLIGHT: run loop, director, enemies, player, rendering, menus, save =====

// ---------------- save data ----------------
// The save format, migration and unlock rules live in progress.js (shared with the admin simulator).
// index.html?testsave plays on a separate save the admin panel prepares; it never touches real progress or the cloud.
const TESTSAVE = !!window.VOIDLIGHT_TESTSAVE;
const SAVE_KEY = TESTSAVE ? 'voidlight.testsave' : 'voidlight.save.v1';
let SAVE = defaultSave();
function loadSave() {
  if (SANDBOX) return; // the admin test canvas never touches the player's save
  try { const raw = localStorage.getItem(SAVE_KEY); if (raw) SAVE = normalizeSave(JSON.parse(raw)); } catch (e) { SAVE = defaultSave(); }
}
// Every change goes through here: localStorage first, then the cloud hook (src/cloud.js) when signed in.
function writeSave() {
  if (SANDBOX) return;
  SAVE.updatedAt = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { /* storage unavailable */ }
  if (window.VOIDLIGHT_CLOUD && !TESTSAVE) try { window.VOIDLIGHT_CLOUD.saved(SAVE); } catch (e) { /* cloud is best effort */ }
}
// Swaps in a whole save (used by cloud sync) and refreshes whatever menu is open.
function replaceSave(s, { persist = true } = {}) {
  SAVE = normalizeSave(s);
  if (G) G.settings = SAVE.settings;
  if (persist) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { /* storage unavailable */ } }
  checkUnlocks();
  if (!G && SCREENS_WITH_SAVE.includes(currentScreen)) showScreen(currentScreen);
}
const SANDBOX = !!window.VOIDLIGHT_SANDBOX;
const SCREENS_WITH_SAVE = ['menu', 'chars', 'forge', 'codex', 'achievements'];
// Achievement unlocks (see progress.js) are granted on load and at the end of each run.
function checkUnlocks() {
  const fresh = applyUnlocks(SAVE);
  if (fresh.length) writeSave();
  return fresh;
}

// ---------------- enemies ----------------
// [type, first second it can spawn, weight]. A level's STAGES[].swap turns a type here into another (Lancer, Husk, Sentinel).
const SPAWN_TABLE = [['drone', 0, 10], ['swarm', 0, 4], ['darter', 60, 5], ['spitter', 120, 3], ['brute', 210, 3], ['bomber', 270, 3], ['warlock', 390, 2], ['wraith', 480, 4]];
const RUN_LENGTH = 900;
const BOSS_TIMES = [[300, 'matriarch'], [600, 'seraph'], [900, 'eclipse']];
const DIFF = () => DIFFICULTY.run; // tunable from the admin panel (Enemies tab)
const STAGE = () => (G && G.stageDef) || STAGES[0]; // the level being played (STAGES in items.js), tunable on the Progression tab
// Minutes past the overtime mark (DIFFICULTY.run.overtimeAt), 0 before it. Only reachable while the 15:00 boss lives,
// since beating it ends the run. Each minute compounds damage taken, enemy HP and spawns so nobody can stall forever.
const overtime = t => { const D = DIFF(), at = D.overtimeAt; return G && !G.sandbox && at > 0 && t > at * 60 ? (t - at * 60) / 60 : 0; };
const otMul = (t, per) => Math.pow(Math.max(1, per || 1), overtime(t));
const hpMul = t => { const D = DIFF(), S = STAGE(), m = t / 60, f = Math.min(1, t / RUN_LENGTH); return (1 + m * D.hpGrowth + m * m * D.hpCurve) * S.hp * (1 + S.ramp * f * f * f) * otMul(t, D.overtimeHp); };

// The level's look (STAGES[].palette / swap in items.js): which enemy type really spawns, the colour it wears by its role,
// and the colour of regular enemy shots. The admin test canvas keeps the plain colours from ENEMY_TYPES.
const levelFoe = type => { const sw = G && !G.sandbox && STAGE().swap; return sw && sw[type] && ENEMY_TYPES[sw[type]] ? sw[type] : type; };
const foeColor = T => { const pal = G && !G.sandbox && STAGE().palette; return (pal && T.role && pal[T.role]) || T.color; };
const shotColor = () => { const pal = G && !G.sandbox && STAGE().palette; return (pal && pal.shot) || '#ff3b8b'; };
function spawnEnemy(type, x, y, o = {}) {
  if (!o.boss) type = levelFoe(type);
  const T = ENEMY_TYPES[type] || BOSSES[type] || SANDBOX_TYPES[type];
  const S = STAGE(), m = (o.boss ? DIFF().bossHp * S.bossHp * nexusMul('boss') : hpMul(G.time) * (o.elite ? DIFF().eliteHp : 1) * nexusMul('hp'));
  if (G.foes && !G.sandbox) { const f = G.foes[type] = G.foes[type] || { seen: 0, kills: 0 }; f.seen++; } // the enemy Codex (bestiary)
  const e = { id: G.nextId++, type, T, x, y, r: T.r * (o.elite ? 1.3 : 1), hp: T.hp * m, maxHp: T.hp * m, spd: T.spd * (o.elite ? 0.9 : 1) * (1 + Math.min(0.35, G.time / 2400)),
    dmg: T.dmg * (1 + DIFF().dmgGrowth * G.time / 60) * S.dmg * nexusMul('dmg'), xp: T.xp * (o.elite ? 10 : 1), color: foeColor(T), mass: T.mass || (o.boss ? 50 : o.elite ? 6 : 1), elite: !!o.elite, boss: !!o.boss,
    kx: 0, ky: 0, burnT: 0, burnDps: 0, slowT: 0, slow: 0, poisonT: 0, poison: 0, freezeT: 0, reactCd: 0, dot: 0, dotT: 0, flash: 0, shootT: rand(0.5, 2), at: 0, spin: 0, phase: 0 };
  G.enemies.push(e); return e;
}
function spawnRing(dist) { const a = rand(0, TAU); const P = G.player; return { x: P.x + Math.cos(a) * dist, y: P.y + Math.sin(a) * dist }; }
function viewRadius() { return Math.hypot(VIEW.w, VIEW.h) / 2 + 40; }
function ebullet(x, y, ang, spd, r = 6, dmg = 8, color = shotColor()) { if (G.ebullets.length < 900) G.ebullets.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, r, dmg, color, t: 0, life: 6 }); }

function director(dt) {
  const t = G.time, D = DIFF(), m = t / 60;
  // regular spawns
  const rate = (D.spawnBase + m * D.spawnGrowth + m * m * D.spawnCurve) * STAGE().spawn * (1 + overtime(t) * (D.overtimeSpawn || 0)) * nexusMul('spawn');
  G.spawnAcc += rate * dt;
  const avail = SPAWN_TABLE.filter(s => t >= s[1]); const totalW = avail.reduce((a, s) => a + s[2], 0);
  while (G.spawnAcc >= 1) {
    G.spawnAcc -= 1; if (G.enemies.length > 380) continue;
    let r = Math.random() * totalW, type = avail[0][0]; for (const s of avail) { r -= s[2]; if (r <= 0) { type = s[0]; break; } }
    const p = spawnRing(viewRadius()); const pack = (ENEMY_TYPES[levelFoe(type)] || {}).pack || 1;
    for (let k = 0; k < pack; k++) spawnEnemy(type, p.x + rand(-20, 20), p.y + rand(-20, 20));
  }
  // encirclement waves
  if (t >= G.nextRing) { G.nextRing += Math.max(10, D.ringEvery); const n = 22 + Math.floor(t / 60) * 2; const R = 360; for (let k = 0; k < n; k++) { const a = k * TAU / n; spawnEnemy(t > 400 ? 'darter' : 'swarm', G.player.x + Math.cos(a) * R, G.player.y + Math.sin(a) * R); } banner('Encirclement!', '#ff9e4c'); }
  // elites
  if (t >= G.nextElite) { G.nextElite += Math.max(5, D.eliteEvery); const p = spawnRing(viewRadius()); spawnEnemy(pick(avail)[0], p.x, p.y, { elite: true }); banner('An elite approaches', '#ffd27a'); }
  // overtime warning, once a minute
  const ot = overtime(t);
  if (ot > 0 && Math.floor(ot) >= (G.otWarned || 0)) { G.otWarned = Math.floor(ot) + 1; banner(ot < 1 ? '☠ OVERTIME: the Void grows stronger ☠' : `☠ OVERTIME ×${+otMul(t, D.overtimeDmg).toFixed(1)} damage ☠`, '#ff3b5c', 3); }
  // bosses
  for (const [bt, id] of BOSS_TIMES) if (t >= bt && !G.bossSpawned[id]) {
    G.bossSpawned[id] = true; const p = spawnRing(viewRadius() - 60); spawnEnemy(id, p.x, p.y, { boss: true }); banner('⚠ ' + BOSSES[id].name + ' ⚠', '#ff3b5c', 3);
  }
}

function bossAI(e, dt) {
  e.at += dt; const P = G.player; const toP = angTo(e.x, e.y, P.x, P.y);
  if (e.type === 'matriarch') {
    e.shootT -= dt; if (e.shootT <= 0) { e.shootT = 2.2; e.spin += 0.17; for (let k = 0; k < 18; k++) ebullet(e.x, e.y, e.spin + k * TAU / 18, 150, 7, 12, e.color); }
    e.phase -= dt; if (e.phase <= 0) { e.phase = 6; for (let k = 0; k < 8; k++) spawnEnemy('swarm', e.x + rand(-40, 40), e.y + rand(-40, 40)); }
  } else if (e.type === 'seraph') {
    e.shootT -= dt; if (e.shootT <= 0) { e.shootT = 0.09; e.spin += 0.23; for (let k = 0; k < 2; k++) ebullet(e.x, e.y, e.spin + k * Math.PI, 150, 6, 12, '#ffd24c'); }
    e.phase -= dt; if (e.phase <= 0) { e.phase = 2.5; for (let k = -1; k <= 1; k++) ebullet(e.x, e.y, toP + k * 0.18, 230, 7, 14, '#fff3b0'); }
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
    if (e.burnT > 0) { e.burnT -= dt; dps += e.burnDps * typeMul(e, ['burn']); if (e.burnT <= 0) e.burnDps = 0; } // ticks are Burn / Poison damage
    if (e.poisonT > 0) { e.poisonT -= dt; dps += e.poison * typeMul(e, ['poison']); if (e.poisonT <= 0) e.poison = 0; }
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
        if (R.pat === 'aim') ebullet(e.x, e.y, a, 170, 6, 8);
        else if (R.pat === 'ring') { const n = R.n || 8; for (let k = 0; k < n; k++) ebullet(e.x, e.y, a + k * TAU / n, 130, 6, 9); }
        else for (let k = -1; k <= 1; k++) ebullet(e.x, e.y, a + k * 0.25, 160, 6, 9); }
    }
    // chargers (Lancer): stop and aim (windT, drawn as a line), then dash in a straight line (dashT)
    let dir = a; const C = e.T.charge;
    if (C) {
      if (e.dashT > 0) { e.dashT -= dt; dir = e.dashA; spd = C.spd * (1 - e.slow); }
      else if (e.windT > 0) { e.windT -= dt; spd = 0; e.dashA = a; if (e.windT <= 0) e.dashT = C.time; }
      else { e.shootT -= dt; if (e.shootT <= 0 && dist < C.range) { e.windT = 0.55; e.shootT = C.cd * rand(0.8, 1.2); } }
    }
    e.x += (Math.cos(dir) * spd + e.kx) * dt; e.y += (Math.sin(dir) * spd + e.ky) * dt;
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
  if (G.sandbox) { fxSpark(e.x, e.y, e.color, 4, 110); trigger('kill', e); return; } // admin test canvas: no drops or rewards
  if (e.by && e.by.def) G.itemKills[e.by.def.id] = (G.itemKills[e.by.def.id] || 0) + 1; // the item that landed the last hit
  if (G.foes[e.type]) G.foes[e.type].kills++;
  const D = DROPS;
  dropGem(e.x, e.y, e.xp * D.gem.value * STAGE().xp);
  if (Math.random() < D.coin.chance * (1 + P.luck * 2)) drop('coin', e.x + rand(-8, 8), e.y + rand(-8, 8), randi(D.coin.min, D.coin.max));
  if (Math.random() < D.heart.chance * (1 + P.luck)) drop('heart', e.x, e.y, D.heart.value);
  if (Math.random() < D.magnet.chance) drop('magnet', e.x, e.y, 0);
  if (e.elite) { dropChest(e.x, e.y, D.chest.elite); for (let k = 0; k < 6; k++) drop('coin', e.x + rand(-30, 30), e.y + rand(-30, 30), 3); }
  if (e.boss) { G.stats.bossKills++; dropChest(e.x, e.y, D.chest.boss); for (let k = 0; k < 15; k++) drop('coin', e.x + rand(-60, 60), e.y + rand(-60, 60), 5); fxRing(e.x, e.y, 200, e.color, 0.8, 8); banner(e.T.name + ' defeated!', '#6bff8f', 2.5);
    if (e.type === 'eclipse') later(1.5, () => endRun(true)); }
  if (e.T.deathRing) for (let k = 0; k < e.T.deathRing; k++) ebullet(e.x, e.y, k * TAU / e.T.deathRing + rand(0, 0.3), 130, 6, 8);
  if (e.T.deathSpawn && ENEMY_TYPES[e.T.deathSpawn.type]) { const S = e.T.deathSpawn, x0 = e.x, y0 = e.y; later(0, () => { if (!G || G.over) return; for (let k = 0; k < S.n && G.enemies.length < 400; k++) { const a = k * TAU / S.n; spawnEnemy(S.type, x0 + Math.cos(a) * 14, y0 + Math.sin(a) * 14); } }); }
  if (e.burnT > 0 && e.poisonT > 0) { fxText(e.x, e.y - 14, 'COMBUST', '#ffb86b', 12); const boom = 8 + Math.min(e.maxHp * 0.15, 4 * (e.burnDps + e.poison)); later(0, () => strike(e.x, e.y, 55, boom, 'burn', { color: '#ffb86b', dtype: ['burn', 'poison'] })); } // capped by the toxin on it, so it cannot snowball off tough enemies' HP
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
  else if (p.k === 'coin') { G.gold += p.v * P.greed * STAGE().gold; }
  else if (p.k === 'heart') heal(p.v);
  else if (p.k === 'magnet') { for (const q of G.pickups) if (q.k === 'gem') q.pull = true; banner('Magnetized!', '#7fdcff', 1); }
  else if (p.k === 'chest') openChest(p.v);
}
function xpFor(l) { const D = DIFF(); return Math.floor(5 + (l - 1) * D.xpStep + Math.pow(l - 1, D.xpCurve)); }
function gainXp(v) { G.xp += v; while (G.xp >= G.xpNext) { G.xp -= G.xpNext; G.level++; G.xpNext = xpFor(G.level); G.pendingLevels++; } }

// ---------------- inventory ----------------
// Effect pool: every attacking item adds its own effect × its level × its tier's pool weight (FUSION in items.js) to the
// pool that every bullet uses. Passive items add nothing to the pool; they raise player stats instead.
// An item's own bullets also get tier.own stacks of its effect and of every effect it carries from fusions (inst.riders).
function socketsFor(slot) { return G && G.sandbox ? SLOTS[slot].sockets : slotSockets(SAVE, slot); }
function available(def) { return !def.disabled && (itemUnlocked(SAVE, def) || def.id === G.char.weapon); }
function slotCount(slot) { return G.inv.filter(i => i.def.slot === slot).length; }
// the damage types of an item's hits (core.js hitTypes): its own effects and riders, or what a Hit augment made them
const instTypes = inst => (inst.hitTypes || instEffects(inst)).slice();
function instEffects(inst) { const out = effectsOf(inst.def).slice(); for (const k of inst.riders || []) if (!out.includes(k)) out.push(k); return out; }
// No effect works before its category is unlocked (a hero's starting weapon included), outside the admin test canvas.
const effOpen = k => !G || G.sandbox || catUnlocked(SAVE, k);
function recomputePool() {
  const p = {}; for (const k of EFFECT_KEYS) p[k] = 0;
  for (const i of activeInsts()) { // held items and the parts inside a Nexus (nexus.js)
    const T = tierOf(i); i.own = {};
    if (isPassive(i.def)) continue;
    for (const k of effectsOf(i.def)) if (effOpen(k)) { p[k] += i.level * T.pool; i.own[k] = T.own; }
    for (const k of i.riders) if (effOpen(k)) i.own[k] = (i.own[k] || 0) + T.own;
  }
  for (const k of EFFECT_KEYS) p[k] = Math.round(p[k]);
  G.pool = p; G.runners = activeInsts().filter(i => !isPassive(i.def)); G.threat = nexusThreat();
  recomputeStats();
}
// passive stats an item gives right now: its per-level stats × level × its tier's statMul, plus the flat stats its
// fusions carried over (absorb() in chain.js)
function instStats(i) { const out = Object.assign({}, i.flat || {}), k = i.level * tierOf(i).statMul; for (const [s, v] of Object.entries(i.stats || {})) if (v) out[s] = (out[s] || 0) + v * k; return out; }
function recomputeStats() {
  const P = G.player; if (!P) return;
  const m = Object.assign({}, P.baseMods);
  for (const i of activeInsts()) for (const [s, v] of Object.entries(instStats(i))) m[s] = (m[s] || 0) + v;
  applyStats(P, m); G.bonus = m;
}
function killOwned(inst) {
  for (const b of G.bullets) if (b.owner === inst && b.persist) b.dead = true;
  for (const d of G.deploys) if (d.owner === inst && d.persist) d.dead = true;
}
function rebuild(inst) { killOwned(inst); if (inst.def.spawn && !isPassive(inst.def)) inst.def.spawn(inst, ctxOf(inst)); }
// base: its own damage before the tier multiplier. stats: its own passive stats per level. riders: effects carried from
// fusions. carry / flat: damage and passive stats carried over by fusions. links: the absorbed items' chains (chain.js).
// gone: the items fused into it.
function newInst(def, level = 1) { return { def, level, timer: 0.3, state: {}, tier: 0, base: def.dmg || 0, riders: [], stats: Object.assign({}, def.passive || {}), gone: [], own: null, carry: 0, flat: {}, links: [] }; }
function reach(inst) { if (G.reached) G.reached[inst.def.id] = Math.max(G.reached[inst.def.id] || 0, inst.level); }
// New items (and new fusions) arrive at the level's start level (STAGES in items.js).
const arrivalLevel = () => (G.sandbox ? 1 : clamp(STAGE().start | 0, 1, MAX_LEVEL));
function addItem(def, level) { const inst = newInst(def, level || arrivalLevel()); G.inv.push(inst); reach(inst); recomputePool(); rebuild(inst); return inst; }
function levelItem(inst) {
  inst.level = Math.min(MAX_LEVEL, inst.level + 1); reach(inst);
  for (const p of inst.parts || []) { p.level = inst.level; reach(p); }
  recomputePool(); rebuild(inst); for (const p of inst.parts || []) rebuild(p);
  if (inst.level === MAX_LEVEL && !inst.tier && !G.sandbox && !fuseUnlocked(SAVE, inst.def)) {
    const f = fuseLockOf(inst.def), next = f.level <= MAX_LEVEL && runsAt(SAVE, inst.def.id, f.level) + 1 >= f.runs;
    toast((next ? `✦ ${inst.def.name} maxed! Mastered when this run ends.` : `${inst.def.name} maxed: ${runsAt(SAVE, inst.def.id, f.level) + 1}/${f.runs} runs toward mastering it.`) + ' Until then a mastered item can still absorb it.');
  }
}
// Fusion tiers (FUSION in items.js). `need` level 5 items of one tier that all share at least one effect become one item
// of the next tier: the player picks the one that stays. It keeps 100% of what it had and takes 50% of every other one's
// damage and passive stats, carries all of their effects on its own bullets, and plays each absorbed item's attack as a
// chain on its own (chain.js). It starts the new tier at the level's start level. The other sockets free up.
// Base items need their mastery to REMAIN: a mastered item can absorb items that are not mastered yet, but a fusion
// needs at least one mastered item to keep. Super and Mega fusion each open with an achievement, and every item in a Super
// or Mega fusion also needs its fusion history (FUSION[tier].hist, kept across runs in SAVE.fuseLog, see progress.js).
// A passive item can only stay if everything fused into it is passive too.
const tierOpen = t => G.sandbox || tierUnlocked(SAVE, TIER_KEYS[t]);
const fusable = i => !i.nexus && i.level >= MAX_LEVEL && i.tier < TIER_KEYS.length - 1 && tierOpen(i.tier + 1) && (G.sandbox || histMet(SAVE, i.def.id, i.tier + 1));
// can this item be the one that remains? (its mastery, for a base item)
const canKeep = i => G.sandbox || i.tier > 0 || fuseUnlocked(SAVE, i.def);
function commonEffects(group) { let c = instEffects(group[0]); for (const i of group.slice(1)) { const e = instEffects(i); c = c.filter(k => e.includes(k)); } return c; }
const keepersOf = group => group.filter(s => canKeep(s) && (!isPassive(s.def) || group.every(o => isPassive(o.def))));
function combos(arr, k, limit) {
  const out = [];
  const rec = (st, cur) => { if (out.length >= limit) return; if (cur.length === k) { out.push(cur.slice()); return; } for (let i = st; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop(); } };
  rec(0, []); return out;
}
function fusionGroups() {
  const out = nexusGroups(), seen = new Set(); // Nexus recipes the player can form come first (nexus.js)
  for (let t = 0; t < TIER_KEYS.length - 1; t++) {
    const need = FUSION[TIER_KEYS[t + 1]].need, cands = G.inv.filter(i => i.tier === t && fusable(i));
    if (need < 2 || cands.length < need) continue;
    for (const k of EFFECT_KEYS) {
      const mem = cands.filter(i => instEffects(i).includes(k)); if (mem.length < need) continue;
      for (const g of combos(mem, need, need === 2 ? 60 : 8)) {
        const key = g.map(i => G.inv.indexOf(i)).sort((a, b) => a - b).join(','); if (seen.has(key)) continue; seen.add(key);
        const keeps = keepersOf(g); if (keeps.length) out.push({ group: g, keeps, tier: t + 1 });
      }
    }
  }
  return out;
}
const tierName = t => FUSION[TIER_KEYS[t]].name;
const isPassiveInst = i => isPassive(i.def);
function fuse(keep, others, quiet) {
  const nx = nexusRecipe([keep, ...others], keep.tier + 1, keep); if (nx) return formNexus(keep, others, nx, quiet); // nexus.js
  const T = keep.tier + 1, sh = commonEffects([keep, ...others]);
  // fusion history (counts right away, also toward later fusions in this run)
  const ready = G.sandbox ? [] : recordFusion(SAVE, TIER_KEYS[T], [keep, ...others].map(i => i.def.id));
  if (!G.sandbox) writeSave();
  if (!keep.fuseEff) keep.fuseEff = sh.includes(keep.def.effect) ? keep.def.effect : sh[0] || keep.def.effect;
  absorb(keep, others, arrivalLevel()); // chain.js: 100% of keep + 50% of the others, their attacks become chain links
  for (const o of others) killOwned(o);
  G.inv = G.inv.filter(i => !others.includes(i));
  keep.timer = Math.min(keep.timer, 0.3);
  if (!G.sandbox) G.stats[T === 1 ? 'evolves' : T === 2 ? 'supers' : 'megas']++;
  recomputePool(); rebuild(keep);
  if (!quiet) {
    banner(`${T > 1 ? tierName(T).toUpperCase() + ' ' : ''}FUSION: ${itemName(keep)}`, TIER_COLORS[T], 2.5); fxRing(G.player.x, G.player.y, 160 + 60 * T, TIER_COLORS[T], 0.6, 6);
    const freed = [...new Set(others.map(o => SLOTS[o.def.slot].name))].join(', ');
    const ch = others.filter(o => !isPassive(o.def)).map(o => o.def.icon + ' ' + CHAIN_CATS[chainOf(o.def).cat].name.toLowerCase());
    toast(`${others.map(o => o.def.icon).join(' ')} fused into ${keep.def.icon} ${itemName(keep)}. Its bullets now carry ${effNames(instEffects(keep))}${ch.length ? ` and chain ${ch.join(', ')}` : ''}. Free sockets: ${freed}.`);
  }
  for (const id of ready) toast(`✦ ${ITEM[id].icon} ${ITEM[id].name} can now ${tierName(T + 1)} Fuse.`);
  return keep;
}
function keepChoices(f, back) {
  const out = f.keeps.map(s => ({ type: 'keep', s, others: f.group.filter(x => x !== s), tier: f.tier }));
  if (back) out.push({ type: 'back' });
  return out;
}

function buildChoices() {
  const opts = [];
  for (const f of fusionGroups()) opts.push({ type: 'fuse', group: f.group, keeps: f.keeps, tier: f.tier, nexus: f.nexus || (f.keeps.length === 1 ? nexusRecipe(f.group, f.tier, f.keeps[0]) : null), w: (f.nexus ? 40 : 20) + 10 * f.tier });
  for (const inst of G.inv) if (inst.level < MAX_LEVEL) opts.push({ type: 'up', inst, w: 3 });
  for (const s of SLOT_KEYS) {
    if (slotCount(s) >= socketsFor(s)) continue;
    // an item fused into something else can be offered again (a fresh copy); only items held right now are left out
    const cands = ITEMS.filter(d => d.slot === s && available(d) && !G.inv.some(i => i.def === d));
    // items that share an effect with something held are offered more often, so a build can be steered toward a fusion
    // and, a little, toward the hero's archetype (archLeans)
    const w = d => 1 + (G.inv.some(i => instEffects(i).some(k => effectsOf(d).includes(k))) ? 1 : 0) + (archLeans(d) ? 0.5 : 0), tw = cands.reduce((n, d) => n + w(d), 0);
    for (const d of cands) opts.push({ type: 'new', def: d, w: 2.4 * w(d) / tw });
  }
  const k = 3 + (Math.random() < 0.15 + G.player.luck * 2 ? 1 : 0);
  const out = [];
  while (out.length < k && opts.length) {
    const tw = opts.reduce((a, o) => a + o.w, 0); let r = Math.random() * tw, idx = 0;
    for (; idx < opts.length; idx++) { r -= opts[idx].w; if (r <= 0) break; }
    idx = Math.min(idx, opts.length - 1); const o = opts.splice(idx, 1)[0];
    if (o.type === 'fuse') { for (let j = opts.length - 1; j >= 0; j--) { const q = opts[j]; if (q.type === 'fuse' && q.group.some(x => o.group.includes(x))) opts.splice(j, 1); } }
    out.push(o);
  }
  if (!out.length) out.push({ type: 'heal' }, { type: 'gold' });
  return out;
}
// does this item fit the hero's archetype (one of its effects or its slot)?
const archLeans = d => !!(G && G.arch && (effectsOf(d).some(k => G.arch.leans.includes(k)) || G.arch.slots.includes(d.slot)));
function applyChoice(o) {
  if (o.type === 'new') addItem(o.def);
  else if (o.type === 'up') levelItem(o.inst);
  else if (o.type === 'fuse') fuse(o.keeps[0], o.group.filter(x => x !== o.keeps[0]));
  else if (o.type === 'keep') fuse(o.s, o.others);
  else if (o.type === 'heal') heal(40);
  else if (o.type === 'gold') G.gold += 25;
}
// ---------------- chests ----------------
// A chest holds 1, 3 or 5 upgrades (DROPS.chest in items.js), rolled when it drops so its colour shows what is inside:
// blue 1, purple 3, gold 5. Luck raises the odds of the bigger ones. Opening one pauses the run on the chest screen.
const CHEST_LOOK = { 1: { name: 'Chest', color: '#5ab8ff' }, 3: { name: 'Rare chest', color: '#c04cff' }, 5: { name: 'Legendary chest', color: '#ffd24c' } };
const chestLook = n => CHEST_LOOK[n >= 5 ? 5 : n >= 3 ? 3 : 1];
// [chance of 1, of 3, of 5] at a Luck of L
function chestOdds(L) {
  const C = DROPS.chest, w = C.luck || 0;
  const p5 = Math.min(0.9, Math.max(0, (C.five || 0) * (1 + 2 * w * L))), p3 = Math.min(0.95 - p5, Math.max(0, (C.three || 0) * (1 + w * L)));
  return [Math.max(0, 1 - p3 - p5), p3, p5];
}
function chestRoll(least = 1, L = G.player.luck) {
  const [, p3, p5] = chestOdds(L), r = Math.random();
  let n = r < p5 ? 5 : r < p5 + p3 ? 3 : 1;
  if (least > 3) n = 5; else if (least > 1 && n < 3) n = 3;
  return n;
}
function dropChest(x, y, least, n) {
  n = n || chestRoll(least); drop('chest', x, y, n);
  const L = chestLook(n); fxRing(x, y, 90, L.color, 0.7, 5); fxRing(x, y, 160, L.color, 1, 3);
  if (n > 1) banner(`${n >= 5 ? '★ ' : ''}${L.name}!`, L.color, 1.8);
  return n;
}
function openChest(n) {
  const got = [];
  for (let k = 0; k < n; k++) {
    const f = !G.fuseQueue.length && fusionGroups()[0];
    if (f) { G.fuseQueue.push(f); got.push({ icon: '✦', title: `${f.nexus ? '✴ ' + f.nexus.name : tierName(f.tier) + ' fusion'}`, tag: 'FUSION', text: 'You choose which item remains when this chest closes.', color: TIER_COLORS[f.tier] }); continue; } // the player picks which item stays
    const c = buildChoices().filter(x => x.type === 'up' || x.type === 'heal' || x.type === 'gold'); const o = c.length ? pick(c) : { type: 'gold' };
    const d = describeChoice(o); applyChoice(o);
    got.push({ icon: d.icon, title: d.title, tag: d.tag, text: '', color: d.effs ? EFFECTS[d.effs[0]].color : o.type === 'heal' ? '#ff3b5c' : '#ffd24c' });
  }
  const gold = Math.round(10 * n * STAGE().gold); G.gold += gold;
  G.stats.chests = (G.stats.chests || 0) + 1;
  showChest(n, got, gold);
}
function showChest(n, got, gold) {
  const L = chestLook(n);
  G.paused = true;
  $('#chestTitle').textContent = `${n >= 5 ? '★ ' : ''}${L.name}${n >= 5 ? ' ★' : ''}`; $('#chestTitle').style.color = L.color;
  $('#chest .panel').style.setProperty('--c', L.color);
  $('#chestCards').innerHTML = got.map((g, k) => `<div class="card chestItem" style="--c:${g.color};animation-delay:${0.15 + k * 0.28}s"><div class="ico">${g.icon}</div><div class="tag">${g.tag}</div><b>${g.title}</b>${g.text ? `<small>${g.text}</small>` : ''}</div>`).join('');
  $('#chestGold').innerHTML = `<span class="gold">+● ${gold}</span>`;
  showScreen('chest');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}
function closeChest() { if (currentScreen !== 'chest') return; showScreen(null); if (G) G.paused = false; }

// ---------------- player ----------------
const keys = {};
const touch = { active: false, ox: 0, oy: 0, x: 0, y: 0 };
// Player stats come from one sum of modifiers (STAT_INFO keys): Forge ranks + hero perk, plus passive items during the run.
function forgeMods() { const m = {}; for (const u of UPGRADES) { const r = SAVE.upg[u.id] || 0; if (r && !u.socket && STAT_INFO[u.id]) m[u.id] = u.per * r; } return m; }
function applyStats(P, m) {
  const g = k => m[k] || 0, oldMax = P.maxHp;
  P.might = 1 + g('might'); P.maxHp = Math.max(1, Math.round(100 * (1 + g('hp')))); P.armor = g('armor'); P.regen = g('regen');
  P.speed = 200 * (1 + g('speed')); P.area = Math.max(0.2, 1 + g('area')); P.cdMul = Math.max(0.2, 1 - g('cd')); P.projSpd = Math.max(0.2, 1 + g('projSpd'));
  P.duration = Math.max(0.2, 1 + g('duration')); P.amount = Math.floor(g('amount') + 1e-6); P.magnet = 90 * (1 + g('magnet')); P.luck = g('luck');
  P.growth = 1 + g('growth'); P.greed = 1 + g('greed'); P.critBonus = g('crit') + g('luck') * 0.4;
  if (oldMax === undefined) P.hp = P.maxHp; else if (P.maxHp > oldMax) P.hp += P.maxHp - oldMax; else P.hp = Math.min(P.hp, P.maxHp);
}
function buildPlayer(ch) {
  const base = forgeMods(); for (const [k, v] of Object.entries(ch.mods || {})) if (STAT_INFO[k]) base[k] = (base[k] || 0) + v;
  const U = id => { const u = UPGRADES.find(x => x.id === id); return u ? u.per * (SAVE.upg[id] || 0) : 0; };
  const P = { x: 0, y: 0, r: 7, face: 0, moveAng: 0, moving: false, stillT: 0, inv: 1, dashT: 0, dashCd: 0, dashA: 0, hurtFlash: 0, baseMods: base, revives: U('revive'), rerolls: U('reroll') + 1 };
  applyStats(P, base); return P;
}
function updatePlayer(dt) {
  const P = G.player;
  let mx = 0, my = 0;
  if (keys.KeyW || keys.ArrowUp) my -= 1; if (keys.KeyS || keys.ArrowDown) my += 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1; if (keys.KeyD || keys.ArrowRight) mx += 1;
  if (touch.active) { const dx = touch.x - touch.ox, dy = touch.y - touch.oy, l = Math.hypot(dx, dy); if (l > 8) { mx = dx / Math.max(l, 50); my = dy / Math.max(l, 50); } }
  if (G.sandbox && SB.move && !mx && !my) { const a = G.time * 1.4 + Math.PI / 2; mx = Math.cos(a); my = Math.sin(a); } // test canvas: walk in a circle
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
function dash() { if (!G || G.paused) return; const P = G.player; if (P.dashCd > 0) return; P.dashT = 0.16; P.dashCd = 1.1; P.dashA = P.moving ? P.moveAng : P.face; P.inv = Math.max(P.inv, 0.3); trigger('dash'); }
function hurtPlayer(dmg) {
  const P = G.player; if (P.inv > 0 || G.over || G.sandbox) return;
  dmg = Math.max(1, dmg * otMul(G.time, DIFF().overtimeDmg) - P.armor); P.hp -= dmg; P.inv = 0.7; P.hurtFlash = 0.2; G.shake = 6;
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
function newRun(charId, stage) {
  if (window.VOIDLIGHT_CONTENT) VOIDLIGHT_CONTENT.applyPending(); // content published while a run was going
  const ch = CHARACTERS.find(c => c.id === charId) || CHARACTERS[0];
  if (!charPlayable(SAVE, ch)) { toast('Pick a hero you have unlocked'); return; }
  const n = clamp((stage || SAVE.lastStage || 1) | 0, 1, stageCount()), st = stageUnlocked(SAVE, n) ? n : 1;
  SAVE.lastChar = ch.id; SAVE.lastStage = st; writeSave();
  freshRun(ch, st);
  worldInit(G); // world.js: the level's wrapping map, its Map pickup, zones and shrines
  addItem(ITEM[ch.weapon]);
  showScreen(null);
  if (TESTSAVE) toast('🧪 Test save from the admin panel: nothing here touches real progress');
  banner(`Level ${st}: ${STAGE().name}`, STAGE().color, 2.5);
}
function freshRun(ch, stage = 1) {
  const g = { time: 0, char: ch, player: null, cam: { x: 0, y: 0 }, enemies: [], bullets: [], ebullets: [], fx: [], texts: [], pickups: [], deploys: [], sched: [], inv: [], pool: {},
    kills: 0, level: 1, xp: 0, xpNext: xpFor(1), gold: 0, pendingLevels: 0, paused: false, over: false, nextId: 1, spawnAcc: 0, nextRing: 90, nextElite: 60, bossSpawned: {},
    stats: { evolves: 0, supers: 0, megas: 0, bossKills: 0, crits: 0, healed: 0, damage: 0 }, settings: SAVE.settings, banners: [], shake: 0, reached: {}, fuseQueue: [], runners: [],
    stage, stageDef: stageDef(stage), bonus: {}, arch: archOf(ch), itemKills: {}, foes: {} };
  g.player = buildPlayer(ch);
  G = g; recomputePool();
  return g;
}
function update(dt) {
  G.time += dt;
  // scheduled callbacks
  if (G.sched.length) { const due = G.sched.filter(s => s.t <= G.time); if (due.length) { G.sched = G.sched.filter(s => s.t > G.time); for (const s of due) s.fn(); } }
  updatePlayer(dt);
  G.cam.x = G.player.x; G.cam.y = G.player.y;
  if (G.sandbox) sandboxTick(dt); else director(dt);
  if (G.world) worldUpdate(dt);
  gridBuild();
  // items
  for (const inst of G.runners) { // held items, and the items fused into them
    const d = inst.def;
    if (d.fire) { inst.timer -= dt; if (inst.timer <= 0) { inst.timer = cdFor(inst, d.cd); d.fire(inst, ctxOf(inst)); } }
    if (d.update) d.update(inst, dt);
  }
  for (const d of G.deploys) { if (d.dead) continue; d.t += dt; if (d.update) d.update(d, dt); if (d.rides) chainRide(d, dt); if (d.t >= d.life) { d.dead = true; if (d.onEnd) d.onEnd(d); } }
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
  if (G.paused) return; // a chest opened this frame: level-ups and fusions wait until it closes
  if (G.pendingLevels > 0 && !G.over) { G.pendingLevels--; trigger('levelup'); openLevelUp(); }
  else if (G.fuseQueue.length && !G.over) openFuse(G.fuseQueue.shift());
}
function endRun(won) {
  if (G.over) return; G.over = true;
  const s = SAVE.stats; const bonus = Math.round((Math.floor(G.time / 60) * 10 + (won ? 250 : 0)) * STAGE().gold);
  const before = progressSnapshot(SAVE);
  const couldFuse = new Set(ITEMS.filter(d => fuseUnlocked(SAVE, d)).map(d => d.id));
  for (const [id, L] of Object.entries(G.reached)) { const r = (SAVE.itemRuns[id] || [0, 0, 0, 0, 0]).slice(); for (let k = 0; k < L; k++) r[k]++; SAVE.itemRuns[id] = r; }
  for (const [id, n] of Object.entries(G.itemKills)) SAVE.itemKills[id] = (SAVE.itemKills[id] || 0) + n;
  for (const [id, f] of Object.entries(G.foes)) { const b = SAVE.bestiary[id] = SAVE.bestiary[id] || { seen: 0, kills: 0, tier: 0 }; b.seen += f.seen; b.kills += f.kills; }
  const earned = Math.round(G.gold + bonus);
  SAVE.gold += earned; s.totalGold += earned; s.totalKills += G.kills; s.bestTime = Math.max(s.bestTime, Math.floor(G.time)); s.bossKills += G.stats.bossKills;
  s.evolves += G.stats.evolves; s.supers += G.stats.supers; s.megas += G.stats.megas; s.runs++; if (won) s.wins++; s.maxLevel = Math.max(s.maxLevel, G.level);
  const key = String(G.stage), st = SAVE.stages[key] = Object.assign(emptyStage(), SAVE.stages[key]);
  st.kills += G.kills; st.best = Math.max(st.best, Math.floor(G.time)); st.bosses += G.stats.bossKills; st.runs++; if (won) st.wins++;
  // the same, for this hero only (hero unlocks can ask for a level beaten with another hero)
  const cs = (SAVE.charStages = SAVE.charStages || {})[G.char.id] = SAVE.charStages[G.char.id] || {}, ct = cs[key] = Object.assign(emptyStage(), cs[key]);
  ct.kills += G.kills; ct.best = Math.max(ct.best, Math.floor(G.time)); ct.bosses += G.stats.bossKills; ct.runs++; if (won) ct.wins++;
  writeSave();
  const fresh = checkUnlocks();
  fresh.push(...progressDiff(before, progressSnapshot(SAVE)));
  for (const d of ITEMS) if (!d.disabled && !couldFuse.has(d.id) && fuseUnlocked(SAVE, d)) fresh.push(`✦ Fusion: ${d.icon} ${d.name} (${d.name} mastery)`);
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
  if (b.rides) drawChainRides(b, x, y); // fusion chain riders (chain.js)
  const col = b.rainbow ? `hsl(${(G.time * 400 + b.t * 700) % 360},100%,65%)` : b.color;
  let ang = Math.atan2(b.vy, b.vx);
  if (b.orbit) ang = b.orbit.a + Math.PI / 2 * Math.sign(b.orbit.w);
  if (b.lob) { const h = Math.sin(Math.PI * clamp(b.t / b.life, 0, 1)) * b.lob; ctx.fillStyle = 'rgba(0,0,0,0.4)'; circle(x, y, b.r); y -= h; }
  const r = b.r;
  if (b.trail && b.trail.length > 2) { // optional fading trail (item vis.trail)
    const dx = x - b.x, dy = y - b.y, n = b.trail.length / 2; ctx.fillStyle = col;
    for (let k = 0; k < n; k++) { ctx.globalAlpha = 0.35 * (k + 1) / n; circle(b.trail[k * 2] + dx, b.trail[k * 2 + 1] + dy, r * (0.35 + 0.55 * (k + 1) / n)); }
    ctx.globalAlpha = 1;
  }
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
// Bosses get the loudest frame: a dark well, a pulsing aura and two counter-rotating rings, plus a white outline.
// Elites stay quieter: a slightly bigger body with a thin gold crown ring and a small health bar.
function drawBossFrame(e, x, y, r) {
  const p = 0.5 + 0.5 * Math.sin(G.time * 3);
  ctx.fillStyle = '#000'; ctx.globalAlpha = 0.5; circle(x, y, r * 2);
  ctx.fillStyle = e.color; ctx.globalAlpha = 0.14 + 0.1 * p; circle(x, y, r * 1.8);
  ctx.strokeStyle = e.color; ctx.lineCap = 'round';
  ctx.lineWidth = 4; ctx.globalAlpha = 0.9; for (let k = 0; k < 3; k++) { const a = G.time * 1.2 + k * TAU / 3; ctx.beginPath(); ctx.arc(x, y, r * 1.45, a, a + 1.4); ctx.stroke(); }
  ctx.lineWidth = 2; ctx.globalAlpha = 0.55 + 0.3 * p; for (let k = 0; k < 6; k++) { const a = -G.time * 0.8 + k * TAU / 6; ctx.beginPath(); ctx.arc(x, y, r * 1.75, a, a + 0.6); ctx.stroke(); }
  ctx.lineCap = 'butt'; ctx.globalAlpha = 1;
}
function drawEliteMark(e, x, y, r) {
  ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.8;
  for (let k = 0; k < 3; k++) { const a = G.time * 0.7 + k * TAU / 3; ctx.beginPath(); ctx.arc(x, y, r + 6, a, a + 1.5); ctx.stroke(); }
  ctx.globalAlpha = 1; const w = r * 2; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - w / 2, y - r - 11, w, 3); ctx.fillStyle = '#ffd27a'; ctx.fillRect(x - w / 2, y - r - 11, w * clamp(e.hp / e.maxHp, 0, 1), 3);
}
function enemyPath(sh, x, y, r, rot) {
  if (sh === 'circle') { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
  else if (sh === 'tri') poly(x, y, r * 1.2, 3, rot);
  else if (sh === 'diamond') poly(x, y, r * 1.2, 4, rot);
  else if (sh === 'square') poly(x, y, r * 1.2, 4, Math.PI / 4);
  else if (sh === 'hex') poly(x, y, r * 1.1, 6, rot);
  else if (sh === 'oct') poly(x, y, r * 1.1, 8, rot);
  else if (sh === 'star4') poly(x, y, r * 1.35, 4, rot, 0.45);
  else if (sh === 'arrow') { const c = Math.cos(rot), s = Math.sin(rot), pt = (u, v) => [x + u * c - v * s, y + u * s + v * c]; ctx.beginPath(); for (const [u, v] of [[1.4, 0], [-1, -0.95], [-0.35, 0], [-1, 0.95]]) ctx.lineTo(...pt(u * r, v * r)); ctx.closePath(); }
  else poly(x, y, r * 1.3, 5, rot, 0.5);
}
function drawEnemy(e, x, y) {
  const col = e.flash > 0 ? '#ffffff' : e.color;
  const r = e.r;
  if (e.boss) drawBossFrame(e, x, y, r);
  const sh = e.T.shape, rot = e.boss ? G.time * 0.6 : e.dashT > 0 || e.windT > 0 ? e.dashA : angTo(e.x, e.y, G.player.x, G.player.y);
  if (e.windT > 0) { ctx.strokeStyle = e.color; ctx.globalAlpha = 0.5; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(rot) * 90, y + Math.sin(rot) * 90); ctx.stroke(); ctx.globalAlpha = 1; } // a Lancer about to dash
  ctx.fillStyle = col; ctx.strokeStyle = e.boss ? '#ffffff' : 'rgba(0,0,0,0.6)'; ctx.lineWidth = e.boss ? 3 : 2;
  enemyPath(sh, x, y, r, rot);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; circle(x, y, r * 0.45);
  ctx.fillStyle = e.boss ? '#fff' : '#ffe'; circle(x + Math.cos(rot) * r * 0.35, y + Math.sin(rot) * r * 0.35, Math.max(1.6, r * 0.16));
  // status rings
  let ring = 0; const st = [[e.burnT > 0, '#ff7a2f'], [e.slowT > 0, '#7fdcff'], [e.poisonT > 0, '#8cff5a'], [e.freezeT > 0, '#ffffff']];
  for (const [on, c] of st) if (on) { ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r + 3 + ring * 3, 0, TAU); ctx.stroke(); ring++; }
  if (e.elite && !e.boss) drawEliteMark(e, x, y, r);
}
function drawDeploy(d, x, y) {
  const c = d.color;
  switch (d.kind) {
    case 'cloud': { ctx.fillStyle = c; ctx.globalAlpha = 0.16 * Math.min(1, (d.life - d.t) * 2); for (let k = 0; k < 4; k++) circle(x + Math.cos(d.t + k * 1.6) * d.r * 0.3, y + Math.sin(d.t * 1.3 + k) * d.r * 0.3, d.r * 0.75); ctx.globalAlpha = 1; break; }
    case 'wave': { ctx.strokeStyle = c; ctx.globalAlpha = 1 - d.t / d.life; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(x, y, Math.max(1, d.R), 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; break; }
    case 'well': { ctx.strokeStyle = c; ctx.lineWidth = 2; for (let k = 0; k < 4; k++) { const rr = ((d.t * 0.8 + k / 4) % 1) * d.r; ctx.globalAlpha = rr / d.r * 0.6; ctx.beginPath(); ctx.arc(x, y, d.r - rr, 0, TAU); ctx.stroke(); } ctx.globalAlpha = 1; ctx.fillStyle = '#000'; circle(x, y, 14); ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(x, y, 14, 0, TAU); ctx.stroke(); break; }
    case 'mine': { ctx.fillStyle = c; ctx.globalAlpha = d.t < 0.5 ? 0.4 : 0.6 + 0.4 * Math.sin(G.time * 10); circle(x, y, 7); ctx.globalAlpha = 0.25; circle(x, y, 14); ctx.globalAlpha = 1; break; }
    case 'flash': { const p = d.t / d.life, r = d.r * (0.7 + 0.3 * p); ctx.fillStyle = c; ctx.globalAlpha = 0.18 * (1 - p); circle(x, y, r); ctx.strokeStyle = c; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.8 * (1 - p); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; break; } // a chain aura pop
    case 'mini': { const a = Math.min(1, (d.life - d.t) * 3); ctx.fillStyle = c; ctx.globalAlpha = 0.3 * a; circle(x, y, 11); ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(x, y, 11, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - d.t / d.life)); ctx.stroke(); // a chain's small deployable
      ctx.font = '13px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(d.icon, x, y + 1); ctx.globalAlpha = 1; break; }
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
  else if (p.k === 'chest') drawChest(p, x, y);
  else { ctx.font = '18px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText({ heart: '❤️', magnet: '🧲' }[p.k] || '•', x, y + Math.sin(G.time * 4) * 2); }
}
// a chest: a beam of light, a pulsing glow (with turning rays for 3 and 5), and a box in its colour
function drawChest(p, x, y) {
  const L = chestLook(p.v), c = L.color, t = G.time + p.x * 0.01, s = p.v >= 5 ? 1.4 : p.v >= 3 ? 1.18 : 1, yy = y + Math.sin(t * 3) * 2;
  const g = ctx.createLinearGradient(x, y - 190, x, y); g.addColorStop(0, c + '00'); g.addColorStop(1, c + '66');
  ctx.fillStyle = g; ctx.fillRect(x - 6 * s, y - 190, 12 * s, 190);
  ctx.fillStyle = c; ctx.globalAlpha = 0.2 + 0.12 * Math.sin(t * 5); circle(x, y, 30 * s); ctx.globalAlpha = 1;
  if (p.v >= 3) { ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.9); ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.globalAlpha = 0.45;
    const n = p.v >= 5 ? 12 : 8; ctx.beginPath(); for (let k = 0; k < n; k++) { const a = k * TAU / n; ctx.moveTo(Math.cos(a) * 20 * s, Math.sin(a) * 20 * s); ctx.lineTo(Math.cos(a) * (34 + 6 * Math.sin(t * 4 + k)) * s, Math.sin(a) * (34 + 6 * Math.sin(t * 4 + k)) * s); } ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1; }
  const w = 22 * s, h = 14 * s;
  ctx.fillStyle = '#1c1208'; ctx.fillRect(x - w / 2, yy - h / 2 + 2, w, h);
  ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.strokeRect(x - w / 2, yy - h / 2 + 2, w, h);
  ctx.fillStyle = c; ctx.fillRect(x - w / 2 - 2, yy - h / 2 - 4 * s, w + 4, 6 * s);
  ctx.fillStyle = '#fff'; ctx.fillRect(x - 2, yy - 1, 4, 6 * s);
}
// ---------------- beacons: arrows at the screen edge pointing at things worth walking to ----------------
// Each one is { x, y, color, icon }. Chests now; later the level's Map and other finds (world.js adds them).
function beaconList() {
  const out = [];
  for (const p of G.pickups) if (p.k === 'chest') out.push({ x: p.x, y: p.y, color: chestLook(p.v).color, icon: '📦' });
  if (typeof worldBeacons === 'function') out.push(...worldBeacons());
  return out;
}
function drawBeacons() {
  const W = VIEW.w, H = VIEW.h, cx = W / 2, cy = H / 2, ox = cx - G.cam.x, oy = cy - G.cam.y, m = 30, top = 86, bottom = 80;
  for (const b of beaconList()) {
    const sx = b.x + ox, sy = b.y + oy; if (sx > 10 && sx < W - 10 && sy > 10 && sy < H - 10) continue;
    const a = Math.atan2(sy - cy, sx - cx), c = Math.cos(a), s = Math.sin(a);
    const kx = (c > 0 ? W - m - cx : cx - m) / Math.max(1e-6, Math.abs(c)), ky = (s > 0 ? H - bottom - cy : cy - top) / Math.max(1e-6, Math.abs(s)), k = Math.min(kx, ky);
    const x = cx + c * k, y = cy + s * k, pulse = 0.75 + 0.25 * Math.sin(G.time * 5);
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(10,8,22,0.8)'; circle(0, 0, 16); ctx.strokeStyle = b.color; ctx.lineWidth = 2; ctx.globalAlpha = pulse; ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.stroke();
    ctx.rotate(a); ctx.fillStyle = b.color; ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(17, -7); ctx.lineTo(17, 7); ctx.closePath(); ctx.fill(); ctx.rotate(-a); ctx.globalAlpha = 1;
    ctx.font = '15px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(b.icon, 0, 1);
    const dist = Math.hypot(b.x - G.player.x, b.y - G.player.y); ctx.font = 'bold 10px system-ui,sans-serif'; ctx.fillStyle = b.color; ctx.fillText(Math.round(dist / 50) + 'm', 0, 27);
    ctx.restore();
  }
}
function render() {
  const W = VIEW.w, H = VIEW.h;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#07060f'; ctx.fillRect(0, 0, W, H);
  if (!G) return;
  if (!G.sandbox) { // the level's colour washes the floor faintly, so each level reads as one scheme
    const c = STAGE().color, k = W + 'x' + H + c;
    if (render.bgKey !== k) { const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.8); g.addColorStop(0, c + '16'); g.addColorStop(1, c + '04'); render.bg = g; render.bgKey = k; }
    ctx.fillStyle = render.bg; ctx.fillRect(0, 0, W, H);
  }
  const sx0 = (G.shake ? rand(-G.shake, G.shake) : 0), sy0 = (G.shake ? rand(-G.shake, G.shake) : 0);
  const ox = W / 2 - G.cam.x + sx0, oy = H / 2 - G.cam.y + sy0;
  // grid
  ctx.strokeStyle = G.sandbox ? 'rgba(130,100,255,0.08)' : STAGE().color + '18'; ctx.lineWidth = 1; const gs = 64; // the level's color
  ctx.beginPath(); for (let x = ((ox % gs) + gs) % gs; x < W; x += gs) { ctx.moveTo(x, 0); ctx.lineTo(x, H); } for (let y = ((oy % gs) + gs) % gs; y < H; y += gs) { ctx.moveTo(0, y); ctx.lineTo(W, y); } ctx.stroke();
  if (G.world) drawWorld(ox, oy); // world.js: landmarks, the Map, zones, shrines
  const vis = (x, y, m = 80) => x > -m && x < W + m && y > -m && y < H + m;
  for (const p of G.pickups) { const x = p.x + ox, y = p.y + oy; if (vis(x, y)) drawPickup(p, x, y); }
  for (const d of G.deploys) { const x = d.x + ox, y = d.y + oy; if (vis(x, y, 220)) { drawDeploy(d, x, y); if (d.rides) drawChainRides(d, x, y); } }
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
  // Enemy bullets read as hostile: drawn over everything without additive blending, a dark core inside a coloured shell
  // and a pulsing outer ring. Player bullets are the opposite: additive soft glow around a white-hot core.
  const ep = 0.5 + 0.5 * Math.sin(G.time * 10);
  for (const b of G.ebullets) { const x = b.x + ox, y = b.y + oy; if (!vis(x, y)) continue;
    ctx.fillStyle = '#000'; ctx.globalAlpha = 0.45; circle(x, y, b.r * 1.9);
    ctx.strokeStyle = b.color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.45 + 0.4 * ep; ctx.beginPath(); ctx.arc(x, y, b.r * (1.45 + 0.15 * ep), 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = b.color; circle(x, y, b.r); ctx.fillStyle = '#16040f'; circle(x, y, b.r * 0.5); }
  ctx.globalAlpha = 1;
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
  if (G.sandbox) { drawSandboxHUD(); return; }
  const L = 62, hpW = Math.min(140, W / 2 - L - 48); // left column starts after the pause button; keep clear of the timer
  // xp bar
  ctx.fillStyle = 'rgba(20,16,40,0.9)'; ctx.fillRect(0, 0, W, 10); ctx.fillStyle = '#5ab8ff'; ctx.fillRect(0, 0, W * clamp(G.xp / G.xpNext, 0, 1), 10);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = 'bold 14px system-ui,sans-serif'; ctx.fillStyle = '#fff';
  ctx.fillText('LV ' + G.level, L, 16);
  // hp
  ctx.fillStyle = '#300'; ctx.fillRect(L, 36, hpW, 10); ctx.fillStyle = '#ff3b5c'; ctx.fillRect(L, 36, hpW * clamp(P.hp / P.maxHp, 0, 1), 10);
  ctx.fillStyle = '#fff'; ctx.font = '11px system-ui,sans-serif'; ctx.fillText(Math.ceil(P.hp) + ' / ' + P.maxHp, L + 4, 36);
  ctx.font = '12px system-ui,sans-serif'; ctx.fillStyle = P.dashCd > 0 ? '#888' : '#7fdcff'; ctx.fillText(P.dashCd > 0 ? 'Dash ' + P.dashCd.toFixed(1) : 'Dash ready', L, 52);
  if (G.threat) { ctx.fillStyle = '#ff4cc3'; ctx.fillText(`✴ Nexus threat ${+G.threat.toFixed(1)}: enemies +${Math.round((nexusMul('hp') - 1) * 100)}% HP`, L, 68); }
  // timer
  ctx.textAlign = 'center'; ctx.font = 'bold 26px system-ui,sans-serif'; ctx.fillStyle = overtime(G.time) > 0 ? '#ff3b5c' : '#fff'; ctx.fillText(fmtTime(G.time), W / 2, 16);
  if (!G.enemies.some(e => e.boss)) { ctx.font = '11px system-ui,sans-serif'; ctx.fillStyle = STAGE().color; ctx.fillText(`Level ${G.stage} · ${STAGE().name}`, W / 2, 46); }
  if (gameSpeed() !== 1) { ctx.font = 'bold 12px system-ui,sans-serif'; ctx.fillStyle = '#c9a0ff'; ctx.fillText('▶▶ ' + gameSpeed() + 'x', W / 2, 60); }
  // kills/gold
  ctx.textAlign = 'right'; ctx.font = 'bold 14px system-ui,sans-serif'; ctx.fillStyle = '#ddd'; ctx.fillText('☠ ' + G.kills, W - 12, 16); ctx.fillStyle = '#ffd24c'; ctx.fillText('● ' + Math.floor(G.gold), W - 12, 36);
  // boss bar
  const boss = G.enemies.find(e => e.boss);
  if (boss) { const bw = Math.min(520, W - 40); ctx.fillStyle = '#200'; ctx.fillRect(W / 2 - bw / 2, 50, bw, 10); ctx.fillStyle = boss.color; ctx.fillRect(W / 2 - bw / 2, 50, bw * clamp(boss.hp / boss.maxHp, 0, 1), 10); ctx.textAlign = 'center'; ctx.font = 'bold 12px system-ui'; ctx.fillStyle = '#fff'; ctx.fillText(boss.T.name, W / 2, 63); }
  // banners
  let by = H * 0.26; for (const b of G.banners) { ctx.globalAlpha = Math.min(1, (b.dur - b.t) * 2); ctx.textAlign = 'center'; ctx.font = `bold ${small ? 18 : 24}px system-ui,sans-serif`; ctx.fillStyle = '#000'; ctx.fillText(b.text, W / 2 + 2, by + 2); ctx.fillStyle = b.color; ctx.fillText(b.text, W / 2, by); by += 34; }
  ctx.globalAlpha = 1;
  // slots: one box per socket (Forge sockets add more). Wide loadouts wrap onto a second row.
  const counts = SLOT_KEYS.map(socketsFor), total = counts.reduce((x, y) => x + y, 0), gap = 4;
  let rows = [SLOT_KEYS], sz = Math.floor((W - 24 - 15 * gap) / total) - 2;
  if (sz < 22) { rows = [SLOT_KEYS.slice(0, 3), SLOT_KEYS.slice(3)]; const wide = Math.max(...rows.map(r => r.reduce((n, k) => n + socketsFor(k), 0))); sz = Math.floor((W - 24 - 9 * gap) / wide) - 2; }
  sz = Math.max(14, Math.min(34, sz));
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  rows.forEach((row, ri) => {
    let x0 = 12; const y0 = H - (rows.length - ri) * (sz + 6) - 6;
    for (const s of row) {
      const items = G.inv.filter(i => i.def.slot === s), n = socketsFor(s);
      for (let k = 0; k < n; k++) {
        const it = items[k], x = x0 + k * (sz + 2), T = it ? it.tier || 0 : 0;
        ctx.fillStyle = 'rgba(20,16,40,0.85)'; ctx.fillRect(x, y0, sz, sz);
        ctx.strokeStyle = it ? (it.nexus ? (nexusDef(it.nexus) || {}).color || TIER_COLORS[T] : T ? TIER_COLORS[T] : EFFECTS[it.def.effect].color) : k >= SLOTS[s].sockets ? 'rgba(255,210,76,0.3)' : 'rgba(255,255,255,0.15)'; ctx.lineWidth = T ? 1.5 + T : 1.2; ctx.strokeRect(x + 0.5, y0 + 0.5, sz - 1, sz - 1);
        if (it) { ctx.font = `${sz * 0.55}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`; ctx.fillStyle = '#fff'; ctx.fillText(it.def.icon, x + sz / 2, y0 + sz / 2 - 2);
          if (isPassive(it.def)) { ctx.font = 'bold 8px system-ui'; ctx.fillStyle = '#c9f'; ctx.fillText('P', x + 5, y0 + 6); }
          if (it.nexus) { ctx.font = 'bold 9px system-ui'; ctx.fillStyle = '#ff4cc3'; ctx.fillText('✴', x + sz - 5, y0 + 6); }
          for (let l = 0; l < it.level; l++) { ctx.fillStyle = T ? TIER_COLORS[T] : '#fff'; ctx.fillRect(x + 3 + l * ((sz - 6) / 5), y0 + sz - 4, (sz - 6) / 5 - 1, 2); } }
        else { ctx.font = `${sz * 0.4}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`; ctx.globalAlpha = 0.25; ctx.fillStyle = '#fff'; ctx.fillText(SLOTS[s].icon, x + sz / 2, y0 + sz / 2); ctx.globalAlpha = 1; }
      }
      x0 += n * (sz + 2) + gap * 3;
    }
  });
  drawBeacons();
  const mapBottom = drawMinimap(); // world.js
  // effect pool
  ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.font = '12px system-ui,sans-serif'; let ey = mapBottom || 62;
  for (const k of EFFECT_KEYS) { const v = G.pool[k]; if (!v) continue; ctx.fillStyle = EFFECTS[k].color; ctx.fillText(EFFECTS[k].icon + ' ' + EFFECTS[k].name + ' ×' + v, W - 12, ey); ey += 17; }
}

// ---------------- DOM UI ----------------
const $ = s => document.querySelector(s);
let currentScreen = 'menu';
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.toggle('show', el.id === id));
  currentScreen = id;
  if (id === 'menu') renderMenu(); if (id === 'lab') renderLab(); if (id === 'chars') renderChars(); if (id === 'forge') renderForge(); if (id === 'codex') renderCodex(); if (id === 'achievements') renderAchievements();
}
function goldPill() { return `<span class="gold">● ${Math.floor(SAVE.gold)}</span>`; }
function renderMenu() {
  const s = SAVE.stats;
  const ach = achievementList(SAVE);
  $('#menu .stats').innerHTML = (TESTSAVE ? '<div class="testsave">🧪 Test save from the admin panel. Nothing here touches real progress.</div>' : '') +
    `${goldPill()} &nbsp; Level ${stagesUnlocked(SAVE)}/${stageCount()} · Best ${fmtTime(s.bestTime)} · ${s.totalKills} kills · ${s.wins} wins · ${ITEMS.filter(d => !d.disabled && itemUnlocked(SAVE, d)).length}/${ITEMS.filter(d => !d.disabled).length} items · ${EFFECT_KEYS.filter(k => catUnlocked(SAVE, k)).length}/${EFFECT_KEYS.length} categories · ${ach.filter(a => a.done).length}/${ach.length} achievements · ${CHARACTERS.filter(c => charUnlocked(SAVE, c)).length}/${CHARACTERS.length} heroes`;
}
let selectedChar = null, selectedStage = null;
// Locked heroes and items: the requirement first, then (in most cases) a gold price once it is met.
window.lockHtml = lockHtml;
function partHtml(p) {
  const [a, b] = lockProgress(p, SAVE), ok = a >= b, n = ok || b <= 1 ? '' : p.stat === 'best' ? ` (${fmtTime(a)} / ${fmtTime(b)})` : ` (${Math.floor(a)} / ${b})`;
  return `<span class="part${ok ? ' ok' : ''}">${ok ? '✓' : '○'} ${partLabel(p)}${n}</span>`;
}
function lockHtml(lock, owned) {
  if (owned || !lock) return '';
  if (lockMet(lock, SAVE)) return `<button class="buy">Buy ● ${lockCost(lock)}</button>`;
  const cost = lockCost(lock) ? ` · then ● ${lockCost(lock)}` : '';
  if (lock.all) return `<div class="req">🔒 Needs:${lockParts(lock).map(partHtml).join('')}${cost ? `<span class="part">${cost.slice(3)}</span>` : ''}</div>`;
  return `<div class="req">🔒 ${lockLabel(lock)}${cost}</div>`;
}
function buy(lock, list, id, name, after) {
  const cost = lockCost(lock);
  if (!lockMet(lock, SAVE)) { toast(lockLabel(lock) + ' first'); return; }
  if (SAVE.gold < cost) { toast('Not enough gold'); return; }
  SAVE.gold -= cost; if (!list.includes(id)) list.push(id); writeSave(); toast(`Unlocked ${name}${after || '!'}`);
}
function renderChars() {
  selectedChar = selectedChar || SAVE.lastChar;
  if (!selectedStage || !stageUnlocked(SAVE, selectedStage)) selectedStage = stageUnlocked(SAVE, SAVE.lastStage) ? SAVE.lastStage : 1;
  // level picker
  const sw = $('#stageGrid'); sw.innerHTML = '';
  for (const S of STAGES) {
    const n = S.id, un = stageUnlocked(SAVE, n), st = stageStats(SAVE, n);
    const el = document.createElement('button'); el.className = 'card stage' + (un ? '' : ' locked') + (selectedStage === n ? ' sel' : ''); el.style.setProperty('--c', S.color);
    el.innerHTML = `<b>${un ? '' : '🔒 '}Level ${n}</b><small>${S.name}</small>` + (un ? `<small>${st.wins ? '✓ Beaten' + (st.wins > 1 ? ' ×' + st.wins : '') : st.runs ? 'Best ' + fmtTime(st.best) : 'New'}</small>` : `<small class="req">Beat Level ${n - 1}</small>`);
    el.onclick = () => { if (!un) { toast(`Beat Level ${n - 1} to open Level ${n}`); return; } selectedStage = n; renderChars(); };
    sw.appendChild(el);
  }
  const S = stageDef(selectedStage);
  $('#stageInfo').innerHTML = selectedStage === 1 ? 'The first level. Beat it (defeat the 15:00 boss) to open the next one.'
    : `Enemies ×${S.hp} HP, rising to ×${+(S.hp * (1 + S.ramp)).toFixed(1)} by 15:00, ×${S.spawn} spawns, ×${S.dmg} damage, bosses ×${S.bossHp}. XP ×${S.xp}, gold ×${S.gold}. New items and fusions arrive at level ${S.start}.`;
  const wrap = $('#charGrid'); wrap.innerHTML = '';
  for (const c of CHARACTERS) {
    const un = charUnlocked(SAVE, c), ok = un && charCatsOpen(SAVE, c), w = ITEM[c.weapon], L = charLock(c);
    const el = document.createElement('button'); el.className = 'card char' + (ok ? '' : ' locked') + (selectedChar === c.id ? ' sel' : '');
    el.style.setProperty('--c', c.color);
    // owned, but the starting weapon's category is still locked: the category requirement is what is left
    const shut = un && !ok ? `<div class="req">🔒 Needs:${charCats(c).filter(k => !catUnlocked(SAVE, k)).map(k => partHtml({ cat: k }) + `<span class="part">${EFFECTS[k].icon} ${lockLabel(catLock(k))}</span>`).join('')}</div>` : '';
    el.innerHTML = `<div class="avatar">${ok ? '◆' : '🔒'}</div><b>${c.name}</b><small>${c.title}</small><div class="wpn">${w.icon} ${w.name}</div><div class="perk">${c.perk}</div>${archCard(c)}` + lockHtml(L, un) + shut;
    el.onclick = () => {
      if (!un) { buy(L, SAVE.unlockedChars, c.id, c.name); renderChars(); return; }
      if (!ok) { toast(`${c.name} needs ${charCats(c).filter(k => !catUnlocked(SAVE, k)).map(k => EFFECTS[k].name).join(' and ')} items unlocked first`); return; }
      selectedChar = c.id; renderChars();
    };
    wrap.appendChild(el);
  }
  $('#chars .gold-line').innerHTML = goldPill();
  const c = CHARACTERS.find(x => x.id === selectedChar) || CHARACTERS[0]; const w = ITEM[c.weapon];
  $('#charInfo').innerHTML = `<b style="color:${c.color}">${c.name}, ${c.title}</b> starts with <b>${w.icon} ${w.name}</b> (${effTags(w)}): ${w.pattern} Other items come from your unlocked categories: ${EFFECT_KEYS.filter(k => catUnlocked(SAVE, k)).map(k => EFFECTS[k].icon + ' ' + EFFECTS[k].name).join(', ')}.`;
  $('#btnStart').textContent = `Start Level ${selectedStage}`;
}
function renderForge() {
  const wrap = $('#forgeGrid'); wrap.innerHTML = '';
  const cap = socketCap(SAVE), bought = socketsBought(SAVE);
  for (const u of UPGRADES) {
    const rank = SAVE.upg[u.id] || 0, maxed = rank >= u.max, cost = upgradeCost(u, rank), capped = u.socket && !maxed && bought >= cap;
    const el = document.createElement('button'); el.className = 'card up' + (maxed ? ' maxed' : '') + (u.socket ? ' sock' : '') + (capped ? ' poor' : !maxed && SAVE.gold < cost ? ' poor' : '');
    el.innerHTML = `<div class="ico">${u.icon}</div><b>${u.name}</b><small>${u.desc}</small><div class="pips">${'■'.repeat(rank)}${'□'.repeat(u.max - rank)}</div><div class="cost">${maxed ? 'MAX' : capped ? '🔒 Open a new level' : '● ' + cost}</div>`;
    el.onclick = () => {
      if (maxed) return;
      if (capped) { toast(cap >= stageCount() - 1 ? 'Every socket slot is in use.' : `Sockets bought: ${bought}/${cap}. Each level you open adds one more.`); return; }
      if (SAVE.gold < cost) { toast('Not enough gold'); return; } SAVE.gold -= cost; SAVE.upg[u.id] = rank + 1; writeSave(); renderForge();
    };
    wrap.appendChild(el);
  }
  $('#forgeSockets').innerHTML = `Extra sockets: <b>${bought}</b> bought of <b>${cap}</b> available. Each level you open (beyond Level 1) lets you buy one more, up to ${stageCount() - 1}.`;
  $('#forge .gold-line').innerHTML = goldPill() + ` <button class="link" id="refund">Refund all</button>`;
  $('#refund').onclick = () => { let back = 0; for (const u of UPGRADES) for (let r = 0; r < (SAVE.upg[u.id] || 0); r++) back += upgradeCost(u, r); SAVE.gold += back; SAVE.upg = {}; writeSave(); renderForge(); toast('Refunded ● ' + back); };
}
const effTags = d => effectsOf(d).map(k => `<span style="color:${EFFECTS[k].color}">${EFFECTS[k].icon} ${EFFECTS[k].name}</span>`).join(' + ');
const passiveText = d => `Per level: ${statText(d.passive)}.`;
let codexFilter = 'all', codexShow = 'all', achShow = 'all';
// Second tab row on the Codex and Achievements: All / Unlocked / Locked, with counts for what the other filters leave.
function showTabs(box, cur, nOpen, nShut, pick) {
  box.innerHTML = '';
  for (const [k, label] of [['all', `All ${nOpen + nShut}`], ['open', `🔓 Unlocked ${nOpen}`], ['shut', `🔒 Locked ${nShut}`]]) {
    const b = document.createElement('button'); b.className = 'tab' + (cur === k ? ' sel' : ''); b.textContent = label; b.onclick = () => pick(k); box.appendChild(b);
  }
}
const showOk = (show, open) => show === 'all' || (show === 'open') === !!open;
// unlocked = usable in a run: the item itself and all its categories
const itemOpen = d => itemUnlocked(SAVE, d) && effectsOf(d).every(k => catUnlocked(SAVE, k));
// The Codex opens from the main menu and from the pause menu. In a run it can't buy anything and gets a "This run" tab.
const inRun = () => !!(G && !G.sandbox && !G.over);
const heldNow = d => inRun() && G.inv.some(i => i.def === d || i.gone.includes(d));
function renderCodex() {
  if (codexFilter === 'run' && !inRun()) codexFilter = 'all';
  const tabs = $('#codexTabs'); tabs.innerHTML = '';
  const keys = [...(inRun() ? ['run'] : []), 'all', ...SLOT_KEYS, 'nexus', 'foes'];
  for (const k of keys) { const b = document.createElement('button'); b.className = 'tab' + (codexFilter === k ? ' sel' : ''); b.textContent = k === 'foes' ? '👁 Bestiary ' + foeIds().filter(id => foeSeen(SAVE, id)).length + '/' + foeIds().length : k === 'nexus' ? '✴ Nexus ' + NEXUS.filter(nexusOk).length : k === 'run' ? '▶ This run' : k === 'all' ? 'All ' + ITEMS.filter(d => !d.disabled).length : SLOTS[k].icon + ' ' + SLOTS[k].name; b.onclick = () => { codexFilter = k; renderCodex(); }; tabs.appendChild(b); }
  const wrap = $('#codexGrid'); wrap.innerHTML = '';
  const inTab = d => !d.disabled && (codexFilter === 'run' ? heldNow(d) : codexFilter === 'all' || d.slot === codexFilter);
  const pickShow = k => { codexShow = k; renderCodex(); };
  if (codexFilter === 'foes') { // bestiary.js: Unlocked = mastered
    const ids = foeIds(), nOpen = ids.filter(id => foeMastered(SAVE, id)).length;
    showTabs($('#codexShow'), codexShow, nOpen, ids.length - nOpen, pickShow);
    renderBestiary(wrap, open => showOk(codexShow, open));
  } else if (codexFilter === 'nexus') {
    const nx = NEXUS.filter(nexusOk), nOpen = nx.filter(x => nexusUnlocked(SAVE, x)).length;
    showTabs($('#codexShow'), codexShow, nOpen, nx.length - nOpen, pickShow);
    renderNexusCodex(wrap, x => showOk(codexShow, nexusUnlocked(SAVE, x))); // nexus.js
  } else {
    const tab = ITEMS.filter(inTab), nOpen = tab.filter(itemOpen).length;
    showTabs($('#codexShow'), codexShow, nOpen, tab.length - nOpen, pickShow);
  }
  if (codexFilter !== 'nexus' && codexFilter !== 'foes') for (const d of ITEMS) {
    if (!inTab(d) || !showOk(codexShow, itemOpen(d))) continue;
    const un = itemUnlocked(SAVE, d), E = EFFECTS[d.effect], effs = effectsOf(d);
    const el = document.createElement('div'); el.className = 'card item' + (un ? '' : ' locked'); el.style.setProperty('--c', E.color);
    let lockHtml = '';
    const shut = effs.filter(k => !catUnlocked(SAVE, k));
    for (const k of shut) lockHtml += `<div class="req">🔒 ${EFFECTS[k].name} items: ${lockLabel(catLock(k))}</div>`;
    if (!inRun()) lockHtml += window.lockHtml(d.lock, itemOwned(SAVE, d));
    el.innerHTML = `<div class="ico">${d.icon}</div><div class="body"><b>${d.name}</b>${masteryBadge(d, 0)}<div class="tags"><span>${SLOTS[d.slot].icon} ${SLOTS[d.slot].name}</span><span>${effTags(d)}</span>${isPassive(d) ? '<span>Passive</span>' : ''}${effs.length > 1 ? '<span>Two effects</span>' : ''}${d.trig ? `<span>⏯ ${d.trig}</span>` : ''}${heldNow(d) ? '<span class="held">In this run</span>' : ''}</div><small>${d.pattern}</small>${isPassive(d) ? `<small class="perk">${passiveText(d)}</small>` : ''}${fuseLine(d)}${histLine(d)}${lockHtml}</div>`;
    el.classList.add('open'); el.title = 'Open the fusion history of ' + d.name;
    el.onclick = e => { if (!e.target.closest('.buy')) openItemDetail(d); };
    const btn = el.querySelector('.buy');
    if (btn) btn.onclick = () => { buy(d.lock, SAVE.unlockedItems, d.id, d.name, shut.length ? `. It shows up once ${shut.map(k => EFFECTS[k].name).join(' and ')} items are unlocked.` : '!'); renderCodex(); };
    wrap.appendChild(el);
  }
  if (!wrap.children.length) wrap.innerHTML = `<p class="note">${codexShow === 'all' ? 'Nothing here.' : codexShow === 'open' ? 'Nothing unlocked here yet.' : 'Everything here is unlocked.'}</p>`;
  $('#codex .gold-line').innerHTML = goldPill();
}
function fuseLine(d) {
  const effs = effectsOf(d), f = fuseLockOf(d);
  const as = isPassive(d) ? '' : ` Chain: ${chainAbout(d)}`;
  return fuseUnlocked(SAVE, d) ? `<small class="fuse">✦ Mastered. At level 5 it can absorb any level 5 ${effs.map(k => EFFECTS[k].name).join(' or ')} item${isPassive(d) ? ' (as a passive it can only absorb other passives)' : ''}.${as}</small>`
    : `<small class="fuse">✦ Not mastered: ${fuseLockText(d)} (${Math.min(runsAt(SAVE, d.id, f.level), f.runs)}/${f.runs}). Until then a mastered item can still absorb it.${as}</small>`;
}
// one line per tier with a history requirement: "Super 1/3 · Mega 0/5"
function histLine(d) {
  const parts = [];
  for (let t = 2; t < TIER_KEYS.length; t++) { const [a, b] = histProgress(SAVE, d.id, t); if (b) parts.push(`<span class="${a >= b ? 'ok' : ''}">${a >= b ? '✓' : '○'} ${tierName(t)} ${Math.min(a, b)}/${b}</span>`); }
  return parts.length ? `<small class="hist">${parts.join(' · ')} <i>· fusion history ›</i></small>` : `<small class="hist"><i>Fusion history ›</i></small>`;
}
// item chip for the detail view; dim = not fused with yet
function itemChip(id, dim) {
  const d = ITEM[id]; if (!d) return '';
  const lock = !itemUnlocked(SAVE, d) || effectsOf(d).some(k => !catUnlocked(SAVE, k));
  return `<span class="chip${dim ? ' dim' : ''}" style="--c:${EFFECTS[d.effect].color}" title="${d.name}: ${effectsOf(d).map(k => EFFECTS[k].name).join(' + ')}${lock ? ' (locked)' : ''}">${lock ? '🔒' : ''}${d.icon} ${d.name} <i>${effectsOf(d).map(k => EFFECTS[k].icon).join('')}</i>${heldNow(d) ? ' <b>▶</b>' : ''}</span>`;
}
const setChip = ids => `<span class="chip combo">${ids.map(id => ITEM[id] ? `${ITEM[id].icon} ${ITEM[id].name}` : id).join(' + ')}</span>`;
function histBar(a, b, color) { return `<div class="bar"><i style="width:${Math.round(100 * Math.min(1, a / Math.max(1, b)))}%;background:${color}"></i></div>`; }
// The detail view of one item: what it has fused with (across runs), what is left, and its Super / Mega progress.
function itemDetailHtml(d) {
  const effs = effectsOf(d), mine = new Set(effs);
  const partners = ITEMS.filter(x => !x.disabled && x.id !== d.id && effectsOf(x).some(k => mine.has(k)));
  const done = new Set(fusedSets(SAVE, d.id, 'fused').flat());
  let h = `<div class="dHead"><div class="ico">${d.icon}</div><div><h3>${d.name}</h3>${masteryBadge(d, 0)}<div class="tags"><span>${SLOTS[d.slot].icon} ${SLOTS[d.slot].name}</span><span>${effTags(d)}</span>${isPassive(d) ? '<span>Passive</span>' : ''}${heldNow(d) ? '<span class="held">In this run</span>' : ''}</div></div><button class="close" data-close aria-label="Close">✕</button></div>`;
  h += `<small>${d.pattern}</small>${fuseLine(d)}`;
  for (let t = 1; t < TIER_KEYS.length; t++) {
    const key = TIER_KEYS[t], F = FUSION[key], sets = fusedSets(SAVE, d.id, key), [a, b] = histProgress(SAVE, d.id, t), col = TIER_COLORS[t];
    const open = tierUnlocked(SAVE, key);
    h += `<div class="dSec" style="--c:${col}"><h4>✦ ${F.name} fusion <small>${F.need} level 5 ${FUSION[TIER_KEYS[t - 1]].name.toLowerCase()} items that share an effect</small></h4>`;
    const req = [];
    if (t === 1) req.push(`<span class="part${fuseUnlocked(SAVE, d) ? ' ok' : ''}">${fuseUnlocked(SAVE, d) ? '✓' : '○'} ${d.name} mastery (to remain; it can absorb unmastered items)</span>`);
    if (F.lock) req.push(`<span class="part${open ? ' ok' : ''}">${open ? '✓' : '○'} ${lockLabel(F.lock)}</span>`);
    if (b) req.push(`<span class="part${a >= b ? ' ok' : ''}">${a >= b ? '✓' : '○'} ${d.name} ${histText(t)} (${Math.min(a, b)}/${b})</span>`);
    if (req.length) h += `<div class="req">${req.join('')}</div>`;
    if (b) h += histBar(a, b, col);
    if (t === 1) {
      h += `<p class="note">Fused with ${partners.filter(x => done.has(x.id)).length} of ${partners.length} items it can fuse with (they share ${effs.map(k => EFFECTS[k].name).join(' or ')}).${(FUSION[TIER_KEYS[2]] || {}).hist ? ` Each different one counts toward ${tierName(2)} fusion.` : ''}</p>`;
      if (done.size) h += `<div class="chips left">${partners.filter(x => done.has(x.id)).map(x => itemChip(x.id)).join('')}</div>`;
      const left = partners.filter(x => !done.has(x.id));
      if (left.length) h += `<p class="note">Not fused with yet${inRun() ? ' (▶ = in this run)' : ''}:</p><div class="chips left">${left.map(x => itemChip(x.id, true)).join('')}</div>`;
    } else {
      const nextHist = t + 1 < TIER_KEYS.length ? (FUSION[TIER_KEYS[t + 1]] || {}).hist : 0;
      h += `<p class="note">${sets.length ? `${sets.length} different ${F.name} fusion${sets.length > 1 ? 's' : ''} so far${nextHist ? `, each one counts toward ${tierName(t + 1)} fusion` : ''}:` : `No ${F.name} fusions yet.${nextHist ? ` Each one with a different set of partners counts toward ${tierName(t + 1)} fusion.` : ''}`}</p>`;
      if (sets.length) h += `<div class="chips left">${sets.map(setChip).join('')}</div>`;
    }
    h += '</div>';
  }
  return h;
}
let detailItem = null;
function openItemDetail(d) {
  detailItem = d; const box = $('#itemDetail');
  box.querySelector('.dPanel').innerHTML = itemDetailHtml(d); box.hidden = false;
  box.querySelector('[data-close]').onclick = closeItemDetail;
}
function closeItemDetail() { detailItem = null; $('#itemDetail').hidden = true; }
$('#itemDetail').onclick = e => { if (e.target.id === 'itemDetail') closeItemDetail(); };
// Back from the Codex: to the pause menu during a run, else to the main menu
function codexBack() { closeItemDetail(); if (inRun() && G.paused) { renderPause(); showScreen('pause'); } else showScreen('menu'); }
function renderAchievements() {
  const all = achievementList(SAVE), box = $('#achBody'); box.innerHTML = '';
  const nDone = all.filter(a => a.done).length;
  showTabs($('#achShow'), achShow, nDone, all.length - nDone, k => { achShow = k; renderAchievements(); });
  const list = all;
  const parts = a => (a.parts && !a.done ? `<div class="parts">${a.parts.map(p => `<small class="part${p.done ? ' ok' : ''}">${p.done ? '✓' : '○'} ${p.text}</small>`).join('')}</div>` : '');
  const card = a => `<div class="card ach${a.done ? ' done' : ''}"><div class="ico">${a.done ? a.icon : '🔒'}</div><b>${a.name}</b><small>${a.text}</small>${parts(a)}<small class="rew">Unlocks: ${a.reward}${a.cost ? ` (then ● ${a.cost})` : ''}</small>` +
    (a.done ? `<div class="bar"><i style="width:100%"></i></div><small class="ok">${a.owned ? 'Done' : `Done: buy it for ● ${a.cost}`}</small>` : `<div class="bar"><i style="width:${Math.round(100 * a.have / Math.max(1, a.need))}%"></i></div><small>${Math.floor(a.have)} / ${a.need}</small>`) + '</div>';
  const section = (title, note, every) => {
    const rows = every.filter(a => showOk(achShow, a.done)); // header counts stay those of the whole section
    if (!rows.length) return;
    const sec = document.createElement('div'); sec.className = 'achSec';
    sec.innerHTML = `<h3>${title} <small>${every.filter(a => a.done).length}/${every.length}</small></h3>${note ? `<p class="note">${note}</p>` : ''}<div class="grid achGrid">${rows.map(card).join('')}</div>`;
    box.appendChild(sec);
  };
  section('Levels and fusion tiers', 'Beat a level to open the next one. Each level you open also adds one socket you can buy in the Forge.', list.filter(a => a.group === 'stages' || a.group === 'tiers'));
  section('Heroes', 'Each hero is earned with another hero: beat a level with them and master a weapon. A hero also needs the categories of their starting weapon.', list.filter(a => a.group === 'heroes'));
  for (const S of STAGES) section(`Level ${S.id}: ${S.name}`, stageUnlocked(SAVE, S.id) ? '' : `Opens when you beat Level ${S.id - 1}.`, list.filter(a => a.stage === S.id && a.group !== 'stages' && a.group !== 'tiers' && a.group !== 'heroes' && a.group !== 'nexus'));
  section('Other', '', list.filter(a => !a.stage && (a.group === 'cats' || a.group === 'unlocks')));
  section('Nexus recipes', 'A Nexus is a fusion of specific items, keeping the first one. Nothing is halved, but enemies grow stronger while you hold it. Recipes are in the Codex (✴ Nexus).', list.filter(a => a.group === 'nexus'));
  section('Mastery (unlocks fusion)', 'Level an item up to master it. Only a mastered item can remain in a fusion; it can absorb items that are not mastered yet.', list.filter(a => a.group === 'mastery'));
  if (!box.children.length) box.innerHTML = `<p class="note">${achShow === 'open' ? 'No achievements unlocked yet.' : 'Every achievement is unlocked.'}</p>`;
  $('#achievements .gold-line').innerHTML = `${nDone}/${all.length} done`;
}
const effNames = ks => ks.map(k => EFFECTS[k].icon + ' ' + EFFECTS[k].name).join(' + ');
const tierLine = T => (T ? `${tierName(T)}: ×${FUSION[TIER_KEYS[T]].mul} damage, +${T} projectile${T > 1 ? 's' : ''}, ${Math.round(100 * (1 - FUSION[TIER_KEYS[T]].cdMul))}% faster` : '');
// Mastery badge for a level-up card about a base item: ★ when its fusion mastery is earned, else runs so far.
// A run in progress that already reached the mastery level counts once it ends.
function masteryBadge(d, tier) {
  if (!d || tier) return '';
  const f = fuseLockOf(d); if (f.runs <= 0) return '';
  if (fuseUnlocked(SAVE, d)) return `<div class="mast done" title="${d.name} mastery earned: it can remain in a fusion and absorb others">★ Mastered</div>`;
  const have = runsAt(SAVE, d.id, f.level), now = ((G && G.reached) || {})[d.id] >= f.level;
  const tip = `${d.name} mastery: reach level ${f.level} with it in ${f.runs} run${f.runs > 1 ? 's' : ''} to unlock fusing it (until then a mastered item can still absorb it)`;
  if (now && have + 1 >= f.runs) return `<div class="mast soon" title="${tip}">✓ Mastered when this run ends</div>`;
  const prog = f.runs > 1 ? ` · ${have + (now ? 1 : 0)}/${f.runs} runs` : '';
  return `<div class="mast" title="${tip}">☆ Not mastered (reach Lv ${f.level}${prog})</div>`;
}
// level-up card badge for an item that fits the hero's archetype
function archBadge(d) {
  if (!d || !archLeans(d) || !G.arch.name) return '';
  return `<div class="mast arch" style="--a:${G.char.color}" title="${G.char.name}'s archetype bonuses apply to this item">◆ ${G.arch.name}</div>`;
}
function describeChoice(o) {
  if (o.type === 'new') { const d = o.def, effs = effectsOf(d), L = arrivalLevel();
    return { icon: d.icon, title: d.name, tag: 'NEW' + (L > 1 ? ' · Lv ' + L : ''), slot: d.slot, effs, mast: archBadge(d) + masteryBadge(d, 0),
      text: isPassive(d) ? `Passive: ${statText(d.passive)} per level. No attack; its two effects let it fuse with items of either.` : d.pattern }; }
  if (o.type === 'up') { const i = o.inst, d = i.def, effs = instEffects(i);
    return { icon: d.icon, title: itemName(i), tag: 'Lv ' + i.level + ' → ' + (i.level + 1), slot: d.slot, effs, mast: masteryBadge(d, i.tier),
      text: (isPassive(d) && !Object.keys(i.stats).length ? '' : isPassive(d) ? `Now ${statText(instStats(i))}; next level ${statText(i.stats, (i.level + 1) * tierOf(i).statMul)}.` : `+30% damage, faster, more projectiles. Adds to ${EFFECTS[d.effect].name} on every bullet.`) +
        (i.level + 1 === MAX_LEVEL && !i.tier && !fuseUnlocked(SAVE, d) ? ` Not mastered yet: only a mastered item can absorb it.` : '') }; }
  if (o.type === 'fuse' && o.nexus) { const nx = o.nexus, effs = [...new Set(o.group.flatMap(instEffects))];
    return { icon: nx.icon, title: nx.name, tag: `✴ ${tierName(o.tier).toUpperCase()} NEXUS`, slot: null, effs, fuse: true, tier: o.tier, nexus: true, text: nexusCardText(nx) }; }
  if (o.type === 'fuse') { const effs = [...new Set(o.group.flatMap(instEffects))], T = o.tier;
    return { icon: '✦', title: o.group.map(i => i.def.name).join(' + '), tag: (T > 1 ? tierName(T).toUpperCase() + ' ' : '') + 'FUSION', slot: null, effs, fuse: true, tier: T,
      text: (o.keeps.length > 1 ? 'You choose which one remains. ' : `${o.keeps[0].def.name} remains${o.keeps.length < o.group.length && !o.group.every(isPassiveInst) ? ' (the only mastered one)' : ''}. `) + `It keeps all it has, takes 50% of the others' damage and stats, carries every effect, and their attacks chain off its own. ${tierLine(T)}. Frees ${o.group.length - 1} socket${o.group.length > 2 ? 's' : ''}.` + nexusHint(o.group, T) }; }
  if (o.type === 'keep') { const nx = nexusRecipe([o.s, ...o.others], o.tier, o.s);
    if (nx) return { icon: nx.icon, title: 'Keep ' + itemName(o.s), tag: `→ ✴ ${nx.name}`, slot: o.s.def.slot, effs: [...new Set([o.s, ...o.others].flatMap(instEffects))], fuse: true, tier: o.tier, nexus: true, text: nexusCardText(nx) }; }
  if (o.type === 'keep') { const { s, others } = o, T = o.tier, effs = [...new Set([s, ...others].flatMap(instEffects))], sh = commonEffects([s, ...others]);
    const pre = FUSE_PREFIX[s.fuseEff || (sh.includes(s.def.effect) ? s.def.effect : sh[0])], nm = (T > 1 ? tierName(T) + ' ' : '') + pre + ' ' + s.def.name;
    const after = virtualInv(o).hit[1], P = G.player, newLinks = after.links.slice((s.links || []).length);
    return { icon: s.def.icon, title: 'Keep ' + itemName(s), tag: '→ ' + nm, slot: s.def.slot, effs, fuse: true, tier: T, chain: chainHtml(newLinks, P.might, s.def),
      text: `${others.map(x => x.def.icon + ' ' + itemName(x)).join(', ')} ${others.length > 1 ? 'are' : 'is'} absorbed into it. ` + (isPassive(s.def) ? `Passive stats: ${statText(instStats(s))} now, ${statText(instStats(after))} after (and more per level).` : `Hits for ${Math.round(hitDmg(after, P))} (now ${Math.round(hitDmg(s, P))}). Its bullets carry ${effNames(effs)}.`) + ` ${tierLine(T)}. Starts at level ${arrivalLevel()}.` + (newLinks.length ? ' Chains:' : '') }; }
  if (o.type === 'back') return { icon: '↩', title: 'Back', tag: 'CHOICES', text: 'Go back to the level-up cards.' };
  if (o.type === 'heal') return { icon: '❤️', title: 'Restore', tag: 'HEAL', text: 'Recover 40 HP.' };
  return { icon: '●', title: 'Void Gold', tag: 'GOLD', text: '+25 gold.' };
}
// Level-up: clicking a card (or pressing 1-4) only selects it and shows its stat changes; Confirm takes it.
// So a key pressed while moving can never pick something unseen. luSel: index of the selected card, 'skip', or null.
let levelChoices = null, luBack = null, luMode = 'level', luSel = null;
function openLevelUp() {
  G.paused = true; luMode = 'level'; luBack = null; luSel = null; levelChoices = buildChoices(); renderLevelUp(); showScreen('levelup');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}
// a fusion from a chest: the player still picks which item stays
function openFuse(f) {
  if (!f.group.every(i => G.inv.includes(i) && fusable(i) && i.tier === f.tier - 1) || !commonEffects(f.group).length) return;
  f.keeps = keepersOf(f.group); if (!f.keeps.length) return;
  G.paused = true; luMode = 'chest'; luBack = null; luSel = null; levelChoices = keepChoices(f, false); renderLevelUp(); showScreen('levelup');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}
function renderLevelUp() {
  const wrap = $('#luCards'); wrap.innerHTML = '';
  levelChoices.forEach((o, idx) => {
    const c = describeChoice(o); const E = c.effs ? EFFECTS[c.effs[0]] : null;
    const el = document.createElement('button'); el.className = 'card lu' + (c.fuse ? ' fuse' : '') + (c.tier > 1 ? ' t' + c.tier : '') + (c.nexus ? ' nexus' : '') + (luSel === idx ? ' sel' : ''); if (E) el.style.setProperty('--c', E.color);
    const tags = (c.slot ? `<span>${SLOTS[c.slot].icon} ${SLOTS[c.slot].name}</span>` : '') + (c.effs ? c.effs.map(k => `<span style="color:${EFFECTS[k].color}">${EFFECTS[k].icon} ${EFFECTS[k].name}</span>`).join('') : '');
    el.innerHTML = `<div class="key">${idx + 1}</div><div class="ico">${c.icon}</div><div class="tag">${c.tag}</div><b>${c.title}</b>${tags ? `<div class="tags">${tags}</div>` : ''}${c.mast || ''}<small>${c.text}</small>${c.chain ? `<div class="chain">${c.chain}</div>` : ''}`;
    el.onclick = () => selectLevel(idx);
    wrap.appendChild(el);
  });
  const picking = levelChoices.some(o => o.type === 'keep');
  const cur = luSel === 'skip' ? { type: 'skip' } : luSel !== null ? levelChoices[luSel] : null;
  $('#luConfirm').disabled = !cur;
  $('#luConfirm').textContent = !cur ? 'Pick an option first' : cur.type === 'skip' ? 'Confirm: skip' : cur.type === 'fuse' && cur.keeps.length > 1 ? 'Confirm: choose what remains' : 'Confirm: ' + describeChoice(cur).title;
  $('#skip').classList.toggle('sel', luSel === 'skip');
  $('#luStats').innerHTML = statsPanel(cur, true);
  $('#luTitle').textContent = picking ? (luMode === 'chest' ? 'Chest fusion! Which item remains?' : 'Fusion: which item remains?') : 'Level ' + G.level + '!';
  const rr = $('#reroll'); rr.textContent = '🎲 Reroll (' + G.player.rerolls + ')'; rr.disabled = G.player.rerolls <= 0; rr.style.visibility = picking ? 'hidden' : '';
  $('#skip').style.visibility = picking || luMode === 'chest' ? 'hidden' : '';
}
function selectLevel(idx) {
  const o = levelChoices && levelChoices[idx]; if (!o) return;
  if (o.type === 'back') { levelChoices = luBack; luBack = null; luSel = null; renderLevelUp(); return; } // going back takes nothing, so no confirm
  luSel = idx; renderLevelUp();
}
function confirmLevel() {
  if (!levelChoices || luSel === null) return;
  if (luSel === 'skip') { skipLevel(); return; }
  chooseLevel(luSel);
}
function chooseLevel(idx) {
  const o = levelChoices && levelChoices[idx]; if (!o) return;
  if (o.type === 'fuse' && o.keeps.length > 1) { luBack = levelChoices; levelChoices = keepChoices(o, true); luSel = null; renderLevelUp(); return; }
  if (o.type === 'back') { levelChoices = luBack; luBack = null; luSel = null; renderLevelUp(); return; }
  applyChoice(o); levelChoices = null; luBack = null; luSel = null; showScreen(null); G.paused = false;
}
// skipping keeps sockets free for the items a fusion needs
function skipLevel() {
  if (!levelChoices || levelChoices.some(o => o.type === 'keep')) return;
  heal(15); G.gold += 10 * STAGE().gold; levelChoices = null; luBack = null; luSel = null; showScreen(null); G.paused = false;
}

// ---------------- stats panel (level-up preview and pause menu) ----------------
// The inventory as it would be after a level-up choice, as light copies, so nothing in the run changes.
function virtualInv(o) {
  const cp = i => ({ def: i.def, level: i.level, tier: i.tier || 0, base: i.base, stats: Object.assign({}, i.stats), riders: i.riders.slice(), carry: i.carry || 0, flat: Object.assign({}, i.flat || {}), links: (i.links || []).slice(), gone: (i.gone || []).slice(), src: i });
  let inv = activeInsts().map(cp);
  const find = i => inv.find(x => x.src === i);
  if (!o) return { inv, hit: null };
  if (o.type === 'new') { const x = { def: o.def, level: arrivalLevel(), tier: 0, base: o.def.dmg || 0, stats: Object.assign({}, o.def.passive || {}), riders: [], carry: 0, flat: {}, links: [] }; inv.push(x); return { inv, hit: [null, x] }; }
  if (o.type === 'up') { const x = find(o.inst); x.level = Math.min(MAX_LEVEL, x.level + 1); for (const p of o.inst.parts || []) find(p).level = x.level; return { inv, hit: [o.inst, x] }; }
  if (o.type === 'fuse' || o.type === 'keep') {
    const keep = o.type === 'keep' ? o.s : o.keeps[0], others = o.type === 'keep' ? o.others : o.group.filter(x => x !== keep), k = find(keep);
    if (nexusRecipe([keep, ...others], keep.tier + 1, keep)) { // a Nexus: nothing is halved, every part goes up a tier
      const all = [k, ...others.map(find)], effs = [...new Set(all.flatMap(instEffects))];
      for (const x of all) { x.tier++; x.level = arrivalLevel(); x.riders = effs.filter(e => !effectsOf(x.def).includes(e)); }
      return { inv, hit: [keep, k] };
    }
    absorb(k, others.map(find), arrivalLevel());
    inv = inv.filter(x => !others.includes(x.src));
    return { inv, hit: [keep, k] };
  }
  return { inv, hit: null };
}
// player stats and effect pool of an inventory, the same sums recomputePool and recomputeStats make
function statsOf(inv) {
  const m = Object.assign({}, G.player.baseMods);
  for (const i of inv) for (const [s, v] of Object.entries(instStats(i))) m[s] = (m[s] || 0) + v;
  const P = {}; applyStats(P, m);
  const pool = {}; for (const k of EFFECT_KEYS) pool[k] = 0;
  for (const i of inv) { if (isPassive(i.def)) continue; const T = tierOf(i); for (const k of effectsOf(i.def)) if (effOpen(k)) pool[k] += i.level * T.pool; }
  for (const k of EFFECT_KEYS) pool[k] = Math.round(pool[k]);
  return { P, pool };
}
const pctOf = x => (x >= 0 ? '+' : '−') + Math.round(Math.abs(x) * 100) + '%';
// [label, value from player stats, format]; bigger is always better
const STAT_ROWS = [
  ['Max HP', P => P.maxHp, v => String(Math.round(v))], ['Damage', P => P.might - 1, pctOf], ['Armor', P => P.armor, v => String(+v.toFixed(1))],
  ['Recovery', P => P.regen, v => +v.toFixed(2) + ' HP/s'], ['Move speed', P => P.speed / 200 - 1, pctOf], ['Area', P => P.area - 1, pctOf],
  ['Cooldowns', P => 1 - P.cdMul, v => (v > 0 ? '−' : v < 0 ? '+' : '') + Math.round(Math.abs(v) * 100) + '%'], ['Projectile speed', P => P.projSpd - 1, pctOf],
  ['Duration', P => P.duration - 1, pctOf], ['Projectiles', P => P.amount, v => '+' + v], ['Crit chance', P => P.critBonus, pctOf], ['Luck', P => P.luck, pctOf],
  ['Pickup range', P => P.magnet / 90 - 1, pctOf], ['XP', P => P.growth - 1, pctOf], ['Gold', P => P.greed - 1, pctOf],
];
// damage of one hit of an attacking item (before crits and effects)
const hitDmg = (i, P) => (i && !isPassive(i.def) ? itemPower(i) * P.might * archSlotMul(i.def) : 0);
// The stats panel. o: a level-up choice to preview (null = just the current stats). With a choice, changed rows show now → after.
function statsPanel(o, preview) {
  const now = statsOf(G.inv), P = G.player;
  const v = o && o.type !== 'skip' && o.type !== 'heal' && o.type !== 'gold' && o.type !== 'back' ? virtualInv(o) : null, aft = v ? statsOf(v.inv) : null;
  const heal = o && o.type === 'heal' ? 40 : o && o.type === 'skip' ? 15 : 0;
  const cell = (label, a, b, fmt, cls = '') => {
    const ch = b !== null && b !== undefined && Math.abs(b - a) > 1e-6;
    return `<div class="st${ch ? (b > a ? ' up' : ' down') : ''}${cls}"><span>${label}</span><b>${fmt(a)}${ch ? ` <i>→ ${fmt(b)}</i>` : ''}</b></div>`;
  };
  const rows = [];
  // HP now: a bigger max HP adds the difference (as applyStats does), a heal adds its amount
  const hpNow = Math.ceil(P.hp), hpAft = aft ? Math.min(aft.P.maxHp, hpNow + Math.max(0, aft.P.maxHp - P.maxHp)) : Math.min(P.maxHp, hpNow + heal);
  rows.push(cell('HP', hpNow, hpAft, x => String(Math.round(x))));
  for (const [label, f, fmt] of STAT_ROWS) { const a = f(now.P), b = aft ? f(aft.P) : null; if (a || b || label === 'Damage') rows.push(cell(label, a, b, fmt)); }
  if (v && v.hit) { const [a, b] = v.hit; if (!isPassive(b.def)) rows.push(cell(`${b.def.icon} ${b.def.name} hit`, hitDmg(a, now.P), hitDmg(b, aft.P), x => (x ? String(Math.round(x)) : '—'), ' wide')); }
  const pool = EFFECT_KEYS.filter(k => now.pool[k] || (aft && aft.pool[k])).map(k => cell(`${EFFECTS[k].icon} ${EFFECTS[k].name}`, now.pool[k], aft ? aft.pool[k] : null, x => '×' + x)).join('');
  const head = preview ? (o ? (o.type === 'skip' ? 'If you skip: heal 15, +gold' : o.type === 'fuse' && o.keeps.length > 1 ? `Stats if ${o.keeps[0].def.name} remains` : 'Stats with this choice') : 'Your stats (pick an option to see what changes)') : 'Your stats';
  return `<div class="statsHead">${head}</div><div class="statGrid">${rows.join('')}</div><div class="statsHead">Effect pool <small>(on every bullet)</small></div><div class="statGrid">${pool || '<div class="st"><span>none yet</span></div>'}</div>` + archPanel(now.pool, aft && aft.pool, v ? v.inv : null);
}
// The archetype part of the stats panel: each bonus, and whether each combo is on (both effects in the pool = every
// bullet; both on one item, from fusion riders = that item's bullets). pool2/inv2: the same after a previewed choice.
function archPanel(pool, pool2, inv2) {
  const A = G.arch; if (!A || !A.name) return '';
  const st = (p, inv) => c => (p[c[0]] && p[c[1]] ? 2 : inv.some(i => !isPassive(i.def) && instEffects(i).includes(c[0]) && instEffects(i).includes(c[1]) && effOpen(c[0]) && effOpen(c[1])) ? 1 : 0);
  const word = n => ['off', 'some items', 'all bullets'][n];
  const rows = [
    ...Object.entries(A.eff).map(([k, x]) => `<div class="st"><span>${EFFECTS[k].icon} ${EFFECTS[k].name} strength</span><b>+${Math.round(x * 100)}%</b></div>`),
    ...Object.entries(A.slot).map(([k, x]) => `<div class="st"><span>${SLOTS[k].icon} ${SLOTS[k].name} damage</span><b>+${Math.round(x * 100)}%</b></div>`),
    ...A.combo.map(c => { const a = st(pool, G.inv)(c), b = pool2 ? st(pool2, inv2)(c) : a;
      return `<div class="st wide${b !== a ? (b > a ? ' up' : ' down') : ''}"><span>${EFFECTS[c[0]].icon}${EFFECTS[c[1]].icon} ${EFFECTS[c[0]].name} + ${EFFECTS[c[1]].name}: +${Math.round(c[2] * 100)}% damage</span><b>${word(a)}${b !== a ? ` <i>→ ${word(b)}</i>` : ''}</b></div>`; }),
  ];
  return `<div class="statsHead">◆ ${A.name} <small>(${G.char.name}'s archetype)</small></div><div class="statGrid">${rows.join('')}</div>`;
}
const fusedOf = i => (i.gone.length ? ` <small>+ ${i.gone.length} fused in</small>` : '');
function showGameOver(won, earned, bonus, fresh) {
  $('#goTitle').textContent = won ? `LEVEL ${G.stage} BEATEN` : 'YOU FELL';
  $('#goTitle').className = won ? 'win' : 'lose';
  const inv = G.inv.map(i => `<span class="chip" style="--c:${i.tier ? TIER_COLORS[i.tier] : EFFECTS[i.def.effect].color}">${i.nexus ? (nexusDef(i.nexus) || {}).icon || i.def.icon : i.def.icon} ${itemName(i)} <b>${i.level}</b>${fusedOf(i)}</span>`).join('');
  $('#goBody').innerHTML = `<div class="row"><div><small>Time</small><b>${fmtTime(G.time)}</b></div><div><small>Level ${G.stage}</small><b>${STAGE().name}</b></div><div><small>Character level</small><b>${G.level}</b></div><div><small>Kills</small><b>${G.kills}</b></div><div><small>Gold earned</small><b class="gold">● ${earned}</b></div></div>
    <small>Includes ● ${bonus} survival bonus.</small><div class="chips">${inv}</div>` + (fresh.length ? `<div class="unlocks"><b>Unlocked!</b><br>${fresh.join('<br>')}</div>` : '');
  showScreen('gameover');
}
function archCard(c) {
  const A = archOf(c), L = archLines(c); if (!A.name && !L.length) return '';
  return `<div class="archBox"><b>◆ ${A.name || 'Archetype'}</b>${L.map(x => `<span>${x}</span>`).join('')}</div>`;
}
function togglePause() {
  if (!G || G.sandbox || G.over || currentScreen === 'levelup' || currentScreen === 'chest') return;
  if (G.paused) { G.paused = false; showScreen(null); }
  else { G.paused = true; renderPause(); showScreen('pause'); }
}
// game speeds the pause menu cycles through: OPTIONS.speed.choices in items.js, editable in the admin panel
const speedChoices = () => { const c = ((OPTIONS.speed || {}).choices || []).filter(x => x > 0).sort((a, b) => a - b); return c.length ? c : [1]; };
function gameSpeed() { const v = SAVE.settings.speed, c = speedChoices(); return c.includes(v) ? v : c.includes(1) ? 1 : c[0]; }
function cycleSpeed() { const c = speedChoices(); SAVE.settings.speed = c[(c.indexOf(gameSpeed()) + 1) % c.length]; writeSave(); }
// one held item, for the pause screen: tier, effects its bullets carry, passive stats, what was fused into it
function invChip(i) {
  const T = i.tier || 0, next = T < TIER_KEYS.length - 1 ? FUSION[TIER_KEYS[T + 1]] : null, st = [i, ...(i.parts || [])].map(instStats).reduce((a, x) => { for (const [k, v] of Object.entries(x)) a[k] = (a[k] || 0) + v; return a; }, {});
  const fuseNote = i.level < MAX_LEVEL || !next ? '' : !T && !fuseUnlocked(SAVE, i.def) ? `Not mastered (${fuseLockText(i.def)}): a mastered item can absorb it, but it can't remain.` : !tierUnlocked(SAVE, TIER_KEYS[T + 1]) ? `${next.name} fusion locked: ${lockLabel(next.lock)}.` : !histMet(SAVE, i.def.id, T + 1) ? `${next.name} fusion locked for ${i.def.name}: ${histText(T + 1)} first (${histProgress(SAVE, i.def.id, T + 1).join('/')}). See its Codex page.` : `Ready: ${next.need} level 5 ${tierName(T).toLowerCase()} items sharing an effect make a ${next.name} item.`;
  return `<div class="chip" style="--c:${T ? TIER_COLORS[T] : EFFECTS[i.def.effect].color}">${i.def.icon} ${itemName(i)} <b>Lv${i.level}</b>${T ? ` <b style="color:${TIER_COLORS[T]}">${tierName(T)}</b>` : ''}${isPassive(i.def) ? ' <b style="color:#c9f">Passive</b>' : ''} <span style="font-size:11px">${effNames(instEffects(i))}</span>` +
    `<small>${isPassive(i.def) ? 'Passive: ' + (statText(st) || 'no stats') : i.def.pattern}</small>` + (isPassive(i.def) ? '' : `<small>Hits as ${effNames(instTypes(i))}</small>`) + (i.riders.length && !isPassive(i.def) ? `<small>Its bullets also carry ${effNames(i.riders)}.</small>` : '') +
    (!isPassive(i.def) && Object.keys(st).length ? `<small>Stats from fused passives: ${statText(st)}.</small>` : '') + (i.gone.length ? `<small>Made from ${i.gone.length + 1} items: ${[i.def, ...i.gone].map(d => d.icon).join('')}</small>` : '') + ((i.links || []).length ? `<div class="chain">${chainHtml(i.links, G.player.might, i.def)}</div>` : '') + (i.nexus ? nexusPauseLine(i) : fuseNote ? `<small>${fuseNote}</small>` : '') + '</div>';
}
function renderPause() {
  const inv = G.inv.map(invChip).join('');
  const pas = {}; for (const i of activeInsts()) for (const [k, v] of Object.entries(instStats(i))) pas[k] = (pas[k] || 0) + v;
  $('#pauseBody').innerHTML = `<p class="center" style="color:${STAGE().color}">Level ${G.stage}: ${STAGE().name}</p>` +
    (G.world ? `<div class="pauseMap"><canvas id="pauseMap"></canvas><small>${mapFound(SAVE, G.stage) ? '🗺️ Map found: zones in this level are marked.' : '🗺️ The Map of this level is somewhere out there (follow the edge arrow). Until you find it, zones only show once you have seen them.'} The map wraps: walk off one edge and you come back at the other.</small></div>` : '') + `<div class="stats-box">${statsPanel(null, false)}</div><div class="chips col">${inv}</div>` +
    (Object.keys(pas).length ? `<p><b>From passive stats</b>: ${statText(pas)}</p>` : '');
  drawPauseMap($('#pauseMap'));
  $('#numToggle').textContent = 'Damage numbers: ' + (SAVE.settings.numbers ? 'on' : 'off');
  $('#speedToggle').innerHTML = 'Game speed: <b>' + gameSpeed() + 'x</b>';
  $('#speedToggle').title = 'Tap to cycle ' + speedChoices().map(x => x + 'x').join(', ');
}

// ---------------- input ----------------
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'Escape' && detailItem) { closeItemDetail(); return; }
  if (e.code === 'Escape' && currentScreen === 'codex') { codexBack(); return; }
  if (!G || G.over) return;
  if (currentScreen === 'codex') return;
  if (currentScreen === 'chest') { if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space' || e.code === 'Escape') { e.preventDefault(); closeChest(); } return; }
  // 1-4 only select; Enter (or the Confirm button) takes it. Letter keys do nothing here, so WASD can't pick or skip.
  if (currentScreen === 'levelup') { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') e.preventDefault(); const n = parseInt(e.key, 10); if (n >= 1 && n <= 4) selectLevel(n - 1); if (e.code === 'Enter' || e.code === 'NumpadEnter') confirmLevel(); return; }
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  if ((e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !G.paused) dash();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (G && !G.sandbox && !G.paused && !G.over) togglePause(); });
canvas.addEventListener('touchstart', e => { if (!G || G.paused) return; e.preventDefault(); const t = e.changedTouches[0]; if (touch.active) { dash(); return; } touch.active = true; touch.id = t.identifier; touch.ox = touch.x = t.clientX; touch.oy = touch.y = t.clientY; }, { passive: false });
canvas.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === touch.id) { touch.x = t.clientX; touch.y = t.clientY; } }, { passive: false });
canvas.addEventListener('touchend', e => { for (const t of e.changedTouches) if (t.identifier === touch.id) touch.active = false; });

// buttons
$('#btnPlay').onclick = () => showScreen('chars');
$('#btnForge').onclick = () => showScreen('forge');
$('#btnCodex').onclick = () => showScreen('codex');
$('#btnAch').onclick = () => showScreen('achievements');
$('#btnLab').onclick = () => { SB.lab = true; labStart(); };
$('#btnLabBack').onclick = labExit;
document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => (b.closest('#codex') ? codexBack() : showScreen('menu')));
$('#btnPauseCodex').onclick = () => { if (G && G.paused) { codexFilter = 'run'; showScreen('codex'); } };
$('#btnStart').onclick = () => { const c = CHARACTERS.find(x => x.id === selectedChar); if (c && charPlayable(SAVE, c)) newRun(c.id, selectedStage); else toast('Pick a hero you have unlocked'); };
$('#reroll').onclick = () => { if (G.player.rerolls <= 0 || (levelChoices || []).some(o => o.type === 'keep')) return; G.player.rerolls--; luSel = null; levelChoices = buildChoices(); renderLevelUp(); };
$('#skip').onclick = () => { if (!levelChoices || levelChoices.some(o => o.type === 'keep')) return; luSel = 'skip'; renderLevelUp(); };
$('#luConfirm').onclick = confirmLevel;
$('#chestTake').onclick = closeChest;
$('#btnResume').onclick = togglePause;
$('#btnQuit').onclick = () => { G.paused = false; endRun(false); };
$('#speedToggle').onclick = () => { cycleSpeed(); renderPause(); };
$('#pauseBtn').onclick = e => { e.currentTarget.blur(); togglePause(); };
$('#numToggle').onclick = () => { SAVE.settings.numbers = !SAVE.settings.numbers; writeSave(); renderPause(); };
$('#btnAgain').onclick = () => { const id = G.char.id, st = G.stage; newRun(id, st); };
$('#btnMenu').onclick = () => { G = null; showScreen('menu'); };
let resetArmed = 0;
$('#btnReset').onclick = () => {
  const b = $('#btnReset');
  if (Date.now() - resetArmed < 4000) { const owner = SAVE.owner; SAVE = defaultSave(); if (owner) SAVE.owner = owner; writeSave(); renderMenu(); b.textContent = 'Reset save'; resetArmed = 0; toast('Progress erased'); return; }
  resetArmed = Date.now(); b.textContent = 'Click again to erase all progress'; setTimeout(() => { if (resetArmed && Date.now() - resetArmed >= 4000) b.textContent = 'Reset save'; }, 4100);
};

// ---------------- admin test canvas (index.html?sandbox) ----------------
// admin.html embeds the game in an iframe in this mode to preview one item against training targets.
// Nothing is saved, nothing drops, the player cannot be hurt. The admin page drives it with postMessage.
// fuse: the items fused into it, one entry per partner: 'cinder_ring', or 'cinder_ring>frost_halo+arc_halo' for a partner that
// itself had items fused into it (Super and Mega); tier: 0 = plain item, 1 Fused, 2 Super, 3 Mega
const SB = { item: ITEMS[0].id, level: 1, fuse: [], tier: 0, layout: 'ring', tough: true, move: false };
const SANDBOX_TYPES = {
  target: { name: 'Target', hp: 60, spd: 0, r: 13, dmg: 0, xp: 0, color: '#77729a', shape: 'circle', mass: 3 },
  walker: { name: 'Walker', hp: 60, spd: 55, r: 12, dmg: 0, xp: 0, color: '#8a6fd0', shape: 'tri' },
};
function sandboxSlots() {
  const out = [];
  if (SB.layout === 'ring') for (let k = 0; k < 10; k++) out.push({ x: Math.cos(k * TAU / 10) * 190, y: Math.sin(k * TAU / 10) * 190 });
  else if (SB.layout === 'line') for (let k = 0; k < 7; k++) out.push({ x: 110 + k * 50, y: 0 });
  else if (SB.layout === 'scatter') for (let k = 0; k < 14; k++) { const a = k * 2.399, r = 110 + ((k * 73) % 270); out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r }); }
  else if (SB.layout === 'swarm') for (let k = 0; k < 16; k++) out.push({ x: Math.cos(k * TAU / 16) * 380, y: Math.sin(k * TAU / 16) * 380, walk: true });
  else if (String(SB.layout).startsWith('foe:')) { // a mastered Codex enemy (bestiary.js), with its real moves and resistances
    const id = SB.layout.slice(4), boss = isBossId(id), n = boss ? 1 : 8;
    if (foeDef(id)) for (let k = 0; k < n; k++) out.push({ x: Math.cos(k * TAU / n) * (boss ? 300 : 380), y: Math.sin(k * TAU / n) * (boss ? 300 : 380), walk: true, type: id, boss });
  }
  return out;
}
function sandboxStart() {
  const def = ITEM[SB.item] || ITEMS[0];
  const ch = Object.assign({}, CHARACTERS.find(c => c.weapon === def.id) || CHARACTERS[0], { mods: {}, arch: null }); // neutral stats, no archetype
  freshRun(ch);
  Object.assign(G, { sandbox: true, lab: !!SB.lab, seen: new Set(), sbTargets: [], sbWait: [], sbLog: [], sbDps: 0, sbPost: 0 });
  const inst = addItem(def);
  if (SB.tier > 0) synthFusion(inst, sbPartners(def), clamp(SB.tier | 0, 1, TIER_KEYS.length - 1));
  inst.level = clamp(SB.level | 0, 1, MAX_LEVEL); recomputePool(); rebuild(inst);
  showScreen(G.lab ? 'lab' : null);
}
// SB.fuse → [{ def, sub: [defs] }]
const parsePartner = x => { const [a, b] = String(x).split('>'); return { def: ITEM[a], sub: (b || '').split('+').map(id => ITEM[id]).filter(Boolean) }; };
const sbPartners = def => (Array.isArray(SB.fuse) ? SB.fuse : SB.fuse ? [SB.fuse] : []).map(parsePartner).filter(p => p.def && p.def !== def);
// What a tier-T item made from `def` looks like, for the test canvases and the admin's numbers, built with the real fusion
// maths (absorb in chain.js) from level 5 items: partners is a list of { def, sub }, the items fused straight into it at
// tier T, each one made at tier T-1 from its own `sub` items. Missing items are stand-ins as strong as the one they fill in
// for, with no chain of their own (a plain copy of the keeper, for example).
function synthFusion(inst, partners, T) {
  const ghost = (like, t) => Object.assign(synthItem(like.def, [], t), { def: Object.assign({}, like.def, { ghostOf: like.def.id }) });
  function synthItem(def, parts, t) {
    const x = newInst(def, MAX_LEVEL); if (!t) return x;
    const keep = t === 1 ? x : synthItem(def, [], t - 1);
    const need = Math.max(1, FUSION[TIER_KEYS[t]].need - 1), others = parts.slice(0, need).map(p => synthItem(p.def, p.sub.map(d => ({ def: d, sub: [] })), t - 1));
    while (others.length < need) others.push(ghost(keep, t - 1));
    absorb(keep, others, MAX_LEVEL);
    keep.links = keep.links.filter(l => !l.def.ghostOf); keep.gone = keep.gone.filter(d => !d.ghostOf);
    return keep;
  }
  const made = synthItem(inst.def, partners, T);
  for (const k of ['base', 'stats', 'carry', 'flat', 'links', 'tier', 'gone']) inst[k] = made[k];
  inst.riders = []; for (const d of made.gone) for (const k of effectsOf(d)) if (!effectsOf(inst.def).includes(k) && !inst.riders.includes(k)) inst.riders.push(k);
  const first = partners[0] && partners[0].def, sh = first ? effectsOf(inst.def).filter(k => effectsOf(first).includes(k)) : [];
  inst.fuseEff = sh[0] || inst.def.effect;
  return inst;
}
function sandboxTick(dt) {
  const slots = sandboxSlots();
  for (let k = 0; k < slots.length; k++) {
    const s = slots[k], e = G.sbTargets[k];
    if (e && !e.dead) { if (!s.walk) { const f = Math.min(1, dt * 1.5); e.x = lerp(e.x, s.x, f); e.y = lerp(e.y, s.y, f); } continue; }
    if (e) { G.sbTargets[k] = null; G.sbWait[k] = 0.8; continue; }
    if ((G.sbWait[k] = (G.sbWait[k] || 0) - dt) > 0) continue;
    const n = spawnEnemy(s.type || (s.walk ? 'walker' : 'target'), s.x, s.y, s.boss ? { boss: true } : {});
    if (SB.tough) n.hp = n.maxHp = 1e9;
    G.sbTargets[k] = n;
  }
  // rolling 5 s damage per second, and the bullet shapes this item uses, reported to the admin page
  G.sbPost -= dt; if (G.sbPost > 0) return; G.sbPost = 0.5;
  G.sbLog.push([G.time, G.stats.damage]); while (G.sbLog.length > 11) G.sbLog.shift();
  const [t0, d0] = G.sbLog[0]; G.sbDps = G.time > t0 ? (G.stats.damage - d0) / (G.time - t0) : 0;
  if (G.lab) labReadout();
  if (SANDBOX && window.parent !== window) window.parent.postMessage({ vl: 'sandbox-stats', dps: G.sbDps, shapes: [...G.seen], bullets: G.bullets.length, hit: G.inv[0] ? hitDmg(G.inv[0], G.player) : 0, chain: G.inv[0] ? chainLines(G.inv[0].links, 1, G.inv[0].def) : [] }, location.origin);
}
function sandboxTrigger(name) {
  const live = G.enemies.filter(e => !e.dead && !e.boss), P = G.player;
  if (name === 'kill') { const e = pick(live); if (e) killEnemy(e); }
  else if (name === 'crit') { const e = pick(live); if (e) trigger('crit', e); }
  else if (name === 'hurt') { fxText(P.x, P.y - 18, '-10', '#ff3b5c', 14); P.hurtFlash = 0.2; G.shake = 4; trigger('hurt', 10); }
  else if (name === 'levelup' || name === 'pickup') trigger(name, { x: P.x, y: P.y });
  else if (name === 'dash') { P.dashCd = 0; dash(); }
}
function drawSandboxHUD() {
  const inst = G.inv[0]; if (!inst) return;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = 'bold 13px system-ui,sans-serif'; ctx.fillStyle = '#fff';
  ctx.fillText(`${inst.def.icon} ${itemName(inst)} · Lv ${inst.level}` + (inst.tier ? ` · ${tierName(inst.tier)} tier, base ${Math.round(baseDmg(inst))}` : '') + ` · ${instEffects(inst).map(k => EFFECTS[k].name).join(' + ')}`, 10, 10);
  ctx.font = '12px system-ui,sans-serif'; ctx.fillStyle = '#9a93c0';
  ctx.fillText(isPassive(inst.def) ? `Passive, no attack: ${statText(instStats(inst))}` : `${Math.round(G.sbDps)} dmg/s · ${G.bullets.length} bullets` + (Object.keys(inst.stats).length ? ` · stats ${statText(instStats(inst))}` : ''), 10, 28);
}
function sandboxBoot() {
  SAVE = defaultSave(); G = null;
  window.addEventListener('message', e => {
    const m = e.data; if (e.origin !== location.origin || !m || m.vl !== 'sandbox') return;
    if (m.overrides && window.VOIDLIGHT_CONTENT) { VOIDLIGHT_CONTENT.apply(m.overrides); if (G) for (const i of G.inv) rebuild(i); }
    let restart = !!m.restart || !G;
    if (m.config) { for (const k of ['item', 'level', 'fuse', 'tier', 'layout', 'tough']) if (k in m.config && JSON.stringify(m.config[k]) !== JSON.stringify(SB[k])) restart = true; Object.assign(SB, m.config); }
    if ('numbers' in m) SAVE.settings.numbers = !!m.numbers;
    if (restart) sandboxStart();
    if (m.trigger && G) sandboxTrigger(m.trigger);
  });
  sandboxStart();
  if (window.parent !== window) window.parent.postMessage({ vl: 'sandbox-ready' }, location.origin);
}

// ---------------- Fusion Lab (players) ----------------
// A practice canvas from the main menu: pick an item you have unlocked, a fusion tier you have opened and the items to fuse
// into it, and watch the result, chains and all, against training targets. It runs on the admin test canvas engine
// (SB, sandboxStart) in this page, and nothing in it is saved or rewarded.
const LAB = { item: null, tier: 1, fuse: [], level: 5, layout: 'ring' };
const labOwned = d => !d.disabled && (itemUnlocked(SAVE, d) || CHARACTERS.some(c => c.weapon === d.id && charPlayable(SAVE, c)));
const labKeepers = () => ITEMS.filter(d => labOwned(d) && !isPassive(d));
// items that can fuse into `id` (they share an effect; a passive only takes passives), never the lab's own item twice
const labPartners = id => { const me = ITEM[id], mine = effectsOf(me); return ITEMS.filter(d => d.id !== id && d.id !== LAB.item && labOwned(d) && effectsOf(d).some(k => mine.includes(k)) && (!isPassive(me) || isPassive(d))); };
// tiers this save can try with this item: plain always, Fused once it is mastered, Super and Mega once they are unlocked
const labTiers = id => TIER_KEYS.map((k, t) => t === 0 || (fuseUnlocked(SAVE, ITEM[id]) && (t === 1 || tierUnlocked(SAVE, k))));
function labStart() {
  const keep = labKeepers(); if (!keep.length) return;
  if (!LAB.item || !keep.some(d => d.id === LAB.item)) LAB.item = (keep.find(d => fuseUnlocked(SAVE, d)) || keep[0]).id;
  const ok = labTiers(LAB.item); if (!ok[LAB.tier]) LAB.tier = ok.lastIndexOf(true) >= 1 ? 1 : 0;
  const def = ITEM[LAB.item];
  Object.assign(SB, { lab: true, item: LAB.item, level: LAB.level, tier: LAB.tier, fuse: LAB.tier ? LAB.fuse : [], layout: LAB.layout, tough: true,
    move: !!(def.on && def.on.move) || /P\.moving|moveAng/.test(String(def.fire || '')) });
  sandboxStart();
}
function labExit() { SB.lab = false; G = null; showScreen('menu'); }
function labReadout() {
  const el = $('#labOut'), i = G && G.inv[0]; if (!el || !i) return;
  const foe = String(SB.layout).startsWith('foe:') && foeDef(SB.layout.slice(4)), ts = instTypes(i);
  el.innerHTML = `<b>${i.def.icon} ${itemName(i)}</b> · Lv ${i.level} · one hit ${Math.round(hitDmg(i, G.player))} · ${Math.round(G.sbDps)} damage/s · hits as ${effNames(ts)}` +
    (foe ? `<div class="note">Against ${foe.name}: ×${typeMul({ T: foe }, ts)} damage from its main hits.</div>${foeTraitsHtml(foe)}` : '') +
    ((i.links || []).length ? `<div class="chain">${chainHtml(i.links, G.player.might, i.def)}</div>` : i.tier ? '<div class="note">Only stand-ins or passives were fused in, so there is no chain. Pick partners below.</div>' : '<div class="note">Not fused. Pick a tier to fuse items into it.</div>');
}
function renderLab() {
  const keep = labKeepers();
  if (!keep.length) { $('#labBody').innerHTML = '<p class="note">Unlock an item first.</p>'; return; }
  const ok = labTiers(LAB.item), T = LAB.tier, need = t => Math.max(1, FUSION[TIER_KEYS[t]].need - 1), opt = (v, l, on) => `<option value="${v}"${on ? ' selected' : ''}>${l}</option>`;
  const itemOpt = (d, cur) => opt(d.id, `${d.icon} ${d.name}${isPassive(d) ? ' (passive)' : ''}${!isPassive(d) && fuseUnlocked(SAVE, d) ? ' ★' : ''}`, d.id === cur);
  let h = `<div class="labRow"><label>Item <select data-lab="item">${keep.map(d => itemOpt(d, LAB.item)).join('')}</select></label>` +
    `<span class="labGrp">${TIER_KEYS.map((k, t) => `<button class="small${t === T ? ' on' : ''}" data-tier="${t}" ${ok[t] ? '' : 'disabled'} title="${ok[t] ? '' : t === 1 ? 'Master this item first' : lockLabel(FUSION[k].lock)}">${t ? FUSION[k].name : 'Plain'}</button>`).join('')}</span>` +
    `<span class="labGrp">Lv ${[1, 2, 3, 4, 5].map(L => `<button class="small${L === LAB.level ? ' on' : ''}" data-lvl="${L}">${L}</button>`).join('')}</span>` +
    `<label>Targets <select data-lab="layout">${[['ring', 'Ring'], ['line', 'Line'], ['scatter', 'Scattered'], ['swarm', 'Walking swarm'], ...foeIds().filter(id => foeMastered(SAVE, id)).map(id => ['foe:' + id, '👁 ' + foeDef(id).name])].map(([v, l]) => opt(v, l, v === LAB.layout)).join('')}</select></label></div>` +
    (foeIds().some(id => foeMastered(SAVE, id)) ? '' : '<div class="labRow note">Master an enemy in the Codex (👁 Bestiary) to test against it here.</div>');
  if (T) {
    const parts = labPartners(LAB.item), pOpt = (list, cur) => opt('', '— stand-in —', !cur) + list.map(d => itemOpt(d, cur)).join('');
    for (let k = 0; k < need(T); k++) {
      const [a, b] = String(LAB.fuse[k] || '').split('>'), subs = (b || '').split('+');
      h += `<div class="labRow"><span class="lbl">${k ? 'and' : 'Absorbs'}</span><select data-p="${k}">${pOpt(parts, a)}</select>`;
      if (T >= 2 && a) for (let j = 0; j < need(T - 1); j++) h += `<span class="lbl">${j ? '+' : '← made with'}</span><select data-p="${k}" data-s="${j}">${pOpt(labPartners(a), subs[j])}</select>`;
      h += '</div>';
    }
    h += `<div class="labRow"><button class="small" data-lab-rnd>🎲 Random partners</button><span class="note">Stand-ins are as strong as the item they replace but add no chain. ★ = mastered. In a run, ${T >= 2 ? `${FUSION[TIER_KEYS[T]].name} fusion also needs fusion history, and ` : ''}only a mastered item can remain.</span></div>`;
  }
  $('#labBody').innerHTML = h + '<div id="labOut" class="labOut"></div>';
  labReadout();
}
$('#labBody').addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.lab === 'item') { LAB.item = t.value; LAB.fuse = []; }
  else if (t.dataset.lab === 'layout') LAB.layout = t.value;
  else if (t.dataset.p !== undefined) {
    const k = +t.dataset.p, [a, b] = String(LAB.fuse[k] || '').split('>'), subs = (b || '').split('+');
    if (t.dataset.s === undefined) LAB.fuse[k] = t.value; else { subs[+t.dataset.s] = t.value; LAB.fuse[k] = a + (subs.filter(Boolean).length ? '>' + subs.filter(Boolean).join('+') : ''); }
  } else return;
  labStart();
});
$('#labBody').addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t || t.disabled) return;
  if (t.dataset.tier !== undefined) { LAB.tier = +t.dataset.tier; LAB.fuse = []; }
  else if (t.dataset.lvl !== undefined) LAB.level = +t.dataset.lvl;
  else if (t.dataset.labRnd !== undefined) {
    const T = LAB.tier, need = x => Math.max(1, FUSION[TIER_KEYS[x]].need - 1), rnd = id => { const l = labPartners(id); return l.length ? pick(l).id : ''; };
    LAB.fuse = Array.from({ length: need(T) }, () => { const a = rnd(LAB.item); if (!a || T < 2) return a; return a + '>' + Array.from({ length: need(T - 1) }, () => rnd(a)).filter(Boolean).join('+'); });
  } else return;
  labStart();
});

// ---------------- main loop ----------------
let last = performance.now();
const pauseBtn = $('#pauseBtn');
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  if (G && !G.paused && !G.over) {
    const speed = G.sandbox ? 1 : gameSpeed(), steps = Math.ceil(speed);
    for (let i = 0; i < steps && !G.paused && !G.over; i++) update(dt * speed / steps);
  }
  pauseBtn.hidden = !(G && !G.sandbox && !G.over && !currentScreen);
  render();
  requestAnimationFrame(frame);
}
if (window.VOIDLIGHT_CONTENT) VOIDLIGHT_CONTENT.applyCached(); // last published admin content, before unlocks are checked
if (SANDBOX) sandboxBoot(); else { loadSave(); checkUnlocks(); showScreen('menu'); }
$('#version').textContent = 'v' + VERSION + ' beta';
requestAnimationFrame(frame);

// debug hooks for testing
window.VOIDLIGHT = { get G() { return G; }, renderPause, chestOdds, chestRoll, dropChest, openChest, closeChest, get screen() { return currentScreen; }, refresh() { checkUnlocks(); if (!G && SCREENS_WITH_SAVE.includes(currentScreen)) showScreen(currentScreen); }, SAVE: () => SAVE, ITEMS, defaultSave, normalizeSave, mergeSaves, replaceSave, toast, addItem: (id, L) => addItem(ITEM[id], L), update, newRun, levelItem, fuse, fusionGroups, buildChoices, applyChoice, chooseLevel, selectLevel, confirmLevel, statsPanel, speedChoices, gameSpeed, synthFusion, endRun, get levelChoices() { return levelChoices; } };
