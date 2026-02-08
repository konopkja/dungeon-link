import { EquipSlot, Rarity, ItemStats, Item, ClassName } from '@dungeon-link/shared';
import { SeededRNG } from '../utils/SeededRNG.js';

// Item name components
const ITEM_PREFIXES: Record<Rarity, string[]> = {
  [Rarity.Common]: ['Worn', 'Simple', 'Basic', 'Old'],
  [Rarity.Uncommon]: ['Sturdy', 'Polished', 'Fine', 'Quality'],
  [Rarity.Rare]: ['Superior', 'Exceptional', 'Masterwork', 'Enchanted'],
  [Rarity.Epic]: ['Heroic', 'Magnificent', 'Legendary', 'Ancient'],
  [Rarity.Legendary]: ['Mythic', 'Divine', 'Eternal', 'Godforged']
};

const SLOT_NAMES: Record<EquipSlot, string[]> = {
  [EquipSlot.Head]: ['Helm', 'Crown', 'Hood', 'Circlet'],
  [EquipSlot.Chest]: ['Chestplate', 'Robe', 'Tunic', 'Vest'],
  [EquipSlot.Legs]: ['Legguards', 'Pants', 'Greaves', 'Leggings'],
  [EquipSlot.Feet]: ['Boots', 'Sabatons', 'Treads', 'Footwraps'],
  [EquipSlot.Hands]: ['Gauntlets', 'Gloves', 'Handguards', 'Grips'],
  [EquipSlot.Weapon]: ['Sword', 'Staff', 'Dagger', 'Axe', 'Mace', 'Bow'],
  [EquipSlot.Ring]: ['Ring', 'Band', 'Loop', 'Signet'],
  [EquipSlot.Trinket]: ['Trinket', 'Charm', 'Talisman', 'Relic']
};

// Stat weights by slot type
const SLOT_STAT_WEIGHTS: Record<EquipSlot, Partial<Record<keyof ItemStats, number>>> = {
  [EquipSlot.Head]: { health: 0.3, mana: 0.2, spellPower: 0.2, armor: 0.2, resist: 0.1 },
  [EquipSlot.Chest]: { health: 0.4, armor: 0.3, attackPower: 0.15, spellPower: 0.15 },
  [EquipSlot.Legs]: { health: 0.3, armor: 0.3, attackPower: 0.2, spellPower: 0.2 },
  [EquipSlot.Feet]: { armor: 0.3, haste: 0.3, health: 0.2, crit: 0.2 },
  [EquipSlot.Hands]: { attackPower: 0.3, spellPower: 0.3, crit: 0.2, haste: 0.2 },
  [EquipSlot.Weapon]: { attackPower: 0.35, spellPower: 0.35, crit: 0.15, haste: 0.15 },
  [EquipSlot.Ring]: { crit: 0.25, haste: 0.25, attackPower: 0.25, spellPower: 0.25 },
  [EquipSlot.Trinket]: { health: 0.2, mana: 0.2, lifesteal: 0.2, resist: 0.2, crit: 0.2 }
};

// Base stat ranges by rarity
const RARITY_STAT_MULTIPLIER: Record<Rarity, number> = {
  [Rarity.Common]: 1.0,
  [Rarity.Uncommon]: 1.3,
  [Rarity.Rare]: 1.7,
  [Rarity.Epic]: 2.2,
  [Rarity.Legendary]: 3.0
};

// Number of stats by rarity
const RARITY_STAT_COUNT: Record<Rarity, [number, number]> = {
  [Rarity.Common]: [1, 2],
  [Rarity.Uncommon]: [2, 3],
  [Rarity.Rare]: [3, 4],
  [Rarity.Epic]: [4, 5],
  [Rarity.Legendary]: [5, 6]
};

// Base stat values per floor
const BASE_STAT_PER_FLOOR = 5;
const FLOOR_STAT_SCALE = 1.12;

export function generateItem(
  rng: SeededRNG,
  floor: number,
  slot?: EquipSlot,
  rarity?: Rarity,
  forClass?: ClassName
): Item {
  // Pick random slot if not specified
  const itemSlot = slot ?? (Object.values(EquipSlot)[rng.nextInt(0, Object.values(EquipSlot).length - 1)] as EquipSlot);

  // Pick random rarity if not specified
  const itemRarity = rarity ?? pickRarity(rng, floor);

  // Generate name
  const prefix = ITEM_PREFIXES[itemRarity][rng.nextInt(0, ITEM_PREFIXES[itemRarity].length - 1)];
  const baseName = SLOT_NAMES[itemSlot][rng.nextInt(0, SLOT_NAMES[itemSlot].length - 1)];
  const name = `${prefix} ${baseName}`;

  // Generate stats
  const stats = generateStats(rng, floor, itemSlot, itemRarity);

  // Generate unique ID
  const id = `item_${floor}_${rng.nextInt(0, 999999)}`;

  return {
    id,
    name,
    slot: itemSlot,
    rarity: itemRarity,
    stats,
    floorDropped: floor,
    requiredClass: forClass ? [forClass] : undefined
  };
}

function pickRarity(rng: SeededRNG, floor: number): Rarity {
  const roll = rng.next();

  // Higher floors have better rarity chances
  const floorBonus = Math.min(floor * 0.02, 0.3); // Max 30% bonus at floor 15

  if (roll < 0.01 + floorBonus * 0.1) return Rarity.Legendary;
  if (roll < 0.05 + floorBonus * 0.3) return Rarity.Epic;
  if (roll < 0.20 + floorBonus * 0.5) return Rarity.Rare;
  if (roll < 0.50 + floorBonus) return Rarity.Uncommon;
  return Rarity.Common;
}

function generateStats(
  rng: SeededRNG,
  floor: number,
  slot: EquipSlot,
  rarity: Rarity
): ItemStats {
  const stats: ItemStats = {};
  const weights = SLOT_STAT_WEIGHTS[slot];
  const multiplier = RARITY_STAT_MULTIPLIER[rarity];
  const [minStats, maxStats] = RARITY_STAT_COUNT[rarity];

  // Calculate base value for this floor
  const baseValue = BASE_STAT_PER_FLOOR * Math.pow(FLOOR_STAT_SCALE, floor - 1);

  // Pick which stats to include
  const availableStats = Object.keys(weights) as (keyof ItemStats)[];
  const numStats = rng.nextInt(minStats, maxStats);

  // Shuffle and pick stats (using proper Fisher-Yates shuffle for uniform distribution)
  const shuffled = rng.shuffle(availableStats);
  const selectedStats = shuffled.slice(0, numStats);

  for (const stat of selectedStats) {
    const weight = weights[stat] ?? 0.1;
    const variance = 0.8 + rng.next() * 0.4; // 80% to 120% of base
    const value = Math.round(baseValue * multiplier * weight * variance);

    if (value > 0) {
      stats[stat] = value;
    }
  }

  return stats;
}

export function pickRarityFromWeights(
  rng: SeededRNG,
  weights: Partial<Record<Rarity, number>>
): Rarity {
  const entries = Object.entries(weights) as [Rarity, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);

  let roll = rng.next() * total;

  for (const [rarity, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return rarity;
  }

  return entries[0][0];
}
