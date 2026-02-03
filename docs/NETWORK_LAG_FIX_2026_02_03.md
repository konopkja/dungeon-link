# Network Lag Fix - February 3, 2026

## Problem Summary
Game felt smooth on localhost but exhibited choppy, laggy movement on production despite 120 FPS rendering performance.

## Root Cause
**Network latency + discrete state updates without interpolation**

The server sends state updates at 20Hz (every 50ms). On localhost with ~0ms latency, these updates arrive consistently and the 50ms intervals are barely perceptible. On production with ~115ms latency (plus jitter), the timing between received updates becomes inconsistent, causing positions to visually "snap" rather than move smoothly.

### Key Diagnostic Findings
| Metric | Value | Implication |
|--------|-------|-------------|
| Client FPS | 120 | Rendering is NOT the issue |
| Server update rate | 20Hz (50ms) | Working correctly |
| Avg ping latency | 115ms | Significant network delay |
| Lag spikes (>100ms) | 1.1% | Minor network jitter |

**Critical insight**: Smooth on localhost + laggy on production + perfect FPS = network timing issue, not rendering or code issue.

## Failed Approaches

### 1. Code Reset to "Morning State"
- **Hypothesis**: Afternoon code changes caused the lag
- **Action**: Reset GameScene.ts, InventoryUI.ts, GameState.ts, DungeonGenerator.ts, WebSocketServer.ts to morning commit
- **Result**: No improvement
- **Lesson**: The code was never the problem; the game was always susceptible to network latency, just not noticeable on localhost

### 2. Switch Canvas to WebGL
- **Hypothesis**: Canvas rendering was slow
- **Action**: Changed Phaser config from `Phaser.CANVAS` to `Phaser.AUTO`
- **Result**: No improvement (FPS was already 120)
- **Lesson**: High FPS proves rendering isn't the bottleneck

### 3. Interpolation for All Entities (First Attempt)
- **Hypothesis**: Smooth movement via lerp would fix choppiness
- **Action**: Added 25% lerp per frame for player, enemy, and pet positions
- **Result**: "Distorted" appearance - camera jumped while sprites moved smoothly
- **Lesson**: Camera must follow interpolated position, not server position

### 4. Camera Following Interpolated Position
- **Hypothesis**: Matching camera to sprite position would fix distortion
- **Action**: Camera now follows `sprite.x/y` instead of `player.position.x/y`
- **Result**: Distortion fixed, but player movement felt delayed/laggy
- **Lesson**: Interpolation adds visual delay ON TOP of network latency for the controlled character

## Final Solution

**Selective interpolation based on entity type:**

```typescript
if (isCurrentPlayer) {
  // Current player: NO interpolation - snap to server position
  sprite.setPosition(player.position.x, player.position.y);
} else {
  // Other entities: interpolate for smooth movement
  const newX = sprite.x + (target.x - sprite.x) * LERP_SPEED;
  const newY = sprite.y + (target.y - sprite.y) * LERP_SPEED;
  sprite.setPosition(newX, newY);
}
```

### Why This Works
- **Player character**: Snapping to server position means you see your inputs reflected as soon as the server responds (~115ms round trip). Adding interpolation would add additional visual delay, making controls feel unresponsive.
- **Enemies/pets/other players**: These entities are not controlled by the local player, so interpolation smooths their movement without affecting perceived responsiveness.

## Architecture Insights

### Client-Server State Flow
```
Player Input → Network (115ms) → Server Processing → Network (115ms) → Client Render
                                                                         ↓
                                                              Total: ~230ms input lag
```

This ~230ms input lag is **inherent to server-authoritative architecture** and cannot be reduced without:
1. Client-side prediction (complex, requires reconciliation)
2. Moving game logic to client (security implications)
3. Reducing network latency (infrastructure change)

### Interpolation Trade-offs
| Approach | Player Feel | Visual Smoothness | Complexity |
|----------|-------------|-------------------|------------|
| No interpolation | Responsive but choppy | Poor | Low |
| Full interpolation | Delayed/laggy | Smooth | Medium |
| **Selective interpolation** | **Responsive** | **Good for NPCs** | **Medium** |

## Files Changed
- `client/src/scenes/GameScene.ts`
  - Added `targetPositions` Map for interpolation targets
  - Added `LERP_SPEED` constant (0.25 = 25% per frame)
  - Modified `renderPlayers()` - selective interpolation
  - Modified `renderEnemies()` - full interpolation
  - Modified `renderPets()` - full interpolation
  - Modified camera follow logic - tracks sprite position

## Commits
1. `95749d4` - DEBUG: Add FPS counter to diagnose lag source
2. `8cc24bb` - PERF: Add position interpolation for smooth movement
3. `bbc2a91` - FIX: Camera follows interpolated sprite position
4. `84c8e3e` - FIX: No interpolation for current player

## Known Issue: Boss Ground Effects

The boss ground effect rendering for floors 14-15 (TectonicQuadrant, VoidGaze, EncroachingDarkness) causes character movement lag when added to GameScene.ts, even when:
- The effects are in separate functions
- The code is never executed (floor 1)
- The switch cases just forward to other functions

**Root cause**: Unknown - possibly V8 engine deoptimization from class size, or bundler (Vite/esbuild) optimization issues.

**Current status**: Boss effect visuals are NOT rendered. The types exist in `shared/types.ts` but the rendering code is intentionally omitted from GameScene.

**Workaround options** (not implemented):
1. Move boss effects to a dynamically imported module loaded only on floors 14+
2. Use a completely separate Phaser scene for boss fights
3. Simplify the effect visuals significantly

## Future Considerations

### If More Responsiveness Needed
Implement **client-side prediction**:
1. Immediately move player locally when input detected
2. Send input to server
3. When server state arrives, reconcile predicted vs actual position
4. Correct any misprediction smoothly

### If Enemies Still Appear Choppy
Increase `LERP_SPEED` from 0.25 to 0.4-0.5 for faster catch-up while maintaining smoothness.

### Monitoring
The FPS counter (`FPS: X (min: Y)`) remains in the top-left corner for ongoing performance monitoring. Remove in production if desired.
