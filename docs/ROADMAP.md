# Voidlight Roadmap: maps, zones, augments and the expanded Forge

Status: **proposal.** Patrick answered most of the open questions on 2026-11-06 (see *Decisions* below); one is still open (Part 3).
Nothing here is built yet. Written 2026-11-06 against v0.22.0.

## Decisions (Patrick, 2026-11-06)

These override the recommendations in Part 1 wherever they differ.

1. **Damage type comes from the bullet**, not the pool: an item's hits are typed by its own effect (plus riders). An item's *hit
   type* can be changed or extended by its own augment (a **Hit augment**), separate from an **Effect augment** that adds an effect
   tag to the item for the pool and for fusion compatibility.
2. **Wandering enemies resist, zone enemies can be immune.** Zones are optional, avoidable and placed on the map.
   * Each level has a **Map pickup** hidden somewhere in it. Finding it is a permanent unlock for that level.
   * A **minimap** in the corner and a **large map in the pause menu**. Zones don't show on either until that level's Map is found.
   * The direction of the Map (and of any future pickup like it) is shown by an **arrow at the edge of the screen**.
3. **Attunement is a Forge upgrade with ranks**, and expensive, because zones are meant to be done after a level is beaten.
4. **Maps are very large and wrap.** Crossing one takes several minutes. Leaving the north edge brings you in at the south edge, and
   the same for east and west.
5. **Many materials.** Every attribute has its own material, every kind of augment has its own material, and an augment usually costs
   several kinds (e.g. turning a spell's damage into Burn damage costs Spell, Damage and Burn materials). Augments are expensive, but
   some are reachable early. Every item has a **fixed number of augment slots (3 to 7, to be settled by testing)**. A slot can be
   re-augmented for more materials with a partial refund of what it held; the slot count is the real limit.
6. **Augments add up through fusion.** Augments permanently modify an item for the player, so when items fuse, the item that remains
   carries every augment of every item in the fusion, added together (not halved like damage). Augments are meant as subtle tweaks to
   how an item plays, so their values are sized for that.

---

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

**3. "Plan a build in advance" conflicts with random level-ups.** *(Decided: Attunement, as a ranked Forge upgrade.)* Today you build entirely from three random cards per level. You
can know Level 12 needs Pierce and still never be offered a Pierce item. If later levels demand planning, the player needs some
pre-run control. Proposal: a Forge upgrade that lets you **attune 1 to 3 items** before a run. Attuned items are offered far more
often (and one can be your guaranteed first offer). It's a light touch that keeps the random draft but makes plans achievable.
Without something like this, the hard late levels will feel like slot machines.

**4. An infinite field has nowhere to put zones.** *(Decided: very large wrapping maps, see Decisions 4 and Part 2 Phase 3.)* The world today has no edges: enemies spawn on a ring around you and teleport back
in when they drift too far. Zones, shrines, gates and "go back to that area" all need fixed coordinates. That means a **bounded map
per level** with walls, a minimap, and landmarks you can recognise. It's the biggest technical change in this plan and everything
else in the map half depends on it, so it gets its own phase and ships before zones.

**5. Exploring fights the clock.** The run is a 15-minute ramp where difficulty climbs every minute. Walking to a zone across the
map costs time you'd otherwise spend farming XP near the horde. That's a fine tension, but only if the map is small (around four
screens across, so any point is 20 to 30 seconds away) and zones pay off in XP too, not only materials. Otherwise players will learn
to ignore everything and circle the spawn.

**6. Keep the currencies few.** *(Overruled: Patrick wants many materials, see Decisions 5. The risk below still applies, so the plan adds a Vault screen and recipe UI that show what you have and where to get it.)* Gold, plus one material per effect, plus per-enemy drops would be 15+ currencies, which reads as a
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
work is built. Each phase lists what it still needs from Part 3.

### Phase 1: Chests worth chasing (v0.23)
* Chests roll **1, 3 or 5 items**. Base odds about 70 / 25 / 5; Luck shifts weight from 1 toward 3 and 5 (at the Forge's max Luck,
  roughly 55 / 33 / 12). Bosses are always at least 3.
* A proper chest: bigger, glowing, a beam of light, an edge-of-screen arrow while one is on the ground, and a **chest screen** that
  reveals the items one by one (colour by count: blue 1, purple 3, gold 5).
* Start **tracking per-item kills and per-enemy encounters/kills** in the save now (no UI yet), so augment slots and the Codex have
  history to read when they arrive.
* Save v4, with empty `materials`, `bestiary`, `augments`, `itemKills`, `mapsFound` fields.
* Admin: chest odds and luck weight on Pickups.

### Phase 2: Enemy Codex and damage types (v0.24)
* **Damage types** (Decision 1): every hit carries its bullet's types (the firing item's own effect and riders), burn ticks are Burn,
  poison ticks Poison, shock arcs Shock, reactions both of their ingredients. The pool still strengthens effects, it just doesn't
  change a bullet's type. `damageEnemy` applies the enemy's `weak` / `resist` tables.
* **Wandering enemies get resistances** (never immunity): light, readable traits on the existing roster (e.g. Brutes resist Force,
  Wraiths are weak to Shock). Floating numbers show weak hits (bigger, gold) and resisted hits (grey).
* **Bestiary tab** in the Codex. Each enemy has 3 entries: *Sighted* (free on first encounter: name, look, role), *Studied* (gold:
  HP, speed, damage, attacks), *Mastered* (gold plus kills of that enemy: weaknesses, resistances, immunities, drops). Bosses too.
* **Fusion Lab foes**: an enemy with every entry bought can be picked as the Lab's target (normal, elite or boss form) with its real
  behaviour and resistances.
* Admin: per-enemy weak/resist/immune and Codex prices.

### Phase 3: Wrapping maps, minimap and the Map pickup (v0.25)
* **Each level is a large wrapping map** (Decision 4). Default **36,000 px square**: at the base 200 px/s it takes 3 minutes to cross
  (less with Swiftness). Admin can set the size per level.
* **How the wrap works:** the player moves freely and nothing transient (enemies, bullets, gems) ever needs wrapping, because the horde
  already spawns around the player. Only *fixed* things (zones, shrines, the Map, landmarks) wrap: each one is drawn and collides at
  its copy nearest the player. That keeps the change small and contained (a `wrapNear()` helper in a new `world.js`), with no change
  to the combat code.
* **Landmarks**: scattered obstacles and terrain marks in the level's palette (seeded per level, the same every run) so places are
  recognisable at speed. The faint grid stays.
* **Minimap** (corner) and a **large map in the pause menu**: your position, landmarks, anything already seen this run, and fixed
  features you've discovered on earlier runs.
* **The Map pickup** (Decision 2): every level hides one Map at a random far anchor. An **edge-of-screen arrow** points to it (one
  shared arrow system for the Map, chests, and any future pickup of that kind). Picking it up is a permanent unlock for that level.
* **Anchor points**: fixed coordinates where zones, shrines and the Map can appear; each run picks a random subset, so a map is
  learnable but runs differ.
* No zones yet: this ships the space and lets us check runs still feel right before rewards are added.

### Phase 4: Zones, immune enemies and materials (v0.26)
* **Zones** at anchors: a marked region with its own spawn table, its own enemies and a **Warden** (a mini-boss that stays inside).
  Zone enemies can be **immune** to most damage types (Decision 2), are leashed to their zone and only simulate while you're near, so
  avoiding a zone is always possible and costs nothing. Zones are invisible on the minimap and pause map until that level's Map is
  found; you can still stumble into one.
* Zones in a level can carry **locks from other levels** (a sealed zone in Level 3 that opens after a Warden in Level 6 falls).
* **Materials** (Decision 5) drop from zone enemies, Wardens, elites, bosses and challenge shrines. Proposed families:

| Family | Materials | Mainly from |
|---|---|---|
| **Slot** (5) | Weapon Alloy, Spell Ink, Orbit Dust, Device Gears, Relic Shards | Elites and chests in any level (so slot materials come early), challenge shrines |
| **Effect** (11) | Ember, Rime, Static, Venom, Rebound, Seeker, Edge, Impact, Fortune, Fracture and Blood Essence | Zone enemies themed on that effect, Wardens |
| **Attribute** (one per stat: Damage, Cooldown, Area, Projectiles, Duration, Velocity, Critical...) | Might Ore, Haste Sand, Reach Silk... | Bosses, buff shrines, elites in later levels |
| **Augment kind** (one per kind: Power, Hit, Effect, Stat, Form) | Catalysts | Wardens and first clears (rare) |

  About 28 materials. To keep that readable: a **Vault** screen listing every material, how many you have and where it drops (unknown
  sources show "?" until seen), and material pickups that fly to a HUD tally grouped by family.
* **Anti-farming:** the first Warden kill of each type per run gives full drops and repeats a quarter; each zone gives a one-time
  first-clear bonus.
* Admin: zone tables, Warden stats, materials and drop tables.

### Phase 5: Shrines and challenges (v0.27)
* **Buff shrines** at anchors: stand on one for 2 s for a 60 s buff (attack speed, damage, regen, magnet, move speed). One use.
* **Challenge shrines**: *Hold the circle* (stay inside for 20 s while the horde thickens) and *Cull* (kill 60 enemies inside the
  circle in 30 s). Success drops a chest that rolls at least 3 items plus materials; failure just closes the shrine.
* Shrines show on the minimap once seen (they don't need the Map). Achievements for clearing challenges per level.
* Admin: shrine types, durations, buff values, challenge targets.

### Phase 6: Item augments (v0.28)
* **Fixed augment slots per item.** Each item has its own number of slots (3 to 7). Slots open by using the item (kills with it,
  fusions, mastery), and each costs gold plus materials to fill.
* **Five augment kinds**, each needing its own catalyst plus the materials of what it touches:
  * **Power**: raw damage (+% to the item), capped per item. *Slot + Damage + Power catalyst.*
  * **Hit**: changes or adds the damage type of the item's own bullets (a spell that deals Burn damage). *Slot + Damage + the effect's
    Essence + Hit catalyst.* This is what lets a build answer an immune zone.
  * **Effect**: adds an effect tag to the item, which goes into the pool and counts for fusion and Nexus matching. *Slot + the
    effect's Essence + Effect catalyst.*
  * **Stat**: cooldown, area, projectiles, duration, velocity, crit on that item. *Slot + that attribute's material + Stat catalyst.*
  * **Form**: cosmetic trails, colours, impact flashes, extra glints. No power. *Slot material + Form catalyst, cheap.*
* **Early reach:** small Stat and Form augments use only common slot and attribute materials and cost little gold, so a player can
  augment something in their first few levels. Hit, Effect and big Power augments need Essences and catalysts from zones.
* **Re-augmenting** a slot costs the new augment plus a fee and refunds **50%** of the old augment's materials (gold isn't refunded).
* **Choosing 3 to 7:** measured with the Fusion Lab (DPS of typical builds with 3, 5 and 7 slots filled against Levels 10 to 14) and
  with a material-income estimate (how many runs to fill a slot). Starting guess: 3 for strong weapons and passives, 5 for most items,
  7 for weak or niche items, so augments also even out the roster.
* **Fusion (Decision 6):** the item that remains gets the augments of every item fused into it, added together, at full value
  (Super and Mega items can carry dozens). The absorbed items keep their own augments in the save for later runs. Since that stacks,
  each augment is sized as a subtle tweak, and the Power cap applies to the fused total so a Mega can't stack raw damage past it.
  Hit and Effect augments from absorbed items are carried by the item that remains, so fusing is also a way to combine damage types.
* Augments apply in runs and in the Fusion Lab and show on level-up cards, the stats panel and the item's Armory page.
* Rebalance pass on Levels 8 to 14 assuming typical augments.
* Admin: augment catalogue, slot counts per item, recipes, refund rate.

### Phase 7: Forge expansion and build planning (v0.29)
* **Attunement** (Decision 3): a ranked Forge upgrade, deliberately expensive.
  * Rank 1: attune 1 item before a run; it's offered 3× as often.
  * Rank 2: attune 2 items.
  * Rank 3: attune 3 items, and one of them is guaranteed in the first level-up.
  * Proposed cost: gold in the thousands to tens of thousands plus slot materials and catalysts, gated by beating Levels 3 / 6 / 9.
* **Rank caps**: each Forge upgrade can be raised past its current max with attribute materials (Might 5 → 8, etc.), each step gated
  by a level.
* **Forge recipes** (see Part 3, question 1).
* **Level briefing** on the level select screen: the level's zones and Wardens and what the Codex says about their immunities and
  weaknesses (unknown = "?"), so a build can be planned and attuned before the run.

### Phase 8: Endgame retune (v0.30)
* Rework Levels 9 to 14 around the new systems: zones that need specific damage types, Wardens that gate the next level, harder
  challenges. Hand playtests drive this; the earlier phases only do first-pass numbers.
* Achievement web across levels (unlocks that need trips between levels), shown as a simple "what opens what" map.

### Rough size
| Phase | Size | Depends on |
|---|---|---|
| 1 Chests | small | nothing |
| 2 Codex + damage types | medium | nothing |
| 3 Wrapping maps + Map pickup | large | nothing |
| 4 Zones + materials | large | 2, 3 |
| 5 Shrines | medium | 3 (4 for material rewards) |
| 6 Augments | large | 4 |
| 7 Forge + Attunement | medium | 4, 6, Part 3 Q1 |
| 8 Endgame retune | medium, mostly tuning | all |

---

## Part 3. Still open

1. **Forge recipes.** Do recipes *unlock* items and Nexus recipes (so they then show up in runs), rather than handing you the item at
   the start of a run? *(Recommended: unlock. A Nexus at 0:00 would skip the whole build.)*
