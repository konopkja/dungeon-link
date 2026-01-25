import { GAME_CONFIG } from '@dungeon-link/shared';

export interface FloorScaling {
  healthMultiplier: number;
  damageMultiplier: number;
  lootMultiplier: number;
}

export interface PartyScaling {
  healthMultiplier: number;
  damageMultiplier: number;
}

/**
 * Calculate scaling factors for a given floor
 */
export function getFloorScaling(floor: number): FloorScaling {
  const floorIndex = floor - 1; // Floor 1 = no scaling

  return {
    healthMultiplier: Math.pow(GAME_CONFIG.FLOOR_HEALTH_SCALE, floorIndex),
    damageMultiplier: Math.pow(GAME_CONFIG.FLOOR_DAMAGE_SCALE, floorIndex),
    lootMultiplier: Math.pow(GAME_CONFIG.FLOOR_LOOT_SCALE, floorIndex)
  };
}

/**
 * Calculate scaling factors for party size
 */
export function getPartyScaling(playerCount: number, averageItemPower: number = 0): PartyScaling {
  const extraPlayers = Math.max(0, playerCount - 1);

  // Base scaling from player count
  let healthMult = 1 + extraPlayers * GAME_CONFIG.PARTY_HEALTH_SCALE_PER_PLAYER;
  let damageMult = 1 + extraPlayers * GAME_CONFIG.PARTY_DAMAGE_SCALE_PER_PLAYER;

  // Additional scaling based on average item power (to prevent trivializing content)
  // Item power is sum of all equipped item stats, normalized
  if (averageItemPower > 0) {
    const powerBonus = Math.min(averageItemPower / 100, 0.5); // Max 50% bonus
    healthMult += powerBonus * 0.5;
    damageMult += powerBonus * 0.25;
  }

  return {
    healthMultiplier: healthMult,
    damageMultiplier: damageMult
  };
}

/**
 * Calculate enemy stats with all scaling applied
 */
export function scaleEnemyStats(
  baseHealth: number,
  baseDamage: number,
  floor: number,
  partySize: number,
  averageItemPower: number = 0
): { health: number; damage: number } {
  const floorScale = getFloorScaling(floor);
  const partyScale = getPartyScaling(partySize, averageItemPower);

  return {
    health: Math.round(baseHealth * floorScale.healthMultiplier * partyScale.healthMultiplier),
    damage: Math.round(baseDamage * floorScale.damageMultiplier * partyScale.damageMultiplier)
  };
}

/**
 * Calculate ability damage with rank scaling
 */
export function scaleAbilityDamage(baseDamage: number, rank: number): number {
  const rankBonus = 1 + (rank - 1) * GAME_CONFIG.RANK_DAMAGE_INCREASE;
  return Math.round(baseDamage * rankBonus);
}

/**
 * Check if an ability can be upgraded at the current floor
 */
export function canUpgradeAbilityRank(currentRank: number, floor: number): boolean {
  // To upgrade from rank N to N+1, you need floor N+1 or higher
  const requiredFloor = currentRank + 1;
  return floor >= requiredFloor;
}

/**
 * Calculate gold/token rewards for fallback when ability can't upgrade
 */
export function getFallbackReward(floor: number): { gold: number; tokens: number } {
  const baseGold = GAME_CONFIG.FALLBACK_GOLD_MIN +
    Math.floor((GAME_CONFIG.FALLBACK_GOLD_MAX - GAME_CONFIG.FALLBACK_GOLD_MIN) * Math.random());

  // Scale gold with floor
  const scaledGold = Math.round(baseGold * Math.pow(1.1, floor - 1));

  // Chance for reroll token
  const tokens = Math.random() < GAME_CONFIG.FALLBACK_TOKEN_CHANCE ? 1 : 0;

  return { gold: scaledGold, tokens };
}
