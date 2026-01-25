import { describe, it, expect } from 'vitest';
import { generateBossLoot, applyLootDrop, getItemPower, recalculateStats } from '../game/Loot.js';
import { ClassName, Player, EquipSlot, Rarity, Item } from '@dungeon-link/shared';

// Helper to create a test player
function createTestPlayer(): Player {
  return {
    id: 'test-player',
    name: 'Test',
    classId: ClassName.Warrior,
    position: { x: 0, y: 0 },
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
      { abilityId: 'warrior_strike', rank: 1, currentCooldown: 0 },
      { abilityId: 'warrior_charge', rank: 1, currentCooldown: 0 }
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

describe('Boss Loot Generation', () => {
  it('should generate loot for each player', () => {
    const players = [createTestPlayer()];
    const loot = generateBossLoot('test-run', 1, 'boss_skeleton_king', players);

    expect(loot.size).toBe(1);
    expect(loot.has('test-player')).toBe(true);
  });

  it('should generate deterministic loot for same run/floor/boss', () => {
    const players = [createTestPlayer()];

    const loot1 = generateBossLoot('test-run', 1, 'boss_skeleton_king', players);
    const loot2 = generateBossLoot('test-run', 1, 'boss_skeleton_king', players);

    const drops1 = loot1.get('test-player')!;
    const drops2 = loot2.get('test-player')!;

    expect(drops1.length).toBe(drops2.length);
  });

  it('should always include gold drop', () => {
    const players = [createTestPlayer()];
    const loot = generateBossLoot('test-run', 1, 'boss_skeleton_king', players);

    const drops = loot.get('test-player')!;
    const hasGold = drops.some(d => d.type === 'gold');

    expect(hasGold).toBe(true);
  });
});

describe('Loot Application', () => {
  it('should add gold to player', () => {
    const player = createTestPlayer();
    applyLootDrop(player, { type: 'gold', goldAmount: 100 });

    expect(player.gold).toBe(100);
  });

  it('should add reroll tokens to player', () => {
    const player = createTestPlayer();
    applyLootDrop(player, { type: 'rerollToken', tokenCount: 2 });

    expect(player.rerollTokens).toBe(2);
  });

  it('should equip item to empty slot', () => {
    const player = createTestPlayer();
    const item: Item = {
      id: 'test-item',
      name: 'Test Sword',
      slot: EquipSlot.Weapon,
      rarity: Rarity.Uncommon,
      stats: { attackPower: 5 },
      floorDropped: 1
    };

    applyLootDrop(player, { type: 'item', item });

    expect(player.equipment[EquipSlot.Weapon]).toBe(item);
  });

  it('should learn new ability', () => {
    const player = createTestPlayer();
    const initialAbilities = player.abilities.length;

    applyLootDrop(player, { type: 'ability', abilityId: 'warrior_whirlwind' });

    expect(player.abilities.length).toBe(initialAbilities + 1);
    expect(player.abilities.some(a => a.abilityId === 'warrior_whirlwind')).toBe(true);
  });

  it('should upgrade existing ability rank', () => {
    const player = createTestPlayer();

    applyLootDrop(player, { type: 'ability', abilityId: 'warrior_strike' });

    const ability = player.abilities.find(a => a.abilityId === 'warrior_strike');
    expect(ability?.rank).toBe(2);
  });
});

describe('Item Power Calculation', () => {
  it('should calculate item power from stats', () => {
    const item: Item = {
      id: 'test',
      name: 'Test',
      slot: EquipSlot.Weapon,
      rarity: Rarity.Common,
      stats: { attackPower: 10, health: 20 },
      floorDropped: 1
    };

    const power = getItemPower(item);
    expect(power).toBeGreaterThan(0);
  });

  it('should value crit/haste/lifesteal higher', () => {
    const itemA: Item = {
      id: 'a',
      name: 'A',
      slot: EquipSlot.Ring,
      rarity: Rarity.Common,
      stats: { health: 10 },
      floorDropped: 1
    };

    const itemB: Item = {
      id: 'b',
      name: 'B',
      slot: EquipSlot.Ring,
      rarity: Rarity.Common,
      stats: { crit: 10 },
      floorDropped: 1
    };

    expect(getItemPower(itemB)).toBeGreaterThan(getItemPower(itemA));
  });
});

describe('Stat Recalculation', () => {
  it('should add equipment stats to base stats', () => {
    const player = createTestPlayer();
    const baseAttack = player.baseStats.attackPower;

    player.equipment[EquipSlot.Weapon] = {
      id: 'sword',
      name: 'Sword',
      slot: EquipSlot.Weapon,
      rarity: Rarity.Common,
      stats: { attackPower: 15 },
      floorDropped: 1
    };

    recalculateStats(player);

    expect(player.stats.attackPower).toBe(baseAttack + 15);
  });
});
