'use strict';
// ===== VOIDLIGHT zones: themed areas of immune enemies guarded by a Warden =====
// Each level places a few zones (ZONES / ZONE_RULES in items.js) at anchor points of its map (world.js). A zone's enemies are
// immune to every damage type but the zone's two (`only`, the first is also a weakness), never leave the zone, and drop the
// zone's Essence; a Warden in the middle drops Essences, Catalysts and a big chest and clears the zone. Zones are optional:
// walk around them. Every zone shows on the minimap and the pause map only once the level's Map is found.
// A level can also hold one sealed rift: a zone from a later level, opened for good by clearing that zone where it belongs.
// Zone enemy types are made here from the themes below and put into ENEMY_TYPES, so the Bestiary and the Fusion Lab list
// them like any other enemy. Loaded after world.js and before materials.js and main.js.

// the enemies of every zone: base stats before ZONE_RULES.hp (Warden: wardenHp) and the run's own growth
const ZONE_FOES = {
  warder:  { suffix: 'Warder',  hp: 40, spd: 62,  r: 17, dmg: 13, xp: 4,  shape: 'square', role: 'heavy', mass: 3 },
  striker: { suffix: 'Striker', hp: 18, spd: 115, r: 11, dmg: 10, xp: 3,  shape: 'arrow', role: 'fast', charge: { range: 320, cd: 2.8, spd: 460, time: 0.45 } },
  caster:  { suffix: 'Caster',  hp: 28, spd: 52,  r: 14, dmg: 9,  xp: 4,  shape: 'star4', role: 'ranged', ranged: { range: 330, cd: 3.2, pat: 'ring', n: 10 } },
  warden:  { suffix: 'Warden',  hp: 60, spd: 48,  r: 30, dmg: 20, xp: 40, shape: 'oct', role: 'heavy', mass: 20, ranged: { range: 460, cd: 2.4, pat: 'ring', n: 16 }, codex: { study: 120, master: 400, kills: 5 } },
};
const zoneFoeId = (z, k) => `z_${z}_${k}`;
// (re)make the zone enemy types from ZONES, so an admin edit of a zone reaches its enemies
function buildZoneFoes() {
  for (const [z, Z] of Object.entries(ZONES)) {
    const E = EFFECTS[Z.element], only = (Z.only || []).filter(k => k in EFFECTS);
    for (const [k, F] of Object.entries(ZONE_FOES)) {
      const T = Object.assign({}, F, { name: `${Z.prefix || Z.name} ${F.suffix}`, color: E ? E.color : '#ffffff', only, weak: only.slice(0, 1), zone: z, guard: true, warden: k === 'warden' });
      delete T.suffix; if (!F.codex) delete T.codex;
      ENEMY_TYPES[zoneFoeId(z, k)] = T;
    }
  }
}
buildZoneFoes();

const zoneKey = (stage, z) => stage + ':' + z;
const zoneClears = (s, stage, z) => (s.zonesCleared || {})[zoneKey(stage, z)] || 0;
// cleared in the level it belongs to (or any later one): what opens its sealed rifts
const zoneOpened = (s, z) => Object.entries(s.zonesCleared || {}).some(([k, n]) => n > 0 && k.endsWith(':' + z) && (+k.split(':')[0]) >= (ZONES[z] || {}).from);
const zoneEffNames = ks => ks.map(k => EFFECTS[k] ? EFFECTS[k].icon + ' ' + EFFECTS[k].name : k).join(' and ');

// this run's zones (from worldInit in world.js)
function zonesInit(g, W) {
  buildZoneFoes();
  const R = ZONE_RULES.run, n = Math.max(0, (R.perLevel | 0) + (g.stage >= 10 ? 1 : 0));
  g.zonesDone = {};
  // zones open by this level; ones not cleared here yet are picked first
  const open = Object.keys(ZONES).filter(z => ZONES[z].from <= g.stage);
  const fresh = open.filter(z => !zoneClears(SAVE, g.stage, z)), old = open.filter(z => zoneClears(SAVE, g.stage, z));
  const chosen = [...zoneShuffle(fresh), ...zoneShuffle(old)].slice(0, n);
  for (const z of chosen) addZone(W, z, false);
  // a sealed rift: a zone from one or two levels later
  const later = Object.keys(ZONES).filter(z => ZONES[z].from > g.stage && ZONES[z].from <= g.stage + 2);
  if (later.length) { const z = pick(later); addZone(W, z, !zoneOpened(SAVE, z)); }
}
function zoneShuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function addZone(W, z, sealed) {
  const R = ZONE_RULES.run, Z = ZONES[z], E = EFFECTS[Z.element], a = takeAnchor(W, 0.08, 0.5); if (!a) return null;
  const count = Math.max(1, R.count | 0), nw = Math.ceil(count * 0.42), ns = Math.round(count * 0.33);
  const pending = [...Array(nw).fill('warder'), ...Array(ns).fill('striker'), ...Array(Math.max(0, count - nw - ns)).fill('caster'), 'warden'];
  return addFeature(W, { kind: 'zone', zone: z, x: a.x, y: a.y, r: R.radius, zoneR: R.radius, rift: !!sealed || Z.from > W.stage, sealed: !!sealed,
    icon: sealed ? '🔒' : E.icon, color: sealed ? '#8a86a8' : E.color, name: `${Z.name}${Z.from > W.stage ? ' rift' : ''}`, onMap: 'map',
    pending, live: [], awake: false, cleared: false, entered: false, update: zoneUpdate, draw: drawZone });
}
function zoneUpdate(f, dt, d) {
  const R = ZONE_RULES.run, Z = ZONES[f.zone];
  if (d < f.zoneR && !f.entered) {
    f.entered = true;
    if (f.sealed) banner(`🔒 Sealed: clear ${Z.name} in Level ${Z.from} to open it`, '#8a86a8', 3);
    else if (!f.cleared) { banner(`${EFFECTS[Z.element].icon} ${f.name}`, f.color, 2.5); later(0.9, () => banner(`Only ${zoneEffNames(Z.only)} hurt them`, f.color, 3)); }
  } else if (d > f.zoneR + 200) f.entered = false;
  if (f.sealed) return;
  f.live = f.live.filter(e => !e.dead);
  if (f.cleared) { if (f.live.length && d > f.zoneR + R.sleep) { for (const e of f.live) { e.dead = true; e.gone = true; } f.live = []; } return; } // stragglers of a cleared zone leave
  if (!f.awake && d < f.zoneR + R.wake) { // fill the zone
    f.awake = true; const c = f.near;
    for (const k of f.pending) {
      const warden = k === 'warden', a = rand(0, TAU), rr = warden ? 0 : f.zoneR * 0.85 * Math.sqrt(Math.random());
      const e = spawnEnemy(zoneFoeId(f.zone, k), c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr, { zone: f, warden });
      e.zk = k; e.hx = Math.cos(a) * rr; e.hy = Math.sin(a) * rr; f.live.push(e);
    }
    f.pending = [];
  } else if (f.awake && d > f.zoneR + R.sleep) { // empty it, keeping who is left for next time
    for (const e of f.live) if (!e.dead) { f.pending.push(e.zk); e.dead = true; e.gone = true; }
    f.live = []; f.awake = false;
  }
}
// zone enemies stay at home while the player is outside: where to head (null: chase the player)
function zoneHome(e) {
  const c = e.zf.near, P = G.player; if (!c) return null;
  return Math.hypot(P.x - c.x, P.y - c.y) > e.zf.zoneR + 100 ? { x: c.x + (e.hx || 0), y: c.y + (e.hy || 0) } : null;
}
function zoneLeash(e) {
  const c = e.zf.near; if (!c) return;
  const dx = e.x - c.x, dy = e.y - c.y, dd = Math.hypot(dx, dy), R = e.zf.zoneR - e.r;
  if (dd > R) { e.x = c.x + dx / dd * R; e.y = c.y + dy / dd * R; e.kx = 0; e.ky = 0; }
}
// a zone enemy died (killEnemy in main.js): Essences, and for the Warden the clear
function zoneKill(e) {
  const f = e.zf, Z = ZONES[f.zone], M = MAT_DROPS.run, ess = 'ess_' + Z.element;
  if (!e.warden) { if (Math.random() < M.zone) dropMat(ess, 1, e.x, e.y); return; }
  f.cleared = true; f.pending = []; f.icon = '✔'; G.stats.zones = (G.stats.zones || 0) + 1;
  const key = zoneKey(G.stage, f.zone), before = zoneClears(SAVE, G.stage, f.zone) + (G.zonesDone[key] || 0), first = !before, mul = first ? 1 : M.repeat;
  G.zonesDone[key] = (G.zonesDone[key] || 0) + 1;
  dropMat(ess, Math.max(1, Math.round(M.warden * mul)) + (first ? M.firstEss : 0), e.x, e.y);
  const cats = Math.round(M.wardenCat * mul) + (first ? M.firstCat : 0);
  for (let k = 0; k < cats; k++) dropMat(pick(['cat_power', 'cat_hit', 'cat_effect', 'cat_stat']), 1, e.x, e.y);
  dropChest(e.x, e.y, 3);
  fxRing(e.x, e.y, f.zoneR, f.color, 1.2, 6);
  banner(`${EFFECTS[Z.element].icon} ${f.name} cleared!${first ? ' First clear bonus' : ''}`, f.color, 3);
  if (f.rift) later(1.5, () => banner('Rift closed', f.color, 2));
}
// at the end of a run: count this run's clears (first clear bonuses, and sealed rifts in earlier levels open)
function zonesEndRun() {
  for (const [k, n] of Object.entries(G.zonesDone || {})) SAVE.zonesCleared[k] = (SAVE.zonesCleared[k] || 0) + n;
}
// on the floor: a tinted circle with a dashed edge and the zone's name
function drawZone(f, x, y) {
  const R = f.zoneR, c = f.color, t = G.time;
  ctx.fillStyle = c; ctx.globalAlpha = f.cleared ? 0.03 : 0.07; circle(x, y, R); ctx.globalAlpha = 1;
  ctx.strokeStyle = c + (f.cleared ? '55' : 'aa'); ctx.lineWidth = f.sealed ? 4 : 2.5; ctx.setLineDash(f.sealed ? [6, 10] : [18, 12]); ctx.lineDashOffset = -t * 20;
  ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
  if (!f.cleared) { ctx.strokeStyle = c + '30'; ctx.lineWidth = 1; for (let k = 0; k < 3; k++) { const rr = R * (0.25 + 0.25 * k + 0.05 * Math.sin(t + k)); ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.stroke(); } }
  ctx.font = 'bold 14px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = c;
  const Z = ZONES[f.zone], label = f.sealed ? `🔒 ${f.name}: clear ${Z.name} in Level ${Z.from}` : f.cleared ? `✔ ${f.name} cleared` : `${EFFECTS[Z.element].icon} ${f.name} · only ${zoneEffNames(Z.only)}`;
  ctx.fillText(label, x, y - R - 16);
  if (f.sealed) { ctx.font = '42px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; ctx.globalAlpha = 0.6; ctx.fillText('🔒', x, y); ctx.globalAlpha = 1; }
}
// the pause menu's zone list
function zoneListHtml() {
  const W = G && G.world; if (!W) return '';
  const zs = W.feats.filter(f => f.kind === 'zone'); if (!zs.length) return '';
  if (!mapFound(SAVE, G.stage)) return `<small class="note">${zs.length} zone${zs.length > 1 ? 's' : ''} hide in this level. Find the 🗺️ Map to see where.</small>`;
  return zs.map(f => { const Z = ZONES[f.zone];
    return `<small style="color:${f.color}">${f.icon} <b>${f.name}</b>: ${f.sealed ? `sealed until ${Z.name} is cleared in Level ${Z.from}` : f.cleared ? 'cleared' : `only ${zoneEffNames(Z.only)} hurt it · ${Math.round((f.dist || 0) / 50)}m`}</small>`; }).join('<br>');
}
