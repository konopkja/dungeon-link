# Bug Fixes - February 2026

This document describes the bugs that were identified and fixed, along with the elegant solutions implemented.

---

## 1. Memory Leak: Global Tracking Maps Not Cleaned Up

### Problem
The `GameStateManager` class had 13+ global `Map` objects to track per-entity state (cooldowns, aggro times, charge states, etc.). When a run was deleted, these Maps retained stale entity IDs forever, causing unbounded memory growth.

**Affected Maps:**
- `attackCooldowns`
- `bossAbilityCooldowns`
- `bossAoECooldowns`
- `eliteAttackCooldowns`
- `groundEffectDamageTicks`
- `playerMovement`
- `playerMomentum`
- `bossFightStartTimes`
- `enemyAggroTimes`
- `enemyLeashTimers`
- `playerDeathTimes`
- `enemyCharging`
- `enemyChargeCooldowns`

### Solution
Moved all per-run tracking into a `RunTracking` interface that is stored as part of `RunState`. When a run is deleted, all tracking data is automatically garbage collected.

**Files Changed:**
- `shared/types.ts` - Added `RunTracking` interface and `createRunTracking()` factory
- `server/src/game/GameState.ts` - Replaced `this.*` Maps with `state.tracking.*`

**Key Code:**
```typescript
// shared/types.ts
export interface RunTracking {
  attackCooldowns: Map<string, number>;
  bossAbilityCooldowns: Map<string, number>;
  // ... all tracking Maps
}

export function createRunTracking(): RunTracking {
  return {
    attackCooldowns: new Map(),
    // ... all initialized as empty Maps
  };
}

// Now part of RunState - automatically cleaned up when run is deleted
export interface RunState {
  // ... existing fields
  tracking: RunTracking;
}
```

---

## 2. Patrol Pathfinding: Enemies Cut Through Walls

### Problem
Patrolling enemies moved in direct lines toward room centers, ignoring walls and corridors. This caused patrols to visually "teleport" through solid geometry.

**Old Code (GameState.ts):**
```typescript
// Move toward target room center (ignores walls)
const targetX = targetRoom.x + targetRoom.width / 2;
const targetY = targetRoom.y + targetRoom.height / 2;
enemy.position.x += (dx / dist) * speed * deltaTime;
```

### Solution
Pre-calculate waypoints that follow corridor paths when spawning patrols. Patrols now move waypoint-to-waypoint, going through corridor midpoints between rooms.

**Files Changed:**
- `shared/types.ts` - Added `patrolWaypoints`, `currentWaypointIndex`, `patrolDirection` to `Enemy`
- `server/src/game/DungeonGenerator.ts` - Added `getCorridorMidpoint()`, `calculatePatrolWaypoints()`
- `server/src/game/GameState.ts` - Updated patrol movement to follow waypoints

**Key Code:**
```typescript
// DungeonGenerator.ts - Calculate waypoints through corridors
function calculatePatrolWaypoints(rooms: Room[], patrolRoute: string[]): Position[] {
  const waypoints: Position[] = [];
  for (let i = 0; i < patrolRoute.length; i++) {
    const room = rooms.find(r => r.id === patrolRoute[i]);
    waypoints.push({ x: room.x + room.width / 2, y: room.y + room.height / 2 });

    if (i < patrolRoute.length - 1) {
      const nextRoom = rooms.find(r => r.id === patrolRoute[i + 1]);
      waypoints.push(getCorridorMidpoint(room, nextRoom));
    }
  }
  return waypoints;
}

// GameState.ts - Follow waypoints instead of direct line
const targetWaypoint = enemy.patrolWaypoints[enemy.currentWaypointIndex];
const dx = targetWaypoint.x - enemy.position.x;
// ... move toward waypoint
```

---

## 3. Patrol Aggro Delay: Patrols Don't Attack Immediately

### Problem
When a player entered a room with a patrolling enemy, the patrol would stop but not attack for 1 full second (the standard `ENEMY_AGGRO_DELAY`). This felt unresponsive since patrols are supposed to be actively seeking intruders.

### Solution
Added a `wasPatrolling` flag and a reduced aggro delay (`ENEMY_AGGRO_DELAY_PATROL = 0.3s`) for ex-patrollers. Patrols are already alert, so they engage faster.

**Files Changed:**
- `shared/types.ts` - Added `wasPatrolling?: boolean` to `Enemy`
- `server/src/game/GameState.ts` - Set flag when patrol enters combat, use reduced delay

**Key Code:**
```typescript
// When patrol enters combat
if (enemy.isPatrolling) {
  enemy.isPatrolling = false;
  enemy.wasPatrolling = true; // Flag for reduced aggro delay
  // ...
}

// When checking aggro delay
const requiredDelay = enemy.wasPatrolling
  ? this.ENEMY_AGGRO_DELAY_PATROL  // 0.3s
  : this.ENEMY_AGGRO_DELAY;         // 1.0s
```

---

## 4. Room State Issues Between Sessions

### Problem
When leaving a game and starting a new one, room state could be corrupted because tracking Maps retained data from the previous session.

### Solution
This was fixed by the same solution as Bug #1 - moving tracking into `RunState`. Each new run gets a fresh `createRunTracking()` call, ensuring no state leakage.

---

## 5. Multiplayer Removal (Simplification)

### Change
Removed all multiplayer/party functionality to simplify the game and reduce bugs. The game is now single-player only.

**Files Changed:**
- `server/src/game/GameState.ts` - Removed `joinRun()` method
- `server/src/WebSocketServer.ts` - Removed `JOIN_RUN` handler, `PLAYER_LEFT` broadcast
- `client/src/network/WebSocketClient.ts` - Removed `joinRun()`, `getInviteLink()`
- `client/src/scenes/GameScene.ts` - Removed invite button
- `client/src/scenes/MenuScene.ts` - Removed join party logic
- `client/src/scenes/BootScene.ts` - Removed URL query parameter handling

---

## 6. Patrol Not Entering Combat: Room Array Timing

### Problem
When a patrol physically entered the player's room, the player couldn't auto-attack the patrol, and the patrol wouldn't attack the player. The patrol would just stand there.

**Root Cause:**
The patrol detection code (which moves patrols from their original room's `enemies` array to the current room's `enemies` array) was running AFTER the player auto-attack code. Since auto-attacks only target enemies in `currentRoom.enemies`, the patrol wasn't found.

### Solution
Move the patrol detection and room-swap code to run BEFORE player auto-attacks.

**File Changed:** `server/src/game/GameState.ts`

**Critical Order of Operations (lines ~725-920):**
```typescript
// 1. FIRST: Detect and move patrols that entered the player's room
if (currentRoom) {
  for (const otherRoom of state.dungeon.rooms) {
    // Check if any patrol from otherRoom is physically inside currentRoom
    // If so, move it to currentRoom.enemies
  }
}

// 2. THEN: Process player auto-attacks (can now find patrols)
if (currentRoom && !currentRoom.cleared) {
  for (const player of state.players) {
    const targetEnemy = currentRoom.enemies.find(e => e.id === player.targetId);
    // ...
  }
}

// 3. THEN: Process enemy AI (patrols enter combat mode here)
for (const enemy of currentRoom.enemies) {
  if (enemy.isPatrolling) {
    enemy.isPatrolling = false;
    enemy.wasPatrolling = true;
    // ...
  }
}
```

---

## 7. Patrol Not Attacking in Cleared Rooms

### Problem
Even after fixing the room array timing, patrols that entered a CLEARED room (player had already killed all enemies) wouldn't attack. They would just stand still.

**Root Cause:**
The enemy AI loop has a guard condition: `if (currentRoom && !currentRoom.cleared)`. If the room is cleared, the entire enemy AI loop is skipped, so the patrol never transitions out of `isPatrolling` mode and never attacks.

### Solution
When a patrol is moved to a cleared room, un-clear the room so the enemy AI loop processes the patrol.

**File Changed:** `server/src/game/GameState.ts`

**Key Code:**
```typescript
// Move patrols to current room's enemies array
for (const patrol of patrolsToMove) {
  otherRoom.enemies = otherRoom.enemies.filter(e => e.id !== patrol.id);
  currentRoom.enemies.push(patrol);
  patrol.currentRoomId = currentRoom.id;

  // BUG FIX: Un-clear the room so the enemy AI loop will process the patrol
  if (currentRoom.cleared) {
    currentRoom.cleared = false;
  }
}
```

---

## CRITICAL: Patrol System Flow Summary

Understanding the complete patrol flow is essential to avoid breaking this mechanic:

### Patrol Lifecycle

1. **Spawn (DungeonGenerator.ts)**
   - Patrols spawn on floor 2+ with `isPatrolling: true`
   - Pre-calculated `patrolWaypoints` follow corridor paths
   - Added to starting room's `enemies` array

2. **Idle Movement (GameState.ts, ~line 1865)**
   - Runs for rooms WITHOUT players (`room.id !== currentRoomId`)
   - Patrol follows waypoints, moves between rooms
   - When crossing room boundaries, patrol is moved to new room's `enemies` array

3. **Detection When Player Present (GameState.ts, ~line 725)**
   - Runs BEFORE auto-attacks
   - Checks all rooms for patrols physically inside `currentRoom`
   - Moves detected patrols to `currentRoom.enemies`
   - Un-clears the room if it was cleared

4. **Combat Transition (GameState.ts, ~line 934)**
   - When patrol is processed in enemy AI loop:
     - `isPatrolling = false`
     - `wasPatrolling = true` (for reduced aggro delay)
     - Patrol route/waypoints cleared
     - Aggro time reset

5. **Attack (GameState.ts, ~line 1280)**
   - After aggro delay (0.3s for ex-patrollers, 1.0s for normal)
   - Patrol finds nearest player and attacks

### Key Invariants

- **Patrol detection MUST run before auto-attacks** - Otherwise players can't target patrols
- **Room MUST be un-cleared when patrol enters** - Otherwise enemy AI skips the patrol
- **`isPatrolling` MUST be set to false in combat** - Otherwise patrol won't attack
- **`wasPatrolling` MUST be set for reduced aggro** - Otherwise patrol waits full 1.0s

### Debug Logging

The patrol system has extensive debug logging (enable by checking server output):
- `[DEBUG] Patrol X in room_Y, pos=(x,y), waypoint=N/M` - Patrol location every few seconds
- `[DEBUG] Patrol X detected in player room!` - Patrol entered player's room
- `[DEBUG] Moved patrol X from room_Y to room_Z` - Room array swap occurred
- `[DEBUG] Room X un-cleared due to patrol entering` - Cleared room was un-cleared
- `[DEBUG] Patrolling enemy X entered combat mode` - Patrol transitioned to combat

---

## Testing

New test file created: `server/src/tests/patrol-system.test.ts`

Tests cover:
- Patrol waypoint calculation
- Corridor midpoint calculation
- Multi-room patrol routes
- State transition (patrol -> combat)
- RunTracking initialization and cleanup
- Aggro delay differences for patrollers vs normal enemies
- Waypoint navigation direction reversal

Run tests:
```bash
cd server && npx vitest run src/tests/patrol-system.test.ts
```

---

## Summary of Changes by File

| File | Changes |
|------|---------|
| `shared/types.ts` | Added `RunTracking`, `createRunTracking()`, patrol waypoint fields |
| `server/src/game/GameState.ts` | Use `state.tracking.*`, patrol aggro delay, removed `joinRun` |
| `server/src/game/DungeonGenerator.ts` | Added waypoint calculation functions |
| `server/src/WebSocketServer.ts` | Removed multiplayer handlers |
| `client/src/scenes/GameScene.ts` | Removed invite button |
| `client/src/scenes/MenuScene.ts` | Removed join party logic |
| `client/src/scenes/BootScene.ts` | Removed URL join parameter |
| `client/src/network/WebSocketClient.ts` | Removed `joinRun`, `getInviteLink` |
| `server/src/tests/patrol-system.test.ts` | New comprehensive test file |

---

# Room Variant System - New Feature

This section documents the room variant system added to increase dungeon variety without introducing complex collision/pathfinding systems.

---

## 8. Room Variant System Overview

### Design Philosophy
80% of room variety comes from enemy placement and visual effects, not geometry changes. This approach achieves significant gameplay variety with minimal code changes and zero risk of breaking existing systems.

### Components

**Room Variants** (6 types) - Enemy formation patterns:
| Variant | Description | When Used |
|---------|-------------|-----------|
| `standard` | Random enemy placement | Default |
| `ambush` | Enemies hidden until player reaches center | Floor 2+ |
| `guardian` | Elite in center, minions in circle around | Floor 3+ |
| `swarm` | All enemies clustered in one corner | Any |
| `arena` | Enemies spread around room perimeter | Boss rooms |
| `gauntlet` | Enemies spread along longest axis | Elongated rooms |

**Room Modifiers** (4 types) - Environmental effects:
| Modifier | Effect | Visual |
|----------|--------|--------|
| `dark` | Reduced visibility (client-side) | Dark overlay (50% alpha) |
| `burning` | 5 + floor*2 damage every 2 seconds | Orange-red overlay |
| `cursed` | -10 armor, -5 resist while in room | Purple overlay |
| `blessed` | +10 armor, +5 crit while in room (rare) | Gold overlay |

---

## 9. Room Variant: Ambush System

### How It Works

1. **Generation**: When room variant is `ambush`, enemies spawn with `isHidden: true`
2. **Hidden State**: Hidden enemies don't render, can't attack, can't be targeted
3. **Trigger**: When player reaches within 60 units of room center, ambush triggers
4. **Reveal**: All hidden enemies have `isHidden` set to `false`
5. **One-Time**: Trigger tracked in `state.tracking.ambushTriggered` Set

### Key Code

```typescript
// DungeonGenerator.ts - Spawn hidden enemies
enemies.push({
  // ... enemy properties
  isHidden: isAmbush  // true if room.variant === 'ambush'
});

// GameState.ts - Trigger detection
if (currentRoom?.variant === 'ambush' && !state.tracking.ambushTriggered.has(currentRoom.id)) {
  const dist = Math.hypot(player.position.x - roomCenter.x, player.position.y - roomCenter.y);
  if (dist < 60) {
    state.tracking.ambushTriggered.add(currentRoom.id);
    currentRoom.enemies.forEach(e => { e.isHidden = false; });
  }
}

// GameState.ts - Skip hidden enemies in AI loop
for (const enemy of currentRoom.enemies) {
  if (!enemy.isAlive) continue;
  if (enemy.isHidden) continue; // CRITICAL: Hidden enemies don't act
  // ... process AI
}

// GameScene.ts - Don't render hidden enemies
if (enemy.isHidden) {
  // Remove sprite if exists, skip rendering
  continue;
}
```

### Key Invariants

- **Hidden enemies MUST NOT attack** - AI loop must skip `isHidden` enemies
- **Hidden enemies MUST NOT be targetable** - Auto-targeting must skip `isHidden`
- **Ambush MUST trigger once** - Track in `ambushTriggered` Set (auto-cleaned with run)
- **Ambush trigger distance is 60 units** - Player must reach room center

---

## 10. Room Modifier: Cursed/Blessed Buffs

### How It Works

1. **Application**: When player enters modified room, buff is applied
2. **Persistence**: Buff persists while in room (duration = 999999)
3. **Removal**: When player transitions to new room, buff is removed and stats restored
4. **No Stacking**: Check for existing buff before applying

### Key Code

```typescript
// GameState.ts - Apply modifier on room entry
if (currentRoom?.modifier === 'cursed') {
  const hasCurse = player.buffs.some(b => b.id === 'room_curse');
  if (!hasCurse) {
    player.buffs.push({ id: 'room_curse', ... });
    player.stats.armor -= 10;
    player.stats.resist -= 5;
  }
}

// GameState.ts - Remove modifier on room exit
if (oldRoom?.modifier) {
  this.removeRoomModifierBuffs(state, player, oldRoom.modifier);
}

private removeRoomModifierBuffs(state, player, modifier) {
  if (modifier === 'cursed') {
    const idx = player.buffs.findIndex(b => b.id === 'room_curse');
    if (idx >= 0) {
      player.buffs.splice(idx, 1);
      player.stats.armor += 10;  // Restore
      player.stats.resist += 5;
    }
  }
  // ... similar for blessed
}
```

### Key Invariants

- **Buffs MUST be removed on room exit** - Otherwise stats permanently changed
- **Stats MUST be restored exactly** - Add back what was subtracted
- **Buffs MUST NOT stack** - Check before applying
- **Modifier buffs have special IDs** - `room_curse`, `room_bless`

---

## 11. Room Modifier: Burning Damage

### How It Works

1. **Tick Rate**: Damage every 2 seconds (2000ms)
2. **Damage Formula**: `5 + floor * 2` (scales with difficulty)
3. **Tracking**: Last tick time stored in `state.tracking.modifierDamageTicks`

### Key Code

```typescript
// GameState.ts
if (currentRoom?.modifier === 'burning') {
  const tickKey = `${player.id}_${currentRoom.id}`;
  const lastTick = state.tracking.modifierDamageTicks.get(tickKey) ?? 0;
  const now = Date.now();

  if (now - lastTick >= 2000) {  // 2 second interval
    const damage = 5 + state.dungeon.floor * 2;
    player.stats.health = Math.max(0, player.stats.health - damage);
    state.tracking.modifierDamageTicks.set(tickKey, now);
    // Create combat event for visual feedback
  }
}
```

### Key Invariants

- **Tick tracking in RunTracking** - Auto-cleaned when run deleted
- **2-second interval** - Don't damage too frequently
- **Floor scaling** - Higher floors = more danger
- **Health can reach 0** - Player can die from burning

---

## CRITICAL: Room Variant System Flow Summary

### Generation Flow (DungeonGenerator.ts)

1. Generate rooms with random positions/sizes
2. Assign room types (start, normal, boss, rare)
3. **Assign variants**: `selectRoomVariant()` based on floor and room shape
4. **Assign modifiers**: `selectRoomModifier()` 20% chance on floor 3+
5. Populate rooms with enemies using **formation positions**
6. For ambush variant: set `isHidden: true` on all enemies

### Runtime Flow (GameState.ts)

```
┌─────────────────────────────────────────────────────────────────┐
│                      UPDATE LOOP ORDER                           │
├─────────────────────────────────────────────────────────────────┤
│ 1. Process player movement                                       │
│ 2. Detect room transitions                                       │
│    └── Remove modifier buffs from OLD room                       │
│ 3. Patrol detection (move to current room array)                 │
│ 4. AMBUSH TRIGGER CHECK  ← Check if player near room center     │
│    └── Reveal hidden enemies                                     │
│ 5. MODIFIER EFFECTS      ← Apply burning damage, cursed buff    │
│ 6. Process player auto-attacks (skip hidden enemies)             │
│ 7. Process enemy AI (skip hidden enemies)                        │
│ 8. Update traps, ground effects                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Invariants

| Invariant | Why It Matters |
|-----------|----------------|
| Hidden enemies skip AI | Otherwise ambush enemies attack before reveal |
| Hidden enemies skip targeting | Otherwise players can target invisible enemies |
| Ambush tracked in RunTracking | Otherwise memory leak |
| Modifier buffs removed on exit | Otherwise permanent stat change |
| Burning uses tick tracking | Otherwise damage every frame |
| Formation positions in bounds | Otherwise enemies spawn outside rooms |

---

## Testing

New test file: `server/src/tests/room-variant-system.test.ts`

Tests cover:
- Ambush trigger mechanics (hidden → revealed)
- Hidden enemy targeting prevention
- Hidden enemy AI skipping
- Cursed/blessed buff application and removal
- Burning damage floor scaling
- Formation position bounds
- RunTracking cleanup
- Edge cases (empty rooms, dead enemies, no variant)

Run tests:
```bash
cd server && npx vitest run src/tests/room-variant-system.test.ts
```

---

## Files Changed for Room Variant System

| File | Changes |
|------|---------|
| `shared/types.ts` | Added `RoomVariant`, `RoomModifier` types, `isHidden` to Enemy, tracking fields |
| `server/src/game/DungeonGenerator.ts` | Formation helpers, variant/modifier selection, hidden enemy spawning |
| `server/src/game/GameState.ts` | Ambush trigger, modifier effects, hidden enemy skipping |
| `client/src/scenes/GameScene.ts` | Modifier overlays, hidden enemy rendering |
| `server/src/tests/room-variant-system.test.ts` | 32 comprehensive tests |

---

## 5. UI Tooltip System - Common Pitfalls and Solutions

### Problem 1: Tooltips Inside Containers Don't Receive Hover Events

**Symptom:** Cursor changes to hand (interactive works) but hover events don't fire, or fire inconsistently.

**Cause:** Phaser's input system can have issues with objects nested inside containers. Hit areas may be offset or not properly registered.

**Solution:** Render interactive UI elements directly on the scene instead of inside containers:

```typescript
// BAD - icons inside container may have input issues
this.buffsContainer = this.add.container(x, y);
const icon = this.add.image(localX, localY, 'texture');
icon.setInteractive({ useHandCursor: true });
this.buffsContainer.add(icon); // Input may not work reliably

// GOOD - render directly on scene with screen coordinates
const icon = this.add.image(screenX, screenY, 'texture');
icon.setScrollFactor(0); // Fixed to screen
icon.setDepth(160);      // Above other UI
icon.setInteractive({ useHandCursor: true }); // Input works reliably
```

**Key Points:**
- Use `setScrollFactor(0)` for UI elements that should stay fixed on screen
- Set appropriate depth to ensure UI is above game elements
- Position using absolute screen coordinates, not container-relative

---

### Problem 2: Tooltip Immediately Disappears After Showing

**Symptom:** `showTooltip()` is called (verified via console.log) but tooltip never appears visually.

**Cause:** A frequently-called update function (like `updateBuffsUI()` which runs every frame) contains code that hides the tooltip:

```typescript
// This runs every frame to update buff durations
private updateBuffsUI(): void {
  // ... update logic ...
  this.buffTooltip?.setVisible(false); // BUG: Hides tooltip every frame!
}
```

**Solution:** Only hide tooltips in response to explicit user actions (pointerout), not in update loops:

```typescript
// GOOD - tooltip hidden only when mouse leaves
icon.on('pointerout', () => {
  this.buffTooltip?.setVisible(false);
});

// In updateBuffsUI - DON'T hide tooltip here
// Note: Don't hide tooltip here - it's hidden by pointerout event
```

**Key Principle:** Tooltips should be controlled by pointer events, not update loops.

**Exception:** When the hovered element expires/disappears, the tooltip must be explicitly hidden since `pointerout` won't fire. Track the hovered element and check if it still exists:

```typescript
private hoveredBuffSlot: number = -1; // Track which slot is hovered

// In pointerover:
this.hoveredBuffSlot = slotIndex;

// In pointerout:
this.hoveredBuffSlot = -1;
this.tooltip.setVisible(false);

// In update loop - only hide if hovered element expired:
if (this.hoveredBuffSlot >= 0 && this.hoveredBuffSlot >= currentBuffCount) {
  this.tooltip.setVisible(false);
  this.hoveredBuffSlot = -1;
}
```

---

### Problem 3: Tooltip Appears Off-Screen

**Symptom:** Tooltip partially or fully cut off at screen edges.

**Cause:** Tooltip positioned without checking screen boundaries.

**Solution:** Calculate tooltip bounds and adjust position to keep on screen:

```typescript
private showTooltip(x: number, y: number, width: number, height: number): void {
  const screenWidth = this.cameras.main.width;
  const screenHeight = this.cameras.main.height;
  const margin = 5;

  let finalX = x;
  let finalY = y;

  // For tooltip with origin (0.5, 1) - centered horizontally, anchored at bottom
  // Check horizontal bounds
  const leftEdge = finalX - width / 2;
  const rightEdge = finalX + width / 2;

  if (leftEdge < margin) {
    finalX = margin + width / 2; // Shift right
  } else if (rightEdge > screenWidth - margin) {
    finalX = screenWidth - margin - width / 2; // Shift left
  }

  // Check vertical bounds (tooltip extends upward)
  const topEdge = finalY - height;

  if (topEdge < margin) {
    finalY = y + height + 30; // Flip to below trigger point
  }
  if (finalY > screenHeight - margin) {
    finalY = screenHeight - margin;
  }

  this.tooltip.setPosition(finalX, finalY);
  this.tooltip.setVisible(true);
}
```

**Key Points:**
- Consider tooltip's origin point when calculating bounds
- Common origins: (0.5, 1) = centered, bottom-anchored; (0, 0) = top-left
- Add margin to keep tooltip slightly inside screen edge
- Can flip tooltip to opposite side if it would go off-screen

---

### Tooltip Best Practices Summary

1. **Render interactive elements directly on scene**, not in containers
2. **Use `setScrollFactor(0)`** for fixed UI elements
3. **Control visibility via pointer events**, not update loops
4. **Check screen boundaries** before positioning
5. **Use appropriate depth** to ensure tooltip appears above other elements (depth 600+ recommended)
6. **Cache data for tooltip access** but don't clear it in update loops

---

## 6. Ambush Enemy Reveal Animation

### Implementation

When enemies in ambush rooms become visible (after player triggers the ambush), they should have a dramatic reveal effect.

**Solution:** Track hidden enemies and play animation when they become visible:

```typescript
// Track hidden enemies
private hiddenEnemyIds: Set<string> = new Set();
private revealedAmbushEnemyIds: Set<string> = new Set();

// In enemy rendering loop:
if (enemy.isHidden) {
  this.hiddenEnemyIds.add(enemy.id); // Track as hidden
  // Don't render
  continue;
}

// When creating sprite for enemy that was hidden:
if (this.hiddenEnemyIds.has(enemy.id) && !this.revealedAmbushEnemyIds.has(enemy.id)) {
  this.revealedAmbushEnemyIds.add(enemy.id);
  this.hiddenEnemyIds.delete(enemy.id);

  const revealedSprite = sprite; // Capture for callbacks

  // Start small and transparent
  revealedSprite.setScale(0.1);
  revealedSprite.setAlpha(0);

  // Play sound
  this.playSfx('sfxCast', 0.4);

  // Animate reveal
  this.tweens.add({
    targets: revealedSprite,
    scaleX: targetScale,
    scaleY: targetScale,
    alpha: 1,
    duration: 300,
    ease: 'Back.easeOut',
    onComplete: () => {
      revealedSprite.setTint(0xff4444); // Red flash
      this.time.delayedCall(100, () => revealedSprite.clearTint());
    }
  });

  // Show notification
  this.showNotification('Ambush!', undefined, 'warning');
}
```

**Key Points:**
- Use two Sets: one for currently hidden, one for already revealed (prevents re-triggering)
- Clear Sets on floor change and run reset
- Capture sprite reference in callback to avoid TypeScript null issues
- Use `Back.easeOut` easing for dramatic "pop" effect

---

## Files Changed for Tooltip/UI Fixes

| File | Changes |
|------|---------|
| `client/src/scenes/GameScene.ts` | Buff icons rendered directly on scene, tooltip boundary checking, ambush reveal animation |

---

## 7. Armor System Bugs

### How Armor Works

The armor system uses a standard diminishing returns formula:

```typescript
const reduction = 100 / (100 + armor);
finalDamage = baseDamage * reduction;
```

**Examples:**
- Armor 0: 100% damage taken (no reduction)
- Armor 50: 66.7% damage taken (33.3% reduction)
- Armor 100: 50% damage taken (50% reduction)
- Armor 200: 33.3% damage taken (66.7% reduction)

This formula:
1. Never reduces damage to 0 (asymptotic)
2. Has diminishing returns - each point of armor is worth less than the previous
3. Works correctly even with 0 armor

**Physical vs Magic:**
- Physical attacks (melee, ranged enemies) use `armor` stat
- Magic attacks (caster enemies, spells) use `resist` stat

---

### Bug 7.1: Cursed Room Stat Exploit

**Problem:**
Players could gain armor by entering and leaving a cursed room.

**Root Cause:**
```typescript
// When ENTERING cursed room:
player.stats.armor = Math.max(0, player.stats.armor - 10);  // Clamped to 0

// When LEAVING cursed room:
player.stats.armor += 10;  // Always adds 10, even if less was subtracted!
```

**Example:** Mage with 3 base armor:
1. Enter cursed room → armor = max(0, 3-10) = 0 (only lost 3)
2. Leave cursed room → armor = 0 + 10 = **10** (gained 7 armor!)

**Solution:**
Track the actual amount reduced and only restore that amount:

```typescript
// When applying curse, track actual reduction
const actualArmorReduction = Math.min(10, player.stats.armor);
const actualResistReduction = Math.min(5, player.stats.resist);

// Store actual reductions in buff for later restoration
statModifiers: {
  armor: -actualArmorReduction,  // Negative = reduction
  resist: -actualResistReduction
}

// When removing curse, restore exactly what was taken
player.stats.armor -= buff.statModifiers.armor;  // Subtracting negative = adding
player.stats.resist -= buff.statModifiers.resist;
```

---

### Bug 7.2: Blessed Room Can Create Negative Armor

**Problem:**
When leaving a blessed room, armor is reduced without a floor check.

**Root Cause:**
```typescript
// When LEAVING blessed room:
player.stats.armor -= 10;  // No Math.max(0, ...) protection!
```

If player's armor changed while in blessed room (equipment removed, other debuffs), this could make armor negative.

**Example:**
1. Player with 15 armor enters blessed room → armor = 25
2. Player unequips armor piece (-12 armor) → armor = 13
3. Player leaves blessed room → armor = 13 - 10 = 3 ✓ (OK in this case)

But if:
1. Player with 5 armor enters blessed room → armor = 15
2. Player gets cursed by enemy (-10 armor) → armor = 5
3. Player leaves blessed room → armor = 5 - 10 = **-5** (BUG!)

**Solution:**
```typescript
player.stats.armor = Math.max(0, player.stats.armor - 10);
```

---

### Bug 7.3: StatModifiers Display Wrong Values

**Problem:**
The buff tooltip shows confusing values instead of the delta.

**Root Cause:**
```typescript
statModifiers: {
  armor: player.stats.armor - 10,  // This is the RESULT, not the CHANGE
}
```

The tooltip code expects deltas (e.g., -10) but gets absolute values.

**Solution:**
Store the actual change (delta) in statModifiers:

```typescript
statModifiers: {
  armor: -10,  // The change, not the result
  resist: -5
}
```

---

### Key Invariants for Stat Modifiers

1. **Stats must never go negative** - Always use `Math.max(0, ...)` when reducing
2. **Track actual changes** - Store delta in statModifiers, not absolute values
3. **Restore exactly what was taken** - Don't assume fixed amounts
4. **StatModifiers represent deltas** - Positive = buff, Negative = debuff

---

## 12. Invisible Room Bug After Character Death

### Problem
When a character died with 0 lives and was deleted, creating a new character would result in a broken dungeon:
- Enemies (skeletons) were visible and could attack
- Rooms were invisible or rendered at wrong positions
- Corridors existed but player couldn't enter them
- The game was unplayable

### Root Cause

The death handling code was missing critical WebSocket state cleanup:

**Broken Code (GameScene.ts, lines 1559-1566):**
```typescript
if (characterDeleted) {
  this.showNotification('CHARACTER DELETED - Out of lives!', undefined, 'danger');
  this.time.delayedCall(2000, () => {
    this.shutdown();  // Only unsubscribes from messages!
    this.scene.start('MenuScene');
    this.scene.stop('GameScene');
  });
}
```

Compare to the working `leaveGame()` function:
```typescript
private leaveGame(): void {
  // Fully disconnect from WebSocket to prevent stale messages
  wsClient.disconnect();
  wsClient.runId = null;
  wsClient.playerId = null;
  wsClient.currentState = null;  // ← CRITICAL!

  this.shutdown();
  this.scene.start('MenuScene');
  this.scene.stop('GameScene');
}
```

**The Bug Flow:**
```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Character dies with 0 lives                                  │
│ 2. Character deleted from localStorage                          │
│ 3. Return to MenuScene (but wsClient.currentState still has     │
│    OLD dungeon data from the dead character's run!)             │
│ 4. Player creates NEW character                                 │
│ 5. Server creates NEW run with NEW dungeon layout               │
│ 6. Server sends RUN_CREATED with new dungeon                    │
│ 7. MenuScene starts GameScene                                   │
│ 8. GameScene.create() runs:                                     │
│    if (wsClient.currentState) {  // TRUE - has OLD state!       │
│      this.renderWorld();         // Renders OLD dungeon!        │
│    }                                                            │
│ 9. STATE_UPDATE arrives with NEW enemy positions                │
│ 10. Enemies render at NEW positions (from server)               │
│ 11. But rooms are still rendered at OLD positions!              │
│                                                                 │
│ RESULT: Enemies visible, rooms invisible/wrong positions        │
└─────────────────────────────────────────────────────────────────┘
```

### Solution

Add proper WebSocket cleanup when character is deleted:

**Fixed Code (GameScene.ts):**
```typescript
if (characterDeleted) {
  this.showNotification('CHARACTER DELETED - Out of lives!', undefined, 'danger');
  this.time.delayedCall(2000, () => {
    // CRITICAL: Clear WebSocket state to prevent stale dungeon data
    // Without this, the next character creation may render the OLD dungeon
    // while enemies spawn at NEW positions (causing "invisible room" bug)
    wsClient.disconnect();
    wsClient.runId = null;
    wsClient.playerId = null;
    wsClient.currentState = null;

    this.shutdown();
    this.scene.start('MenuScene');
    this.scene.stop('GameScene');
  });
}
```

### Why This Works

1. **`wsClient.currentState = null`** - Clears the stale dungeon data
2. **`wsClient.disconnect()`** - Closes old WebSocket connection
3. **GameScene.create()** checks: `if (wsClient.currentState)` → now `false`
4. GameScene waits for `RUN_CREATED` message before rendering
5. New dungeon renders correctly

### Key Invariants

| Invariant | Why It Matters |
|-----------|----------------|
| Clear `currentState` on run end | Prevents rendering stale dungeon |
| Clear `runId` and `playerId` | Prevents server confusion |
| Disconnect WebSocket | Clean break from old session |
| Wait for `RUN_CREATED` before render | Ensures fresh state |

### Related Code Paths

All paths that end a run and return to menu MUST clean up WebSocket state:

| Path | File | Cleanup Status |
|------|------|----------------|
| Leave Game button | GameScene.ts:leaveGame() | ✅ Always worked |
| Character death (0 lives) | GameScene.ts:update() | ✅ Fixed |
| Server disconnect | WebSocketClient.ts | ⚠️ Automatic via disconnect event |

### Testing

To verify the fix:
1. Create a new character
2. Play until you have 1 life remaining
3. Intentionally die to enemies
4. Character should be deleted, return to menu
5. Create another new character
6. Verify: rooms render correctly, enemies are inside rooms

### Debug Logging

If this bug recurs, add these logs:

```typescript
// In GameScene.create():
console.log('[DEBUG] create() - currentState:', wsClient.currentState ? 'EXISTS' : 'NULL');
console.log('[DEBUG] create() - runId:', wsClient.runId);

// In death handler:
console.log('[DEBUG] Character deleted, clearing state...');
console.log('[DEBUG] Before clear - currentState:', wsClient.currentState ? 'EXISTS' : 'NULL');
// ... cleanup ...
console.log('[DEBUG] After clear - currentState:', wsClient.currentState ? 'EXISTS' : 'NULL');
```

---

## CRITICAL: Scene Transition Cleanup Checklist

When transitioning from GameScene to MenuScene, ALWAYS ensure:

```typescript
// 1. Disconnect WebSocket (prevents stale messages)
wsClient.disconnect();

// 2. Clear run identifiers (prevents server confusion)
wsClient.runId = null;
wsClient.playerId = null;

// 3. Clear game state (prevents stale rendering)
wsClient.currentState = null;

// 4. Clean up scene (unsubscribe handlers, destroy objects)
this.shutdown();

// 5. Start new scene BEFORE stopping current (prevents null refs)
this.scene.start('MenuScene');
this.scene.stop('GameScene');
```

Missing ANY of steps 1-3 can cause state leakage bugs.

---

## 13. Floor Persistence Bug - Additional Fix (2026-02-03)

### Problem

Even after the fix in section 12, users still experienced the invisible room bug after character death. The original fix addressed the death handler, but there were still gaps where stale floor data could persist.

### Root Cause Analysis

The bug had **multiple entry points**, and the original fix only addressed one:

```
┌─────────────────────────────────────────────────────────────────┐
│              STALE STATE ENTRY POINTS                           │
├─────────────────────────────────────────────────────────────────┤
│ 1. Death handler (✅ Fixed in section 12)                       │
│    - Character deleted → cleanup before MenuScene               │
│                                                                 │
│ 2. MenuScene.startGame() (❌ NOT FIXED - Gap #1)               │
│    - No cleanup before wsClient.createRun()                     │
│    - Old currentState persists through scene transition         │
│                                                                 │
│ 3. MenuScene.loadSavedCharacter() (❌ NOT FIXED - Gap #2)      │
│    - No cleanup before wsClient.createRunFromSave()             │
│    - Old currentState persists through scene transition         │
│                                                                 │
│ 4. GameScene.create() (❌ NOT FIXED - Gap #3)                  │
│    - No validation that currentState matches current runId      │
│    - Renders stale state if cleanup was incomplete              │
│                                                                 │
│ 5. GameScene.renderWorld() (❌ NOT FIXED - Gap #4)             │
│    - No validation during game loop                             │
│    - Could render old floor if race condition occurs            │
└─────────────────────────────────────────────────────────────────┘
```

### The Race Condition

Even with death handler cleanup, a race condition exists:

```
Timeline (Race Condition Scenario):
─────────────────────────────────────────────────────────────────

T0: Old character dies, death handler starts cleanup
T1: WebSocket disconnect initiated
T2: User quickly creates new character (clicks fast)
T3: MenuScene.startGame() called - wsClient.currentState may still exist!
T4: GameScene.create() runs, renders old state
T5: Death handler cleanup completes (too late!)
T6: RUN_CREATED arrives with fresh state (scene already rendered wrong)
```

### Solution

Added **defense-in-depth** - multiple layers of protection:

**Layer 1: MenuScene Pre-Cleanup** (`client/src/scenes/MenuScene.ts`)

```typescript
private startGame(): void {
  // ... validation ...

  this.isStartingGame = true;

  // CRITICAL: Clear stale state before creating new run
  // This prevents the bug where old floor data persists after character death
  // Without this, GameScene.create() may render the OLD dungeon layout
  // before the server's RUN_CREATED message arrives with fresh data
  wsClient.currentState = null;
  wsClient.runId = null;
  wsClient.playerId = null;

  wsClient.createRun(this.playerName, this.selectedClass);
}

private loadSavedCharacter(saveData: SaveData, slot: number): void {
  if (!wsClient.isConnected) return;

  // CRITICAL: Clear stale state before loading saved character
  wsClient.currentState = null;
  wsClient.runId = null;
  wsClient.playerId = null;

  this.hideMenuOverlay();
  wsClient.createRunFromSave(saveData, slot);
}
```

**Layer 2: GameScene State Validation** (`client/src/scenes/GameScene.ts`)

```typescript
// In create():
// CRITICAL: Validate that currentState belongs to the current run
const hasValidState = wsClient.currentState &&
  wsClient.runId &&
  wsClient.currentState.runId === wsClient.runId;

if (hasValidState) {
  console.log('[DEBUG] About to call renderWorld with valid state for run:', wsClient.runId);
  this.renderWorld();
} else {
  console.log('[DEBUG] Skipping initial renderWorld - waiting for fresh state from server');
}

// In renderWorld():
private renderWorld(): void {
  const state = wsClient.currentState;
  if (!state) return;

  // CRITICAL: Validate state belongs to current run
  if (wsClient.runId && state.runId !== wsClient.runId) {
    console.warn('[DEBUG] renderWorld skipped - stale state detected:', state.runId, 'vs', wsClient.runId);
    return;
  }

  // ... rest of render logic
}
```

### Why Defense-in-Depth?

| Layer | Protection Against |
|-------|-------------------|
| Death handler cleanup | Normal death flow |
| MenuScene pre-cleanup | Race conditions, incomplete cleanup |
| GameScene runId validation | Any remaining stale state |
| renderWorld() validation | Stale state during game loop |

### Files Changed

| File | Changes |
|------|---------|
| `client/src/scenes/MenuScene.ts` | Added state cleanup in `startGame()` and `loadSavedCharacter()` |
| `client/src/scenes/GameScene.ts` | Added runId validation in `create()` and `renderWorld()` |

### Testing

To verify all scenarios:

1. **Normal death flow:**
   - Die with 0 lives → new character → verify rooms render correctly

2. **Quick restart:**
   - Die → spam click "Create Character" → verify no stale rooms

3. **Load saved character after death:**
   - Die with 0 lives → load different saved character → verify correct floor

4. **Server reconnect:**
   - Disconnect network → reconnect → create character → verify correct render

### Debug Logging

Added debug logs to trace state issues:

```
[DEBUG] About to call renderWorld with valid state for run: abc123
[DEBUG] Skipping initial renderWorld - waiting for fresh state from server
[DEBUG] State runId mismatch: oldRun123 vs newRun456
[DEBUG] renderWorld skipped - stale state detected: oldRun123 vs newRun456
```

### Key Invariants (Updated)

| Invariant | Enforcement Point |
|-----------|-------------------|
| Clear state before new run | MenuScene.startGame(), loadSavedCharacter() |
| Clear state on death | GameScene death handler |
| Validate state.runId matches wsClient.runId | GameScene.create(), renderWorld() |
| Wait for RUN_CREATED before render | GameScene.create() conditional |

---
