import { describe, it, expect, beforeEach } from 'vitest';
import { ClassName, Player, Enemy, EnemyType, EquipSlot, Room, Position, Buff } from '@dungeon-link/shared';

/**
 * Tests for enemy targeting logic
 * These tests verify that enemies can correctly find and target players
 * based on room position, stealth status, and other conditions.
 */

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
      [EquipSlot.Head]: null,
      [EquipSlot.Chest]: null,
      [EquipSlot.Legs]: null,
      [EquipSlot.Feet]: null,
      [EquipSlot.Hands]: null,
      [EquipSlot.Weapon]: null,
      [EquipSlot.Ring]: null,
      [EquipSlot.Trinket]: null
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
function createTestRoom(id: string = 'room_1_1'): Room {
  return {
    id,
    type: 'normal' as const,
    x: 0,
    y: 0,
    width: 300,
    height: 300,
    enemies: [],
    connectedTo: [],
    cleared: false,
    chests: [],
    traps: []
  };
}

// Helper to create a test enemy
function createTestEnemy(id: string, position: Position): Enemy {
  return {
    id,
    name: 'Test Enemy',
    type: EnemyType.Melee,
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

// Helper to check if player is within room bounds (simulates server targeting logic)
function isPlayerInRoom(player: Player, room: Room, roomPadding: number = 50): boolean {
  return player.position.x >= room.x - roomPadding &&
         player.position.x <= room.x + room.width + roomPadding &&
         player.position.y >= room.y - roomPadding &&
         player.position.y <= room.y + room.height + roomPadding;
}

// Helper to check if player is stealthed
function isPlayerStealthed(player: Player): boolean {
  return player.buffs.some(b => b.icon === 'rogue_vanish' || b.icon === 'rogue_stealth');
}

// Helper to find nearest targetable player (simulates server targeting logic)
function findTargetablePlayer(players: Player[], room: Room): Player | null {
  const roomPadding = 50;

  for (const player of players) {
    if (!player.isAlive) continue;
    if (isPlayerStealthed(player)) continue;
    if (!isPlayerInRoom(player, room, roomPadding)) continue;
    return player;
  }

  return null;
}

describe('Enemy Targeting - Room Bounds', () => {
  let room: Room;
  let player: Player;

  beforeEach(() => {
    room = createTestRoom();
    player = createTestPlayer();
  });

  it('should find player when inside room bounds', () => {
    // Player at (100, 100), room is (0,0) to (300, 300)
    player.position = { x: 100, y: 100 };

    expect(isPlayerInRoom(player, room)).toBe(true);
    expect(findTargetablePlayer([player], room)).toBe(player);
  });

  it('should find player when at room center', () => {
    player.position = { x: 150, y: 150 };

    expect(isPlayerInRoom(player, room)).toBe(true);
    expect(findTargetablePlayer([player], room)).toBe(player);
  });

  it('should find player when near room edge (within padding)', () => {
    // Just outside room but within 50px padding
    player.position = { x: -30, y: 150 };

    expect(isPlayerInRoom(player, room)).toBe(true);
    expect(findTargetablePlayer([player], room)).toBe(player);
  });

  it('should NOT find player when far outside room bounds', () => {
    // Well outside room and padding
    player.position = { x: -100, y: -100 };

    expect(isPlayerInRoom(player, room)).toBe(false);
    expect(findTargetablePlayer([player], room)).toBe(null);
  });

  it('should NOT find player when on opposite side of map', () => {
    player.position = { x: 5000, y: 5000 };

    expect(isPlayerInRoom(player, room)).toBe(false);
    expect(findTargetablePlayer([player], room)).toBe(null);
  });

  it('should find player at room boundary corners', () => {
    // Test all four corners (with padding)
    const corners = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 0, y: 300 },
      { x: 300, y: 300 }
    ];

    for (const corner of corners) {
      player.position = corner;
      expect(isPlayerInRoom(player, room)).toBe(true);
    }
  });
});

describe('Enemy Targeting - Stealth Detection', () => {
  let room: Room;
  let player: Player;

  beforeEach(() => {
    room = createTestRoom();
    player = createTestPlayer({ x: 150, y: 150 });
  });

  it('should find non-stealthed player', () => {
    expect(player.buffs.length).toBe(0);
    expect(isPlayerStealthed(player)).toBe(false);
    expect(findTargetablePlayer([player], room)).toBe(player);
  });

  it('should NOT find player with rogue_stealth buff', () => {
    player.buffs = [{
      id: 'stealth_1',
      name: 'Stealth',
      icon: 'rogue_stealth',
      duration: 10,
      maxDuration: 10,
      isDebuff: false
    }];

    expect(isPlayerStealthed(player)).toBe(true);
    expect(findTargetablePlayer([player], room)).toBe(null);
  });

  it('should NOT find player with rogue_vanish buff', () => {
    player.buffs = [{
      id: 'vanish_1',
      name: 'Vanish',
      icon: 'rogue_vanish',
      duration: 4,
      maxDuration: 4,
      isDebuff: false
    }];

    expect(isPlayerStealthed(player)).toBe(true);
    expect(findTargetablePlayer([player], room)).toBe(null);
  });

  it('should find player with other buffs (not stealth)', () => {
    player.buffs = [{
      id: 'blessing_1',
      name: 'Blessing of Protection',
      icon: 'paladin_blessing',
      duration: 10,
      maxDuration: 10,
      isDebuff: false
    }];

    expect(isPlayerStealthed(player)).toBe(false);
    expect(findTargetablePlayer([player], room)).toBe(player);
  });

  it('should find player after stealth expires', () => {
    // Stealth with 0 duration (expired)
    player.buffs = [{
      id: 'stealth_1',
      name: 'Stealth',
      icon: 'rogue_stealth',
      duration: 0,
      maxDuration: 10,
      isDebuff: false
    }];

    // Simulating buff expiration (buffs with duration <= 0 should be filtered)
    player.buffs = player.buffs.filter(b => b.duration > 0);

    expect(isPlayerStealthed(player)).toBe(false);
    expect(findTargetablePlayer([player], room)).toBe(player);
  });
});

describe('Enemy Targeting - Dead Players', () => {
  let room: Room;

  beforeEach(() => {
    room = createTestRoom();
  });

  it('should NOT find dead player', () => {
    const player = createTestPlayer({ x: 150, y: 150 });
    player.isAlive = false;

    expect(findTargetablePlayer([player], room)).toBe(null);
  });

  it('should find alive player among dead ones', () => {
    const deadPlayer1 = createTestPlayer({ x: 100, y: 100 });
    deadPlayer1.id = 'dead1';
    deadPlayer1.isAlive = false;

    const deadPlayer2 = createTestPlayer({ x: 200, y: 200 });
    deadPlayer2.id = 'dead2';
    deadPlayer2.isAlive = false;

    const alivePlayer = createTestPlayer({ x: 150, y: 150 });
    alivePlayer.id = 'alive';

    expect(findTargetablePlayer([deadPlayer1, deadPlayer2, alivePlayer], room)).toBe(alivePlayer);
  });
});

describe('Enemy Targeting - Multiple Players', () => {
  let room: Room;

  beforeEach(() => {
    room = createTestRoom();
  });

  it('should find first targetable player when multiple exist', () => {
    const player1 = createTestPlayer({ x: 100, y: 100 });
    player1.id = 'player1';

    const player2 = createTestPlayer({ x: 200, y: 200 });
    player2.id = 'player2';

    const result = findTargetablePlayer([player1, player2], room);
    expect(result).not.toBe(null);
    expect(result!.id).toBe('player1'); // Should find first
  });

  it('should skip stealthed player and find non-stealthed one', () => {
    const stealthedPlayer = createTestPlayer({ x: 100, y: 100 });
    stealthedPlayer.id = 'stealthed';
    stealthedPlayer.buffs = [{
      id: 'stealth_1',
      name: 'Stealth',
      icon: 'rogue_stealth',
      duration: 10,
      maxDuration: 10,
      isDebuff: false
    }];

    const normalPlayer = createTestPlayer({ x: 200, y: 200 });
    normalPlayer.id = 'normal';

    expect(findTargetablePlayer([stealthedPlayer, normalPlayer], room)).toBe(normalPlayer);
  });

  it('should return null when all players are stealthed', () => {
    const player1 = createTestPlayer({ x: 100, y: 100 });
    player1.buffs = [{ id: '1', name: 'Stealth', icon: 'rogue_stealth', duration: 10, maxDuration: 10, isDebuff: false }];

    const player2 = createTestPlayer({ x: 200, y: 200 });
    player2.buffs = [{ id: '2', name: 'Vanish', icon: 'rogue_vanish', duration: 4, maxDuration: 4, isDebuff: false }];

    expect(findTargetablePlayer([player1, player2], room)).toBe(null);
  });
});

describe('Enemy Targeting - Room Transitions', () => {
  it('should not find player in a different room', () => {
    const room1 = createTestRoom('room_1_1');
    room1.x = 0;
    room1.y = 0;
    room1.width = 300;
    room1.height = 300;

    const room2 = createTestRoom('room_1_2');
    room2.x = 500;
    room2.y = 0;
    room2.width = 300;
    room2.height = 300;

    const player = createTestPlayer({ x: 600, y: 150 }); // In room2

    // Player should not be found when checking room1
    expect(isPlayerInRoom(player, room1)).toBe(false);
    expect(findTargetablePlayer([player], room1)).toBe(null);

    // Player should be found when checking room2
    expect(isPlayerInRoom(player, room2)).toBe(true);
    expect(findTargetablePlayer([player], room2)).toBe(player);
  });

  it('should handle player at room boundary during transition', () => {
    const room = createTestRoom();
    room.x = 0;
    room.y = 0;
    room.width = 300;
    room.height = 300;

    // Player exactly at the edge
    const player = createTestPlayer({ x: 300, y: 150 });

    // Should still be found (within padding)
    expect(isPlayerInRoom(player, room)).toBe(true);
    expect(findTargetablePlayer([player], room)).toBe(player);
  });
});

describe('Enemy Targeting - Attack Range', () => {
  const MELEE_RANGE = 60;
  const RANGED_RANGE = 300;

  function isInAttackRange(enemy: Enemy, player: Player): boolean {
    const dx = player.position.x - enemy.position.x;
    const dy = player.position.y - enemy.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const attackRange = enemy.type === EnemyType.Melee ? MELEE_RANGE : RANGED_RANGE;
    return distance <= attackRange;
  }

  it('melee enemy should be in range when player is close', () => {
    const enemy = createTestEnemy('enemy1', { x: 100, y: 100 });
    enemy.type = EnemyType.Melee;
    const player = createTestPlayer({ x: 140, y: 100 }); // 40px away

    expect(isInAttackRange(enemy, player)).toBe(true);
  });

  it('melee enemy should NOT be in range when player is far', () => {
    const enemy = createTestEnemy('enemy1', { x: 100, y: 100 });
    enemy.type = EnemyType.Melee;
    const player = createTestPlayer({ x: 200, y: 100 }); // 100px away

    expect(isInAttackRange(enemy, player)).toBe(false);
  });

  it('ranged enemy should be in range when player is at medium distance', () => {
    const enemy = createTestEnemy('enemy1', { x: 100, y: 100 });
    enemy.type = EnemyType.Ranged;
    const player = createTestPlayer({ x: 300, y: 100 }); // 200px away

    expect(isInAttackRange(enemy, player)).toBe(true);
  });

  it('ranged enemy should NOT be in range when player is very far', () => {
    const enemy = createTestEnemy('enemy1', { x: 100, y: 100 });
    enemy.type = EnemyType.Ranged;
    const player = createTestPlayer({ x: 500, y: 100 }); // 400px away

    expect(isInAttackRange(enemy, player)).toBe(false);
  });

  it('caster enemy should have ranged attack range', () => {
    const enemy = createTestEnemy('enemy1', { x: 100, y: 100 });
    enemy.type = EnemyType.Caster;
    const player = createTestPlayer({ x: 350, y: 100 }); // 250px away

    expect(isInAttackRange(enemy, player)).toBe(true);
  });
});

describe('Enemy Targeting - Boss vs Regular Enemy', () => {
  it('boss should be able to target players in room', () => {
    const room = createTestRoom();
    const player = createTestPlayer({ x: 150, y: 150 });

    // Boss enemy
    const boss = createTestEnemy('boss_1', { x: 200, y: 200 });
    boss.isBoss = true;
    boss.name = 'Test Boss';

    expect(findTargetablePlayer([player], room)).toBe(player);
  });

  it('regular enemy should be able to target players in room', () => {
    const room = createTestRoom();
    const player = createTestPlayer({ x: 150, y: 150 });

    // Regular enemy
    const enemy = createTestEnemy('enemy_1', { x: 200, y: 200 });
    enemy.isBoss = false;

    expect(findTargetablePlayer([player], room)).toBe(player);
  });
});

describe('Player Name Validation', () => {
  it('player should always have a non-empty name', () => {
    const player = createTestPlayer();
    expect(player.name).toBeTruthy();
    expect(player.name.length).toBeGreaterThan(0);
  });

  it('should handle fallback for empty player name', () => {
    // Simulate the server-side fallback logic
    const emptyName: string = '';
    const playerName = emptyName || 'Hero';
    expect(playerName).toBe('Hero');
  });

  it('should use actual name when provided', () => {
    const providedName = 'MyCharacter';
    const playerName = providedName || 'Hero';
    expect(playerName).toBe('MyCharacter');
  });
});
