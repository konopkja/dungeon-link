import { BossDefinition, EquipSlot, Rarity } from '@dungeon-link/shared';

/**
 * ABYSSAL DESCENT - BOSS LORE
 *
 * The Endless Crypts were once a sanctuary built by the ancient Valorian Order,
 * a group of mages who sought to seal away the world's greatest evils. But centuries
 * of dark energy corrupted the seals, and now the crypts descend infinitely downward,
 * each floor housing more terrible horrors than the last.
 *
 * Heroes enter seeking glory and legendary artifacts, but few return from the depths...
 */

export const BOSSES: BossDefinition[] = [
  // ============================================
  // FLOOR BAND 1-2: The Fallen Guardians
  // Once protectors of the crypt entrance, now corrupted husks
  // ============================================
  {
    id: 'boss_skeleton_king',
    name: 'Lord Ossian the Betrayer',
    floorBand: [1, 2],
    baseHealth: 300,
    baseDamage: 15,
    abilities: ['summon_skeletons', 'bone_storm'],
    mechanics: [
      {
        id: 'summon_skeletons',
        name: 'Call of the Fallen',
        description: 'Summons his former knights at 50% health',
        triggerHealthPercent: 50
      }
    ],
    lootTable: [
      { type: 'item', dropChance: 0.5, itemSlot: EquipSlot.Weapon, rarityWeights: { [Rarity.Uncommon]: 0.7, [Rarity.Rare]: 0.3 } },
      { type: 'item', dropChance: 0.4, rarityWeights: { [Rarity.Common]: 0.5, [Rarity.Uncommon]: 0.5 } },
      { type: 'ability', dropChance: 0.40 }
    ]
    // Lore: The first commander of the Valorian Guard, Lord Ossian made a pact with
    // darkness to save his dying soldiers. Now he leads them eternally in undeath.
  },
  {
    id: 'boss_giant_spider',
    name: 'Silkweaver the Broodmother',
    floorBand: [1, 2],
    baseHealth: 250,
    baseDamage: 12,
    abilities: ['poison_spray', 'web_trap'],
    mechanics: [
      {
        id: 'poison_phase',
        name: 'Venomous Eruption',
        description: 'Releases toxic cloud every 15 seconds',
        intervalSeconds: 15
      }
    ],
    lootTable: [
      { type: 'item', dropChance: 0.5, itemSlot: EquipSlot.Ring, rarityWeights: { [Rarity.Uncommon]: 0.6, [Rarity.Rare]: 0.4 } },
      { type: 'item', dropChance: 0.4, rarityWeights: { [Rarity.Common]: 0.4, [Rarity.Uncommon]: 0.6 } },
      { type: 'ability', dropChance: 0.40 }
    ]
    // Lore: The Valorians kept giant spiders to guard the lower passages. Silkweaver
    // consumed her handlers and has grown immense on centuries of trapped adventurers.
  },

  // ============================================
  // FLOOR BAND 3-4: The Corrupted Depths
  // Where the dark magic began to twist all living things
  // ============================================
  {
    id: 'boss_orc_warlord',
    name: 'Kragoth the Ironbreaker',
    floorBand: [3, 4],
    baseHealth: 500,
    baseDamage: 22,
    abilities: ['cleave', 'war_cry', 'enrage'],
    mechanics: [
      {
        id: 'enrage',
        name: 'Berserker Fury',
        description: 'Enters blood rage at 30% health, dealing 50% more damage',
        triggerHealthPercent: 30
      },
      {
        id: 'war_cry',
        name: 'Thundering Roar',
        description: 'Stuns all nearby foes every 20 seconds',
        intervalSeconds: 20
      }
    ],
    lootTable: [
      { type: 'item', dropChance: 0.6, itemSlot: EquipSlot.Chest, rarityWeights: { [Rarity.Uncommon]: 0.4, [Rarity.Rare]: 0.5, [Rarity.Epic]: 0.1 } },
      { type: 'item', dropChance: 0.5, rarityWeights: { [Rarity.Uncommon]: 0.5, [Rarity.Rare]: 0.5 } },
      { type: 'ability', dropChance: 0.45 }
    ]
    // Lore: A legendary warlord who sought the crypts' power to conquer the surface.
    // The darkness granted his wish—eternal strength, but eternal imprisonment.
  },
  {
    id: 'boss_lich',
    name: 'Velindra the Deathweaver',
    floorBand: [3, 4],
    baseHealth: 400,
    baseDamage: 28,
    abilities: ['frost_bolt', 'death_coil', 'summon_undead'],
    mechanics: [
      {
        id: 'frost_tomb',
        name: 'Soul Freeze',
        description: 'Encases a victim in crystallized despair every 25 seconds',
        intervalSeconds: 25
      },
      {
        id: 'death_phase',
        name: 'Legion of Sorrow',
        description: 'Raises all who died in her domain at 25% health',
        triggerHealthPercent: 25
      }
    ],
    lootTable: [
      { type: 'item', dropChance: 0.6, itemSlot: EquipSlot.Head, rarityWeights: { [Rarity.Rare]: 0.6, [Rarity.Epic]: 0.4 } },
      { type: 'item', dropChance: 0.5, rarityWeights: { [Rarity.Uncommon]: 0.3, [Rarity.Rare]: 0.7 } },
      { type: 'ability', dropChance: 0.45 }
    ]
    // Lore: Once the Valorian Order's greatest healer, Velindra sought to cure death itself.
    // Her experiments succeeded—but the cure was worse than the disease.
  },

  // ============================================
  // FLOOR BAND 5-6: The Ancient Horrors
  // Beings that existed before the crypts were built
  // ============================================
  {
    id: 'boss_dragon',
    name: 'Emberclaw the Eternal Flame',
    floorBand: [5, 6],
    baseHealth: 800,
    baseDamage: 35,
    abilities: ['fire_breath', 'tail_swipe', 'flight'],
    mechanics: [
      {
        id: 'fire_breath',
        name: 'Inferno Torrent',
        description: 'Unleashes devastating fire breath every 12 seconds',
        intervalSeconds: 12
      },
      {
        id: 'flight_phase',
        name: 'Rain of Cinders',
        description: 'Takes flight and carpets the arena in flames at 50% health',
        triggerHealthPercent: 50
      }
    ],
    lootTable: [
      { type: 'item', dropChance: 0.7, itemSlot: EquipSlot.Weapon, rarityWeights: { [Rarity.Rare]: 0.4, [Rarity.Epic]: 0.5, [Rarity.Legendary]: 0.1 } },
      { type: 'item', dropChance: 0.6, rarityWeights: { [Rarity.Rare]: 0.5, [Rarity.Epic]: 0.5 } },
      { type: 'ability', dropChance: 0.50 },
      { type: 'cosmetic', dropChance: 0.05 }
    ]
    // Lore: The Valorians didn't build around Emberclaw—they built to contain him.
    // An ancient wyrm whose flames have burned since before recorded history.
  },
  {
    id: 'boss_void_lord',
    name: 'Nethris the Hollow',
    floorBand: [5, 6],
    baseHealth: 700,
    baseDamage: 40,
    abilities: ['void_bolt', 'shadow_nova', 'mind_control'],
    mechanics: [
      {
        id: 'gravity_well',
        name: 'Gravitational Collapse',
        description: 'Creates a gravity well that pulls players in - stay at the edges!',
        intervalSeconds: 15
      },
      {
        id: 'void_zones',
        name: 'Tears in Reality',
        description: 'Opens rifts to the void every 12 seconds',
        intervalSeconds: 12
      }
    ],
    lootTable: [
      { type: 'item', dropChance: 0.7, itemSlot: EquipSlot.Trinket, rarityWeights: { [Rarity.Epic]: 0.7, [Rarity.Legendary]: 0.3 } },
      { type: 'item', dropChance: 0.6, rarityWeights: { [Rarity.Rare]: 0.4, [Rarity.Epic]: 0.6 } },
      { type: 'ability', dropChance: 0.50 },
      { type: 'cosmetic', dropChance: 0.08 }
    ]
    // Lore: Nethris is not truly here—she exists between dimensions, reaching through
    // the weakened barriers of reality. Her true form would shatter mortal minds.
  },

  // ============================================
  // FLOOR BAND 7+: The Primordial Terrors
  // Entities that should never have been disturbed
  // ============================================
  {
    id: 'boss_titan',
    name: 'Gorvax the World-Ender',
    floorBand: [7, 9999],
    baseHealth: 1000,
    baseDamage: 50,
    abilities: ['titan_slam', 'meteor', 'divine_shield'],
    mechanics: [
      {
        id: 'meteor',
        name: 'Falling Stars',
        description: 'Calls down celestial wrath every 20 seconds',
        intervalSeconds: 20
      },
      {
        id: 'shield_phase',
        name: 'Primordial Barrier',
        description: 'Becomes invulnerable and regenerates at 20% health',
        triggerHealthPercent: 20
      }
    ],
    lootTable: [
      { type: 'item', dropChance: 0.8, rarityWeights: { [Rarity.Epic]: 0.5, [Rarity.Legendary]: 0.5 } },
      { type: 'item', dropChance: 0.7, rarityWeights: { [Rarity.Epic]: 0.6, [Rarity.Legendary]: 0.4 } },
      { type: 'ability', dropChance: 0.55 },
      { type: 'cosmetic', dropChance: 0.10 }
    ]
    // Lore: Before mortals walked the earth, titans shaped continents. Gorvax slumbers
    // in the deepest depths, and each footstep above slowly wakes him from eons of rest.
  },
  {
    id: 'boss_old_god',
    name: 'The Nameless Depth',
    floorBand: [7, 9999],
    baseHealth: 1200,
    baseDamage: 45,
    abilities: ['tentacle_slam', 'insanity', 'eye_beam'],
    mechanics: [
      {
        id: 'tentacles',
        name: 'Embrace of the Deep',
        description: 'Manifests appendages at 60% and 30% health',
        triggerHealthPercent: 60
      },
      {
        id: 'insanity',
        name: 'Echoes of Oblivion',
        description: 'Fractures sanity with whispers from beyond every 25 seconds',
        intervalSeconds: 25
      }
    ],
    lootTable: [
      { type: 'item', dropChance: 0.8, rarityWeights: { [Rarity.Epic]: 0.4, [Rarity.Legendary]: 0.6 } },
      { type: 'item', dropChance: 0.7, rarityWeights: { [Rarity.Epic]: 0.5, [Rarity.Legendary]: 0.5 } },
      { type: 'ability', dropChance: 0.55 },
      { type: 'cosmetic', dropChance: 0.12 }
    ]
    // Lore: No one knows its true name—those who learn it cease to exist. It is not evil;
    // it simply exists in a way incompatible with our reality. To see it is to unbecome.
  }
];

export function getBossById(id: string): BossDefinition | undefined {
  return BOSSES.find(b => b.id === id);
}

export function getBossesForFloor(floor: number): BossDefinition[] {
  return BOSSES.filter(b => floor >= b.floorBand[0] && floor <= b.floorBand[1]);
}

/**
 * Calculate how many abilities a boss should use based on floor
 * Floor 1-2: 0 abilities (auto-attack only)
 * Floor 3-5: 1 ability
 * Floor 6-8: 2 abilities
 * Floor 9-11: 3 abilities
 * Floor 12-14: 4 abilities
 * Floor 15+: 5 abilities (max)
 */
export function getBossAbilityCount(floor: number): number {
  // Bosses always have at least 1 ability
  // Floor 1-2: 1 ability
  // Floor 3-5: 2 abilities
  // Floor 6-8: 3 abilities, etc.
  const abilityCount = Math.floor(floor / 3) + 1;
  return Math.min(abilityCount, 5);
}

/**
 * Get the abilities a boss should use based on floor
 */
export function getBossAbilitiesForFloor(bossId: string, floor: number): string[] {
  const boss = getBossById(bossId);
  if (!boss || !boss.abilities) return [];

  const count = getBossAbilityCount(floor);
  return boss.abilities.slice(0, count);
}
