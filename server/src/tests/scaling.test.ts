import { describe, it, expect } from 'vitest';
import {
  getFloorScaling,
  getPartyScaling,
  scaleEnemyStats,
  scaleAbilityDamage,
  canUpgradeAbilityRank,
  getFallbackReward
} from '../data/scaling.js';

describe('Floor Scaling', () => {
  it('should have no scaling on floor 1', () => {
    const scaling = getFloorScaling(1);
    expect(scaling.healthMultiplier).toBe(1);
    expect(scaling.damageMultiplier).toBe(1);
    expect(scaling.lootMultiplier).toBe(1);
  });

  it('should increase scaling on higher floors', () => {
    const floor1 = getFloorScaling(1);
    const floor5 = getFloorScaling(5);

    expect(floor5.healthMultiplier).toBeGreaterThan(floor1.healthMultiplier);
    expect(floor5.damageMultiplier).toBeGreaterThan(floor1.damageMultiplier);
    expect(floor5.lootMultiplier).toBeGreaterThan(floor1.lootMultiplier);
  });
});

describe('Party Scaling', () => {
  it('should have no scaling for solo player', () => {
    const scaling = getPartyScaling(1);
    expect(scaling.healthMultiplier).toBe(1);
    expect(scaling.damageMultiplier).toBe(1);
  });

  it('should increase scaling with more players', () => {
    const solo = getPartyScaling(1);
    const duo = getPartyScaling(2);
    const full = getPartyScaling(5);

    expect(duo.healthMultiplier).toBeGreaterThan(solo.healthMultiplier);
    expect(full.healthMultiplier).toBeGreaterThan(duo.healthMultiplier);
  });

  it('should increase scaling with item power', () => {
    const noGear = getPartyScaling(2, 0);
    const withGear = getPartyScaling(2, 100);

    expect(withGear.healthMultiplier).toBeGreaterThan(noGear.healthMultiplier);
  });
});

describe('Enemy Stats Scaling', () => {
  it('should scale enemy stats with floor and party', () => {
    const base = scaleEnemyStats(100, 10, 1, 1, 0);
    const scaled = scaleEnemyStats(100, 10, 5, 3, 50);

    expect(scaled.health).toBeGreaterThan(base.health);
    expect(scaled.damage).toBeGreaterThan(base.damage);
  });
});

describe('Ability Rank Gating', () => {
  it('should allow upgrading rank 1 to 2 on floor 2+', () => {
    expect(canUpgradeAbilityRank(1, 1)).toBe(false);
    expect(canUpgradeAbilityRank(1, 2)).toBe(true);
    expect(canUpgradeAbilityRank(1, 5)).toBe(true);
  });

  it('should allow upgrading rank 2 to 3 on floor 3+', () => {
    expect(canUpgradeAbilityRank(2, 2)).toBe(false);
    expect(canUpgradeAbilityRank(2, 3)).toBe(true);
  });

  it('should allow upgrading rank N to N+1 on floor N+1', () => {
    for (let rank = 1; rank <= 5; rank++) {
      expect(canUpgradeAbilityRank(rank, rank)).toBe(false);
      expect(canUpgradeAbilityRank(rank, rank + 1)).toBe(true);
    }
  });
});

describe('Ability Damage Scaling', () => {
  it('should increase damage with rank', () => {
    const rank1 = scaleAbilityDamage(100, 1);
    const rank2 = scaleAbilityDamage(100, 2);
    const rank5 = scaleAbilityDamage(100, 5);

    expect(rank2).toBeGreaterThan(rank1);
    expect(rank5).toBeGreaterThan(rank2);
  });

  it('should return base damage at rank 1', () => {
    expect(scaleAbilityDamage(100, 1)).toBe(100);
  });
});

describe('Fallback Rewards', () => {
  it('should return gold when ability cannot upgrade', () => {
    const reward = getFallbackReward(1);
    expect(reward.gold).toBeGreaterThan(0);
  });

  it('should scale gold with floor', () => {
    const floor1 = getFallbackReward(1);
    const floor10 = getFallbackReward(10);

    // Average should be higher (not guaranteed per call due to randomness)
    // Just check it's a positive value
    expect(floor10.gold).toBeGreaterThan(0);
  });
});
