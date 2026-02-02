import Phaser from 'phaser';
import { ClassName, SaveData } from '@dungeon-link/shared';
import { wsClient } from '../network/WebSocketClient';
import { shouldLoadSave, getSaveSlotToLoad } from '../main';
import { FONTS, COLORS } from '../ui/theme';

interface MenuSceneData {
  // NOTE: joinRunId removed - game is now single-player only
}

// Class data for display
interface ClassDisplayData {
  name: string;
  role: string;
  description: string;
  stats: {
    health: number;
    mana: number;
    attackPower: number;
    spellPower: number;
    armor: number;
    crit: number;
  };
  abilities: string[];
}

// Class data for display in character selection
const CLASS_DATA: Partial<Record<ClassName, ClassDisplayData>> = {
  [ClassName.Warrior]: {
    name: 'Warrior',
    role: 'Melee DPS / Tank',
    description: 'A mighty melee fighter who excels in close combat. Warriors enter bloodthirsty rages, healing from damage dealt, and retaliate against attackers.',
    stats: { health: 150, mana: 50, attackPower: 15, spellPower: 0, armor: 28, crit: 5 },
    abilities: ['Heroic Strike', 'Bloodlust', 'Whirlwind', 'Retaliation', 'Shield Wall']
  },
  [ClassName.Paladin]: {
    name: 'Paladin',
    role: 'Healer / Tank Hybrid',
    description: 'A holy warrior blessed with divine power. Paladins can heal allies, stun entire rooms with Judgment, and reflect damage back to attackers with Retribution Aura.',
    stats: { health: 140, mana: 80, attackPower: 12, spellPower: 8, armor: 24, crit: 5 },
    abilities: ['Crusader Strike', 'Flash of Light', 'Judgment', 'Blessing of Protection', 'Retribution Aura']
  },
  [ClassName.Rogue]: {
    name: 'Rogue',
    role: 'Melee DPS / Assassin',
    description: 'A stealthy assassin who strikes from the shadows. Use Stealth to approach undetected, Blind to stun enemies, and unleash devastating Sinister Strikes!',
    stats: { health: 85, mana: 60, attackPower: 16, spellPower: 0, armor: 8, crit: 15 },
    abilities: ['Sinister Strike', 'Stealth', 'Blind', 'Vanish', 'Blade Flurry']
  },
  [ClassName.Shaman]: {
    name: 'Shaman',
    role: 'Caster / Healer Hybrid',
    description: 'A spiritual guide communing with elemental forces. Chain Lightning devastates all enemies, while Ancestral Spirit provides reactive healing when hit.',
    stats: { health: 95, mana: 100, attackPower: 8, spellPower: 12, armor: 12, crit: 8 },
    abilities: ['Chain Lightning', 'Healing Wave', 'Ancestral Spirit', 'Earth Shock', 'Searing Totem']
  },
  [ClassName.Mage]: {
    name: 'Mage',
    role: 'Ranged Caster',
    description: 'A powerful arcane spellcaster commanding fire and arcane energies. Mages deal devastating damage, stun enemies with Pyroblast, recover mana with Meditation, and become immune with Ice Block.',
    stats: { health: 70, mana: 130, attackPower: 0, spellPower: 18, armor: 3, crit: 10 },
    abilities: ['Fireball', 'Meditation', 'Blaze', 'Pyroblast', 'Ice Block']
  },
  [ClassName.Warlock]: {
    name: 'Warlock',
    role: 'Caster / Summoner',
    description: 'A dark caster wielding shadow magic and demonic forces. Warlocks can cheat death with Soulstone, summon demons, drain life, and unleash Hellfire.',
    stats: { health: 80, mana: 110, attackPower: 0, spellPower: 16, armor: 5, crit: 8 },
    abilities: ['Shadow Bolt', 'Soulstone', 'Summon Imp', 'Drain Life', 'Hellfire']
  }
};

const AVAILABLE_CLASSES: ClassName[] = [
  ClassName.Warrior,
  ClassName.Paladin,
  ClassName.Rogue,
  ClassName.Shaman,
  ClassName.Mage,
  ClassName.Warlock
];

export class MenuScene extends Phaser.Scene {
  private selectedClass: ClassName = ClassName.Warrior;
  private playerName: string = '';
  // NOTE: joinRunId removed - game is now single-player only
  private messageUnsubscribe: (() => void) | null = null;
  private menuOverlay: HTMLElement | null = null;
  private classButtons: Map<ClassName, HTMLElement> = new Map();
  private classButtonHandlers: Map<ClassName, () => void> = new Map();
  private isPlayingAnimation: boolean = false;
  private animationTimeouts: number[] = [];

  constructor() {
    super({ key: 'MenuScene' });
  }

  init(data: MenuSceneData): void {
    console.log('[MENU] init() called, data:', data);
    console.log('[MENU] Active scenes:', this.scene.manager.getScenes(true).map(s => s.scene.key));
    // NOTE: joinRunId removed - game is now single-player only

    // Reset game start flag for fresh entry
    this.isStartingGame = false;

    // Clean up any existing message handler when scene is restarted
    if (this.messageUnsubscribe) {
      console.log('[MENU] Cleaning up old message handler');
      this.messageUnsubscribe();
      this.messageUnsubscribe = null;
    }

    // Clear any running animations
    this.animationTimeouts.forEach(t => clearTimeout(t));
    this.animationTimeouts = [];
    this.isPlayingAnimation = false;
  }

  create(): void {
    console.log('[MENU] create() called');

    // Reset state
    this.selectedClass = ClassName.Warrior;

    // CRITICAL: Remove class button event listeners before clearing to prevent accumulation
    this.classButtons.forEach((btn, className) => {
      const handler = this.classButtonHandlers.get(className);
      if (handler) {
        btn.removeEventListener('click', handler);
      }
    });
    this.classButtonHandlers.clear();
    this.classButtons.clear();

    // Set up background (Phaser still handles this)
    this.cameras.main.setBackgroundColor(COLORS.bgDark);

    // Show HTML menu overlay
    this.showMenuOverlay();

    // Setup WebSocket message handler
    this.setupMessageHandler();

    // Select initial class
    this.selectClass(ClassName.Warrior);

    // Check if we should auto-load a saved character
    this.checkAutoLoadSave();

    console.log('[MENU] create() complete, wsClient.isConnected:', wsClient.isConnected);
  }

  // Store bound handlers to allow removal
  private nameInputHandler: ((e: Event) => void) | null = null;
  private startBtnHandler: (() => void) | null = null;

  private showMenuOverlay(): void {
    this.menuOverlay = document.getElementById('menu-overlay');
    if (!this.menuOverlay) return;

    this.menuOverlay.classList.add('active');

    // Populate class grid
    this.populateClassGrid();

    // Set up name input - remove old listener first to prevent duplicates
    const nameInput = document.getElementById('hero-name-input') as HTMLInputElement;
    if (nameInput) {
      nameInput.value = this.playerName;
      // Reset any error styling
      nameInput.style.borderColor = '';
      nameInput.style.boxShadow = '';
      // Remove old listener if exists
      if (this.nameInputHandler) {
        nameInput.removeEventListener('input', this.nameInputHandler);
      }
      this.nameInputHandler = (e: Event) => {
        this.playerName = (e.target as HTMLInputElement).value;
        // Clear error styling when user types
        if (this.playerName.trim()) {
          nameInput.style.borderColor = '';
          nameInput.style.boxShadow = '';
        }
      };
      nameInput.addEventListener('input', this.nameInputHandler);
    }

    // NOTE: Join info removed - game is now single-player only
    const joinInfo = document.getElementById('menu-join-info');
    if (joinInfo) {
      joinInfo.textContent = '';
    }

    // Set up start button - remove old listener first to prevent duplicates
    const startBtn = document.getElementById('menu-start-btn');
    if (startBtn) {
      startBtn.textContent = 'BEGIN DESCENT';
      // Remove old listener if exists
      if (this.startBtnHandler) {
        startBtn.removeEventListener('click', this.startBtnHandler);
      }
      this.startBtnHandler = () => this.startGame();
      startBtn.addEventListener('click', this.startBtnHandler);
    }
  }

  private hideMenuOverlay(): void {
    if (this.menuOverlay) {
      this.menuOverlay.classList.remove('active');
    }
  }

  private populateClassGrid(): void {
    const grid = document.getElementById('menu-class-grid');
    if (!grid) return;

    grid.innerHTML = '';

    AVAILABLE_CLASSES.forEach(className => {
      const classData = CLASS_DATA[className];
      if (!classData) return; // Skip if class data not found
      const classKey = className.toLowerCase();

      const btn = document.createElement('div');
      btn.className = `menu-class-btn ${classKey}`;
      btn.innerHTML = `
        <img src="assets/players/${classKey}.png" alt="${classData.name}" class="class-icon">
        <div class="class-name">${classData.name}</div>
      `;

      // Store handler reference for cleanup
      const handler = () => this.selectClass(className);
      btn.addEventListener('click', handler);
      this.classButtonHandlers.set(className, handler);
      grid.appendChild(btn);
      this.classButtons.set(className, btn);
    });
  }

  private selectClass(className: ClassName): void {
    this.selectedClass = className;

    // Update button states
    this.classButtons.forEach((btn, cls) => {
      if (cls === className) {
        btn.classList.add('selected');
      } else {
        btn.classList.remove('selected');
      }
    });

    // Update preview panel
    this.updatePreviewPanel(className);

    // Play attack animation preview
    this.playPreviewAnimation(className);
  }

  private playPreviewAnimation(className: ClassName): void {
    // Clear any existing animation
    this.animationTimeouts.forEach(t => clearTimeout(t));
    this.animationTimeouts = [];

    if (this.isPlayingAnimation) {
      this.isPlayingAnimation = false;
    }

    const spriteArea = document.getElementById('preview-sprite-area');
    if (!spriteArea) return;

    const classKey = className.toLowerCase();

    // Frame counts per class (some have 3, some have 4)
    const classFrameCounts: Record<string, number> = {
      'warrior': 4,
      'paladin': 4,
      'hunter': 4,
      'rogue': 3,
      'mage': 4,
      'warlock': 4,
      'shaman': 4
    };

    // Check if this class has animated frames
    if (!(classKey in classFrameCounts)) {
      // No animation for this class, just show idle
      return;
    }

    this.isPlayingAnimation = true;

    // Animation frames based on class
    const frameCount = classFrameCounts[classKey];
    const frames = Array.from({ length: frameCount }, (_, i) => i + 1);
    const frameDelay = 100; // ms per frame
    let currentFrame = 0;

    const img = spriteArea.querySelector('img');
    if (!img) return;

    // Add a subtle scale effect
    img.style.transition = 'transform 0.1s ease';

    const playFrame = () => {
      if (!this.isPlayingAnimation || currentFrame >= frames.length) {
        // Animation complete, return to idle
        img.src = `assets/players/${classKey}.png`;
        img.style.transform = 'scale(1)';
        img.classList.remove('attacking');
        this.isPlayingAnimation = false;
        return;
      }

      const frameNum = frames[currentFrame];
      img.src = `assets/players/animated/${classKey}/${classKey}${frameNum}.png`;
      img.style.transform = 'scale(1.1)';
      img.classList.add('attacking');

      currentFrame++;
      const timeout = window.setTimeout(playFrame, frameDelay);
      this.animationTimeouts.push(timeout);
    };

    // Small delay before starting animation
    const startTimeout = window.setTimeout(playFrame, 50);
    this.animationTimeouts.push(startTimeout);
  }

  private updatePreviewPanel(className: ClassName): void {
    const classData = CLASS_DATA[className];
    if (!classData) return; // Skip if class data not found
    const classKey = className.toLowerCase();

    // Update sprite
    const spriteArea = document.getElementById('preview-sprite-area');
    if (spriteArea) {
      spriteArea.innerHTML = `<img src="assets/players/${classKey}.png" alt="${classData.name}">`;
    }

    // Update class name (with class color)
    const nameEl = document.getElementById('preview-class-name');
    if (nameEl) {
      nameEl.textContent = classData.name;
      nameEl.style.color = this.getClassColor(className);
    }

    // Update role
    const roleEl = document.getElementById('preview-class-role');
    if (roleEl) {
      roleEl.textContent = classData.role;
    }

    // Update description
    const descEl = document.getElementById('preview-description');
    if (descEl) {
      descEl.textContent = classData.description;
    }

    // Update stats
    const statsEl = document.getElementById('preview-stats');
    if (statsEl) {
      const stats = classData.stats;
      statsEl.innerHTML = `
        <div class="preview-stat">
          <span class="preview-stat-value">${stats.health}</span>
          <span class="preview-stat-label">Health</span>
        </div>
        <div class="preview-stat">
          <span class="preview-stat-value">${stats.mana}</span>
          <span class="preview-stat-label">Mana</span>
        </div>
        <div class="preview-stat">
          <span class="preview-stat-value">${stats.attackPower || stats.spellPower}</span>
          <span class="preview-stat-label">${stats.attackPower ? 'Attack' : 'Spell'}</span>
        </div>
        <div class="preview-stat">
          <span class="preview-stat-value">${stats.armor}</span>
          <span class="preview-stat-label">Armor</span>
        </div>
        <div class="preview-stat">
          <span class="preview-stat-value">${stats.crit}%</span>
          <span class="preview-stat-label">Crit</span>
        </div>
      `;
    }

    // Update abilities
    const abilitiesEl = document.getElementById('preview-abilities-list');
    if (abilitiesEl) {
      abilitiesEl.innerHTML = classData.abilities
        .map(ability => `<span class="ability-tag">${ability}</span>`)
        .join('');
    }
  }

  private getClassColor(className: ClassName): string {
    const colors: Record<ClassName, string> = {
      [ClassName.Warrior]: '#C79C6E',
      [ClassName.Paladin]: '#F58CBA',
      [ClassName.Rogue]: '#FFF569',
      [ClassName.Shaman]: '#0070DE',
      [ClassName.Mage]: '#69CCF0',
      [ClassName.Warlock]: '#9482C9'
    };
    return colors[className] || '#ffd700';
  }

  private setupMessageHandler(): void {
    console.log('[MENU] Setting up message handler');
    this.messageUnsubscribe = wsClient.onMessage((message) => {
      console.log('[MENU] Received message:', message.type);
      if (message.type === 'RUN_CREATED' || message.type === 'RUN_JOINED') {
        console.log('[MENU] RUN_CREATED/RUN_JOINED received, transitioning to GameScene');
        console.log('[MENU] wsClient.currentState:', wsClient.currentState ? 'exists' : 'null');
        console.log('[MENU] wsClient.playerId:', wsClient.playerId);

        // Unsubscribe from messages FIRST to prevent any further handler calls
        if (this.messageUnsubscribe) {
          this.messageUnsubscribe();
          this.messageUnsubscribe = null;
        }

        // Hide menu overlay and transition to game
        this.hideMenuOverlay();

        // Start GameScene then stop MenuScene
        // IMPORTANT: Call stop() AFTER start() - this queues the stop for after start completes
        // Calling stop() BEFORE start() causes null reference errors
        this.scene.start('GameScene');
        this.scene.stop('MenuScene');
        console.log('[MENU] scene.start(GameScene) and scene.stop(MenuScene) called');
      } else if (message.type === 'JOIN_ERROR') {
        console.error('[MENU] Error:', message.message);
        // Could show error in UI here
      }
    });
  }

  private checkAutoLoadSave(): void {
    if (shouldLoadSave()) {
      const slot = getSaveSlotToLoad();
      if (slot !== null) {
        const saveData = wsClient.loadCharacter(slot);
        if (saveData && wsClient.isConnected) {
          console.log(`[MENU] Auto-loading save from slot ${slot}`);
          this.loadSavedCharacter(saveData, slot);
          return;
        }
      }
    }
  }

  // Flag to prevent multiple startGame calls
  private isStartingGame = false;

  private startGame(): void {
    // Prevent duplicate calls (e.g., from double-clicks or duplicate event handlers)
    if (this.isStartingGame) {
      console.warn('[MENU] Already starting game, ignoring duplicate call');
      return;
    }

    if (!wsClient.isConnected) {
      console.warn('[MENU] Not connected to server');
      return;
    }

    // Get and validate name from input
    const nameInput = document.getElementById('hero-name-input') as HTMLInputElement;
    if (nameInput) {
      this.playerName = nameInput.value.trim();

      // Validate name is not empty
      if (!this.playerName) {
        // Show error styling - red border and glow
        nameInput.style.borderColor = '#ff4444';
        nameInput.style.boxShadow = '0 0 8px rgba(255, 68, 68, 0.6)';
        nameInput.focus();
        // Shake animation
        nameInput.style.animation = 'none';
        nameInput.offsetHeight; // Trigger reflow
        nameInput.style.animation = 'shake 0.3s ease';
        return;
      }
    }

    this.isStartingGame = true;

    console.log('[MENU] Starting game with class:', this.selectedClass);

    // NOTE: joinRun removed - game is now single-player only
    wsClient.createRun(this.playerName, this.selectedClass);
  }

  private loadSavedCharacter(saveData: SaveData, slot: number): void {
    if (!wsClient.isConnected) {
      return;
    }
    this.hideMenuOverlay();
    wsClient.createRunFromSave(saveData, slot);
  }

  shutdown(): void {
    // Clear any running animations
    this.animationTimeouts.forEach(t => clearTimeout(t));
    this.animationTimeouts = [];
    this.isPlayingAnimation = false;

    // Remove event listeners to prevent duplicates on re-entry
    const nameInput = document.getElementById('hero-name-input') as HTMLInputElement;
    if (nameInput && this.nameInputHandler) {
      nameInput.removeEventListener('input', this.nameInputHandler);
      this.nameInputHandler = null;
    }
    const startBtn = document.getElementById('menu-start-btn');
    if (startBtn && this.startBtnHandler) {
      startBtn.removeEventListener('click', this.startBtnHandler);
      this.startBtnHandler = null;
    }

    this.hideMenuOverlay();
    if (this.messageUnsubscribe) {
      this.messageUnsubscribe();
      this.messageUnsubscribe = null;
    }
  }
}
