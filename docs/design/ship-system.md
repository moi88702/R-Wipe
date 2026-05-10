# Ship System Design Reference

> Reference for the manual and future development. All tables reflect the live codebase design.

---

## 1. Ship Size Tiers

Ships exist in **5 physical size tiers**. Tier determines module physical scale (`sideLengthPx`),
mass, top speed, and acceleration. Within each tier, two **hull variants** set the slot budget —
the same module pool is shared between both variants.

| Tier | Name         | Light Hull (fewer slots) | Heavy Hull (more slots) | `SIDE_PX` |
|------|--------------|--------------------------|-------------------------|-----------|
| 1    | Small        | Frigate                  | Destroyer               | 60 px     |
| 2    | Medium       | Cruiser                  | Heavy Cruiser           | 110 px    |
| 3    | Large        | Battleship               | Battlecruiser           | 185 px    |
| 4    | Capital      | Capital                  | Heavy Capital           | 270 px    |
| 5    | Supercap     | SC Cruiser               | Supercap                | 400 px    |

**Internal class numbers** (current implementation): Classes 1–9 map to tiers by
`tier = ceil(class / 2)`. Odd classes are light hulls; even classes are heavy hulls.

| Old Class | New Tier | Hull Variant | Hull Name    |
|-----------|----------|--------------|--------------|
| C1        | Tier 1   | light        | Frigate      |
| C2        | Tier 1   | heavy        | Destroyer    |
| C3        | Tier 2   | light        | Cruiser      |
| C4        | Tier 2   | heavy        | Heavy Cruiser|
| C5        | Tier 3   | light        | Battleship   |
| C6        | Tier 3   | heavy        | Battlecruiser|
| C7        | Tier 4   | light        | Capital      |
| C8        | Tier 4   | heavy        | Heavy Capital|
| C9        | Tier 5   | heavy        | Supercap     |

> Phase 2: Rename `ShipClass = 1|2|...|9` → `ShipClass = 1|2|3|4|5` with `HullVariant`
> replacing even/odd encoding. Module IDs will be renumbered (`-c3-` → `-c2-`, etc.).

---

## 2. Slot Budgets by Hull

All slots: W = weapon points, E = external points, I = internal points.

| Hull          | W  | E  | I  | Max Parts |
|---------------|----|----|----|-----------|
| Frigate       |  4 |  4 |  4 |    40     |
| Destroyer     |  6 |  6 |  6 |    50     |
| Cruiser       |  7 |  8 |  7 |    60     |
| Heavy Cruiser | 10 | 12 | 10 |    75     |
| Battleship    | 12 | 14 | 12 |    90     |
| Battlecruiser | 16 | 18 | 16 |   110     |
| Capital       | 20 | 24 | 20 |   130     |
| Heavy Capital | 26 | 30 | 26 |   160     |
| SC Cruiser    | 32 | 38 | 32 |   200     |
| Supercap      | 42 | 50 | 42 |   250     |

> Note: the slot budgets above are design targets. Current registry entries use legacy
> per-core slot values that will be aligned to this table in a future pass.

---

## 3. Module Physical Mass

Mass affects ship acceleration and turn rate via `F = ma`. Two components:

### 3a. Hull base mass (bare frame, no modules)

`HULL_BASE_MASS_KG[tier]` — 10 × tier base mass:

| Tier | Hull Base Mass  |
|------|-----------------|
| 1    |     5,000 kg    |
| 2    |    25,000 kg    |
| 3    |   125,000 kg    |
| 4    |   600,000 kg    |
| 5    | 3,000,000 kg    |

### 3b. Per-module mass formula

```
physicalMassKg = TIER_BASE_MASS_KG[tier] × KIND_MASS_FACTOR[partKind]
```

`TIER_BASE_MASS_KG` — max mass for heaviest module kind at each tier:

| Tier | Base Mass   | Example: heaviest (core/armor) | Lightest (crew/cargo) |
|------|-------------|--------------------------------|------------------------|
| 1    |     500 kg  | 500 kg                         | 100 kg                 |
| 2    |   2,500 kg  | 2,500 kg                       | 500 kg                 |
| 3    |  12,500 kg  | 12,500 kg                      | 2,500 kg               |
| 4    |  60,000 kg  | 60,000 kg                      | 12,000 kg              |
| 5    | 300,000 kg  | 300,000 kg                     | 60,000 kg              |

`KIND_MASS_FACTOR` — fraction of base mass per functional kind:

| Part Kind       | Factor | T1 Mass (kg) | Category             |
|-----------------|--------|--------------|----------------------|
| core            | 1.00   | 500          | Heavy structural     |
| armor           | 1.00   | 500          | Heavy structural     |
| reactor         | 0.90   | 450          | Heavy power          |
| cannon          | 0.70   | 350          | Heavy weapon         |
| torpedo         | 0.60   | 300          | Heavy weapon         |
| plasma          | 0.60   | 300          | Heavy weapon         |
| factory-bay     | 0.60   | 300          | Heavy support        |
| shield          | 0.45   | 225          | Defense              |
| laser           | 0.50   | 250          | Light weapon         |
| warp-nacelle    | 0.50   | 250          | Drive                |
| gravity-drive   | 0.50   | 250          | Drive                |
| ion-engine      | 0.40   | 200          | Engine               |
| thruster        | 0.40   | 200          | Engine               |
| warp-stabilizer | 0.40   | 200          | Engine               |
| converter-unit  | 0.34   | 170          | Support              |
| cloak           | 0.30   | 150          | Defense              |
| radar           | 0.28   | 140          | Sensor               |
| lidar           | 0.28   | 140          | Sensor               |
| frame           | 0.26   | 130          | Structure            |
| scrambler       | 0.24   | 120          | EW                   |
| webber          | 0.24   | 120          | EW                   |
| crew-quarters   | 0.20   | 100          | Light support        |
| cargo-hold      | 0.20   | 100          | Light utility        |

**Total ship mass example (Tier 1, 20 modules, mixed):**
- Hull base: 5,000 kg
- 2× cannon (350 kg each): 700 kg
- 4× thruster (200 kg each): 800 kg
- 1× reactor (450 kg): 450 kg
- 13× frame (130 kg each): 1,690 kg
- **Total: ~8,640 kg** (8.6 tonnes — plausible light frigate)

---

## 4. Mass-Based Physics

Total ship mass drives acceleration and turn rate:

```
totalMassKg = HULL_BASE_MASS_KG[tier] + Σ moduleMassKg(partKind, tier)
acceleration  = totalThrustMs2 / totalMassKg     (m/s² — F = ma)
turnRateRadPs = TURN_RATE_BASE[tier] × sqrt(hullMass / totalMass)
```

Turn rate can be boosted by thruster modules (via `thrustMs2`) and future
gyroscope/RCS modules (via `turnRateBoostFrac` in `ShipEffectiveStats`).

---

## 5. Weapon Range by Class

Weapon ranges scale with size class. Larger weapons fire farther but struggle
to hit small, fast targets (see Section 7 — Accuracy vs. Ship Size).

| Class | Cannon (km) | Laser (km) | Torpedo (km) |
|-------|-------------|------------|--------------|
| C1    | 120         | 60         | 250          |
| C2    | 175         | 90         | 360          |
| C3    | 250         | 130        | 520          |
| C4    | 320         | 165        | 680          |
| C5    | 400         | 200        | 850          |
| C6    | 490         | 245        | 1,020        |
| C7    | 580         | 290        | 1,180        |
| C8    | 680         | 340        | 1,380        |
| C9    | 780 (560 target) | 390 (280 target) | 1,550 (1,100 target) |

---

## 6. Weapon Tracking (Turrets)

Station base turrets rotate their barrel toward the player. Max rotation rate
and fire cone scale with weapon size class — larger turrets track more slowly.

| Class | Turn Rate (°/s) | Fire Cone (°) |
|-------|-----------------|---------------|
| C1–C2 | 180             | ±8            |
| C3–C4 | 120             | ±6            |
| C5–C6 |  80             | ±5            |
| C7–C8 |  50             | ±4            |
| C9    |  30             | ±3            |

---

## 7. Accuracy vs. Ship Size

Large weapons fire larger, slower projectiles that have difficulty tracking
small, fast ships. Miss chance formula:

```
missChance = clamp((weaponClass - targetClass) × 0.09, 0, 0.80)
```

| Weapon vs. Target | Miss Chance |
|-------------------|-------------|
| C1 vs C1          | 0%          |
| C3 vs C1          | 18%         |
| C5 vs C1          | 36%         |
| C7 vs C1          | 54%         |
| C9 vs C1          | 72%         |
| C9 vs C2          | 63%         |

Applied at: laser fire (cone roll) and projectile hit check (random roll).

---

## 8. Missile / Torpedo Physics

Larger missiles have higher top speed but worse acceleration and wider
turning circles. Turn drag penalises speed during tight manoeuvres.

`TURN_DRAG = 0.30` — fraction of speed lost per radian of turn per second.

| Class | Top Speed (km/s) | Accel (m/s²) | Turn Rate (°/s) |
|-------|-----------------|--------------|-----------------|
| C1    | 0.8             | 600          | 90              |
| C2    | 1.0             | 480          | 75              |
| C3    | 1.3             | 380          | 62              |
| C4    | 1.7             | 300          | 50              |
| C5    | 2.2             | 240          | 40              |
| C6    | 2.8             | 190          | 32              |
| C7    | 3.5             | 150          | 25              |
| C8    | 4.3             | 120          | 20              |
| C9    | 5.2             | 95           | 16              |

---

## 9. Core Rotation (Ship Builder)

In the ship builder, the core polygon can be rotated in **5-degree snaps**:
- **Q** — rotate counter-clockwise 5°
- **E** — rotate clockwise 5°

Rotation is stored in `SolarShipBlueprint.coreRotationRad` (radians, range `[0, 2π)`).
Negative values and values ≥ 360° are normalised automatically.
The rotation propagates through all attached modules via `GeometryEngine.deriveAllGeometries()`.

---

## 10. Planned: Phase 2 — Full 5-Tier Migration

When ship classes are consolidated from 9 → 5:

1. `ShipClass = 1|2|...|9` → `ShipClass = 1|2|3|4|5`
2. `HullVariant` replaces even/odd encoding on all types
3. Module IDs renamed: `-c3-` → `-c2-`, `-c5-` → `-c3-`, etc.
4. `SIDE_PX` table shrinks: `{1:60, 2:110, 3:185, 4:270, 5:400}`
5. Faction blueprint registries updated
6. E2E fixtures updated
7. Saved blueprint migration: old `sizeClass > 5` rounded down via `ceil(cls/2)`
