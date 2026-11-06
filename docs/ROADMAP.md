# Voidlight Roadmap: maps, zones, augments and the expanded Forge

Status: **proposal, waiting for Patrick's approval.** Nothing here is built yet. Written 2026-11-06 against v0.22.0.

This doc covers the next big direction for the game: levels become maps with zones, special enemies drop materials, materials
and gold buy item augments and Forge upgrades, maps hold shrines and challenges, chests get exciting, the enemy Codex becomes
something you invest in, and later levels ask you to plan a build before you start. Part 1 is candid feedback on the idea. Part 2
is the phased plan. Part 3 is the questions that need an answer before the phases that depend on them start.

---

## Part 1. Design feedback

### What's strong

* **It gives the meta loop a second axis.** Right now almost all long-term progress is "unlock the next thing". Materials, augments
  and Codex knowledge add *investment* in things you already own, which is what keeps people replaying a level they've beaten.
* **It turns the 11 effects into decisions you make before a run.** Today the effect pool rewards whatever you get offered. Zone
  enemies with weaknesses make "which effects do I bring to Level 9?" a real question, and the Codex is where you find the answer.
* **Most of it reuses systems that already exist.** Effects are already damage types, the Fusion Lab is already a sandbox for
  testing builds, `itemRuns`/`fuseLog` already track per-item history, and every lock is already data (`{ all: [...] }`). The
  Codex-to-Lab idea in particular is almost free.
* **Shrines and challenge chests are cheap and fun.** They give a run moments that aren't "kite in a circle", and they're
  self-contained, so they can be tuned without touching anything else.

### Risks and the things I'd change

**1. The shared effect pool breaks "only weak to Burn".** Every item adds its effect to a pool that is applied to *every* bullet.
Hold one Burn item at level 1 and every bullet you fire is a Burn bullet. So "this enemy only takes Burn damage" is satisfied by a
single pickup, and the loadout pressure disappears. We need a definition of "Burn damage" that respects how much you've invested.
My recommendation:

* A hit's damage type is the **item's own effect plus its fusion riders** (what the item *is*), not the pool.
* Burn ticks are Burn damage, poison ticks are Poison, shock arcs are Shock, reactions count as both their ingredients.
* Pool stacks still help through the effect itself (more burn ticks, a deeper slow), they just don't change a bullet's type.

That keeps the pool fun and makes "bring Burn items" mean something.

**2. Use resistance, not immunity, for most enemies.** This is an auto-fire game: you can't choose what to shoot. An immune enemy
that walks onto you while your build can't hurt it is a death you couldn't play around, and it soaks your shots so they don't hit
anything else. I'd use three bands: **weak** (×1.5 from that type), **resistant** (×0.35 from everything else), and **immune**
only on a few marquee Wardens that sit in their zone and don't chase you out of it. Zone enemies should also be leashed to their
zone, so "optional" really is optional.

**3. "Plan a build in advance" conflicts with random level-ups.** Today you build entirely from three random cards per level. You
can know Level 12 needs Pierce and still never be offered a Pierce item. If later levels demand planning, the player needs some
pre-run control. Proposal: a Forge upgrade that lets you **attune 1 to 3 items** before a run. Attuned items are offered far more
often (and one can be your guaranteed first offer). It's a light touch that keeps the random draft but makes plans achievable.
Without something like this, the hard late levels will feel like slot machines.

**4. An infinite field has nowhere to put zones.** The world today has no edges: enemies spawn on a ring around you and teleport back
in when they drift too far. Zones, shrines, gates and "go back to that area" all need fixed coordinates. That means a **bounded map
per level** with walls, a minimap, and landmarks you can recognise. It's the biggest technical change in this plan and everything
else in the map half depends on it, so it gets its own phase and ships before zones.

**5. Exploring fights the clock.** The run is a 15-minute ramp where difficulty climbs every minute. Walking to a zone across the
map costs time you'd otherwise spend farming XP near the horde. That's a fine tension, but only if the map is small (around four
screens across, so any point is 20 to 30 seconds away) and zones pay off in XP too, not only materials. Otherwise players will learn
to ignore everything and circle the spawn.

**6. Keep the currencies few.** Gold, plus one material per effect, plus per-enemy drops would be 15+ currencies, which reads as a
spreadsheet. I'd ship with **four materials** plus gold:

| Material | From | Spent on |
|---|---|---|
| **Void Shards** (common) | Any zone enemy | Small augments, Codex entries above tier 1 |
| **Essence** (one per effect family: Elemental = Burn/Chill/Shock/Poison, Kinetic = Ricochet/Pierce/Force/Homing, Fate = Critical/Split/Vampiric) | Zone enemies weak to that family | Effect augments, Forge rank caps |
| **Warden Cores** (rare) | Zone Wardens and challenge chests | Big augments, Forge recipes |

That's 5 counters in the HUD/save, each with an obvious source and use. More can come later if it feels thin.

**7. Augments stack on an already deep item system.** An item already has levels, mastery, fusion history, chains and Nexus recipes.
Augments are another permanent layer, and permanent power makes every level easier the more you play, which undoes the balance work
on Levels 10 to 14. Guard rails I'd build in from day one:

* **Augment slots are earned by using the item** (e.g. slot 1 at 500 kills with it, slot 2 after 3 fusions, slot 3 after mastering
  it at Super). So the requirement is play, and the price is gold plus materials.
* **A power budget per item:** raw damage augments cap at around +30% total. The rest are sidegrades (an extra rider effect on the
  item's *own* bullets only, not the pool; a stat; a new pattern or animation).
* **Cosmetic animations are their own track** with no power, so they can be generous.
* **Fusion:** the item that remains keeps its augments. Absorbed items' augments are kept on their saved copy (they're permanent per
  item id, not per run) but don't transfer. This keeps `absorb()` untouched.
* Late levels get tuned *assuming* a reasonable number of augments, which is what makes "you need to augment for Level 12" true.

**8. Farming: cap the rewards, not the player.** "Farming should be minimal" works best as diminishing returns per level rather
than a hard limit: the first Warden kill of each type each run gives full materials, repeats give a quarter; challenge chests give
materials only the first N times per level, then gold. A **first-clear bonus** on each zone and challenge makes going back to an old
level for a specific unlock feel good without making it the best way to farm.

**9. Forge "recipes that unlock items like Nexus".** Two possible readings: the recipe *unlocks* an item or Nexus recipe (it then
shows up in runs), or the Forge *gives you* the item at the start of a run. The second one breaks the 15-minute ramp (a Nexus at
0:00 skips the whole build). I'd go with the first, and treat it as an alternative path to the existing achievements, never
gold-only (it costs materials that only come from play, so it still follows "nothing unlocks by gold alone").

**10. The code needs a little room first.** `main.js` is 1,400 dense lines and 115 KB. Maps, zones, shrines, materials, the enemy
Codex and augments would roughly double it. I'd split new systems into their own files from the start (`world.js`, `zones.js`,
`shrines.js`, `augments.js`, `bestiary.js`) loaded like `chain.js` and `nexus.js` are, and bump the save to v4 once with room for
all of it. Each new table also needs an admin editor, which is real work per phase; the plan budgets for it rather than leaving the
admin panel behind.

### What I'd simplify or defer

* **Defer "attribute upgrades" as a separate augment type.** A stat augment covers it.
* **One challenge shrine type per phase.** Start with "hold the circle" and "kill N inside the circle"; add more once the reward feel
  is right.
* **Cross-level gates can start as data only.** A zone can carry a lock like any item (`{ stage: 6, stat: 'wardens', min: 1 }`). No
  new UI beyond the lock showing on the map.
* **Forge rank caps before Forge recipes.** Raising caps is a number change; recipes need a new screen.

---

## Part 2. The plan

Every phase is one or two PRs, ships playable, and bumps MINOR. Phases 1 and 2 don't depend on maps and can ship while the map
work is designed. Each phase lists what it needs from the questions in Part 3.

### Phase 1: Chests worth chasing (v0.23)
* Chests roll **1, 3 or 5 items**. Base odds about 70 / 25 / 5; Luck shifts weight from 1 toward 3 and 5 (at the Forge's max Luck,
  roughly 55 / 33 / 12). Bosses are always at least 3.
* A proper chest: bigger, glowing, beam of light, an off-screen arrow when one drops, and a **chest screen** that reveals the items
  one by one (rarity colour by count: blue 1, purple 3, gold 5).
* Start **tracking per-item kills and per-enemy encounters/kills** in the save now (no UI yet), so later phases have history to read.
* Save v4 with empty `materials`, `bestiary`, `augments`, `itemKills` fields.
* Admin: chest odds and luck weight on Pickups.

### Phase 2: Enemy Codex and damage types (v0.24)
* **Damage types** as in feedback point 1: every hit, tick, arc and reaction knows its effect(s). `damageEnemy` takes the types and
  applies the enemy's `weak` / `resist` / `immune` tables. Existing enemies get light, readable traits (e.g. Brutes resist Force,
  Wraiths are weak to Shock) so the system is visible before zones arrive. Floating numbers show weak hits (bigger, gold) and
  resisted hits (grey).
* **Bestiary tab** in the Codex. Each enemy has 3 entries: *Sighted* (free on first encounter: name, look, role), *Studied* (gold:
  HP, speed, damage, attacks), *Mastered* (gold plus kills of that enemy: weaknesses, resistances, drops). Bosses too.
* **Fusion Lab "foes"**: once an enemy's entries are complete, pick it (elite or boss form too) as the Lab's target instead of
  dummies, with its real behaviour and resistances.
* Admin: per-enemy weak/resist/immune and Codex prices.

### Phase 3: Maps (v0.25)
* Each level gets a **bounded map** (about 4 × 4 screens) with soft walls, a few obstacles/landmarks in the level's palette, and a
  **minimap** (corner, toggle to full map in pause).
* The spawner keeps the current horde ring but clamps to the map, and the "teleport far enemies back" rule stays for horde enemies only.
* Maps define **anchor points**: fixed coordinates where zones, shrines and chests can appear. Each run picks a random subset, so the
  map is learnable but runs differ.
* Map data lives in `STAGES[].map` (size, walls, anchors, landmark seed) so the admin can edit it as numbers; a visual map editor is
  out of scope for now.
* No new rewards in this phase on purpose: it ships the space and lets us check the run still feels right in a bounded arena.

### Phase 4: Zones, special enemies and materials (v0.26)
* **Zones** at anchor points: a visible region with its own spawn table, its own enemy variants and a **Warden** (a mini-boss that
  stays in its zone). Zone enemies are leashed to the zone and only simulate when you're near, so they don't cost frame time.
* New zone enemy variants built from existing behaviours (charge, ranged rings, death spawns) plus resist/weak tables. Each level has
  2 to 3 zones from a pool.
* **Materials** (four, as in point 6) drop from zone enemies and Wardens, shown in the HUD and on the game-over screen, saved.
  Diminishing returns per run as in point 8. First-clear bonus per zone.
* Zones in later levels carry **locks from other levels** (a sealed zone in Level 3 that opens after you beat a Warden in Level 6).
* Admin: zone tables, Warden stats, material drop rates.

### Phase 5: Shrines and challenges (v0.27)
* **Buff shrines** at anchors: step on to channel for 2 s, get a 60 s buff (attack speed, damage, regen, magnet, move speed). One use.
* **Challenge shrines**: *Hold the circle* (stay inside for 20 s while the horde thickens) and *Cull* (kill 60 enemies inside the
  circle in 30 s). Success drops a guaranteed 3+ chest and a material; failure just closes the shrine.
* Shrine icons on the minimap once seen; achievements for clearing challenges per level.
* Admin: shrine types, durations, buff values, challenge targets.

### Phase 6: Item augments (v0.28)
* An **Augment** page on each item in the Armory. Slots earned by use (kills with the item, fusions, mastery at a tier), filled with
  augments bought with gold and materials.
* First catalogue, about 20 augments in four groups: **Power** (+damage, capped per point 7), **Rider** (adds an effect to the item's
  own bullets), **Stat** (cooldown, area, projectiles, duration on that item), **Form** (cosmetic: trail, colour, impact flash, an
  extra orbiting glint).
* Augments apply in runs and in the Fusion Lab, and show on level-up cards and in the stats panel.
* Rebalance pass on Levels 8 to 14 assuming typical augments.
* Admin: augment catalogue, slot requirements and prices.

### Phase 7: Forge expansion and build planning (v0.29)
* **Rank caps**: each Forge upgrade can be raised past its current max with materials (Might 5 → 8, etc.), each step gated by a level.
* **Attunement**: choose 1 to 3 items before a run to be offered far more often (point 3). Slots bought in the Forge.
* **Forge recipes**: spend Warden Cores and Essence to unlock specific items or Nexus recipes as an alternative to (or on top of)
  their achievement.
* **Level briefing** on the level select screen: the level's zones, Wardens and what you know about their weaknesses from the Codex
  (unknown = "?"), so you plan before you start.

### Phase 8: Endgame retune (v0.30)
* Rework Levels 9 to 14 around the new systems: zones that need specific damage types, Wardens that gate the next level, harder
  challenges. Hand playtests drive this; the earlier phases only do first-pass numbers.
* Achievement web across levels (unlocks that need traversal between levels), surfaced as a simple "map of what opens what".

### Rough size
| Phase | Size | Depends on |
|---|---|---|
| 1 Chests | small | nothing |
| 2 Codex + damage types | medium | Q1, Q2 |
| 3 Maps | large | Q3 |
| 4 Zones + materials | large | 2, 3, Q4 |
| 5 Shrines | medium | 3 (4 for material rewards) |
| 6 Augments | large | 4, Q5 |
| 7 Forge + planning | medium | 4, 6, Q6 |
| 8 Endgame retune | medium, mostly tuning | all |

---

## Part 3. Questions for Patrick

1. **Damage types and the pool.** OK to define a hit's type by the item's own effect and riders (plus DoT/arc/reaction types), not
   the shared pool? *(Recommended: yes.)*
2. **Immune or resistant?** Resistance for regular zone enemies, immunity only for a few Wardens that stay in their zone?
   *(Recommended: yes.)*
3. **Map shape.** Bounded map of about 4 × 4 screens per level, with a minimap? Or bigger maps you explore over several runs?
   *(Recommended: ~4 × 4.)*
4. **Materials.** Four materials (Void Shards, three Essences, Warden Cores) plus gold, or do you want per-level or per-effect
   materials? *(Recommended: the four.)*
5. **Augments through fusion.** The item that remains keeps its augments, absorbed items' augments don't transfer?
   *(Recommended: yes.)*
6. **Forge recipes.** Recipes *unlock* items and Nexus recipes, rather than handing you the item at the start of a run?
   *(Recommended: unlock.)*
7. **Build planning.** Is Attunement (favoured items before a run) the kind of pre-run control you want, or do you have something
   else in mind, like choosing a starting item?
