import { ClientMessage, ServerMessage, RunState, Player, CombatEvent, LootDrop, ClassName, SaveData } from '@dungeon-link/shared';
import { WS_CONFIG } from '@dungeon-link/shared';
import { WS_URL } from '../config';

const SAVE_KEY_PREFIX = 'dungeon_link_save_';
const SAVE_INDEX_KEY = 'dungeon_link_saves_index';
const SAVE_VERSION = 1;
const MAX_SAVE_SLOTS = 5;

type MessageHandler = (message: ServerMessage) => void;
type ConnectionHandler = () => void;

// Set to true to enable verbose debug logging (CAUSES LAG - only for debugging)
const DEBUG_LOGGING = false;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private connectHandlers: Set<ConnectionHandler> = new Set();
  private disconnectHandlers: Set<ConnectionHandler> = new Set();
  private reconnectAttempts = 0;
  private reconnectTimeout: number | null = null;

  // Game state received from server
  public runId: string | null = null;
  public playerId: string | null = null;
  public currentState: RunState | null = null;
  public isConnected = false;

  // Lives tracking (5 max, character deleted at 0)
  public currentLives: number = 5;
  public currentSaveSlot: number | null = null;

  constructor() {}

  /**
   * Connect to the WebSocket server
   * Uses WS_URL from config which respects environment variables
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log(`[WS] Connecting to ${WS_URL}`);
        this.ws = new WebSocket(WS_URL);

        this.ws.onopen = () => {
          console.log('Connected to server');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.connectHandlers.forEach(h => h());
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as ServerMessage;
            this.handleMessage(message);
          } catch (e) {
            console.error('Failed to parse message:', e);
          }
        };

        this.ws.onclose = () => {
          console.log('Disconnected from server');
          this.isConnected = false;
          this.disconnectHandlers.forEach(h => h());
          this.attemptReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= WS_CONFIG.MAX_RECONNECT_ATTEMPTS) {
      console.log('Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${WS_CONFIG.MAX_RECONNECT_ATTEMPTS})...`);

    this.reconnectTimeout = window.setTimeout(() => {
      this.connect().catch(() => {});
    }, WS_CONFIG.RECONNECT_DELAY * this.reconnectAttempts);
  }

  /**
   * Handle incoming message
   */
  private handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'RUN_CREATED':
        this.runId = message.runId;
        this.currentState = message.state;
        if (this.currentState.players.length > 0) {
          this.playerId = this.currentState.players[0].id;
        }
        break;

      case 'RUN_JOINED':
        this.playerId = message.playerId;
        this.currentState = message.state;
        break;

      case 'STATE_UPDATE':
        this.currentState = message.state;
        break;

      case 'PLAYER_JOINED':
        if (this.currentState) {
          this.currentState.players.push(message.player);
        }
        break;

      case 'PLAYER_LEFT':
        if (this.currentState) {
          this.currentState.players = this.currentState.players.filter(
            p => p.id !== message.playerId
          );
        }
        break;
    }

    // Notify all handlers
    this.messageHandlers.forEach(handler => handler(message));
  }

  /**
   * Send a message to the server
   */
  send(message: ClientMessage): void {
    if (DEBUG_LOGGING) console.log('[DEBUG] Sending message:', message.type, 'ws state:', this.ws?.readyState);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      if (DEBUG_LOGGING) console.log('[DEBUG] Message sent successfully');
    } else {
      console.error('[DEBUG] Failed to send - ws not open. readyState:', this.ws?.readyState);
    }
  }

  /**
   * Create a new run
   */
  createRun(playerName: string, classId: ClassName): void {
    // Reset lives and save slot for new character
    this.currentLives = 5;
    this.currentSaveSlot = null;
    this.send({ type: 'CREATE_RUN', playerName, classId });
  }

  // NOTE: joinRun removed - game is now single-player only

  /**
   * Send player input
   */
  sendInput(moveX: number, moveY: number, castAbility?: string, targetId?: string): void {
    this.send({
      type: 'PLAYER_INPUT',
      input: { moveX, moveY, castAbility, targetId }
    });
  }

  /**
   * Set current target
   */
  setTarget(targetId: string | null): void {
    this.send({ type: 'SET_TARGET', targetId });
  }

  /**
   * Advance to next floor
   */
  advanceFloor(): void {
    this.send({ type: 'ADVANCE_FLOOR' });
  }

  /**
   * Use an item (potion) from backpack
   */
  useItem(itemId: string): void {
    this.send({ type: 'USE_ITEM', itemId });
  }

  /**
   * Swap equipment with backpack item
   */
  swapEquipment(backpackIndex: number, slot: import('@dungeon-link/shared').EquipSlot): void {
    this.send({ type: 'SWAP_EQUIPMENT', backpackIndex, slot });
  }

  /**
   * Unequip item to backpack
   */
  unequipItem(slot: import('@dungeon-link/shared').EquipSlot): void {
    this.send({ type: 'UNEQUIP_ITEM', slot });
  }

  /**
   * Interact with a vendor NPC
   */
  interactVendor(vendorId: string): void {
    this.send({ type: 'INTERACT_VENDOR', vendorId });
  }

  /**
   * Purchase a service from a vendor
   */
  purchaseService(vendorId: string, serviceType: 'level_up' | 'train_ability', abilityId?: string): void {
    this.send({ type: 'PURCHASE_SERVICE', vendorId, serviceType, abilityId });
  }

  /**
   * Send ping
   */
  ping(): void {
    this.send({ type: 'PING' });
  }

  /**
   * Pickup a ground item by clicking on it
   */
  pickupGroundItem(itemId: string): void {
    this.send({ type: 'PICKUP_GROUND_ITEM', itemId });
  }

  /**
   * Register message handler
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    if (DEBUG_LOGGING) console.log('[WS] Message handler added, total handlers:', this.messageHandlers.size);
    return () => {
      this.messageHandlers.delete(handler);
      if (DEBUG_LOGGING) console.log('[WS] Message handler removed, total handlers:', this.messageHandlers.size);
    };
  }

  /**
   * Register connect handler
   */
  onConnect(handler: ConnectionHandler): () => void {
    this.connectHandlers.add(handler);
    return () => this.connectHandlers.delete(handler);
  }

  /**
   * Register disconnect handler
   */
  onDisconnect(handler: ConnectionHandler): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  /**
   * Get current player from state
   */
  getCurrentPlayer(): Player | null {
    if (!this.currentState || !this.playerId) return null;
    return this.currentState.players.find(p => p.id === this.playerId) ?? null;
  }

  // NOTE: getInviteLink removed - game is now single-player only

  /**
   * Save current character to a slot
   */
  saveCharacter(slot?: number): boolean {
    const player = this.getCurrentPlayer();
    if (!player || !this.currentState) return false;

    // Use provided slot, or current save slot (if loaded from save), or find empty/oldest slot
    const targetSlot = slot ?? this.currentSaveSlot ?? this.findEmptySlot() ?? this.findOldestSlot();

    // Get existing lives count or default to 5
    const existingLives = this.currentLives ?? 5;

    // Ensure player name is not empty
    const playerName = player.name || 'Hero';
    if (!player.name) {
      console.warn('[SAVE] Warning: Player name was empty, using fallback "Hero"');
    }

    const saveData: SaveData = {
      version: SAVE_VERSION,
      timestamp: Date.now(),
      playerName: playerName,
      classId: player.classId,
      level: player.level,
      xp: player.xp,
      xpToNextLevel: player.xpToNextLevel,
      gold: player.gold,
      rerollTokens: player.rerollTokens,
      baseStats: { ...player.baseStats },
      equipment: player.equipment,
      abilities: player.abilities.map(a => ({ ...a })),
      backpack: [...player.backpack],
      highestFloor: this.currentState.floor,
      lives: existingLives
    };

    try {
      localStorage.setItem(`${SAVE_KEY_PREFIX}${targetSlot}`, JSON.stringify(saveData));
      this.updateSaveIndex(targetSlot);
      // Remember this slot for future saves
      this.currentSaveSlot = targetSlot;
      console.log(`[SAVE] Character saved to slot ${targetSlot}: ${player.name} (Level ${player.level}, Floor ${this.currentState.floor})`);
      return true;
    } catch (e) {
      console.error('Failed to save character:', e);
      return false;
    }
  }

  /**
   * Find first empty save slot
   */
  private findEmptySlot(): number | null {
    for (let i = 0; i < MAX_SAVE_SLOTS; i++) {
      if (!localStorage.getItem(`${SAVE_KEY_PREFIX}${i}`)) {
        return i;
      }
    }
    return null;
  }

  /**
   * Find oldest save slot to overwrite
   */
  private findOldestSlot(): number {
    let oldestSlot = 0;
    let oldestTime = Infinity;

    for (let i = 0; i < MAX_SAVE_SLOTS; i++) {
      const data = localStorage.getItem(`${SAVE_KEY_PREFIX}${i}`);
      if (data) {
        try {
          const save = JSON.parse(data) as SaveData;
          if (save.timestamp < oldestTime) {
            oldestTime = save.timestamp;
            oldestSlot = i;
          }
        } catch {
          return i; // Corrupted slot, use it
        }
      }
    }
    return oldestSlot;
  }

  /**
   * Update save index
   */
  private updateSaveIndex(slot: number): void {
    try {
      const indexData = localStorage.getItem(SAVE_INDEX_KEY);
      const index: number[] = indexData ? JSON.parse(indexData) : [];
      if (!index.includes(slot)) {
        index.push(slot);
      }
      localStorage.setItem(SAVE_INDEX_KEY, JSON.stringify(index));
    } catch {
      localStorage.setItem(SAVE_INDEX_KEY, JSON.stringify([slot]));
    }
  }

  /**
   * Get all saved characters
   */
  getAllSavedCharacters(): { slot: number; data: SaveData }[] {
    const saves: { slot: number; data: SaveData }[] = [];

    for (let i = 0; i < MAX_SAVE_SLOTS; i++) {
      const data = localStorage.getItem(`${SAVE_KEY_PREFIX}${i}`);
      if (data) {
        try {
          const saveData = JSON.parse(data) as SaveData;
          if (saveData.version === SAVE_VERSION) {
            saves.push({ slot: i, data: saveData });
          }
        } catch {
          // Skip corrupted saves
        }
      }
    }

    // Sort by timestamp (newest first)
    saves.sort((a, b) => b.data.timestamp - a.data.timestamp);
    return saves;
  }

  /**
   * Load saved character data from a specific slot
   */
  loadCharacter(slot: number): SaveData | null {
    try {
      const data = localStorage.getItem(`${SAVE_KEY_PREFIX}${slot}`);
      if (!data) return null;

      const saveData = JSON.parse(data) as SaveData;

      if (saveData.version !== SAVE_VERSION) {
        console.warn('Save data version mismatch');
        return null;
      }

      return saveData;
    } catch (e) {
      console.error('Failed to load character:', e);
      return null;
    }
  }

  /**
   * Check if any saved characters exist
   */
  hasSavedCharacters(): boolean {
    return this.getAllSavedCharacters().length > 0;
  }

  /**
   * Delete saved character from a slot
   */
  deleteSavedCharacter(slot: number): void {
    localStorage.removeItem(`${SAVE_KEY_PREFIX}${slot}`);
  }

  /**
   * Create a run from saved character
   */
  createRunFromSave(saveData: SaveData, slot: number): void {
    // Store the save slot and lives for tracking
    this.currentSaveSlot = slot;
    this.currentLives = saveData.lives ?? 5; // Default to 5 for old saves
    this.send({ type: 'CREATE_RUN_FROM_SAVE', saveData });
  }

  /**
   * Handle player death - decrement lives and update save
   * Returns true if character is deleted (out of lives)
   */
  handlePlayerDeath(): boolean {
    this.currentLives = Math.max(0, this.currentLives - 1);
    console.log(`[LIVES] Player died. Lives remaining: ${this.currentLives}`);

    if (this.currentLives <= 0) {
      // Delete the character
      if (this.currentSaveSlot !== null) {
        console.log(`[LIVES] Character out of lives! Deleting from slot ${this.currentSaveSlot}`);
        this.deleteSavedCharacter(this.currentSaveSlot);
        this.currentSaveSlot = null;
      }
      return true; // Character deleted
    }

    // Auto-save with updated lives
    if (this.currentSaveSlot !== null) {
      this.saveCharacter(this.currentSaveSlot);
    }

    return false; // Character still has lives
  }

  /**
   * Get current lives count
   */
  getLives(): number {
    return this.currentLives;
  }

  /**
   * Clear all message handlers
   * IMPORTANT: Call this before destroying the Phaser game to prevent handler accumulation
   */
  clearAllHandlers(): void {
    console.log('[WS] Clearing all handlers. Count was:', this.messageHandlers.size);
    this.messageHandlers.clear();
    this.connectHandlers.clear();
    this.disconnectHandlers.clear();
  }
}

// Singleton instance
export const wsClient = new WebSocketClient();
