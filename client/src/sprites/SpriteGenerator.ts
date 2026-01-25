import Phaser from 'phaser';
import { ClassName, EquipSlot, Rarity, EnemyType } from '@dungeon-link/shared';
import { CLASS_COLORS, RARITY_COLORS, ENEMY_TYPE_COLORS, SPRITE_CONFIG } from '@dungeon-link/shared';

/**
 * Generate all game sprites at runtime using canvas drawing
 */
export class SpriteGenerator {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Generate all sprites needed for the game
   */
  generateAll(): void {
    this.generatePlayerSprites();
    this.generateEnemySprites();
    this.generateBossSprite();
    this.generateRareSprite();
    this.generateItemSprites();
    this.generateTileSprites();
    this.generateUISprites();
    this.generateAbilityIcons();
    this.generateBuffIcons();
  }

  /**
   * Generate player sprites for each class
   */
  private generatePlayerSprites(): void {
    const size = SPRITE_CONFIG.PLAYER_SIZE;

    for (const className of Object.values(ClassName)) {
      const color = CLASS_COLORS[className];

      const graphics = this.scene.make.graphics({ x: 0, y: 0 });

      // Body (circle)
      graphics.fillStyle(color, 1);
      graphics.fillCircle(size / 2, size / 2, size / 2 - 2);

      // Outline
      graphics.lineStyle(2, 0x000000, 1);
      graphics.strokeCircle(size / 2, size / 2, size / 2 - 2);

      // Direction indicator (small triangle at top)
      graphics.fillStyle(0xffffff, 0.8);
      graphics.fillTriangle(
        size / 2, 4,
        size / 2 - 4, 12,
        size / 2 + 4, 12
      );

      graphics.generateTexture(`player_${className}`, size, size);
      graphics.destroy();
    }
  }

  /**
   * Generate enemy sprites for each type
   */
  private generateEnemySprites(): void {
    const size = SPRITE_CONFIG.ENEMY_SIZE;

    for (const enemyType of Object.values(EnemyType)) {
      const color = ENEMY_TYPE_COLORS[enemyType];

      const graphics = this.scene.make.graphics({ x: 0, y: 0 });

      if (enemyType === EnemyType.Melee) {
        // Square shape for melee
        graphics.fillStyle(color, 1);
        graphics.fillRect(4, 4, size - 8, size - 8);
        graphics.lineStyle(2, 0x000000, 1);
        graphics.strokeRect(4, 4, size - 8, size - 8);
      } else if (enemyType === EnemyType.Ranged) {
        // Diamond shape for ranged
        graphics.fillStyle(color, 1);
        graphics.fillTriangle(
          size / 2, 4,
          size - 4, size / 2,
          size / 2, size - 4
        );
        graphics.fillTriangle(
          size / 2, 4,
          4, size / 2,
          size / 2, size - 4
        );
        graphics.lineStyle(2, 0x000000, 1);
        graphics.strokeTriangle(
          size / 2, 4,
          size - 4, size / 2,
          size / 2, size - 4
        );
      } else {
        // Hexagon-ish shape for caster
        graphics.fillStyle(color, 1);
        graphics.fillCircle(size / 2, size / 2, size / 2 - 4);
        graphics.lineStyle(2, 0x000000, 1);
        graphics.strokeCircle(size / 2, size / 2, size / 2 - 4);

        // Inner glow for caster
        graphics.fillStyle(0xffffff, 0.3);
        graphics.fillCircle(size / 2, size / 2, size / 4);
      }

      graphics.generateTexture(`enemy_${enemyType}`, size, size);
      graphics.destroy();
    }
  }

  /**
   * Generate boss sprite
   */
  private generateBossSprite(): void {
    const size = SPRITE_CONFIG.BOSS_SIZE;

    const graphics = this.scene.make.graphics({ x: 0, y: 0 });

    // Main body - larger red shape
    graphics.fillStyle(0x8b0000, 1);
    graphics.fillCircle(size / 2, size / 2, size / 2 - 4);

    // Outer ring
    graphics.lineStyle(4, 0xff0000, 1);
    graphics.strokeCircle(size / 2, size / 2, size / 2 - 4);

    // Inner details
    graphics.fillStyle(0x000000, 0.5);
    graphics.fillCircle(size / 2, size / 2, size / 4);

    // Crown/horns
    graphics.fillStyle(0xffd700, 1);
    graphics.fillTriangle(size / 4, size / 4, size / 4 - 8, 0, size / 4 + 4, size / 4 - 8);
    graphics.fillTriangle(size * 3 / 4, size / 4, size * 3 / 4 - 4, size / 4 - 8, size * 3 / 4 + 8, 0);

    graphics.generateTexture('boss', size, size);
    graphics.destroy();
  }

  /**
   * Generate rare mob sprite
   */
  private generateRareSprite(): void {
    const size = SPRITE_CONFIG.ENEMY_SIZE;

    const graphics = this.scene.make.graphics({ x: 0, y: 0 });

    // Golden glow background
    graphics.fillStyle(0xffd700, 0.3);
    graphics.fillCircle(size / 2, size / 2, size / 2);

    // Main body - golden
    graphics.fillStyle(0xdaa520, 1);
    graphics.fillCircle(size / 2, size / 2, size / 2 - 4);

    // Sparkle outline
    graphics.lineStyle(3, 0xffd700, 1);
    graphics.strokeCircle(size / 2, size / 2, size / 2 - 4);

    // Star indicator
    graphics.fillStyle(0xffffff, 1);
    this.drawStar(graphics, size / 2, size / 2, 5, size / 6, size / 12);

    graphics.generateTexture('rare', size, size);
    graphics.destroy();
  }

  /**
   * Generate item icons for each slot
   */
  private generateItemSprites(): void {
    const size = SPRITE_CONFIG.ITEM_ICON_SIZE;

    // Generate for each slot
    const slotShapes: Record<EquipSlot, (g: Phaser.GameObjects.Graphics, s: number) => void> = {
      [EquipSlot.Head]: (g, s) => {
        // Helmet shape
        g.fillStyle(0x888888, 1);
        g.fillRoundedRect(4, 8, s - 8, s - 12, 4);
        g.fillRect(s / 4, 4, s / 2, 8);
      },
      [EquipSlot.Chest]: (g, s) => {
        // Chestplate shape
        g.fillStyle(0x888888, 1);
        g.fillRoundedRect(6, 4, s - 12, s - 8, 4);
      },
      [EquipSlot.Legs]: (g, s) => {
        // Pants shape
        g.fillStyle(0x888888, 1);
        g.fillRect(8, 4, 6, s - 8);
        g.fillRect(s - 14, 4, 6, s - 8);
        g.fillRect(8, 4, s - 16, 8);
      },
      [EquipSlot.Feet]: (g, s) => {
        // Boot shape
        g.fillStyle(0x888888, 1);
        g.fillRoundedRect(4, s / 2, s - 8, s / 2 - 4, 4);
        g.fillRect(s / 4, 4, s / 2, s / 2);
      },
      [EquipSlot.Hands]: (g, s) => {
        // Glove shape
        g.fillStyle(0x888888, 1);
        g.fillRoundedRect(8, 8, s - 16, s - 16, 4);
        g.fillRect(4, s / 2, 6, 8);
        g.fillRect(s - 10, s / 2, 6, 8);
      },
      [EquipSlot.Weapon]: (g, s) => {
        // Sword shape
        g.fillStyle(0xaaaaaa, 1);
        g.fillRect(s / 2 - 2, 4, 4, s - 12);
        g.fillStyle(0x8b4513, 1);
        g.fillRect(s / 4, s - 12, s / 2, 8);
      },
      [EquipSlot.Ring]: (g, s) => {
        // Ring shape
        g.fillStyle(0xffd700, 1);
        g.fillCircle(s / 2, s / 2, s / 3);
        g.fillStyle(0x1a1a2e, 1);
        g.fillCircle(s / 2, s / 2, s / 6);
      },
      [EquipSlot.Trinket]: (g, s) => {
        // Gem/trinket shape
        g.fillStyle(0x9400d3, 1);
        this.drawStar(g, s / 2, s / 2, 6, s / 3, s / 6);
      }
    };

    for (const slot of Object.values(EquipSlot)) {
      const graphics = this.scene.make.graphics({ x: 0, y: 0 });

      // Background
      graphics.fillStyle(0x333333, 1);
      graphics.fillRoundedRect(0, 0, size, size, 4);

      // Draw slot-specific shape
      slotShapes[slot](graphics, size);

      // Border
      graphics.lineStyle(2, 0x666666, 1);
      graphics.strokeRoundedRect(0, 0, size, size, 4);

      graphics.generateTexture(`item_${slot}`, size, size);
      graphics.destroy();
    }

    // Generate rarity borders
    for (const rarity of Object.values(Rarity)) {
      const graphics = this.scene.make.graphics({ x: 0, y: 0 });

      graphics.lineStyle(3, RARITY_COLORS[rarity], 1);
      graphics.strokeRoundedRect(1, 1, size - 2, size - 2, 4);

      graphics.generateTexture(`rarity_${rarity}`, size, size);
      graphics.destroy();
    }
  }

  /**
   * Generate tile sprites
   */
  private generateTileSprites(): void {
    const size = SPRITE_CONFIG.TILE_SIZE;

    // Floor tile
    let graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x3d3d3d, 1);
    graphics.fillRect(0, 0, size, size);
    graphics.lineStyle(1, 0x2a2a2a, 0.5);
    graphics.strokeRect(0, 0, size, size);
    graphics.generateTexture('tile_floor', size, size);
    graphics.destroy();

    // Wall tile
    graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x1a1a1a, 1);
    graphics.fillRect(0, 0, size, size);
    graphics.lineStyle(2, 0x0a0a0a, 1);
    graphics.strokeRect(0, 0, size, size);
    graphics.generateTexture('tile_wall', size, size);
    graphics.destroy();

    // Door/corridor tile
    graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x4a4a4a, 1);
    graphics.fillRect(0, 0, size, size);
    graphics.lineStyle(1, 0x5a5a5a, 0.5);
    graphics.strokeRect(0, 0, size, size);
    graphics.generateTexture('tile_door', size, size);
    graphics.destroy();

    // Boss room floor
    graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x4a2020, 1);
    graphics.fillRect(0, 0, size, size);
    graphics.lineStyle(1, 0x3a1515, 0.5);
    graphics.strokeRect(0, 0, size, size);
    graphics.generateTexture('tile_boss', size, size);
    graphics.destroy();
  }

  /**
   * Generate UI sprites
   */
  private generateUISprites(): void {
    // Health bar background
    let graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x222222, 1);
    graphics.fillRoundedRect(0, 0, 100, 12, 2);
    graphics.generateTexture('healthbar_bg', 100, 12);
    graphics.destroy();

    // Health bar fill
    graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x44aa44, 1);
    graphics.fillRoundedRect(0, 0, 100, 12, 2);
    graphics.generateTexture('healthbar_fill', 100, 12);
    graphics.destroy();

    // Mana bar fill
    graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x4444aa, 1);
    graphics.fillRoundedRect(0, 0, 100, 8, 2);
    graphics.generateTexture('manabar_fill', 100, 8);
    graphics.destroy();

    // Ability slot
    graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x333333, 1);
    graphics.fillRoundedRect(0, 0, 48, 48, 4);
    graphics.lineStyle(2, 0x666666, 1);
    graphics.strokeRoundedRect(0, 0, 48, 48, 4);
    graphics.generateTexture('ability_slot', 48, 48);
    graphics.destroy();

    // Cooldown overlay
    graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x000000, 0.7);
    graphics.fillRoundedRect(0, 0, 48, 48, 4);
    graphics.generateTexture('cooldown_overlay', 48, 48);
    graphics.destroy();

    // Minimap marker
    graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(4, 4, 4);
    graphics.generateTexture('minimap_player', 8, 8);
    graphics.destroy();

    // Room markers
    graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x666666, 1);
    graphics.fillRect(0, 0, 16, 16);
    graphics.generateTexture('minimap_room', 16, 16);
    graphics.destroy();

    graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x448844, 1);
    graphics.fillRect(0, 0, 16, 16);
    graphics.generateTexture('minimap_room_cleared', 16, 16);
    graphics.destroy();

    graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x884444, 1);
    graphics.fillRect(0, 0, 16, 16);
    graphics.generateTexture('minimap_room_boss', 16, 16);
    graphics.destroy();
  }

  /**
   * Generate ability icons
   */
  private generateAbilityIcons(): void {
    const size = 32;

    // Generic attack icon
    let graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0xcc4444, 1);
    graphics.fillTriangle(size / 2, 4, 4, size - 4, size - 4, size - 4);
    graphics.generateTexture('ability_damage', size, size);
    graphics.destroy();

    // Generic heal icon
    graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x44cc44, 1);
    graphics.fillRect(size / 2 - 3, 4, 6, size - 8);
    graphics.fillRect(4, size / 2 - 3, size - 8, 6);
    graphics.generateTexture('ability_heal', size, size);
    graphics.destroy();

    // Generic buff icon
    graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x44aacc, 1);
    graphics.fillTriangle(size / 2, 4, 4, size / 2, size - 4, size / 2);
    graphics.fillTriangle(size / 2, size / 2, 4, size - 4, size - 4, size - 4);
    graphics.generateTexture('ability_buff', size, size);
    graphics.destroy();

    // Generic debuff icon
    graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0xaa44cc, 1);
    graphics.fillCircle(size / 2, size / 2, size / 3);
    graphics.fillStyle(0x000000, 1);
    graphics.fillCircle(size / 2, size / 2, size / 6);
    graphics.generateTexture('ability_debuff', size, size);
    graphics.destroy();

    // Generic AoE icon
    graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0xccaa44, 1);
    graphics.fillCircle(size / 2, size / 2, size / 2 - 4);
    graphics.lineStyle(2, 0xffcc00, 1);
    graphics.strokeCircle(size / 2, size / 2, size / 3);
    graphics.generateTexture('ability_aoe', size, size);
    graphics.destroy();
  }

  /**
   * Generate buff-specific icons for the buff UI
   */
  private generateBuffIcons(): void {
    const size = 20; // Match the buff icon size in GameScene

    // Warrior - Bloodlust (red swirl/blood drop)
    let graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x880000, 1);
    graphics.fillCircle(size / 2, size / 2, size / 2 - 2);
    graphics.fillStyle(0xff2222, 1);
    graphics.fillTriangle(size / 2, 3, size / 2 - 4, size / 2 + 2, size / 2 + 4, size / 2 + 2);
    graphics.fillCircle(size / 2, size / 2 + 4, 3);
    graphics.generateTexture('buff_warrior_bloodlust', size, size);
    graphics.destroy();

    // Warrior - Retaliation (crossed swords)
    graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x884400, 1);
    graphics.fillCircle(size / 2, size / 2, size / 2 - 2);
    graphics.fillStyle(0xffaa00, 1);
    graphics.lineStyle(2, 0xffaa00, 1);
    graphics.lineBetween(4, 4, size - 4, size - 4);
    graphics.lineBetween(size - 4, 4, 4, size - 4);
    graphics.generateTexture('buff_warrior_retaliation', size, size);
    graphics.destroy();

    // Warrior - Shield Wall (shield icon)
    graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x666688, 1);
    graphics.fillCircle(size / 2, size / 2, size / 2 - 2);
    graphics.fillStyle(0xaaaacc, 1);
    graphics.fillRoundedRect(5, 3, size - 10, size - 6, 2);
    graphics.lineStyle(1, 0x888888, 1);
    graphics.lineBetween(size / 2, 5, size / 2, size - 5);
    graphics.generateTexture('buff_warrior_shieldwall', size, size);
    graphics.destroy();

    // Rogue - Stealth (shadow/eye)
    graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x222244, 1);
    graphics.fillCircle(size / 2, size / 2, size / 2 - 2);
    graphics.fillStyle(0x6666aa, 1);
    graphics.fillEllipse(size / 2, size / 2, size - 8, size / 2 - 2);
    graphics.fillStyle(0x222244, 1);
    graphics.fillCircle(size / 2, size / 2, 3);
    graphics.generateTexture('buff_rogue_stealth', size, size);
    graphics.destroy();

    // Rogue - Vanish (fading shadow)
    graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x333366, 1);
    graphics.fillCircle(size / 2, size / 2, size / 2 - 2);
    graphics.fillStyle(0x8888cc, 0.7);
    graphics.fillCircle(size / 2 - 2, size / 2 - 2, 4);
    graphics.fillStyle(0x8888cc, 0.4);
    graphics.fillCircle(size / 2 + 2, size / 2 + 2, 3);
    graphics.generateTexture('buff_rogue_vanish', size, size);
    graphics.destroy();

    // Rogue - Blade Flurry (spinning blades)
    graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x882244, 1);
    graphics.fillCircle(size / 2, size / 2, size / 2 - 2);
    graphics.fillStyle(0xff4488, 1);
    this.drawStar(graphics, size / 2, size / 2, 4, size / 2 - 3, size / 4 - 1);
    graphics.generateTexture('buff_rogue_bladeflurry', size, size);
    graphics.destroy();

    // Paladin - Retribution Aura (holy fire)
    graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0xaa6600, 1);
    graphics.fillCircle(size / 2, size / 2, size / 2 - 2);
    graphics.fillStyle(0xffdd44, 1);
    graphics.fillTriangle(size / 2, 3, size / 2 - 5, size - 4, size / 2 + 5, size - 4);
    graphics.fillStyle(0xffaa00, 1);
    graphics.fillTriangle(size / 2, 6, size / 2 - 3, size - 6, size / 2 + 3, size - 6);
    graphics.generateTexture('buff_paladin_retribution', size, size);
    graphics.destroy();

    // Paladin - Blessing of Protection (holy shield)
    graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x666666, 1);
    graphics.fillCircle(size / 2, size / 2, size / 2 - 2);
    graphics.fillStyle(0xffffcc, 1);
    graphics.fillRoundedRect(5, 4, size - 10, size - 8, 3);
    graphics.fillStyle(0xffdd88, 1);
    graphics.fillRect(size / 2 - 1, 6, 2, size - 12);
    graphics.fillRect(7, size / 2 - 1, size - 14, 2);
    graphics.generateTexture('buff_paladin_protection', size, size);
    graphics.destroy();

    // Shaman - Ancestral Spirit (spirit face)
    graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x0050aa, 1);
    graphics.fillCircle(size / 2, size / 2, size / 2 - 2);
    graphics.fillStyle(0x66ccff, 1);
    graphics.fillCircle(size / 2 - 3, size / 2 - 2, 2);
    graphics.fillCircle(size / 2 + 3, size / 2 - 2, 2);
    graphics.lineStyle(1, 0x66ccff, 1);
    graphics.beginPath();
    graphics.arc(size / 2, size / 2 + 3, 4, 0, Math.PI, false);
    graphics.strokePath();
    graphics.generateTexture('buff_shaman_ancestral', size, size);
    graphics.destroy();

    // Mage - Arcane Power (arcane swirl)
    graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x4466aa, 1);
    graphics.fillCircle(size / 2, size / 2, size / 2 - 2);
    graphics.fillStyle(0x88ccff, 1);
    this.drawStar(graphics, size / 2, size / 2, 6, size / 2 - 3, size / 4);
    graphics.generateTexture('buff_mage_arcanepower', size, size);
    graphics.destroy();

    // Warlock - Soulstone (purple gem)
    graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x442266, 1);
    graphics.fillCircle(size / 2, size / 2, size / 2 - 2);
    graphics.fillStyle(0x9966cc, 1);
    graphics.fillTriangle(size / 2, 3, 4, size / 2 + 2, size - 4, size / 2 + 2);
    graphics.fillTriangle(size / 2, size - 3, 4, size / 2 - 2, size - 4, size / 2 - 2);
    graphics.generateTexture('buff_warlock_soulstone', size, size);
    graphics.destroy();

    // Warlock - Demon Armor (demonic shield)
    graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x552244, 1);
    graphics.fillCircle(size / 2, size / 2, size / 2 - 2);
    graphics.fillStyle(0xaa4488, 1);
    graphics.fillTriangle(size / 2, 4, 4, size - 4, size - 4, size - 4);
    graphics.fillStyle(0x331122, 1);
    graphics.fillCircle(size / 2, size / 2 + 2, 3);
    graphics.generateTexture('buff_warlock_demonarmor', size, size);
    graphics.destroy();

    // Generic buff fallback (upward arrow)
    graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x228822, 1);
    graphics.fillCircle(size / 2, size / 2, size / 2 - 2);
    graphics.fillStyle(0x44ff44, 1);
    graphics.fillTriangle(size / 2, 3, 5, size / 2 + 2, size - 5, size / 2 + 2);
    graphics.fillRect(size / 2 - 2, size / 2, 4, size / 2 - 4);
    graphics.generateTexture('buff_generic', size, size);
    graphics.destroy();

    // Generic debuff fallback (downward arrow)
    graphics = this.scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x882222, 1);
    graphics.fillCircle(size / 2, size / 2, size / 2 - 2);
    graphics.fillStyle(0xff4444, 1);
    graphics.fillTriangle(size / 2, size - 3, 5, size / 2 - 2, size - 5, size / 2 - 2);
    graphics.fillRect(size / 2 - 2, 4, 4, size / 2 - 4);
    graphics.generateTexture('debuff_generic', size, size);
    graphics.destroy();
  }

  /**
   * Helper to draw a star shape
   */
  private drawStar(
    graphics: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    spikes: number,
    outerRadius: number,
    innerRadius: number
  ): void {
    const step = Math.PI / spikes;
    const points: { x: number; y: number }[] = [];

    for (let i = 0; i < spikes * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = i * step - Math.PI / 2;
      points.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius
      });
    }

    graphics.beginPath();
    graphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      graphics.lineTo(points[i].x, points[i].y);
    }
    graphics.closePath();
    graphics.fillPath();
  }
}
