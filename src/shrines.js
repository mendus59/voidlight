'use strict';
// ===== VOIDLIGHT shrines: short buffs and optional challenges on the map =====
// SHRINES and SHRINE_RULES are in items.js. Each run places SHRINE_RULES.buffs buff shrines and .challenges challenge shrines
// at anchors of the level's map (world.js). Stand on a shrine for `channel` seconds to use it. A buff shrine gives a timed buff
// (G.buffs, added in recomputeStats in main.js) and one attribute material. A challenge shrine starts a challenge around it:
// Hold (stay inside the circle) or Cull (defeat enemies inside the circle); success drops a big chest and slot materials,
// failure closes the shrine. Shrines show on the minimap once seen. Loaded after materials.js and before main.js.

// late levels ask more of a challenge (ENDGAME in items.js)
const shrineDef = f => { const S = SHRINES[f.shrine] || {}, E = ENDGAME.run; if (S.kind === 'buff' || !G || G.stage < E.hardFrom) return S;
  return Object.assign({}, S, { time: S.kind === 'hold' ? Math.round(S.time * E.hard) : S.time, kills: S.kills ? Math.round(S.kills * E.hard) : S.kills }); };
function shrinesInit(g, W) {
  g.buffs = [];
  const R = SHRINE_RULES.run, ids = Object.keys(SHRINES), buffs = ids.filter(k => SHRINES[k].kind === 'buff'), chal = ids.filter(k => SHRINES[k].kind !== 'buff');
  const take = (list, n) => { const out = []; let pool = []; for (let k = 0; k < n && list.length; k++) { if (!pool.length) pool = zoneShuffle(list); out.push(pool.pop()); } return out; };
  for (const k of [...take(buffs, R.buffs | 0), ...take(chal, R.challenges | 0)]) {
    const S = SHRINES[k], a = takeAnchor(W, 0.04, 0.6); if (!a) break;
    addFeature(W, { kind: 'shrine', shrine: k, x: a.x, y: a.y, r: 46, icon: S.icon, color: S.color, name: S.name, onMap: 'seen',
      state: 'idle', ch: 0, t: 0, out: 0, kills: 0, acc: 0, beacon: f => f.state === 'active', update: shrineUpdate, draw: drawShrine });
  }
}
function shrineUpdate(f, dt, d) {
  const R = SHRINE_RULES.run, S = shrineDef(f);
  if (f.state === 'idle') {
    if (d < f.r + G.player.r) { f.ch += dt; if (f.ch >= R.channel) useShrine(f); }
    else f.ch = Math.max(0, f.ch - dt * 2);
    return;
  }
  if (f.state !== 'active') return;
  f.t += dt;
  const inside = d < R.radius, c = f.near;
  // extra enemies from outside the circle, more as the challenge goes on
  f.acc += R.spawn * (1 + Math.min(1, f.t / S.time)) * dt;
  while (f.acc >= 1) { f.acc -= 1; if (G.enemies.length > 420) continue;
    const avail = SPAWN_TABLE.filter(s => G.time >= s[1]), a = rand(0, TAU), rr = R.radius + rand(260, 420);
    spawnEnemy(pick(avail)[0], c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr); }
  if (S.kind === 'hold') {
    if (inside) f.out = Math.max(0, f.out - dt); else { f.out += dt; if (f.out >= R.grace) return failShrine(f, 'You left the circle'); }
    if (f.t >= S.time) winShrine(f);
  } else if (S.kind === 'cull') {
    if (f.kills >= S.kills) winShrine(f); else if (f.t >= S.time) failShrine(f, 'Out of time');
  }
}
function useShrine(f) {
  const S = shrineDef(f), R = SHRINE_RULES.run;
  fxRing(f.near.x, f.near.y, 120, f.color, 0.7, 5);
  if (S.kind === 'buff') {
    f.state = 'done';
    G.buffs = (G.buffs || []).filter(b => b.id !== f.shrine);
    G.buffs.push({ id: f.shrine, stat: S.stat, value: S.value, t: R.buffTime, dur: R.buffTime, icon: S.icon, color: S.color, name: S.name.replace('Shrine of ', '') });
    recomputeStats();
    if (S.mat) dropMat(S.mat, 1, f.near.x, f.near.y);
    banner(`${S.icon} ${buffText(S)} for ${R.buffTime}s`, S.color, 2.5);
    return;
  }
  f.state = 'active'; f.t = 0; f.out = 0; f.kills = 0; f.acc = 0;
  banner(`${S.icon} ${S.kind === 'hold' ? `Hold the circle for ${S.time}s!` : `Defeat ${S.kills} enemies inside the circle in ${S.time}s!`}`, S.color, 3);
}
function buffText(S) {
  const I = STAT_INFO[S.stat] || { name: S.stat };
  return I.pct ? `${I.neg ? '−' : '+'}${Math.round(S.value * 100)}% ${I.name}` : `+${S.value} ${I.name}`;
}
function winShrine(f) {
  const S = shrineDef(f), R = SHRINE_RULES.run, c = f.near;
  f.state = 'done'; G.stats.challenges = (G.stats.challenges || 0) + 1;
  dropChest(c.x, c.y, R.chestMin);
  for (let k = 0; k < (R.mats | 0); k++) dropMat(heldSlotMat(), 1, c.x, c.y);
  fxRing(c.x, c.y, R.radius, f.color, 1, 8);
  banner(`${S.icon} Challenge cleared!`, '#6bff8f', 3);
}
function failShrine(f, why) { f.state = 'failed'; banner(`${shrineDef(f).icon} Challenge failed: ${why}`, '#ff3b5c', 2.5); }
// a kill inside an active Cull circle (killEnemy in main.js)
function shrineKill(e) {
  const W = G.world; if (!W) return;
  for (const f of W.feats) if (f.kind === 'shrine' && f.state === 'active' && shrineDef(f).kind === 'cull' && f.near && Math.hypot(e.x - f.near.x, e.y - f.near.y) < SHRINE_RULES.run.radius) f.kills++;
}
// timed buffs run down (from worldUpdate)
function buffsTick(dt) {
  if (!G.buffs || !G.buffs.length) return;
  let gone = false; for (const b of G.buffs) { b.t -= dt; if (b.t <= 0) gone = true; }
  if (gone) { G.buffs = G.buffs.filter(b => b.t > 0); recomputeStats(); }
}
// the active challenge, for the HUD
function shrineStatus() {
  const W = G.world; if (!W) return null;
  const f = W.feats.find(x => x.kind === 'shrine' && x.state === 'active'); if (!f) return null;
  const S = shrineDef(f), left = Math.max(0, S.time - f.t);
  if (S.kind === 'hold') return { color: f.color, text: `${S.icon} Hold the circle: ${left.toFixed(1)}s` + (f.out > 0 ? ` · back inside! ${(SHRINE_RULES.run.grace - f.out).toFixed(1)}s` : ''), warn: f.out > 0 };
  return { color: f.color, text: `${S.icon} Cull: ${f.kills}/${S.kills} inside the circle · ${left.toFixed(1)}s` };
}
function drawShrine(f, x, y) {
  const S = shrineDef(f), R = SHRINE_RULES.run, t = G.time, used = f.state === 'done' || f.state === 'failed', c = f.color;
  if (S.kind !== 'buff' && !used) { // the challenge circle
    ctx.strokeStyle = c + (f.state === 'active' ? 'cc' : '55'); ctx.lineWidth = f.state === 'active' ? 3 : 1.5; ctx.setLineDash([10, 10]); ctx.lineDashOffset = t * 15;
    ctx.beginPath(); ctx.arc(x, y, R.radius, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    if (f.state === 'active') { ctx.fillStyle = c; ctx.globalAlpha = 0.06; circle(x, y, R.radius); ctx.globalAlpha = 1;
      const p = S.kind === 'hold' ? f.t / S.time : f.kills / S.kills; ctx.strokeStyle = c; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(x, y, R.radius, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(p, 0, 1)); ctx.stroke(); }
  }
  ctx.globalAlpha = used ? 0.35 : 1;
  ctx.fillStyle = c; ctx.globalAlpha *= 0.18 + (used ? 0 : 0.08 * Math.sin(t * 3)); circle(x, y, f.r); ctx.globalAlpha = used ? 0.35 : 1;
  ctx.strokeStyle = c; ctx.lineWidth = 2; poly(x, y, f.r * 0.8, 6, t * 0.3); ctx.stroke();
  if (f.ch > 0 && f.state === 'idle') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, f.r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * f.ch / R.channel); ctx.stroke(); }
  ctx.font = '26px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(S.icon, x, y + (used ? 0 : Math.sin(t * 2) * 2));
  ctx.font = 'bold 12px system-ui,sans-serif'; ctx.fillStyle = c;
  ctx.fillText(used ? (f.state === 'done' && S.kind === 'buff' ? `${f.name} (used)` : f.state === 'done' ? `${f.name}: cleared` : `${f.name}: failed`) : `${f.name}: ${S.kind === 'buff' ? buffText(S) + ` for ${R.buffTime}s` : S.kind === 'hold' ? `hold ${S.time}s` : `cull ${S.kills} in ${S.time}s`}`, x, y - f.r - 14);
  if (!used && f.state === 'idle') { ctx.font = '10px system-ui,sans-serif'; ctx.fillStyle = '#ccc'; ctx.fillText('stand here to use', x, y + f.r + 12); }
  ctx.globalAlpha = 1;
}
