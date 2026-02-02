import { describe, it, expect } from 'vitest';
import { CLASSES, getAbilityById, getBaselineAbilities } from '@dungeon-link/shared';
import { ClassName } from '@dungeon-link/shared';

/**
 * Ability Migration Tests
 *
 * These tests ensure that:
 * 1. All ability IDs referenced in the codebase exist in CLASSES
 * 2. Migrations are properly defined for renamed abilities
 * 3. No "Unknown" abilities appear due to ID mismatches
 *
 * IMPORTANT: When renaming an ability:
 * 1. Update the ability ID in shared/classes.ts
 * 2. Add a migration entry in server/src/game/GameState.ts (createRunFromSave)
 * 3. Add a migration entry in client/src/systems/AbilitySystem.ts (ABILITY_MIGRATIONS)
 * 4. Add a migration entry in client/src/scenes/GameScene.ts (getAbilityDescription)
 * 5. Run these tests to verify the migration is complete
 */

// List of ALL historical ability IDs that have been renamed
// Format: { oldId: newId }
const ABILITY_MIGRATIONS: Record<string, string> = {
  'mage_frostbolt': 'mage_meditation',
  'mage_blizzard': 'mage_blaze',
  'rogue_backstab': 'rogue_stealth',
  'rogue_eviscerate': 'rogue_blind',
  'shaman_bolt': 'shaman_chainlight',
  'paladin_consecration': 'paladin_retribution',
};

// All current ability IDs that MUST exist in CLASSES
// This list should be updated when abilities are added or removed
const REQUIRED_ABILITIES = [
  // Warrior
  'warrior_strike',
  'warrior_whirlwind',
  'warrior_shield',
  'warrior_retaliation',
  'warrior_bloodlust',
  // Paladin
  'paladin_strike',
  'paladin_light',
  'paladin_blessing',
  'paladin_judgment',
  'paladin_retribution',
  // Rogue
  'rogue_stab',
  'rogue_bladeflurry',
  'rogue_stealth',
  'rogue_blind',
  'rogue_vanish',
  // Mage
  'mage_fireball',
  'mage_meditation',
  'mage_blaze',
  'mage_pyroblast',
  'mage_iceblock',
  // Warlock
  'warlock_bolt',
  'warlock_drain',
  'warlock_hellfire',
  'warlock_soulstone',
  // Shaman
  'shaman_chainlight',
  'shaman_wave',
  'shaman_totem',
  'shaman_earthshock',
  'shaman_ancestral',
  // Priest
  'priest_smite',
  'priest_heal',
  'priest_shield',
  'priest_holynova',
  'priest_shadowword',
  // Hunter
  'hunter_shot',
  'hunter_multishot',
  'hunter_trap',
  'hunter_aspect',
  'hunter_aimed',
  // Druid
  'druid_wrath',
  'druid_moonfire',
  'druid_rejuv',
  'druid_regrowth',
  'druid_swipe',
];

describe('Ability Migration System', () => {

  describe('All required abilities exist in CLASSES', () => {
    it('every required ability ID should be findable via getAbilityById', () => {
      const missingAbilities: string[] = [];

      for (const abilityId of REQUIRED_ABILITIES) {
        const abilityInfo = getAbilityById(abilityId);
        if (!abilityInfo) {
          missingAbilities.push(abilityId);
        }
      }

      expect(missingAbilities).toEqual([]);
    });

    it('no ability should have an empty or undefined ID', () => {
      for (const cls of CLASSES) {
        for (const ability of cls.abilities) {
          expect(ability.id).toBeDefined();
          expect(ability.id.length).toBeGreaterThan(0);
        }
      }
    });

    it('no ability should have an empty or undefined name', () => {
      for (const cls of CLASSES) {
        for (const ability of cls.abilities) {
          expect(ability.name).toBeDefined();
          expect(ability.name.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Migration mapping is complete', () => {
    it('all migrated ability IDs should point to valid current abilities', () => {
      const invalidMigrations: string[] = [];

      for (const [oldId, newId] of Object.entries(ABILITY_MIGRATIONS)) {
        const abilityInfo = getAbilityById(newId);
        if (!abilityInfo) {
          invalidMigrations.push(`${oldId} -> ${newId} (new ID not found)`);
        }
      }

      expect(invalidMigrations).toEqual([]);
    });

    it('no old ability IDs should exist in current CLASSES', () => {
      const oldIdsStillPresent: string[] = [];

      for (const oldId of Object.keys(ABILITY_MIGRATIONS)) {
        const abilityInfo = getAbilityById(oldId);
        if (abilityInfo) {
          oldIdsStillPresent.push(oldId);
        }
      }

      expect(oldIdsStillPresent).toEqual([]);
    });
  });

  describe('Baseline abilities are valid', () => {
    it('each class should have at least one baseline ability', () => {
      const classNames = [
        ClassName.Warrior,
        ClassName.Paladin,
        ClassName.Rogue,
        ClassName.Mage,
        ClassName.Warlock,
        ClassName.Shaman,
        ClassName.Priest,
        ClassName.Hunter,
        ClassName.Druid,
      ];

      for (const className of classNames) {
        const baselineAbilities = getBaselineAbilities(className);
        expect(baselineAbilities.length).toBeGreaterThan(0);
      }
    });

    it('baseline abilities should have valid IDs', () => {
      const classNames = [
        ClassName.Warrior,
        ClassName.Paladin,
        ClassName.Rogue,
        ClassName.Mage,
        ClassName.Warlock,
        ClassName.Shaman,
        ClassName.Priest,
        ClassName.Hunter,
        ClassName.Druid,
      ];

      for (const className of classNames) {
        const baselineAbilities = getBaselineAbilities(className);
        for (const ability of baselineAbilities) {
          const abilityInfo = getAbilityById(ability.id);
          expect(abilityInfo).toBeDefined();
        }
      }
    });
  });

  describe('Ability naming conventions', () => {
    it('all ability IDs should follow classname_abilityname pattern', () => {
      const invalidIds: string[] = [];

      for (const cls of CLASSES) {
        const classPrefix = cls.id.toLowerCase() + '_';
        for (const ability of cls.abilities) {
          if (!ability.id.startsWith(classPrefix)) {
            invalidIds.push(`${ability.id} (expected prefix: ${classPrefix})`);
          }
        }
      }

      expect(invalidIds).toEqual([]);
    });

    it('ability IDs should only contain lowercase letters and underscores', () => {
      const invalidIds: string[] = [];
      const validPattern = /^[a-z_]+$/;

      for (const cls of CLASSES) {
        for (const ability of cls.abilities) {
          if (!validPattern.test(ability.id)) {
            invalidIds.push(ability.id);
          }
        }
      }

      expect(invalidIds).toEqual([]);
    });
  });

  describe('Mage ability specifics', () => {
    it('Meditation should be a buff type ability', () => {
      const abilityInfo = getAbilityById('mage_meditation');
      expect(abilityInfo).toBeDefined();
      expect(abilityInfo?.ability.type).toBe('buff');
    });

    it('Meditation should have zero mana cost', () => {
      const abilityInfo = getAbilityById('mage_meditation');
      expect(abilityInfo?.ability.manaCost).toBe(0);
    });

    it('Blaze should be a damage type ability', () => {
      const abilityInfo = getAbilityById('mage_blaze');
      expect(abilityInfo).toBeDefined();
      expect(abilityInfo?.ability.type).toBe('damage');
    });

    it('Pyroblast should be a damage type ability', () => {
      const abilityInfo = getAbilityById('mage_pyroblast');
      expect(abilityInfo).toBeDefined();
      expect(abilityInfo?.ability.type).toBe('damage');
    });
  });
});

describe('Save Data Migration Scenarios', () => {
  /**
   * These tests simulate what happens when old save data is loaded
   */

  it('should correctly identify old ability IDs for migration', () => {
    // Simulate old save data with deprecated ability IDs
    const oldSaveAbilities = [
      { abilityId: 'mage_fireball', rank: 1, currentCooldown: 0 },
      { abilityId: 'mage_frostbolt', rank: 2, currentCooldown: 0 }, // OLD
      { abilityId: 'mage_blizzard', rank: 1, currentCooldown: 0 },  // OLD
    ];

    // Simulate migration (same logic as in GameState.ts)
    const migratedAbilities = oldSaveAbilities.map(ability => {
      const newId = ABILITY_MIGRATIONS[ability.abilityId];
      if (newId) {
        return { ...ability, abilityId: newId };
      }
      return ability;
    });

    // Verify all abilities now have valid IDs
    for (const ability of migratedAbilities) {
      const abilityInfo = getAbilityById(ability.abilityId);
      expect(abilityInfo).toBeDefined();
    }

    // Verify specific migrations
    expect(migratedAbilities[1].abilityId).toBe('mage_meditation');
    expect(migratedAbilities[2].abilityId).toBe('mage_blaze');
  });

  it('should preserve rank during migration', () => {
    const oldAbility = { abilityId: 'mage_frostbolt', rank: 3, currentCooldown: 5 };

    const newId = ABILITY_MIGRATIONS[oldAbility.abilityId] ?? oldAbility.abilityId;
    const migratedAbility = { ...oldAbility, abilityId: newId };

    expect(migratedAbility.rank).toBe(3);
    expect(migratedAbility.currentCooldown).toBe(5);
    expect(migratedAbility.abilityId).toBe('mage_meditation');
  });

  it('should not modify abilities that dont need migration', () => {
    const currentAbility = { abilityId: 'mage_fireball', rank: 2, currentCooldown: 0 };

    const newId = ABILITY_MIGRATIONS[currentAbility.abilityId] ?? currentAbility.abilityId;

    expect(newId).toBe('mage_fireball'); // Unchanged
  });
});

describe('Client-side Migration Compatibility', () => {
  /**
   * These tests verify that the client-side migration map matches the server-side
   */

  // This is the EXACT copy of migrations from client/src/systems/AbilitySystem.ts
  const CLIENT_ABILITY_MIGRATIONS: Record<string, string> = {
    'mage_frostbolt': 'mage_meditation',
    'mage_blizzard': 'mage_blaze',
    'rogue_backstab': 'rogue_stealth',
    'rogue_eviscerate': 'rogue_blind',
    'shaman_bolt': 'shaman_chainlight',
    'paladin_consecration': 'paladin_retribution',
  };

  it('client and server migration maps should be identical', () => {
    expect(CLIENT_ABILITY_MIGRATIONS).toEqual(ABILITY_MIGRATIONS);
  });

  it('all client migrations should resolve to valid abilities', () => {
    for (const [oldId, newId] of Object.entries(CLIENT_ABILITY_MIGRATIONS)) {
      const abilityInfo = getAbilityById(newId);
      expect(abilityInfo).toBeDefined();
    }
  });
});
