# Changelog

Voidlight is in beta, so versions are `0.MINOR.PATCH`. The version lives in one place, `VERSION` at the top of `src/core.js`, and shows on the title screen.

- Bump **MINOR** (0.11.0 → 0.12.0) for a PR that adds or changes features.
- Bump **PATCH** (0.11.0 → 0.11.1) for a bug fix or balance tweak.
- Add a line here in the same PR.

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
