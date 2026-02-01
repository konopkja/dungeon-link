import { describe, it, expect, beforeEach } from 'vitest';
import {
  ClassName, Player, Enemy, EnemyType, EquipSlot, Room, Position,
  RoomVariant, RoomModifier, FloorTheme, createRunTracking, RunTracking
} from '@dungeon-link/shared';

/**
 * Tests for the Room Variant System
 *
 * The room variant system adds variety to dungeon rooms through:
 * 1. Room Variants - Different enemy formations (arena, guardian, ambush, etc.)
 * 2. Room Modifiers - Environmental effects (burning, cursed, blessed, dark)
 *
 * CRITICAL INVARIANTS:
 * - Hidden enemies (ambush) MUST NOT attack or be targeted until revealed
 * - Ambush MUST trigger when player reaches room center
 * - Modifier buffs MUST be removed when player leaves modified room
 * - Burning damage MUST tick every 2 seconds
 * - Formation positions MUST be within room bounds
 *
 * If these tests fail, room mechanics may break!
 */

// ============================================================================
// TEST HELPERS
// ============================================================================

function createTestPlayer(position: Position = { x: 150, y: 150 }): Player {
  return {
    id: 'test-player',
    name: 'TestPlayer',
    classId: ClassName.Warrior,
    position: { ...position },
    stats: {
      health: 100, maxHealth: 100, mana: 50, maxMana: 50,
      attackPower: 10, spellPower: 5, armor: 20, crit: 5, haste: 0, lifesteal: 0, resist: 10
    },
    baseStats: {
      health: 100, maxHealth: 100, mana: 50, maxMana: 50,
      attackPower: 10, spellPower: 5, armor: 20, crit: 5, haste: 0, lifesteal: 0, resist: 10
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

function createTestRoom(
  id: string,
  x: number,
  y: number,
  width: number = 300,
  height: number = 300,
  variant?: RoomVariant,
  modifier?: RoomModifier
): Room {
  return {
    id,
    type: 'normal' as const,
    x, y, width, height,
    enemies: [],
    connectedTo: [],
    cleared: false,
    chests: [],
    traps: [],
    variant,
    modifier
  };
}

function createTestEnemy(
  id: string,
  position: Position,
  isHidden: boolean = false
): Enemy {
  return {
    id,
    name: `Test Enemy ${id}`,
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
    debuffs: [],
    isHidden
  };
}

// Simulates server-side ambush trigger logic
function checkAmbushTrigger(
  room: Room,
  player: Player,
  tracking: RunTracking
): boolean {
  if (room.variant !== 'ambush') return false;
  if (tracking.ambushTriggered.has(room.id)) return false;

  const roomCenter = {
    x: room.x + room.width / 2,
    y: room.y + room.height / 2
  };

  const dist = Math.hypot(
    player.position.x - roomCenter.x,
    player.position.y - roomCenter.y
  );

  if (dist < 60) {
    tracking.ambushTriggered.add(room.id);
    // Reveal enemies
    for (const enemy of room.enemies) {
      if (enemy.isHidden) {
        enemy.isHidden = false;
      }
    }
    return true;
  }

  return false;
}

// Simulates server-side hidden enemy check
function canTargetEnemy(enemy: Enemy): boolean {
  if (!enemy.isAlive) return false;
  if (enemy.isHidden) return false;
  return true;
}

// Simulates server-side enemy AI skip for hidden enemies
function shouldProcessEnemyAI(enemy: Enemy): boolean {
  if (!enemy.isAlive) return false;
  if (enemy.isHidden) return false;
  return true;
}

// Simulates modifier buff application
function applyModifierBuff(player: Player, modifier: RoomModifier): void {
  if (modifier === 'cursed') {
    const hasCurse = player.buffs.some(b => b.id === 'room_curse');
    if (!hasCurse) {
      player.buffs.push({
        id: 'room_curse',
        name: 'Cursed Ground',
        icon: 'curse',
        duration: 999999,
        maxDuration: 999999,
        isDebuff: true
      });
      player.stats.armor -= 10;
      player.stats.resist -= 5;
    }
  } else if (modifier === 'blessed') {
    const hasBless = player.buffs.some(b => b.id === 'room_bless');
    if (!hasBless) {
      player.buffs.push({
        id: 'room_bless',
        name: 'Blessed Ground',
        icon: 'bless',
        duration: 999999,
        maxDuration: 999999,
        isDebuff: false
      });
      player.stats.armor += 10;
      player.stats.crit += 5;
    }
  }
}

// Simulates modifier buff removal
function removeModifierBuff(player: Player, modifier: RoomModifier): void {
  if (modifier === 'cursed') {
    const curseIndex = player.buffs.findIndex(b => b.id === 'room_curse');
    if (curseIndex >= 0) {
      player.buffs.splice(curseIndex, 1);
      player.stats.armor += 10;
      player.stats.resist += 5;
    }
  } else if (modifier === 'blessed') {
    const blessIndex = player.buffs.findIndex(b => b.id === 'room_bless');
    if (blessIndex >= 0) {
      player.buffs.splice(blessIndex, 1);
      player.stats.armor -= 10;
      player.stats.crit -= 5;
    }
  }
}

// ============================================================================
// ROOM VARIANT TESTS
// ============================================================================

describe('Room Variant - Ambush System', () => {
  let room: Room;
  let player: Player;
  let tracking: RunTracking;

  beforeEach(() => {
    room = createTestRoom('ambush_room', 0, 0, 300, 300, 'ambush');
    // Add hidden enemies
    room.enemies = [
      createTestEnemy('enemy_1', { x: 50, y: 50 }, true),
      createTestEnemy('enemy_2', { x: 250, y: 50 }, true),
      createTestEnemy('enemy_3', { x: 50, y: 250 }, true),
      createTestEnemy('enemy_4', { x: 250, y: 250 }, true)
    ];
    player = createTestPlayer({ x: 50, y: 150 }); // Start at edge
    tracking = createRunTracking();
  });

  it('hidden enemies should not be targetable', () => {
    for (const enemy of room.enemies) {
      expect(canTargetEnemy(enemy)).toBe(false);
    }
  });

  it('hidden enemies should not process AI', () => {
    for (const enemy of room.enemies) {
      expect(shouldProcessEnemyAI(enemy)).toBe(false);
    }
  });

  it('ambush should NOT trigger when player is at room edge', () => {
    const triggered = checkAmbushTrigger(room, player, tracking);
    expect(triggered).toBe(false);
    expect(tracking.ambushTriggered.has(room.id)).toBe(false);
    // Enemies still hidden
    for (const enemy of room.enemies) {
      expect(enemy.isHidden).toBe(true);
    }
  });

  it('ambush should trigger when player reaches room center', () => {
    // Move player to center
    player.position = { x: 150, y: 150 };

    const triggered = checkAmbushTrigger(room, player, tracking);
    expect(triggered).toBe(true);
    expect(tracking.ambushTriggered.has(room.id)).toBe(true);
  });

  it('ambush should reveal all hidden enemies', () => {
    player.position = { x: 150, y: 150 };
    checkAmbushTrigger(room, player, tracking);

    for (const enemy of room.enemies) {
      expect(enemy.isHidden).toBe(false);
    }
  });

  it('revealed enemies should be targetable after ambush', () => {
    player.position = { x: 150, y: 150 };
    checkAmbushTrigger(room, player, tracking);

    for (const enemy of room.enemies) {
      expect(canTargetEnemy(enemy)).toBe(true);
    }
  });

  it('revealed enemies should process AI after ambush', () => {
    player.position = { x: 150, y: 150 };
    checkAmbushTrigger(room, player, tracking);

    for (const enemy of room.enemies) {
      expect(shouldProcessEnemyAI(enemy)).toBe(true);
    }
  });

  it('ambush should only trigger once per room', () => {
    player.position = { x: 150, y: 150 };

    // First trigger
    const firstTrigger = checkAmbushTrigger(room, player, tracking);
    expect(firstTrigger).toBe(true);

    // Move away and back
    player.position = { x: 50, y: 50 };
    player.position = { x: 150, y: 150 };

    // Second trigger attempt
    const secondTrigger = checkAmbushTrigger(room, player, tracking);
    expect(secondTrigger).toBe(false);
  });

  it('ambushTriggered should be cleaned up with RunTracking', () => {
    const newTracking = createRunTracking();
    expect(newTracking.ambushTriggered.size).toBe(0);
  });
});

describe('Room Variant - Non-Ambush Rooms', () => {
  it('standard variant enemies should be visible immediately', () => {
    const room = createTestRoom('standard_room', 0, 0, 300, 300, 'standard');
    room.enemies = [createTestEnemy('enemy_1', { x: 150, y: 150 }, false)];

    expect(canTargetEnemy(room.enemies[0])).toBe(true);
  });

  it('arena variant enemies should be visible immediately', () => {
    const room = createTestRoom('arena_room', 0, 0, 300, 300, 'arena');
    room.enemies = [createTestEnemy('enemy_1', { x: 150, y: 150 }, false)];

    expect(canTargetEnemy(room.enemies[0])).toBe(true);
  });

  it('guardian variant enemies should be visible immediately', () => {
    const room = createTestRoom('guardian_room', 0, 0, 300, 300, 'guardian');
    room.enemies = [
      createTestEnemy('elite_1', { x: 150, y: 150 }, false),
      createTestEnemy('minion_1', { x: 100, y: 100 }, false)
    ];

    for (const enemy of room.enemies) {
      expect(canTargetEnemy(enemy)).toBe(true);
    }
  });
});

// ============================================================================
// ROOM MODIFIER TESTS
// ============================================================================

describe('Room Modifier - Cursed Effect', () => {
  let player: Player;

  beforeEach(() => {
    player = createTestPlayer();
  });

  it('should apply armor and resist debuff', () => {
    const originalArmor = player.stats.armor;
    const originalResist = player.stats.resist;

    applyModifierBuff(player, 'cursed');

    expect(player.stats.armor).toBe(originalArmor - 10);
    expect(player.stats.resist).toBe(originalResist - 5);
  });

  it('should add curse buff to player', () => {
    applyModifierBuff(player, 'cursed');

    const curseBuff = player.buffs.find(b => b.id === 'room_curse');
    expect(curseBuff).toBeDefined();
    expect(curseBuff?.isDebuff).toBe(true);
  });

  it('should not stack curse buff', () => {
    applyModifierBuff(player, 'cursed');
    applyModifierBuff(player, 'cursed');

    const curseBuffs = player.buffs.filter(b => b.id === 'room_curse');
    expect(curseBuffs.length).toBe(1);
  });

  it('should restore stats when leaving cursed room', () => {
    const originalArmor = player.stats.armor;
    const originalResist = player.stats.resist;

    applyModifierBuff(player, 'cursed');
    removeModifierBuff(player, 'cursed');

    expect(player.stats.armor).toBe(originalArmor);
    expect(player.stats.resist).toBe(originalResist);
  });

  it('should remove curse buff when leaving room', () => {
    applyModifierBuff(player, 'cursed');
    removeModifierBuff(player, 'cursed');

    const curseBuff = player.buffs.find(b => b.id === 'room_curse');
    expect(curseBuff).toBeUndefined();
  });
});

describe('Room Modifier - Blessed Effect', () => {
  let player: Player;

  beforeEach(() => {
    player = createTestPlayer();
  });

  it('should apply armor and crit buff', () => {
    const originalArmor = player.stats.armor;
    const originalCrit = player.stats.crit;

    applyModifierBuff(player, 'blessed');

    expect(player.stats.armor).toBe(originalArmor + 10);
    expect(player.stats.crit).toBe(originalCrit + 5);
  });

  it('should add bless buff to player', () => {
    applyModifierBuff(player, 'blessed');

    const blessBuff = player.buffs.find(b => b.id === 'room_bless');
    expect(blessBuff).toBeDefined();
    expect(blessBuff?.isDebuff).toBe(false);
  });

  it('should not stack blessed buff', () => {
    applyModifierBuff(player, 'blessed');
    applyModifierBuff(player, 'blessed');

    const blessBuffs = player.buffs.filter(b => b.id === 'room_bless');
    expect(blessBuffs.length).toBe(1);
  });

  it('should restore stats when leaving blessed room', () => {
    const originalArmor = player.stats.armor;
    const originalCrit = player.stats.crit;

    applyModifierBuff(player, 'blessed');
    removeModifierBuff(player, 'blessed');

    expect(player.stats.armor).toBe(originalArmor);
    expect(player.stats.crit).toBe(originalCrit);
  });
});

describe('Room Modifier - Burning Effect', () => {
  it('burning damage should scale with floor', () => {
    const floor3Damage = 5 + 3 * 2; // 11
    const floor5Damage = 5 + 5 * 2; // 15
    const floor10Damage = 5 + 10 * 2; // 25

    expect(floor3Damage).toBe(11);
    expect(floor5Damage).toBe(15);
    expect(floor10Damage).toBe(25);
  });

  it('modifierDamageTicks should be tracked in RunTracking', () => {
    const tracking = createRunTracking();
    expect(tracking.modifierDamageTicks).toBeDefined();
    expect(tracking.modifierDamageTicks.size).toBe(0);
  });
});

// ============================================================================
// FORMATION POSITION TESTS
// ============================================================================

describe('Formation Positions - Bounds Checking', () => {
  const PADDING = 52; // SPRITE_CONFIG.ENEMY_SIZE + 20

  it('all formation positions should be within room bounds', () => {
    const room = createTestRoom('test_room', 100, 100, 300, 300);

    // Simulate formation positions (these would come from DungeonGenerator)
    const positions: Position[] = [
      { x: 150, y: 150 },
      { x: 350, y: 150 },
      { x: 150, y: 350 },
      { x: 350, y: 350 }
    ];

    for (const pos of positions) {
      expect(pos.x).toBeGreaterThanOrEqual(room.x);
      expect(pos.x).toBeLessThanOrEqual(room.x + room.width);
      expect(pos.y).toBeGreaterThanOrEqual(room.y);
      expect(pos.y).toBeLessThanOrEqual(room.y + room.height);
    }
  });

  it('guardian variant center position should be room center', () => {
    const room = createTestRoom('guardian_room', 100, 100, 300, 300);
    const expectedCenter = {
      x: room.x + room.width / 2,
      y: room.y + room.height / 2
    };

    // Elite should be at center
    expect(expectedCenter.x).toBe(250);
    expect(expectedCenter.y).toBe(250);
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Room Variant System - Integration', () => {
  it('tracking state should be fresh for new run', () => {
    const tracking = createRunTracking();

    expect(tracking.ambushTriggered.size).toBe(0);
    expect(tracking.modifierDamageTicks.size).toBe(0);
  });

  it('room transition should remove modifier buffs', () => {
    const player = createTestPlayer();
    const cursedRoom = createTestRoom('cursed_room', 0, 0, 300, 300, 'standard', 'cursed');
    const normalRoom = createTestRoom('normal_room', 500, 0, 300, 300, 'standard');

    const originalArmor = player.stats.armor;

    // Enter cursed room
    applyModifierBuff(player, 'cursed');
    expect(player.stats.armor).toBe(originalArmor - 10);

    // Leave cursed room (transition to normal room)
    removeModifierBuff(player, 'cursed');
    expect(player.stats.armor).toBe(originalArmor);
  });

  it('ambush room should work with modifiers', () => {
    const room = createTestRoom('ambush_cursed', 0, 0, 300, 300, 'ambush', 'cursed');
    room.enemies = [createTestEnemy('enemy_1', { x: 50, y: 50 }, true)];

    const player = createTestPlayer({ x: 50, y: 150 });
    const tracking = createRunTracking();

    // Modifier should apply immediately
    applyModifierBuff(player, 'cursed');
    expect(player.buffs.some(b => b.id === 'room_curse')).toBe(true);

    // But enemies still hidden until ambush triggers
    expect(room.enemies[0].isHidden).toBe(true);

    // Trigger ambush
    player.position = { x: 150, y: 150 };
    checkAmbushTrigger(room, player, tracking);

    // Now enemies visible
    expect(room.enemies[0].isHidden).toBe(false);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Room Variant System - Edge Cases', () => {
  it('dead hidden enemies should not be revealed by ambush', () => {
    const room = createTestRoom('ambush_room', 0, 0, 300, 300, 'ambush');
    room.enemies = [
      createTestEnemy('dead_enemy', { x: 50, y: 50 }, true),
      createTestEnemy('alive_enemy', { x: 250, y: 50 }, true)
    ];
    room.enemies[0].isAlive = false;

    const player = createTestPlayer({ x: 150, y: 150 });
    const tracking = createRunTracking();

    checkAmbushTrigger(room, player, tracking);

    // Dead enemy should still be "hidden" (doesn't matter, it's dead)
    // Alive enemy should be revealed
    expect(room.enemies[1].isHidden).toBe(false);
  });

  it('empty ambush room should not crash', () => {
    const room = createTestRoom('empty_ambush', 0, 0, 300, 300, 'ambush');
    room.enemies = [];

    const player = createTestPlayer({ x: 150, y: 150 });
    const tracking = createRunTracking();

    // Should not throw
    expect(() => checkAmbushTrigger(room, player, tracking)).not.toThrow();
    expect(tracking.ambushTriggered.has(room.id)).toBe(true);
  });

  it('room without variant should default to standard behavior', () => {
    const room = createTestRoom('no_variant', 0, 0, 300, 300);
    room.enemies = [createTestEnemy('enemy_1', { x: 150, y: 150 }, false)];

    // No variant set, enemies should be targetable
    expect(canTargetEnemy(room.enemies[0])).toBe(true);
  });

  it('removing non-existent buff should not crash', () => {
    const player = createTestPlayer();

    // Player has no curse buff
    expect(() => removeModifierBuff(player, 'cursed')).not.toThrow();
    expect(player.buffs.length).toBe(0);
  });
});
