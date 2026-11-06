'use strict';
// ===== VOIDLIGHT nexus items (recipes in NEXUS, items.js) =====
// A Nexus forms when a fusion is made from exactly a recipe's items and the recipe's first item (the core) is the one kept.
// Nothing is halved: the other items are not consumed but become the core's `parts`, live item instances that keep their own
// damage, attacks, cooldowns and passive stats (100%), raised to the new tier, all in the core's one socket. Every part's
// bullets carry every effect of the Nexus. While a Nexus is held, enemies get stronger (NEXUS_THREAT), and forming one
// calls an elite surge. Loaded after progress.js and before main.js; the functions here run only once a run is going.

const nexusDef = id => NEXUS.find(n => n.id === id) || null;
const nexusTier = nx => TIER_KEYS.indexOf(nx.tier);
const nexusUnlocked = (s, nx) => !nx.lock || lockMet(nx.lock, s);
const nexusMade = (s, id) => ((s.nexusMade || {})[id]) || 0;
const nexusOk = nx => nx && !nx.disabled && nexusTier(nx) > 0 && nx.recipe.length === FUSION[nx.tier].need && nx.recipe.every(id => ITEM[id]);
// every item instance working in the run: held items, and the parts living inside held Nexus items
const activeInsts = () => G.inv.flatMap(i => (i.parts ? [i, ...i.parts] : [i]));

// The recipe a fusion group matches, if any. group: item instances of tier t-1 fusing into tier t.
// keep: the item that stays (null = any order). locked: also return recipes the player hasn't learned yet.
function nexusRecipe(group, t, keep, locked) {
  if (group.some(i => i.nexus)) return null;
  const ids = group.map(i => i.def.id);
  for (const nx of NEXUS) {
    if (!nexusOk(nx) || nexusTier(nx) !== t || nx.recipe.length !== ids.length || !nx.recipe.every(id => ids.includes(id))) continue;
    if (keep && keep.def.id !== nx.recipe[0]) continue;
    if (!locked && !(G.sandbox || nexusUnlocked(SAVE, nx))) continue;
    return nx;
  }
  return null;
}
// Nexus recipes the player can form right now: every item held at the tier below, level 5, able to fuse.
function nexusGroups() {
  const out = [];
  for (const nx of NEXUS) {
    if (!nexusOk(nx) || !(G.sandbox || nexusUnlocked(SAVE, nx))) continue;
    const t = nexusTier(nx), group = nx.recipe.map(id => G.inv.find(i => i.def.id === id && !i.nexus && i.tier === t - 1));
    if (group.some(i => !i || !fusable(i)) || !canKeep(group[0]) || !commonEffects(group).length) continue;
    out.push({ group, keeps: [group[0]], tier: t, nexus: nx });
  }
  return out;
}
// Threat: the sum of every held Nexus's threat. Enemy multipliers read it through nexusMul.
const nexusThreat = () => (!G || G.sandbox ? 0 : G.inv.reduce((n, i) => n + (i.nexus ? Math.max(0, (nexusDef(i.nexus) || {}).threat || 0) : 0), 0));
const nexusMul = k => 1 + ((G && G.threat) || 0) * (NEXUS_THREAT[k] || 0);

// Turns a fusion into the Nexus nx. Called from fuse() in main.js instead of the normal 50% absorption.
function formNexus(keep, others, nx, quiet) {
  const T = keep.tier + 1;
  const ready = G.sandbox ? [] : recordFusion(SAVE, TIER_KEYS[T], [keep, ...others].map(i => i.def.id));
  const parts = nx.recipe.slice(1).map(id => others.find(o => o.def.id === id)).filter(Boolean);
  const all = [keep, ...parts], effs = [...new Set(all.flatMap(instEffects))], L = arrivalLevel();
  for (const p of parts) killOwned(p);
  G.inv = G.inv.filter(i => !others.includes(i));
  all.forEach((p, n) => { p.tier = T; p.level = L; p.riders = effs.filter(k => !effectsOf(p.def).includes(k)); p.timer = 0.3 + 0.18 * n; });
  keep.nexus = nx.id; keep.parts = parts;
  for (const p of parts) keep.gone.push(p.def, ...p.gone);
  if (!G.sandbox) {
    G.stats[T === 1 ? 'evolves' : T === 2 ? 'supers' : 'megas']++;
    G.stats.nexus = (G.stats.nexus || 0) + 1;
    SAVE.nexusMade = SAVE.nexusMade || {}; SAVE.nexusMade[nx.id] = (SAVE.nexusMade[nx.id] || 0) + 1;
    SAVE.stats.nexus = (SAVE.stats.nexus || 0) + 1;
    writeSave();
  }
  recomputePool(); rebuild(keep); for (const p of parts) rebuild(p);
  if (!quiet) {
    const col = nx.color || TIER_COLORS[T];
    banner(`✴ NEXUS: ${nx.name.toUpperCase()}`, col, 3.2);
    fxRing(G.player.x, G.player.y, 220 + 80 * T, col, 0.8, 8); fxRing(G.player.x, G.player.y, 120 + 40 * T, '#ffffff', 0.5, 4); G.shake = Math.max(G.shake, 10);
    toast(`✴ ${all.map(p => p.def.icon).join(' → ')} became ${nx.icon} ${nx.name}. Every part keeps 100% of its power. Enemies grow stronger while you hold it.`);
    nexusSurge(nx);
  }
  for (const id of ready) toast(`✦ ${ITEM[id].icon} ${ITEM[id].name} can now ${tierName(T + 1)} Fuse.`);
  return keep;
}
// The void answers a Nexus: a ring of elites, NEXUS_THREAT.surge per threat point.
function nexusSurge(nx) {
  if (G.sandbox) return;
  const n = Math.round(Math.max(0, nx.threat || 0) * (NEXUS_THREAT.surge || 0)); if (!n) return;
  const avail = SPAWN_TABLE.filter(s => G.time >= s[1]), R = viewRadius();
  for (let k = 0; k < n; k++) { const a = k * TAU / n, type = pick(avail)[0]; spawnEnemy(type, G.player.x + Math.cos(a) * R, G.player.y + Math.sin(a) * R, { elite: true }); }
  later(1.2, () => banner('The void answers your Nexus', '#ff4cc3', 2));
}

// ---------- text for cards, the pause menu and the Codex ----------
const nexusThreatText = th => `enemies +${Math.round(th * NEXUS_THREAT.hp * 100)}% HP, +${Math.round(th * NEXUS_THREAT.dmg * 100)}% damage, +${Math.round(th * NEXUS_THREAT.spawn * 100)}% spawns`;
const nexusRecipeText = nx => nx.recipe.map(id => (ITEM[id] ? ITEM[id].icon + ' ' + ITEM[id].name : id)).join(' → ');
function nexusCardText(nx) {
  const t = nexusTier(nx), core = ITEM[nx.recipe[0]];
  return `${core.name} stays as the core and the others join it in this order: ${nexusRecipeText(nx)}. Nothing is halved: every part keeps 100% of its damage, attack and stats at ${tierName(t)} strength, in one socket. ` +
    `While you hold it, ${nexusThreatText(nx.threat || 0)}, and elites answer when it forms. Starts at level ${arrivalLevel()}.`;
}
// the line a normal fusion card adds when its items are a Nexus recipe
function nexusHint(group, t) {
  const nx = nexusRecipe(group, t, null, true); if (!nx) return '';
  if (G.sandbox || nexusUnlocked(SAVE, nx)) return ` ✴ Keep ${ITEM[nx.recipe[0]].name} to form the Nexus ${nx.name} instead.`;
  return ` 🔒 These items are the Nexus recipe ${nx.name} (learn it: ${lockLabel(nx.lock)}).`;
}
// pause menu chip line for a Nexus
const nexusPauseLine = i => { const nx = nexusDef(i.nexus); return nx ? `<small style="color:${nx.color || '#ff4cc3'}">✴ Nexus ${nx.name} (${tierName(i.tier)}): ${[i, ...i.parts].map(p => p.def.icon + ' ' + p.def.name).join(' → ')}. Every part fires at 100%. Threat ${nx.threat}.</small>` : ''; };

// Codex "✴ Nexus" tab: every recipe, what it needs, and how often it was formed.
function renderNexusCodex(wrap) {
  for (const nx of NEXUS) {
    if (!nexusOk(nx)) continue;
    const t = nexusTier(nx), known = nexusUnlocked(SAVE, nx), made = nexusMade(SAVE, nx.id), held = inRun() && G.inv.some(i => i.nexus === nx.id);
    const el = document.createElement('div'); el.className = 'card item nexus' + (known ? '' : ' locked'); el.style.setProperty('--c', nx.color || TIER_COLORS[t]);
    const need = t === 1 ? 'level 5 items' : `level 5 ${tierName(t - 1)} items (by their core item)`;
    const tierLock = FUSION[nx.tier].lock && !tierUnlocked(SAVE, nx.tier) ? `<div class="req">🔒 ${tierName(t)} fusion: ${lockLabel(FUSION[nx.tier].lock)}</div>` : '';
    el.innerHTML = `<div class="ico">${nx.icon}</div><div class="body"><b>${nx.name}</b><div class="tags"><span style="color:${TIER_COLORS[t]}">✴ ${tierName(t)} Nexus</span><span>Threat ${nx.threat}</span>${made ? `<span>Formed ${made}×</span>` : ''}${held ? '<span class="held">In this run</span>' : ''}</div>` +
      `<small>${nexusRecipeText(nx)}</small><small class="perk">${tierName(t)} fusion of these ${need}, keeping ${ITEM[nx.recipe[0]].name}. Every part keeps 100% of its power. While held: ${nexusThreatText(nx.threat || 0)}.</small>` +
      (known ? '<small class="fuse">✴ Recipe known</small>' : `<div class="req">🔒 Learn the recipe: ${lockLabel(nx.lock)}</div>`) + tierLock + '</div>';
    wrap.appendChild(el);
  }
}
