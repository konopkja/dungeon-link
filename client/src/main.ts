import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { LootScene } from './scenes/LootScene';
import { SaveData } from '@dungeon-link/shared';
import { wsClient } from './network/WebSocketClient';

// Leaderboard storage key
const LEADERBOARD_KEY = 'dungeonlink_leaderboard';

interface LeaderboardEntry {
  name: string;
  classId: string;
  floor: number;
  level: number;
  timestamp: number;
}

// Game instance
let game: Phaser.Game | null = null;

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.CANVAS,  // Force Canvas rendering to diagnose WebGL issues
  width: 1024,
  height: 768,
  parent: 'game-container',
  backgroundColor: '#1a1a2e',
  antialias: true,
  roundPixels: false,
  physics: {
    default: 'arcade',
    arcade: {
      debug: false
    }
  },
  scene: [BootScene, MenuScene, GameScene, UIScene, LootScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  render: {
    pixelArt: false,
    antialias: true
  }
};

// Class display names
const CLASS_NAMES: Record<string, string> = {
  warrior: 'Warrior',
  paladin: 'Paladin',
  hunter: 'Hunter',
  rogue: 'Rogue',
  priest: 'Priest',
  shaman: 'Shaman',
  mage: 'Mage',
  warlock: 'Warlock',
  druid: 'Druid'
};

// Load saved characters from localStorage (using existing save system keys)
function loadSavedCharacters(): { slot: number; data: SaveData }[] {
  const saves: { slot: number; data: SaveData }[] = [];
  const SAVE_KEY_PREFIX = 'dungeon_link_save_';
  const MAX_SAVE_SLOTS = 5;

  for (let i = 0; i < MAX_SAVE_SLOTS; i++) {
    const data = localStorage.getItem(`${SAVE_KEY_PREFIX}${i}`);
    if (data) {
      try {
        const saveData = JSON.parse(data) as SaveData;
        saves.push({ slot: i, data: saveData });
      } catch {
        // Skip corrupted saves
      }
    }
  }

  // Sort by timestamp (newest first)
  saves.sort((a, b) => b.data.timestamp - a.data.timestamp);
  return saves;
}

// Load leaderboard from localStorage
function loadLeaderboard(): LeaderboardEntry[] {
  try {
    const saved = localStorage.getItem(LEADERBOARD_KEY);
    const entries: LeaderboardEntry[] = saved ? JSON.parse(saved) : [];
    // Sort by floor descending, then by level
    return entries.sort((a, b) => b.floor - a.floor || b.level - a.level).slice(0, 10);
  } catch {
    return [];
  }
}

// Save leaderboard entry
export function saveLeaderboardEntry(entry: { name: string; classId: string; floor: number; level: number }): void {
  const leaderboard = loadLeaderboard();

  // Check if this character already has an entry
  const existingIndex = leaderboard.findIndex(e =>
    e.name === entry.name && e.classId === entry.classId
  );

  if (existingIndex >= 0) {
    // Only update if new floor is higher
    if (entry.floor > leaderboard[existingIndex].floor) {
      leaderboard[existingIndex] = { ...entry, timestamp: Date.now() };
    }
  } else {
    leaderboard.push({ ...entry, timestamp: Date.now() });
  }

  // Sort and keep top 10
  const sorted = leaderboard.sort((a, b) => b.floor - a.floor || b.level - a.level).slice(0, 10);
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(sorted));
}

// Class icons for character list
const CLASS_ICONS: Record<string, string> = {
  warrior: '⚔',
  paladin: '✝',
  rogue: '🗡',
  shaman: '⚡',
  mage: '❄',
  warlock: '🔥',
  druid: '🌿',
  priest: '✨',
  hunter: '🏹'
};

// Render saved characters list
function renderCharacterList(): void {
  const container = document.getElementById('character-list');
  if (!container) return;

  const characters = loadSavedCharacters();

  if (characters.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = characters.map(({ slot, data }) => {
    const livesDisplay = data.lives ?? 5;
    const livesColor = livesDisplay <= 1 ? '#ff4444' : (livesDisplay <= 2 ? '#ffaa00' : '#4CAF50');
    const heartsText = '♥'.repeat(livesDisplay) + '♡'.repeat(5 - livesDisplay);
    const className = CLASS_NAMES[data.classId] || data.classId;
    const classIcon = CLASS_ICONS[data.classId] || '⚔';
    const displayName = data.playerName || 'Hero';

    return `
    <div class="mini-character" data-slot="${slot}">
      <div class="mini-char-info">
        <div class="mini-char-icon">${classIcon}</div>
        <div class="mini-char-details">
          <span class="mini-char-name">${displayName}</span>
          <span class="mini-char-class">Lv${data.level} ${className} <span style="color: ${livesColor};">${heartsText}</span></span>
        </div>
      </div>
      <span class="mini-char-floor">F${data.highestFloor || 1}</span>
    </div>
  `;
  }).join('');

  // Add click handlers
  container.querySelectorAll('.mini-character').forEach(slot => {
    slot.addEventListener('click', () => {
      const slotNum = parseInt(slot.getAttribute('data-slot') || '0', 10);
      startGameWithSave(slotNum);
    });
  });
}

// Render leaderboard
function renderLeaderboard(): void {
  const container = document.getElementById('leaderboard-list');
  if (!container) return;

  const entries = loadLeaderboard();

  if (entries.length === 0) {
    container.innerHTML = '<p class="no-entries">No heroes have descended yet...</p>';
    return;
  }

  container.innerHTML = entries.map((entry, index) => {
    let rankClass = '';
    if (index === 0) rankClass = 'gold';
    else if (index === 1) rankClass = 'silver';
    else if (index === 2) rankClass = 'bronze';

    return `
      <div class="leaderboard-entry ${rankClass}">
        <span class="rank">${index + 1}</span>
        <div class="leader-info">
          <span class="leader-name">${entry.name}</span>
          <span class="leader-class">Lv${entry.level} ${CLASS_NAMES[entry.classId] || entry.classId}</span>
        </div>
        <span class="leader-floor">Floor ${entry.floor}</span>
      </div>
    `;
  }).join('');
}

// Activity feed storage key
const ACTIVITY_KEY = 'dungeonlink_activity';

interface ActivityEntry {
  id: string;
  type: 'floor' | 'death' | 'boss' | 'legendary';
  playerName: string;
  classId: string;
  floor?: number;
  bossName?: string;
  itemName?: string;
  timestamp: number;
}

// Load activity entries from storage
function loadActivityFeed(): ActivityEntry[] {
  try {
    const stored = localStorage.getItem(ACTIVITY_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load activity feed:', e);
  }
  return [];
}

// Save activity entries to storage
function saveActivityFeed(entries: ActivityEntry[]): void {
  // Keep only last 50 entries
  const trimmed = entries.slice(-50);
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(trimmed));
}

// Add a new activity entry
export function addActivity(entry: Omit<ActivityEntry, 'id' | 'timestamp'>): void {
  const entries = loadActivityFeed();
  const newEntry: ActivityEntry = {
    ...entry,
    id: `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now()
  };
  entries.push(newEntry);
  saveActivityFeed(entries);
  renderActivityFeed();
}

// Format time ago
function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// Get activity icon
function getActivityIcon(type: string): string {
  switch (type) {
    case 'floor': return '⬇️';
    case 'death': return '💀';
    case 'boss': return '👑';
    case 'legendary': return '⭐';
    default: return '📜';
  }
}

// Render a single activity entry HTML
function renderActivityEntry(entry: ActivityEntry): string {
  const isHighlight = entry.type === 'legendary' || (entry.type === 'floor' && (entry.floor ?? 0) >= 10);
  const isDeath = entry.type === 'death';
  const className = CLASS_NAMES[entry.classId] || entry.classId;

  let message = '';
  switch (entry.type) {
    case 'floor':
      message = `Reached <strong>Floor ${entry.floor}</strong>`;
      break;
    case 'death':
      message = `Fell on <strong>Floor ${entry.floor}</strong>`;
      break;
    case 'boss':
      message = `Defeated <strong>${entry.bossName}</strong> on Floor ${entry.floor}`;
      break;
    case 'legendary':
      message = `Found <strong>${entry.itemName}</strong>`;
      break;
  }

  return `
    <div class="activity-entry ${isHighlight ? 'highlight' : ''} ${isDeath ? 'death' : ''}">
      <div class="activity-icon">${getActivityIcon(entry.type)}</div>
      <div class="activity-content">
        <div class="activity-player">
          ${entry.playerName}
          <span class="class-badge">${className}</span>
        </div>
        <div class="activity-message">${message}</div>
        <div class="activity-time">${formatTimeAgo(entry.timestamp)}</div>
      </div>
    </div>
  `;
}

// Render activity feed
function renderActivityFeed(): void {
  const container = document.getElementById('activity-feed');
  if (!container) return;

  const entries = loadActivityFeed();

  // If no entries, show empty state
  if (entries.length === 0) {
    container.innerHTML = '<div class="activity-empty">No adventures recorded yet. Be the first to descend!</div>';
    return;
  }

  // Sort by most recent first for display
  const sortedEntries = [...entries].sort((a, b) => b.timestamp - a.timestamp);

  // Render entries and duplicate for seamless infinite scroll
  const entriesHtml = sortedEntries.map(entry => renderActivityEntry(entry)).join('');

  // Duplicate the content for seamless looping
  container.innerHTML = entriesHtml + entriesHtml;
}

// Start new character
function startNewCharacter(): void {
  // Mark that we're creating a new character
  sessionStorage.setItem('dungeonlink_load_save', 'false');
  sessionStorage.removeItem('dungeonlink_save_slot');
  startGame();
}

// Start game with saved character
function startGameWithSave(slot: number): void {
  sessionStorage.setItem('dungeonlink_load_save', 'true');
  sessionStorage.setItem('dungeonlink_save_slot', slot.toString());
  startGame();
}

// Start the Phaser game
function startGame(): void {
  // Hide landing page, show game
  const landingPage = document.getElementById('landing-page');
  const gameContainer = document.getElementById('game-container');
  const backButton = document.getElementById('back-to-menu');

  if (landingPage) landingPage.classList.add('hidden');
  if (gameContainer) gameContainer.classList.add('active');
  if (backButton) backButton.classList.add('active');

  // Create or restart game
  if (game) {
    // Game already exists - stop ALL running scenes first to prevent accumulation
    console.log('[MAIN] Stopping all scenes before restart');
    game.scene.getScenes(true).forEach(scene => {
      console.log('[MAIN] Stopping scene:', scene.scene.key);
      game!.scene.stop(scene.scene.key);
    });
    // Now start fresh from BootScene
    game.scene.start('BootScene');
  } else {
    // Create new game
    game = new Phaser.Game(config);
  }

  console.log('Dungeon Link - Starting game...');
}

// Return to landing page
function returnToMenu(): void {
  // Hide game, show landing page
  const landingPage = document.getElementById('landing-page');
  const gameContainer = document.getElementById('game-container');
  const backButton = document.getElementById('back-to-menu');
  const menuOverlay = document.getElementById('menu-overlay');

  if (landingPage) landingPage.classList.remove('hidden');
  if (gameContainer) gameContainer.classList.remove('active');
  if (backButton) backButton.classList.remove('active');
  if (menuOverlay) menuOverlay.classList.remove('active');

  // CRITICAL: Full WebSocket cleanup before destroying the game
  // 1. Disconnect to stop receiving messages from old run
  // 2. Clear all handlers to prevent accumulation
  // 3. Clear state to prevent old dungeon from rendering
  wsClient.disconnect();
  wsClient.clearAllHandlers();
  wsClient.runId = null;
  wsClient.playerId = null;
  wsClient.currentState = null;

  // Destroy the game instance to free memory
  if (game) {
    game.destroy(true);
    game = null;
  }

  // Clear session storage
  sessionStorage.removeItem('dungeonlink_load_save');
  sessionStorage.removeItem('dungeonlink_save_slot');

  // Refresh the lists
  renderCharacterList();
  renderLeaderboard();
}

// Export functions for use by game scenes
export function shouldLoadSave(): boolean {
  return sessionStorage.getItem('dungeonlink_load_save') === 'true';
}

export function getSaveSlotToLoad(): number | null {
  const slot = sessionStorage.getItem('dungeonlink_save_slot');
  return slot ? parseInt(slot, 10) : null;
}

export function refreshLandingPage(): void {
  renderCharacterList();
  renderLeaderboard();
  renderActivityFeed();
}

// Make returnToMenu available globally for the back button
(window as any).returnToMenu = returnToMenu;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Render initial lists
  renderCharacterList();
  renderLeaderboard();
  renderActivityFeed();

  // Setup button handlers
  const newCharBtn = document.getElementById('new-character-btn');
  if (newCharBtn) {
    newCharBtn.addEventListener('click', startNewCharacter);
  }

  const backBtn = document.getElementById('back-to-menu');
  if (backBtn) {
    backBtn.addEventListener('click', returnToMenu);
  }

  console.log('Dungeon Link - Landing page ready');
});
