'use strict';
// ===== VOIDLIGHT content: 65 items (10 with two effects), 11 characters, categories, enemies, pickups, difficulty, meta upgrades =====
// admin.html edits this content and can export a new copy of this file. For that to work, keep each
// def(...)'s plain-data properties (dmg, cd, effect2, lock, fuseLock, color, vis, disabled, pattern, trig) on its first line,
// and each character, category, upgrade, enemy, boss, pickup and difficulty entry on a single line.
const ITEMS = [];
const ITEM = {};
function def(slot, id, name, effect, icon, props) {
  const d = Object.assign({ slot, id, name, effect, icon, dmg: 8, cd: 0 }, props);
  ITEMS.push(d); ITEM[id] = d; return d;
}
// fire a bullet owned by an item, inheriting its effect/color/damage and the item's visual style (vis, set from the admin page)
function B(c, o) {
  const b = Object.assign({ owner: c.inst, effect: c.eff, color: c.col, dmg: c.d, x: G.player.x, y: G.player.y }, o);
  const shape = b.shape || 'orb', v = c.inst.def.vis;
  if (G.seen) G.seen.add(shape);
  if (v) {
    if (v.shapes && v.shapes[shape] && !b.beam) b.shape = v.shapes[shape];
    if (v.size) { b.r = (b.r || 5) * v.size; if (b.beam) b.beam.w *= v.size; }
    if (v.speed && b.spd) { b.spd *= v.speed; if (b.maxSpd) b.maxSpd *= v.speed; }
    if (v.trail && !b.beam && !b.follow) b.trail = [];
  }
  return shoot(b);
}
function lob(c, tx, ty, o) {
  const P = G.player; const T = o.T || 0.6;
  const b = B(c, Object.assign({ x: P.x, y: P.y, noMods: true, lob: 70, shape: 'orb', r: 7 }, o)); if (!b) return null;
  b.life = T; b.vx = (tx - b.x) / T; b.vy = (ty - b.y) / T; return b;
}
function targetPoint(range = 380) {
  const P = G.player; const e = randomEnemy(P.x, P.y, range);
  if (e) return { x: e.x, y: e.y };
  const a = rand(0, TAU), r = rand(80, range * 0.7); return { x: P.x + Math.cos(a) * r, y: P.y + Math.sin(a) * r };
}
function petFollow(d, dt, tx, ty, k = 6) { d.x = lerp(d.x, tx, Math.min(1, dt * k)); d.y = lerp(d.y, ty, Math.min(1, dt * k)); }
function persistBase(c) { return { life: Infinity, persist: true, noMods: true }; }
function cdFor(i, base) { return base * (1 - 0.07 * (i.level - 1)) * G.player.cdMul * (i.evo ? 0.75 : 1); }
function radial(c, x, y, m, o, a0 = 0) { for (let k = 0; k < m; k++) B(c, Object.assign({ x, y, ang: a0 + k * TAU / m }, o)); }

// ======================= WEAPONS =======================
def('weapon', 'ember_pistol', 'Ember Pistol', 'burn', '🔥', { dmg: 9, cd: 0.55, pattern: 'Rapid tight volley of fireballs at the nearest enemy.',
  fire(i, c) { const n = 1 + Math.floor((c.L - 1) / 2) + c.n; for (let k = 0; k < n; k++) later(k * 0.06, () => B(c, { ang: aimAngle() + rand(-0.06, 0.06), spd: 540, r: 5, life: 1.1 })); } });
def('weapon', 'frost_fan', 'Frost Fan', 'chill', '❄️', { dmg: 7, cd: 1.0, pattern: 'Cone of piercing ice shards.',
  fire(i, c) { const n = 3 + (c.L - 1) + c.n; for (let k = 0; k < n; k++) B(c, { ang: c.aim + (k / (n - 1) - 0.5) * 0.9, spd: 430, r: 5, life: 0.85, pierce: 2, shape: 'shard' }); } });
def('weapon', 'arc_rifle', 'Arc Rifle', 'shock', '⚡', { dmg: 14, cd: 1.2, pattern: 'Hyper-fast piercing bolt that chain-zaps what it hits.',
  fire(i, c) { const n = 1 + c.n; for (let k = 0; k < n; k++) B(c, { ang: c.aim + (k - (n - 1) / 2) * 0.12, spd: 820, r: 4, life: 0.9, pierce: 3 + c.L, shape: 'bolt',
    onHit: (b, e) => { if (Math.random() < 0.5 + 0.1 * c.L) chainZap(e, c.d * 0.45, 1 + Math.floor(c.L / 2), 'shock', i); } }); } });
def('weapon', 'thorn_spitter', 'Thorn Spitter', 'poison', '🌿', { dmg: 6, cd: 1.1, pattern: 'Sequential stream of thorns wobbling in a sine wave.',
  fire(i, c) { const n = 3 + c.L + c.n * 2; for (let k = 0; k < n; k++) later(k * 0.07, () => B(c, { ang: aimAngle() + rand(-0.08, 0.08), spd: 460, r: 4, life: 1, shape: 'shard', wave: { a: 12, f: 16, ph: k } })); } });
def('weapon', 'ricochet_disc', 'Ricochet Disc', 'bounce', '💿', { dmg: 10, cd: 1.6, pattern: 'Spinning discs that bounce off the edges of the screen.',
  fire(i, c) { const n = 1 + Math.floor(c.L / 2) + c.n; for (let k = 0; k < n; k++) B(c, { ang: c.aim + k * TAU / n, spd: 380, r: 8, life: 3.2, pierce: 4 + c.L, bounceWalls: 3 + c.L, shape: 'disc' }); } });
def('weapon', 'seeker_swarm', 'Seeker Swarm', 'homing', '🚀', { dmg: 8, cd: 1.4, pattern: 'Missiles launched behind you that accelerate and curve onto targets.',
  fire(i, c) { const n = 2 + c.L + c.n; for (let k = 0; k < n; k++) B(c, { ang: c.face + Math.PI + (k / Math.max(1, n - 1) - 0.5) * 1.8, spd: 160, accel: 2.4, maxSpd: 620, home: 5, homeDelay: 0.12, r: 4, life: 2.2, shape: 'missile' }); } });
def('weapon', 'boomerang_glaive', 'Boomerang Glaive', 'pierce', '🪃', { dmg: 13, cd: 1.5, pattern: 'Glaives that fly out and return, hitting on both passes.',
  fire(i, c) { const n = 1 + Math.floor((c.L - 1) / 2) + c.n; for (let k = 0; k < n; k++) B(c, { ang: c.aim + (k - (n - 1) / 2) * 0.35, spd: 470, r: 10, life: 1.3, pierce: 999, boomer: true, shape: 'glaive' }); } });
def('weapon', 'scrap_blaster', 'Scrap Blaster', 'knockback', '💥', { dmg: 6, cd: 1.3, pattern: 'Wide shotgun spray of heavy, slowing pellets.',
  fire(i, c) { const n = 6 + 2 * c.L + c.n * 2; for (let k = 0; k < n; k++) B(c, { ang: c.aim + rand(-0.45, 0.45), spd: rand(380, 560), drag: 2.5, r: 4, life: 0.6, kb: 14, shape: 'pellet' }); } });
def('weapon', 'helix_cannon', 'Helix Cannon', 'crit', '🧬', { dmg: 9, cd: 0.9, pattern: 'Twin bullets braided into a double helix.',
  fire(i, c) { const p = 1 + (c.L >= 3 ? 1 : 0) + c.n; for (let k = 0; k < p; k++) { const a = c.aim + (k - (p - 1) / 2) * 0.25; B(c, { ang: a, spd: 420, r: 5, life: 1.3, wave: { a: 18, f: 11, ph: 0 } }); B(c, { ang: a, spd: 420, r: 5, life: 1.3, wave: { a: 18, f: 11, ph: Math.PI } }); } } });
def('weapon', 'splitter_orb', 'Splitter Orb', 'split', '🔷', { dmg: 16, cd: 1.7, lock: { stat: 'totalKills', min: 500, text: 'Defeat 500 enemies (lifetime)' }, pattern: 'Heavy orb that shatters into a radial burst.',
  fire(i, c) { const n = 1 + c.n; for (let k = 0; k < n; k++) B(c, { ang: c.aim + (k - (n - 1) / 2) * 0.3, spd: 230, r: 11, life: 1.2, shape: 'orb',
    onExpire: b => { const m = 5 + c.L; for (let j = 0; j < m; j++) B(c, { x: b.x, y: b.y, ang: j * TAU / m + rand(0, 0.3), spd: 320, r: 4, life: 0.55, dmg: c.d * 0.45, shape: 'shard',
      onExpire: (c.L >= 5 || c.E) ? bb => { for (let q = -1; q <= 1; q += 2) B(c, { x: bb.x, y: bb.y, ang: Math.atan2(bb.vy, bb.vx) + q * 0.6, spd: 280, r: 3, life: 0.35, dmg: c.d * 0.25, shape: 'shard', noMods: true }); } : null }); } }); } });
def('weapon', 'blood_lance', 'Blood Lance', 'vampiric', '🩸', { dmg: 22, cd: 1.4, lock: { cost: 1000 }, pattern: 'Long lance thrust in your facing direction; pierces everything.',
  fire(i, c) { const n = 1 + c.n; for (let k = 0; k < n; k++) B(c, { ang: c.face + (k - (n - 1) / 2) * 0.2, spd: 720, r: 7, life: 0.7, pierce: 999, shape: 'lance', lifesteal: G.char.id === 'vesper' ? 0.02 : 0,
    onHit: () => { if (Math.random() < 0.06 + 0.02 * c.L) heal(1); } }); } });

// two effects: weaker alone, but fuses with items of either effect
def('weapon', 'frostfire_bolt', 'Frostfire Bolt', 'burn', '🌗', { dmg: 6, cd: 0.8, effect2: 'chill', pattern: 'Paired fire and ice bolts that curve in and cross on the target.',
  fire(i, c) { const n = 1 + Math.floor(c.L / 2) + c.n; for (let k = 0; k < n; k++) later(k * 0.09, () => { const a = aimAngle(); for (const s of [-1, 1]) B(c, { ang: a - s * 0.35, spd: 460, r: 5, life: 1.1, curve: s * 0.9, color: s < 0 ? c.col : c.col2, shape: s < 0 ? 'orb' : 'shard' }); }); } });
def('weapon', 'needle_thrower', 'Needle Thrower', 'poison', '🪡', { dmg: 4, cd: 0.75, effect2: 'pierce', pattern: 'Bursts of fast venom needles that pass through several enemies.',
  fire(i, c) { const n = 2 + Math.floor(c.L / 2) + c.n; for (let k = 0; k < n; k++) later(k * 0.05, () => B(c, { ang: aimAngle() + rand(-0.12, 0.12), spd: 640, r: 3, life: 0.8, pierce: 2 + Math.floor(c.L / 2), shape: 'bolt' })); } });

// ======================= SPELLS =======================
def('spell', 'flame_nova', 'Flame Nova', 'burn', '☀️', { dmg: 10, cd: 3, pattern: 'Swirling expanding ring of fireballs.',
  fire(i, c) { radial(c, c.x, c.y, 10 + 3 * c.L + c.n * 2, { spd: 280, r: 6, life: 1.1, curve: 0.9 }, rand(0, TAU)); } });
def('spell', 'blizzard', 'Blizzard', 'chill', '🌨️', { dmg: 14, cd: 2.6, pattern: 'Icicles lobbed onto enemies that explode on landing.',
  fire(i, c) { const m = 3 + c.L + c.n; for (let k = 0; k < m; k++) later(k * 0.08, () => { const t = targetPoint(380); lob(c, t.x, t.y, { shape: 'shard', T: 0.55,
    onExpire: b => { strike(b.x, b.y, 42, c.d, 'chill', { owner: i }); radial(c, b.x, b.y, 6, { spd: 220, r: 3, life: 0.3, dmg: c.d * 0.3, shape: 'shard', noMods: true }); } }); }); } });
def('spell', 'thunder_call', 'Thunder Call', 'shock', '🌩️', { dmg: 18, cd: 2.4, pattern: 'Sky lightning strikes on random enemies.',
  fire(i, c) { const list = enemiesNear(c.x, c.y, 450).sort(() => Math.random() - 0.5).slice(0, 2 + c.L + c.n);
    list.forEach((e, k) => later(k * 0.08, () => { if (e.dead) return; fxStrikeV(e.x, e.y, '#fff36b'); strike(e.x, e.y, 38, c.d, 'shock', { owner: i }); })); } });
def('spell', 'plague_cloud', 'Plague Cloud', 'poison', '☁️', { dmg: 4, cd: 3.2, pattern: 'Lingering toxic clouds dropped on enemies.',
  fire(i, c) { const m = 1 + Math.floor(c.L / 2) + c.n; for (let k = 0; k < m; k++) { const t = targetPoint(360); const R = (50 + 5 * c.L) * Math.sqrt(c.P.area);
    deploy({ x: t.x, y: t.y, life: 4, r: R, kind: 'cloud', color: c.col, update(d, dt) { d.tick -= dt; if (d.tick <= 0) { d.tick = 0.4; strike(d.x, d.y, d.r, c.d, 'poison', { noFx: true, raw: true, owner: i }); } } }); } } });
def('spell', 'prism_shard', 'Prism Shard', 'bounce', '🔺', { dmg: 9, cd: 2.2, pattern: 'Rainbow shards that ricochet enemy-to-enemy.',
  fire(i, c) { const m = 1 + Math.floor(c.L / 2) + c.n; for (let k = 0; k < m; k++) B(c, { ang: c.aim + rand(-0.5, 0.5), spd: 520, r: 5, life: 2, bounces: 4 + c.L, shape: 'prism', rainbow: true }); } });
def('spell', 'star_fall', 'Star Fall', 'homing', '🌠', { dmg: 11, cd: 2.5, lock: { stat: 'bestTime', min: 180, text: 'Survive 3:00' }, pattern: 'Stars summoned above you that dive onto targets.',
  fire(i, c) { const m = 4 + c.L + c.n; for (let k = 0; k < m; k++) later(k * 0.07, () => { const P = G.player; B(c, { x: P.x + rand(-140, 140), y: P.y - rand(220, 300), ang: Math.PI / 2 + rand(-0.3, 0.3), spd: 300, home: 6, r: 6, life: 2, shape: 'star' }); }); } });
def('spell', 'spiral_sigil', 'Spiral Sigil', 'pierce', '🌀', { dmg: 7, cd: 4, pattern: 'Multi-arm rotating spiral stream.',
  fire(i, c) { const arms = 2 + Math.floor(c.L / 2) + c.n, base = rand(0, TAU); for (let s = 0; s < 25; s++) later(s * 0.06, () => { for (let a = 0; a < arms; a++) B(c, { ang: base + s * 0.32 + a * TAU / arms, spd: 300, r: 4.5, life: 1.2, pierce: 2, shape: 'shard' }); }); } });
def('spell', 'shockwave', 'Shockwave', 'knockback', '🔊', { dmg: 8, cd: 3.5, pattern: 'Expanding ring wave that blasts enemies outward.',
  fire(i, c) { const hit = new Set(); const maxR = 170 * Math.sqrt(c.P.area) * (1 + 0.1 * c.L);
    deploy({ x: c.x, y: c.y, life: 0.55, kind: 'wave', color: c.col, R: 0, update(d) { d.R = maxR * Math.min(1, d.t / d.life);
      for (const e of enemiesNear(d.x, d.y, d.R + 10)) { if (hit.has(e.id) || Math.sqrt(d2(d.x, d.y, e.x, e.y)) < d.R - 30) continue; hit.add(e.id); hitEnemy(e, { dmg: c.d, effect: 'knockback', x: d.x, y: d.y, vx: 0, vy: 0, kb: 45, owner: i }); } } }); } });
def('spell', 'judgment_cross', 'Judgment Cross', 'crit', '✝️', { dmg: 16, cd: 3, lock: { cost: 600 }, pattern: 'Four beams in a +, then an ×.',
  fire(i, c) { const beams = off => { for (let k = 0; k < 4; k++) B(c, { beam: { len: 320, w: 10, ang: off + k * Math.PI / 2, follow: true }, hitCd: 0.12, life: 0.4, noMods: true, shape: 'beam' }); };
    beams(0); if (c.L >= 3 || c.E) later(0.35, () => beams(Math.PI / 4)); } });
def('spell', 'fractal_bloom', 'Fractal Bloom', 'split', '🌸', { dmg: 8, cd: 3, lock: { cost: 500 }, pattern: 'Curving petals that split, and split again.',
  fire(i, c) { const maxD = c.L >= 4 || c.E ? 2 : 1;
    const petal = (x, y, ang, depth, dmg) => B(c, { x, y, ang, spd: 260 - depth * 40, r: 6 - depth * 1.5, life: 0.7, curve: 1.4 * (depth % 2 ? -1 : 1), dmg, shape: 'petal', noMods: depth > 0,
      onExpire: depth < maxD ? b => { for (let j = 0; j < 3; j++) petal(b.x, b.y, Math.atan2(b.vy, b.vx) + (j - 1) * 0.7, depth + 1, dmg * 0.6); } : null });
    const m = 5 + c.n, a0 = rand(0, TAU); for (let k = 0; k < m; k++) petal(c.x, c.y, a0 + k * TAU / m, 0, c.d); } });
def('spell', 'soul_leech', 'Soul Leech', 'vampiric', '💀', { dmg: 9, cd: 3.5, lock: { stat: 'totalKills', min: 3000, text: 'Defeat 3000 enemies (lifetime)' }, pattern: 'Ring of skulls that fly out and return to heal you.',
  fire(i, c) { const m = 8 + c.L + c.n; for (let k = 0; k < m; k++) B(c, { ang: k * TAU / m, spd: 300, r: 6, life: 1.4, boomer: true, pierce: 999, shape: 'skull',
    onHit: b => { b.scored = true; }, onReturn: b => { if (b.scored) heal(0.4 + 0.1 * c.L); } }); } });

// two effects: weaker alone, but fuses with items of either effect
def('spell', 'storm_front', 'Storm Front', 'shock', '🌪️', { dmg: 5, cd: 3.6, effect2: 'chill', pattern: 'Drifting freezing clouds that call down lightning inside them.',
  fire(i, c) { const m = 1 + Math.floor(c.L / 3) + c.n; for (let k = 0; k < m; k++) { const a = c.aim + (k - (m - 1) / 2) * 0.6, R = (60 + 4 * c.L) * Math.sqrt(c.P.area);
    deploy({ x: c.x, y: c.y, life: 3, r: R, kind: 'cloud', color: c.col2, vx: Math.cos(a) * 110, vy: Math.sin(a) * 110, update(d, dt) { d.x += d.vx * dt; d.y += d.vy * dt; d.tick -= dt; if (d.tick > 0) return; d.tick = 0.45;
      strike(d.x, d.y, d.r, c.d * 0.6, 'chill', { noFx: true, raw: true, owner: i }); const e = randomEnemy(d.x, d.y, d.r * 1.4); if (e) { fxStrikeV(e.x, e.y, c.col); strike(e.x, e.y, 26, c.d, 'shock', { owner: i }); } } }); } } });
def('spell', 'blood_moon', 'Blood Moon', 'crit', '🌕', { dmg: 6, cd: 3, effect2: 'vampiric', pattern: 'A ring of crescents that sweep outward in a spiral; hits can heal.',
  fire(i, c) { const m = 6 + c.L + c.n, a0 = rand(0, TAU); for (let k = 0; k < m; k++) B(c, { ang: a0 + k * TAU / m, spd: 240, r: 6, life: 1.5, curve: 1.6, pierce: 3, shape: 'petal', color: k % 2 ? c.col2 : c.col, onHit: () => { if (Math.random() < 0.03 + 0.01 * c.L) heal(1); } }); } });

// ======================= ORBITALS =======================
def('orbit', 'cinder_ring', 'Cinder Ring', 'burn', '⭕', { dmg: 8, pattern: 'Fireballs in a tight circular orbit.',
  spawn(i, c) { const m = 2 + c.L + c.n; for (let k = 0; k < m; k++) B(c, Object.assign(persistBase(), { orbit: { r: 70, w: 3.2, a: k * TAU / m }, hitCd: 0.4, r: 7 })); } });
def('orbit', 'frost_halo', 'Frost Halo', 'chill', '💠', { dmg: 3, pattern: 'Freezing aura around you.',
  spawn(i, c) { B(c, Object.assign(persistBase(), { follow: true, r: 55 + 10 * c.L, hitCd: 0.5, shape: 'aura' })); } });
def('orbit', 'storm_sprite', 'Storm Sprite', 'shock', '🧚', { dmg: 12, pattern: 'Floating sprite that zaps nearby enemies.',
  spawn(i, c) { deploy({ owner: i, persist: true, life: Infinity, kind: 'pet', icon: '⚡', color: c.col, a: 0, cdT: 0, update(d, dt) { const P = G.player; d.a += dt * 1.3; petFollow(d, dt, P.x + Math.cos(d.a) * 50, P.y + Math.sin(d.a) * 30 - 20);
    d.cdT -= dt; if (d.cdT <= 0) { d.cdT = cdFor(i, 1.1); const e = nearest(d.x, d.y, 260); if (e) { const cc = ctxOf(i); zap(d.x, d.y, e, cc.d, 'shock', i); if (cc.L >= 2) chainZap(e, cc.d * 0.6, Math.floor(cc.L / 2) + cc.E, 'shock', i); } } } }); } });
def('orbit', 'venom_moth', 'Venom Moth', 'poison', '🦋', { dmg: 5, pattern: 'Erratic moth that scatters lingering spores.',
  spawn(i, c) { deploy({ owner: i, persist: true, life: Infinity, kind: 'pet', icon: '🦋', color: c.col, a: 0, cdT: 0, update(d, dt) { const P = G.player; d.a += dt; petFollow(d, dt, P.x + Math.sin(d.a * 1.7) * 95, P.y + Math.sin(d.a * 2.3) * 75, 4);
    d.cdT -= dt; if (d.cdT <= 0) { d.cdT = cdFor(i, 0.3); const cc = ctxOf(i); B(cc, { x: d.x, y: d.y, spd: 0, r: 8, life: 1.4 + 0.2 * cc.L, hitCd: 0.5, shape: 'spore', noMods: true }); } } }); } });
def('orbit', 'pinball_wisp', 'Pinball Wisp', 'bounce', '✨', { dmg: 9, pattern: 'Wisps bouncing around a box centred on you.',
  spawn(i, c) { const m = 1 + Math.floor(c.L / 2) + c.n; for (let k = 0; k < m; k++) B(c, Object.assign(persistBase(), { ang: rand(0, TAU), spd: 360, box: 200, r: 7, hitCd: 0.3, shape: 'wisp' })); } });
def('orbit', 'owl_familiar', 'Owl Familiar', 'homing', '🦉', { dmg: 7, pattern: 'Owl perched behind you firing homing feathers.',
  spawn(i, c) { deploy({ owner: i, persist: true, life: Infinity, kind: 'pet', icon: '🦉', color: c.col, cdT: 0.5, update(d, dt) { const P = G.player; petFollow(d, dt, P.x - Math.cos(P.face) * 40, P.y - Math.sin(P.face) * 40 - 12, 5);
    d.cdT -= dt; if (d.cdT <= 0) { d.cdT = cdFor(i, 1.3); const cc = ctxOf(i); const n = 2 + Math.floor(cc.L / 2) + cc.n; for (let k = 0; k < n; k++) B(cc, { x: d.x, y: d.y, ang: cc.aim + rand(-0.8, 0.8), spd: 340, home: 5, r: 4, life: 1.8, shape: 'feather' }); } } }); } });
def('orbit', 'blade_wheel', 'Blade Wheel', 'pierce', '⚙️', { dmg: 10, lock: { stat: 'totalKills', min: 2000, text: 'Defeat 2000 enemies (lifetime)' }, pattern: 'Large blades on a wide elliptical orbit.',
  spawn(i, c) { const m = 2 + Math.floor(c.L / 2) + c.n; for (let k = 0; k < m; k++) B(c, Object.assign(persistBase(), { orbit: { r: 135, ry: 0.65, w: 1.9, a: k * TAU / m }, r: 12, hitCd: 0.35, shape: 'blade' })); } });
def('orbit', 'guardian_shield', 'Guardian Shield', 'knockback', '🛡️', { dmg: 5, pattern: 'Close shield plates that shove enemies away.',
  spawn(i, c) { const m = 2 + Math.floor(c.L / 2) + c.n; for (let k = 0; k < m; k++) B(c, Object.assign(persistBase(), { orbit: { r: 42, w: 3.6, a: k * TAU / m }, r: 11, kb: 40, hitCd: 0.3, shape: 'shield' })); } });
def('orbit', 'fortune_orbs', 'Fortune Orbs', 'crit', '🪙', { dmg: 7, pattern: 'Orbs tracing a figure-8 around you.',
  spawn(i, c) { const m = 2 + Math.floor(c.L / 2) + c.n; for (let k = 0; k < m; k++) B(c, Object.assign(persistBase(), { orbit: { r: 115, w: 1.6, a: k * TAU / m, fig8: true }, r: 7, hitCd: 0.4, shape: 'coin' })); } });
def('orbit', 'gemini_satellites', 'Gemini Satellites', 'split', '🛰️', { dmg: 8, lock: { cost: 700 }, pattern: 'Twin satellites firing splitting side-bursts.',
  spawn(i, c) { i.state.sats = []; i.state.t = 0.5; const m = 2 + c.n; for (let k = 0; k < m; k++) i.state.sats.push(B(c, Object.assign(persistBase(), { orbit: { r: 58, w: 1.4, a: k * TAU / m }, r: 7, hitCd: 0.5, shape: 'sat' }))); },
  update(i, dt) { i.state.t -= dt; if (i.state.t > 0) return; i.state.t = cdFor(i, 1.2); const c = ctxOf(i);
    for (const s of i.state.sats || []) { if (!s) continue; const a = angTo(G.player.x, G.player.y, s.x, s.y); for (const side of [-1, 1]) B(c, { x: s.x, y: s.y, ang: a + side * 0.5, spd: 300, r: 4, life: 0.6, shape: 'shard',
      onExpire: b => { for (const q of [-0.5, 0.5]) B(c, { x: b.x, y: b.y, ang: Math.atan2(b.vy, b.vx) + q, spd: 260, r: 3, life: 0.4, dmg: c.d * 0.5, shape: 'shard', noMods: true }); } }); } } });
def('orbit', 'bat_swarm', 'Bat Swarm', 'vampiric', '🦇', { dmg: 6, lock: { cost: 800 }, pattern: 'Bats circling you chaotically.',
  spawn(i, c) { const m = 4 + c.L + c.n; for (let k = 0; k < m; k++) B(c, Object.assign(persistBase(), { orbit: { r: 85, w: rand(2, 3.5) * (k % 2 ? 1 : -1), a: rand(0, TAU), pulse: rand(1.5, 3) }, r: 6, hitCd: 0.5, shape: 'bat' })); } });

// two effects: weaker alone, but fuses with items of either effect
def('orbit', 'plasma_orbs', 'Plasma Orbs', 'burn', '🔆', { dmg: 5, effect2: 'shock', pattern: 'Burning orbs circling you that zap the nearest enemy.',
  spawn(i, c) { i.state.orbs = []; i.state.t = 0.6; const m = 2 + Math.floor(c.L / 2) + c.n; for (let k = 0; k < m; k++) i.state.orbs.push(B(c, Object.assign(persistBase(), { orbit: { r: 95, w: -2.4, a: k * TAU / m }, r: 7, hitCd: 0.45 }))); },
  update(i, dt) { i.state.t -= dt; if (i.state.t > 0) return; i.state.t = cdFor(i, 1.4); const c = ctxOf(i); for (const o of i.state.orbs || []) { if (!o || o.dead) continue; const e = nearest(o.x, o.y, 170); if (e) zap(o.x, o.y, e, c.d * 0.8, 'shock', i); } } });
def('orbit', 'hive_drones', 'Hive Drones', 'homing', '🐝', { dmg: 4, effect2: 'poison', pattern: 'Buzzing drones around you that launch homing venom stingers.',
  spawn(i, c) { i.state.bees = []; i.state.t = 0.8; const m = 2 + Math.floor(c.L / 2) + c.n; for (let k = 0; k < m; k++) i.state.bees.push(B(c, Object.assign(persistBase(), { orbit: { r: 60, w: 2.8, a: k * TAU / m, pulse: 2 }, r: 5, hitCd: 0.5, shape: 'bat' }))); },
  update(i, dt) { i.state.t -= dt; if (i.state.t > 0) return; i.state.t = cdFor(i, 1.5); const c = ctxOf(i); for (const s of i.state.bees || []) { if (!s || s.dead) continue; B(c, { x: s.x, y: s.y, ang: rand(0, TAU), spd: 260, home: 5, r: 3.5, life: 1.6, shape: 'dagger', color: c.col2 }); } } });

// ======================= DEPLOYABLES =======================
def('trap', 'fire_trail', 'Fire Trail', 'burn', '🔥', { dmg: 4, cd: 0.12, pattern: 'Flames left behind as you move.',
  fire(i, c) { if (!c.P.moving) return; B(c, { spd: 0, r: 9, life: 1.2 + 0.25 * c.L, hitCd: 0.45, shape: 'flame', noMods: true }); } });
def('trap', 'ice_mine', 'Ice Mine', 'chill', '🧊', { dmg: 15, cd: 2.6, pattern: 'Proximity mines that burst into a ring of shards.',
  fire(i, c) { const m = 1 + Math.floor(c.L / 2) + c.n; for (let k = 0; k < m; k++) deploy({ x: c.x + rand(-70, 70), y: c.y + rand(-70, 70), life: 12, kind: 'mine', color: c.col, update(d, dt) {
    if (d.t < 0.5) return; d.tick -= dt; if (d.tick > 0) return; d.tick = 0.1;
    if (enemiesNear(d.x, d.y, 45).length) { d.dead = true; strike(d.x, d.y, 50, c.d, 'chill', { owner: i }); radial(c, d.x, d.y, 8 + c.L, { spd: 340, r: 4, life: 0.5, dmg: c.d * 0.5, shape: 'shard' }); } } }); } });
def('trap', 'tesla_coil', 'Tesla Coil', 'shock', '🗼', { dmg: 10, cd: 5, pattern: 'Coil that zaps several enemies at once.',
  fire(i, c) { deploy({ x: c.x + rand(-40, 40), y: c.y + rand(-40, 40), life: 5 + c.L, kind: 'coil', color: c.col, update(d, dt) { d.tick -= dt; if (d.tick > 0) return; d.tick = 0.6;
    for (const e of enemiesNear(d.x, d.y, 190).slice(0, 1 + Math.floor(c.L / 2) + c.n)) zap(d.x, d.y - 10, e, c.d, 'shock', i); } }); } });
def('trap', 'spore_pod', 'Spore Pod', 'poison', '🍄', { dmg: 6, cd: 3, pattern: 'Lobbed pod that sprays a spore spiral.',
  fire(i, c) { const m = 1 + c.n; for (let k = 0; k < m; k++) { const t = targetPoint(320); lob(c, t.x, t.y, { shape: 'pod', T: 0.6, onExpire: b => deploy({ x: b.x, y: b.y, life: 1.2, kind: 'pod', color: c.col, a: 0, update(d, dt) {
    d.tick -= dt; if (d.tick > 0) return; d.tick = 0.05; d.a += 0.5; for (let arm = 0; arm < 3; arm++) B(c, { x: d.x, y: d.y, ang: d.a + arm * TAU / 3, spd: 200, r: 4, life: 0.9, shape: 'spore' }); } }) }); } } });
def('trap', 'bumper_totem', 'Bumper Totem', 'bounce', '🗿', { dmg: 8, cd: 5.5, pattern: 'Totem spraying rotating, wall-bouncing shots.',
  fire(i, c) { deploy({ x: c.x, y: c.y, life: 4.5, kind: 'totem', color: c.col, a: 0, update(d, dt) { d.tick -= dt; if (d.tick > 0) return; d.tick = 0.25; d.a += 0.4;
    for (let k = 0; k < 4; k++) B(c, { x: d.x, y: d.y, ang: d.a + k * Math.PI / 2, spd: 320, bounceWalls: 2 + Math.floor(c.L / 2), life: 2.5, r: 5, shape: 'disc' }); } }); } });
def('trap', 'hunter_turret', 'Hunter Turret', 'homing', '🎯', { dmg: 9, cd: 6, pattern: 'Turret firing homing missiles.',
  fire(i, c) { deploy({ x: c.x + rand(-30, 30), y: c.y + rand(-30, 30), life: 6 + c.L, kind: 'turret', color: c.col, update(d, dt) { d.tick -= dt; if (d.tick > 0) return; d.tick = 0.55 / (1 + 0.1 * c.n);
    const e = nearest(d.x, d.y, 450); if (e) B(c, { x: d.x, y: d.y, ang: angTo(d.x, d.y, e.x, e.y) + rand(-0.4, 0.4), spd: 260, home: 6, r: 4.5, life: 2, shape: 'missile' }); } }); } });
def('trap', 'spike_line', 'Spike Line', 'pierce', '🔱', { dmg: 14, cd: 2.2, pattern: 'A line of spikes erupting toward enemies.',
  fire(i, c) { const lines = 1 + c.n; for (let l = 0; l < lines; l++) { const ang = c.aim + (l - (lines - 1) / 2) * 0.5, sx = c.x, sy = c.y, m = 6 + c.L;
    for (let k = 0; k < m; k++) later(k * 0.04, () => { const x = sx + Math.cos(ang) * (30 + k * 28), y = sy + Math.sin(ang) * (30 + k * 28); G.fx.push({ k: 'spike', x, y, color: c.col, t: 0, dur: 0.3 }); strike(x, y, 20, c.d, 'pierce', { owner: i, noFx: true }); }); } } });
def('trap', 'gravity_well', 'Gravity Well', 'knockback', '🕳️', { dmg: 4, cd: 6.5, lock: { cost: 500 }, pattern: 'Vortex that pulls enemies in, then detonates outward.',
  fire(i, c) { const x = c.x + Math.cos(c.aim) * 160, y = c.y + Math.sin(c.aim) * 160, R = 190 * Math.sqrt(c.P.area);
    deploy({ x, y, life: 2.5, kind: 'well', color: c.col, r: R, update(d, dt) { for (const e of enemiesNear(d.x, d.y, d.r)) { if (e.boss) continue; const a = angTo(e.x, e.y, d.x, d.y); e.x += Math.cos(a) * 130 * dt; e.y += Math.sin(a) * 130 * dt; }
      d.tick -= dt; if (d.tick <= 0) { d.tick = 0.35; strike(d.x, d.y, 70, c.d, 'knockback', { noFx: true, owner: i }); } },
      onEnd(d) { strike(d.x, d.y, 130, c.d * 4, 'knockback', { kb: 80, owner: i }); fxRing(d.x, d.y, 160, c.col, 0.5, 6); } }); } });
def('trap', 'sniper_nest', 'Sniper Nest', 'crit', '🔭', { dmg: 40, cd: 7, lock: { stat: 'evolves', min: 1, text: 'Fuse any item' }, pattern: 'Turret sniping the toughest enemy around.',
  fire(i, c) { deploy({ x: c.x, y: c.y, life: 7, kind: 'nest', color: c.col, update(d, dt) { d.tick -= dt; if (d.tick > 0) return; d.tick = c.E ? 0.6 : 1.0;
    const e = toughest(d.x, d.y, 650); if (e) B(c, { x: d.x, y: d.y, ang: angTo(d.x, d.y, e.x, e.y), spd: 1000, r: 4, life: 0.8, pierce: 3, shape: 'bolt' }); } }); } });
def('trap', 'cluster_bomb', 'Cluster Bomb', 'split', '💣', { dmg: 18, cd: 3.2, lock: { stat: 'maxLevel', min: 15, text: 'Reach level 15' }, pattern: 'Lobbed bomb that scatters bomblets.',
  fire(i, c) { const m = 1 + c.n; for (let k = 0; k < m; k++) { const t = targetPoint(360); lob(c, t.x, t.y, { shape: 'bomb', r: 8, T: 0.7, onExpire: b => { strike(b.x, b.y, 55, c.d, 'split', { owner: i });
    const q = 6 + c.L; for (let j = 0; j < q; j++) B(c, { x: b.x, y: b.y, ang: rand(0, TAU), spd: rand(150, 320), drag: 3, r: 4, life: 0.6, dmg: c.d * 0.4, shape: 'pellet', noMods: true, onExpire: bb => strike(bb.x, bb.y, 26, c.d * 0.5, 'split', { owner: i }) }); } }); } } });
def('trap', 'blood_altar', 'Blood Altar', 'vampiric', '⛩️', { dmg: 7, cd: 8, lock: { stat: 'bestTime', min: 600, text: 'Survive 10:00' }, pattern: 'Altar spraying a 3-arm spiral; heals you while near it.',
  fire(i, c) { deploy({ x: c.x, y: c.y, life: 6, kind: 'altar', color: c.col, a: 0, healT: 1, update(d, dt) { d.healT -= dt; if (d.healT <= 0) { d.healT = 1; if (d2(d.x, d.y, G.player.x, G.player.y) < 100 * 100) heal(1 + 0.25 * c.L); }
    d.tick -= dt; if (d.tick > 0) return; d.tick = 0.08; d.a += 0.21; for (let k = 0; k < 3; k++) B(c, { x: d.x, y: d.y, ang: d.a + k * TAU / 3, spd: 220, r: 5, life: 1.6 }); } }); } });

// two effects: weaker alone, but fuses with items of either effect
def('trap', 'magma_geyser', 'Magma Geyser', 'burn', '🌋', { dmg: 7, cd: 4.2, effect2: 'knockback', pattern: 'A geyser that erupts in pulses, blasting enemies back and spraying flames.',
  fire(i, c) { const t = targetPoint(300); deploy({ x: t.x, y: t.y, life: 2.4, kind: 'pod', color: c.col, update(d, dt) { d.tick -= dt; if (d.tick > 0) return; d.tick = 0.6;
    strike(d.x, d.y, 70 + 4 * c.L, c.d, 'knockback', { kb: 30, owner: i }); radial(c, d.x, d.y, 6 + c.L, { spd: 260, r: 5, life: 0.5, drag: 1.5, shape: 'flame' }, rand(0, TAU)); } }); } });
def('trap', 'shrapnel_bumper', 'Shrapnel Bumper', 'bounce', '🎱', { dmg: 5, cd: 5, effect2: 'split', pattern: 'Bumper spraying wall-bouncing pellets that split when they stop.',
  fire(i, c) { deploy({ x: c.x, y: c.y, life: 4, kind: 'totem', color: c.col, a: 0, update(d, dt) { d.tick -= dt; if (d.tick > 0) return; d.tick = 0.45; d.a += 0.7;
    for (let k = 0; k < 3; k++) B(c, { x: d.x, y: d.y, ang: d.a + k * TAU / 3, spd: 300, bounceWalls: 1 + Math.floor(c.L / 3), life: 1.6, r: 4.5, shape: 'disc',
      onExpire: b => { for (const q of [-0.6, 0.6]) B(c, { x: b.x, y: b.y, ang: Math.atan2(b.vy, b.vx) + q, spd: 240, r: 3, life: 0.35, dmg: c.d * 0.5, shape: 'shard', noMods: true, color: c.col2 }); } }); } }); } });

// ======================= RELICS =======================
def('relic', 'phoenix_feather', 'Phoenix Feather', 'burn', '🪶', { dmg: 12, pattern: 'When hit or levelling up: ring of flame feathers.', trig: 'When hit / level up',
  on: { hurt(i, c) { radial(c, c.x, c.y, 12 + 4 * c.L + c.n * 2, { spd: 360, r: 5, life: 0.9, pierce: 2, shape: 'feather' }); c.P.inv += 0.3; },
        levelup(i, c) { radial(c, c.x, c.y, 8 + 2 * c.L, { spd: 360, r: 5, life: 0.9, pierce: 2, shape: 'feather' }); } } });
def('relic', 'frozen_heart', 'Frozen Heart', 'chill', '🥶', { dmg: 9, pattern: 'Every few kills: an 8-way ice burst from the victim.', trig: 'Every N kills',
  on: { kill(i, c, e) { i.state.k = (i.state.k || 0) + 1; if (i.state.k >= 12 - c.L * 1.5) { i.state.k = 0; radial(c, e.x, e.y, 8 + c.n * 2, { spd: 330, r: 5, life: 0.8, pierce: 2, shape: 'shard' }, rand(0, 1)); } } } });
def('relic', 'static_boots', 'Static Boots', 'shock', '👢', { dmg: 7, pattern: 'Moving builds charge: sparks spray out behind you.', trig: 'Every 140px moved',
  on: { move(i, c, dist) { i.state.acc = (i.state.acc || 0) + dist; if (i.state.acc < 140 - 10 * c.L) return; i.state.acc = 0;
    for (let j = 0; j < 3 + c.L + c.n; j++) B(c, { ang: c.P.moveAng + Math.PI + rand(-0.7, 0.7), spd: rand(250, 380), curve: rand(-3, 3), r: 4, life: 0.6, shape: 'spark' }); } } });
def('relic', 'venom_gland', 'Venom Gland', 'poison', '🧪', { dmg: 7, pattern: 'On kill (chance): the corpse spits poison globs.', trig: 'On kill',
  on: { kill(i, c, e) { if (Math.random() > 0.15 + 0.05 * c.L) return; for (let j = 0; j < 3 + c.n; j++) B(c, { x: e.x, y: e.y, ang: rand(0, TAU), spd: 220, home: 3, r: 5, life: 1.2, shape: 'glob' }); } } });
def('relic', 'rubber_charm', 'Rubber Charm', 'bounce', '🎾', { dmg: 9, pattern: 'Picking up crystals (chance): launch a bouncing pellet.', trig: 'On crystal pickup',
  on: { pickup(i, c) { if (Math.random() > 0.2 + 0.05 * c.L) return; B(c, { ang: c.aim, spd: 420, bounces: 3 + c.L, bounceWalls: 2, r: 5, life: 2.5, shape: 'pellet' }); } } });
def('relic', 'hunters_eye', "Hunter's Eye", 'homing', '👁️', { dmg: 8, pattern: 'Standing still: a ring of homing darts.', trig: 'While standing still',
  update(i, dt) { if (G.player.stillT < 0.4) return; i.state.t = (i.state.t || 0) - dt; if (i.state.t > 0) return; i.state.t = cdFor(i, 1.2);
    const c = ctxOf(i); radial(c, c.x, c.y, 6 + c.L + c.n, { spd: 250, home: 4, homeDelay: 0.2, r: 4, life: 1.6, shape: 'feather' }, rand(0, TAU)); } });
def('relic', 'piercing_gaze', 'Piercing Gaze', 'pierce', '🔦', { dmg: 12, cd: 2.6, pattern: 'Periodically fires a beam where you are heading.', trig: 'Every few seconds',
  fire(i, c) { for (let k = 0; k <= c.n; k++) B(c, { beam: { len: 420, w: 6, ang: c.P.moveAng + (k - c.n / 2) * 0.3, follow: true }, hitCd: 0.15, life: 0.25, noMods: true, shape: 'beam' }); } });
def('relic', 'repulsor_plate', 'Repulsor Plate', 'knockback', '🧲', { dmg: 10, pattern: 'When swarmed: a point-blank shockwave.', trig: 'When 3+ enemies are close',
  update(i, dt) { i.state.t = (i.state.t || 0) - dt; if (i.state.t > 0) return; const P = G.player; if (enemiesNear(P.x, P.y, 75).length < 3) return;
    i.state.t = cdFor(i, 3); const c = ctxOf(i); strike(P.x, P.y, 95, c.d, 'knockback', { kb: 60, owner: i }); fxRing(P.x, P.y, 110, c.col, 0.4, 5); } });
def('relic', 'assassins_mark', "Assassin's Mark", 'crit', '🗡️', { dmg: 14, lock: { cost: 400 }, pattern: 'On crit (chance): a dagger is thrown at another enemy.', trig: 'On critical hit',
  on: { crit(i, c, e) { if (Math.random() > 0.25 + 0.05 * c.L) return; const n = nearest(e.x, e.y, 400, new Set([e.id])); if (n) B(c, { ang: angTo(c.x, c.y, n.x, n.y), spd: 700, r: 4, life: 0.8, shape: 'dagger' }); } } });
def('relic', 'hydra_scale', 'Hydra Scale', 'split', '🐉', { dmg: 8, lock: { stat: 'bossKills', min: 1, text: 'Defeat a boss' }, pattern: 'On level-up and every 25 kills: cascading splitting rings.', trig: 'Level-up / 25 kills',
  on: { levelup(i, c) { hydra(c); }, kill(i, c) { i.state.k = (i.state.k || 0) + 1; if (i.state.k >= 25) { i.state.k = 0; hydra(c); } } } });
function hydra(c) { for (let k = 0; k < 3; k++) later(k * 0.15, () => { const P = G.player; radial(c, P.x, P.y, 10 + c.L, { spd: 260, r: 4.5, life: 0.6, shape: 'shard',
  onExpire: b => { for (const q of [-0.4, 0.4]) B(c, { x: b.x, y: b.y, ang: Math.atan2(b.vy, b.vx) + q, spd: 240, r: 3, life: 0.4, dmg: c.d * 0.5, shape: 'shard', noMods: true }); } }, k * 0.3); }); }
def('relic', 'vampire_fang', 'Vampire Fang', 'vampiric', '🦷', { dmg: 9, lock: { cost: 600 }, pattern: 'On kill (chance): a homing blood drop that heals on hit.', trig: 'On kill',
  on: { kill(i, c, e) { if (Math.random() > 0.1 + 0.03 * c.L) return; B(c, { x: e.x, y: e.y, ang: rand(0, TAU), spd: 250, home: 7, r: 5, life: 2, shape: 'drop', onHit: () => heal(1) }); } } });

// two effects: weaker alone, but fuses with items of either effect
def('relic', 'thunder_sigil', 'Thunder Sigil', 'shock', '🔯', { dmg: 9, effect2: 'crit', pattern: 'On crit (chance): lightning strikes another enemy nearby.', trig: 'On critical hit',
  on: { crit(i, c, e) { if (Math.random() > 0.2 + 0.04 * c.L) return; const n = randomEnemy(e.x, e.y, 260); if (!n || n === e) return; fxStrikeV(n.x, n.y, c.col); strike(n.x, n.y, 34, c.d, 'shock', { owner: i }); } } });
def('relic', 'glacial_shell', 'Glacial Shell', 'chill', '🐚', { dmg: 8, effect2: 'knockback', pattern: 'When hit or levelling up: a freezing blast that throws enemies back.', trig: 'When hit / level up',
  on: { hurt(i, c) { glacial(c, i, 1); c.P.inv += 0.2; }, levelup(i, c) { glacial(c, i, 0.6); } } });
function glacial(c, i, k) { strike(c.x, c.y, 110 + 8 * c.L, c.d * 1.5 * k, 'chill', { kb: 50, owner: i }); radial(c, c.x, c.y, Math.round((10 + 2 * c.L + c.n * 2) * k), { spd: 320, r: 4, life: 0.6, shape: 'shard', color: c.col2 }); }

// ======================= CHARACTERS =======================
const CHARACTERS = [
  { id: 'kael',  name: 'Kael',  title: 'Ember Warden',  color: '#ff8a3d', weapon: 'ember_pistol',     perk: '+10% damage',            mods: { might: 0.10 } },
  { id: 'mira',  name: 'Mira',  title: 'Frostweaver',   color: '#7fdcff', weapon: 'frost_fan',        perk: '+15% area',              mods: { area: 0.15 } },
  { id: 'volt',  name: 'Volt',  title: 'Storm Runner',  color: '#fff36b', weapon: 'arc_rifle',        perk: '−8% cooldowns',          mods: { cd: 0.08 } },
  { id: 'briar', name: 'Briar', title: 'Thornkeeper',   color: '#8cff5a', weapon: 'thorn_spitter',    perk: '+20% max HP, +0.5 regen', mods: { hp: 0.2, regen: 0.5 }, lock: { stat: 'bestTime', min: 300, text: 'Survive 5:00' } },
  { id: 'juno',  name: 'Juno',  title: 'Trickshot',     color: '#ff6bd5', weapon: 'ricochet_disc',    perk: '+15% projectile speed',  mods: { projSpd: 0.15 }, lock: { stat: 'totalKills', min: 1000, text: 'Defeat 1000 enemies (lifetime)' } },
  { id: 'orrin', name: 'Orrin', title: 'Tinker',        color: '#b48cff', weapon: 'seeker_swarm',     perk: '+20% duration',          mods: { duration: 0.2 }, lock: { stat: 'maxLevel', min: 20, text: 'Reach level 20' } },
  { id: 'sable', name: 'Sable', title: 'Wanderer',      color: '#e8e8ff', weapon: 'boomerang_glaive', perk: '+15% move speed',        mods: { speed: 0.15 }, lock: { stat: 'bossKills', min: 1, text: 'Defeat a boss' } },
  { id: 'grim',  name: 'Grim',  title: 'Scrapper',      color: '#ffb86b', weapon: 'scrap_blaster',    perk: '+2 armor',               mods: { armor: 2 }, lock: { cost: 1500 } },
  { id: 'lyra',  name: 'Lyra',  title: 'Gambler',       color: '#ffe14d', weapon: 'helix_cannon',     perk: '+10% crit chance',       mods: { crit: 0.10 }, lock: { stat: 'evolves', min: 1, text: 'Fuse an item' } },
  { id: 'nyx',   name: 'Nyx',   title: 'Fractured',     color: '#5affd9', weapon: 'splitter_orb',     perk: '+1 projectile, −20% max HP', mods: { amount: 1, hp: -0.2 }, lock: { stat: 'wins', min: 1, text: 'Win a run' } },
  { id: 'vesper',name: 'Vesper',title: 'Nightblood',    color: '#ff3b5c', weapon: 'blood_lance',      perk: 'Lance hits heal 2% of damage', mods: {}, lock: { cost: 3000 } },
];

// ======================= CATEGORIES (effects) =======================
// A run only offers items whose categories are all unlocked. Categories without a lock are open from the start.
const CATEGORIES = {
  burn: {},
  chill: {},
  shock: {},
  poison: { lock: { effect: 'burn', level: 5, text: 'Reach level 5 with any Burn item' } },
  knockback: { lock: { effect: 'chill', level: 5, text: 'Reach level 5 with any Chill item' } },
  pierce: { lock: { effect: 'shock', level: 5, text: 'Reach level 5 with any Shock item' } },
  crit: { lock: { stat: 'bestTime', min: 300, text: 'Survive 5:00' } },
  bounce: { lock: { effect: 'pierce', level: 5, text: 'Reach level 5 with any Pierce item' } },
  homing: { lock: { effect: 'knockback', level: 5, text: 'Reach level 5 with any Force item' } },
  split: { lock: { stat: 'bossKills', min: 1, text: 'Defeat a boss' } },
  vampiric: { lock: { stat: 'evolves', min: 3, text: 'Make 3 fusions' } },
};

// ======================= DIFFICULTY =======================
// m = minutes into the run. Enemy HP ×(1 + hpGrowth·m + hpCurve·m²), spawns/s = spawnBase + spawnGrowth·m + spawnCurve·m²,
// enemy damage ×(1 + dmgGrowth·m). Elites every eliteEvery s with eliteHp× HP, encirclements every ringEvery s, boss HP ×bossHp.
// XP for level l: 5 + xpStep·(l−1) + (l−1)^xpCurve.
const DIFFICULTY = {
  run: { hpGrowth: 0.4, hpCurve: 0.06, spawnBase: 1, spawnGrowth: 0.9, spawnCurve: 0.06, dmgGrowth: 0.1, eliteEvery: 40, eliteHp: 10, ringEvery: 50, bossHp: 1.4, xpStep: 6, xpCurve: 1.8 },
};

// ======================= ENEMIES & BOSSES =======================
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
// ======================= PICKUPS (enemy drops) =======================
// chance is per normal kill. Elites and bosses drop chests and coin piles on top of this.
const DROPS = {
  gem:    { name: 'XP crystal', icon: '💎', value: 1, desc: 'Always dropped. XP = enemy XP × value' },
  coin:   { name: 'Void Gold',  icon: '🪙', chance: 0.035, min: 1, max: 3, desc: 'Gold kept between runs' },
  heart:  { name: 'Heart',      icon: '❤️', chance: 0.0015, value: 25, desc: 'Restores HP' },
  magnet: { name: 'Magnet',     icon: '🧲', chance: 0.0008, desc: 'Pulls every XP crystal to you' },
  chest:  { name: 'Chest',      icon: '📦', elite: 1, boss: 3, desc: 'Free upgrades: count per elite and per boss' },
};

// ======================= FORGE (meta upgrades) =======================
const UPGRADES = [
  { id: 'might',    name: 'Might',       icon: '⚔️', max: 5, cost: 60,  per: 0.05, desc: '+5% damage' },
  { id: 'hp',       name: 'Vitality',    icon: '❤️', max: 5, cost: 50,  per: 0.10, desc: '+10% max HP' },
  { id: 'armor',    name: 'Armor',       icon: '🛡️', max: 3, cost: 80,  per: 1,    desc: '−1 damage taken' },
  { id: 'regen',    name: 'Recovery',    icon: '💚', max: 3, cost: 70,  per: 0.2,  desc: '+0.2 HP/s' },
  { id: 'speed',    name: 'Swiftness',   icon: '👟', max: 3, cost: 60,  per: 0.05, desc: '+5% move speed' },
  { id: 'area',     name: 'Reach',       icon: '⭕', max: 3, cost: 90,  per: 0.05, desc: '+5% area' },
  { id: 'cd',       name: 'Haste',       icon: '⏱️', max: 3, cost: 120, per: 0.03, desc: '−3% cooldowns' },
  { id: 'projSpd',  name: 'Velocity',    icon: '💨', max: 2, cost: 50,  per: 0.08, desc: '+8% projectile speed' },
  { id: 'duration', name: 'Persistence', icon: '⌛', max: 2, cost: 70,  per: 0.08, desc: '+8% duration' },
  { id: 'amount',   name: 'Multishot',   icon: '➕', max: 1, cost: 1200, per: 1,   desc: '+1 projectile on everything' },
  { id: 'magnet',   name: 'Magnetism',   icon: '🧲', max: 3, cost: 40,  per: 0.2,  desc: '+20% pickup range' },
  { id: 'luck',     name: 'Luck',        icon: '🍀', max: 3, cost: 80,  per: 0.05, desc: '+5% luck (crits, 4th card, drops)' },
  { id: 'growth',   name: 'Growth',      icon: '📈', max: 5, cost: 70,  per: 0.05, desc: '+5% XP' },
  { id: 'greed',    name: 'Greed',       icon: '💰', max: 5, cost: 50,  per: 0.10, desc: '+10% gold' },
  { id: 'revive',   name: 'Second Wind', icon: '🕊️', max: 1, cost: 900, per: 1,    desc: 'Revive once per run at 50% HP' },
  { id: 'reroll',   name: 'Reroll',      icon: '🎲', max: 3, cost: 100, per: 1,    desc: '+1 level-up reroll per run' },
];
function upgradeCost(u, rank) { return Math.round(u.cost * Math.pow(1.6, rank)); }
