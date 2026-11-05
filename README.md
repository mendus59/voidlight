# Voidlight

An original survivor-style bullet hell for the browser. No build step and no dependencies: plain HTML, CSS and JavaScript on a 2D canvas.

## Run it
* Open `index.html` in any modern browser (double-click works), or
* open the single-file build `dist/voidlight.html`, or
* serve the folder: `python3 -m http.server` and visit http://localhost:8000

Progress (gold, upgrades, unlocks, item mastery) is saved in the browser's localStorage. Players can also sign in with Google from the main menu to keep progress in the cloud and across devices (see below).

## Cloud saves (Firebase)
Signing in is optional. Guests keep playing on localStorage exactly as before.

* `src/firebase-config.js` holds the Firebase web config. While it has the `YOUR_...` placeholders the sign-in button stays hidden.
* `src/cloud.js` signs in with Google (Firebase Auth) and mirrors the save to the Firestore document `users/{uid}`, about 1.5 s after each change.
* On a player's first sign-in, the progress already on that device goes up to their account. If the account already has a save, guest progress is added to it (gold and counters add up, upgrade ranks and records take the higher value, unlocks combine). After that the newer save wins. Signing out leaves a fresh guest save on the device.
* `firestore.rules` lets each player read and write only their own document, lets everyone read the published content, and lets only the admin account write it.

### One-time Firebase setup
1. Go to https://console.firebase.google.com, click **Create a project**, name it (e.g. `voidlight`). Google Analytics is not needed.
2. **Build > Authentication > Get started > Sign-in method > Google**: enable it, pick a support email, save.
3. **Authentication > Settings > Authorized domains**: add `mendus59.github.io` (`localhost` is there already, which covers `python3 -m http.server`).
4. **Build > Firestore Database > Create database**: pick a location near your players, start in **production mode**.
5. **Firestore > Rules**: replace the rules with the contents of `firestore.rules` and click **Publish**.
6. **Project settings (gear) > General > Your apps > Web (`</>`)**: register an app (no Hosting needed), then copy the `firebaseConfig` values into `src/firebase-config.js` and commit. These values are public by design; the rules protect the data.

Sign-in works on the GitHub Pages site and on `localhost`. It does not work when opening the HTML file directly (`file://`) or inside the claude.ai artifact, where the game falls back to local saves.

## Admin panel (`admin.html`)
https://mendus59.github.io/voidlight/admin.html (or `localhost:8000/admin.html`). Only the Google account `mendus59@gmail.com` can use it: the page shows nothing but a sign-in button until that account signs in, and `firestore.rules` refuse every draft read and every write from any other account.

* **Progression tab**: which categories are open at the start and the achievement that opens each other one, every item's fusion lock (mastery), and a **progress simulator**: set a pretend save (stats, categories, best level per item, or copy your own save), see which items and fusions that player gets and which achievements are waiting, then **Play with this save** opens the real game (`index.html?testsave`) on that pretend save with your unpublished edits. Progress there stays in the test save and can be loaded back.
* **Item editor**: a second effect (two-effect items), and the fusion lock. Under the test canvas, **Fuse with** picks a partner and shows the real fusion (the selected item remains).
* **Enemies & difficulty**: the run difficulty curve, with a table of what it means at 0, 3, 5, 10 and 15 minutes.
* **Tabs** for Weapons, Spells, Orbitals, Deployables, Relics, Characters, Enemies and bosses, Pickups (drop rates) and Forge upgrades, plus an **Overview** with counts, every unlock and its requirement, the edits not yet published, and the publish history.
* **Items**: name, icon, effect, description, damage, cooldown, unlock (gold cost or achievement), on/off in level-ups, and a **visual style**: color, bullet size, bullet speed, fading trail, and a replacement shape for each kind of bullet the item fires.
* **Test canvas**: the real game engine (`index.html?sandbox`) in a frame with only the selected item, at any level or fused, firing at training targets (ring, line, scattered or a walking swarm, killable or not). Relics get buttons for their triggers (kill, get hit, level up, crit, pickup). Every edit shows up on it right away, with a damage-per-second readout.
* **Save draft** stores your edits in Firestore without touching the game. **Publish to game** writes them to `content/live`, which every player loads on start (cached in their browser, applied after their current run). Your unsaved edits are also kept in this browser.
* **Export items.js** downloads a copy of `src/items.js` with the edits written in. Commit it to make them the built-in defaults; edits that match the new defaults drop away on their own.

How it fits together: `src/content.js` lists what is editable, keeps the items.js values, and applies the published overrides on top; `src/cloud.js` downloads `content/live`; `src/admin.js` is the panel. Changing `firestore.rules` means pasting them into **Firestore > Rules** again and clicking **Publish**.

## Controls
WASD / arrow keys to move, Space or Shift to dash (brief invulnerability), Esc or P to pause, 1–4 to pick level-up cards, R to reroll, S to skip.
On touch screens, drag to move and tap with a second finger to dash.

## Files
| File | What's in it |
|---|---|
| `DESIGN.md` | Progression design: 10 levels, 74 items, passive items, categories and mastery, the 4 fusion tiers, combination math, characters |
| `src/core.js` | Engine: spatial grid, bullets and their behaviours, effect pool, reactions, damage |
| `src/items.js` | Content: 74 item definitions (one bullet pattern each, or a passive stat map), 15 characters, categories, 10 levels, fusion tiers, difficulty, enemies and bosses, pickups, Forge upgrades |
| `src/progress.js` | Save format and migration, unlock rules, achievements (shared by the game and the admin simulator) |
| `src/content.js` | Applies content published from the admin page on top of items.js |
| `admin.html`, `src/admin.js` | The admin panel |
| `src/main.js` | Director (waves, elites, bosses), enemies, player, pickups, level-ups, rendering, menus, save |
| `src/firebase-config.js`, `src/cloud.js` | Firebase config and the Google sign-in / cloud save sync |
| `firestore.rules` | Firestore security rules to paste into the Firebase console |
| `build.py` | Inlines the scripts into `dist/voidlight.html` (and `dist/artifact.html` for the hosted link) |

## Adding an item
Call `def(slot, id, name, effect, icon, { dmg, cd, pattern, fire(inst, c) {...} })` in `src/items.js`.
`c` gives you level `c.L`, damage `c.d`, extra projectiles `c.n`, aim angle `c.aim`, and the helper `B(c, {...})` spawns a bullet carrying the item's effect.
Persistent things use `spawn(inst, c)`, reactive relics use `on: { kill, hurt, crit, pickup, move, levelup }`.
Keep the plain-data properties (`dmg`, `cd`, `effect2`, `lock`, `fuseLock`, `pattern`, …) on the `def(` line, so the admin export can rewrite it. `passive: { might: .04, cd: .02 }` makes it a passive item (stats per level, no `fire`). Locks are `{ stage: 3, stat: 'kills', min: 1000, text, cost: 500 }` (a stat in one level: `kills`, `best`, `bosses`, `wins`), `{ stat: 'totalKills', min: 500, text }`, `{ effect: 'burn', level: 5, text }` (any item of a category) or `{ item: 'ember_pistol', level: 5, runs: 1, text }`. `cost` is the gold price once the achievement is met; a lock with only a cost is ignored. `fuseLock: { level: 5, runs: 2 }` overrides the default mastery needed to fuse it (`runs: 0` = always).

Debug hook in the console: `VOIDLIGHT.addItem('blood_lance', 5)`, `VOIDLIGHT.fusionGroups()`, `VOIDLIGHT.G` for the run state.
