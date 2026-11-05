'use strict';
// ===== VOIDLIGHT content overrides =====
// The admin page (admin.html) edits game content and publishes the changes to the Firestore doc content/live
// as a JSON "overrides" object: { items: { ember_pistol: { dmg: 11, vis: {...} } }, chars: {...}, ... }.
// Only changed fields are stored. src/cloud.js downloads it, this file applies it on top of the defaults
// in src/items.js, and caches it in localStorage so the next load starts with it before the network answers.
// Loaded after items.js and before main.js.
window.VOIDLIGHT_SANDBOX = new URLSearchParams(location.search).has('sandbox'); // admin test canvas mode
// admin "play with this progress": a separate save plus the admin's unpublished edits, nothing synced
window.VOIDLIGHT_TESTSAVE = !window.VOIDLIGHT_SANDBOX && new URLSearchParams(location.search).has('testsave');

const VOIDLIGHT_CONTENT = (() => {
  const CACHE_KEY = window.VOIDLIGHT_TESTSAVE ? 'voidlight.testcontent' : 'voidlight.content.v1';
  const STATS = { totalKills: 'Enemies defeated (lifetime)', bestTime: 'Best survival time (seconds)', bossKills: 'Bosses defeated', evolves: 'Fusions made', wins: 'Runs won', runs: 'Runs played', maxLevel: 'Highest level reached', totalGold: 'Gold earned (lifetime)' };
  const SHAPES = ['orb', 'shard', 'bolt', 'lance', 'missile', 'petal', 'disc', 'glaive', 'blade', 'star', 'prism', 'shield', 'skull', 'flame', 'spore', 'aura'];
  const MODS = ['might', 'hp', 'armor', 'regen', 'speed', 'area', 'cd', 'projSpd', 'duration', 'amount', 'crit'];
  const byId = list => Object.fromEntries(list.map(x => [x.id, x]));
  // Every editable table: where it lives and which fields the admin page may change.
  const TABLES = {
    items:    { get: () => ITEM, fields: ['name', 'icon', 'effect', 'effect2', 'dmg', 'cd', 'pattern', 'trig', 'lock', 'fuseLock', 'color', 'vis', 'disabled'] },
    cats:     { get: () => CATEGORIES, fields: ['lock'] },
    difficulty: { get: () => DIFFICULTY, fields: ['hpGrowth', 'hpCurve', 'spawnBase', 'spawnGrowth', 'spawnCurve', 'dmgGrowth', 'eliteEvery', 'eliteHp', 'ringEvery', 'bossHp', 'xpStep', 'xpCurve'] },
    chars:    { get: () => byId(CHARACTERS), fields: ['name', 'title', 'color', 'weapon', 'perk', 'mods', 'lock'] },
    upgrades: { get: () => byId(UPGRADES), fields: ['name', 'icon', 'desc', 'max', 'cost', 'per'] },
    enemies:  { get: () => ENEMY_TYPES, fields: ['name', 'hp', 'spd', 'r', 'dmg', 'xp', 'color', 'shape'] },
    bosses:   { get: () => BOSSES, fields: ['name', 'hp', 'spd', 'r', 'dmg', 'xp', 'color'] },
    drops:    { get: () => DROPS, fields: ['chance', 'min', 'max', 'value', 'elite', 'boss'] },
  };
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  // Pristine values from items.js, taken once at load so overrides can always be undone.
  const BASE = {};
  for (const [t, T] of Object.entries(TABLES)) {
    BASE[t] = {};
    for (const [id, obj] of Object.entries(T.get())) { const b = {}; for (const f of T.fields) if (obj[f] !== undefined) b[f] = clone(obj[f]); BASE[t][id] = b; }
  }

  const num = v => typeof v === 'number' && isFinite(v);
  const str = v => typeof v === 'string' && v.length < 400;
  const color = v => typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v);
  function validLock(v) {
    if (!v || typeof v !== 'object') return false;
    if ('cost' in v) return num(v.cost) && v.cost >= 0;
    const lv = num(v.level) && v.level >= 1 && v.level <= 5;
    if ('item' in v) return v.item in ITEM && lv && num(v.runs) && v.runs >= 1 && v.runs <= 1000 && str(v.text);
    if ('effect' in v) return v.effect in EFFECTS && lv && str(v.text);
    return v.stat in STATS && num(v.min) && str(v.text);
  }
  function validVis(v) {
    if (!v || typeof v !== 'object') return false;
    if (v.size !== undefined && !(num(v.size) && v.size > 0 && v.size <= 5)) return false;
    if (v.speed !== undefined && !(num(v.speed) && v.speed > 0 && v.speed <= 5)) return false;
    if (v.shapes !== undefined && (typeof v.shapes !== 'object' || !Object.values(v.shapes).every(s => SHAPES.includes(s)))) return false;
    return true;
  }
  // Rejects anything that could break the game; null means "remove this field" (e.g. take a lock off).
  function valid(table, f, v) {
    if (v === null) return ['lock', 'fuseLock', 'effect2', 'color', 'vis', 'trig', 'disabled', 'min', 'max', 'value', 'chance', 'elite', 'boss'].includes(f);
    switch (f) {
      case 'name': case 'icon': case 'pattern': case 'trig': case 'title': case 'perk': case 'desc': return str(v);
      case 'effect': case 'effect2': return v in EFFECTS;
      case 'fuseLock': return !!v && typeof v === 'object' && num(v.level) && v.level >= 1 && v.level <= 5 && num(v.runs) && v.runs >= 0 && v.runs <= 1000;
      case 'weapon': return v in ITEM;
      case 'color': return color(v);
      case 'shape': return ['circle', 'tri', 'diamond', 'square', 'hex', 'star'].includes(v);
      case 'lock': return validLock(v);
      case 'vis': return validVis(v);
      case 'disabled': return typeof v === 'boolean';
      case 'mods': return v && typeof v === 'object' && Object.entries(v).every(([k, x]) => MODS.includes(k) && num(x));
      case 'max': case 'min': case 'elite': case 'boss': return num(v) && v >= 0 && v <= 1e6;
      default: return num(v) && v >= 0 && v <= 1e7;
    }
  }

  // Resets every table to the items.js defaults, then lays the overrides on top.
  function apply(ov) {
    ov = ov && typeof ov === 'object' ? ov : {};
    for (const [t, T] of Object.entries(TABLES)) {
      const live = T.get(), o = ov[t] || {};
      for (const [id, base] of Object.entries(BASE[t])) {
        const obj = live[id]; if (!obj) continue;
        for (const f of T.fields) { if (f in base) obj[f] = clone(base[f]); else delete obj[f]; }
        const ch = o[id]; if (!ch || typeof ch !== 'object') continue;
        for (const f of T.fields) {
          if (!(f in ch)) continue;
          const v = ch[f];
          if (!valid(t, f, v)) { console.warn('Voidlight content: ignored', t, id, f, v); continue; }
          if (v === null) delete obj[f]; else obj[f] = clone(v);
        }
      }
    }
    current = JSON.stringify(ov);
  }

  let current = '{}', pending = null;
  const running = () => window.VOIDLIGHT && window.VOIDLIGHT.G && !window.VOIDLIGHT.G.over;
  return {
    TABLES, BASE, STATS, SHAPES, MODS, apply, valid,
    // On page load: the last published content this browser saw.
    applyCached() {
      if (window.VOIDLIGHT_SANDBOX) return;
      try { const raw = localStorage.getItem(CACHE_KEY); if (raw) apply(JSON.parse(raw)); } catch (e) { console.warn('Voidlight content cache unreadable', e); }
    },
    // From cloud.js with the content/live doc's JSON. Applied now, or at the next run if one is going.
    receive(json) {
      if (window.VOIDLIGHT_TESTSAVE) return; // test saves use the admin's working copy
      let ov; try { ov = JSON.parse(json || '{}'); } catch (e) { return; }
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(ov)); } catch (e) { /* storage unavailable */ }
      if (JSON.stringify(ov) === current) return;
      if (running()) { pending = ov; return; }
      apply(ov); if (window.VOIDLIGHT && window.VOIDLIGHT.refresh) window.VOIDLIGHT.refresh();
    },
    applyPending() { if (pending) { apply(pending); pending = null; } },
  };
})();
window.VOIDLIGHT_CONTENT = VOIDLIGHT_CONTENT;
