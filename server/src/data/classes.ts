// Re-export from shared package for backwards compatibility
// The data is now in @dungeon-link/shared/classes.ts
export {
  CLASSES,
  getClassById,
  getAbilityById,
  getBaselineAbilities,
  getLearnableAbilities,
  calculateAbilityDamage,
  calculateAbilityHeal
} from '@dungeon-link/shared';
