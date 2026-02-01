import Phaser from 'phaser';
import { SpriteGenerator } from '../sprites/SpriteGenerator';
import { wsClient } from '../network/WebSocketClient';

// Font configurations matching landing page
const FONTS = {
  title: 'Cinzel, serif',
  body: 'Crimson Text, Georgia, serif'
};

export class BootScene extends Phaser.Scene {
  private loadingText: Phaser.GameObjects.Text | null = null;
  private statusText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Load player character images
    const classes = ['warrior', 'paladin', 'hunter', 'rogue', 'priest', 'shaman', 'mage', 'warlock', 'druid'];
    for (const cls of classes) {
      this.load.image(`player_${cls}`, `assets/players/${cls}.png`);
    }

    // Load class face images for player frame UI (only for available/finished classes)
    const availableClasses = ['warrior', 'paladin', 'rogue', 'shaman', 'mage', 'warlock'];
    for (const cls of availableClasses) {
      this.load.image(`face_${cls}`, `assets/faces/${cls}_face.png`);
    }

    // Load rogue ability animation frames (3 frames)
    for (let i = 1; i <= 3; i++) {
      this.load.image(`rogue_ability_${i}`, `assets/players/animated/rogue/rogue${i}.png`);
    }

    // Load rogue movement animation frames (4 frames)
    for (let i = 1; i <= 4; i++) {
      this.load.image(`rogue_move_${i}`, `assets/players/animated/rogue/movement/rogue${i}.png`);
    }

    // Load warrior ability animation frames (4 frames)
    for (let i = 1; i <= 4; i++) {
      this.load.image(`warrior_ability_${i}`, `assets/players/animated/warrior/warrior${i}.png`);
    }

    // Load paladin ability animation frames (4 frames)
    for (let i = 1; i <= 4; i++) {
      this.load.image(`paladin_ability_${i}`, `assets/players/animated/paladin/paladin${i}.png`);
    }

    // Load warlock ability animation frames (4 frames)
    for (let i = 1; i <= 4; i++) {
      this.load.image(`warlock_ability_${i}`, `assets/players/animated/warlock/warlock${i}.png`);
    }

    // Load hunter ability animation frames (4 frames)
    for (let i = 1; i <= 4; i++) {
      this.load.image(`hunter_ability_${i}`, `assets/players/animated/hunter/hunter${i}.png`);
    }

    // Load mage ability animation frames (4 frames)
    for (let i = 1; i <= 4; i++) {
      this.load.image(`mage_ability_${i}`, `assets/players/animated/mage/mage${i}.png`);
    }

    // Load shaman ability animation frames (4 frames)
    for (let i = 1; i <= 4; i++) {
      this.load.image(`shaman_ability_${i}`, `assets/players/animated/shaman/shaman${i}.png`);
    }

    // Load shaman movement animation frames (4 frames)
    for (let i = 1; i <= 4; i++) {
      this.load.image(`shaman_move_${i}`, `assets/players/animated/shaman/movement/shaman${i}.png`);
    }

    // Load warrior movement animation frames (4 frames)
    for (let i = 1; i <= 4; i++) {
      this.load.image(`warrior_move_${i}`, `assets/players/animated/warrior/movement/warrior${i}.png`);
    }

    // Load paladin movement animation frames (4 frames)
    for (let i = 1; i <= 4; i++) {
      this.load.image(`paladin_move_${i}`, `assets/players/animated/paladin/movement/paladin${i}.png`);
    }

    // Load mage movement animation frames (4 frames)
    for (let i = 1; i <= 4; i++) {
      this.load.image(`mage_move_${i}`, `assets/players/animated/mage/movement/mage${i}.png`);
    }

    // Load warlock movement animation frames (4 frames)
    for (let i = 1; i <= 4; i++) {
      this.load.image(`warlock_move_${i}`, `assets/players/animated/warlock/movement/warlock${i}.png`);
    }

    // Load enemy animation frames (16x16 pixel art)
    for (let i = 1; i <= 4; i++) {
      this.load.image(`enemy_melee_${i}`, `assets/enemies/animated/melee_${i}.png`);
      this.load.image(`enemy_ranged_${i}`, `assets/enemies/animated/ranged_${i}.png`);
      this.load.image(`enemy_caster_${i}`, `assets/enemies/animated/caster_${i}.png`);
      this.load.image(`enemy_rare_${i}`, `assets/enemies/animated/rare_${i}.png`);
      this.load.image(`enemy_elite_${i}`, `assets/enemies/animated/elite_${i}.png`);
    }

    // Load pet images
    this.load.image('pet_imp', 'assets/pets/imp.png');
    this.load.image('pet_voidwalker', 'assets/pets/voidwalker.png');

    // Load boss images
    this.load.image('boss_demon', 'assets/bosses/demon_boss.png');
    this.load.image('boss_deathknight', 'assets/bosses/deathknight_boss.png');
    this.load.image('boss_spider', 'assets/bosses/spider_boss.png');
    this.load.image('boss_dragon', 'assets/bosses/dragon_boss.png');
    this.load.image('boss_lich', 'assets/bosses/lich_boss.png');
    this.load.image('boss_golem', 'assets/bosses/golem_boss.png');

    // Load spider boss animation frames (5 frames)
    for (let i = 1; i <= 5; i++) {
      this.load.image(`boss_spider_${i}`, `assets/bosses/animated/spider${i}.png`);
    }

    // Load death knight boss animation frames (4 frames)
    for (let i = 1; i <= 4; i++) {
      this.load.image(`boss_deathknight_${i}`, `assets/bosses/animated/death_knight${i}.png`);
    }

    // Load dragon boss animation frames (4 frames)
    for (let i = 1; i <= 4; i++) {
      this.load.image(`boss_dragon_${i}`, `assets/bosses/animated/dragon${i}.png`);
    }

    // Load golem boss animation frames (4 frames)
    for (let i = 1; i <= 4; i++) {
      this.load.image(`boss_golem_${i}`, `assets/bosses/animated/golem${i}.png`);
    }

    // Load lich boss animation frames (4 frames)
    for (let i = 1; i <= 4; i++) {
      this.load.image(`boss_lich_${i}`, `assets/bosses/animated/lich${i}.png`);
    }

    // Load demon boss animation frames (5 frames)
    for (let i = 1; i <= 5; i++) {
      this.load.image(`boss_demon_${i}`, `assets/bosses/animated/demon${i}.png`);
    }

    // Load tile images
    this.load.image('tile_fresh', 'assets/tiles/tile_fresh.png');
    this.load.image('tile_old', 'assets/tiles/tile_old.png');
    this.load.image('tile_cracked', 'assets/tiles/tile_with_crack.png');
    this.load.image('tile_grass', 'assets/tiles/tile_with_grass.png');
    this.load.image('tile_more_cracked', 'assets/tiles/tile_more_cracked.png');
    this.load.image('tile_more_grass', 'assets/tiles/tile_more_grass.png');
    this.load.image('wall_horizontal', 'assets/tiles/wall_horizontal.png');
    this.load.image('wall_vertical', 'assets/tiles/wall_vertical.png');

    // Load UI images
    this.load.image('ability_frame', 'assets/ui/ability_frame.png');
    this.load.image('potion_health', 'assets/ui/potion_health.png');
    this.load.image('potion_mana', 'assets/ui/potion_mana.png');

    // Load decoration images
    this.load.image('deco_barrel', 'assets/decorations/barrel.png');
    this.load.image('deco_gate', 'assets/decorations/gate.png');

    // Load animated decoration frames (16x16 pixel art)
    // Chest animations (closed idle + opening)
    for (let i = 1; i <= 4; i++) {
      this.load.image(`chest_closed_${i}`, `assets/decorations/animated/chest_${i}.png`);
      this.load.image(`chest_open_${i}`, `assets/decorations/animated/chest_open_${i}.png`);
    }

    // Torch animations
    for (let i = 1; i <= 4; i++) {
      this.load.image(`torch_${i}`, `assets/decorations/animated/torch_${i}.png`);
      this.load.image(`side_torch_${i}`, `assets/decorations/animated/side_torch_${i}.png`);
      this.load.image(`candlestick_${i}`, `assets/decorations/animated/candlestick_1_${i}.png`);
    }

    // Flag animations
    for (let i = 1; i <= 4; i++) {
      this.load.image(`flag_${i}`, `assets/decorations/animated/flag_${i}.png`);
    }

    // Trap animations
    for (let i = 1; i <= 4; i++) {
      this.load.image(`spikes_${i}`, `assets/traps/peaks_${i}.png`);
      this.load.image(`flamethrower_${i}`, `assets/traps/flamethrower_1_${i}.png`);
    }

    // Coin animations
    for (let i = 1; i <= 4; i++) {
      this.load.image(`coin_${i}`, `assets/items/animated/coin_${i}.png`);
    }

    // Key animations
    for (let i = 1; i <= 4; i++) {
      this.load.image(`key_${i}`, `assets/items/animated/keys_1_${i}.png`);
    }

    // Load themed floor tiles (Crypt, Inferno, Swamp have custom assets)
    const tileCounts: Record<string, number> = {
      crypt: 3, inferno: 3, swamp: 3, frozen: 4, shadow: 2, treasure: 2
    };
    for (const theme of Object.keys(tileCounts)) {
      for (let i = 1; i <= tileCounts[theme]; i++) {
        this.load.image(`tile_${theme}_${i}`, `assets/tiles/themes/${theme}/tile_${i}.png`);
      }
    }

    // Load themed walls (Crypt, Inferno, Swamp, Frozen have custom walls)
    const themedWallThemes = ['crypt', 'inferno', 'swamp', 'frozen'];
    for (const theme of themedWallThemes) {
      this.load.image(`wall_${theme}_horizontal`, `assets/tiles/themes/${theme}/wall_horizontal.png`);
      this.load.image(`wall_${theme}_vertical`, `assets/tiles/themes/${theme}/wall_vertical.png`);
    }

    // Load themed decorations - Crypt
    this.load.image('deco_crypt_tomb', 'assets/decorations/themes/crypt/tomb.png');
    this.load.image('deco_crypt_bones', 'assets/decorations/themes/crypt/bones.png');

    // Load themed decorations - Inferno
    this.load.image('deco_inferno_fire1', 'assets/decorations/themes/inferno/fire1.png');
    this.load.image('deco_inferno_fire2', 'assets/decorations/themes/inferno/fire2.png');

    // Load themed decorations - Swamp/Marsh
    this.load.image('deco_swamp_mushroom', 'assets/decorations/themes/swamp/mushroom.png');
    this.load.image('deco_swamp_barrel', 'assets/decorations/themes/swamp/barrel.png');
    this.load.image('deco_swamp_wood', 'assets/decorations/themes/swamp/wood.png');

    // Load themed decorations - Frozen
    this.load.image('deco_frozen_crystal', 'assets/decorations/themes/frozen/crystal.png');
    this.load.image('deco_frozen_crystal2', 'assets/decorations/themes/frozen/crystal2.png');
    this.load.image('deco_frozen_barrel', 'assets/decorations/themes/frozen/barrel.png');

    // Load themed traps
    this.load.image('trap_inferno_lava', 'assets/traps/themes/inferno/lava.png');
    this.load.image('trap_swamp_poison', 'assets/traps/themes/swamp/poison_cloud.png');
    this.load.image('trap_frozen_spikes', 'assets/traps/themes/frozen/ice_spikes.png')

    // Load NPC images
    this.load.image('npc_trainer', 'assets/npc/trainer.png');
    this.load.image('npc_vendor', 'assets/npc/vendor.png');

    // Load audio files
    this.load.audio('sfxHit', 'assets/audio/hit.wav');
    this.load.audio('sfxCast', 'assets/audio/cast.wav');
    this.load.audio('sfxHeal', 'assets/audio/heal.wav');
    this.load.audio('sfxLoot', 'assets/audio/loot.wav');
    this.load.audio('sfxRare', 'assets/audio/rare_spawn.wav');
    this.load.audio('sfxBossDeath', 'assets/audio/boss_death.wav');

    // Load music and additional sounds
    this.load.audio('musicDungeon', 'assets/sounds/dungeon_music.mp3');
    this.load.audio('musicBoss', 'assets/sounds/boss_fight.wav');
    this.load.audio('musicInferno', 'assets/sounds/inferno_level.mp3');
    // Class-specific background music
    this.load.audio('musicWarrior', 'assets/sounds/warrior_background.mp3');
    this.load.audio('musicPaladin', 'assets/sounds/paladin_background.mp3');
    this.load.audio('musicRogue', 'assets/sounds/rogue_background.mp3');
    this.load.audio('sfxLevelUp', 'assets/sounds/level.mp3');
    this.load.audio('sfxMelee', 'assets/sounds/meelee_sound.mp3');
    this.load.audio('sfxMelee2', 'assets/sounds/meelee_sound2.mp3');
    this.load.audio('sfxFootstep', 'assets/sounds/footstep.mp3');
    this.load.audio('sfxHealSpell', 'assets/sounds/heal.mp3');
    this.load.audio('sfxDeath1', 'assets/sounds/death1.mp3');
    this.load.audio('sfxDeath2', 'assets/sounds/death2.mp3');
    this.load.audio('sfxSpell', 'assets/audio/spell.mp3');
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Background
    this.cameras.main.setBackgroundColor('#0d0d1a');

    // Title
    this.add.text(width / 2, height / 3, 'ABYSSAL DESCENT', {
      fontFamily: FONTS.title,
      fontSize: '52px',
      color: '#ffd700'
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 3 + 55, 'The Depths Await', {
      fontFamily: FONTS.body,
      fontSize: '18px',
      color: '#aa8855',
      fontStyle: 'italic'
    }).setOrigin(0.5);

    // Loading text
    this.loadingText = this.add.text(width / 2, height / 2 + 20, 'Preparing the descent...', {
      fontFamily: FONTS.body,
      fontSize: '18px',
      color: '#e0e0e0'
    }).setOrigin(0.5);

    this.statusText = this.add.text(width / 2, height / 2 + 50, '', {
      fontFamily: FONTS.body,
      fontSize: '14px',
      color: '#888899'
    }).setOrigin(0.5);

    // Generate sprites
    this.time.delayedCall(100, () => this.generateSprites());
  }

  private generateSprites(): void {
    // Generate all sprites
    const generator = new SpriteGenerator(this);
    generator.generateAll();

    // Apply nearest-neighbor filtering to pixel art textures for crisp rendering
    this.applyPixelArtFiltering();

    this.loadingText?.setText('Connecting to server...');

    // Connect to server
    this.connectToServer();
  }

  private applyPixelArtFiltering(): void {
    // List of texture keys that should use pixel art (nearest neighbor) filtering
    const pixelArtTextures = [
      // Players
      'player_warrior', 'player_paladin', 'player_hunter', 'player_rogue',
      'player_priest', 'player_shaman', 'player_mage', 'player_warlock', 'player_druid',
      // Face icons for player frame UI
      'face_warrior', 'face_paladin', 'face_rogue', 'face_shaman', 'face_mage', 'face_warlock',
      // Enemies (animated frames)
      'enemy_melee_1', 'enemy_melee_2', 'enemy_melee_3', 'enemy_melee_4',
      'enemy_ranged_1', 'enemy_ranged_2', 'enemy_ranged_3', 'enemy_ranged_4',
      'enemy_caster_1', 'enemy_caster_2', 'enemy_caster_3', 'enemy_caster_4',
      'enemy_rare_1', 'enemy_rare_2', 'enemy_rare_3', 'enemy_rare_4',
      'enemy_elite_1', 'enemy_elite_2', 'enemy_elite_3', 'enemy_elite_4',
      // Pets
      'pet_imp', 'pet_voidwalker',
      // Bosses
      'boss_demon', 'boss_deathknight', 'boss_spider', 'boss_dragon', 'boss_lich', 'boss_golem',
      // Tiles and decorations
      'tile_fresh', 'tile_old', 'tile_cracked', 'tile_grass', 'tile_more_cracked', 'tile_more_grass',
      'wall_horizontal', 'wall_vertical',
      'deco_barrel', 'deco_gate',
      // Animated decorations
      'chest_closed_1', 'chest_closed_2', 'chest_closed_3', 'chest_closed_4',
      'chest_open_1', 'chest_open_2', 'chest_open_3', 'chest_open_4',
      'torch_1', 'torch_2', 'torch_3', 'torch_4',
      'side_torch_1', 'side_torch_2', 'side_torch_3', 'side_torch_4',
      'candlestick_1', 'candlestick_2', 'candlestick_3', 'candlestick_4',
      'flag_1', 'flag_2', 'flag_3', 'flag_4',
      // Traps
      'spikes_1', 'spikes_2', 'spikes_3', 'spikes_4',
      'flamethrower_1', 'flamethrower_2', 'flamethrower_3', 'flamethrower_4',
      // Items
      'coin_1', 'coin_2', 'coin_3', 'coin_4',
      'key_1', 'key_2', 'key_3', 'key_4',
      // NPC
      'npc_trainer', 'npc_vendor'
    ];

    pixelArtTextures.forEach(key => {
      const texture = this.textures.get(key);
      if (texture && texture.source && texture.source[0]) {
        texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    });
  }

  private async connectToServer(): Promise<void> {
    try {
      await wsClient.connect();
      this.statusText?.setText('Connected!');

      // NOTE: URL join parameter removed - game is now single-player only

      // Short delay then go to menu
      this.time.delayedCall(500, () => {
        this.scene.start('MenuScene', {});
        this.scene.stop('BootScene');
      });
    } catch (error) {
      this.statusText?.setText('Failed to connect. Retrying...');
      this.time.delayedCall(2000, () => this.connectToServer());
    }
  }
}
