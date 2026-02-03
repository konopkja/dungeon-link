import { SetDefinition, SetType, EquipSlot, Rarity, Item, ItemStats, SetBonus } from '@dungeon-link/shared';
import { SeededRNG } from '../utils/SeededRNG.js';

// ============================================
// SET DEFINITIONS
// ============================================

export const ITEM_SETS: SetDefinition[] = [
  // ============================================
  // CASTER SET - Archmage's Regalia
  // Sustain through shields and cooldown resets
  // ============================================
  {
    id: 'set_archmage',
    name: "Archmage's Regalia",
    setType: SetType.Caster,
    pieces: [EquipSlot.Head, EquipSlot.Chest, EquipSlot.Legs, EquipSlot.Hands, EquipSlot.Feet],
    bonuses: [
      {
        piecesRequired: 2,
        bonusStats: { spellPower: 15, mana: 30 },
        bonusDescription: '+15 Spell Power, +30 Mana'
      },
      {
        piecesRequired: 3,
        bonusStats: { crit: 8, haste: 5, lifesteal: 1 },
        bonusDescription: '+8% Crit, +5% Haste, +1% Lifesteal'
      },
      {
        piecesRequired: 4,
        bonusStats: {},
        bonusDescription: 'Arcane Barrier: Spell crits generate a shield for 15% of damage dealt',
        specialEffect: 'arcane_barrier'
      },
      {
        piecesRequired: 5,
        bonusStats: { spellPower: 40, mana: 50, crit: 10 },
        bonusDescription: '+40 Spell, +50 Mana, +10% Crit. Critical Mass: Spell crits have 30% chance to reset a random ability cooldown',
        specialEffect: 'critical_mass'
      }
    ]
  },

  // ============================================
  // MELEE DPS SET - Bladestorm Battlegear
  // Sustain through lifesteal and kill momentum
  // ============================================
  {
    id: 'set_bladestorm',
    name: 'Bladestorm Battlegear',
    setType: SetType.MeleeDPS,
    pieces: [EquipSlot.Head, EquipSlot.Chest, EquipSlot.Legs, EquipSlot.Hands, EquipSlot.Feet],
    bonuses: [
      {
        piecesRequired: 2,
        bonusStats: { attackPower: 15, crit: 5 },
        bonusDescription: '+15 Attack Power, +5% Crit'
      },
      {
        piecesRequired: 3,
        bonusStats: { haste: 10, lifesteal: 3 },
        bonusDescription: '+10% Haste, +3% Lifesteal'
      },
      {
        piecesRequired: 4,
        bonusStats: {},
        bonusDescription: 'Bloodthirst: Kills grant +10% attack speed for 6s (stacks 3x)',
        specialEffect: 'bloodthirst'
      },
      {
        piecesRequired: 5,
        bonusStats: { attackPower: 45, crit: 12, lifesteal: 5 },
        bonusDescription: '+45 Attack Power, +12% Crit, +5% Lifesteal'
      }
    ]
  },

  // ============================================
  // TANK SET - Bulwark of the Fortress
  // Sustain through revenge mechanics (damage ramp + thorns)
  // ============================================
  {
    id: 'set_bulwark',
    name: 'Bulwark of the Fortress',
    setType: SetType.Tank,
    pieces: [EquipSlot.Head, EquipSlot.Chest, EquipSlot.Legs, EquipSlot.Hands, EquipSlot.Feet],
    bonuses: [
      {
        piecesRequired: 2,
        bonusStats: { armor: 20, health: 50 },
        bonusDescription: '+20 Armor, +50 Health'
      },
      {
        piecesRequired: 3,
        bonusStats: { resist: 10, health: 30 },
        bonusDescription: '+10 Resist, +30 Health'
      },
      {
        piecesRequired: 4,
        bonusStats: {},
        bonusDescription: 'Vengeance: When hit, gain +3% damage for 6s (stacks 5x)',
        specialEffect: 'vengeance'
      },
      {
        piecesRequired: 5,
        bonusStats: { armor: 50, health: 150, resist: 15 },
        bonusDescription: '+50 Armor, +150 HP, +15 Resist. Thorns: Reflect 20% of damage taken',
        specialEffect: 'thorns'
      }
    ]
  }
];

// Set piece name templates
const SET_PIECE_NAMES: Record<string, Record<EquipSlot, string>> = {
  'set_archmage': {
    [EquipSlot.Head]: "Archmage's Crown",
    [EquipSlot.Chest]: "Archmage's Robes",
    [EquipSlot.Legs]: "Archmage's Leggings",
    [EquipSlot.Hands]: "Archmage's Gloves",
    [EquipSlot.Feet]: "Archmage's Slippers",
    [EquipSlot.Weapon]: "Archmage's Staff",
    [EquipSlot.Ring]: "Archmage's Signet",
    [EquipSlot.Trinket]: "Archmage's Focus"
  },
  'set_bladestorm': {
    [EquipSlot.Head]: 'Bladestorm Helm',
    [EquipSlot.Chest]: 'Bladestorm Hauberk',
    [EquipSlot.Legs]: 'Bladestorm Legguards',
    [EquipSlot.Hands]: 'Bladestorm Gauntlets',
    [EquipSlot.Feet]: 'Bladestorm Boots',
    [EquipSlot.Weapon]: 'Bladestorm Blade',
    [EquipSlot.Ring]: 'Bladestorm Band',
    [EquipSlot.Trinket]: 'Bladestorm Emblem'
  },
  'set_bulwark': {
    [EquipSlot.Head]: 'Bulwark Greathelm',
    [EquipSlot.Chest]: 'Bulwark Chestplate',
    [EquipSlot.Legs]: 'Bulwark Legplates',
    [EquipSlot.Hands]: 'Bulwark Handguards',
    [EquipSlot.Feet]: 'Bulwark Sabatons',
    [EquipSlot.Weapon]: 'Bulwark Shield',
    [EquipSlot.Ring]: 'Bulwark Signet',
    [EquipSlot.Trinket]: 'Bulwark Aegis'
  }
};

// Base stats for set pieces by set type
const SET_BASE_STATS: Record<SetType, Partial<Record<keyof ItemStats, number>>> = {
  [SetType.Caster]: { spellPower: 0.4, mana: 0.3, crit: 0.15, haste: 0.1, lifesteal: 0.05 },
  [SetType.MeleeDPS]: { attackPower: 0.4, crit: 0.25, haste: 0.2, lifesteal: 0.15 },
  [SetType.Tank]: { armor: 0.35, health: 0.35, resist: 0.2, attackPower: 0.1 }
};

/**
 * Calculate set item drop chance based on floor
 * Very rare in floors 1-4, improving each floor after
 */
export function getSetDropChance(floor: number): number {
  if (floor <= 4) {
    // Floors 1-4: very rare (1% to 4%)
    return 0.01 * floor;
  }
  // Floor 5+: increases by 2% per floor, capped at 25%
  return Math.min(0.04 + (floor - 4) * 0.02, 0.25);
}

/**
 * Check if a set item should drop
 */
export function shouldDropSetItem(rng: SeededRNG, floor: number): boolean {
  const chance = getSetDropChance(floor);
  return rng.next() < chance;
}

/**
 * Generate a random set item
 */
export function generateSetItem(
  rng: SeededRNG,
  floor: number,
  preferredSetType?: SetType,
  preferredSlot?: EquipSlot
): Item {
  // Pick a random set (or use preferred type)
  let set: SetDefinition;
  if (preferredSetType) {
    set = ITEM_SETS.find(s => s.setType === preferredSetType) ?? rng.pick(ITEM_SETS);
  } else {
    set = rng.pick(ITEM_SETS);
  }

  // Pick a random slot from the set's pieces (or use preferred slot if valid)
  let slot: EquipSlot;
  if (preferredSlot && set.pieces.includes(preferredSlot)) {
    slot = preferredSlot;
  } else {
    slot = rng.pick(set.pieces);
  }

  // Set items scale with floor - better rarity at higher floors
  let rarity: Rarity;
  const rarityRoll = rng.next();
  if (floor >= 8 && rarityRoll < 0.30) {
    // Legendary available at floor 8+ (30% chance)
    rarity = Rarity.Legendary;
  } else if (floor >= 4 && rarityRoll < 0.45) {
    // Epic available at floor 4+ (45% chance if not legendary)
    rarity = Rarity.Epic;
  } else if (floor >= 2) {
    // Rare at floor 2+ is guaranteed minimum
    rarity = Rarity.Rare;
  } else {
    // Floor 1: 50% uncommon, 50% rare
    rarity = rarityRoll < 0.5 ? Rarity.Uncommon : Rarity.Rare;
  }

  // Generate stats based on set type
  const stats = generateSetItemStats(rng, floor, set.setType, rarity);

  // Get the item name
  const name = SET_PIECE_NAMES[set.id]?.[slot] ?? `${set.name} ${slot}`;

  // Generate unique ID
  const id = `set_${set.id}_${slot}_${floor}_${rng.nextInt(0, 999999)}`;

  return {
    id,
    name,
    slot,
    rarity,
    stats,
    floorDropped: floor,
    setId: set.id,
    setType: set.setType
  };
}

/**
 * Generate stats for a set item
 */
function generateSetItemStats(
  rng: SeededRNG,
  floor: number,
  setType: SetType,
  rarity: Rarity
): ItemStats {
  const stats: ItemStats = {};
  const baseWeights = SET_BASE_STATS[setType];

  // Rarity multipliers
  const rarityMult: Record<Rarity, number> = {
    [Rarity.Common]: 1.0,
    [Rarity.Uncommon]: 1.3,
    [Rarity.Rare]: 1.7,
    [Rarity.Epic]: 2.2,
    [Rarity.Legendary]: 3.5
  };

  // Base value scales more aggressively with floor to compete with regular drops
  const baseValue = 10 * Math.pow(1.15, floor - 1);
  const multiplier = rarityMult[rarity];

  // Add stats based on set type weights
  for (const [stat, weight] of Object.entries(baseWeights)) {
    if (weight && weight > 0) {
      const variance = 0.85 + rng.next() * 0.3; // 85% to 115%
      const value = Math.round(baseValue * multiplier * weight * variance);
      if (value > 0) {
        stats[stat as keyof ItemStats] = value;
      }
    }
  }

  return stats;
}

/**
 * Get a set definition by ID
 */
export function getSetById(setId: string): SetDefinition | undefined {
  return ITEM_SETS.find(s => s.id === setId);
}

/**
 * Calculate active set bonuses for a player's equipment
 */
export function calculateSetBonuses(equipment: Record<EquipSlot, Item | null>): {
  activeSets: { set: SetDefinition; pieceCount: number; activeBonuses: SetBonus[] }[];
  totalBonusStats: ItemStats;
} {
  // Count pieces per set
  const setCounts = new Map<string, number>();

  for (const slot of Object.values(EquipSlot)) {
    const item = equipment[slot];
    if (item?.setId) {
      setCounts.set(item.setId, (setCounts.get(item.setId) ?? 0) + 1);
    }
  }

  const activeSets: { set: SetDefinition; pieceCount: number; activeBonuses: SetBonus[] }[] = [];
  const totalBonusStats: ItemStats = {};

  // Calculate active bonuses for each set
  for (const [setId, count] of setCounts) {
    const set = getSetById(setId);
    if (!set) continue;

    const activeBonuses = set.bonuses.filter(b => count >= b.piecesRequired);

    if (activeBonuses.length > 0) {
      activeSets.push({ set, pieceCount: count, activeBonuses });

      // Add bonus stats
      for (const bonus of activeBonuses) {
        for (const [stat, value] of Object.entries(bonus.bonusStats)) {
          if (value) {
            const key = stat as keyof ItemStats;
            totalBonusStats[key] = (totalBonusStats[key] ?? 0) + value;
          }
        }
      }
    }
  }

  return { activeSets, totalBonusStats };
}

/**
 * Check if a player has a specific set effect active based on their equipment
 * Returns true if the effect is active, false otherwise
 */
export function hasSetEffect(
  equipment: Record<EquipSlot, Item | null>,
  effectName: 'arcane_barrier' | 'critical_mass' | 'bloodthirst' | 'vengeance' | 'thorns'
): boolean {
  const { activeSets } = calculateSetBonuses(equipment);

  for (const { activeBonuses } of activeSets) {
    for (const bonus of activeBonuses) {
      if (bonus.specialEffect === effectName) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get all active special effects for a player's equipment
 */
export function getActiveSetEffects(
  equipment: Record<EquipSlot, Item | null>
): Array<'arcane_barrier' | 'critical_mass' | 'bloodthirst' | 'vengeance' | 'thorns'> {
  const { activeSets } = calculateSetBonuses(equipment);
  const effects: Array<'arcane_barrier' | 'critical_mass' | 'bloodthirst' | 'vengeance' | 'thorns'> = [];

  for (const { activeBonuses } of activeSets) {
    for (const bonus of activeBonuses) {
      if (bonus.specialEffect && !effects.includes(bonus.specialEffect)) {
        effects.push(bonus.specialEffect);
      }
    }
  }

  return effects;
}
