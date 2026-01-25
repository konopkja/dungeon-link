import { Player, Stats } from '@dungeon-link/shared';

/**
 * Calculate XP required for a given level
 * Formula: 100 * level^1.5
 */
export function getXPForLevel(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.5));
}

/**
 * Calculate XP reward for killing an enemy
 */
export function getEnemyXP(floor: number, isBoss: boolean, isRare: boolean): number {
  const baseXP = 10 + floor * 5;

  if (isBoss) {
    return baseXP * 10; // Bosses give 10x XP
  }
  if (isRare) {
    return baseXP * 3; // Rare mobs give 3x XP
  }
  return baseXP;
}

/**
 * Stat bonus per level
 */
const LEVEL_STAT_BONUSES: Partial<Stats> = {
  maxHealth: 10,
  health: 10,
  maxMana: 5,
  mana: 5,
  attackPower: 2,
  spellPower: 2,
  armor: 1,
  resist: 1
};

/**
 * Award XP to a player and handle level ups
 * Returns true if player leveled up
 */
export function awardXP(player: Player, amount: number): { leveledUp: boolean; levelsGained: number } {
  player.xp += amount;

  let levelsGained = 0;

  // Check for level ups
  while (player.xp >= player.xpToNextLevel) {
    player.xp -= player.xpToNextLevel;
    player.level++;
    levelsGained++;

    // Apply stat bonuses
    applyLevelUpStats(player);

    // Calculate XP for next level
    player.xpToNextLevel = getXPForLevel(player.level + 1);
  }

  return { leveledUp: levelsGained > 0, levelsGained };
}

/**
 * Apply stat bonuses when leveling up
 */
function applyLevelUpStats(player: Player): void {
  // Increase base stats
  player.baseStats.maxHealth += LEVEL_STAT_BONUSES.maxHealth ?? 0;
  player.baseStats.maxMana += LEVEL_STAT_BONUSES.maxMana ?? 0;
  player.baseStats.attackPower += LEVEL_STAT_BONUSES.attackPower ?? 0;
  player.baseStats.spellPower += LEVEL_STAT_BONUSES.spellPower ?? 0;
  player.baseStats.armor += LEVEL_STAT_BONUSES.armor ?? 0;
  player.baseStats.resist += LEVEL_STAT_BONUSES.resist ?? 0;

  // Also increase current stats (and heal to full on level up)
  player.stats.maxHealth += LEVEL_STAT_BONUSES.maxHealth ?? 0;
  player.stats.health = player.stats.maxHealth; // Full heal on level up
  player.stats.maxMana += LEVEL_STAT_BONUSES.maxMana ?? 0;
  player.stats.mana = player.stats.maxMana; // Full mana on level up
  player.stats.attackPower += LEVEL_STAT_BONUSES.attackPower ?? 0;
  player.stats.spellPower += LEVEL_STAT_BONUSES.spellPower ?? 0;
  player.stats.armor += LEVEL_STAT_BONUSES.armor ?? 0;
  player.stats.resist += LEVEL_STAT_BONUSES.resist ?? 0;
}

/**
 * Initialize player level stats
 */
export function initializePlayerLevel(player: Player): void {
  player.level = 1;
  player.xp = 0;
  player.xpToNextLevel = getXPForLevel(2); // XP needed for level 2
}
