'use strict';
// ===== VOIDLIGHT fusion chains =====
// When items fuse, the item that remains (the keeper) absorbs the others. Each absorbed attacking item becomes a LINK on the
// keeper: its own attack, in a small form, at 50% of the damage it did.
//
// Every attacking item has one animation CATEGORY (CHAIN_CATS): how its attack looks and moves.
//   projectile  shots that fly            orbital  shots that circle a centre     aura  a field that hurts what is inside
//   deployable  an object that is placed and acts on its own (turrets, coils, mines, pets)
//   trail       damage left behind as it moves      zone  a lingering patch    blast  an instant area hit    arc  lightning
// The category says two things, and the engine never knows about pairs of items, only about pairs of categories:
//   * as a KEEPER, what its main body is (its HOST kind, CHAIN_HOSTS): each bullet, each orbiting shot, the aura field,
//     each deployed object, the patches it leaves, or (blast, arc) only the points it strikes.
//   * as a LINK, how it RIDES a host (CHAIN_RIDE: a visible part of the host that acts on its own) and how it POPS at a
//     point (CHAIN_POP: a one-off where something hits).
// The pair rule is CHAIN_HOSTS[host].rides: the link categories that ride that kind of host. Every other link pops where
// the keeper hits. Bullets fly and die fast, so only auras, orbitals and trails ride them (a halo, satellites, a trail);
// orbiting shots also carry projectiles and arcs; long-lived bodies (an aura, a deployed object, a patch) carry every
// category, so absorbing anything visibly changes them: Frost Halo with a Tesla Coil gets little coils on its rim that
// arc lightning, a Tesla Coil with a Frost Halo gets its own frost aura, and so on. A new item only needs a category.
// A link that is riding a host does not also pop from the keeper's other hits, so nothing plays twice.
//   * A link keeps the links of the item it came from as its KIDS, and what a link makes (its shots, strikes, objects)
//     triggers those kids. So a Super item's absorbed Fused item still plays its own chain, one step further out.
// Every pop and every ride action (a volley, an arc, a pulse) spends from the link's rate limit (CHAIN_RULES.rules.rate
// per second), so fast weapons, many orbiting shots or many deployables can't flood the screen.
// Loaded after items.js and before content.js (the admin page edits CHAIN_RULES and each item's `chain`, both in items.js).

// host: the kind of host this category is as a keeper. n: default count. ride / pop: words for the chain lines.
const CHAIN_CATS = {
  projectile: { name: 'Projectile', icon: '➶', host: 'shot', n: 3, text: 'shots that fly',
    ride: { aim: 'fires volleys of its shots at enemies from {h}', ring: 'fires rings of its shots from {h}' }, pop: { aim: 'fires a small volley of its shots at the nearest enemy', ring: 'bursts into a ring of its shots' } },
  orbital:    { name: 'Orbital', icon: '◎', host: 'orbiter', n: 3, text: 'shots that circle a centre',
    ride: 'its shots circle {h} and fly outward at the end', pop: 'spins its shots outward in a widening orbit' },
  aura:       { name: 'Aura', icon: '◌', host: 'field', n: 1, text: 'a field that hurts what is inside',
    ride: 'wraps {h} in its own aura that hurts what it touches', pop: 'flashes a brief aura that hurts what is inside' },
  deployable: { name: 'Deployable', icon: '▣', host: 'object', n: 1, text: 'objects placed to act on their own',
    ride: 'small {i} ride on {h} and {a}', pop: 'drops a small {i} that can {a} for a few seconds' },
  trail:      { name: 'Trail', icon: '〰', host: 'patch', n: 1, text: 'damage left behind as it moves',
    ride: 'leaves a trail of its shots behind {h}', pop: 'leaves a short streak of its shots' },
  zone:       { name: 'Zone', icon: '▒', host: 'patch', n: 1, text: 'lingering patches',
    ride: 'drops lingering patches from {h}', pop: 'leaves a lingering patch' },
  blast:      { name: 'Blast', icon: '✸', host: 'impact', n: 1, text: 'instant area hits',
    ride: 'pulses out blasts from {h}', pop: 'blasts the area' },
  arc:        { name: 'Arc', icon: 'ϟ', host: 'impact', n: 3, text: 'lightning that jumps between enemies',
    ride: 'arcs lightning from {h} to nearby enemies', pop: 'arcs lightning to nearby enemies' },
};
const CHAIN_CAT_KEYS = Object.keys(CHAIN_CATS);
// what a deployable link's small objects do (any category but deployable), in words
const CHAIN_ACTS = { projectile: 'shoot', orbital: 'spin out shots', aura: 'pulse an aura', trail: 'scatter its shots', zone: 'leave patches', blast: 'blast nearby enemies', arc: 'arc lightning' };
// the kinds of host, and which link categories ride each one. every = at most one host per this many seconds (patches).
const CHAIN_HOSTS = {
  shot:    { name: 'each bullet', rides: ['aura', 'orbital', 'trail'] },
  orbiter: { name: 'each orbiting shot', rides: ['aura', 'orbital', 'trail', 'projectile', 'arc'] },
  field:   { name: 'the aura', rides: CHAIN_CAT_KEYS },
  object:  { name: 'each one it places', rides: CHAIN_CAT_KEYS },
  patch:   { name: 'the patches it leaves', rides: CHAIN_CAT_KEYS, every: 0.4 },
  impact:  { name: 'where it strikes', rides: [] },
};
// when a pop plays on a bullet: 'end' = first hit or expiry, 'hit' = only on a hit, 'expire' = only when the bullet runs out
const CHAIN_ONS = { end: 'hits or expires', hit: 'hits an enemy', expire: 'runs out' };
// v0.18 chain forms, still read from older admin overrides ({ form }): form -> [category, spread]
const CHAIN_LEGACY = { volley: ['projectile', 'aim'], burst: ['projectile', 'ring'], ring: ['orbital'], sats: ['orbital'], halo: ['aura'], zone: ['zone'], zap: ['arc'], blast: ['blast'], trail: ['trail'] };
// Each attacking item: [category, shape, count?, extra?]. extra = 'aim' or 'ring' for a projectile (a volley at the nearest
// enemy, or a ring), and for a deployable what its small objects do (a category). Items not listed use their slot's.
const CHAIN_SLOT = { weapon: 'projectile', spell: 'projectile', orbit: 'orbital', trap: 'deployable', relic: 'projectile' };
const CHAIN_DEFAULTS = {
  ember_pistol: ['projectile', 'orb'], frost_fan: ['projectile', 'shard', 4], arc_rifle: ['projectile', 'bolt', 2], thorn_spitter: ['projectile', 'shard'],
  ricochet_disc: ['projectile', 'disc', 4, 'ring'], seeker_swarm: ['projectile', 'missile'], boomerang_glaive: ['projectile', 'glaive', 3, 'ring'], scrap_blaster: ['projectile', 'pellet', 10, 'ring'],
  helix_cannon: ['projectile', 'orb', 2], splitter_orb: ['projectile', 'shard', 6, 'ring'], blood_lance: ['projectile', 'lance', 1], rime_lance: ['projectile', 'shard', 8, 'ring'],
  shard_cannon: ['projectile', 'shard', 5, 'ring'], deadeye_bow: ['projectile', 'bolt', 1],
  flame_nova: ['projectile', 'orb', 10, 'ring'], blizzard: ['blast', 'shard'], thunder_call: ['arc', 'bolt', 4], plague_cloud: ['zone', 'spore'],
  prism_shard: ['projectile', 'prism', 2], star_fall: ['projectile', 'star'], spiral_sigil: ['projectile', 'shard', 6, 'ring'], shockwave: ['blast', 'orb'],
  judgment_cross: ['projectile', 'lance', 4, 'ring'], fractal_bloom: ['projectile', 'petal', 5, 'ring'], soul_leech: ['projectile', 'skull', 6, 'ring'], mirror_storm: ['projectile', 'prism', 6, 'ring'],
  comet_lash: ['projectile', 'missile', 2], crimson_tide: ['blast', 'orb'],
  cinder_ring: ['orbital', 'orb', 4], frost_halo: ['aura', 'aura'], storm_sprite: ['deployable', 'bolt', 1, 'arc'], venom_moth: ['trail', 'spore'],
  pinball_wisp: ['orbital', 'wisp', 2], owl_familiar: ['deployable', 'feather', 1, 'projectile'], blade_wheel: ['orbital', 'blade', 3], guardian_shield: ['orbital', 'shield', 2],
  fortune_orbs: ['orbital', 'coin', 4], gemini_satellites: ['orbital', 'sat', 2], bat_swarm: ['orbital', 'bat', 5], arc_halo: ['orbital', 'spark', 4],
  fire_trail: ['trail', 'flame'], ice_mine: ['deployable', 'shard', 1, 'blast'], tesla_coil: ['deployable', 'bolt', 1, 'arc'], spore_pod: ['deployable', 'spore', 1, 'zone'],
  bumper_totem: ['deployable', 'disc', 1, 'projectile'], hunter_turret: ['deployable', 'missile', 1, 'projectile'], spike_line: ['blast', 'orb'], gravity_well: ['deployable', 'orb', 1, 'blast'],
  sniper_nest: ['deployable', 'bolt', 1, 'projectile'], cluster_bomb: ['blast', 'pellet'], blood_altar: ['deployable', 'orb', 1, 'projectile'], cinder_mortar: ['zone', 'flame'],
  phoenix_feather: ['projectile', 'feather', 8, 'ring'], frozen_heart: ['projectile', 'shard', 8, 'ring'], static_boots: ['trail', 'spark'], venom_gland: ['projectile', 'glob'],
  rubber_charm: ['projectile', 'pellet', 1], hunters_eye: ['projectile', 'feather'], piercing_gaze: ['projectile', 'bolt', 1], repulsor_plate: ['blast', 'orb'],
  assassins_mark: ['projectile', 'dagger', 1], hydra_scale: ['projectile', 'shard', 6, 'ring'], vampire_fang: ['projectile', 'drop', 1], war_drum: ['blast', 'pellet'],
};

// An item's chain settings right now: its admin override (def.chain), else its default. Read live, so admin edits
// show up on the test canvas without restarting.
function chainOf(def) {
  const d = CHAIN_DEFAULTS[def.id] || [], o = (def.chain && typeof def.chain === 'object') ? def.chain : {}, old = CHAIN_LEGACY[o.form];
  const cat = CHAIN_CATS[o.cat] ? o.cat : old ? old[0] : CHAIN_CATS[d[0]] ? d[0] : CHAIN_SLOT[def.slot] || 'projectile';
  const ex = cat === d[0] ? d[3] : null, spread = o.spread === 'ring' || o.spread === 'aim' ? o.spread : old && old[1] ? old[1] : ex === 'ring' ? 'ring' : 'aim';
  const act = CHAIN_ACTS[o.act] ? o.act : CHAIN_ACTS[ex] ? ex : 'projectile';
  const n0 = cat === 'projectile' && spread === 'ring' ? 8 : CHAIN_CATS[cat].n;
  return { cat, spread, act, shape: o.shape || d[1] || 'orb', n: Math.max(1, Math.round(o.n || (cat === d[0] && d[2]) || n0)), size: o.size || 1, scale: o.scale ?? 1, on: CHAIN_ONS[o.on] ? o.on : 'end' };
}
const chainCol = def => def.color || EFFECTS[def.effect].color;
const chainHostOf = def => CHAIN_CATS[chainOf(def).cat].host;

// ---------------- fusion maths (shared by the run, the level-up preview and the test canvases) ----------------
// keep absorbs others into the next tier and restarts at `level`:
//   base / stats: its own base damage and per-level passive stats, plus 50% of each other one's. They grow with the new
//                 tier's multipliers and with every level, as before.
//   carry / flat: top-ups so that, right at the fusion, it hits for at least 100% of what it hit for plus 50% of what each
//                 other one hit for, and gives at least 100% of its passive stats plus 50% of theirs. Restarting at a low
//                 level can then never make it weaker; levelling it back up to 5 makes it stronger again.
//   links:        keep's links + one link per absorbed attacking item (with that item's own links as its kids).
//   riders:       every effect of the absorbed items, carried on its own bullets.
function absorb(keep, others, level) {
  const add = (m, src, k) => { for (const [s, v] of Object.entries(src || {})) if (v) m[s] = (m[s] || 0) + v * k; };
  const wantStats = {}; add(wantStats, instStats(keep), 1);
  let want = itemPower(keep);
  keep.links = (keep.links || []).slice(); keep.stats = Object.assign({}, keep.stats || {});
  for (const o of others) {
    want += 0.5 * itemPower(o); add(wantStats, instStats(o), 0.5);
    keep.base = (keep.base ?? keep.def.dmg ?? 0) + 0.5 * (o.base ?? o.def.dmg ?? 0); add(keep.stats, o.stats, 0.5);
    for (const k of instEffects(o)) if (!effectsOf(keep.def).includes(k) && !(keep.riders || []).includes(k)) (keep.riders = keep.riders || []).push(k);
    const l = makeLink(o, 1); if (l) keep.links.push(l);
    keep.gone = (keep.gone || []).concat([o.def], o.gone || []);
  }
  keep.tier = (keep.tier || 0) + 1; keep.level = level; keep.carry = 0; keep.flat = {};
  if (!isPassive(keep.def)) keep.carry = Math.max(0, want - itemPower(keep));
  const now = instStats(keep); for (const [s, v] of Object.entries(wantStats)) if (v > (now[s] || 0)) keep.flat[s] = v - (now[s] || 0);
  return keep;
}
// a link made from an absorbed item; depth 1 = on the keeper's own bullets
function makeLink(i, depth) {
  if (isPassive(i.def) || depth > CHAIN_RULES.rules.depth) return null;
  return { def: i.def, pow: itemPower(i), depth, kids: (i.links || []).map(l => relink(l, depth + 1)).filter(Boolean) };
}
function relink(l, depth) { return depth > CHAIN_RULES.rules.depth ? null : { def: l.def, pow: l.pow, depth, kids: (l.kids || []).map(k => relink(k, depth + 1)).filter(Boolean) }; }
function linkDmg(l, c) { const R = CHAIN_RULES.rules; return l.pow * R.dmg * (c ? c.scale : chainOf(l.def).scale) * Math.pow(R.kids, l.depth - 1); }

// ---------------- the engine (hooks: shoot, deploy and updateBullet in core.js, hitEnemy, the deploy loop and drawing in main.js) ----------------
const isBullet = b => !!(b.hit || b.hitMap);
const chainDmg = (l, c, k = 1) => k * linkDmg(l, c) * G.player.might;
// rate limit per link: a bucket of `rate` plays that refills at `rate` per second
function chainReady(l) {
  const R = Math.max(0.1, CHAIN_RULES.rules.rate);
  if (l.tt === undefined) { l.tt = G.time; l.tok = R; }
  l.tok = Math.min(R, l.tok + (G.time - l.tt) * R); l.tt = G.time;
  if (l.tok < 1) return false; l.tok -= 1; return true;
}
// the links a hit or a bullet triggers: what a link makes triggers its kids, what an item makes triggers its links
const linksFor = b => (b.link ? b.link.kids : b.owner && b.owner.links) || null;
// what kind of host a bullet or deployed object is (CHAIN_HOSTS), or null if links never ride it
function hostKind(h, isDeploy) {
  if (isDeploy) return h.kind === 'cloud' ? 'patch' : (h.kind === 'wave' || h.kind === 'mini' || h.kind === 'flash') ? null : 'object';
  if (h.beam || h.life < 0.05) return null;
  if (h.follow) return 'field';
  if (h.persist) return 'orbiter';
  return h.spd === 0 && !h.lob ? 'patch' : 'shot';
}
// the size of a host for its riders: a ring just outside it
function hostR(h, kind) { return kind === 'field' ? h.r : kind === 'object' ? 22 : kind === 'patch' ? Math.max(12, h.r || 0) : h.r; }
function chainAttach(b) { b.chain = linksFor(b); if (b.chain && !b.chain.length) b.chain = null; if (b.chain) chainHost(b, hostKind(b, false)); }
function chainDeploy(d) { if (linksFor(d)) chainHost(d, hostKind(d, true)); }
// links ride on the keeper's main body only (the host kind of its category); what links make carries their kids like bullets do
function chainHost(h, kind) {
  if (!kind) return;
  const L = linksFor(h); if (!L || !L.length) return;
  if (h.link) { if (kind !== 'shot') return; }
  else {
    if (chainHostOf(h.owner.def) !== kind) return;
    const H = CHAIN_HOSTS[kind];
    if (H.every && !h.kind) { if (G.time - (h.owner.patchT ?? -9) < H.every) return; h.owner.patchT = G.time; }
  }
  const rides = CHAIN_HOSTS[kind].rides;
  for (const l of L) {
    const c = chainOf(l.def); if (!rides.includes(c.cat)) continue;
    const R = CHAIN_RIDE[c.cat], tr = { l, c: rideC(c, kind), kind, t: rand(0.1, 0.6) * (R.every ? R.every(kind) : 1), a: rand(0, TAU), px: h.x, py: h.y };
    (h.rides = h.rides || []).push(tr); l.rideT = G.time;
    if (R.attach) R.attach(h, tr);
  }
}
function chainHit(b, e) {
  if (b.chainDone) return;
  const real = isBullet(b), L = real ? b.chain : linksFor(b); if (!L) return;
  if (real && !b.hitCd && !b.persist) b.chainDone = true; // a bullet pops its chain once: on its first hit, or when it runs out
  chainPop(L, b, e.x, e.y, 'hit');
}
function chainExpire(b) { if (b.chain && !b.chainDone) { b.chainDone = true; chainPop(b.chain, b, b.x, b.y, 'expire'); } }
function chainPop(L, b, x, y, kind) {
  const owner = b.owner, ang = Math.atan2(b.vy || 0, b.vx || 0);
  for (const l of L) {
    if (G.time - (l.rideT ?? -9) < 1.5) continue; // it is riding on the keeper's body right now, so it does not also pop
    const c = chainOf(l.def);
    if (c.on !== 'end' && c.on !== kind) continue;
    if (!chainReady(l)) continue;
    CHAIN_POP[c.cat](l, c, x, y, ang, owner);
  }
}
// a rider's settings: links that ride where they would otherwise pop on every hit (anything riding an aura, a placed
// object or a patch; projectiles and arcs riding orbiting shots) hit CHAIN_RULES.rules.ride × harder
const BODIES = { field: 1, object: 1, patch: 1 };
const rideBoost = (c, kind) => BODIES[kind] || (kind === 'orbiter' && (c.cat === 'projectile' || c.cat === 'arc'));
const rideC = (c, kind) => rideBoost(c, kind) ? Object.assign({}, c, { scale: c.scale * (CHAIN_RULES.rules.ride ?? 1.5) }) : c;
// riders tick while their host lives (bullets: updateBullet, deployed objects: the deploy loop in main.js)
function chainRide(h, dt) {
  for (const tr of h.rides) {
    tr.l.rideT = G.time; tr.a += dt * 1.6;
    const R = CHAIN_RIDE[tr.c.cat]; if (!R.tick) continue;
    tr.t -= dt; if (tr.t > 0) continue;
    tr.c = rideC(chainOf(tr.l.def), tr.kind); tr.t = R.every(tr.kind);
    R.tick(h, tr, hostR(h, tr.kind));
    tr.px = h.x; tr.py = h.y;
  }
}
// a bullet made by a link: its hits trigger the link's kids
function kidShot(l, c, owner, o) {
  return shoot(Object.assign({ owner, link: l, effect: l.def.effect, color: chainCol(l.def), dmg: chainDmg(l, c), shape: c.shape, noTrig: true, r: 4.5 * c.size }, o));
}
const homes = l => l.def.effect === 'homing';
// the point on a host's rim facing (tx, ty): auras fire from their edge, everything else from its centre
function rimPoint(h, tr, R, tx, ty) { if (tr.kind !== 'field') return { x: h.x, y: h.y }; const a = angTo(h.x, h.y, tx, ty); return { x: h.x + Math.cos(a) * R, y: h.y + Math.sin(a) * R }; }

// ---- pops: a one-off at a point ----
const CHAIN_POP = {
  projectile(l, c, x, y, ang, owner) {
    if (c.spread === 'ring') { const a0 = rand(0, TAU); for (let k = 0; k < c.n; k++) kidShot(l, c, owner, { x, y, ang: a0 + k * TAU / c.n, spd: 300, r: 4 * c.size, life: 0.45 }); return; }
    const e = nearest(x, y, 420), a = e ? angTo(x, y, e.x, e.y) : ang;
    for (let k = 0; k < c.n; k++) kidShot(l, c, owner, { x, y, ang: a + (k - (c.n - 1) / 2) * 0.22, spd: 470, life: 0.6, home: homes(l) ? 5 : 0 });
  },
  orbital(l, c, x, y, ang, owner) {
    const a0 = rand(0, TAU), center = { x, y };
    for (let k = 0; k < c.n; k++) kidShot(l, c, owner, { x, y, orbit: { center, r: 8, grow: 120 * c.size, w: 5.5, a: a0 + k * TAU / c.n }, hitCd: 0.3, life: 0.9, r: 5 * c.size, noMods: true });
  },
  aura(l, c, x, y, ang, owner) {
    const dmg = chainDmg(l, c), r = 48 * c.size * Math.sqrt(G.player.area);
    deploy({ x, y, life: 0.7, r, kind: 'flash', color: chainCol(l.def), owner, link: l, tick: 0, update(d, dt) { d.tick -= dt; if (d.tick <= 0) { d.tick = 0.3; strike(d.x, d.y, d.r, dmg, l.def.effect, { noFx: true, raw: true, owner, link: l }); } } });
  },
  deployable(l, c, x, y, ang, owner) {
    l.minis = (l.minis || []).filter(d => !d.dead); if (l.minis.length >= 3) return;
    l.minis.push(deploy({ x, y, life: 3, kind: 'mini', icon: l.def.icon, color: chainCol(l.def), owner, link: l, tick: 0.2, update(d, dt) { d.tick -= dt; if (d.tick > 0) return; d.tick = 0.8; chainAct(l, chainOf(l.def), d.x, d.y, owner); } }));
  },
  trail(l, c, x, y, ang, owner) {
    for (let k = 0; k < 5; k++) kidShot(l, c, owner, { x: x + Math.cos(ang) * k * 14, y: y + Math.sin(ang) * k * 14, spd: 0, life: 0.8, hitCd: 0.45, r: 6 * c.size, dmg: chainDmg(l, c, 0.5), noMods: true });
  },
  zone(l, c, x, y, ang, owner) {
    const dmg = chainDmg(l, c);
    deploy({ x, y, life: 1.8, r: 36 * c.size * Math.sqrt(G.player.area), kind: 'cloud', color: chainCol(l.def), owner, link: l, update(d, dt) { d.tick -= dt; if (d.tick <= 0) { d.tick = 0.45; strike(d.x, d.y, d.r, dmg, l.def.effect, { noFx: true, raw: true, owner, link: l }); } } });
  },
  blast(l, c, x, y, ang, owner) { strike(x, y, 46 * c.size, chainDmg(l, c, 2), l.def.effect, { owner, link: l, color: chainCol(l.def), kb: l.def.effect === 'knockback' ? 40 : 0 }); },
  arc(l, c, x, y, ang, owner) { chainArc(l, c, x, y, owner, c.n, 170 * c.size); },
};
function chainArc(l, c, x, y, owner, n, range) {
  const dmg = chainDmg(l, c), seen = new Set(), col = chainCol(l.def); let cx = x, cy = y, any = false;
  for (let k = 0; k < n; k++) {
    const e = nearest(cx, cy, range, seen); if (!e) break; seen.add(e.id); any = true;
    fxBolt(cx, cy, e.x, e.y, col); hitEnemy(e, { dmg, effect: l.def.effect, vx: e.x - cx, vy: e.y - cy, x: cx, y: cy, owner, link: l, noChain: true }); cx = e.x; cy = e.y;
  }
  return any;
}
// what a deployable link's small objects do, from (x, y): blasts and patches land on the nearest enemy, the rest start here
function chainAct(l, c, x, y, owner) {
  const act = c.act, e = nearest(x, y, act === 'arc' ? 170 : 220); if (!e) return;
  const far = act === 'blast' || act === 'zone' || act === 'aura', cc = Object.assign({}, c, { n: act === 'projectile' ? 2 : CHAIN_CATS[act].n, spread: 'aim' });
  CHAIN_POP[act](l, cc, far ? e.x : x, far ? e.y : y, angTo(x, y, e.x, e.y), owner);
}

// ---- rides: a visible part of a host that acts while the host lives. every(kind) = seconds between actions ----
const CHAIN_RIDE = {
  aura: {
    every: k => k === 'shot' ? 0.4 : 0.5,
    tick(h, tr, R) { strike(h.x, h.y, auraR(h, tr, R), chainDmg(tr.l, tr.c), tr.l.def.effect, { noFx: true, raw: true, owner: h.owner, link: tr.l }); },
    draw(h, tr, x, y, R, col) {
      const r = auraR(h, tr, R), big = tr.kind !== 'shot';
      ctx.globalAlpha = big ? 0.1 : 0.16; ctx.fillStyle = col; circle(x, y, r);
      ctx.globalAlpha = 0.6; ctx.strokeStyle = col; ctx.lineWidth = big ? 2.5 : 1.5;
      ctx.beginPath(); ctx.arc(x, y, r, tr.a * 2, tr.a * 2 + TAU * 0.75); ctx.stroke();
      if (big) { ctx.globalAlpha = 0.85; ctx.fillStyle = col; for (let k = 0; k < 5; k++) { const a = -tr.a + k * TAU / 5; circle(x + Math.cos(a) * r, y + Math.sin(a) * r, 2.5); } }
    },
  },
  orbital: {
    attach(h, tr) {
      const c = tr.c, n = tr.kind === 'shot' ? Math.min(3, c.n) : c.n, rim = tr.kind === 'field' ? h.r : (14 + hostR(h, tr.kind)) * c.size;
      const life = h.persist || !isFinite(h.life) ? Infinity : Math.max(0.1, (h.life - h.t) / G.player.duration + 0.6); // outlives its host a little, to spin outward
      for (let k = 0; k < n; k++) kidShot(tr.l, c, h.owner, { x: h.x, y: h.y, orbit: { center: h, r: rim / Math.sqrt(G.player.area), w: tr.kind === 'field' ? -2.4 : 6, a: k * TAU / n, free: life !== Infinity, pulse: tr.kind === 'object' || tr.kind === 'patch' ? 2.5 : 0 }, hitCd: 0.3, life, persist: life === Infinity, r: (tr.kind === 'shot' ? 3.5 : 5) * c.size, noMods: true });
    },
    draw(h, tr, x, y, R, col) { if (tr.kind === 'shot' || tr.kind === 'orbiter') return; ctx.globalAlpha = 0.18; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, tr.kind === 'field' ? h.r : (14 + R) * tr.c.size, 0, TAU); ctx.stroke(); },
  },
  trail: {
    every: k => k === 'shot' || k === 'orbiter' ? 0.09 : 0.16,
    tick(h, tr, R) {
      const moved = d2(h.x, h.y, tr.px, tr.py) > 36, l = tr.l, c = tr.c; let x = h.x, y = h.y;
      if (!moved) { if ((tr.still = (tr.still || 0) + 1) % 3) return; x += Math.cos(tr.a * 2) * (R + 12); y += Math.sin(tr.a * 2) * (R + 12); } // standing still: smoulders in a ring
      kidShot(l, c, h.owner, { x, y, spd: 0, life: 0.8, hitCd: 0.45, r: 6 * c.size, dmg: chainDmg(l, c, 0.5), noMods: true });
    },
  },
  projectile: {
    every: k => k === 'orbiter' ? 0.9 : 0.4,
    tick(h, tr, R) {
      const e = nearest(h.x, h.y, 420); if (!e || !chainReady(tr.l)) return;
      const p = rimPoint(h, tr, R, e.x, e.y); CHAIN_POP.projectile(tr.l, tr.c, p.x, p.y, angTo(p.x, p.y, e.x, e.y), h.owner);
      fxRing(p.x, p.y, 16, chainCol(tr.l.def), 0.2, 2);
    },
    draw(h, tr, x, y, R, col) { // little launchers on the rim
      if (tr.kind === 'orbiter') return; ctx.globalAlpha = 0.8; ctx.fillStyle = col; const r = R + 7;
      for (let k = 0; k < 3; k++) { const a = tr.a + k * TAU / 3; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * (r + 7), y + Math.sin(a) * (r + 7)); ctx.lineTo(x + Math.cos(a + 0.18) * r, y + Math.sin(a + 0.18) * r); ctx.lineTo(x + Math.cos(a - 0.18) * r, y + Math.sin(a - 0.18) * r); ctx.fill(); }
    },
  },
  arc: {
    every: k => k === 'orbiter' ? 0.8 : 0.45,
    tick(h, tr, R) {
      const e = nearest(h.x, h.y, R + 150); if (!e || !chainReady(tr.l)) return;
      const p = rimPoint(h, tr, R, e.x, e.y); chainArc(tr.l, tr.c, p.x, p.y, h.owner, tr.c.n, R + 150);
    },
    draw(h, tr, x, y, R, col) { // crackling sparks on the rim
      ctx.globalAlpha = 0.75; ctx.strokeStyle = col; ctx.lineWidth = 1.5; const r = R + 5;
      for (let k = 0; k < 2; k++) { const a = rand(0, TAU); let px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; ctx.beginPath(); ctx.moveTo(px, py);
        for (let s = 1; s <= 3; s++) { const b = a + s * 0.18; px = x + Math.cos(b) * (r + rand(-5, 5)); py = y + Math.sin(b) * (r + rand(-5, 5)); ctx.lineTo(px, py); } ctx.stroke(); }
    },
  },
  blast: {
    every: () => 1.2,
    tick(h, tr, R) {
      const r = (R + 46) * tr.c.size; if (!enemiesNear(h.x, h.y, r).length || !chainReady(tr.l)) { tr.t = 0.25; return; }
      strike(h.x, h.y, r, chainDmg(tr.l, tr.c, 2), tr.l.def.effect, { raw: true, owner: h.owner, link: tr.l, color: chainCol(tr.l.def), kb: tr.l.def.effect === 'knockback' ? 40 : 0 });
      fxRing(h.x, h.y, r * 1.15, chainCol(tr.l.def), 0.4, 5);
    },
    draw(h, tr, x, y, R, col) { // a ring that charges up before each pulse
      if (tr.kind === 'orbiter') return; const p = 1 - clamp(tr.t / 1.2, 0, 1);
      ctx.globalAlpha = 0.1 + 0.3 * p; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, Math.max(1, (R + 46) * tr.c.size * p), 0, TAU); ctx.stroke();
    },
  },
  zone: {
    every: () => 1.4,
    tick(h, tr, R) {
      const e = nearest(h.x, h.y, R + 40); if (!e || !chainReady(tr.l)) return;
      const far = tr.kind === 'field'; CHAIN_POP.zone(tr.l, tr.c, far ? e.x : h.x, far ? e.y : h.y, 0, h.owner);
    },
    draw(h, tr, x, y, R, col) { if (tr.kind === 'field') return; ctx.globalAlpha = 0.1; ctx.fillStyle = col; circle(x, y, R + 12); },
  },
  deployable: {
    every: () => 0.9,
    tick(h, tr, R) { if (!chainReady(tr.l)) return; for (const p of miniSpots(h, tr, R)) chainAct(tr.l, tr.c, p.x, p.y, h.owner); },
    draw(h, tr, x, y, R, col) {
      const dx = x - h.x, dy = y - h.y;
      ctx.font = '12px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const p of miniSpots(h, tr, R)) { ctx.globalAlpha = 0.3; ctx.fillStyle = col; circle(p.x + dx, p.y + dy, 9); ctx.globalAlpha = 1; ctx.fillText(tr.l.def.icon, p.x + dx, p.y + dy + 1); }
    },
  },
};
function auraR(h, tr, R) { return (tr.kind === 'shot' || tr.kind === 'orbiter' ? 20 + h.r : tr.kind === 'object' ? R + 40 : R + 14) * tr.c.size; }
// where a deployable link's small objects sit on a host: its count (one more on an aura), circling just outside it
function miniSpots(h, tr, R) { const n = Math.min(4, tr.c.n + (tr.kind === 'field' ? 1 : 0)), r = R + 16, out = []; for (let k = 0; k < n; k++) { const a = tr.a * 0.7 + k * Math.PI; out.push({ x: h.x + Math.cos(a) * r, y: h.y + Math.sin(a) * r }); } return out; }
// riders are drawn around their host (drawBullet and the deploy loop in main.js call this); x, y = the host on screen
function drawChainRides(h, x, y) {
  for (const tr of h.rides) {
    const R = CHAIN_RIDE[tr.c.cat]; if (!R.draw) continue;
    R.draw(h, tr, x, y, hostR(h, tr.kind), chainCol(tr.l.def));
    ctx.globalAlpha = 1;
  }
}

// ---------------- words ----------------
// how link category `cat` chains onto a host of kind `kind`: 'ride' or 'pop' (the pair rule)
const chainPair = (kind, cat) => CHAIN_HOSTS[kind].rides.includes(cat) ? 'ride' : 'pop';
// what the things a link makes count as, for its kids: bullets for projectiles and orbitals, strike points otherwise
const kidHost = cat => cat === 'projectile' || cat === 'orbital' ? 'shot' : 'impact';
// one sentence: how link l (settings c) plays on a host of kind `kind` whose item has icon `icon`
function chainSentence(c, kind, icon, linkIcon, kid) {
  const C = CHAIN_CATS[c.cat], hostName = kind === 'object' && icon ? `each ${icon} it places` : kind === 'shot' && kid ? 'each shot' : CHAIN_HOSTS[kind].name;
  const fill = t => t.replace('{h}', hostName).replace('{i}', linkIcon).replace('{a}', CHAIN_ACTS[c.act]);
  if (chainPair(kind, c.cat) === 'ride') { const t = fill(typeof C.ride === 'string' ? C.ride : C.ride[c.spread]); return t[0].toUpperCase() + t.slice(1); }
  const when = kind === 'shot' || kind === 'orbiter' ? `When ${kid ? 'a shot' : kind === 'shot' ? 'a bullet' : 'an orbiting shot'} ${kind === 'shot' ? CHAIN_ONS[c.on] : 'hits'}` : kind === 'impact' ? 'Where it strikes' : 'Where it hits';
  return `${when}, it ${fill(typeof C.pop === 'string' ? C.pop : C.pop[c.spread])}`;
}
// one line per link, nested links indented: "⭕ Cinder Ring ◎: its shots circle each 🗼 it places (12 dmg)"
// host = the keeper's def (sets which links ride and which pop); kids are described on what their link makes
function chainLines(links, might = 1, host = null, pad = '', kind = null) {
  const out = [], K = kind || (host ? chainHostOf(host) : 'shot');
  for (const l of links || []) {
    const c = chainOf(l.def), C = CHAIN_CATS[c.cat], ride = chainPair(K, c.cat) === 'ride';
    const many = c.n > 1 && !ride && (c.cat === 'projectile' || c.cat === 'orbital' || c.cat === 'arc');
    out.push(`${pad}${l.def.icon} ${l.def.name} ${C.icon}: ${chainSentence(c, K, host && !pad ? host.icon : '', l.def.icon, !!pad)} (${Math.round(linkDmg(l, ride ? rideC(c, K) : c) * might)} dmg${many ? ` × ${c.n}` : ''})`);
    out.push(...chainLines(l.kids, might, null, pad + '↳ ', kidHost(c.cat)));
  }
  return out;
}
const chainHtml = (links, might, host) => chainLines(links, might, host).map(t => `<div class="chainLn">${t.replace(/^((?:↳ )+)/, m => `<i>${m}</i>`)}</div>`).join('');
// how an item chains when absorbed, in words (Codex, item detail)
function chainAbout(def) {
  const c = chainOf(def), C = CHAIN_CATS[c.cat], onShots = chainPair('shot', c.cat) === 'ride';
  return `${C.icon} ${C.name}${c.cat === 'deployable' ? ` (its small copies ${CHAIN_ACTS[c.act]})` : ''}. Absorbed into another item, it rides on that item's aura, placed objects or patches${onShots ? ', and on each of its bullets' : ', and pops where its bullets or strikes hit'}.`;
}
