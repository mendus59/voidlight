# VOIDLIGHT — Design Document

An original top-down "survivor-style" bullet hell for the browser. You move; your gear fires on its own.
Survive 15 minutes of escalating swarms and three bosses, collect XP to build a loadout mid-run, and
collect **Void Gold** that persists between runs to buy permanent upgrades and unlocks.

---

## 1. Core loop

| Layer | Driven by | What you gain |
|---|---|---|
| **In-run (per round)** | XP crystals dropped by enemies | Level-ups → pick 1 of 3 cards (new item, item upgrade, or Fusion) |
| **Time** | The run clock (0:00 → 15:00) | New enemy types every few minutes, elites every ~45s, bosses at 5:00 / 10:00 / 15:00. Enemy HP and spawn rate scale with time |
| **Meta (between rounds)** | Void Gold picked up during the run + a time bonus at the end | Permanent stat ranks in the Forge, item unlocks in the Armory, character unlocks |
| **Achievements** | Lifetime stats (best time, total kills, bosses, fusions, wins, max level) | Free unlocks for specific characters and items |

A run ends when you die, or when you defeat the 15:00 boss (a win).

## 2. Slots (5) and sockets

Every item belongs to exactly one of **5 slots**. (Section 5 lists the original 55 single-effect items; the 10 two-effect items are in section 3.) Each slot has **2 sockets**, so a full loadout holds 10 items.

| Slot | Role | Fires… |
|---|---|---|
| 🔫 **Weapon** | Direct fire | On a short cooldown, aimed at the nearest enemy |
| 🔮 **Spell** | Area bursts | On a longer cooldown, big screen-filling patterns |
| 🪐 **Orbital** | Persistent companions | Constantly: things circling or following you |
| 🛠️ **Deployable** | Things left in the world | Turrets, mines, clouds, trails, bombs |
| 💠 **Relic** | Reactive | On triggers: getting hit, kills, crits, gem pickup, standing still, moving, level-up |

Items level from **1 to 5**. Each level adds damage (+30%), lowers cooldown (−7%), and usually adds projectiles.

## 3. The bullet effect system

There are **11 bullet effects**. Every item carries exactly one, so each slot contains one item per effect
(11 effects × 5 slots = **55 items**).

The key rule: **every item you hold adds its level to a shared Effect Pool, and the pool is applied to *every* bullet you fire.**
So picking up Cinder Ring (Burn, Orbital) makes your Frost Fan shards burn too. An item's own bullets get +2 bonus stacks of its own effect.

| Effect | Per stack |
|---|---|
| 🔥 Burn | Damage over time (2 + 1.6/stack DPS for 2.5s) |
| ❄️ Chill | 7% slow per stack (max 60%); at 5+ stacks hits can Freeze |
| ⚡ Shock | 6% chance per stack to arc to a nearby enemy for 60% damage |
| ☠️ Poison | Adds stacking toxin (+0.6 DPS per stack per hit, lasts 4s) |
| 🔁 Ricochet | +1 enemy-to-enemy bounce per 2 stacks |
| 🎯 Homing | Bullets steer toward enemies (+turn rate per stack) |
| 🗡️ Pierce | +1 pierce per 2 stacks |
| 💥 Force | Knockback per stack |
| ✴️ Critical | +3% crit chance per stack, crits deal 2× (+10% per stack) |
| ✳️ Split | 10% per stack for a kill to burst into 3 shrapnel bullets |
| 🩸 Vampiric | 1.2% per stack for a hit to heal 1 HP |

### Reactions (combining effects on the same enemy)
| Reaction | Ingredients | Result |
|---|---|---|
| **Shatter** | Burn + Chill | Bonus hit for 100% damage + 10, removes the chill |
| **Combustion** | Burn + Poison | Enemy explodes on death, damaging others nearby |
| **Conduction** | Shock + Chill | Shock arcs deal double damage |
| **Contagion** | Shock + Poison | Arcs spread the poison to the new target |

### Two-effect items
10 items carry two effects (`effect2`): Frostfire Bolt (Burn+Chill), Needle Thrower (Poison+Pierce), Storm Front (Shock+Chill),
Blood Moon (Critical+Vampiric), Plasma Orbs (Burn+Shock), Hive Drones (Homing+Poison), Magma Geyser (Burn+Force),
Shrapnel Bumper (Ricochet+Split), Thunder Sigil (Shock+Critical), Glacial Shell (Chill+Force).
They are weaker alone: about 70% of the usual damage, they add 60% of their level to *each* effect pool (not 100% to one),
and their own bullets get +1 stack of each effect instead of +2. In return they fuse with items of either effect,
and they need both categories unlocked to show up.

### Fusion
When you hold **two level 5 items that share an effect** (any slots, including the same slot), and **both have their fusion
unlocked** (see Mastery below), a Fusion card appears. You choose which item remains:
* The survivor absorbs the other. Its damage becomes its own + 50% of the absorbed item's, it gets −25% cooldown and
  +1 projectile, and the absorbed item's attack keeps firing inside it at 50% damage.
* The fused item has every effect of both items (fuse with a two-effect item and you gain its second effect), counts
  ×2 of its level in the Effect Pool for each, and its bullets get +3 own stacks.
* The absorbed item's socket is freed for a new item.
* A fused item can absorb one more item (up to 2 absorbed, named “… II”). An item that has already absorbed something can't be the one that disappears.
Chests from elites and bosses offer an available fusion first (you still choose which item remains).

## 3b. Progression: categories, mastery and achievements
* **Categories.** Each effect is a category. A new save starts with only **Burn, Chill and Shock** (Frost and Chill are the
  same effect in this game, so Shock is the third starting category; it matches the three starting heroes and enables the
  Shatter and Conduction reactions). That is 18 of 65 items. The others open with achievements:

| Category | Unlocks when |
|---|---|
| Poison | Reach level 5 with any Burn item |
| Force | Reach level 5 with any Chill item |
| Pierce | Reach level 5 with any Shock item |
| Ricochet | Reach level 5 with any Pierce item |
| Homing | Reach level 5 with any Force item |
| Critical | Survive 5:00 |
| Split | Defeat a boss |
| Vampiric | Make 3 fusions |

* **Mastery.** Every item has a mastery achievement: reach level 5 with it in 1 run (editable per item). Fusing an item is
  locked until its mastery is done, so the first time you max an item you can't fuse it that run.
* Item-level progress is saved per item (`itemRuns`: how many runs reached each level) and counted when a run ends.
  New unlocks are listed on the game-over screen and on the Achievements screen (main menu).
* Item and hero locks from before still apply on top of categories.
* Saves from before this change (v1) keep everything: items bought with gold also open their categories, and stat
  achievements are granted on load. Category and mastery achievements that depend on item levels start from zero.

### Difficulty
Tunable in the admin panel (Enemies & difficulty). Defaults: enemy HP ×(1 + 0.4m + 0.06m²) (was 0.3m + 0.04m²),
spawns 1 + 0.9m + 0.06m² per second (was 0.8 + 0.75m + 0.05m²), enemy damage +10%/min (was +6.7%), elites every 40 s
with ×10 HP (was 45 s, ×8), encirclements every 50 s (was 60 s), bosses ×1.4 HP, and a slightly steeper XP curve.

## 4. Combination math

* Items per slot: 11. Ways to fill one slot (empty, 1 item, or 2 items): 1 + 11 + C(11,2) = 1 + 11 + 55 = **67**.
* Full loadout space across 5 slots: 67⁵ = **1,350,125,107** distinct loadouts.
* Just the *full* 10-item loadouts: C(11,2)⁵ = 55⁵ = **503,284,375**.
* Even with only the 39 items unlocked at the start (9 weapons, 7 spells, 8 orbitals, 7 deployables, 8 relics), full 10-item loadouts number C(9,2)·C(7,2)·C(8,2)·C(7,2)·C(8,2) = 36·21·28·21·28 = **12,446,784**.
* Counting item levels (1–5) and fusions multiplies this further. Simple pairs of items alone: C(55,2) = **1,485** — the 1000+ requirement is cleared by pairs before you even reach a third item.
* Effect Pool states: each of 11 effects can range from 0 to 20+ stacks, and 4 reactions turn on or off depending on which pairs you've built.

## 5. The 55 items

Legend: 🔒 = locked at start (unlock condition or Armory price shown).

### 🔫 Weapons (auto-aimed, short cooldown)
| # | Item | Effect | Bullet pattern | Unlock |
|---|---|---|---|---|
| 1 | Ember Pistol | Burn | Rapid tight volley of fireballs at the nearest enemy | — |
| 2 | Frost Fan | Chill | Cone of 3+ ice shards that pierce | — |
| 3 | Arc Rifle | Shock | Very fast piercing bolt that chain-zaps enemies it hits | — |
| 4 | Thorn Spitter | Poison | Sequential stream of thorns that wobble in a sine wave | — |
| 5 | Ricochet Disc | Ricochet | Spinning discs that bounce off the screen edges | — |
| 6 | Seeker Swarm | Homing | Missiles launched behind you that accelerate and curve onto targets | — |
| 7 | Boomerang Glaive | Pierce | Glaives that fly out and return, hitting on both passes | — |
| 8 | Scrap Blaster | Force | Wide random shotgun spray with heavy drag and knockback | — |
| 9 | Helix Cannon | Critical | Twin bullets braided in a double helix | — |
| 10 | Splitter Orb | Split | Slow heavy orb that shatters into a radial burst on hit/expire | 🔒 500 lifetime kills |
| 11 | Blood Lance | Vampiric | Long lance thrust in your facing direction, pierces everything | 🔒 1000 gold |

### 🔮 Spells (area, longer cooldown)
| # | Item | Effect | Bullet pattern | Unlock |
|---|---|---|---|---|
| 12 | Flame Nova | Burn | Swirling expanding ring of fireballs | — |
| 13 | Blizzard | Chill | Icicles lobbed in arcs onto enemies, exploding on landing | — |
| 14 | Thunder Call | Shock | Sky lightning strikes on random enemies | — |
| 15 | Plague Cloud | Poison | Lingering toxic clouds dropped on enemies | — |
| 16 | Prism Shard | Ricochet | Rainbow shards that bounce enemy-to-enemy many times | — |
| 17 | Star Fall | Homing | Stars summoned above you that dive onto targets | 🔒 Survive 3:00 |
| 18 | Spiral Sigil | Pierce | Classic multi-arm rotating spiral stream | — |
| 19 | Shockwave | Force | Expanding ring wave that blasts enemies outward | — |
| 20 | Judgment Cross | Critical | Four beams in a + then an × around you | 🔒 600 gold |
| 21 | Fractal Bloom | Split | Curving petals that split, and split again | 🔒 500 gold |
| 22 | Soul Leech | Vampiric | Ring of skulls that fly out and return to heal you | 🔒 3000 lifetime kills |

### 🪐 Orbitals (always active)
| # | Item | Effect | Bullet pattern | Unlock |
|---|---|---|---|---|
| 23 | Cinder Ring | Burn | Fireballs in a tight circular orbit | — |
| 24 | Frost Halo | Chill | Freezing aura around you | — |
| 25 | Storm Sprite | Shock | Floating sprite that zaps nearby enemies | — |
| 26 | Venom Moth | Poison | Erratic moth that scatters lingering spores | — |
| 27 | Pinball Wisp | Ricochet | Wisps bouncing around a box centred on you | — |
| 28 | Owl Familiar | Homing | Owl perched behind you firing homing feathers | — |
| 29 | Blade Wheel | Pierce | Large blades on a wide elliptical orbit | 🔒 2000 lifetime kills |
| 30 | Guardian Shield | Force | Close shield plates that shove enemies away | — |
| 31 | Fortune Orbs | Critical | Orbs tracing a figure-8 around you | — |
| 32 | Gemini Satellites | Split | Twin satellites firing splitting side-bursts | 🔒 700 gold |
| 33 | Bat Swarm | Vampiric | Bats circling chaotically | 🔒 800 gold |

### 🛠️ Deployables (left in the world)
| # | Item | Effect | Bullet pattern | Unlock |
|---|---|---|---|---|
| 34 | Fire Trail | Burn | Flames left behind as you move | — |
| 35 | Ice Mine | Chill | Proximity mines that burst into rings of shards | — |
| 36 | Tesla Coil | Shock | Coil that zaps multiple enemies | — |
| 37 | Spore Pod | Poison | Lobbed pod that sprays a spore spiral | — |
| 38 | Bumper Totem | Ricochet | Totem spraying rotating wall-bouncing shots | — |
| 39 | Hunter Turret | Homing | Turret firing homing missiles | — |
| 40 | Spike Line | Pierce | A line of spikes erupting toward enemies | — |
| 41 | Gravity Well | Force | Vortex that pulls enemies in, then detonates outward | 🔒 500 gold |
| 42 | Sniper Nest | Critical | Turret sniping the toughest enemy on screen | 🔒 Fuse any item |
| 43 | Cluster Bomb | Split | Lobbed bomb that scatters bomblets | 🔒 Reach level 15 |
| 44 | Blood Altar | Vampiric | Altar spraying a 3-arm spiral; heals you while near it | 🔒 Survive 10:00 |

### 💠 Relics (triggered)
| # | Item | Effect | Trigger → pattern | Unlock |
|---|---|---|---|---|
| 45 | Phoenix Feather | Burn | When hit or levelling up → ring of flame feathers | — |
| 46 | Frozen Heart | Chill | Every N kills → 8-way ice burst from the victim | — |
| 47 | Static Boots | Shock | Every 140px moved → spark spray behind you | — |
| 48 | Venom Gland | Poison | On kill (chance) → corpse spits poison globs | — |
| 49 | Rubber Charm | Ricochet | On gem pickup (chance) → bouncing pellet | — |
| 50 | Hunter's Eye | Homing | While standing still → ring of homing darts | — |
| 51 | Piercing Gaze | Pierce | Every few seconds → beam in your movement direction | — |
| 52 | Repulsor Plate | Force | When swarmed → point-blank shockwave | — |
| 53 | Assassin's Mark | Critical | On crit (chance) → dagger thrown at another enemy | 🔒 400 gold |
| 54 | Hydra Scale | Split | On level-up / every 25 kills → cascading splitting rings | 🔒 Defeat a boss |
| 55 | Vampire Fang | Vampiric | On kill (chance) → homing blood drop that heals on hit | 🔒 600 gold |

Item locks shown here apply on top of the category locks in section 3b. A character's starting weapon is
always available to that character even if it's still locked for others.

## 6. Characters (11, one per weapon)

| Character | Starting weapon | Perk | Unlock |
|---|---|---|---|
| Kael, Ember Warden | Ember Pistol | +10% damage | Start |
| Mira, Frostweaver | Frost Fan | +15% area | Start |
| Volt, Storm Runner | Arc Rifle | −8% cooldowns | Start |
| Briar, Thornkeeper | Thorn Spitter | +20% max HP, +0.5 regen | Survive 5:00 |
| Juno, Trickshot | Ricochet Disc | +15% projectile speed | 1000 lifetime kills |
| Orrin, Tinker | Seeker Swarm | +20% duration | Reach level 20 |
| Sable, Wanderer | Boomerang Glaive | +15% move speed | Defeat a boss |
| Grim, Scrapper | Scrap Blaster | +2 armor | 1500 gold |
| Lyra, Gambler | Helix Cannon | +10% crit chance | Fuse an item |
| Nyx, Fractured | Splitter Orb | +1 projectile, −20% max HP | Win a run |
| Vesper, Nightblood | Blood Lance | Lifesteal 2% of damage as healing on lance hits | 3000 gold |

## 7. Permanent upgrades (the Forge)

Bought with Void Gold, cost rises per rank: Might, Vitality (max HP), Armor, Recovery (regen), Swiftness
(move speed), Reach (area), Haste (cooldown), Velocity (projectile speed), Persistence (duration),
Multishot (+1 projectile), Magnetism, Luck (crit + 4th card chance), Growth (XP), Greed (gold), Second
Wind (revive), Reroll.

## 8. Enemies and time

| Time | New threats |
|---|---|
| 0:00 | Drones (chasers), Swarmlings |
| 1:00 | Darters (fast) |
| 2:00 | Spitters (ranged, aimed shots) |
| 3:30 | Brutes (tanky) |
| 4:30 | Bombers (burst into a ring of bullets on death) |
| 5:00 | **Boss: Hollow Matriarch** (ring bursts, spawns swarmlings) |
| 6:30 | Warlocks (3-way spread shots) |
| 8:00 | Wraiths (fast and tough) |
| 10:00 | **Boss: Clockwork Seraph** (rotating spiral streams + aimed triples) |
| 15:00 | **Boss: The Eclipse** (spirals, rings and fans). Kill it to win |

Every ~45s an Elite spawns (8× HP, drops a chest). Every 60s an encirclement wave rings you in.
You have a small hitbox (bullet-hell style) and a **dash** (Space / Shift) with brief invulnerability.
