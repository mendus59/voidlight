# VOIDLIGHT — Design Document

An original top-down "survivor-style" bullet hell for the browser. You move; your gear fires on its own.
Survive 15 minutes of escalating swarms and three bosses on each of 10 levels, collect XP to build a loadout mid-run, and
collect **Void Gold** that persists between runs to buy permanent upgrades and unlocks.

---

## 1. Core loop

| Layer | Driven by | What you gain |
|---|---|---|
| **In-run (per round)** | XP crystals dropped by enemies | Level-ups → pick 1 of 3 cards (new item, item upgrade, or Fusion) |
| **Time** | The run clock (0:00 → 15:00) | New enemy types every few minutes, elites every ~45s, bosses at 5:00 / 10:00 / 15:00. Enemy HP and spawn rate scale with time |
| **Meta (between rounds)** | Void Gold picked up during the run + a time bonus at the end | Permanent stat ranks and extra sockets in the Forge, buying unlocked items and characters |
| **Achievements** | Stats per level (kills, best time, bosses, wins) and lifetime stats | Unlock categories, characters, items, fusion tiers and the next level. Most items and characters still cost gold after their achievement |

A run ends when you die, or when you defeat the 15:00 boss (a win).

## 2. Slots (5) and sockets

Every item belongs to exactly one of **5 slots**. (Section 5 lists the original 55 items; the 10 passive items are in section 3 and the 9 level items in section 9.) Each slot starts with **2 sockets**, so a starting loadout holds 10 items. Each level you unlock lets you buy one more socket in the Forge (section 7), up to 19 sockets with all 10 levels open.

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

### Passive items
The 10 former two-effect items are now **passive stat boosts**. They fire nothing and add nothing to the Effect Pool. Each level adds its stats
(for example Frostfire Core: +4% damage and +2% cooldown per level), and fusion tiers multiply them (`statMul`). They still carry their two
effect tags, so they fuse with passive items that share an effect. A passive item can't absorb an attacking item; an attacking item can absorb a passive one
and gets 50% of its stats. Frostfire Core, Barbed Quiver, Storm Lens, Blood Moon Idol, Plasma Capacitor, Hive Mind, Magma Heart,
Shrapnel Charm, Thunder Sigil and Glacial Shell. They need both of their categories unlocked to show up.

### Fusion (4 tiers)
Fusion needs several **level 5 items of the same tier that share at least one effect** (any slots). You choose which one remains:
* The survivor takes **50% of every other item's damage and passive stats**. It does not take their attacks: their effects are
  added to its own bullets instead.
* The other items' sockets are freed.
* The survivor moves up one tier and starts again at the level's start level, so it has to be levelled to 5 before the next tier.
* A passive item can't keep a fusion that consumes an attacking item.

| Tier | Needs | Damage | Cooldown | Own stacks per effect | Pool per level | Stats | Unlock |
|---|---|---|---|---|---|---|---|
| Base | | ×1 | ×1 | 2 | 1 | ×1 | |
| Fused | 2 base items | ×1.6 | ×0.75 | 3 | 1.5 | ×1.25 | Mastery of each item |
| Super | 3 fused items | ×3.2 | ×0.65 | 6 | 4 | ×1.5 | Beat Level 3 |
| Mega | 5 super items | ×16 | ×0.55 | 12 | 12 | ×2 | Beat Level 6 |

A Mega is 30 base items deep, so **items consumed by a fusion can be offered again later in the run** (only items held right now are
excluded), and offers favour items that share an effect with what you hold. The level-up screen has **Skip** (S) for when no card helps.
Chests from elites and bosses offer an available fusion first. All tiers are editable in the admin panel (Progression > Fusion tiers).

**How many Megas fit in a run?** Sockets are not the limit (19 with everything bought). Level-ups are: one Mega takes about 51 picks
from level 1 items (fewer from a higher start level), and Level 10 gives roughly 220 level-ups in 15 minutes. So the most a strong run
can reach is **about 4 Megas**. Level 10 is tuned so that around 3 early Megas just survive the final boss and 4 is comfortable
(tested with a bot and injected builds, not by hand).

## 3b. Progression: levels, categories, mastery and achievements
* **Nothing unlocks by gold alone.** Every locked item, character, category and fusion tier has an achievement. Most items and
  characters then still have to be bought with gold (the price shows once the achievement is done); categories and tiers are free.
* **Categories.** A new save starts with **Burn, Chill and Shock**. The others open by surviving 3:00 in a level:

| Category | Unlocks when |
|---|---|
| Poison | Survive 3:00 in Level 2 |
| Force | Survive 3:00 in Level 3 |
| Pierce | Survive 3:00 in Level 4 |
| Critical | Survive 3:00 in Level 5 |
| Ricochet | Survive 3:00 in Level 6 |
| Homing | Survive 3:00 in Level 7 |
| Split | Survive 3:00 in Level 8 |
| Vampiric | Survive 3:00 in Level 9 |

* **Mastery.** Every item has a mastery achievement: reach level 5 with it in 1 run (editable per item). Fusing an item is
  locked until its mastery is done.
* Stats are saved per level (`stages`: kills, best time, bosses, wins, runs) and in total. New unlocks and items that are now
  for sale are listed on the game-over screen and on the Achievements screen, grouped by level.
* **Saves.** Save v3 adds `stages`. Older saves load: their stats count as Level 1, so Level 2 opens if they had a win, and
  anything already bought or unlocked stays.

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

Legend: 🔒 = locked at start. The conditions listed below are from before levels; every lock is now a level achievement plus a price (section 9 and the admin panel).

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

## 6. Characters (15, one per weapon)

| Character | Starting weapon | Perk | Achievement | Price |
|---|---|---|---|---|
| Kael, Ember Warden | Ember Pistol | +10% damage | Start | |
| Mira, Frostweaver | Frost Fan | +15% area | Start | |
| Volt, Storm Runner | Arc Rifle | −8% cooldowns | Start | |
| Briar, Thornkeeper | Thorn Spitter | +20% max HP, +0.5 regen | Survive 5:00 in Level 1 | free |
| Juno, Trickshot | Ricochet Disc | +15% projectile speed | 1500 kills in Level 1 | ● 500 |
| Sable, Wanderer | Boomerang Glaive | +15% move speed | Boss in Level 1 | ● 400 |
| Grim, Scrapper | Scrap Blaster | +2 armor | Boss in Level 2 | ● 900 |
| Lyra, Gambler | Helix Cannon | +10% crit chance | Survive 5:00 in Level 2 | ● 700 |
| Corvin, Rimeguard | Rime Lance | +10% area, +10% max HP | Survive 5:00 in Level 3 | ● 900 |
| Orrin, Tinker | Seeker Swarm | +20% duration | Survive 10:00 in Level 4 | ● 1200 |
| Tamsin, Stormcaller | Arc Halo | −10% cooldowns, −10% max HP | 2000 kills in Level 5 | ● 1500 |
| Nyx, Fractured | Splitter Orb | +1 projectile, −20% max HP | Boss in Level 6 | ● 1600 |
| Vesper, Nightblood | Blood Lance | Lance hits heal 2% of damage | Survive 10:00 in Level 7 | ● 2200 |
| Wren, Shardwright | Shard Cannon | +15% damage, +10% XP | Survive 10:00 in Level 8 | ● 2500 |
| Morrow, Tidecaller | Crimson Tide | +1 HP/s, +15% duration | Boss in Level 9 | ● 3000 |

## 7. Permanent upgrades (the Forge)

Bought with Void Gold, cost rises per rank: Might, Vitality (max HP), Armor, Recovery (regen), Swiftness
(move speed), Reach (area), Haste (cooldown), Velocity (projectile speed), Persistence (duration),
Multishot (+1 projectile), Magnetism, Luck (crit + 4th card chance), Growth (XP), Greed (gold), Second
Wind (revive), Reroll.

**Extra sockets.** Each slot can buy up to 2 more sockets (● 400 each, rising per rank). Every unlocked level after the first allows one
more socket bought in total, so 9 extra sockets (19 in all) once Level 10 is open.

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

## 9. Levels

Each level is unlocked by beating the one before it. A level multiplies enemy HP (with a ramp that grows with the run clock, cubed),
spawn rate, enemy damage and boss HP, and also XP and gold so a build can keep up. Items arrive at the level's start level
(new items and freshly fused ones), so later levels skip the early picks.

| Level | Name | Enemy HP | Late ramp | Spawns | Damage | Boss HP | XP | Gold | Items start at |
|---|---|---|---|---|---|---|---|---|---|
| 1 | The Rift | ×1 | 0 | ×1 | ×1 | ×1 | ×1 | ×1 | 1 |
| 2 | Ashen Verge | ×1.2 | 0.5 | ×1.05 | ×1.1 | ×1.6 | ×1.4 | ×1.2 | 1 |
| 3 | Frostbound Deep | ×1.4 | 1.2 | ×1.1 | ×1.2 | ×2.6 | ×1.9 | ×1.4 | 2 |
| 4 | Storm Spire | ×1.6 | 2.1 | ×1.15 | ×1.3 | ×4 | ×2.6 | ×1.6 | 2 |
| 5 | Blight Garden | ×1.8 | 3.4 | ×1.2 | ×1.4 | ×6.5 | ×3.4 | ×1.8 | 3 |
| 6 | Mirror Wastes | ×2 | 5 | ×1.25 | ×1.5 | ×10 | ×4.4 | ×2 | 3 |
| 7 | Hunter's Moon | ×2.3 | 9 | ×1.3 | ×1.6 | ×20 | ×6 | ×2.3 | 4 |
| 8 | Shattered Crown | ×2.6 | 16 | ×1.35 | ×1.7 | ×40 | ×8 | ×2.6 | 4 |
| 9 | Crimson Expanse | ×3 | 27 | ×1.4 | ×1.8 | ×85 | ×11 | ×3 | 5 |
| 10 | The Void Heart | ×3.5 | 68 | ×1.45 | ×1.9 | ×1500 | ×16 | ×3.5 | 5 |

Enemy HP is `hp × (1 + ramp × f³)`, where f goes from 0 at 0:00 to 1 at 15:00. All values are editable in the admin panel (Progression > Levels).

### Level items (9 new)
| Item | Slot | Effect | Achievement | Price |
|---|---|---|---|---|
| Cinder Mortar | Deployable | Burn | 800 kills in Level 2 | free |
| Rime Lance | Weapon | Chill | 1000 kills in Level 3 | ● 500 |
| Arc Halo | Orbital | Shock | Survive 5:00 in Level 4 | ● 700 |
| War Drum | Relic (on dash) | Force | Boss in Level 5 | ● 800 |
| Mirror Storm | Spell | Ricochet | 1500 kills in Level 6 | ● 900 |
| Comet Lash | Spell | Homing | Survive 8:00 in Level 7 | ● 1000 |
| Shard Cannon | Weapon | Split | 2000 kills in Level 8 | ● 1100 |
| Crimson Tide | Spell | Vampiric | Survive 10:00 in Level 9 | ● 1200 |
| Deadeye Bow | Weapon | Critical | Boss in Level 10 | ● 1500 |

The older locked items also have level achievements now, each with a price (see the Armory or the admin panel's Progression tab).
