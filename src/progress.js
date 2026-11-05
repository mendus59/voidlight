'use strict';
// ===== VOIDLIGHT progression: the save format, unlock rules and achievements =====
// Shared by the game (main.js) and the admin panel's progress simulator (admin.js), so both apply the same rules.
// Everything here is a pure function of a save object `s`; nothing reads or writes storage.
// Loaded after items.js and content.js.
const SAVE_VERSION = 2;
// Default fusion lock of every item: fusing it opens up once you reach `level` with it in `runs` different runs.
// An item's own `fuseLock` overrides parts of it; runs: 0 means it can always fuse.
const FUSE_LOCK = { level: 5, runs: 1 };
const effectsOf = d => (d.effect2 && d.effect2 !== d.effect ? [d.effect, d.effect2] : [d.effect]);

function defaultSave() {
  return { ver: SAVE_VERSION, gold: 0, upg: {}, unlockedItems: [], unlockedCats: [], unlockedChars: ['kael', 'mira', 'volt'], itemRuns: {},
    stats: { totalKills: 0, bestTime: 0, bossKills: 0, evolves: 0, wins: 0, runs: 0, maxLevel: 0, totalGold: 0 }, settings: { numbers: true }, lastChar: 'kael' };
}
const strList = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
// Fills in whatever an older or partial save is missing, and upgrades v1 saves.
function normalizeSave(s) {
  const d = defaultSave(); if (!s || typeof s !== 'object') return d;
  const v1 = !(s.ver >= 2);
  const out = Object.assign(d, s);
  out.stats = Object.assign(defaultSave().stats, s.stats || {});
  out.settings = Object.assign(defaultSave().settings, s.settings || {});
  out.upg = Object.assign({}, s.upg || {});
  out.unlockedItems = strList(s.unlockedItems);
  out.unlockedCats = strList(s.unlockedCats);
  out.unlockedChars = Array.isArray(s.unlockedChars) ? strList(s.unlockedChars) : d.unlockedChars;
  // itemRuns[id][L-1] = how many runs reached level L (or higher) with that item
  out.itemRuns = {};
  for (const [id, r] of Object.entries(s.itemRuns || {})) if (Array.isArray(r)) out.itemRuns[id] = [0, 1, 2, 3, 4].map(k => Math.max(0, Math.floor(+r[k] || 0)));
  if (v1) {
    // v1 had no item categories. Anything a player bought with gold stays usable, so its categories open up;
    // categories behind achievements are earned the normal way (stat achievements are granted on load).
    for (const id of out.unlockedItems) {
      const it = ITEM[id]; if (!it || !it.lock || !('cost' in it.lock)) continue;
      for (const k of effectsOf(it)) if (!out.unlockedCats.includes(k)) out.unlockedCats.push(k);
    }
    out.ver = SAVE_VERSION;
  }
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
  for (const k of ['totalKills', 'bossKills', 'evolves', 'wins', 'runs', 'totalGold']) m.stats[k] = (a.stats[k] || 0) + (b.stats[k] || 0);
  for (const k of ['bestTime', 'maxLevel']) m.stats[k] = Math.max(a.stats[k] || 0, b.stats[k] || 0);
  for (const id of new Set([...Object.keys(a.itemRuns), ...Object.keys(b.itemRuns)])) {
    const x = a.itemRuns[id] || [0, 0, 0, 0, 0], y = b.itemRuns[id] || [0, 0, 0, 0, 0]; m.itemRuns[id] = x.map((v, k) => v + y[k]);
  }
  return m;
}

// ---------- unlock rules ----------
// Locks are data, on the thing they lock (items, characters, categories):
//   { cost: 500 }                                        bought with gold
//   { stat: 'totalKills', min: 500, text }               a lifetime stat reaches min
//   { effect: 'burn', level: 5, text }                   reach that level with any item of that category
//   { item: 'ember_pistol', level: 5, runs: 1, text }    reach that level with that item in that many runs
const runsAt = (s, id, L) => ((s.itemRuns || {})[id] || [])[Math.max(1, Math.min(5, L | 0)) - 1] || 0;
function bestEffectLevel(s, k) {
  let best = 0;
  for (const d of ITEMS) if (effectsOf(d).includes(k)) for (let L = 5; L > best; L--) if (runsAt(s, d.id, L) > 0) { best = L; break; }
  return best;
}
// [have, need] toward an achievement lock
function lockProgress(lock, s) {
  if (!lock || 'cost' in lock) return [0, 1];
  if (lock.stat) return [s.stats[lock.stat] || 0, lock.min];
  if (lock.item) return [runsAt(s, lock.item, lock.level), lock.runs || 1];
  if (lock.effect) return [bestEffectLevel(s, lock.effect), lock.level];
  return [0, 1];
}
const lockMet = (lock, s) => { if (!lock || 'cost' in lock) return false; const [a, b] = lockProgress(lock, s); return a >= b; };
function lockText(l) {
  if (!l) return '';
  if ('cost' in l) return `Buy for ● ${l.cost}`;
  if (l.item) { const d = ITEM[l.item]; return `Reach level ${l.level} with ${d ? d.name : l.item}` + ((l.runs || 1) > 1 ? ` in ${l.runs} runs` : ''); }
  if (l.effect) return `Reach level ${l.level} with any ${(EFFECTS[l.effect] || { name: l.effect }).name} item`;
  const one = l.min === 1;
  switch (l.stat) {
    case 'totalKills': return `Defeat ${l.min} enemies (lifetime)`;
    case 'bestTime': return `Survive ${Math.floor(l.min / 60)}:${String(l.min % 60).padStart(2, '0')}`;
    case 'bossKills': return one ? 'Defeat a boss' : `Defeat ${l.min} bosses`;
    case 'evolves': return one ? 'Fuse an item' : `Make ${l.min} fusions`;
    case 'wins': return one ? 'Win a run' : `Win ${l.min} runs`;
    case 'runs': return `Play ${l.min} runs`;
    case 'maxLevel': return `Reach level ${l.min}`;
    case 'totalGold': return `Earn ${l.min} gold (lifetime)`;
  }
  return '';
}
const catLock = k => (CATEGORIES[k] || {}).lock || null;
const catUnlocked = (s, k) => !catLock(k) || s.unlockedCats.includes(k);
const startingCats = () => EFFECT_KEYS.filter(k => !catLock(k));
// an item can show up in runs once every category it belongs to is open and its own lock (if any) is cleared
const itemUnlocked = (s, d) => effectsOf(d).every(k => catUnlocked(s, k)) && (!d.lock || s.unlockedItems.includes(d.id));
const charUnlocked = (s, c) => !c.lock || s.unlockedChars.includes(c.id);
const fuseLockOf = d => Object.assign({}, FUSE_LOCK, d.fuseLock || {});
const fuseUnlocked = (s, d) => { const f = fuseLockOf(d); return f.runs <= 0 || runsAt(s, d.id, f.level) >= f.runs; };
const fuseLockText = d => { const f = fuseLockOf(d); return f.runs <= 0 ? 'Can always fuse' : lockText({ item: d.id, level: f.level, runs: f.runs }); };

// Grants every achievement unlock whose requirement is met. Returns what was newly unlocked, for display.
function applyUnlocks(s) {
  const fresh = [];
  for (const k of EFFECT_KEYS) { const l = catLock(k); if (l && lockMet(l, s) && !s.unlockedCats.includes(k)) { s.unlockedCats.push(k); fresh.push(`${EFFECTS[k].icon} ${EFFECTS[k].name} items`); } }
  for (const d of ITEMS) if (lockMet(d.lock, s) && !s.unlockedItems.includes(d.id)) {
    s.unlockedItems.push(d.id);
    const shut = effectsOf(d).filter(k => !catUnlocked(s, k));
    fresh.push(d.icon + ' ' + d.name + (shut.length ? ` (once ${shut.map(k => EFFECTS[k].name).join(' and ')} items are unlocked)` : ''));
  }
  for (const c of CHARACTERS) if (lockMet(c.lock, s) && !s.unlockedChars.includes(c.id)) { s.unlockedChars.push(c.id); fresh.push('🧍 ' + c.name + ' (character)'); }
  return fresh;
}
// Every achievement in the game, with progress, for the Achievements screen and the admin simulator.
function achievementList(s) {
  const out = [];
  const add = (group, icon, name, lock, reward, done) => { const [have, need] = lockProgress(lock, s); out.push({ group, icon, name, text: lock.text || lockText(lock), have: Math.min(have, need), need, done, reward }); };
  for (const k of EFFECT_KEYS) { const l = catLock(k); if (l && !('cost' in l)) add('cats', EFFECTS[k].icon, `${EFFECTS[k].name} awakened`, l, `${EFFECTS[k].name} items`, catUnlocked(s, k)); }
  for (const d of ITEMS) if (!d.disabled) { const f = fuseLockOf(d); if (f.runs > 0) add('mastery', d.icon, `${d.name} mastery`, { item: d.id, level: f.level, runs: f.runs }, `Fusing ${d.name}`, fuseUnlocked(s, d)); }
  for (const d of ITEMS) if (!d.disabled && d.lock && !('cost' in d.lock)) add('unlocks', d.icon, d.name, d.lock, d.name, s.unlockedItems.includes(d.id));
  for (const c of CHARACTERS) if (c.lock && !('cost' in c.lock)) add('unlocks', '🧍', c.name, c.lock, `${c.name}, ${c.title}`, s.unlockedChars.includes(c.id));
  return out;
}
