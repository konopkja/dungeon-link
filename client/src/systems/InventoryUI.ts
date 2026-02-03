import Phaser from 'phaser';
import { EquipSlot, Item, Rarity, Potion, PotionType, SetType, Equipment } from '@dungeon-link/shared';
import { RARITY_COLORS } from '@dungeon-link/shared';
import { wsClient } from '../network/WebSocketClient';
import { FONTS, COLORS, COLORS_HEX, PANEL, BUTTON, createTooltipBg, drawCornerDecorations, createCloseButton } from '../ui/theme';

// Set definitions for client display
const SET_NAMES: Record<string, string> = {
  'set_archmage': "Archmage's Regalia",
  'set_bladestorm': 'Bladestorm Battlegear',
  'set_bulwark': 'Bulwark of the Fortress'
};

const SET_BONUSES: Record<string, { pieces: number; desc: string }[]> = {
  'set_archmage': [
    { pieces: 2, desc: '(2) +15 Spell, +30 Mana' },
    { pieces: 3, desc: '(3) +8% Crit, +5% Haste' },
    { pieces: 4, desc: '(4) Arcane Barrier: Crits shield' },
    { pieces: 5, desc: '(5) Critical Mass: Crit resets CD' }
  ],
  'set_bladestorm': [
    { pieces: 2, desc: '(2) +15 Attack, +5% Crit' },
    { pieces: 3, desc: '(3) +10% Haste, +3% Life' },
    { pieces: 4, desc: '(4) Bloodthirst: Kills +Atk Spd' },
    { pieces: 5, desc: '(5) +45 Atk, +12% Crit, +5% Life' }
  ],
  'set_bulwark': [
    { pieces: 2, desc: '(2) +20 Armor, +50 HP' },
    { pieces: 3, desc: '(3) +10 Resist, +30 HP' },
    { pieces: 4, desc: '(4) Vengeance: Hits +3% Dmg' },
    { pieces: 5, desc: '(5) Thorns: Reflect 20% Dmg' }
  ]
};

// Static color mapping
const RARITY_HEX_COLORS: Record<Rarity, string> = {
  [Rarity.Common]: '#cccccc',
  [Rarity.Uncommon]: '#1eff00',
  [Rarity.Rare]: '#4499ff',
  [Rarity.Epic]: '#cc66ff',
  [Rarity.Legendary]: '#ff8800'
};

const RARITY_MULTIPLIERS: Record<Rarity, number> = {
  [Rarity.Common]: 1.0,
  [Rarity.Uncommon]: 1.2,
  [Rarity.Rare]: 1.5,
  [Rarity.Epic]: 1.8,
  [Rarity.Legendary]: 2.2
};

function countSetPieces(equipment: Equipment): Map<string, number> {
  const counts = new Map<string, number>();
  for (const slot of Object.values(EquipSlot)) {
    const item = equipment[slot];
    if (item?.setId) {
      counts.set(item.setId, (counts.get(item.setId) ?? 0) + 1);
    }
  }
  return counts;
}

function calculateItemLevel(item: Item): number {
  const stats = item.stats;
  let totalValue = 0;
  if (stats.health) totalValue += stats.health * 0.3;
  if (stats.mana) totalValue += stats.mana * 0.2;
  if (stats.attackPower) totalValue += stats.attackPower * 1.5;
  if (stats.spellPower) totalValue += stats.spellPower * 1.5;
  if (stats.armor) totalValue += stats.armor * 1.0;
  if (stats.crit) totalValue += stats.crit * 2.0;
  if (stats.haste) totalValue += stats.haste * 2.0;
  if (stats.lifesteal) totalValue += stats.lifesteal * 3.0;
  if (stats.resist) totalValue += stats.resist * 1.0;
  const floorBonus = item.floorDropped * 5;
  const rarityMult = RARITY_MULTIPLIERS[item.rarity] ?? 1.0;
  return Math.max(1, Math.floor((totalValue * rarityMult + floorBonus) / 2));
}

export class InventoryUI {
  private scene: Phaser.Scene;
  private visible: boolean = false;
  private allElements: Phaser.GameObjects.GameObject[] = [];

  private slotSprites: Map<EquipSlot, Phaser.GameObjects.Rectangle> = new Map();
  private slotIcons: Map<EquipSlot, Phaser.GameObjects.Text> = new Map();
  private slotTexts: Map<EquipSlot, Phaser.GameObjects.Text> = new Map();
  private statText: Phaser.GameObjects.Text | null = null;
  private setBonusText: Phaser.GameObjects.Text | null = null;

  private backpackSlots: Phaser.GameObjects.Rectangle[] = [];
  private backpackItems: Phaser.GameObjects.Text[] = [];

  private tooltip: Phaser.GameObjects.Container | null = null;
  private tooltipBg: Phaser.GameObjects.Rectangle | null = null;
  private tooltipText: Phaser.GameObjects.Text | null = null;

  // Collapsible set bonuses - rendered directly on scene, NOT in container
  // (Phaser has issues with interactive elements inside containers - see BUG_FIXES_2026_02.md section 5)
  private expandedSetId: string | null = null;
  private setBonusElements: Phaser.GameObjects.GameObject[] = []; // Dynamic elements created each update
  private bonusPanelX: number = 0;
  private bonusPanelY: number = 0;
  private bonusPanelW: number = 0;

  private readonly DEPTH = 1000;
  private cachedEquipmentIds: Map<EquipSlot, string | null> = new Map();
  private cachedStatsText: string = '';
  private cachedBackpackIds: string[] = [];
  private cachedSetCounts: Map<string, number> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.createUI();
  }

  private addElement<T extends Phaser.GameObjects.GameObject>(element: T): T {
    this.allElements.push(element);
    if ('setScrollFactor' in element) (element as any).setScrollFactor(0);
    if ('setDepth' in element) (element as any).setDepth(this.DEPTH);
    if ('setVisible' in element) (element as any).setVisible(false);
    return element;
  }

  private createUI(): void {
    const screenW = this.scene.cameras.main.width;
    const screenH = this.scene.cameras.main.height;

    // Modal dimensions - larger to accommodate 14px+ fonts
    const width = 820;
    const height = 620;
    const x = screenW / 2 - width / 2;
    const y = screenH / 2 - height / 2;
    const padding = 20;

    // Main background
    const bg = this.addElement(this.scene.add.rectangle(x + width / 2, y + height / 2, width, height, 0x0a0a14, 0.97));
    bg.setStrokeStyle(3, 0x3d3d5c);

    const innerBg = this.addElement(this.scene.add.rectangle(x + width / 2, y + height / 2, width - 6, height - 6, 0x12121f, 0.95));
    innerBg.setStrokeStyle(1, 0x2a2a4a);

    // Gold corners
    const cornerGraphics = this.addElement(this.scene.add.graphics());
    cornerGraphics.setPosition(x + width / 2, y + height / 2);
    drawCornerDecorations(cornerGraphics, width, height);

    // Title - 24px
    const title = this.addElement(this.scene.add.text(x + width / 2, y + 28, 'CHARACTER', {
      fontFamily: FONTS.title,
      fontSize: '24px',
      color: '#ffd700',
      stroke: '#000000',
      strokeThickness: 3
    }));
    title.setOrigin(0.5, 0.5);

    // Title underline
    const titleLine = this.addElement(this.scene.add.graphics());
    titleLine.lineStyle(2, 0xc9a227, 0.8);
    titleLine.lineBetween(x + 150, y + 50, x + width - 150, y + 50);

    // ===== TOP SECTION: Equipment + Stats + Bonuses =====
    const topY = y + 65;
    const topH = 310;

    // --- LEFT: Equipment (Item Doll) ---
    const equipW = 300;
    const equipX = x + padding;

    const equipPanel = this.addElement(this.scene.add.rectangle(
      equipX + equipW / 2, topY + topH / 2, equipW, topH, 0x1a1a2e, 0.8
    ));
    equipPanel.setStrokeStyle(1, 0x3d3d5c);

    const equipHeader = this.addElement(this.scene.add.text(equipX + equipW / 2, topY + 18, '⚔️ EQUIPMENT', {
      fontFamily: FONTS.title, fontSize: '16px', color: '#c9a227',
      stroke: '#000000', strokeThickness: 2
    }));
    equipHeader.setOrigin(0.5, 0.5);

    // Equipment slots with proper spacing for larger fonts
    const slotSize = 44;
    const slotGapV = 70; // Vertical gap between rows
    const slotGapH = 80; // Horizontal gap
    const dollCenterX = equipX + equipW / 2;
    const dollStartY = topY + 55;

    // Slot positions: 4 rows
    const slotPositions: { slot: EquipSlot; col: number; row: number; label: string }[] = [
      { slot: EquipSlot.Head, col: 0, row: 0, label: 'Head' },
      { slot: EquipSlot.Weapon, col: -1, row: 1, label: 'Weapon' },
      { slot: EquipSlot.Chest, col: 0, row: 1, label: 'Chest' },
      { slot: EquipSlot.Hands, col: 1, row: 1, label: 'Hands' },
      { slot: EquipSlot.Ring, col: -1, row: 2, label: 'Ring' },
      { slot: EquipSlot.Legs, col: 0, row: 2, label: 'Legs' },
      { slot: EquipSlot.Trinket, col: 1, row: 2, label: 'Trinket' },
      { slot: EquipSlot.Feet, col: 0, row: 3, label: 'Feet' },
    ];

    for (const { slot, col, row, label } of slotPositions) {
      const sx = dollCenterX + col * slotGapH;
      const sy = dollStartY + row * slotGapV;

      // Slot container
      const slotRect = this.addElement(this.scene.add.rectangle(sx, sy, slotSize, slotSize, 0x1a1a2e));
      slotRect.setStrokeStyle(2, 0x3d3d5c);
      slotRect.setInteractive({ useHandCursor: true });

      // Slot icon (emoji-based) - 22px
      const slotIcons: Record<string, string> = {
        'Head': '👑', 'Chest': '🎽', 'Hands': '🧤', 'Weapon': '⚔',
        'Legs': '👖', 'Feet': '👢', 'Ring': '💍', 'Trinket': '📿'
      };
      const iconText = this.addElement(this.scene.add.text(sx, sy, slotIcons[label] || '?', {
        fontFamily: FONTS.body, fontSize: '22px', color: '#555566',
        stroke: '#000000', strokeThickness: 2
      }));
      iconText.setOrigin(0.5, 0.5);

      // Label below slot - 14px minimum
      const labelText = this.addElement(this.scene.add.text(sx, sy + slotSize / 2 + 10, label, {
        fontFamily: FONTS.body, fontSize: '14px', color: '#666688',
        stroke: '#000000', strokeThickness: 1
      }));
      labelText.setOrigin(0.5, 0);

      // Hover/click events
      const slotType = slot;
      slotRect.on('pointerover', () => {
        slotRect.setStrokeStyle(2, 0xffd700);
        this.showEquipmentTooltip(slotType, sx, sy - slotSize / 2 - 10);
      });
      slotRect.on('pointerout', () => {
        const item = wsClient.getCurrentPlayer()?.equipment[slotType];
        slotRect.setStrokeStyle(2, item ? this.getRarityGlowColor(item.rarity) : 0x3d3d5c);
        this.hideTooltip();
      });
      slotRect.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (pointer.leftButtonDown()) this.onEquipmentSlotClick(slotType);
      });

      this.slotSprites.set(slot, slotRect);
      this.slotIcons.set(slot, iconText);
      this.slotTexts.set(slot, labelText);
    }

    // --- CENTER: Stats ---
    const statsW = 220;
    const statsX = equipX + equipW + 10;

    const statsPanel = this.addElement(this.scene.add.rectangle(
      statsX + statsW / 2, topY + topH / 2, statsW, topH, 0x1a1a2e, 0.8
    ));
    statsPanel.setStrokeStyle(1, 0x3d3d5c);

    const statsHeader = this.addElement(this.scene.add.text(statsX + statsW / 2, topY + 18, '📊 STATS', {
      fontFamily: FONTS.title, fontSize: '16px', color: '#c9a227',
      stroke: '#000000', strokeThickness: 2
    }));
    statsHeader.setOrigin(0.5, 0.5);

    // Stats text - 14px
    this.statText = this.addElement(this.scene.add.text(statsX + 15, topY + 45, '', {
      fontFamily: FONTS.body, fontSize: '14px', color: '#aaaacc', lineSpacing: 6,
      stroke: '#000000', strokeThickness: 1
    }));

    // --- RIGHT: Bonuses ---
    const bonusW = width - equipW - statsW - padding * 2 - 20;
    const bonusX = statsX + statsW + 10;

    const bonusPanel = this.addElement(this.scene.add.rectangle(
      bonusX + bonusW / 2, topY + topH / 2, bonusW, topH, 0x1a1a2e, 0.8
    ));
    bonusPanel.setStrokeStyle(1, 0x3d3d5c);

    const bonusHeader = this.addElement(this.scene.add.text(bonusX + bonusW / 2, topY + 18, '✨ BONUSES', {
      fontFamily: FONTS.title, fontSize: '16px', color: '#c9a227',
      stroke: '#000000', strokeThickness: 2
    }));
    bonusHeader.setOrigin(0.5, 0.5);

    // Store bonus panel coordinates for dynamic set display
    this.bonusPanelX = bonusX;
    this.bonusPanelY = topY + 45;
    this.bonusPanelW = bonusW;

    // Placeholder text for when no sets are equipped
    this.setBonusText = this.addElement(this.scene.add.text(bonusX + 12, topY + 45, '', {
      fontFamily: FONTS.body, fontSize: '14px', color: '#88cc88', lineSpacing: 4,
      wordWrap: { width: bonusW - 24 },
      stroke: '#000000', strokeThickness: 1
    }));

    // ===== BOTTOM: Full-width Backpack =====
    const bpY = topY + topH + 12;
    const bpH = height - (bpY - y) - 45;
    const bpW = width - padding * 2;

    const bpPanel = this.addElement(this.scene.add.rectangle(
      x + width / 2, bpY + bpH / 2, bpW, bpH, 0x1a1a2e, 0.8
    ));
    bpPanel.setStrokeStyle(1, 0x3d3d5c);

    const bpHeader = this.addElement(this.scene.add.text(x + width / 2, bpY + 14, '🎒 BACKPACK', {
      fontFamily: FONTS.title, fontSize: '16px', color: '#c9a227',
      stroke: '#000000', strokeThickness: 2
    }));
    bpHeader.setOrigin(0.5, 0.5);

    // Backpack grid: 10 columns x 2 rows = 20 slots (full width)
    const bpSlotSize = 55;
    const bpGap = 8;
    const cols = 10;
    const rows = 2;
    const gridWidth = cols * bpSlotSize + (cols - 1) * bpGap;
    const bpStartX = x + (width - gridWidth) / 2;
    const bpStartY = bpY + 35;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const slotX = bpStartX + col * (bpSlotSize + bpGap) + bpSlotSize / 2;
        const slotY = bpStartY + row * (bpSlotSize + bpGap) + bpSlotSize / 2;
        const index = row * cols + col;

        const slotBorder = this.addElement(this.scene.add.rectangle(slotX, slotY, bpSlotSize + 2, bpSlotSize + 2, 0x2a2a4a));
        const slot = this.addElement(this.scene.add.rectangle(slotX, slotY, bpSlotSize, bpSlotSize, 0x1a1a2e));
        slot.setStrokeStyle(1, 0x3d3d5c);
        slot.setInteractive({ useHandCursor: true });

        const slotIndex = index;
        slot.on('pointerover', () => {
          slot.setStrokeStyle(2, 0xffd700);
          this.showBackpackTooltip(slotIndex, slotX, slotY - bpSlotSize / 2 - 10);
        });
        slot.on('pointerout', () => {
          slot.setStrokeStyle(1, 0x3d3d5c);
          this.hideTooltip();
        });
        slot.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
          if (pointer.leftButtonDown()) this.onBackpackSlotClick(slotIndex);
        });

        this.backpackSlots.push(slot);
        (slot as any).slotBorder = slotBorder;

        // Item icons - 18px
        const itemText = this.addElement(this.scene.add.text(slotX, slotY, '', {
          fontFamily: FONTS.title, fontSize: '18px', color: '#ffffff',
          stroke: '#000000', strokeThickness: 2
        }));
        itemText.setOrigin(0.5, 0.5);
        this.backpackItems.push(itemText);
      }
    }

    // Instructions - 14px
    const instructions = this.addElement(this.scene.add.text(x + width / 2, y + height - 18, 'Click items to equip/use  |  Press I or ESC to close', {
      fontFamily: FONTS.body, fontSize: '14px', color: '#666688',
      stroke: '#000000', strokeThickness: 1
    }));
    instructions.setOrigin(0.5, 0.5);

    // Close button - styled consistently
    const closeBtnX = x + width - 22;
    const closeBtnY = y + 22;
    const closeBtnBg = this.addElement(this.scene.add.rectangle(closeBtnX, closeBtnY, 30, 30, 0x3d3d5c, 0.9));
    closeBtnBg.setStrokeStyle(1, 0x5a5a7a);
    closeBtnBg.setInteractive({ useHandCursor: true });
    closeBtnBg.on('pointerover', () => {
      closeBtnBg.setFillStyle(0x884444);
      closeBtnText.setColor('#ffffff');
    });
    closeBtnBg.on('pointerout', () => {
      closeBtnBg.setFillStyle(0x3d3d5c);
      closeBtnText.setColor('#aaaaaa');
    });
    closeBtnBg.on('pointerdown', () => this.hide());

    const closeBtnText = this.addElement(this.scene.add.text(closeBtnX, closeBtnY - 1, '×', {
      fontFamily: FONTS.body, fontSize: '22px', color: '#aaaaaa',
      stroke: '#000000', strokeThickness: 1
    }));
    closeBtnText.setOrigin(0.5, 0.5);

    // Tooltip - 14px text
    this.tooltip = this.scene.add.container(0, 0);
    this.tooltip.setDepth(2000);
    this.tooltip.setScrollFactor(0);
    this.tooltip.setVisible(false);

    const { outer: tooltipBgOuter, inner: tooltipBgInner } = createTooltipBg(this.scene, 280, 180);
    this.tooltipBg = tooltipBgInner;
    this.tooltipText = this.scene.add.text(0, -12, '', {
      fontFamily: FONTS.body, fontSize: '14px', color: COLORS_HEX.textPrimary,
      wordWrap: { width: 260 }, lineSpacing: 4, stroke: '#000000', strokeThickness: 2
    }).setOrigin(0.5, 1);
    this.tooltip.add([tooltipBgOuter, this.tooltipBg, this.tooltipText]);

    this.scene.input.keyboard?.on('keydown-ESC', () => {
      if (this.visible) this.hide();
    });
  }

  private onBackpackSlotClick(index: number): void {
    const player = wsClient.getCurrentPlayer();
    if (!player || !player.backpack || index >= player.backpack.length) return;
    const item = player.backpack[index];
    if (!item) return;

    if ('amount' in item && 'type' in item) {
      const potionType = (item as Potion).type;
      if (potionType === 'health' || potionType === 'mana' ||
          potionType === PotionType.Health || potionType === PotionType.Mana) {
        wsClient.useItem(item.id);
        return;
      }
    }
    if ('slot' in item && 'stats' in item) {
      wsClient.swapEquipment(index, (item as Item).slot);
    }
  }

  private onEquipmentSlotClick(slot: EquipSlot): void {
    const player = wsClient.getCurrentPlayer();
    if (!player) return;
    const item = player.equipment[slot];
    if (item) wsClient.unequipItem(slot);
  }

  private showEquipmentTooltip(slot: EquipSlot, x: number, y: number): void {
    const player = wsClient.getCurrentPlayer();
    if (!player) return;
    const item = player.equipment[slot];
    if (!item) {
      if (this.tooltipText) {
        this.tooltipText.setText(`${slot}\n\nEmpty slot`);
        this.tooltipText.setColor('#666666');
        this.resizeTooltip();
      }
      const clamped = this.clampTooltipPosition(x, y);
      this.tooltip?.setPosition(clamped.x, clamped.y);
      this.tooltip?.setVisible(true);
      return;
    }
    this.showItemTooltip(item, x, y, true);
  }

  private showBackpackTooltip(index: number, x: number, y: number): void {
    const player = wsClient.getCurrentPlayer();
    if (!player || index >= player.backpack.length) {
      this.hideTooltip();
      return;
    }
    const item = player.backpack[index];

    if ('amount' in item && 'type' in item) {
      const potion = item as Potion;
      const isHealth = potion.type === PotionType.Health;
      const text = `${potion.name}\n[${potion.rarity}]\n\nRestores ${potion.amount} ${isHealth ? 'Health' : 'Mana'}\n\nClick to use`;
      if (this.tooltipText) {
        this.tooltipText.setText(text);
        this.tooltipText.setColor(this.getRarityHexColor(potion.rarity));
        this.resizeTooltip();
      }
      const clamped = this.clampTooltipPosition(x, y);
      this.tooltip?.setPosition(clamped.x, clamped.y);
      this.tooltip?.setVisible(true);
    } else if ('slot' in item && 'stats' in item) {
      this.showItemTooltip(item as Item, x, y, false);
    }
  }

  private showItemTooltip(item: Item, x: number, y: number, isEquipped: boolean = false): void {
    const stats = item.stats;
    const player = wsClient.getCurrentPlayer();
    const equippedItem = !isEquipped && player ? player.equipment[item.slot] : null;

    const statLines: string[] = [];
    const statKeys: { key: keyof typeof stats; label: string; suffix: string }[] = [
      { key: 'health', label: 'Health', suffix: '' },
      { key: 'mana', label: 'Mana', suffix: '' },
      { key: 'attackPower', label: 'Attack', suffix: '' },
      { key: 'spellPower', label: 'Spell', suffix: '' },
      { key: 'armor', label: 'Armor', suffix: '' },
      { key: 'crit', label: 'Crit', suffix: '%' },
      { key: 'haste', label: 'Haste', suffix: '%' },
      { key: 'lifesteal', label: 'Lifesteal', suffix: '%' },
      { key: 'resist', label: 'Resist', suffix: '' },
    ];

    for (const { key, label, suffix } of statKeys) {
      const value = stats[key];
      if (value) {
        let line = `+${value}${suffix} ${label}`;
        if (equippedItem?.stats) {
          const diff = value - (equippedItem.stats[key] ?? 0);
          if (diff > 0) line += ` (+${diff})`;
          else if (diff < 0) line += ` (${diff})`;
        }
        statLines.push(line);
      }
    }

    if (equippedItem?.stats) {
      for (const { key, label, suffix } of statKeys) {
        const thisValue = stats[key] ?? 0;
        const equippedValue = equippedItem.stats[key] ?? 0;
        if (equippedValue > 0 && thisValue === 0) {
          statLines.push(`-${equippedValue}${suffix} ${label}`);
        }
      }
    }

    const itemLevel = calculateItemLevel(item);
    const equippedItemLevel = equippedItem ? calculateItemLevel(equippedItem) : 0;
    const iLvlDiff = equippedItem ? itemLevel - equippedItemLevel : 0;
    let iLvlText = `[iLvl ${itemLevel}]`;
    if (iLvlDiff !== 0) iLvlText += iLvlDiff > 0 ? ` (+${iLvlDiff})` : ` (${iLvlDiff})`;

    let setInfo = '';
    if (item.setId) {
      const setName = SET_NAMES[item.setId] ?? item.setId;
      const setCounts = player ? countSetPieces(player.equipment) : new Map();
      const currentPieces = setCounts.get(item.setId) ?? 0;
      setInfo = `\n[Set: ${setName}] (${currentPieces}/5)`;
    }

    let comparisonSummary = '';
    if (equippedItem && !isEquipped) {
      comparisonSummary = iLvlDiff > 0 ? '\n>>> UPGRADE <<<' : (iLvlDiff < 0 ? '\n<<< DOWNGRADE >>>' : '\n--- SIDEGRADE ---');
    }

    const clickHint = isEquipped ? 'Click to unequip' : 'Click to equip';
    const text = `${item.name}  ${iLvlText}\n[${item.slot}] ${item.rarity}${setInfo}\n\n${statLines.join('\n')}${comparisonSummary}\n\n${clickHint}`;

    if (this.tooltipText) {
      this.tooltipText.setText(text);
      let textColor = item.setId ? '#00ff88' : this.getRarityHexColor(item.rarity);
      if (!isEquipped && equippedItem) {
        if (iLvlDiff > 0) textColor = '#44ff44';
        else if (iLvlDiff < 0) textColor = '#ff6666';
      }
      this.tooltipText.setColor(textColor);
      this.resizeTooltip();
    }
    const clamped = this.clampTooltipPosition(x, y);
    this.tooltip?.setPosition(clamped.x, clamped.y);
    this.tooltip?.setVisible(true);
  }

  private resizeTooltip(): void {
    if (!this.tooltipText || !this.tooltipBg || !this.tooltip) return;
    const padding = 18;
    const width = Math.max(200, this.tooltipText.width + padding * 2);
    const height = this.tooltipText.height + padding * 2;
    this.tooltipBg.setSize(width, height);
    const outer = this.tooltip.getByName('tooltipBgOuter') as Phaser.GameObjects.Rectangle;
    if (outer) outer.setSize(width + 4, height + 4);
  }

  private clampTooltipPosition(x: number, y: number): { x: number; y: number } {
    if (!this.tooltipBg) return { x, y };
    const vw = this.scene.cameras.main.width;
    const vh = this.scene.cameras.main.height;
    const tw = this.tooltipBg.width;
    const th = this.tooltipBg.height;
    let cx = x, cy = y;
    const hw = tw / 2, margin = 10;
    if (cx - hw < margin) cx = hw + margin;
    if (cx + hw > vw - margin) cx = vw - hw - margin;
    if (cy - th < margin) cy = th + margin + 30;
    if (cy > vh - margin) cy = vh - margin;
    return { x: cx, y: cy };
  }

  private hideTooltip(): void {
    this.tooltip?.setVisible(false);
  }

  update(): void {
    const player = wsClient.getCurrentPlayer();
    if (!player) return;

    // Update equipment slots
    for (const slot of Object.values(EquipSlot)) {
      const item = player.equipment[slot];
      const currentId = item?.id ?? null;
      if (currentId === this.cachedEquipmentIds.get(slot)) continue;
      this.cachedEquipmentIds.set(slot, currentId);

      const slotRect = this.slotSprites.get(slot);
      const iconText = this.slotIcons.get(slot);
      const labelText = this.slotTexts.get(slot);

      if (slotRect && iconText && labelText) {
        if (item) {
          // Fill entire slot with rarity color
          slotRect.setFillStyle(this.getRarityFillColor(item.rarity));
          slotRect.setStrokeStyle(2, this.getRarityGlowColor(item.rarity));
          // Update icon to show equipped state
          iconText.setColor('#ffffff');
          iconText.setAlpha(1);
          // Update label with item name (truncated)
          const shortName = item.name.length > 10 ? item.name.substring(0, 9) + '..' : item.name;
          labelText.setText(shortName);
          labelText.setColor(this.getRarityHexColor(item.rarity));
        } else {
          slotRect.setFillStyle(0x1a1a2e);
          slotRect.setStrokeStyle(2, 0x3d3d5c);
          iconText.setColor('#555566');
          iconText.setAlpha(0.7);
          labelText.setText(slot);
          labelText.setColor('#666688');
        }
      }
    }

    // Update stats - 14px readable format
    const stats = player.stats;
    const statLines = [
      `HP: ${Math.ceil(stats.health)}/${stats.maxHealth}`,
      `MP: ${Math.ceil(stats.mana)}/${stats.maxMana}`,
      ``,
      `Attack: ${stats.attackPower}`,
      `Spell: ${stats.spellPower}`,
      `Armor: ${stats.armor}`,
      ``,
      `Crit: ${stats.crit}%`,
      `Haste: ${stats.haste}%`,
      `Lifesteal: ${stats.lifesteal}%`,
      `Resist: ${stats.resist}`,
      ``,
      `Gold: ${player.gold}`
    ];

    const newStatsText = statLines.join('\n');
    if (this.statText && newStatsText !== this.cachedStatsText) {
      this.cachedStatsText = newStatsText;
      this.statText.setText(newStatsText);
    }

    // Update set bonuses - collapsible system
    // PERF: Only update when equipment actually changes, not every frame
    const setCounts = countSetPieces(player.equipment);
    // Check if equipment changed by comparing IDs
    let equipmentChanged = false;
    for (const [slot, item] of Object.entries(player.equipment)) {
      const cachedId = this.cachedEquipmentIds.get(slot as EquipSlot);
      const currentId = item?.id ?? null;
      if (cachedId !== currentId) {
        equipmentChanged = true;
        break;
      }
    }
    if (equipmentChanged) {
      this.updateCollapsibleSetBonuses(setCounts);
    }

    // Update backpack
    for (let i = 0; i < this.backpackSlots.length; i++) {
      const slot = this.backpackSlots[i];
      const itemText = this.backpackItems[i];
      const border = (slot as any)?.slotBorder as Phaser.GameObjects.Rectangle;
      const item = i < player.backpack.length ? player.backpack[i] : null;
      const currentId = item?.id ?? '';
      if (currentId === (this.cachedBackpackIds[i] ?? '')) continue;
      this.cachedBackpackIds[i] = currentId;

      if (item) {
        if ('amount' in item && 'type' in item) {
          const potion = item as Potion;
          const isHealth = potion.type === PotionType.Health;
          slot.setFillStyle(isHealth ? 0x442222 : 0x222244);
          if (border) border.setFillStyle(isHealth ? 0x663333 : 0x333366);
          itemText.setText(isHealth ? '♥' : '✦');
          itemText.setFontSize('24px');
          itemText.setColor(isHealth ? '#ff6666' : '#6666ff');
        } else if ('slot' in item && 'stats' in item) {
          const equipItem = item as Item;
          slot.setFillStyle(this.getRarityBgColor(equipItem.rarity));
          if (border) border.setFillStyle(this.getRarityBorderColor(equipItem.rarity));
          const icons: Record<string, string> = {
            'Head': '👑', 'Chest': '🎽', 'Hands': '🧤', 'Weapon': '⚔',
            'Legs': '👖', 'Feet': '👢', 'Ring': '💍', 'Trinket': '📿'
          };
          itemText.setText(icons[equipItem.slot] || equipItem.slot.charAt(0));
          itemText.setFontSize('22px');
          itemText.setColor('#ffffff');
        }
      } else {
        slot.setFillStyle(0x1a1a2e);
        if (border) border.setFillStyle(0x2a2a4a);
        itemText.setText('');
      }
    }
  }

  private updateCollapsibleSetBonuses(setCounts: Map<string, number>): void {
    // CRITICAL: Render interactive elements DIRECTLY on scene, NOT in a container
    // Phaser has issues with interactive elements inside containers - hit areas may be offset
    // See BUG_FIXES_2026_02.md section 5 "UI Tooltip System - Common Pitfalls"

    // PERF: Only update if set counts actually changed (this runs every frame!)
    let setsChanged = setCounts.size !== this.cachedSetCounts.size;
    if (!setsChanged) {
      for (const [setId, count] of setCounts) {
        if (this.cachedSetCounts.get(setId) !== count) {
          setsChanged = true;
          break;
        }
      }
    }
    if (!setsChanged && this.setBonusElements.length > 0) {
      return; // No change, skip expensive rebuild
    }

    // Update cache
    this.cachedSetCounts = new Map(setCounts);

    // Clear old dynamic elements (destroy them completely)
    for (const el of this.setBonusElements) {
      el.destroy();
    }
    this.setBonusElements = [];

    // Show placeholder text if no sets
    if (setCounts.size === 0) {
      if (this.setBonusText) {
        this.setBonusText.setText('No set bonuses\n\nCollect matching\nset pieces for\nbonuses!');
        this.setBonusText.setVisible(this.visible);
      }
      return;
    }

    // Hide placeholder when sets exist
    if (this.setBonusText) {
      this.setBonusText.setVisible(false);
    }

    // Auto-expand first set if nothing is expanded or current expansion is invalid
    if (this.expandedSetId === null || !setCounts.has(this.expandedSetId)) {
      this.expandedSetId = setCounts.keys().next().value ?? null;
    }

    let yOffset = 0;
    const lineHeight = 20;
    const headerHeight = 28;
    const padding = 8;

    for (const [setId, count] of setCounts) {
      const isExpanded = this.expandedSetId === setId;
      const setName = SET_NAMES[setId] ?? setId;

      // Create clickable header background - DIRECTLY ON SCENE
      const headerBg = this.scene.add.rectangle(
        this.bonusPanelX + this.bonusPanelW / 2,
        this.bonusPanelY + yOffset + headerHeight / 2,
        this.bonusPanelW - 16,
        headerHeight,
        isExpanded ? 0x2a3a2a : 0x1a2a1a,
        0.9
      );
      headerBg.setStrokeStyle(1, isExpanded ? 0x4a6a4a : 0x3a4a3a);
      headerBg.setScrollFactor(0);
      headerBg.setDepth(this.DEPTH + 1); // Above panel background
      headerBg.setVisible(this.visible);
      headerBg.setInteractive({ useHandCursor: true });
      this.setBonusElements.push(headerBg);

      // Header text
      const arrow = isExpanded ? '▼' : '▶';
      const headerText = this.scene.add.text(
        this.bonusPanelX + 16,
        this.bonusPanelY + yOffset + headerHeight / 2,
        `${arrow} ${setName} (${count}/5)`,
        {
          fontFamily: FONTS.body,
          fontSize: '14px',
          color: isExpanded ? '#88ff88' : '#66cc66',
          stroke: '#000000',
          strokeThickness: 1
        }
      );
      headerText.setOrigin(0, 0.5);
      headerText.setScrollFactor(0);
      headerText.setDepth(this.DEPTH + 2); // Above header bg
      headerText.setVisible(this.visible);
      this.setBonusElements.push(headerText);

      // Click handler - capture variables for closure
      const currentSetId = setId;
      const capturedHeaderBg = headerBg;
      const capturedHeaderText = headerText;

      headerBg.on('pointerover', () => {
        capturedHeaderBg.setFillStyle(0x3a4a3a);
        capturedHeaderText.setColor('#aaffaa');
      });
      headerBg.on('pointerout', () => {
        const expanded = this.expandedSetId === currentSetId;
        capturedHeaderBg.setFillStyle(expanded ? 0x2a3a2a : 0x1a2a1a);
        capturedHeaderText.setColor(expanded ? '#88ff88' : '#66cc66');
      });
      headerBg.on('pointerdown', () => {
        this.toggleSetExpansion(currentSetId);
      });

      yOffset += headerHeight + 4;

      // Show bonuses if expanded
      if (isExpanded) {
        const bonuses = SET_BONUSES[setId];
        if (bonuses) {
          for (const bonus of bonuses) {
            const isActive = count >= bonus.pieces;
            const symbol = isActive ? '✓' : '○';
            const bonusText = this.scene.add.text(
              this.bonusPanelX + 20,
              this.bonusPanelY + yOffset,
              `${symbol} ${bonus.desc}`,
              {
                fontFamily: FONTS.body,
                fontSize: '13px',
                color: isActive ? '#88cc88' : '#556655',
                stroke: '#000000',
                strokeThickness: 1,
                wordWrap: { width: this.bonusPanelW - 40 }
              }
            );
            bonusText.setScrollFactor(0);
            bonusText.setDepth(this.DEPTH + 1);
            bonusText.setVisible(this.visible);
            this.setBonusElements.push(bonusText);
            yOffset += lineHeight;
          }
        }
        yOffset += padding;
      }
    }
  }

  private toggleSetExpansion(setId: string): void {
    // Toggle: if already expanded, collapse it; otherwise expand it
    if (this.expandedSetId === setId) {
      // Keep it expanded (at least one should be expanded)
      // Or toggle to collapse all - let's keep one always expanded for now
      return;
    }
    this.expandedSetId = setId;

    // Force re-render
    const player = wsClient.getCurrentPlayer();
    if (player) {
      const setCounts = countSetPieces(player.equipment);
      this.updateCollapsibleSetBonuses(setCounts);
    }
  }

  private getRarityBorderColor(rarity: Rarity): number {
    const c: Record<Rarity, number> = {
      [Rarity.Common]: 0x4a4a5a, [Rarity.Uncommon]: 0x1a6600,
      [Rarity.Rare]: 0x0044aa, [Rarity.Epic]: 0x6622aa, [Rarity.Legendary]: 0xaa4400
    };
    return c[rarity] ?? 0x4a4a5a;
  }

  private getRarityBgColor(rarity: Rarity): number {
    const c: Record<Rarity, number> = {
      [Rarity.Common]: 0x2a2a3a, [Rarity.Uncommon]: 0x1a3a1a,
      [Rarity.Rare]: 0x1a2a4a, [Rarity.Epic]: 0x2a1a4a, [Rarity.Legendary]: 0x3a2a1a
    };
    return c[rarity] ?? 0x2a2a3a;
  }

  private getRarityFillColor(rarity: Rarity): number {
    const c: Record<Rarity, number> = {
      [Rarity.Common]: 0x3a3a4a,
      [Rarity.Uncommon]: 0x1a5a1a,
      [Rarity.Rare]: 0x1a4a7a,
      [Rarity.Epic]: 0x4a1a6a,
      [Rarity.Legendary]: 0x6a4a1a
    };
    return c[rarity] ?? 0x3a3a4a;
  }

  private getRarityGlowColor(rarity: Rarity): number {
    const c: Record<Rarity, number> = {
      [Rarity.Common]: 0x6a6a7a, [Rarity.Uncommon]: 0x33cc33,
      [Rarity.Rare]: 0x4499ff, [Rarity.Epic]: 0xaa55ff, [Rarity.Legendary]: 0xff8800
    };
    return c[rarity] ?? 0x6a6a7a;
  }

  private getRarityHexColor(rarity: Rarity): string {
    return RARITY_HEX_COLORS[rarity];
  }

  toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }

  show(): void {
    this.visible = true;
    for (const el of this.allElements) {
      if ('setVisible' in el) (el as any).setVisible(true);
    }
    this.update();
  }

  hide(): void {
    this.visible = false;
    for (const el of this.allElements) {
      if ('setVisible' in el) (el as any).setVisible(false);
    }
    // Also hide dynamic set bonus elements (rendered directly on scene)
    for (const el of this.setBonusElements) {
      if ('setVisible' in el) (el as any).setVisible(false);
    }
    this.hideTooltip();
  }

  isVisible(): boolean {
    return this.visible;
  }

  destroy(): void {
    for (const el of this.allElements) el.destroy();
    // Also destroy dynamic set bonus elements
    for (const el of this.setBonusElements) el.destroy();
    this.setBonusElements = [];
    this.tooltip?.destroy();
  }
}
