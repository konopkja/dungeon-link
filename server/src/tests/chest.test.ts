import { describe, it, expect, beforeEach } from 'vitest';
import { ClassName, Player, EquipSlot, Room, Chest, Position } from '@dungeon-link/shared';

/**
 * Tests for chest opening system
 * These tests verify that chests can be opened correctly
 * based on distance, locked status, and mimic mechanics.
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

// Helper to create a test chest
function createTestChest(position: Position, options: Partial<Chest> = {}): Chest {
  return {
    id: options.id || 'chest_test_1',
    position: { ...position },
    isOpen: options.isOpen || false,
    isLocked: options.isLocked || false,
    lootTier: options.lootTier || 'common',
    isMimic: options.isMimic || false
  };
}

// Helper to create a test room with chests
function createTestRoom(chests: Chest[] = []): Room {
  return {
    id: 'room_1_1',
    type: 'normal' as const,
    x: 0,
    y: 0,
    width: 300,
    height: 300,
    enemies: [],
    connectedTo: [],
    cleared: false,
    chests,
    traps: []
  };
}

// Calculate distance between player and chest
function getDistance(player: Player, chest: Chest): number {
  const dx = player.position.x - chest.position.x;
  const dy = player.position.y - chest.position.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Check if player can open chest (simulates server logic)
const MAX_CHEST_DISTANCE = 80;

interface ChestOpenResult {
  canOpen: boolean;
  reason?: string;
}

function canOpenChest(player: Player, chest: Chest): ChestOpenResult {
  // Check if player is alive
  if (!player.isAlive) {
    return { canOpen: false, reason: 'Player is dead' };
  }

  // Check if chest is already open
  if (chest.isOpen) {
    return { canOpen: false, reason: 'Chest is already open' };
  }

  // Check distance
  const distance = getDistance(player, chest);
  if (distance > MAX_CHEST_DISTANCE) {
    return { canOpen: false, reason: `Too far from chest: ${distance.toFixed(0)} > ${MAX_CHEST_DISTANCE}` };
  }

  // Check if locked
  if (chest.isLocked) {
    return { canOpen: false, reason: 'Chest is locked' };
  }

  return { canOpen: true };
}

// Find chest by ID in rooms
function findChestInRooms(rooms: Room[], chestId: string): Chest | null {
  for (const room of rooms) {
    if (!room.chests) continue;
    const chest = room.chests.find(c => c.id === chestId);
    if (chest) return chest;
  }
  return null;
}

describe('Chest Opening - Distance Check', () => {
  let player: Player;

  beforeEach(() => {
    player = createTestPlayer({ x: 100, y: 100 });
  });

  it('should allow opening chest when player is close (within 80px)', () => {
    const chest = createTestChest({ x: 150, y: 100 }); // 50px away
    const result = canOpenChest(player, chest);

    expect(result.canOpen).toBe(true);
    expect(getDistance(player, chest)).toBeLessThanOrEqual(MAX_CHEST_DISTANCE);
  });

  it('should allow opening chest when player is right next to it', () => {
    const chest = createTestChest({ x: 110, y: 100 }); // 10px away
    const result = canOpenChest(player, chest);

    expect(result.canOpen).toBe(true);
    expect(getDistance(player, chest)).toBeLessThan(20);
  });

  it('should allow opening chest at exact max distance', () => {
    const chest = createTestChest({ x: 180, y: 100 }); // 80px away
    const result = canOpenChest(player, chest);

    expect(result.canOpen).toBe(true);
    expect(getDistance(player, chest)).toBe(MAX_CHEST_DISTANCE);
  });

  it('should NOT allow opening chest when player is too far', () => {
    const chest = createTestChest({ x: 200, y: 100 }); // 100px away
    const result = canOpenChest(player, chest);

    expect(result.canOpen).toBe(false);
    expect(result.reason).toContain('Too far');
    expect(getDistance(player, chest)).toBeGreaterThan(MAX_CHEST_DISTANCE);
  });

  it('should NOT allow opening chest on other side of room', () => {
    const chest = createTestChest({ x: 300, y: 300 }); // ~283px away
    const result = canOpenChest(player, chest);

    expect(result.canOpen).toBe(false);
    expect(result.reason).toContain('Too far');
  });

  it('should calculate diagonal distance correctly', () => {
    const chest = createTestChest({ x: 156, y: 156 }); // ~79px diagonally
    const distance = getDistance(player, chest);

    // sqrt((56)^2 + (56)^2) ≈ 79.2
    expect(distance).toBeCloseTo(79.2, 0);
    expect(canOpenChest(player, chest).canOpen).toBe(true);
  });
});

describe('Chest Opening - Locked Status', () => {
  let player: Player;

  beforeEach(() => {
    player = createTestPlayer({ x: 100, y: 100 });
  });

  it('should allow opening unlocked chest', () => {
    const chest = createTestChest({ x: 120, y: 100 }, { isLocked: false });
    const result = canOpenChest(player, chest);

    expect(result.canOpen).toBe(true);
  });

  it('should NOT allow opening locked chest', () => {
    const chest = createTestChest({ x: 120, y: 100 }, { isLocked: true });
    const result = canOpenChest(player, chest);

    expect(result.canOpen).toBe(false);
    expect(result.reason).toBe('Chest is locked');
  });

  it('should reject locked chest even when very close', () => {
    const chest = createTestChest({ x: 105, y: 100 }, { isLocked: true }); // 5px away
    const result = canOpenChest(player, chest);

    expect(getDistance(player, chest)).toBeLessThan(10);
    expect(result.canOpen).toBe(false);
    expect(result.reason).toBe('Chest is locked');
  });
});

describe('Chest Opening - Already Open', () => {
  let player: Player;

  beforeEach(() => {
    player = createTestPlayer({ x: 100, y: 100 });
  });

  it('should NOT allow opening already open chest', () => {
    const chest = createTestChest({ x: 120, y: 100 }, { isOpen: true });
    const result = canOpenChest(player, chest);

    expect(result.canOpen).toBe(false);
    expect(result.reason).toBe('Chest is already open');
  });

  it('should allow opening closed chest', () => {
    const chest = createTestChest({ x: 120, y: 100 }, { isOpen: false });
    const result = canOpenChest(player, chest);

    expect(result.canOpen).toBe(true);
  });
});

describe('Chest Opening - Player Status', () => {
  it('should NOT allow dead player to open chest', () => {
    const player = createTestPlayer({ x: 100, y: 100 });
    player.isAlive = false;
    const chest = createTestChest({ x: 120, y: 100 });

    const result = canOpenChest(player, chest);

    expect(result.canOpen).toBe(false);
    expect(result.reason).toBe('Player is dead');
  });

  it('should allow alive player to open chest', () => {
    const player = createTestPlayer({ x: 100, y: 100 });
    player.isAlive = true;
    const chest = createTestChest({ x: 120, y: 100 });

    const result = canOpenChest(player, chest);

    expect(result.canOpen).toBe(true);
  });
});

describe('Chest Finding - Room Search', () => {
  it('should find chest in first room', () => {
    const chest = createTestChest({ x: 100, y: 100 }, { id: 'chest_room_1_1' });
    const room = createTestRoom([chest]);
    const rooms = [room];

    const found = findChestInRooms(rooms, 'chest_room_1_1');
    expect(found).toBe(chest);
  });

  it('should find chest in second room', () => {
    const chest1 = createTestChest({ x: 100, y: 100 }, { id: 'chest_room_1_1' });
    const chest2 = createTestChest({ x: 500, y: 100 }, { id: 'chest_room_1_2' });

    const room1 = createTestRoom([chest1]);
    room1.id = 'room_1_1';

    const room2 = createTestRoom([chest2]);
    room2.id = 'room_1_2';

    const rooms = [room1, room2];

    const found = findChestInRooms(rooms, 'chest_room_1_2');
    expect(found).toBe(chest2);
  });

  it('should return null for non-existent chest', () => {
    const chest = createTestChest({ x: 100, y: 100 }, { id: 'chest_room_1_1' });
    const room = createTestRoom([chest]);
    const rooms = [room];

    const found = findChestInRooms(rooms, 'nonexistent_chest');
    expect(found).toBe(null);
  });

  it('should return null for empty rooms', () => {
    const room = createTestRoom([]);
    const rooms = [room];

    const found = findChestInRooms(rooms, 'any_chest');
    expect(found).toBe(null);
  });

  it('should handle rooms without chests array', () => {
    const room = createTestRoom([]);
    (room as any).chests = undefined; // Simulate missing chests array
    const rooms = [room];

    const found = findChestInRooms(rooms, 'any_chest');
    expect(found).toBe(null);
  });
});

describe('Chest Tiers', () => {
  let player: Player;

  beforeEach(() => {
    player = createTestPlayer({ x: 100, y: 100 });
  });

  it('should allow opening common chest', () => {
    const chest = createTestChest({ x: 120, y: 100 }, { lootTier: 'common' });
    const result = canOpenChest(player, chest);

    expect(result.canOpen).toBe(true);
    expect(chest.lootTier).toBe('common');
  });

  it('should allow opening rare chest', () => {
    const chest = createTestChest({ x: 120, y: 100 }, { lootTier: 'rare' });
    const result = canOpenChest(player, chest);

    expect(result.canOpen).toBe(true);
    expect(chest.lootTier).toBe('rare');
  });

  it('should allow opening epic chest', () => {
    const chest = createTestChest({ x: 120, y: 100 }, { lootTier: 'epic' });
    const result = canOpenChest(player, chest);

    expect(result.canOpen).toBe(true);
    expect(chest.lootTier).toBe('epic');
  });
});

describe('Chest Mimic Mechanic', () => {
  let player: Player;

  beforeEach(() => {
    player = createTestPlayer({ x: 100, y: 100 });
  });

  it('mimic chest should be openable (triggers mimic spawn)', () => {
    const chest = createTestChest({ x: 120, y: 100 }, { isMimic: true });
    const result = canOpenChest(player, chest);

    // Mimic chests can be opened (they just spawn an enemy instead of loot)
    expect(result.canOpen).toBe(true);
    expect(chest.isMimic).toBe(true);
  });

  it('regular chest should not be a mimic', () => {
    const chest = createTestChest({ x: 120, y: 100 }, { isMimic: false });

    expect(chest.isMimic).toBe(false);
  });
});

describe('Chest ID Validation', () => {
  it('should find chest with standard ID format', () => {
    const chest = createTestChest({ x: 100, y: 100 }, { id: 'chest_room_1_3_1' });
    const room = createTestRoom([chest]);
    room.id = 'room_1_3';

    const found = findChestInRooms([room], 'chest_room_1_3_1');
    expect(found).not.toBe(null);
    expect(found!.id).toBe('chest_room_1_3_1');
  });

  it('should find boss room chest', () => {
    const chest = createTestChest({ x: 100, y: 100 }, { id: 'chest_room_1_boss_1', lootTier: 'epic' });
    const room = createTestRoom([chest]);
    room.id = 'room_1_boss';
    room.type = 'boss';

    const found = findChestInRooms([room], 'chest_room_1_boss_1');
    expect(found).not.toBe(null);
    expect(found!.lootTier).toBe('epic');
  });

  it('should handle multiple chests in same room', () => {
    const chest1 = createTestChest({ x: 100, y: 100 }, { id: 'chest_room_1_1_1' });
    const chest2 = createTestChest({ x: 200, y: 200 }, { id: 'chest_room_1_1_2' });
    const room = createTestRoom([chest1, chest2]);

    expect(findChestInRooms([room], 'chest_room_1_1_1')).toBe(chest1);
    expect(findChestInRooms([room], 'chest_room_1_1_2')).toBe(chest2);
  });
});

describe('Chest Opening - Edge Cases', () => {
  let player: Player;

  beforeEach(() => {
    player = createTestPlayer({ x: 100, y: 100 });
  });

  it('should handle chest at same position as player', () => {
    const chest = createTestChest({ x: 100, y: 100 }); // Same position
    const result = canOpenChest(player, chest);

    expect(result.canOpen).toBe(true);
    expect(getDistance(player, chest)).toBe(0);
  });

  it('should handle player at negative coordinates', () => {
    player.position = { x: -50, y: -50 };
    const chest = createTestChest({ x: -20, y: -50 }); // 30px away

    const result = canOpenChest(player, chest);
    expect(result.canOpen).toBe(true);
  });

  it('should handle large coordinate values', () => {
    player.position = { x: 10000, y: 10000 };
    const chest = createTestChest({ x: 10050, y: 10000 }); // 50px away

    const result = canOpenChest(player, chest);
    expect(result.canOpen).toBe(true);
  });

  it('multiple conditions should all fail appropriately', () => {
    // Chest is locked, too far, and already open
    player.position = { x: 100, y: 100 };
    const chest = createTestChest({ x: 300, y: 300 }, {
      isLocked: true,
      isOpen: true
    });

    const result = canOpenChest(player, chest);
    expect(result.canOpen).toBe(false);
    // First failing condition should be reported
    expect(result.reason).toBeDefined();
  });
});
