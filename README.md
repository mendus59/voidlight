# Voidlight

An original survivor-style bullet hell for the browser. No build step and no dependencies: plain HTML, CSS and JavaScript on a 2D canvas.

## Run it
* Open `index.html` in any modern browser (double-click works), or
* open the single-file build `dist/voidlight.html`, or
* serve the folder: `python3 -m http.server` and visit http://localhost:8000

Progress (gold, upgrades, unlocks) is saved in the browser's localStorage. Players can also sign in with Google from the main menu to keep progress in the cloud and across devices (see below).

## Cloud saves (Firebase)
Signing in is optional. Guests keep playing on localStorage exactly as before.

* `src/firebase-config.js` holds the Firebase web config. While it has the `YOUR_...` placeholders the sign-in button stays hidden.
* `src/cloud.js` signs in with Google (Firebase Auth) and mirrors the save to the Firestore document `users/{uid}`, about 1.5 s after each change.
* On a player's first sign-in, the progress already on that device goes up to their account. If the account already has a save, guest progress is added to it (gold and counters add up, upgrade ranks and records take the higher value, unlocks combine). After that the newer save wins. Signing out leaves a fresh guest save on the device.
* `firestore.rules` lets each player read and write only their own document.

### One-time Firebase setup
1. Go to https://console.firebase.google.com, click **Create a project**, name it (e.g. `voidlight`). Google Analytics is not needed.
2. **Build > Authentication > Get started > Sign-in method > Google**: enable it, pick a support email, save.
3. **Authentication > Settings > Authorized domains**: add `mendus59.github.io` (`localhost` is there already, which covers `python3 -m http.server`).
4. **Build > Firestore Database > Create database**: pick a location near your players, start in **production mode**.
5. **Firestore > Rules**: replace the rules with the contents of `firestore.rules` and click **Publish**.
6. **Project settings (gear) > General > Your apps > Web (`</>`)**: register an app (no Hosting needed), then copy the `firebaseConfig` values into `src/firebase-config.js` and commit. These values are public by design; the rules protect the data.

Sign-in works on the GitHub Pages site and on `localhost`. It does not work when opening the HTML file directly (`file://`) or inside the claude.ai artifact, where the game falls back to local saves.

## Controls
WASD / arrow keys to move, Space or Shift to dash (brief invulnerability), Esc or P to pause, 1–4 to pick level-up cards, R to reroll.
On touch screens, drag to move and tap with a second finger to dash.

## Files
| File | What's in it |
|---|---|
| `DESIGN.md` | Progression design, all 55 items, combination math, unlocks, characters |
| `src/core.js` | Engine: spatial grid, bullets and their behaviours, effect pool, reactions, damage |
| `src/items.js` | Content: 55 item definitions (one bullet pattern each), 11 characters, Forge upgrades |
| `src/main.js` | Director (waves, elites, bosses), enemies, player, pickups, level-ups, rendering, menus, save |
| `src/firebase-config.js`, `src/cloud.js` | Firebase config and the Google sign-in / cloud save sync |
| `firestore.rules` | Firestore security rules to paste into the Firebase console |
| `build.py` | Inlines the scripts into `dist/voidlight.html` (and `dist/artifact.html` for the hosted link) |

## Adding an item
Call `def(slot, id, name, effect, icon, { dmg, cd, pattern, fire(inst, c) {...} })` in `src/items.js`.
`c` gives you level `c.L`, damage `c.d`, extra projectiles `c.n`, aim angle `c.aim`, and the helper `B(c, {...})` spawns a bullet carrying the item's effect.
Persistent things use `spawn(inst, c)`, reactive relics use `on: { kill, hurt, crit, pickup, move, levelup }`.

Debug hook in the console: `VOIDLIGHT.addItem('blood_lance')`, `VOIDLIGHT.G` for the run state.
