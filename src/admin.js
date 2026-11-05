// ===== VOIDLIGHT admin: edit game content, preview items on a test canvas, publish to Firestore =====
// Only the Google account below can use it. The page checks it here, and firestore.rules enforce it for every
// read of the draft and every write, so another account gets nothing even with the page source in hand.
// Edits are "overrides" on top of src/items.js (see src/content.js). Publish writes content/live, which the game loads.
const ADMIN_EMAIL = 'mendus59@gmail.com';
const SDK = 'https://www.gstatic.com/firebasejs/11.0.2/';
const WORK_KEY = 'voidlight.admin.working.v1';
const C = window.VOIDLIGHT_CONTENT, BASE = C.BASE;

// ---------- small DOM helpers ----------
const $ = (s, r = document) => r.querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'selected') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}
function toast(msg, bad) { const el = h('div', { class: 'toast' + (bad ? ' bad' : '') }, msg); $('#toasts').append(el); setTimeout(() => el.remove(), 4000); }
const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
// key-sorted JSON, so two override sets compare equal whatever order they were built in
function canon(v) { return JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(q => [q, x[q]])) : x); }
const ago = t => { if (!t) return 'never'; const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : new Date(t).toLocaleDateString(); };

// ---------- working overrides ----------
let ov = {};                                   // what you are editing
let live = { ov: {}, updatedAt: 0, by: '' };   // content/live, what players get
let draft = null;                              // content/draft
let history = [];
const TABLE_NAMES = { items: 'Item', chars: 'Character', upgrades: 'Forge upgrade', enemies: 'Enemy', bosses: 'Boss', drops: 'Pickup' };

// current value of one entry: items.js default with the overrides on top
function get(t, id) {
  const v = clone(BASE[t][id]) || {}; const o = ov[t] && ov[t][id];
  if (o) for (const [f, x] of Object.entries(o)) { if (x === null) delete v[f]; else v[f] = clone(x); }
  return v;
}
function changed(t, id, f) { return !!(ov[t] && ov[t][id] && f in ov[t][id]); }
function entryChanged(t, id) { return !!(ov[t] && ov[t][id]); }
function set(t, id, f, v, { rerender = false } = {}) {
  const b = BASE[t][id][f];
  ov[t] = ov[t] || {}; ov[t][id] = ov[t][id] || {};
  if (canon(v ?? null) === canon(b ?? null)) delete ov[t][id][f];
  else ov[t][id][f] = v === undefined ? null : clone(v);
  if (!Object.keys(ov[t][id]).length) delete ov[t][id];
  if (!Object.keys(ov[t]).length) delete ov[t];
  edited(); if (rerender) render();
  else markField(t, id, f);
}
function resetEntry(t, id) { if (ov[t]) { delete ov[t][id]; if (!Object.keys(ov[t]).length) delete ov[t]; } edited(); render(); }
// drops overrides that no longer differ from items.js (e.g. after an export was committed) or point at removed content
function prune(o) {
  const out = {};
  for (const [t, rows] of Object.entries(o || {})) {
    if (!BASE[t]) continue;
    for (const [id, fields] of Object.entries(rows || {})) {
      if (!BASE[t][id]) continue;
      for (const [f, v] of Object.entries(fields || {})) {
        if (!C.TABLES[t].fields.includes(f) || canon(v ?? null) === canon(BASE[t][id][f] ?? null)) continue;
        ((out[t] = out[t] || {})[id] = out[t][id] || {})[f] = v;
      }
    }
  }
  return out;
}
function countEdits(a, b) {
  let n = 0;
  for (const t of Object.keys(BASE)) for (const id of Object.keys(BASE[t])) if (canon((a[t] || {})[id] || {}) !== canon((b[t] || {})[id] || {})) n++;
  return n;
}
function edited() {
  try { localStorage.setItem(WORK_KEY, JSON.stringify({ ov, at: Date.now() })); } catch (e) { /* storage unavailable */ }
  refreshStatus(); sbPushSoon();
}
function refreshStatus() {
  const n = countEdits(ov, live.ov), el = $('#status');
  el.className = 'pill ' + (n ? 'dirty' : 'clean');
  el.textContent = n ? `${n} unpublished ${n === 1 ? 'change' : 'changes'}` : 'Matches the live game';
  el.title = `Live content published ${ago(live.updatedAt)}` + (draft ? ` · draft saved ${ago(draft.updatedAt)}` : '');
  $('#btnPublish').disabled = !n;
}
function setWorking(o, msg) { ov = prune(clone(o)); edited(); render(); if (msg) toast(msg); }

// ---------- Firebase ----------
let fb = null, user = null;
const isAdmin = u => !!(u && u.emailVerified && (u.email || '').toLowerCase() === ADMIN_EMAIL);

function gate(...kids) { $('#app').hidden = true; $('#gate').hidden = false; $('#gateBody').replaceChildren(...kids); }
async function boot() {
  const cfg = window.FIREBASE_CONFIG;
  if (!cfg || !cfg.apiKey || /^YOUR_/.test(cfg.apiKey)) return gate(h('p', {}, 'Firebase is not configured in src/firebase-config.js.'));
  if (location.protocol === 'file:') return gate(h('p', {}, 'Google sign-in does not work from a file. Open the admin page on the website, or run python3 -m http.server and visit localhost.'));
  try {
    const [app, auth, fs] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')]);
    const a = app.initializeApp(cfg);
    fb = { auth: auth.getAuth(a), db: fs.getFirestore(a), A: auth, F: fs };
  } catch (e) { console.error(e); return gate(h('p', {}, 'Could not load Firebase. Check your connection and reload.')); }
  fb.A.onAuthStateChanged(fb.auth, u => {
    user = u;
    if (!u) gate(h('p', {}, 'Sign in with the admin Google account to edit game content.'), h('button', { class: 'google', onclick: signIn }, 'Sign in with Google'));
    else if (!isAdmin(u)) gate(h('p', {}, `Signed in as ${u.email}. This account can't use the admin panel.`), h('button', { onclick: signOut }, 'Sign out'));
    else start();
  });
}
async function signIn() {
  const p = new fb.A.GoogleAuthProvider(); p.setCustomParameters({ login_hint: ADMIN_EMAIL, prompt: 'select_account' });
  try { await fb.A.signInWithPopup(fb.auth, p); }
  catch (e) {
    if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) return fb.A.signInWithRedirect(fb.auth, p);
    if (e && e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') toast('Sign-in failed: ' + (e.code || e.message), true);
  }
}
async function signOut() { await fb.A.signOut(fb.auth); }
const docRef = id => fb.F.doc(fb.db, 'content', id);
function parseDoc(snap) { if (!snap.exists()) return null; const d = snap.data(); let o = {}; try { o = JSON.parse(d.data || '{}'); } catch (e) { /* bad JSON */ } return { ov: o, updatedAt: d.updatedAt || 0, by: d.by || '', note: d.note || '' }; }
function permissionHint(e) { return e && e.code === 'permission-denied' ? ' Publish the rules in firestore.rules in the Firebase console first.' : ''; }

async function start() {
  $('#gate').hidden = true; $('#app').hidden = false;
  $('#who').textContent = user.email;
  try { live = parseDoc(await fb.F.getDoc(docRef('live'))) || { ov: {}, updatedAt: 0, by: '' }; }
  catch (e) { console.warn(e); toast('Could not read the live content.' + permissionHint(e), true); }
  try { draft = parseDoc(await fb.F.getDoc(docRef('draft'))); } catch (e) { console.warn(e); }
  loadHistory();
  let local = null; try { local = JSON.parse(localStorage.getItem(WORK_KEY) || 'null'); } catch (e) { /* ignore */ }
  ov = prune(local ? local.ov : live.ov);
  live.ov = prune(live.ov);
  refreshStatus(); render(); sbPushSoon();
}
async function loadHistory() {
  try {
    const q = fb.F.query(fb.F.collection(fb.db, 'contentHistory'), fb.F.orderBy('updatedAt', 'desc'), fb.F.limit(10));
    history = (await fb.F.getDocs(q)).docs.map(parseDoc).filter(Boolean);
    if (tab === 'overview') render();
  } catch (e) { console.warn('history', e); }
}
const payload = () => ({ data: JSON.stringify(ov), updatedAt: Date.now(), by: user.email });
async function saveDraft() {
  try { const p = payload(); await fb.F.setDoc(docRef('draft'), p); draft = { ov: clone(ov), updatedAt: p.updatedAt, by: p.by }; refreshStatus(); toast('Draft saved. The game is unchanged.'); }
  catch (e) { console.error(e); toast('Saving the draft failed.' + permissionHint(e), true); }
}
async function publish() {
  const n = countEdits(ov, live.ov);
  if (!confirm(`Publish ${n} ${n === 1 ? 'change' : 'changes'} to every player? They get it the next time the game loads (or after their current run).`)) return;
  try {
    const p = payload();
    await fb.F.setDoc(docRef('live'), p);
    live = { ov: clone(ov), updatedAt: p.updatedAt, by: p.by };
    try { await fb.F.addDoc(fb.F.collection(fb.db, 'contentHistory'), p); loadHistory(); } catch (e) { console.warn('history write failed', e); }
    refreshStatus(); render(); toast('Published. Players get it on their next load.');
  } catch (e) { console.error(e); toast('Publishing failed.' + permissionHint(e), true); }
}

// ---------- export: write the edits into src/items.js ----------
function q(s) { s = String(s); return s.includes("'") && !s.includes('"') ? '"' + s + '"' : "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; }
function lit(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return q(v);
  if (typeof v !== 'object') return String(v);
  const keys = Object.keys(v); if (!keys.length) return '{}';
  return '{ ' + keys.map(k => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : q(k)) + ': ' + lit(v[k])).join(', ') + ' }';
}
// An item's literal properties all sit on the first line of its def(...) call (see the note in items.js),
// so that line can be rewritten from data while the fire/spawn/on code below it is kept as is.
function itemHeader(id, v) {
  const d = ITEM[id], props = [];
  props.push('dmg: ' + lit(v.dmg));
  if (v.cd) props.push('cd: ' + lit(v.cd));
  if (v.lock) props.push('lock: ' + lit(v.lock));
  if (v.color) props.push('color: ' + lit(v.color));
  if (v.vis) props.push('vis: ' + lit(v.vis));
  if (v.disabled) props.push('disabled: true');
  props.push('pattern: ' + lit(v.pattern));
  if (v.trig) props.push('trig: ' + lit(v.trig));
  return `def('${d.slot}', '${id}', ${q(v.name)}, '${v.effect}', ${q(v.icon)}, { ${props.join(', ')},`;
}
function exportItemsJs(src, o) {
  const lines = src.split('\n'); let n = 0;
  const block = name => { const s = lines.findIndex(l => l.startsWith(`const ${name} = `)); let e = s; while (e < lines.length && !/^\];?$|^\};?$/.test(lines[e])) e++; return [s, e]; };
  const replaceLine = (range, re, text) => { for (let i = range[0]; i <= range[1]; i++) if (re.test(lines[i])) { lines[i] = text; n++; return; } throw new Error('Could not find ' + re); };
  const keepOrder = (orig, v, fields) => { const out = clone(orig); for (const f of fields) { if (v[f] === undefined) delete out[f]; else out[f] = v[f]; } return out; };
  for (const id of Object.keys(o.items || {})) replaceLine([0, lines.length - 1], new RegExp(`^def\\('\\w+', '${id}',`), itemHeader(id, get('items', id)));
  const tables = [['chars', 'CHARACTERS', id => CHARACTERS.find(c => c.id === id), (id, x) => `  ${lit(x)},`, id => new RegExp(`^\\s*\\{ id: '${id}',`)],
    ['upgrades', 'UPGRADES', id => UPGRADES.find(u => u.id === id), (id, x) => `  ${lit(x)},`, id => new RegExp(`^\\s*\\{ id: '${id}',`)],
    ['enemies', 'ENEMY_TYPES', id => ENEMY_TYPES[id], (id, x) => `  ${id}: ${lit(x)},`, id => new RegExp(`^\\s*${id}:\\s*\\{`)],
    ['bosses', 'BOSSES', id => BOSSES[id], (id, x) => `  ${id}: ${lit(x)},`, id => new RegExp(`^\\s*${id}:\\s*\\{`)],
    ['drops', 'DROPS', id => DROPS[id], (id, x) => `  ${id}: ${lit(x)},`, id => new RegExp(`^\\s*${id}:\\s*\\{`)]];
  for (const [t, name, orig, fmt, re] of tables) {
    const range = block(name);
    for (const id of Object.keys(o[t] || {})) replaceLine(range, re(id), fmt(id, keepOrder(orig(id), get(t, id), C.TABLES[t].fields)));
  }
  return { text: lines.join('\n'), n };
}
async function exportFile() {
  try {
    const res = await fetch('src/items.js', { cache: 'no-store' }); if (!res.ok) throw new Error('HTTP ' + res.status);
    const src = await res.text();
    const { text, n } = exportItemsJs(src, ov);
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/javascript' })), download: 'items.js' }); document.body.append(a); a.click(); a.remove();
    toast(n ? `items.js downloaded with ${n} edited ${n === 1 ? 'entry' : 'entries'}. Replace src/items.js in the repo with it and commit.` : 'items.js downloaded. There were no edits to write in.');
  } catch (e) { console.error(e); toast('Export failed: ' + e.message, true); }
}

// ---------- form fields ----------
let renderedFields = [];
// sub: one key inside an object field (vis.size, vis.trail), tracked and reset on its own
const subOf = (o, sub) => (o || {})[sub] ?? null;
function field(label, input, t, id, f, { wide = false, hint = '', sub = null } = {}) {
  const isCh = () => sub ? canon(subOf(get(t, id)[f], sub)) !== canon(subOf(BASE[t][id][f], sub)) : changed(t, id, f);
  const reset = () => {
    if (!sub) return set(t, id, f, BASE[t][id][f], { rerender: true });
    const n = clone(get(t, id)[f] || {}), b = subOf(BASE[t][id][f], sub); if (b === null) delete n[sub]; else n[sub] = clone(b);
    set(t, id, f, Object.keys(n).length ? n : null, { rerender: true });
  };
  const el = h('div', { class: 'f' + (wide ? ' wide' : '') + (isCh() ? ' changed' : '') },
    h('label', {}, label, h('button', { class: 'link reset', title: 'Back to the items.js value', onclick: reset }, 'reset')),
    input, hint ? h('div', { class: 'hint' }, hint) : null);
  renderedFields.push({ el, t, id, f, isCh });
  return el;
}
// updates the "edited" marker of a field in place, so typing doesn't rebuild the form
function markField(t, id, f) {
  for (const r of renderedFields) if (r.t === t && r.id === id && r.f === f) r.el.classList.toggle('changed', r.isCh());
  const row = document.querySelector(`[data-row="${t}:${id}"] .dot`); if (row) row.style.visibility = entryChanged(t, id) ? 'visible' : 'hidden';
}
const txt = (t, id, f, o = {}) => h(o.area ? 'textarea' : 'input', { type: 'text', value: get(t, id)[f] ?? '', oninput: e => { set(t, id, f, e.target.value); if (o.relist) relist(); } });
const num = (t, id, f, o = {}) => h('input', { type: 'number', step: o.step || 'any', min: o.min ?? 0, value: get(t, id)[f] ?? '', oninput: e => { const v = parseFloat(e.target.value); if (isFinite(v)) set(t, id, f, v); } });
function colorIn(value, onset) { return h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#ffffff', oninput: e => onset(e.target.value) }); }
function sel(options, value, onset) { return h('select', { onchange: e => onset(e.target.value) }, options.map(([v, l]) => h('option', { value: v, selected: v === value }, l))); }

function lockText(stat, min) {
  const one = min === 1;
  switch (stat) {
    case 'totalKills': return `Defeat ${min} enemies (lifetime)`;
    case 'bestTime': return `Survive ${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
    case 'bossKills': return one ? 'Defeat a boss' : `Defeat ${min} bosses`;
    case 'evolves': return one ? 'Fuse an item' : `Make ${min} fusions`;
    case 'wins': return one ? 'Win a run' : `Win ${min} runs`;
    case 'runs': return `Play ${min} runs`;
    case 'maxLevel': return `Reach level ${min}`;
    case 'totalGold': return `Earn ${min} gold (lifetime)`;
  }
  return '';
}
function lockFields(t, id) {
  const lock = get(t, id).lock, mode = !lock ? 'none' : 'cost' in lock ? 'cost' : 'stat';
  const out = [field('Unlock', sel([['none', 'Available from the start'], ['cost', 'Bought with gold'], ['stat', 'Achievement']], mode, m => {
    set(t, id, 'lock', m === 'none' ? null : m === 'cost' ? { cost: 500 } : { stat: 'totalKills', min: 500, text: lockText('totalKills', 500) }, { rerender: true });
  }), t, id, 'lock', { wide: true })];
  if (mode === 'cost') out.push(field('Gold cost', h('input', { type: 'number', min: 0, step: 50, value: lock.cost, oninput: e => { const v = parseInt(e.target.value, 10); if (v >= 0) set(t, id, 'lock', { cost: v }); } }), t, id, 'lock'));
  if (mode === 'stat') {
    const upd = patch => { const cur = get(t, id).lock; const next = Object.assign({}, cur, patch); if (cur.text === lockText(cur.stat, cur.min)) next.text = lockText(next.stat, next.min); set(t, id, 'lock', next, { rerender: true }); };
    out.push(field('Requirement', h('div', { class: 'inline' }, sel(Object.entries(C.STATS), lock.stat, s => upd({ stat: s })), h('span', {}, '≥'),
      h('input', { type: 'number', min: 0, value: lock.min, onchange: e => { const v = parseInt(e.target.value, 10); if (v >= 0) upd({ min: v }); } })), t, id, 'lock', { wide: true, hint: lock.stat === 'bestTime' ? 'In seconds: 300 is 5:00.' : '' }));
    out.push(field('Text players see', h('input', { type: 'text', value: lock.text, oninput: e => set(t, id, 'lock', Object.assign({}, get(t, id).lock, { text: e.target.value })) }), t, id, 'lock', { wide: true }));
  }
  return out;
}

// ---------- test canvas (the real game engine in an iframe, see the sandbox section of main.js) ----------
const sb = { frame: null, ready: false, cfg: { item: ITEMS[0].id, level: 3, evo: false, layout: 'ring', tough: true, move: false }, numbers: true, dps: 0, shapes: [], timer: 0 };
function sbSend(m) { if (sb.ready && sb.frame.contentWindow) sb.frame.contentWindow.postMessage(Object.assign({ vl: 'sandbox' }, m), location.origin); }
function sbPushSoon() { clearTimeout(sb.timer); sb.timer = setTimeout(() => sbSend({ overrides: ov }), 120); }
window.addEventListener('message', e => {
  if (!sb.frame || e.source !== sb.frame.contentWindow || e.origin !== location.origin || !e.data) return;
  if (e.data.vl === 'sandbox-ready') { sb.ready = true; sbSend({ overrides: ov, config: sb.cfg, numbers: sb.numbers }); }
  if (e.data.vl === 'sandbox-stats') {
    sb.dps = e.data.dps; const r = $('#readout'); if (r) r.textContent = `${Math.round(sb.dps)} damage/s over the last 5 s · ${e.data.bullets} bullets on screen`;
    const fresh = (e.data.shapes || []).filter(s => !sb.shapes.includes(s) && s !== 'beam');
    if (fresh.length) { sb.shapes.push(...fresh); renderShapes(); }
  }
});
// built once and never moved: taking an iframe out of the page would reload the game inside it
function sandboxPane() {
  sb.frame = h('iframe', { src: 'index.html?sandbox', title: 'Test canvas' });
  const cfg = sb.cfg;
  const btn = (label, on, fn, title) => h('button', { class: 'small' + (on ? ' on' : ''), title, onclick: fn }, label);
  const conf = patch => { Object.assign(cfg, patch); sbSend({ config: patch }); renderControls(); };
  const controls = h('div', { id: 'sbControls' });
  function renderControls() {
    const isRelic = ITEM[cfg.item].slot === 'relic';
    controls.replaceChildren(
      h('div', { class: 'controls' },
        h('div', { class: 'grp' }, h('span', { class: 'lbl' }, 'Level'), [1, 2, 3, 4, 5].map(L => btn(String(L), cfg.level === L, () => conf({ level: L })))),
        btn('✦ Fused', cfg.evo, () => conf({ evo: !cfg.evo }), 'Preview the fused version: ×1.8 damage, faster, +1 projectile'),
        h('div', { class: 'grp' }, h('span', { class: 'lbl' }, 'Targets'), sel([['ring', 'Ring'], ['line', 'Line'], ['scatter', 'Scattered'], ['swarm', 'Walking swarm']], cfg.layout, v => conf({ layout: v }))),
        btn('Unkillable', cfg.tough, () => conf({ tough: !cfg.tough }), 'Targets never die, so you can watch hits and status effects'),
        btn('Walk in a circle', cfg.move, () => conf({ move: !cfg.move }), 'Items that react to movement need this. You can also click the canvas and use WASD.'),
        btn('Numbers', sb.numbers, () => { sb.numbers = !sb.numbers; sbSend({ numbers: sb.numbers }); renderControls(); }, 'Damage numbers'),
        btn('↻ Restart', false, () => sbSend({ restart: true }))),
      isRelic ? h('div', { class: 'controls' }, h('span', { class: 'lbl' }, 'Trigger'),
        [['kill', 'Kill a target'], ['hurt', 'Get hit'], ['levelup', 'Level up'], ['crit', 'Critical hit'], ['pickup', 'Pick up crystal']].map(([k, l]) => btn(l, false, () => sbSend({ trigger: k })))) : '');
  }
  sb.renderControls = renderControls;
  return h('div', { class: 'canvaspane' }, h('div', { class: 'stage' }, sb.frame), controls, h('div', { class: 'readout', id: 'readout' }, 'Starting…'));
}
function selectSandboxItem(def) {
  if (sb.cfg.item === def.id) return;
  const src = [def.fire, def.spawn, def.update, ...Object.values(def.on || {})].filter(Boolean).map(f => f.toString()).join('\n');
  sb.shapes = [];
  sb.cfg.item = def.id; sb.cfg.move = /P\.moving|moveAng/.test(src) || !!(def.on && def.on.move);
  sbSend({ config: { item: def.id, move: sb.cfg.move } });
  sb.dps = 0; const r = $('#readout'); if (r) r.textContent = 'Starting…';
}
function staticShapes(def) {
  const src = [def.fire, def.spawn, def.update, ...Object.values(def.on || {})].filter(Boolean).map(f => f.toString()).join('\n');
  const found = [...src.matchAll(/shape: '(\w+)'/g)].map(m => m[1]);
  if (/\bB\(|radial\(|lob\(|hydra\(/.test(src) && !found.length) found.push('orb');
  return found;
}

// ---------- views ----------
const SLOT_TABS = { weapon: 'Weapons', spell: 'Spells', orbit: 'Orbitals', trap: 'Deployables', relic: 'Relics' };
const TABS = [['overview', 'Overview'], ...Object.entries(SLOT_TABS), ['chars', 'Characters'], ['enemies', 'Enemies'], ['drops', 'Pickups'], ['upgrades', 'Forge']];
let tab = 'overview';
const pickId = {};
let ed = null; const other = h('div');
function render() {
  $('#tabs').replaceChildren(...TABS.map(([k, l]) => h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; render(); } }, l)));
  renderedFields = [];
  if (!ed) { // the item editor stays in the page (hidden on other tabs) so the test canvas keeps running
    ed = { root: h('div', { class: 'editor' }), list: h('div', { style: 'display:contents' }), form: h('div', { style: 'display:contents' }) };
    ed.root.append(ed.list, ed.form, sandboxPane()); $('#main').append(ed.root, other);
  }
  const isItem = !!SLOT_TABS[tab];
  ed.root.style.display = isItem ? '' : 'none'; other.style.display = isItem ? 'none' : '';
  if (isItem) { itemView(tab); sb.renderControls(); renderShapes(); return; }
  if (tab === 'chars') other.replaceChildren(charView());
  else if (tab === 'enemies') other.replaceChildren(enemyView());
  else if (tab === 'drops') other.replaceChildren(dropView());
  else if (tab === 'upgrades') other.replaceChildren(upgradeView());
  else other.replaceChildren(overview());
}
let relist = () => {};
function listPane(rows, current, onpick) {
  const el = h('div', { class: 'list' });
  const draw = () => el.replaceChildren(...rows().map(r => h('button', { class: 'row' + (r.id === current() ? ' sel' : ''), style: r.color ? `--c:${r.color}` : '', 'data-row': r.key, onclick: () => onpick(r.id) },
    h('span', { class: 'ico' }, r.icon), h('span', { class: 'nm' }, r.name), r.tag ? h('span', { class: 'tag' }, r.tag) : null, h('span', { class: 'dot', style: r.edited ? '' : 'visibility:hidden', title: 'Edited' }))));
  draw(); relist = draw;
  return el;
}
const lockTag = l => !l ? '' : 'cost' in l ? '● ' + l.cost : '🔒';

function itemView(slot) {
  const ids = ITEMS.filter(d => d.slot === slot).map(d => d.id);
  if (!ids.includes(pickId[slot])) pickId[slot] = ids[0];
  const id = pickId[slot], def = ITEM[id], v = get('items', id), E = EFFECTS[v.effect];
  selectSandboxItem(def);
  const list = listPane(() => ids.map(i => { const x = get('items', i); return { id: i, key: 'items:' + i, icon: x.icon, name: x.name, color: x.color || EFFECTS[x.effect].color, tag: (x.disabled ? 'off ' : '') + lockTag(x.lock), edited: entryChanged('items', i) }; }),
    () => pickId[slot], i => { pickId[slot] = i; render(); });
  const T = 'items';
  const effectOpts = EFFECT_KEYS.map(k => [k, `${EFFECTS[k].icon} ${EFFECTS[k].name}`]);
  const form = h('div', { class: 'card' },
    h('h2', {}, h('span', { class: 'big' }, v.icon), v.name, h('code', {}, id), h('span', { class: 'spacer' }), entryChanged(T, id) ? h('button', { class: 'small', onclick: () => resetEntry(T, id) }, 'Reset item') : null),
    h('div', { class: 'fields' },
      field('Name', txt(T, id, 'name', { relist: true }), T, id, 'name'),
      field('Icon', txt(T, id, 'icon', { relist: true }), T, id, 'icon', { hint: 'An emoji' }),
      field('Effect', sel(effectOpts, v.effect, x => set(T, id, 'effect', x, { rerender: true })), T, id, 'effect', { hint: `Fuses into ${FUSE_PREFIX[v.effect]} ${v.name}. Changing it moves the item to another effect family.` }),
      field('In level-up choices', h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !v.disabled, onchange: e => set(T, id, 'disabled', e.target.checked ? null : true, { rerender: true }) }), v.disabled ? 'Disabled: hidden from players' : 'Enabled'), T, id, 'disabled'),
      field('Description', txt(T, id, 'pattern', { area: true }), T, id, 'pattern', { wide: true }),
      def.slot === 'relic' ? field('Trigger text', txt(T, id, 'trig'), T, id, 'trig', { wide: true }) : null),
    h('h3', {}, 'Stats'),
    h('div', { class: 'fields' },
      field('Base damage', num(T, id, 'dmg', { step: 1 }), T, id, 'dmg', { hint: '+30% per level, ×1.8 when fused' }),
      def.fire ? field('Cooldown (s)', num(T, id, 'cd', { step: 0.05 }), T, id, 'cd', { hint: '−7% per level, −25% when fused' }) : null),
    h('h3', {}, 'Unlock'),
    h('div', { class: 'fields' }, lockFields(T, id)),
    h('h3', {}, 'Visual style'),
    visualFields(def, v, E));
  ed.list.replaceChildren(list); ed.form.replaceChildren(form);
}
function visualFields(def, v, E) {
  const T = 'items', id = def.id, vis = v.vis || {};
  const setVis = (k, x, rerender) => { const n = clone(get(T, id).vis || {}); if (x == null) delete n[k]; else n[k] = x; set(T, id, 'vis', Object.keys(n).length ? n : null, { rerender }); };
  const slider = (k, label, hint) => {
    const val = vis[k] || 1; const out = h('input', { type: 'number', step: 0.05, min: 0.2, max: 5, value: val });
    const rng = h('input', { type: 'range', min: 0.2, max: 3, step: 0.05, value: val });
    const apply = x => { x = Math.round(x * 100) / 100; if (!(x > 0)) return; rng.value = x; out.value = x; setVis(k, x === 1 ? null : x); };
    rng.oninput = () => apply(+rng.value); out.oninput = () => apply(+out.value);
    return field(label, h('div', { class: 'inline' }, rng, out), T, id, 'vis', { hint, sub: k });
  };
  return h('div', {},
    h('div', { class: 'fields' },
      field('Color', h('div', { class: 'inline' }, colorIn(v.color || E.color, c => set(T, id, 'color', c.toLowerCase() === E.color.toLowerCase() ? null : c)), v.color ? h('button', { class: 'small', onclick: () => set(T, id, 'color', null, { rerender: true }) }, `Use ${E.name} color`) : h('span', { class: 'hint' }, `${E.name} color`)), T, id, 'color', { hint: 'Bullets, clouds, turrets and pets of this item' }),
      field('Trail', h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!vis.trail, onchange: e => setVis('trail', e.target.checked || null) }), 'Fading trail behind bullets'), T, id, 'vis', { sub: 'trail' }),
      slider('size', 'Bullet size ×', 'Also widens beams. Bigger bullets hit more.'),
      slider('speed', 'Bullet speed ×', 'Faster bullets travel further in their lifetime.')),
    h('div', { class: 'f wide', style: 'margin-top:10px' }, h('label', {}, 'Bullet shapes'), h('div', { id: 'shapeBox' })));
}
function renderShapes() {
  const box = $('#shapeBox'); if (!box) return;
  const id = sb.cfg.item, def = ITEM[id], T = 'items';
  const shapes = [...new Set([...staticShapes(def), ...sb.shapes])].filter(s => s !== 'beam');
  const map = (get(T, id).vis || {}).shapes || {};
  if (!shapes.length) { box.replaceChildren(h('div', { class: 'note' }, 'This item draws lightning, rings or spikes rather than bullets, so only its color applies.')); return; }
  const opts = [['', 'as designed'], ...C.SHAPES.map(s => [s, s])];
  box.replaceChildren(h('div', { class: 'shapes' }, shapes.map(s => h('div', { class: 'f' + (map[s] ? ' changed' : '') }, h('label', {}, `“${s}” bullets`), sel(opts, map[s] || '', x => {
    const n = clone(get(T, id).vis || {}); n.shapes = Object.assign({}, n.shapes); if (x) n.shapes[s] = x; else delete n.shapes[s]; if (!Object.keys(n.shapes).length) delete n.shapes;
    set(T, id, 'vis', Object.keys(n).length ? n : null); renderShapes();
  })))), h('div', { class: 'note' }, 'Shapes show up here as the test canvas fires them.'));
}

function charView() {
  const T = 'chars';
  if (!BASE.chars[pickId.chars]) pickId.chars = CHARACTERS[0].id;
  const id = pickId.chars, v = get(T, id), w = get('items', v.weapon);
  const list = listPane(() => CHARACTERS.map(c => { const x = get(T, c.id); return { id: c.id, key: 'chars:' + c.id, icon: '◆', name: x.name, color: x.color, tag: lockTag(x.lock), edited: entryChanged(T, c.id) }; }), () => pickId.chars, i => { pickId.chars = i; render(); });
  const mods = v.mods || {};
  const setMod = (k, x) => { const n = Object.assign({}, get(T, id).mods); if (!x) delete n[k]; else n[k] = x; set(T, id, 'mods', n); };
  const MOD_HINT = { might: 'damage, 0.1 = +10%', hp: 'max HP, 0.2 = +20%', armor: 'flat damage taken', regen: 'HP per second', speed: 'move speed, 0.15 = +15%', area: 'area, 0.15 = +15%', cd: 'cooldowns, 0.08 = −8%', projSpd: 'projectile speed', duration: 'duration', amount: 'extra projectiles', crit: 'crit chance, 0.1 = +10%' };
  const form = h('div', { class: 'card' },
    h('h2', {}, v.name, h('code', {}, id), h('span', { class: 'spacer' }), entryChanged(T, id) ? h('button', { class: 'small', onclick: () => resetEntry(T, id) }, 'Reset character') : null),
    h('div', { class: 'fields' },
      field('Name', txt(T, id, 'name', { relist: true }), T, id, 'name'),
      field('Title', txt(T, id, 'title'), T, id, 'title'),
      field('Color', colorIn(v.color, c => { set(T, id, 'color', c); relist(); }), T, id, 'color'),
      field('Starting weapon', sel(ITEMS.filter(d => d.slot === 'weapon').map(d => [d.id, `${get('items', d.id).icon} ${get('items', d.id).name}`]), v.weapon, x => set(T, id, 'weapon', x, { rerender: true })), T, id, 'weapon'),
      field('Perk text', txt(T, id, 'perk'), T, id, 'perk', { wide: true, hint: 'Describe the stat bonuses below' })),
    h('h3', {}, 'Stat bonuses'),
    h('div', { class: 'fields' }, field('Bonuses', h('div', { class: 'fields' }, C.MODS.map(k => h('div', { class: 'f' }, h('label', {}, k), h('input', { type: 'number', step: 'any', value: mods[k] ?? '', placeholder: '0', oninput: e => { const x = parseFloat(e.target.value); setMod(k, isFinite(x) ? x : 0); } }), h('div', { class: 'hint' }, MOD_HINT[k])))), T, id, 'mods', { wide: true })),
    h('h3', {}, 'Unlock'),
    h('div', { class: 'fields' }, lockFields(T, id)),
    h('h3', {}, 'Preview'),
    h('div', { class: 'preview', style: `--c:${v.color}` }, h('div', { class: 'avatar' }, '◆'), h('b', {}, v.name), h('small', {}, v.title), h('div', {}, `${w.icon} ${w.name}`), h('div', { class: 'perk' }, v.perk), v.lock ? h('small', { style: 'color:#ff9e4c' }, v.lock.cost ? `Buy: ● ${v.lock.cost}` : v.lock.text) : null));
  return h('div', { class: 'editor', style: 'grid-template-columns: 220px minmax(300px, 760px)' }, list, form);
}

function tableView(title, note, t, ids, cols) {
  const cell = (id, c) => {
    const v = get(t, id)[c.f];
    if (v === undefined && !c.always) return h('td', {}, '');
    let input;
    if (c.kind === 'color') input = colorIn(v, x => { set(t, id, c.f, x); td.classList.toggle('changed', changed(t, id, c.f)); });
    else if (c.kind === 'select') input = sel(c.options, v, x => { set(t, id, c.f, x); td.classList.toggle('changed', changed(t, id, c.f)); });
    else if (c.kind === 'text') input = h('input', { type: 'text', value: v ?? '', oninput: e => { set(t, id, c.f, e.target.value); td.classList.toggle('changed', changed(t, id, c.f)); } });
    else input = h('input', { type: 'number', step: c.step || 'any', min: 0, value: c.pct ? +(v * 100).toPrecision(4) : v, oninput: e => { const x = parseFloat(e.target.value); if (isFinite(x) && x >= 0) { set(t, id, c.f, c.pct ? x / 100 : x); td.classList.toggle('changed', changed(t, id, c.f)); } } });
    const td = h('td', { class: changed(t, id, c.f) ? 'changed' : '' }, input);
    return td;
  };
  return h('div', { class: 'card' }, h('h2', {}, title), note ? h('p', { class: 'note', style: 'margin-top:-6px' }, note) : null,
    h('div', { class: 'tablewrap' }, h('table', {}, h('tr', {}, h('th', {}, ''), cols.map(c => h('th', {}, c.label)), h('th', {}, '')),
      ids.map(id => h('tr', {}, h('td', {}, h('code', {}, id)), cols.map(c => cell(id, c)), h('td', {}, entryChanged(t, id) ? h('button', { class: 'small', onclick: () => resetEntry(t, id) }, 'reset') : null))))));
}
function enemyView() {
  const shapes = ['circle', 'tri', 'diamond', 'square', 'hex', 'star'].map(s => [s, s]);
  const cols = [{ f: 'name', label: 'Name', kind: 'text' }, { f: 'hp', label: 'HP' }, { f: 'spd', label: 'Speed' }, { f: 'r', label: 'Size' }, { f: 'dmg', label: 'Contact dmg' }, { f: 'xp', label: 'XP' }, { f: 'color', label: 'Color', kind: 'color' }];
  return h('div', { style: 'display:grid;gap:16px' },
    tableView('Enemies', 'HP and damage are the values at 0:00; both grow with the run clock.', 'enemies', Object.keys(BASE.enemies), [...cols, { f: 'shape', label: 'Shape', kind: 'select', options: shapes }]),
    tableView('Bosses', 'Bosses arrive at 5:00, 10:00 and 15:00. Their HP does not scale.', 'bosses', Object.keys(BASE.bosses), cols));
}
function dropView() {
  return tableView('Pickups', 'Drop chance is per normal kill, before Luck. Elites and bosses also drop chests and piles of gold.', 'drops', Object.keys(BASE.drops), [
    { f: 'chance', label: 'Drop chance %', pct: true }, { f: 'min', label: 'Min', step: 1 }, { f: 'max', label: 'Max', step: 1 }, { f: 'value', label: 'Value' }, { f: 'elite', label: 'Per elite', step: 1 }, { f: 'boss', label: 'Per boss', step: 1 }]);
}
function upgradeView() {
  return tableView('Forge upgrades', 'Rank n costs cost × 1.6ⁿ. "Per rank" is the bonus each rank adds (0.05 = 5%).', 'upgrades', Object.keys(BASE.upgrades), [
    { f: 'icon', label: 'Icon', kind: 'text' }, { f: 'name', label: 'Name', kind: 'text' }, { f: 'desc', label: 'Description', kind: 'text' }, { f: 'max', label: 'Ranks', step: 1 }, { f: 'cost', label: 'Base cost', step: 5 }, { f: 'per', label: 'Per rank' }]);
}

function overview() {
  const all = ITEMS.map(d => get('items', d.id)), chars = CHARACTERS.map(c => ({ id: c.id, ...get('chars', c.id) }));
  const stat = (n, label, sub) => h('div', { class: 'card stat' }, h('b', {}, n), label, sub ? h('small', { style: 'display:block' }, sub) : null);
  const go = (t, id) => { if (t === 'items') { tab = ITEM[id].slot; pickId[tab] = id; } else if (t === 'chars') { tab = 'chars'; pickId.chars = id; } else tab = t === 'bosses' ? 'enemies' : t; render(); window.scrollTo(0, 0); };
  const unlockRows = [...ITEMS.map(d => ['items', d.id, get('items', d.id)]), ...CHARACTERS.map(c => ['chars', c.id, get('chars', c.id)])].filter(r => r[2].lock);
  const edits = [];
  for (const t of Object.keys(BASE)) for (const id of Object.keys(BASE[t])) {
    const a = (ov[t] || {})[id] || {}, b = (live.ov[t] || {})[id] || {};
    if (canon(a) === canon(b)) continue;
    const fields = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(f => canon(a[f]) !== canon(b[f]));
    edits.push([t, id, fields]);
  }
  const nameOf = (t, id) => { const v = get(t, id); return (v.icon ? v.icon + ' ' : '') + (v.name || id); };
  return h('div', { style: 'display:grid;gap:16px' },
    h('div', { class: 'stats' },
      stat(all.length, 'items', `${all.filter(x => x.lock).length} locked · ${all.filter(x => x.disabled).length} disabled`),
      stat(chars.length, 'characters', `${chars.filter(x => x.lock).length} locked`),
      stat(Object.keys(BASE.enemies).length + Object.keys(BASE.bosses).length, 'enemies', `${Object.keys(BASE.bosses).length} of them bosses`),
      stat(Object.keys(BASE.drops).length, 'pickups'), stat(UPGRADES.length, 'Forge upgrades'),
      stat(Object.values(ov).reduce((n, r) => n + Object.keys(r).length, 0), 'entries edited', 'vs items.js defaults')),
    h('div', { class: 'card' }, h('h2', {}, 'Changes not yet published'),
      edits.length ? h('table', {}, edits.map(([t, id, f]) => h('tr', {}, h('td', {}, TABLE_NAMES[t]), h('td', {}, h('button', { class: 'link', onclick: () => go(t, id) }, nameOf(t, id))), h('td', {}, h('code', {}, f.join(', '))))))
        : h('p', { class: 'note' }, `Everything matches the live game. Last published ${ago(live.updatedAt)}${live.by ? ' by ' + live.by : ''}.`)),
    h('div', { class: 'card' }, h('h2', {}, 'Unlocks'),
      h('div', { class: 'tablewrap' }, h('table', {}, h('tr', {}, h('th', {}, 'What'), h('th', {}, 'Type'), h('th', {}, 'How players unlock it')),
        unlockRows.map(([t, id, v]) => h('tr', {}, h('td', {}, h('button', { class: 'link', onclick: () => go(t, id) }, nameOf(t, id))), h('td', {}, t === 'items' ? SLOTS[ITEM[id].slot].name : 'Character'),
          h('td', {}, v.lock.cost ? `Buy for ● ${v.lock.cost}` : `${v.lock.text}  `, v.lock.stat ? h('code', {}, `${v.lock.stat} ≥ ${v.lock.min}`) : null)))))),
    h('div', { class: 'card' }, h('h2', {}, 'Publish history'),
      history.length ? h('table', {}, history.map(x => h('tr', {}, h('td', {}, new Date(x.updatedAt).toLocaleString()), h('td', {}, x.by), h('td', {}, `${countEdits(prune(x.ov), {})} edited entries`),
        h('td', {}, h('button', { class: 'small', onclick: () => { if (confirm('Replace your current edits with this published version? Nothing is published until you press Publish.')) setWorking(x.ov, 'Loaded. Press Publish to roll the game back to it.'); } }, 'Load')))))
        : h('p', { class: 'note' }, 'Nothing published yet.')));
}

// ---------- header actions ----------
$('#btnDraft').onclick = saveDraft;
$('#btnPublish').onclick = publish;
$('#btnExport').onclick = exportFile;
$('#btnSignOut').onclick = signOut;
$('#more').onchange = e => {
  const v = e.target.value; e.target.value = '';
  if (v === 'live' && confirm('Throw away your unpublished edits and go back to what the game has now?')) setWorking(live.ov, 'Back to the live content.');
  if (v === 'draft') { if (!draft) toast('No draft saved yet.'); else if (confirm(`Replace your current edits with the draft saved ${ago(draft.updatedAt)}?`)) setWorking(draft.ov, 'Draft loaded.'); }
  if (v === 'defaults' && confirm('Clear every override, so content matches src/items.js? Nothing is published until you press Publish.')) setWorking({}, 'All overrides cleared.');
};
window.VOIDLIGHT_ADMIN = { exportItemsJs, get ov() { return ov; }, set ov(o) { ov = o; } }; // for tests
boot();
