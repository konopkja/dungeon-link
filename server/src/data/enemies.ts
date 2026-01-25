import { EnemyDefinition, EnemyType } from '@dungeon-link/shared';

export const ENEMIES: EnemyDefinition[] = [
  // ============================================
  // MELEE ENEMIES
  // ============================================
  {
    id: 'skeleton_warrior',
    name: 'Skeleton Warrior',
    type: EnemyType.Melee,
    baseHealth: 60,
    baseDamage: 8,
    attackRange: 50,
    moveSpeed: 100
  },
  {
    id: 'orc_grunt',
    name: 'Orc Grunt',
    type: EnemyType.Melee,
    baseHealth: 80,
    baseDamage: 12,
    attackRange: 50,
    moveSpeed: 90
  },
  {
    id: 'undead_ghoul',
    name: 'Undead Ghoul',
    type: EnemyType.Melee,
    baseHealth: 50,
    baseDamage: 10,
    attackRange: 50,
    moveSpeed: 120
  },
  {
    id: 'stone_golem',
    name: 'Stone Golem',
    type: EnemyType.Melee,
    baseHealth: 120,
    baseDamage: 15,
    attackRange: 60,
    moveSpeed: 60
  },

  // ============================================
  // RANGED ENEMIES (Spectral/Wraith types - magic attacks)
  // ============================================
  {
    id: 'lost_soul',
    name: 'Lost Soul',
    type: EnemyType.Ranged,
    baseHealth: 40,
    baseDamage: 10,
    attackRange: 250,
    moveSpeed: 80
  },
  {
    id: 'wraith',
    name: 'Wraith',
    type: EnemyType.Ranged,
    baseHealth: 55,
    baseDamage: 14,
    attackRange: 280,
    moveSpeed: 85
  },
  {
    id: 'phantom',
    name: 'Phantom',
    type: EnemyType.Ranged,
    baseHealth: 45,
    baseDamage: 12,
    attackRange: 300,
    moveSpeed: 100
  },

  // ============================================
  // CASTER ENEMIES (Dark Cultists)
  // ============================================
  {
    id: 'dark_acolyte',
    name: 'Dark Acolyte',
    type: EnemyType.Caster,
    baseHealth: 35,
    baseDamage: 15,
    attackRange: 280,
    moveSpeed: 70
  },
  {
    id: 'shadow_cultist',
    name: 'Shadow Cultist',
    type: EnemyType.Caster,
    baseHealth: 50,
    baseDamage: 18,
    attackRange: 260,
    moveSpeed: 75
  },
  {
    id: 'void_priest',
    name: 'Void Priest',
    type: EnemyType.Caster,
    baseHealth: 45,
    baseDamage: 20,
    attackRange: 300,
    moveSpeed: 65
  },
  {
    id: 'death_cultist',
    name: 'Death Cultist',
    type: EnemyType.Caster,
    baseHealth: 60,
    baseDamage: 22,
    attackRange: 250,
    moveSpeed: 90
  }
];

// Enemies grouped by floor difficulty
export const ENEMY_POOLS: Record<string, string[]> = {
  'early': ['skeleton_warrior', 'lost_soul', 'dark_acolyte'],
  'mid': ['orc_grunt', 'wraith', 'shadow_cultist', 'undead_ghoul'],
  'late': ['stone_golem', 'phantom', 'void_priest', 'death_cultist']
};

export function getEnemyById(id: string): EnemyDefinition | undefined {
  return ENEMIES.find(e => e.id === id);
}

export function getEnemiesForFloor(floor: number): EnemyDefinition[] {
  const poolIds: string[] = [];

  // Floor 1-3: early enemies
  if (floor <= 3) {
    poolIds.push(...ENEMY_POOLS.early);
  }
  // Floor 2-6: mid enemies
  if (floor >= 2 && floor <= 6) {
    poolIds.push(...ENEMY_POOLS.mid);
  }
  // Floor 4+: late enemies
  if (floor >= 4) {
    poolIds.push(...ENEMY_POOLS.late);
  }

  return poolIds
    .map(id => getEnemyById(id))
    .filter((e): e is EnemyDefinition => e !== undefined);
}

// Rare mob variants - same enemies but with boosted stats and special names
export const RARE_PREFIXES = [
  'Ancient', 'Corrupted', 'Enraged', 'Cursed', 'Shadowy', 'Infernal', 'Spectral', 'Elite'
];

export function createRareVariant(enemy: EnemyDefinition, floor: number): EnemyDefinition {
  const prefix = RARE_PREFIXES[floor % RARE_PREFIXES.length];
  return {
    ...enemy,
    id: `rare_${enemy.id}`,
    name: `${prefix} ${enemy.name}`,
    baseHealth: enemy.baseHealth * 2.5,
    baseDamage: enemy.baseDamage * 1.5
  };
}
