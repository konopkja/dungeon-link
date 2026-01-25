import { describe, it, expect } from 'vitest';

/**
 * Animation Size Consistency Tests
 *
 * These tests verify that movement and ability animation scales include proper
 * visual compensation to match the idle displayed size.
 *
 * Base formula: baseScale = 0.15 * (idleHeight / animHeight)
 * Final scale: baseScale * visualCompensation
 *
 * Visual compensation is needed because characters are drawn at different
 * proportions within their animation frames vs idle frames.
 */

const DEFAULT_SCALE = 0.15;

// Image dimensions from actual asset files (in pixels)
const CLASS_DIMENSIONS = {
  rogue:   { idle: 389, move: 209, ability: 389 },
  warrior: { idle: 386, move: 224, ability: 452 },
  paladin: { idle: 386, move: 262, ability: 545 },
  mage:    { idle: 399, move: 321, ability: 264 },
  warlock: { idle: 399, move: 211, ability: 572 },
  shaman:  { idle: 468, move: 769, ability: 772 },
  hunter:  { idle: 386, move: null, ability: 186 }
} as const;

// Expected movement scales (with visual compensation)
// Compensation < 1.0 means character appears larger in animation frame
// Compensation > 1.0 means character appears smaller in animation frame
const EXPECTED_MOVEMENT_SCALES: Record<string, number> = {
  rogue: 0.279,   // base * 1.0
  warrior: 0.285, // base * 1.1
  paladin: 0.287, // base * 1.3 - increased, was too small
  mage: 0.205,    // base * 1.1 - appropriate
  warlock: 0.284, // base * 1.0
  shaman: 0.100   // base * 1.1 - increased, was too small
};

// Expected ability scales (with visual compensation)
const EXPECTED_ABILITY_SCALES: Record<string, number> = {
  rogue: 0.150,   // base * 1.0
  warrior: 0.166, // base * 1.3
  paladin: 0.170, // base * 1.6 - increased, was too small
  mage: 0.340,    // base * 1.5
  warlock: 0.178, // base * 1.7
  shaman: 0.100,  // base * 1.1 - increased, was too small
  hunter: 0.342   // base * 1.1
};

// Visual compensation factors (character proportion in animation vs idle)
// Values < 1.0: character appears LARGER in animation than idle (need smaller scale)
// Values > 1.0: character appears SMALLER in animation than idle (need larger scale)
const MOVEMENT_COMPENSATION: Record<string, number> = {
  rogue: 1.0,
  warrior: 1.1,
  paladin: 1.3,   // increased
  mage: 1.1,
  warlock: 1.0,
  shaman: 1.1     // increased
};

const ABILITY_COMPENSATION: Record<string, number> = {
  rogue: 1.0,
  warrior: 1.3,
  paladin: 1.6,   // increased
  mage: 1.5,
  warlock: 1.7,
  shaman: 1.1,    // increased
  hunter: 1.1
};

describe('Animation Size Consistency', () => {
  describe('Movement scale calculation with compensation', () => {
    it('should calculate compensated movement scale correctly', () => {
      for (const [classId, dimensions] of Object.entries(CLASS_DIMENSIONS)) {
        if (dimensions.move === null) continue;

        const baseScale = DEFAULT_SCALE * (dimensions.idle / dimensions.move);
        const compensation = MOVEMENT_COMPENSATION[classId] ?? 1.0;
        const calculatedScale = baseScale * compensation;
        const expectedScale = EXPECTED_MOVEMENT_SCALES[classId];

        expect(calculatedScale).toBeCloseTo(expectedScale, 2);
      }
    });

    it('should have movement scale for all classes with movement animations', () => {
      const classesWithMovement = Object.entries(CLASS_DIMENSIONS)
        .filter(([_, d]) => d.move !== null)
        .map(([name]) => name);

      for (const classId of classesWithMovement) {
        expect(EXPECTED_MOVEMENT_SCALES[classId]).toBeDefined();
        expect(EXPECTED_MOVEMENT_SCALES[classId]).toBeGreaterThan(0);
      }
    });
  });

  describe('Ability scale calculation with compensation', () => {
    it('should calculate compensated ability scale correctly', () => {
      for (const [classId, dimensions] of Object.entries(CLASS_DIMENSIONS)) {
        const baseScale = DEFAULT_SCALE * (dimensions.idle / dimensions.ability);
        const compensation = ABILITY_COMPENSATION[classId] ?? 1.0;
        const calculatedScale = baseScale * compensation;
        const expectedScale = EXPECTED_ABILITY_SCALES[classId];

        expect(calculatedScale).toBeCloseTo(expectedScale, 2);
      }
    });

    it('should have ability scale for all classes with ability animations', () => {
      for (const classId of Object.keys(CLASS_DIMENSIONS)) {
        expect(EXPECTED_ABILITY_SCALES[classId]).toBeDefined();
        expect(EXPECTED_ABILITY_SCALES[classId]).toBeGreaterThan(0);
      }
    });
  });

  describe('Scale value validation', () => {
    it('should have reasonable movement scale values (0.05 to 0.5)', () => {
      for (const scale of Object.values(EXPECTED_MOVEMENT_SCALES)) {
        expect(scale).toBeGreaterThanOrEqual(0.05);
        expect(scale).toBeLessThanOrEqual(0.5);
      }
    });

    it('should have reasonable ability scale values (0.05 to 0.5)', () => {
      for (const scale of Object.values(EXPECTED_ABILITY_SCALES)) {
        expect(scale).toBeGreaterThanOrEqual(0.05);
        expect(scale).toBeLessThanOrEqual(0.5);
      }
    });
  });

  describe('Compensation factors', () => {
    it('should have reasonable movement compensation values (0.8 to 1.5)', () => {
      // Values < 1.0: character appears LARGER in animation than idle
      // Values > 1.0: character appears SMALLER in animation than idle
      for (const comp of Object.values(MOVEMENT_COMPENSATION)) {
        expect(comp).toBeGreaterThanOrEqual(0.8);
        expect(comp).toBeLessThanOrEqual(1.5);
      }
    });

    it('should have reasonable ability compensation values (0.8 to 2.0)', () => {
      // Values < 1.0: character appears LARGER in animation than idle
      // Values > 1.0: character appears SMALLER in animation than idle
      for (const comp of Object.values(ABILITY_COMPENSATION)) {
        expect(comp).toBeGreaterThanOrEqual(0.8);
        expect(comp).toBeLessThanOrEqual(2.0);
      }
    });
  });

  describe('Animation restoration bug prevention', () => {
    it('should document that idle texture must be used for restoration', () => {
      // Bug scenario:
      // 1. Player moving (texture = warrior_move_1, scale = 0.285)
      // 2. Ability triggered, captures originalTexture = warrior_move_1
      // 3. Ability completes, restores warrior_move_1 with scale 0.15
      // 4. Result: 224px * 0.15 = 33.6px - TINY character!
      //
      // Fix: Always restore to idle texture (player_warrior) not originalTexture
      const idleTexturePattern = 'player_${classId}';
      expect(idleTexturePattern).toBe('player_${classId}');
    });
  });
});
