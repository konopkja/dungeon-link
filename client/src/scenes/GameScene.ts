import Phaser from 'phaser';
import { Player, Enemy, Room, ServerMessage, EnemyType, Potion, PotionType, Pet, GroundEffect, GroundEffectType, AbilityType, VendorService, Vendor, GroundItem, Trap, Chest, TrapType, FloorTheme, FloorThemeModifiers } from '@dungeon-link/shared';
import { CLASS_COLORS, SPRITE_CONFIG, ENEMY_TYPE_COLORS, getAbilityById, calculateAbilityDamage, calculateAbilityHeal } from '@dungeon-link/shared';
import { openCryptoVendor, updatePurchasesRemaining, emitWalletEvent, openVendor, closeVendor, updateVendor, onWalletEvent, initWalletUI } from '../wallet/lazyWallet';
import { wsClient } from '../network/WebSocketClient';
import { InputManager } from '../systems/InputManager';
import { AbilitySystem } from '../systems/AbilitySystem';
import { InventoryUI } from '../systems/InventoryUI';
import { saveLeaderboardEntry, addActivity } from '../main';
import { FONTS, COLORS, COLORS_HEX, PANEL, BUTTON, drawCornerDecorations, createTooltipBg, createCloseButton } from '../ui/theme';

export class GameScene extends Phaser.Scene {
  private inputManager: InputManager | null = null;
  private abilitySystem: AbilitySystem | null = null;
  private inventoryUI: InventoryUI | null = null;

  // Game objects
  private playerSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private enemySprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private petSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private groundItemSprites: Map<string, Phaser.GameObjects.Container> = new Map();
  private trapSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private chestSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private roomGraphics: Phaser.GameObjects.Graphics | null = null;
  private roomTiles: Map<string, Phaser.GameObjects.TileSprite> = new Map();
  private roomDecorations: Map<string, Phaser.GameObjects.Sprite[]> = new Map();
  private roomWalls: Map<string, Phaser.GameObjects.TileSprite[]> = new Map();
  private roomModifierOverlays: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private corridorElements: Map<string, Phaser.GameObjects.GameObject[]> = new Map();
  private healthBars: Map<string, { bg: Phaser.GameObjects.Rectangle; fill: Phaser.GameObjects.Rectangle }> = new Map();

  // UI
  private floorText: Phaser.GameObjects.Text | null = null;
  private levelText: Phaser.GameObjects.Text | null = null;

  // Mana and XP bars above action bar (center aligned with ability bar)
  private actionManaBarBg: Phaser.GameObjects.Rectangle | null = null;
  private actionManaBarFill: Phaser.GameObjects.Rectangle | null = null;
  private actionManaText: Phaser.GameObjects.Text | null = null;
  private actionXpBarBg: Phaser.GameObjects.Rectangle | null = null;
  private actionXpBarFill: Phaser.GameObjects.Rectangle | null = null;
  private actionXpText: Phaser.GameObjects.Text | null = null;
  // NOTE: inviteButton removed - game is now single-player only
  private advanceButton: Phaser.GameObjects.Text | null = null;
  private minimapGraphics: Phaser.GameObjects.Graphics | null = null;

  // Navigator Panel (unified minimap + controls)
  private navigatorPanel: Phaser.GameObjects.Container | null = null;
  private navigatorFloorText: Phaser.GameObjects.Text | null = null;
  private navigatorRoomText: Phaser.GameObjects.Text | null = null;

  // Combat text
  private damageTexts: Phaser.GameObjects.Text[] = [];

  // Target indicator
  private targetIndicator: Phaser.GameObjects.Graphics | null = null;
  private cachedTargetId: string | null = null;
  private cachedTargetPosition: { x: number; y: number } | null = null;

  // Target info panel
  private targetInfoPanel: Phaser.GameObjects.Container | null = null;
  private targetNameText: Phaser.GameObjects.Text | null = null;
  private targetTypeText: Phaser.GameObjects.Text | null = null;
  private targetMechanicsText: Phaser.GameObjects.Text | null = null;
  private targetHealthText: Phaser.GameObjects.Text | null = null;
  private targetHealthBar: { bg: Phaser.GameObjects.Rectangle; fill: Phaser.GameObjects.Rectangle } | null = null;

  // Shadow theme fog of war overlay
  private shadowOverlay: Phaser.GameObjects.Graphics | null = null;

  // Cooldown overlays
  private cooldownTexts: Phaser.GameObjects.Text[] = [];
  private cooldownOverlays: Phaser.GameObjects.Rectangle[] = [];
  private cooldownRadials: Phaser.GameObjects.Graphics[] = [];

  // Ability icon graphics for symbols
  private abilitySymbols: Phaser.GameObjects.Graphics[] = [];

  // Buffs/Debuffs UI
  private buffsContainer: Phaser.GameObjects.Container | null = null;
  private buffIcons: Phaser.GameObjects.Image[] = [];
  private buffTexts: Phaser.GameObjects.Text[] = [];
  private buffTooltip: Phaser.GameObjects.Container | null = null;
  private currentBuffsCache: any[] = []; // Store current buffs for tooltip access
  private hoveredBuffSlot: number = -1; // Track which buff slot is being hovered (-1 = none)

  // Projectiles
  private projectiles: Phaser.GameObjects.Container[] = [];

  // Ground effects
  private groundEffectGraphics: Map<string, Phaser.GameObjects.Container> = new Map();

  // Active notifications for stacking
  private activeNotifications: Phaser.GameObjects.Text[] = [];

  // Track known pets to detect new summons
  private knownPetIds: Set<string> = new Set();

  // Track enemies that have already shown spawn notification (rare/elite)
  private notifiedEnemyIds: Set<string> = new Set();

  // Track ambush enemies that have been revealed (for animation/sound)
  private revealedAmbushEnemyIds: Set<string> = new Set();

  // Track enemies that are currently hidden (to detect when they become visible)
  private hiddenEnemyIds: Set<string> = new Set();

  // Potion quick slots
  private healthPotionSlot: Phaser.GameObjects.Container | null = null;
  private manaPotionSlot: Phaser.GameObjects.Container | null = null;
  private healthPotionCount: Phaser.GameObjects.Text | null = null;
  private manaPotionCount: Phaser.GameObjects.Text | null = null;

  // Vendor
  private vendorSprites: Map<string, Phaser.GameObjects.Container> = new Map();
  private currentVendorId: string | null = null;
  private vendorServices: VendorService[] = [];
  private vendorModalOpen: boolean = false;

  private messageUnsubscribe: (() => void) | null = null;

  // Lives tracking
  private wasAlive: boolean = true;
  private livesText: Phaser.GameObjects.Text | null = null;

  // Player Unit Frame (top-left)
  private playerFrame: Phaser.GameObjects.Container | null = null;
  private playerFrameHealthBar: { bg: Phaser.GameObjects.Rectangle; fill: Phaser.GameObjects.Rectangle } | null = null;
  private playerFrameManaBar: { bg: Phaser.GameObjects.Rectangle; fill: Phaser.GameObjects.Rectangle } | null = null;
  private playerFrameHealthText: Phaser.GameObjects.Text | null = null;
  private playerFrameManaText: Phaser.GameObjects.Text | null = null;
  private playerFrameNameText: Phaser.GameObjects.Text | null = null;
  private playerFrameLivesText: Phaser.GameObjects.Text | null = null;
  private playerFrameFloorText: Phaser.GameObjects.Text | null = null;
  private playerFrameLevelText: Phaser.GameObjects.Text | null = null;

  // Music tracking
  private currentMusic: Phaser.Sound.BaseSound | null = null;
  private currentMusicKey: string = '';
  private previousRoomId: string = '';
  private previousPlayerLevel: number = 0; // 0 means not yet initialized
  private lastMusicChangeTime: number = 0; // Prevent rapid music switching

  // Footstep tracking
  private previousPlayerPos: { x: number; y: number } = { x: 0, y: 0 };
  private lastFootstepTime: number = 0;
  private footstepCooldown: number = 300; // ms between footstep sounds
  private isPlayerMoving: boolean = false; // Track if player is currently moving

  // Melee sound alternation
  private useMeleeSound2: boolean = false;

  // Chain lightning effect debounce (prevent multiple effects per cast)
  private lastChainLightningTime: number = 0;

  // Protection visual effects
  private protectionEffects: Map<string, Phaser.GameObjects.Graphics> = new Map();

  // Enemy debuff visual effects (blind, stun, etc.)
  private enemyDebuffEffects: Map<string, Phaser.GameObjects.Graphics> = new Map();

  constructor() {
    super({ key: 'GameScene' });
  }

  init(): void {
    console.log('[DEBUG] *** GameScene init() called ***');
    console.log('[DEBUG] Active scenes:', this.scene.manager.getScenes(true).map(s => s.scene.key));
    console.log('[DEBUG] this.messageUnsubscribe exists:', !!this.messageUnsubscribe);

    // Clean up any existing subscriptions when scene is restarted/reused
    // This prevents duplicate message handlers and notifications
    if (this.messageUnsubscribe) {
      console.log('[DEBUG] GameScene init() - cleaning up old message handler');
      this.messageUnsubscribe();
      this.messageUnsubscribe = null;
    }
  }

  create(): void {
    try {
      console.log('[DEBUG] GameScene create() starting');
      console.log('[DEBUG] wsClient.currentState:', wsClient.currentState ? 'exists' : 'null');

      // Initialize wallet UI (lazy-loaded, won't block)
      initWalletUI().catch(err => console.error('[Wallet] Failed to init:', err));

      // CRITICAL: Destroy ALL existing children first to prevent visual artifacts
      // This ensures no orphaned sprites/graphics from previous sessions persist
      console.log('[DEBUG] Destroying all children. Count:', this.children.length);
      this.children.removeAll(true); // true = destroy children
      console.log('[DEBUG] Children after cleanup:', this.children.length);

      // CRITICAL: Clean up from previous scene instance to prevent blinking
      // Stop all running tweens from previous session
      this.tweens.killAll();

      // Remove all input listeners from previous session (pointer + keyboard)
      this.input.removeAllListeners();
      this.input.keyboard?.removeAllListeners();

      // Destroy old graphics objects if they exist
      if (this.roomGraphics) {
        this.roomGraphics.destroy();
        this.roomGraphics = null;
      }
      if (this.targetIndicator) {
        this.targetIndicator.destroy();
        this.targetIndicator = null;
      }
      if (this.shadowOverlay) {
        this.shadowOverlay.destroy();
        this.shadowOverlay = null;
      }

      // Clear any previous state in case scene is reused
      // IMPORTANT: Destroy game objects before clearing Maps to prevent visual artifacts
      // Use safe destroy helper to avoid errors on null/destroyed objects
      const safeDestroy = (obj: { destroy?: () => void } | null | undefined) => {
        try {
          if (obj && typeof obj.destroy === 'function') {
            obj.destroy();
          }
        } catch (e) {
          // Ignore errors from already-destroyed objects
        }
      };

      this.playerSprites.forEach(sprite => safeDestroy(sprite));
      this.playerSprites.clear();
      this.enemySprites.forEach(sprite => safeDestroy(sprite));
      this.enemySprites.clear();
      this.petSprites.forEach(sprite => safeDestroy(sprite));
      this.petSprites.clear();
      this.vendorSprites.forEach(sprite => safeDestroy(sprite));
      this.vendorSprites.clear();
      this.healthBars.forEach(bar => { safeDestroy(bar?.bg); safeDestroy(bar?.fill); });
      this.healthBars.clear();
      this.roomTiles.forEach(tile => safeDestroy(tile));
      this.roomTiles.clear();
      this.roomDecorations.forEach(decs => decs?.forEach(d => safeDestroy(d)));
      this.roomDecorations.clear();
      this.roomWalls.forEach(walls => walls?.forEach(w => safeDestroy(w)));
      this.roomWalls.clear();
      this.roomModifierOverlays.forEach(overlay => safeDestroy(overlay));
      this.roomModifierOverlays.clear();
      this.corridorElements.forEach(elements => elements?.forEach(e => safeDestroy(e)));
      this.corridorElements.clear();
      this.groundEffectGraphics.forEach(g => safeDestroy(g));
      this.groundEffectGraphics.clear();
      this.protectionEffects.forEach(effect => safeDestroy(effect));
      this.protectionEffects.clear();
      this.groundItemSprites.forEach(sprite => safeDestroy(sprite));
      this.groundItemSprites.clear();
      this.trapSprites.forEach(sprite => safeDestroy(sprite));
      this.trapSprites.clear();
      this.chestSprites.forEach(sprite => safeDestroy(sprite));
      this.chestSprites.clear();
      this.enemyDebuffEffects.forEach(effect => safeDestroy(effect));
      this.enemyDebuffEffects.clear();
      this.playerClassMap.clear();
      this.playerAbilityAnimating.clear();
      this.playerMovementAnimating.clear();
      this.bossAttackAnimating.clear();
      this.damageTexts.forEach(text => safeDestroy(text));
      this.damageTexts = [];
      this.projectiles.forEach(p => safeDestroy(p));
      this.projectiles = [];
      this.activeNotifications.forEach(n => safeDestroy(n));
      this.activeNotifications = [];
      this.knownPetIds.clear();
      this.notifiedEnemyIds.clear();
      this.revealedAmbushEnemyIds.clear();
      this.hiddenEnemyIds.clear();
      this.vendorServices = [];
      this.currentVendorId = null;
      this.vendorModalOpen = false;
      closeVendor();
      this.cooldownTexts.forEach(t => safeDestroy(t));
      this.cooldownTexts = [];
      this.cooldownOverlays.forEach(o => safeDestroy(o));
      this.cooldownOverlays = [];
      this.cooldownRadials.forEach(g => safeDestroy(g));
      this.cooldownRadials = [];
      this.abilitySymbols.forEach(s => safeDestroy(s));
      this.abilitySymbols = [];
      this.buffIcons.forEach(i => safeDestroy(i));
      this.buffIcons = [];
      this.buffTexts.forEach(t => safeDestroy(t));
      this.buffTexts = [];

      // Clean up UI elements that are recreated in createUI()
      safeDestroy(this.navigatorPanel);
      this.navigatorPanel = null;
      this.minimapGraphics = null; // Graphics is destroyed with the container
      this.navigatorFloorText = null;
      this.navigatorRoomText = null;
      safeDestroy(this.buffsContainer);
      this.buffsContainer = null;
      safeDestroy(this.buffTooltip);
      this.buffTooltip = null;
      this.currentBuffsCache = [];
      safeDestroy(this.targetInfoPanel);
      this.targetInfoPanel = null;
      this.targetNameText = null;
      this.targetTypeText = null;
      this.targetMechanicsText = null;
      this.targetHealthText = null;
      this.targetHealthBar = null;
      safeDestroy(this.healthPotionSlot);
      this.healthPotionSlot = null;
      this.healthPotionCount = null;
      safeDestroy(this.manaPotionSlot);
      this.manaPotionSlot = null;
      this.manaPotionCount = null;
      safeDestroy(this.actionManaBarBg);
      this.actionManaBarBg = null;
      safeDestroy(this.actionManaBarFill);
      this.actionManaBarFill = null;
      safeDestroy(this.actionManaText);
      this.actionManaText = null;
      safeDestroy(this.actionXpBarBg);
      this.actionXpBarBg = null;
      safeDestroy(this.actionXpBarFill);
      this.actionXpBarFill = null;
      safeDestroy(this.actionXpText);
      this.actionXpText = null;

      // Clean up player frame
      safeDestroy(this.playerFrame);
      this.playerFrame = null;
      this.playerFrameHealthBar = null;
      this.playerFrameManaBar = null;
      this.playerFrameHealthText = null;
      this.playerFrameManaText = null;
      this.playerFrameNameText = null;
      this.playerFrameLivesText = null;
      this.playerFrameFloorText = null;
      this.playerFrameLevelText = null;

      safeDestroy(this.floorText);
      this.floorText = null;
      safeDestroy(this.levelText);
      this.levelText = null;
      // Don't destroy livesText separately - it's part of playerFrame now
      this.livesText = null;
      safeDestroy(this.advanceButton);
      this.advanceButton = null;
      // NOTE: inviteButton removed - game is now single-player only

      // Clean up any existing ability tooltips
      const existingTooltip = this.children.getByName('ability_tooltip');
      safeDestroy(existingTooltip);

      this.wasAlive = true;
      this.isPlayerMoving = false;
      this.cachedTargetId = null;
      this.cachedTargetPosition = null;

      // Reset music state so it properly restarts
      this.currentMusic = null;
      this.currentMusicKey = '';
      this.previousRoomId = '';
      this.previousPlayerLevel = 0;
      this.lastMusicChangeTime = 0;

      // Initialize systems
      this.inputManager = new InputManager(this);
      this.abilitySystem = new AbilitySystem(this);

      // Create enemy animations
      this.createEnemyAnimations();

      // Create player ability animations (rogue, etc.)
      this.createPlayerAnimations();

      // Create decoration and trap animations
      this.createDecorationAnimations();

      // Create room graphics
      this.roomGraphics = this.add.graphics();

      // Create target indicator
      this.targetIndicator = this.add.graphics();
      this.targetIndicator.setDepth(5);

      // Create shadow overlay for fog of war (Shadow theme)
      this.shadowOverlay = this.add.graphics();
      this.shadowOverlay.setDepth(100); // Above most things but below UI
      this.shadowOverlay.setScrollFactor(0); // Fixed to camera
      this.shadowOverlay.setVisible(false);

      // Create UI elements
      this.createUI();

      // Setup camera
      this.cameras.main.setBackgroundColor('#1a1a2e');

      // Clean up any existing message handler before subscribing (prevents duplicate notifications)
      if (this.messageUnsubscribe) {
        this.messageUnsubscribe();
        this.messageUnsubscribe = null;
      }
      // Subscribe to server messages
      this.messageUnsubscribe = wsClient.onMessage((message) => this.handleServerMessage(message));

      // Initial render - only if we have valid, fresh state
      // CRITICAL: Validate that currentState belongs to the current run to prevent
      // rendering stale floor data from a previous game session
      const hasValidState = wsClient.currentState &&
        wsClient.runId &&
        wsClient.currentState.runId === wsClient.runId;

      if (hasValidState) {
        console.log('[DEBUG] About to call renderWorld with valid state for run:', wsClient.runId);
        this.renderWorld();
        console.log('[DEBUG] renderWorld completed');
      } else {
        console.log('[DEBUG] Skipping initial renderWorld - waiting for fresh state from server');
        if (wsClient.currentState && wsClient.runId) {
          console.log('[DEBUG] State runId mismatch:', wsClient.currentState.runId, 'vs', wsClient.runId);
        }
      }

      // Setup click to target
      this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (pointer.leftButtonDown()) {
          this.handleClick(pointer);
        }
      });

      // Keyboard shortcuts
      this.input.keyboard!.on('keydown-I', () => {
        this.inventoryUI?.toggle();
      });

      // Create inventory UI last
      console.log('[DEBUG] About to create InventoryUI');
      this.inventoryUI = new InventoryUI(this);
      console.log('[DEBUG] GameScene create() completed successfully');
    } catch (error) {
      console.error('[ERROR] GameScene create() failed:', error);
    }
  }

  private createUI(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Player Unit Frame (top-left)
    this.createPlayerFrame();

    // Keep old references for compatibility (will be hidden)
    this.floorText = this.add.text(-100, -100, '', {}).setVisible(false);
    this.levelText = this.add.text(-100, -100, '', {}).setVisible(false);

    // Create unified Navigator Panel (minimap + controls)
    this.createNavigatorPanel();

    // Advance floor button (hidden initially) - positioned above ability bar
    this.advanceButton = this.add.text(width / 2, height - 100, 'Press SPACE to continue', {
      fontFamily: FONTS.title,
      fontSize: '18px',
      color: '#1a1a2e',
      backgroundColor: '#c9a227',
      padding: { x: 25, y: 12 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(150).setVisible(false);

    // Target info panel (top left, below floor text)
    this.createTargetInfoPanel();

    // Buffs/Debuffs UI (below target info panel)
    this.createBuffsUI();

    // Ability bar (bottom center)
    this.createAbilityBar();

    // Mana and XP bars above action bar
    this.createActionBars();
  }

  private createBuffsUI(): void {
    // Position buffs under the player frame
    const baseX = 10; // Aligned with player frame
    const baseY = 110; // Below player frame (10 + 95 + 5 gap)

    // Create a simple container just for grouping (won't affect input)
    this.buffsContainer = this.add.container(0, 0).setScrollFactor(0).setDepth(160);

    // Create buff tooltip (hidden by default)
    this.buffTooltip = this.add.container(0, 0).setDepth(600).setScrollFactor(0).setVisible(false).setName('buff_tooltip');
    const tooltipBgOuter = this.add.rectangle(0, 0, 240, 100, COLORS.panelBg, 1.0).setOrigin(0.5, 1);
    tooltipBgOuter.setStrokeStyle(2, COLORS.borderGold);
    tooltipBgOuter.setName('buffTooltipBgOuter');
    const tooltipBgInner = this.add.rectangle(0, -2, 236, 96, 0x111122, 1.0).setOrigin(0.5, 1);
    tooltipBgInner.setName('buffTooltipBgInner');
    const tooltipTitle = this.add.text(0, -88, '', {
      fontFamily: FONTS.title,
      fontSize: '15px',
      color: COLORS_HEX.goldLight,
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5, 0).setName('buffTooltipTitle');
    const tooltipDesc = this.add.text(0, -65, '', {
      fontFamily: FONTS.body,
      fontSize: '14px',
      color: '#ffffff',
      wordWrap: { width: 220 },
      lineSpacing: 3,
      stroke: '#000000',
      strokeThickness: 1
    }).setOrigin(0.5, 0).setName('buffTooltipDesc');
    this.buffTooltip.add([tooltipBgOuter, tooltipBgInner, tooltipTitle, tooltipDesc]);

    // Create buff icon slots (max 8 buffs) - small squares with icons
    const iconSize = 20;
    const gap = 3;

    for (let i = 0; i < 8; i++) {
      const iconX = baseX + i * (iconSize + gap) + iconSize / 2;
      const iconY = baseY + iconSize / 2;

      // Use image for buff icon - position directly on scene (not in container)
      const icon = this.add.image(iconX, iconY, 'buff_generic');
      icon.setDisplaySize(iconSize, iconSize);
      icon.setScrollFactor(0);
      icon.setDepth(160);
      icon.setVisible(false);
      icon.setInteractive({ useHandCursor: true });

      // Add hover events for buff tooltip
      const slotIndex = i;
      icon.on('pointerover', () => {
        this.hoveredBuffSlot = slotIndex; // Track which slot is hovered
        if (slotIndex < this.currentBuffsCache.length) {
          const buff = this.currentBuffsCache[slotIndex];
          this.showBuffTooltip(buff, iconX, baseY + iconSize + 35);
        }
      });
      icon.on('pointerout', () => {
        this.hoveredBuffSlot = -1; // Clear hovered slot
        this.buffTooltip?.setVisible(false);
      });

      this.buffIcons.push(icon);

      // Duration text (below the icon) - also directly on scene
      const text = this.add.text(iconX, baseY + iconSize + 2, '', {
        fontSize: '9px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 1
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(160);
      this.buffTexts.push(text);
    }
  }

  private showBuffTooltip(buff: any, x: number, y: number): void {
    if (!this.buffTooltip) return;

    const title = this.buffTooltip.getByName('buffTooltipTitle') as Phaser.GameObjects.Text;
    const desc = this.buffTooltip.getByName('buffTooltipDesc') as Phaser.GameObjects.Text;
    const bgOuter = this.buffTooltip.getByName('buffTooltipBgOuter') as Phaser.GameObjects.Rectangle;
    const bgInner = this.buffTooltip.getByName('buffTooltipBgInner') as Phaser.GameObjects.Rectangle;

    // Set title with buff/debuff indicator
    const typeIndicator = buff.isDebuff ? '[Debuff]' : '[Buff]';
    const stackText = buff.stacks && buff.stacks > 1 ? ` x${buff.stacks}` : '';
    title.setText(`${buff.name}${stackText}`);
    title.setColor(buff.isDebuff ? '#ff6666' : COLORS_HEX.goldLight);

    // Build description with stat modifiers
    const lines: string[] = [typeIndicator];

    // Floor theme buff descriptions
    const floorThemeDescriptions: Record<string, string> = {
      'floor_inferno': 'The burning floor deals\nperiodic fire damage.',
      'floor_frozen': 'Icy ground causes you\nto slide while moving.',
      'floor_swamp': 'Toxic fumes fill the air.\nWatch your step.',
      'floor_shadow': 'Darkness limits your\nvisibility in rooms.',
      'floor_treasure': 'A vault full of riches!\nMore traps, better loot.'
    };

    // Room modifier buff descriptions
    const roomModifierDescriptions: Record<string, string> = {
      'room_curse': 'Cursed ground reduces\nyour armor and resist.',
      'room_bless': 'Blessed ground increases\nyour armor and crit.',
      'room_burning': 'Standing here deals\nperiodic fire damage.'
    };

    // Check for custom descriptions first
    if (floorThemeDescriptions[buff.id]) {
      lines.push(floorThemeDescriptions[buff.id]);
    } else if (roomModifierDescriptions[buff.id]) {
      lines.push(roomModifierDescriptions[buff.id]);
    } else if (buff.statModifiers) {
      const mods = buff.statModifiers;
      if (mods.health) lines.push(`+${mods.health} Health`);
      if (mods.mana) lines.push(`+${mods.mana} Mana`);
      if (mods.attackPower) lines.push(`+${mods.attackPower} Attack Power`);
      if (mods.spellPower) lines.push(`+${mods.spellPower} Spell Power`);
      if (mods.armor) lines.push(`${mods.armor > 0 ? '+' : ''}${mods.armor} Armor`);
      if (mods.crit) lines.push(`${mods.crit > 0 ? '+' : ''}${mods.crit}% Crit`);
      if (mods.haste) lines.push(`+${mods.haste}% Haste`);
      if (mods.lifesteal) lines.push(`+${mods.lifesteal}% Lifesteal`);
      if (mods.resist) lines.push(`${mods.resist > 0 ? '+' : ''}${mods.resist} Resist`);
    }

    // Duration info
    const duration = Math.ceil(buff.duration);
    if (duration > 0) {
      lines.push(`Duration: ${duration}s`);
    } else {
      lines.push('Passive');
    }

    desc.setText(lines.join('\n'));

    // Resize tooltip to fit content
    const padding = 12;
    const titleHeight = title.height;
    const descHeight = desc.height;
    const totalHeight = padding + titleHeight + 6 + descHeight + padding;
    const tooltipWidth = Math.max(180, Math.max(title.width, desc.width) + padding * 2);

    bgOuter.setSize(tooltipWidth, totalHeight);
    bgInner.setSize(tooltipWidth - 4, totalHeight - 4);

    // Position text
    title.setY(-totalHeight + padding);
    desc.setY(-totalHeight + padding + titleHeight + 6);

    // Adjust position to keep tooltip on screen
    // Tooltip has origin (0.5, 1) - centered horizontally, anchored at bottom
    const screenWidth = this.cameras.main.width;
    const screenHeight = this.cameras.main.height;
    const margin = 5;

    let finalX = x;
    let finalY = y;

    // Check horizontal bounds (tooltip extends tooltipWidth/2 in each direction from x)
    const leftEdge = finalX - tooltipWidth / 2;
    const rightEdge = finalX + tooltipWidth / 2;

    if (leftEdge < margin) {
      // Would go off left edge - shift right
      finalX = margin + tooltipWidth / 2;
    } else if (rightEdge > screenWidth - margin) {
      // Would go off right edge - shift left
      finalX = screenWidth - margin - tooltipWidth / 2;
    }

    // Check vertical bounds (tooltip extends upward from y by totalHeight)
    const topEdge = finalY - totalHeight;

    if (topEdge < margin) {
      // Would go off top - position below the trigger point instead
      finalY = y + totalHeight + 30; // Flip to below
    }
    if (finalY > screenHeight - margin) {
      // Would go off bottom
      finalY = screenHeight - margin;
    }

    this.buffTooltip.setPosition(finalX, finalY);
    this.buffTooltip.setVisible(true);
  }

  private createPlayerFrame(): void {
    const x = 10;
    const y = 10;
    const frameWidth = 220;
    const frameHeight = 95;

    // Create container for the entire frame
    this.playerFrame = this.add.container(x, y).setScrollFactor(0).setDepth(150);

    // Main background with gradient effect
    const frameBg = this.add.rectangle(0, 0, frameWidth, frameHeight, 0x0a0a14, 0.95).setOrigin(0, 0);
    frameBg.setStrokeStyle(2, COLORS.borderGold);
    this.playerFrame.add(frameBg);

    // Inner panel
    const innerBg = this.add.rectangle(3, 3, frameWidth - 6, frameHeight - 6, 0x12121f, 0.9).setOrigin(0, 0);
    innerBg.setStrokeStyle(1, 0x2a2a4a);
    this.playerFrame.add(innerBg);

    // Gold corner decorations
    const cornerGraphics = this.add.graphics();
    const cornerSize = 10;
    cornerGraphics.lineStyle(2, COLORS.borderGold);
    // Top-left
    cornerGraphics.beginPath();
    cornerGraphics.moveTo(0, cornerSize);
    cornerGraphics.lineTo(0, 0);
    cornerGraphics.lineTo(cornerSize, 0);
    cornerGraphics.strokePath();
    // Top-right
    cornerGraphics.beginPath();
    cornerGraphics.moveTo(frameWidth - cornerSize, 0);
    cornerGraphics.lineTo(frameWidth, 0);
    cornerGraphics.lineTo(frameWidth, cornerSize);
    cornerGraphics.strokePath();
    // Bottom-left
    cornerGraphics.beginPath();
    cornerGraphics.moveTo(0, frameHeight - cornerSize);
    cornerGraphics.lineTo(0, frameHeight);
    cornerGraphics.lineTo(cornerSize, frameHeight);
    cornerGraphics.strokePath();
    // Bottom-right
    cornerGraphics.beginPath();
    cornerGraphics.moveTo(frameWidth - cornerSize, frameHeight);
    cornerGraphics.lineTo(frameWidth, frameHeight);
    cornerGraphics.lineTo(frameWidth, frameHeight - cornerSize);
    cornerGraphics.strokePath();
    this.playerFrame.add(cornerGraphics);

    // Class icon placeholder (left side)
    const iconSize = 44;
    const iconX = 10;
    const iconY = 10;
    const iconBg = this.add.rectangle(iconX, iconY, iconSize, iconSize, 0x1a1a2e).setOrigin(0, 0);
    iconBg.setStrokeStyle(2, 0x3d3d5c);
    this.playerFrame.add(iconBg);

    // We'll add the actual class face icon dynamically when player data is available
    // Start with a placeholder text that will be replaced by an image
    const iconPlaceholder = this.add.text(iconX + iconSize / 2, iconY + iconSize / 2, '?', {
      fontFamily: FONTS.title,
      fontSize: '24px',
      color: '#666688'
    }).setOrigin(0.5);
    iconPlaceholder.setName('playerFrameIconText');
    this.playerFrame.add(iconPlaceholder);

    // Player name (right of icon)
    const textX = iconX + iconSize + 10;
    this.playerFrameNameText = this.add.text(textX, 10, 'Hero', {
      fontFamily: FONTS.title,
      fontSize: '14px',
      color: '#ffffff'
    }).setOrigin(0, 0);
    this.playerFrame.add(this.playerFrameNameText);

    // Level indicator (next to name)
    this.playerFrameLevelText = this.add.text(frameWidth - 10, 10, 'Lv.1', {
      fontFamily: FONTS.title,
      fontSize: '12px',
      color: '#ffd700'
    }).setOrigin(1, 0);
    this.playerFrame.add(this.playerFrameLevelText);

    // Health bar
    const barWidth = frameWidth - textX - 10;
    const barHeight = 14;
    const healthY = 28;

    const healthBg = this.add.rectangle(textX, healthY, barWidth, barHeight, 0x1a1a1a).setOrigin(0, 0);
    healthBg.setStrokeStyle(1, 0x333333);
    const healthFill = this.add.rectangle(textX, healthY, barWidth, barHeight, 0x22aa22).setOrigin(0, 0);
    this.playerFrameHealthBar = { bg: healthBg, fill: healthFill };
    this.playerFrame.add(healthBg);
    this.playerFrame.add(healthFill);

    this.playerFrameHealthText = this.add.text(textX + barWidth / 2, healthY + barHeight / 2, '100/100', {
      fontFamily: FONTS.body,
      fontSize: '10px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);
    this.playerFrame.add(this.playerFrameHealthText);

    // Mana bar
    const manaY = healthY + barHeight + 4;
    const manaBg = this.add.rectangle(textX, manaY, barWidth, barHeight, 0x1a1a2e).setOrigin(0, 0);
    manaBg.setStrokeStyle(1, 0x222244);
    const manaFill = this.add.rectangle(textX, manaY, barWidth, barHeight, 0x3366cc).setOrigin(0, 0);
    this.playerFrameManaBar = { bg: manaBg, fill: manaFill };
    this.playerFrame.add(manaBg);
    this.playerFrame.add(manaFill);

    this.playerFrameManaText = this.add.text(textX + barWidth / 2, manaY + barHeight / 2, '50/50', {
      fontFamily: FONTS.body,
      fontSize: '10px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);
    this.playerFrame.add(this.playerFrameManaText);

    // Bottom row: Floor and Lives
    const bottomY = manaY + barHeight + 8;

    // Floor indicator (left)
    this.playerFrameFloorText = this.add.text(10, bottomY, 'Floor 1', {
      fontFamily: FONTS.title,
      fontSize: '12px',
      color: '#aaaacc'
    }).setOrigin(0, 0);
    this.playerFrame.add(this.playerFrameFloorText);

    // Lives (right side) - using heart icons
    this.playerFrameLivesText = this.add.text(frameWidth - 10, bottomY, '♥♥♥♥♥', {
      fontFamily: FONTS.body,
      fontSize: '14px',
      color: '#ff6666'
    }).setOrigin(1, 0);
    this.playerFrame.add(this.playerFrameLivesText);

    // Also update the old livesText reference for compatibility
    this.livesText = this.playerFrameLivesText;
  }

  private updatePlayerFrame(player: any): void {
    if (!this.playerFrame) return;

    const frameWidth = 220;
    const iconSize = 44;
    const textX = 10 + iconSize + 10;
    const barWidth = frameWidth - textX - 10;

    // Update player name
    if (this.playerFrameNameText) {
      this.playerFrameNameText.setText(player.name);
      // Set name color based on class
      const classColors: Record<string, string> = {
        'Warrior': '#C79C6E',
        'Paladin': '#F58CBA',
        'Hunter': '#ABD473',
        'Rogue': '#FFF569',
        'Priest': '#FFFFFF',
        'Shaman': '#0070DE',
        'Mage': '#69CCF0',
        'Warlock': '#9482C9',
        'Druid': '#FF7D0A'
      };
      this.playerFrameNameText.setColor(classColors[player.classId] || '#ffffff');
    }

    // Update level
    if (this.playerFrameLevelText) {
      this.playerFrameLevelText.setText(`Lv.${player.level}`);
    }

    // Update health bar
    if (this.playerFrameHealthBar) {
      const healthPercent = player.stats.maxHealth > 0
        ? player.stats.health / player.stats.maxHealth
        : 0;
      this.playerFrameHealthBar.fill.width = Math.max(0, healthPercent * barWidth);

      // Color health bar based on percentage
      if (healthPercent <= 0.25) {
        this.playerFrameHealthBar.fill.setFillStyle(0xcc2222); // Red
      } else if (healthPercent <= 0.5) {
        this.playerFrameHealthBar.fill.setFillStyle(0xccaa22); // Yellow
      } else {
        this.playerFrameHealthBar.fill.setFillStyle(0x22aa22); // Green
      }
    }
    if (this.playerFrameHealthText) {
      this.playerFrameHealthText.setText(`${Math.ceil(player.stats.health)}/${player.stats.maxHealth}`);
    }

    // Update mana bar
    if (this.playerFrameManaBar) {
      const manaPercent = player.stats.maxMana > 0
        ? player.stats.mana / player.stats.maxMana
        : 0;
      this.playerFrameManaBar.fill.width = Math.max(0, manaPercent * barWidth);
    }
    if (this.playerFrameManaText) {
      this.playerFrameManaText.setText(`${Math.ceil(player.stats.mana)}/${player.stats.maxMana}`);
    }

    // Update class face icon if we have the texture
    if (player.classId) {
      const classKey = player.classId.toLowerCase();
      const faceTextureKey = `face_${classKey}`;

      // Check if we already have the face image added
      const existingFaceIcon = this.playerFrame.getByName('playerFrameFaceIcon') as Phaser.GameObjects.Image;
      const iconPlaceholder = this.playerFrame.getByName('playerFrameIconText') as Phaser.GameObjects.Text;

      if (!existingFaceIcon && this.textures.exists(faceTextureKey)) {
        // Hide the text placeholder
        if (iconPlaceholder) {
          iconPlaceholder.setVisible(false);
        }

        // Add the face image
        const iconSize = 44;
        const iconX = 10;
        const iconY = 10;
        const faceIcon = this.add.image(iconX + iconSize / 2, iconY + iconSize / 2, faceTextureKey);
        faceIcon.setDisplaySize(iconSize - 4, iconSize - 4); // Slight padding within the frame
        faceIcon.setName('playerFrameFaceIcon');
        this.playerFrame.add(faceIcon);
      } else if (!existingFaceIcon && iconPlaceholder) {
        // No face texture available, use emoji fallback
        const classIcons: Record<string, string> = {
          'warrior': '⚔',
          'paladin': '✝',
          'hunter': '🏹',
          'rogue': '🗡',
          'priest': '✙',
          'shaman': '⚡',
          'mage': '❄',
          'warlock': '🔥',
          'druid': '🌿'
        };
        iconPlaceholder.setText(classIcons[classKey] || '?');
        iconPlaceholder.setFontSize('28px');
      }
    }
  }

  /**
   * Creates the unified Navigator Panel - a cohesive HUD element containing:
   * - Minimap with styled frame (right side)
   * - Floor/room progress info
   * - Save and Leave text buttons (left side, stacked vertically)
   *
   * Buttons are added OUTSIDE the container to ensure clickability
   * (graphics redraw in container can interfere with hit areas)
   */
  private createNavigatorPanel(): void {
    const screenWidth = this.cameras.main.width;

    // Panel dimensions - horizontal layout
    const panelWidth = 200;
    const panelHeight = 110;
    const panelX = screenWidth - panelWidth - 10;
    const panelY = 10;

    // Create main container (for panel background and map only)
    this.navigatorPanel = this.add.container(panelX, panelY).setScrollFactor(0).setDepth(100);

    // Panel background
    const bg = this.add.rectangle(0, 0, panelWidth, panelHeight, COLORS.panelBg, 0.92).setOrigin(0, 0);
    bg.setStrokeStyle(2, COLORS.border);
    this.navigatorPanel.add(bg);

    // Gold corner decorations
    const corners = this.add.graphics();
    corners.lineStyle(2, COLORS.borderGold);
    const cornerSize = 10;
    // Top-left
    corners.beginPath();
    corners.moveTo(0, cornerSize);
    corners.lineTo(0, 0);
    corners.lineTo(cornerSize, 0);
    corners.strokePath();
    // Top-right
    corners.beginPath();
    corners.moveTo(panelWidth - cornerSize, 0);
    corners.lineTo(panelWidth, 0);
    corners.lineTo(panelWidth, cornerSize);
    corners.strokePath();
    // Bottom-left
    corners.beginPath();
    corners.moveTo(0, panelHeight - cornerSize);
    corners.lineTo(0, panelHeight);
    corners.lineTo(cornerSize, panelHeight);
    corners.strokePath();
    // Bottom-right
    corners.beginPath();
    corners.moveTo(panelWidth - cornerSize, panelHeight);
    corners.lineTo(panelWidth, panelHeight);
    corners.lineTo(panelWidth, panelHeight - cornerSize);
    corners.strokePath();
    this.navigatorPanel.add(corners);

    // === LEFT SIDE: Buttons and info ===
    const leftPadding = 10;
    const buttonWidth = 55;
    const buttonHeight = 26;
    const buttonGap = 6;

    // Floor info text (top left)
    this.navigatorFloorText = this.add.text(leftPadding, 10, 'Floor 1', {
      fontFamily: FONTS.title,
      fontSize: '13px',
      color: COLORS_HEX.goldLight
    }).setOrigin(0, 0);
    this.navigatorPanel.add(this.navigatorFloorText);

    this.navigatorRoomText = this.add.text(leftPadding, 26, '0/0 cleared', {
      fontFamily: FONTS.body,
      fontSize: '10px',
      color: COLORS_HEX.textMuted
    }).setOrigin(0, 0);
    this.navigatorPanel.add(this.navigatorRoomText);

    // === BUTTONS - Added directly to scene (not container) for reliable clicks ===
    const buttonsX = panelX + leftPadding;
    const buttonsY = panelY + 48;

    // Save button
    const saveBg = this.add.rectangle(buttonsX + buttonWidth / 2, buttonsY + buttonHeight / 2, buttonWidth, buttonHeight, COLORS.panelBgLight, 1)
      .setStrokeStyle(1, COLORS.border)
      .setScrollFactor(0)
      .setDepth(101);
    saveBg.setInteractive({ useHandCursor: true });

    const saveText = this.add.text(buttonsX + buttonWidth / 2, buttonsY + buttonHeight / 2, 'Save', {
      fontFamily: FONTS.title,
      fontSize: '11px',
      color: COLORS_HEX.textSecondary
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(101);

    saveBg.on('pointerover', () => {
      saveBg.setFillStyle(0x3a5a3a, 1);
      saveBg.setStrokeStyle(1, 0x4a7a4a);
      saveText.setColor('#ffffff');
    });
    saveBg.on('pointerout', () => {
      saveBg.setFillStyle(COLORS.panelBgLight, 1);
      saveBg.setStrokeStyle(1, COLORS.border);
      saveText.setColor(COLORS_HEX.textSecondary);
    });
    saveBg.on('pointerdown', () => this.saveGame());

    // Leave button
    const leaveY = buttonsY + buttonHeight + buttonGap;
    const leaveBg = this.add.rectangle(buttonsX + buttonWidth / 2, leaveY + buttonHeight / 2, buttonWidth, buttonHeight, COLORS.panelBgLight, 1)
      .setStrokeStyle(1, COLORS.border)
      .setScrollFactor(0)
      .setDepth(101);
    leaveBg.setInteractive({ useHandCursor: true });

    const leaveText = this.add.text(buttonsX + buttonWidth / 2, leaveY + buttonHeight / 2, 'Leave', {
      fontFamily: FONTS.title,
      fontSize: '11px',
      color: COLORS_HEX.textSecondary
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(101);

    leaveBg.on('pointerover', () => {
      leaveBg.setFillStyle(0x5a3a3a, 1);
      leaveBg.setStrokeStyle(1, 0x7a4a4a);
      leaveText.setColor('#ffffff');
    });
    leaveBg.on('pointerout', () => {
      leaveBg.setFillStyle(COLORS.panelBgLight, 1);
      leaveBg.setStrokeStyle(1, COLORS.border);
      leaveText.setColor(COLORS_HEX.textSecondary);
    });
    leaveBg.on('pointerdown', () => this.leaveGame());

    // === RIGHT SIDE: Minimap ===
    const mapSize = 85;
    const mapX = panelWidth - mapSize - 10;
    const mapY = (panelHeight - mapSize) / 2;

    // Minimap frame background
    const mapBg = this.add.rectangle(mapX, mapY, mapSize, mapSize, 0x0a0a15, 0.9).setOrigin(0, 0);
    mapBg.setStrokeStyle(1, COLORS.border);
    this.navigatorPanel.add(mapBg);

    // Minimap graphics (will be drawn in renderMinimap)
    this.minimapGraphics = this.add.graphics();
    this.navigatorPanel.add(this.minimapGraphics);
  }

  private createTargetInfoPanel(): void {
    // Position to the RIGHT of player frame with dynamic gap
    // Player frame: x=10, y=10, width=220, height=95
    const playerFrameX = 10;
    const playerFrameWidth = 220;
    const gap = 12; // Dynamic gap between panels
    const x = playerFrameX + playerFrameWidth + gap;
    const y = 10; // Same vertical position as player frame

    // Panel dimensions (slightly narrower to fit better)
    const panelWidth = 200;
    const panelHeight = 95; // Match player frame height

    this.targetInfoPanel = this.add.container(x, y).setScrollFactor(0).setDepth(100).setVisible(false);

    // Create background
    const bg = this.add.rectangle(0, 0, panelWidth, panelHeight, COLORS.panelBg, 0.92).setOrigin(0, 0);
    bg.setStrokeStyle(2, COLORS.border);
    bg.setName('targetPanelBg');
    this.targetInfoPanel.add(bg);

    // Gold corner decorations (matching player frame style)
    const cornerGraphics = this.add.graphics();
    const cornerSize = 10;
    cornerGraphics.lineStyle(2, COLORS.borderGold);
    // Top-left
    cornerGraphics.beginPath();
    cornerGraphics.moveTo(0, cornerSize);
    cornerGraphics.lineTo(0, 0);
    cornerGraphics.lineTo(cornerSize, 0);
    cornerGraphics.strokePath();
    // Top-right
    cornerGraphics.beginPath();
    cornerGraphics.moveTo(panelWidth - cornerSize, 0);
    cornerGraphics.lineTo(panelWidth, 0);
    cornerGraphics.lineTo(panelWidth, cornerSize);
    cornerGraphics.strokePath();
    // Bottom-left
    cornerGraphics.beginPath();
    cornerGraphics.moveTo(0, panelHeight - cornerSize);
    cornerGraphics.lineTo(0, panelHeight);
    cornerGraphics.lineTo(cornerSize, panelHeight);
    cornerGraphics.strokePath();
    // Bottom-right
    cornerGraphics.beginPath();
    cornerGraphics.moveTo(panelWidth - cornerSize, panelHeight);
    cornerGraphics.lineTo(panelWidth, panelHeight);
    cornerGraphics.lineTo(panelWidth, panelHeight - cornerSize);
    cornerGraphics.strokePath();
    cornerGraphics.setName('targetPanelCorners');
    this.targetInfoPanel.add(cornerGraphics);

    // Content padding
    const contentPadding = 10;
    const contentWidth = panelWidth - contentPadding * 2;

    // Enemy name (with max width to prevent overflow)
    this.targetNameText = this.add.text(contentPadding, 8, '', {
      fontFamily: FONTS.title,
      fontSize: '13px',
      color: '#ffffff',
      wordWrap: { width: contentWidth }
    });
    this.targetInfoPanel.add(this.targetNameText);

    // Enemy type description
    this.targetTypeText = this.add.text(contentPadding, 26, '', {
      fontFamily: FONTS.body,
      fontSize: '10px',
      color: '#aaaaaa',
      wordWrap: { width: contentWidth },
      lineSpacing: 1
    });
    this.targetInfoPanel.add(this.targetTypeText);

    // Boss mechanics/abilities text (position will be set dynamically)
    this.targetMechanicsText = this.add.text(contentPadding, 42, '', {
      fontFamily: FONTS.body,
      fontSize: '9px',
      color: '#ffcc66',
      wordWrap: { width: contentWidth },
      lineSpacing: 2
    });
    this.targetInfoPanel.add(this.targetMechanicsText);

    // Health bar (at bottom of panel)
    const healthBarY = panelHeight - 22;
    const healthBarWidth = contentWidth;
    const healthBarHeight = 12;
    const healthBg = this.add.rectangle(contentPadding, healthBarY, healthBarWidth, healthBarHeight, 0x333333).setOrigin(0, 0);
    const healthFill = this.add.rectangle(contentPadding, healthBarY, healthBarWidth, healthBarHeight, 0x22aa22).setOrigin(0, 0);
    healthBg.setName('healthBarBg');
    healthFill.setName('healthBarFill');
    this.targetHealthBar = { bg: healthBg, fill: healthFill };
    this.targetInfoPanel.add(healthBg);
    this.targetInfoPanel.add(healthFill);

    // Health text (centered on bar)
    this.targetHealthText = this.add.text(contentPadding + healthBarWidth / 2, healthBarY + healthBarHeight / 2, '', {
      fontFamily: FONTS.body,
      fontSize: '9px',
      color: '#ffffff'
    }).setOrigin(0.5, 0.5);
    this.targetInfoPanel.add(this.targetHealthText);
  }

  private createAbilityBar(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    const slotSize = 48;
    const gap = 8;
    const numSlots = 5;
    const totalWidth = numSlots * slotSize + (numSlots - 1) * gap;
    const startX = width / 2 - totalWidth / 2;
    const y = height - 40;

    // Create tooltip (hidden by default) - completely solid background for readability
    const tooltip = this.add.container(0, 0).setDepth(500).setScrollFactor(0).setVisible(false).setName('ability_tooltip');
    // Double-layered background for complete opacity - will be resized dynamically
    const tooltipBgOuter = this.add.rectangle(0, 0, 280, 140, COLORS.panelBg, 1.0).setOrigin(0.5, 1);
    tooltipBgOuter.setStrokeStyle(2, COLORS.borderGold);
    tooltipBgOuter.setName('tooltipBgOuter');
    const tooltipBg = this.add.rectangle(0, -2, 276, 136, 0x111122, 1.0).setOrigin(0.5, 1);
    tooltipBg.setName('tooltipBgInner');
    const tooltipTitle = this.add.text(0, -120, '', {
      fontFamily: FONTS.title,
      fontSize: '16px',
      color: COLORS_HEX.goldLight,
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5, 0).setName('tooltipTitle');
    const tooltipDesc = this.add.text(0, -95, '', {
      fontFamily: FONTS.body,
      fontSize: '14px',
      color: '#ffffff',
      wordWrap: { width: 260 },
      lineSpacing: 4,
      stroke: '#000000',
      strokeThickness: 1
    }).setOrigin(0.5, 0).setName('tooltipDesc');
    const tooltipCost = this.add.text(0, -22, '', {
      fontFamily: FONTS.body,
      fontSize: '14px',
      color: '#6699ff',
      stroke: '#000000',
      strokeThickness: 1
    }).setOrigin(0.5, 0).setName('tooltipCost');
    tooltip.add([tooltipBgOuter, tooltipBg, tooltipTitle, tooltipDesc, tooltipCost]);

    for (let i = 0; i < numSlots; i++) {
      const x = startX + i * (slotSize + gap);

      // Slot background using the ability frame asset
      const slot = this.add.image(x + slotSize / 2, y, 'ability_frame')
        .setScrollFactor(0)
        .setDepth(100)
        .setDisplaySize(slotSize, slotSize)
        .setName(`ability_slot_${i}`)
        .setInteractive();

      // Ability icon (inner colored square based on ability type)
      const iconSize = slotSize - 12;
      const abilityIcon = this.add.rectangle(x + slotSize / 2, y, iconSize, iconSize, 0x333333, 0.9)
        .setScrollFactor(0)
        .setDepth(99)
        .setName(`ability_icon_${i}`);

      // Ability symbol graphics (drawn on top of icon)
      const symbolGraphics = this.add.graphics()
        .setScrollFactor(0)
        .setDepth(100);
      symbolGraphics.setPosition(x + slotSize / 2, y);
      this.abilitySymbols.push(symbolGraphics);

      // Add hover events for tooltip
      slot.on('pointerover', () => {
        const abilities = this.abilitySystem?.getPlayerAbilities() ?? [];
        if (i < abilities.length) {
          const ability = abilities[i];
          tooltipTitle.setText(`${ability.name} (Rank ${ability.rank})`);
          tooltipDesc.setText(this.getAbilityDescription(ability.abilityId, ability.rank));
          tooltipCost.setText(`Mana: ${ability.manaCost} | Cooldown: ${ability.maxCooldown}s`);

          // Dynamically resize tooltip based on content
          const padding = 18;
          const titleHeight = tooltipTitle.height;
          const descHeight = tooltipDesc.height;
          const costHeight = tooltipCost.height;
          const totalHeight = padding + titleHeight + 8 + descHeight + 10 + costHeight + padding;
          const tooltipWidth = Math.max(250, Math.max(tooltipTitle.width, tooltipDesc.width) + padding * 2);

          // Update background sizes
          tooltipBgOuter.setSize(tooltipWidth, totalHeight);
          tooltipBg.setSize(tooltipWidth - 4, totalHeight - 4);

          // Reposition text elements from top
          tooltipTitle.setY(-totalHeight + padding);
          tooltipDesc.setY(-totalHeight + padding + titleHeight + 8);
          tooltipCost.setY(-padding - costHeight);

          tooltip.setPosition(x + slotSize / 2, y - slotSize / 2 - 10);
          tooltip.setVisible(true);
        }
      });

      slot.on('pointerout', () => {
        tooltip.setVisible(false);
      });

      // Click to cast ability
      slot.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (pointer.leftButtonDown()) {
          this.inputManager?.castAbility(i);
        }
      });

      // Keybind text
      this.add.text(x + 4, y - slotSize / 2 + 4, String(i + 1), {
        fontSize: '12px',
        color: '#ffff00'
      }).setScrollFactor(0).setDepth(104);

      // Cooldown overlay (dark semi-transparent)
      const cdOverlay = this.add.rectangle(x + slotSize / 2, y, slotSize - 4, slotSize - 4, 0x000000, 0.5)
        .setScrollFactor(0)
        .setDepth(102)
        .setVisible(false);
      this.cooldownOverlays.push(cdOverlay);

      // Radial cooldown indicator (pie chart style)
      const cdRadial = this.add.graphics()
        .setScrollFactor(0)
        .setDepth(102.5);
      cdRadial.setPosition(x + slotSize / 2, y);
      this.cooldownRadials.push(cdRadial);

      // Cooldown text (big number in center)
      const cdText = this.add.text(x + slotSize / 2, y, '', {
        fontSize: '18px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3
      }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(103);
      this.cooldownTexts.push(cdText);

      // Ability name text (below slot)
      this.add.text(x + slotSize / 2, y + slotSize / 2 + 2, '', {
        fontSize: '9px',
        color: '#aaaaaa'
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(101).setName(`ability_name_${i}`);
    }

    // Add potion quick slots to the right of ability bar
    const potionSlotSize = 40;
    const potionGap = 20;
    const potionStartX = startX + totalWidth + potionGap;

    // Health potion slot
    this.healthPotionSlot = this.add.container(potionStartX, y).setScrollFactor(0).setDepth(100);
    const hpBg = this.add.rectangle(0, 0, potionSlotSize, potionSlotSize, 0x661111, 0.9);
    hpBg.setStrokeStyle(2, 0xaa3333);
    hpBg.setInteractive({ useHandCursor: true });
    hpBg.on('pointerdown', () => this.usePotion(PotionType.Health));
    hpBg.on('pointerover', () => hpBg.setStrokeStyle(2, 0xff5555));
    hpBg.on('pointerout', () => hpBg.setStrokeStyle(2, 0xaa3333));
    const hpIcon = this.add.image(0, -2, 'potion_health').setScale(0.08).setOrigin(0.5);
    this.healthPotionCount = this.add.text(0, 14, '0', { fontSize: '12px', color: '#ffffff' }).setOrigin(0.5);
    this.healthPotionSlot.add([hpBg, hpIcon, this.healthPotionCount]);

    // Keybind for health potion (Q)
    this.add.text(potionStartX - potionSlotSize / 2 + 4, y - potionSlotSize / 2 + 2, 'Q', {
      fontSize: '10px',
      color: '#ffff00'
    }).setScrollFactor(0).setDepth(101);

    // Mana potion slot
    const manaX = potionStartX + potionSlotSize + 8;
    this.manaPotionSlot = this.add.container(manaX, y).setScrollFactor(0).setDepth(100);
    const mpBg = this.add.rectangle(0, 0, potionSlotSize, potionSlotSize, 0x111166, 0.9);
    mpBg.setStrokeStyle(2, 0x3333aa);
    mpBg.setInteractive({ useHandCursor: true });
    mpBg.on('pointerdown', () => this.usePotion(PotionType.Mana));
    mpBg.on('pointerover', () => mpBg.setStrokeStyle(2, 0x5555ff));
    mpBg.on('pointerout', () => mpBg.setStrokeStyle(2, 0x3333aa));
    const mpIcon = this.add.image(0, -2, 'potion_mana').setScale(0.08).setOrigin(0.5);
    this.manaPotionCount = this.add.text(0, 14, '0', { fontSize: '12px', color: '#ffffff' }).setOrigin(0.5);
    this.manaPotionSlot.add([mpBg, mpIcon, this.manaPotionCount]);

    // Keybind for mana potion (E)
    this.add.text(manaX - potionSlotSize / 2 + 4, y - potionSlotSize / 2 + 2, 'E', {
      fontSize: '10px',
      color: '#ffff00'
    }).setScrollFactor(0).setDepth(101);

    // Add keyboard shortcuts for potions
    this.input.keyboard?.on('keydown-Q', () => this.usePotion(PotionType.Health));
    this.input.keyboard?.on('keydown-E', () => this.usePotion(PotionType.Mana));
  }

  private createActionBars(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Calculate bar width to span from ability bar start to end of potion slots
    // Ability bar: 5 slots * 48 + 4 gaps * 8 = 272px
    // Potions: gap(20) + health(40/2=20 to center) + gap(8) + mana(40) = 88px to mana right edge
    // Total: 272 + 20 + 20 + 8 + 40 = 360px
    const abilityBarWidth = 272;
    const barWidth = 360;
    const barHeight = 10;

    // Calculate start position (same as ability bar start)
    const abilityBarStartX = width / 2 - abilityBarWidth / 2;
    const barCenterX = abilityBarStartX + barWidth / 2;

    // Action bar is at height - 40, with slot height of 48, so top edge is at height - 64
    const actionBarTop = height - 64;
    const padding = 12;

    // XP bar only (mana is now in player frame)
    const xpY = actionBarTop - padding;
    this.actionXpBarBg = this.add.rectangle(barCenterX, xpY, barWidth, barHeight, 0x1a1a1a)
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(100);
    this.actionXpBarBg.setStrokeStyle(1, 0x663399);

    this.actionXpBarFill = this.add.rectangle(abilityBarStartX, xpY, 0, barHeight, 0x9933ff)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(101);

    this.actionXpText = this.add.text(barCenterX, xpY, 'XP: 0 / 100', {
      fontSize: '10px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(102);

    // Hide mana bar elements (keep for compatibility but don't display)
    this.actionManaBarBg = this.add.rectangle(-100, -100, 1, 1, 0x000000).setVisible(false);
    this.actionManaBarFill = this.add.rectangle(-100, -100, 1, 1, 0x000000).setVisible(false);
    this.actionManaText = this.add.text(-100, -100, '').setVisible(false);
  }

  private getAbilityDescription(abilityId: string, rank: number = 1): string {
    // Migrate old ability IDs to new ones
    const ABILITY_MIGRATIONS: Record<string, string> = {
      'mage_frostbolt': 'mage_meditation',
      'mage_blizzard': 'mage_blaze',
      'rogue_backstab': 'rogue_stealth',
      'rogue_eviscerate': 'rogue_blind',
      'shaman_bolt': 'shaman_chainlight',
      'paladin_consecration': 'paladin_retribution',
    };
    const migratedId = ABILITY_MIGRATIONS[abilityId] ?? abilityId;

    const abilityInfo = getAbilityById(migratedId);
    if (!abilityInfo) return 'Unknown ability';

    const ability = abilityInfo.ability;
    const player = wsClient.getCurrentPlayer();

    let description = ability.description;

    // Dynamic descriptions for abilities that scale with rank
    if (migratedId === 'mage_meditation') {
      // 50% base + 5% per rank (50/55/60/65/70% at ranks 1-5)
      const manaPercent = 50 + (rank - 1) * 5;
      description = `Enter a meditative state to quickly restore ${manaPercent}% of max mana.`;
    } else if (migratedId === 'mage_blaze') {
      // 15% damage increase per rank
      const damageBonus = (rank - 1) * 15;
      description = `Fire that bounces between enemies, hitting up to 5 targets.${damageBonus > 0 ? ` +${damageBonus}% damage.` : ''}`;
    } else if (migratedId === 'rogue_vanish') {
      const duration = 4 + rank;
      description = `Vanish from sight for ${duration}s, dropping all threat. Next attack deals +50% damage.`;
    } else if (migratedId === 'rogue_stealth') {
      const duration = 8 + rank * 2;
      description = `Enter stealth for ${duration}s. Next Sinister Strike deals double damage.`;
    } else if (migratedId === 'shaman_ancestral') {
      const charges = 2 + rank;
      const duration = 6 + rank * 2;
      description = `Ancestral spirits protect you for ${duration}s. Heals when hit (${charges} charges).`;
    } else if (migratedId === 'warrior_bloodlust') {
      const healPercent = 15 + rank * 5;
      const duration = 8 + rank * 2;
      description = `Enter a bloodthirsty rage for ${duration}s. Heal ${healPercent}% of damage dealt.\nEnables Whirlwind combo!`;
    } else if (migratedId === 'rogue_blind') {
      const duration = 6 + rank * 2; // 8/10/12/14/16s
      description = `Blinds the target with a powder, stunning them for ${duration} seconds.`;
    } else if (migratedId === 'paladin_judgment') {
      const stunDuration = 1 + rank; // 2/3/4/5/6s
      description = `Call down holy judgment on all enemies, dealing damage and stunning them for ${stunDuration} seconds.\nEnables Crusader Strike combo!`;
    } else if (migratedId === 'paladin_retribution') {
      const reflectDamage = 5 + rank * 5; // 10/15/20/25/30
      description = `Activate a holy aura that reflects ${reflectDamage} damage to attackers.`;
    } else if (migratedId === 'paladin_strike') {
      description = `A holy-infused melee attack.\nCOMBO: +50% damage and 30% self-heal on Judgment-stunned targets!`;
    } else if (migratedId === 'warrior_whirlwind') {
      description = `Spin and hit all nearby enemies with devastating force.\nCOMBO: +25% healing during Bloodlust!`;
    } else if (migratedId === 'mage_fireball') {
      description = `Hurl a ball of fire at the enemy.\nCOMBO: +50% damage on Pyroblast-stunned targets!`;
    } else if (migratedId === 'mage_blaze') {
      const damageBonus = (rank - 1) * 15;
      description = `Fire bounces between enemies, hitting up to 5 targets.${damageBonus > 0 ? ` +${damageBonus}% damage.` : ''}\nCOMBO: Stuns all enemies if primary target is Pyroblast-stunned!`;
    } else if (migratedId === 'warlock_drain') {
      description = `Drain health from target, healing yourself and your Imp (50%).\nCOMBO: Drains ALL burning enemies if target has Hellfire!`;
    } else if (migratedId === 'mage_pyroblast') {
      description = `Massive fireball that stuns the target for 3 seconds.\nEnables Fireball and Blaze combos!`;
    } else if (migratedId === 'warlock_hellfire') {
      description = `Burn all nearby enemies with demonic fire. Leaves them burning for additional damage.\nEnables Drain Life combo!`;
    } else if (migratedId === 'warlock_summon_imp') {
      // Calculate Imp stats based on floor and rank
      const floor = wsClient.currentState?.floor ?? 1;
      const rankBonus = 1 + (rank - 1) * 0.1; // 10% per rank
      const baseHealth = 100 + floor * 10;
      const baseSpell = 12 + floor * 3;
      const impHealth = Math.round(baseHealth * rankBonus);
      const impDamage = Math.round(baseSpell * rankBonus);
      description = `Summon a demonic imp that attacks with fire magic and taunts nearby foes every 5s.\nImp HP: ${impHealth} | Damage: ${impDamage}`;
    }

    // Add damage/heal info if player stats are available
    if (player) {
      const { attackPower, spellPower } = player.stats;

      if (ability.baseDamage && migratedId !== 'mage_blaze') {
        const dmg = calculateAbilityDamage(ability.baseDamage, rank, attackPower, spellPower);
        description += `\nDamage: ${dmg.min}-${dmg.max}`;
      }

      if (ability.baseHeal) {
        const heal = calculateAbilityHeal(ability.baseHeal, rank, spellPower);
        description += `\nHeals: ${heal.min}-${heal.max}`;
      }
    }

    return description;
  }

  private updateFrameCount = 0;
  update(time: number, delta: number): void {
    // Log every 300 frames (about every 5 seconds at 60fps)
    this.updateFrameCount++;
    if (this.updateFrameCount % 300 === 0) {
      console.log('[DEBUG] GameScene update() frame', this.updateFrameCount, 'active scenes:', this.scene.manager.getScenes(true).map(s => s.scene.key));
    }

    // Update input
    this.inputManager?.update();

    // Process ability key presses
    for (let i = 0; i < 5; i++) {
      if (this.inputManager?.isAbilityKeyJustPressed(i)) {
        this.inputManager.castAbility(i);
      }
    }

    // Space to advance floor
    if (this.inputManager?.isSpaceJustPressed()) {
      const state = wsClient.currentState;
      if (state?.dungeon.bossDefeated) {
        wsClient.advanceFloor();
      }
    }

    // Update world rendering
    this.renderWorld();

    // Update UI
    this.updateUI();

    // Clean up old damage texts
    this.cleanupDamageTexts();
  }

  private renderWorld(): void {
    const state = wsClient.currentState;
    if (!state) return;

    // CRITICAL: Validate state belongs to current run to prevent rendering stale floor data
    if (wsClient.runId && state.runId !== wsClient.runId) {
      console.warn('[DEBUG] renderWorld skipped - stale state detected:', state.runId, 'vs', wsClient.runId);
      return;
    }

    // Update floor text (legacy, hidden)
    if (this.floorText) {
      this.floorText.setText(`Floor: ${state.floor}`);
    }

    // Update player frame floor indicator
    if (this.playerFrameFloorText) {
      this.playerFrameFloorText.setText(`Floor ${state.floor}`);
    }

    // Update level display (top left corner)
    const currentPlayer = wsClient.getCurrentPlayer();
    if (currentPlayer) {
      if (this.levelText) {
        this.levelText.setText(`Level: ${currentPlayer.level}`);
      }

      // Update player frame
      this.updatePlayerFrame(currentPlayer);

      // Update XP bar (spans from abilities to end of potions: 360px)
      const xpBarWidth = 360;
      if (this.actionXpBarFill && this.actionXpText) {
        const xpPercent = currentPlayer.xpToNextLevel > 0
          ? currentPlayer.xp / currentPlayer.xpToNextLevel
          : 0;
        this.actionXpBarFill.width = Math.max(0, xpPercent * xpBarWidth);
        this.actionXpText.setText(`XP: ${currentPlayer.xp} / ${currentPlayer.xpToNextLevel}`);
      }

      // Detect player death (before updating lives display so it shows new count)
      if (!currentPlayer.isAlive && this.wasAlive) {
        // Player just died - show death screen flash, play death sound and animation
        this.showDeathScreenFlash();
        this.playSfx(Math.random() < 0.5 ? 'sfxDeath1' : 'sfxDeath2');

        // Play death animation with bones and fade out player sprite
        const playerSprite = this.playerSprites.get(currentPlayer.id);
        this.playDeathAnimation(currentPlayer.position.x, currentPlayer.position.y, playerSprite);
        this.playExecuteEffect(currentPlayer.position.x, currentPlayer.position.y, false);

        const characterDeleted = wsClient.handlePlayerDeath();

        // Add death to activity feed
        const state = wsClient.currentState;
        addActivity({
          type: 'death',
          playerName: currentPlayer.name,
          classId: currentPlayer.classId,
          floor: state?.dungeon.floor ?? 1
        });

        if (characterDeleted) {
          // Character out of lives - return to menu
          this.showNotification('CHARACTER DELETED - Out of lives!', undefined, 'danger');
          this.time.delayedCall(2000, () => {
            // CRITICAL: Clear WebSocket state to prevent stale dungeon data
            // Without this, the next character creation may render the OLD dungeon
            // while enemies spawn at NEW positions (causing "invisible room" bug)
            wsClient.disconnect();
            wsClient.runId = null;
            wsClient.playerId = null;
            wsClient.currentState = null;

            this.shutdown();
            this.scene.start('MenuScene');
            this.scene.stop('GameScene');
          });
        } else {
          this.showNotification(`You died! ${wsClient.getLives()} lives remaining`, undefined, 'danger');
        }
      }
      this.wasAlive = currentPlayer.isAlive;

      // Update lives display (after death detection so it shows updated count)
      const lives = wsClient.getLives();
      if (this.livesText) {
        this.livesText.setText('♥'.repeat(lives) + '♡'.repeat(Math.max(0, 5 - lives)));
        this.livesText.setColor(lives <= 1 ? '#ff4444' : (lives <= 2 ? '#ffaa00' : '#ff6666'));
      }

      // Check for level up (skip on first update when previousPlayerLevel is 0)
      if (this.previousPlayerLevel > 0 && currentPlayer.level > this.previousPlayerLevel) {
        this.playLevelUpSound();
        this.showLevelUpAnimation(currentPlayer.level);
      }
      this.previousPlayerLevel = currentPlayer.level;

      // Check for footstep sounds and movement animation (player is moving)
      const dx = currentPlayer.position.x - this.previousPlayerPos.x;
      const dy = currentPlayer.position.y - this.previousPlayerPos.y;
      const distMoved = Math.sqrt(dx * dx + dy * dy);

      // Use input state to detect movement (more reliable than position changes)
      const inputMoving = this.inputManager &&
        (this.inputManager.currentInput.moveX !== 0 || this.inputManager.currentInput.moveY !== 0);

      const wasMoving = this.isPlayerMoving;
      this.isPlayerMoving = inputMoving || false;

      if (distMoved > 2) {
        // Play footstep sound when actually moving
        const now = Date.now();
        if (now - this.lastFootstepTime > this.footstepCooldown) {
          this.playSfx('sfxFootstep');
          this.lastFootstepTime = now;
        }
      }

      // Handle movement animation for classes that have movement animations
      const classId = currentPlayer.classId;
      if (this.classMovementScales[classId]) {
        if (this.isPlayerMoving && !wasMoving) {
          // Started moving - play animation once, let Phaser loop it
          this.playMovementAnimation(currentPlayer.id, classId, true);
        } else if (!this.isPlayerMoving && wasMoving) {
          // Stopped moving - stop animation
          this.playMovementAnimation(currentPlayer.id, classId, false);
        }
        // Note: Animation maintenance while moving is handled in renderPlayers
        // to catch any cases where the animation was interrupted

        // Update facing direction based on movement
        if (this.inputManager) {
          this.updatePlayerDirection(currentPlayer.id, this.inputManager.currentInput.moveX);
        }
      }

      this.previousPlayerPos = { x: currentPlayer.position.x, y: currentPlayer.position.y };
    }

    // Handle music based on current room, theme, and player class
    this.updateMusic(state.dungeon.rooms, state.dungeon.currentRoomId, state.dungeon.theme);

    // Render rooms with theme
    this.renderRooms(state.dungeon.rooms, state.dungeon.currentRoomId, state.dungeon.theme);

    // Render enemies
    this.renderEnemies(state.dungeon.rooms);

    // Render ground items
    this.renderGroundItems(state.dungeon.rooms);

    // Render traps and chests
    this.renderTraps(state.dungeon.rooms);
    this.renderChests(state.dungeon.rooms);

    // Render players
    this.renderPlayers(state.players);

    // Render pets
    this.renderPets(state.pets);

    // Render vendors
    this.renderVendors(state.dungeon.rooms);

    // Render ground effects
    this.renderGroundEffects(state.groundEffects || []);

    // Update shadow overlay for Shadow theme fog of war
    this.updateShadowOverlay(state.dungeon.theme, state.dungeon.themeModifiers);

    // Update camera to follow current player
    const playerForCamera = wsClient.getCurrentPlayer();
    if (playerForCamera) {
      this.cameras.main.centerOn(playerForCamera.position.x, playerForCamera.position.y);
    }

    // Render minimap
    this.renderMinimap(state.dungeon.rooms, state.dungeon.currentRoomId);

    // Show advance button if boss defeated
    this.advanceButton?.setVisible(state.dungeon.bossDefeated);

    // Render target indicator
    this.renderTargetIndicator(state.dungeon.rooms);
  }

  private renderTargetIndicator(rooms: Room[]): void {
    if (!this.targetIndicator) return;

    const targetId = this.inputManager?.targetEntityId;

    // Check if target cleared
    if (!targetId) {
      if (this.cachedTargetId !== null) {
        this.targetIndicator.clear();
        this.cachedTargetId = null;
        this.cachedTargetPosition = null;
      }
      return;
    }

    // Find target enemy
    for (const room of rooms) {
      const enemy = room.enemies.find(e => e.id === targetId && e.isAlive);
      if (enemy) {
        // Check if target or position changed
        const posChanged = !this.cachedTargetPosition ||
          this.cachedTargetPosition.x !== enemy.position.x ||
          this.cachedTargetPosition.y !== enemy.position.y;
        const targetChanged = this.cachedTargetId !== targetId;

        // Skip redraw if nothing changed
        if (!targetChanged && !posChanged) return;

        // Update cache
        this.cachedTargetId = targetId;
        this.cachedTargetPosition = { x: enemy.position.x, y: enemy.position.y };

        // Clear and redraw
        this.targetIndicator.clear();

        const size = enemy.isBoss ? 40 : 24;

        this.targetIndicator.lineStyle(3, 0xff0000, 0.8);
        this.targetIndicator.strokeCircle(enemy.position.x, enemy.position.y, size);

        // Draw corner brackets
        this.targetIndicator.lineStyle(2, 0xffff00, 1);
        const corners = [
          { x: -size, y: -size, dx: 10, dy: 0 },
          { x: -size, y: -size, dx: 0, dy: 10 },
          { x: size, y: -size, dx: -10, dy: 0 },
          { x: size, y: -size, dx: 0, dy: 10 },
          { x: -size, y: size, dx: 10, dy: 0 },
          { x: -size, y: size, dx: 0, dy: -10 },
          { x: size, y: size, dx: -10, dy: 0 },
          { x: size, y: size, dx: 0, dy: -10 },
        ];

        for (const c of corners) {
          this.targetIndicator.lineBetween(
            enemy.position.x + c.x,
            enemy.position.y + c.y,
            enemy.position.x + c.x + c.dx,
            enemy.position.y + c.y + c.dy
          );
        }
        return;
      }
    }

    // Target not found (dead or removed) - clear indicator
    if (this.cachedTargetId !== null) {
      this.targetIndicator.clear();
      this.cachedTargetId = null;
      this.cachedTargetPosition = null;
    }
  }

  private updateShadowOverlay(theme: FloorTheme, themeModifiers: FloorThemeModifiers): void {
    if (!this.shadowOverlay) return;

    // Only show overlay for Shadow theme
    if (theme !== FloorTheme.Shadow) {
      this.shadowOverlay.setVisible(false);
      return;
    }

    // Get current player position
    const player = wsClient.getCurrentPlayer();
    if (!player) {
      this.shadowOverlay.setVisible(false);
      return;
    }

    this.shadowOverlay.setVisible(true);
    this.shadowOverlay.clear();

    // Get camera/screen dimensions
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Visibility radius - center of screen since overlay is fixed to camera
    const visibilityRadius = themeModifiers.visibilityRadius || 150;
    const centerX = width / 2;
    const centerY = height / 2;

    // Create fog of war effect using a gradient-like approach
    // Dark outer layer
    this.shadowOverlay.fillStyle(0x000000, 0.85);
    this.shadowOverlay.fillRect(0, 0, width, height);

    // Cut out a circular area around the player (center of screen)
    // We'll use a series of circles to create a gradient fade effect
    const gradientSteps = 5;
    for (let i = gradientSteps; i >= 0; i--) {
      const radius = visibilityRadius * (1 + (i * 0.2));
      const alpha = 0.85 - ((gradientSteps - i) * 0.17);

      // Clear the area and redraw with less opacity
      this.shadowOverlay.fillStyle(0x000000, Math.max(0, alpha));
      this.shadowOverlay.fillCircle(centerX, centerY, radius);
    }

    // Clear the center completely for visibility
    this.shadowOverlay.fillStyle(0x000000, 0);
    // Use blendMode to create the cutout effect
    this.shadowOverlay.setBlendMode(Phaser.BlendModes.DESTINATION_OUT);
    this.shadowOverlay.fillCircle(centerX, centerY, visibilityRadius);
    this.shadowOverlay.setBlendMode(Phaser.BlendModes.NORMAL);

    // Add an eerie purple/dark tint around the edges
    this.shadowOverlay.lineStyle(3, 0x4a0080, 0.5);
    this.shadowOverlay.strokeCircle(centerX, centerY, visibilityRadius + 5);
  }

  private renderRooms(rooms: Room[], currentRoomId: string, theme?: FloorTheme): void {
    if (!this.roomGraphics) return;

    this.roomGraphics.clear();
    const activeRoomIds = new Set<string>();
    const decoScale = 0.15; // Scale for decorations
    const currentTheme = theme || FloorTheme.Crypt;

    for (const room of rooms) {
      activeRoomIds.add(room.id);

      // Highlight current room
      const isCurrent = room.id === currentRoomId;
      const alpha = isCurrent ? 1 : 0.5;

      // Create or update tiled floor
      let tileSprite = this.roomTiles.get(room.id);
      if (!tileSprite) {
        // Choose tile texture based on theme and room type
        const tileTexture = this.getThemedTileTexture(currentTheme, room.type);

        // Create TileSprite for floor at actual display size to avoid WebGL texture limits
        tileSprite = this.add.tileSprite(
          room.x + room.width / 2,
          room.y + room.height / 2,
          room.width,
          room.height,
          tileTexture
        );
        // Scale the tile pattern within the sprite (themed tiles are ~238px, we want ~64px)
        tileSprite.setTileScale(0.27, 0.27);
        tileSprite.setDepth(0);
        this.roomTiles.set(room.id, tileSprite);

        // Add decorations to room (only once when room is created)
        this.addRoomDecorations(room, decoScale, currentTheme);
      }
      tileSprite.setAlpha(alpha);

      // Update decoration alpha
      const decos = this.roomDecorations.get(room.id);
      if (decos) {
        decos.forEach(d => d.setAlpha(alpha));
      }

      // Update wall alpha
      const walls = this.roomWalls.get(room.id);
      if (walls) {
        walls.forEach(w => w.setAlpha(alpha));
      }

      // Room modifier visual overlays
      if (room.modifier && isCurrent) {
        let overlay = this.roomModifierOverlays.get(room.id);
        if (!overlay) {
          // Create overlay based on modifier type
          let color = 0x000000;
          let overlayAlpha = 0.2;

          switch (room.modifier) {
            case 'dark':
              color = 0x1a1a2e; // Dark blue-black
              overlayAlpha = 0.5;
              break;
            case 'burning':
              color = 0xff4400; // Orange-red
              overlayAlpha = 0.15;
              break;
            case 'cursed':
              color = 0x8b00ff; // Purple
              overlayAlpha = 0.2;
              break;
            case 'blessed':
              color = 0xffd700; // Gold
              overlayAlpha = 0.15;
              break;
          }

          overlay = this.add.rectangle(
            room.x + room.width / 2,
            room.y + room.height / 2,
            room.width,
            room.height,
            color,
            overlayAlpha
          );
          overlay.setDepth(1); // Above floor, below entities
          this.roomModifierOverlays.set(room.id, overlay);
        }
        overlay.setVisible(true);
      } else {
        // Hide modifier overlay when not in room
        const overlay = this.roomModifierOverlays.get(room.id);
        if (overlay) {
          overlay.setVisible(false);
        }
      }

      // Draw connections (corridors) with tiled path
      for (const connectedId of room.connectedTo) {
        const other = rooms.find(r => r.id === connectedId);
        if (other && room.id < other.id) { // Only draw once
          const corridorKey = `corridor_${room.id}_${connectedId}`;

          // Create corridor elements if they don't exist
          if (!this.corridorElements.has(corridorKey)) {
            const elements: Phaser.GameObjects.GameObject[] = [];

            // Calculate corridor geometry
            const fromX = room.x + room.width / 2;
            const fromY = room.y + room.height / 2;
            const toX = other.x + other.width / 2;
            const toY = other.y + other.height / 2;

            const dx = toX - fromX;
            const dy = toY - fromY;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);
            const midX = (fromX + toX) / 2;
            const midY = (fromY + toY) / 2;

            // Perpendicular direction for walls
            const perpX = -Math.sin(angle);
            const perpY = Math.cos(angle);

            const corridorWidth = 50;
            const wallOffset = corridorWidth / 2 + 8;

            // Create corridor floor tiles using themed tile
            const corridorFloorTexture = this.getThemedTileTexture(currentTheme, 'normal');

            // Create TileSprite at actual display size to avoid WebGL texture size limits
            const corridorFloor = this.add.tileSprite(
              midX,
              midY,
              length,
              corridorWidth,
              corridorFloorTexture
            );
            // Scale the tile pattern within the sprite
            corridorFloor.setTileScale(0.14, 0.14);
            corridorFloor.setRotation(angle);
            corridorFloor.setDepth(-1);
            elements.push(corridorFloor);

            // Add walls along corridor sides using themed walls
            const wallHeight = 4;
            const corridorWallTexture = this.getThemedWallTexture(currentTheme, 'horizontal');

            // Left wall
            const leftWall = this.add.tileSprite(
              midX + perpX * wallOffset,
              midY + perpY * wallOffset,
              length,
              wallHeight,
              corridorWallTexture
            );
            leftWall.setTileScale(0.10, 0.10);
            leftWall.setRotation(angle);
            leftWall.setDepth(1);
            elements.push(leftWall);

            // Right wall
            const rightWall = this.add.tileSprite(
              midX - perpX * wallOffset,
              midY - perpY * wallOffset,
              length,
              wallHeight,
              corridorWallTexture
            );
            rightWall.setTileScale(0.10, 0.10);
            rightWall.setRotation(angle);
            rightWall.setDepth(1);
            elements.push(rightWall);

            this.corridorElements.set(corridorKey, elements);
          }
        }
      }

      // Draw cleared indicator
      if (room.cleared && room.type !== 'start') {
        this.roomGraphics.fillStyle(0x00ff00, 0.1);
        this.roomGraphics.fillRect(room.x, room.y, room.width, room.height);
      }
    }

    // Clean up tiles, decorations, and walls for rooms that no longer exist
    for (const [key, item] of this.roomTiles) {
      if (!activeRoomIds.has(key)) {
        item.destroy();
        this.roomTiles.delete(key);
      }
    }
    for (const [key, items] of this.roomDecorations) {
      if (!activeRoomIds.has(key)) {
        items.forEach(i => i.destroy());
        this.roomDecorations.delete(key);
      }
    }
    for (const [key, items] of this.roomWalls) {
      if (!activeRoomIds.has(key)) {
        items.forEach(i => i.destroy());
        this.roomWalls.delete(key);
      }
    }
    // Clean up corridor elements for connections that no longer exist
    // Corridor keys have format: corridor_room_floor_idx_room_floor_idx2
    // We check if any active room ID is part of the corridor key
    for (const [key, elements] of this.corridorElements) {
      let hasActiveRoom = false;
      for (const roomId of activeRoomIds) {
        if (key.includes(roomId)) {
          hasActiveRoom = true;
          break;
        }
      }
      if (!hasActiveRoom) {
        elements.forEach(el => el.destroy());
        this.corridorElements.delete(key);
      }
    }
  }

  // Get themed tile texture based on floor theme and room type
  private getThemedTileTexture(theme: FloorTheme, roomType: string): string {
    const tileCounts: Record<FloorTheme, number> = {
      [FloorTheme.Crypt]: 3,
      [FloorTheme.Inferno]: 3,
      [FloorTheme.Swamp]: 3,
      [FloorTheme.Frozen]: 3,
      [FloorTheme.Shadow]: 2,
      [FloorTheme.Treasure]: 2,
    };

    const maxTiles = tileCounts[theme] || 3;

    // Different tile variants for different room types
    let tileIndex: number;
    switch (roomType) {
      case 'boss':
        tileIndex = maxTiles; // Use last/special tile for boss
        break;
      case 'rare':
        tileIndex = Math.min(maxTiles, 2); // Use 2nd tile for rare
        break;
      case 'start':
        tileIndex = 1; // Use first tile for start
        break;
      default:
        tileIndex = Math.floor(Math.random() * maxTiles) + 1; // Random for normal
    }

    return `tile_${theme}_${tileIndex}`;
  }

  // Get themed wall texture
  private getThemedWallTexture(theme: FloorTheme, orientation: 'horizontal' | 'vertical'): string {
    // Crypt, inferno, swamp, and frozen have custom walls
    const themedWalls = [FloorTheme.Crypt, FloorTheme.Inferno, FloorTheme.Swamp, FloorTheme.Frozen];
    if (themedWalls.includes(theme)) {
      return `wall_${theme}_${orientation}`;
    }
    // Fallback to default walls for other themes
    return `wall_${orientation}`;
  }

  // Get themed decoration textures
  private getThemedDecorations(theme: FloorTheme): { torch: string; barrel: string; misc: string } {
    const decorations: Record<FloorTheme, { torch: string; barrel: string; misc: string }> = {
      [FloorTheme.Crypt]: { torch: 'deco_crypt_tomb', barrel: 'deco_crypt_bones', misc: 'deco_crypt_tomb' },
      [FloorTheme.Inferno]: { torch: 'deco_inferno_fire1', barrel: 'deco_inferno_fire2', misc: 'deco_inferno_fire1' },
      [FloorTheme.Swamp]: { torch: 'deco_swamp_mushroom', barrel: 'deco_swamp_barrel', misc: 'deco_swamp_wood' },
      [FloorTheme.Frozen]: { torch: 'deco_frozen_crystal', barrel: 'deco_frozen_barrel', misc: 'deco_frozen_crystal2' },
      [FloorTheme.Shadow]: { torch: 'torch_1', barrel: 'deco_barrel', misc: 'torch_1' },
      [FloorTheme.Treasure]: { torch: 'torch_1', barrel: 'deco_barrel', misc: 'chest_closed_1' },
    };
    return decorations[theme] || decorations[FloorTheme.Crypt];
  }

  private addRoomDecorations(room: Room, scale: number, theme: FloorTheme = FloorTheme.Crypt): void {
    const decorations: Phaser.GameObjects.Sprite[] = [];
    const walls: Phaser.GameObjects.TileSprite[] = [];
    const padding = 20;
    const wallScale = 0.12;
    const wallThickness = 16; // Visual thickness of wall
    const themedDecos = this.getThemedDecorations(theme);

    // Get themed wall textures
    const horizontalWallTexture = this.getThemedWallTexture(theme, 'horizontal');
    const verticalWallTexture = this.getThemedWallTexture(theme, 'vertical');

    // Add walls around the room edges
    // Top wall (horizontal)
    const topWall = this.add.tileSprite(
      room.x + room.width / 2,
      room.y - wallThickness / 2,
      room.width / wallScale + 40,
      50,
      horizontalWallTexture
    );
    topWall.setScale(wallScale);
    topWall.setDepth(2);
    walls.push(topWall);

    // Bottom wall (horizontal)
    const bottomWall = this.add.tileSprite(
      room.x + room.width / 2,
      room.y + room.height + wallThickness / 2,
      room.width / wallScale + 40,
      50,
      horizontalWallTexture
    );
    bottomWall.setScale(wallScale);
    bottomWall.setDepth(2);
    walls.push(bottomWall);

    // Left wall (vertical)
    const leftWall = this.add.tileSprite(
      room.x - wallThickness / 2,
      room.y + room.height / 2,
      50,
      room.height / wallScale + 40,
      verticalWallTexture
    );
    leftWall.setScale(wallScale);
    leftWall.setDepth(2);
    walls.push(leftWall);

    // Right wall (vertical)
    const rightWall = this.add.tileSprite(
      room.x + room.width + wallThickness / 2,
      room.y + room.height / 2,
      50,
      room.height / wallScale + 40,
      verticalWallTexture
    );
    rightWall.setScale(wallScale);
    rightWall.setDepth(2);
    walls.push(rightWall);

    this.roomWalls.set(room.id, walls);

    // Use room id hash for deterministic random placement
    const roomHash = room.id.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    const seededRandom = (seed: number) => {
      const x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    };

    // Possible decoration positions (corners, edges, center-ish)
    const allPositions = [
      { x: room.x + padding, y: room.y + padding },                           // top-left
      { x: room.x + room.width - padding, y: room.y + padding },              // top-right
      { x: room.x + padding, y: room.y + room.height - padding },             // bottom-left
      { x: room.x + room.width - padding, y: room.y + room.height - padding },// bottom-right
      { x: room.x + room.width / 2, y: room.y + padding },                    // top-center
      { x: room.x + room.width / 2, y: room.y + room.height - padding },      // bottom-center
      { x: room.x + padding, y: room.y + room.height / 2 },                   // left-center
      { x: room.x + room.width - padding, y: room.y + room.height / 2 },      // right-center
    ];

    // Randomly select 3-6 positions based on room hash
    const numDecorations = 3 + Math.floor(seededRandom(roomHash) * 4); // 3-6 decorations
    const selectedIndices: number[] = [];

    for (let i = 0; i < numDecorations && selectedIndices.length < allPositions.length; i++) {
      let idx = Math.floor(seededRandom(roomHash + i * 17) * allPositions.length);
      // Avoid duplicates
      while (selectedIndices.includes(idx)) {
        idx = (idx + 1) % allPositions.length;
      }
      selectedIndices.push(idx);
    }

    // Available decoration textures for this theme
    const decoTextures = [themedDecos.torch, themedDecos.barrel, themedDecos.misc].filter(
      tex => this.textures.exists(tex)
    );
    if (decoTextures.length === 0) {
      decoTextures.push('deco_barrel'); // fallback
    }

    // Place decorations at selected positions with varied textures
    for (let i = 0; i < selectedIndices.length; i++) {
      const pos = allPositions[selectedIndices[i]];
      const textureIdx = Math.floor(seededRandom(roomHash + i * 31) * decoTextures.length);
      const texture = decoTextures[textureIdx];

      // For swamp mushrooms, stack multiple mushrooms together
      if (theme === FloorTheme.Swamp && texture === 'deco_swamp_mushroom') {
        // Place 2-4 mushrooms in a cluster
        const clusterSize = 2 + Math.floor(seededRandom(roomHash + i * 47) * 3);
        const clusterOffsets = [
          { x: 0, y: 0 },
          { x: -8, y: 6 },
          { x: 10, y: 4 },
          { x: 4, y: -5 },
        ];
        for (let j = 0; j < clusterSize; j++) {
          const offset = clusterOffsets[j];
          const mushroom = this.add.sprite(pos.x + offset.x, pos.y + offset.y, texture);
          const sizeVariation = 0.7 + seededRandom(roomHash + i * 53 + j) * 0.4; // 0.7-1.1 scale variation
          mushroom.setScale(scale * 0.8 * sizeVariation);
          mushroom.setDepth(3 + j * 0.1); // Slight depth variation for overlap effect
          decorations.push(mushroom);
        }
      } else {
        const deco = this.add.sprite(pos.x, pos.y, texture);
        deco.setScale(scale * 0.8);
        deco.setDepth(3);
        decorations.push(deco);
      }
    }

    // Boss rooms get an extra centerpiece decoration
    if (room.type === 'boss') {
      const miscTexture = this.textures.exists(themedDecos.misc) ? themedDecos.misc : 'deco_barrel';
      const miscDeco = this.add.sprite(
        room.x + room.width / 2,
        room.y + padding * 2,
        miscTexture
      );
      miscDeco.setScale(scale);
      miscDeco.setDepth(3);
      decorations.push(miscDeco);
    }

    this.roomDecorations.set(room.id, decorations);
  }

  private createEnemyAnimations(): void {
    // Create animations for each enemy type (4 frames each, 16x16 pixel art)
    // melee = skeleton warrior, ranged = wraith/skull, caster = cultist, rare = vampire, elite = high priest
    const enemyTypes = ['melee', 'ranged', 'caster', 'rare', 'elite'];

    for (const type of enemyTypes) {
      const animKey = `enemy_${type}_idle`;

      // Only create if not already exists
      if (!this.anims.exists(animKey)) {
        this.anims.create({
          key: animKey,
          frames: [
            { key: `enemy_${type}_1` },
            { key: `enemy_${type}_2` },
            { key: `enemy_${type}_3` },
            { key: `enemy_${type}_4` }
          ],
          frameRate: 6,
          repeat: -1 // Loop forever
        });
      }
    }

    // Spider boss idle animation (frames 3-5 only)
    if (!this.anims.exists('boss_spider_idle')) {
      this.anims.create({
        key: 'boss_spider_idle',
        frames: [
          { key: 'boss_spider_3' },
          { key: 'boss_spider_4' },
          { key: 'boss_spider_5' }
        ],
        frameRate: 6,
        repeat: -1 // Loop forever
      });
    }

    // Boss attack animations (play once when boss attacks)
    // Death knight attack animation (4 frames)
    if (!this.anims.exists('boss_deathknight_attack')) {
      this.anims.create({
        key: 'boss_deathknight_attack',
        frames: [
          { key: 'boss_deathknight_1' },
          { key: 'boss_deathknight_2' },
          { key: 'boss_deathknight_3' },
          { key: 'boss_deathknight_4' }
        ],
        frameRate: 8,
        repeat: 0 // Play once
      });
    }

    // Dragon attack animation (4 frames)
    if (!this.anims.exists('boss_dragon_attack')) {
      this.anims.create({
        key: 'boss_dragon_attack',
        frames: [
          { key: 'boss_dragon_1' },
          { key: 'boss_dragon_2' },
          { key: 'boss_dragon_3' },
          { key: 'boss_dragon_4' }
        ],
        frameRate: 8,
        repeat: 0 // Play once
      });
    }

    // Golem attack animation (4 frames)
    if (!this.anims.exists('boss_golem_attack')) {
      this.anims.create({
        key: 'boss_golem_attack',
        frames: [
          { key: 'boss_golem_1' },
          { key: 'boss_golem_2' },
          { key: 'boss_golem_3' },
          { key: 'boss_golem_4' }
        ],
        frameRate: 8,
        repeat: 0 // Play once
      });
    }

    // Lich attack animation (4 frames)
    if (!this.anims.exists('boss_lich_attack')) {
      this.anims.create({
        key: 'boss_lich_attack',
        frames: [
          { key: 'boss_lich_1' },
          { key: 'boss_lich_2' },
          { key: 'boss_lich_3' },
          { key: 'boss_lich_4' }
        ],
        frameRate: 8,
        repeat: 0 // Play once
      });
    }

    // Demon attack animation (5 frames)
    if (!this.anims.exists('boss_demon_attack')) {
      this.anims.create({
        key: 'boss_demon_attack',
        frames: [
          { key: 'boss_demon_1' },
          { key: 'boss_demon_2' },
          { key: 'boss_demon_3' },
          { key: 'boss_demon_4' },
          { key: 'boss_demon_5' }
        ],
        frameRate: 8,
        repeat: 0 // Play once
      });
    }

    // Spider attack animation (frames 1-2)
    if (!this.anims.exists('boss_spider_attack')) {
      this.anims.create({
        key: 'boss_spider_attack',
        frames: [
          { key: 'boss_spider_1' },
          { key: 'boss_spider_2' }
        ],
        frameRate: 8,
        repeat: 0 // Play once
      });
    }
  }

  private createPlayerAnimations(): void {
    // Rogue ability animation (3 frames)
    if (!this.anims.exists('rogue_ability')) {
      this.anims.create({
        key: 'rogue_ability',
        frames: [
          { key: 'rogue_ability_1' },
          { key: 'rogue_ability_2' },
          { key: 'rogue_ability_3' }
        ],
        frameRate: 10,
        repeat: 0 // Play once
      });
    }

    // Rogue movement animation (3 frames, looping - skip frame 1 which is default stance)
    if (!this.anims.exists('rogue_move')) {
      this.anims.create({
        key: 'rogue_move',
        frames: [
          { key: 'rogue_move_2' },
          { key: 'rogue_move_3' },
          { key: 'rogue_move_4' }
        ],
        frameRate: 8,
        repeat: -1 // Loop continuously
      });
    }

    // Warrior ability animation (4 frames)
    if (!this.anims.exists('warrior_ability')) {
      this.anims.create({
        key: 'warrior_ability',
        frames: [
          { key: 'warrior_ability_1' },
          { key: 'warrior_ability_2' },
          { key: 'warrior_ability_3' },
          { key: 'warrior_ability_4' }
        ],
        frameRate: 10,
        repeat: 0 // Play once
      });
    }

    // Paladin ability animation (4 frames)
    if (!this.anims.exists('paladin_ability')) {
      this.anims.create({
        key: 'paladin_ability',
        frames: [
          { key: 'paladin_ability_1' },
          { key: 'paladin_ability_2' },
          { key: 'paladin_ability_3' },
          { key: 'paladin_ability_4' }
        ],
        frameRate: 10,
        repeat: 0 // Play once
      });
    }

    // Warlock ability animation (4 frames)
    if (!this.anims.exists('warlock_ability')) {
      this.anims.create({
        key: 'warlock_ability',
        frames: [
          { key: 'warlock_ability_1' },
          { key: 'warlock_ability_2' },
          { key: 'warlock_ability_3' },
          { key: 'warlock_ability_4' }
        ],
        frameRate: 10,
        repeat: 0 // Play once
      });
    }

    // Hunter ability animation (4 frames)
    if (!this.anims.exists('hunter_ability')) {
      this.anims.create({
        key: 'hunter_ability',
        frames: [
          { key: 'hunter_ability_1' },
          { key: 'hunter_ability_2' },
          { key: 'hunter_ability_3' },
          { key: 'hunter_ability_4' }
        ],
        frameRate: 10,
        repeat: 0 // Play once
      });
    }

    // Mage ability animation (4 frames)
    if (!this.anims.exists('mage_ability')) {
      this.anims.create({
        key: 'mage_ability',
        frames: [
          { key: 'mage_ability_1' },
          { key: 'mage_ability_2' },
          { key: 'mage_ability_3' },
          { key: 'mage_ability_4' }
        ],
        frameRate: 10,
        repeat: 0 // Play once
      });
    }

    // Shaman ability animation (4 frames)
    if (!this.anims.exists('shaman_ability')) {
      this.anims.create({
        key: 'shaman_ability',
        frames: [
          { key: 'shaman_ability_1' },
          { key: 'shaman_ability_2' },
          { key: 'shaman_ability_3' },
          { key: 'shaman_ability_4' }
        ],
        frameRate: 10,
        repeat: 0 // Play once
      });
    }

    // Movement animations for all classes
    // Target displayed height is ~58px (389 * 0.15)
    // Movement scale = 0.15 * (idleHeight / moveHeight)

    // Warrior movement animation (4 frames) - idle: 386px, move: 224px
    if (!this.anims.exists('warrior_move')) {
      this.anims.create({
        key: 'warrior_move',
        frames: [
          { key: 'warrior_move_1' },
          { key: 'warrior_move_2' },
          { key: 'warrior_move_3' },
          { key: 'warrior_move_4' }
        ],
        frameRate: 8,
        repeat: -1 // Loop continuously
      });
    }

    // Paladin movement animation (4 frames) - idle: 386px, move: 262px
    if (!this.anims.exists('paladin_move')) {
      this.anims.create({
        key: 'paladin_move',
        frames: [
          { key: 'paladin_move_1' },
          { key: 'paladin_move_2' },
          { key: 'paladin_move_3' },
          { key: 'paladin_move_4' }
        ],
        frameRate: 8,
        repeat: -1 // Loop continuously
      });
    }

    // Mage movement animation (4 frames) - idle: 399px, move: 321px
    if (!this.anims.exists('mage_move')) {
      this.anims.create({
        key: 'mage_move',
        frames: [
          { key: 'mage_move_1' },
          { key: 'mage_move_2' },
          { key: 'mage_move_3' },
          { key: 'mage_move_4' }
        ],
        frameRate: 8,
        repeat: -1 // Loop continuously
      });
    }

    // Warlock movement animation (4 frames) - idle: 399px, move: 211px
    if (!this.anims.exists('warlock_move')) {
      this.anims.create({
        key: 'warlock_move',
        frames: [
          { key: 'warlock_move_1' },
          { key: 'warlock_move_2' },
          { key: 'warlock_move_3' },
          { key: 'warlock_move_4' }
        ],
        frameRate: 8,
        repeat: -1 // Loop continuously
      });
    }

    // Shaman movement animation (4 frames) - idle: 468px, move: 769px
    if (!this.anims.exists('shaman_move')) {
      this.anims.create({
        key: 'shaman_move',
        frames: [
          { key: 'shaman_move_1' },
          { key: 'shaman_move_2' },
          { key: 'shaman_move_3' },
          { key: 'shaman_move_4' }
        ],
        frameRate: 8,
        repeat: -1 // Loop continuously
      });
    }
  }

  // Track which players are currently playing ability animations
  private playerAbilityAnimating: Set<string> = new Set();

  // Classes that have ability animations
  private classesWithAbilityAnimations = ['rogue', 'warrior', 'paladin', 'warlock', 'hunter', 'mage', 'shaman'];

  // Classes that have movement animations and their scale factors
  // Base scale = 0.15 * (idleHeight / moveHeight)
  // Visual compensation applied because character is drawn at different proportions within frames
  // Compensation < 1.0 means character appears larger in animation frame than idle frame
  // Compensation > 1.0 means character appears smaller in animation frame than idle frame
  private classMovementScales: Record<string, number> = {
    'rogue': 0.279,   // 0.15 * (389/209) * 1.0 - no compensation needed
    'warrior': 0.285, // 0.15 * (386/224) * 1.1
    'paladin': 0.287, // 0.15 * (386/262) * 1.3 - increased, was too small
    'mage': 0.205,    // 0.15 * (399/321) * 1.1 - appropriate size
    'warlock': 0.284, // 0.15 * (399/211) * 1.0
    'shaman': 0.100   // 0.15 * (468/769) * 1.1 - increased, was too small
  };

  // Classes that have ability animations and their scale factors
  // Base scale = 0.15 * (idleHeight / abilityHeight)
  // Visual compensation applied because character is drawn at different proportions within frames
  private classAbilityScales: Record<string, number> = {
    'rogue': 0.150,   // 0.15 * (389/389) * 1.0 - same frame size, no compensation
    'warrior': 0.166, // 0.15 * (386/452) * 1.3
    'paladin': 0.170, // 0.15 * (386/545) * 1.6 - increased, was too small
    'mage': 0.340,    // 0.15 * (399/264) * 1.5
    'warlock': 0.155, // Reduced from 0.178 - animation was too large
    'shaman': 0.100,  // 0.15 * (468/772) * 1.1 - increased, was too small
    'hunter': 0.342   // 0.15 * (386/186) * 1.1
  };

  // Classes whose ability animations face LEFT by default (need flip for right-facing attacks)
  private leftFacingAbilityClasses: string[] = ['shaman'];

  // Origin offset for ability animations where the character is not centered in the frame
  // Format: { x: horizontal offset (0.5 = center), y: vertical offset (0.5 = center) }
  // Positive x offset moves the anchor point right (character appears to move left)
  // For warlock: character is on the left side of frame, spell effect on right
  private classAbilityOrigins: Record<string, { x: number; y: number }> = {
    'warlock': { x: 0.35, y: 0.65 },  // Character is in lower portion of frame, move up
    'mage': { x: 0.35, y: 0.65 },     // Similar adjustment for mage
  };

  private playPlayerAbilityAnimation(
    playerId: string,
    classId: string,
    sourcePos?: { x: number; y: number },
    targetPos?: { x: number; y: number }
  ): void {
    const sprite = this.playerSprites.get(playerId);
    if (!sprite || this.playerAbilityAnimating.has(playerId)) return;

    // Check if this class has an ability animation
    if (!this.classesWithAbilityAnimations.includes(classId)) return;

    const animKey = `${classId}_ability`;
    if (!this.anims.exists(animKey)) return;

    // Mark as animating
    this.playerAbilityAnimating.add(playerId);

    const defaultScale = 0.15;
    // Always use idle texture key for restoration (not current texture which might be movement frame)
    const idleTextureKey = `player_${classId}`;

    // Store original flipX and origin to restore after animation
    const originalFlipX = sprite.flipX;
    const originalOriginX = sprite.originX;
    const originalOriginY = sprite.originY;

    // Flip sprite based on target direction
    // Shaman animations face LEFT by default, others face RIGHT by default
    let isFlipped = false;
    if (sourcePos && targetPos) {
      const isLeftFacingClass = this.leftFacingAbilityClasses.includes(classId);
      const targetIsLeft = targetPos.x < sourcePos.x;

      if (isLeftFacingClass) {
        // Left-facing class (shaman): flip when target is to the RIGHT
        isFlipped = !targetIsLeft;
        sprite.setFlipX(isFlipped);
      } else {
        // Right-facing class (all others): flip when target is to the LEFT
        isFlipped = targetIsLeft;
        sprite.setFlipX(isFlipped);
      }
    }

    // Apply origin offset for classes with off-center characters in ability frames
    const originOffset = this.classAbilityOrigins[classId];
    if (originOffset) {
      // When flipped, mirror the x offset around center (0.5)
      const adjustedOriginX = isFlipped ? (1 - originOffset.x) : originOffset.x;
      sprite.setOrigin(adjustedOriginX, originOffset.y);
    }

    // Use pre-calculated ability scale to match idle displayed height
    const animScale = this.classAbilityScales[classId] ?? defaultScale;
    sprite.setScale(animScale);

    // Play the ability animation
    sprite.play(animKey);

    // When animation completes, restore idle texture or resume movement
    sprite.once('animationcomplete', () => {
      this.playerAbilityAnimating.delete(playerId);

      // Restore original flip orientation and origin
      sprite.setFlipX(originalFlipX);
      sprite.setOrigin(originalOriginX, originalOriginY);

      // If player is still moving and has a movement animation, resume it
      const moveScale = this.classMovementScales[classId];
      const moveAnimKey = `${classId}_move`;
      if (this.isPlayerMoving && moveScale && this.playerMovementAnimating.has(playerId) && this.anims.exists(moveAnimKey)) {
        sprite.setScale(moveScale);
        sprite.play(moveAnimKey);
      } else {
        // Always restore to idle texture with default scale
        sprite.setTexture(idleTextureKey);
        sprite.setScale(defaultScale);
      }
    });
  }

  // Track which players are currently playing movement animations
  private playerMovementAnimating: Set<string> = new Set();
  // Track current class for each player (for animation restoration)
  private playerClassMap: Map<string, string> = new Map();

  private playMovementAnimation(playerId: string, classId: string, start: boolean): void {
    const sprite = this.playerSprites.get(playerId);
    if (!sprite) return;

    // Track the class for this player
    this.playerClassMap.set(playerId, classId);

    const defaultScale = 0.15;
    const moveScale = this.classMovementScales[classId];

    // If this class doesn't have a movement animation, skip
    if (!moveScale) return;

    const animKey = `${classId}_move`;

    if (start) {
      // Always track movement state, even during ability animation
      this.playerMovementAnimating.add(playerId);

      // Don't interrupt ability animations - the animation will resume when ability completes
      if (this.playerAbilityAnimating.has(playerId)) return;

      // Set scale for movement animation
      sprite.setScale(moveScale);

      // Play movement animation - it will loop continuously due to repeat: -1
      if (this.anims.exists(animKey)) {
        sprite.play(animKey);
      }
    } else {
      // Stop movement animation and return to idle texture
      this.playerMovementAnimating.delete(playerId);

      // Don't change sprite if ability is playing
      if (this.playerAbilityAnimating.has(playerId)) return;

      if (sprite.anims.isPlaying) {
        sprite.stop();
      }
      sprite.setTexture(`player_${classId}`);
      sprite.setScale(defaultScale); // Restore default scale
    }
  }

  private updatePlayerDirection(playerId: string, moveX: number): void {
    const sprite = this.playerSprites.get(playerId);
    if (!sprite) return;

    // Flip sprite based on horizontal movement direction
    if (moveX < 0) {
      sprite.setFlipX(true); // Walking left - flip horizontally
    } else if (moveX > 0) {
      sprite.setFlipX(false); // Walking right - normal orientation
    }
    // If moveX is 0, keep the last direction
  }

  // Track which bosses are currently playing attack animations
  private bossAttackAnimating: Set<string> = new Set();

  // Map bossId to animation key prefix
  private bossAnimationKeys: Record<string, string> = {
    'boss_skeleton_king': 'boss_deathknight',
    'boss_giant_spider': 'boss_spider',
    'boss_orc_warlord': 'boss_golem',
    'boss_lich': 'boss_lich',
    'boss_dragon': 'boss_dragon',
    'boss_void_lord': 'boss_demon',
    'boss_titan': 'boss_golem',
    'boss_old_god': 'boss_demon'
  };

  private playBossAttackAnimation(enemyId: string, bossId: string, sourcePos?: { x: number; y: number }, targetPos?: { x: number; y: number }): void {
    const sprite = this.enemySprites.get(enemyId);
    if (!sprite || this.bossAttackAnimating.has(enemyId)) return;

    const animPrefix = this.bossAnimationKeys[bossId];
    if (!animPrefix) return;

    const attackAnimKey = `${animPrefix}_attack`;
    if (!this.anims.exists(attackAnimKey)) return;

    // Mark as animating
    this.bossAttackAnimating.add(enemyId);

    // Store original flip state
    const originalFlipX = sprite.flipX;

    // Flip sprite based on target direction (animations face right by default)
    if (sourcePos && targetPos && targetPos.x < sourcePos.x) {
      sprite.setFlipX(true); // Target is to the left, flip to face left
    } else {
      sprite.setFlipX(false); // Target is to the right, face right (default)
    }

    // Play the attack animation
    sprite.play(attackAnimKey);

    // When animation completes, return to idle or static frame
    sprite.once('animationcomplete', () => {
      this.bossAttackAnimating.delete(enemyId);

      // Spider returns to idle animation, others return to their default static frame
      if (bossId === 'boss_giant_spider') {
        sprite.play('boss_spider_idle');
      } else {
        // Map boss IDs to their default static frames
        const defaultFrames: Record<string, string> = {
          'boss_skeleton_king': 'boss_deathknight_4',
          'boss_orc_warlord': 'boss_golem_4',
          'boss_lich': 'boss_lich_1',
          'boss_dragon': 'boss_dragon_1',
          'boss_void_lord': 'boss_demon_1',
          'boss_titan': 'boss_golem_4',
          'boss_old_god': 'boss_demon_1'
        };
        sprite.setTexture(defaultFrames[bossId] || `${animPrefix}_1`);
      }
    });
  }

  private playEnemyRangedAttackAnimation(enemyId: string, enemyName: string, enemyType: string, position: { x: number; y: number }): void {
    console.log(`[ANIM] Enemy attack: ${enemyName} (${enemyType}) at (${position.x}, ${position.y})`);

    const sprite = this.enemySprites.get(enemyId);
    if (!sprite) {
      console.log(`[ANIM] No sprite found for ${enemyId}`);
      return;
    }

    // Brief scale pulse on the enemy sprite
    this.tweens.add({
      targets: sprite,
      scaleX: sprite.scaleX * 1.15,
      scaleY: sprite.scaleY * 1.15,
      duration: 100,
      yoyo: true,
      ease: 'Quad.easeOut'
    });

    const nameLower = enemyName.toLowerCase();

    // Check enemy NAME first to determine if it's a magical creature
    // Spectral enemies (Lost Soul, Wraith, Phantom) are type='ranged' but should have magic effects
    const isSpectral = nameLower.includes('soul') || nameLower.includes('wraith') || nameLower.includes('phantom') || nameLower.includes('ghost') || nameLower.includes('spirit');
    const isVoid = nameLower.includes('void') || nameLower.includes('shadow');
    const isDarkMagic = nameLower.includes('cultist') || nameLower.includes('acolyte') || nameLower.includes('priest') || nameLower.includes('death');
    const isArcher = nameLower.includes('archer') || nameLower.includes('hunter') || nameLower.includes('ranger') || nameLower.includes('scout') || nameLower.includes('bowman');

    // ARCHER (physical ranged) attack - bow and arrow effect
    // Only for actual archer-type enemies, NOT spectral/magic creatures
    if (isArcher || (enemyType === 'ranged' && !isSpectral && !isVoid && !isDarkMagic)) {
      console.log(`[ANIM] Playing ARCHER animation for ${enemyName}`);
      this.playArcherAttackAnimation(position);
      return;
    }

    console.log(`[ANIM] Playing MAGIC animation for ${enemyName}: spectral=${isSpectral}, void=${isVoid}, dark=${isDarkMagic}`);

    // MAGIC attack - determine effect colors based on enemy name
    let primaryColor = 0x8844ff;
    let secondaryColor = 0xaa66ff;
    let effectType: 'spectral' | 'dark' | 'void' = 'dark';

    // Spectral/ghost types - ethereal blue/white
    if (isSpectral) {
      primaryColor = 0x88ccff;
      secondaryColor = 0xaaeeff;
      effectType = 'spectral';
    }
    // Void/shadow types - purple/black
    else if (isVoid) {
      primaryColor = 0x6622aa;
      secondaryColor = 0x8844cc;
      effectType = 'void';
    }
    // Dark cultist types - green/purple
    else if (isDarkMagic) {
      primaryColor = 0x44aa44;
      secondaryColor = 0x66cc66;
      effectType = 'dark';
    }

    // Create casting effect based on type
    if (effectType === 'spectral') {
      // Ethereal wisps swirling outward
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const wisp = this.add.circle(position.x, position.y, 4, primaryColor, 0.8);
        wisp.setDepth(110);

        this.tweens.add({
          targets: wisp,
          x: position.x + Math.cos(angle) * 25,
          y: position.y + Math.sin(angle) * 25,
          alpha: 0,
          scale: 0.5,
          duration: 300,
          ease: 'Quad.easeOut',
          onComplete: () => wisp.destroy()
        });
      }

      // Central glow pulse
      const glow = this.add.circle(position.x, position.y, 15, secondaryColor, 0.4);
      glow.setDepth(105);
      this.tweens.add({
        targets: glow,
        radius: 30,
        alpha: 0,
        duration: 250,
        ease: 'Quad.easeOut',
        onComplete: () => glow.destroy()
      });

    } else if (effectType === 'void') {
      // Dark void tendrils
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2 + Math.random() * 0.5;
        const tendril = this.add.ellipse(position.x, position.y, 6, 20, primaryColor, 0.7);
        tendril.setRotation(angle);
        tendril.setDepth(110);

        this.tweens.add({
          targets: tendril,
          x: position.x + Math.cos(angle) * 30,
          y: position.y + Math.sin(angle) * 30,
          scaleX: 0.3,
          alpha: 0,
          duration: 350,
          ease: 'Quad.easeOut',
          onComplete: () => tendril.destroy()
        });
      }

      // Dark implosion effect
      const voidCircle = this.add.circle(position.x, position.y, 25, 0x000000, 0.5);
      voidCircle.setDepth(104);
      this.tweens.add({
        targets: voidCircle,
        radius: 5,
        alpha: 0,
        duration: 200,
        ease: 'Quad.easeIn',
        onComplete: () => voidCircle.destroy()
      });

    } else {
      // Dark magic / Cultist - ritual circle with rising energy
      // This is visually distinct from spectral wisps

      // Ritual circle under the caster
      const ritualCircle = this.add.graphics();
      ritualCircle.setDepth(105);
      ritualCircle.lineStyle(3, primaryColor, 0.8);
      ritualCircle.strokeCircle(position.x, position.y, 25);
      // Inner pentagram-like lines
      ritualCircle.lineStyle(2, secondaryColor, 0.6);
      for (let i = 0; i < 5; i++) {
        const angle1 = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const angle2 = ((i + 2) / 5) * Math.PI * 2 - Math.PI / 2;
        ritualCircle.lineBetween(
          position.x + Math.cos(angle1) * 20,
          position.y + Math.sin(angle1) * 20,
          position.x + Math.cos(angle2) * 20,
          position.y + Math.sin(angle2) * 20
        );
      }

      // Fade out ritual circle
      this.tweens.add({
        targets: ritualCircle,
        alpha: 0,
        duration: 400,
        ease: 'Quad.easeOut',
        onComplete: () => ritualCircle.destroy()
      });

      // Rising green flames/energy pillars
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;
        const flameX = position.x + Math.cos(angle) * 18;
        const flameY = position.y + Math.sin(angle) * 18;

        const flame = this.add.ellipse(flameX, flameY, 8, 16, primaryColor, 0.9);
        flame.setDepth(112);

        // Flames rise up and fade
        this.tweens.add({
          targets: flame,
          y: flameY - 30,
          scaleY: 2,
          scaleX: 0.5,
          alpha: 0,
          duration: 350,
          ease: 'Quad.easeOut',
          onComplete: () => flame.destroy()
        });
      }

      // Central energy burst upward
      const energyCore = this.add.circle(position.x, position.y - 5, 10, secondaryColor, 0.8);
      energyCore.setDepth(113);
      this.tweens.add({
        targets: energyCore,
        y: position.y - 25,
        scaleX: 0.3,
        scaleY: 1.5,
        alpha: 0,
        duration: 300,
        ease: 'Quad.easeOut',
        onComplete: () => energyCore.destroy()
      });
    }
  }

  /**
   * Play archer/physical ranged attack animation
   * Shows a bow-drawing motion with arrow release effect
   */
  private playArcherAttackAnimation(position: { x: number; y: number }): void {
    // Colors for archer effects - brown/gold for physical
    const bowColor = 0x8b4513;  // Saddle brown
    const arrowColor = 0xdaa520; // Goldenrod
    const stringColor = 0xf5deb3; // Wheat

    // Draw bow string pullback effect
    const stringStart = this.add.graphics();
    stringStart.setDepth(110);
    stringStart.lineStyle(2, stringColor, 0.8);
    stringStart.beginPath();
    stringStart.moveTo(position.x - 8, position.y - 12);
    stringStart.lineTo(position.x + 5, position.y);
    stringStart.lineTo(position.x - 8, position.y + 12);
    stringStart.strokePath();

    // Animate string snap back
    this.tweens.add({
      targets: stringStart,
      alpha: 0,
      duration: 150,
      ease: 'Quad.easeOut',
      onComplete: () => stringStart.destroy()
    });

    // Arrow nock flash (where arrow was)
    const nockFlash = this.add.circle(position.x + 5, position.y, 4, arrowColor, 0.9);
    nockFlash.setDepth(111);
    this.tweens.add({
      targets: nockFlash,
      scale: 2,
      alpha: 0,
      duration: 200,
      ease: 'Quad.easeOut',
      onComplete: () => nockFlash.destroy()
    });

    // Small dust/motion particles from release
    for (let i = 0; i < 4; i++) {
      const angle = (Math.random() - 0.5) * Math.PI * 0.5 + Math.PI; // Mostly backward
      const particle = this.add.circle(
        position.x + 8,
        position.y + (Math.random() - 0.5) * 8,
        2,
        0xaaaaaa,
        0.6
      );
      particle.setDepth(109);

      this.tweens.add({
        targets: particle,
        x: position.x + 8 + Math.cos(angle) * 15,
        y: position.y + Math.sin(angle) * 15,
        alpha: 0,
        scale: 0.5,
        duration: 200 + Math.random() * 100,
        ease: 'Quad.easeOut',
        onComplete: () => particle.destroy()
      });
    }

    // Bow arm motion indicator (brief arc)
    const bowArc = this.add.graphics();
    bowArc.setDepth(108);
    bowArc.lineStyle(3, bowColor, 0.6);
    bowArc.beginPath();
    bowArc.arc(position.x - 5, position.y, 15, -Math.PI * 0.4, Math.PI * 0.4);
    bowArc.strokePath();

    this.tweens.add({
      targets: bowArc,
      alpha: 0,
      duration: 250,
      ease: 'Quad.easeOut',
      onComplete: () => bowArc.destroy()
    });
  }

  private createDecorationAnimations(): void {
    // Chest idle animation (closed)
    if (!this.anims.exists('chest_idle')) {
      this.anims.create({
        key: 'chest_idle',
        frames: [
          { key: 'chest_closed_1' },
          { key: 'chest_closed_2' },
          { key: 'chest_closed_3' },
          { key: 'chest_closed_4' }
        ],
        frameRate: 4,
        repeat: -1
      });
    }

    // Chest opening animation (one-shot)
    if (!this.anims.exists('chest_open')) {
      this.anims.create({
        key: 'chest_open',
        frames: [
          { key: 'chest_open_1' },
          { key: 'chest_open_2' },
          { key: 'chest_open_3' },
          { key: 'chest_open_4' }
        ],
        frameRate: 8,
        repeat: 0
      });
    }

    // Torch animation
    if (!this.anims.exists('torch_flicker')) {
      this.anims.create({
        key: 'torch_flicker',
        frames: [
          { key: 'torch_1' },
          { key: 'torch_2' },
          { key: 'torch_3' },
          { key: 'torch_4' }
        ],
        frameRate: 8,
        repeat: -1
      });
    }

    // Flag waving animation
    if (!this.anims.exists('flag_wave')) {
      this.anims.create({
        key: 'flag_wave',
        frames: [
          { key: 'flag_1' },
          { key: 'flag_2' },
          { key: 'flag_3' },
          { key: 'flag_4' }
        ],
        frameRate: 6,
        repeat: -1
      });
    }

    // Spike trap animation (retracted -> extended)
    if (!this.anims.exists('spikes_activate')) {
      this.anims.create({
        key: 'spikes_activate',
        frames: [
          { key: 'spikes_1' },
          { key: 'spikes_2' },
          { key: 'spikes_3' },
          { key: 'spikes_4' }
        ],
        frameRate: 12,
        repeat: 0
      });
    }

    // Spike trap deactivate (extended -> retracted)
    if (!this.anims.exists('spikes_deactivate')) {
      this.anims.create({
        key: 'spikes_deactivate',
        frames: [
          { key: 'spikes_4' },
          { key: 'spikes_3' },
          { key: 'spikes_2' },
          { key: 'spikes_1' }
        ],
        frameRate: 12,
        repeat: 0
      });
    }

    // Flamethrower animation
    if (!this.anims.exists('flame_burst')) {
      this.anims.create({
        key: 'flame_burst',
        frames: [
          { key: 'flamethrower_1' },
          { key: 'flamethrower_2' },
          { key: 'flamethrower_3' },
          { key: 'flamethrower_4' }
        ],
        frameRate: 10,
        repeat: -1
      });
    }

    // Coin spinning animation
    if (!this.anims.exists('coin_spin')) {
      this.anims.create({
        key: 'coin_spin',
        frames: [
          { key: 'coin_1' },
          { key: 'coin_2' },
          { key: 'coin_3' },
          { key: 'coin_4' }
        ],
        frameRate: 8,
        repeat: -1
      });
    }

    // Key shimmer animation
    if (!this.anims.exists('key_shimmer')) {
      this.anims.create({
        key: 'key_shimmer',
        frames: [
          { key: 'key_1' },
          { key: 'key_2' },
          { key: 'key_3' },
          { key: 'key_4' }
        ],
        frameRate: 6,
        repeat: -1
      });
    }
  }

  private renderEnemies(rooms: Room[]): void {
    const activeEnemyIds = new Set<string>();

    for (const room of rooms) {
      for (const enemy of room.enemies) {
        activeEnemyIds.add(enemy.id);

        if (!enemy.isAlive) {
          // Remove dead enemy sprite
          const sprite = this.enemySprites.get(enemy.id);
          if (sprite) {
            sprite.destroy();
            this.enemySprites.delete(enemy.id);
          }
          this.removeHealthBar(enemy.id);
          // Also cleanup blind/debuff effects
          const blindGfx = this.enemyDebuffEffects.get(enemy.id);
          if (blindGfx) {
            blindGfx.destroy();
            this.enemyDebuffEffects.delete(enemy.id);
          }
          continue;
        }

        // Handle hidden enemies (ambush rooms) - don't render until revealed
        if (enemy.isHidden) {
          // Track that this enemy is hidden (for reveal animation later)
          this.hiddenEnemyIds.add(enemy.id);
          const existingSprite = this.enemySprites.get(enemy.id);
          if (existingSprite) {
            existingSprite.destroy();
            this.enemySprites.delete(enemy.id);
          }
          this.removeHealthBar(enemy.id);
          continue;
        }

        // Get or create sprite
        let sprite = this.enemySprites.get(enemy.id);

        if (!sprite) {
          // Determine texture and animation based on enemy type
          let texture = `enemy_${enemy.type}_1`; // Start with first frame
          let animKey = `enemy_${enemy.type}_idle`;
          let scale = 3; // Scale up 16x16 to ~48px

          if (enemy.isBoss) {
            // Map boss IDs to textures (use specified default frames)
            const bossTextures: Record<string, string> = {
              'boss_skeleton_king': 'boss_deathknight_4',
              'boss_giant_spider': 'boss_spider_3', // Spider idle starts at frame 3
              'boss_orc_warlord': 'boss_golem_4',
              'boss_lich': 'boss_lich_1',
              'boss_dragon': 'boss_dragon_1',
              'boss_void_lord': 'boss_demon_1',
              'boss_titan': 'boss_golem_4',
              'boss_old_god': 'boss_demon_1'
            };
            texture = bossTextures[enemy.bossId || ''] || 'boss_demon_1';

            // Only spider has idle animation, others are static until they attack
            if (enemy.bossId === 'boss_giant_spider') {
              animKey = 'boss_spider_idle';
            } else {
              animKey = ''; // Static for other bosses
            }
            scale = 0.25;
          } else if (enemy.isRare) {
            texture = 'enemy_rare_1';
            animKey = 'enemy_rare_idle';
            scale = 4; // Rare enemies slightly larger
            // Play rare mob sound on first encounter (only once)
            if (!this.notifiedEnemyIds.has(enemy.id)) {
              this.notifiedEnemyIds.add(enemy.id);
              this.playSfx('sfxRare');
              this.showNotification('A rare enemy appears!', undefined, 'rare');
            }
          } else if (enemy.isElite) {
            texture = 'enemy_elite_1';
            animKey = 'enemy_elite_idle';
            scale = 4.0; // Elite enemies larger for better recognition
            // Only show notification once
            if (!this.notifiedEnemyIds.has(enemy.id)) {
              this.notifiedEnemyIds.add(enemy.id);
              this.showNotification('An elite enemy appears!', undefined, 'warning');
            }
          }

          sprite = this.add.sprite(enemy.position.x, enemy.position.y, texture);
          sprite.setDepth(10);
          sprite.setScale(scale);

          // Make interactive for targeting (left click only)
          sprite.setInteractive({ useHandCursor: true });
          sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (pointer.leftButtonDown()) {
              this.inputManager?.setTarget(enemy.id);
            }
          });

          // Play idle animation for non-boss enemies
          if (animKey && this.anims.exists(animKey)) {
            sprite.play(animKey);
          }

          this.enemySprites.set(enemy.id, sprite);

          // Ambush reveal animation - play when a hidden enemy becomes visible
          if (this.hiddenEnemyIds.has(enemy.id) && !this.revealedAmbushEnemyIds.has(enemy.id)) {
            this.revealedAmbushEnemyIds.add(enemy.id);
            this.hiddenEnemyIds.delete(enemy.id);

            // Capture sprite for use in callbacks
            const revealedSprite = sprite;

            // Start with small scale and fade in
            revealedSprite.setScale(0.1);
            revealedSprite.setAlpha(0);

            // Play reveal sound
            this.playSfx('sfxCast', 0.4);

            // Scale and fade in animation
            this.tweens.add({
              targets: revealedSprite,
              scaleX: scale,
              scaleY: scale,
              alpha: 1,
              duration: 300,
              ease: 'Back.easeOut',
              onComplete: () => {
                // Brief red flash after appearing
                revealedSprite.setTint(0xff4444);
                this.time.delayedCall(100, () => {
                  revealedSprite.clearTint();
                });
              }
            });

            // Show notification for first ambush enemy revealed
            if (this.revealedAmbushEnemyIds.size === 1 || Math.random() < 0.3) {
              this.showNotification('Ambush!', undefined, 'warning');
            }
          }
        }

        // Update position
        sprite.setPosition(enemy.position.x, enemy.position.y);

        // Update health bar - position higher for bosses to clear their larger sprite
        const healthBarYOffset = enemy.isBoss ? -60 : -25;
        this.updateHealthBar(enemy.id, enemy.position.x, enemy.position.y + healthBarYOffset, enemy.stats.health, enemy.stats.maxHealth, enemy.isBoss ? 60 : 40);

        // Check for stun debuffs (Blind or Judgment) and apply visual effect
        const stunDebuff = enemy.debuffs?.find(d =>
          (d.abilityId === 'rogue_blind' || d.abilityId === 'paladin_judgment') && d.remainingDuration > 0
        );
        if (stunDebuff) {
          // Apply tint to show enemy is stunned (golden for Judgment, grayish for Blind)
          const isJudgment = stunDebuff.abilityId === 'paladin_judgment';
          sprite.setTint(isJudgment ? 0xddaa44 : 0x666688);

          // Get or create stun effect graphics
          let stunGfx = this.enemyDebuffEffects.get(enemy.id);
          if (!stunGfx) {
            stunGfx = this.add.graphics();
            stunGfx.setDepth(15);
            this.enemyDebuffEffects.set(enemy.id, stunGfx);
          }

          // Draw swirling stars effect above enemy
          stunGfx.clear();
          const time = this.time.now / 1000;
          const centerX = enemy.position.x;
          const centerY = enemy.position.y - (enemy.isBoss ? 70 : 35);

          // Different colors for Judgment (holy golden) vs Blind (yellow)
          const starColor = isJudgment ? 0xffd700 : 0xffff00;
          const ringColor = isJudgment ? 0xffd700 : 0xffff00;

          // Swirling stars/symbols
          const numStars = isJudgment ? 4 : 3; // More stars for Judgment
          for (let i = 0; i < numStars; i++) {
            const angle = time * 3 + (i * Math.PI * 2 / numStars);
            const radius = 12 + Math.sin(time * 4 + i) * 3;
            const px = centerX + Math.cos(angle) * radius;
            const py = centerY + Math.sin(angle) * radius * 0.5; // Ellipse

            // Draw star
            stunGfx.fillStyle(starColor, 0.9);
            stunGfx.fillCircle(px, py, 4);

            // Inner sparkle
            stunGfx.fillStyle(0xffffff, 1.0);
            stunGfx.fillCircle(px, py, 2);
          }

          // Duration indicator (fading ring) - adjust max duration based on ability
          const maxDuration = isJudgment ? 6 : 10; // Judgment max 6s, Blind max 10s
          const durationPercent = stunDebuff.remainingDuration / maxDuration;
          stunGfx.lineStyle(2, ringColor, 0.5 * durationPercent);
          stunGfx.strokeCircle(centerX, centerY, 18);

          // "STUNNED" text indicator pulsing
          const pulseAlpha = 0.5 + Math.sin(time * 5) * 0.3;
          stunGfx.fillStyle(ringColor, pulseAlpha);
          // Draw small indicator dots
          for (let i = 0; i < 3; i++) {
            stunGfx.fillCircle(centerX - 6 + i * 6, centerY + 12, 2);
          }
        } else {
          // Remove stun effect and tint if not stunned
          sprite.clearTint();
          const stunGfx = this.enemyDebuffEffects.get(enemy.id);
          if (stunGfx) {
            stunGfx.destroy();
            this.enemyDebuffEffects.delete(enemy.id);
          }
        }
      }
    }

    // Remove sprites for enemies that no longer exist
    for (const [id, sprite] of this.enemySprites) {
      if (!activeEnemyIds.has(id)) {
        sprite.destroy();
        this.enemySprites.delete(id);
        this.removeHealthBar(id);
        // Also cleanup blind effects
        const blindGfx = this.enemyDebuffEffects.get(id);
        if (blindGfx) {
          blindGfx.destroy();
          this.enemyDebuffEffects.delete(id);
        }
      }
    }
  }

  private renderGroundItems(rooms: Room[]): void {
    const activeItemIds = new Set<string>();

    for (const room of rooms) {
      if (!room.groundItems) continue;

      for (const groundItem of room.groundItems) {
        activeItemIds.add(groundItem.id);

        // Get or create sprite container
        let container = this.groundItemSprites.get(groundItem.id);

        if (!container) {
          container = this.add.container(groundItem.position.x, groundItem.position.y);
          container.setDepth(5);

          // Determine item color and icon based on type
          let bgColor = 0xffffff;
          let iconText = '?';

          // Check if it's a potion (has 'type' and 'amount' properties)
          if ('type' in groundItem.item && 'amount' in groundItem.item) {
            const potion = groundItem.item as Potion;
            bgColor = potion.type === PotionType.Health ? 0xff4444 : 0x4444ff;
            iconText = potion.type === PotionType.Health ? 'HP' : 'MP';
          } else {
            // It's an item - color by rarity
            const item = groundItem.item as import('@dungeon-link/shared').Item;
            const rarityColors: Record<string, number> = {
              common: 0xaaaaaa,
              uncommon: 0x44ff44,
              rare: 0x4488ff,
              epic: 0xaa44ff,
              legendary: 0xffaa00,
              mythic: 0xff4444
            };
            bgColor = rarityColors[item.rarity] ?? 0xffffff;
            // Use slot icon
            const slotIcons: Record<string, string> = {
              head: 'H', chest: 'C', legs: 'L', feet: 'F',
              hands: 'G', weapon: 'W', ring: 'R', trinket: 'T'
            };
            iconText = slotIcons[item.slot] ?? 'I';
          }

          // Create glowing background circle
          const glow = this.add.graphics();
          glow.fillStyle(bgColor, 0.4);
          glow.fillCircle(0, 0, 18);
          glow.lineStyle(2, bgColor, 0.8);
          glow.strokeCircle(0, 0, 18);
          container.add(glow);

          // Create inner item icon
          const bg = this.add.graphics();
          bg.fillStyle(0x000000, 0.8);
          bg.fillCircle(0, 0, 12);
          container.add(bg);

          // Icon text
          const icon = this.add.text(0, 0, iconText, {
            fontSize: '10px',
            color: '#' + bgColor.toString(16).padStart(6, '0'),
            fontStyle: 'bold'
          }).setOrigin(0.5, 0.5);
          container.add(icon);

          // Add bobbing animation
          this.tweens.add({
            targets: container,
            y: groundItem.position.y - 5,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
          });

          // Add glow pulse animation
          this.tweens.add({
            targets: glow,
            alpha: 0.3,
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
          });

          // Make container interactive for click-to-pickup
          container.setSize(36, 36);
          container.setInteractive({ useHandCursor: true });

          // Store item ID for click handler
          container.setData('itemId', groundItem.id);

          // Use local reference for event handlers to avoid TypeScript possibly-undefined
          const containerRef = container;
          containerRef.on('pointerdown', () => {
            const itemId = containerRef.getData('itemId') as string;
            console.log('[DEBUG] Ground item clicked:', itemId);
            wsClient.pickupGroundItem(itemId);
          });

          // Hover effect
          containerRef.on('pointerover', () => {
            containerRef.setScale(1.2);
          });
          containerRef.on('pointerout', () => {
            containerRef.setScale(1.0);
          });

          this.groundItemSprites.set(groundItem.id, container);
        }

        // Update position (in case it's needed)
        container.setPosition(groundItem.position.x, groundItem.position.y);
      }
    }

    // Remove sprites for items that no longer exist
    for (const [id, container] of this.groundItemSprites) {
      if (!activeItemIds.has(id)) {
        container.destroy();
        this.groundItemSprites.delete(id);
      }
    }
  }

  private renderTraps(rooms: Room[]): void {
    const activeTrapIds = new Set<string>();

    for (const room of rooms) {
      if (!room.traps) continue;

      for (const trap of room.traps) {
        activeTrapIds.add(trap.id);

        let sprite = this.trapSprites.get(trap.id);

        if (!sprite) {
          // Create new trap sprite
          const texture = trap.type === TrapType.Spikes ? 'spikes_1' : 'flamethrower_1';
          sprite = this.add.sprite(trap.position.x, trap.position.y, texture);
          sprite.setDepth(5); // Below players but above floor
          sprite.setScale(2.5); // Scale up 16x16 to ~40px

          // Rotate flamethrower based on direction
          if (trap.type === TrapType.Flamethrower && trap.direction) {
            const angles: Record<string, number> = {
              'up': 0,
              'down': 180,
              'left': 270,
              'right': 90
            };
            sprite.setAngle(angles[trap.direction]);
          }

          this.trapSprites.set(trap.id, sprite);
        }

        // Update animation based on trap state
        if (trap.type === TrapType.Spikes) {
          if (trap.isActive && sprite.anims.currentAnim?.key !== 'spikes_activate') {
            sprite.play('spikes_activate');
          } else if (!trap.isActive && sprite.anims.currentAnim?.key === 'spikes_activate') {
            sprite.play('spikes_deactivate');
          }
        } else if (trap.type === TrapType.Flamethrower) {
          if (trap.isActive && !sprite.anims.isPlaying) {
            sprite.play('flame_burst');
            sprite.setVisible(true);
          } else if (!trap.isActive) {
            sprite.stop();
            sprite.setVisible(false);
          }
        }
      }
    }

    // Remove sprites for traps that no longer exist
    for (const [id, sprite] of this.trapSprites) {
      if (!activeTrapIds.has(id)) {
        sprite.destroy();
        this.trapSprites.delete(id);
      }
    }
  }

  private renderChests(rooms: Room[]): void {
    const activeChestIds = new Set<string>();

    for (const room of rooms) {
      if (!room.chests) continue;

      for (const chest of room.chests) {
        activeChestIds.add(chest.id);

        let sprite = this.chestSprites.get(chest.id);

        if (!sprite) {
          // Create new chest sprite
          sprite = this.add.sprite(chest.position.x, chest.position.y, 'chest_closed_1');
          sprite.setDepth(6);
          sprite.setScale(2.5); // Scale up 16x16 to ~40px

          // Play idle animation
          sprite.play('chest_idle');

          // Make interactive
          sprite.setInteractive({ useHandCursor: true });
          const chestId = chest.id; // Capture ID, not the whole object
          sprite.on('pointerdown', () => {
            // Find current chest state from server data
            const state = wsClient.currentState;
            if (!state) return;

            let currentChest: Chest | null = null;
            for (const r of state.dungeon.rooms) {
              if (r.chests) {
                currentChest = r.chests.find((c: Chest) => c.id === chestId) || null;
                if (currentChest) break;
              }
            }

            if (currentChest && !currentChest.isOpen) {
              // Check if locked
              if (currentChest.isLocked) {
                this.showNotification('Chest is locked! Need a key.', undefined, 'warning');
                return;
              }

              // Check distance client-side for feedback
              const player = wsClient.getCurrentPlayer();
              if (player) {
                const dx = player.position.x - currentChest.position.x;
                const dy = player.position.y - currentChest.position.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance > 80) {
                  this.showNotification('Too far from chest!', 0xff8800);
                  return;
                }
              }
              // Request to open chest from server
              console.log('[DEBUG] Sending OPEN_CHEST for:', chestId);
              wsClient.send({ type: 'OPEN_CHEST', chestId });
            }
          });

          // Size difference for epic/rare chests (tint doesn't work on animated sprites)
          if (chest.lootTier === 'epic') {
            sprite.setScale(3.0); // Epic chests are bigger
          } else if (chest.lootTier === 'rare') {
            sprite.setScale(2.7); // Rare chests slightly bigger
          }

          this.chestSprites.set(chest.id, sprite);
        }

        // Handle open state
        if (chest.isOpen && sprite.anims.currentAnim?.key !== 'chest_open') {
          sprite.play('chest_open');
          sprite.disableInteractive();
        }
      }
    }

    // Remove sprites for chests that no longer exist
    for (const [id, sprite] of this.chestSprites) {
      if (!activeChestIds.has(id)) {
        sprite.destroy();
        this.chestSprites.delete(id);
      }
    }
  }

  private renderPlayers(players: Player[]): void {
    const activePlayerIds = new Set<string>();

    for (const player of players) {
      activePlayerIds.add(player.id);

      if (!player.isAlive) continue;

      // Get or create sprite
      let sprite = this.playerSprites.get(player.id);

      if (!sprite) {
        // Determine initial texture - use first movement frame if player should be moving
        const shouldStartMoving = this.playerMovementAnimating.has(player.id);
        const moveScale = this.classMovementScales[player.classId];
        const moveAnimKey = `${player.classId}_move`;

        let initialTexture = `player_${player.classId}`; // Default to idle
        let initialScale = 0.15;

        if (shouldStartMoving && moveScale && this.anims.exists(moveAnimKey)) {
          // Start with first frame of movement animation to avoid any idle flash
          initialTexture = `${player.classId}_move_1`;
          initialScale = moveScale;
        }

        sprite = this.add.sprite(player.position.x, player.position.y, initialTexture);
        sprite.setDepth(20);
        sprite.setScale(initialScale);
        this.playerSprites.set(player.id, sprite);

        // Start movement animation immediately if player should be moving
        if (shouldStartMoving && moveScale && this.anims.exists(moveAnimKey)) {
          sprite.play(moveAnimKey);
        }
      } else {
        // Reset alpha in case player respawned after death animation
        sprite.setAlpha(1);
        // Only reset scale if not playing movement animation
        if (!this.playerMovementAnimating.has(player.id) && !this.playerAbilityAnimating.has(player.id)) {
          sprite.setScale(0.15);
        }

        // DEFENSIVE: Ensure movement animation keeps playing if player should be moving
        // Only restart if animation is truly not set up correctly (not on every frame)
        if (this.playerMovementAnimating.has(player.id) && !this.playerAbilityAnimating.has(player.id)) {
          const moveAnimKey = `${player.classId}_move`;
          const idleTextureKey = `player_${player.classId}`;
          const currentAnim = sprite.anims.currentAnim;
          const currentTextureKey = sprite.texture?.key;

          // Only restart if truly needed:
          // 1. No animation set at all, OR
          // 2. Wrong animation playing, OR
          // 3. Sprite showing idle texture (definite sign animation isn't running)
          const animationNotSet = !currentAnim || currentAnim.key !== moveAnimKey;
          const showingIdleTexture = currentTextureKey === idleTextureKey;

          if (this.anims.exists(moveAnimKey) && (animationNotSet || showingIdleTexture)) {
            const moveScale = this.classMovementScales[player.classId];
            if (moveScale) {
              sprite.setScale(moveScale);
              sprite.play(moveAnimKey);
            }
          }
        }
      }

      // Update position
      sprite.setPosition(player.position.x, player.position.y);

      // Highlight current player
      const isCurrentPlayer = player.id === wsClient.playerId;
      if (isCurrentPlayer) {
        sprite.setTint(0xffffff);
      }

      // Update health bar (with padding above character)
      this.updateHealthBar(player.id, player.position.x, player.position.y - 35, player.stats.health, player.stats.maxHealth, 40);

      // Render protection visual effect for buffs
      this.renderProtectionEffect(player);
    }

    // Remove sprites for players that left
    for (const [id, sprite] of this.playerSprites) {
      if (!activePlayerIds.has(id)) {
        sprite.destroy();
        this.playerSprites.delete(id);
        this.removeHealthBar(id);
        // Clean up protection effect
        const protectionGraphics = this.protectionEffects.get(id);
        if (protectionGraphics) {
          protectionGraphics.destroy();
          this.protectionEffects.delete(id);
        }
      }
    }
  }

  private renderProtectionEffect(player: Player): void {
    // Check if player has any active buffs
    const activeBuffs = player.buffs?.filter(b => !b.isDebuff && b.duration > 0) || [];

    // Get or create graphics for this player's protection effect
    let graphics = this.protectionEffects.get(player.id);

    if (activeBuffs.length === 0) {
      // No active buffs - remove effect if exists
      if (graphics) {
        graphics.destroy();
        this.protectionEffects.delete(player.id);
      }
      return;
    }

    // Get the buff with longest duration for color/display
    const primaryBuff = activeBuffs.reduce((a, b) =>
      a.maxDuration >= b.maxDuration ? a : b
    );

    // Check for specific ability buffs
    const hasBladeFlurry = activeBuffs.some(b => b.icon === 'rogue_bladeflurry');
    const hasVanish = activeBuffs.some(b => b.icon === 'rogue_vanish');
    const hasStealth = activeBuffs.some(b => b.icon === 'rogue_stealth');
    const hasRetaliation = activeBuffs.some(b => b.icon === 'warrior_retaliation');
    const hasBloodlust = activeBuffs.some(b => b.icon === 'warrior_bloodlust');
    const hasSoulstone = activeBuffs.some(b => b.icon === 'warlock_soulstone');

    // Determine color based on buff type
    let color: number;
    if (hasBladeFlurry) {
      color = 0xff4488; // Magenta/pink for Blade Flurry
    } else if (hasStealth) {
      color = 0x6666aa; // Darker purple for out-of-combat Stealth
    } else if (hasVanish) {
      color = 0x8888cc; // Purple/blue for Vanish (combat stealth)
    } else if (hasRetaliation) {
      color = 0xffaa00; // Orange for Retaliation
    } else if (hasBloodlust) {
      color = 0xff2222; // Blood red for Bloodlust
    } else if (hasSoulstone) {
      color = 0x9966ff; // Purple/violet for Soulstone
    } else {
      const isShieldBuff = primaryBuff.name.toLowerCase().includes('shield') ||
                           primaryBuff.name.toLowerCase().includes('protection') ||
                           primaryBuff.name.toLowerCase().includes('barrier');
      color = isShieldBuff ? 0xffd700 : 0x44aaff; // Gold for shields, blue for others
    }

    // Calculate alpha based on remaining duration (pulse effect + duration fade)
    const durationPercent = primaryBuff.duration / primaryBuff.maxDuration;
    const time = this.time.now / 1000;
    const pulse = 0.3 + Math.sin(time * 3) * 0.15; // Pulsing between 0.15 and 0.45
    const alpha = Math.min(0.6, pulse + durationPercent * 0.2);

    if (!graphics) {
      graphics = this.add.graphics();
      graphics.setDepth(12); // Below player but visible
      this.protectionEffects.set(player.id, graphics);
    }

    // Clear and redraw
    graphics.clear();

    const centerX = player.position.x;
    const centerY = player.position.y;

    // Special effect for Blade Flurry - fast spinning blades
    if (hasBladeFlurry) {
      const bladeFlurryBuff = activeBuffs.find(b => b.icon === 'rogue_bladeflurry');
      const bfDurationPercent = bladeFlurryBuff ? bladeFlurryBuff.duration / bladeFlurryBuff.maxDuration : 1;
      const bladeRotation = time * 8; // Fast rotation for blades
      const numBlades = 4;
      const bladeRadius = 30;
      const bladeLength = 12;

      graphics.lineStyle(2, color, alpha * 1.2);

      for (let i = 0; i < numBlades; i++) {
        const angle = bladeRotation + (i * Math.PI * 2 / numBlades);
        const startX = centerX + Math.cos(angle) * (bladeRadius - bladeLength);
        const startY = centerY + Math.sin(angle) * (bladeRadius - bladeLength);
        const endX = centerX + Math.cos(angle) * (bladeRadius + bladeLength * 0.5);
        const endY = centerY + Math.sin(angle) * (bladeRadius + bladeLength * 0.5);

        // Draw blade line
        graphics.beginPath();
        graphics.moveTo(startX, startY);
        graphics.lineTo(endX, endY);
        graphics.strokePath();

        // Draw blade tip
        graphics.fillStyle(color, alpha);
        graphics.fillCircle(endX, endY, 3);
      }

      // Draw inner swirl
      graphics.lineStyle(1, color, alpha * 0.5);
      const innerRadius = 15;
      for (let i = 0; i < 3; i++) {
        const swirlAngle = bladeRotation * 1.5 + (i * Math.PI * 2 / 3);
        const px = centerX + Math.cos(swirlAngle) * innerRadius;
        const py = centerY + Math.sin(swirlAngle) * innerRadius;
        graphics.strokeCircle(px, py, 3);
      }

      // Duration indicator arc
      graphics.lineStyle(2, color, alpha * 0.4);
      graphics.beginPath();
      graphics.arc(centerX, centerY, bladeRadius + 5, 0, Math.PI * 2 * bfDurationPercent, false);
      graphics.strokePath();
      return;
    }

    // Special effect for Stealth (out of combat) - prominent shadowy aura
    if (hasStealth) {
      const stealthBuff = activeBuffs.find(b => b.icon === 'rogue_stealth');
      const stealthDurationPercent = stealthBuff ? stealthBuff.duration / stealthBuff.maxDuration : 1;

      // Much stronger alpha for visibility
      const baseAlpha = 0.8;
      const pulseAlpha = baseAlpha + Math.sin(time * 4) * 0.2;

      // Outer glow ring - thick and visible
      const pulseRadius = 32 + Math.sin(time * 3) * 4;
      graphics.lineStyle(4, 0x8866ff, pulseAlpha);
      graphics.strokeCircle(centerX, centerY, pulseRadius);

      // Inner shadow circle
      graphics.lineStyle(3, 0x6644cc, pulseAlpha * 0.8);
      graphics.strokeCircle(centerX, centerY, pulseRadius - 8);

      // Rotating dagger symbols (4 daggers)
      const numDaggers = 4;
      for (let i = 0; i < numDaggers; i++) {
        const angle = time * 1.5 + (i * Math.PI * 2 / numDaggers);
        const dist = pulseRadius - 4;
        const px = centerX + Math.cos(angle) * dist;
        const py = centerY + Math.sin(angle) * dist;

        // Draw dagger shape
        graphics.fillStyle(0xccaaff, pulseAlpha);
        graphics.fillCircle(px, py, 5);

        // Trail behind dagger
        const trailAngle = angle - 0.3;
        const trailX = centerX + Math.cos(trailAngle) * dist;
        const trailY = centerY + Math.sin(trailAngle) * dist;
        graphics.fillStyle(0x8866ff, pulseAlpha * 0.5);
        graphics.fillCircle(trailX, trailY, 3);
      }

      // Shadow wisps floating around
      graphics.fillStyle(0xaa88ff, pulseAlpha * 0.6);
      for (let i = 0; i < 6; i++) {
        const angle = time * 0.7 + (i * Math.PI / 3);
        const dist = 20 + Math.sin(time * 2 + i * 1.5) * 6;
        const px = centerX + Math.cos(angle) * dist;
        const py = centerY + Math.sin(angle) * dist;
        graphics.fillCircle(px, py, 4);
      }

      // Duration arc - prominent
      graphics.lineStyle(5, 0xffaaff, 0.6);
      graphics.beginPath();
      graphics.arc(centerX, centerY, pulseRadius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * stealthDurationPercent, false);
      graphics.strokePath();

      // "STEALTH" text effect - pulsing glow beneath player
      graphics.fillStyle(0x6644cc, pulseAlpha * 0.3);
      graphics.fillCircle(centerX, centerY, 15);
      return;
    }

    // Special effect for Vanish - fading shadow
    if (hasVanish) {
      const vanishBuff = activeBuffs.find(b => b.icon === 'rogue_vanish');
      const vanishDurationPercent = vanishBuff ? vanishBuff.duration / vanishBuff.maxDuration : 1;
      const fadeAlpha = alpha * 0.5 * vanishDurationPercent;

      // Draw fading concentric circles
      for (let i = 3; i > 0; i--) {
        graphics.lineStyle(1, color, fadeAlpha * (i / 3));
        graphics.strokeCircle(centerX, centerY, 20 + i * 5);
      }

      // Draw shadow particles
      graphics.fillStyle(color, fadeAlpha);
      for (let i = 0; i < 6; i++) {
        const angle = time * 1.5 + (i * Math.PI / 3);
        const dist = 22 + Math.sin(time * 2 + i) * 5;
        const px = centerX + Math.cos(angle) * dist;
        const py = centerY + Math.sin(angle) * dist;
        graphics.fillCircle(px, py, 2);
      }
      return;
    }

    // Special effect for Soulstone - demonic soul gem aura
    if (hasSoulstone) {
      const soulstoneBuff = activeBuffs.find(b => b.icon === 'warlock_soulstone');
      const ssDurationPercent = soulstoneBuff ? soulstoneBuff.duration / soulstoneBuff.maxDuration : 1;

      // Pulsing inner glow (soul gem effect)
      const pulseIntensity = 0.5 + Math.sin(time * 4) * 0.3;
      const innerGlowAlpha = alpha * pulseIntensity * ssDurationPercent;

      // Draw inner soul gem glow
      graphics.fillStyle(0x9966ff, innerGlowAlpha * 0.3);
      graphics.fillCircle(centerX, centerY, 25);
      graphics.fillStyle(0xcc88ff, innerGlowAlpha * 0.5);
      graphics.fillCircle(centerX, centerY, 18);
      graphics.fillStyle(0xeeccff, innerGlowAlpha * 0.7);
      graphics.fillCircle(centerX, centerY, 10);

      // Rotating soul particles (like spirits being bound)
      const numSouls = 4;
      const soulRadius = 32;
      for (let i = 0; i < numSouls; i++) {
        const soulAngle = time * 2 + (i * Math.PI * 2 / numSouls);
        const wobble = Math.sin(time * 3 + i) * 5;
        const sx = centerX + Math.cos(soulAngle) * (soulRadius + wobble);
        const sy = centerY + Math.sin(soulAngle) * (soulRadius + wobble);

        // Soul wisp trail
        graphics.lineStyle(2, 0x9966ff, alpha * 0.6);
        graphics.beginPath();
        const trailAngle = soulAngle - 0.5;
        const trailX = centerX + Math.cos(trailAngle) * (soulRadius + wobble);
        const trailY = centerY + Math.sin(trailAngle) * (soulRadius + wobble);
        graphics.moveTo(trailX, trailY);
        graphics.lineTo(sx, sy);
        graphics.strokePath();

        // Soul particle
        graphics.fillStyle(0xcc99ff, alpha * 0.9);
        graphics.fillCircle(sx, sy, 4);
        graphics.fillStyle(0xffffff, alpha * 0.5);
        graphics.fillCircle(sx, sy, 2);
      }

      // Duration indicator ring
      graphics.lineStyle(2, 0x9966ff, alpha * 0.4);
      graphics.beginPath();
      graphics.arc(centerX, centerY, soulRadius + 8, 0, Math.PI * 2 * ssDurationPercent, false);
      graphics.strokePath();

      // Small demonic runes at fixed positions (subtle)
      const runeAlpha = alpha * 0.3 * (0.5 + Math.sin(time * 2) * 0.5);
      graphics.lineStyle(1, 0x6633aa, runeAlpha);
      for (let i = 0; i < 3; i++) {
        const runeAngle = (i * Math.PI * 2 / 3) + time * 0.5;
        const rx = centerX + Math.cos(runeAngle) * 42;
        const ry = centerY + Math.sin(runeAngle) * 42;
        // Small diamond shape for rune
        graphics.beginPath();
        graphics.moveTo(rx, ry - 4);
        graphics.lineTo(rx + 3, ry);
        graphics.lineTo(rx, ry + 4);
        graphics.lineTo(rx - 3, ry);
        graphics.closePath();
        graphics.strokePath();
      }
      return;
    }

    // Default effect - rotating arc segments around the player
    const radius = 28;
    const numSegments = 6;
    const arcLength = (Math.PI * 2 / numSegments) * 0.6; // 60% of segment
    const rotation = time * 2; // Rotate over time

    graphics.lineStyle(3, color, alpha);

    for (let i = 0; i < numSegments; i++) {
      const startAngle = rotation + (i * Math.PI * 2 / numSegments);
      const endAngle = startAngle + arcLength * durationPercent;

      graphics.beginPath();
      graphics.arc(centerX, centerY, radius, startAngle, endAngle, false);
      graphics.strokePath();
    }

    // Draw inner glow circle
    const glowAlpha = alpha * 0.3;
    graphics.lineStyle(1, color, glowAlpha);
    graphics.strokeCircle(centerX, centerY, radius - 5);

    // Add small particles at arc endpoints for extra visual flair
    if (durationPercent > 0.3) {
      const particleAlpha = (durationPercent - 0.3) * alpha;
      graphics.fillStyle(color, particleAlpha);
      for (let i = 0; i < numSegments; i++) {
        const angle = rotation + (i * Math.PI * 2 / numSegments) + arcLength * durationPercent;
        const px = centerX + Math.cos(angle) * radius;
        const py = centerY + Math.sin(angle) * radius;
        graphics.fillCircle(px, py, 2);
      }
    }
  }

  private renderPets(pets: Pet[]): void {
    const activePetIds = new Set<string>();
    const currentPlayerId = wsClient.playerId;

    for (const pet of pets) {
      activePetIds.add(pet.id);

      if (!pet.isAlive) {
        // Remove dead pet sprite
        const sprite = this.petSprites.get(pet.id);
        if (sprite) {
          sprite.destroy();
          this.petSprites.delete(pet.id);
        }
        this.removeHealthBar(pet.id);
        this.knownPetIds.delete(pet.id);
        continue;
      }

      // Get or create sprite
      let sprite = this.petSprites.get(pet.id);

      if (!sprite) {
        // Use pet-specific textures
        const texture = pet.petType === 'imp' ? 'pet_imp' : 'pet_voidwalker';
        sprite = this.add.sprite(pet.position.x, pet.position.y, texture);
        sprite.setDepth(15);
        sprite.setScale(0.12); // Scale down pet images (~40px tall from 330px)
        this.petSprites.set(pet.id, sprite);

        // Check if this is a new pet (just summoned)
        if (!this.knownPetIds.has(pet.id)) {
          this.knownPetIds.add(pet.id);

          // Show summon notification if it's our pet
          if (pet.ownerId === currentPlayerId) {
            this.showNotification(`${pet.name} summoned!`, undefined, 'success');
          }

          // Create summon visual effect
          this.createSummonEffect(pet.position.x, pet.position.y);
        }
      }

      // Update position
      sprite.setPosition(pet.position.x, pet.position.y);

      // Update health bar
      this.updateHealthBar(pet.id, pet.position.x, pet.position.y - 20, pet.stats.health, pet.stats.maxHealth, 30);
    }

    // Remove sprites for pets that no longer exist
    for (const [id, sprite] of this.petSprites) {
      if (!activePetIds.has(id)) {
        sprite.destroy();
        this.petSprites.delete(id);
        this.removeHealthBar(id);
        this.knownPetIds.delete(id);
      }
    }
  }

  private renderVendors(rooms: Room[]): void {
    const activeVendorIds = new Set<string>();

    for (const room of rooms) {
      // Collect all vendors in this room (trainer, shop, and crypto)
      const vendors: (Vendor | import('@dungeon-link/shared').CryptoVendor)[] = [];
      if (room.vendor) vendors.push(room.vendor);
      if (room.shopVendor) vendors.push(room.shopVendor);
      if (room.cryptoVendor) vendors.push(room.cryptoVendor);

      for (const vendor of vendors) {
        activeVendorIds.add(vendor.id);

        // Get or create vendor sprite
        let container = this.vendorSprites.get(vendor.id);

        if (!container) {
          container = this.add.container(vendor.position.x, vendor.position.y);

          const isShop = vendor.vendorType === 'shop';
          const isCrypto = vendor.vendorType === 'crypto';
          // For crypto vendor, use priest sprite; otherwise use npc_vendor or npc_trainer
          const spriteKey = isCrypto ? 'player_priest' : isShop ? 'npc_vendor' : 'npc_trainer';
          const nameColor = isCrypto ? '#9966ff' : isShop ? '#ffcc44' : '#44ff44';
          const fallbackColor = isCrypto ? 0x663399 : isShop ? 0x886622 : 0x228833;
          const fallbackStroke = isCrypto ? 0x9966ff : isShop ? 0xddaa44 : 0x44dd55;

          // Use appropriate sprite if available, otherwise fallback to graphics
          if (this.textures.exists(spriteKey)) {
            const sprite = this.add.image(0, 0, spriteKey);
            // Crypto vendor (priest) needs different scale than NPC sprites
            sprite.setScale(isCrypto ? 0.18 : 0.22);
            container.add(sprite);
          } else {
            // Fallback: Vendor body
            const body = this.add.graphics();
            body.fillStyle(fallbackColor, 1);
            body.fillCircle(0, 0, 20);
            body.lineStyle(3, fallbackStroke, 1);
            body.strokeCircle(0, 0, 20);

            // Icon based on type
            if (isCrypto) {
              // Potion flask icon for crypto vendor
              body.fillStyle(0x00ff88, 1);
              body.fillRect(-4, -8, 8, 12);
              body.fillStyle(0xaaaaaa, 1);
              body.fillRect(-3, -12, 6, 4);
              body.fillStyle(0x00ff88, 0.5);
              body.fillCircle(0, 2, 6);
            } else if (isShop) {
              // Coin/gold icon for shop
              body.fillStyle(0xffd700, 1);
              body.fillCircle(0, 0, 10);
              body.fillStyle(0xaa8800, 1);
              body.fillRect(-3, -8, 6, 16);
            } else {
              // Scroll/book for trainer
              body.fillStyle(0xffffcc, 1);
              body.fillRect(-8, -10, 16, 20);
              body.fillStyle(0x8b4513, 1);
              body.fillRect(-10, -12, 4, 24);
            }

            container.add(body);
          }

          // Vendor name
          const nameText = this.add.text(0, -35, vendor.name, {
            fontFamily: FONTS.title,
            fontSize: '12px',
            color: nameColor,
            stroke: '#000000',
            strokeThickness: 2
          }).setOrigin(0.5);
          container.add(nameText);

          // Type label under name
          const typeLabelText = isCrypto ? '(Alchemist)' : isShop ? '(Shop)' : '(Trainer)';
          const typeLabel = this.add.text(0, -22, typeLabelText, {
            fontFamily: FONTS.body,
            fontSize: '9px',
            color: isCrypto ? '#9966ff' : '#888888'
          }).setOrigin(0.5);
          container.add(typeLabel);

          // "Click to interact" hint
          const hintText = this.add.text(0, 30, '[Click]', {
            fontFamily: FONTS.body,
            fontSize: '10px',
            color: '#aaaaaa'
          }).setOrigin(0.5);
          container.add(hintText);

          container.setDepth(15);

          // Make interactive
          const hitArea = this.add.rectangle(0, 0, 50, 50, 0x000000, 0);
          hitArea.setInteractive({ useHandCursor: true });
          hitArea.on('pointerdown', () => {
            // Don't open vendor UI if already open
            if (this.vendorModalOpen) {
              return;
            }
            if (isCrypto) {
              // Open crypto vendor modal and request services from server
              wsClient.send({ type: 'GET_CRYPTO_VENDOR_SERVICES' });
            } else {
              wsClient.send({ type: 'INTERACT_VENDOR', vendorId: vendor.id });
            }
          });
          hitArea.on('pointerover', () => {
            hintText.setColor('#ffffff');
          });
          hitArea.on('pointerout', () => {
            hintText.setColor('#aaaaaa');
          });
          container.add(hitArea);

          this.vendorSprites.set(vendor.id, container);
        }

        // Update position
        container.setPosition(vendor.position.x, vendor.position.y);
      }
    }

    // Remove vendors that no longer exist
    for (const [id, container] of this.vendorSprites) {
      if (!activeVendorIds.has(id)) {
        container.destroy();
        this.vendorSprites.delete(id);
      }
    }
  }

  private showVendorUI(): void {
    console.log('[DEBUG] showVendorUI called, services:', this.vendorServices);

    // Determine if this is a shop vendor by checking the vendor ID or service types
    const isShop = this.currentVendorId?.startsWith('shop_') ||
      this.vendorServices.some(s => s.type === 'sell_item' || s.type === 'sell_all');

    const player = wsClient.getCurrentPlayer();

    // Open the React vendor modal
    openVendor(
      this.currentVendorId || '',
      isShop ? 'shop' : 'trainer',
      this.vendorServices,
      player?.gold ?? 0
    );

    this.vendorModalOpen = true;

    // Listen for vendor-closed event to reset state
    const unsubClose = onWalletEvent('vendor-closed', () => {
      this.closeVendorUI();
      unsubClose();
    });
  }

  private closeVendorUI(clearServices: boolean = true): void {
    // Close the React modal
    closeVendor();
    this.vendorModalOpen = false;

    if (clearServices) {
      this.currentVendorId = null;
      this.vendorServices = [];
    }
  }

  private renderGroundEffects(effects: GroundEffect[]): void {
    const activeEffectIds = new Set<string>();

    for (const effect of effects) {
      activeEffectIds.add(effect.id);

      let container = this.groundEffectGraphics.get(effect.id);

      if (!container) {
        // Create new ground effect visual
        container = this.createGroundEffectVisual(effect);
        this.groundEffectGraphics.set(effect.id, container);
      }

      // Update position
      container.setPosition(effect.position.x, effect.position.y);

      // Update visual based on effect type
      this.updateGroundEffectVisual(container, effect);
    }

    // Remove effects that no longer exist
    for (const [id, container] of this.groundEffectGraphics) {
      if (!activeEffectIds.has(id)) {
        // Fade out effect
        this.tweens.add({
          targets: container,
          alpha: 0,
          duration: 200,
          onComplete: () => {
            container.destroy();
          }
        });
        this.groundEffectGraphics.delete(id);
      }
    }
  }

  private createGroundEffectVisual(effect: GroundEffect): Phaser.GameObjects.Container {
    const container = this.add.container(effect.position.x, effect.position.y).setDepth(4);

    // Parse color from hex string
    const color = parseInt(effect.color.replace('#', ''), 16);

    // Create base circle/graphic based on type
    switch (effect.type) {
      case GroundEffectType.ExpandingCircle:
      case GroundEffectType.VoidZone: {
        // Filled circle with border
        const circle = this.add.circle(0, 0, effect.radius, color, 0.3);
        circle.setStrokeStyle(3, color, 0.8);
        circle.setName('main_shape');
        container.add(circle);

        // Inner glow
        const innerGlow = this.add.circle(0, 0, effect.radius * 0.5, color, 0.2);
        innerGlow.setName('inner_glow');
        container.add(innerGlow);
        break;
      }

      case GroundEffectType.FirePool: {
        // Static fire pool
        const pool = this.add.circle(0, 0, effect.radius, color, 0.4);
        pool.setStrokeStyle(2, color, 0.9);
        pool.setName('main_shape');
        container.add(pool);

        // Add some "flame" particles
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2;
          const dist = effect.radius * 0.6;
          const flame = this.add.circle(
            Math.cos(angle) * dist,
            Math.sin(angle) * dist,
            8, color, 0.6
          );
          flame.setName(`flame_${i}`);
          container.add(flame);

          // Animate flames
          this.tweens.add({
            targets: flame,
            y: flame.y - 15,
            alpha: 0.2,
            duration: 500 + Math.random() * 300,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
          });
        }
        break;
      }

      case GroundEffectType.MovingWave: {
        // Moving wave/projectile
        const wave = this.add.circle(0, 0, effect.radius, color, 0.5);
        wave.setStrokeStyle(4, color, 1);
        wave.setName('main_shape');
        container.add(wave);

        // Trail effect
        const trail1 = this.add.circle(0, 0, effect.radius * 0.7, color, 0.3);
        trail1.setName('trail1');
        container.add(trail1);

        const trail2 = this.add.circle(0, 0, effect.radius * 0.4, color, 0.2);
        trail2.setName('trail2');
        container.add(trail2);
        break;
      }

      case GroundEffectType.RotatingBeam: {
        // Long rectangular beam
        const beamLength = effect.radius;
        const beamWidth = 30;

        const beam = this.add.rectangle(beamLength / 2, 0, beamLength, beamWidth, color, 0.4);
        beam.setStrokeStyle(2, color, 0.8);
        beam.setName('main_shape');
        container.add(beam);

        // Beam glow
        const glow = this.add.rectangle(beamLength / 2, 0, beamLength + 10, beamWidth + 10, color, 0.2);
        glow.setName('glow');
        container.add(glow);
        break;
      }
    }

    // Add warning indicator for new effects
    const warning = this.add.circle(0, 0, effect.maxRadius, 0xff0000, 0);
    warning.setStrokeStyle(2, 0xff0000, 0.5);
    warning.setName('warning');
    container.add(warning);

    // Flash warning then fade
    this.tweens.add({
      targets: warning,
      alpha: 0,
      duration: 1000,
      ease: 'Cubic.easeOut'
    });

    return container;
  }

  private updateGroundEffectVisual(container: Phaser.GameObjects.Container, effect: GroundEffect): void {
    const color = parseInt(effect.color.replace('#', ''), 16);

    switch (effect.type) {
      case GroundEffectType.ExpandingCircle:
      case GroundEffectType.VoidZone: {
        const circle = container.getByName('main_shape') as Phaser.GameObjects.Arc;
        const innerGlow = container.getByName('inner_glow') as Phaser.GameObjects.Arc;

        if (circle) {
          circle.setRadius(effect.radius);
        }
        if (innerGlow) {
          innerGlow.setRadius(effect.radius * 0.5);
        }
        break;
      }

      case GroundEffectType.RotatingBeam: {
        // Rotate the container based on direction
        if (effect.direction) {
          const angle = Math.atan2(effect.direction.y, effect.direction.x);
          container.setRotation(angle);
        }
        break;
      }

      case GroundEffectType.MovingWave: {
        // Update trail positions based on direction
        if (effect.direction) {
          const trail1 = container.getByName('trail1') as Phaser.GameObjects.Arc;
          const trail2 = container.getByName('trail2') as Phaser.GameObjects.Arc;

          if (trail1) {
            trail1.setPosition(-effect.direction.x * 15, -effect.direction.y * 15);
          }
          if (trail2) {
            trail2.setPosition(-effect.direction.x * 30, -effect.direction.y * 30);
          }
        }
        break;
      }
    }

    // Pulse effect for all types
    const pulseAmount = 1 + Math.sin(this.time.now / 200) * 0.1;
    container.setScale(pulseAmount);

    // Fade as duration decreases
    if (effect.duration < 1) {
      container.setAlpha(effect.duration);
    }
  }

  private createSummonEffect(x: number, y: number): void {
    // Play summon sound
    this.playSfx('sfxCast');

    // Create expanding purple circle effect
    const summonCircle = this.add.circle(x, y, 10, 0xaa44ff, 0.8).setDepth(14);

    this.tweens.add({
      targets: summonCircle,
      radius: 50,
      alpha: 0,
      duration: 500,
      ease: 'Cubic.easeOut',
      onComplete: () => summonCircle.destroy()
    });

    // Create particles rising upward
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const particle = this.add.circle(
        x + Math.cos(angle) * 15,
        y + Math.sin(angle) * 15,
        4,
        0xcc66ff,
        1
      ).setDepth(16);

      this.tweens.add({
        targets: particle,
        y: y - 40,
        alpha: 0,
        duration: 600,
        ease: 'Cubic.easeOut',
        delay: i * 50,
        onComplete: () => particle.destroy()
      });
    }
  }

  private updateHealthBar(id: string, x: number, y: number, health: number, maxHealth: number, width: number): void {
    let bars = this.healthBars.get(id);

    if (!bars) {
      const bg = this.add.rectangle(x, y, width, 6, 0x222222).setDepth(30);
      const fill = this.add.rectangle(x, y, width, 6, 0x44aa44).setDepth(31);
      bars = { bg, fill };
      this.healthBars.set(id, bars);
    }

    const healthPercent = health / maxHealth;
    const fillWidth = width * healthPercent;

    bars.bg.setPosition(x, y);
    bars.fill.setPosition(x - (width - fillWidth) / 2, y);
    bars.fill.setSize(fillWidth, 6);

    // Color based on health
    if (healthPercent > 0.5) {
      bars.fill.setFillStyle(0x44aa44);
    } else if (healthPercent > 0.25) {
      bars.fill.setFillStyle(0xaaaa44);
    } else {
      bars.fill.setFillStyle(0xaa4444);
    }
  }

  private removeHealthBar(id: string): void {
    const bars = this.healthBars.get(id);
    if (bars) {
      bars.bg.destroy();
      bars.fill.destroy();
      this.healthBars.delete(id);
    }
  }

  private renderMinimap(rooms: Room[], currentRoomId: string): void {
    if (!this.minimapGraphics) return;

    this.minimapGraphics.clear();

    // Minimap is inside the navigator panel container (right side)
    // Coordinates are relative to the container
    const panelWidth = 200;
    const panelHeight = 110;
    const mapSize = 85;
    const mapX = panelWidth - mapSize - 10 + 3; // Inset from frame
    const mapY = (panelHeight - mapSize) / 2 + 3;
    const mapDrawSize = mapSize - 6; // Leave some padding inside the frame

    // Find dungeon bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const room of rooms) {
      minX = Math.min(minX, room.x);
      minY = Math.min(minY, room.y);
      maxX = Math.max(maxX, room.x + room.width);
      maxY = Math.max(maxY, room.y + room.height);
    }

    // Calculate scale to fit dungeon in map area
    const dungeonWidth = maxX - minX;
    const dungeonHeight = maxY - minY;
    const scale = Math.min(mapDrawSize / dungeonWidth, mapDrawSize / dungeonHeight) * 0.9;

    // Center the dungeon in the map area
    const scaledWidth = dungeonWidth * scale;
    const scaledHeight = dungeonHeight * scale;
    const offsetX = mapX + (mapDrawSize - scaledWidth) / 2;
    const offsetY = mapY + (mapDrawSize - scaledHeight) / 2;

    // Draw corridors first (connections between rooms)
    this.minimapGraphics.lineStyle(2, 0x333344, 0.8);
    for (const room of rooms) {
      const roomCenterX = offsetX + (room.x + room.width / 2 - minX) * scale;
      const roomCenterY = offsetY + (room.y + room.height / 2 - minY) * scale;

      for (const connectedId of room.connectedTo) {
        const connected = rooms.find(r => r.id === connectedId);
        if (connected) {
          const connectedCenterX = offsetX + (connected.x + connected.width / 2 - minX) * scale;
          const connectedCenterY = offsetY + (connected.y + connected.height / 2 - minY) * scale;
          this.minimapGraphics.beginPath();
          this.minimapGraphics.moveTo(roomCenterX, roomCenterY);
          this.minimapGraphics.lineTo(connectedCenterX, connectedCenterY);
          this.minimapGraphics.strokePath();
        }
      }
    }

    // Draw rooms on minimap
    let clearedCount = 0;
    for (const room of rooms) {
      const rx = offsetX + (room.x - minX) * scale;
      const ry = offsetY + (room.y - minY) * scale;
      const rw = Math.max(room.width * scale, 6);
      const rh = Math.max(room.height * scale, 6);

      // Room color based on type and state
      let color = 0x444455; // Default unexplored
      let alpha = 0.7;

      if (room.cleared) {
        color = 0x2a5a2a; // Cleared - muted green
        clearedCount++;
      }
      if (room.type === 'boss') color = 0x773333; // Boss room - dark red
      else if (room.type === 'rare') color = 0x777733; // Rare room - gold tint
      else if (room.type === 'start') color = 0x335577; // Start room - blue tint

      // Current room is highlighted
      if (room.id === currentRoomId) {
        color = 0xc9a227; // Gold for current room
        alpha = 1;
      }

      this.minimapGraphics.fillStyle(color, alpha);
      this.minimapGraphics.fillRoundedRect(rx, ry, rw, rh, 2);

      // Add subtle border for current room
      if (room.id === currentRoomId) {
        this.minimapGraphics.lineStyle(1, 0xffd700, 0.8);
        this.minimapGraphics.strokeRoundedRect(rx, ry, rw, rh, 2);
      }
    }

    // Draw player position with pulsing effect
    const player = wsClient.getCurrentPlayer();
    if (player) {
      const px = offsetX + (player.position.x - minX) * scale;
      const py = offsetY + (player.position.y - minY) * scale;

      // Outer glow
      this.minimapGraphics.fillStyle(0x00ff00, 0.3);
      this.minimapGraphics.fillCircle(px, py, 5);

      // Inner dot
      this.minimapGraphics.fillStyle(0x00ff00, 1);
      this.minimapGraphics.fillCircle(px, py, 3);
    }

    // Update navigator panel info text
    const state = wsClient.currentState;
    if (state && this.navigatorFloorText && this.navigatorRoomText) {
      this.navigatorFloorText.setText(`Floor ${state.floor}`);
      this.navigatorRoomText.setText(`${clearedCount}/${rooms.length} explored`);
    }
  }

  private updateUI(): void {
    // Update ability bar
    const abilities = this.abilitySystem?.getPlayerAbilities() ?? [];
    const player = wsClient.getCurrentPlayer();

    for (let i = 0; i < 5; i++) {
      const slot = this.children.getByName(`ability_slot_${i}`) as Phaser.GameObjects.Image;
      const icon = this.children.getByName(`ability_icon_${i}`) as Phaser.GameObjects.Rectangle;
      const nameText = this.children.getByName(`ability_name_${i}`) as Phaser.GameObjects.Text;
      if (!slot) continue;

      const cdOverlay = this.cooldownOverlays[i];
      const cdText = this.cooldownTexts[i];

      if (i < abilities.length) {
        const ability = abilities[i];

        // Update ability icon color based on type
        if (icon) {
          icon.setVisible(true);
          const iconColor = this.getAbilityIconColor(ability.type);
          icon.setFillStyle(iconColor, 0.85);
        }

        // Draw ability symbol
        const symbolGraphics = this.abilitySymbols[i];
        if (symbolGraphics) {
          symbolGraphics.setVisible(true);
          this.drawAbilitySymbol(symbolGraphics, ability.type, ability.rank);
        }

        // Update ability name
        if (nameText) {
          // Show shortened name (first word or abbreviated)
          const shortName = ability.name.split(' ')[0].substring(0, 8);
          nameText.setText(shortName);
        }

        // Show cooldown overlay and text
        const cdRadial = this.cooldownRadials[i];
        if (ability.cooldown > 0) {
          slot.setTint(0x666666);
          if (cdOverlay) cdOverlay.setVisible(true);
          if (cdText) {
            cdText.setText(Math.ceil(ability.cooldown).toString());
            cdText.setVisible(true);
          }
          // Draw radial cooldown indicator
          if (cdRadial) {
            cdRadial.clear();
            const progress = ability.cooldown / ability.maxCooldown;
            const radius = 18;
            const startAngle = -Math.PI / 2; // Start at top
            const endAngle = startAngle + (progress * Math.PI * 2);
            cdRadial.fillStyle(0x000000, 0.6);
            cdRadial.beginPath();
            cdRadial.moveTo(0, 0);
            cdRadial.arc(0, 0, radius, startAngle, endAngle, false);
            cdRadial.closePath();
            cdRadial.fillPath();
            // Add edge highlight
            cdRadial.lineStyle(2, 0xffffff, 0.4);
            cdRadial.beginPath();
            cdRadial.arc(0, 0, radius, startAngle, endAngle, false);
            cdRadial.strokePath();
          }
        } else if (player && player.stats.mana < ability.manaCost) {
          slot.setTint(0x4444aa); // Not enough mana
          if (icon) icon.setAlpha(0.5);
          if (cdOverlay) cdOverlay.setVisible(false);
          if (cdText) cdText.setVisible(false);
          if (cdRadial) cdRadial.clear();
        } else {
          slot.clearTint();
          if (icon) icon.setAlpha(1);
          if (cdOverlay) cdOverlay.setVisible(false);
          if (cdText) cdText.setVisible(false);
          if (cdRadial) cdRadial.clear();
        }
      } else {
        slot.setTint(0x333333);
        if (icon) icon.setVisible(false);
        if (nameText) nameText.setText('');
        if (cdOverlay) cdOverlay.setVisible(false);
        if (cdText) cdText.setVisible(false);
        // Clear radial
        const cdRadial = this.cooldownRadials[i];
        if (cdRadial) cdRadial.clear();
        // Hide ability symbol
        const symbolGraphics = this.abilitySymbols[i];
        if (symbolGraphics) {
          symbolGraphics.setVisible(false);
        }
      }
    }

    // Update target info panel
    this.updateTargetInfoPanel();

    // Update buffs UI
    this.updateBuffsUI();

    // Update inventory if visible
    if (this.inventoryUI?.isVisible()) {
      this.inventoryUI.update();
    }

    // Update potion counts
    this.updatePotionCounts();
  }

  private updatePotionCounts(): void {
    const player = wsClient.getCurrentPlayer();
    if (!player) return;

    let healthPotions = 0;
    let manaPotions = 0;

    for (const item of player.backpack) {
      if ('amount' in item && 'type' in item) {
        const potion = item as Potion;
        if (potion.type === PotionType.Health) {
          healthPotions++;
        } else if (potion.type === PotionType.Mana) {
          manaPotions++;
        }
      }
    }

    if (this.healthPotionCount) {
      this.healthPotionCount.setText(healthPotions.toString());
      this.healthPotionCount.setColor(healthPotions > 0 ? '#ffffff' : '#666666');
    }
    if (this.manaPotionCount) {
      this.manaPotionCount.setText(manaPotions.toString());
      this.manaPotionCount.setColor(manaPotions > 0 ? '#ffffff' : '#666666');
    }
  }

  private usePotion(type: PotionType): void {
    const player = wsClient.getCurrentPlayer();
    if (!player) return;

    // Find first potion of the requested type in backpack
    for (const item of player.backpack) {
      if ('amount' in item && 'type' in item) {
        const potion = item as Potion;
        if (potion.type === type) {
          wsClient.useItem(potion.id);
          return;
        }
      }
    }
  }

  private updateBuffsUI(): void {
    const player = wsClient.getCurrentPlayer();

    // Hide all buff icons first and disable their input
    for (let i = 0; i < this.buffIcons.length; i++) {
      const icon = this.buffIcons[i];
      icon.setVisible(false);
      if (icon.input) {
        (icon.input as Phaser.Types.Input.InteractiveObject).enabled = false;
      }
      this.buffTexts[i].setText('');
    }

    // Hide tooltip if hovered buff no longer exists
    if (this.hoveredBuffSlot >= 0) {
      const buffCount = player?.buffs?.length ?? 0;
      if (this.hoveredBuffSlot >= buffCount) {
        // The buff we were hovering has expired
        this.buffTooltip?.setVisible(false);
        this.hoveredBuffSlot = -1;
      }
    }

    if (!player || !player.buffs) {
      this.currentBuffsCache = [];
      return;
    }

    // Cache buffs for tooltip access
    this.currentBuffsCache = player.buffs;

    // Passive/aura buffs that shouldn't show duration counter
    const passiveBuffIcons = ['paladin_retribution', 'warlock_demonarmor'];

    // Show active buffs
    for (let i = 0; i < Math.min(player.buffs.length, this.buffIcons.length); i++) {
      const buff = player.buffs[i];
      const icon = this.buffIcons[i];
      const text = this.buffTexts[i];

      icon.setVisible(true);
      // Ensure input is enabled when icon becomes visible
      if (icon.input) {
        (icon.input as Phaser.Types.Input.InteractiveObject).enabled = true;
      }

      // Set the correct texture based on buff icon
      const textureKey = this.getBuffTextureKey(buff.icon, buff.isDebuff);
      if (this.textures.exists(textureKey)) {
        icon.setTexture(textureKey);
      } else {
        // Fallback to generic buff/debuff
        icon.setTexture(buff.isDebuff ? 'debuff_generic' : 'buff_generic');
      }

      // Check if this is a passive buff (don't show duration)
      const isPassive = passiveBuffIcons.includes(buff.icon);

      if (isPassive) {
        // Don't show duration for passive buffs/auras
        text.setText('');
        icon.setAlpha(1);
      } else {
        // Show remaining duration with 's' suffix
        const duration = Math.ceil(buff.duration);
        text.setText(`${duration}s`);

        // Flash when buff is about to expire
        if (duration <= 3) {
          const flashAlpha = 0.5 + Math.sin(this.time.now / 100) * 0.5;
          icon.setAlpha(flashAlpha);
          text.setColor('#ff6666');
        } else {
          icon.setAlpha(1);
          text.setColor('#ffffff');
        }
      }
    }
  }

  private getBuffTextureKey(buffIcon: string, isDebuff: boolean): string {
    // Map buff icon names to texture keys
    // Texture keys are in format: buff_{icon} or debuff_generic
    return `buff_${buffIcon}`;
  }

  private getAbilityIconColor(type: AbilityType): number {
    switch (type) {
      case AbilityType.Damage:
        return 0xcc3333; // Red for damage
      case AbilityType.Heal:
        return 0x33cc33; // Green for healing
      case AbilityType.Buff:
        return 0x3399ff; // Blue for buffs
      case AbilityType.Debuff:
        return 0x9933cc; // Purple for debuffs
      case AbilityType.Summon:
        return 0xff9933; // Orange for summons
      case AbilityType.Utility:
        return 0xcccc33; // Yellow for utility
      default:
        return 0x666666;
    }
  }

  private drawAbilitySymbol(graphics: Phaser.GameObjects.Graphics, type: AbilityType, rank: number): void {
    graphics.clear();
    const size = 12;
    const strokeColor = 0xffffff;
    const strokeAlpha = 0.9;

    graphics.lineStyle(2, strokeColor, strokeAlpha);

    switch (type) {
      case AbilityType.Damage:
        // Draw crossed swords / X shape
        graphics.lineBetween(-size, -size, size, size);
        graphics.lineBetween(-size, size, size, -size);
        // Center dot
        graphics.fillStyle(strokeColor, strokeAlpha);
        graphics.fillCircle(0, 0, 3);
        break;

      case AbilityType.Heal:
        // Draw plus/cross shape
        graphics.lineStyle(3, strokeColor, strokeAlpha);
        graphics.lineBetween(0, -size, 0, size);
        graphics.lineBetween(-size, 0, size, 0);
        break;

      case AbilityType.Buff:
        // Draw arrow pointing up
        graphics.fillStyle(strokeColor, strokeAlpha);
        graphics.fillTriangle(0, -size, -size * 0.8, size * 0.3, size * 0.8, size * 0.3);
        // Small chevron inside
        graphics.lineStyle(2, 0x000000, 0.5);
        graphics.lineBetween(-size * 0.4, 0, 0, -size * 0.5);
        graphics.lineBetween(0, -size * 0.5, size * 0.4, 0);
        break;

      case AbilityType.Debuff:
        // Draw skull-like shape (circle with X eyes)
        graphics.lineStyle(2, strokeColor, strokeAlpha);
        graphics.strokeCircle(0, -2, size * 0.7);
        // X eyes
        const eyeSize = 3;
        graphics.lineBetween(-5 - eyeSize, -4 - eyeSize, -5 + eyeSize, -4 + eyeSize);
        graphics.lineBetween(-5 - eyeSize, -4 + eyeSize, -5 + eyeSize, -4 - eyeSize);
        graphics.lineBetween(5 - eyeSize, -4 - eyeSize, 5 + eyeSize, -4 + eyeSize);
        graphics.lineBetween(5 - eyeSize, -4 + eyeSize, 5 + eyeSize, -4 - eyeSize);
        // Jaw
        graphics.lineBetween(-size * 0.5, size * 0.5, size * 0.5, size * 0.5);
        break;

      case AbilityType.Summon:
        // Draw creature/diamond with inner diamond
        graphics.fillStyle(strokeColor, strokeAlpha);
        graphics.fillTriangle(0, -size, -size, 0, 0, size);
        graphics.fillTriangle(0, -size, size, 0, 0, size);
        // Inner darker diamond
        graphics.fillStyle(0x000000, 0.4);
        const inner = size * 0.4;
        graphics.fillTriangle(0, -inner, -inner, 0, 0, inner);
        graphics.fillTriangle(0, -inner, inner, 0, 0, inner);
        break;

      case AbilityType.Utility:
        // Draw gear/star shape
        graphics.fillStyle(strokeColor, strokeAlpha);
        const points = 6;
        const outerR = size;
        const innerR = size * 0.5;
        for (let i = 0; i < points; i++) {
          const angle1 = (i * 2 * Math.PI / points) - Math.PI / 2;
          const angle2 = ((i + 0.5) * 2 * Math.PI / points) - Math.PI / 2;
          const angle3 = ((i + 1) * 2 * Math.PI / points) - Math.PI / 2;
          graphics.fillTriangle(
            0, 0,
            Math.cos(angle1) * outerR, Math.sin(angle1) * outerR,
            Math.cos(angle2) * innerR, Math.sin(angle2) * innerR
          );
          graphics.fillTriangle(
            0, 0,
            Math.cos(angle2) * innerR, Math.sin(angle2) * innerR,
            Math.cos(angle3) * outerR, Math.sin(angle3) * outerR
          );
        }
        // Center hole
        graphics.fillStyle(0x000000, 0.5);
        graphics.fillCircle(0, 0, 4);
        break;

      default:
        // Draw simple circle
        graphics.fillStyle(strokeColor, strokeAlpha);
        graphics.fillCircle(0, 0, size * 0.6);
    }

    // Draw rank indicator (small dots at bottom)
    if (rank > 1) {
      graphics.fillStyle(0xffd700, 1); // Gold color for rank
      const dotSize = 2;
      const dotSpacing = 5;
      const startX = -((rank - 1) * dotSpacing) / 2;
      for (let r = 0; r < Math.min(rank, 5); r++) {
        graphics.fillCircle(startX + r * dotSpacing, size + 4, dotSize);
      }
    }
  }

  private getBuffColor(buffName: string): { fill: number; stroke: number } {
    const name = buffName.toLowerCase();

    // Specific ability buffs
    if (name.includes('blade flurry') || name.includes('bladeflurry')) {
      return { fill: 0x882244, stroke: 0xff4488 }; // Magenta/pink for Blade Flurry
    }
    if (name.includes('vanish')) {
      return { fill: 0x333366, stroke: 0x8888cc }; // Dark blue/purple for vanish
    }
    if (name.includes('stealth')) {
      return { fill: 0x222244, stroke: 0x6666aa }; // Darker blue for stealth (out of combat)
    }
    if (name.includes('retaliation')) {
      return { fill: 0x884400, stroke: 0xffaa00 }; // Orange for retaliation
    }
    if (name.includes('bloodlust')) {
      return { fill: 0x880000, stroke: 0xff2222 }; // Blood red for bloodlust
    }

    if (name.includes('strength') || name.includes('power') || name.includes('rage')) {
      return { fill: 0x883322, stroke: 0xff6644 }; // Red/orange for attack buffs
    }
    if (name.includes('armor') || name.includes('protection') || name.includes('shield')) {
      return { fill: 0x666666, stroke: 0xaaaaaa }; // Gray for defensive buffs
    }
    if (name.includes('speed') || name.includes('haste')) {
      return { fill: 0x338833, stroke: 0x44ff44 }; // Green for speed
    }
    if (name.includes('mana') || name.includes('intellect')) {
      return { fill: 0x222288, stroke: 0x4444ff }; // Blue for mana
    }
    if (name.includes('regen') || name.includes('heal')) {
      return { fill: 0x228822, stroke: 0x44ff44 }; // Green for healing
    }
    if (name.includes('crit')) {
      return { fill: 0x884422, stroke: 0xffaa44 }; // Orange for crit
    }

    // Default green for generic buffs
    return { fill: 0x228822, stroke: 0x44aa44 };
  }

  private updateTargetInfoPanel(): void {
    const targetId = this.inputManager?.targetEntityId;
    const state = wsClient.currentState;

    if (!targetId || !state) {
      this.targetInfoPanel?.setVisible(false);
      return;
    }

    // Find the target enemy
    let targetEnemy: Enemy | null = null;
    for (const room of state.dungeon.rooms) {
      const enemy = room.enemies.find(e => e.id === targetId && e.isAlive);
      if (enemy) {
        targetEnemy = enemy;
        break;
      }
    }

    if (!targetEnemy) {
      this.targetInfoPanel?.setVisible(false);
      return;
    }

    // Update panel visibility and content
    this.targetInfoPanel?.setVisible(true);

    // Match the panel dimensions from createTargetInfoPanel
    const panelWidth = 200;
    const padding = 10;
    const barWidth = panelWidth - padding * 2; // 180
    const barHeight = 12;

    // Update name with color based on type
    if (this.targetNameText) {
      let nameColor = '#ffffff';
      let prefix = '';
      if (targetEnemy.isBoss) {
        nameColor = '#ff4444';
        prefix = '[Boss] ';
      } else if (targetEnemy.isRare) {
        nameColor = '#ffaa00';
        prefix = '[Rare] ';
      } else if (targetEnemy.isElite) {
        nameColor = '#ff88ff';
        prefix = '[Elite] ';
      }
      this.targetNameText.setText(prefix + targetEnemy.name);
      this.targetNameText.setColor(nameColor);
    }

    // Update type description
    if (this.targetTypeText) {
      const typeDesc = this.getEnemyTypeDescription(targetEnemy.type, targetEnemy.isBoss, targetEnemy.isRare);
      this.targetTypeText.setText(typeDesc);
    }

    // Update boss mechanics/abilities text
    if (this.targetMechanicsText) {
      if (targetEnemy.isBoss && targetEnemy.bossMechanics && targetEnemy.bossMechanics.length > 0) {
        const mechanicsLines = targetEnemy.bossMechanics.map(m => {
          let trigger = '';
          if (m.triggerHealthPercent !== undefined) {
            trigger = ` (at ${m.triggerHealthPercent}% HP)`;
          } else if (m.intervalSeconds !== undefined) {
            trigger = ` (every ${m.intervalSeconds}s)`;
          }
          return `• ${m.name}${trigger}`;
        });
        this.targetMechanicsText.setText(mechanicsLines.join('\n'));
        this.targetMechanicsText.setVisible(true);
      } else {
        this.targetMechanicsText.setText('');
        this.targetMechanicsText.setVisible(false);
      }
    }

    // Calculate dynamic positions based on text heights
    const nameHeight = this.targetNameText?.height ?? 18;
    const typeHeight = this.targetTypeText?.height ?? 14;
    const mechanicsHeight = (this.targetMechanicsText?.visible && this.targetMechanicsText?.text)
      ? (this.targetMechanicsText.height + 6) : 0;

    // Position type text below name with padding
    const typeY = padding + nameHeight + 4;
    this.targetTypeText?.setPosition(padding, typeY);

    // Position mechanics text below type (only if visible)
    const mechanicsY = typeY + typeHeight + 4;
    this.targetMechanicsText?.setPosition(padding, mechanicsY);

    // Position health bar below mechanics text (or type text if no mechanics)
    const healthBarY = mechanicsY + mechanicsHeight + 8;
    if (this.targetHealthBar) {
      this.targetHealthBar.bg.setPosition(padding, healthBarY);
      this.targetHealthBar.fill.setPosition(padding, healthBarY);

      const healthPercent = targetEnemy.stats.health / targetEnemy.stats.maxHealth;
      this.targetHealthBar.fill.setDisplaySize(barWidth * healthPercent, barHeight);

      // Color based on health
      let healthColor = 0x22aa22;
      if (healthPercent < 0.3) healthColor = 0xaa2222;
      else if (healthPercent < 0.6) healthColor = 0xaaaa22;
      this.targetHealthBar.fill.setFillStyle(healthColor);
    }

    // Position health text centered on bar
    const healthTextY = healthBarY + barHeight / 2;
    this.targetHealthText?.setPosition(padding + barWidth / 2, healthTextY);

    // Update health text
    if (this.targetHealthText) {
      this.targetHealthText.setText(`${Math.ceil(targetEnemy.stats.health)} / ${targetEnemy.stats.maxHealth}`);
    }

    // Resize background to fit content (keep width fixed, adjust height)
    const dynamicPanelHeight = healthBarY + barHeight + padding;
    const bg = this.targetInfoPanel?.getByName('targetPanelBg') as Phaser.GameObjects.Rectangle;
    if (bg) {
      bg.setSize(panelWidth, dynamicPanelHeight);
    }

    // Update corner decorations to match new height
    const corners = this.targetInfoPanel?.getByName('targetPanelCorners') as Phaser.GameObjects.Graphics;
    if (corners) {
      corners.clear();
      const cornerSize = 10;
      corners.lineStyle(2, COLORS.borderGold);
      // Top-left
      corners.beginPath();
      corners.moveTo(0, cornerSize);
      corners.lineTo(0, 0);
      corners.lineTo(cornerSize, 0);
      corners.strokePath();
      // Top-right
      corners.beginPath();
      corners.moveTo(panelWidth - cornerSize, 0);
      corners.lineTo(panelWidth, 0);
      corners.lineTo(panelWidth, cornerSize);
      corners.strokePath();
      // Bottom-left
      corners.beginPath();
      corners.moveTo(0, dynamicPanelHeight - cornerSize);
      corners.lineTo(0, dynamicPanelHeight);
      corners.lineTo(cornerSize, dynamicPanelHeight);
      corners.strokePath();
      // Bottom-right
      corners.beginPath();
      corners.moveTo(panelWidth - cornerSize, dynamicPanelHeight);
      corners.lineTo(panelWidth, dynamicPanelHeight);
      corners.lineTo(panelWidth, dynamicPanelHeight - cornerSize);
      corners.strokePath();
    }
  }

  private getEnemyTypeDescription(type: EnemyType, isBoss: boolean, isRare: boolean): string {
    const typeNames: Record<string, string> = {
      'melee': 'Melee Attacker',
      'ranged': 'Ranged Attacker',
      'caster': 'Spellcaster'
    };
    let desc = typeNames[type] ?? 'Unknown';
    if (isBoss) {
      desc += ' - Powerful dungeon boss';
    } else if (isRare) {
      desc += ' - Enhanced enemy with better loot';
    }
    return desc;
  }

  private handleServerMessage(message: ServerMessage): void {
    if (message.type === 'COMBAT_EVENT') {
      const event = message.event;

      // Find source and target positions
      let sourcePos = { x: 0, y: 0 };
      let targetPos = { x: 0, y: 0 };
      let targetEnemy: Enemy | null = null;

      const state = wsClient.currentState;
      let sourceEnemy: Enemy | null = null;
      let sourceIsPet = false;

      if (state) {
        // Find target position and enemy FIRST (needed for boss animation direction)
        for (const room of state.dungeon.rooms) {
          const enemy = room.enemies.find(e => e.id === event.targetId);
          if (enemy) {
            targetPos = enemy.position;
            targetEnemy = enemy;
            break;
          }
        }

        // Check if target is a pet
        const targetPet = state.pets?.find(p => p.id === event.targetId);
        if (targetPet) {
          targetPos = targetPet.position;
        }

        // Check if target is a player
        const targetPlayer = state.players.find(p => p.id === event.targetId);
        if (targetPlayer) {
          targetPos = targetPlayer.position;
        }

        // Find source position (check players, pets, then enemies)
        const sourcePlayer = state.players.find(p => p.id === event.sourceId);
        if (sourcePlayer) {
          sourcePos = sourcePlayer.position;

          // Play ability animation when player with animation uses an ability or auto-attacks
          // Pass source and target positions for directional flipping
          if (event.damage) {
            this.playPlayerAbilityAnimation(sourcePlayer.id, sourcePlayer.classId, sourcePos, targetPos);
          }
        } else {
          // Check if source is a pet
          const sourcePet = state.pets?.find(p => p.id === event.sourceId);
          if (sourcePet) {
            sourcePos = sourcePet.position;
            sourceIsPet = true;
            // Spawn fire projectile for Imp attacks
            if (sourcePet.petType === 'imp' && event.damage && targetPos.x !== 0) {
              this.spawnProjectile(sourcePos.x, sourcePos.y, targetPos.x, targetPos.y, 'imp_firebolt');
              this.spawnImpactEffect(targetPos.x, targetPos.y, 'imp_firebolt');
            }
          } else {
            // Check enemies
            for (const room of state.dungeon.rooms) {
              const enemy = room.enemies.find(e => e.id === event.sourceId);
              if (enemy) {
                sourcePos = enemy.position;
                sourceEnemy = enemy;
                // Play boss attack animation when boss deals damage (with target direction)
                if (enemy.isBoss && enemy.bossId && event.damage) {
                  this.playBossAttackAnimation(enemy.id, enemy.bossId, sourcePos, targetPos);
                } else if (!enemy.isBoss && event.damage && (enemy.type === 'ranged' || enemy.type === 'caster')) {
                  // Play ranged/caster enemy attack animation
                  this.playEnemyRangedAttackAnimation(enemy.id, enemy.name, enemy.type, sourcePos);
                }
                break;
              }
            }
          }
        }

      }

      // Play sound effects
      if (event.damage) {
        // Check if source is a player (not enemy)
        const isPlayerSource = state?.players.some(p => p.id === event.sourceId) ||
                               state?.pets?.some(p => p.id === event.sourceId);

        // Check if this is a melee attack (auto-attack or melee ability)
        let isMeleeAttack = false;
        let isRangedAutoAttack = false;

        if (!event.abilityId) {
          // Auto-attack - check if source is a ranged class
          const sourcePlayer = state?.players.find(p => p.id === event.sourceId);
          const rangedClasses = ['mage', 'warlock', 'priest', 'hunter', 'shaman', 'druid'];
          if (sourcePlayer && rangedClasses.includes(sourcePlayer.classId)) {
            isRangedAutoAttack = true;
          } else {
            isMeleeAttack = true;
          }
        } else {
          // Check ability range
          const abilityInfo = getAbilityById(event.abilityId);
          if (abilityInfo && abilityInfo.ability.range <= 80) {
            isMeleeAttack = true;
          }
        }

        // Play appropriate sound - only melee sounds for melee players
        if (isMeleeAttack && isPlayerSource) {
          // Alternate between melee sounds
          this.playSfx(this.useMeleeSound2 ? 'sfxMelee2' : 'sfxMelee');
          this.useMeleeSound2 = !this.useMeleeSound2;
        } else if (isRangedAutoAttack && isPlayerSource) {
          // Use cast sound for ranged auto-attacks
          this.playSfx('sfxCast');
        } else if (!isMeleeAttack && !isRangedAutoAttack) {
          this.playSfx('sfxHit');
        }

        // Check if this killed a boss
        if (event.killed && targetEnemy?.isBoss) {
          this.playSfx('sfxBossDeath');
          // Play death animation for boss
          const bossSprite = this.enemySprites.get(targetEnemy.id);
          this.playDeathAnimation(targetPos.x, targetPos.y, bossSprite);
          // Epic cinematic boss death effect
          this.playBossDeathCinematic(targetPos.x, targetPos.y, targetEnemy.name);

          // Add boss kill to activity feed
          const player = wsClient.getCurrentPlayer();
          const state = wsClient.currentState;
          if (player) {
            addActivity({
              type: 'boss',
              playerName: player.name,
              classId: player.classId,
              floor: state?.dungeon.floor ?? 1,
              bossName: targetEnemy.name
            });
          }
        }

        // Play death sound and animation for non-boss enemies that are killed
        if (event.killed && targetEnemy && !targetEnemy.isBoss) {
          // Randomly choose between death sounds
          const deathSound = Math.random() < 0.5 ? 'sfxDeath1' : 'sfxDeath2';
          this.playSfx(deathSound);
          // Play death animation
          const enemySprite = this.enemySprites.get(targetEnemy.id);
          this.playDeathAnimation(targetPos.x, targetPos.y, enemySprite);
          // Execute effect for killing blows
          this.playExecuteEffect(targetPos.x, targetPos.y, targetEnemy.isRare || targetEnemy.isElite);
        }
      } else if (event.heal) {
        // Use the new heal spell sound
        this.playSfx('sfxHealSpell');
      } else if (event.abilityId === 'rogue_blind') {
        // Blind ability - play cast sound for the stun effect
        this.playSfx('sfxCast');
      }

      // Play spell sound for ranged damaging ability usage (not heals or buffs)
      if (event.abilityId && event.damage) {
        const abilityInfo = getAbilityById(event.abilityId);
        if (abilityInfo && abilityInfo.ability.range > 80) {
          this.playSfx('sfxSpell', 0.18); // 50% reduced volume
        }
      }

      // Show damage/heal numbers
      if (event.damage || event.heal) {
        const isSpecialHit = event.isCrit || event.isStealthAttack;
        const text = event.damage
          ? `-${event.damage}${isSpecialHit ? '!' : ''}`
          : `+${event.heal}`;
        const color = event.damage ? '#ff4444' : '#44ff44';

        this.createDamageText(targetPos.x, targetPos.y, text, color, isSpecialHit);

      }

      // Spawn projectile/effect for ranged attacks/spells (skip chain lightning - has custom effect, skip pets - handled above)
      if (event.damage && sourcePos.x !== 0 && targetPos.x !== 0 && event.abilityId !== 'shaman_chainlight' && !sourceIsPet) {
        const dx = targetPos.x - sourcePos.x;
        const dy = targetPos.y - sourcePos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Only spawn projectile if distance is > 60 (ranged attack)
        if (dist > 60) {
          // Pass enemy type for enemy attacks (caster vs ranged)
          const enemyType = sourceEnemy?.type;
          const enemyName = sourceEnemy?.name;
          this.spawnProjectile(sourcePos.x, sourcePos.y, targetPos.x, targetPos.y, event.abilityId, enemyType, enemyName);
        }
      }

      // Spawn impact effect at target location (skip for chain lightning - has custom effect)
      if (event.damage && event.abilityId && event.abilityId !== 'shaman_chainlight') {
        this.spawnImpactEffect(targetPos.x, targetPos.y, event.abilityId);
      }

      // Spawn chain lightning effect (only once per cast, debounced)
      if (event.abilityId === 'shaman_chainlight' && event.damage) {
        const now = Date.now();
        if (now - this.lastChainLightningTime > 500) { // 500ms debounce
          this.lastChainLightningTime = now;
          // Use source position as the starting point
          this.spawnChainLightningEffect(sourcePos.x, sourcePos.y);
        }
      }

      // Spawn blind effect (powder burst)
      if (event.abilityId === 'rogue_blind') {
        this.spawnBlindEffect(targetPos.x, targetPos.y);
      }

      // Spawn heal effect
      if (event.heal && event.abilityId !== 'mage_meditation') {
        this.spawnHealEffect(targetPos.x, targetPos.y);
      }

      // Spawn Meditation effect (blue mana restore) and play potion sound
      if (event.abilityId === 'mage_meditation' && (event as any).manaRestore) {
        this.spawnMeditationEffect(targetPos.x, targetPos.y);
        this.playSfx('sfxHealSpell'); // Same sound as mana potion
      }

      // Spawn Pyroblast stun effect
      if (event.abilityId === 'mage_pyroblast' && event.damage && targetPos.x !== 0) {
        this.spawnStunEffect(targetPos.x, targetPos.y);
      }

      // Spawn Blaze chain effect (fire bolt between targets)
      if (event.abilityId === 'mage_blaze' && event.damage && sourcePos.x !== 0 && targetPos.x !== 0) {
        // Check if this is a bounce (sourceId is an enemy, not the player)
        const player = wsClient.getCurrentPlayer();
        if (player && event.sourceId !== player.id) {
          this.spawnBlazeChainEffect(sourcePos.x, sourcePos.y, targetPos.x, targetPos.y);
        }
      }

      // Spawn Drain Life effect (green beam from enemy to caster)
      if (event.abilityId === 'warlock_drain' && event.heal && sourcePos.x !== 0 && targetPos.x !== 0) {
        this.spawnDrainLifeEffect(sourcePos.x, sourcePos.y, targetPos.x, targetPos.y);
      }
    } else if (message.type === 'TAUNT_EVENT') {
      // Imp taunt visual effect
      const event = message.event;
      this.playTauntEffect(event.sourcePosition.x, event.sourcePosition.y, event.targetIds);
    } else if (message.type === 'LOOT_DROP') {
      // Play loot sound
      this.playSfx('sfxLoot');

      // Show loot notification
      const player = wsClient.getCurrentPlayer();
      for (const drop of message.loot) {
        let text = '';
        if (drop.type === 'gold') text = `+${drop.goldAmount} gold`;
        else if (drop.type === 'item' && drop.item) {
          text = `Looted: ${drop.item.name}`;
          // Add legendary items to activity feed
          if (drop.item.rarity === 'legendary' && player) {
            addActivity({
              type: 'legendary',
              playerName: player.name,
              classId: player.classId,
              itemName: drop.item.name
            });
          }
        }
        else if (drop.type === 'potion' && drop.potion) text = `Looted: ${drop.potion.name}`;
        else if (drop.type === 'ability') text = `Learned ability!`;
        else if (drop.type === 'rerollToken') text = `+${drop.tokenCount} reroll token`;

        if (text) {
          this.showNotification(text);
        }
      }
    } else if (message.type === 'FLOOR_COMPLETE') {
      this.showNotification(`Entering Floor ${message.floor}...`, undefined, 'info');
      // Clear tracking sets for new floor
      this.notifiedEnemyIds.clear();
      this.knownPetIds.clear();
      this.revealedAmbushEnemyIds.clear();
      this.hiddenEnemyIds.clear();

      // Save character and update leaderboard
      const player = wsClient.getCurrentPlayer();
      if (player) {
        wsClient.saveCharacter();
        saveLeaderboardEntry({
          name: player.name,
          classId: player.classId,
          floor: message.floor,
          level: player.level
        });
        // Add to activity feed
        addActivity({
          type: 'floor',
          playerName: player.name,
          classId: player.classId,
          floor: message.floor
        });
      }
    } else if (message.type === 'VENDOR_SERVICES') {
      console.log('[DEBUG] VENDOR_SERVICES received:', message.vendorId, 'services:', message.services);
      this.currentVendorId = message.vendorId;
      this.vendorServices = message.services;
      const player = wsClient.getCurrentPlayer();

      if (this.vendorModalOpen) {
        // Update existing modal
        updateVendor(message.services, player?.gold ?? 0);
      } else {
        // Open new modal
        this.showVendorUI();
      }
    } else if (message.type === 'CRYPTO_VENDOR_SERVICES') {
      console.log('[DEBUG] CRYPTO_VENDOR_SERVICES received, purchases remaining:', message.purchasesRemaining);
      openCryptoVendor(message.purchasesRemaining);
    } else if (message.type === 'CRYPTO_PURCHASE_VERIFIED') {
      console.log('[DEBUG] CRYPTO_PURCHASE_VERIFIED received:', message.potion);
      const qualityColor = message.potion.quality === 'superior' ? 0xffaa00 :
                          message.potion.quality === 'greater' ? 0x9966ff :
                          message.potion.quality === 'standard' ? 0x44ff44 : 0xaaaaaa;
      const qualityLabel = message.potion.quality.charAt(0).toUpperCase() + message.potion.quality.slice(1);
      this.showNotification(`Received: ${qualityLabel} ${message.potion.name}!`, qualityColor);
      updatePurchasesRemaining(message.purchasesRemaining);
    } else if (message.type === 'CRYPTO_PURCHASE_FAILED') {
      console.log('[DEBUG] CRYPTO_PURCHASE_FAILED:', message.reason);
      this.showNotification(`Purchase failed: ${message.reason}`, 0xff4444);
    } else if (message.type === 'CHEST_ETH_DROP') {
      console.log('[DEBUG] CHEST_ETH_DROP received:', message);
      // Update the accumulated ETH counter
      emitWalletEvent('eth-drop-received', {
        ethAmountWei: message.ethAmountWei,
        totalAccumulatedWei: message.totalAccumulatedWei,
        floor: message.floorNumber
      });
      // Show dramatic chest treasure announcement (distinct from boss kill)
      this.showChestEthDropAnnouncement(message.ethAmountWei, message.floorNumber);
    } else if (message.type === 'PURCHASE_RESULT') {
      if (message.success) {
        this.showNotification(message.message);
        // Refresh vendor services after a short delay to allow state update
        if (this.currentVendorId) {
          this.time.delayedCall(100, () => {
            if (this.currentVendorId) {
              wsClient.send({ type: 'INTERACT_VENDOR', vendorId: this.currentVendorId });
            }
          });
        }
      } else {
        this.showNotification(message.message);
      }
    } else if (message.type === 'ITEM_COLLECTED') {
      // Show notification only for the current player (same position as chest loot)
      const currentPlayer = wsClient.getCurrentPlayer();
      if (currentPlayer && message.playerId === currentPlayer.id) {
        const color = message.itemType === 'potion' ? 0x44ff44 : 0xffcc00;
        this.showNotification(`Picked up: ${message.itemName}`, color);
      }
    } else if (message.type === 'CHEST_OPENED') {
      // Play chest opening sound for all players
      this.playSfx('sfxLoot');

      // Show loot notification for the player who opened
      const currentPlayer = wsClient.getCurrentPlayer();
      if (currentPlayer && message.playerId === currentPlayer.id) {
        if (message.loot.length > 0) {
          this.showNotification(`Chest loot: ${message.loot.join(', ')}`, undefined, 'loot');
        } else {
          this.showNotification('Chest was empty!', 0xaaaaaa);
        }
      }
    } else if (message.type === 'POTION_USED') {
      // Play potion use sound and show animation
      const currentPlayer = wsClient.getCurrentPlayer();
      if (currentPlayer && message.playerId === currentPlayer.id) {
        this.playSfx('sfxHealSpell');
        this.showPotionEffect(currentPlayer.position.x, currentPlayer.position.y, message.potionType);
      }
    }
  }

  private playSfx(key: string, volume: number = 0.35): void {
    try {
      this.sound.play(key, { volume });
    } catch {
      // Sound not loaded or audio context not ready
    }
  }

  private showPotionEffect(x: number, y: number, potionType: 'health' | 'mana'): void {
    // Create expanding ring effect
    const color = potionType === 'health' ? 0x44ff44 : 0x4488ff;
    const graphics = this.add.graphics();
    graphics.setDepth(100);

    // Create rising particles
    const numParticles = 8;
    const particles: Phaser.GameObjects.Graphics[] = [];
    for (let i = 0; i < numParticles; i++) {
      const particle = this.add.graphics();
      particle.setDepth(100);
      particle.fillStyle(color, 0.8);
      particle.fillCircle(0, 0, 3);
      particle.setPosition(x + Phaser.Math.Between(-15, 15), y);
      particles.push(particle);

      // Animate particle rising
      this.tweens.add({
        targets: particle,
        y: y - 40 - Phaser.Math.Between(0, 20),
        alpha: 0,
        duration: 600 + Phaser.Math.Between(0, 200),
        ease: 'Quad.easeOut',
        onComplete: () => particle.destroy()
      });
    }

    // Animate expanding ring
    let radius = 5;
    let alpha = 0.7;

    const animateRing = () => {
      graphics.clear();
      graphics.lineStyle(3, color, alpha);
      graphics.strokeCircle(x, y, radius);

      radius += 2;
      alpha -= 0.04;

      if (alpha > 0) {
        this.time.delayedCall(16, animateRing);
      } else {
        graphics.destroy();
      }
    };

    animateRing();

    // Show floating text
    const text = potionType === 'health' ? '+HP' : '+Mana';
    const floatText = this.add.text(x, y - 20, text, {
      fontSize: '14px',
      color: potionType === 'health' ? '#44ff44' : '#4488ff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5).setDepth(100);

    this.tweens.add({
      targets: floatText,
      y: y - 50,
      alpha: 0,
      duration: 800,
      ease: 'Quad.easeOut',
      onComplete: () => floatText.destroy()
    });
  }

  private showChestEthDropAnnouncement(ethAmountWei: string, floor: number): void {
    const width = this.scale.width;
    const height = this.scale.height;

    // Convert wei to readable ETH format with appropriate precision
    const wei = BigInt(ethAmountWei);
    const ethAmount = Number(wei) / 1e18;

    // Always show in ETH, adjust decimal places based on amount
    let decimals = 4;
    if (ethAmount < 0.0001) decimals = 8;
    else if (ethAmount < 0.001) decimals = 6;
    else if (ethAmount >= 1) decimals = 4;

    const displayAmount = ethAmount.toFixed(decimals).replace(/\.?0+$/, '') || '0';
    const displayUnit = 'ETH';

    // 1. Screen flash with emerald green (treasure theme)
    const flashOverlay = this.add.rectangle(width / 2, height / 2, width + 100, height + 100, 0x4ade80, 0.3);
    flashOverlay.setDepth(1000).setScrollFactor(0);

    this.tweens.add({
      targets: flashOverlay,
      alpha: 0,
      duration: 800,
      ease: 'Quad.easeOut',
      onComplete: () => flashOverlay.destroy()
    });

    // 2. Diamond/gem particles rising from center
    const gemColors = [0x4ade80, 0x22c55e, 0x86efac, 0xfbbf24, 0xfcd34d];
    const particleCount = 25;

    for (let i = 0; i < particleCount; i++) {
      const startX = width / 2 + Phaser.Math.Between(-100, 100);
      const startY = height / 2 + 50;
      const color = gemColors[Math.floor(Math.random() * gemColors.length)];

      const gem = this.add.text(startX, startY, '◆', {
        fontSize: `${Phaser.Math.Between(16, 28)}px`,
        color: `#${color.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5).setDepth(1100).setScrollFactor(0).setAlpha(0.9);

      this.tweens.add({
        targets: gem,
        y: startY - Phaser.Math.Between(100, 200),
        x: startX + Phaser.Math.Between(-50, 50),
        alpha: 0,
        rotation: Phaser.Math.Between(-1, 1),
        duration: 1200 + Phaser.Math.Between(0, 400),
        delay: Phaser.Math.Between(0, 300),
        ease: 'Quad.easeOut',
        onComplete: () => gem.destroy()
      });
    }

    // 3. Expanding emerald rings
    for (let i = 0; i < 3; i++) {
      this.time.delayedCall(i * 150, () => {
        const ring = this.add.circle(width / 2, height / 2, 30, undefined, undefined);
        ring.setStrokeStyle(3 - i, 0x4ade80, 0.8);
        ring.setDepth(1050).setScrollFactor(0);

        this.tweens.add({
          targets: ring,
          radius: 150 + i * 40,
          alpha: 0,
          duration: 700,
          ease: 'Quad.easeOut',
          onComplete: () => ring.destroy()
        });
      });
    }

    // 4. Main announcement text - "TREASURE FOUND!"
    const titleText = this.add.text(width / 2, height / 2 - 60, 'TREASURE FOUND!', {
      fontFamily: 'Cinzel, serif',
      fontSize: '32px',
      color: '#4ade80',
      stroke: '#000000',
      strokeThickness: 4,
      shadow: { blur: 15, color: '#22c55e', fill: true }
    }).setOrigin(0.5).setDepth(1200).setScrollFactor(0).setAlpha(0).setScale(0.3);

    // 5. ETH amount display
    const ethText = this.add.text(width / 2, height / 2, `◆ ${displayAmount} ${displayUnit}`, {
      fontFamily: 'Cinzel, serif',
      fontSize: '28px',
      color: '#fbbf24',
      stroke: '#000000',
      strokeThickness: 3,
      shadow: { blur: 10, color: '#f59e0b', fill: true }
    }).setOrigin(0.5).setDepth(1200).setScrollFactor(0).setAlpha(0).setScale(0.3);

    // 6. Floor indicator
    const floorText = this.add.text(width / 2, height / 2 + 45, `Floor ${floor} Boss Chest`, {
      fontFamily: 'Crimson Text, serif',
      fontSize: '18px',
      color: '#a0a0a0',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5).setDepth(1200).setScrollFactor(0).setAlpha(0);

    // Animate texts in sequence
    this.time.delayedCall(100, () => {
      // Title swoops in
      this.tweens.add({
        targets: titleText,
        alpha: 1,
        scale: 1,
        duration: 400,
        ease: 'Back.easeOut'
      });

      // ETH amount with slight delay
      this.tweens.add({
        targets: ethText,
        alpha: 1,
        scale: 1,
        duration: 400,
        delay: 200,
        ease: 'Back.easeOut'
      });

      // Floor text fades in
      this.tweens.add({
        targets: floorText,
        alpha: 0.8,
        duration: 300,
        delay: 350,
        ease: 'Quad.easeOut',
        onComplete: () => {
          // Shimmer effect on ETH amount
          this.tweens.add({
            targets: ethText,
            scale: 1.05,
            duration: 200,
            yoyo: true,
            repeat: 2,
            ease: 'Sine.easeInOut'
          });

          // Fade out after display
          this.time.delayedCall(2000, () => {
            this.tweens.add({
              targets: [titleText, ethText, floorText],
              alpha: 0,
              y: '-=40',
              duration: 600,
              ease: 'Cubic.easeIn',
              onComplete: () => {
                titleText.destroy();
                ethText.destroy();
                floorText.destroy();
              }
            });
          });
        }
      });
    });

    // Play a coin/treasure sound
    this.playSfx('sfxLoot', 0.5);
  }

  private playDeathAnimation(x: number, y: number, sprite?: Phaser.GameObjects.Sprite): void {
    // Fade out the sprite if provided
    if (sprite && sprite.active) {
      this.tweens.add({
        targets: sprite,
        alpha: 0,
        scaleX: sprite.scaleX * 0.5,
        scaleY: sprite.scaleY * 0.5,
        duration: 300,
        ease: 'Quad.easeOut'
      });
    }

    // Spawn bones at death location
    const bones = this.add.sprite(x, y, 'deco_crypt_bones');
    bones.setDepth(5); // Below characters but above floor
    bones.setScale(0.12); // Match decoration scale
    bones.setAlpha(0);
    bones.setTint(0xcccccc); // Slightly grey tint

    // Fade in bones
    this.tweens.add({
      targets: bones,
      alpha: 0.8,
      duration: 400,
      ease: 'Quad.easeIn',
      onComplete: () => {
        // Fade out bones after a delay
        this.time.delayedCall(3000, () => {
          this.tweens.add({
            targets: bones,
            alpha: 0,
            duration: 1000,
            onComplete: () => bones.destroy()
          });
        });
      }
    });
  }

  private playExecuteEffect(x: number, y: number, isElite: boolean = false): void {
    // Blood/energy particles burst outward
    const particleCount = isElite ? 16 : 10;
    const particleColors = isElite ? [0xff4444, 0xff6666, 0xffaa00] : [0xff4444, 0xaa2222, 0x882222];

    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 40 + Math.random() * (isElite ? 80 : 50);
      const color = particleColors[Math.floor(Math.random() * particleColors.length)];

      const particle = this.add.circle(x, y, 3 + Math.random() * 3, color);
      particle.setDepth(120);

      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0,
        scale: 0.3,
        duration: 400 + Math.random() * 200,
        ease: 'Quad.easeOut',
        onComplete: () => particle.destroy()
      });
    }

    // Impact ring expanding outward
    const ring = this.add.circle(x, y, 10, undefined, undefined);
    ring.setStrokeStyle(isElite ? 4 : 2, isElite ? 0xffaa00 : 0xff4444, 1);
    ring.setDepth(115);

    this.tweens.add({
      targets: ring,
      radius: isElite ? 60 : 40,
      alpha: 0,
      duration: 300,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy()
    });

    // "SLAIN!" text for elite/rare kills
    if (isElite) {
      const slainText = this.add.text(x, y - 30, 'SLAIN!', {
        fontSize: '20px',
        color: '#ff6644',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(130);

      slainText.setScale(0.5);
      this.tweens.add({
        targets: slainText,
        scale: 1.2,
        duration: 150,
        ease: 'Back.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: slainText,
            y: y - 60,
            alpha: 0,
            duration: 600,
            delay: 200,
            ease: 'Cubic.easeOut',
            onComplete: () => slainText.destroy()
          });
        }
      });
    }
  }

  private playBossDeathCinematic(x: number, y: number, bossName: string): void {
    const width = this.scale.width;
    const height = this.scale.height;

    // 1. Screen shake - intense for boss
    this.cameras.main.shake(600, 0.02);

    // 2. Bright flash overlay
    const flashOverlay = this.add.rectangle(width / 2, height / 2, width + 100, height + 100, 0xffffff, 0);
    flashOverlay.setDepth(1100);
    flashOverlay.setScrollFactor(0);

    this.tweens.add({
      targets: flashOverlay,
      alpha: { from: 0, to: 0.8 },
      duration: 100,
      yoyo: true,
      onComplete: () => flashOverlay.destroy()
    });

    // 3. Multiple expanding golden rings
    for (let i = 0; i < 4; i++) {
      this.time.delayedCall(i * 100, () => {
        const ring = this.add.circle(x, y, 20, undefined, undefined);
        ring.setStrokeStyle(4 - i, 0xffd700, 1);
        ring.setDepth(115);

        this.tweens.add({
          targets: ring,
          radius: 120 + i * 30,
          alpha: 0,
          duration: 600,
          ease: 'Quad.easeOut',
          onComplete: () => ring.destroy()
        });
      });
    }

    // 4. Massive particle explosion
    const particleCount = 40;
    const particleColors = [0xffd700, 0xffaa00, 0xff6600, 0xff4444, 0xffffff];

    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2 + Math.random() * 0.3;
      const speed = 80 + Math.random() * 120;
      const color = particleColors[Math.floor(Math.random() * particleColors.length)];
      const size = 4 + Math.random() * 6;

      const particle = this.add.circle(x, y, size, color);
      particle.setDepth(125);

      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed - 20, // Rise slightly
        alpha: 0,
        scale: 0.2,
        duration: 800 + Math.random() * 400,
        ease: 'Quad.easeOut',
        onComplete: () => particle.destroy()
      });
    }

    // 5. Energy beam rays from boss position
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const ray = this.add.graphics();
      ray.setDepth(110);

      ray.lineStyle(3, 0xffd700, 0.8);
      ray.lineBetween(x, y, x + Math.cos(angle) * 10, y + Math.sin(angle) * 10);

      this.tweens.add({
        targets: ray,
        alpha: 0,
        duration: 400,
        onUpdate: () => {
          const progress = 1 - ray.alpha;
          ray.clear();
          ray.lineStyle(3 - progress * 2, 0xffd700, ray.alpha);
          const length = 10 + progress * 150;
          ray.lineBetween(x, y, x + Math.cos(angle) * length, y + Math.sin(angle) * length);
        },
        onComplete: () => ray.destroy()
      });
    }

    // 6. Boss defeated title with dramatic animation
    const defeatedText = this.add.text(width / 2, height / 2 - 50, bossName.toUpperCase(), {
      fontFamily: 'Cinzel, serif',
      fontSize: '36px',
      color: '#ffd700',
      stroke: '#000000',
      strokeThickness: 4,
      shadow: { blur: 10, color: '#ff6600', fill: true }
    }).setOrigin(0.5).setDepth(1200).setScrollFactor(0).setAlpha(0).setScale(0.3);

    const subtitleText = this.add.text(width / 2, height / 2, 'DEFEATED', {
      fontFamily: 'Cinzel, serif',
      fontSize: '24px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5).setDepth(1200).setScrollFactor(0).setAlpha(0).setScale(0.3);

    // Animate title in
    this.time.delayedCall(200, () => {
      this.tweens.add({
        targets: defeatedText,
        alpha: 1,
        scale: 1,
        duration: 400,
        ease: 'Back.easeOut'
      });

      this.tweens.add({
        targets: subtitleText,
        alpha: 1,
        scale: 1,
        duration: 400,
        delay: 150,
        ease: 'Back.easeOut',
        onComplete: () => {
          // Fade out after display
          this.time.delayedCall(1500, () => {
            this.tweens.add({
              targets: [defeatedText, subtitleText],
              alpha: 0,
              y: '-=30',
              duration: 600,
              ease: 'Cubic.easeIn',
              onComplete: () => {
                defeatedText.destroy();
                subtitleText.destroy();
              }
            });
          });
        }
      });
    });
  }

  private showDeathScreenFlash(): void {
    // Create full-screen red overlay using screen coordinates
    const width = this.scale.width;
    const height = this.scale.height;

    // Position at screen center (not world coordinates) with scrollFactor 0
    const overlay = this.add.rectangle(width / 2, height / 2, width + 100, height + 100, 0xff0000, 0.6);
    overlay.setDepth(1000); // Very high depth to be on top of everything
    overlay.setScrollFactor(0); // Fixed to screen, not world

    // Blink effect - pulse 3 times
    this.tweens.add({
      targets: overlay,
      alpha: { from: 0.6, to: 0 },
      duration: 200,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        // Final fade out
        this.tweens.add({
          targets: overlay,
          alpha: 0,
          duration: 300,
          onComplete: () => overlay.destroy()
        });
      }
    });
  }

  private createDamageText(x: number, y: number, text: string, color: string, isCrit: boolean = false): void {
    // Crits get special yellow/gold color and bigger font
    const critColor = '#ffdd00';
    const finalColor = isCrit ? critColor : color;

    const damageText = this.add.text(x, y, text, {
      fontSize: isCrit ? '32px' : '18px',
      color: finalColor,
      fontStyle: 'bold',
      stroke: isCrit ? '#aa4400' : '#000000',
      strokeThickness: isCrit ? 5 : 3
    }).setOrigin(0.5).setDepth(100);

    // Random horizontal offset
    const offsetX = Phaser.Math.Between(-20, 20);

    if (isCrit) {
      // Crits start small and "pop" to full size
      damageText.setScale(0.5);

      // Pop animation then float up
      this.tweens.add({
        targets: damageText,
        scale: 1.3,
        duration: 150,
        ease: 'Back.easeOut',
        onComplete: () => {
          // Then float up and fade
          this.tweens.add({
            targets: damageText,
            y: y - 70,
            x: x + offsetX,
            scale: 1.0,
            alpha: 0,
            duration: 1200,
            ease: 'Cubic.easeOut',
            onComplete: () => {
              damageText.destroy();
            }
          });
        }
      });
    } else {
      // Normal damage just floats up
      this.tweens.add({
        targets: damageText,
        y: y - 50,
        x: x + offsetX,
        alpha: 0,
        duration: 1000,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          damageText.destroy();
        }
      });
    }

    this.damageTexts.push(damageText);
  }

  private cleanupDamageTexts(): void {
    this.damageTexts = this.damageTexts.filter(text => text.active);
  }

  private spawnProjectile(fromX: number, fromY: number, toX: number, toY: number, abilityId?: string, enemyType?: string, enemyName?: string): void {
    // Create projectile container
    const projectile = this.add.container(fromX, fromY).setDepth(50);

    // Calculate rotation to face target
    const angle = Math.atan2(toY - fromY, toX - fromX);

    // Determine projectile visual based on ability type or enemy type
    const spellColors = this.getSpellColors(abilityId);

    if (abilityId) {
      // Spell orb with ability-specific color
      const orb = this.add.circle(0, 0, spellColors.size, spellColors.primary);
      orb.setStrokeStyle(2, spellColors.secondary);
      projectile.add(orb);

      // Add glow effect
      const glow = this.add.circle(0, 0, spellColors.size + 4, spellColors.primary, 0.3);
      projectile.add(glow);

      // Add trail particles for fire/shadow spells
      if (abilityId.includes('fire') || abilityId.includes('shadow') || abilityId.includes('bolt')) {
        const trail = this.add.circle(0, 0, spellColors.size - 2, spellColors.secondary, 0.5);
        projectile.add(trail);
      }
    } else if (enemyType === 'caster' || (enemyName && (
      enemyName.toLowerCase().includes('acolyte') ||
      enemyName.toLowerCase().includes('cultist') ||
      enemyName.toLowerCase().includes('priest')
    ))) {
      // CASTER enemy magic bolt - green/purple orb
      const orbColor = 0x44aa44; // Green for dark magic
      const glowColor = 0x66cc66;

      const orb = this.add.circle(0, 0, 6, orbColor);
      orb.setStrokeStyle(2, glowColor);
      projectile.add(orb);

      // Add glow effect
      const glow = this.add.circle(0, 0, 10, orbColor, 0.4);
      projectile.add(glow);

      // Add trailing effect
      const trail = this.add.circle(-4, 0, 4, glowColor, 0.5);
      projectile.add(trail);

      // Rotate to face target
      projectile.setRotation(angle);
    } else if (enemyName && (
      enemyName.toLowerCase().includes('soul') ||
      enemyName.toLowerCase().includes('wraith') ||
      enemyName.toLowerCase().includes('phantom') ||
      enemyName.toLowerCase().includes('ghost')
    )) {
      // SPECTRAL enemy - blue ethereal bolt
      const orbColor = 0x88ccff;
      const glowColor = 0xaaeeff;

      const orb = this.add.circle(0, 0, 5, orbColor, 0.8);
      orb.setStrokeStyle(1, glowColor);
      projectile.add(orb);

      // Ethereal glow
      const glow = this.add.circle(0, 0, 9, glowColor, 0.3);
      projectile.add(glow);

      // No rotation needed for ethereal orb
    } else {
      // ARCHER/RANGED enemy - yellow arrow
      const arrow = this.add.graphics();
      arrow.fillStyle(0xccaa44);
      arrow.fillTriangle(-8, -2, -8, 2, 8, 0);
      projectile.add(arrow);

      // Rotate arrow to face target
      projectile.setRotation(angle);
    }

    this.projectiles.push(projectile);

    // Calculate travel time based on distance
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const duration = Math.min(500, dist * 2); // Max 500ms

    // Animate projectile
    this.tweens.add({
      targets: projectile,
      x: toX,
      y: toY,
      duration: duration,
      ease: 'Linear',
      onComplete: () => {
        // Remove projectile
        projectile.destroy();
        this.projectiles = this.projectiles.filter(p => p !== projectile);
      }
    });
  }

  private getSpellColors(abilityId?: string): { primary: number; secondary: number; size: number } {
    if (!abilityId) return { primary: 0xccaa44, secondary: 0xffdd88, size: 6 };

    // Fire spells - orange/red (includes Imp fire attacks and Hellfire)
    if (abilityId.includes('fire') || abilityId.includes('flame') || abilityId.includes('inferno') || abilityId.includes('blaze') || abilityId.includes('pyro') || abilityId.includes('imp_') || abilityId.includes('hellfire')) {
      return { primary: 0xff4400, secondary: 0xffaa00, size: 7 };
    }
    // Frost/ice spells - blue/cyan
    if (abilityId.includes('frost') || abilityId.includes('ice') || abilityId.includes('blizzard')) {
      return { primary: 0x44aaff, secondary: 0xaaddff, size: 6 };
    }
    // Shadow/void spells - purple/dark
    if (abilityId.includes('shadow') || abilityId.includes('void') || abilityId.includes('corruption') || abilityId.includes('warlock')) {
      return { primary: 0x8844ff, secondary: 0xaa66ff, size: 6 };
    }
    // Holy/light spells - yellow/white
    if (abilityId.includes('holy') || abilityId.includes('light') || abilityId.includes('smite') || abilityId.includes('priest') || abilityId.includes('paladin')) {
      return { primary: 0xffffaa, secondary: 0xffffff, size: 7 };
    }
    // Nature spells - green
    if (abilityId.includes('nature') || abilityId.includes('wrath') || abilityId.includes('druid') || abilityId.includes('shaman')) {
      return { primary: 0x44ff44, secondary: 0xaaffaa, size: 6 };
    }
    // Lightning spells - electric blue
    if (abilityId.includes('lightning') || abilityId.includes('shock') || abilityId.includes('chain')) {
      return { primary: 0x00ddff, secondary: 0xaaffff, size: 5 };
    }
    // Physical/melee - red
    if (abilityId.includes('strike') || abilityId.includes('slash') || abilityId.includes('rend')) {
      return { primary: 0xff4444, secondary: 0xff8888, size: 5 };
    }
    // Arcane - pink/purple
    if (abilityId.includes('arcane') || abilityId.includes('mage')) {
      return { primary: 0xff44ff, secondary: 0xffaaff, size: 6 };
    }

    // Default magic
    return { primary: 0x8844ff, secondary: 0xaa66ff, size: 6 };
  }

  private spawnImpactEffect(x: number, y: number, abilityId: string): void {
    const colors = this.getSpellColors(abilityId);

    // Create expanding ring
    const impact = this.add.circle(x, y, 5, colors.primary, 0.8).setDepth(50);

    this.tweens.add({
      targets: impact,
      radius: 25,
      alpha: 0,
      duration: 300,
      ease: 'Cubic.easeOut',
      onComplete: () => impact.destroy()
    });

    // Add secondary particles for special effects
    // Special Hellfire effect - demonic fire burst with burning particles
    if (abilityId === 'warlock_hellfire') {
      // Large demonic fire burst
      const burstColors = [0xff4400, 0xff6622, 0xffaa00, 0x881100];

      // Rising fire columns
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const dist = 15 + Math.random() * 25;
        const startX = x + Math.cos(angle) * dist * 0.3;
        const startY = y + Math.sin(angle) * dist * 0.3;
        const endX = x + Math.cos(angle) * dist;
        const endY = y + Math.sin(angle) * dist;

        const flame = this.add.circle(startX, startY, 4 + Math.random() * 3,
          burstColors[Math.floor(Math.random() * burstColors.length)], 0.9
        ).setDepth(52);

        this.tweens.add({
          targets: flame,
          x: endX,
          y: endY - 15 - Math.random() * 10,
          alpha: 0,
          scale: 0.3,
          duration: 400 + Math.random() * 200,
          delay: Math.random() * 100,
          ease: 'Cubic.easeOut',
          onComplete: () => flame.destroy()
        });
      }

      // Ground fire ring
      const fireRing = this.add.circle(x, y, 10, 0xff4400, 0.6).setDepth(49);
      this.tweens.add({
        targets: fireRing,
        radius: 50,
        alpha: 0,
        duration: 500,
        ease: 'Cubic.easeOut',
        onComplete: () => fireRing.destroy()
      });

      // Inner demon glow
      const demonGlow = this.add.circle(x, y, 20, 0x660000, 0.4).setDepth(48);
      this.tweens.add({
        targets: demonGlow,
        radius: 35,
        alpha: 0,
        duration: 350,
        ease: 'Cubic.easeOut',
        onComplete: () => demonGlow.destroy()
      });
    } else if (abilityId.includes('fire') || abilityId.includes('flame')) {
      // Fire sparks
      for (let i = 0; i < 5; i++) {
        const spark = this.add.circle(
          x + (Math.random() - 0.5) * 20,
          y + (Math.random() - 0.5) * 20,
          3, colors.secondary, 0.9
        ).setDepth(51);

        this.tweens.add({
          targets: spark,
          y: spark.y - 20,
          alpha: 0,
          scale: 0.5,
          duration: 400,
          ease: 'Cubic.easeOut',
          onComplete: () => spark.destroy()
        });
      }
    } else if (abilityId.includes('frost') || abilityId.includes('ice')) {
      // Frost shards
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;
        const shard = this.add.rectangle(x, y, 4, 10, colors.secondary, 0.8)
          .setDepth(51)
          .setRotation(angle);

        this.tweens.add({
          targets: shard,
          x: x + Math.cos(angle) * 25,
          y: y + Math.sin(angle) * 25,
          alpha: 0,
          duration: 300,
          ease: 'Cubic.easeOut',
          onComplete: () => shard.destroy()
        });
      }
    } else if (abilityId.includes('lightning') || abilityId.includes('shock')) {
      // Lightning flash
      const flash = this.add.circle(x, y, 30, colors.primary, 0.5).setDepth(49);
      this.tweens.add({
        targets: flash,
        alpha: 0,
        duration: 100,
        onComplete: () => flash.destroy()
      });
    }
  }

  private spawnHealEffect(x: number, y: number): void {
    // Rising green/gold particles
    for (let i = 0; i < 8; i++) {
      const particle = this.add.circle(
        x + (Math.random() - 0.5) * 30,
        y + 10,
        3, 0x44ff44, 0.8
      ).setDepth(51);

      this.tweens.add({
        targets: particle,
        y: y - 30,
        alpha: 0,
        duration: 600 + Math.random() * 200,
        delay: i * 50,
        ease: 'Cubic.easeOut',
        onComplete: () => particle.destroy()
      });
    }

    // Central glow
    const glow = this.add.circle(x, y, 15, 0x44ff44, 0.4).setDepth(50);
    this.tweens.add({
      targets: glow,
      radius: 30,
      alpha: 0,
      duration: 500,
      ease: 'Cubic.easeOut',
      onComplete: () => glow.destroy()
    });
  }

  private spawnDrainLifeEffect(casterX: number, casterY: number, targetX: number, targetY: number): void {
    // Green energy particles flowing from target to caster
    const particleCount = 8;
    const drainColors = [0x44ff44, 0x66ff66, 0x22aa22, 0x88ffaa];

    for (let i = 0; i < particleCount; i++) {
      // Start at target, flow to caster
      const startX = targetX + (Math.random() - 0.5) * 20;
      const startY = targetY + (Math.random() - 0.5) * 20;
      const endX = casterX + (Math.random() - 0.5) * 10;
      const endY = casterY + (Math.random() - 0.5) * 10;

      const particle = this.add.circle(
        startX, startY,
        4 + Math.random() * 2,
        drainColors[Math.floor(Math.random() * drainColors.length)],
        0.9
      ).setDepth(52);

      // Add a glow trail behind the particle
      const trail = this.add.circle(startX, startY, 6, 0x44ff44, 0.3).setDepth(51);

      this.tweens.add({
        targets: [particle, trail],
        x: endX,
        y: endY,
        duration: 400 + Math.random() * 200,
        delay: i * 60,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          particle.destroy();
          trail.destroy();
        }
      });
    }

    // Dark aura at target (life being drained)
    const drainAura = this.add.circle(targetX, targetY, 15, 0x22aa22, 0.3).setDepth(49);
    this.tweens.add({
      targets: drainAura,
      radius: 5,
      alpha: 0,
      duration: 600,
      ease: 'Cubic.easeIn',
      onComplete: () => drainAura.destroy()
    });

    // Healing glow at caster
    const healGlow = this.add.circle(casterX, casterY, 10, 0x44ff44, 0.5).setDepth(49);
    this.tweens.add({
      targets: healGlow,
      radius: 25,
      alpha: 0,
      duration: 500,
      delay: 300,
      ease: 'Cubic.easeOut',
      onComplete: () => healGlow.destroy()
    });
  }

  private playTauntEffect(sourceX: number, sourceY: number, targetIds: string[]): void {
    // Expanding taunt shockwave ring from the Imp
    const tauntRing = this.add.circle(sourceX, sourceY, 10, 0xff6600, 0.8).setDepth(52);
    tauntRing.setStrokeStyle(3, 0xff4400, 1);

    this.tweens.add({
      targets: tauntRing,
      radius: 80,
      alpha: 0,
      duration: 500,
      ease: 'Cubic.easeOut',
      onComplete: () => tauntRing.destroy()
    });

    // Second inner ring for emphasis
    const innerRing = this.add.circle(sourceX, sourceY, 5, 0xffaa00, 0.6).setDepth(52);
    this.tweens.add({
      targets: innerRing,
      radius: 50,
      alpha: 0,
      duration: 400,
      ease: 'Cubic.easeOut',
      onComplete: () => innerRing.destroy()
    });

    // "TAUNT" text floating up from the Imp
    const tauntText = this.add.text(sourceX, sourceY - 10, 'TAUNT', {
      fontSize: '14px',
      color: '#ff6600',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5).setDepth(55);

    this.tweens.add({
      targets: tauntText,
      y: sourceY - 40,
      alpha: 0,
      duration: 800,
      ease: 'Cubic.easeOut',
      onComplete: () => tauntText.destroy()
    });

    // Draw aggro lines from taunted enemies to the Imp
    const state = wsClient.currentState;
    if (state) {
      const currentRoom = state.dungeon.rooms.find(r => r.id === state.dungeon.currentRoomId);
      if (currentRoom) {
        for (const targetId of targetIds) {
          const enemy = currentRoom.enemies.find(e => e.id === targetId);
          if (enemy && enemy.isAlive) {
            // Draw a brief red line from enemy to Imp
            const aggroLine = this.add.graphics().setDepth(48);
            aggroLine.lineStyle(2, 0xff4400, 0.8);
            aggroLine.beginPath();
            aggroLine.moveTo(enemy.position.x, enemy.position.y);
            aggroLine.lineTo(sourceX, sourceY);
            aggroLine.strokePath();

            // Fade out the line
            this.tweens.add({
              targets: aggroLine,
              alpha: 0,
              duration: 600,
              ease: 'Cubic.easeOut',
              onComplete: () => aggroLine.destroy()
            });

            // Small burst at enemy position
            const enemyBurst = this.add.circle(enemy.position.x, enemy.position.y, 8, 0xff4400, 0.6).setDepth(51);
            this.tweens.add({
              targets: enemyBurst,
              radius: 15,
              alpha: 0,
              duration: 400,
              ease: 'Cubic.easeOut',
              onComplete: () => enemyBurst.destroy()
            });
          }
        }
      }
    }
  }

  private spawnBlindEffect(x: number, y: number): void {
    // Yellow/white powder burst effect
    const particleCount = 16;

    // Expanding powder cloud particles
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const speed = 40 + Math.random() * 30;
      const size = 4 + Math.random() * 3;

      const particle = this.add.circle(
        x, y,
        size, 0xffffaa, 0.9
      ).setDepth(51);

      const targetX = x + Math.cos(angle) * speed;
      const targetY = y + Math.sin(angle) * speed;

      this.tweens.add({
        targets: particle,
        x: targetX,
        y: targetY,
        alpha: 0,
        scale: 0.3,
        duration: 500 + Math.random() * 200,
        ease: 'Cubic.easeOut',
        onComplete: () => particle.destroy()
      });
    }

    // Central bright flash
    const flash = this.add.circle(x, y, 20, 0xffffff, 0.8).setDepth(52);
    this.tweens.add({
      targets: flash,
      radius: 50,
      alpha: 0,
      duration: 300,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy()
    });

    // Yellow expanding ring
    const ring = this.add.graphics().setDepth(51);
    ring.lineStyle(3, 0xffff00, 0.8);
    ring.strokeCircle(x, y, 10);

    this.tweens.add({
      targets: ring,
      alpha: 0,
      duration: 400,
      ease: 'Cubic.easeOut',
      onUpdate: (tween) => {
        const progress = tween.progress;
        ring.clear();
        ring.lineStyle(3 * (1 - progress), 0xffff00, 0.8 * (1 - progress));
        ring.strokeCircle(x, y, 10 + progress * 40);
      },
      onComplete: () => ring.destroy()
    });

    // Small star sparkles
    for (let i = 0; i < 6; i++) {
      const starX = x + (Math.random() - 0.5) * 40;
      const starY = y + (Math.random() - 0.5) * 40;

      const star = this.add.circle(starX, starY, 3, 0xffff00, 1.0).setDepth(52);

      this.tweens.add({
        targets: star,
        alpha: 0,
        scale: 2,
        duration: 400,
        delay: 100 + Math.random() * 200,
        ease: 'Cubic.easeOut',
        onComplete: () => star.destroy()
      });
    }
  }

  private spawnChainLightningEffect(sourceX: number, sourceY: number): void {
    // Get all alive enemies in current room
    const state = wsClient.currentState;
    if (!state) return;

    const currentRoom = state.dungeon.rooms.find(r => r.id === state.dungeon.currentRoomId);
    if (!currentRoom) return;

    const aliveEnemies = currentRoom.enemies.filter(e => e.isAlive);
    if (aliveEnemies.length === 0) return;

    // Sort enemies by distance from source for chaining order
    const sortedEnemies = [...aliveEnemies].sort((a, b) => {
      const distA = Math.sqrt(Math.pow(a.position.x - sourceX, 2) + Math.pow(a.position.y - sourceY, 2));
      const distB = Math.sqrt(Math.pow(b.position.x - sourceX, 2) + Math.pow(b.position.y - sourceY, 2));
      return distA - distB;
    });

    // Build chain path: source -> enemy1 -> enemy2 -> ...
    const chainPoints = [{ x: sourceX, y: sourceY }];
    for (const enemy of sortedEnemies) {
      chainPoints.push({ x: enemy.position.x, y: enemy.position.y });
    }

    // Animate lightning through each segment with delay
    for (let i = 0; i < chainPoints.length - 1; i++) {
      const from = chainPoints[i];
      const to = chainPoints[i + 1];
      const delay = i * 80; // 80ms between each chain

      this.time.delayedCall(delay, () => {
        this.drawLightningBolt(from.x, from.y, to.x, to.y);
      });
    }
  }

  private drawLightningBolt(fromX: number, fromY: number, toX: number, toY: number): void {
    const graphics = this.add.graphics().setDepth(51);

    // Calculate direction and distance
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const segments = Math.max(4, Math.floor(dist / 20)); // More segments for longer bolts

    // Generate jagged lightning path
    const points: { x: number; y: number }[] = [{ x: fromX, y: fromY }];

    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const baseX = fromX + dx * t;
      const baseY = fromY + dy * t;

      // Add perpendicular jitter for jagged effect
      const perpX = -dy / dist;
      const perpY = dx / dist;
      const jitter = (Math.random() - 0.5) * 20 * (1 - Math.abs(t - 0.5) * 2); // More jitter in middle

      points.push({
        x: baseX + perpX * jitter,
        y: baseY + perpY * jitter
      });
    }
    points.push({ x: toX, y: toY });

    // Draw main bolt (bright core)
    graphics.lineStyle(4, 0x00ffff, 1.0);
    graphics.beginPath();
    graphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      graphics.lineTo(points[i].x, points[i].y);
    }
    graphics.strokePath();

    // Draw outer glow
    graphics.lineStyle(8, 0x0088ff, 0.4);
    graphics.beginPath();
    graphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      graphics.lineTo(points[i].x, points[i].y);
    }
    graphics.strokePath();

    // Draw white hot center
    graphics.lineStyle(2, 0xffffff, 1.0);
    graphics.beginPath();
    graphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      graphics.lineTo(points[i].x, points[i].y);
    }
    graphics.strokePath();

    // Add small branch forks
    for (let i = 1; i < points.length - 1; i++) {
      if (Math.random() < 0.4) { // 40% chance of fork
        const branchLength = 10 + Math.random() * 15;
        const branchAngle = (Math.random() - 0.5) * Math.PI;
        const branchEndX = points[i].x + Math.cos(branchAngle) * branchLength;
        const branchEndY = points[i].y + Math.sin(branchAngle) * branchLength;

        graphics.lineStyle(2, 0x00ddff, 0.7);
        graphics.beginPath();
        graphics.moveTo(points[i].x, points[i].y);
        graphics.lineTo(branchEndX, branchEndY);
        graphics.strokePath();
      }
    }

    // Fade out and destroy
    this.tweens.add({
      targets: graphics,
      alpha: 0,
      duration: 250,
      ease: 'Cubic.easeOut',
      onComplete: () => graphics.destroy()
    });
  }

  private spawnMeditationEffect(x: number, y: number): void {
    // Rising blue particles (like heal but blue)
    for (let i = 0; i < 12; i++) {
      const particle = this.add.circle(
        x + (Math.random() - 0.5) * 40,
        y + 10,
        4, 0x4488ff, 0.9
      ).setDepth(51);

      this.tweens.add({
        targets: particle,
        y: y - 50,
        alpha: 0,
        duration: 800 + Math.random() * 300,
        delay: i * 60,
        ease: 'Cubic.easeOut',
        onComplete: () => particle.destroy()
      });
    }

    // Central blue glow
    const glow = this.add.circle(x, y, 20, 0x4488ff, 0.5).setDepth(50);
    this.tweens.add({
      targets: glow,
      radius: 40,
      alpha: 0,
      duration: 600,
      ease: 'Cubic.easeOut',
      onComplete: () => glow.destroy()
    });

    // Spiraling mana wisps
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const wisp = this.add.circle(
        x + Math.cos(angle) * 20,
        y + Math.sin(angle) * 20,
        3, 0x88ccff, 1.0
      ).setDepth(52);

      this.tweens.add({
        targets: wisp,
        x: x,
        y: y - 30,
        alpha: 0,
        duration: 500,
        delay: i * 100,
        ease: 'Quad.easeIn',
        onComplete: () => wisp.destroy()
      });
    }
  }

  private spawnStunEffect(x: number, y: number): void {
    // Circling stars around stunned enemy
    const starCount = 5;
    const radius = 25;

    for (let i = 0; i < starCount; i++) {
      const angle = (i / starCount) * Math.PI * 2;
      const star = this.add.text(
        x + Math.cos(angle) * radius,
        y - 20 + Math.sin(angle) * 10,
        '✦',
        { fontSize: '14px', color: '#ffff00' }
      ).setOrigin(0.5).setDepth(52);

      // Rotate around the enemy
      this.tweens.add({
        targets: star,
        angle: 360,
        duration: 2000,
        repeat: 1,
        onUpdate: () => {
          const currentAngle = angle + (star.angle * Math.PI / 180);
          star.x = x + Math.cos(currentAngle) * radius;
          star.y = y - 20 + Math.sin(currentAngle) * 10;
        },
        onComplete: () => star.destroy()
      });
    }

    // Impact burst
    const burst = this.add.circle(x, y, 10, 0xffff00, 0.6).setDepth(51);
    this.tweens.add({
      targets: burst,
      radius: 30,
      alpha: 0,
      duration: 300,
      ease: 'Cubic.easeOut',
      onComplete: () => burst.destroy()
    });
  }

  private spawnBlazeChainEffect(fromX: number, fromY: number, toX: number, toY: number): void {
    this.drawFireBolt(fromX, fromY, toX, toY);
  }

  private drawFireBolt(fromX: number, fromY: number, toX: number, toY: number): void {
    const graphics = this.add.graphics().setDepth(51);

    // Calculate direction and distance
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const segments = Math.max(3, Math.floor(dist / 25));

    // Generate slightly wavy fire path
    const points: { x: number; y: number }[] = [{ x: fromX, y: fromY }];

    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const baseX = fromX + dx * t;
      const baseY = fromY + dy * t;

      // Add perpendicular jitter for wavy effect
      const perpX = -dy / dist;
      const perpY = dx / dist;
      const jitter = (Math.random() - 0.5) * 12;

      points.push({
        x: baseX + perpX * jitter,
        y: baseY + perpY * jitter
      });
    }
    points.push({ x: toX, y: toY });

    // Draw outer glow (orange)
    graphics.lineStyle(10, 0xff6600, 0.4);
    graphics.beginPath();
    graphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      graphics.lineTo(points[i].x, points[i].y);
    }
    graphics.strokePath();

    // Draw main fire (bright orange/yellow)
    graphics.lineStyle(5, 0xff8800, 1.0);
    graphics.beginPath();
    graphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      graphics.lineTo(points[i].x, points[i].y);
    }
    graphics.strokePath();

    // Draw hot core (yellow/white)
    graphics.lineStyle(2, 0xffff44, 1.0);
    graphics.beginPath();
    graphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      graphics.lineTo(points[i].x, points[i].y);
    }
    graphics.strokePath();

    // Fade out and destroy
    this.tweens.add({
      targets: graphics,
      alpha: 0,
      duration: 200,
      ease: 'Cubic.easeOut',
      onComplete: () => graphics.destroy()
    });

    // Add impact effect at end point
    const impact = this.add.circle(toX, toY, 8, 0xff6600, 0.8).setDepth(51);
    this.tweens.add({
      targets: impact,
      radius: 20,
      alpha: 0,
      duration: 200,
      ease: 'Cubic.easeOut',
      onComplete: () => impact.destroy()
    });
  }

  private showNotification(text: string, color?: number, type?: 'info' | 'warning' | 'danger' | 'success' | 'loot' | 'rare'): void {
    const width = this.cameras.main.width;
    const baseY = 80;
    const notificationHeight = 48;

    // Calculate y position based on active notifications
    const yPos = baseY + this.activeNotifications.length * notificationHeight;

    // Determine style based on type or color
    let icon = '';
    let bgColor = '#1e1e32';
    let borderColor = '#444466';
    let textColor = '#ffd700'; // Default gold

    if (type) {
      switch (type) {
        case 'danger':
          icon = '💀 ';
          bgColor = '#3a1a1a';
          borderColor = '#aa3333';
          textColor = '#ff4444';
          break;
        case 'warning':
          icon = '⚠ ';
          bgColor = '#3a2a1a';
          borderColor = '#aa6633';
          textColor = '#ffaa00';
          break;
        case 'success':
          icon = '✓ ';
          bgColor = '#1a3a1a';
          borderColor = '#33aa33';
          textColor = '#44ff44';
          break;
        case 'loot':
          icon = '';
          bgColor = '#2a2a1a';
          borderColor = '#aa8833';
          textColor = '#ffcc00';
          break;
        case 'rare':
          icon = '⭐ ';
          bgColor = '#2a2a1a';
          borderColor = '#ccaa33';
          textColor = '#ffdd44';
          break;
        case 'info':
        default:
          icon = '▶ ';
          bgColor = '#1a1a2e';
          borderColor = '#4466aa';
          textColor = '#88aaff';
          break;
      }
    } else if (color) {
      // Legacy support: infer type from color
      textColor = `#${color.toString(16).padStart(6, '0')}`;
      if (color === 0xff0000 || color === 0xff4444) {
        icon = '💀 ';
        bgColor = '#3a1a1a';
        borderColor = '#aa3333';
      } else if (color === 0xffaa00 || color === 0xff8800) {
        icon = '⚠ ';
        bgColor = '#3a2a1a';
        borderColor = '#aa6633';
      } else if (color === 0xffcc00) {
        icon = '💎 ';
        bgColor = '#2a1a3a';
        borderColor = '#aa33aa';
      }
    }

    // Create container for notification with background and border
    const container = this.add.container(width / 2, yPos).setScrollFactor(0).setDepth(200);

    // Background with border
    const textObj = this.add.text(0, 0, icon + text, {
      fontFamily: FONTS.title,
      fontSize: '15px',
      color: textColor
    }).setOrigin(0.5);

    const paddingX = 20;
    const paddingY = 10;
    const bgWidth = textObj.width + paddingX * 2;
    const bgHeight = textObj.height + paddingY * 2;

    const bg = this.add.rectangle(0, 0, bgWidth, bgHeight, Phaser.Display.Color.HexStringToColor(bgColor).color, 0.95);
    bg.setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(borderColor).color);

    container.add([bg, textObj]);

    // Store the container's text object for tracking
    (container as any).notificationText = textObj;
    this.activeNotifications.push(container as any);

    // Animate in
    container.setScale(0.8);
    container.setAlpha(0);
    this.tweens.add({
      targets: container,
      scale: 1,
      alpha: 1,
      duration: 150,
      ease: 'Back.out'
    });

    // Animate out
    this.tweens.add({
      targets: container,
      alpha: 0,
      y: yPos - 20,
      delay: 2500,
      duration: 400,
      onComplete: () => {
        const index = this.activeNotifications.indexOf(container as any);
        if (index > -1) {
          this.activeNotifications.splice(index, 1);
        }
        container.destroy();
      }
    });
  }

  private showItemCollectedNotification(itemName: string): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Show at bottom center, above action bar
    const yPos = height - 120;

    const notification = this.add.text(width / 2, yPos, `Picked up: ${itemName}`, {
      fontFamily: FONTS.body,
      fontSize: '14px',
      color: '#4CAF50',
      backgroundColor: '#1e1e32dd',
      padding: { x: 12, y: 6 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200);

    // Quick fade animation
    this.tweens.add({
      targets: notification,
      alpha: 0,
      y: yPos - 30,
      delay: 1500,
      duration: 300,
      onComplete: () => {
        notification.destroy();
      }
    });
  }

  private updateMusic(rooms: Room[], currentRoomId: string, theme?: string): void {
    const currentRoom = rooms.find(r => r.id === currentRoomId);
    if (!currentRoom) return;

    // Get current player's class for class-specific music
    const currentPlayer = wsClient.getCurrentPlayer();
    const playerClass = currentPlayer?.classId;

    // Determine which music should play (priority: boss > inferno theme > class-specific > default)
    const shouldPlayBossMusic = currentRoom.type === 'boss' && !currentRoom.cleared;
    let targetMusicKey: string;

    if (shouldPlayBossMusic) {
      targetMusicKey = 'musicBoss';
    } else if (theme === 'inferno' && this.cache.audio.exists('musicInferno')) {
      targetMusicKey = 'musicInferno';
    } else {
      // Check for class-specific music
      const classMusicMap: Record<string, string> = {
        'warrior': 'musicWarrior',
        'paladin': 'musicPaladin',
        'rogue': 'musicRogue'
      };

      const classMusic = playerClass ? classMusicMap[playerClass] : null;
      const classMusicExists = classMusic ? this.cache.audio.exists(classMusic) : false;

      if (classMusic && classMusicExists) {
        targetMusicKey = classMusic;
      } else {
        targetMusicKey = 'musicDungeon';
        // Debug: why are we falling back to dungeon music?
        if (classMusic && !classMusicExists) {
          console.log(`[DEBUG] Class music ${classMusic} not in cache, falling back to musicDungeon`);
        }
      }
    }

    // Check if room changed to boss room
    if (this.previousRoomId !== currentRoomId && currentRoom.type === 'boss' && !currentRoom.cleared) {
      this.showNotification('Entering Boss Room!', undefined, 'danger');
    }
    this.previousRoomId = currentRoomId;

    // If music needs to change
    if (this.currentMusicKey !== targetMusicKey) {
      // Throttle music changes to prevent rapid switching (at least 1 second between changes)
      const now = Date.now();
      if (now - this.lastMusicChangeTime < 1000) {
        // Too soon to change music again, skip
        return;
      }
      this.lastMusicChangeTime = now;

      console.log(`[DEBUG] Music changing from ${this.currentMusicKey} to ${targetMusicKey}`);

      // Stop current music
      if (this.currentMusic) {
        this.currentMusic.stop();
        this.currentMusic = null;
      }

      // Start new music (only if sound is unlocked by user interaction)
      if (this.sound.locked) {
        // Wait for user interaction to unlock audio
        this.sound.once('unlocked', () => {
          this.startMusic(targetMusicKey, shouldPlayBossMusic);
        });
      } else {
        this.startMusic(targetMusicKey, shouldPlayBossMusic);
      }
    }
  }

  private startMusic(musicKey: string, isBossMusic: boolean): void {
    try {
      // Check if music exists in cache
      if (!this.cache.audio.exists(musicKey)) {
        console.log(`[DEBUG] Music ${musicKey} not loaded yet`);
        return;
      }

      this.currentMusic = this.sound.add(musicKey, {
        loop: true,
        volume: isBossMusic ? 0.4 : 0.25
      });
      this.currentMusic.play();
      this.currentMusicKey = musicKey;
      console.log(`[DEBUG] Started playing ${musicKey}`);
    } catch (e) {
      console.log(`[DEBUG] Failed to play music: ${e}`);
    }
  }

  private playLevelUpSound(): void {
    try {
      this.sound.play('sfxLevelUp', { volume: 0.5 });
    } catch {
      // Sound not loaded
    }
  }

  private showLevelUpAnimation(newLevel: number): void {
    const player = wsClient.getCurrentPlayer();
    if (!player) return;

    const playerX = player.position.x;
    const playerY = player.position.y;

    // Create golden particle burst
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const speed = 80 + Math.random() * 60;
      const particle = this.add.circle(playerX, playerY, 4 + Math.random() * 4, 0xffd700);
      particle.setDepth(150);

      this.tweens.add({
        targets: particle,
        x: playerX + Math.cos(angle) * speed,
        y: playerY + Math.sin(angle) * speed,
        alpha: 0,
        scale: 0,
        duration: 800 + Math.random() * 400,
        ease: 'Cubic.easeOut',
        onComplete: () => particle.destroy()
      });
    }

    // Create sparkle particles rising up
    for (let i = 0; i < 12; i++) {
      this.time.delayedCall(i * 50, () => {
        const sparkle = this.add.star(
          playerX + Phaser.Math.Between(-30, 30),
          playerY + 20,
          5, 3, 6, 0xffee88
        );
        sparkle.setDepth(150);

        this.tweens.add({
          targets: sparkle,
          y: playerY - 80 - Math.random() * 40,
          alpha: 0,
          rotation: Math.PI * 2,
          duration: 1000,
          ease: 'Cubic.easeOut',
          onComplete: () => sparkle.destroy()
        });
      });
    }

    // Big "LEVEL UP!" text
    const levelUpText = this.add.text(playerX, playerY - 40, 'LEVEL UP!', {
      fontFamily: FONTS.title,
      fontSize: '48px',
      color: '#ffd700',
      stroke: '#aa6600',
      strokeThickness: 6
    }).setOrigin(0.5).setDepth(160);

    // Start small, pop big, then float up
    levelUpText.setScale(0.3);
    levelUpText.setAlpha(0);

    this.tweens.add({
      targets: levelUpText,
      scale: 1.2,
      alpha: 1,
      duration: 200,
      ease: 'Back.easeOut',
      onComplete: () => {
        // Show level number
        const levelNum = this.add.text(playerX, playerY, `Level ${newLevel}`, {
          fontFamily: FONTS.title,
          fontSize: '24px',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 4
        }).setOrigin(0.5).setDepth(160);
        levelNum.setScale(0.5);

        this.tweens.add({
          targets: levelNum,
          scale: 1,
          duration: 150,
          ease: 'Back.easeOut'
        });

        // Float both up and fade
        this.tweens.add({
          targets: [levelUpText, levelNum],
          y: '-=60',
          alpha: 0,
          duration: 1500,
          delay: 800,
          ease: 'Cubic.easeIn',
          onComplete: () => {
            levelUpText.destroy();
            levelNum.destroy();
          }
        });
      }
    });

    // Screen flash
    const flash = this.add.rectangle(
      this.scale.width / 2,
      this.scale.height / 2,
      this.scale.width + 100,
      this.scale.height + 100,
      0xffd700, 0.3
    );
    flash.setScrollFactor(0).setDepth(140);

    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 500,
      onComplete: () => flash.destroy()
    });
  }

  private handleClick(pointer: Phaser.Input.Pointer): void {
    // Skip if inventory is open - let inventory handle its own clicks
    if (this.inventoryUI?.isVisible()) {
      return;
    }

    // Skip if vendor UI is open
    if (this.vendorModalOpen) {
      return;
    }

    // Check if clicked on an enemy
    const worldX = pointer.worldX;
    const worldY = pointer.worldY;

    const state = wsClient.currentState;
    if (!state) return;

    // Find clicked enemy - check current room and adjacent rooms
    const currentRoom = state.dungeon.rooms.find(r => r.id === state.dungeon.currentRoomId);
    if (!currentRoom) return;

    // Get rooms to check (current + connected)
    const roomsToCheck = [currentRoom];
    for (const connectedId of currentRoom.connectedTo) {
      const connectedRoom = state.dungeon.rooms.find(r => r.id === connectedId);
      if (connectedRoom) {
        roomsToCheck.push(connectedRoom);
      }
    }

    for (const room of roomsToCheck) {
      for (const enemy of room.enemies) {
        if (!enemy.isAlive) continue;

        const dx = enemy.position.x - worldX;
        const dy = enemy.position.y - worldY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 30) { // Click radius
          this.inputManager?.setTarget(enemy.id);
          return;
        }
      }
    }

    // Clicked on nothing, clear target
    this.inputManager?.setTarget(null);
  }

  // NOTE: copyInviteLink removed - game is now single-player only

  private saveGame(): void {
    const success = wsClient.saveCharacter();
    if (success) {
      this.showNotification('Game saved!', undefined, 'success');
      this.playSfx('sfxLoot');
    } else {
      this.showNotification('Failed to save game');
    }
  }

  private leaveGame(): void {
    console.log('[GAME] leaveGame() called');

    // Fully disconnect from WebSocket to prevent stale messages
    wsClient.disconnect();
    wsClient.runId = null;
    wsClient.playerId = null;
    wsClient.currentState = null;

    // Clean up this scene (unsubscribes from messages, destroys systems)
    this.shutdown();

    // Return to menu - start MenuScene then stop GameScene
    // IMPORTANT: Call stop() AFTER start() - this queues the stop for after start completes
    this.scene.start('MenuScene');
    this.scene.stop('GameScene');
    console.log('[GAME] scene.start(MenuScene) and scene.stop(GameScene) called');
  }

  shutdown(): void {
    console.log('[DEBUG] GameScene shutdown() called');
    console.log('[DEBUG] Active scenes before shutdown:', this.scene.manager.getScenes(true).map(s => s.scene.key));

    // Unsubscribe from server messages
    if (this.messageUnsubscribe) {
      console.log('[DEBUG] Unsubscribing from message handler');
      this.messageUnsubscribe();
      this.messageUnsubscribe = null;
    }

    // Stop all tweens to prevent visual artifacts on scene restart
    this.tweens.killAll();

    // Remove all input listeners (pointer events)
    this.input.removeAllListeners();

    // Remove keyboard listeners (separate from pointer input)
    // CRITICAL: Without this, Q/E/I key handlers accumulate on scene restart
    this.input.keyboard?.removeAllListeners();

    console.log('[DEBUG] GameScene shutdown() complete');

    // Destroy systems
    this.inputManager?.destroy();
    this.inputManager = null;
    this.inventoryUI?.destroy();
    this.inventoryUI = null;
    this.abilitySystem = null;

    // Stop all sounds
    this.sound.stopAll();
  }
}
