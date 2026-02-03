// Game configuration constants
export const GAME_CONFIG = {
  // Tick rate
  SERVER_TICK_RATE: 20, // 20 updates per second
  CLIENT_TICK_RATE: 60, // 60 fps

  // Player
  PLAYER_MOVE_SPEED: 200,
  PLAYER_BASE_HEALTH: 100,
  PLAYER_BASE_MANA: 100,

  // Dungeon
  MIN_ROOMS_PER_FLOOR: 8,
  MAX_ROOMS_PER_FLOOR: 12,
  ROOM_MIN_SIZE: 200,
  ROOM_MAX_SIZE: 400,
  TILE_SIZE: 32,
  CORRIDOR_WIDTH: 64,

  // Combat
  BASE_ATTACK_COOLDOWN: 1.0,
  CRIT_DAMAGE_MULTIPLIER: 1.5,

  // Enemies
  ENEMIES_PER_ROOM_MIN: 2,
  ENEMIES_PER_ROOM_MAX: 5,
  RARE_MOB_SPAWN_CHANCE: 0.10, // 10%

  // Loot
  GEAR_DROP_CHANCE: 0.40,
  ABILITY_DROP_CHANCE: 0.30,
  COSMETIC_DROP_CHANCE: 0.05,
  GOLD_DROP_MIN: 10,
  GOLD_DROP_MAX: 50,

  // Scaling
  // FIX: Reduced damage scaling from 1.10 to 1.08 to address floor 8+ difficulty spike
  // Previous: Floor 8 = 1.95x, Floor 9 = 2.14x damage (too punishing)
  // New: Floor 8 = 1.71x, Floor 9 = 1.85x damage (more gradual progression)
  FLOOR_HEALTH_SCALE: 1.15, // 15% more health per floor
  FLOOR_DAMAGE_SCALE: 1.08, // 8% more damage per floor (reduced from 10%)
  FLOOR_LOOT_SCALE: 1.12, // 12% better stats per floor

  // Party scaling
  PARTY_HEALTH_SCALE_PER_PLAYER: 0.5, // +50% enemy health per extra player
  PARTY_DAMAGE_SCALE_PER_PLAYER: 0.3, // +30% enemy damage per extra player
  MAX_PARTY_SIZE: 5,

  // Ability ranks
  MAX_ABILITY_RANK: 10,
  RANK_DAMAGE_INCREASE: 0.15, // 15% more damage per rank

  // Fallback rewards when ability can't upgrade
  FALLBACK_GOLD_MIN: 25,
  FALLBACK_GOLD_MAX: 75,
  FALLBACK_TOKEN_CHANCE: 0.20,
} as const;

// Sprite sizes
export const SPRITE_CONFIG = {
  PLAYER_SIZE: 32,
  ENEMY_SIZE: 32,
  BOSS_SIZE: 64,
  ITEM_ICON_SIZE: 32,
  TILE_SIZE: 32,
} as const;

// Colors by class
export const CLASS_COLORS: Record<string, number> = {
  warrior: 0xc79c6e,    // Tan
  paladin: 0xf58cba,    // Pink
  hunter: 0xabd473,     // Green
  rogue: 0xfff569,      // Yellow
  priest: 0xffffff,     // White
  shaman: 0x0070de,     // Blue
  mage: 0x69ccf0,       // Light blue
  warlock: 0x9482c9,    // Purple
  druid: 0xff7d0a,      // Orange
};

// Rarity colors
export const RARITY_COLORS: Record<string, number> = {
  common: 0x9d9d9d,     // Gray
  uncommon: 0x1eff00,   // Green
  rare: 0x0070dd,       // Blue
  epic: 0xa335ee,       // Purple
  legendary: 0xff8000,  // Orange
};

// Enemy colors by type
export const ENEMY_TYPE_COLORS: Record<string, number> = {
  melee: 0xff4444,      // Red
  ranged: 0x44ff44,     // Green
  caster: 0x4444ff,     // Blue
};

// WebSocket
export const WS_CONFIG = {
  PORT: 8080,
  RECONNECT_DELAY: 1000,
  MAX_RECONNECT_ATTEMPTS: 5,
} as const;
