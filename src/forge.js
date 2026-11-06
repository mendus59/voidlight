'use strict';
// ===== VOIDLIGHT Forge expansion: rank caps, Attunement, recipes, and the level briefing =====
// FORGE_CAPS, CAP_RULES, ATTUNE and RECIPE_COSTS are in items.js. The save keeps upgCap[upgradeId] (extra ranks opened past the
// upgrade's max), attuneRank (0-3), attuned (item ids) and forged (Nexus recipes learned by forging). renderForge in main.js calls
// forgeExtrasHtml / wireForgeExtras; renderChars calls briefingHtml. Loaded after augments.js and before main.js.

const matsHtml = (gold, mats) => costHtml(gold, mats); // augments.js
const payMats = (gold, mats) => { SAVE.gold -= gold; for (const [m, n] of Object.entries(mats)) SAVE.materials[m] = (SAVE.materials[m] || 0) - n; };
const beaten = n => stageStats(SAVE, n).wins > 0;

// ---------- rank caps ----------
const upgMax = u => u.max + (FORGE_CAPS[u.id] && !u.socket ? (SAVE.upgCap || {})[u.id] || 0 : 0);
// the next cap step of upgrade u: { k, gate, gold, mats } or null when there is none
function capStep(u) {
  const mat = FORGE_CAPS[u.id], R = CAP_RULES.run; if (!mat || u.socket) return null;
  const k = (SAVE.upgCap || {})[u.id] || 0; if (k >= R.steps) return null;
  return { k, gate: R['gate' + (k + 1)] || stageCount(), gold: Math.round(upgradeCost(u, u.max + k) * R.gold), mats: { [mat]: R.mats + R.matStep * k } };
}
function buyCap(u) {
  const st = capStep(u); if (!st) return;
  if (!beaten(st.gate)) { toast(`Beat Level ${st.gate} to raise ${u.name} past ${upgMax(u)}`); return; }
  if (!canPay(SAVE, st.gold, st.mats)) { toast('Not enough gold or materials'); return; }
  payMats(st.gold, st.mats); SAVE.upgCap[u.id] = st.k + 1; writeSave(); toast(`⬆ ${u.name} can now reach rank ${upgMax(u)}`);
}

// ---------- Attunement ----------
const attuneSlots = () => Math.min(3, SAVE.attuneRank || 0);
const attunedNow = () => (SAVE.attuned || []).filter(id => ITEM[id] && !ITEM[id].disabled).slice(0, attuneSlots());
function attuneCost(r) { // r: rank index 0..2
  const A = ATTUNE.ranks[r]; if (!A) return null; const mats = {};
  for (const [k, n] of Object.entries(A.mats)) { if (k === 'slot') for (const m of matIds('slot')) mats[m] = (mats[m] || 0) + n; else mats[k] = (mats[k] || 0) + n; }
  return { gate: A.gate, gold: A.gold, mats };
}
function buyAttune() {
  const r = SAVE.attuneRank || 0, C = attuneCost(r); if (!C) return;
  if (!beaten(C.gate)) { toast(`Beat Level ${C.gate} first`); return; }
  if (!canPay(SAVE, C.gold, C.mats)) { toast('Not enough gold or materials'); return; }
  payMats(C.gold, C.mats); SAVE.attuneRank = r + 1; writeSave(); toast(`🎯 Attunement rank ${r + 1}: attune ${r + 1} item${r ? 's' : ''}${r + 1 >= 3 ? ', one offered in your first level-up' : ''}`);
}
// in a run (buildChoices in main.js): weight × for attuned items, and at rank 3 the first level-up offers one
const attuneMul = d => (!G || G.sandbox || !attunedNow().includes(d.id) ? 1 : ATTUNE.weight);
function attuneFirstPick(opts) {
  if (!G || G.sandbox || G.attuneDone || (SAVE.attuneRank || 0) < 3) return null;
  G.attuneDone = true;
  const cands = opts.filter(o => o.type === 'new' && attunedNow().includes(o.def.id));
  return cands.length ? pick(cands) : null;
}

// ---------- recipes ----------
// what forging Nexus recipe nx needs: its achievement, plus the level feats for Super and Mega
function recipeGate(nx) {
  const parts = nx.lock ? (nx.lock.all ? nx.lock.all.slice() : [nx.lock]) : [], S = nx.lock ? lockStage(nx.lock) : 0;
  if (S && (nx.tier === 'super' || nx.tier === 'mega')) parts.push({ stage: S, stat: 'zones', min: 2 });
  if (S && nx.tier === 'mega') parts.push({ stage: S, stat: 'shrines', min: 3 });
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : { all: parts, text: parts.map(p => partLabel(p)).join(' · ') };
}
const recipeReady = (s, nx) => { const g = recipeGate(nx); return !g || lockMet(g, s); };
function recipeCost(nx) {
  const C = RECIPE_COSTS[nx.tier] || RECIPE_COSTS.fused, mats = {};
  for (const id of nx.recipe) { const d = ITEM[id]; if (!d) continue; const m = slotMat(d.slot); mats[m] = (mats[m] || 0) + C.slot; }
  for (const e of new Set(nx.recipe.flatMap(id => (ITEM[id] ? effectsOf(ITEM[id]) : [])))) mats['ess_' + e] = (mats['ess_' + e] || 0) + C.ess;
  if (C.cat) mats.cat_effect = C.cat;
  return { gold: C.gold, mats };
}
function forgeRecipe(nx) {
  if (nexusUnlocked(SAVE, nx)) return;
  if (!recipeReady(SAVE, nx)) { toast(lockLabel(recipeGate(nx)) + ' first'); return; }
  const C = recipeCost(nx); if (!canPay(SAVE, C.gold, C.mats)) { toast('Not enough gold or materials'); return; }
  payMats(C.gold, C.mats); SAVE.forged.push(nx.id); writeSave();
  toast(`⚒ Forged: ${nx.icon} ${nx.name}. It can now form in runs (${nexusRecipeText(nx)})`);
}

// ---------- the Forge screen's extra sections ----------
let forgeTab = 'upgrades';
function forgeExtrasHtml() {
  const tabs = [['upgrades', '⚒ Upgrades'], ['attune', `🎯 Attunement ${attuneSlots() ? attuneSlots() + '/3' : ''}`], ['recipes', `📜 Recipes ${NEXUS.filter(nx => nexusOk(nx) && nexusUnlocked(SAVE, nx)).length}/${NEXUS.filter(nexusOk).length}`]];
  return `<div class="tabs">${tabs.map(([k, l]) => `<button class="tab${forgeTab === k ? ' sel' : ''}" data-ftab="${k}">${l}</button>`).join('')}</div>`;
}
function attuneHtml() {
  const r = SAVE.attuneRank || 0, C = attuneCost(r), now = attunedNow();
  let h = `<div class="card forgeSec"><b>🎯 Attunement · rank ${r}/3</b><small class="note">Attuned items are offered ${ATTUNE.weight}× as often in every run. Rank 1, 2 and 3 attune 1, 2 and 3 items; at rank 3 one of them is offered in your first level-up. Zones are meant for levels you've already beaten, so this is priced for later.</small>`;
  if (C) h += `<div class="row left">${beaten(C.gate) ? `<button class="small" data-attune>Raise to rank ${r + 1}</button> ${matsHtml(C.gold, C.mats)}` : `<span class="req">🔒 Beat Level ${C.gate} for rank ${r + 1}</span>`}</div>`;
  if (r) {
    h += `<div class="chips left">${now.map(id => `<span class="chip" style="--c:${EFFECTS[ITEM[id].effect].color}">${ITEM[id].icon} ${ITEM[id].name} <button class="link" data-unattune="${id}">✕</button></span>`).join('') || '<small class="note">Nothing attuned yet.</small>'}</div>`;
    if (now.length < r) h += `<select id="attunePick"><option value="">+ Attune an item…</option>${ITEMS.filter(d => !d.disabled && itemUnlocked(SAVE, d) && !now.includes(d.id)).map(d => `<option value="${d.id}">${d.icon} ${d.name} (${SLOTS[d.slot].name})</option>`).join('')}</select>`;
  }
  return h + '</div>';
}
function recipesHtml() {
  let h = '<p class="note">A Nexus recipe is learned by forging it here, once its achievement is done. Super recipes also need that level\'s Warden-breaker feat, Mega ones its Challenger feat too. Forging only teaches the recipe: you still form the Nexus in a run.</p><div class="grid recipeGrid">';
  for (const nx of NEXUS) {
    if (!nexusOk(nx)) continue;
    const t = nexusTier(nx), known = nexusUnlocked(SAVE, nx), ready = recipeReady(SAVE, nx), C = recipeCost(nx), g = recipeGate(nx);
    h += `<div class="card item nexus${known ? '' : ready ? '' : ' locked'}" style="--c:${nx.color || TIER_COLORS[t]}"><div class="ico">${nx.icon}</div><div class="body"><b>${nx.name}</b><div class="tags"><span style="color:${TIER_COLORS[t]}">✴ ${tierName(t)}</span></div><small>${nexusRecipeText(nx)}</small>`;
    h += known ? '<small class="fuse">✓ Forged</small>' : ready ? `<div class="row left"><button class="small" data-recipe="${nx.id}" ${canPay(SAVE, C.gold, C.mats) ? '' : 'disabled'}>⚒ Forge</button> ${matsHtml(C.gold, C.mats)}</div>` : `<div class="req">🔒 ${lockLabel(g)}</div><small>${matsHtml(C.gold, C.mats)}</small>`;
    h += '</div></div>';
  }
  return h + '</div>';
}
// cap line for an upgrade card (main.js renderForge)
function capLine(u, rank) {
  const st = capStep(u); if (!st || rank < upgMax(u)) return '';
  return beaten(st.gate) ? `<div class="capUp">⬆ Raise cap to ${upgMax(u) + 1}: ${matsHtml(st.gold, st.mats)}</div>` : `<div class="capUp off">🔒 Beat Level ${st.gate} to raise its cap</div>`;
}
function wireForgeExtras(box, rerender) {
  box.querySelectorAll('[data-ftab]').forEach(b => b.onclick = () => { forgeTab = b.dataset.ftab; rerender(); });
  const q = s => box.querySelector(s) || document.querySelector(s);
  document.querySelectorAll('[data-attune]').forEach(b => b.onclick = () => { buyAttune(); rerender(); });
  document.querySelectorAll('[data-unattune]').forEach(b => b.onclick = () => { SAVE.attuned = SAVE.attuned.filter(x => x !== b.dataset.unattune); writeSave(); rerender(); });
  const sel = q('#attunePick'); if (sel) sel.onchange = () => { if (sel.value) { SAVE.attuned = attunedNow().concat(sel.value); writeSave(); rerender(); } };
  document.querySelectorAll('[data-recipe]').forEach(b => b.onclick = () => { const nx = nexusDef(b.dataset.recipe); if (nx) forgeRecipe(nx); rerender(); });
}

// ---------- level briefing (level select) ----------
function briefingHtml(n) {
  const zs = Object.entries(ZONES).filter(([, Z]) => Z.from <= n), rifts = Object.entries(ZONES).filter(([, Z]) => Z.from > n && Z.from <= n + 2);
  const known = z => Object.keys(ZONE_FOES).some(k => foeMastered(SAVE, zoneFoeId(z, k)));
  const zoneRow = ([z, Z], rift) => { const E = EFFECTS[Z.element], c = zoneClears(SAVE, n, z);
    return `<span class="chip" style="--c:${E.color}">${E.icon} ${Z.name}${rift ? ` rift${zoneOpened(SAVE, z) ? '' : ' 🔒'}` : ''} · hurt only by ${known(z) ? zoneTypes(Z, n).map(k => EFFECTS[k].icon + ' ' + EFFECTS[k].name).join(' + ') : '?'}${c ? ` · cleared ${c}×` : ''}</span>`; };
  const foes = [...new Set(SPAWN_TABLE.map(r => levelFoeOf(n, r[0])))].map(id => { const T = ENEMY_TYPES[id]; if (!T) return '';
    const m = foeMastered(SAVE, id), tr = m ? [...(T.weak || []).map(k => '▲' + EFFECTS[k].icon), ...(T.resist || []).map(k => '▼' + EFFECTS[k].icon)].join(' ') : '?';
    return `<span class="chip" style="--c:${T.color}">${T.name} ${tr}</span>`; }).join('');
  const att = attunedNow();
  return `<div class="brief"><b>📋 Briefing</b> <small>${mapFound(SAVE, n) ? '🗺️ Map found: zones show on your map.' : '🗺️ Map not found yet.'} Pick of ${Math.max(0, ZONE_RULES.run.perLevel | 0) + (n >= 10 ? 1 : 0)} zones per run from:</small>
    <div class="chips left">${zs.map(x => zoneRow(x, false)).join('')}${rifts.map(x => zoneRow(x, true)).join('')}</div>
    <small>Wandering enemies (▲ weak, ▼ resists; master them in the Bestiary to see):</small><div class="chips left">${foes}</div>
    <small>${att.length ? `🎯 Attuned: ${att.map(id => ITEM[id].icon + ' ' + ITEM[id].name).join(', ')}` : (SAVE.attuneRank ? '🎯 Nothing attuned. Pick items in the Forge.' : '🎯 Attunement (Forge, after Level 3) lets you favour items for a run.')}</small></div>`;
}
// the enemy type a level really spawns for a base type (its STAGES[].swap)
const levelFoeOf = (n, type) => { const sw = stageDef(n).swap; return sw && sw[type] && ENEMY_TYPES[sw[type]] ? sw[type] : type; };

// ---------- the cross-level web (Achievements page) ----------
// For every level: what beating it, clearing its zones and its challenges opens, across the game.
function levelWebRows() {
  const rows = [];
  for (let n = 1; n <= stageCount(); n++) {
    const out = [], S = stageDef(n);
    if (n < stageCount()) out.push(`🗺 Level ${n + 1}${n + 1 >= ENDGAME.run.gateFrom ? ' (also clear a zone here)' : ''} and a Forge socket`);
    for (const k of TIER_KEYS) { const l = FUSION[k].lock; if (l && lockStage(l) === n) out.push(`✦ ${FUSION[k].name} fusion`); }
    ATTUNE.ranks.forEach((A, r) => { if (A.gate === n) out.push(`🎯 Attunement rank ${r + 1}`); });
    for (let k = 1; k <= CAP_RULES.run.steps; k++) if (CAP_RULES.run['gate' + k] === n) out.push(`⬆ Forge rank caps, step ${k}`);
    const nx = NEXUS.filter(x => nexusOk(x) && x.lock && lockStage(x.lock) === n);
    if (nx.length) out.push(`📜 Forging ${nx.map(x => x.icon + ' ' + x.name).join(', ')}` + (nx.some(x => x.tier !== 'fused') ? ` (Super/Mega also need Level ${n}'s feats)` : ''));
    const zs = Object.values(ZONES).filter(Z => Z.from === n);
    if (zs.length) out.push(`🌀 Clearing ${zs.map(Z => EFFECTS[Z.element].icon + ' ' + Z.name).join(', ')} here opens ${zs.length > 1 ? 'their' : 'its'} sealed rift${zs.length > 1 ? 's' : ''} in Level${n > 2 ? `s ${Math.max(1, n - 2)}–${n - 1}` : ` ${Math.max(1, n - 1)}`}`);
    const items = ITEMS.filter(d => !d.disabled && d.lock && lockStage(d.lock) === n).length, heroes = CHARACTERS.filter(c => lockStage(charLock(c)) === n).length;
    if (items || heroes) out.push(`🔓 ${items ? `${items} item${items > 1 ? 's' : ''}` : ''}${items && heroes ? ' and ' : ''}${heroes ? `${heroes} hero${heroes > 1 ? 'es' : ''}` : ''} ask for something in Level ${n}`);
    rows.push({ n, S, out });
  }
  return rows;
}
function levelWebHtml() {
  return `<div class="achSec web"><h3>🕸 What opens what</h3><p class="note">Every level opens things across the game. Later levels need you to go back: rifts in early levels open from later zones, recipes ask for feats in their level, and from Level ${ENDGAME.run.gateFrom} on each level needs a zone cleared in the one before.</p>` +
    levelWebRows().map(r => `<details${stageUnlocked(SAVE, r.n) ? '' : ' class="dim"'}><summary style="color:${r.S.color}">${stageUnlocked(SAVE, r.n) ? '' : '🔒 '}Level ${r.n}: ${r.S.name}</summary>${r.out.map(x => `<small>${x}</small>`).join('')}</details>`).join('') + '</div>';
}
