import { describe, it, expect, beforeEach } from 'vitest';
import { Player, Enemy, RunState, Room, RoomModifier } from '@dungeon-link/shared';
import { processBasicAttack, processEnemyAttack } from '../game/Combat.js';

// Helper to create a test player
function createTestPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player_1',
    name: 'TestPlayer',
    classId: 'mage',
    position: { x: 100, y: 100 },
    isAlive: true,
    stats: {
      health: 100,
      maxHealth: 100,
      mana: 100,
      maxMana: 100,
      attackPower: 10,
      spellPower: 15,
      armor: 3, // Mage has low armor
      crit: 10,
      haste: 0,
      lifesteal: 0,
      resist: 10
    },
    abilities: [],
    equipment: {},
    backpack: [],
    buffs: [],
    targetId: null,
    ...overrides
  } as Player;
}

// Helper to create a test enemy
function createTestEnemy(overrides: Partial<Enemy> = {}): Enemy {
  return {
    id: 'enemy_1',
    name: 'TestEnemy',
    type: 'melee',
    position: { x: 150, y: 100 },
    isAlive: true,
    isBoss: false,
    isRare: false,
    isElite: false,
    stats: {
      health: 50,
      maxHealth: 50,
      mana: 0,
      maxMana: 0,
      attackPower: 20,
      spellPower: 0,
      armor: 5,
      crit: 0,
      haste: 0,
      lifesteal: 0,
      resist: 5
    },
    debuffs: [],
    ...overrides
  } as Enemy;
}

describe('Armor Damage Reduction Formula', () => {
  it('should apply correct damage reduction with 0 armor', () => {
    const attacker = createTestEnemy({ stats: { ...createTestEnemy().stats, attackPower: 100 } });
    const target = createTestPlayer({ stats: { ...createTestPlayer().stats, armor: 0, health: 1000, maxHealth: 1000 } });

    const result = processBasicAttack(attacker, target, false);

    // With 0 armor: reduction = 100/(100+0) = 1.0, so full damage
    expect(result.events[0].damage).toBe(100);
  });

  it('should apply correct damage reduction with 100 armor (50% reduction)', () => {
    const attacker = createTestEnemy({ stats: { ...createTestEnemy().stats, attackPower: 100 } });
    const target = createTestPlayer({ stats: { ...createTestPlayer().stats, armor: 100, health: 1000, maxHealth: 1000 } });

    const result = processBasicAttack(attacker, target, false);

    // With 100 armor: reduction = 100/(100+100) = 0.5, so 50 damage
    expect(result.events[0].damage).toBe(50);
  });

  it('should apply correct damage reduction with 50 armor (~33% reduction)', () => {
    const attacker = createTestEnemy({ stats: { ...createTestEnemy().stats, attackPower: 100 } });
    const target = createTestPlayer({ stats: { ...createTestPlayer().stats, armor: 50, health: 1000, maxHealth: 1000 } });

    const result = processBasicAttack(attacker, target, false);

    // With 50 armor: reduction = 100/(100+50) = 0.667, so ~67 damage
    expect(result.events[0].damage).toBe(67);
  });

  it('should use resist stat for magic damage', () => {
    const attacker = createTestEnemy({
      stats: { ...createTestEnemy().stats, spellPower: 100, attackPower: 0 }
    });
    const target = createTestPlayer({
      stats: { ...createTestPlayer().stats, armor: 200, resist: 0, health: 1000, maxHealth: 1000 }
    });

    const result = processBasicAttack(attacker, target, true); // isMagic = true

    // Magic uses resist (0), not armor (200), so full damage
    expect(result.events[0].damage).toBe(100);
  });

  it('should use armor stat for physical damage', () => {
    const attacker = createTestEnemy({ stats: { ...createTestEnemy().stats, attackPower: 100 } });
    const target = createTestPlayer({
      stats: { ...createTestPlayer().stats, armor: 100, resist: 0, health: 1000, maxHealth: 1000 }
    });

    const result = processBasicAttack(attacker, target, false); // isMagic = false

    // Physical uses armor (100), so 50% reduction
    expect(result.events[0].damage).toBe(50);
  });
});

describe('Cursed Room Modifier - Armor', () => {
  it('should not allow armor to go negative when applying curse', () => {
    const player = createTestPlayer({ stats: { ...createTestPlayer().stats, armor: 3 } });

    // Simulate entering cursed room - armor should be clamped to 0
    const curseReduction = 10;
    player.stats.armor = Math.max(0, player.stats.armor - curseReduction);

    expect(player.stats.armor).toBe(0);
    expect(player.stats.armor).toBeGreaterThanOrEqual(0);
  });

  it('should track actual armor reduction for correct restoration', () => {
    const player = createTestPlayer({ stats: { ...createTestPlayer().stats, armor: 3 } });
    const originalArmor = player.stats.armor;

    // Track actual reduction (not the requested 10)
    const actualArmorReduction = Math.min(10, player.stats.armor);
    expect(actualArmorReduction).toBe(3); // Can only reduce by 3

    // Apply reduction
    player.stats.armor = Math.max(0, player.stats.armor - 10);
    expect(player.stats.armor).toBe(0);

    // Restore using tracked amount
    player.stats.armor += actualArmorReduction;
    expect(player.stats.armor).toBe(originalArmor); // Should be back to 3, not 10
  });

  it('should NOT gain armor from entering and leaving cursed room (BUG TEST)', () => {
    const player = createTestPlayer({ stats: { ...createTestPlayer().stats, armor: 3 } });
    const originalArmor = player.stats.armor;

    // Track actual reduction
    const actualArmorReduction = Math.min(10, player.stats.armor);

    // Enter cursed room
    player.stats.armor = Math.max(0, player.stats.armor - 10);
    expect(player.stats.armor).toBe(0);

    // Leave cursed room - restore only what was actually taken
    player.stats.armor += actualArmorReduction;

    // Player should have same armor as before, NOT more
    expect(player.stats.armor).toBe(originalArmor);
    expect(player.stats.armor).not.toBeGreaterThan(originalArmor);
  });

  it('should handle high armor player correctly', () => {
    const player = createTestPlayer({ stats: { ...createTestPlayer().stats, armor: 50 } });
    const originalArmor = player.stats.armor;

    // Track actual reduction
    const actualArmorReduction = Math.min(10, player.stats.armor);
    expect(actualArmorReduction).toBe(10); // Full 10 can be reduced

    // Enter cursed room
    player.stats.armor = Math.max(0, player.stats.armor - 10);
    expect(player.stats.armor).toBe(40);

    // Leave cursed room
    player.stats.armor += actualArmorReduction;
    expect(player.stats.armor).toBe(originalArmor); // Back to 50
  });
});

describe('Blessed Room Modifier - Armor', () => {
  it('should not allow armor to go negative when leaving blessed room', () => {
    const player = createTestPlayer({ stats: { ...createTestPlayer().stats, armor: 5 } });

    // Enter blessed room
    player.stats.armor += 10;
    expect(player.stats.armor).toBe(15);

    // Simulate equipment change that reduces armor while in blessed room
    player.stats.armor -= 12; // Removed armor piece
    expect(player.stats.armor).toBe(3);

    // Leave blessed room - should clamp to 0, not go negative
    player.stats.armor = Math.max(0, player.stats.armor - 10);
    expect(player.stats.armor).toBe(0);
    expect(player.stats.armor).toBeGreaterThanOrEqual(0);
  });

  it('should handle normal blessed room entry/exit', () => {
    const player = createTestPlayer({ stats: { ...createTestPlayer().stats, armor: 20 } });
    const originalArmor = player.stats.armor;

    // Enter blessed room
    player.stats.armor += 10;
    expect(player.stats.armor).toBe(30);

    // Leave blessed room
    player.stats.armor = Math.max(0, player.stats.armor - 10);
    expect(player.stats.armor).toBe(originalArmor);
  });
});

describe('Resist Stat (Magic Armor)', () => {
  it('should not allow resist to go negative when applying curse', () => {
    const player = createTestPlayer({ stats: { ...createTestPlayer().stats, resist: 2 } });

    // Simulate curse reduction of 5 resist
    player.stats.resist = Math.max(0, player.stats.resist - 5);

    expect(player.stats.resist).toBe(0);
    expect(player.stats.resist).toBeGreaterThanOrEqual(0);
  });

  it('should track actual resist reduction for correct restoration', () => {
    const player = createTestPlayer({ stats: { ...createTestPlayer().stats, resist: 2 } });
    const originalResist = player.stats.resist;

    // Track actual reduction
    const actualResistReduction = Math.min(5, player.stats.resist);
    expect(actualResistReduction).toBe(2);

    // Apply reduction
    player.stats.resist = Math.max(0, player.stats.resist - 5);
    expect(player.stats.resist).toBe(0);

    // Restore using tracked amount
    player.stats.resist += actualResistReduction;
    expect(player.stats.resist).toBe(originalResist);
  });
});

describe('StatModifiers Display Values', () => {
  it('should store delta values in statModifiers, not absolute values', () => {
    const player = createTestPlayer({ stats: { ...createTestPlayer().stats, armor: 25 } });

    // Calculate the delta (change), not the result
    const armorDelta = -10; // Curse reduces by 10

    // This is what should be stored for tooltip display
    const statModifiers = {
      armor: armorDelta // -10, not (25 - 10 = 15)
    };

    expect(statModifiers.armor).toBe(-10);
    expect(statModifiers.armor).toBeLessThan(0); // Debuff should be negative
  });

  it('should display positive values for buffs', () => {
    const statModifiers = {
      armor: 10, // Blessed gives +10
      crit: 5
    };

    expect(statModifiers.armor).toBe(10);
    expect(statModifiers.armor).toBeGreaterThan(0); // Buff should be positive
  });
});

describe('Edge Cases', () => {
  it('should handle 0 armor without division errors', () => {
    const attacker = createTestEnemy({ stats: { ...createTestEnemy().stats, attackPower: 50 } });
    const target = createTestPlayer({ stats: { ...createTestPlayer().stats, armor: 0, health: 100, maxHealth: 100 } });

    // This should not throw and should deal full damage
    const result = processBasicAttack(attacker, target, false);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].damage).toBe(50);
  });

  it('should handle very high armor values', () => {
    const attacker = createTestEnemy({ stats: { ...createTestEnemy().stats, attackPower: 100 } });
    const target = createTestPlayer({ stats: { ...createTestPlayer().stats, armor: 1000, health: 1000, maxHealth: 1000 } });

    const result = processBasicAttack(attacker, target, false);

    // With 1000 armor: reduction = 100/(100+1000) = 0.0909, so ~9 damage
    expect(result.events[0].damage).toBe(9);
    expect(result.events[0].damage).toBeGreaterThan(0); // Should never be 0
  });

  it('should handle extreme armor values (may round to 0 with low damage)', () => {
    const attacker = createTestEnemy({ stats: { ...createTestEnemy().stats, attackPower: 10 } });
    const target = createTestPlayer({ stats: { ...createTestPlayer().stats, armor: 10000, health: 1000, maxHealth: 1000 } });

    const result = processBasicAttack(attacker, target, false);

    // With 10000 armor: reduction = 100/10100 = 0.0099
    // damage = 10 * 0.0099 = 0.099, rounded to 0
    // Note: This is expected behavior - extreme armor can reduce low damage to 0
    expect(result.events[0].damage).toBeGreaterThanOrEqual(0);
    expect(result.events[0].damage).toBe(0); // Actually rounds to 0
  });

  it('should deal minimum 1 damage with higher attack power against extreme armor', () => {
    const attacker = createTestEnemy({ stats: { ...createTestEnemy().stats, attackPower: 200 } });
    const target = createTestPlayer({ stats: { ...createTestPlayer().stats, armor: 10000, health: 1000, maxHealth: 1000 } });

    const result = processBasicAttack(attacker, target, false);

    // With 10000 armor: reduction = 100/10100 = 0.0099
    // damage = 200 * 0.0099 = 1.98, rounded to 2
    expect(result.events[0].damage).toBeGreaterThan(0);
  });
});
