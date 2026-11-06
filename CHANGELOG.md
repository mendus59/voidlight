# Changelog

Voidlight is in beta, so versions are `0.MINOR.PATCH`. The version lives in one place, `VERSION` at the top of `src/core.js`, and shows on the title screen.

- Bump **MINOR** (0.11.0 → 0.12.0) for a PR that adds or changes features.
- Bump **PATCH** (0.11.0 → 0.11.1) for a bug fix or balance tweak.
- Add a line here in the same PR.

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
