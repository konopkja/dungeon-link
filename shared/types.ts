// ============================================
// ENUMS
// ============================================

export enum ClassName {
  Warrior = 'warrior',
  Paladin = 'paladin',
  Rogue = 'rogue',
  Shaman = 'shaman',
  Mage = 'mage',
  Warlock = 'warlock'
}

export enum EquipSlot {
  Head = 'head',
  Chest = 'chest',
  Legs = 'legs',
  Feet = 'feet',
  Hands = 'hands',
  Weapon = 'weapon',
  Ring = 'ring',
  Trinket = 'trinket'
}

export enum Rarity {
  Common = 'common',
  Uncommon = 'uncommon',
  Rare = 'rare',
  Epic = 'epic',
  Legendary = 'legendary'
}

export enum EnemyType {
  Melee = 'melee',
  Ranged = 'ranged',
  Caster = 'caster'
}

export enum AbilityType {
  Damage = 'damage',
  Heal = 'heal',
  Buff = 'buff',
  Debuff = 'debuff',
  Summon = 'summon',
  Utility = 'utility'
}

export enum SetType {
  Caster = 'caster',
  MeleeDPS = 'melee_dps',
  Tank = 'tank'
}

export enum TargetType {
  Self = 'self',
  Enemy = 'enemy',
  Ally = 'ally',
  AoE = 'aoe',
  Ground = 'ground'
}

// Boss phase types for visual feedback
export enum BossPhaseType {
  Enrage = 'enrage',           // Damage increase (visual: size up, red tint)
  Summon = 'summon',           // Spawned minions (visual: spawn effect)
  Shield = 'shield',           // Invulnerable (visual: shield bubble)
  Regenerate = 'regenerate',   // Healing (visual: heal effect)
  Frenzy = 'frenzy'            // Multiple effects combined
}

// ============================================
// FLOOR THEMES
// ============================================

export enum FloorTheme {
  Crypt = 'crypt',       // Standard dungeon - baseline
  Inferno = 'inferno',   // Lava, fire hazards, +25% gold
  Frozen = 'frozen',     // Ice sliding, chill effects
  Swamp = 'swamp',       // Poison clouds, DoT effects
  Shadow = 'shadow',     // Limited visibility, ambushes
  Treasure = 'treasure'  // Lots of traps, guaranteed rare loot
}

// Theme-specific modifiers
export interface FloorThemeModifiers {
  goldMultiplier: number;
  trapMultiplier: number;
  visibilityRadius?: number;  // For shadow theme
  hazardDamage?: number;      // For inferno/swamp
  movementModifier?: number;  // For frozen (sliding)
}

// ============================================
// STATS
// ============================================

export interface Stats {
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  attackPower: number;
  spellPower: number;
  armor: number;
  crit: number;
  haste: number;
  lifesteal: number;
  resist: number;
}

export interface ItemStats {
  health?: number;
  mana?: number;
  attackPower?: number;
  spellPower?: number;
  armor?: number;
  crit?: number;
  haste?: number;
  lifesteal?: number;
  resist?: number;
}

// ============================================
// ABILITIES
// ============================================

export interface AbilityDefinition {
  id: string;
  name: string;
  description: string;
  classId: ClassName;
  type: AbilityType;
  targetType: TargetType;
  cooldown: number; // seconds
  manaCost: number;
  baseDamage?: number;
  baseHeal?: number;
  range: number;
  isBaseline: boolean; // true = starts with it, false = boss drop only
  effectId?: string;
}

export interface PlayerAbility {
  abilityId: string;
  rank: number;
  currentCooldown: number;
}

// ============================================
// ITEMS
// ============================================

export interface Item {
  id: string;
  name: string;
  slot: EquipSlot;
  rarity: Rarity;
  stats: ItemStats;
  floorDropped: number;
  requiredClass?: ClassName[];
  setId?: string; // ID of the set this item belongs to
  setType?: SetType; // Type of set (caster, melee_dps, tank)
}

export interface SetBonus {
  piecesRequired: number;
  bonusStats: ItemStats;
  bonusDescription: string;
  // Special set effects that provide unique mechanics beyond stat bonuses
  specialEffect?: 'arcane_barrier' | 'critical_mass' | 'bloodthirst' | 'vengeance' | 'thorns';
}

export interface SetDefinition {
  id: string;
  name: string;
  setType: SetType;
  pieces: EquipSlot[]; // Which slots this set has pieces for
  bonuses: SetBonus[];
}

export interface Equipment {
  [EquipSlot.Head]: Item | null;
  [EquipSlot.Chest]: Item | null;
  [EquipSlot.Legs]: Item | null;
  [EquipSlot.Feet]: Item | null;
  [EquipSlot.Hands]: Item | null;
  [EquipSlot.Weapon]: Item | null;
  [EquipSlot.Ring]: Item | null;
  [EquipSlot.Trinket]: Item | null;
}

// ============================================
// CONSUMABLES
// ============================================

export enum PotionType {
  Health = 'health',
  Mana = 'mana'
}

export interface Potion {
  id: string;
  type: PotionType;
  name: string;
  amount: number; // Amount restored
  rarity: Rarity;
}

// ============================================
// BUFFS & DEBUFFS
// ============================================

export interface Buff {
  id: string;
  name: string;
  icon: string;
  duration: number; // Remaining duration in seconds
  maxDuration: number;
  statModifiers?: Partial<Stats>;
  isDebuff: boolean;
  stacks?: number; // Optional stack count for abilities like Ancestral Spirit
  rank?: number; // Ability rank when buff was applied (for scaling effects)
  shieldAmount?: number; // Damage absorption shield (Power Word: Shield)
}

export interface DoTEffect {
  id: string;
  sourceId: string; // Who applied it
  abilityId: string;
  name: string;
  damagePerTick: number;
  tickInterval: number; // seconds between ticks
  remainingDuration: number;
  lastTickTime: number; // tracks when last tick occurred
}

// ============================================
// ENTITIES
// ============================================

export interface Position {
  x: number;
  y: number;
}

export interface Player {
  id: string;
  name: string;
  classId: ClassName;
  position: Position;
  stats: Stats;
  baseStats: Stats;
  equipment: Equipment;
  abilities: PlayerAbility[];
  gold: number;
  rerollTokens: number;
  isAlive: boolean;
  targetId: string | null;
  backpack: (Item | Potion)[]; // Items and potions in inventory
  buffs: Buff[];
  level: number;
  xp: number;
  xpToNextLevel: number;
}

export interface Enemy {
  id: string;
  type: EnemyType;
  name: string;
  position: Position;
  stats: Stats;
  isAlive: boolean;
  targetId: string | null;
  isBoss: boolean;
  isRare: boolean;
  isElite?: boolean;  // Elite enemies: stronger than normal, less rare than rare mobs
  bossId?: string;
  bossMechanics?: BossMechanic[];  // Mechanics info for display in target panel
  debuffs: DoTEffect[];
  // Patrol properties (optional)
  isPatrolling?: boolean;  // Whether this enemy patrols between rooms
  patrolRoute?: string[];  // Room IDs to patrol between
  currentRoomId?: string;  // Current room the patrolling enemy is in
  patrolTargetRoomId?: string;  // Next room to patrol to
  originalRoomId?: string;  // Original spawn room (for returning after player respawn)
  spawnPosition?: Position;  // Original spawn position for leash reset
  /**
   * BUG FIX: Pre-calculated waypoints that follow corridor paths between rooms.
   * Previously patrols moved in direct lines, cutting through walls.
   * Now they follow these waypoints which go through corridor midpoints.
   */
  patrolWaypoints?: Position[];  // Actual positions to walk through (corridor centers)
  currentWaypointIndex?: number;  // Index in patrolWaypoints array
  patrolDirection?: 1 | -1;  // 1 = forward through waypoints, -1 = backward
  /**
   * BUG FIX: Flag to indicate this enemy was a patroller.
   * Used to apply reduced aggro delay since patrollers are already alert.
   * Set to true when patrol mode is disabled upon entering combat.
   */
  wasPatrolling?: boolean;
  /**
   * For ambush rooms: enemy is hidden until player triggers the ambush.
   * Set to true when spawned in 'ambush' variant room.
   */
  isHidden?: boolean;
  /**
   * Boss phase mechanics - set when health thresholds are crossed.
   * These are lightweight flags checked during damage calculation.
   */
  isEnraged?: boolean;       // Damage multiplier active (e.g., Berserker Fury)
  isInvulnerable?: boolean;  // Cannot take damage (e.g., Primordial Barrier)
  isRegenerating?: boolean;  // Healing over time active
  summonedById?: string;     // If this enemy was summoned by a boss, track the boss ID
}

export interface Pet {
  id: string;
  ownerId: string;
  name: string;
  position: Position;
  stats: Stats;
  isAlive: boolean;
  targetId: string | null;
  petType: 'imp' | 'voidwalker' | 'beast' | 'totem';
  tauntCooldown: number; // seconds until can taunt again
}

// ============================================
// GROUND ITEMS
// ============================================

export interface GroundItem {
  id: string;
  item: Item | Potion;
  position: Position;
  droppedAt: number; // timestamp
}

// ============================================
// TRAPS AND CHESTS
// ============================================

export enum TrapType {
  Spikes = 'spikes',
  Flamethrower = 'flamethrower'
}

export interface Trap {
  id: string;
  type: TrapType;
  position: Position;
  isActive: boolean;           // Currently dealing damage
  cooldown: number;            // Time until next activation
  damage: number;              // Damage dealt
  activeDuration: number;      // How long trap stays active
  inactiveDuration: number;    // How long trap stays inactive
  direction?: 'up' | 'down' | 'left' | 'right'; // For flamethrower
}

export interface Chest {
  id: string;
  position: Position;
  isOpen: boolean;
  isLocked: boolean;           // Requires key to open
  lootTier: 'common' | 'rare' | 'epic'; // Determines loot quality
  contents?: (Item | Potion | { type: 'gold'; amount: number })[];
  isMimic?: boolean;           // Treasure theme: spawns enemy when opened
}

// ============================================
// DUNGEON
// ============================================

/**
 * Room variants define enemy formation patterns.
 * These change WHERE enemies spawn without requiring obstacle/collision systems.
 */
export type RoomVariant =
  | 'standard'      // Default random placement
  | 'ambush'        // Enemies hidden, spawn when player reaches center
  | 'guardian'      // Elite in center + minions around in circle
  | 'swarm'         // Many weak enemies clustered in one area
  | 'arena'         // Enemies spread to room edges
  | 'gauntlet';     // Enemies distributed along longest axis

/**
 * Room modifiers apply environmental effects.
 * Reuses existing theme logic where possible.
 */
export type RoomModifier =
  | 'dark'          // Reduced visibility (like Shadow theme)
  | 'burning'       // Periodic fire damage (like Inferno hazard)
  | 'cursed'        // Stat debuff while in room
  | 'blessed';      // Stat buff while in room (rare)

export interface Room {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'start' | 'normal' | 'boss' | 'rare';
  enemies: Enemy[];
  cleared: boolean;
  connectedTo: string[];
  vendor?: Vendor; // Trainer NPC
  shopVendor?: Vendor; // Shop vendor NPC for selling items
  cryptoVendor?: CryptoVendor; // Crypto potion vendor
  groundItems?: GroundItem[]; // Items dropped on the ground
  traps?: Trap[];    // Room traps (spikes, flamethrowers)
  chests?: Chest[];  // Lootable chests
  // Room variety system
  variant?: RoomVariant;    // Enemy formation pattern
  modifier?: RoomModifier;  // Environmental effect
}

// ============================================
// VENDOR
// ============================================

export interface Vendor {
  id: string;
  name: string;
  position: Position;
  vendorType: 'trainer' | 'shop'; // Type of vendor
}

export interface VendorService {
  type: 'level_up' | 'train_ability' | 'sell_item' | 'sell_all';
  abilityId?: string; // For training specific abilities
  itemId?: string; // For selling specific items
  cost: number; // For purchases, this is the cost; for selling, this is the gold received
  description: string;
}

export interface Dungeon {
  floor: number;
  seed: string;
  rooms: Room[];
  currentRoomId: string;
  bossDefeated: boolean;
  theme: FloorTheme;
  themeModifiers: FloorThemeModifiers;
}

// ============================================
// LOOT
// ============================================

export interface LootDrop {
  type: 'item' | 'ability' | 'gold' | 'rerollToken' | 'potion';
  item?: Item;
  potion?: Potion;
  abilityId?: string;
  goldAmount?: number;
  tokenCount?: number;
  wasConverted?: boolean; // true if ability was converted to fallback
}

// ============================================
// GROUND EFFECTS (Boss AoE Spells)
// ============================================

export enum GroundEffectType {
  ExpandingCircle = 'expanding_circle', // Expands outward from center
  FirePool = 'fire_pool', // Static fire on ground
  MovingWave = 'moving_wave', // Wave moving in one direction
  RotatingBeam = 'rotating_beam', // Beam rotating around boss
  VoidZone = 'void_zone', // Growing dark zone
  GravityWell = 'gravity_well' // Pulls players toward center - stay at edges!
}

export interface GroundEffect {
  id: string;
  type: GroundEffectType;
  position: Position;
  sourceId: string; // Boss that created it
  radius: number; // Current radius
  maxRadius: number; // Max radius before disappearing
  damage: number; // Damage per tick
  tickInterval: number; // Seconds between damage ticks
  duration: number; // Remaining duration
  direction?: Position; // For moving effects
  speed?: number; // Movement speed
  color: string; // Visual color (hex string)
}

// ============================================
// GAME STATE
// ============================================

/**
 * Per-run tracking state - automatically cleaned up when run is deleted.
 * This fixes the memory leak where global Maps accumulated stale entity IDs.
 *
 * BUG FIX: Previously these were stored as global Maps in GameStateManager,
 * causing unbounded memory growth as entity IDs from deleted runs persisted forever.
 * By moving them into RunState, they're garbage collected when the run is deleted.
 */
export interface RunTracking {
  // Attack cooldowns (entityId -> remaining cooldown in seconds)
  attackCooldowns: Map<string, number>;
  // Boss ability cooldowns (bossId_abilityId -> remaining cooldown)
  bossAbilityCooldowns: Map<string, number>;
  // Boss AoE ability cooldowns
  bossAoECooldowns: Map<string, number>;
  // Elite enemy special attack cooldowns
  eliteAttackCooldowns: Map<string, number>;
  // Ground effect damage ticks (effectId_playerId -> last tick time)
  groundEffectDamageTicks: Map<string, number>;
  // Player movement directions (playerId -> { moveX, moveY })
  playerMovement: Map<string, { moveX: number; moveY: number }>;
  // Player momentum for ice sliding (Frozen theme)
  playerMomentum: Map<string, { vx: number; vy: number }>;
  // Boss fight start times (bossId -> start timestamp)
  bossFightStartTimes: Map<string, number>;
  // Enemy aggro times (enemyId -> timestamp when first saw player)
  enemyAggroTimes: Map<string, number>;
  // Enemy leash timers (enemyId -> timestamp when lost target)
  enemyLeashTimers: Map<string, number>;
  // Player death times for respawn delay
  playerDeathTimes: Map<string, number>;
  // Enemy charge attack state
  enemyCharging: Map<string, { targetId: string; startTime: number }>;
  // Enemy charge cooldowns
  enemyChargeCooldowns: Map<string, number>;
  // Room variant: ambush trigger tracking (roomId set when triggered)
  ambushTriggered: Set<string>;
  // Room modifier: burning damage tick tracking (playerId_roomId -> last tick time)
  modifierDamageTicks: Map<string, number>;
  // Boss phase tracking (bossId_phaseId -> triggered)
  // Prevents re-triggering health-based phases
  bossPhaseTriggered: Set<string>;
}

/**
 * Creates a fresh RunTracking object with empty Maps.
 * Called when creating a new run.
 */
export function createRunTracking(): RunTracking {
  return {
    attackCooldowns: new Map(),
    bossAbilityCooldowns: new Map(),
    bossAoECooldowns: new Map(),
    eliteAttackCooldowns: new Map(),
    groundEffectDamageTicks: new Map(),
    playerMovement: new Map(),
    playerMomentum: new Map(),
    bossFightStartTimes: new Map(),
    enemyAggroTimes: new Map(),
    enemyLeashTimers: new Map(),
    playerDeathTimes: new Map(),
    enemyCharging: new Map(),
    enemyChargeCooldowns: new Map(),
    ambushTriggered: new Set(),
    modifierDamageTicks: new Map(),
    bossPhaseTriggered: new Set(),
  };
}

export interface RunState {
  runId: string;
  seed: string;
  floor: number;
  players: Player[];
  pets: Pet[];
  dungeon: Dungeon;
  inCombat: boolean;
  pendingLoot: LootDrop[];
  partyScaling: {
    healthMultiplier: number;
    damageMultiplier: number;
  };
  groundEffects: GroundEffect[];
  // Per-run tracking state (automatically cleaned up when run is deleted)
  tracking: RunTracking;
  // Crypto state (per-run tracking)
  cryptoState?: CryptoState;
}

// ============================================
// NETWORK MESSAGES
// ============================================

export type ClientMessage =
  | { type: 'CREATE_RUN'; playerName: string; classId: ClassName }
  | { type: 'CREATE_RUN_FROM_SAVE'; saveData: SaveData } // Create run from saved character
  | { type: 'JOIN_RUN'; runId: string; playerName: string; classId: ClassName }
  | { type: 'PLAYER_INPUT'; input: PlayerInput }
  | { type: 'SET_TARGET'; targetId: string | null }
  | { type: 'COLLECT_LOOT'; lootIndex: number }
  | { type: 'EQUIP_ITEM'; itemId: string }
  | { type: 'USE_ITEM'; itemId: string } // For using potions
  | { type: 'SWAP_EQUIPMENT'; backpackIndex: number; slot: EquipSlot } // Swap backpack item with equipped
  | { type: 'UNEQUIP_ITEM'; slot: EquipSlot } // Unequip item to backpack
  | { type: 'ADVANCE_FLOOR' }
  | { type: 'INTERACT_VENDOR'; vendorId: string } // Open vendor dialog
  | { type: 'PURCHASE_SERVICE'; vendorId: string; serviceType: 'level_up' | 'train_ability' | 'sell_item' | 'sell_all'; abilityId?: string; itemId?: string }
  | { type: 'PICKUP_GROUND_ITEM'; itemId: string } // Manual click-to-pickup
  | { type: 'OPEN_CHEST'; chestId: string } // Open a chest
  | { type: 'PING' }
  // Crypto messages
  | { type: 'CONNECT_WALLET'; walletAddress: string }
  | { type: 'DISCONNECT_WALLET' }
  | { type: 'GET_CRYPTO_VENDOR_SERVICES' }
  | { type: 'VERIFY_CRYPTO_PURCHASE'; txHash: string; potionType: PotionType; paymentToken: PaymentToken }
  | { type: 'REQUEST_CLAIM_ATTESTATION' }
  | { type: 'GET_POOL_STATUS' };

export interface PlayerInput {
  moveX: number;
  moveY: number;
  castAbility?: string;
  targetId?: string;
  targetPosition?: Position;
}

export type ServerMessage =
  | { type: 'RUN_CREATED'; runId: string; state: RunState }
  | { type: 'RUN_JOINED'; playerId: string; state: RunState }
  | { type: 'JOIN_ERROR'; message: string }
  | { type: 'STATE_UPDATE'; state: RunState }
  | { type: 'COMBAT_EVENT'; event: CombatEvent }
  | { type: 'TAUNT_EVENT'; event: TauntEvent }
  | { type: 'LOOT_DROP'; loot: LootDrop[] }
  | { type: 'FLOOR_COMPLETE'; floor: number }
  | { type: 'PLAYER_JOINED'; player: Player }
  | { type: 'PLAYER_LEFT'; playerId: string }
  | { type: 'GROUND_EFFECT'; effect: GroundEffect }
  | { type: 'VENDOR_SERVICES'; vendorId: string; services: VendorService[] }
  | { type: 'PURCHASE_RESULT'; success: boolean; message: string; newGold?: number }
  | { type: 'ITEM_COLLECTED'; playerId: string; itemName: string; itemType: 'item' | 'potion' }
  | { type: 'CHEST_OPENED'; chestId: string; playerId: string; loot: string[] } // Chest opened with loot descriptions
  | { type: 'TRAP_TRIGGERED'; trapId: string; playerId: string; damage: number } // Player hit by trap
  | { type: 'POTION_USED'; playerId: string; potionType: 'health' | 'mana' } // Player used a potion
  | { type: 'SOULSTONE_REVIVE'; playerId: string; position: Position } // Player revived by Soulstone
  | { type: 'BOSS_PHASE_CHANGE'; bossId: string; bossName: string; phase: BossPhaseType; mechanicName: string } // Boss entered new phase
  | { type: 'PONG' }
  // Crypto messages
  | { type: 'WALLET_CONNECTED'; walletAddress: string; cryptoAccountId: string }
  | { type: 'WALLET_DISCONNECTED' }
  | { type: 'CRYPTO_VENDOR_SERVICES'; services: CryptoVendorService[]; purchasesRemaining: number }
  | { type: 'CRYPTO_PURCHASE_VERIFIED'; potion: CryptoPotion; purchasesRemaining: number }
  | { type: 'CRYPTO_PURCHASE_FAILED'; reason: string }
  | { type: 'CHEST_ETH_DROP'; floorNumber: number; ethAmountWei: string; totalAccumulatedWei: string }
  | { type: 'CLAIM_ATTESTATION'; signature: string; accountId: string; ethAmountWei: string; walletAddress: string }
  | { type: 'CLAIM_NOT_ELIGIBLE'; reason: string }
  | { type: 'POOL_STATUS'; rewardPoolWei: string; hasPoolFunds: boolean }
  | { type: 'CRYPTO_STATE_UPDATE'; cryptoState: CryptoState }
  | { type: 'DELTA_UPDATE'; delta: DeltaState };

// ============================================
// DELTA STATE (for bandwidth optimization)
// ============================================

/**
 * Lightweight state update containing only dynamic data that changes during gameplay.
 * Static dungeon structure (room geometry, vendors, etc.) is cached from initial sync.
 * This reduces STATE_UPDATE from ~10KB to ~500-1000 bytes.
 */
export interface DeltaState {
  // Player dynamic data
  players: DeltaPlayer[];
  // Pet dynamic data
  pets: DeltaPet[];
  // Enemy dynamic data per room
  enemies: DeltaEnemy[];
  // Room status changes
  rooms: DeltaRoom[];
  // Chest status changes
  chests: DeltaChest[];
  // Ground effects (always sent in full - they're transient)
  groundEffects: GroundEffect[];
  // Combat status
  inCombat: boolean;
  // Current room
  currentRoomId: string;
  // Pending loot
  pendingLoot: LootDrop[];
}

export interface DeltaPlayer {
  id: string;
  position: Position;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  isAlive: boolean;
  targetId: string | null;
  gold: number;
  xp: number;
  level: number;
  buffs: Buff[];
  // Ability cooldowns only (not full ability data)
  abilityCooldowns: { abilityId: string; currentCooldown: number }[];
}

export interface DeltaPet {
  id: string;
  position: Position;
  health: number;
  maxHealth: number;
  isAlive: boolean;
  targetId: string | null;
}

export interface DeltaEnemy {
  id: string;
  roomId: string;
  position: Position;
  health: number;
  maxHealth: number;
  isAlive: boolean;
  targetId: string | null;
  isHidden?: boolean;
  debuffs: DoTEffect[];
  // Boss phase flags
  isEnraged?: boolean;
  isInvulnerable?: boolean;
  isRegenerating?: boolean;
}

export interface DeltaRoom {
  id: string;
  cleared: boolean;
}

export interface DeltaChest {
  id: string;
  isOpen: boolean;
}

export interface CombatEvent {
  sourceId: string;
  targetId: string;
  abilityId?: string;
  damage?: number;
  heal?: number;
  manaRestore?: number; // For Meditation and similar mana restore effects
  isCrit?: boolean;
  isStealthAttack?: boolean;
  killed?: boolean;
  blocked?: number; // Amount of damage blocked by Shield Wall or similar effects
}

export interface TauntEvent {
  sourceId: string; // The pet doing the taunt
  sourcePosition: Position;
  targetIds: string[]; // All enemies taunted
}

// ============================================
// BOSS DEFINITIONS
// ============================================

export interface BossDefinition {
  id: string;
  name: string;
  floorBand: [number, number]; // [min, max] floors this boss can appear
  baseHealth: number;
  baseDamage: number;
  abilities: string[];
  mechanics: BossMechanic[];
  lootTable: BossLootEntry[];
}

export interface BossMechanic {
  id: string;
  name: string;
  description: string;
  triggerHealthPercent?: number;
  intervalSeconds?: number;
}

export interface BossLootEntry {
  type: 'item' | 'ability' | 'cosmetic';
  dropChance: number;
  itemSlot?: EquipSlot;
  rarityWeights?: Partial<Record<Rarity, number>>;
}

// ============================================
// ENEMY DEFINITIONS
// ============================================

export interface EnemyDefinition {
  id: string;
  name: string;
  type: EnemyType;
  baseHealth: number;
  baseDamage: number;
  attackRange: number;
  moveSpeed: number;
}

// ============================================
// CLASS DEFINITIONS
// ============================================

export interface ClassDefinition {
  id: ClassName;
  name: string;
  description: string;
  color: string;
  baseStats: Stats;
  abilities: AbilityDefinition[];
}

// ============================================
// SAVE DATA
// ============================================

export interface SaveData {
  version: number; // For save compatibility
  timestamp: number;
  playerName: string;
  classId: ClassName;
  level: number;
  xp: number;
  xpToNextLevel: number;
  gold: number;
  rerollTokens: number;
  baseStats: Stats;
  equipment: Equipment;
  abilities: PlayerAbility[];
  backpack: (Item | Potion)[];
  highestFloor: number;
  lives: number; // 5 lives max, character deleted when 0
  // Crypto claim tracking
  cryptoAccountId?: string; // Unique account ID for crypto claims
  hasClaimed?: boolean; // Whether this account has claimed crypto rewards
}

// ============================================
// CRYPTO SYSTEM
// ============================================

export enum PaymentToken {
  ETH = 'eth',
  USDC = 'usdc',
  USDT = 'usdt'
}

export enum CryptoPotionQuality {
  Minor = 'minor',       // 40% chance - heals 15%
  Standard = 'standard', // 35% chance - heals 25%
  Greater = 'greater',   // 20% chance - heals 40%
  Superior = 'superior'  // 5% chance - heals 60%
}

export interface CryptoPotion {
  id: string;
  type: PotionType;
  quality: CryptoPotionQuality;
  healPercent: number; // Percentage of max health/mana restored
  name: string;
}

export interface CryptoVendorService {
  type: 'buy_potion';
  potionType: PotionType;
  priceUsd: string; // Display price
  prices: {
    [PaymentToken.ETH]: string;
    [PaymentToken.USDC]: string;
    [PaymentToken.USDT]: string;
  };
}

export interface CryptoState {
  // Wallet connection
  walletAddress?: string;
  isWalletConnected: boolean;

  // Floor purchase tracking
  purchasesThisFloor: number;
  maxPurchasesPerFloor: number; // Always 5

  // Boss ETH drops (accumulated during run)
  accumulatedEthWei: string; // BigInt as string for serialization

  // Pool status
  hasPoolFunds: boolean;
  rewardPoolWei: string; // Current pool balance

  // Claim status
  canClaim: boolean; // True after beating floor 15 boss solo
  hasClaimed: boolean; // Already claimed this account
}

// Crypto vendor type for Room
export interface CryptoVendor {
  id: string;
  name: string;
  position: Position;
  vendorType: 'crypto';
}

// ============================================
// CRYPTO NETWORK MESSAGES
// ============================================

export type CryptoClientMessage =
  | { type: 'CONNECT_WALLET'; walletAddress: string }
  | { type: 'DISCONNECT_WALLET' }
  | { type: 'GET_CRYPTO_VENDOR_SERVICES' }
  | { type: 'VERIFY_CRYPTO_PURCHASE'; txHash: string; potionType: PotionType; paymentToken: PaymentToken }
  | { type: 'REQUEST_CLAIM_ATTESTATION' }
  | { type: 'GET_POOL_STATUS' };

export type CryptoServerMessage =
  | { type: 'WALLET_CONNECTED'; walletAddress: string; cryptoAccountId: string }
  | { type: 'WALLET_DISCONNECTED' }
  | { type: 'CRYPTO_VENDOR_SERVICES'; services: CryptoVendorService[]; purchasesRemaining: number }
  | { type: 'CRYPTO_PURCHASE_VERIFIED'; potion: CryptoPotion; purchasesRemaining: number }
  | { type: 'CRYPTO_PURCHASE_FAILED'; reason: string }
  | { type: 'CHEST_ETH_DROP'; floorNumber: number; ethAmountWei: string; totalAccumulatedWei: string }
  | { type: 'CLAIM_ATTESTATION'; signature: string; accountId: string; ethAmountWei: string; walletAddress: string }
  | { type: 'CLAIM_NOT_ELIGIBLE'; reason: string }
  | { type: 'POOL_STATUS'; rewardPoolWei: string; hasPoolFunds: boolean }
  | { type: 'CRYPTO_STATE_UPDATE'; cryptoState: CryptoState };
