import Phaser from 'phaser';
import { LootDrop, Rarity, Item, Potion, PotionType } from '@dungeon-link/shared';
import { RARITY_COLORS } from '@dungeon-link/shared';
import { wsClient } from '../network/WebSocketClient';
import { FONTS, COLORS, COLORS_HEX } from '../ui/theme';

/**
 * Loot Scene - displays loot after boss kill
 * Currently integrated into GameScene notifications for simplicity
 * Can be expanded to a full loot screen in the future
 */
// Static color mapping - defined once, reused across all calls
const RARITY_HEX_COLORS: Record<Rarity, string> = {
  [Rarity.Common]: '#9d9d9d',
  [Rarity.Uncommon]: '#1eff00',
  [Rarity.Rare]: '#0070dd',
  [Rarity.Epic]: '#a335ee',
  [Rarity.Legendary]: '#ff8000'
};

export class LootScene extends Phaser.Scene {
  private lootItems: LootDrop[] = [];

  constructor() {
    super({ key: 'LootScene' });
  }

  init(data: { loot: LootDrop[] }): void {
    this.lootItems = data.loot;
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Background
    this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0, 0);

    // Title
    this.add.text(width / 2, 50, 'LOOT!', {
      fontFamily: FONTS.title,
      fontSize: '42px',
      color: '#ffd700'
    }).setOrigin(0.5);

    // Display loot items
    const startY = 120;
    const itemHeight = 70;

    this.lootItems.forEach((drop, index) => {
      const y = startY + index * itemHeight;
      this.createLootItem(width / 2, y, drop);
    });

    // Continue button
    const continueBtn = this.add.text(width / 2, height - 80, 'Continue', {
      fontFamily: FONTS.title,
      fontSize: '22px',
      color: '#1a1a2e',
      backgroundColor: '#c9a227',
      padding: { x: 35, y: 15 }
    }).setOrigin(0.5);

    continueBtn.setInteractive({ useHandCursor: true });
    continueBtn.on('pointerdown', () => {
      this.scene.stop();
      this.scene.resume('GameScene');
    });
  }

  private createLootItem(x: number, y: number, drop: LootDrop): void {
    let title = '';
    let description = '';
    let color = '#ffffff';

    switch (drop.type) {
      case 'gold':
        title = `+${drop.goldAmount} Gold`;
        color = '#ffd700';
        break;

      case 'item':
        if (drop.item) {
          title = drop.item.name;
          description = this.getItemDescription(drop.item);
          color = this.getRarityHexColor(drop.item.rarity);
        }
        break;

      case 'potion':
        if (drop.potion) {
          title = drop.potion.name;
          const restoreType = drop.potion.type === PotionType.Health ? 'Health' : 'Mana';
          description = `Restores ${drop.potion.amount} ${restoreType}`;
          color = this.getRarityHexColor(drop.potion.rarity);
        }
        break;

      case 'ability':
        title = 'New Ability Learned!';
        description = drop.abilityId ?? '';
        color = '#ff00ff';
        break;

      case 'rerollToken':
        title = `+${drop.tokenCount} Reroll Token`;
        description = 'Use to reroll item stats';
        color = '#00ffff';
        break;
    }

    if (drop.wasConverted) {
      title += ' (Converted)';
    }

    // Item title
    this.add.text(x, y, title, {
      fontFamily: FONTS.title,
      fontSize: '18px',
      color
    }).setOrigin(0.5);

    // Item description
    if (description) {
      this.add.text(x, y + 24, description, {
        fontFamily: FONTS.body,
        fontSize: '13px',
        color: '#888899'
      }).setOrigin(0.5);
    }
  }

  private getItemDescription(item: Item): string {
    const stats = item.stats;
    const statParts: string[] = [];

    if (stats.health) statParts.push(`+${stats.health} HP`);
    if (stats.mana) statParts.push(`+${stats.mana} MP`);
    if (stats.attackPower) statParts.push(`+${stats.attackPower} ATK`);
    if (stats.spellPower) statParts.push(`+${stats.spellPower} SP`);
    if (stats.armor) statParts.push(`+${stats.armor} Armor`);
    if (stats.crit) statParts.push(`+${stats.crit}% Crit`);
    if (stats.haste) statParts.push(`+${stats.haste}% Haste`);
    if (stats.lifesteal) statParts.push(`+${stats.lifesteal}% LS`);
    if (stats.resist) statParts.push(`+${stats.resist} Resist`);

    return `${item.slot} - ${statParts.join(', ')}`;
  }

  private getRarityHexColor(rarity: Rarity): string {
    return RARITY_HEX_COLORS[rarity];
  }
}
