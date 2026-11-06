'use strict';
// ===== VOIDLIGHT progression: the save format, unlock rules and achievements =====
// Shared by the game (main.js) and the admin panel's progress simulator (admin.js), so both apply the same rules.
// Everything here is a pure function of a save object `s`; nothing reads or writes storage.
// Loaded after items.js and content.js.
const SAVE_VERSION = 4;
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
  return { ver: SAVE_VERSION, gold: 0, upg: {}, unlockedItems: [], unlockedCats: [], unlockedChars: ['kael', 'mira', 'volt'], itemRuns: {}, fuseLog: {}, nexusMade: {}, stages: {}, charStages: {}, lastStage: 1,
    itemKills: {}, bestiary: {}, materials: {}, augments: {}, mapsFound: [], forged: [], attuned: [],
    stats: { totalKills: 0, bestTime: 0, bossKills: 0, evolves: 0, supers: 0, megas: 0, nexus: 0, wins: 0, runs: 0, maxLevel: 0, totalGold: 0 }, settings: { numbers: true }, lastChar: 'kael' };
}
const strList = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
const cnt = v => Math.max(0, Math.floor(+v || 0));
// { '3': { kills, best, ... } } with every value cleaned up
function stageMap(m) {
  const out = {};
  for (const [n, st] of Object.entries(m || {})) if (st && typeof st === 'object' && +n >= 1) { const x = emptyStage(); for (const k of Object.keys(x)) x[k] = cnt(st[k]); out[String(+n)] = x; }
  return out;
}
function addStageMaps(a, b) {
  const out = {};
  for (const n of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    const x = (a || {})[n] || emptyStage(), y = (b || {})[n] || emptyStage(), z = emptyStage();
    for (const k of Object.keys(z)) z[k] = k === 'best' ? Math.max(x[k], y[k]) : x[k] + y[k];
    out[n] = z;
  }
  return out;
}
// Fusion history, kept across runs: fuseLog[itemId][tierKey] = the distinct partner sets that item has fused with into that tier.
// A partner set is the ids of the other items in the fusion, sorted and joined with '+' (one id for a 2-item Fused fusion).
// Every item in a fusion is credited, the one kept and the ones consumed. FUSION[tier].hist (items.js) asks for that many
// distinct partner sets one tier below: Super needs 3 different Fused partners, Mega needs 5 different Super combinations.
const FUSE_LOG_CAP = 300;
function fuseLogMap(m) {
  const out = {};
  for (const [id, e] of Object.entries(m || {})) {
    if (!e || typeof e !== 'object') continue;
    const x = {};
    for (const k of TIER_KEYS.slice(1)) { const l = [...new Set(strList(e[k]))].slice(0, FUSE_LOG_CAP); if (l.length) x[k] = l; }
    if (Object.keys(x).length) out[id] = x;
  }
  return out;
}
const fuseKey = ids => ids.slice().sort().join('+');
const fuseLogOf = (s, id) => ((s.fuseLog || {})[id]) || {};
// the distinct partner sets item `id` has fused with into tier `key`, each as a list of item ids
const fusedSets = (s, id, key) => (fuseLogOf(s, id)[key] || []).map(k => k.split('+'));
// every item it has ever fused with, at any tier
const fusedPartners = (s, id) => [...new Set(TIER_KEYS.slice(1).flatMap(k => fusedSets(s, id, k).flat()))];
// Records one fusion into tier `key`. ids: the base item id of every item in the group. Returns the ids that just became
// eligible for the next tier through it.
function recordFusion(s, key, ids) {
  const t = TIER_KEYS.indexOf(key), next = TIER_KEYS[t + 1], fresh = [];
  s.fuseLog = s.fuseLog || {};
  ids.forEach((id, n) => {
    const was = next ? histMet(s, id, t + 1) : true;
    const e = s.fuseLog[id] = s.fuseLog[id] || {}, l = e[key] = e[key] || [], k = fuseKey(ids.filter((_, m) => m !== n));
    if (k && !l.includes(k) && l.length < FUSE_LOG_CAP) l.push(k);
    if (!was && histMet(s, id, t + 1) && !fresh.includes(id)) fresh.push(id);
  });
  return fresh;
}
// History requirement for fusing item `id` into tier index t: [have, need]. Only Super and above have one.
function histProgress(s, id, t) {
  const f = FUSION[TIER_KEYS[t]], need = t >= 2 && f ? Math.max(0, f.hist | 0) : 0;
  return [need ? (fuseLogOf(s, id)[TIER_KEYS[t - 1]] || []).length : 0, need];
}
const histMet = (s, id, t) => { const [a, b] = histProgress(s, id, t); return a >= b; };
function histText(t) {
  const f = FUSION[TIER_KEYS[t]], n = (f && f.hist) | 0, below = FUSION[TIER_KEYS[t - 1]];
  if (!n || t < 2) return '';
  return below.need <= 2 ? `fused with ${n} different item${n > 1 ? 's' : ''}` : `made ${n} different ${below.name} fusion${n > 1 ? 's' : ''}`;
}
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
  out.fuseLog = fuseLogMap(s.fuseLog);
  // nexusMade[nexusId] = how many times that Nexus was formed (nexus.js)
  out.nexusMade = {};
  for (const [id, n] of Object.entries(s.nexusMade || {})) if (cnt(n)) out.nexusMade[id] = cnt(n);
  out.stages = stageMap(s.stages);
  // charStages[heroId][level] = the same per-level stats, counted only for runs played as that hero (tracked since v3.1)
  out.charStages = {};
  for (const [c, m] of Object.entries(s.charStages || {})) if (m && typeof m === 'object') out.charStages[c] = stageMap(m);
  out.lastStage = Math.max(1, Math.min(stageCount(), +s.lastStage || 1));
  // v4: per-item kills, the enemy Codex (bestiary), materials, item augments, maps found per level, forged recipes, attuned items
  out.itemKills = {}; for (const [id, n] of Object.entries(s.itemKills || {})) if (cnt(n)) out.itemKills[id] = cnt(n);
  out.bestiary = {};
  for (const [id, b] of Object.entries(s.bestiary || {})) if (b && typeof b === 'object') out.bestiary[id] = { seen: cnt(b.seen), kills: cnt(b.kills), tier: Math.min(3, cnt(b.tier)) };
  out.materials = {}; for (const [id, n] of Object.entries(s.materials || {})) if (cnt(n)) out.materials[id] = cnt(n);
  out.augments = {};
  for (const [id, a] of Object.entries(s.augments || {})) if (Array.isArray(a)) out.augments[id] = a.slice(0, 12).map(x => (typeof x === 'string' ? x : null));
  out.mapsFound = [...new Set((Array.isArray(s.mapsFound) ? s.mapsFound : []).map(n => n | 0).filter(n => n >= 1))];
  out.forged = strList(s.forged);
  out.attuned = strList(s.attuned).slice(0, 3);
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
  for (const k of ['totalKills', 'bossKills', 'evolves', 'supers', 'megas', 'nexus', 'wins', 'runs', 'totalGold']) m.stats[k] = (a.stats[k] || 0) + (b.stats[k] || 0);
  for (const k of ['bestTime', 'maxLevel']) m.stats[k] = Math.max(a.stats[k] || 0, b.stats[k] || 0);
  for (const id of new Set([...Object.keys(a.itemRuns), ...Object.keys(b.itemRuns)])) {
    const x = a.itemRuns[id] || [0, 0, 0, 0, 0], y = b.itemRuns[id] || [0, 0, 0, 0, 0]; m.itemRuns[id] = x.map((v, k) => v + y[k]);
  }
  m.fuseLog = {};
  for (const id of new Set([...Object.keys(a.fuseLog), ...Object.keys(b.fuseLog)])) {
    const x = a.fuseLog[id] || {}, y = b.fuseLog[id] || {}, z = {};
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) z[k] = [...new Set([...(x[k] || []), ...(y[k] || [])])].slice(0, FUSE_LOG_CAP);
    m.fuseLog[id] = z;
  }
  m.nexusMade = {};
  for (const id of new Set([...Object.keys(a.nexusMade), ...Object.keys(b.nexusMade)])) m.nexusMade[id] = (a.nexusMade[id] || 0) + (b.nexusMade[id] || 0);
  m.stages = addStageMaps(a.stages, b.stages);
  m.charStages = {};
  for (const c of new Set([...Object.keys(a.charStages), ...Object.keys(b.charStages)])) m.charStages[c] = addStageMaps(a.charStages[c], b.charStages[c]);
  m.lastStage = Math.max(a.lastStage, b.lastStage);
  const addMap = (x, y) => { const z = {}; for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) z[k] = (x[k] || 0) + (y[k] || 0); return z; };
  m.itemKills = addMap(a.itemKills, b.itemKills);
  m.materials = addMap(a.materials, b.materials);
  m.bestiary = {};
  for (const id of new Set([...Object.keys(a.bestiary), ...Object.keys(b.bestiary)])) { const x = a.bestiary[id] || {}, y = b.bestiary[id] || {};
    m.bestiary[id] = { seen: (x.seen || 0) + (y.seen || 0), kills: (x.kills || 0) + (y.kills || 0), tier: Math.max(x.tier || 0, y.tier || 0) }; }
  // augments: per item, the side with more filled slots wins (they cost materials, so neither side's work is lost silently)
  m.augments = {};
  for (const id of new Set([...Object.keys(a.augments), ...Object.keys(b.augments)])) { const x = a.augments[id] || [], y = b.augments[id] || [], n = l => l.filter(Boolean).length; m.augments[id] = (n(x) > n(y) ? x : y).slice(); }
  m.mapsFound = [...new Set([...a.mapsFound, ...b.mapsFound])];
  m.forged = [...new Set([...a.forged, ...b.forged])];
  m.attuned = (b.attuned.length ? b.attuned : a.attuned).slice();
  return m;
}

// ---------- levels ----------
const stageStats = (s, n) => (s.stages || {})[String(n)] || emptyStage();
const charStageStats = (s, c, n) => ((s.charStages || {})[c] || {})[String(n)] || emptyStage();
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
//   { char: 'kael', stage: 2, stat: 'wins', min: 1 }     a per-level stat, counting only runs played as that hero
//   { mastery: 'ember_pistol' }                          that item's mastery (its fusion lock, fuseLock / FUSE_LOCK)
//   { cat: 'poison' }                                    that category is unlocked
//   { all: [req, req, ...], text }                       every one of those (any of the kinds above)
// Items and characters can add cost: once the requirement is met they can be bought for that much gold
// (no cost = granted for free). Categories and fusion tiers are always free. A lock with only a cost is
// treated as already earned (old admin overrides); the game no longer has gold-only unlocks.
const runsAt = (s, id, L) => ((s.itemRuns || {})[id] || [])[Math.max(1, Math.min(5, L | 0)) - 1] || 0;
function bestEffectLevel(s, k) {
  let best = 0;
  for (const d of ITEMS) if (effectsOf(d).includes(k)) for (let L = 5; L > best; L--) if (runsAt(s, d.id, L) > 0) { best = L; break; }
  return best;
}
const hasReq = l => !!(l && (l.all ? l.all.some(hasReq) : l.stage || l.stat || l.item || l.effect || l.char || l.mastery || l.cat));
// the single requirements of a lock (one, or the parts of an `all` lock)
const lockParts = l => (!hasReq(l) ? [] : l.all ? l.all.filter(p => hasReq(p) && !p.all) : [l]);
// the level a lock belongs to (the highest one any part names), for grouping achievements
const lockStage = l => Math.max(0, ...lockParts(l).map(p => (p.mastery || p.cat ? 0 : p.stage || 0)));
// [have, need] toward an achievement lock; for an `all` lock: how many parts are done, of how many
function lockProgress(lock, s) {
  if (!hasReq(lock)) return [1, 1];
  if (lock.all) { const ps = lockParts(lock); return [ps.filter(p => lockMet(p, s)).length, ps.length]; }
  if (lock.char) return [charStageStats(s, lock.char, lock.stage)[lock.stat] || 0, lock.min];
  if (lock.mastery) { const d = ITEM[lock.mastery]; if (!d) return [0, 1]; const f = fuseLockOf(d); return f.runs <= 0 ? [1, 1] : [runsAt(s, d.id, f.level), f.runs]; }
  if (lock.cat) return [catUnlocked(s, lock.cat) ? 1 : 0, 1];
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
  if (l.all) return lockParts(l).map(reqText).map((t, i) => (i ? t[0].toLowerCase() + t.slice(1) : t)).join(' and ');
  if (l.char) {
    const c = CHARACTERS.find(x => x.id === l.char), nm = c ? c.name : l.char;
    return reqText({ stage: l.stage, stat: l.stat, min: l.min }) + ' with ' + nm;
  }
  if (l.mastery) { const d = ITEM[l.mastery]; if (!d) return 'Master ' + l.mastery; const f = fuseLockOf(d); return `Master ${d.name}` + (f.runs <= 0 ? '' : ` (reach level ${f.level} with it${f.runs > 1 ? ` in ${f.runs} runs` : ''})`); }
  if (l.cat) return `Unlock ${(EFFECTS[l.cat] || { name: l.cat }).name} items`;
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
    case 'nexus': return one ? 'Form a Nexus' : `Form ${l.min} Nexus items`;
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
const partLabel = p => p.text || reqText(p);
const lockFull = l => lockLabel(l) + (lockCost(l) ? `, then buy for ● ${lockCost(l)}` : '');
const catLock = k => (CATEGORIES[k] || {}).lock || null;
const catUnlocked = (s, k) => !catLock(k) || s.unlockedCats.includes(k);
const startingCats = () => EFFECT_KEYS.filter(k => !catLock(k));
// an item can show up in runs once every category it belongs to is open and the player owns it (if it has a lock)
const itemOwned = (s, d) => !d.lock || s.unlockedItems.includes(d.id);
const itemUnlocked = (s, d) => effectsOf(d).every(k => catUnlocked(s, k)) && itemOwned(s, d);
// owned: earned (and bought, if it has a price), or a starting hero
const charUnlocked = (s, c) => !c.lock || s.unlockedChars.includes(c.id);
// No effect is available before its category: a hero whose starting weapon is in a locked category can't be played
// (or earned) until that category opens. charLock(c) is the hero's lock with those categories added as parts.
const charCats = c => { const w = ITEM[c.weapon]; return w ? effectsOf(w).filter(k => catLock(k)) : []; };
const charCatsOpen = (s, c) => charCats(c).every(k => catUnlocked(s, k));
function charLock(c) {
  const cats = charCats(c).filter(k => !lockParts(c.lock).some(p => p.cat === k)).map(k => ({ cat: k }));
  if (!cats.length) return c.lock || null;
  const parts = [...lockParts(c.lock), ...cats], out = { all: parts, text: [hasReq(c.lock) ? lockLabel(c.lock) : '', ...cats.map(reqText)].filter(Boolean).map((t, i) => (i ? t[0].toLowerCase() + t.slice(1) : t)).join(' and ') };
  if (lockCost(c.lock)) out.cost = c.lock.cost;
  return out;
}
const charPlayable = (s, c) => charUnlocked(s, c) && charCatsOpen(s, c);
// earned but not paid for yet
const itemBuyable = (s, d) => !!d.lock && !itemOwned(s, d) && lockMet(d.lock, s);
const charBuyable = (s, c) => !!c.lock && !charUnlocked(s, c) && lockMet(charLock(c), s);
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
  for (const c of CHARACTERS) if (c.lock && !lockCost(c.lock) && lockMet(charLock(c), s) && !s.unlockedChars.includes(c.id)) { s.unlockedChars.push(c.id); fresh.push('🧍 ' + c.name + ' (character)'); }
  return fresh;
}
// Everything a player could see change at the end of a run: compare a snapshot before and after with progressDiff.
function progressSnapshot(s) {
  return { buy: [...ITEMS.filter(d => !d.disabled && itemBuyable(s, d)).map(d => 'i:' + d.id), ...CHARACTERS.filter(c => charBuyable(s, c)).map(c => 'c:' + c.id)],
    stages: stagesUnlocked(s), tiers: TIER_KEYS.filter(k => tierUnlocked(s, k)), nexus: NEXUS.filter(nx => !nx.disabled && (!nx.lock || lockMet(nx.lock, s))).map(nx => nx.id) };
}
function progressDiff(a, b) {
  const out = [];
  for (let n = a.stages + 1; n <= b.stages; n++) out.push(`🗺 Level ${n}: ${stageDef(n).name} is open. The Forge has another socket for sale.`);
  for (const k of b.tiers) if (!a.tiers.includes(k)) out.push(`✦ ${FUSION[k].name} fusion: ${FUSION[k].need} level 5 ${FUSION[TIER_KEYS[TIER_KEYS.indexOf(k) - 1]].name.toLowerCase()} items that share an effect become one.`);
  for (const id of b.nexus || []) if (!(a.nexus || []).includes(id)) { const nx = NEXUS.find(n => n.id === id); out.push(`✴ Nexus recipe: ${nx.icon} ${nx.name} = ${nx.recipe.map(r => ITEM[r] ? ITEM[r].name : r).join(' → ')} (${FUSION[nx.tier].name} fusion, keep ${ITEM[nx.recipe[0]] ? ITEM[nx.recipe[0]].name : nx.recipe[0]})`); }
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
    const parts = lock.all ? lockParts(lock).map(p => { const [a, b] = lockProgress(p, s); return { text: partLabel(p), have: Math.min(a, b), need: b, done: a >= b }; }) : null;
    out.push({ group, stage: lockStage(lock), icon, name, text: lockLabel(lock), have: Math.min(have, need), need, done, owned, cost: lockCost(lock), reward, parts }); };
  for (let n = 2; n <= stageCount(); n++) add('stages', '🗺', `Level ${n}: ${stageDef(n).name}`, { stage: n - 1, stat: 'wins', min: 1 }, `Level ${n} and a Forge socket`, stageUnlocked(s, n));
  for (const k of TIER_KEYS) { const l = FUSION[k].lock; if (l) add('tiers', '✦', `${FUSION[k].name} fusion`, l, `${FUSION[k].name} fusion (${FUSION[k].need} items → 1)`, tierUnlocked(s, k)); }
  for (const nx of NEXUS) if (!nx.disabled && hasReq(nx.lock)) add('nexus', nx.icon, `Nexus: ${nx.name}`, nx.lock, `${nx.name} recipe (${FUSION[nx.tier].name} Nexus)`, lockMet(nx.lock, s));
  for (const k of EFFECT_KEYS) { const l = catLock(k); if (l) add('cats', EFFECTS[k].icon, `${EFFECTS[k].name} awakened`, l, `${EFFECTS[k].name} items`, catUnlocked(s, k)); }
  for (const d of ITEMS) if (!d.disabled) { const f = fuseLockOf(d); if (f.runs > 0) add('mastery', d.icon, `${d.name} mastery`, { item: d.id, level: f.level, runs: f.runs }, `Fusing ${d.name}`, fuseUnlocked(s, d)); }
  for (const d of ITEMS) if (!d.disabled && hasReq(d.lock)) add('unlocks', d.icon, d.name, d.lock, d.name, lockMet(d.lock, s), itemOwned(s, d));
  for (const c of CHARACTERS) { const l = charLock(c); if (hasReq(l)) add('heroes', '🧍', c.name, l, `${c.name}, ${c.title}`, lockMet(l, s) || (charUnlocked(s, c) && charCatsOpen(s, c)), charUnlocked(s, c)); }
  return out;
}
