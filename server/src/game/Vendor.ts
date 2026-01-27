import { Player, Vendor, VendorService, Room, PlayerAbility, AbilityType, Item, CryptoVendor } from '@dungeon-link/shared';
import { GAME_CONFIG } from '@dungeon-link/shared';
import { getXPForLevel } from '../data/leveling.js';
import { getAbilityById } from '../data/classes.js';

// Vendor pricing constants based on economy analysis:
// - Average gold per floor: ~40-50 gold * floor level
// - Level up cost should be roughly 1-2 floors worth of grinding
const VENDOR_CONFIG = {
  LEVEL_UP_BASE_COST: 50,           // Base cost for level up
  LEVEL_UP_SCALE: 1.5,              // Exponential scaling with level
  ABILITY_TRAIN_BASE_COST: 30,      // Base cost to upgrade ability rank
  ABILITY_TRAIN_RANK_SCALE: 1.3,    // Cost scaling per rank
  ABILITY_TRAIN_FLOOR_SCALE: 1.2,   // Cost scaling per floor
  // Sell pricing: items sell for ~25-50% of their "value" based on stats and rarity
  SELL_BASE_MULTIPLIER: 0.35,       // Base sell price multiplier
  SELL_RARITY_BONUS: {              // Extra multiplier per rarity
    common: 1.0,
    uncommon: 1.2,
    rare: 1.5,
    epic: 2.0,
    legendary: 3.0,
  },
};

const TRAINER_NAMES = [
  'Master Aldric',
  'Sage Miriam',
  'Elder Theron',
  'Trainer Kaela',
  'Mentor Drex',
  'Instructor Zara',
];

const SHOP_NAMES = [
  'Merchant Garrick',
  'Trader Hilda',
  'Peddler Finn',
  'Shopkeeper Rosa',
  'Dealer Vance',
  'Broker Thalia',
];

const CRYPTO_VENDOR_NAMES = [
  'Alchemist Zephyr',
  'Mystic Brewer',
  'Elixir Merchant',
  'Potion Master',
  'Arcane Apothecary',
  'Ethereal Vendor',
];

/**
 * Create a trainer NPC for a room (positioned in top-left corner)
 */
export function createVendor(room: Room, floor: number): Vendor {
  const vendorId = `trainer_${room.id}`;
  const name = TRAINER_NAMES[Math.floor(Math.random() * TRAINER_NAMES.length)];

  return {
    id: vendorId,
    name,
    position: {
      x: room.x + 60, // Top-left corner with padding
      y: room.y + 60,
    },
    vendorType: 'trainer',
  };
}

/**
 * Create a shop vendor NPC for a room (positioned in top-right corner)
 */
export function createShopVendor(room: Room, floor: number): Vendor {
  const vendorId = `shop_${room.id}`;
  const name = SHOP_NAMES[Math.floor(Math.random() * SHOP_NAMES.length)];

  return {
    id: vendorId,
    name,
    position: {
      x: room.x + room.width - 60, // Top-right corner with padding
      y: room.y + 60,
    },
    vendorType: 'shop',
  };
}

/**
 * Create a crypto vendor NPC for a room (positioned in bottom-left corner)
 */
export function createCryptoVendor(room: Room, floor: number): CryptoVendor {
  const vendorId = `crypto_${room.id}`;
  const name = CRYPTO_VENDOR_NAMES[Math.floor(Math.random() * CRYPTO_VENDOR_NAMES.length)];

  return {
    id: vendorId,
    name,
    position: {
      x: room.x + 60, // Bottom-left corner with padding
      y: room.y + room.height - 60,
    },
    vendorType: 'crypto',
  };
}

/**
 * Calculate the cost to level up (proportional to XP remaining)
 * If player is 80% of the way to leveling, they only pay 20% of the full cost
 */
export function getLevelUpCost(player: Player): number {
  const baseCost = Math.floor(
    VENDOR_CONFIG.LEVEL_UP_BASE_COST * Math.pow(player.level, VENDOR_CONFIG.LEVEL_UP_SCALE)
  );

  // Calculate remaining XP percentage
  const xpProgress = player.xpToNextLevel > 0 ? player.xp / player.xpToNextLevel : 0;
  const remainingPercent = Math.max(0.1, 1 - xpProgress); // Minimum 10% cost

  return Math.max(1, Math.floor(baseCost * remainingPercent));
}

/**
 * Calculate the cost to upgrade an ability rank
 */
export function getAbilityTrainCost(currentRank: number, floor: number): number {
  const baseCost = VENDOR_CONFIG.ABILITY_TRAIN_BASE_COST;
  const rankMultiplier = Math.pow(currentRank, VENDOR_CONFIG.ABILITY_TRAIN_RANK_SCALE);
  const floorMultiplier = Math.pow(floor, VENDOR_CONFIG.ABILITY_TRAIN_FLOOR_SCALE - 1);

  return Math.floor(baseCost * rankMultiplier * floorMultiplier);
}

/**
 * Get available services for a player from a vendor
 */
export function getVendorServices(player: Player, floor: number): VendorService[] {
  const services: VendorService[] = [];

  // Level up service - cost is proportional to remaining XP
  const levelUpCost = getLevelUpCost(player);
  const xpProgress = player.xpToNextLevel > 0 ? Math.floor((player.xp / player.xpToNextLevel) * 100) : 0;
  services.push({
    type: 'level_up',
    cost: levelUpCost,
    description: `Level up to ${player.level + 1} (+10 HP, +5 Mana, +2 Attack/Spell Power) [${xpProgress}% XP progress]`,
  });

  // Ability training services - only for abilities not yet maxed
  for (const ability of player.abilities) {
    if (ability.rank < GAME_CONFIG.MAX_ABILITY_RANK) {
      const trainCost = getAbilityTrainCost(ability.rank, floor);
      // Look up ability name and type from data
      const abilityData = getAbilityById(ability.abilityId);
      const abilityName = abilityData?.ability.name || ability.abilityId;
      const abilityType = abilityData?.ability.type;
      const powerIncrease = Math.round(GAME_CONFIG.RANK_DAMAGE_INCREASE * 100);

      // Customize description based on ability type
      let description: string;
      if (abilityType === AbilityType.Summon) {
        description = `Upgrade ${abilityName} to Rank ${ability.rank + 1} (+${powerIncrease}% pet HP/damage)`;
      } else if (abilityType === AbilityType.Heal) {
        description = `Upgrade ${abilityName} to Rank ${ability.rank + 1} (+${powerIncrease}% healing)`;
      } else if (abilityType === AbilityType.Buff) {
        // Buff abilities improve duration/effect
        description = `Upgrade ${abilityName} to Rank ${ability.rank + 1} (+duration/effect)`;
      } else if (abilityType === AbilityType.Debuff) {
        // Debuff abilities (DoTs, etc.) improve damage over time
        description = `Upgrade ${abilityName} to Rank ${ability.rank + 1} (+${powerIncrease}% effect)`;
      } else {
        description = `Upgrade ${abilityName} to Rank ${ability.rank + 1} (+${powerIncrease}% damage)`;
      }

      services.push({
        type: 'train_ability',
        abilityId: ability.abilityId,
        cost: trainCost,
        description,
      });
    }
  }

  return services;
}

/**
 * Process a level up purchase
 */
export function purchaseLevelUp(player: Player): { success: boolean; message: string } {
  const cost = getLevelUpCost(player);

  if (player.gold < cost) {
    return { success: false, message: `Not enough gold! Need ${cost} gold.` };
  }

  // Deduct gold
  player.gold -= cost;

  // Level up the player
  player.level++;

  // Apply stat bonuses
  const statBonuses = {
    maxHealth: 10,
    health: 10,
    maxMana: 5,
    mana: 5,
    attackPower: 2,
    spellPower: 2,
    armor: 1,
    resist: 1,
  };

  player.baseStats.maxHealth += statBonuses.maxHealth;
  player.baseStats.maxMana += statBonuses.maxMana;
  player.baseStats.attackPower += statBonuses.attackPower;
  player.baseStats.spellPower += statBonuses.spellPower;
  player.baseStats.armor += statBonuses.armor;
  player.baseStats.resist += statBonuses.resist;

  // Update current stats and heal
  player.stats.maxHealth += statBonuses.maxHealth;
  player.stats.health = player.stats.maxHealth;
  player.stats.maxMana += statBonuses.maxMana;
  player.stats.mana = player.stats.maxMana;
  player.stats.attackPower += statBonuses.attackPower;
  player.stats.spellPower += statBonuses.spellPower;
  player.stats.armor += statBonuses.armor;
  player.stats.resist += statBonuses.resist;

  // Reset XP and update XP requirement
  player.xp = 0;
  player.xpToNextLevel = getXPForLevel(player.level + 1);

  return { success: true, message: `Leveled up to ${player.level}! Fully healed.` };
}

/**
 * Process an ability training purchase
 */
export function purchaseAbilityTrain(
  player: Player,
  abilityId: string,
  floor: number
): { success: boolean; message: string } {
  // Find the ability
  const ability = player.abilities.find(a => a.abilityId === abilityId);

  if (!ability) {
    return { success: false, message: 'Ability not found!' };
  }

  // Get ability data to get the name
  const baseAbilityData = getAbilityById(abilityId);
  const abilityName = baseAbilityData?.ability.name || abilityId;

  if (ability.rank >= GAME_CONFIG.MAX_ABILITY_RANK) {
    return { success: false, message: `${abilityName} is already at max rank!` };
  }

  const cost = getAbilityTrainCost(ability.rank, floor);

  if (player.gold < cost) {
    return { success: false, message: `Not enough gold! Need ${cost} gold.` };
  }

  // Deduct gold
  player.gold -= cost;

  // Upgrade the ability rank
  ability.rank++;

  return {
    success: true,
    message: `${abilityName} upgraded to Rank ${ability.rank}!`
  };
}

/**
 * Calculate the sell price for an item based on its stats and rarity
 */
export function getItemSellPrice(item: Item): number {
  // Calculate total stat value
  let statValue = 0;
  const stats = item.stats;

  // Weight different stats differently
  if (stats.health) statValue += stats.health * 0.5;
  if (stats.mana) statValue += stats.mana * 0.3;
  if (stats.attackPower) statValue += stats.attackPower * 2;
  if (stats.spellPower) statValue += stats.spellPower * 2;
  if (stats.armor) statValue += stats.armor * 1.5;
  if (stats.crit) statValue += stats.crit * 3;
  if (stats.haste) statValue += stats.haste * 3;
  if (stats.lifesteal) statValue += stats.lifesteal * 4;
  if (stats.resist) statValue += stats.resist * 1.5;

  // Apply base multiplier and rarity bonus
  const rarityBonus = VENDOR_CONFIG.SELL_RARITY_BONUS[item.rarity] || 1.0;
  const basePrice = statValue * VENDOR_CONFIG.SELL_BASE_MULTIPLIER * rarityBonus;

  // Floor bonus (items from higher floors are worth more)
  const floorBonus = 1 + (item.floorDropped - 1) * 0.1;

  // Minimum price of 1 gold
  return Math.max(1, Math.floor(basePrice * floorBonus));
}

/**
 * Get available shop services for a player (selling items)
 */
export function getShopServices(player: Player): VendorService[] {
  const services: VendorService[] = [];

  // Calculate total value of all sellable items (non-potions in backpack)
  let totalSellValue = 0;
  const sellableItems: { item: Item; price: number }[] = [];

  for (const backpackItem of player.backpack) {
    // Only include items, not potions
    if ('slot' in backpackItem) {
      const item = backpackItem as Item;
      const price = getItemSellPrice(item);
      sellableItems.push({ item, price });
      totalSellValue += price;
    }
  }

  // Add individual item sell services
  for (const { item, price } of sellableItems) {
    services.push({
      type: 'sell_item',
      itemId: item.id,
      cost: price, // For selling, cost represents gold received
      description: `Sell ${item.name} (${item.rarity})`,
    });
  }

  // Add "Sell All" option if there are items to sell
  if (sellableItems.length > 1) {
    services.push({
      type: 'sell_all',
      cost: totalSellValue,
      description: `Sell all items (${sellableItems.length} items)`,
    });
  }

  return services;
}

/**
 * Process selling a single item
 */
export function sellItem(player: Player, itemId: string): { success: boolean; message: string; goldGained: number } {
  const itemIndex = player.backpack.findIndex(i => 'slot' in i && i.id === itemId);

  if (itemIndex === -1) {
    return { success: false, message: 'Item not found in backpack', goldGained: 0 };
  }

  const item = player.backpack[itemIndex] as Item;
  const goldGained = getItemSellPrice(item);

  // Remove item and add gold
  player.backpack.splice(itemIndex, 1);
  player.gold += goldGained;

  return {
    success: true,
    message: `Sold ${item.name} for ${goldGained} gold`,
    goldGained,
  };
}

/**
 * Process selling all items (except potions)
 */
export function sellAllItems(player: Player): { success: boolean; message: string; goldGained: number; itemsSold: number } {
  let goldGained = 0;
  let itemsSold = 0;

  // Find all sellable items (non-potions)
  const itemsToSell: number[] = [];
  for (let i = player.backpack.length - 1; i >= 0; i--) {
    const item = player.backpack[i];
    if ('slot' in item) {
      const price = getItemSellPrice(item as Item);
      goldGained += price;
      itemsSold++;
      itemsToSell.push(i);
    }
  }

  if (itemsSold === 0) {
    return { success: false, message: 'No items to sell', goldGained: 0, itemsSold: 0 };
  }

  // Remove items in reverse order to preserve indices
  for (const index of itemsToSell) {
    player.backpack.splice(index, 1);
  }

  // Add gold
  player.gold += goldGained;

  return {
    success: true,
    message: `Sold ${itemsSold} items for ${goldGained} gold`,
    goldGained,
    itemsSold,
  };
}
