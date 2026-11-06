'use strict';
// ===== VOIDLIGHT enemy Codex (the bestiary) =====
// Every enemy and boss has three entries: Sighted (free once you have met it), Studied (gold: its stats and attacks) and
// Mastered (gold, once you have defeated CODEX_COSTS[..].kills of it: its weaknesses, resistances and immunities). A mastered
// enemy can be picked as a foe in the Fusion Lab. The save keeps SAVE.bestiary[id] = { seen, kills, tier } (tier = entries
// bought: 0, 1 Studied, 2 Mastered); main.js counts encounters and kills during a run and adds them at the end.
// Loaded after nexus.js and before main.js; it only runs once main.js has loaded.

const FOE_SHAPES = { circle: '●', tri: '▲', diamond: '◆', square: '■', hex: '⬢', star: '★', oct: '⯃', star4: '✦', arrow: '➤' };
const FOE_ROLES = { swarm: 'Swarm', fast: 'Fast', heavy: 'Heavy', ranged: 'Ranged' };
const foeDef = id => ENEMY_TYPES[id] || BOSSES[id] || null;
const isBossId = id => !!BOSSES[id];
// every enemy in the Codex: regular enemies, then bosses (zone enemies join them in zones.js)
const foeIds = () => [...Object.keys(ENEMY_TYPES), ...Object.keys(BOSSES)];
const foeEntry = (s, id) => (s.bestiary || {})[id] || { seen: 0, kills: 0, tier: 0 };
const foeCosts = id => (isBossId(id) ? CODEX_COSTS.boss : (foeDef(id) || {}).codex || CODEX_COSTS.normal);
const foeSeen = (s, id) => foeEntry(s, id).seen > 0;
const foeTier = (s, id) => (foeSeen(s, id) ? foeEntry(s, id).tier : -1); // -1 not met, 0 Sighted, 1 Studied, 2 Mastered
const foeMastered = (s, id) => foeTier(s, id) >= 2;

// what it does, in words, from its data
function foeAttacks(T, id) {
  const out = [];
  if (isBossId(id)) out.push({ matriarch: 'Rings of bullets, and calls Swarmlings', seraph: 'Turning spiral streams and aimed triple shots', eclipse: 'Spirals, rings and fans in three phases' }[id] || 'Boss patterns');
  if (T.ranged) out.push({ aim: 'Fires aimed shots', spread: 'Fires three-way spreads', ring: `Fires rings of ${T.ranged.n || 8} shots` }[T.ranged.pat] + ` from ${T.ranged.range}px and backs away when close`);
  if (T.charge) out.push('Stops, aims, then dashes in a straight line');
  if (T.deathRing) out.push(`Bursts into ${T.deathRing} bullets when it dies`);
  if (T.deathSpawn) out.push(`Splits into ${T.deathSpawn.n} ${(foeDef(T.deathSpawn.type) || {}).name || T.deathSpawn.type}s when it dies`);
  if (T.pack > 1) out.push(`Comes in packs of ${T.pack}`);
  if (T.guard) out.push('Stays inside its zone' + (T.warden ? ' and guards its middle: defeat it to clear the zone' : ''));
  if (!out.length) out.push('Chases you and hurts on contact');
  return out;
}
const effList = ks => (ks || []).map(k => `<span style="color:${EFFECTS[k].color}">${EFFECTS[k].icon} ${EFFECTS[k].name}</span>`).join(', ');
function foeTraitsHtml(T) {
  const rows = [];
  if (T.only && T.only.length) rows.push(`<small class="trait imm">⛔ Immune to everything but ${effList(T.only)}</small>`);
  if (T.weak && T.weak.length) rows.push(`<small class="trait weak">▲ Weak to ${effList(T.weak)} (×${DAMAGE_TYPES.weak})</small>`);
  if (T.resist && T.resist.length) rows.push(`<small class="trait res">▼ Resists ${effList(T.resist)} (×${DAMAGE_TYPES.resist})</small>`);
  if (!rows.length) rows.push('<small class="trait">No weaknesses or resistances</small>');
  return rows.join('');
}
// the levels where it shows up (STAGES[].swap puts the newer enemies into some levels)
function foeLevels(id) {
  if (isBossId(id)) return 'Every level';
  const Z = typeof ZONES !== 'undefined' && ZONES[(foeDef(id) || {}).zone]; if (Z) return `${Z.name} zones, from Level ${Z.from}`;
  const swapped = STAGES.filter(S => S.swap && Object.values(S.swap).includes(id)).map(S => S.id);
  const replaced = STAGES.filter(S => !(S.swap && S.swap[id])).map(S => S.id);
  const inBase = typeof SPAWN_TABLE !== 'undefined' && SPAWN_TABLE.some(r => r[0] === id);
  const lv = inBase ? replaced : swapped;
  if (!lv.length) return (foeDef(id) || {}).zone ? 'Zones' : '—';
  return lv.length === STAGES.length ? 'Every level' : 'Levels ' + lv.join(', ');
}
function foeCard(id) {
  const T = foeDef(id), e = foeEntry(SAVE, id), t = foeTier(SAVE, id), C = foeCosts(id), boss = isBossId(id);
  const glyph = `<span style="color:${T.color};text-shadow:0 0 10px ${T.color}">${FOE_SHAPES[T.shape] || '●'}</span>`;
  if (t < 0) return `<div class="card item foe locked" style="--c:#555"><div class="ico">❔</div><div class="body"><b>Unknown ${boss ? 'boss' : 'enemy'}</b><small>Not met yet.</small></div></div>`;
  let h = `<div class="card item foe${t >= 2 ? ' mastered' : ''}" style="--c:${T.color}"><div class="ico">${glyph}</div><div class="body"><b>${T.name}</b>`;
  h += `<div class="tags">${boss ? '<span>Boss</span>' : `<span>${FOE_ROLES[T.role] || 'Enemy'}</span>`}<span>Met ${e.seen}</span><span>Defeated ${e.kills}</span>${t >= 2 ? '<span class="held">★ Mastered</span>' : ''}</div>`;
  h += `<small>${foeLevels(id)}</small>`;
  if (t >= 1) h += `<small class="perk">HP ${T.hp} · speed ${T.spd} · contact ${T.dmg} · XP ${T.xp} (at 0:00, Level 1; both grow with the clock and the level)</small>` + foeAttacks(T, id).map(x => `<small>• ${x}</small>`).join('');
  if (t >= 2) h += foeTraitsHtml(T) + `<small class="fuse">🧪 Pick it as a foe in the Fusion Lab</small>`;
  if (!inRun()) {
    if (t === 0) h += `<button class="buy" data-foe="${id}">📖 Study ● ${C.study}: stats and attacks</button>`;
    else if (t === 1) { const ok = e.kills >= C.kills;
      h += ok ? `<button class="buy" data-foe="${id}">📖 Master ● ${C.master}: weaknesses and resistances</button>`
        : `<div class="req">🔒 Defeat ${C.kills} to master it (${e.kills}/${C.kills})</div><div class="bar"><i style="width:${Math.round(100 * Math.min(1, e.kills / C.kills))}%"></i></div>`; }
  } else if (t < 2) h += '<small class="note">Study it from the main menu Codex.</small>';
  return h + '</div></div>';
}
function buyFoeEntry(id) {
  const t = foeTier(SAVE, id), C = foeCosts(id), e = foeEntry(SAVE, id);
  if (t < 0 || t >= 2) return;
  const cost = t === 0 ? C.study : C.master;
  if (t === 1 && e.kills < C.kills) { toast(`Defeat ${C.kills} first`); return; }
  if (SAVE.gold < cost) { toast('Not enough gold'); return; }
  SAVE.gold -= cost; SAVE.bestiary[id] = Object.assign({ seen: 0, kills: 0 }, e, { tier: t + 1 }); writeSave();
  toast(t === 0 ? `📖 ${foeDef(id).name} studied` : `★ ${foeDef(id).name} mastered: its weaknesses are in the Codex, and it can be a Fusion Lab foe`);
}
// Codex tab "👁 Bestiary"
function renderBestiary(wrap, show) {
  const ids = foeIds().filter(id => show(foeMastered(SAVE, id)));
  wrap.innerHTML = ids.map(foeCard).join('') || '';
  wrap.querySelectorAll('[data-foe]').forEach(b => b.onclick = () => { buyFoeEntry(b.dataset.foe); renderCodex(); });
}
