'use strict';
// ===== VOIDLIGHT progression: the save format, unlock rules and achievements =====
// Shared by the game (main.js) and the admin panel's progress simulator (admin.js), so both apply the same rules.
// Everything here is a pure function of a save object `s`; nothing reads or writes storage.
// Loaded after items.js and content.js.
const SAVE_VERSION = 3;
// Default fusion lock of every item: fusing it opens up once you reach `level` with it in `runs` different runs.
// An item's own `fuseLock` overrides parts of it; runs: 0 means it can always fuse.
const FUSE_LOCK = { level: 5, runs: 1 };
const effectsOf = d => (d.effect2 && d.effect2 !== d.effect ? [d.effect, d.effect2] : [d.effect]);
const isPassive = d => !!(d && d.passive);
// per-level stats in a save: kills and runs add up, best is the longest survival in seconds, wins and bosses count
const STAGE_STATS = { kills: 'Enemies defeated', best: 'Best survival time (seconds)', wins: 'Times beaten', bosses: 'Bosses defeated', runs: 'Runs played' };
const stageCount = () => STAGES.length;
const stageDef = n => STAGES[Math.max(1, Math.min(stageCount(), n | 0)) - 1];
const emptyStage = () => ({ kills: 0, best: 0, wins: 0, bosses: 0, runs: 0 });

function defaultSave() {
  return { ver: SAVE_VERSION, gold: 0, upg: {}, unlockedItems: [], unlockedCats: [], unlockedChars: ['kael', 'mira', 'volt'], itemRuns: {}, stages: {}, lastStage: 1,
    stats: { totalKills: 0, bestTime: 0, bossKills: 0, evolves: 0, supers: 0, megas: 0, wins: 0, runs: 0, maxLevel: 0, totalGold: 0 }, settings: { numbers: true }, lastChar: 'kael' };
}
const strList = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
const cnt = v => Math.max(0, Math.floor(+v || 0));
// Fills in whatever an older or partial save is missing, and upgrades v1 and v2 saves.
function normalizeSave(s) {
  const d = defaultSave(); if (!s || typeof s !== 'object') return d;
  const ver = +s.ver || 1;
  const out = Object.assign(d, s);
  out.stats = Object.assign(defaultSave().stats, s.stats || {});
  out.settings = Object.assign(defaultSave().settings, s.settings || {});
  out.upg = Object.assign({}, s.upg || {});
  out.unlockedItems = strList(s.unlockedItems);
  out.unlockedCats = strList(s.unlockedCats);
  out.unlockedChars = Array.isArray(s.unlockedChars) ? strList(s.unlockedChars) : d.unlockedChars;
  // itemRuns[id][L-1] = how many runs reached level L (or higher) with that item
  out.itemRuns = {};
  for (const [id, r] of Object.entries(s.itemRuns || {})) if (Array.isArray(r)) out.itemRuns[id] = [0, 1, 2, 3, 4].map(k => cnt(r[k]));
  out.stages = {};
  for (const [n, st] of Object.entries(s.stages || {})) if (st && typeof st === 'object' && +n >= 1) { const x = emptyStage(); for (const k of Object.keys(x)) x[k] = cnt(st[k]); out.stages[String(+n)] = x; }
  out.lastStage = Math.max(1, Math.min(stageCount(), +s.lastStage || 1));
  if (ver < 2) {
    // v1 had no item categories. Anything a player bought with gold stays usable, so its categories open up.
    for (const id of out.unlockedItems) {
      const it = ITEM[id]; if (!it) continue;
      for (const k of effectsOf(it)) if (!out.unlockedCats.includes(k)) out.unlockedCats.push(k);
    }
  }
  if (ver < 3) {
    // v2 had one level. Everything done so far happened in Level 1, so a player who has won a run finds Level 2 open.
    // Items and heroes already unlocked (bought or earned) stay owned.
    const st = s.stats || {};
    out.stages['1'] = { kills: cnt(st.totalKills), best: cnt(st.bestTime), wins: cnt(st.wins), bosses: cnt(st.bossKills), runs: cnt(st.runs) };
  }
  out.ver = SAVE_VERSION;
  return out;
}
// Combines progress a guest made on this device with an account's cloud save, so nothing earned is lost.
// Gold and counters add up, ranks and records take the higher value, unlocks are the union.
function mergeSaves(a, b) {
  a = normalizeSave(a); b = normalizeSave(b);
  const m = normalizeSave(b);
  m.gold = (a.gold || 0) + (b.gold || 0);
  for (const id of new Set([...Object.keys(a.upg), ...Object.keys(b.upg)])) m.upg[id] = Math.max(a.upg[id] || 0, b.upg[id] || 0);
  m.unlockedItems = [...new Set([...a.unlockedItems, ...b.unlockedItems])];
  m.unlockedCats = [...new Set([...a.unlockedCats, ...b.unlockedCats])];
  m.unlockedChars = [...new Set([...a.unlockedChars, ...b.unlockedChars])];
  for (const k of ['totalKills', 'bossKills', 'evolves', 'supers', 'megas', 'wins', 'runs', 'totalGold']) m.stats[k] = (a.stats[k] || 0) + (b.stats[k] || 0);
  for (const k of ['bestTime', 'maxLevel']) m.stats[k] = Math.max(a.stats[k] || 0, b.stats[k] || 0);
  for (const id of new Set([...Object.keys(a.itemRuns), ...Object.keys(b.itemRuns)])) {
    const x = a.itemRuns[id] || [0, 0, 0, 0, 0], y = b.itemRuns[id] || [0, 0, 0, 0, 0]; m.itemRuns[id] = x.map((v, k) => v + y[k]);
  }
  for (const n of new Set([...Object.keys(a.stages), ...Object.keys(b.stages)])) {
    const x = a.stages[n] || emptyStage(), y = b.stages[n] || emptyStage(), z = emptyStage();
    for (const k of Object.keys(z)) z[k] = k === 'best' ? Math.max(x[k], y[k]) : x[k] + y[k];
    m.stages[n] = z;
  }
  m.lastStage = Math.max(a.lastStage, b.lastStage);
  return m;
}

// ---------- levels ----------
const stageStats = (s, n) => (s.stages || {})[String(n)] || emptyStage();
// Level 1 is always open; every other one opens once the level before it has been beaten.
const stageUnlocked = (s, n) => n <= 1 || (n <= stageCount() && stageStats(s, n - 1).wins > 0);
const stagesUnlocked = s => { let n = 1; while (n < stageCount() && stageUnlocked(s, n + 1)) n++; return n; };
// Extra sockets: one can be bought in the Forge for every level unlocked beyond the first.
const socketCap = s => stagesUnlocked(s) - 1;
const socketsBought = s => UPGRADES.filter(u => u.socket).reduce((n, u) => n + (s.upg[u.id] || 0), 0);
const slotSockets = (s, slot) => SLOTS[slot].sockets + ((UPGRADES.find(u => u.socket === slot) && s.upg['sock_' + slot]) || 0);

// ---------- unlock rules ----------
// Locks are data, on the thing they lock (items, characters, categories, fusion tiers). The requirement is one of:
//   { stage: 3, stat: 'kills', min: 1000, text }        a per-level stat (kills, best, wins, bosses, runs) reaches min
//   { stat: 'totalKills', min: 500, text }               a lifetime stat reaches min
//   { effect: 'burn', level: 5, text }                   reach that level with any item of that category
//   { item: 'ember_pistol', level: 5, runs: 1, text }    reach that level with that item in that many runs
// Items and characters can add cost: once the requirement is met they can be bought for that much gold
// (no cost = granted for free). Categories and fusion tiers are always free. A lock with only a cost is
// treated as already earned (old admin overrides); the game no longer has gold-only unlocks.
const runsAt = (s, id, L) => ((s.itemRuns || {})[id] || [])[Math.max(1, Math.min(5, L | 0)) - 1] || 0;
function bestEffectLevel(s, k) {
  let best = 0;
  for (const d of ITEMS) if (effectsOf(d).includes(k)) for (let L = 5; L > best; L--) if (runsAt(s, d.id, L) > 0) { best = L; break; }
  return best;
}
const hasReq = l => !!(l && (l.stage || l.stat || l.item || l.effect));
// [have, need] toward an achievement lock
function lockProgress(lock, s) {
  if (!hasReq(lock)) return [1, 1];
  if (lock.stage) return [stageStats(s, lock.stage)[lock.stat] || 0, lock.min];
  if (lock.stat) return [s.stats[lock.stat] || 0, lock.min];
  if (lock.item) return [runsAt(s, lock.item, lock.level), lock.runs || 1];
  if (lock.effect) return [bestEffectLevel(s, lock.effect), lock.level];
  return [0, 1];
}
const lockMet = (lock, s) => { if (!lock) return false; const [a, b] = lockProgress(lock, s); return a >= b; };
const lockCost = l => (l && l.cost > 0 ? l.cost : 0);
const mmss = n => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
function reqText(l) {
  if (!hasReq(l)) return 'Available';
  if (l.stage) {
    const one = l.min === 1, L = `Level ${l.stage}`;
    switch (l.stat) {
      case 'kills': return `Defeat ${l.min} enemies in ${L}`;
      case 'best': return `Survive ${mmss(l.min)} in ${L}`;
      case 'wins': return one ? `Beat ${L}` : `Beat ${L} ${l.min} times`;
      case 'bosses': return one ? `Defeat a boss in ${L}` : `Defeat ${l.min} bosses in ${L}`;
      case 'runs': return `Play ${l.min} runs in ${L}`;
    }
    return '';
  }
  if (l.item) { const d = ITEM[l.item]; return `Reach level ${l.level} with ${d ? d.name : l.item}` + ((l.runs || 1) > 1 ? ` in ${l.runs} runs` : ''); }
  if (l.effect) return `Reach level ${l.level} with any ${(EFFECTS[l.effect] || { name: l.effect }).name} item`;
  const one = l.min === 1;
  switch (l.stat) {
    case 'totalKills': return `Defeat ${l.min} enemies (lifetime)`;
    case 'bestTime': return `Survive ${mmss(l.min)} in any level`;
    case 'bossKills': return one ? 'Defeat a boss' : `Defeat ${l.min} bosses`;
    case 'evolves': return one ? 'Fuse an item' : `Make ${l.min} fusions`;
    case 'supers': return one ? 'Make a Super fusion' : `Make ${l.min} Super fusions`;
    case 'megas': return one ? 'Make a Mega fusion' : `Make ${l.min} Mega fusions`;
    case 'wins': return one ? 'Win a run' : `Win ${l.min} runs`;
    case 'runs': return `Play ${l.min} runs`;
    case 'maxLevel': return `Reach character level ${l.min} in a run`;
    case 'totalGold': return `Earn ${l.min} gold (lifetime)`;
  }
  return '';
}
// the requirement as generated text (admin uses it to keep `text` in sync)
const lockText = reqText;
const lockLabel = l => (l ? l.text || reqText(l) : '');
const lockFull = l => lockLabel(l) + (lockCost(l) ? `, then buy for ● ${lockCost(l)}` : '');
const catLock = k => (CATEGORIES[k] || {}).lock || null;
const catUnlocked = (s, k) => !catLock(k) || s.unlockedCats.includes(k);
const startingCats = () => EFFECT_KEYS.filter(k => !catLock(k));
// an item can show up in runs once every category it belongs to is open and the player owns it (if it has a lock)
const itemOwned = (s, d) => !d.lock || s.unlockedItems.includes(d.id);
const itemUnlocked = (s, d) => effectsOf(d).every(k => catUnlocked(s, k)) && itemOwned(s, d);
const charUnlocked = (s, c) => !c.lock || s.unlockedChars.includes(c.id);
// earned but not paid for yet
const itemBuyable = (s, d) => !!d.lock && !itemOwned(s, d) && lockMet(d.lock, s);
const charBuyable = (s, c) => !!c.lock && !charUnlocked(s, c) && lockMet(c.lock, s);
const fuseLockOf = d => Object.assign({}, FUSE_LOCK, d.fuseLock || {});
const fuseUnlocked = (s, d) => { const f = fuseLockOf(d); return f.runs <= 0 || runsAt(s, d.id, f.level) >= f.runs; };
const fuseLockText = d => { const f = fuseLockOf(d); return f.runs <= 0 ? 'Can always fuse' : reqText({ item: d.id, level: f.level, runs: f.runs }); };
// fusion tiers above Fused (Super, Mega) open with an achievement
const tierUnlocked = (s, key) => { const l = (FUSION[key] || {}).lock; return !l || lockMet(l, s); };

// Grants every free unlock whose requirement is met. Returns what was newly unlocked, for display.
function applyUnlocks(s) {
  const fresh = [];
  for (const k of EFFECT_KEYS) { const l = catLock(k); if (l && lockMet(l, s) && !s.unlockedCats.includes(k)) { s.unlockedCats.push(k); fresh.push(`${EFFECTS[k].icon} ${EFFECTS[k].name} items`); } }
  for (const d of ITEMS) if (d.lock && !lockCost(d.lock) && lockMet(d.lock, s) && !s.unlockedItems.includes(d.id)) {
    s.unlockedItems.push(d.id);
    const shut = effectsOf(d).filter(k => !catUnlocked(s, k));
    fresh.push(d.icon + ' ' + d.name + (shut.length ? ` (once ${shut.map(k => EFFECTS[k].name).join(' and ')} items are unlocked)` : ''));
  }
  for (const c of CHARACTERS) if (c.lock && !lockCost(c.lock) && lockMet(c.lock, s) && !s.unlockedChars.includes(c.id)) { s.unlockedChars.push(c.id); fresh.push('🧍 ' + c.name + ' (character)'); }
  return fresh;
}
// Everything a player could see change at the end of a run: compare a snapshot before and after with progressDiff.
function progressSnapshot(s) {
  return { buy: [...ITEMS.filter(d => !d.disabled && itemBuyable(s, d)).map(d => 'i:' + d.id), ...CHARACTERS.filter(c => charBuyable(s, c)).map(c => 'c:' + c.id)],
    stages: stagesUnlocked(s), tiers: TIER_KEYS.filter(k => tierUnlocked(s, k)) };
}
function progressDiff(a, b) {
  const out = [];
  for (let n = a.stages + 1; n <= b.stages; n++) out.push(`🗺 Level ${n}: ${stageDef(n).name} is open. The Forge has another socket for sale.`);
  for (const k of b.tiers) if (!a.tiers.includes(k)) out.push(`✦ ${FUSION[k].name} fusion: ${FUSION[k].need} level 5 ${FUSION[TIER_KEYS[TIER_KEYS.indexOf(k) - 1]].name.toLowerCase()} items that share an effect become one.`);
  for (const id of b.buy) if (!a.buy.includes(id)) {
    if (id[0] === 'i') { const d = ITEM[id.slice(2)]; out.push(`🛒 ${d.icon} ${d.name} can be bought in the Codex for ● ${lockCost(d.lock)}`); }
    else { const c = CHARACTERS.find(x => x.id === id.slice(2)); out.push(`🛒 ${c.name} can be hired on the hero screen for ● ${lockCost(c.lock)}`); }
  }
  return out;
}
// Every achievement in the game, with progress, for the Achievements screen and the admin simulator.
// stage: the level it belongs to (0 = not tied to a level). owned: false while an earned item or hero still has to be bought.
function achievementList(s) {
  const out = [];
  const add = (group, icon, name, lock, reward, done, owned = true) => { const [have, need] = lockProgress(lock, s);
    out.push({ group, stage: lock.stage || 0, icon, name, text: lockLabel(lock), have: Math.min(have, need), need, done, owned, cost: lockCost(lock), reward }); };
  for (let n = 2; n <= stageCount(); n++) add('stages', '🗺', `Level ${n}: ${stageDef(n).name}`, { stage: n - 1, stat: 'wins', min: 1 }, `Level ${n} and a Forge socket`, stageUnlocked(s, n));
  for (const k of TIER_KEYS) { const l = FUSION[k].lock; if (l) add('tiers', '✦', `${FUSION[k].name} fusion`, l, `${FUSION[k].name} fusion (${FUSION[k].need} items → 1)`, tierUnlocked(s, k)); }
  for (const k of EFFECT_KEYS) { const l = catLock(k); if (l) add('cats', EFFECTS[k].icon, `${EFFECTS[k].name} awakened`, l, `${EFFECTS[k].name} items`, catUnlocked(s, k)); }
  for (const d of ITEMS) if (!d.disabled) { const f = fuseLockOf(d); if (f.runs > 0) add('mastery', d.icon, `${d.name} mastery`, { item: d.id, level: f.level, runs: f.runs }, `Fusing ${d.name}`, fuseUnlocked(s, d)); }
  for (const d of ITEMS) if (!d.disabled && hasReq(d.lock)) add('unlocks', d.icon, d.name, d.lock, d.name, lockMet(d.lock, s), itemOwned(s, d));
  for (const c of CHARACTERS) if (hasReq(c.lock)) add('unlocks', '🧍', c.name, c.lock, `${c.name}, ${c.title}`, lockMet(c.lock, s), charUnlocked(s, c));
  return out;
}
