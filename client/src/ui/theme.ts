/**
 * Shared UI Theme - Central styling constants for consistent UI across the game
 * Used by: Landing page (CSS), MenuScene, GameScene, InventoryUI, popups, etc.
 */

// ============================================
// FONTS
// ============================================
export const FONTS = {
  title: 'Cinzel, serif',
  body: 'Crimson Text, Georgia, serif'
};

// ============================================
// COLORS
// ============================================
export const COLORS = {
  // Primary colors
  gold: '#c9a227',
  goldLight: '#ffd700',
  goldDark: '#8b6914',

  // Background colors
  bgDark: '#0d0d1a',
  panelBg: 0x1a1a2e,
  panelBgDark: 0x141423,
  panelBgLight: 0x1e1e32,

  // Border colors
  border: 0x4a4a6a,
  borderLight: 0x5a5a7a,
  borderGold: 0xc9a227,

  // Text colors
  textPrimary: '#ffffff',
  textSecondary: '#cccccc',
  textMuted: '#888899',
  textDark: '#666677',

  // Accent colors
  success: '#4CAF50',
  danger: '#ff4444',
  error: '#cc3333',
  errorLight: '#ff4444',
  info: '#69CCF0',

  // Stat bar colors (hex strings for backwards compatibility)
  healthRed: '#ff6666',
  manaBlue: '#6666ff',

  // Stat bar colors (numeric for Phaser graphics)
  healthBarFill: 0x22aa22,
  healthBarBg: 0x333333,
  manaBarFill: 0x3366cc,
  manaBarBg: 0x333333,

  // Tooltip specific
  tooltipBgInner: 0x111122,
  tooltipBgOuter: 0x1a1a2e,

  // Class colors (WoW-inspired)
  classWarrior: 0xC79C6E,
  classPaladin: 0xF58CBA,
  classHunter: 0xABD473,
  classRogue: 0xFFF569,
  classPriest: 0xFFFFFF,
  classShaman: 0x0070DE,
  classMage: 0x69CCF0,
  classWarlock: 0x9482C9,
  classDruid: 0xFF7D0A,
};

// Hex string versions of colors for Phaser text
export const COLORS_HEX = {
  gold: '#c9a227',
  goldLight: '#ffd700',
  goldDark: '#8b6914',
  panelBg: '#1a1a2e',
  panelBgDark: '#141423',
  border: '#4a4a6a',
  borderLight: '#5a5a7a',
  textPrimary: '#ffffff',
  textSecondary: '#cccccc',
  textMuted: '#888899',
  textDark: '#666677',
  success: '#4CAF50',
  danger: '#ff4444',
  error: '#cc3333',
  errorLight: '#ff4444',
  info: '#6699ff',

  // Class colors as hex
  classWarrior: '#C79C6E',
  classPaladin: '#F58CBA',
  classHunter: '#ABD473',
  classRogue: '#FFF569',
  classPriest: '#FFFFFF',
  classShaman: '#0070DE',
  classMage: '#69CCF0',
  classWarlock: '#9482C9',
  classDruid: '#FF7D0A',
};

// ============================================
// TYPOGRAPHY STYLES
// ============================================
export const TEXT_STYLES = {
  // Titles
  title: {
    fontFamily: FONTS.title,
    fontSize: '26px',
    color: COLORS_HEX.goldLight,
  },
  titleMedium: {
    fontFamily: FONTS.title,
    fontSize: '20px',
    color: COLORS_HEX.gold,
  },
  titleSmall: {
    fontFamily: FONTS.title,
    fontSize: '16px',
    color: COLORS_HEX.gold,
  },

  // Body text
  body: {
    fontFamily: FONTS.body,
    fontSize: '14px',
    color: COLORS_HEX.textSecondary,
  },
  bodySmall: {
    fontFamily: FONTS.body,
    fontSize: '12px',
    color: COLORS_HEX.textMuted,
  },
  bodyLarge: {
    fontFamily: FONTS.body,
    fontSize: '16px',
    color: COLORS_HEX.textSecondary,
  },

  // Labels
  label: {
    fontFamily: FONTS.body,
    fontSize: '11px',
    color: COLORS_HEX.textMuted,
  },

  // Button text
  button: {
    fontFamily: FONTS.title,
    fontSize: '14px',
    color: COLORS_HEX.panelBgDark,
  },
  buttonSmall: {
    fontFamily: FONTS.title,
    fontSize: '12px',
    color: COLORS_HEX.panelBgDark,
  },
};

// ============================================
// PANEL STYLES
// ============================================
export const PANEL = {
  // Background opacity
  bgAlpha: 0.95,
  bgAlphaSolid: 0.98,

  // Border
  borderWidth: 2,
  borderRadius: 8,

  // Padding
  padding: 20,
  paddingSmall: 12,
  paddingLarge: 25,

  // Corner decoration size
  cornerSize: 20,
};

// ============================================
// BUTTON STYLES
// ============================================
export const BUTTON = {
  // Primary button (gold)
  primary: {
    bg: 0xc9a227,
    bgHover: 0xe0b830,
    border: 0xe0b830,
    text: COLORS_HEX.panelBgDark,
  },

  // Secondary button (dark)
  secondary: {
    bg: 0x2a2a3a,
    bgHover: 0x3a3a4a,
    border: 0x4a4a6a,
    text: COLORS_HEX.textSecondary,
  },

  // Danger button (red)
  danger: {
    bg: 0xcc3333,
    bgHover: 0xff4444,
    border: 0xff4444,
    text: COLORS_HEX.textPrimary,
  },

  // Sizing
  height: 40,
  heightSmall: 32,
  heightLarge: 48,
  paddingX: 20,
  paddingY: 12,
  borderRadius: 4,
};

// ============================================
// SPACING
// ============================================
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 30,
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Create a panel background with optional gold corners
 */
export function createPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  options: {
    withCorners?: boolean;
    alpha?: number;
    borderColor?: number;
  } = {}
): Phaser.GameObjects.Container {
  const { withCorners = true, alpha = PANEL.bgAlpha, borderColor = COLORS.border } = options;

  const container = scene.add.container(x, y);

  // Background
  const bg = scene.add.rectangle(0, 0, width, height, COLORS.panelBg, alpha);
  bg.setStrokeStyle(PANEL.borderWidth, borderColor);
  container.add(bg);

  // Gold corners
  if (withCorners) {
    const cornerGraphics = scene.add.graphics();
    cornerGraphics.lineStyle(2, COLORS.borderGold);

    // Top-left corner
    cornerGraphics.beginPath();
    cornerGraphics.moveTo(-width/2, -height/2 + PANEL.cornerSize);
    cornerGraphics.lineTo(-width/2, -height/2);
    cornerGraphics.lineTo(-width/2 + PANEL.cornerSize, -height/2);
    cornerGraphics.strokePath();

    // Bottom-right corner
    cornerGraphics.beginPath();
    cornerGraphics.moveTo(width/2, height/2 - PANEL.cornerSize);
    cornerGraphics.lineTo(width/2, height/2);
    cornerGraphics.lineTo(width/2 - PANEL.cornerSize, height/2);
    cornerGraphics.strokePath();

    container.add(cornerGraphics);
  }

  return container;
}

/**
 * Create a styled button
 */
export function createButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  options: {
    width?: number;
    height?: number;
    style?: 'primary' | 'secondary' | 'danger';
    onClick?: () => void;
  } = {}
): Phaser.GameObjects.Container {
  const {
    width = 150,
    height = BUTTON.height,
    style = 'primary',
    onClick
  } = options;

  const buttonStyle = BUTTON[style];
  const container = scene.add.container(x, y);

  // Background
  const bg = scene.add.rectangle(0, 0, width, height, buttonStyle.bg);
  bg.setStrokeStyle(1, buttonStyle.border);
  container.add(bg);

  // Text
  const label = scene.add.text(0, 0, text, {
    fontFamily: FONTS.title,
    fontSize: '14px',
    color: buttonStyle.text,
  });
  label.setOrigin(0.5, 0.5);
  container.add(label);

  // Interactivity
  bg.setInteractive({ useHandCursor: true });

  bg.on('pointerover', () => {
    bg.setFillStyle(buttonStyle.bgHover);
  });

  bg.on('pointerout', () => {
    bg.setFillStyle(buttonStyle.bg);
  });

  if (onClick) {
    bg.on('pointerdown', onClick);
  }

  // Store references for external access
  container.setData('bg', bg);
  container.setData('label', label);

  return container;
}

/**
 * Create a title with decorative underline
 */
export function createTitle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  options: {
    fontSize?: string;
    withUnderline?: boolean;
    underlineWidth?: number;
  } = {}
): Phaser.GameObjects.Container {
  const { fontSize = '20px', withUnderline = true, underlineWidth = 40 } = options;

  const container = scene.add.container(x, y);

  // Title text
  const title = scene.add.text(0, 0, text, {
    fontFamily: FONTS.title,
    fontSize,
    color: COLORS_HEX.goldLight,
  });
  title.setOrigin(0.5, 0.5);
  container.add(title);

  // Decorative underline
  if (withUnderline) {
    const underline = scene.add.graphics();
    underline.lineStyle(1, COLORS.border);
    underline.lineBetween(-title.width/2 - 20, 15, title.width/2 + 20, 15);

    // Gold accent in center
    underline.lineStyle(2, COLORS.borderGold);
    underline.lineBetween(-underlineWidth/2, 15, underlineWidth/2, 15);

    container.add(underline);
  }

  return container;
}

/**
 * Create a tooltip/popup background with proper naming for dynamic resizing
 */
export function createTooltipBg(
  scene: Phaser.Scene,
  width: number,
  height: number,
  options: {
    originX?: number;
    originY?: number;
  } = {}
): { outer: Phaser.GameObjects.Rectangle; inner: Phaser.GameObjects.Rectangle } {
  const { originX = 0.5, originY = 1 } = options;

  const outer = scene.add.rectangle(0, 0, width + 4, height + 4, COLORS.tooltipBgOuter, 1.0);
  outer.setStrokeStyle(2, COLORS.borderGold);
  outer.setOrigin(originX, originY);
  outer.setName('tooltipBgOuter');

  const yOffset = originY === 1 ? -2 : 2;
  const inner = scene.add.rectangle(0, yOffset, width, height, COLORS.tooltipBgInner, 1.0);
  inner.setOrigin(originX, originY);
  inner.setName('tooltipBgInner');

  return { outer, inner };
}

/**
 * Draw gold corner decorations on a graphics object
 * Coordinates are relative to the graphics object's position
 */
export function drawCornerDecorations(
  graphics: Phaser.GameObjects.Graphics,
  width: number,
  height: number,
  options: {
    cornerSize?: number;
    originX?: number;
    originY?: number;
    color?: number;
  } = {}
): void {
  const {
    cornerSize = PANEL.cornerSize,
    originX = 0.5,
    originY = 0.5,
    color = COLORS.borderGold
  } = options;

  // Calculate offsets based on origin
  const left = -width * originX;
  const right = width * (1 - originX);
  const top = -height * originY;
  const bottom = height * (1 - originY);

  graphics.lineStyle(2, color);

  // Top-left corner
  graphics.beginPath();
  graphics.moveTo(left, top + cornerSize);
  graphics.lineTo(left, top);
  graphics.lineTo(left + cornerSize, top);
  graphics.strokePath();

  // Bottom-right corner
  graphics.beginPath();
  graphics.moveTo(right, bottom - cornerSize);
  graphics.lineTo(right, bottom);
  graphics.lineTo(right - cornerSize, bottom);
  graphics.strokePath();
}

/**
 * Draw a title underline with gold accent in center
 */
export function drawTitleUnderline(
  graphics: Phaser.GameObjects.Graphics,
  y: number,
  fullWidth: number,
  options: {
    accentWidth?: number;
    borderColor?: number;
    accentColor?: number;
  } = {}
): void {
  const {
    accentWidth = 40,
    borderColor = COLORS.border,
    accentColor = COLORS.borderGold
  } = options;

  // Full width line
  graphics.lineStyle(1, borderColor);
  graphics.lineBetween(-fullWidth / 2, y, fullWidth / 2, y);

  // Gold accent in center
  graphics.lineStyle(2, accentColor);
  graphics.lineBetween(-accentWidth / 2, y, accentWidth / 2, y);
}

/**
 * Create a complete tooltip container with text elements
 * Returns a container that can be shown/hidden and repositioned
 */
export function createTooltip(
  scene: Phaser.Scene,
  options: {
    maxWidth?: number;
    hasTitle?: boolean;
    hasSubtext?: boolean;
  } = {}
): {
  container: Phaser.GameObjects.Container;
  bgOuter: Phaser.GameObjects.Rectangle;
  bgInner: Phaser.GameObjects.Rectangle;
  titleText: Phaser.GameObjects.Text | null;
  bodyText: Phaser.GameObjects.Text;
  subtextText: Phaser.GameObjects.Text | null;
  resize: () => void;
} {
  const { maxWidth = 250, hasTitle = true, hasSubtext = true } = options;

  const container = scene.add.container(0, 0);
  container.setDepth(2000);
  container.setVisible(false);

  // Background layers
  const { outer: bgOuter, inner: bgInner } = createTooltipBg(scene, maxWidth, 100);
  container.add([bgOuter, bgInner]);

  // Title text (optional)
  let titleText: Phaser.GameObjects.Text | null = null;
  if (hasTitle) {
    titleText = scene.add.text(0, -80, '', {
      fontFamily: FONTS.title,
      fontSize: '14px',
      color: COLORS_HEX.goldLight,
    }).setOrigin(0.5, 0).setName('tooltipTitle');
    container.add(titleText);
  }

  // Body text
  const bodyText = scene.add.text(0, -60, '', {
    fontFamily: FONTS.body,
    fontSize: '12px',
    color: COLORS_HEX.textPrimary,
    wordWrap: { width: maxWidth - 30 },
    lineSpacing: 3
  }).setOrigin(0.5, 0).setName('tooltipBody');
  container.add(bodyText);

  // Subtext (optional - for costs, hints, etc.)
  let subtextText: Phaser.GameObjects.Text | null = null;
  if (hasSubtext) {
    subtextText = scene.add.text(0, -18, '', {
      fontFamily: FONTS.body,
      fontSize: '11px',
      color: COLORS_HEX.info,
    }).setOrigin(0.5, 0).setName('tooltipSubtext');
    container.add(subtextText);
  }

  // Resize function to call after updating text
  const resize = () => {
    const padding = 18;
    const titleHeight = titleText?.height ?? 0;
    const bodyHeight = bodyText.height;
    const subtextHeight = subtextText?.height ?? 0;

    const spacing = 8;
    let totalHeight = padding * 2 + bodyHeight;
    if (titleText && titleText.text) totalHeight += titleHeight + spacing;
    if (subtextText && subtextText.text) totalHeight += subtextHeight + spacing;

    const contentWidth = Math.max(
      titleText?.width ?? 0,
      bodyText.width,
      subtextText?.width ?? 0
    );
    const tooltipWidth = Math.max(200, contentWidth + padding * 2);

    // Update background sizes
    bgOuter.setSize(tooltipWidth + 4, totalHeight + 4);
    bgInner.setSize(tooltipWidth, totalHeight);

    // Reposition text elements from top
    let yPos = -totalHeight + padding;
    if (titleText && titleText.text) {
      titleText.setY(yPos);
      yPos += titleHeight + spacing;
    }
    bodyText.setY(yPos);
    if (subtextText && subtextText.text) {
      subtextText.setY(-padding - subtextHeight);
    }
  };

  return { container, bgOuter, bgInner, titleText, bodyText, subtextText, resize };
}

/**
 * Create a unified close button (X) for popups
 * Returns a container with background and text that can be positioned
 */
export function createCloseButton(
  scene: Phaser.Scene,
  options: {
    size?: number;
    onClick?: () => void;
  } = {}
): {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
} {
  const { size = 30, onClick } = options;

  const container = scene.add.container(0, 0);

  // Background rectangle
  const bg = scene.add.rectangle(0, 0, size, size, 0x3d3d5c, 0.9);
  bg.setStrokeStyle(1, 0x5a5a7a);
  bg.setInteractive({ useHandCursor: true });

  // X text
  const text = scene.add.text(0, -1, '×', {
    fontFamily: FONTS.body,
    fontSize: `${Math.floor(size * 0.73)}px`,
    color: '#aaaaaa',
    stroke: '#000000',
    strokeThickness: 1
  });
  text.setOrigin(0.5, 0.5);

  container.add([bg, text]);

  // Hover effects
  bg.on('pointerover', () => {
    bg.setFillStyle(0x884444);
    text.setColor('#ffffff');
  });
  bg.on('pointerout', () => {
    bg.setFillStyle(0x3d3d5c);
    text.setColor('#aaaaaa');
  });

  // Click handler
  if (onClick) {
    bg.on('pointerdown', onClick);
  }

  return { container, bg, text };
}

// ============================================
// CLASS DATA WITH COLORS
// ============================================
export const CLASS_COLORS: Record<string, number> = {
  warrior: COLORS.classWarrior,
  paladin: COLORS.classPaladin,
  hunter: COLORS.classHunter,
  rogue: COLORS.classRogue,
  priest: COLORS.classPriest,
  shaman: COLORS.classShaman,
  mage: COLORS.classMage,
  warlock: COLORS.classWarlock,
  druid: COLORS.classDruid,
};

export const CLASS_COLORS_HEX: Record<string, string> = {
  warrior: COLORS_HEX.classWarrior,
  paladin: COLORS_HEX.classPaladin,
  hunter: COLORS_HEX.classHunter,
  rogue: COLORS_HEX.classRogue,
  priest: COLORS_HEX.classPriest,
  shaman: COLORS_HEX.classShaman,
  mage: COLORS_HEX.classMage,
  warlock: COLORS_HEX.classWarlock,
  druid: COLORS_HEX.classDruid,
};

export const CLASS_DATA: Record<string, { name: string; role: string; icon: string }> = {
  warrior: { name: 'Warrior', role: 'Melee / Tank', icon: '⚔' },
  paladin: { name: 'Paladin', role: 'Healer / Tank', icon: '✨' },
  hunter: { name: 'Hunter', role: 'Ranged DPS', icon: '🏹' },
  rogue: { name: 'Rogue', role: 'Melee / Assassin', icon: '🗡' },
  priest: { name: 'Priest', role: 'Healer / Caster', icon: '✝' },
  shaman: { name: 'Shaman', role: 'Caster / Healer', icon: '⚡' },
  mage: { name: 'Mage', role: 'Ranged Caster', icon: '❄' },
  warlock: { name: 'Warlock', role: 'Caster / Summoner', icon: '🔥' },
  druid: { name: 'Druid', role: 'Shapeshifter', icon: '🌿' },
};

// Classes currently available for play
export const AVAILABLE_CLASSES = ['warrior', 'paladin', 'rogue', 'shaman', 'mage', 'warlock'];
