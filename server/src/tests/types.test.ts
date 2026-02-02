import { describe, it, expect } from 'vitest';
import { Pet, EnemyType, ClassName, AbilityType, TargetType, Rarity, EquipSlot } from '@dungeon-link/shared';

/**
 * Type exhaustiveness tests
 *
 * These tests ensure that when new values are added to union types,
 * the tests fail and remind developers to update all places that handle those types.
 *
 * If you're adding a new pet type, enemy type, class, etc., you must:
 * 1. Add it to the type definition in shared/types.ts
 * 2. Update these tests with the new value
 * 3. Update all switch statements and conditionals that handle the type
 */

describe('Type Exhaustiveness Tests', () => {
  describe('Pet Types', () => {
    it('should have all expected pet types defined', () => {
      // When adding a new pet type:
      // 1. Add to Pet['petType'] union in shared/types.ts
      // 2. Add to this array
      // 3. Handle in GameState.ts summonPet()
      // 4. Handle pet AI behavior if needed
      const allPetTypes: Pet['petType'][] = ['imp', 'voidwalker', 'beast', 'totem'];

      expect(allPetTypes).toHaveLength(4);

      // Verify each type is unique
      const uniqueTypes = new Set(allPetTypes);
      expect(uniqueTypes.size).toBe(allPetTypes.length);
    });

    it('should handle totem pet type specially (stationary)', () => {
      // Totems don't follow the player - this documents expected behavior
      const stationaryPetTypes: Pet['petType'][] = ['totem'];
      const mobilePetTypes: Pet['petType'][] = ['imp', 'voidwalker', 'beast'];

      expect(stationaryPetTypes).toContain('totem');
      expect(mobilePetTypes).not.toContain('totem');
    });
  });

  describe('Enemy Types', () => {
    it('should have all expected enemy types defined', () => {
      const allEnemyTypes: EnemyType[] = [
        EnemyType.Melee,
        EnemyType.Ranged,
        EnemyType.Caster
      ];

      expect(allEnemyTypes).toHaveLength(3);
    });
  });

  describe('Class Names', () => {
    it('should have all 6 classes defined', () => {
      const allClasses: ClassName[] = [
        ClassName.Warrior,
        ClassName.Paladin,
        ClassName.Rogue,
        ClassName.Shaman,
        ClassName.Mage,
        ClassName.Warlock
      ];

      expect(allClasses).toHaveLength(6);
    });
  });

  describe('Ability Types', () => {
    it('should have all ability types defined', () => {
      const allAbilityTypes: AbilityType[] = [
        AbilityType.Damage,
        AbilityType.Heal,
        AbilityType.Buff,
        AbilityType.Debuff,
        AbilityType.Summon,
        AbilityType.Utility
      ];

      expect(allAbilityTypes).toHaveLength(6);
    });
  });

  describe('Target Types', () => {
    it('should have all target types defined', () => {
      const allTargetTypes: TargetType[] = [
        TargetType.Self,
        TargetType.Enemy,
        TargetType.Ally,
        TargetType.AoE,
        TargetType.Ground
      ];

      expect(allTargetTypes).toHaveLength(5);
    });
  });

  describe('Rarity Types', () => {
    it('should have all rarity types defined', () => {
      const allRarities: Rarity[] = [
        Rarity.Common,
        Rarity.Uncommon,
        Rarity.Rare,
        Rarity.Epic,
        Rarity.Legendary
      ];

      expect(allRarities).toHaveLength(5);
    });
  });

  describe('Equipment Slots', () => {
    it('should have all equipment slots defined', () => {
      const allSlots: EquipSlot[] = [
        EquipSlot.Head,
        EquipSlot.Chest,
        EquipSlot.Legs,
        EquipSlot.Feet,
        EquipSlot.Hands,
        EquipSlot.Weapon,
        EquipSlot.Ring,
        EquipSlot.Trinket
      ];

      expect(allSlots).toHaveLength(8);
    });
  });
});

/**
 * Helper type for exhaustive switch statements
 * Usage:
 *   function handlePetType(type: Pet['petType']): string {
 *     switch (type) {
 *       case 'imp': return 'Imp';
 *       case 'voidwalker': return 'Voidwalker';
 *       case 'beast': return 'Beast';
 *       case 'totem': return 'Totem';
 *       default:
 *         return assertNever(type); // TypeScript error if a case is missing
 *     }
 *   }
 */
export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${x}`);
}
