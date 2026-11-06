'use strict';
// ===== VOIDLIGHT augments: permanent tweaks to one item =====
// AUGMENTS, AUG_KINDS, AUG_RULES and AUG_OPEN are in items.js. The save keeps SAVE.augments[itemId] = one entry per slot
// (an augment id or null). Ids: 'power', 'stat_cd', 'form_trail', and per effect 'hit:burn', 'effect:chill'.
// In a run (and in the Fusion Lab) every held item gets inst.augs (the ids it carries, its own plus every fused item's) and
// inst.aug (their summed effect, read by core.js: damage, cooldown, area, duration, projectile speed, crit, projectiles, hit
// types, looks). Effect augments ride on the item as fusion riders. Bought on the item's Armory page, outside a run.
// Loaded after shrines.js and before main.js.

const augKey = id => String(id).split(':')[0];
const augEff = id => String(id).split(':')[1] || null;
const augDef = id => AUGMENTS[augKey(id)] || null;
function augName(id) { const A = augDef(id), e = augEff(id); if (!A) return id; return e && EFFECTS[e] ? `${A.name}: ${EFFECTS[e].icon} ${EFFECTS[e].name}` : A.name; }
function augText(id) {
  const A = augDef(id), e = augEff(id); if (!A) return '';
  if (A.kind === 'hit') return `Its hits also count as ${EFFECTS[e].name} damage`;
  if (A.kind === 'effect') return `It carries ${EFFECTS[e].name}: its bullets apply it and it fuses with ${EFFECTS[e].name} items`;
  const m = A.mods || {}, out = [];
  if (m.power) out.push(`+${Math.round(m.power * 100)}% damage (Power caps at +${Math.round(AUG_RULES.run.powerCap * 100)}% per item)`);
  if (m.cd) out.push(`−${Math.round(m.cd * 100)}% cooldown`); if (m.area) out.push(`+${Math.round(m.area * 100)}% area`);
  if (m.duration) out.push(`+${Math.round(m.duration * 100)}% duration`); if (m.projSpd) out.push(`+${Math.round(m.projSpd * 100)}% projectile speed`);
  if (m.crit) out.push(`+${Math.round(m.crit * 100)}% crit chance`); if (m.amount) out.push(`+${m.amount} projectile`);
  if (m.trail) out.push('Its bullets leave trails'); if (m.spark) out.push('Sparks fly where it hits');
  return out.join(', ') + (A.kind === 'form' ? ' (looks only)' : ' for this item');
}
// slots: the item's own count, or the one for its kind
const augSlots = d => clamp((d.augSlots || (isPassive(d) ? AUG_RULES.run.passive : AUG_RULES.run[d.slot]) || 5) | 0, 1, Math.min(12, AUG_OPEN.length));
const augList = (s, id) => ((s.augments || {})[id] || []);
function slotOpenReq(k) { return AUG_OPEN[k] || { kills: 1e9 }; }
function slotProgress(s, d, k) {
  const r = slotOpenReq(k);
  if (r.kills) return [(s.itemKills || {})[d.id] || 0, r.kills];
  if (r.mastery) return [fuseUnlocked(s, d) ? 1 : 0, 1];
  if (r.fuse) return [fusedSets(s, d.id, r.fuse).length ? 1 : 0, 1];
  return [0, 1];
}
const slotOpen = (s, d, k) => { const [a, b] = slotProgress(s, d, k); return a >= b; };
function slotReqText(k) { const r = slotOpenReq(k); return r.kills ? `Defeat ${r.kills} enemies with it` : r.mastery ? 'Master it' : r.fuse ? `Fuse it into a ${FUSION[r.fuse] ? FUSION[r.fuse].name : r.fuse} item` : '?'; }
// the materials an augment costs on item d: { materialId: n }
function augCost(d, id) {
  const A = augDef(id), out = {}; if (!A) return out;
  for (const [k, n] of Object.entries(A.mats || {})) {
    const m = k === 'slot' ? slotMat(d.slot) : k === 'ess' ? 'ess_' + augEff(id) : k; if (MATERIALS[m] && n > 0) out[m] = (out[m] || 0) + n;
  }
  return out;
}
const canPay = (s, gold, mats) => s.gold >= gold && Object.entries(mats).every(([m, n]) => matHeld(s, m) >= n);
// what can go in item d's slot: every catalogue entry, one per open effect for Hit and Effect, minus what it already is
function augOptions(d) {
  const out = [];
  for (const [k, A] of Object.entries(AUGMENTS)) {
    if (isPassive(d) && A.kind !== 'effect' && A.kind !== 'form') continue; // a passive has no attack to tweak
    if (A.perEffect) { for (const e of EFFECT_KEYS) if (catUnlocked(SAVE, e) && !effectsOf(d).includes(e)) out.push(k + ':' + e); }
    else out.push(k);
  }
  return out;
}
// buy: put augment `id` into slot k of item d (re-augmenting refunds part of the old one's materials)
function buyAugment(d, k, id) {
  if (inRun()) { toast('Augment items from the main menu Codex, between runs'); return false; }
  if (!slotOpen(SAVE, d, k) || k >= augSlots(d)) return false;
  const list = augList(SAVE, d.id).slice(); while (list.length < augSlots(d)) list.push(null);
  const old = list[k], R = AUG_RULES.run, gold = (augDef(id).gold || 0) + (old ? R.fee : 0), mats = augCost(d, id);
  if (!canPay(SAVE, gold, mats)) { toast('Not enough gold or materials'); return false; }
  SAVE.gold -= gold; for (const [m, n] of Object.entries(mats)) SAVE.materials[m] -= n;
  if (old) for (const [m, n] of Object.entries(augCost(d, old))) { const back = Math.floor(n * R.refund); if (back) SAVE.materials[m] = (SAVE.materials[m] || 0) + back; }
  list[k] = id; SAVE.augments[d.id] = list; writeSave();
  toast(`🔧 ${d.name}: ${augName(id)}${old ? ` (replaced ${augName(old)}, part of its materials refunded)` : ''}`);
  return true;
}

// ---------- in a run ----------
// a new item instance takes its saved augments (the admin test canvas doesn't)
function giveAugments(inst) {
  inst.augs = window.VOIDLIGHT_SANDBOX ? [] : augList(SAVE, inst.def.id).slice(0, augSlots(inst.def)).filter(id => id && augDef(id));
  for (const id of inst.augs) { const e = augEff(id); if (augDef(id).kind === 'effect' && e && !effectsOf(inst.def).includes(e) && !inst.riders.includes(e)) inst.riders.push(e); }
  computeAug(inst);
}
// fusion: the item that remains carries every augment of the ones it absorbed (their Effect augments came along as riders)
function fuseAugments(keep, others) { keep.augs = (keep.augs || []).concat(...others.map(o => o.augs || [])); computeAug(keep); }
function computeAug(inst) {
  const A = { power: 0, cd: 0, area: 0, duration: 0, projSpd: 0, crit: 0, amount: 0, trail: 0, spark: 0, hit: [] };
  for (const id of inst.augs || []) {
    const D = augDef(id); if (!D) continue;
    for (const [k, v] of Object.entries(D.mods || {})) A[k] = (A[k] || 0) + v;
    const e = augEff(id); if (D.kind === 'hit' && e && !A.hit.includes(e)) A.hit.push(e);
  }
  A.power = Math.min(A.power, AUG_RULES.run.powerCap); A.cd = Math.min(A.cd, 0.6); A.amount = Math.floor(A.amount);
  inst.aug = A; return A;
}
const augChip = id => { const D = augDef(id) || { kind: 'form' }, K = AUG_KINDS[D.kind]; return `<span class="chip aug" style="--c:${K.color}" title="${augText(id)}">${K.icon} ${augName(id)}</span>`; };
// the pause menu's line for a held item
function instAugHtml(i) { return i.augs && i.augs.length ? `<small>🔧 ${i.augs.map(augName).join(', ')}</small>` : ''; }

// ---------- the Armory page section ----------
let augPick = null; // { id: itemId, k: slot } while choosing
const costHtml = (gold, mats) => `<span class="gold">● ${gold}</span> ` + Object.entries(mats).map(([m, n]) => `<span class="cost${matHeld(SAVE, m) >= n ? '' : ' short'}" title="${MATERIALS[m].name}: you have ${matHeld(SAVE, m)}">${MATERIALS[m].icon}${n}</span>`).join(' ');
function augSectionHtml(d) {
  const n = augSlots(d), list = augList(SAVE, d.id);
  let h = `<div class="dSec augSec" style="--c:#c9a0ff"><h4>🔧 Augments <small>${n} slots. Permanent; they add up when this item fuses (Power caps at +${Math.round(AUG_RULES.run.powerCap * 100)}% per item)</small></h4>`;
  for (let k = 0; k < n; k++) {
    const id = list[k], open = slotOpen(SAVE, d, k), [a, b] = slotProgress(SAVE, d, k);
    h += `<div class="augSlot${open ? '' : ' locked'}"><b>${k + 1}</b>`;
    if (!open) h += `<span class="aTxt">🔒 ${slotReqText(k)} (${Math.min(a, b)}/${b})</span>`;
    else if (id) h += `<span class="aTxt">${augChip(id)} <small>${augText(id)}</small></span>`;
    else h += '<span class="aTxt"><small>Empty</small></span>';
    if (open && !inRun()) h += `<button class="small" data-aug="${k}">${id ? 'Change' : 'Augment'}</button>`;
    h += '</div>';
    if (augPick && augPick.id === d.id && augPick.k === k) h += augPickerHtml(d, k, id);
  }
  if (inRun()) h += '<p class="note">Augment items from the main menu Codex, between runs.</p>';
  return h + '</div>';
}
function augPickerHtml(d, k, old) {
  const R = AUG_RULES.run; let h = '<div class="augPick">';
  for (const [kind, K] of Object.entries(AUG_KINDS)) {
    const ids = augOptions(d).filter(id => augDef(id).kind === kind && id !== old); if (!ids.length) continue;
    h += `<div class="augKind" style="--c:${K.color}"><b>${K.icon} ${K.name}</b>`;
    for (const id of ids) {
      const gold = (augDef(id).gold || 0) + (old ? R.fee : 0), mats = augCost(d, id), ok = canPay(SAVE, gold, mats);
      h += `<button class="augOpt${ok ? '' : ' off'}" data-pick="${id}" ${ok ? '' : 'disabled'}><span>${augName(id)}</span><small>${augText(id)}</small><span class="costs">${costHtml(gold, mats)}</span></button>`;
    }
    h += '</div>';
  }
  if (old) h += `<p class="note">Changing it refunds ${Math.round(R.refund * 100)}% of ${augName(old)}'s materials (not its gold) and costs ● ${R.fee} more.</p>`;
  return h + '<button class="small" data-pick="">Cancel</button></div>';
}
// after the Armory page renders: its buttons
function wireAugments(box, d, rerender) {
  box.querySelectorAll('[data-aug]').forEach(b => b.onclick = () => { augPick = { id: d.id, k: +b.dataset.aug }; rerender(); });
  box.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { const id = b.dataset.pick, k = augPick ? augPick.k : -1; augPick = null; if (id && k >= 0) buyAugment(d, k, id); rerender(); });
}
