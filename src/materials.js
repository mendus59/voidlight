'use strict';
// ===== VOIDLIGHT materials: what augments and Forge upgrades will cost besides gold =====
// MATERIALS, MATERIAL_FAMILIES and MAT_DROPS are in items.js. In a run, materials drop as pickups (or come straight out of
// chests) into G.mats; at the end of the run (won or lost) they go into SAVE.materials, like gold. The Codex has a
// "🧰 Materials" tab listing what you hold and where each family comes from. Loaded after zones.js and before main.js.

const matIds = fam => Object.keys(MATERIALS).filter(k => !fam || MATERIALS[k].family === fam);
const matHeld = (s, id) => (s.materials || {})[id] || 0;
const slotMat = slot => matIds('slot').find(k => MATERIALS[k].slot === slot);
// a slot material for one of the slots the player holds items in, so drops lean to what they use
function heldSlotMat() {
  const held = G && G.inv ? G.inv.map(i => i.def.slot) : [];
  return slotMat(held.length ? pick(held) : pick(SLOT_KEYS)) || pick(matIds('slot'));
}
function dropMat(id, n, x, y) {
  if (!MATERIALS[id] || !(n > 0) || G.sandbox) return;
  drop('mat', x + rand(-26, 26), y + rand(-26, 26), { id, n });
}
function gainMat(id, n) { if (MATERIALS[id] && n > 0) G.mats[id] = (G.mats[id] || 0) + n; }
function collectMat(p) {
  const M = MATERIALS[p.v.id]; if (!M) return;
  gainMat(p.v.id, p.v.n); fxText(p.x, p.y - 14, `+${p.v.n} ${M.icon} ${M.name}`, M.color, 12);
}
// elites and bosses (killEnemy in main.js); zone enemies are zones.js's
function matsOnKill(e) {
  const M = MAT_DROPS.run;
  if (e.zf) { zoneKill(e); return; }
  if (e.elite) {
    dropMat(heldSlotMat(), randi(M.eliteMin | 0, Math.max(M.eliteMin | 0, M.eliteMax | 0)), e.x, e.y);
    if (G.stage >= M.eliteAttrFrom && Math.random() < M.eliteAttr) dropMat(pick(matIds('attr')), 1, e.x, e.y);
  }
  if (e.boss) {
    for (let k = 0; k < (M.boss | 0); k++) dropMat(pick(matIds('attr')), 1, e.x, e.y);
    if (Math.random() < M.bossForm) dropMat('cat_form', 1, e.x, e.y);
  }
}
// a chest's materials: straight into the run's haul; returns them for the chest screen
function chestMats(n) {
  const out = {}, k = Math.round(n * (MAT_DROPS.run.chest || 0));
  for (let i = 0; i < k; i++) { const id = heldSlotMat(); out[id] = (out[id] || 0) + 1; gainMat(id, 1); }
  return out;
}
const matTotal = m => Object.values(m || {}).reduce((a, b) => a + b, 0);
const matChips = m => Object.entries(m || {}).filter(([id, n]) => n > 0 && MATERIALS[id]).map(([id, n]) => `<span class="chip" style="--c:${MATERIALS[id].color}" title="${MATERIALS[id].name}">${MATERIALS[id].icon} ${MATERIALS[id].name} <b>${n}</b></span>`).join('');
function saveRunMats() { for (const [id, n] of Object.entries(G.mats || {})) if (n > 0) SAVE.materials[id] = (SAVE.materials[id] || 0) + n; }
function drawMatPickup(p, x, y) {
  const M = MATERIALS[p.v.id] || { color: '#fff', icon: '•' }, b = Math.sin(G.time * 4 + p.x) * 2;
  ctx.fillStyle = M.color; ctx.globalAlpha = 0.25 + 0.1 * Math.sin(G.time * 6); circle(x, y, 13); ctx.globalAlpha = 1;
  ctx.strokeStyle = M.color; ctx.lineWidth = 1.5; poly(x, y, 11, 4, G.time); ctx.stroke();
  ctx.font = '14px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(M.icon, x, y + b);
  if (p.v.n > 1) { ctx.font = 'bold 10px system-ui,sans-serif'; ctx.fillStyle = M.color; ctx.fillText('×' + p.v.n, x + 13, y - 10); }
}
// Codex tab "🧰 Materials": every family, what you hold, where it comes from
function renderMaterials(wrap, show) {
  const run = inRun() ? G.mats || {} : {};
  wrap.innerHTML = Object.entries(MATERIAL_FAMILIES).map(([fam, F]) => {
    const ids = matIds(fam).filter(id => show(matHeld(SAVE, id) > 0)); if (!ids.length) return '';
    const rows = ids.map(id => { const M = MATERIALS[id], n = matHeld(SAVE, id), r = run[id] || 0;
      const what = M.slot ? `${SLOTS[M.slot].icon} ${SLOTS[M.slot].name} items` : M.effect ? `${EFFECTS[M.effect].icon} ${EFFECTS[M.effect].name} augments` : M.stat ? `Stat augments (${(STAT_INFO[M.stat] || {}).name || M.stat}) and Forge caps` : `Every ${M.kind} augment`;
      return `<div class="matRow${n ? '' : ' none'}" style="--c:${M.color}"><span class="mi">${M.icon}</span><span class="mn"><b>${M.name}</b><small>${what}</small></span><span class="mc">${n}${r ? `<small>+${r} this run</small>` : ''}</span></div>`; }).join('');
    return `<div class="card matFam"><b>${F.name}</b><small class="note">${F.from}</small>${rows}</div>`;
  }).join('');
}
