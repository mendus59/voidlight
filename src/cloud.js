// ===== VOIDLIGHT cloud saves: Google sign-in (Firebase Auth) + progress in Firestore =====
// localStorage stays the source the game reads; this module mirrors it to users/{uid} when signed in.
// Rules: first sign-in uploads (or merges in) guest progress, after that the newer save wins,
// signing out leaves a fresh guest save on this device. Without a config, or offline, the game is unaffected.
const SDK = 'https://www.gstatic.com/firebasejs/11.0.2/';
const V = window.VOIDLIGHT;
const bar = document.getElementById('account');
const cfg = window.FIREBASE_CONFIG;
const configured = cfg && cfg.apiKey && !/^YOUR_/.test(cfg.apiKey);

let fb = null, user = null, pushTimer = 0, ready = false, status = '';

function render() {
  if (!bar) return;
  if (!configured || !fb) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.replaceChildren();
  const text = document.createElement('span');
  const btn = document.createElement('button');
  btn.className = 'link';
  if (user) {
    text.textContent = '☁ ' + (user.displayName || user.email || 'Signed in') + (status ? ' · ' + status : '');
    btn.textContent = 'Sign out'; btn.onclick = signOut;
  } else {
    text.textContent = '☁ Sign in to keep your progress across devices';
    btn.textContent = 'Sign in with Google'; btn.className = 'google'; btn.onclick = signIn;
  }
  bar.append(text, btn);
}
function setStatus(s) { status = s; render(); }

async function push() {
  clearTimeout(pushTimer); pushTimer = 0;
  if (!user || !ready) return;
  const save = V.SAVE();
  if (save.owner !== user.uid) return;
  try {
    setStatus('saving…');
    await fb.setDoc(fb.doc(fb.db, 'users', user.uid), { save: JSON.parse(JSON.stringify(save)), updatedAt: save.updatedAt || Date.now(), name: user.displayName || '' });
    setStatus('saved');
  } catch (e) { console.warn('Voidlight cloud save failed', e); setStatus('offline, saved on this device'); }
}
function schedulePush() { if (!pushTimer) pushTimer = setTimeout(push, 1500); }

// Called whenever a user signs in (or is still signed in from last time).
async function syncIn(u) {
  ready = false; setStatus('syncing…');
  let cloud = null;
  try { const snap = await fb.getDoc(fb.doc(fb.db, 'users', u.uid)); if (snap.exists()) cloud = snap.data().save || null; }
  catch (e) { console.warn('Voidlight cloud load failed', e); setStatus('offline, saved on this device'); return; }
  if (user !== u) return; // signed out while loading
  const local = V.SAVE();
  let next;
  if (!cloud) next = local;                                            // new account: take this device's progress up
  else if (!local.owner) { next = V.mergeSaves(local, cloud); if (local.gold > 0 || local.stats.runs > 0) V.toast('Guest progress added to your account'); }
  else if (local.owner !== u.uid) next = cloud;                       // another account's save on this device
  else next = (local.updatedAt || 0) > (cloud.updatedAt || 0) ? local : cloud;
  next = V.normalizeSave(next); next.owner = u.uid;
  const same = cloud && JSON.stringify(V.normalizeSave(cloud)) === JSON.stringify(next);
  if (!same) next.updatedAt = Date.now();
  V.replaceSave(next);
  ready = true;
  if (same) setStatus('saved'); else await push();
}

async function signIn() {
  const provider = new fb.GoogleAuthProvider();
  try { await fb.signInWithPopup(fb.auth, provider); }
  catch (e) {
    if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) return fb.signInWithRedirect(fb.auth, provider);
    if (e && e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') { console.warn(e); V.toast('Sign-in failed: ' + (e.code || e.message)); }
  }
}
async function signOut() {
  if (V.G && !V.G.over) { V.toast('Finish or end your run before signing out'); return; }
  await push();
  await fb.signOut(fb.auth);
  V.replaceSave(V.defaultSave());
  V.toast('Signed out. Your progress is safe in your Google account.');
}

// Content published from admin.html (content/live) is public: every player loads it, signed in or not.
async function loadContent() {
  try { const snap = await fb.getDoc(fb.doc(fb.db, 'content', 'live')); if (snap.exists() && window.VOIDLIGHT_CONTENT) window.VOIDLIGHT_CONTENT.receive(snap.data().data); }
  catch (e) { console.warn('Voidlight content unavailable, using built-in content', e); }
}

async function start() {
  if (window.VOIDLIGHT_SANDBOX) return; // admin test canvas: no sign-in, no saves
  if (!configured) { render(); return; }
  try {
    const [app, auth, fs] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')]);
    const a = app.initializeApp(cfg);
    fb = { auth: auth.getAuth(a), db: fs.getFirestore(a), doc: fs.doc, getDoc: fs.getDoc, setDoc: fs.setDoc,
      GoogleAuthProvider: auth.GoogleAuthProvider, signInWithPopup: auth.signInWithPopup, signInWithRedirect: auth.signInWithRedirect, signOut: auth.signOut };
    render();
    loadContent();
    auth.onAuthStateChanged(fb.auth, u => { user = u; ready = false; status = ''; render(); if (u) syncIn(u); });
  } catch (e) { console.warn('Voidlight cloud saves unavailable', e); fb = null; render(); }
}

window.VOIDLIGHT_CLOUD = { saved() { if (user && ready) schedulePush(); } };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && pushTimer) push(); });
start();
