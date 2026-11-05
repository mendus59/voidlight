# Voidlight

An original survivor-style bullet hell for the browser. No build step and no dependencies: plain HTML, CSS and JavaScript on a 2D canvas.

## Run it
* Open `index.html` in any modern browser (double-click works), or
* open the single-file build `dist/voidlight.html`, or
* serve the folder: `python3 -m http.server` and visit http://localhost:8000

Progress (gold, upgrades, unlocks) is saved in the browser's localStorage.

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
| `build.py` | Inlines the scripts into `dist/voidlight.html` (and `dist/artifact.html` for the hosted link) |

## Adding an item
Call `def(slot, id, name, effect, icon, { dmg, cd, pattern, fire(inst, c) {...} })` in `src/items.js`.
`c` gives you level `c.L`, damage `c.d`, extra projectiles `c.n`, aim angle `c.aim`, and the helper `B(c, {...})` spawns a bullet carrying the item's effect.
Persistent things use `spawn(inst, c)`, reactive relics use `on: { kill, hurt, crit, pickup, move, levelup }`.

Debug hook in the console: `VOIDLIGHT.addItem('blood_lance')`, `VOIDLIGHT.G` for the run state.
