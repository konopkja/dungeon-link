/**
 * State Delta Utility
 *
 * Computes minimal state changes between updates to reduce network bandwidth.
 * See docs/PERFORMANCE-STATE-UPDATES.md for full context on why this exists.
 *
 * Key optimizations:
 * 1. Only send changed player positions/stats
 * 2. Only send enemies in current + adjacent rooms
 * 3. Never send RunTracking (server-only data)
 * 4. Skip updates when nothing meaningful changed
 */

import { RunState, Player, Enemy, Room, GroundEffect, Position, Pet } from '@dungeon-link/shared';

// Threshold for position changes (in pixels) - below this, consider unchanged
// Using 1 pixel to match hashPosition rounding for smooth patrol movement
const POSITION_THRESHOLD = 1.0;

// Threshold for considering stats unchanged
const STAT_THRESHOLD = 0.01;

/**
 * Lightweight state sent to client - excludes server-only data
 */
export interface ClientRunState {
  runId: string;
  seed: string;
  floor: number;
  players: Player[];
  pets: Pet[];
  dungeon: ClientDungeon;
  inCombat: boolean;
  pendingLoot: RunState['pendingLoot'];
  partyScaling: RunState['partyScaling'];
  groundEffects: GroundEffect[];
  // Note: tracking is intentionally omitted - it's server-only
  cryptoState?: RunState['cryptoState'];
}

/**
 * Dungeon state with only relevant rooms (current + adjacent)
 */
export interface ClientDungeon {
  floor: number;
  seed: string;
  rooms: Room[];
  currentRoomId: string;
  bossDefeated: boolean;
  theme: RunState['dungeon']['theme'];
  themeModifiers: RunState['dungeon']['themeModifiers'];
}

/**
 * Tracks the last state sent to each client for delta computation
 */
export class StateTracker {
  private lastStates: Map<string, {
    state: ClientRunState;
    hash: string;
    timestamp: number;
  }> = new Map();

  /**
   * Prepare state for client broadcast.
   * Returns null if nothing meaningful has changed.
   */
  prepareClientState(
    clientId: string,
    fullState: RunState,
    forceFullUpdate: boolean = false
  ): ClientRunState | null {
    const clientState = this.stripServerOnlyData(fullState);
    const currentHash = this.computeStateHash(clientState);

    const lastEntry = this.lastStates.get(clientId);

    // If hash matches, nothing changed - skip update
    if (!forceFullUpdate && lastEntry && lastEntry.hash === currentHash) {
      return null;
    }

    // Store for next comparison
    this.lastStates.set(clientId, {
      state: clientState,
      hash: currentHash,
      timestamp: Date.now()
    });

    return clientState;
  }

  /**
   * Remove server-only data from state.
   *
   * NOTE: We intentionally send ALL rooms (not just current + adjacent) because:
   * 1. Minimap needs full dungeon layout to render correctly
   * 2. Corridors/paths are rendered based on room connections
   * 3. Room data is relatively small compared to tracking data
   *
   * The main optimization is stripping RunTracking which contains server-only
   * data (cooldowns, aggro times, etc.) that the client doesn't need.
   */
  private stripServerOnlyData(state: RunState): ClientRunState {
    return {
      runId: state.runId,
      seed: state.seed,
      floor: state.floor,
      players: state.players,
      pets: state.pets,
      dungeon: {
        floor: state.dungeon.floor,
        seed: state.dungeon.seed,
        rooms: state.dungeon.rooms, // Send ALL rooms for minimap
        currentRoomId: state.dungeon.currentRoomId,
        bossDefeated: state.dungeon.bossDefeated,
        theme: state.dungeon.theme,
        themeModifiers: state.dungeon.themeModifiers
      },
      inCombat: state.inCombat,
      pendingLoot: state.pendingLoot,
      partyScaling: state.partyScaling,
      groundEffects: state.groundEffects,
      cryptoState: state.cryptoState
    };
  }

  /**
   * Compute a hash of the meaningful state for change detection.
   * Uses a fast, shallow approach rather than deep JSON stringify.
   */
  private computeStateHash(state: ClientRunState): string {
    const parts: string[] = [
      state.runId,
      String(state.floor),
      String(state.inCombat),
      state.dungeon.currentRoomId,
      String(state.dungeon.bossDefeated),
      String(state.groundEffects.length)
    ];

    // Hash player positions and key stats
    for (const player of state.players) {
      parts.push(
        player.id,
        this.hashPosition(player.position),
        String(player.stats.health),
        String(player.stats.mana),
        String(player.isAlive),
        player.targetId || 'null',
        String(player.gold),
        String(player.buffs.length),
        String(player.backpack.length),
        // Include abilities for vendor purchase detection
        player.abilities.map(a => `${a.abilityId}:${a.rank}`).join(','),
        // Include level and XP
        String(player.level),
        String(player.xp)
      );
    }

    // Hash enemy states in relevant rooms
    for (const room of state.dungeon.rooms) {
      parts.push(room.id, String(room.cleared));
      for (const enemy of room.enemies) {
        parts.push(
          enemy.id,
          this.hashPosition(enemy.position),
          String(enemy.stats.health),
          String(enemy.isAlive),
          enemy.targetId || 'null'
        );
      }
      // Hash ground items
      if (room.groundItems) {
        for (const gi of room.groundItems) {
          parts.push(gi.id);
        }
      }
      // Hash chests
      if (room.chests) {
        for (const chest of room.chests) {
          parts.push(chest.id, String(chest.isOpen));
        }
      }
    }

    // Hash pets
    for (const pet of state.pets) {
      parts.push(
        pet.id,
        this.hashPosition(pet.position),
        String(pet.stats.health),
        String(pet.isAlive)
      );
    }

    // Hash ground effects
    for (const effect of state.groundEffects) {
      parts.push(
        effect.id,
        this.hashPosition(effect.position),
        String(effect.radius),
        String(effect.duration)
      );
    }

    return parts.join('|');
  }

  /**
   * Hash a position for change detection.
   *
   * NOTE: We use integer rounding (1 pixel precision) instead of sub-pixel
   * to avoid patrol enemies appearing to teleport. The 0.5 pixel threshold
   * caused updates to be batched, making patrols jump instead of move smoothly.
   */
  private hashPosition(pos: Position): string {
    // Round to nearest integer pixel - provides enough precision for smooth movement
    // while still avoiding updates for sub-pixel jitter
    const x = Math.round(pos.x);
    const y = Math.round(pos.y);
    return `${x},${y}`;
  }

  /**
   * Check if a position has meaningfully changed
   */
  hasPositionChanged(oldPos: Position, newPos: Position): boolean {
    const dx = Math.abs(oldPos.x - newPos.x);
    const dy = Math.abs(oldPos.y - newPos.y);
    return dx > POSITION_THRESHOLD || dy > POSITION_THRESHOLD;
  }

  /**
   * Clean up tracking for a disconnected client
   */
  removeClient(clientId: string): void {
    this.lastStates.delete(clientId);
  }

  /**
   * Force next update to be sent (e.g., after floor change)
   */
  invalidateClient(clientId: string): void {
    this.lastStates.delete(clientId);
  }

  /**
   * Get stats about current tracking state (for debugging)
   */
  getStats(): { trackedClients: number; avgHashLength: number } {
    let totalHashLength = 0;
    for (const entry of this.lastStates.values()) {
      totalHashLength += entry.hash.length;
    }
    return {
      trackedClients: this.lastStates.size,
      avgHashLength: this.lastStates.size > 0
        ? Math.round(totalHashLength / this.lastStates.size)
        : 0
    };
  }
}

/**
 * Singleton instance for the state tracker
 */
export const stateTracker = new StateTracker();
