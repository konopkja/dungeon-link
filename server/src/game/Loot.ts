import { LootDrop, Player, Enemy, ClassName, EquipSlot, Rarity, Item, Potion, PotionType } from '@dungeon-link/shared';
import { GAME_CONFIG } from '@dungeon-link/shared';
import { SeededRNG, createLootRNG } from '../utils/SeededRNG.js';
import { getBossById } from '../data/bosses.js';
import { generateItem, pickRarityFromWeights } from '../data/items.js';
import { getLearnableAbilities, getClassById } from '../data/classes.js';
import { canUpgradeAbilityRank, getFallbackReward } from '../data/scaling.js';
import { shouldDropSetItem, generateSetItem, calculateSetBonuses } from '../data/sets.js';

/**
 * Generate loot drops for a defeated boss
 * @param killTimeBonus - Bonus multiplier for fast kills (0.0 to 0.5)
 */
export function generateBossLoot(
  runId: string,
  floor: number,
  bossId: string,
  players: Player[],
  killTimeBonus: number = 0
): Map<string, LootDrop[]> {
  const boss = getBossById(bossId);
  if (!boss) return new Map();

  const playerLoot = new Map<string, LootDrop[]>();

  for (const player of players) {
    const rng = createLootRNG(runId, floor, `boss_${bossId}_${player.id}`);
    const loot: LootDrop[] = [];

    // Roll on boss loot table
    for (const entry of boss.lootTable) {
      // Apply kill time bonus to drop chance (faster kills = higher drop rate)
      const adjustedDropChance = Math.min(1.0, entry.dropChance * (1 + killTimeBonus));
      if (!rng.chance(adjustedDropChance)) continue;

      if (entry.type === 'item') {
        // Generate item with potentially upgraded rarity for fast kills
        let rarity = entry.rarityWeights
          ? pickRarityFromWeights(rng, entry.rarityWeights)
          : undefined;

        // Fast kill bonus: chance to upgrade item rarity
        if (killTimeBonus > 0 && rarity && rng.chance(killTimeBonus)) {
          const rarityUpgrade: Record<Rarity, Rarity | undefined> = {
            [Rarity.Common]: Rarity.Uncommon,
            [Rarity.Uncommon]: Rarity.Rare,
            [Rarity.Rare]: Rarity.Epic,
            [Rarity.Epic]: Rarity.Legendary,
            [Rarity.Legendary]: undefined
          };
          const upgradedRarity = rarityUpgrade[rarity];
          if (upgradedRarity) {
            console.log(`[DEBUG] Fast kill bonus upgraded item from ${rarity} to ${upgradedRarity}`);
            rarity = upgradedRarity;
          }
        }

        const item = generateItem(rng, floor, entry.itemSlot, rarity, player.classId);
        loot.push({ type: 'item', item });
      } else if (entry.type === 'ability') {
        // Try to drop an ability
        const abilityDrop = generateAbilityDrop(rng, player, floor);
        if (abilityDrop) {
          loot.push(abilityDrop);
        }
      } else if (entry.type === 'cosmetic') {
        // Cosmetics are just gold for prototype
        loot.push({
          type: 'gold',
          goldAmount: rng.nextInt(50, 100) * floor
        });
      }
    }

    // Check for set item drop (bosses have 2x chance + kill time bonus)
    const setItemChance = shouldDropSetItem(rng, floor) || shouldDropSetItem(rng, floor);
    const bonusSetChance = killTimeBonus > 0 && rng.chance(killTimeBonus * 2);
    if (setItemChance || bonusSetChance) {
      const setItem = generateSetItem(rng, floor);
      loot.push({ type: 'item', item: setItem });
    }

    // Bonus gold for fast kills
    const goldMultiplier = 1 + killTimeBonus;
    loot.push({
      type: 'gold',
      goldAmount: Math.round(rng.nextInt(GAME_CONFIG.GOLD_DROP_MIN, GAME_CONFIG.GOLD_DROP_MAX) * floor * goldMultiplier)
    });

    // Fast kill bonus: extra potion drop
    if (killTimeBonus >= 0.25 && rng.chance(0.5)) {
      const potionType = rng.chance(0.5) ? PotionType.Health : PotionType.Mana;
      const potion: Potion = {
        id: `potion_bonus_${rng.nextInt(10000, 99999)}`,
        type: potionType,
        name: potionType === PotionType.Health ? 'Bonus Health Potion' : 'Bonus Mana Potion',
        amount: 50 + floor * 15,
        rarity: Rarity.Uncommon
      };
      loot.push({ type: 'potion', potion });
    }

    playerLoot.set(player.id, loot);
  }

  return playerLoot;
}

/**
 * Generate loot for a rare mob
 */
export function generateRareLoot(
  runId: string,
  floor: number,
  enemy: Enemy,
  players: Player[]
): Map<string, LootDrop[]> {
  const playerLoot = new Map<string, LootDrop[]>();

  for (const player of players) {
    const rng = createLootRNG(runId, floor, `rare_${enemy.id}_${player.id}`);
    const loot: LootDrop[] = [];

    // 60% chance for gear
    if (rng.chance(0.6)) {
      const item = generateItem(rng, floor, undefined, undefined, player.classId);
      loot.push({ type: 'item', item });
    }

    // 25% chance for ability
    if (rng.chance(0.25)) {
      const abilityDrop = generateAbilityDrop(rng, player, floor);
      if (abilityDrop) {
        loot.push(abilityDrop);
      }
    }

    // Check for set item drop (rares have 1.5x chance)
    const setChance = shouldDropSetItem(rng, floor);
    const bonusSetChance = rng.chance(0.5) && shouldDropSetItem(rng, floor);
    if (setChance || bonusSetChance) {
      const setItem = generateSetItem(rng, floor);
      loot.push({ type: 'item', item: setItem });
    }

    // Extra gold
    loot.push({
      type: 'gold',
      goldAmount: rng.nextInt(GAME_CONFIG.GOLD_DROP_MIN * 2, GAME_CONFIG.GOLD_DROP_MAX * 2) * floor
    });

    playerLoot.set(player.id, loot);
  }

  return playerLoot;
}

/**
 * Generate loot for normal enemies (small chance)
 */
export function generateEnemyLoot(
  runId: string,
  floor: number,
  enemy: Enemy,
  player: Player
): LootDrop[] {
  const rng = createLootRNG(runId, floor, `enemy_${enemy.id}_${player.id}`);
  const loot: LootDrop[] = [];

  // 10% chance for small gold drop
  if (rng.chance(0.1)) {
    loot.push({
      type: 'gold',
      goldAmount: rng.nextInt(1, 5) * floor
    });
  }

  // 2% chance for gear from normal enemies
  if (rng.chance(0.02)) {
    const item = generateItem(rng, floor, undefined, undefined, player.classId);
    loot.push({ type: 'item', item });
  }

  // Very small chance for set item from normal enemies (0.5% base, scaling with floor)
  if (shouldDropSetItem(rng, floor) && rng.chance(0.25)) {
    const setItem = generateSetItem(rng, floor);
    loot.push({ type: 'item', item: setItem });
  }

  // 15% chance for health potion
  if (rng.chance(0.15)) {
    const potion = generatePotion(rng, floor, PotionType.Health);
    loot.push({ type: 'potion', potion });
  }

  // 10% chance for mana potion
  if (rng.chance(0.10)) {
    const potion = generatePotion(rng, floor, PotionType.Mana);
    loot.push({ type: 'potion', potion });
  }

  return loot;
}

/**
 * Generate a potion
 */
function generatePotion(rng: SeededRNG, floor: number, type: PotionType): Potion {
  const baseAmount = type === PotionType.Health ? 50 : 30;
  const scaledAmount = baseAmount + floor * 10;

  // Determine rarity (affects restore amount)
  const rarityRoll = rng.next();
  let rarity: Rarity;
  let multiplier: number;

  if (rarityRoll < 0.6) {
    rarity = Rarity.Common;
    multiplier = 1;
  } else if (rarityRoll < 0.85) {
    rarity = Rarity.Uncommon;
    multiplier = 1.5;
  } else if (rarityRoll < 0.95) {
    rarity = Rarity.Rare;
    multiplier = 2;
  } else {
    rarity = Rarity.Epic;
    multiplier = 3;
  }

  const amount = Math.round(scaledAmount * multiplier);

  const names = {
    [PotionType.Health]: {
      [Rarity.Common]: 'Minor Health Potion',
      [Rarity.Uncommon]: 'Health Potion',
      [Rarity.Rare]: 'Greater Health Potion',
      [Rarity.Epic]: 'Major Health Potion',
      [Rarity.Legendary]: 'Supreme Health Potion'
    },
    [PotionType.Mana]: {
      [Rarity.Common]: 'Minor Mana Potion',
      [Rarity.Uncommon]: 'Mana Potion',
      [Rarity.Rare]: 'Greater Mana Potion',
      [Rarity.Epic]: 'Major Mana Potion',
      [Rarity.Legendary]: 'Supreme Mana Potion'
    }
  };

  return {
    id: `potion_${rng.nextInt(10000, 99999)}`,
    type,
    name: names[type][rarity],
    amount,
    rarity
  };
}

/**
 * Generate an ability drop for a player
 */
function generateAbilityDrop(
  rng: SeededRNG,
  player: Player,
  floor: number
): LootDrop | null {
  const classData = getClassById(player.classId);
  if (!classData) return null;

  const learnableAbilities = getLearnableAbilities(player.classId);

  // Find abilities the player doesn't have yet
  const unlearnedAbilities = learnableAbilities.filter(
    ability => !player.abilities.some(pa => pa.abilityId === ability.id)
  );

  // If player has all abilities, try to upgrade an existing one
  if (unlearnedAbilities.length === 0) {
    // Try to upgrade a random ability
    const upgradeable = player.abilities.filter(
      pa => pa.rank < GAME_CONFIG.MAX_ABILITY_RANK
    );

    if (upgradeable.length === 0) {
      // All abilities maxed, give fallback reward
      const fallback = getFallbackReward(floor);
      return {
        type: 'gold',
        goldAmount: fallback.gold,
        wasConverted: true
      };
    }

    const abilityToUpgrade = rng.pick(upgradeable);

    // Check if floor requirement is met
    if (!canUpgradeAbilityRank(abilityToUpgrade.rank, floor)) {
      // Floor too low, give fallback reward
      const fallback = getFallbackReward(floor);
      if (fallback.tokens > 0) {
        return {
          type: 'rerollToken',
          tokenCount: fallback.tokens,
          wasConverted: true
        };
      }
      return {
        type: 'gold',
        goldAmount: fallback.gold,
        wasConverted: true
      };
    }

    // Return upgrade drop
    return {
      type: 'ability',
      abilityId: abilityToUpgrade.abilityId
    };
  }

  // Drop a new ability
  const newAbility = rng.pick(unlearnedAbilities);
  return {
    type: 'ability',
    abilityId: newAbility.id
  };
}

/**
 * Apply a loot drop to a player
 */
export function applyLootDrop(player: Player, drop: LootDrop): boolean {
  switch (drop.type) {
    case 'gold':
      player.gold += drop.goldAmount ?? 0;
      return true;

    case 'rerollToken':
      player.rerollTokens += drop.tokenCount ?? 1;
      return true;

    case 'item':
      // Item goes to inventory - auto-equip if better, otherwise backpack
      if (drop.item) {
        return tryEquipItem(player, drop.item);
      }
      return false;

    case 'ability':
      if (drop.abilityId) {
        return applyAbilityDrop(player, drop.abilityId);
      }
      return false;

    case 'potion':
      // Potions go directly to backpack
      if (drop.potion) {
        player.backpack.push(drop.potion);
        return true;
      }
      return false;
  }
}

/**
 * Try to equip an item - auto-equip if better, otherwise add to backpack
 */
function tryEquipItem(player: Player, item: Item): boolean {
  const currentItem = player.equipment[item.slot];

  // If slot empty, equip
  if (!currentItem) {
    player.equipment[item.slot] = item;
    recalculateStats(player);
    return true;
  }

  // Compare item power (sum of stats)
  const currentPower = getItemPower(currentItem);
  const newPower = getItemPower(item);

  if (newPower > currentPower) {
    // New item is better - equip it and put old in backpack
    player.equipment[item.slot] = item;
    player.backpack.push(currentItem);
    recalculateStats(player);
    return true;
  }

  // New item is worse - add to backpack for later
  player.backpack.push(item);
  return true;
}

/**
 * Calculate total stat value of an item
 */
export function getItemPower(item: Item): number {
  const stats = item.stats;
  return (
    (stats.health ?? 0) +
    (stats.mana ?? 0) +
    (stats.attackPower ?? 0) * 2 +
    (stats.spellPower ?? 0) * 2 +
    (stats.armor ?? 0) +
    (stats.crit ?? 0) * 3 +
    (stats.haste ?? 0) * 3 +
    (stats.lifesteal ?? 0) * 4 +
    (stats.resist ?? 0)
  );
}

/**
 * Apply ability drop (learn or upgrade)
 */
function applyAbilityDrop(player: Player, abilityId: string): boolean {
  const existing = player.abilities.find(a => a.abilityId === abilityId);

  if (existing) {
    // Upgrade rank
    existing.rank = Math.min(GAME_CONFIG.MAX_ABILITY_RANK, existing.rank + 1);
  } else {
    // Learn new ability
    player.abilities.push({
      abilityId,
      rank: 1,
      currentCooldown: 0
    });
  }

  return true;
}

/**
 * Recalculate player stats from base + equipment + set bonuses
 */
export function recalculateStats(player: Player): void {
  const base = player.baseStats;

  // Start with base stats
  player.stats = { ...base };

  // Add equipment stats
  for (const slot of Object.values(EquipSlot)) {
    const item = player.equipment[slot];
    if (!item) continue;

    const stats = item.stats;
    player.stats.health += stats.health ?? 0;
    player.stats.maxHealth += stats.health ?? 0;
    player.stats.mana += stats.mana ?? 0;
    player.stats.maxMana += stats.mana ?? 0;
    player.stats.attackPower += stats.attackPower ?? 0;
    player.stats.spellPower += stats.spellPower ?? 0;
    player.stats.armor += stats.armor ?? 0;
    player.stats.crit += stats.crit ?? 0;
    player.stats.haste += stats.haste ?? 0;
    player.stats.lifesteal += stats.lifesteal ?? 0;
    player.stats.resist += stats.resist ?? 0;
  }

  // Add set bonuses
  const { totalBonusStats } = calculateSetBonuses(player.equipment);
  player.stats.health += totalBonusStats.health ?? 0;
  player.stats.maxHealth += totalBonusStats.health ?? 0;
  player.stats.mana += totalBonusStats.mana ?? 0;
  player.stats.maxMana += totalBonusStats.mana ?? 0;
  player.stats.attackPower += totalBonusStats.attackPower ?? 0;
  player.stats.spellPower += totalBonusStats.spellPower ?? 0;
  player.stats.armor += totalBonusStats.armor ?? 0;
  player.stats.crit += totalBonusStats.crit ?? 0;
  player.stats.haste += totalBonusStats.haste ?? 0;
  player.stats.lifesteal += totalBonusStats.lifesteal ?? 0;
  player.stats.resist += totalBonusStats.resist ?? 0;

  // Add buff stat modifiers (e.g., Aspect of the Hawk)
  for (const buff of player.buffs) {
    if (buff.statModifiers) {
      player.stats.health += buff.statModifiers.health ?? 0;
      player.stats.maxHealth += buff.statModifiers.maxHealth ?? 0;
      player.stats.mana += buff.statModifiers.mana ?? 0;
      player.stats.maxMana += buff.statModifiers.maxMana ?? 0;
      player.stats.attackPower += buff.statModifiers.attackPower ?? 0;
      player.stats.spellPower += buff.statModifiers.spellPower ?? 0;
      player.stats.armor += buff.statModifiers.armor ?? 0;
      player.stats.crit += buff.statModifiers.crit ?? 0;
      player.stats.haste += buff.statModifiers.haste ?? 0;
      player.stats.lifesteal += buff.statModifiers.lifesteal ?? 0;
      player.stats.resist += buff.statModifiers.resist ?? 0;
    }
  }
}

/**
 * Get average item power for a party (used for scaling)
 */
export function getPartyAverageItemPower(players: Player[]): number {
  if (players.length === 0) return 0;

  let totalPower = 0;

  for (const player of players) {
    for (const slot of Object.values(EquipSlot)) {
      const item = player.equipment[slot];
      if (item) {
        totalPower += getItemPower(item);
      }
    }
  }

  return totalPower / players.length;
}
