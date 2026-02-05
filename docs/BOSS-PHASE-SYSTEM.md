# Boss Phase System

This document describes the implementation of boss phase mechanics - health-triggered abilities that bosses use during combat.

## Overview

Bosses in Dungeon Link have special mechanics that trigger at specific health thresholds. These phases add strategic depth to boss encounters by introducing new challenges as the fight progresses.

## Boss Mechanics by Floor

### Floor 1-2: The Fallen Guardians

**Lord Ossian the Betrayer** (Skeleton King)
- **Call of the Fallen** (50% HP): Summons 3 skeleton knight minions
- Visual: Purple summoning portals appear around the boss

**Silkweaver the Broodmother** (Giant Spider)
- **Venomous Eruption** (every 15s): Releases toxic cloud (interval-based, not health-triggered)

### Floor 3-4: The Corrupted Depths

**Kragoth the Ironbreaker** (Orc Warlord)
- **Berserker Fury** (30% HP): +50% damage, boss grows slightly and glows red
- **Thundering Roar** (every 20s): Stuns nearby foes (interval-based)

**Velindra the Deathweaver** (Lich)
- **Soul Freeze** (every 25s): Encases victim in ice (interval-based)
- **Legion of Sorrow** (25% HP): Summons 4 undead minions

### Floor 5-6: The Ancient Horrors

**Emberclaw the Eternal Flame** (Dragon)
- **Inferno Torrent** (every 12s): Fire breath attack (interval-based)
- **Rain of Cinders** (50% HP): Spawns 5 fire pools around the arena

**Nethris the Hollow** (Void Lord)
- **Gravitational Collapse** (every 15s): Creates gravity well (interval-based)
- **Tears in Reality** (every 12s): Opens void rifts (interval-based)

### Floor 7+: The Primordial Terrors

**Gorvax the World-Ender** (Titan)
- **Falling Stars** (every 20s): Calls down celestial wrath (interval-based)
- **Primordial Barrier** (20% HP): Becomes invulnerable for 5s and regenerates 20% HP

**The Nameless Depth** (Old God)
- **Embrace of the Deep** (60% and 30% HP): Spawns 2 tentacle minions at each threshold
- **Echoes of Oblivion** (every 25s): Fractures sanity with whispers (interval-based)

## Implementation Details

### Server Side

**Files involved:**
- `server/src/data/bosses.ts` - Boss definitions and phase effect configurations
- `server/src/game/GameState.ts` - Phase trigger logic and effect application
- `server/src/game/Combat.ts` - Invulnerability and enrage damage handling

**Key types:**

```typescript
// Boss phase effect types
type BossPhaseEffect = {
  type: 'summon' | 'enrage' | 'shield' | 'regen' | 'aoe_burst';
  summonCount?: number;
  summonType?: 'skeleton' | 'zombie' | 'tentacle' | 'add';
  damageMultiplier?: number;
  duration?: number;
  regenPercent?: number;
  regenDuration?: number;
}

// Enemy flags for active phase effects
interface Enemy {
  // ... other fields
  isEnraged?: boolean;       // Damage multiplier active
  isInvulnerable?: boolean;  // Cannot take damage
  isRegenerating?: boolean;  // Healing over time active
  summonedById?: string;     // If summoned by a boss
}
```

**Phase checking flow:**
1. After damage is dealt to a boss, `checkBossPhases()` is called
2. Calculates current health percentage
3. Checks which mechanics should trigger at this health level
4. For each untriggered mechanic:
   - Marks it as triggered (prevents re-triggering)
   - Applies the effect (spawn minions, set flags, etc.)
   - Queues a BOSS_PHASE_CHANGE event for broadcast

### Client Side

**Files involved:**
- `client/src/scenes/GameScene.ts` - Visual effects and announcement handling

**Phase visual effects:**

| Phase Type | Visual Effect |
|------------|---------------|
| Enrage | Boss grows 15%, red tint, expanding red shockwave |
| Shield | Blue tint, pulsing blue bubble around boss |
| Summon | Purple summoning portals appear around boss |
| Regenerate | Rising green particles, green glow |
| Frenzy | Screen shake, expanding fire rings |

**Announcement banner:**
- Displays boss name and mechanic name
- Color-coded by phase type
- Animates in/out with 2 second display duration

### Network Messages

```typescript
// Server -> Client
{
  type: 'BOSS_PHASE_CHANGE',
  bossId: string,
  bossName: string,
  phase: BossPhaseType,
  mechanicName: string
}
```

## Combat Interactions

### Invulnerability

When a boss has `isInvulnerable = true`:
- All incoming damage is blocked (shows 0 damage)
- DoT ticks continue but deal no damage
- Shield bubble visual effect is displayed

### Enrage

When a boss has `isEnraged = true`:
- Boss attacks deal 50% more damage
- Boss sprite has red tint
- Boss sprite is 15% larger

### Summoned Minions

Minions spawned by bosses:
- Have `summonedById` set to the boss's ID
- Scale with floor level (base HP: 50 + floor * 20)
- Spawn in a circle around the boss
- Do not drop loot

## Testing Boss Phases

To test boss phases:

1. Start a run and progress to the floor with the desired boss
2. Engage the boss and deal damage
3. Watch for phase triggers at the specified health thresholds
4. Verify visual effects and mechanic behaviors

**Debug logging:**
Server logs boss phase triggers with `[BOSS PHASE]` prefix:
```
[BOSS PHASE] Lord Ossian the Betrayer triggered Call of the Fallen at 49.5% health
[BOSS PHASE] Spawned Risen Knight at (1234, 567)
```

## Considerations

### WebSocket Performance

Boss phase events follow the same optimized broadcast pattern as combat events:
- Events are queued during the game tick
- Broadcast happens once per tick via `update()` return value
- Doesn't add to STATE_UPDATE payload size

### Phase Persistence

Phase triggers are tracked in `RunTracking.bossPhaseTriggered` (Set of strings):
- Key format: `{bossId}_{mechanicId}`
- Prevents same phase from triggering multiple times
- Cleared when run ends

---

*Last updated: February 2026*
