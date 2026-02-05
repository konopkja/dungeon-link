# WebSocket State Update Performance Guide

> **Critical Production Issue - February 2026**
>
> This document explains a severe performance issue discovered in production where the game became laggy despite running smoothly locally. This is required reading for anyone working on the networking layer.

## Table of Contents

1. [The Problem](#the-problem)
2. [Root Cause Analysis](#root-cause-analysis)
3. [Symptoms & Diagnosis](#symptoms--diagnosis)
4. [The Solution](#the-solution)
5. [Delta State Implementation Details](#delta-state-implementation-details)
6. [Prevention Guidelines](#prevention-guidelines)
7. [Performance Benchmarks](#performance-benchmarks)

---

## The Problem

### What Users Experienced
- Game felt "laggy" on production but ran smoothly on localhost
- Button clicks had 200-400ms presentation delays
- Movement felt sluggish and unresponsive
- Issues worsened during combat

### Initial Metrics (Production)
```
DOMContentLoaded: 402 ms  (acceptable)
Load: 713 ms              (acceptable)
WebSocket Connect: 3.43s  (PROBLEM - Railway cold start)
```

### Performance Profile Breakdown
```
Scripting:  5,757 ms (64% of active time) - PROBLEM
System:     2,419 ms (27%)
Rendering:    455 ms (5%)
Painting:     370 ms (4%)
```

The scripting time dominated, indicating JavaScript execution was the bottleneck - NOT rendering.

---

## Root Cause Analysis

### Issue 1: Massive STATE_UPDATE Payloads

Every 50ms (20 ticks/second), the server sent the **ENTIRE** game state:

```typescript
// WebSocketServer.ts - THE PROBLEM
this.broadcastToRun(runId, {
  type: 'STATE_UPDATE',
  state  // Full RunState object - 7-10KB per message!
});
```

**What was being sent every tick:**
- All player data (stats, equipment, abilities, buffs, backpack)
- ALL dungeon rooms (not just visible ones)
- ALL enemies in ALL rooms (even cleared rooms)
- Ground effects array
- RunTracking Maps (cooldowns, aggro times, etc.)
- Full dungeon layout

**Payload size: 7,000-10,000 bytes per STATE_UPDATE**

### Issue 2: Duplicate Messages

WebSocket messages were arriving in batches with duplicates:
```
21:53:27.858 - STATE_UPDATE (7481 bytes)
21:53:27.858 - STATE_UPDATE (7481 bytes) <- DUPLICATE
21:53:28.367 - STATE_UPDATE (7481 bytes)
21:53:28.367 - STATE_UPDATE (7481 bytes) <- DUPLICATE
```

### Issue 3: Updates When Nothing Changed

The server sent full state updates even when the player hadn't moved:
```json
{"position":{"x":1341.134,"y":533.370}}  // Same in ALL messages
```

### Issue 4: Client Processing Overhead

Each STATE_UPDATE triggered:
1. JSON parsing of 7KB+ payload
2. Full object replacement in memory
3. Re-rendering calculations (Phaser's polygon triangulation)
4. Garbage collection pressure from discarded state objects

### Why It Was Worse in Production

| Factor | Local | Production |
|--------|-------|------------|
| Network Latency | ~1ms | 50-200ms |
| Message Batching | Minimal | Messages bunch up |
| Server Location | Same machine | Railway (distant) |
| Cold Starts | None | 3+ seconds |

Higher latency caused messages to arrive in bursts, overwhelming the client with multiple large state updates to process simultaneously.

---

## Symptoms & Diagnosis

### How to Identify This Issue

**1. Check WebSocket Messages (Network Tab → WS filter)**
- Look for large payload sizes (>2KB for STATE_UPDATE)
- Look for duplicate messages at same timestamp
- Look for identical content in sequential messages

**2. Check Performance Profile (Performance Tab)**
- High "Scripting" percentage (>50%)
- Functions like `sortLinked`, `isEarHashed` (Phaser triangulation)
- Frequent garbage collection spikes

**3. Check Interaction Timing**
```
Input delay:        5ms    (good)
Processing:        23ms    (good)
Presentation:     244ms    (PROBLEM - should be <50ms)
```

High presentation delay indicates the browser is struggling to render after processing.

### Red Flags in Code

```typescript
// BAD: Sending full state
broadcastToRun(runId, { type: 'STATE_UPDATE', state });

// BAD: No change detection
this.currentState = message.state;  // Blind replacement

// BAD: Including server-only data in broadcasts
tracking: RunTracking  // Client doesn't need cooldown Maps
```

---

## The Solution

### 1. Delta State Updates

Only send what changed since the last update:

```typescript
// server/src/utils/stateDelta.ts
interface StateDelta {
  players?: Partial<Player>[];      // Only changed player fields
  enemies?: EnemyDelta[];           // Only moved/damaged enemies
  groundEffects?: GroundEffect[];   // Only new/removed effects
  roomCleared?: string;             // Room ID if just cleared
  // ... other delta fields
}

function computeDelta(previous: RunState, current: RunState): StateDelta | null {
  // Return null if nothing changed
  // Return minimal delta object otherwise
}
```

### 2. Remove Server-Only Data

`RunTracking` contains cooldowns and timing data that only the server needs:

```typescript
// Before broadcast, strip server-only fields
const clientState = {
  ...state,
  tracking: undefined  // Don't send to client
};
```

### 3. ~~Room-of-Interest Culling~~ (REVERTED)

> **Note**: Room culling was initially implemented but reverted because it broke the minimap display.
> The minimap needs ALL rooms to render correctly. Sending only current + adjacent rooms caused:
> - Minimap showing incomplete dungeon layout
> - Corridors/paths appearing late
> - Visual glitches during room transitions

We now send all rooms but still strip `RunTracking` data.

### 4. Client-Side Deduplication

Prevent processing identical updates:

```typescript
// client/src/network/WebSocketClient.ts
private lastStateHash: string = '';

private handleStateUpdate(state: RunState): void {
  const hash = this.computeStateHash(state);
  if (hash === this.lastStateHash) return;  // Skip duplicate
  this.lastStateHash = hash;
  this.currentState = state;
}
```

### 5. Throttle Updates When Idle

Don't send 20 updates/second when nothing is happening:

```typescript
// Server-side: Skip update if nothing meaningful changed
if (!hasSignificantChanges(previousState, currentState)) {
  return;  // Don't broadcast
}
```

---

## Delta State Implementation Details

### Two-Phase Synchronization

The delta system uses a two-phase approach:

1. **Initial Full Sync** - First update sends complete `STATE_UPDATE` (~10KB)
2. **Delta Updates** - Subsequent updates send only `DELTA_UPDATE` (~500-1000 bytes)

```typescript
// server/src/WebSocketServer.ts
if (stateTracker.needsFullSync(client.clientId)) {
  // First update: full state
  send({ type: 'STATE_UPDATE', state: clientState });
  stateTracker.markFullSyncSent(client.clientId, state);
} else {
  // Subsequent: delta only
  const delta = stateTracker.generateDeltaState(state, client.clientId);
  send({ type: 'DELTA_UPDATE', delta });
}
```

### DeltaState Structure

The delta contains only dynamic data that changes during gameplay:

```typescript
interface DeltaState {
  players: DeltaPlayer[];     // Position, health, mana, buffs, cooldowns
  pets: DeltaPet[];           // Position, health, target
  enemies: DeltaEnemy[];      // Position, health, debuffs, boss flags
  newEnemies?: NewEnemy[];    // FULL data for newly spawned enemies
  rooms: DeltaRoom[];         // Cleared status only
  chests: DeltaChest[];       // Open status only
  groundEffects: GroundEffect[];
  inCombat: boolean;
  currentRoomId: string;
  pendingLoot: LootDrop[];
}
```

### Handling Newly Spawned Enemies

> **Bug Fix (February 2026)**: Boss-summoned skeletons were invisible because delta updates only contain dynamic data, not the full enemy definition needed to create sprites.

When enemies are spawned mid-game (boss summons, ambush triggers), the client needs full enemy data to create sprites. The server tracks which enemy IDs each client knows about:

```typescript
// server/src/utils/stateDelta.ts
class StateTracker {
  // Track enemy IDs per client
  private clientEnemyIds: Map<string, Set<string>> = new Map();

  markFullSyncSent(clientId: string, state?: RunState): void {
    // Record initial enemy IDs
    if (state) {
      const enemyIds = this.extractAllEnemyIds(state);
      this.clientEnemyIds.set(clientId, enemyIds);
    }
  }

  generateDeltaState(state: RunState, clientId?: string): DeltaState {
    // Detect enemies client doesn't know about
    const newEnemies = this.detectNewEnemies(state, clientId);

    return {
      // ... other delta fields
      newEnemies: newEnemies.length > 0 ? newEnemies : undefined,
    };
  }

  private detectNewEnemies(state: RunState, clientId: string): NewEnemy[] {
    const knownIds = this.clientEnemyIds.get(clientId);
    const newEnemies: NewEnemy[] = [];

    for (const room of state.dungeon.rooms) {
      for (const enemy of room.enemies) {
        if (!knownIds.has(enemy.id)) {
          // Include FULL enemy data
          newEnemies.push({ roomId: room.id, enemy });
          knownIds.add(enemy.id);  // Track for future
        }
      }
    }
    return newEnemies;
  }
}
```

The client adds new enemies to its cached state before processing the delta:

```typescript
// client/src/network/WebSocketClient.ts
private applyDeltaUpdate(delta: DeltaState): void {
  // FIRST: Add newly spawned enemies
  if (delta.newEnemies) {
    for (const newEnemy of delta.newEnemies) {
      const room = this.currentState.dungeon.rooms.find(r => r.id === newEnemy.roomId);
      if (room && !room.enemies.find(e => e.id === newEnemy.enemy.id)) {
        room.enemies.push(newEnemy.enemy);  // Now sprite can be created
      }
    }
  }

  // THEN: Update existing entities with delta data
  // ...
}
```

### State Invalidation

Full sync is triggered again when:
- Client first connects
- Player advances to a new floor
- Client reconnects after disconnect

```typescript
// Force full sync after floor change
stateTracker.invalidateClient(client.clientId);
```

### Payload Size Comparison

| Update Type | Size | Content |
|-------------|------|---------|
| STATE_UPDATE (initial) | ~10KB | Full dungeon, all rooms, all entities |
| DELTA_UPDATE (normal) | ~500-1000 bytes | Positions, health, cooldowns |
| DELTA_UPDATE (with spawn) | ~1-2KB | Above + full enemy data for new spawns |

---

## Prevention Guidelines

### DO:

1. **Always compute deltas** - Never send full state if you can send changes
2. **Separate concerns** - Server-only data stays on server
3. **Measure payload sizes** - Log message sizes in development
4. **Test with network throttling** - Chrome DevTools → Network → Slow 3G
5. **Profile on production** - Local performance is misleading
6. **Deduplicate on client** - Always guard against duplicate processing

### DON'T:

1. **Don't send full objects** when partial updates suffice
2. **Don't include unused data** in network messages
3. **Don't trust local testing** as representative of production
4. **Don't send updates** when nothing changed
5. **Don't serialize Maps/Sets** directly (use arrays)

### Code Review Checklist

When reviewing networking code, ask:

- [ ] What is the payload size? Is it justified?
- [ ] Is all the data necessary for the client?
- [ ] What happens if this message is duplicated?
- [ ] What happens under high latency?
- [ ] Is there change detection before sending?

---

## Performance Benchmarks

### Target Metrics

| Metric | Target | Unacceptable |
|--------|--------|--------------|
| STATE_UPDATE size | <1KB | >5KB |
| Updates when idle | 0-2/sec | 20/sec |
| Client processing | <5ms | >16ms |
| Presentation delay | <50ms | >100ms |

### Monitoring

Add these metrics to your monitoring:

```typescript
// Log payload sizes in development
console.log(`STATE_UPDATE size: ${JSON.stringify(state).length} bytes`);

// Track processing time
const start = performance.now();
processStateUpdate(state);
console.log(`State processing: ${performance.now() - start}ms`);
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         SERVER                                   │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  Game Loop   │───▶│ Compute Delta│───▶│ Filter State │      │
│  │  (20 ticks)  │    │              │    │ (remove      │      │
│  └──────────────┘    └──────────────┘    │  tracking)   │      │
│                                          └──────┬───────┘      │
│                                                 │               │
│                                                 ▼               │
│                                          ┌──────────────┐      │
│                                          │   Broadcast  │      │
│                                          │  (if changed)│      │
│                                          └──────┬───────┘      │
└─────────────────────────────────────────────────┼───────────────┘
                                                  │
                                                  │ WebSocket
                                                  │ (small delta)
                                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT                                   │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Receive    │───▶│  Deduplicate │───▶│ Merge Delta  │      │
│  │   Message    │    │              │    │              │      │
│  └──────────────┘    └──────────────┘    └──────┬───────┘      │
│                                                 │               │
│                                                 ▼               │
│                                          ┌──────────────┐      │
│                                          │   Render     │      │
│                                          │   (Phaser)   │      │
│                                          └──────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Related Files

- `server/src/WebSocketServer.ts` - Message broadcasting, delta/full sync logic
- `server/src/game/GameState.ts` - State computation
- `server/src/utils/stateDelta.ts` - Delta computation, state hashing, enemy tracking
- `client/src/network/WebSocketClient.ts` - Message handling, delta merging
- `shared/types.ts` - State interfaces (`DeltaState`, `NewEnemy`, etc.)
- `shared/constants.ts` - Tick rate configuration

---

## Incident Timeline (February 2026)

1. **Reported**: Game laggy on production, smooth locally
2. **Initial diagnosis**: Load times fine (402ms/713ms)
3. **WebSocket analysis**: 3.43s connection time, multiple pending connections
4. **Message inspection**: 7.5KB STATE_UPDATE messages, duplicates
5. **Performance profile**: 64% scripting time, polygon triangulation
6. **Root cause**: Full state serialization every 50ms
7. **Fix implemented**: Delta updates, deduplication, payload reduction
8. **Follow-up bug**: Boss-summoned skeletons invisible (delta missing full enemy data)
9. **Follow-up fix**: Added `newEnemies` field to track spawned entities

---

*Last updated: February 2026*
*Author: Performance investigation team*
