# Changelog

Voidlight is in beta, so versions are `0.MINOR.PATCH`. The version lives in one place, `VERSION` at the top of `src/core.js`, and shows on the title screen.

- Bump **MINOR** (0.11.0 → 0.12.0) for a PR that adds or changes features.
- Bump **PATCH** (0.11.0 → 0.11.1) for a bug fix or balance tweak.
- Add a line here in the same PR.

## 0.25.0 (2026-11-06)
- **Every level is now a huge wrapping map.** It's 36,000 px across (about 3 minutes to cross at base speed), and it wraps: walk off the north edge and you come back at the south, the same east to west. Each level has its own scenery (crystal clusters, stone circles, broken pillars and floor runes in its colours), the same every run, so places become recognisable.
- **Minimap** in the top right and a **large map in the pause menu**, both centred on you.
- **The Map pickup:** every level hides its Map far from the start. An arrow at the edge of the screen points the way, with the distance. Finding it is a permanent unlock for that level: from then on its zones show on the minimap and the pause map (zones arrive in the next version).
- The same edge arrows now point to chests and the Map, and will point to future finds.
- Admin: Progression > Levels has a map size per level, plus a World table (map size, landmarks, anchor points, how far the Map is).

## 0.24.0 (2026-11-06)
- **Damage types.** Every hit now has a type: the effect of the item that fired it (plus its fusion riders). The shared effect pool still strengthens effects, but it no longer changes what a bullet *is*. Burn and poison ticks are Burn and Poison damage, shock arcs are Shock, Split shrapnel is Split, and reactions count as both their ingredients.
- **Enemies have weaknesses and resistances.** Weak hits do ×1.5 and pop as bigger gold numbers with a "!", resisted hits do ×0.5 and show grey. For example Swarmlings are weak to Burn and Split, Bombers are weak to Force and resist Burn, Wraiths are weak to Shock and Vampiric, and the Hollow Matriarch is weak to Burn. A hit with several types uses the best one, so fusions that carry more effects find more weaknesses. The pause menu shows what each of your items hits as.
- **The Bestiary** (Codex & Armory > 👁 Bestiary): every enemy and boss you have met, with three entries. *Sighted* is free once met. *Studied* costs gold and shows its stats and attacks. *Mastered* costs gold after you defeat enough of them and reveals its weaknesses and resistances.
- **Fusion Lab foes:** a mastered enemy can be picked as the Lab's target, with its real moves and resistances, and the Lab says how your item's damage type fares against it.
- Admin: Enemies & difficulty has the damage type lists per enemy and boss, the weak / resist multipliers and the Codex prices.

## 0.23.0 (2026-11-06)
- Chests worth chasing: every chest now holds **1, 3 or 5 upgrades**, rolled when it drops (about 70% / 25% / 5%). Luck raises the odds of the bigger ones (at the Forge's max Luck about 54% / 36% / 10%). Boss chests always hold at least 3.
- Chests look the part: a beam of light, a pulsing glow, turning rays on 3 and 5 chests, and a colour that says what's inside (blue 1, purple Rare 3, gold Legendary 5). A banner announces Rare and Legendary drops.
- An arrow at the edge of the screen points to any chest you can't see, with its distance.
- Opening a chest shows a chest screen that reveals each upgrade in turn, plus its gold. Level-ups and fusions wait until you close it.
- Behind the scenes for later versions: the save (v4) now counts kills per item and every enemy you meet and kill, and has room for materials, augments, maps, forged recipes and attuned items. Older saves load as before.
- Admin: Pickups has the 3 and 5 chest chances and the Luck weight.

## 0.22.0 (2026-11-06)
- Fusion chains by category: every attacking item now has an animation category (➶ Projectile, ◎ Orbital, ◌ Aura, ▣ Deployable, 〰 Trail, ▒ Zone, ✸ Blast, ϟ Arc), and how an absorbed item chains depends only on the two categories, so new items chain automatically. An absorbed item either rides on the main body of the item that remains (each bullet, each orbiting shot, its aura, each object it places, its patches) as a visible part that acts on its own, or pops where that item hits.
- Auras, deployables and patches now visibly change with every absorbed item: e.g. Frost Halo with Tesla Coil gets little coils circling its rim that arc lightning; Tesla Coil with Frost Halo gives every coil a frost aura; Tesla Coil with Cinder Ring has fireballs circling each coil; Plague Cloud with an absorbed projectile fires volleys from every cloud. Absorbed deployables drop or carry small copies of themselves. Orbital chains on bullets now fly outward when the bullet hits.
- Chain lines (level-up, pause, Fusion Lab, Codex) say how each link rides or pops on that item.
- Admin: each item's "Fusion chain" picks a category (plus volley/ring pattern for projectiles and what a deployable's copies do); Progression > Fusion chains shows the category rule table and a new "Damage × when riding a body" (1.5). Older form overrides still load.

## 0.21.0 (2026-11-06)
- Every level has its own colour scheme: enemies wear the level's palette by role (swarm, fast, heavy, ranged), enemy shots share one level colour, and the floor carries a faint wash of the level's colour. Bosses keep their own colours so they stand apart.
- Three new enemies that some levels swap in for a classic one: Lancer (stops, aims, then dashes; replaces the Darter), Husk (bursts into Swarmlings; replaces the Bomber) and Sentinel (fires a ring of shots; replaces the Spitter or Warlock).
- Enemy bullets look hostile and can't be mistaken for yours: a dark core inside a coloured shell with a pulsing outer ring, drawn on top. Your shots keep their white-hot cores and soft glow.
- Elites are toned down (smaller, a thin gold crown ring and a slim health bar, no pulsing aura) and bosses are louder (dark well, pulsing aura, two counter-rotating rings, white outline), so bosses are the clear standouts.

## 0.20.0 (2026-11-06)
- Codex & Armory and Achievements have an All / 🔓 Unlocked / 🔒 Locked filter (a second row of tabs, with counts). In the Codex it works with every tab, including ✴ Nexus (unlocked = recipe known) and This run; an item counts as unlocked once it and its categories are unlocked.

## 0.19.0 (2026-11-06)
- Nexus items: 20 named recipes (11 Fused, 6 Super, 3 Mega) made by fusing specific items and keeping the recipe's first item (the core). Nothing is halved: every part keeps 100% of its damage, attack and stats at the new tier, all in one socket. A Nexus can't fuse further.
- Nexus threat: while you hold Nexus items, enemies get more HP, damage and spawns (Fused 1, Super 2, Mega 4 threat points), and forming one calls a ring of elites. The HUD shows your threat.
- Nexus recipes are learned through achievements (new "Nexus recipes" section). The Codex has a ✴ Nexus tab with every recipe.
- Two new Nexus levels for Nexus builds: Level 13 Nexus Spire and Level 14 Event Horizon.

## 0.18.0 (2026-11-06)
- Fusion chains: every attacking item a fusion absorbs now plays its own attack off the item that remains, at 50% of its damage. Each item has a chain form (volley, burst, orbit ring, zone, arc, blast, halo, satellites or trail): e.g. Cinder Ring in Ember Pistol spins a cinder ring out wherever a fireball hits or runs out, and Frost Halo in Frost Fan puts a frost halo on every shard. Super and Mega fusions nest the chains: the shots a link makes trigger the links of the item it came from.
- Fusion rules: a mastered item can absorb items that are not mastered yet (only mastered items can remain). A fusion always makes the remaining item stronger: it keeps 100% of what it had and adds 50% of what each absorbed item had, even though it restarts at the level's start level.
- 🧪 Fusion Lab on the main menu: try any item, fusion tier and partners you have unlocked on training targets, with the chains listed. Nothing is saved.
- Level-up fusion cards and the pause menu list each item's chains.
- Admin: every item page has a "Fusion chain" editor (form, trigger, shape, count, size, damage), Progression has the chain rules (damage share, rate limit, nesting depth); the test canvas has a fusion tester with partners and, for Super and Mega, the items each partner was made from (or 🎲 Random).
- Balance: fused builds measured about 1.6× (Fused), 1.7× (Super) and 1.3× (Mega) the old damage, so enemy and boss HP of Levels 2 to 10 went up ×1.2 to ×1.5. Mega fusion now opens with Beat Level 7 (was 6). New endgame Levels 11 (The Echo Loom) and 12 (Singularity Choir).

## 0.17.0 (2026-11-06)
- Hero archetypes: every hero now has an archetype (Pyromancer, Tinker, Sharpshooter...) with passive bonuses on top of their perk: stronger effects of their element, +20% damage on hits that carry their effect combo (e.g. Burn + Poison for Kael), and for some, extra damage for one or two item slots.
- Level-up offers lean a little toward items that fit your hero's archetype, and those cards carry a ◆ archetype badge.
- The stats panel (level-up and pause) shows your archetype bonuses and whether each combo is off, on some items, or on all bullets.
- Admin Characters tab: edit each hero's archetype name, effect strengths, slot damage and combos.

## 0.16.0 (2026-11-06)
- Menus fill large screens: the level/hero picker, Forge, Codex & Armory and Achievements now use the full browser width, so more tiles fit per row and tiles grow a little on wide monitors. The level-up screen is wider too. Phones are unchanged.

## 0.15.0 (2026-11-06)
- Overtime: if the 15:00 boss is still alive at 20:00, the run keeps getting harder every minute. Damage you take doubles each minute, new enemies get ×1.6 HP per minute and spawns rise 50% per minute, all compounding, so surviving indefinitely is near impossible. The clock turns red and a banner warns each minute.
- All four overtime numbers (start minute, damage, HP, spawns) are editable in the admin panel (Enemies > Difficulty); start minute 0 turns it off.

## 0.14.0 (2026-11-06)
- Codex & Armory tiles show each item's mastery badge (★ Mastered, ✓ Mastered when this run ends, or ☆ Not mastered with the level and runs needed), the same badge as on level-up cards. The item detail view shows it too.

## 0.13.0 (2026-11-05)
- Fusion history: every item remembers, across runs, which items it has fused with and which Super fusions it was part of.
- Super fusion now also needs every item in it to have fused with 3 different items before; Mega needs each one to have made 5 different Super fusions. Both counts are editable in the admin panel (Fusion tiers, "History needed").
- Click any item in the Codex & Armory to see its fusion history: who it has fused with, who is left, its Super combinations, and progress toward Super and Mega.
- The pause menu has a 📖 Codex button, with a "This run" tab for the items you hold, so you can plan fusions mid-run.
- Admin progress simulator: edit or fill each item's fusion history in the test save.

## 0.12.0 (2026-11-05)
- Level-up cards now show each item's mastery: ★ Mastered when it can fuse, ✓ Mastered when this run ends once you've reached the mastery level, or ☆ Not mastered with the level (and runs) still needed.

## 0.11.1 (2026-11-05)
- Fix: title card no longer shows a horizontal scrollbar (VOIDLIGHT heading was wider than the card).

## 0.11.0 (2026-11-05)
- Version number shown on the title screen.

## Earlier (before versioning, numbered by PR)
- 0.10: Level-up confirm and stats panel, hero unlocks via other heroes and mastery, category-gated effects, configurable game speeds (#10)
- 0.9: 10 levels, achievement locks, passive items, Super/Mega fusion (#9)
- 0.8: Pause button, top-of-screen back buttons, game speed toggle (#8)
- 0.7: Progression v2: categories, mastery fusion, dual items, difficulty (#7)
- 0.5: Admin panel (#5)
- 0.3: Google sign-in and cloud saves (#3)
- 0.1: First playable (#1)
