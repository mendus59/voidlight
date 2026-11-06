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

A run ends when you die, or when you defeat the 15:00 boss (a win). If that boss is still alive at 20:00, **overtime** starts: every minute past 20:00 doubles the damage you take, multiplies new enemies' HP by 1.6 and adds 50% more spawns, compounding, so no run can be stalled forever (admin panel: Enemies > Difficulty, overtime fields).

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
* **Mastery decides who can remain.** Only a mastered item (or an item that is already fused) can be the survivor. It can absorb
  items that are not mastered yet, so one mastered item is enough for a fusion.
* **A fusion always makes the survivor stronger.** It keeps **100% of what it had** and adds **50% of what each absorbed item
  had**: its hit damage at the moment of fusion becomes flat `carry` damage, and its passive stats become flat `flat` stats.
  On top of that its own base damage (× the new tier) and per-level stats grow again as it is levelled back up to 5.
* **Absorbed attacks chain** off the survivor's own (see *Fusion chains* below). Their effects are also carried on its bullets.
* The other items' sockets are freed.
* The survivor moves up one tier and starts again at the level's start level, so it has to be levelled to 5 before the next tier.
* A passive item can't keep a fusion that consumes an attacking item.

### Fusion chains
Inspired by spell-chaining games: every attacking item a fusion absorbs becomes a **link** on the survivor, and plays its own
attack, in a small form, off the survivor at **50% of the damage it did**. The engine (`src/chain.js`) never handles pairs of
items, only pairs of **animation categories**. Every attacking item has one category (`CHAIN_DEFAULTS`, or its `chain.cat` from
the admin page):

| Category | Its animation | As the item that remains, its links ride on | Items |
|---|---|---|---|
| ➶ Projectile | shots that fly (a volley at the nearest enemy, or a ring) | each bullet | most weapons, most spells and relics |
| ◎ Orbital | shots circling a centre | each orbiting shot | Cinder Ring, Blade Wheel, Bat Swarm, Pinball Wisp... |
| ◌ Aura | a field that hurts what is inside | the aura | Frost Halo |
| ▣ Deployable | an object placed to act on its own (turrets, coils, mines, pets) | each object it places | Tesla Coil, Hunter Turret, Ice Mine, Storm Sprite, Owl Familiar... |
| 〰 Trail | damage left behind as it moves | the patches it leaves | Fire Trail, Venom Moth, Static Boots |
| ▒ Zone | lingering patches | the patches it leaves | Plague Cloud, Cinder Mortar |
| ✸ Blast | instant area hits | nothing (links pop where it strikes) | Blizzard, Shockwave, Spike Line, Cluster Bomb, War Drum... |
| ϟ Arc | lightning jumping between enemies | nothing (links pop where it strikes) | Thunder Call |

A link either **rides** the survivor's main body (a visible part of it that acts on its own while it lives) or **pops** at a point
where the survivor hits. The whole rule is which link categories ride which body (`CHAIN_HOSTS`):

| Survivor's body ↓ / absorbed → | Projectile | Orbital | Aura | Deployable | Trail | Zone | Blast | Arc |
|---|---|---|---|---|---|---|---|---|
| Each bullet | pop | ride | ride | pop | ride | pop | pop | pop |
| Each orbiting shot | ride | ride | ride | pop | ride | pop | pop | pop |
| The aura, each placed object, each patch | ride | ride | ride | ride | ride | ride | ride | ride |
| Strike points (blast, arc) | pop | pop | pop | pop | pop | pop | pop | pop |

How each category rides: **projectile** fires volleys (or rings) of its shots from the body at enemies; **orbital** shots circle
the body and fly outward when it is gone; **aura** wraps the body in its own aura; **deployable** puts small copies of itself on
the body that act (Tesla Coil's arc, Hunter Turret's shots, Ice Mine's blast...); **trail** leaves its shots behind the body (in a
smouldering ring when it stands still); **zone** drops patches; **blast** charges a ring and pulses; **arc** crackles on the rim
and arcs to enemies. How each pops: a volley or ring of shots, an orbit ring spinning out, a brief aura flash, a small copy that
acts for 3 s, a short streak, a patch, a blast, or lightning jumps.

So Frost Halo with Tesla Coil gets two little coils circling its rim that arc lightning; Tesla Coil with Frost Halo gives every
coil its own frost aura; Tesla Coil with Cinder Ring has fireballs circling every coil; Ember Pistol with Cinder Ring sends each
fireball out with cinders circling it, which fly outward when it hits. A new item only needs a category to chain with everything.
A link that is riding does not also pop off the survivor's other hits, so nothing plays twice. Links riding an aura, a placed
object or a patch (and projectiles and arcs riding orbiting shots) take the place of popping on every hit, so they hit
`CHAIN_RULES.rules.ride` × harder (1.5).

**Super and Mega nest.** A link remembers the links of the item it came from, and the shots a link makes trigger those. A Super
item that absorbed a Fused Ember Pistol (which had absorbed Cinder Ring) plays the pistol's volley off its bullets, and every
volley shot then releases its own cinder ring. A Mega goes three steps deep. Each link has a rate limit (8 plays per second by
default; every pop and every volley, arc, pulse or patch a rider makes spends one) so fast weapons and many bodies stay readable. Rules (`CHAIN_RULES` in items.js: damage share, rate, nesting depth, damage
per nesting step, riding damage) and each item's category, pattern, shape, count, size, damage × and trigger (hit, expiry or both) are editable in the admin
panel (Progression > Fusion chains, and "Fusion chain" on every item page).

**Testing them.** The admin test canvas has a fusion tester: pick a tier and the items it absorbs, and for Super and Mega the
items each of those was made from (or 🎲 Random). Players have the **🧪 Fusion Lab** on the main menu: the same canvas with the
items, tiers and fusions they have unlocked, nothing saved.

| Tier | Needs | Damage | Cooldown | Own stacks per effect | Pool per level | Stats | Unlock |
|---|---|---|---|---|---|---|---|
| Base | | ×1 | ×1 | 2 | 1 | ×1 | |
| Fused | 2 base items | ×1.6 | ×0.75 | 3 | 1.5 | ×1.25 | Mastery of each item |
| Super | 3 fused items | ×3.2 | ×0.65 | 6 | 4 | ×1.5 | Beat Level 3 |
| Mega | 5 super items | ×16 | ×0.55 | 12 | 12 | ×2 | Beat Level 7 |

**Fusion history (across runs).** Each item remembers what it has fused with (`fuseLog` in the save; the item kept and the ones
consumed are all credited). Super and Mega fusion ask for it on top of their tier unlock, for **every item in the fusion**:
* **Super:** the item has fused with **3 different items** before (any runs, the current one included).
* **Mega:** the item has been in **5 different Super fusions** (different sets of partners).
The counts are the `hist` field of each tier (admin: Fusion tiers, "History needed"; 0 turns it off). Clicking an item in the Codex
& Armory shows its history: items it has fused with, items it can still fuse with, its Super combinations and progress bars. The
pause menu opens the same Codex (with a "This run" tab), so a run can be steered toward new partners.

A Mega is 30 base items deep, so **items consumed by a fusion can be offered again later in the run** (only items held right now are
excluded), and offers favour items that share an effect with what you hold. The level-up screen has **Skip** for when no card helps. Picking is two steps: select a card (click or 1–4), then Confirm (or Enter), so movement keys can never take a card unseen. A stats panel under the cards shows every player stat and the effect pool, with the selected card's changes as now → after; the pause menu shows the same panel.
Chests from elites and bosses offer an available fusion first. All tiers are editable in the admin panel (Progression > Fusion tiers).

**How many Megas fit in a run?** Sockets are not the limit (19 with everything bought). Level-ups are: one Mega takes about 51 picks
from level 1 items (fewer from a higher start level), and Level 10 gives roughly 220 level-ups in 15 minutes. So the most a strong run
can reach is **about 4 Megas**. Level 10 is tuned so that around 3 early Megas just survive the final boss and 4 is comfortable
(tested with a bot and injected builds, not by hand).

### Nexus items (named recipe fusions)
A **Nexus** is a fusion of specific items (`NEXUS` in `src/items.js`). When a fusion is made from exactly a recipe's items and the
player keeps the recipe's **first item (the core)**, the group becomes that Nexus instead of a normal fusion. The order matters: keep
any other item and it's a normal fusion. Super and Mega recipes name the core items of the Fused / Super items that go in.
* **Nothing is halved.** The other items are not consumed: they live on inside the core's socket as its parts, in recipe order, each
  keeping **100% of its own damage, attack pattern, cooldown and passive stats**, raised to the new tier (×1.6 / ×3.2 / ×16 damage).
* Every part's bullets carry every effect in the Nexus. Parts level up with the core.
* A Nexus is final: it can't fuse any further.
* **Threat.** Each Nexus has a threat value (Fused 1, Super 2, Mega 4). While you hold Nexus items, per threat point: enemy HP +4%,
  boss HP +5%, enemy damage +2%, spawns +1.5% (`NEXUS_THREAT`). Forming one also calls a ring of elites (2 per threat point).
  The HUD shows the current threat.
* **Recipes are learned with achievements** (Achievements > Nexus recipes). Fused recipes: beat the level their effect belongs to.
  Super recipes: form 3 to 5 Nexus items and beat Level 4 to 7. Mega recipes: form 8 Nexus items and beat Level 8 to 10. The Codex
  has a ✴ Nexus tab with every recipe, its threat and how often you've formed it. A fusion card for a recipe you haven't learned
  says so.

| Tier | Recipes |
|---|---|
| Fused (11) | Solar Requiem, Whiteout Choir, Thunderhead Engine, Rotbloom Sermon, Siegebreaker, Endless Spiral, The Verdict, Kaleidoscope, Starhunter Array, Infinite Bloom, Red Covenant |
| Super (6) | Cataclysm Furnace, Absolute Zero, Storm Cathedral, Blight Mother, Iron Maelstrom, Night Parliament |
| Mega (3) | The Last Sun, Godstorm, Crimson Throne |

**Balance (bot tested, invulnerable player, 4 level 5 Megas injected).** A Mega Nexus does about 1.7× the damage of a normal Mega
(5 parts at full strength against 1 + 4 × 50%). With three Mega Nexus items (threat 12) Level 10 is only slightly easier than with
four normal Megas, so the threat roughly cancels the power gain. Levels 13 (Nexus Spire) and 14 (Event Horizon) are the Nexus
levels, meant for full Nexus builds: with only that injected build they put about 4× and 5× the pressure of the Level 10 baseline
on you, and the 10:00 boss survives, so they need a fuller build than the bot had. Hand playtests should drive tuning.

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
always available to that character even if the item is still locked for others, but never before its category:
no effect works in a run until its category is unlocked.

## 6. Characters (15, one per weapon)

Each locked hero is earned with another hero: beat a level while playing them, and master a weapon (that item's fusion
mastery, section 3). A hero is also only playable (or earned) once every category of their starting weapon is unlocked;
that requirement is added automatically and shows on the hero card. Per-hero level stats are tracked from this version on
(`charStages` in the save), so earlier runs don't count toward them; heroes already owned stay owned.

| Character | Starting weapon | Perk | Achievement | Price |
|---|---|---|---|---|
| Kael, Ember Warden | Ember Pistol | +10% damage | Start | |
| Mira, Frostweaver | Frost Fan | +15% area | Start | |
| Volt, Storm Runner | Arc Rifle | −8% cooldowns | Start | |
| Briar, Thornkeeper | Thorn Spitter | +20% max HP, +0.5 regen | Beat Level 1 with Kael, master Ember Pistol (+ Poison) | free |
| Corvin, Rimeguard | Rime Lance | +10% area, +10% max HP | Beat Level 2 with Mira, master Frost Fan | ● 600 |
| Grim, Scrapper | Scrap Blaster | +2 armor | Beat Level 2 with Briar, master Thorn Spitter (+ Knockback) | ● 700 |
| Sable, Wanderer | Boomerang Glaive | +15% move speed | Beat Level 3 with Volt, master Arc Rifle (+ Pierce) | ● 800 |
| Tamsin, Stormcaller | Arc Halo | −10% cooldowns, −10% max HP | Beat Level 4 with Corvin, master Rime Lance | ● 1200 |
| Lyra, Gambler | Helix Cannon | +10% crit chance | Beat Level 4 with Grim, master Scrap Blaster (+ Crit) | ● 1000 |
| Juno, Trickshot | Ricochet Disc | +15% projectile speed | Beat Level 5 with Sable, master Boomerang Glaive (+ Ricochet) | ● 1200 |
| Orrin, Tinker | Seeker Swarm | +20% duration | Beat Level 6 with Juno, master Ricochet Disc (+ Homing) | ● 1500 |
| Nyx, Fractured | Splitter Orb | +1 projectile, −20% max HP | Beat Level 7 with Lyra, master Helix Cannon (+ Split) | ● 1800 |
| Wren, Shardwright | Shard Cannon | +15% damage, +10% XP | Beat Level 8 with Nyx, master Splitter Orb (+ Split) | ● 2500 |
| Vesper, Nightblood | Blood Lance | Lance hits heal 2% of damage | Beat Level 8 with Orrin, master Seeker Swarm (+ Vampiric) | ● 2500 |
| Morrow, Tidecaller | Crimson Tide | +1 HP/s, +15% duration | Beat Level 9 with Vesper, master Blood Lance (+ Vampiric) | ● 3000 |

### Archetypes

On top of their perk, every hero has an **archetype** (`arch` in `CHARACTERS`): passive bonuses that reward a build style
without forcing it. Three kinds, all editable on the admin Characters tab:

* **Effect strength** (`eff`): +x to every stack of that effect on every hit. 0.3 means 10 Burn stacks act like 13:
  more Burn damage, a deeper Chill slow, more Shock arcs, more crit chance and crit damage, more Pierce/Ricochet,
  and so on. It only boosts effects you already carry, so it pays off once you lean in.
* **Combos** (`combo`, `'a+b'`): +x damage on every hit that carries both effects (from the pool, or from one item's own
  effects and fusion riders). The stats panel shows each combo as off, on some items, or on all bullets.
* **Slot damage** (`slot`): +x damage for items in that slot.

Level-up offers lean slightly toward new items with an archetype effect or slot (+0.5 weight, against 1 for any item and
+1 for one that shares an effect with something held), and their cards carry a ◆ archetype badge.

| Hero | Archetype | Effect strength | Combo (+20% damage) | Slot damage |
|---|---|---|---|---|
| Kael | Pyromancer | Burn +30% | Burn + Poison | |
| Mira | Cryomancer | Chill +30% | Chill + Burn | |
| Volt | Conduit | Shock +30% | Shock + Chill | |
| Briar | Plaguebearer | Poison +30% | Poison + Shock | |
| Corvin | Bulwark | Chill +20%, Force +20% | Chill + Force | |
| Grim | Bruiser | Force +30% | Force + Split | Deployables +10% |
| Sable | Skirmisher | Pierce +30% | Pierce + Homing | |
| Tamsin | Tempest | Shock +25% | Shock + Burn | Orbitals +15% |
| Lyra | Sharpshooter | Critical +30% | Critical + Shock | |
| Juno | Trickshot | Ricochet +30% | Ricochet + Critical | Weapons +10% |
| Orrin | Tinker | Homing +25% | | Orbitals +15%, Deployables +15% |
| Nyx | Fractalist | Split +30% | Split + Ricochet | |
| Wren | Artificer | Split +20%, Critical +20% | Split + Critical | |
| Vesper | Hemomancer | Vampiric +30% | Vampiric + Pierce | |
| Morrow | Bloodmage | Vampiric +25%, Poison +15% | | Spells +15% |

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
| 20:00 | **Overtime** if the Eclipse still lives: damage taken ×2, enemy HP ×1.6 and +50% spawns per minute, compounding. Clock turns red |

Every ~45s an Elite spawns (8× HP, drops a chest). Every 60s an encirclement wave rings you in.

### The map (world.js)
Each level is a square map `WORLD.size` (36,000 px, about 3 minutes across at base speed; `STAGES[].mapSize` overrides it) that
**wraps** at its edges. Only fixed things wrap (landmarks, anchors, the Map, zones, shrines): each is drawn and reached at its copy
nearest the player, so the horde and combat never deal with the wrap. Landmarks and anchor points come from a seed per level, so a
level looks the same every run; which anchors hold what is rolled per run. A minimap (top right) and a big pause map are centred on
the player. Every level hides a **Map** at least `WORLD.mapMin` of the map away from the start, with an edge arrow pointing to it;
finding it is a permanent unlock (`mapsFound` in the save) that shows that level's zones on both maps.

### Zones and materials (zones.js, materials.js)
Each level places `ZONE_RULES.perLevel` zones (3; levels 10+ get 4) from the themes open by that level (`ZONES[].from`), preferring
ones not yet cleared there, at anchors of its map. A zone's enemies (Warder, Striker, Caster, made per theme into `ENEMY_TYPES` as
`z_<zone>_<kind>`) are immune to all but the zone's two types (`only`; the first is a weakness), have ×`hp` HP (2.5) on top of the
run's growth, ×`xp` XP, and stay inside the zone: while the player is outside they walk back to their spot. A zone fills when the
player comes within `wake` px of its edge and empties (keeping who's left) past `sleep` px. The **Warden** (×`wardenHp` HP, rings of
16 bullets) clears the zone: a chest of 3+, `MAT_DROPS.warden` Essences and `wardenCat` Catalysts, plus `firstEss` / `firstCat` the
first time that zone is cleared in that level (`zonesCleared` in the save); later clears pay ×`repeat` (0.5). Levels 1 to 8 also
get a **sealed rift**, a zone from one or two levels later, open once that zone has been cleared in its own level.

**Materials** (`MATERIALS`, 28 in four families) are kept between runs in `SAVE.materials`: slot materials (elites 1-2 for a slot you
hold items in, chests 1 per item), Essences (zone enemies 30%, Wardens), attribute materials (bosses 3, elites 25% from Level 4) and
Catalysts (Wardens; bosses 60% for a Form Catalyst). Augments (v0.28) and Forge upgrades (v0.29) spend them.

### Damage types and the Bestiary
Every hit has a **type**: the effect of the item that fired it, plus its fusion riders (`hitTypes` in core.js). The shared pool
never changes a hit's type, so holding one Burn item doesn't make every bullet Burn damage. Burn and poison ticks are Burn and
Poison, shock arcs Shock, Split shrapnel Split, reactions both ingredients. Enemies list `weak`, `resist` and `only` effects
(items.js): weak ×1.5, resist ×0.5 (`DAMAGE_TYPES`), `only` = immune to every other type (zone enemies). A hit with several types
uses its best one. Weak hits show as bigger gold numbers with "!", resisted ones grey, immune ones "IMMUNE".

The **Bestiary** (Codex > 👁 Bestiary, `src/bestiary.js`) has three entries per enemy: Sighted (free once met), Studied (gold:
stats and attacks) and Mastered (gold once you've defeated `kills` of it: weaknesses, resistances, immunities). Prices are
`CODEX_COSTS` (normal 40 / 150 / 60 kills, boss 300 / 1000 / 3 kills). A mastered enemy can be a Fusion Lab foe.

### Chests
Elites and bosses drop a chest. A chest holds **1, 3 or 5 upgrades**, rolled when it drops (`DROPS.chest` in items.js: `three` 25%,
`five` 5%), so its look tells you what is inside: blue 1, purple Rare 3, gold Legendary 5, each with a beam of light and a glow.
Luck raises the odds: a 3 chest `three × (1 + luck × Luck)`, a 5 chest `five × (1 + 2 × luck × Luck)`, with `luck` 3, so at the
Forge's max Luck (15%) the odds are about 54 / 36 / 10. `elite` and `boss` are the least a chest from them holds (boss: 3).
Each upgrade is a level for a held item, or a fusion that is ready (you choose what remains after the chest closes), or a heal or
gold when nothing can level. Opening one pauses on the chest screen. An arrow at the screen edge points to any chest off screen.
You have a small hitbox (bullet-hell style) and a **dash** (Space / Shift) with brief invulnerability.

## 9. Levels

Each level is unlocked by beating the one before it. A level multiplies enemy HP (with a ramp that grows with the run clock, cubed),
spawn rate, enemy damage and boss HP, and also XP and gold so a build can keep up. Items arrive at the level's start level
(new items and freshly fused ones), so later levels skip the early picks.

| Level | Name | Enemy HP | Late ramp | Spawns | Damage | Boss HP | XP | Gold | Items start at |
|---|---|---|---|---|---|---|---|---|---|
| 1 | The Rift | ×1 | 0 | ×1 | ×1 | ×1 | ×1 | ×1 | 1 |
| 2 | Ashen Verge | ×1.44 | 0.5 | ×1.05 | ×1.1 | ×1.92 | ×1.4 | ×1.2 | 1 |
| 3 | Frostbound Deep | ×1.89 | 1.2 | ×1.1 | ×1.2 | ×3.51 | ×1.9 | ×1.4 | 2 |
| 4 | Storm Spire | ×2.24 | 2.1 | ×1.15 | ×1.3 | ×5.6 | ×2.6 | ×1.6 | 2 |
| 5 | Blight Garden | ×2.61 | 3.4 | ×1.2 | ×1.4 | ×9.42 | ×3.4 | ×1.8 | 3 |
| 6 | Mirror Wastes | ×3 | 5 | ×1.25 | ×1.5 | ×15 | ×4.4 | ×2 | 3 |
| 7 | Hunter's Moon | ×3.45 | 9 | ×1.3 | ×1.6 | ×30 | ×6 | ×2.3 | 4 |
| 8 | Shattered Crown | ×3.9 | 16 | ×1.35 | ×1.7 | ×60 | ×8 | ×2.6 | 4 |
| 9 | Crimson Expanse | ×4.35 | 27 | ×1.4 | ×1.8 | ×123 | ×11 | ×3 | 5 |
| 10 | The Void Heart | ×4.73 | 68 | ×1.45 | ×1.9 | ×2025 | ×16 | ×3.5 | 5 |
| 11 | The Echo Loom | ×5.4 | 90 | ×1.5 | ×2 | ×3200 | ×20 | ×4 | 5 |
| 12 | Singularity Choir | ×6.6 | 120 | ×1.55 | ×2.1 | ×5200 | ×24 | ×4.5 | 5 |
| 13 | Nexus Spire | ×7.4 | 150 | ×1.6 | ×2.2 | ×8000 | ×30 | ×5 | 5 |
| 14 | Event Horizon | ×8.4 | 190 | ×1.65 | ×2.3 | ×12000 | ×36 | ×5.6 | 5 |

Enemy HP is `hp × (1 + ramp × f³)`, where f goes from 0 at 0:00 to 1 at 15:00. All values are editable in the admin panel (Progression > Levels).

**Fusion chain rebalance (v0.18).** Fusions now keep 100% of the kept item and add chained attacks, so fused builds hit harder.
Measured on the test canvas (14 random keepers, random partners, level 5, the same targets) against the old rules: Fused items
deal about **1.6×** the damage they used to, Super about **1.7×**, Mega about **1.3×**, and the chains add area damage on top,
which helps most against crowds. Level 1, where fusion is first learned, is unchanged; enemy HP and boss HP of Levels 2 to 10
went up by ×1.2 (Level 2) to ×1.5 (Levels 6 to 8), and ×1.35 on Level 10. Mega fusion now opens with **Beat Level 7** (was 6),
since Super builds now carry Level 6 more easily. **Levels 11 (The Echo Loom) and 12 (Singularity Choir)** are new endgame levels
for chained Mega builds, about ×1.5 and ×2.4 the end-of-run enemy HP of Level 10. First-pass numbers from measurements, not
hand playtests.

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
