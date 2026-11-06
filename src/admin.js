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
const TABLE_NAMES = { codex: 'Codex prices', dmgtypes: 'Damage types', items: 'Item', chars: 'Character', cats: 'Category', stages: 'Level', tiers: 'Fusion tier', difficulty: 'Difficulty', upgrades: 'Forge upgrade', enemies: 'Enemy', bosses: 'Boss', drops: 'Pickup', options: 'Game option', chain: 'Fusion chains' };

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
  C.apply(ov); // the global tables follow the working copy (lock texts, the progress simulator)
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
  C.apply(ov); refreshStatus(); render(); sbPushSoon();
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
  if (Array.isArray(v)) return '[' + v.map(lit).join(', ') + ']';
  const keys = Object.keys(v); if (!keys.length) return '{}';
  return '{ ' + keys.map(k => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : q(k)) + ': ' + lit(v[k])).join(', ') + ' }';
}
// An item's literal properties all sit on the first line of its def(...) call (see the note in items.js),
// so that line can be rewritten from data while the fire/spawn/on code below it is kept as is.
function itemHeader(id, v) {
  const d = ITEM[id], props = [];
  props.push('dmg: ' + lit(v.dmg));
  if (v.cd) props.push('cd: ' + lit(v.cd));
  if (v.effect2) props.push('effect2: ' + lit(v.effect2));
  if (v.passive) props.push('passive: ' + lit(v.passive));
  if (v.lock) props.push('lock: ' + lit(v.lock));
  if (v.fuseLock) props.push('fuseLock: ' + lit(v.fuseLock));
  if (v.color) props.push('color: ' + lit(v.color));
  if (v.vis) props.push('vis: ' + lit(v.vis));
  if (v.disabled) props.push('disabled: true');
  if (v.chain) props.push('chain: ' + lit(v.chain));
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
  const tables = [['cats', 'CATEGORIES', id => CATEGORIES[id], (id, x) => `  ${id}: ${lit(x)},`, id => new RegExp(`^\\s*${id}:\\s*\\{`)],
    ['stages', 'STAGES', id => STAGES.find(x => String(x.id) === String(id)), (id, x) => `  ${lit(x)},`, id => new RegExp(`^\\s*\\{ id: ${id},`)],
    ['tiers', 'FUSION', id => FUSION[id], (id, x) => `  ${id}: ${lit(x)},`, id => new RegExp(`^\\s*${id}:\\s*\\{`)],
    ['difficulty', 'DIFFICULTY', id => DIFFICULTY[id], (id, x) => `  ${id}: ${lit(x)},`, id => new RegExp(`^\\s*${id}:\\s*\\{`)],
    ['chars', 'CHARACTERS', id => CHARACTERS.find(c => c.id === id), (id, x) => `  ${lit(x)},`, id => new RegExp(`^\\s*\\{ id: '${id}',`)],
    ['upgrades', 'UPGRADES', id => UPGRADES.find(u => u.id === id), (id, x) => `  ${lit(x)},`, id => new RegExp(`^\\s*\\{ id: '${id}',`)],
    ['enemies', 'ENEMY_TYPES', id => ENEMY_TYPES[id], (id, x) => `  ${id}: ${lit(x)},`, id => new RegExp(`^\\s*${id}:\\s*\\{`)],
    ['bosses', 'BOSSES', id => BOSSES[id], (id, x) => `  ${id}: ${lit(x)},`, id => new RegExp(`^\\s*${id}:\\s*\\{`)],
    ['drops', 'DROPS', id => DROPS[id], (id, x) => `  ${id}: ${lit(x)},`, id => new RegExp(`^\\s*${id}:\\s*\\{`)],
    ['options', 'OPTIONS', id => OPTIONS[id], (id, x) => `  ${id}: ${lit(x)},`, id => new RegExp(`^\\s*${id}:\\s*\\{`)],
    ['chain', 'CHAIN_RULES', id => CHAIN_RULES[id], (id, x) => `  ${id}: ${lit(x)},`, id => new RegExp(`^\\s*${id}:\\s*\\{`)]];
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

// lock kinds and their texts live in progress.js (shared with the game)
const LOCK_MODES = [['none', 'Available from the start'], ['stage', 'Achievement: a stat in one level'], ['stat', 'Achievement: a lifetime stat'], ['effect', 'Achievement: level any item of a category'], ['item', 'Achievement: level one specific item'],
  ['char', 'Achievement: a stat in one level, with one hero'], ['mastery', 'Achievement: master one item (its fusion unlock)'], ['cat', 'A category is unlocked'], ['all', 'Several requirements (all of them)']];
const PART_MODES = LOCK_MODES.filter(([m]) => m !== 'none' && m !== 'all');
const reqMode = l => (l.char ? 'char' : l.mastery ? 'mastery' : l.cat ? 'cat' : l.stage ? 'stage' : l.item ? 'item' : l.effect ? 'effect' : 'stat');
const lockMode = l => (!l || !hasReq(l) ? 'none' : l.all ? 'all' : reqMode(l));
function defaultReq(m) {
  switch (m) {
    case 'stage': return { stage: 1, stat: 'kills', min: 500 };
    case 'stat': return { stat: 'totalKills', min: 500 };
    case 'effect': return { effect: 'burn', level: 5 };
    case 'char': return { char: CHARACTERS[0].id, stage: 1, stat: 'wins', min: 1 };
    case 'mastery': return { mastery: ITEMS[0].id };
    case 'cat': return { cat: EFFECT_KEYS[0] };
    default: return { item: ITEMS[0].id, level: 5, runs: 1 };
  }
}
function defaultLock(m, cost) {
  const l = m === 'all' ? { all: [defaultReq('char'), defaultReq('mastery')] } : defaultReq(m);
  l.text = lockText(l); if (cost) l.cost = cost; return l;
}
const effectOptions = () => EFFECT_KEYS.map(k => [k, `${EFFECTS[k].icon} ${EFFECTS[k].name}`]);
const itemOptions = () => ITEMS.map(d => [d.id, `${get('items', d.id).icon} ${get('items', d.id).name}`]);
const stageOptions = () => STAGES.map(x => [String(x.id), `Level ${x.id}: ${get('stages', String(x.id)).name}`]);
const charOptions = () => CHARACTERS.map(c => [c.id, '◆ ' + get('chars', c.id).name]);
// the inputs of one requirement; upd(patch) changes it
function reqInputs(r, upd) {
  const n = (k, min, max) => h('input', { type: 'number', min, max, style: 'width:72px', value: r[k], onchange: e => { const v = parseInt(e.target.value, 10); if (v >= min && v <= max) upd({ [k]: v }); } });
  switch (reqMode(r)) {
    case 'stage': return h('div', { class: 'inline' }, sel(stageOptions(), String(r.stage), x => upd({ stage: +x })), sel(Object.entries(STAGE_STATS), r.stat, x => upd({ stat: x })), h('span', {}, '≥'), n('min', 0, 1e6));
    case 'stat': return h('div', { class: 'inline' }, sel(Object.entries(C.STATS), r.stat, x => upd({ stat: x })), h('span', {}, '≥'), n('min', 0, 1e6));
    case 'effect': return h('div', { class: 'inline' }, h('span', {}, 'Level'), n('level', 1, 5), h('span', {}, 'with any'), sel(effectOptions(), r.effect, x => upd({ effect: x })), h('span', {}, 'item'));
    case 'char': return h('div', { class: 'inline' }, h('span', {}, 'As'), sel(charOptions(), r.char, x => upd({ char: x })), h('span', {}, 'in'), sel(stageOptions(), String(r.stage), x => upd({ stage: +x })), sel(Object.entries(STAGE_STATS), r.stat, x => upd({ stat: x })), h('span', {}, '≥'), n('min', 0, 1e6));
    case 'mastery': return h('div', { class: 'inline' }, h('span', {}, 'Master'), sel(itemOptions(), r.mastery, x => upd({ mastery: x })), h('span', { class: 'hint' }, ITEM[r.mastery] ? fuseLockText(ITEM[r.mastery]) : ''));
    case 'cat': return h('div', { class: 'inline' }, sel(effectOptions(), r.cat, x => upd({ cat: x })), h('span', {}, 'items unlocked'));
    default: return h('div', { class: 'inline' }, h('span', {}, 'Level'), n('level', 1, 5), h('span', {}, 'with'), sel(itemOptions(), r.item, x => upd({ item: x })), h('span', {}, 'in'), n('runs', 1, 1000), h('span', {}, 'runs'));
  }
}
// buyable: items and characters can carry a gold price that the player pays once the requirement is met
function lockFields(t, id, { buyable = false } = {}) {
  const lock = get(t, id).lock, mode = lockMode(lock);
  const out = [field('Unlock', sel(LOCK_MODES, mode, m => set(t, id, 'lock', m === 'none' ? null : defaultLock(m, buyable ? lockCost(lock) || 500 : 0), { rerender: true })), t, id, 'lock', { wide: true })];
  if (mode === 'none') { if (lock && lockCost(lock)) out.push(h('div', { class: 'f wide note' }, `This lock only has a gold price (● ${lock.cost}). Gold-only unlocks are gone: players get it as if it were unlocked. Pick an achievement for it.`)); return out; }
  // the text follows the requirement unless it was written by hand
  const upd = patch => { const cur = get(t, id).lock; const next = Object.assign({}, cur, patch); if (cur.text === lockText(cur)) next.text = lockText(next); set(t, id, 'lock', next, { rerender: true }); };
  let req;
  if (mode === 'all') {
    const parts = lock.all.slice(), setParts = ps => upd({ all: ps });
    req = h('div', { class: 'parts' }, parts.map((p, i) => h('div', { class: 'inline part' },
      sel(PART_MODES, reqMode(p), m => { const ps = parts.slice(); ps[i] = defaultReq(m); setParts(ps); }),
      reqInputs(p, patch => { const ps = parts.slice(); ps[i] = Object.assign({}, p, patch); setParts(ps); }),
      parts.length > 1 ? h('button', { class: 'small', title: 'Remove this requirement', onclick: () => setParts(parts.filter((_, j) => j !== i)) }, '✕') : null)),
      parts.length < 6 ? h('button', { class: 'small', onclick: () => setParts([...parts, defaultReq('mastery')]) }, '+ Add requirement') : null);
  } else req = reqInputs(lock, upd);
  const best = lockParts(lock).some(p => (p.stage && p.stat === 'best') || p.stat === 'bestTime');
  const hint = [best ? 'Times are in seconds: 300 is 5:00.' : '', 'Counted when a run ends.', lockParts(lock).some(p => p.effect) ? 'Two-effect items count for both of their categories.' : '', lockParts(lock).some(p => p.mastery) ? 'Mastery follows that item’s fusion unlock (Progression tab).' : ''].filter(Boolean).join(' ');
  out.push(field('Requirement', req, t, id, 'lock', { wide: true, hint }));
  out.push(field('Text players see', h('input', { type: 'text', value: lock.text, oninput: e => set(t, id, 'lock', Object.assign({}, get(t, id).lock, { text: e.target.value })) }), t, id, 'lock', { wide: true }));
  if (buyable) out.push(field('Then buy for (gold)', h('input', { type: 'number', min: 0, step: 50, value: lockCost(lock), oninput: e => { const v = parseInt(e.target.value, 10); if (v >= 0) { const nx = Object.assign({}, get(t, id).lock); if (v) nx.cost = v; else delete nx.cost; set(t, id, 'lock', nx); } } }), t, id, 'lock', { hint: '0 = free as soon as it is earned' }));
  return out;
}
// fusion lock of one item: reach `level` with it in `runs` runs (0 = always fusable)
function fuseLockInput(id, k, onDone) {
  const cur = () => Object.assign({}, FUSE_LOCK, get('items', id).fuseLock || {});
  const [min, max] = k === 'level' ? [1, 5] : [0, 1000];
  return h('input', { type: 'number', min, max, style: 'width:64px', value: cur()[k], onchange: e => {
    const v = parseInt(e.target.value, 10); if (!(v >= min && v <= max)) return;
    const n = cur(); n[k] = v; set('items', id, 'fuseLock', canon(n) === canon(FUSE_LOCK) ? null : n, { rerender: !onDone }); if (onDone) onDone();
  } });
}
const effectsOfId = id => effectsOf(get('items', id));
const partnersOf = id => { const mine = effectsOfId(id); return ITEMS.filter(d => d.id !== id && !get('items', d.id).disabled && effectsOfId(d.id).some(k => mine.includes(k))); };

// ---------- test canvas (the real game engine in an iframe, see the sandbox section of main.js) ----------
const sb = { frame: null, ready: false, cfg: { item: ITEMS[0].id, level: 3, fuse: [], tier: 0, layout: 'ring', tough: true, move: false }, numbers: true, dps: 0, shapes: [], timer: 0 };
function sbSend(m) { if (sb.ready && sb.frame.contentWindow) sb.frame.contentWindow.postMessage(Object.assign({ vl: 'sandbox' }, m), location.origin); }
function sbPushSoon() { clearTimeout(sb.timer); sb.timer = setTimeout(() => sbSend({ overrides: ov }), 120); }
window.addEventListener('message', e => {
  if (!sb.frame || e.source !== sb.frame.contentWindow || e.origin !== location.origin || !e.data) return;
  if (e.data.vl === 'sandbox-ready') { sb.ready = true; sbSend({ overrides: ov, config: sb.cfg, numbers: sb.numbers }); }
  if (e.data.vl === 'sandbox-stats') {
    sb.dps = e.data.dps; const r = $('#readout'); if (r) r.textContent = `${Math.round(sb.dps)} damage/s over the last 5 s · ${e.data.bullets} bullets on screen` + (e.data.hit ? ` · one hit ${Math.round(e.data.hit)}` : '');
    sb.chain = e.data.chain && e.data.chain.length ? 'Chain: ' + e.data.chain.join(' · ') : ''; const co = $('#chainOut'); if (co) co.textContent = sb.chain;
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
        h('div', { class: 'grp' }, h('span', { class: 'lbl' }, '✦ Tier'), TIER_KEYS.map((k, t) => btn(t ? get('tiers', k).name : 'Plain', cfg.tier === t, () => conf({ tier: t, fuse: t ? cfg.fuse : [] }), t ? `${get('tiers', k).name}: ×${get('tiers', k).mul} damage` : 'Not fused'))),

        h('div', { class: 'grp' }, h('span', { class: 'lbl' }, 'Targets'), sel([['ring', 'Ring'], ['line', 'Line'], ['scatter', 'Scattered'], ['swarm', 'Walking swarm']], cfg.layout, v => conf({ layout: v }))),
        btn('Unkillable', cfg.tough, () => conf({ tough: !cfg.tough }), 'Targets never die, so you can watch hits and status effects'),
        btn('Walk in a circle', cfg.move, () => conf({ move: !cfg.move }), 'Items that react to movement need this. You can also click the canvas and use WASD.'),
        btn('Numbers', sb.numbers, () => { sb.numbers = !sb.numbers; sbSend({ numbers: sb.numbers }); renderControls(); }, 'Damage numbers'),
        btn('↻ Restart', false, () => sbSend({ restart: true }))),
      cfg.tier ? partnerControls(cfg, conf) : null,
      cfg.tier ? h('div', { class: 'note' }, fusionSummary(cfg.item, cfg.tier)) : null,
      cfg.tier ? h('div', { class: 'chainOut', id: 'chainOut' }, sb.chain || '') : null,
      isRelic ? h('div', { class: 'controls' }, h('span', { class: 'lbl' }, 'Trigger'),
        [['kill', 'Kill a target'], ['hurt', 'Get hit'], ['levelup', 'Level up'], ['crit', 'Critical hit'], ['pickup', 'Pick up crystal'], ['dash', 'Dash']].map(([k, l]) => btn(l, false, () => sbSend({ trigger: k })))) : '');
  }
  sb.renderControls = renderControls;
  return h('div', { class: 'canvaspane' }, h('div', { class: 'stage' }, sb.frame), controls, h('div', { class: 'readout', id: 'readout' }, 'Starting…'));
}
// The fusion tester under the test canvas: the items fused into the test item at its tier, and for Super and Mega the items
// fused into each of those one tier below. Empty = a stand-in as strong as the item it fills in for, with no chain.
// cfg.fuse entries: 'id' or 'id>sub1+sub2' (see SB in main.js).
function partnerControls(cfg, conf) {
  const T = cfg.tier, need = t => Math.max(1, get('tiers', TIER_KEYS[t]).need - 1), rows = [], fuse = (cfg.fuse || []).slice();
  const opts = id => [['', '— stand-in —'], ...partnersOf(id).map(d => [d.id, `${get('items', d.id).icon} ${get('items', d.id).name}`])];
  // what can be fused into a partner: not the test item itself, and only passives into a passive
  const subOpts = id => opts(id).filter(([x]) => !x || (x !== cfg.item && (!get('items', id).passive || get('items', x).passive)));
  const write = (k, a, subs) => { fuse[k] = a ? a + (subs.filter(Boolean).length ? '>' + subs.filter(Boolean).join('+') : '') : ''; conf({ fuse: fuse.slice() }); };
  for (let k = 0; k < need(T); k++) {
    const [a, b] = String(fuse[k] || '').split('>'), subs = (b || '').split('+');
    const row = [sel(opts(cfg.item), a || '', x => write(k, x, x === a ? subs : []))];
    if (T >= 2 && a) for (let j = 0; j < need(T - 1); j++) row.push(h('span', { class: 'lbl' }, j ? '+' : '← with'), sel(subOpts(a), subs[j] || '', x => { const n = subs.slice(); n[j] = x; write(k, a, n); }));
    rows.push(h('div', { class: 'grp' }, h('span', { class: 'lbl' }, k ? 'and' : 'Absorbs'), ...row));
  }
  return h('div', { class: 'controls' }, ...rows,
    h('button', { class: 'small', title: 'Fill every slot with a random item it can fuse with', onclick: () => {
      const rnd = (id, sub) => { const l = sub ? subOpts(id).map(([x]) => x).filter(Boolean) : partnersOf(id).map(d => d.id); return l.length ? l[Math.floor(Math.random() * l.length)] : ''; };
      conf({ fuse: Array.from({ length: need(T) }, () => { const a = rnd(cfg.item); if (!a || T < 2) return a; return a + '>' + Array.from({ length: need(T - 1) }, () => rnd(a, true)).filter(Boolean).join('+'); }) });
    } }, '🎲 Random'));
}
// what the fusion on the test canvas does, in words (the numbers come from the canvas, which uses the game's own maths)
function fusionSummary(keep, T) {
  const a = get('items', keep), tr = get('tiers', TIER_KEYS[T]);
  const made = TIER_KEYS.slice(1, T + 1).reduce((n, k) => n * get('tiers', k).need, 1);
  return `${T > 1 ? tr.name + ' ' : ''}${a.name}, made from ${made} level 5 items. It keeps 100% of what it hit for and adds 50% of what the items it absorbed hit for, ` +
    `then its own damage × ${tr.mul} grows 30% per level on top. ${Math.round(100 * (1 - tr.cdMul))}% faster, +${T} projectile${T > 1 ? 's' : ''}, ${tr.own} own stacks of every effect it carries. ` +
    `Each absorbed attacking item plays its own attack off ${a.name}'s at ${Math.round(100 * CHAIN_RULES.rules.dmg)}% of its damage (its form is under “Fusion chain” on its own page); their absorbed items chain one step further out.` +
    (a.passive ? ' A passive can only absorb passives.' : '');
}
function selectSandboxItem(def) {
  if (sb.cfg.item === def.id) return;
  const src = [def.fire, def.spawn, def.update, ...Object.values(def.on || {})].filter(Boolean).map(f => f.toString()).join('\n');
  sb.shapes = [];
  sb.cfg.item = def.id; sb.cfg.move = /P\.moving|moveAng/.test(src) || !!(def.on && def.on.move); sb.cfg.fuse = [];
  sbSend({ config: { item: def.id, move: sb.cfg.move, fuse: [] } });
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
const TABS = [['overview', 'Overview'], ['progress', 'Progression'], ...Object.entries(SLOT_TABS), ['chars', 'Characters'], ['enemies', 'Enemies & difficulty'], ['drops', 'Pickups'], ['upgrades', 'Forge'], ['options', 'Options']];
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
  else if (tab === 'progress') other.replaceChildren(progressView());
  else if (tab === 'options') other.replaceChildren(optionsView());
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
const lockTag = l => !l ? '' : (hasReq(l) ? (lockStage(l) ? 'L' + lockStage(l) + ' ' : '🔒') : '') + (lockCost(l) ? '● ' + l.cost : '');

function itemView(slot) {
  const ids = ITEMS.filter(d => d.slot === slot).map(d => d.id);
  if (!ids.includes(pickId[slot])) pickId[slot] = ids[0];
  const id = pickId[slot], def = ITEM[id], v = get('items', id), E = EFFECTS[v.effect];
  selectSandboxItem(def);
  const list = listPane(() => ids.map(i => { const x = get('items', i); return { id: i, key: 'items:' + i, icon: x.icon, name: x.name, color: x.color || EFFECTS[x.effect].color, tag: (x.disabled ? 'off ' : '') + (x.passive ? 'P ' : x.effect2 ? '2fx ' : '') + (effectsOf(x).some(catLock) ? '◇' : '') + lockTag(x.lock), edited: entryChanged('items', i) }; }),
    () => pickId[slot], i => { pickId[slot] = i; render(); });
  const T = 'items';
  const effectOpts = EFFECT_KEYS.map(k => [k, `${EFFECTS[k].icon} ${EFFECTS[k].name}`]);
  const form = h('div', { class: 'card' },
    h('h2', {}, h('span', { class: 'big' }, v.icon), v.name, h('code', {}, id), h('span', { class: 'spacer' }), entryChanged(T, id) ? h('button', { class: 'small', onclick: () => resetEntry(T, id) }, 'Reset item') : null),
    h('div', { class: 'fields' },
      field('Name', txt(T, id, 'name', { relist: true }), T, id, 'name'),
      field('Icon', txt(T, id, 'icon', { relist: true }), T, id, 'icon', { hint: 'An emoji' }),
      field('Effect', sel(effectOpts, v.effect, x => set(T, id, 'effect', x, { rerender: true })), T, id, 'effect', { hint: `Its category, and its color. Changing it moves the item to another family.` }),
      field('Second effect', sel([['', '— none —'], ...effectOpts.filter(([k]) => k !== v.effect)], v.effect2 || '', x => set(T, id, 'effect2', x || null, { rerender: true })), T, id, 'effect2', { hint: 'Two-effect items add 60% of their level to each effect (not 100% to one), get +1 own stack of each (not +2), fuse with items of either effect, and need both categories unlocked. Give them about 70% of the usual damage.' }),
      field('In level-up choices', h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !v.disabled, onchange: e => set(T, id, 'disabled', e.target.checked ? null : true, { rerender: true }) }), v.disabled ? 'Disabled: hidden from players' : 'Enabled'), T, id, 'disabled'),
      field('Description', txt(T, id, 'pattern', { area: true }), T, id, 'pattern', { wide: true }),
      def.slot === 'relic' ? field('Trigger text', txt(T, id, 'trig'), T, id, 'trig', { wide: true }) : null),
    h('h3', {}, 'Stats'),
    def.passive ? passiveFields(id) : h('div', { class: 'fields' },
      field('Base damage', num(T, id, 'dmg', { step: 1 }), T, id, 'dmg', { hint: '+30% per level, × the fusion tier. A fusion also carries over 100% of what the kept item hit for and 50% of what the others hit for, as flat damage' }),
      def.fire ? field('Cooldown (s)', num(T, id, 'cd', { step: 0.05 }), T, id, 'cd', { hint: '−7% per level, times the fusion tier\'s cooldown factor' }) : null),
    h('h3', {}, 'Unlock'),
    h('div', { class: 'fields' }, lockFields(T, id, { buyable: true }),
      h('div', { class: 'f wide note' }, `Also needs its ${effectsOf(v).map(k => EFFECTS[k].name).join(' and ')} ${effectsOf(v).length > 1 ? 'categories' : 'category'}: ${effectsOf(v).map(k => catLock(k) ? `${EFFECTS[k].name} opens with “${catLock(k).text || lockText(catLock(k))}”` : `${EFFECTS[k].name} is open from the start`).join('; ')}. Categories are set on the Progression tab.`)),
    h('h3', {}, 'Fusion'),
    h('div', { class: 'fields' },
      field('Fusion unlock', h('div', { class: 'inline' }, h('span', {}, 'Reach level'), fuseLockInput(id, 'level'), h('span', {}, 'with it in'), fuseLockInput(id, 'runs'), h('span', {}, 'runs')), T, id, 'fuseLock',
        { wide: true, hint: `Players see this as the “${v.name} mastery” achievement. 0 runs = always mastered. Only a mastered item can remain in a fusion; it can absorb items that are not mastered yet.` }),
      h('div', { class: 'f wide note' }, `Fuses with (any level 5 item sharing ${effectsOf(v).map(k => EFFECTS[k].name).join(' or ')}): ${partnersOf(id).map(d => get('items', d.id).icon + ' ' + get('items', d.id).name).join(', ') || 'nothing yet'}. Try a fusion tier under the test canvas.${v.passive ? ' As a passive it can only absorb other passives.' : ''}`)),
    def.passive ? null : chainFields(def, v),
    h('h3', {}, 'Visual style'),
    visualFields(def, v, E));
  ed.list.replaceChildren(list); ed.form.replaceChildren(form);
}
// How this item plays when another item absorbs it: its fusion chain (chain.js). Stored as the item's `chain` field.
function chainFields(def, v) {
  const T = 'items', id = def.id, cur = v.chain || {}, d = CHAIN_DEFAULTS[id] || [], c0 = chainOf(def.chain ? Object.assign({}, def, { chain: null }) : def), dflt = { cat: c0.cat, spread: c0.spread, act: c0.act, shape: c0.shape };
  const c = chainOf(Object.assign({}, def, { chain: cur })), K = CHAIN_CATS[c.cat];
  const setC = (k, x) => { const n = clone(get(T, id).chain || {}); delete n.form; if (x === null || x === '' || x === undefined) delete n[k]; else n[k] = x; set(T, id, 'chain', Object.keys(n).length ? n : null, { rerender: true }); };
  const numIn = (k, step, min, max, ph) => h('input', { type: 'number', step, min, max, value: cur[k] ?? '', placeholder: ph, onchange: e => { const x = parseFloat(e.target.value); setC(k, isFinite(x) && x >= min && x <= max ? x : null); } });
  const rideOn = Object.keys(CHAIN_HOSTS).filter(k => chainPair(k, c.cat) === 'ride').map(k => CHAIN_HOSTS[k].name);
  return h('div', {},
    h('h3', {}, 'Fusion chain (when another item absorbs it)'),
    h('div', { class: 'fields' },
      field('Category', sel(CHAIN_CAT_KEYS.map(k => [k, `${CHAIN_CATS[k].icon} ${CHAIN_CATS[k].name}` + (k === dflt.cat ? ' · default' : '')]), c.cat, x => setC('cat', x === dflt.cat ? null : x)), T, id, 'chain', { sub: 'cat', hint: `Its animation: ${K.text}. Also decides what its links ride on when it is the item that remains.` }),
      c.cat === 'projectile' ? field('Pattern', sel([['aim', 'Volley at the nearest enemy'], ['ring', 'Ring all around']], c.spread, x => setC('spread', x === dflt.spread ? null : x)), T, id, 'chain', { sub: 'spread' }) : null,
      c.cat === 'deployable' ? field('Its small copies', sel(Object.entries(CHAIN_ACTS).map(([k, t]) => [k, t + (k === dflt.act ? ' · default' : '')]), c.act, x => setC('act', x === dflt.act ? null : x)), T, id, 'chain', { sub: 'act' }) : null,
      field('Pops when a bullet', sel(Object.entries(CHAIN_ONS).map(([k, l]) => [k, l]), c.on, x => setC('on', x === 'end' ? null : x)), T, id, 'chain', { sub: 'on', hint: 'Only when it pops off a bullet (not when it rides)' }),
      field('Shape', sel(C.CHAIN_SHAPES.map(x => [x, x + (x === dflt.shape ? ' · default' : '')]), c.shape, x => setC('shape', x === dflt.shape ? null : x)), T, id, 'chain', { sub: 'shape' }),
      field('Count', numIn('n', 1, 1, 24, String(chainOf(Object.assign({}, def, { chain: { cat: c.cat, spread: c.spread } })).n)), T, id, 'chain', { sub: 'n', hint: 'Shots, orbiting shots or arc jumps' }),
      field('Size ×', numIn('size', 0.1, 0.3, 3, '1'), T, id, 'chain', { sub: 'size', hint: 'Shot size, orbit, aura and blast radius' }),
      field('Damage ×', numIn('scale', 0.05, 0, 5, '1'), T, id, 'chain', { sub: 'scale', hint: `On top of the chain rules (Progression tab): ${Math.round(100 * CHAIN_RULES.rules.dmg)}% of what it hit for` }),
      h('div', { class: 'f wide note' }, `Absorbed into another item, ${v.name} rides on ${rideOn.join(', ')} of that item (${chainSentence(c, 'object', '', v.icon, false).toLowerCase()}), and everywhere else pops where that item hits (${chainSentence(c, 'impact', '', v.icon, false).replace(/^Where it strikes, it /, '')}). Try it on the test canvas: pick the item that absorbs it, a tier, and ${v.name} as a partner.`)));
}
// a passive item's stat boosts, per item level (×level, ×the fusion tier's statMul)
function passiveFields(id) {
  const T = 'items', cur = get(T, id).passive || {};
  const setStat = (k, x) => { const n = Object.assign({}, get(T, id).passive); if (!x) delete n[k]; else n[k] = x; set(T, id, 'passive', n); };
  return h('div', { class: 'fields' }, field('Passive stats per level', h('div', { class: 'fields' }, STAT_KEYS.map(k => h('div', { class: 'f' + (cur[k] ? ' changed' : '') }, h('label', {}, STAT_INFO[k].name),
    h('input', { type: 'number', step: 'any', value: cur[k] ?? '', placeholder: '0', oninput: e => { const x = parseFloat(e.target.value); setStat(k, isFinite(x) ? x : 0); } }),
    h('div', { class: 'hint' }, STAT_INFO[k].pct ? '0.04 = ' + (STAT_INFO[k].neg ? '−' : '+') + '4%' : 'flat')))), T, id, 'passive',
    { wide: true, hint: `Passive: no attack. Now ${statText(cur) || 'nothing'} per level, so ${statText(cur, 5) || 'nothing'} at level 5. It can only absorb other passives; an attacking item that absorbs it gets 50% of these.` }));
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

// A hero's archetype (arch in CHARACTERS): name, effect potency per effect, damage per slot, and effect-pair combos.
function archFields(T, id) {
  const a = get(T, id).arch || {};
  const put = fn => { const n = clone(get(T, id).arch || {}); fn(n); for (const k of ['eff', 'slot', 'combo']) if (n[k] && !Object.keys(n[k]).length) delete n[k]; if (!n.name) delete n.name; set(T, id, 'arch', Object.keys(n).length ? n : null, { rerender: true }); };
  const setIn = (part, k, x) => put(n => { n[part] = Object.assign({}, n[part]); if (x) n[part][k] = x; else delete n[part][k]; });
  const numIn = (part, k) => h('input', { type: 'number', step: 'any', value: (a[part] || {})[k] ?? '', placeholder: '0', onchange: e => { const x = parseFloat(e.target.value); setIn(part, k, isFinite(x) ? x : 0); } });
  const effOpts = EFFECT_KEYS.map(k => [k, EFFECTS[k].icon + ' ' + EFFECTS[k].name]);
  const combos = Object.entries(a.combo || {});
  const swap = (old, p, q, x) => put(n => { const c = Object.assign({}, n.combo); delete c[old]; if (p !== q) c[p + '+' + q] = x; n.combo = c; });
  const fresh = () => { for (const p of EFFECT_KEYS) for (const q of EFFECT_KEYS) if (p !== q && !(p + '+' + q in (a.combo || {})) && !(q + '+' + p in (a.combo || {}))) return p + '+' + q; return null; };
  return h('div', { class: 'fields' },
    field('Archetype name', h('input', { value: a.name || '', placeholder: 'e.g. Pyromancer', onchange: e => put(n => { n.name = e.target.value.trim(); }) }), T, id, 'arch', { hint: 'Shown on the hero card, level-up cards and stats panel' }),
    h('div', { class: 'f wide note' }, 'Potency 0.3 = every stack of that effect works 30% harder on every hit. Slot 0.15 = +15% damage for items in that slot. Combo 0.2 = +20% damage on hits that carry both effects. Level-up offers lean a little toward items with these effects or slots.'),
    h('div', { class: 'f wide' }, h('label', {}, 'Effect potency'), h('div', { class: 'fields' }, EFFECT_KEYS.map(k => h('div', { class: 'f' }, h('label', {}, EFFECTS[k].icon + ' ' + EFFECTS[k].name), numIn('eff', k))))),
    h('div', { class: 'f wide' }, h('label', {}, 'Slot damage'), h('div', { class: 'fields' }, SLOT_KEYS.map(k => h('div', { class: 'f' }, h('label', {}, SLOTS[k].icon + ' ' + SLOTS[k].name), numIn('slot', k))))),
    h('div', { class: 'f wide' }, h('label', {}, 'Effect combos'),
      ...combos.map(([k, x]) => { const [p, q] = k.split('+');
        return h('div', { style: 'display:flex;gap:6px;align-items:center;margin-bottom:4px' }, sel(effOpts, p, v => swap(k, v, q, x)), h('span', {}, '+'), sel(effOpts, q, v => swap(k, p, v, x)),
          h('input', { type: 'number', step: 'any', value: x, style: 'width:80px', onchange: e => { const y = parseFloat(e.target.value); setIn('combo', k, isFinite(y) ? y : 0); } }),
          h('button', { class: 'small', onclick: () => setIn('combo', k, 0) }, '✕')); }),
      h('button', { class: 'small', onclick: () => { const k = fresh(); if (k) setIn('combo', k, 0.2); } }, '+ Add combo')));
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
    h('h3', {}, 'Archetype'),
    archFields(T, id),
    h('h3', {}, 'Unlock'),
    h('div', { class: 'fields' }, lockFields(T, id, { buyable: true }),
      charCats(CHARACTERS.find(c => c.id === id)).length ? h('div', { class: 'f wide note' }, `Also needs the ${charCats(CHARACTERS.find(c => c.id === id)).map(k => EFFECTS[k].name).join(' and ')} category of ${w.name} (added automatically, players see it on the hero card): ${charCats(CHARACTERS.find(c => c.id === id)).map(k => lockLabel(catLock(k))).join('; ')}.`) : null),
    h('h3', {}, 'Preview'),
    h('div', { class: 'preview', style: `--c:${v.color}` }, h('div', { class: 'avatar' }, '◆'), h('b', {}, v.name), h('small', {}, v.title), h('div', {}, `${w.icon} ${w.name}`), h('div', { class: 'perk' }, v.perk), ...archLines(v).map(x => h('small', {}, x)), charLock(CHARACTERS.find(c => c.id === id)) ? h('small', { style: 'color:#ff9e4c' }, lockFull(charLock(CHARACTERS.find(c => c.id === id)))) : null));
  return h('div', { class: 'editor', style: 'grid-template-columns: 220px minmax(300px, 760px)' }, list, form);
}

function tableView(title, note, t, ids, cols) {
  const cell = (id, c) => {
    const v = get(t, id)[c.f];
    if (v === undefined && !c.always) return h('td', {}, '');
    let input;
    if (c.kind === 'color') input = colorIn(v, x => { set(t, id, c.f, x); td.classList.toggle('changed', changed(t, id, c.f)); });
    else if (c.kind === 'select') input = sel(c.options, v, x => { set(t, id, c.f, x); td.classList.toggle('changed', changed(t, id, c.f)); });
    else if (c.kind === 'effects') input = h('input', { type: 'text', placeholder: 'e.g. burn, shock', value: (v || []).join(', '), title: 'Effect keys: ' + EFFECT_KEYS.join(', '), onchange: e => { const l = [...new Set(e.target.value.split(/[\s,]+/).map(x => x.trim().toLowerCase()).filter(x => x in EFFECTS))]; set(t, id, c.f, l.length ? l : null); e.target.value = l.join(', '); td.classList.toggle('changed', changed(t, id, c.f)); } });
    else if (c.kind === 'text') input = h('input', { type: 'text', value: v ?? '', oninput: e => { set(t, id, c.f, e.target.value); td.classList.toggle('changed', changed(t, id, c.f)); } });
    else input = h('input', { type: 'number', step: c.step || 'any', min: 0, value: c.pct ? +(v * 100).toPrecision(4) : v, oninput: e => { const x = parseFloat(e.target.value); if (isFinite(x) && x >= 0) { set(t, id, c.f, c.pct ? x / 100 : x); td.classList.toggle('changed', changed(t, id, c.f)); } } });
    const td = h('td', { class: changed(t, id, c.f) ? 'changed' : '' }, input);
    return td;
  };
  return h('div', { class: 'card' }, title ? h('h2', {}, title) : null, note ? h('p', { class: 'note', style: 'margin-top:-6px' }, note) : null,
    h('div', { class: 'tablewrap' }, h('table', {}, h('tr', {}, h('th', {}, ''), cols.map(c => h('th', {}, c.label)), h('th', {}, '')),
      ids.map(id => h('tr', {}, h('td', {}, h('code', {}, id)), cols.map(c => cell(id, c)), h('td', {}, entryChanged(t, id) ? h('button', { class: 'small', onclick: () => resetEntry(t, id) }, 'reset') : null))))));
}
function enemyView() {
  const shapes = ['circle', 'tri', 'diamond', 'square', 'hex', 'star', 'oct', 'star4', 'arrow'].map(s => [s, s]);
  const cols = [{ f: 'name', label: 'Name', kind: 'text' }, { f: 'hp', label: 'HP' }, { f: 'spd', label: 'Speed' }, { f: 'r', label: 'Size' }, { f: 'dmg', label: 'Contact dmg' }, { f: 'xp', label: 'XP' }, { f: 'color', label: 'Color', kind: 'color' }];
  return h('div', { style: 'display:grid;gap:16px' }, difficultyView(),
    tableView('Enemies', 'HP and damage are the values at 0:00; both grow with the run clock.', 'enemies', Object.keys(BASE.enemies), [...cols, { f: 'shape', label: 'Shape', kind: 'select', options: shapes }]),
    tableView('Bosses', 'Bosses arrive at 5:00, 10:00 and 15:00. Their HP does not scale.', 'bosses', Object.keys(BASE.bosses), cols),
    tableView('Damage types', `A hit's type is the effect of the item that fired it (never the shared pool). Weak to: it takes ×weak from those types; resists: ×resist; immune to all but: ×0 from every other type (zone enemies). Effect keys: ${EFFECT_KEYS.join(', ')}.`, 'enemies', Object.keys(BASE.enemies), [{ f: 'weak', label: 'Weak to', kind: 'effects', always: true }, { f: 'resist', label: 'Resists', kind: 'effects', always: true }, { f: 'only', label: 'Immune to all but', kind: 'effects', always: true }]),
    tableView('Boss damage types', '', 'bosses', Object.keys(BASE.bosses), [{ f: 'weak', label: 'Weak to', kind: 'effects', always: true }, { f: 'resist', label: 'Resists', kind: 'effects', always: true }, { f: 'only', label: 'Immune to all but', kind: 'effects', always: true }]),
    tableView('Damage type multipliers', '', 'dmgtypes', ['run'], [{ f: 'weak', label: 'Weak ×' }, { f: 'resist', label: 'Resist ×' }]),
    tableView('Enemy Codex prices', 'Study: gold for an enemy\'s stats. Master: gold for its weaknesses, once that many are defeated. A mastered enemy can be a Fusion Lab foe.', 'codex', Object.keys(BASE.codex), [{ f: 'study', label: 'Study ●', step: 5 }, { f: 'master', label: 'Master ●', step: 5 }, { f: 'kills', label: 'Kills needed', step: 1 }]));
}
function dropView() {
  return tableView('Pickups', 'Drop chance is per normal kill, before Luck. Elites and bosses also drop chests and piles of gold. A chest holds 1, 3 or 5 upgrades: the 3 and 5 chances rise with the player\'s Luck (3: chance × (1 + weight × Luck), 5: chance × (1 + 2 × weight × Luck)).', 'drops', Object.keys(BASE.drops), [
    { f: 'chance', label: 'Drop chance %', pct: true }, { f: 'min', label: 'Min', step: 1 }, { f: 'max', label: 'Max', step: 1 }, { f: 'value', label: 'Value' }, { f: 'elite', label: 'Per elite (least)', step: 1 }, { f: 'boss', label: 'Per boss (least)', step: 1 },
    { f: 'three', label: '3-item chest %', pct: true }, { f: 'five', label: '5-item chest %', pct: true }, { f: 'luck', label: 'Luck weight' }]);
}
function upgradeView() {
  return tableView('Forge upgrades', 'Rank n costs cost × 1.6ⁿ. "Per rank" is the bonus each rank adds (0.05 = 5%).', 'upgrades', Object.keys(BASE.upgrades), [
    { f: 'icon', label: 'Icon', kind: 'text' }, { f: 'name', label: 'Name', kind: 'text' }, { f: 'desc', label: 'Description', kind: 'text' }, { f: 'max', label: 'Ranks', step: 1 }, { f: 'cost', label: 'Base cost', step: 5 }, { f: 'per', label: 'Per rank' }]);
}

const DIFF_FIELDS = [['hpGrowth', 'Enemy HP growth', 'per minute'], ['hpCurve', 'Enemy HP curve', 'per minute²'], ['spawnBase', 'Spawns per second at 0:00', ''], ['spawnGrowth', 'Spawn growth', 'per minute'],
  ['spawnCurve', 'Spawn curve', 'per minute²'], ['dmgGrowth', 'Enemy damage growth', 'per minute, 0.1 = +10%'], ['eliteEvery', 'Elite every (s)', ''], ['eliteHp', 'Elite HP ×', ''],
  ['ringEvery', 'Encirclement every (s)', ''], ['bossHp', 'Boss HP ×', 'on top of the boss table'], ['xpStep', 'XP per level step', ''], ['xpCurve', 'XP curve exponent', ''],
  ['overtimeAt', 'Overtime starts at (min)', 'if the 15:00 boss is alive; 0 = off'], ['overtimeDmg', 'Overtime damage taken ×', 'per minute, compounding'], ['overtimeHp', 'Overtime enemy HP ×', 'per minute, compounding'],
  ['overtimeSpawn', 'Overtime extra spawns', 'per minute, 0.5 = +50%']];
function difficultyView() {
  const T = 'difficulty', id = 'run', D = get(T, id), at = m => ({ hp: 1 + m * D.hpGrowth + m * m * D.hpCurve, sp: D.spawnBase + m * D.spawnGrowth + m * m * D.spawnCurve, dmg: 1 + m * D.dmgGrowth });
  const xp = l => Math.floor(5 + (l - 1) * D.xpStep + Math.pow(l - 1, D.xpCurve));
  const row = m => { const x = at(m); return h('tr', {}, h('td', {}, `${m}:00`), h('td', {}, `×${x.hp.toFixed(1)}`), h('td', {}, x.sp.toFixed(1)), h('td', {}, `×${x.dmg.toFixed(2)}`)); };
  return h('div', { class: 'card' }, h('h2', {}, 'Difficulty', h('span', { class: 'spacer' }), entryChanged(T, id) ? h('button', { class: 'small', onclick: () => resetEntry(T, id) }, 'Reset difficulty') : null),
    h('p', { class: 'note', style: 'margin-top:-6px' }, 'How the run gets harder with the clock. The table updates when you leave a field. Changes reach the test canvas only for enemies it spawns; play a run to feel them.'),
    h('div', { class: 'fields', style: 'grid-template-columns: repeat(auto-fill, minmax(190px, 1fr))' }, DIFF_FIELDS.map(([f, label, hint]) =>
      field(label, h('input', { type: 'number', step: 'any', min: 0, value: D[f], onchange: e => { const v = parseFloat(e.target.value); if (isFinite(v) && v >= 0) set(T, id, f, v, { rerender: true }); } }), T, id, f, { hint }))),
    h('div', { class: 'tablewrap', style: 'margin-top:12px' }, h('table', {}, h('tr', {}, h('th', {}, 'Time'), h('th', {}, 'Enemy HP'), h('th', {}, 'Spawns/s'), h('th', {}, 'Enemy damage')), [0, 3, 5, 10, 15].map(row))),
    h('p', { class: 'note' }, `XP to reach level 2: ${xp(1)}, level 10: ${xp(9)}, level 20: ${xp(19)}, level 30: ${xp(29)}. Elites have ×${D.eliteHp} HP; bosses ×${D.bossHp} of the boss table.`),
    D.overtimeAt > 0 ? h('p', { class: 'note' }, `Overtime from ${D.overtimeAt}:00 while the 15:00 boss lives: after 1 minute damage taken ×${D.overtimeDmg}, enemy HP ×${D.overtimeHp}; after 5 minutes ×${+Math.pow(D.overtimeDmg, 5).toFixed(1)} and ×${+Math.pow(D.overtimeHp, 5).toFixed(1)}, with ${+(1 + 5 * D.overtimeSpawn).toFixed(1)}× spawns.`) : null);
}

// ---------- progression: categories, fusion locks and a progress simulator ----------
let sim = null; // a pretend player save, to see what a player at some point of progress gets
const simSave = () => (sim = sim || normalizeSave(null));
function progressView() { return h('div', { style: 'display:grid;gap:16px' }, stagesCard(), tiersCard(), chainCard(), categoryCard(), fusionCard(), simulatorCard()); }
// the fusion chain rules (CHAIN_RULES in chain.js) and every item's chain form at a glance
function chainCard() {
  const T = 'chain', id = 'rules', R = get(T, id);
  const f = (k, label, hint, step) => field(label, h('input', { type: 'number', step, min: 0, value: R[k], onchange: e => { const x = parseFloat(e.target.value); if (C.valid(T, k, x)) set(T, id, k, x, { rerender: true }); else toast('Out of range', true); } }), T, id, k, { hint });
  const rows = ITEMS.filter(d => !d.passive && !get('items', d.id).disabled).map(d => { const c = chainOf(Object.assign({}, d, { chain: get('items', d.id).chain })); return [d, c]; });
  const hosts = Object.keys(CHAIN_HOSTS), catsOf = k => CHAIN_CAT_KEYS.filter(c => CHAIN_CATS[c].host === k).map(c => CHAIN_CATS[c].icon + ' ' + CHAIN_CATS[c].name).join(', ');
  return h('div', { class: 'card' }, h('h2', {}, 'Fusion chains', h('span', { class: 'spacer' }), entryChanged(T, id) ? h('button', { class: 'small', onclick: () => resetEntry(T, id) }, 'Reset') : null),
    h('p', { class: 'note', style: 'margin-top:-6px' }, 'Every attacking item has an animation category. Every attacking item a fusion absorbs plays its own attack, in a small form, off the item that remains, depending on the two categories: it RIDES on the main body of the item that remains (each bullet, each orbiting shot, its aura, each object it places, its patches) as a visible part that acts on its own, or it POPS where that item hits. The table below is the whole rule; there are no rules for pairs of items, so new items chain automatically. What a link makes triggers the links of the item it came from, so Super and Mega fusions nest. Each item\'s category is under “Fusion chain” on its own page; try any combination on the test canvas.'),
    h('div', { class: 'tablewrap', style: 'margin:8px 0' }, h('table', {}, h('tr', {}, h('th', {}, 'Item that remains ↓ / absorbed →'), CHAIN_CAT_KEYS.map(k => h('th', {}, CHAIN_CATS[k].icon + ' ' + CHAIN_CATS[k].name))),
      hosts.map(k => h('tr', {}, h('td', {}, `${catsOf(k)}: ${CHAIN_HOSTS[k].name}`), CHAIN_CAT_KEYS.map(c => h('td', { style: chainPair(k, c) === 'ride' ? 'color:#8f8' : 'opacity:.6' }, chainPair(k, c))))))),
    h('div', { class: 'fields' },
      f('dmg', 'Damage share', 'Of what the absorbed item hit for. 0.5 = 50%', 0.05),
      f('rate', 'Plays per second (each link)', 'Rate limit for pops and for what riders do (volleys, arcs, pulses, patches), so fast weapons and many hosts stay readable', 0.5),
      f('depth', 'Nesting depth', '1 = only the items fused straight in. 3 = a Mega\'s grandchildren still play', 1),
      f('kids', 'Damage × per nesting step', '1 = every step deals its own 50%', 0.05),
      f('ride', 'Damage × when riding a body', 'For links riding an aura, a placed object or a patch: they take the place of popping on every hit, so they hit harder', 0.05)),
    h('div', { class: 'tablewrap', style: 'max-height:300px;overflow-y:auto;margin-top:8px' }, h('table', {}, h('tr', {}, h('th', {}, 'Item'), h('th', {}, 'Category'), h('th', {}, 'Shape'), h('th', {}, 'Count')),
      rows.map(([d, c]) => h('tr', {}, h('td', {}, h('button', { class: 'link', onclick: () => { tab = d.slot; pickId[tab] = d.id; render(); window.scrollTo(0, 0); } }, `${get('items', d.id).icon} ${get('items', d.id).name}`)),
        h('td', { class: changed('items', d.id, 'chain') ? 'changed' : '' }, CHAIN_CATS[c.cat].icon + ' ' + CHAIN_CATS[c.cat].name + (c.cat === 'projectile' ? ` (${c.spread})` : c.cat === 'deployable' ? ` (${CHAIN_ACTS[c.act]})` : '')), h('td', {}, c.shape), h('td', {}, String(c.n)))))));
}
function stagesCard() {
  const cols = [{ f: 'name', label: 'Name', kind: 'text' }, { f: 'color', label: 'Color', kind: 'color' }, { f: 'hp', label: 'Enemy HP ×' }, { f: 'ramp', label: 'HP ramp by 15:00' }, { f: 'spawn', label: 'Spawns ×' }, { f: 'dmg', label: 'Enemy dmg ×' },
    { f: 'bossHp', label: 'Boss HP ×' }, { f: 'xp', label: 'XP ×' }, { f: 'gold', label: 'Gold ×' }, { f: 'start', label: 'Items arrive at Lv', step: 1 }];
  const t = tableView('Levels', 'Level 1 is open; each level opens when the one before it is beaten. On top of the run difficulty (Enemies tab): enemy HP × "HP", growing (with the cube of the clock) to × HP·(1 + ramp) at 15:00. Each level opened also lets the player buy one more Forge socket. "Items arrive at" is the level new items and new fusions start at, which is what lets later levels fit bigger fusions into 15 minutes.', 'stages', Object.keys(BASE.stages), cols);
  const end = x => { const v = get('stages', x); return +(v.hp * (1 + v.ramp)).toFixed(1); };
  t.append(h('p', { class: 'note' }, 'Enemy HP at 15:00 vs Level 1: ' + Object.keys(BASE.stages).map(x => `L${x} ×${end(x)}`).join(' · ')));
  return t;
}
function tiersCard() {
  const T = 'tiers', keys = TIER_KEYS.filter(k => k !== 'base');
  const made = k => TIER_KEYS.slice(1, TIER_KEYS.indexOf(k) + 1).reduce((n, x) => n * get(T, x).need, 1);
  return h('div', { class: 'card' }, h('h2', {}, 'Fusion tiers'),
    h('p', { class: 'note', style: 'margin-top:-6px' }, '“Needs” level 5 items of the tier below that all share an effect become one. The one the player keeps takes 50% of the others’ base damage and passive stats and carries all their effects. Damage ×, cooldown ×, own stacks (of each carried effect, on its own bullets), pool (its own effect per level, for every bullet) and stats × apply to the new tier.'),
    tableView('', '', T, keys, [{ f: 'name', label: 'Name', kind: 'text' }, { f: 'need', label: 'Needs', step: 1 }, { f: 'mul', label: 'Damage ×' }, { f: 'cdMul', label: 'Cooldown ×' }, { f: 'own', label: 'Own stacks', step: 1 }, { f: 'pool', label: 'Pool / level' }, { f: 'statMul', label: 'Stats ×' }, { f: 'hist', label: 'History needed', step: 1 }]),
    h('p', { class: 'note' }, 'History needed (Super and above, kept across runs): every item in the fusion must already have fused into the tier below with that many different partner sets. Default: Super needs an item to have fused with 3 different items, Mega needs it to have made 5 different Super fusions. 0 turns it off. Ignored for Fused. Players see it on each item’s Codex page.'),
    h('p', { class: 'note' }, keys.map(k => `${get(T, k).name} = ${made(k)} base items`).join(' · ') + '. An item fused into something else can be offered again later in the run, so the limits are sockets and level-ups. ' +
      (() => { const S = get('stages', String(STAGES.length)), up = 5 - S.start; const cost = t => t === 0 ? 1 + up : get(T, TIER_KEYS[t]).need * cost(t - 1) + 1 + up;
        return `On Level ${STAGES.length} (items arrive at level ${S.start}) one Mega costs about ${cost(TIER_KEYS.length - 1)} level-up picks.`; })()),
    h('div', { class: 'catgrid' }, keys.filter(k => k !== 'fused').map(k => h('div', { class: 'catcard', style: `--c:${TIER_COLORS[TIER_KEYS.indexOf(k)]}` }, h('b', {}, `✦ ${get(T, k).name} fusion unlock`),
      h('div', { class: 'fields', style: 'grid-template-columns:minmax(0,1fr)' }, lockFields(T, k))))));
}
function categoryCard() {
  const T = 'cats', start = startingCats();
  return h('div', { class: 'card' }, h('h2', {}, 'Item categories'),
    h('p', { class: 'note', style: 'margin-top:-6px' }, `A run only offers items whose categories are all unlocked (a two-effect item needs both). Open from the start: ${start.map(k => EFFECTS[k].icon + ' ' + EFFECTS[k].name).join(', ') || 'none'}. A hero's starting weapon is always available to that hero. Unlocks are checked when a run ends.`),
    h('div', { class: 'catgrid' }, EFFECT_KEYS.map(k => {
      const items = ITEMS.filter(d => effectsOfId(d.id).includes(k) && !get('items', d.id).disabled);
      return h('div', { class: 'catcard', style: `--c:${EFFECTS[k].color}` },
        h('div', { class: 'inline' }, h('b', {}, `${EFFECTS[k].icon} ${EFFECTS[k].name}`), h('span', { class: 'spacer' }), entryChanged(T, k) ? h('button', { class: 'small', onclick: () => resetEntry(T, k) }, 'reset') : null),
        h('small', { class: 'hint' }, `${items.length} items, ${items.filter(d => effectsOfId(d.id).length > 1).length} of them two-effect`),
        h('div', { class: 'fields', style: 'grid-template-columns:minmax(0,1fr)' }, lockFields(T, k)));
    })));
}
function fusionCard() {
  const all = lock => { for (const d of ITEMS) set('items', d.id, 'fuseLock', lock); render(); toast('Fusion locks updated for every item.'); };
  return h('div', { class: 'card' }, h('h2', {}, 'Fusion locks (mastery achievements)'),
    h('p', { class: 'note', style: 'margin-top:-6px' }, 'Fusing an item unlocks once a player has reached the level below with it in that many runs (counted when the run ends). Only a mastered item can remain in a base fusion; it can absorb items that are not mastered yet. 0 runs means it is always mastered. Players see each one as “<item> mastery” on the Achievements screen. Super and Mega fusion have their own locks in the Fusion tiers card.'),
    h('div', { class: 'controls' }, h('span', { class: 'lbl' }, 'Set every item:'), h('button', { class: 'small', onclick: () => all(null) }, `Default (level ${FUSE_LOCK.level}, ${FUSE_LOCK.runs} run)`),
      h('button', { class: 'small', onclick: () => all({ level: 5, runs: 2 }) }, 'Level 5 in 2 runs'), h('button', { class: 'small', onclick: () => all({ level: 5, runs: 3 }) }, 'Level 5 in 3 runs'), h('button', { class: 'small', onclick: () => all({ level: 5, runs: 0 }) }, 'No lock')),
    h('div', { class: 'tablewrap', style: 'max-height:420px;overflow-y:auto;margin-top:8px' }, h('table', {}, h('tr', {}, h('th', {}, 'Item'), h('th', {}, 'Slot'), h('th', {}, 'Effects'), h('th', {}, 'Fusion unlocks at'), h('th', {}, 'Fuses with')),
      ITEMS.map(d => { const v = get('items', d.id);
        return h('tr', {}, h('td', {}, h('button', { class: 'link', onclick: () => { tab = d.slot; pickId[tab] = d.id; render(); window.scrollTo(0, 0); } }, `${v.icon} ${v.name}`)), h('td', {}, SLOTS[d.slot].name),
          h('td', {}, effectsOf(v).map(k => EFFECTS[k].icon + ' ' + EFFECTS[k].name).join(' + ')),
          h('td', { class: changed('items', d.id, 'fuseLock') ? 'changed' : '' }, h('div', { class: 'inline' }, h('span', {}, 'Level'), fuseLockInput(d.id, 'level'), h('span', {}, 'in'), fuseLockInput(d.id, 'runs'), h('span', {}, 'runs'))),
          h('td', {}, h('small', {}, `${partnersOf(d.id).length} items`)));
      }))));
}
// Fills a pretend save's fusion history for one item (id) or every item (null): `a` different Fused partners and `b` different
// Super partner sets, all made of real items that share an effect with it. Capped by how many such partners exist.
function fakeHistory(s, id, a, b) {
  const log = Object.assign({}, s.fuseLog || {});
  for (const d of id ? [ITEM[id]] : ITEMS) {
    const p = partnersOf(d.id).map(x => x.id), e = {};
    if (a > 0) e.fused = p.slice(0, a);
    const sup = []; for (let i = 0; i < p.length && sup.length < b; i++) for (let j = i + 1; j < p.length && sup.length < b; j++) sup.push([p[i], p[j]].sort().join('+'));
    if (sup.length) e.super = sup;
    if (Object.keys(e).length) log[d.id] = e; else delete log[d.id];
  }
  return log;
}
function simulatorCard() {
  const s = simSave(), redo = () => render();
  const setSim = (x, msg) => { sim = normalizeSave(x); redo(); if (msg) toast(msg); };
  async function loadMine() {
    try { const snap = await fb.F.getDoc(fb.F.doc(fb.db, 'users', user.uid)); if (snap.exists() && snap.data().save) return setSim(snap.data().save, 'Loaded your cloud save (a copy: nothing is written back).'); }
    catch (e) { console.warn(e); }
    try { const raw = localStorage.getItem('voidlight.save.v1'); if (raw) return setSim(JSON.parse(raw), 'Loaded the save in this browser (a copy).'); } catch (e) { /* ignore */ }
    toast('No save found for this account or browser.', true);
  }
  function everything() {
    const x = normalizeSave(null); x.gold = 99999; x.unlockedCats = EFFECT_KEYS.slice(); x.unlockedItems = ITEMS.filter(d => d.lock).map(d => d.id); x.unlockedChars = CHARACTERS.map(c => c.id);
    for (const d of ITEMS) x.itemRuns[d.id] = [9, 9, 9, 9, 9];
    x.fuseLog = fakeHistory(x, null, 99, 99);
    for (const S of STAGES) x.stages[String(S.id)] = { kills: 9999, best: 900, wins: 1, bosses: 3, runs: 1 };
    for (const c of CHARACTERS) { x.charStages[c.id] = {}; for (const S of STAGES) x.charStages[c.id][String(S.id)] = { kills: 999, best: 900, wins: 1, bosses: 3, runs: 1 }; }
    for (const u of UPGRADES) x.upg[u.id] = u.max; x.lastStage = stageCount(); setSim(x, 'Everything unlocked, every level beaten, the Forge maxed.');
  }
  function play() {
    try { localStorage.setItem('voidlight.testsave', JSON.stringify(s)); localStorage.setItem('voidlight.testcontent', JSON.stringify(ov)); }
    catch (e) { return toast('This browser blocks storage, so the test game cannot start.', true); }
    window.open('index.html?testsave', '_blank');
  }
  function fromGame() { try { const raw = localStorage.getItem('voidlight.testsave'); if (raw) return setSim(JSON.parse(raw), 'Loaded the progress from the test game.'); } catch (e) { /* ignore */ } toast('No test game progress yet.', true); }
  const pending = applyUnlocks(normalizeSave(clone(s)));
  const avail = ITEMS.filter(d => !get('items', d.id).disabled && itemUnlocked(s, d)), fusable = avail.filter(d => fuseUnlocked(s, d));
  const ach = achievementList(s);
  const masteryRow = d => {
    const r = s.itemRuns[d.id] || [0, 0, 0, 0, 0], best = r.reduce((b, v, k) => (v > 0 ? k + 1 : b), 0), runs = best ? r[best - 1] : 0;
    const write = (b, n) => { s.itemRuns[d.id] = [1, 2, 3, 4, 5].map(L => (L <= b ? n : 0)); if (!b || !n) delete s.itemRuns[d.id]; redo(); };
    return h('div', { class: 'simrow' + (itemUnlocked(s, d) ? '' : ' off') }, h('span', { class: 'nm' }, `${get('items', d.id).icon} ${get('items', d.id).name}`),
      sel([0, 1, 2, 3, 4, 5].map(L => [String(L), L ? 'Lv ' + L : '—']), String(best), x => write(+x, Math.max(1, runs))),
      h('input', { type: 'number', min: 0, style: 'width:56px', value: runs, title: 'Runs that reached that level', onchange: e => write(best || 5, Math.max(0, parseInt(e.target.value, 10) || 0)) }),
      h('span', { class: 'tag', title: fuseLockText(d) }, fuseUnlocked(s, d) ? '✦' : ''));
  };
  // fusion history: different Fused partners and different Super fusions, the counts Super and Mega fusion ask for
  const histRow = d => {
    const e = s.fuseLog[d.id] || {}, a = (e.fused || []).length, b = (e.super || []).length, max = partnersOf(d.id).length;
    const write = (x, y) => { s.fuseLog = fakeHistory(s, d.id, x, y); redo(); };
    const okS = histMet(s, d.id, 2), okM = histMet(s, d.id, 3);
    return h('div', { class: 'simrow' }, h('span', { class: 'nm', title: (e.fused || []).map(x => (ITEM[x] || {}).name).join(', ') }, `${get('items', d.id).icon} ${get('items', d.id).name}`),
      h('input', { type: 'number', min: 0, max, style: 'width:56px', value: a, title: `Different items it has fused with (of ${max} it can fuse with)`, onchange: e2 => write(Math.max(0, parseInt(e2.target.value, 10) || 0), b) }),
      h('input', { type: 'number', min: 0, style: 'width:56px', value: b, title: 'Different Super fusions it was part of', onchange: e2 => write(a, Math.max(0, parseInt(e2.target.value, 10) || 0)) }),
      h('span', { class: 'tag', title: 'S = can Super fuse, M = can Mega fuse (fusion history only)' }, (okS ? 'S' : '') + (okM ? 'M' : '')));
  };
  // a hero: the highest level beaten while playing them (sets wins in every level up to it), owned or not, and where their unlock stands
  const heroRow = c => {
    const m = s.charStages[c.id] || {}, beat = STAGES.reduce((b, S) => ((m[String(S.id)] || {}).wins > 0 ? S.id : b), 0);
    const write = N => { const x = s.charStages[c.id] = Object.assign({}, m); for (const S of STAGES) { const k = String(S.id), st = Object.assign(emptyStage(), x[k]); st.wins = S.id <= N ? Math.max(1, st.wins) : 0; st.runs = Math.max(st.runs, st.wins); x[k] = st; } redo(); };
    const own = charUnlocked(s, c), L = charLock(c), ok = charPlayable(s, c);
    const state = ok ? '✓' : own ? 'needs category' : L && lockMet(L, s) ? (lockCost(L) ? '● ' + lockCost(L) : 'earned') : lockParts(L).filter(p => lockMet(p, s)).length + '/' + lockParts(L).length;
    return h('div', { class: 'simrow' + (ok ? '' : ' off'), title: L ? lockFull(L) : 'Starting hero' }, h('span', { class: 'nm' }, '◆ ' + get('chars', c.id).name),
      sel([['0', '—'], ...STAGES.map(S => [String(S.id), 'Beat L' + S.id])], String(beat), x => write(+x)),
      h('label', { class: 'check', title: c.lock ? 'Owned (earned and bought)' : 'Starting hero' }, h('input', { type: 'checkbox', checked: own, disabled: !c.lock, onchange: e => { s.unlockedChars = s.unlockedChars.filter(x => x !== c.id); if (e.target.checked) s.unlockedChars.push(c.id); redo(); } }), 'owned'),
      h('span', { class: 'note', style: 'min-width:70px;text-align:right' }, state));
  };
  return h('div', { class: 'card' }, h('h2', {}, 'Test a player’s progress'),
    h('p', { class: 'note', style: 'margin-top:-6px' }, 'A pretend save, separate from every real one. Set where a player is, see what they get, then play the real game with it in a new tab (with your unpublished edits). Progress in that tab stays in the test save.'),
    h('div', { class: 'controls' }, h('button', { class: 'small', onclick: () => setSim(null, 'Fresh save.') }, 'Fresh save'), h('button', { class: 'small', onclick: loadMine }, 'Copy my save'),
      h('button', { class: 'small', onclick: everything }, 'Everything unlocked'), h('button', { class: 'small', onclick: () => { const f = applyUnlocks(s); redo(); toast(f.length ? 'Granted: ' + f.join(', ') : 'Nothing new to grant.'); } }, 'Grant earned achievements'),
      h('button', { class: 'small', onclick: fromGame }, 'Load from test game'), h('span', { class: 'spacer' }), h('button', { class: 'primary', onclick: play }, '▶ Play with this save')),
    h('div', { class: 'simgrid' },
      h('div', {},
        h('h3', {}, 'Lifetime stats'), h('div', { class: 'fields' }, Object.keys(C.STATS).map(k => h('div', { class: 'f' }, h('label', {}, C.STATS[k]), h('input', { type: 'number', min: 0, value: s.stats[k] || 0, onchange: e => { s.stats[k] = Math.max(0, parseFloat(e.target.value) || 0); redo(); } })))),
        h('div', { class: 'f', style: 'margin-top:10px' }, h('label', {}, 'Gold'), h('input', { type: 'number', min: 0, value: s.gold, onchange: e => { s.gold = Math.max(0, parseFloat(e.target.value) || 0); redo(); } })),
        h('h3', {}, 'Levels'), h('div', { class: 'tablewrap' }, h('table', {}, h('tr', {}, h('th', {}, 'Level'), ...Object.values(STAGE_STATS).map(x => h('th', {}, x))),
          STAGES.map(S => { const key = String(S.id), st = stageStats(s, S.id);
            return h('tr', { style: stageUnlocked(s, S.id) ? '' : 'opacity:0.5' }, h('td', {}, `${S.id} ${get('stages', key).name}`), ...Object.keys(STAGE_STATS).map(k => h('td', {}, h('input', { type: 'number', min: 0, style: 'width:72px', value: st[k],
              onchange: e => { s.stages[key] = Object.assign(emptyStage(), s.stages[key], { [k]: Math.max(0, parseInt(e.target.value, 10) || 0) }); redo(); } })))); }))),
        h('div', { class: 'f', style: 'margin-top:10px' }, h('label', {}, 'Level the test game starts on'), sel(STAGES.filter(S => stageUnlocked(s, S.id)).map(S => [String(S.id), `Level ${S.id}`]), String(stageUnlocked(s, s.lastStage) ? s.lastStage : 1), x => { s.lastStage = +x; redo(); })),
        h('p', { class: 'note' }, `${stagesUnlocked(s)} of ${stageCount()} levels open. Forge sockets: ${socketsBought(s)} bought of ${socketCap(s)} available. Fusion tiers open: ${TIER_KEYS.filter(k => tierUnlocked(s, k)).map(k => get('tiers', k).name).join(', ')}.`),
        h('h3', {}, 'Categories unlocked'), h('div', { class: 'checks' }, EFFECT_KEYS.map(k => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: catUnlocked(s, k), disabled: !catLock(k), onchange: e => { s.unlockedCats = s.unlockedCats.filter(x => x !== k); if (e.target.checked) s.unlockedCats.push(k); redo(); } }), `${EFFECTS[k].icon} ${EFFECTS[k].name}${catLock(k) ? '' : ' (start)'}`))),
        h('h3', {}, 'What this player gets'),
        h('p', { class: 'note' }, `${avail.length} of ${ITEMS.filter(d => !get('items', d.id).disabled).length} items can show up in runs (${SLOT_KEYS.map(k => `${SLOTS[k].icon} ${avail.filter(d => d.slot === k).length}`).join(' · ')}). ${fusable.length} of them can fuse. ${ach.filter(a => a.done).length}/${ach.length} achievements done.`),
        h('p', { class: 'note' }, pending.length ? `Earned but not granted yet (granted when their next run ends): ${pending.join(', ')}.` : 'Nothing earned and waiting.'),
        (() => { const b = [...ITEMS.filter(d => !get('items', d.id).disabled && itemBuyable(s, d)).map(d => `${d.icon} ${d.name} ● ${lockCost(d.lock)}`), ...CHARACTERS.filter(c => charBuyable(s, c)).map(c => `🧍 ${c.name} ● ${lockCost(c.lock)}`)];
          return h('p', { class: 'note' }, b.length ? `Earned, waiting to be bought: ${b.join(', ')}.` : 'Nothing earned and waiting to be bought.'); })(),
        h('div', { class: 'chipbox' }, avail.map(d => h('span', { class: 'chip', title: effectsOf(d).map(k => EFFECTS[k].name).join(' + ') + (fuseUnlocked(s, d) ? ' · can fuse' : ' · fusion locked') }, `${get('items', d.id).icon} ${get('items', d.id).name}${fuseUnlocked(s, d) ? ' ✦' : ''}`)))),
      h('div', {}, h('h3', {}, 'Heroes: highest level beaten with each one'), h('p', { class: 'note' }, 'Hero unlocks ask for a level beaten with another hero plus a weapon mastery (set below). Hover a hero for its unlock. Right column: ✓ playable, ● earned and waiting to be bought, n/m parts done.'),
        h('div', { class: 'simlist', style: 'max-height:none;margin-bottom:12px' }, CHARACTERS.map(heroRow)),
        h('h3', {}, 'Best level reached per item, and in how many runs'), h('div', { class: 'simlist' }, ITEMS.map(masteryRow)),
        h('p', { class: 'note' }, 'Greyed items are not available with these unlocks. ✦ = fusion unlocked.'),
        h('h3', {}, 'Fusion history per item'),
        h('p', { class: 'note' }, `First box: different items it has fused with (${get('tiers', 'super').name} needs ${get('tiers', 'super').hist | 0}). Second: different ${get('tiers', 'super').name} fusions it was part of (${get('tiers', 'mega').name} needs ${get('tiers', 'mega').hist | 0}). Filled with real partners that share an effect. S / M = history done for Super / Mega. Every item in a fusion needs it.`),
        h('div', { class: 'controls' }, h('button', { class: 'small', onclick: () => { s.fuseLog = fakeHistory(s, null, 99, 99); redo(); toast('Every item has full fusion history.'); } }, 'Fill all'),
          h('button', { class: 'small', onclick: () => { s.fuseLog = fakeHistory(s, null, get('tiers', 'super').hist | 0, 0); redo(); toast('Every item can Super fuse (history), none can Mega fuse.'); } }, 'Super only'),
          h('button', { class: 'small', onclick: () => { s.fuseLog = {}; redo(); toast('Fusion history cleared.'); } }, 'Clear')),
        h('div', { class: 'simlist' }, ITEMS.filter(d => !get('items', d.id).disabled).map(histRow)))));
}

// ---------- game options: the speeds the pause menu offers ----------
function optionsView() {
  const T = 'options', cur = (get(T, 'speed').choices || []).slice();
  const parse = txt => String(txt).split(/[\s,x×]+/i).filter(Boolean).map(Number).sort((a, b) => a - b);
  const input = h('input', { type: 'text', value: cur.join(', '), onchange: e => {
    const v = parse(e.target.value);
    if (C.valid(T, 'choices', v)) set(T, 'speed', 'choices', v, { rerender: true }); else toast('Use 1 to 8 different speeds from 0.25 to 10, separated by commas, e.g. 1, 1.5, 2, 3', true);
  } });
  return h('div', { class: 'card', style: 'max-width:760px' }, h('h2', {}, 'Game options', h('span', { class: 'spacer' }), entryChanged(T, 'speed') ? h('button', { class: 'small', onclick: () => resetEntry(T, 'speed') }, 'Reset') : null),
    h('div', { class: 'fields' }, field('Game speeds (pause menu)', input, T, 'speed', 'choices', { wide: true, hint: 'Comma separated, 0.25 to 10, up to 8. The pause menu button cycles through them in order; 1 = normal speed. A player whose saved speed is no longer listed goes back to 1x.' })),
    h('p', { class: 'note' }, 'Players get: ', ...cur.map(x => h('span', { class: 'chip', style: 'margin-right:4px' }, x + 'x'))),
    h('p', { class: 'note' }, 'To try it before publishing: Progression tab → "Play with this save" opens the real game with your unpublished edits; pause a run there and tap Game speed.'));
}

function overview() {
  const all = ITEMS.map(d => get('items', d.id)), chars = CHARACTERS.map(c => ({ id: c.id, ...get('chars', c.id) }));
  const stat = (n, label, sub) => h('div', { class: 'card stat' }, h('b', {}, n), label, sub ? h('small', { style: 'display:block' }, sub) : null);
  const go = (t, id) => { if (t === 'items') { tab = ITEM[id].slot; pickId[tab] = id; } else if (t === 'chars') { tab = 'chars'; pickId.chars = id; } else tab = { bosses: 'enemies', difficulty: 'enemies', cats: 'progress', stages: 'progress', tiers: 'progress' }[t] || t; render(); window.scrollTo(0, 0); };
  const unlockRows = [...TIER_KEYS.map(k => ['tiers', k, get('tiers', k)]), ...EFFECT_KEYS.map(k => ['cats', k, get('cats', k)]), ...ITEMS.map(d => ['items', d.id, get('items', d.id)]), ...CHARACTERS.map(c => ['chars', c.id, { lock: charLock(c) }])].filter(r => r[2].lock)
    .sort((a, b) => lockStage(a[2].lock) - lockStage(b[2].lock));
  const reqCode = p => (p.char ? `${p.char} L${p.stage} ${p.stat} ≥ ${p.min}` : p.mastery ? `mastery ${p.mastery}` : p.cat ? `${p.cat} category` : p.stage ? `L${p.stage} ${p.stat} ≥ ${p.min}` : p.stat ? `${p.stat} ≥ ${p.min}` : p.item ? `${p.item} Lv${p.level} × ${p.runs} runs` : p.effect ? `any ${p.effect} item Lv${p.level}` : '');
  const edits = [];
  for (const t of Object.keys(BASE)) for (const id of Object.keys(BASE[t])) {
    const a = (ov[t] || {})[id] || {}, b = (live.ov[t] || {})[id] || {};
    if (canon(a) === canon(b)) continue;
    const fields = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(f => canon(a[f]) !== canon(b[f]));
    edits.push([t, id, fields]);
  }
  const nameOf = (t, id) => { if (t === 'cats') return `${EFFECTS[id].icon} ${EFFECTS[id].name} items`; if (t === 'difficulty') return 'Run difficulty'; if (t === 'stages') return `Level ${id}: ${get(t, id).name}`; if (t === 'tiers') return `✦ ${get(t, id).name} fusion`; const v = get(t, id); return (v.icon ? v.icon + ' ' : '') + (v.name || id); };
  return h('div', { style: 'display:grid;gap:16px' },
    h('div', { class: 'stats' },
      stat(all.length, 'items', `${all.filter(x => x.passive).length} passive · ${all.filter(x => x.lock).length} own locks · ${all.filter(x => x.disabled).length} disabled`),
      stat(startingCats().length + ' / ' + EFFECT_KEYS.length, 'categories at start', startingCats().map(k => EFFECTS[k].name).join(', ')),
      stat(STAGES.length, 'levels', 'each opens when the one before it is beaten'),
      stat(TIER_KEYS.length - 1, 'fusion tiers', TIER_KEYS.slice(1).map(k => get('tiers', k).name).join(', ')),
      stat(chars.length, 'characters', `${chars.filter(x => x.lock).length} locked`),
      stat(Object.keys(BASE.enemies).length + Object.keys(BASE.bosses).length, 'enemies', `${Object.keys(BASE.bosses).length} of them bosses`),
      stat(Object.keys(BASE.drops).length, 'pickups'), stat(UPGRADES.length, 'Forge upgrades'),
      stat(Object.values(ov).reduce((n, r) => n + Object.keys(r).length, 0), 'entries edited', 'vs items.js defaults')),
    h('div', { class: 'card' }, h('h2', {}, 'Changes not yet published'),
      edits.length ? h('table', {}, edits.map(([t, id, f]) => h('tr', {}, h('td', {}, TABLE_NAMES[t]), h('td', {}, h('button', { class: 'link', onclick: () => go(t, id) }, nameOf(t, id))), h('td', {}, h('code', {}, f.join(', '))))))
        : h('p', { class: 'note' }, `Everything matches the live game. Last published ${ago(live.updatedAt)}${live.by ? ' by ' + live.by : ''}.`)),
    h('div', { class: 'card' }, h('h2', {}, 'Unlocks and achievements'),
      h('div', { class: 'tablewrap' }, h('table', {}, h('tr', {}, h('th', {}, 'What'), h('th', {}, 'Type'), h('th', {}, 'How players unlock it')),
        unlockRows.map(([t, id, v]) => h('tr', {}, h('td', {}, h('button', { class: 'link', onclick: () => go(t, id) }, nameOf(t, id))), h('td', {}, t === 'items' ? SLOTS[ITEM[id].slot].name : t === 'cats' ? 'Category' : t === 'tiers' ? 'Fusion tier' : 'Character'),
          h('td', {}, `${lockFull(v.lock)}  `, h('code', {}, lockParts(v.lock).map(reqCode).join(' + '))))))),
      h('p', { class: 'note' }, 'Fusion locks (one per item) are on the Progression tab.')),
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
