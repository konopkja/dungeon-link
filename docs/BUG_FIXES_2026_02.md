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
