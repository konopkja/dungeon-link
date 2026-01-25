import { describe, it, expect, beforeEach } from 'vitest';
import { processEnemyAttack, processBasicAttack } from '../game/Combat.js';
import { ClassName, Player, Enemy, EnemyType, EquipSlot, Buff } from '@dungeon-link/shared';

// Helper to create a test player
function createTestPlayer(): Player {
  return {
    id: 'test-player',
    name: 'Test',
    classId: ClassName.Warrior,
    position: { x: 100, y: 100 },
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
    abilities: [
      { abilityId: 'warrior_strike', rank: 1, currentCooldown: 0 }
    ],
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

// Helper to create a test buff
function createBlessingBuff(): Buff {
  return {
    id: 'buff-blessing',
    name: 'Blessing of Protection',
    icon: 'paladin_blessing',
    duration: 10,
    maxDuration: 10,
    isDebuff: false,
    rank: 1
  };
}

// Helper to create a test enemy
function createTestEnemy(type: EnemyType = EnemyType.Melee, isBoss: boolean = false): Enemy {
  return {
    id: 'test-enemy',
    name: isBoss ? 'Test Boss' : 'Test Enemy',
    type,
    position: { x: 120, y: 100 },
    stats: {
      health: 50, maxHealth: 50, mana: 20, maxMana: 20,
      attackPower: 15, spellPower: 10, armor: 5, crit: 0, haste: 0, lifesteal: 0, resist: 5
    },
    isAlive: true,
    targetId: null,
    isBoss,
    isRare: false,
    debuffs: []
  };
}

describe('Enemy Attack System', () => {
  let player: Player;
  let enemy: Enemy;

  beforeEach(() => {
    player = createTestPlayer();
    enemy = createTestEnemy();
  });

  describe('processEnemyAttack', () => {
    it('should deal damage to player when enemy attacks', () => {
      const initialHealth = player.stats.health;
      const result = processEnemyAttack(enemy, player);

      expect(result.events.length).toBeGreaterThan(0);
      expect(result.events[0].damage).toBeGreaterThan(0);
      expect(player.stats.health).toBeLessThan(initialHealth);
    });

    it('should not attack if enemy is dead', () => {
      enemy.isAlive = false;
      const result = processEnemyAttack(enemy, player);

      expect(result.events.length).toBe(0);
    });

    it('should not attack if player is dead', () => {
      player.isAlive = false;
      const result = processEnemyAttack(enemy, player);

      expect(result.events.length).toBe(0);
    });

    it('melee enemy should deal physical damage', () => {
      const result = processEnemyAttack(enemy, player);

      expect(result.events.length).toBe(1);
      expect(result.events[0].sourceId).toBe(enemy.id);
      expect(result.events[0].targetId).toBe(player.id);
      expect(result.events[0].damage).toBeGreaterThan(0);
    });

    it('caster enemy should deal magic damage', () => {
      enemy.type = EnemyType.Caster;
      const result = processEnemyAttack(enemy, player);

      expect(result.events.length).toBe(1);
      expect(result.events[0].damage).toBeGreaterThan(0);
    });

    it('ranged enemy should deal physical damage', () => {
      enemy.type = EnemyType.Ranged;
      const result = processEnemyAttack(enemy, player);

      expect(result.events.length).toBe(1);
      expect(result.events[0].damage).toBeGreaterThan(0);
    });

    it('should kill player if damage exceeds health', () => {
      player.stats.health = 1;
      const result = processEnemyAttack(enemy, player);

      expect(result.targetDied).toBe(true);
      expect(player.isAlive).toBe(false);
      expect(player.stats.health).toBe(0);
    });

    it('should respect Blessing of Protection for physical attacks', () => {
      player.buffs = [createBlessingBuff()];
      const initialHealth = player.stats.health;

      // Melee (physical) attack should be blocked
      const result = processEnemyAttack(enemy, player);

      expect(result.events.length).toBe(0);
      expect(player.stats.health).toBe(initialHealth);
    });

    it('should NOT block caster attacks with Blessing of Protection', () => {
      player.buffs = [createBlessingBuff()];
      enemy.type = EnemyType.Caster;
      const initialHealth = player.stats.health;

      // Caster (magic) attack should NOT be blocked
      const result = processEnemyAttack(enemy, player);

      expect(result.events.length).toBe(1);
      expect(player.stats.health).toBeLessThan(initialHealth);
    });

    it('boss enemy should attack and deal damage', () => {
      const bossEnemy = createTestEnemy(EnemyType.Melee, true);
      const initialHealth = player.stats.health;

      const result = processEnemyAttack(bossEnemy, player);

      expect(result.events.length).toBe(1);
      expect(result.events[0].damage).toBeGreaterThan(0);
      expect(player.stats.health).toBeLessThan(initialHealth);
    });
  });

  describe('Damage Calculation', () => {
    it('armor should reduce physical damage', () => {
      const lowArmorPlayer = createTestPlayer();
      lowArmorPlayer.stats.armor = 0;

      const highArmorPlayer = createTestPlayer();
      highArmorPlayer.stats.armor = 50;

      const result1 = processEnemyAttack(createTestEnemy(), lowArmorPlayer);
      const result2 = processEnemyAttack(createTestEnemy(), highArmorPlayer);

      expect(result1.events[0].damage).toBeGreaterThan(result2.events[0].damage ?? 0);
    });

    it('resist should reduce magic damage', () => {
      const lowResistPlayer = createTestPlayer();
      lowResistPlayer.stats.resist = 0;

      const highResistPlayer = createTestPlayer();
      highResistPlayer.stats.resist = 50;

      const casterEnemy1 = createTestEnemy(EnemyType.Caster);
      const casterEnemy2 = createTestEnemy(EnemyType.Caster);

      processEnemyAttack(casterEnemy1, lowResistPlayer);
      processEnemyAttack(casterEnemy2, highResistPlayer);

      // Low resist player should take more damage
      expect(lowResistPlayer.stats.health).toBeLessThan(highResistPlayer.stats.health);
    });

    it('enemy attackPower affects physical damage', () => {
      const weakEnemy = createTestEnemy();
      weakEnemy.stats.attackPower = 5;

      const strongEnemy = createTestEnemy();
      strongEnemy.stats.attackPower = 30;

      const player1 = createTestPlayer();
      const player2 = createTestPlayer();

      processEnemyAttack(weakEnemy, player1);
      processEnemyAttack(strongEnemy, player2);

      expect(player2.stats.health).toBeLessThan(player1.stats.health);
    });

    it('enemy spellPower affects magic damage', () => {
      const weakCaster = createTestEnemy(EnemyType.Caster);
      weakCaster.stats.spellPower = 5;

      const strongCaster = createTestEnemy(EnemyType.Caster);
      strongCaster.stats.spellPower = 30;

      const player1 = createTestPlayer();
      const player2 = createTestPlayer();

      processEnemyAttack(weakCaster, player1);
      processEnemyAttack(strongCaster, player2);

      expect(player2.stats.health).toBeLessThan(player1.stats.health);
    });
  });
});

describe('Enemy Types Attack Correctly', () => {
  it('all enemy types can deal damage', () => {
    const types: EnemyType[] = [EnemyType.Melee, EnemyType.Ranged, EnemyType.Caster];

    for (const type of types) {
      const player = createTestPlayer();
      const enemy = createTestEnemy(type);

      const result = processEnemyAttack(enemy, player);

      expect(result.events.length).toBe(1);
      expect(result.events[0].damage).toBeGreaterThan(0);
      expect(player.stats.health).toBeLessThan(100);
    }
  });
});

describe('Enemy Attack Integration', () => {
  it('regular melee enemy should attack after aggro delay', () => {
    // This test verifies that the attack conditions work correctly
    const enemy = createTestEnemy(EnemyType.Melee, false);
    const player = createTestPlayer();

    // Enemy is NOT a boss
    expect(enemy.isBoss).toBe(false);

    // Both are alive
    expect(enemy.isAlive).toBe(true);
    expect(player.isAlive).toBe(true);

    // Test the attack function directly
    const result = processEnemyAttack(enemy, player);

    // Regular enemies SHOULD be able to attack
    expect(result.events.length).toBe(1);
    expect(result.events[0].damage).toBeGreaterThan(0);
  });

  it('regular ranged enemy should attack after aggro delay', () => {
    const enemy = createTestEnemy(EnemyType.Ranged, false);
    const player = createTestPlayer();

    expect(enemy.isBoss).toBe(false);

    const result = processEnemyAttack(enemy, player);

    expect(result.events.length).toBe(1);
    expect(result.events[0].damage).toBeGreaterThan(0);
  });

  it('regular caster enemy should attack after aggro delay', () => {
    const enemy = createTestEnemy(EnemyType.Caster, false);
    const player = createTestPlayer();

    expect(enemy.isBoss).toBe(false);

    const result = processEnemyAttack(enemy, player);

    expect(result.events.length).toBe(1);
    expect(result.events[0].damage).toBeGreaterThan(0);
  });
});

describe('Rogue-specific Enemy Attack Tests', () => {
  // Helper to create a Rogue test player
  function createRoguePlayer(): Player {
    return {
      id: 'test-rogue',
      name: 'Test Rogue',
      classId: ClassName.Rogue,
      position: { x: 100, y: 100 },
      stats: {
        health: 85, maxHealth: 85, mana: 60, maxMana: 60,
        attackPower: 16, spellPower: 0, armor: 8, crit: 15, haste: 0, lifesteal: 0, resist: 5
      },
      baseStats: {
        health: 85, maxHealth: 85, mana: 60, maxMana: 60,
        attackPower: 16, spellPower: 0, armor: 8, crit: 15, haste: 0, lifesteal: 0, resist: 5
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
      abilities: [
        { abilityId: 'rogue_stab', rank: 1, currentCooldown: 0 },
        { abilityId: 'rogue_stealth', rank: 1, currentCooldown: 0 }
      ],
      gold: 0,
      rerollTokens: 0,
      isAlive: true,
      targetId: null,
      backpack: [],
      buffs: [],  // Fresh Rogue - no buffs!
      level: 1,
      xp: 0,
      xpToNextLevel: 100
    };
  }

  it('fresh Rogue (no buffs) should be attacked by melee enemy', () => {
    const rogue = createRoguePlayer();
    const enemy = createTestEnemy(EnemyType.Melee, false);

    // Verify Rogue has no buffs
    expect(rogue.buffs.length).toBe(0);
    expect(rogue.buffs.some(b => b.icon === 'rogue_stealth')).toBe(false);
    expect(rogue.buffs.some(b => b.icon === 'rogue_vanish')).toBe(false);

    const initialHealth = rogue.stats.health;
    const result = processEnemyAttack(enemy, rogue);

    // Enemy SHOULD attack the Rogue
    expect(result.events.length).toBe(1);
    expect(result.events[0].damage).toBeGreaterThan(0);
    expect(rogue.stats.health).toBeLessThan(initialHealth);
  });

  it('fresh Rogue (no buffs) should be attacked by ranged enemy', () => {
    const rogue = createRoguePlayer();
    const enemy = createTestEnemy(EnemyType.Ranged, false);

    expect(rogue.buffs.length).toBe(0);

    const initialHealth = rogue.stats.health;
    const result = processEnemyAttack(enemy, rogue);

    expect(result.events.length).toBe(1);
    expect(result.events[0].damage).toBeGreaterThan(0);
    expect(rogue.stats.health).toBeLessThan(initialHealth);
  });

  it('fresh Rogue (no buffs) should be attacked by caster enemy', () => {
    const rogue = createRoguePlayer();
    const enemy = createTestEnemy(EnemyType.Caster, false);

    expect(rogue.buffs.length).toBe(0);

    const initialHealth = rogue.stats.health;
    const result = processEnemyAttack(enemy, rogue);

    expect(result.events.length).toBe(1);
    expect(result.events[0].damage).toBeGreaterThan(0);
    expect(rogue.stats.health).toBeLessThan(initialHealth);
  });

  it('Rogue WITH stealth buff should NOT be attacked', () => {
    const rogue = createRoguePlayer();
    const enemy = createTestEnemy(EnemyType.Melee, false);

    // Add stealth buff
    rogue.buffs = [{
      id: 'stealth_test',
      name: 'Stealth',
      icon: 'rogue_stealth',
      duration: 10,
      maxDuration: 10,
      isDebuff: false
    }];

    expect(rogue.buffs.some(b => b.icon === 'rogue_stealth')).toBe(true);

    const initialHealth = rogue.stats.health;
    const result = processEnemyAttack(enemy, rogue);

    // Enemy should NOT attack stealthed Rogue
    expect(result.events.length).toBe(0);
    expect(rogue.stats.health).toBe(initialHealth);
  });

  it('Rogue WITH vanish buff should NOT be attacked', () => {
    const rogue = createRoguePlayer();
    const enemy = createTestEnemy(EnemyType.Melee, false);

    // Add vanish buff
    rogue.buffs = [{
      id: 'vanish_test',
      name: 'Vanish',
      icon: 'rogue_vanish',
      duration: 4,
      maxDuration: 4,
      isDebuff: false
    }];

    expect(rogue.buffs.some(b => b.icon === 'rogue_vanish')).toBe(true);

    const initialHealth = rogue.stats.health;
    const result = processEnemyAttack(enemy, rogue);

    // Enemy should NOT attack vanished Rogue
    expect(result.events.length).toBe(0);
    expect(rogue.stats.health).toBe(initialHealth);
  });
});

describe('Shield Wall Damage Reduction Tests', () => {
  /**
   * Shield Wall (warrior_shield) should reduce ALL incoming damage by 50%.
   * This includes both physical (melee/ranged) and magical (caster) damage.
   * Duration: 6 seconds, Cooldown: 30 seconds
   */

  // Helper to create Shield Wall buff
  function createShieldWallBuff(): Buff {
    return {
      id: 'buff-shield-wall',
      name: 'Shield Wall',
      icon: 'warrior_shield',
      duration: 6,
      maxDuration: 6,
      isDebuff: false,
      rank: 1
    };
  }

  it('Shield Wall should reduce melee (physical) damage by 50%', () => {
    const playerWithoutBuff = createTestPlayer();
    const playerWithBuff = createTestPlayer();
    playerWithBuff.buffs = [createShieldWallBuff()];

    const enemy1 = createTestEnemy(EnemyType.Melee);
    const enemy2 = createTestEnemy(EnemyType.Melee);

    // Attack player without Shield Wall
    const result1 = processEnemyAttack(enemy1, playerWithoutBuff);
    const damageWithoutBuff = result1.events[0].damage ?? 0;

    // Attack player with Shield Wall
    const result2 = processEnemyAttack(enemy2, playerWithBuff);
    const damageWithBuff = result2.events[0].damage ?? 0;

    // Damage with Shield Wall should be ~50% of damage without
    expect(damageWithBuff).toBeLessThan(damageWithoutBuff);
    expect(damageWithBuff).toBeCloseTo(damageWithoutBuff * 0.5, 0);
  });

  it('Shield Wall should reduce ranged (physical) damage by 50%', () => {
    const playerWithoutBuff = createTestPlayer();
    const playerWithBuff = createTestPlayer();
    playerWithBuff.buffs = [createShieldWallBuff()];

    const enemy1 = createTestEnemy(EnemyType.Ranged);
    const enemy2 = createTestEnemy(EnemyType.Ranged);

    const result1 = processEnemyAttack(enemy1, playerWithoutBuff);
    const damageWithoutBuff = result1.events[0].damage ?? 0;

    const result2 = processEnemyAttack(enemy2, playerWithBuff);
    const damageWithBuff = result2.events[0].damage ?? 0;

    expect(damageWithBuff).toBeLessThan(damageWithoutBuff);
    expect(damageWithBuff).toBeCloseTo(damageWithoutBuff * 0.5, 0);
  });

  it('Shield Wall should reduce caster (spell) damage by 50%', () => {
    const playerWithoutBuff = createTestPlayer();
    const playerWithBuff = createTestPlayer();
    playerWithBuff.buffs = [createShieldWallBuff()];

    const enemy1 = createTestEnemy(EnemyType.Caster);
    const enemy2 = createTestEnemy(EnemyType.Caster);

    const result1 = processEnemyAttack(enemy1, playerWithoutBuff);
    const damageWithoutBuff = result1.events[0].damage ?? 0;

    const result2 = processEnemyAttack(enemy2, playerWithBuff);
    const damageWithBuff = result2.events[0].damage ?? 0;

    // Spell damage should ALSO be reduced by Shield Wall
    expect(damageWithBuff).toBeLessThan(damageWithoutBuff);
    expect(damageWithBuff).toBeCloseTo(damageWithoutBuff * 0.5, 0);
  });

  it('Shield Wall should track blocked damage amount', () => {
    const player = createTestPlayer();
    player.buffs = [createShieldWallBuff()];

    const enemy = createTestEnemy(EnemyType.Melee);
    const result = processEnemyAttack(enemy, player);

    // Event should include blocked amount
    expect(result.events[0].blocked).toBeDefined();
    expect(result.events[0].blocked).toBeGreaterThan(0);

    // blocked + damage should equal original damage
    const totalDamage = (result.events[0].damage ?? 0) + (result.events[0].blocked ?? 0);
    expect(result.events[0].blocked).toBeCloseTo(result.events[0].damage ?? 0, 0);
  });

  it('Shield Wall should correctly restore health after damage reduction', () => {
    const player = createTestPlayer();
    player.buffs = [createShieldWallBuff()];
    const initialHealth = player.stats.health;

    const enemy = createTestEnemy(EnemyType.Melee);
    const result = processEnemyAttack(enemy, player);

    // Actual health loss should match the reduced damage
    const actualHealthLoss = initialHealth - player.stats.health;
    expect(actualHealthLoss).toBe(result.events[0].damage);
  });

  it('Shield Wall should not prevent death if damage is still lethal', () => {
    const player = createTestPlayer();
    player.stats.health = 1; // Very low health
    player.buffs = [createShieldWallBuff()];

    // Create a strong enemy
    const enemy = createTestEnemy(EnemyType.Melee);
    enemy.stats.attackPower = 50;

    const result = processEnemyAttack(enemy, player);

    // Even with 50% reduction, player should still die
    expect(result.targetDied).toBe(true);
    expect(player.isAlive).toBe(false);
  });

  it('Shield Wall should work against boss attacks', () => {
    const playerWithoutBuff = createTestPlayer();
    const playerWithBuff = createTestPlayer();
    playerWithBuff.buffs = [createShieldWallBuff()];

    const boss1 = createTestEnemy(EnemyType.Melee, true);
    const boss2 = createTestEnemy(EnemyType.Melee, true);

    const result1 = processEnemyAttack(boss1, playerWithoutBuff);
    const damageWithoutBuff = result1.events[0].damage ?? 0;

    const result2 = processEnemyAttack(boss2, playerWithBuff);
    const damageWithBuff = result2.events[0].damage ?? 0;

    expect(damageWithBuff).toBeLessThan(damageWithoutBuff);
    expect(damageWithBuff).toBeCloseTo(damageWithoutBuff * 0.5, 0);
  });

  it('Shield Wall and Blessing of Protection should stack (physical blocked entirely)', () => {
    const player = createTestPlayer();
    player.buffs = [
      createShieldWallBuff(),
      createBlessingBuff()
    ];

    const enemy = createTestEnemy(EnemyType.Melee);
    const initialHealth = player.stats.health;

    const result = processEnemyAttack(enemy, player);

    // Blessing blocks physical damage entirely, so no attack happens
    expect(result.events.length).toBe(0);
    expect(player.stats.health).toBe(initialHealth);
  });

  it('Shield Wall should still reduce spell damage when Blessing is active', () => {
    const playerWithoutShieldWall = createTestPlayer();
    playerWithoutShieldWall.buffs = [createBlessingBuff()];

    const playerWithShieldWall = createTestPlayer();
    playerWithShieldWall.buffs = [createBlessingBuff(), createShieldWallBuff()];

    const caster1 = createTestEnemy(EnemyType.Caster);
    const caster2 = createTestEnemy(EnemyType.Caster);

    const result1 = processEnemyAttack(caster1, playerWithoutShieldWall);
    const damageWithoutShieldWall = result1.events[0].damage ?? 0;

    const result2 = processEnemyAttack(caster2, playerWithShieldWall);
    const damageWithShieldWall = result2.events[0].damage ?? 0;

    // Blessing doesn't block spell damage, but Shield Wall reduces it by 50%
    expect(damageWithShieldWall).toBeLessThan(damageWithoutShieldWall);
    expect(damageWithShieldWall).toBeCloseTo(damageWithoutShieldWall * 0.5, 0);
  });
});

describe('Multiple Enemy Attack Tests', () => {
  /**
   * Test that ALL enemies in a room can attack the player when conditions are met.
   * This tests the processEnemyAttack function for multiple enemies.
   *
   * Bug scenario: Player enters room, only some enemies attack, others stand idle.
   * Root cause candidates:
   * 1. Aggro time not being set for all enemies
   * 2. Attack cooldown issues
   * 3. Target finding issues
   */

  it('ALL enemies should be able to attack player (no stealth, no buffs)', () => {
    const player = createTestPlayer();
    const enemies: Enemy[] = [];

    // Create 5 enemies of different types
    for (let i = 0; i < 5; i++) {
      const type = [EnemyType.Melee, EnemyType.Ranged, EnemyType.Caster][i % 3];
      enemies.push({
        id: `enemy-${i}`,
        name: `Enemy ${i}`,
        type,
        position: { x: 100 + i * 20, y: 100 },
        stats: {
          health: 50, maxHealth: 50, mana: 20, maxMana: 20,
          attackPower: 10, spellPower: 10, armor: 5, crit: 0, haste: 0, lifesteal: 0, resist: 5
        },
        isAlive: true,
        targetId: null,
        isBoss: false,
        isRare: false,
        debuffs: []
      });
    }

    // Player has no buffs (not stealthed)
    expect(player.buffs.length).toBe(0);

    // Each enemy should be able to attack
    let totalDamageEvents = 0;
    for (const enemy of enemies) {
      const result = processEnemyAttack(enemy, player);
      totalDamageEvents += result.events.length;

      // Each enemy MUST produce exactly 1 damage event
      expect(result.events.length).toBe(1);
      expect(result.events[0].damage).toBeGreaterThan(0);
    }

    // All 5 enemies should have attacked
    expect(totalDamageEvents).toBe(5);
  });

  it('enemies with unique IDs should not interfere with each other', () => {
    const player = createTestPlayer();

    // Create enemies with similar but unique IDs
    const enemy1 = createTestEnemy(EnemyType.Melee);
    enemy1.id = 'room1_enemy_1';

    const enemy2 = createTestEnemy(EnemyType.Melee);
    enemy2.id = 'room1_enemy_2';

    const enemy3 = createTestEnemy(EnemyType.Melee);
    enemy3.id = 'room1_enemy_3';

    // All should attack
    const result1 = processEnemyAttack(enemy1, player);
    const result2 = processEnemyAttack(enemy2, player);
    const result3 = processEnemyAttack(enemy3, player);

    expect(result1.events.length).toBe(1);
    expect(result2.events.length).toBe(1);
    expect(result3.events.length).toBe(1);
  });
});
