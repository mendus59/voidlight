'use strict';
// ===== VOIDLIGHT fusion chains =====
// When items fuse, the item that remains (the keeper) absorbs the others. Each absorbed attacking item becomes a LINK on the
// keeper: its own attack, in a small form, played from (or riding on) the keeper's attacks, at 50% of the damage it did.
// Ideas from spell-chaining games: the engine never knows about pairs of items. Every item only says which FORM its link
// takes (CHAIN_DEFAULTS below, or its `chain` field from the admin page), and a form only knows how to play itself at a point
// or on a bullet. Any item can carry any other, and Super and Mega fusions just nest the same thing:
//   * "end" forms (volley, burst, ring, zone, arc, blast) play where a keeper's bullet first hits an enemy or expires,
//     and where its area hits (strikes, zaps, clouds) land.
//   * "travel" forms (halo, satellites, trail) ride on each keeper bullet while it flies. A keeper without bullets plays
//     their `alt` end form instead.
//   * A link keeps the links of the item it came from as its KIDS, and the bullets a link makes trigger those kids. So a
//     Super item's absorbed Fused item still plays its own chain, one step further out; a Mega goes three steps deep.
// Every link has a rate limit (CHAIN_RULES.rules.rate plays per second), so fast weapons and orbitals can't flood the screen.
// Loaded after items.js and before content.js (the admin page edits CHAIN_RULES and each item's `chain`, both in items.js).

// The tunable rules (CHAIN_RULES) live in items.js, so the admin page can export them.

// The forms. n = default count. alt = the end form a travel form plays when its keeper has no bullets.
const CHAIN_FORMS = {
  volley: { name: 'Volley', n: 3, text: 'fires a small volley of its shots at the nearest enemy' },
  burst:  { name: 'Burst', n: 8, text: 'bursts into a ring of its shots' },
  ring:   { name: 'Orbit ring', n: 5, text: 'its shots spin outward in a widening orbit' },
  zone:   { name: 'Zone', n: 1, text: 'leaves a lingering patch that keeps hurting' },
  zap:    { name: 'Arc', n: 3, text: 'arcs lightning to nearby enemies' },
  blast:  { name: 'Blast', n: 1, text: 'blasts the area around it' },
  halo:   { name: 'Halo', n: 1, travel: true, alt: 'blast', text: 'a halo rides on each bullet and hurts what it passes' },
  sats:   { name: 'Satellites', n: 2, travel: true, alt: 'ring', text: 'small copies circle each bullet' },
  trail:  { name: 'Trail', n: 1, travel: true, alt: 'zone', text: 'each bullet leaves a trail behind it' },
};
const CHAIN_FORM_KEYS = Object.keys(CHAIN_FORMS);
// when an end form plays: 'end' = first hit or expiry, 'hit' = only on a hit, 'expire' = only when the bullet runs out
const CHAIN_ONS = { end: 'hits or expires', hit: 'hits an enemy', expire: 'runs out' };
// Default form and bullet shape of each attacking item's link: [form, shape, count?]. Items not listed use their slot's form.
const CHAIN_SLOT = { weapon: 'volley', spell: 'burst', orbit: 'ring', trap: 'zone', relic: 'burst' };
const CHAIN_DEFAULTS = {
  ember_pistol: ['volley', 'orb'], frost_fan: ['volley', 'shard', 4], arc_rifle: ['zap', 'bolt'], thorn_spitter: ['volley', 'shard'],
  ricochet_disc: ['burst', 'disc', 4], seeker_swarm: ['volley', 'missile'], boomerang_glaive: ['burst', 'glaive', 3], scrap_blaster: ['burst', 'pellet', 10],
  helix_cannon: ['volley', 'orb', 2], splitter_orb: ['burst', 'shard', 6], blood_lance: ['volley', 'lance', 1], rime_lance: ['burst', 'shard', 8],
  shard_cannon: ['burst', 'shard', 5], deadeye_bow: ['volley', 'bolt', 1],
  flame_nova: ['burst', 'orb', 10], blizzard: ['blast', 'shard'], thunder_call: ['zap', 'bolt', 4], plague_cloud: ['zone', 'spore'],
  prism_shard: ['volley', 'prism', 2], star_fall: ['volley', 'star'], spiral_sigil: ['ring', 'shard', 6], shockwave: ['blast', 'orb'],
  judgment_cross: ['burst', 'lance', 4], fractal_bloom: ['burst', 'petal', 5], soul_leech: ['burst', 'skull', 6], mirror_storm: ['burst', 'prism', 6],
  comet_lash: ['volley', 'missile', 2], crimson_tide: ['blast', 'orb'],
  cinder_ring: ['ring', 'orb'], frost_halo: ['halo', 'aura'], storm_sprite: ['zap', 'bolt', 2], venom_moth: ['trail', 'spore'],
  pinball_wisp: ['sats', 'wisp'], owl_familiar: ['volley', 'feather'], blade_wheel: ['ring', 'blade', 3], guardian_shield: ['sats', 'shield'],
  fortune_orbs: ['ring', 'coin', 4], gemini_satellites: ['sats', 'sat'], bat_swarm: ['ring', 'bat', 6], arc_halo: ['ring', 'spark', 4],
  fire_trail: ['trail', 'flame'], ice_mine: ['blast', 'shard'], tesla_coil: ['zap', 'bolt', 3], spore_pod: ['zone', 'spore'],
  bumper_totem: ['burst', 'disc', 4], hunter_turret: ['volley', 'missile', 2], spike_line: ['blast', 'orb'], gravity_well: ['blast', 'orb'],
  sniper_nest: ['volley', 'bolt', 1], cluster_bomb: ['burst', 'pellet', 6], blood_altar: ['burst', 'orb', 6], cinder_mortar: ['zone', 'flame'],
  phoenix_feather: ['burst', 'feather', 8], frozen_heart: ['burst', 'shard', 8], static_boots: ['trail', 'spark'], venom_gland: ['volley', 'glob'],
  rubber_charm: ['volley', 'pellet', 1], hunters_eye: ['volley', 'feather'], piercing_gaze: ['volley', 'bolt', 1], repulsor_plate: ['blast', 'orb'],
  assassins_mark: ['volley', 'dagger', 1], hydra_scale: ['burst', 'shard', 6], vampire_fang: ['volley', 'drop', 1], war_drum: ['blast', 'pellet'],
};

// An item's chain settings right now: its admin override (def.chain), else its default. Read live, so admin edits
// show up on the test canvas without restarting.
function chainOf(def) {
  const d = CHAIN_DEFAULTS[def.id] || [], o = (def.chain && typeof def.chain === 'object') ? def.chain : {};
  const form = CHAIN_FORMS[o.form] ? o.form : CHAIN_FORMS[d[0]] ? d[0] : CHAIN_SLOT[def.slot] || 'burst', F = CHAIN_FORMS[form];
  return { form, shape: o.shape || d[1] || 'orb', n: Math.max(1, Math.round(o.n || d[2] || F.n)), size: o.size || 1, scale: o.scale ?? 1, on: CHAIN_ONS[o.on] ? o.on : 'end' };
}
const chainCol = def => def.color || EFFECTS[def.effect].color;

// ---------------- fusion maths (shared by the run, the level-up preview and the test canvases) ----------------
// keep absorbs others into the next tier and restarts at `level`:
//   carry  = 100% of what keep hit for + 50% of what each other one hit for (flat damage on top of its own growth),
//   flat   = 100% of keep's passive stats right now + 50% of each other one's (kept on top of its own per-level stats),
//   links  = keep's links + one link per absorbed attacking item (with that item's own links as its kids),
//   riders = every effect of the absorbed items, carried on its own bullets.
// So the item that remains is always at least as strong as it was, and never loses anything it carried.
function absorb(keep, others, level) {
  const add = (m, src, k) => { for (const [s, v] of Object.entries(src)) if (v) m[s] = (m[s] || 0) + v * k; };
  const flat = {}; add(flat, instStats(keep), 1);
  let carry = itemPower(keep);
  keep.links = (keep.links || []).slice();
  for (const o of others) {
    carry += 0.5 * itemPower(o); add(flat, instStats(o), 0.5);
    for (const k of instEffects(o)) if (!effectsOf(keep.def).includes(k) && !(keep.riders || []).includes(k)) (keep.riders = keep.riders || []).push(k);
    const l = makeLink(o, 1); if (l) keep.links.push(l);
    keep.gone = (keep.gone || []).concat([o.def], o.gone || []);
  }
  keep.carry = isPassive(keep.def) ? 0 : carry; keep.flat = flat;
  keep.tier = (keep.tier || 0) + 1; keep.level = level;
  return keep;
}
// a link made from an absorbed item; depth 1 = on the keeper's own bullets
function makeLink(i, depth) {
  if (isPassive(i.def) || depth > CHAIN_RULES.rules.depth) return null;
  return { def: i.def, pow: itemPower(i), depth, kids: (i.links || []).map(l => relink(l, depth + 1)).filter(Boolean) };
}
function relink(l, depth) { return depth > CHAIN_RULES.rules.depth ? null : { def: l.def, pow: l.pow, depth, kids: (l.kids || []).map(k => relink(k, depth + 1)).filter(Boolean) }; }
function linkDmg(l, c) { const R = CHAIN_RULES.rules; return l.pow * R.dmg * (c ? c.scale : chainOf(l.def).scale) * Math.pow(R.kids, l.depth - 1); }

// ---------------- the engine (hooks in core.js: shoot, updateBullet, hitEnemy) ----------------
const isBullet = b => !!(b.hit || b.hitMap);
// rate limit per link: a bucket of `rate` plays that refills at `rate` per second
function chainReady(l) {
  const R = Math.max(0.1, CHAIN_RULES.rules.rate);
  if (l.tt === undefined) { l.tt = G.time; l.tok = R; }
  l.tok = Math.min(R, l.tok + (G.time - l.tt) * R); l.tt = G.time;
  if (l.tok < 1) return false; l.tok -= 1; return true;
}
// the links a hit or a bullet triggers: a link's own bullets trigger its kids, an item's bullets trigger its links
const linksFor = b => (b.link ? b.link.kids : b.owner && b.owner.links) || null;
function chainAttach(b) {
  const L = linksFor(b); b.chain = L && L.length ? L : null; if (!b.chain) return;
  if (b.owner && !b.link) b.owner.shotT = G.time;
  for (const l of b.chain) {
    const c = chainOf(l.def), F = CHAIN_FORMS[c.form];
    if (!F.travel || b.beam || b.life < 0.05) continue;
    (b.travel = b.travel || []).push({ l, c, t: 0 }); if (F.attach) F.attach(b, l, c);
  }
}
function chainHit(b, e) {
  if (b.chainDone) return;
  const real = isBullet(b), L = real ? b.chain : linksFor(b); if (!L) return;
  if (real && !b.hitCd && !b.persist) b.chainDone = true; // a bullet plays its chain once: on its first hit, or when it runs out
  chainPlay(L, b, e.x, e.y, 'hit', real);
}
function chainExpire(b) { if (b.chain && !b.chainDone) { b.chainDone = true; chainPlay(b.chain, b, b.x, b.y, 'expire', true); } }
function chainPlay(L, b, x, y, kind, real) {
  const owner = b.owner, ang = Math.atan2(b.vy || 0, b.vx || 0);
  for (const l of L) {
    const c = chainOf(l.def); let F = CHAIN_FORMS[c.form];
    if (F.travel) { // travel links ride on bullets; only a keeper that has not fired a bullet lately plays their end form
      if (real || (owner && owner.shotT !== undefined && G.time - owner.shotT < 2)) continue;
      F = CHAIN_FORMS[F.alt];
    } else if (c.on !== 'end' && c.on !== kind) continue;
    if (!chainReady(l)) continue;
    F.play(l, c, x, y, ang, owner);
  }
}
function chainTravel(b, dt) {
  for (const tr of b.travel) { tr.t -= dt; if (tr.t > 0) continue; tr.c = chainOf(tr.l.def); const F = CHAIN_FORMS[tr.c.form]; tr.t = F.every || 0.5; if (F.tick) F.tick(b, tr.l, tr.c); }
}
// a bullet made by a link: its hits trigger the link's kids
function kidShot(l, c, owner, o) {
  if (G.seen) G.seen.add(c.shape);
  return shoot(Object.assign({ owner, link: l, effect: l.def.effect, color: chainCol(l.def), dmg: linkDmg(l, c) * G.player.might, shape: c.shape, noTrig: true, r: 4.5 * c.size }, o));
}
const homes = l => l.def.effect === 'homing';
CHAIN_FORMS.volley.play = (l, c, x, y, ang, owner) => {
  const e = nearest(x, y, 420), a = e ? angTo(x, y, e.x, e.y) : ang;
  for (let k = 0; k < c.n; k++) kidShot(l, c, owner, { x, y, ang: a + (k - (c.n - 1) / 2) * 0.22, spd: 470, life: 0.6, home: homes(l) ? 5 : 0 });
};
CHAIN_FORMS.burst.play = (l, c, x, y, ang, owner) => { const a0 = rand(0, TAU); for (let k = 0; k < c.n; k++) kidShot(l, c, owner, { x, y, ang: a0 + k * TAU / c.n, spd: 300, r: 4 * c.size, life: 0.45 }); };
CHAIN_FORMS.ring.play = (l, c, x, y, ang, owner) => {
  const a0 = rand(0, TAU), center = { x, y };
  for (let k = 0; k < c.n; k++) kidShot(l, c, owner, { x, y, orbit: { center, r: 8, grow: 120 * c.size, w: 5.5, a: a0 + k * TAU / c.n }, hitCd: 0.3, life: 0.9, r: 5 * c.size, noMods: true });
};
CHAIN_FORMS.zone.play = (l, c, x, y, ang, owner) => {
  const dmg = linkDmg(l, c) * G.player.might;
  deploy({ x, y, life: 1.8, r: 36 * c.size * Math.sqrt(G.player.area), kind: 'cloud', color: chainCol(l.def), update(d, dt) { d.tick -= dt; if (d.tick <= 0) { d.tick = 0.45; strike(d.x, d.y, d.r, dmg, l.def.effect, { noFx: true, raw: true, owner, link: l }); } } });
};
CHAIN_FORMS.zap.play = (l, c, x, y, ang, owner) => {
  const dmg = linkDmg(l, c) * G.player.might, seen = new Set(); let cx = x, cy = y;
  for (let k = 0; k < c.n; k++) {
    const e = nearest(cx, cy, 170 * c.size, seen); if (!e) break; seen.add(e.id);
    fxBolt(cx, cy, e.x, e.y, chainCol(l.def)); hitEnemy(e, { dmg, effect: l.def.effect, vx: e.x - cx, vy: e.y - cy, x: cx, y: cy, owner, link: l, noChain: true }); cx = e.x; cy = e.y;
  }
};
CHAIN_FORMS.blast.play = (l, c, x, y, ang, owner) => strike(x, y, 46 * c.size, 2 * linkDmg(l, c) * G.player.might, l.def.effect, { owner, link: l, color: chainCol(l.def), kb: l.def.effect === 'knockback' ? 40 : 0 });
// travel forms: tick runs every `every` seconds while the bullet flies
CHAIN_FORMS.halo.every = 0.4;
CHAIN_FORMS.halo.tick = (b, l, c) => strike(b.x, b.y, (20 + b.r) * c.size, linkDmg(l, c) * G.player.might, l.def.effect, { noFx: true, raw: true, owner: b.owner, link: l });
CHAIN_FORMS.sats.attach = (b, l, c) => {
  for (let k = 0; k < c.n; k++) kidShot(l, c, b.owner, { x: b.x, y: b.y, orbit: { center: b, r: (14 + b.r) * c.size, w: 7, a: k * TAU / c.n }, hitCd: 0.3, life: b.persist ? Infinity : b.life + 0.05, persist: b.persist, r: 3.5 * c.size, noMods: true });
};
CHAIN_FORMS.trail.every = 0.09;
CHAIN_FORMS.trail.tick = (b, l, c) => kidShot(l, c, b.owner, { x: b.x, y: b.y, spd: 0, life: 0.7, hitCd: 0.45, r: 6 * c.size, dmg: 0.5 * linkDmg(l, c) * G.player.might, noMods: true });
// halos are drawn around the bullet (main.js drawBullet calls this)
function drawChainTravel(b, x, y) {
  for (const tr of b.travel) {
    if (tr.c.form !== 'halo') continue;
    const r = (20 + b.r) * tr.c.size, col = chainCol(tr.l.def);
    ctx.globalAlpha = 0.16; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.55; ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r, b.t * 4, b.t * 4 + TAU * 0.75); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

// ---------------- words ----------------
// one line per link, nested links indented: "⭕ Cinder Ring: its shots spin outward ... (12 dmg)"
function chainLines(links, might = 1, pad = '') {
  const out = [];
  for (const l of links || []) {
    const c = chainOf(l.def), F = CHAIN_FORMS[c.form];
    const when = F.travel ? 'while each bullet flies' : `when a ${pad ? 'shot' : 'bullet'} ${CHAIN_ONS[c.on]}`;
    out.push(`${pad}${l.def.icon} ${l.def.name}: ${when}, ${F.text} (${Math.round(linkDmg(l, c) * might)} dmg${c.n > 1 && !F.travel ? ` × ${c.n}` : ''})`);
    out.push(...chainLines(l.kids, might, pad + '↳ '));
  }
  return out;
}
const chainHtml = (links, might) => chainLines(links, might).map(t => `<div class="chainLn">${t.replace(/^((?:↳ )+)/, m => `<i>${m}</i>`)}</div>`).join('');
