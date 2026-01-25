import { FloorTheme, FloorThemeModifiers } from '@dungeon-link/shared';

/**
 * Floor Theme Rotation:
 * - Floors 1-2: Crypt (tutorial/baseline)
 * - Floor 3, 9, 15...: Inferno (every 6 floors starting at 3)
 * - Floor 4, 10, 16...: Frozen (every 6 floors starting at 4)
 * - Floor 5, 11, 17...: Swamp (every 6 floors starting at 5)
 * - Floor 6, 12, 18...: Treasure Vault (every 6 floors)
 * - Floors 7-8, 13-14...: Crypt (between special floors)
 * - Shadow theme appears as a variant on floors divisible by 6 (alternates with Treasure)
 */

export function getFloorTheme(floor: number): FloorTheme {
  // Floors 1-2 are always Crypt (tutorial)
  if (floor <= 2) {
    return FloorTheme.Crypt;
  }

  // Calculate position in 6-floor cycle (1-indexed)
  const cyclePosition = ((floor - 1) % 6) + 1;

  switch (cyclePosition) {
    case 3: // Floors 3, 9, 15...
      return FloorTheme.Inferno;
    case 4: // Floors 4, 10, 16...
      return FloorTheme.Frozen;
    case 5: // Floors 5, 11, 17...
      return FloorTheme.Swamp;
    case 6: // Floors 6, 12, 18...
      // Alternate between Treasure and Shadow every other cycle
      const cycle = Math.floor((floor - 1) / 6);
      return cycle % 2 === 0 ? FloorTheme.Treasure : FloorTheme.Shadow;
    default: // Floors 1-2, 7-8, 13-14...
      return FloorTheme.Crypt;
  }
}

export function getThemeModifiers(theme: FloorTheme, floor: number): FloorThemeModifiers {
  const baseModifiers: Record<FloorTheme, FloorThemeModifiers> = {
    [FloorTheme.Crypt]: {
      goldMultiplier: 1.0,
      trapMultiplier: 1.0,
    },
    [FloorTheme.Inferno]: {
      goldMultiplier: 1.25, // +25% gold
      trapMultiplier: 1.5,  // More fire traps
      hazardDamage: 5 + floor * 2, // Lava damage scales with floor
    },
    [FloorTheme.Frozen]: {
      goldMultiplier: 1.0,
      trapMultiplier: 0.5,  // Fewer traps
      movementModifier: 1.3, // Ice sliding (30% momentum)
    },
    [FloorTheme.Swamp]: {
      goldMultiplier: 1.0,
      trapMultiplier: 0.75,
      hazardDamage: 3 + floor, // Poison damage
    },
    [FloorTheme.Shadow]: {
      goldMultiplier: 1.5, // +50% gold (high risk)
      trapMultiplier: 1.0,
      visibilityRadius: 150, // Limited visibility
    },
    [FloorTheme.Treasure]: {
      goldMultiplier: 2.0, // Double gold
      trapMultiplier: 3.0, // Triple traps!
    },
  };

  return baseModifiers[theme];
}

// Theme-specific enemy name prefixes
export const THEME_ENEMY_PREFIXES: Record<FloorTheme, string[]> = {
  [FloorTheme.Crypt]: ['Undead', 'Skeletal', 'Cursed'],
  [FloorTheme.Inferno]: ['Burning', 'Molten', 'Infernal'],
  [FloorTheme.Frozen]: ['Frozen', 'Frost', 'Glacial'],
  [FloorTheme.Swamp]: ['Toxic', 'Plague', 'Rotting'],
  [FloorTheme.Shadow]: ['Shadow', 'Void', 'Dark'],
  [FloorTheme.Treasure]: ['Guardian', 'Ancient', 'Gilded'],
};

// Theme-specific decoration types
export const THEME_DECORATIONS: Record<FloorTheme, string[]> = {
  [FloorTheme.Crypt]: ['coffin_closed', 'coffin_open', 'crypt_torch', 'pillar', 'bones_pile'],
  [FloorTheme.Inferno]: ['fire_torch', 'campfire_small', 'campfire_large', 'fire_chest'],
  [FloorTheme.Frozen]: ['ice_crystal_small', 'ice_crystal_large', 'barrel_frozen'],
  [FloorTheme.Swamp]: ['mushroom_glow', 'wooden_bridge', 'barrel_swamp'],
  [FloorTheme.Shadow]: ['shadow_lantern', 'shadow_torch'],
  [FloorTheme.Treasure]: ['chest_ornate', 'chest_treasure'],
};

// Number of floor tile variants per theme
export const THEME_TILE_COUNTS: Record<FloorTheme, number> = {
  [FloorTheme.Crypt]: 4,
  [FloorTheme.Inferno]: 4,
  [FloorTheme.Frozen]: 4,
  [FloorTheme.Swamp]: 4,
  [FloorTheme.Shadow]: 2,
  [FloorTheme.Treasure]: 2,
};
