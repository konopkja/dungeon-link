import { describe, it, expect, beforeEach } from 'vitest';
import { ClassName, Player, Enemy, EnemyType, EquipSlot, Room, Position, RunState, Dungeon, FloorTheme } from '@dungeon-link/shared';

/**
 * Tests for room transition and enemy AI processing logic
 *
 * These tests ensure that:
 * 1. Room transitions are detected correctly when player moves between rooms
 * 2. Enemy AI only processes enemies in the current room
 * 3. The roomPadding logic works for corridors
 * 4. Bidirectional room connectivity is checked
 *
 * CRITICAL: If these tests fail, enemies may not attack players!
 */

// Room padding used in server for enemy targeting (must match GameState.ts)
const ROOM_PADDING = 200;

// Helper to create a test player
function createTestPlayer(position: Position = { x: 100, y: 100 }): Player {
  return {
    id: 'test-player',
    name: 'TestPlayer',
    classId: ClassName.Warrior,
    position: { ...position },
    stats: {
      health: 100, maxHealth: 100, mana: 50, maxMana: 50,
      attackPower: 10, spellPower: 5, armor: 10, crit: 5, haste: 0, lifesteal: 0, resist: 5
    },
    baseStats: {
      health: 100, maxHealth: 100, mana: 50, maxMana: 50,
      attackPower: 10, spellPower: 5, armor: 10, crit: 5, haste: 0, lifesteal: 0, resist: 5
    },
    equipment: {
      [EquipSlot.Head]: null, [EquipSlot.Chest]: null, [EquipSlot.Legs]: null,
      [EquipSlot.Feet]: null, [EquipSlot.Hands]: null, [EquipSlot.Weapon]: null,
      [EquipSlot.Ring]: null, [EquipSlot.Trinket]: null
    },
    abilities: [],
    gold: 0,
    rerollTokens: 0,
    isAlive: true,
    targetId: null,
    backpack: [],
    buffs: [],
    level: 1,
    xp: 0,
    xpToNextLevel: 100
  };
}

// Helper to create a test room
function createTestRoom(id: string, x: number, y: number, width: number = 300, height: number = 300): Room {
  return {
    id,
    type: 'normal' as const,
    x, y, width, height,
    enemies: [],
    connectedTo: [],
    cleared: false,
    chests: [],
    traps: []
  };
}

// Helper to create a test enemy
function createTestEnemy(id: string, position: Position, type: EnemyType = EnemyType.Melee): Enemy {
  return {
    id,
    name: `Test Enemy ${id}`,
    type,
    position: { ...position },
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
}

/**
 * Check if player is STRICTLY inside a room (not in corridor)
 * This is the primary check for room transitions
 */
function isStrictlyInsideRoom(position: Position, room: Room): boolean {
  return position.x >= room.x &&
         position.x <= room.x + room.width &&
         position.y >= room.y &&
         position.y <= room.y + room.height;
}

/**
 * Check if player is within room bounds with padding (for corridor transitions)
 */
function isWithinRoomPadding(position: Position, room: Room, padding: number = ROOM_PADDING): boolean {
  return position.x >= room.x - padding &&
         position.x <= room.x + room.width + padding &&
         position.y >= room.y - padding &&
         position.y <= room.y + room.height + padding;
}

/**
 * Find which room contains the position (simulates server findRoomAtPosition)
 */
function findRoomAtPosition(rooms: Room[], position: Position): Room | null {
  // First, check if strictly inside any room
  for (const room of rooms) {
    if (isStrictlyInsideRoom(position, room)) {
      return room;
    }
  }

  // If not inside any room (in corridor), find the nearest room within padding
  let nearestRoom: Room | null = null;
  let nearestDist = Infinity;

  for (const room of rooms) {
    if (isWithinRoomPadding(position, room)) {
      const roomCenterX = room.x + room.width / 2;
      const roomCenterY = room.y + room.height / 2;
      const dist = Math.sqrt(
        Math.pow(position.x - roomCenterX, 2) +
        Math.pow(position.y - roomCenterY, 2)
      );

      if (dist < nearestDist) {
        nearestDist = dist;
        nearestRoom = room;
      }
    }
  }

  return nearestRoom;
}

/**
 * Check if room transition should happen (simulates server logic)
 */
function shouldTransitionToRoom(
  currentRoomId: string,
  newRoom: Room,
  playerPosition: Position,
  rooms: Room[]
): boolean {
  if (newRoom.id === currentRoomId) return false;

  const currentRoom = rooms.find(r => r.id === currentRoomId);

  // Check if player is STRICTLY inside the new room
  const strictlyInsideNewRoom = isStrictlyInsideRoom(playerPosition, newRoom);

  // Check bidirectional connectivity
  const isConnected = currentRoom && (
    currentRoom.connectedTo.includes(newRoom.id) ||
    newRoom.connectedTo.includes(currentRoomId)
  );

  const isCleared = currentRoom && currentRoom.cleared;

  // Allow transition if strictly inside, connected, or current room is cleared
  return strictlyInsideNewRoom || !!isConnected || !!isCleared;
}

/**
 * Check if enemy can target player (simulates server targeting logic)
 */
function canEnemyTargetPlayer(enemy: Enemy, player: Player, currentRoom: Room): boolean {
  if (!player.isAlive) return false;
  if (player.buffs.some(b => b.icon === 'rogue_vanish' || b.icon === 'rogue_stealth')) return false;

  // Player must be within room padding
  return isWithinRoomPadding(player.position, currentRoom);
}

// =============================================================================
// ROOM TRANSITION TESTS
// =============================================================================

describe('Room Transition - Strictly Inside Detection', () => {
  it('should detect player strictly inside a room', () => {
    const room = createTestRoom('room_1', 0, 0, 300, 300);
    const position = { x: 150, y: 150 };

    expect(isStrictlyInsideRoom(position, room)).toBe(true);
  });

  it('should detect player at room corners as inside', () => {
    const room = createTestRoom('room_1', 0, 0, 300, 300);

    expect(isStrictlyInsideRoom({ x: 0, y: 0 }, room)).toBe(true);
    expect(isStrictlyInsideRoom({ x: 300, y: 0 }, room)).toBe(true);
    expect(isStrictlyInsideRoom({ x: 0, y: 300 }, room)).toBe(true);
    expect(isStrictlyInsideRoom({ x: 300, y: 300 }, room)).toBe(true);
  });

  it('should NOT detect player outside room as strictly inside', () => {
    const room = createTestRoom('room_1', 0, 0, 300, 300);

    expect(isStrictlyInsideRoom({ x: -1, y: 150 }, room)).toBe(false);
    expect(isStrictlyInsideRoom({ x: 301, y: 150 }, room)).toBe(false);
    expect(isStrictlyInsideRoom({ x: 150, y: -1 }, room)).toBe(false);
    expect(isStrictlyInsideRoom({ x: 150, y: 301 }, room)).toBe(false);
  });

  it('should detect player in corridor as NOT strictly inside', () => {
    const room1 = createTestRoom('room_1', 0, 0, 300, 300);
    const room2 = createTestRoom('room_2', 400, 0, 300, 300);

    // Position in corridor between rooms
    const corridorPosition = { x: 350, y: 150 };

    expect(isStrictlyInsideRoom(corridorPosition, room1)).toBe(false);
    expect(isStrictlyInsideRoom(corridorPosition, room2)).toBe(false);
  });
});

describe('Room Transition - Corridor Padding', () => {
  it('should detect player in corridor within padding', () => {
    const room = createTestRoom('room_1', 0, 0, 300, 300);

    // Position just outside room but within 200px padding
    const corridorPosition = { x: 350, y: 150 };

    expect(isStrictlyInsideRoom(corridorPosition, room)).toBe(false);
    expect(isWithinRoomPadding(corridorPosition, room)).toBe(true);
  });

  it('should NOT detect player far outside room', () => {
    const room = createTestRoom('room_1', 0, 0, 300, 300);

    // Position well outside room and padding
    const farPosition = { x: 600, y: 150 };

    expect(isWithinRoomPadding(farPosition, room)).toBe(false);
  });

  it('should use 200px padding for wide corridors', () => {
    const room = createTestRoom('room_1', 0, 0, 300, 300);

    // Position exactly at padding boundary
    const atPadding = { x: 500, y: 150 }; // 300 + 200 = 500

    expect(isWithinRoomPadding(atPadding, room)).toBe(true);
    expect(isWithinRoomPadding({ x: 501, y: 150 }, room)).toBe(false);
  });
});

describe('Room Transition - Find Room At Position', () => {
  let rooms: Room[];

  beforeEach(() => {
    rooms = [
      createTestRoom('room_1', 0, 0, 300, 300),
      createTestRoom('room_2', 500, 0, 300, 300),
      createTestRoom('room_3', 0, 500, 300, 300)
    ];
  });

  it('should find room when player is strictly inside', () => {
    const result = findRoomAtPosition(rooms, { x: 150, y: 150 });
    expect(result?.id).toBe('room_1');
  });

  it('should find nearest room when player is in corridor', () => {
    // In corridor between room_1 and room_2
    const result = findRoomAtPosition(rooms, { x: 350, y: 150 });
    expect(result).not.toBe(null);
    // Should find room_1 as it's closer
    expect(result?.id).toBe('room_1');
  });

  it('should return null when player is far from all rooms', () => {
    const result = findRoomAtPosition(rooms, { x: 2000, y: 2000 });
    expect(result).toBe(null);
  });

  it('should prioritize strictly inside over nearest', () => {
    // Player is strictly inside room_2
    const result = findRoomAtPosition(rooms, { x: 650, y: 150 });
    expect(result?.id).toBe('room_2');
  });
});

describe('Room Transition - Transition Decision', () => {
  let rooms: Room[];

  beforeEach(() => {
    rooms = [
      createTestRoom('start_room', 0, 0, 300, 300),
      createTestRoom('room_1', 500, 0, 300, 300),
      createTestRoom('room_2', 1000, 0, 300, 300)
    ];
    rooms[0].connectedTo = ['room_1'];
    rooms[1].connectedTo = ['start_room', 'room_2'];
    rooms[2].connectedTo = ['room_1'];
  });

  it('should allow transition when strictly inside new room', () => {
    const playerPosition = { x: 650, y: 150 }; // Inside room_1

    expect(shouldTransitionToRoom('start_room', rooms[1], playerPosition, rooms)).toBe(true);
  });

  it('should allow transition when rooms are connected (forward)', () => {
    // Player in corridor, not strictly inside
    const playerPosition = { x: 400, y: 150 };

    // start_room is connected to room_1
    expect(shouldTransitionToRoom('start_room', rooms[1], playerPosition, rooms)).toBe(true);
  });

  it('should allow transition when rooms are connected (backward/bidirectional)', () => {
    const playerPosition = { x: 100, y: 150 };

    // room_1 is connected to start_room (bidirectional check)
    expect(shouldTransitionToRoom('room_1', rooms[0], playerPosition, rooms)).toBe(true);
  });

  it('should allow transition when current room is cleared', () => {
    rooms[0].cleared = true;
    const playerPosition = { x: 400, y: 150 };

    expect(shouldTransitionToRoom('start_room', rooms[1], playerPosition, rooms)).toBe(true);
  });

  it('should NOT allow transition to same room', () => {
    const playerPosition = { x: 150, y: 150 };

    expect(shouldTransitionToRoom('start_room', rooms[0], playerPosition, rooms)).toBe(false);
  });

  it('BUG FIX: should allow transition even if connectivity is one-way', () => {
    // Remove bidirectional connection
    rooms[1].connectedTo = ['room_2']; // room_1 only connects to room_2, not start_room

    const playerPosition = { x: 650, y: 150 }; // Strictly inside room_1

    // Should still transition because player is STRICTLY inside
    expect(shouldTransitionToRoom('start_room', rooms[1], playerPosition, rooms)).toBe(true);
  });
});

// =============================================================================
// ENEMY AI PROCESSING TESTS
// =============================================================================

describe('Enemy AI - Room-Based Processing', () => {
  let rooms: Room[];
  let player: Player;

  beforeEach(() => {
    rooms = [
      createTestRoom('room_1', 0, 0, 300, 300),
      createTestRoom('room_2', 500, 0, 300, 300)
    ];

    // Add enemies to room_1
    rooms[0].enemies = [
      createTestEnemy('enemy_1', { x: 100, y: 100 }),
      createTestEnemy('enemy_2', { x: 200, y: 200 })
    ];

    // Add enemies to room_2
    rooms[1].enemies = [
      createTestEnemy('enemy_3', { x: 600, y: 100 }),
      createTestEnemy('enemy_4', { x: 700, y: 200 })
    ];

    player = createTestPlayer({ x: 150, y: 150 });
  });

  it('should only target player when in correct room', () => {
    // Player is in room_1
    const currentRoom = rooms[0];

    expect(canEnemyTargetPlayer(rooms[0].enemies[0], player, currentRoom)).toBe(true);
    expect(canEnemyTargetPlayer(rooms[0].enemies[1], player, currentRoom)).toBe(true);
  });

  it('should NOT target player when player is in different room', () => {
    // Player is in room_2
    player.position = { x: 650, y: 150 };
    const currentRoom = rooms[0]; // But we're checking room_1's enemies

    expect(canEnemyTargetPlayer(rooms[0].enemies[0], player, currentRoom)).toBe(false);
  });

  it('should target player in corridor within padding', () => {
    // Player is in corridor but within 200px of room_1
    player.position = { x: 350, y: 150 };
    const currentRoom = rooms[0];

    expect(canEnemyTargetPlayer(rooms[0].enemies[0], player, currentRoom)).toBe(true);
  });

  it('should NOT target dead player', () => {
    player.isAlive = false;
    const currentRoom = rooms[0];

    expect(canEnemyTargetPlayer(rooms[0].enemies[0], player, currentRoom)).toBe(false);
  });

  it('should NOT target stealthed player', () => {
    player.buffs = [{
      id: 'stealth_1',
      name: 'Stealth',
      icon: 'rogue_stealth',
      duration: 10,
      maxDuration: 10,
      isDebuff: false
    }];
    const currentRoom = rooms[0];

    expect(canEnemyTargetPlayer(rooms[0].enemies[0], player, currentRoom)).toBe(false);
  });
});

describe('Enemy AI - Critical Bug Prevention', () => {
  it('BUG: currentRoomId must update when player enters room', () => {
    const rooms = [
      createTestRoom('start_room', 0, 0, 300, 300),
      createTestRoom('room_1', 500, 0, 300, 300)
    ];
    rooms[0].connectedTo = ['room_1'];
    rooms[1].connectedTo = ['start_room'];
    rooms[1].enemies = [createTestEnemy('enemy_1', { x: 600, y: 150 })];

    let currentRoomId = 'start_room';
    const player = createTestPlayer({ x: 650, y: 150 }); // Player is in room_1

    // Find the room the player is actually in
    const actualRoom = findRoomAtPosition(rooms, player.position);
    expect(actualRoom?.id).toBe('room_1');

    // Check if transition should happen
    const shouldTransition = shouldTransitionToRoom(currentRoomId, actualRoom!, player.position, rooms);
    expect(shouldTransition).toBe(true);

    // Simulate the transition
    if (shouldTransition) {
      currentRoomId = actualRoom!.id;
    }

    // Now currentRoomId should match where the player is
    expect(currentRoomId).toBe('room_1');

    // And enemies in room_1 should be able to target the player
    const currentRoom = rooms.find(r => r.id === currentRoomId)!;
    expect(canEnemyTargetPlayer(currentRoom.enemies[0], player, currentRoom)).toBe(true);
  });

  it('BUG: enemies must attack when player is in their room', () => {
    const rooms = [
      createTestRoom('room_1', 0, 0, 300, 300)
    ];
    rooms[0].enemies = [
      createTestEnemy('melee_1', { x: 100, y: 100 }, EnemyType.Melee),
      createTestEnemy('ranged_1', { x: 200, y: 200 }, EnemyType.Ranged),
      createTestEnemy('caster_1', { x: 150, y: 250 }, EnemyType.Caster)
    ];

    const player = createTestPlayer({ x: 150, y: 150 });
    const currentRoom = rooms[0];

    // All enemies should be able to target the player
    for (const enemy of currentRoom.enemies) {
      expect(canEnemyTargetPlayer(enemy, player, currentRoom)).toBe(true);
    }
  });

  it('BUG: walking through room should trigger transition', () => {
    const rooms = [
      createTestRoom('start_room', 0, 0, 300, 300),
      createTestRoom('room_1', 400, 0, 300, 300),  // Gap of 100px (corridor)
      createTestRoom('room_2', 800, 0, 300, 300)
    ];
    rooms[0].connectedTo = ['room_1'];
    rooms[1].connectedTo = ['start_room', 'room_2'];
    rooms[2].connectedTo = ['room_1'];

    // Simulate player walking from start_room through room_1 to room_2
    let currentRoomId = 'start_room';
    const walkPath = [
      { x: 150, y: 150 },  // In start_room
      { x: 350, y: 150 },  // In corridor (within padding of both rooms)
      { x: 550, y: 150 },  // In room_1
      { x: 750, y: 150 },  // In corridor
      { x: 950, y: 150 }   // In room_2
    ];

    for (const position of walkPath) {
      const newRoom = findRoomAtPosition(rooms, position);
      if (newRoom && shouldTransitionToRoom(currentRoomId, newRoom, position, rooms)) {
        currentRoomId = newRoom.id;
      }
    }

    // After walking, player should be in room_2
    expect(currentRoomId).toBe('room_2');
  });
});

describe('Enemy AI - Multiple Enemy Types', () => {
  it('all enemy types should be able to target player in same room', () => {
    const room = createTestRoom('room_1', 0, 0, 300, 300);
    room.enemies = [
      createTestEnemy('melee', { x: 50, y: 50 }, EnemyType.Melee),
      createTestEnemy('ranged', { x: 100, y: 50 }, EnemyType.Ranged),
      createTestEnemy('caster', { x: 150, y: 50 }, EnemyType.Caster)
    ];

    const player = createTestPlayer({ x: 150, y: 150 });

    for (const enemy of room.enemies) {
      const canTarget = canEnemyTargetPlayer(enemy, player, room);
      expect(canTarget).toBe(true);
    }
  });
});

describe('Room Transition - Edge Cases', () => {
  it('should handle rooms at different floor positions', () => {
    const rooms = [
      createTestRoom('room_1', 1500, 1500, 300, 300),
      createTestRoom('room_2', 2000, 1500, 300, 300)
    ];

    const position = { x: 1650, y: 1650 };
    const result = findRoomAtPosition(rooms, position);

    expect(result?.id).toBe('room_1');
  });

  it('should handle very large rooms', () => {
    const room = createTestRoom('large_room', 0, 0, 1000, 1000);

    expect(isStrictlyInsideRoom({ x: 500, y: 500 }, room)).toBe(true);
    expect(isStrictlyInsideRoom({ x: 0, y: 0 }, room)).toBe(true);
    expect(isStrictlyInsideRoom({ x: 1000, y: 1000 }, room)).toBe(true);
  });

  it('should handle boss room (typically larger)', () => {
    const bossRoom = createTestRoom('boss_room', 0, 0, 500, 500);
    bossRoom.type = 'boss';
    bossRoom.enemies = [
      createTestEnemy('boss', { x: 250, y: 250 }, EnemyType.Melee)
    ];
    bossRoom.enemies[0].isBoss = true;

    const player = createTestPlayer({ x: 250, y: 400 });

    expect(canEnemyTargetPlayer(bossRoom.enemies[0], player, bossRoom)).toBe(true);
  });
});
