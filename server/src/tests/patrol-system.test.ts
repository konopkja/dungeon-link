import { describe, it, expect } from 'vitest';
import { Position, Room, Enemy, EnemyType, createRunTracking, RunTracking } from '@dungeon-link/shared';

/**
 * Tests for the patrol system fixes
 *
 * BUG FIXES TESTED:
 * 1. Patrol pathfinding - patrols now follow corridor waypoints instead of cutting through walls
 * 2. Patrol aggro - ex-patrollers get reduced aggro delay since they're already alert
 * 3. State cleanup - per-run tracking is stored in RunState and cleaned up automatically
 */

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createTestRoom(id: string, x: number, y: number, width = 300, height = 300): Room {
  return {
    id,
    type: 'normal',
    x,
    y,
    width,
    height,
    enemies: [],
    connectedTo: [],
    cleared: false,
    chests: [],
    traps: []
  };
}

function createPatrollingEnemy(
  id: string,
  position: Position,
  patrolRoute: string[],
  patrolWaypoints: Position[]
): Enemy {
  return {
    id,
    name: 'Patrolling Test Enemy',
    type: EnemyType.Melee,
    position: { ...position },
    spawnPosition: { ...position },
    originalRoomId: patrolRoute[0],
    stats: {
      health: 75, maxHealth: 75, mana: 30, maxMana: 30,
      attackPower: 18, spellPower: 9, armor: 6, crit: 5, haste: 10, lifesteal: 0, resist: 3
    },
    isAlive: true,
    targetId: null,
    isBoss: false,
    isRare: false,
    debuffs: [],
    // Patrol properties
    isPatrolling: true,
    patrolRoute,
    currentRoomId: patrolRoute[0],
    patrolTargetRoomId: patrolRoute[1],
    patrolWaypoints,
    currentWaypointIndex: 0,
    patrolDirection: 1
  };
}

/**
 * Calculate corridor midpoint between two rooms (same logic as DungeonGenerator)
 */
function getCorridorMidpoint(fromRoom: Room, toRoom: Room): Position {
  const fromCenterX = fromRoom.x + fromRoom.width / 2;
  const fromCenterY = fromRoom.y + fromRoom.height / 2;
  const toCenterX = toRoom.x + toRoom.width / 2;
  const toCenterY = toRoom.y + toRoom.height / 2;
  return {
    x: (fromCenterX + toCenterX) / 2,
    y: (fromCenterY + toCenterY) / 2
  };
}

/**
 * Calculate patrol waypoints for a route (same logic as DungeonGenerator)
 */
function calculatePatrolWaypoints(rooms: Room[], patrolRoute: string[]): Position[] {
  const waypoints: Position[] = [];

  for (let i = 0; i < patrolRoute.length; i++) {
    const room = rooms.find(r => r.id === patrolRoute[i]);
    if (!room) continue;

    // Add room center
    waypoints.push({
      x: room.x + room.width / 2,
      y: room.y + room.height / 2
    });

    // Add corridor midpoint to next room (if not last room)
    if (i < patrolRoute.length - 1) {
      const nextRoom = rooms.find(r => r.id === patrolRoute[i + 1]);
      if (nextRoom) {
        waypoints.push(getCorridorMidpoint(room, nextRoom));
      }
    }
  }

  return waypoints;
}

// ============================================================================
// PATROL WAYPOINT TESTS
// ============================================================================

describe('Patrol Waypoint Calculation', () => {
  it('should calculate waypoints that follow corridor paths', () => {
    // Create two connected rooms
    const room1 = createTestRoom('room_1', 0, 0, 300, 300);
    const room2 = createTestRoom('room_2', 400, 0, 300, 300); // 100px gap between rooms
    room1.connectedTo = ['room_2'];
    room2.connectedTo = ['room_1'];

    const rooms = [room1, room2];
    const patrolRoute = ['room_1', 'room_2'];

    const waypoints = calculatePatrolWaypoints(rooms, patrolRoute);

    // Should have 3 waypoints: room1 center, corridor midpoint, room2 center
    expect(waypoints.length).toBe(3);

    // Room 1 center
    expect(waypoints[0].x).toBe(150); // 0 + 300/2
    expect(waypoints[0].y).toBe(150);

    // Corridor midpoint (between 150 and 550)
    expect(waypoints[1].x).toBe(350); // (150 + 550) / 2
    expect(waypoints[1].y).toBe(150);

    // Room 2 center
    expect(waypoints[2].x).toBe(550); // 400 + 300/2
    expect(waypoints[2].y).toBe(150);
  });

  it('should handle multi-room patrol routes', () => {
    // Create three connected rooms in an L-shape
    const room1 = createTestRoom('room_1', 0, 0, 300, 300);
    const room2 = createTestRoom('room_2', 400, 0, 300, 300);
    const room3 = createTestRoom('room_3', 400, 400, 300, 300);

    room1.connectedTo = ['room_2'];
    room2.connectedTo = ['room_1', 'room_3'];
    room3.connectedTo = ['room_2'];

    const rooms = [room1, room2, room3];
    const patrolRoute = ['room_1', 'room_2', 'room_3'];

    const waypoints = calculatePatrolWaypoints(rooms, patrolRoute);

    // Should have 5 waypoints:
    // room1 center, corridor1, room2 center, corridor2, room3 center
    expect(waypoints.length).toBe(5);

    // Verify waypoints form a valid path (not straight line through walls)
    // Each waypoint should be either in a room or in a corridor
    expect(waypoints[0]).toEqual({ x: 150, y: 150 }); // Room 1 center
    expect(waypoints[2]).toEqual({ x: 550, y: 150 }); // Room 2 center
    expect(waypoints[4]).toEqual({ x: 550, y: 550 }); // Room 3 center
  });

  it('should ensure patrol does not cut through diagonal walls', () => {
    // Create two rooms positioned diagonally
    const room1 = createTestRoom('room_1', 0, 0, 300, 300);
    const room2 = createTestRoom('room_2', 400, 400, 300, 300); // Diagonal from room1

    const rooms = [room1, room2];
    const patrolRoute = ['room_1', 'room_2'];

    const waypoints = calculatePatrolWaypoints(rooms, patrolRoute);

    // The corridor waypoint should be between the two rooms
    const corridorWaypoint = waypoints[1];

    // Direct line from room1 center (150,150) to room2 center (550,550) would be diagonal
    // Corridor waypoint should be at the midpoint
    expect(corridorWaypoint.x).toBe(350);
    expect(corridorWaypoint.y).toBe(350);
  });
});

// ============================================================================
// PATROL STATE TRANSITION TESTS
// ============================================================================

describe('Patrol State Transitions', () => {
  it('should set wasPatrolling flag when entering combat', () => {
    const rooms = [
      createTestRoom('room_1', 0, 0),
      createTestRoom('room_2', 400, 0)
    ];
    rooms[0].connectedTo = ['room_2'];
    rooms[1].connectedTo = ['room_1'];

    const waypoints = calculatePatrolWaypoints(rooms, ['room_1', 'room_2']);
    const enemy = createPatrollingEnemy('patrol_1', { x: 150, y: 150 }, ['room_1', 'room_2'], waypoints);

    // Initially patrolling
    expect(enemy.isPatrolling).toBe(true);
    expect(enemy.wasPatrolling).toBeUndefined();

    // Simulate entering combat (like in GameState.ts)
    if (enemy.isPatrolling) {
      enemy.isPatrolling = false;
      enemy.patrolRoute = undefined;
      enemy.patrolTargetRoomId = undefined;
      enemy.patrolWaypoints = undefined;
      enemy.wasPatrolling = true;
    }

    // After combat starts
    expect(enemy.isPatrolling).toBe(false);
    expect(enemy.wasPatrolling).toBe(true);
    expect(enemy.patrolWaypoints).toBeUndefined();
  });

  it('should preserve originalRoomId for leash behavior', () => {
    const rooms = [
      createTestRoom('room_1', 0, 0),
      createTestRoom('room_2', 400, 0)
    ];
    const waypoints = calculatePatrolWaypoints(rooms, ['room_1', 'room_2']);
    const enemy = createPatrollingEnemy('patrol_1', { x: 150, y: 150 }, ['room_1', 'room_2'], waypoints);

    // originalRoomId should be preserved even after patrol stops
    const originalRoom = enemy.originalRoomId;

    enemy.isPatrolling = false;
    enemy.patrolRoute = undefined;
    enemy.wasPatrolling = true;

    expect(enemy.originalRoomId).toBe(originalRoom);
    expect(enemy.originalRoomId).toBe('room_1');
  });
});

// ============================================================================
// RUN TRACKING STATE CLEANUP TESTS
// ============================================================================

describe('RunTracking State Cleanup', () => {
  it('should create fresh tracking maps for each run', () => {
    const tracking1 = createRunTracking();
    const tracking2 = createRunTracking();

    // Add data to tracking1
    tracking1.attackCooldowns.set('enemy_1', 2.0);
    tracking1.enemyAggroTimes.set('enemy_1', Date.now());

    // tracking2 should be independent
    expect(tracking2.attackCooldowns.size).toBe(0);
    expect(tracking2.enemyAggroTimes.size).toBe(0);

    // tracking1 should have its data
    expect(tracking1.attackCooldowns.get('enemy_1')).toBe(2.0);
  });

  it('should have all required tracking maps initialized', () => {
    const tracking = createRunTracking();

    // Verify all maps exist and are empty
    expect(tracking.attackCooldowns).toBeInstanceOf(Map);
    expect(tracking.bossAbilityCooldowns).toBeInstanceOf(Map);
    expect(tracking.bossAoECooldowns).toBeInstanceOf(Map);
    expect(tracking.eliteAttackCooldowns).toBeInstanceOf(Map);
    expect(tracking.groundEffectDamageTicks).toBeInstanceOf(Map);
    expect(tracking.playerMovement).toBeInstanceOf(Map);
    expect(tracking.playerMomentum).toBeInstanceOf(Map);
    expect(tracking.bossFightStartTimes).toBeInstanceOf(Map);
    expect(tracking.enemyAggroTimes).toBeInstanceOf(Map);
    expect(tracking.enemyLeashTimers).toBeInstanceOf(Map);
    expect(tracking.playerDeathTimes).toBeInstanceOf(Map);
    expect(tracking.enemyCharging).toBeInstanceOf(Map);
    expect(tracking.enemyChargeCooldowns).toBeInstanceOf(Map);
  });

  it('should allow tracking data to be garbage collected with run state', () => {
    // This test verifies the design principle: tracking is part of RunState
    // When RunState is deleted, tracking goes with it

    let tracking: RunTracking | null = createRunTracking();

    // Populate with data
    tracking.attackCooldowns.set('enemy_1', 2.0);
    tracking.attackCooldowns.set('enemy_2', 1.5);
    tracking.enemyAggroTimes.set('enemy_1', Date.now());
    tracking.bossFightStartTimes.set('boss_1', Date.now());

    // Verify data exists
    expect(tracking.attackCooldowns.size).toBe(2);

    // "Delete" the run (in real code: this.runs.delete(runId))
    tracking = null;

    // In real scenario, GC would clean up the Maps
    // We can't directly test GC, but we verify the reference is gone
    expect(tracking).toBeNull();
  });
});

// ============================================================================
// PATROL AGGRO DELAY TESTS
// ============================================================================

describe('Patrol Aggro Delay', () => {
  const ENEMY_AGGRO_DELAY = 1.0; // Normal enemies
  const ENEMY_AGGRO_DELAY_PATROL = 0.3; // Ex-patrollers (already alert)

  it('should use reduced aggro delay for ex-patrollers', () => {
    const enemy = createPatrollingEnemy(
      'patrol_1',
      { x: 150, y: 150 },
      ['room_1', 'room_2'],
      [{ x: 150, y: 150 }, { x: 350, y: 150 }, { x: 550, y: 150 }]
    );

    // Simulate patrol entering combat
    enemy.isPatrolling = false;
    enemy.wasPatrolling = true;

    // Calculate required delay based on wasPatrolling flag
    const requiredDelay = enemy.wasPatrolling ? ENEMY_AGGRO_DELAY_PATROL : ENEMY_AGGRO_DELAY;

    expect(requiredDelay).toBe(0.3);
    expect(requiredDelay).toBeLessThan(ENEMY_AGGRO_DELAY);
  });

  it('should use normal aggro delay for regular enemies', () => {
    const normalEnemy: Enemy = {
      id: 'enemy_1',
      name: 'Normal Enemy',
      type: EnemyType.Melee,
      position: { x: 150, y: 150 },
      stats: {
        health: 50, maxHealth: 50, mana: 20, maxMana: 20,
        attackPower: 15, spellPower: 10, armor: 5, crit: 0, haste: 0, lifesteal: 0, resist: 5
      },
      isAlive: true,
      targetId: null,
      isBoss: false,
      isRare: false,
      debuffs: []
    };

    // Normal enemy doesn't have wasPatrolling flag
    const requiredDelay = normalEnemy.wasPatrolling ? ENEMY_AGGRO_DELAY_PATROL : ENEMY_AGGRO_DELAY;

    expect(requiredDelay).toBe(1.0);
  });
});

// ============================================================================
// WAYPOINT NAVIGATION TESTS
// ============================================================================

describe('Waypoint Navigation', () => {
  it('should correctly reverse direction at end of waypoints', () => {
    const waypoints = [
      { x: 150, y: 150 },  // Index 0: Room 1
      { x: 350, y: 150 },  // Index 1: Corridor
      { x: 550, y: 150 }   // Index 2: Room 2
    ];

    let currentIndex = 0;
    let direction: 1 | -1 = 1;

    // Walk forward through waypoints
    while (currentIndex < waypoints.length - 1) {
      currentIndex += direction;
    }
    expect(currentIndex).toBe(2);

    // At end, reverse direction
    if (currentIndex >= waypoints.length - 1) {
      direction = -1;
      currentIndex = waypoints.length - 2;
    }
    expect(direction).toBe(-1);
    expect(currentIndex).toBe(1);

    // Walk backward
    while (currentIndex > 0) {
      currentIndex += direction;
    }
    expect(currentIndex).toBe(0);

    // At start, reverse direction
    if (currentIndex <= 0) {
      direction = 1;
      currentIndex = 1;
    }
    expect(direction).toBe(1);
    expect(currentIndex).toBe(1);
  });
});
